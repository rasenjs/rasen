/**
 * @file qjs_rasen.c
 * @brief Rasen LVGL binding for QuickJS
 * 
 * Implements the JavaScript API for LVGL components.
 */

#include "qjs_rasen.h"
#include <string.h>
#include <stdio.h>
#include <stdlib.h>

// ============ Event Handler Storage ============

#define MAX_HANDLERS 256

typedef struct {
    uint32_t id;
    JSValue func;
    lv_obj_t *obj;
} handler_entry_t;

static handler_entry_t handlers[MAX_HANDLERS];
static uint32_t handler_count = 0;
static uint32_t next_handler_id = 1;
static JSContext *global_ctx = NULL;
static bool needs_rerender = false;

static uint32_t register_handler(JSContext *ctx, JSValue func, lv_obj_t *obj) {
    if (handler_count >= MAX_HANDLERS) {
        printf("Error: Too many handlers\n");
        return 0;
    }
    
    uint32_t id = next_handler_id++;
    handlers[handler_count].id = id;
    handlers[handler_count].func = JS_DupValue(ctx, func);
    handlers[handler_count].obj = obj;
    handler_count++;
    
    return id;
}

static void invoke_handler(uint32_t id) {
    for (uint32_t i = 0; i < handler_count; i++) {
        if (handlers[i].id == id) {
            JSValue ret = JS_Call(global_ctx, handlers[i].func, JS_UNDEFINED, 0, NULL);
            if (JS_IsException(ret)) {
                JSValue exc = JS_GetException(global_ctx);
                const char *str = JS_ToCString(global_ctx, exc);
                printf("JS Error: %s\n", str);
                JS_FreeCString(global_ctx, str);
                JS_FreeValue(global_ctx, exc);
            }
            JS_FreeValue(global_ctx, ret);
            needs_rerender = true;
            return;
        }
    }
}

// LVGL event callback
static void lvgl_event_cb(lv_event_t *e) {
    uint32_t handler_id = (uint32_t)(uintptr_t)lv_event_get_user_data(e);
    invoke_handler(handler_id);
}

// ============ Element Creation ============

typedef struct {
    lv_obj_t *obj;
    char *type;
} element_t;

static lv_obj_t *create_element_from_desc(JSContext *ctx, JSValue desc, lv_obj_t *parent);

static lv_obj_t *create_obj(JSContext *ctx, JSValue desc, lv_obj_t *parent) {
    lv_obj_t *obj = lv_obj_create(parent);
    
    // Get class string and apply styles
    JSValue class_val = JS_GetPropertyStr(ctx, desc, "class");
    if (!JS_IsUndefined(class_val)) {
        const char *class_str = JS_ToCString(ctx, class_val);
        if (class_str) {
            tw_styles_t styles;
            tw_parse(class_str, &styles);
            tw_apply(obj, &styles);
            JS_FreeCString(ctx, class_str);
        }
    }
    JS_FreeValue(ctx, class_val);
    
    // Handle click event
    JSValue handlers_val = JS_GetPropertyStr(ctx, desc, "handlers");
    if (!JS_IsUndefined(handlers_val) && !JS_IsNull(handlers_val)) {
        JSValue click_val = JS_GetPropertyStr(ctx, handlers_val, "click");
        if (JS_IsFunction(ctx, click_val)) {
            uint32_t id = register_handler(ctx, click_val, obj);
            lv_obj_add_event_cb(obj, lvgl_event_cb, LV_EVENT_CLICKED, (void *)(uintptr_t)id);
        }
        JS_FreeValue(ctx, click_val);
        
        JSValue longpress_val = JS_GetPropertyStr(ctx, handlers_val, "long_press");
        if (JS_IsFunction(ctx, longpress_val)) {
            uint32_t id = register_handler(ctx, longpress_val, obj);
            lv_obj_add_event_cb(obj, lvgl_event_cb, LV_EVENT_LONG_PRESSED, (void *)(uintptr_t)id);
        }
        JS_FreeValue(ctx, longpress_val);
    }
    JS_FreeValue(ctx, handlers_val);
    
    // Process children
    JSValue children_val = JS_GetPropertyStr(ctx, desc, "children");
    if (JS_IsArray(children_val)) {
        JSValue len_val = JS_GetPropertyStr(ctx, children_val, "length");
        int32_t len;
        JS_ToInt32(ctx, &len, len_val);
        JS_FreeValue(ctx, len_val);
        
        for (int32_t i = 0; i < len; i++) {
            JSValue child = JS_GetPropertyUint32(ctx, children_val, i);
            create_element_from_desc(ctx, child, obj);
            JS_FreeValue(ctx, child);
        }
    }
    JS_FreeValue(ctx, children_val);
    
    return obj;
}

