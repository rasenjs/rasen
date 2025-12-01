//! Event management system for bridging JS callbacks to GPUI events

use std::collections::HashMap;
use std::sync::{Arc, RwLock, atomic::{AtomicU64, Ordering}};
use rquickjs::{Context, Function, Persistent};

/// Unique ID for each event handler
pub type HandlerId = u64;

/// Global counter for generating unique handler IDs
static HANDLER_ID_COUNTER: AtomicU64 = AtomicU64::new(1);

/// Generate a new unique handler ID
pub fn next_handler_id() -> HandlerId {
    HANDLER_ID_COUNTER.fetch_add(1, Ordering::SeqCst)
}

/// Stores a persistent reference to a JS function
pub struct JsCallback {
    pub func: Persistent<Function<'static>>,
}

/// Thread-safe event manager that stores JS callbacks
#[derive(Clone)]
pub struct EventManager {
    inner: Arc<RwLock<EventManagerInner>>,
}

struct EventManagerInner {
    /// Map of handler ID -> JS callback
    handlers: HashMap<HandlerId, JsCallback>,
    /// Flag indicating if the UI needs to be re-rendered
    needs_render: bool,
}

impl EventManager {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(RwLock::new(EventManagerInner {
                handlers: HashMap::new(),
                needs_render: false,
            })),
        }
    }

    /// Register a JS function as an event handler
    pub fn register_handler(&self, id: HandlerId, func: Persistent<Function<'static>>) {
        let mut inner = self.inner.write().unwrap();
        inner.handlers.insert(id, JsCallback { func });
    }

    /// Check if a handler exists
    pub fn has_handler(&self, id: HandlerId) -> bool {
        let inner = self.inner.read().unwrap();
        inner.handlers.contains_key(&id)
    }

    /// Remove a handler
    pub fn remove_handler(&self, id: HandlerId) {
        let mut inner = self.inner.write().unwrap();
        inner.handlers.remove(&id);
    }

    /// Mark that UI needs re-rendering
    pub fn request_render(&self) {
        let mut inner = self.inner.write().unwrap();
        inner.needs_render = true;
    }

    /// Check and clear the render flag
    pub fn take_render_request(&self) -> bool {
        let mut inner = self.inner.write().unwrap();
        let needs = inner.needs_render;
        inner.needs_render = false;
        needs
    }

    /// Get all handler IDs (for debugging)
    pub fn handler_count(&self) -> usize {
        let inner = self.inner.read().unwrap();
        inner.handlers.len()
    }

    /// Execute a handler by ID
    pub fn invoke_handler(&self, id: HandlerId, ctx: &Context) -> bool {
        let func = {
            let inner = self.inner.read().unwrap();
            inner.handlers.get(&id).map(|cb| cb.func.clone())
        };

        if let Some(persistent_func) = func {
            ctx.with(|ctx| {
                if let Ok(func) = persistent_func.restore(&ctx) {
                    if let Err(e) = func.call::<_, ()>(()) {
                        eprintln!("Error invoking handler {}: {:?}", id, e);
                    } else {
                        // Handler executed successfully, request render
                        self.request_render();
                        return true;
                    }
                }
                false
            })
        } else {
            eprintln!("Handler {} not found", id);
            false
        }
    }
}

impl Default for EventManager {
    fn default() -> Self {
        Self::new()
    }
}
