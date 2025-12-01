//! JavaScript runtime using QuickJS with reactive event system

use anyhow::Result;
use rquickjs::{Context, Runtime, Value, Persistent};
use std::sync::{Arc, RwLock};
use crate::elements::{Element, DivElement, TextElement, EventHandlers};
use crate::tw_parser;
use crate::module_loader::ModuleLoader;
use crate::event_manager::{EventManager, next_handler_id};

/// Shared state between JS runtime and GPUI
pub struct JsRuntime {
    runtime: Runtime,
    context: Context,
    event_manager: EventManager,
    /// Flag indicating JS context has been initialized
    initialized: Arc<RwLock<bool>>,
}

impl JsRuntime {
    pub fn new() -> Self {
        let runtime = Runtime::new().expect("Failed to create JS runtime");
        let context = Context::full(&runtime).expect("Failed to create JS context");
        
        Self { 
            runtime, 
            context,
            event_manager: EventManager::new(),
            initialized: Arc::new(RwLock::new(false)),
        }
    }
    
    /// Get the event manager for binding to GPUI events
    pub fn event_manager(&self) -> EventManager {
        self.event_manager.clone()
    }
    
    /// Get direct access to the context for invoking handlers
    pub fn with_context<F, R>(&self, f: F) -> R 
    where F: FnOnce(&Context) -> R 
    {
        f(&self.context)
    }
    
    /// Re-render: re-run the App function to get updated UI tree
    /// This preserves JS state (refs, etc.) while getting new element descriptions
    pub fn re_render(&self) -> Result<Element> {
        let event_manager = self.event_manager.clone();
        self.context.with(|ctx| {
            // Call __rerender() which re-executes the App and returns new element tree
            let result: Value = ctx.eval("__rerender()")?;
            js_to_element(&ctx, &result, &event_manager)
        })
    }
    
    /// Execute script with modules loaded from config (first run only)
    pub fn execute_with_modules(&self, script: &str, loader: &ModuleLoader) -> Result<Element> {
        let mut initialized = self.initialized.write().unwrap();
        if *initialized {
            // Already initialized, just re-render
            drop(initialized);
            return self.re_render();
        }
        *initialized = true;
        drop(initialized);
        
        self.execute_with_modules_internal(script, loader)
    }
    
    fn execute_with_modules_internal(&self, script: &str, loader: &ModuleLoader) -> Result<Element> {
        let event_manager = self.event_manager.clone();
        self.context.with(|ctx| {
            // Inject base runtime with handler registry
            let base_shim = r#"
                var __rootElement = null;
                var __elements = [];
                var __handlers = {};
                var __handlerIdCounter = 1;
                var __modules = {};
                
                function __registerHandler(fn) {
                    if (typeof fn !== 'function') return null;
                    var id = __handlerIdCounter++;
                    __handlers[id] = fn;
                    return id;
                }
                
                function __invokeHandler(id) {
                    var fn = __handlers[id];
                    if (fn) fn();
                }
                
                function require(name) {
                    if (__modules[name]) return __modules[name];
                    throw new Error('Module not found: ' + name);
                }
            "#;
            if let Err(e) = ctx.eval::<(), _>(base_shim) {
                anyhow::bail!("Failed to eval base_shim: {:?}", e);
            }
            
            // Execute the bundled runtime (all modules combined)
            let has_bundled_runtime = if let Some(runtime) = loader.get_bundled_runtime() {
                if let Err(e) = ctx.eval::<(), _>(runtime) {
                    let exc = ctx.catch();
                    if !exc.is_undefined() && !exc.is_null() {
                        anyhow::bail!("Failed to eval bundled runtime: {:?}", exc);
                    }
                    anyhow::bail!("Failed to eval bundled runtime: {:?}", e);
                }
                true
            } else {
                false
            };
            
            // Check if @rasenjs/gpui was loaded
            let has_gpui: bool = ctx.eval("typeof __modules['@rasenjs/gpui'] !== 'undefined'")?;
            
            // If no @rasenjs/gpui loaded, use built-in fallback
            if !has_bundled_runtime || !has_gpui {
                eprintln!("Warning: @rasenjs/gpui not found in bundled modules, using built-in fallback");
                let gpui_shim = generate_builtin_gpui_module();
                if let Err(e) = ctx.eval::<(), _>(gpui_shim.as_str()) {
                    let exc = ctx.catch();
                    if !exc.is_undefined() && !exc.is_null() {
                        anyhow::bail!("Failed to eval gpui_shim: {:?}", exc);
                    }
                    anyhow::bail!("Failed to eval gpui_shim: {:?}", e);
                }
            }
            
            // Transform and execute
            let transformed = transform_imports(script);
            if let Err(e) = ctx.eval::<(), _>(transformed.as_str()) {
                let exc = ctx.catch();
                if !exc.is_undefined() && !exc.is_null() {
                    anyhow::bail!("Failed to eval user script: {:?}", exc);
                }
                anyhow::bail!("Failed to eval user script: {:?}", e);
            }
            
            // Get root element and register handlers
            let root: Value = ctx.eval("__rootElement")?;
            let element = js_to_element(&ctx, &root, &event_manager)?;
            
            Ok(element)
        })
    }
}