static lv_obj_t *create_label(JSContext *ctx, JSValue desc, lv_obj_t *parent) {
    lv_obj_t *label = lv_label_create(parent);
    
    // Get text
    JSValue text_val = JS_GetPropertyStr(ctx, desc, "text");
    if (!JS_IsUndefined(text_val)) {
        const char *text = JS_ToCString(ctx, text_val);
        if (text) {
            lv_label_set_text(label, text);
            JS_FreeCString(ctx, text);
        }
    }
    JS_FreeValue(ctx, text_val);
    
    // Get class string and apply styles
    JSValue class_val = JS_GetPropertyStr(ctx, desc, "class");
    if (!JS_IsUndefined(class_val)) {
        const char *class_str = JS_ToCString(ctx, class_val);
        if (class_str) {
            tw_styles_t styles;
            tw_parse(class_str, &styles);
            tw_apply(label, &styles);
            JS_FreeCString(ctx, class_str);
        }
    }
    JS_FreeValue(ctx, class_val);
    
    return label;
}

static lv_obj_t *create_btn(JSContext *ctx, JSValue desc, lv_obj_t *parent) {
    lv_obj_t *btn = lv_btn_create(parent);
    
    // Get class string and apply styles
    JSValue class_val = JS_GetPropertyStr(ctx, desc, "class");
    if (!JS_IsUndefined(class_val)) {
        const char *class_str = JS_ToCString(ctx, class_val);
        if (class_str) {
            tw_styles_t styles;
            tw_parse(class_str, &styles);
            tw_apply(btn, &styles);
            JS_FreeCString(ctx, class_str);
        }
    }
    JS_FreeValue(ctx, class_val);
    
    // Handle click event
    JSValue handlers_val = JS_GetPropertyStr(ctx, desc, "handlers");
    if (!JS_IsUndefined(handlers_val) && !JS_IsNull(handlers_val)) {
        JSValue click_val = JS_GetPropertyStr(ctx, handlers_val, "click");
        if (JS_IsFunction(ctx, click_val)) {
            uint32_t id = register_handler(ctx, click_val, btn);
            lv_obj_add_event_cb(btn, lvgl_event_cb, LV_EVENT_CLICKED, (void *)(uintptr_t)id);
        }
        JS_FreeValue(ctx, click_val);
    }
    JS_FreeValue(ctx, handlers_val);
    
    // Process children (button label)
    JSValue children_val = JS_GetPropertyStr(ctx, desc, "children");
    if (JS_IsArray(children_val)) {
        JSValue len_val = JS_GetPropertyStr(ctx, children_val, "length");
        int32_t len;
        JS_ToInt32(ctx, &len, len_val);
        JS_FreeValue(ctx, len_val);
        
        for (int32_t i = 0; i < len; i++) {
            JSValue child = JS_GetPropertyUint32(ctx, children_val, i);
            create_element_from_desc(ctx, child, btn);
            JS_FreeValue(ctx, child);
        }
    }
    JS_FreeValue(ctx, children_val);
    
    return btn;
}

static lv_obj_t *create_bar(JSContext *ctx, JSValue desc, lv_obj_t *parent) {
    lv_obj_t *bar = lv_bar_create(parent);
    
    // Get value, min, max
    JSValue val = JS_GetPropertyStr(ctx, desc, "value");
    JSValue min_val = JS_GetPropertyStr(ctx, desc, "min");
    JSValue max_val = JS_GetPropertyStr(ctx, desc, "max");
    
    int32_t min = 0, max = 100, value = 0;
    if (!JS_IsUndefined(min_val)) JS_ToInt32(ctx, &min, min_val);
    if (!JS_IsUndefined(max_val)) JS_ToInt32(ctx, &max, max_val);
    if (!JS_IsUndefined(val)) JS_ToInt32(ctx, &value, val);
    
    lv_bar_set_range(bar, min, max);
    lv_bar_set_value(bar, value, LV_ANIM_OFF);
    
    JS_FreeValue(ctx, val);
    JS_FreeValue(ctx, min_val);
    JS_FreeValue(ctx, max_val);
    
    // Apply styles
    JSValue class_val = JS_GetPropertyStr(ctx, desc, "class");
    if (!JS_IsUndefined(class_val)) {
        const char *class_str = JS_ToCString(ctx, class_val);
        if (class_str) {
            tw_styles_t styles;
            tw_parse(class_str, &styles);
            tw_apply(bar, &styles);
            JS_FreeCString(ctx, class_str);
        }
    }
    JS_FreeValue(ctx, class_val);
    
    return bar;
}

static lv_obj_t *create_element_from_desc(JSContext *ctx, JSValue desc, lv_obj_t *parent) {
    JSValue type_val = JS_GetPropertyStr(ctx, desc, "type");
    const char *type = JS_ToCString(ctx, type_val);
    
    lv_obj_t *obj = NULL;
    
    if (!type) {
        // Skip
    }
    else if (strcmp(type, "obj") == 0) {
        obj = create_obj(ctx, desc, parent);
    }
    else if (strcmp(type, "label") == 0) {
        obj = create_label(ctx, desc, parent);
    }
    else if (strcmp(type, "btn") == 0) {
        obj = create_btn(ctx, desc, parent);
    }
    else if (strcmp(type, "bar") == 0) {
        obj = create_bar(ctx, desc, parent);
    }
    else {
        printf("Unknown element type: %s\n", type);
    }
    
    if (type) JS_FreeCString(ctx, type);
    JS_FreeValue(ctx, type_val);
    
    return obj;
}

// ============ JavaScript Runtime Code ============