/// Generate GPUI module following Rasen three-phase pattern
fn generate_builtin_gpui_module() -> String {
    // Wrap in IIFE to avoid polluting global scope
    r#"
(function() {
        // ========== Reactivity ==========
        var __currentEffect = null;
        
        function RefImpl(value) {
            this._value = value;
            this._subscribers = [];
        }
        RefImpl.prototype = {
            get value() {
                if (__currentEffect) {
                    if (this._subscribers.indexOf(__currentEffect) === -1) {
                        this._subscribers.push(__currentEffect);
                    }
                }
                return this._value;
            },
            set value(newValue) {
                if (this._value !== newValue) {
                    this._value = newValue;
                    for (var i = 0; i < this._subscribers.length; i++) {
                        this._subscribers[i]();
                    }
                }
            }
        };
        
        function ref(v) { return new RefImpl(v); }
        
        function unrefValue(v) {
            if (v && typeof v === 'object' && 'value' in v) {
                return v.value;
            }
            return v;
        }
        
        function isRef(v) { return v instanceof RefImpl; }
        
        __modules['@rasenjs/reactive-signals'] = {
            ref: ref,
            computed: function(fn) { return new RefImpl(fn()); },
            watch: function(src, cb) { 
                var old; 
                var runFn = function() { var n = src(); cb(n, old); old = n; }; 
                runFn(); 
                return function() {}; 
            },
            unref: unrefValue,
            isRef: isRef
        };
        
        // ========== GpuiHost ==========
        function createHost() {
            var elements = [];
            var handlers = {};
            return {
                appendChild: function(desc) { elements.push(desc); },
                requestRender: function() { },
                on: function(event, handler) { 
                    handlers[event] = handler; 
                    return function() { delete handlers[event]; };
                },
                getElements: function() { return elements; },
                getHandlers: function() { return handlers; }
            };
        }
        
        // ========== Components (Three-Phase) ==========
        function div(props) {
            props = props || {};
            
            return function mount(host) {
                var childUnmounts = [];
                
                var desc = {
                    type: 'div',
                    class: unrefValue(props.class) || '',
                    children: [],
                    handlers: {}
                };
                
                if (props.onClick) desc.handlers.click = props.onClick;
                if (props.onMouseEnter) desc.handlers.mouseenter = props.onMouseEnter;
                if (props.onMouseLeave) desc.handlers.mouseleave = props.onMouseLeave;
                
                var children = props.children || [];
                for (var i = 0; i < children.length; i++) {
                    var childMount = children[i];
                    if (typeof childMount === 'function') {
                        var childHost = createHost();
                        var unmount = childMount(childHost);
                        childUnmounts.push(unmount);
                        var childElements = childHost.getElements();
                        for (var j = 0; j < childElements.length; j++) {
                            desc.children.push(childElements[j]);
                        }
                    }
                }
                
                host.appendChild(desc);
                
                return function unmount() {
                    for (var k = 0; k < childUnmounts.length; k++) {
                        if (childUnmounts[k]) childUnmounts[k]();
                    }
                };
            };
        }
        
        function text(props) {
            props = props || {};
            return function mount(host) {
                var t = unrefValue(props.text);
                var desc = {
                    type: 'text',
                    class: unrefValue(props.class) || '',
                    text: t != null ? String(t) : ''
                };
                host.appendChild(desc);
                return function unmount() {};
            };
        }
        
        function button(props) {
            props = props || {};
            var newProps = {};
            for (var k in props) {
                newProps[k] = props[k];
            }
            newProps.class = 'cursor-pointer ' + (unrefValue(props.class) || '');
            return div(newProps);
        }
        
        // ========== App Runner with Proper Three-Phase Pattern ==========
        // 
        // Rasen three-phase pattern:
        //   const App = () => {           // Setup Phase (runs ONCE)
        //     const count = ref(0)        // <- refs created here
        //     return div({...})           // <- returns mount function
        //   }
        //
        // The mount function can run multiple times.
        // The setup phase (App body) runs only once.
        // This preserves refs between re-renders.
        
        var __mountFn = null;   // The mount function from App's setup phase
        var __unmountFn = null; // The current unmount function
        
        function run(App) {
            // Execute App's setup phase ONCE - this creates refs
            __mountFn = App();
            // Initial render
            __rerender();
        }
        
        // Re-render function: re-executes ONLY the mount function
        // This preserves refs because they live in the App closure
        function __rerender() {
            if (!__mountFn) return null;
            
            // Call previous unmount if exists
            if (__unmountFn) {
                __unmountFn();
            }
            
            // Create fresh host and mount
            var rootHost = createHost();
            __unmountFn = __mountFn(rootHost);
            
            var elements = rootHost.getElements();
            __rootElement = elements[0] || null;
            return __rootElement;
        }
        
        // Make __rerender globally accessible
        globalThis.__rerender = __rerender;
        
        // ========== Export ==========
        __modules['@rasenjs/gpui'] = {
            ref: ref,
            computed: __modules['@rasenjs/reactive-signals'].computed,
            watch: __modules['@rasenjs/reactive-signals'].watch,
            unref: unrefValue,
            isRef: isRef,
            div: div,
            text: text,
            button: button,
            run: run
        };
})();
    "#.to_string()
}

fn wrap_module(name: &str, source: &str) -> String {
    format!(r#"
(function() {{
    const exports = {{}};
    const module = {{ exports }};
    {source}
    __modules['{name}'] = module.exports || exports;
}})();
"#, name = name, source = source)
}

fn transform_imports(script: &str) -> String {
    let mut result = String::new();
    
    for line in script.lines() {
        let trimmed = line.trim();
        
        if trimmed.starts_with("import ") {
            if let Some(from_idx) = trimmed.find(" from ") {
                let import_part = &trimmed[7..from_idx];
                let module_part = &trimmed[from_idx + 6..];
                let module_name = module_part.trim().trim_matches(|c| c == '\'' || c == '"' || c == ';');
                
                if let Some(start) = import_part.find('{') {
                    if let Some(end) = import_part.find('}') {
                        let names = &import_part[start + 1..end];
                        result.push_str(&format!("const {{{names}}} = __modules['{module_name}'];\n"));
                        continue;
                    }
                }
                
                let default_name = import_part.trim();
                if !default_name.is_empty() && !default_name.contains('{') {
                    result.push_str(&format!("const {default_name} = __modules['{module_name}'].default || __modules['{module_name}'];\n"));
                    continue;
                }
            }
        }
        
        result.push_str(line);
        result.push('\n');
    }
    
    result
}

fn js_to_element<'js>(ctx: &rquickjs::Ctx<'js>, value: &Value<'js>, event_manager: &EventManager) -> Result<Element> {
    static ELEMENT_COUNTER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1);
    
    if value.is_null() || value.is_undefined() {
        anyhow::bail!("Root element is null or undefined");
    }
    
    let obj = value.as_object().ok_or_else(|| anyhow::anyhow!("Expected object"))?;
    
    let element_type: String = obj.get("type")?;
    let class_str: String = obj.get("class").unwrap_or_default();
    let styles = tw_parser::parse(&class_str);
    
    match element_type.as_str() {
        "div" => {
            // Generate unique element ID
            let element_id = format!("elem_{}", ELEMENT_COUNTER.fetch_add(1, std::sync::atomic::Ordering::SeqCst));
            
            // Extract handlers
            let mut handlers = EventHandlers::default();
            
            // Get handlers object from JS
            let handlers_val: Value = obj.get("handlers")?;
            if !handlers_val.is_null() && !handlers_val.is_undefined() {
                if let Some(handlers_obj) = handlers_val.as_object() {
                    // Click handler
                    let click_val: Value = handlers_obj.get("click")?;
                    if click_val.is_function() {
                        let handler_id = next_handler_id();
                        // Store the function as a persistent reference
                        if let Some(func) = click_val.as_function() {
                            let persistent = Persistent::save(ctx, func.clone());
                            event_manager.register_handler(handler_id, persistent);
                            handlers.on_click = Some(handler_id);
                        }
                    }
                    
                    // Mouse enter handler
                    let enter_val: Value = handlers_obj.get("mouseenter")?;
                    if enter_val.is_function() {
                        let handler_id = next_handler_id();
                        if let Some(func) = enter_val.as_function() {
                            let persistent = Persistent::save(ctx, func.clone());
                            event_manager.register_handler(handler_id, persistent);
                            handlers.on_mouse_enter = Some(handler_id);
                        }
                    }
                    
                    // Mouse leave handler  
                    let leave_val: Value = handlers_obj.get("mouseleave")?;
                    if leave_val.is_function() {
                        let handler_id = next_handler_id();
                        if let Some(func) = leave_val.as_function() {
                            let persistent = Persistent::save(ctx, func.clone());
                            event_manager.register_handler(handler_id, persistent);
                            handlers.on_mouse_leave = Some(handler_id);
                        }
                    }
                }
            }
            
            // Process children
            let children_val: Value = obj.get("children")?;
            let children = if children_val.is_array() {
                let arr = children_val.as_array().unwrap();
                let mut result = Vec::new();
                for i in 0..arr.len() {
                    let child: Value = arr.get(i)?;
                    result.push(js_to_element(ctx, &child, event_manager)?);
                }
                result
            } else {
                Vec::new()
            };
            
            Ok(Element::Div(DivElement { 
                id: element_id,
                styles, 
                children,
                handlers,
            }))
        }
        "text" => {
            let text: String = obj.get("text").unwrap_or_default();
            Ok(Element::Text(TextElement { text, styles }))
        }
        _ => anyhow::bail!("Unknown element type: {}", element_type),
    }
}