static const char *rasen_runtime_js = 
"var __rootElement = null;\n"
"var __modules = {};\n"
"var __handlerIdCounter = 1;\n"
"\n"
"// Reactivity\n"
"function RefImpl(value) {\n"
"    this._value = value;\n"
"    this._subscribers = [];\n"
"}\n"
"RefImpl.prototype = {\n"
"    get value() { return this._value; },\n"
"    set value(v) {\n"
"        if (this._value !== v) {\n"
"            this._value = v;\n"
"            for (var i = 0; i < this._subscribers.length; i++) {\n"
"                this._subscribers[i]();\n"
"            }\n"
"        }\n"
"    }\n"
"};\n"
"\n"
"function ref(v) { return new RefImpl(v); }\n"
"function unref(v) { return (v && typeof v === 'object' && 'value' in v) ? v.value : v; }\n"
"\n"
"__modules['@rasenjs/reactive-signals'] = { ref: ref, unref: unref };\n"
"\n"
"// Host helper\n"
"function createHost() {\n"
"    var elements = [];\n"
"    return {\n"
"        appendChild: function(d) { elements.push(d); },\n"
"        requestRender: function() {},\n"
"        on: function() { return function() {}; },\n"
"        getElements: function() { return elements; }\n"
"    };\n"
"}\n"
"\n"
"// Components\n"
"function div(props) {\n"
"    props = props || {};\n"
"    return function(host) {\n"
"        var desc = { type: 'obj', class: unref(props.class) || '', children: [], handlers: {} };\n"
"        if (props.onClick) desc.handlers.click = props.onClick;\n"
"        if (props.onLongPress) desc.handlers.long_press = props.onLongPress;\n"
"        var children = props.children || [];\n"
"        for (var i = 0; i < children.length; i++) {\n"
"            if (typeof children[i] === 'function') {\n"
"                var ch = createHost();\n"
"                children[i](ch);\n"
"                var els = ch.getElements();\n"
"                for (var j = 0; j < els.length; j++) desc.children.push(els[j]);\n"
"            }\n"
"        }\n"
"        host.appendChild(desc);\n"
"        return function() {};\n"
"    };\n"
"}\n"
"\n"
"function label(props) {\n"
"    props = props || {};\n"
"    return function(host) {\n"
"        var t = props.children;\n"
"        if (typeof t === 'function') t = t();\n"
"        t = unref(t);\n"
"        var desc = { type: 'label', class: unref(props.class) || '', text: t != null ? String(t) : '' };\n"
"        host.appendChild(desc);\n"
"        return function() {};\n"
"    };\n"
"}\n"
"\n"
"function text(props) { return label(props); }\n"
"\n"
"function button(props) {\n"
"    props = props || {};\n"
"    return function(host) {\n"
"        var desc = { type: 'btn', class: unref(props.class) || '', children: [], handlers: {} };\n"
"        if (props.onClick) desc.handlers.click = props.onClick;\n"
"        var children = props.children || [];\n"
"        for (var i = 0; i < children.length; i++) {\n"
"            if (typeof children[i] === 'function') {\n"
"                var ch = createHost();\n"
"                children[i](ch);\n"
"                var els = ch.getElements();\n"
"                for (var j = 0; j < els.length; j++) desc.children.push(els[j]);\n"
"            }\n"
"        }\n"
"        host.appendChild(desc);\n"
"        return function() {};\n"
"    };\n"
"}\n"
"\n"
"function bar(props) {\n"
"    props = props || {};\n"
"    return function(host) {\n"
"        var desc = {\n"
"            type: 'bar',\n"
"            class: unref(props.class) || '',\n"
"            value: unref(props.value) || 0,\n"
"            min: props.min != null ? props.min : 0,\n"
"            max: props.max != null ? props.max : 100\n"
"        };\n"
"        host.appendChild(desc);\n"
"        return function() {};\n"
"    };\n"
"}\n"
"\n"
"var __mountFn = null;\n"
"var __unmountFn = null;\n"
"\n"
"function run(App) {\n"
"    __mountFn = App();\n"
"    __rerender();\n"
"}\n"
"\n"
"function __rerender() {\n"
"    if (!__mountFn) return null;\n"
"    if (__unmountFn) __unmountFn();\n"
"    var rootHost = createHost();\n"
"    __unmountFn = __mountFn(rootHost);\n"
"    var elements = rootHost.getElements();\n"
"    __rootElement = elements[0] || null;\n"
"    return __rootElement;\n"
"}\n"
"\n"
"__modules['@rasenjs/lvgl'] = {\n"
"    ref: ref, unref: unref,\n"
"    div: div, label: label, text: text, button: button, bar: bar,\n"
"    run: run\n"
"};\n";

// ============ Public API ============

int qjs_rasen_init(JSContext *ctx) {
    global_ctx = ctx;
    handler_count = 0;
    next_handler_id = 1;
    needs_rerender = false;
    
    // Evaluate the runtime JavaScript
    JSValue ret = JS_Eval(ctx, rasen_runtime_js, strlen(rasen_runtime_js), "<rasen>", JS_EVAL_TYPE_GLOBAL);
    if (JS_IsException(ret)) {
        JSValue exc = JS_GetException(ctx);
        const char *str = JS_ToCString(ctx, exc);
        printf("Rasen init error: %s\n", str);
        JS_FreeCString(ctx, str);
        JS_FreeValue(ctx, exc);
        JS_FreeValue(ctx, ret);
        return -1;
    }
    JS_FreeValue(ctx, ret);
    
    return 0;
}

void qjs_rasen_cleanup(JSContext *ctx) {
    // Free all handler references
    for (uint32_t i = 0; i < handler_count; i++) {
        JS_FreeValue(ctx, handlers[i].func);
    }
    handler_count = 0;
    global_ctx = NULL;
}

// Transform ESM imports to module lookups
static char *transform_imports(const char *script) {
    // Simple transform: import { x } from 'mod' -> const { x } = __modules['mod']
    // This is a basic implementation - production would need proper parsing
    
    size_t len = strlen(script);
    
    char *result = malloc(len * 2 + 1024); // Extra space for transforms
    if (!result) {
        return NULL;
    }
    
    char *out = result;
    const char *p = script;
    
    while (*p) {
        // Look for "import "
        if (strncmp(p, "import ", 7) == 0) {
            p += 7;
            
            // Find "from"
            const char *from = strstr(p, " from ");
            if (from) {
                // Extract import part
                size_t import_len = from - p;
                
                // Find module name
                const char *quote1 = strchr(from + 6, '\'');
                const char *quote2 = strchr(from + 6, '"');
                const char *quote = quote1 ? (quote2 && quote2 < quote1 ? quote2 : quote1) : quote2;
                
                if (quote) {
                    char delim = *quote;
                    const char *end_quote = strchr(quote + 1, delim);
                    if (end_quote) {
                        // Write: const { ... } = __modules['...']
                        out += sprintf(out, "const ");
                        strncpy(out, p, import_len);
                        out += import_len;
                        out += sprintf(out, " = __modules['");
                        strncpy(out, quote + 1, end_quote - quote - 1);
                        out += end_quote - quote - 1;
                        out += sprintf(out, "']");
                        
                        // Skip to end of line
                        p = end_quote + 1;
                        while (*p && *p != '\n') p++;
                        continue;
                    }
                }
            }
        }
        
        *out++ = *p++;
    }
    *out = '\0';
    
    return result;
}

int qjs_rasen_render(JSContext *ctx, const char *script, lv_obj_t *parent) {
    // Transform imports
    char *transformed = transform_imports(script);
    if (!transformed) {
        printf("Failed to transform script\n");
        return -1;
    }
    
    // Execute user script
    JSValue ret = JS_Eval(ctx, transformed, strlen(transformed), "<user>", JS_EVAL_TYPE_GLOBAL);
    free(transformed);
    
    if (JS_IsException(ret)) {
        JSValue exc = JS_GetException(ctx);
        const char *str = JS_ToCString(ctx, exc);
        printf("Script error: %s\n", str);
        JS_FreeCString(ctx, str);
        JS_FreeValue(ctx, exc);
        JS_FreeValue(ctx, ret);
        return -1;
    }
    JS_FreeValue(ctx, ret);
    
    // Get __rootElement and render
    JSValue global = JS_GetGlobalObject(ctx);
    JSValue root = JS_GetPropertyStr(ctx, global, "__rootElement");
    
    if (!JS_IsNull(root) && !JS_IsUndefined(root)) {
        create_element_from_desc(ctx, root, parent);
    }
    
    JS_FreeValue(ctx, root);
    JS_FreeValue(ctx, global);
    
    return 0;
}

int qjs_rasen_rerender(JSContext *ctx, lv_obj_t *parent) {
    // Clear existing children
    lv_obj_clean(parent);
    
    // Call __rerender()
    JSValue global = JS_GetGlobalObject(ctx);
    JSValue rerender_fn = JS_GetPropertyStr(ctx, global, "__rerender");
    
    if (JS_IsFunction(ctx, rerender_fn)) {
        JSValue ret = JS_Call(ctx, rerender_fn, JS_UNDEFINED, 0, NULL);
        JS_FreeValue(ctx, ret);
    }
    
    JS_FreeValue(ctx, rerender_fn);
    
    // Get new __rootElement and render
    JSValue root = JS_GetPropertyStr(ctx, global, "__rootElement");
    
    if (!JS_IsNull(root) && !JS_IsUndefined(root)) {
        create_element_from_desc(ctx, root, parent);
    }
    
    JS_FreeValue(ctx, root);
    JS_FreeValue(ctx, global);
    
    needs_rerender = false;
    return 0;
}

void qjs_rasen_process_events(JSContext *ctx) {
    // Execute pending JS jobs
    JSContext *ctx2;
    while (JS_ExecutePendingJob(JS_GetRuntime(ctx), &ctx2) > 0) {
        // Keep processing
    }
    
    // Check if we need to re-render
    if (needs_rerender) {
        // Re-render will be triggered by the main loop
        needs_rerender = false;
    }
}
