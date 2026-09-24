//! Native bindings for the WebGPU spec — closes #571.
//!
//! [WebGPU][webgpu] is the modern, low-level GPU API the W3C
//! standardised for the web. This crate exposes a spec-faithful subset
//! to the [Perry TypeScript-to-native compiler][perry] so shaders +
//! pipelines authored against the browser API run unmodified under
//! Perry. Backed by [`wgpu`][wgpu] — the canonical native
//! implementation of the spec.
//!
//! [webgpu]: https://www.w3.org/TR/webgpu/
//! [perry]:  https://github.com/PerryTS/perry
//! [wgpu]:   https://github.com/gfx-rs/wgpu
//!
//! # Status
//!
//! - **v0.1.0** — adapter / device / queue, buffer, shader module,
//!   bind-group-layout, pipeline-layout, bind-group, compute pipeline,
//!   command encoder, compute pass encoder, command buffer, queue
//!   submit / write_buffer / on_submitted_work_done, buffer
//!   map_async / get_mapped_range / unmap. Enough to run a hello-world
//!   compute shader end-to-end and read the result back.
//!
//! Followups (own issue):
//!
//! - **v0.2.0** — render pipeline + render pass + textures + samplers
//!   + queue.writeTexture (the second hello-triangle acceptance test).
//! - **v0.3.0** — error scopes (`pushErrorScope` / `popErrorScope`),
//!   `GPUQuerySet`, surface presentation (`GPUSurface`).
//! - **v0.4.0** — `createRenderPipelineAsync` /
//!   `createComputePipelineAsync` (the sync-call variants ship in
//!   v0.1.0; the async variants are scaffolded but not load-bearing).
//! - **v0.5.0** — on-screen surface (`GPUSurface` / `GPUCanvasContext`):
//!   `requestSurface` / `surfaceFromNativeView` / `configure` /
//!   `getCurrentTexture` / `present`, embedded into a perry-ui window
//!   via its `embedNativeView` seam. macOS verified; other platforms
//!   adopt a host-created view (see the "On-screen surface" section
//!   in the README). Closes the issue's "on-screen canvas" carve-out.
//!
//! # Why a JSON-string descriptor channel
//!
//! WebGPU descriptor objects (`GPUBufferDescriptor`,
//! `GPUBindGroupLayoutDescriptor`, `GPUComputePipelineDescriptor`, …)
//! are deeply nested with many optional fields. Rather than exploding
//! each descriptor into a wide function-arg list, the TS side calls
//! `JSON.stringify(descriptor)` and we [`serde_json`]-deserialize on
//! the Rust side. This keeps the FFI surface small (one descriptor
//! JSON string + a few handles per call) and the TS surface obvious:
//! the object literal is the argument exactly as written in the spec.
//!
//! Handles inside descriptors (e.g. `bindGroupLayout` references in a
//! `GPUPipelineLayoutDescriptor`) round-trip as JS numbers — the
//! Perry-side wrapper just passes the handle through `JSON.stringify`
//! and we look the typed pointer up via [`with_handle`] on the way in.

use perry_ffi::{
    alloc_buffer, drop_handle, get_handle, register_handle, spawn_blocking, take_handle,
    with_handle, BufferHeader, Handle, JsPromise, JsValue, Promise, StringHeader,
};

use parking_lot::Mutex;
use serde::Deserialize;
use std::sync::OnceLock;
use wgpu::{
    Adapter, BindGroup, BindGroupLayout, Buffer, CommandBuffer, CommandEncoder, ComputePass,
    ComputePipeline, Device, Instance, MapMode, PipelineLayout, Queue, ShaderModule,
};

// ─── Helpers ────────────────────────────────────────────────────────

fn instance() -> &'static Instance {
    static INSTANCE: OnceLock<Instance> = OnceLock::new();
    INSTANCE.get_or_init(|| {
        // wgpu 30: `InstanceDescriptor::default()` is gone (the `display`
        // field's `Box<dyn WgpuHasDisplayHandle>` rules out a derived Default),
        // so the descriptor is spelled out. `BackendOptions::from_env_or_default`
        // keeps the env overrides (WGPU_BACKEND, …) that `from_env` used to give.
        Instance::new(wgpu::InstanceDescriptor {
            backends: wgpu::Backends::all(),
            flags: wgpu::InstanceFlags::default(),
            memory_budget_thresholds: wgpu::MemoryBudgetThresholds {
                for_resource_creation: None,
                for_device_loss: None,
            },
            backend_options: wgpu::BackendOptions::from_env_or_default(),
            display: None,
        })
    })
}

/// Look up a handle and run `f` against it **with the registry shard lock
/// released**.
///
/// # Why this exists
///
/// `perry_ffi::with_handle` holds the DashMap shard guard for the entire
/// duration of the closure:
///
/// ```ignore
/// HANDLES.get(&handle).and_then(|entry| entry.value().downcast_ref::<T>().map(f))
/// ```
///
/// That `Ref` guard is still alive while `f` runs. So a closure that *mutates*
/// the registry — `register_handle` (insert), `drop_handle` / `take_handle`
/// (remove) — asks for the **same shard's** write lock from the very thread
/// that already holds its read lock, and blocks forever.
///
/// The collision is probabilistic rather than deterministic: it only bites when
/// the handle being touched happens to hash to the same shard as the handle
/// being looked up. That is exactly why the symptom is a hang at a *random*
/// FFI call after a *random* number of frames — never a reproducible failure —
/// and why it was previously misread as a GPU/swapchain problem.
///
/// `perry_ffi::get_handle` drops the guard before returning (it hands back a
/// `&'static T` under the documented DashMap pin contract), leaving the
/// closure body free to touch the registry.
///
/// # Which to use
///
/// `with_handle_unlocked` for every closure that calls `register_handle` /
/// `drop_handle` / `take_handle`; plain `perry_ffi::with_handle` everywhere
/// else, where the scoped borrow is the safer choice (it cannot dangle if
/// another thread frees the same handle concurrently).
///
/// # Contract
///
/// The borrow is only valid while the handle stays registered, so a caller must
/// not free the handle it is *borrowing*. Every call site in this file borrows
/// a long-lived device / queue / surface / texture and frees only *other*
/// handles, so the constraint holds.
fn with_handle_unlocked<T: 'static + Send + Sync, R, F: FnOnce(&T) -> R>(
    handle: Handle,
    f: F,
) -> Option<R> {
    get_handle::<T>(handle).map(f)
}

/// Log an FFI entry point to stderr when `PERRY_WEBGPU_TRACE` is set.
///
/// Why this exists: the compiled binary is stripped, so a `sample` of a stuck
/// process shows `???` frames and cannot say *which* GPU call is blocking. This
/// turns "somewhere in the WebGPU layer" into the exact function name — the last
/// line printed before the hang is the call that never returned.
///
/// ```sh
/// PERRY_WEBGPU_TRACE=1 SPINE_TRACE_FILE=/tmp/t.log ./my-app 2>/tmp/ffi.log
/// tail -3 /tmp/ffi.log
/// ```
///
/// Gated on an env var rather than compiled out, so one binary serves both
/// modes and the trace can be enabled on a customer build without a rebuild.
/// stderr is unbuffered in Rust, so the last call survives a hang or a `kill -9`
/// — which stdout would not.
fn ffi_trace(name: &str) {
    static ON: OnceLock<bool> = OnceLock::new();
    if *ON.get_or_init(|| std::env::var_os("PERRY_WEBGPU_TRACE").is_some()) {
        eprintln!("[webgpu] {name}");
    }
}

unsafe fn read_str(ptr: *const StringHeader) -> Option<String> {
    let handle = perry_ffi::JsString::from_raw(ptr as *mut StringHeader);
    perry_ffi::read_string(handle).map(String::from)
}

fn alloc_str_value(s: &str) -> JsValue {
    JsValue::from_string_ptr(perry_ffi::alloc_string(s).as_raw())
}

fn alloc_buffer_value(bytes: &[u8]) -> JsValue {
    let buf = alloc_buffer(bytes);
    JsValue::from_object_ptr(buf as *mut perry_ffi::ObjectHeader)
}

/// Reject a promise with `prefix: <serde_json::Error>` and bail.
/// v0.1 sync-create paths return `0` on JSON errors instead — wgpu
/// surfaces the resulting "invalid handle" via the device error scope,
/// which is the spec-correct path. Kept around for v0.2 async paths.
#[allow(dead_code)]
fn reject_json_err(promise: JsPromise, prefix: &str, e: serde_json::Error) {
    promise.reject_string(&format!("{}: bad descriptor JSON: {}", prefix, e));
}

// ─── Wrapper structs for the handle registry ────────────────────────
//
// Each WebGPU object type lives in its own wrapper so the registry's
// `with_handle::<T, _, _>(handle, …)` downcast is unambiguous. The
// inner type is the corresponding wgpu native object, which owns its
// own GPU resources and drops them when the wrapper drops.

pub struct WGPUAdapter(pub Adapter);
pub struct WGPUDevice(pub Device);
/// The queue carries its parent device's handle so
/// `queueOnSubmittedWorkDone` can poll the right device — the spec
/// semantics ("resolve when all submitted work has finished") need a
/// poll loop on the device, and the bare `wgpu::Queue` doesn't carry
/// a back-pointer to its device.
pub struct WGPUQueue {
    pub queue: Queue,
    pub device_handle: Handle,
}
pub struct WGPUBuffer(pub Buffer);
pub struct WGPUShaderModule(pub ShaderModule);
pub struct WGPUBindGroupLayout(pub BindGroupLayout);
pub struct WGPUPipelineLayout(pub PipelineLayout);
pub struct WGPUBindGroup(pub BindGroup);
pub struct WGPUComputePipeline(pub ComputePipeline);
pub struct WGPURenderPipeline(pub wgpu::RenderPipeline);
pub struct WGPUCommandEncoder(pub Mutex<Option<CommandEncoder>>);
pub struct WGPUComputePass(pub Mutex<Option<ComputePass<'static>>>);
pub struct WGPURenderPass(pub Mutex<Option<wgpu::RenderPass<'static>>>);
pub struct WGPUCommandBuffer(pub Mutex<Option<CommandBuffer>>);
pub struct WGPUTexture(pub wgpu::Texture);
pub struct WGPUTextureView(pub wgpu::TextureView);
pub struct WGPUSampler(pub wgpu::Sampler);
pub struct WGPUQuerySet(pub wgpu::QuerySet);

// ════════════════════════════════════════════════════════════════════
// Adapter / Device / Queue
// ════════════════════════════════════════════════════════════════════

/// `navigator.gpu.requestAdapter() -> Promise<GPUAdapter | null>` —
/// requests a default adapter (high-performance, fallback allowed).
///
/// `surface_handle` is a native spec-extra (#5812 item 3): pass a surface
/// handle to pick an adapter compatible with it, or `0` for none. On
/// d3d12 / vulkan the adapter must be surface-compatible or a later
/// `surface.configure` fails; Metal ignores it. The idiomatic native
/// order is therefore surface-first: wrap the view with
/// `surfaceFromNativeView`, then `requestAdapter(surface)`.
///
/// Resolves to a numeric adapter handle, or rejects if no adapter is
/// available. The spec returns `null` when no adapter is found; we
/// reject instead to make the failure surface in async error-handling
/// paths instead of silently returning `0`. TS-side wrappers can map
/// this to `null` if literal spec parity matters.
#[no_mangle]
pub extern "C" fn js_webgpu_request_adapter(surface_handle: Handle) -> *mut Promise {
    ffi_trace("js_webgpu_request_adapter");
    let promise = JsPromise::new();
    let raw = promise.as_raw();

    spawn_blocking(move || {
        // #5812 item 3 — pick the adapter against the target surface when
        // one is supplied (`surface_handle == 0` means none). On d3d12 /
        // vulkan the adapter (and the device requested from it) must be
        // compatible with the surface, or a later `surface.configure`
        // fails with a "no queue family supports presentation" error;
        // Metal ignores this. Callers that already hold a surface (the
        // native pattern: create the view, wrap it, then request the
        // adapter) pass it here. Holding the surface reference across the
        // blocking request mirrors `adapterRequestDevice` above.
        let adapter = if surface_handle == 0 {
            pollster::block_on(instance().request_adapter(&wgpu::RequestAdapterOptions {
                power_preference: wgpu::PowerPreference::HighPerformance,
                force_fallback_adapter: false,
                compatible_surface: None,
                // wgpu 30: required. It buckets the reported limits so an
                // untrusted page cannot fingerprint the GPU through them. This
                // crate runs trusted native code (a Perry host), so the raw
                // limits are what the renderer wants — and bucketing would
                // shrink `downlevel_defaults`-adjacent caps unexpectedly.
                apply_limit_buckets: false,
            }))
            // wgpu 30: `request_adapter` yields `Result<Adapter, _>` (it was
            // `Option<Adapter>` before). This API reports "no compatible
            // adapter" either way, so the error collapses to `None`.
            .ok()
        } else {
            with_handle::<WGPUSurface, _, _>(surface_handle, |s| {
                pollster::block_on(instance().request_adapter(&wgpu::RequestAdapterOptions {
                    power_preference: wgpu::PowerPreference::HighPerformance,
                    force_fallback_adapter: false,
                    compatible_surface: Some(&s.surface),
                    apply_limit_buckets: false,
                }))
            })
            // `Option<Result<Adapter, _>>` → `Option<Adapter>`. `flatten`
            // no longer applies here (it wants `Option<Option<_>>`), so the
            // inner Result is unwrapped explicitly: a request that errored is
            // the same as one that found nothing, which is what the caller
            // already reports as "no compatible adapter".
            .and_then(|r| r.ok())
        };
        match adapter {
            Some(a) => {
                let h = register_handle(WGPUAdapter(a));
                promise.resolve(JsValue::from_number(h as f64));
            }
            None => promise.reject_string("webgpu requestAdapter: no compatible adapter"),
        }
    });
    raw
}

/// `adapter.requestDevice() -> Promise<GPUDevice>` — requests a device
/// from the adapter using default limits + features. Resolves with an
/// object `{ device, queue }` (numeric handles); the TS-side wrapper
/// destructures it onto the `GPUDevice.queue` property in one step,
/// which matches how browsers expose them (a `GPUDevice` always has
/// the same `queue` for its lifetime).
#[no_mangle]
pub extern "C" fn js_webgpu_adapter_request_device(adapter_handle: Handle) -> *mut Promise {
    ffi_trace("js_webgpu_adapter_request_device");
    let promise = JsPromise::new();
    let raw = promise.as_raw();

    spawn_blocking(move || {
        let outcome = with_handle::<WGPUAdapter, _, _>(adapter_handle, |a| {
            // wgpu 30: `request_device` takes the descriptor only — the old
            // trace-path argument moved into `DeviceDescriptor::trace` — and the
            // descriptor gained `experimental_features`.
            //
            // SAFETY on `ExperimentalFeatures::enabled()`: wgpu documents that
            // EXPERIMENTAL_-prefixed features "may result in undefined behavior
            // when used incorrectly" and asks callers to report bugs they hit.
            // This crate opts in because `EXPERIMENTAL_RAY_QUERY` — the reason
            // for moving to wgpu 30 at all — is gated behind it, and the Metal
            // ray-query path is the one already validated on M4 (exact
            // barycentrics, t=1.0000). A caller only reaches it by requesting
            // that feature explicitly through `deviceCreate*`.
            pollster::block_on(a.0.request_device(&wgpu::DeviceDescriptor {
                label: Some("perry-webgpu-device"),
                required_features: wgpu::Features::empty(),
                required_limits: wgpu::Limits::downlevel_defaults(),
                experimental_features: unsafe { wgpu::ExperimentalFeatures::enabled() },
                memory_hints: wgpu::MemoryHints::default(),
                trace: wgpu::Trace::Off,
            }))
        });

        match outcome {
            Some(Ok((device, queue))) => {
                let dev_h = register_handle(WGPUDevice(device));
                let q_h = register_handle(WGPUQueue {
                    queue,
                    device_handle: dev_h,
                });
                // Pack as {device, queue}.
                unsafe {
                    let keys = ["device", "queue"];
                    let (packed, shape) = perry_ffi::build_object_shape(&keys);
                    let obj = perry_ffi::js_object_alloc_with_shape(
                        shape,
                        keys.len() as u32,
                        packed.as_ptr(),
                        packed.len() as u32,
                    );
                    perry_ffi::js_object_set_field(obj, 0, JsValue::from_number(dev_h as f64));
                    perry_ffi::js_object_set_field(obj, 1, JsValue::from_number(q_h as f64));
                    promise.resolve(JsValue::from_object_ptr(obj));
                }
            }
            Some(Err(e)) => promise.reject_string(&format!("webgpu requestDevice: {}", e)),
            None => promise.reject_string("webgpu requestDevice: invalid adapter handle"),
        }
    });
    raw
}

// wgpu 22 has no Device::queue() accessor, so stash the queue from
// request_device in a side table keyed by the device handle.
fn sync_queue_slot() -> &'static std::sync::Mutex<std::collections::HashMap<Handle, Queue>> {
    static SLOT: std::sync::OnceLock<std::sync::Mutex<std::collections::HashMap<Handle, Queue>>> =
        std::sync::OnceLock::new();
    SLOT.get_or_init(|| std::sync::Mutex::new(std::collections::HashMap::new()))
}

// WORKAROUND (Perry promise-object bug): the async adapter_request_device
// resolves a {device, queue} object, but Perry's native-async completion
// channel drops object pointers (JS side sees `null`). Device creation is
// already synchronous internally (pollster::block_on); expose sync entries.
#[no_mangle]
pub extern "C" fn js_webgpu_adapter_request_device_sync(adapter_handle: Handle) -> Handle {
    ffi_trace("js_webgpu_adapter_request_device_sync");
    let outcome = with_handle::<WGPUAdapter, _, _>(adapter_handle, |a| {
        // Same wgpu 30 shape as the async `js_webgpu_adapter_request_device`
        // above: descriptor-only `request_device`, `experimental_features` for
        // the EXPERIMENTAL_-gated features (ray query), and tracing moved into
        // the descriptor. See the SAFETY note there.
        pollster::block_on(a.0.request_device(&wgpu::DeviceDescriptor {
            label: Some("perry-webgpu-device"),
            required_features: wgpu::Features::empty(),
            required_limits: wgpu::Limits::downlevel_defaults(),
            experimental_features: unsafe { wgpu::ExperimentalFeatures::enabled() },
            memory_hints: wgpu::MemoryHints::default(),
            trace: wgpu::Trace::Off,
        }))
    });
    match outcome {
        Some(Ok((device, queue))) => {
            let dev_h = register_handle(WGPUDevice(device));
            sync_queue_slot().lock().unwrap().insert(dev_h, queue);
            dev_h
        }
        _ => 0,
    }
}

#[no_mangle]
pub extern "C" fn js_webgpu_device_get_queue_sync(device_handle: Handle) -> Handle {
    ffi_trace("js_webgpu_device_get_queue_sync");
    // Clone (not `remove`) — `surface_configure` also looks the queue up by
    // device (wgpu has no `Device::queue()`), and `surface_present` runs on
    // it. Taking it out here left every `present` with "surface has no queue".
    // `Queue` is a cheap refcounted handle, so a clone shares the same queue.
    let queue = sync_queue_slot().lock().unwrap().get(&device_handle).cloned();
    match queue {
        Some(q) => register_handle(WGPUQueue {
            queue: q,
            device_handle,
        }),
        None => 0,
    }
}

/// `adapter.drop()` — synchronous handle release. The spec doesn't
/// expose this, but Perry needs a way to free the wrapper since the
/// adapter is otherwise leaked once the TS handle goes out of scope.
/// (Browser GC eventually reclaims; native tools rely on explicit
/// drops.)
#[no_mangle]
pub extern "C" fn js_webgpu_adapter_drop(adapter_handle: Handle) {
    ffi_trace("js_webgpu_adapter_drop");
    let _ = take_handle::<WGPUAdapter>(adapter_handle);
    drop_handle(adapter_handle);
}

/// `device.destroy()` — releases the device and its queue. Mirrors
/// `GPUDevice.destroy()` from the spec. Idempotent.
#[no_mangle]
pub extern "C" fn js_webgpu_device_destroy(device_handle: Handle) {
    ffi_trace("js_webgpu_device_destroy");
    let _ = take_handle::<WGPUDevice>(device_handle);
    drop_handle(device_handle);
}

// ════════════════════════════════════════════════════════════════════
// Buffer
// ════════════════════════════════════════════════════════════════════

#[derive(Deserialize)]
struct BufferDescriptor {
    #[serde(default)]
    label: Option<String>,
    size: u64,
    usage: u32,
    #[serde(rename = "mappedAtCreation", default)]
    mapped_at_creation: bool,
}

/// `device.createBuffer(descriptor) -> GPUBuffer` — synchronous.
/// `descriptor` is the JSON form of a `GPUBufferDescriptor`:
/// `{ label?, size, usage, mappedAtCreation? }`. `usage` is the
/// `GPUBufferUsageFlags` bitmask (numeric — `STORAGE | COPY_SRC` etc.,
/// per the spec's flag values).
///
/// # Safety
///
/// `descriptor_ptr` must be a Perry-runtime `StringHeader` produced by
/// `JSON.stringify(...)` on the TS side.
#[no_mangle]
pub unsafe extern "C" fn js_webgpu_device_create_buffer(
    device_handle: Handle,
    descriptor_ptr: *const StringHeader,
) -> Handle {
    ffi_trace("js_webgpu_device_create_buffer");
    let Some(json) = read_str(descriptor_ptr) else {
        return 0;
    };
    let desc: BufferDescriptor = match serde_json::from_str(&json) {
        Ok(d) => d,
        Err(_) => return 0,
    };

    if std::env::var_os("PERRY_WEBGPU_TRACE").is_some() {
        eprintln!(
            "[webgpu]   create_buffer size={} size%4={} mapped_at_creation={} usage={:#x}",
            desc.size,
            desc.size % 4,
            desc.mapped_at_creation,
            desc.usage
        );
    }
    if desc.mapped_at_creation && desc.size % 4 != 0 {
        eprintln!(
            "webgpu deviceCreateBuffer: mappedAtCreation size {} is not a multiple of 4; \
             the shadow copy flushed on unmap() cannot be uploaded as-is.",
            desc.size
        );
    }

    with_handle_unlocked::<WGPUDevice, _, _>(device_handle, |d| {
        let buffer = d.0.create_buffer(&wgpu::BufferDescriptor {
            label: desc.label.as_deref(),
            size: desc.size,
            usage: wgpu::BufferUsages::from_bits_truncate(desc.usage),
            mapped_at_creation: desc.mapped_at_creation,
        });
        let h = register_handle(WGPUBuffer(buffer));
        // Correlate a handle seen in a later `queue_write_buffer` trace back to
        // the buffer that created it — the alignment guard reports only the
        // handle, which is otherwise unidentifiable from the log.
        if std::env::var_os("PERRY_WEBGPU_TRACE").is_some() {
            eprintln!(
                "[webgpu]   create_buffer -> handle={h} size={} usage={:#x} mapped_at_creation={}",
                desc.size, desc.usage, desc.mapped_at_creation
            );
        }
        h
    })
    .unwrap_or(0)
}

/// `buffer.destroy()` — releases the buffer. Idempotent.
#[no_mangle]
pub extern "C" fn js_webgpu_buffer_destroy(buffer_handle: Handle) {
    ffi_trace("js_webgpu_buffer_destroy");
    let _ = take_handle::<WGPUBuffer>(buffer_handle);
    drop_handle(buffer_handle);
}

/// `buffer.mapAsync(mode, offset, size) -> Promise<undefined>` — make
/// the buffer's contents accessible to the host. `mode` is `1` for
/// READ, `2` for WRITE (matches `GPUMapMode.READ` / `WRITE`).
///
/// Resolves once the GPU is done with the buffer and the host can
/// safely access the mapped range. The spec requires the device to be
/// "polled" between the request and the resolution; we do this by
/// scheduling a blocking poll inside the `spawn_blocking` task.
#[no_mangle]
pub extern "C" fn js_webgpu_buffer_map_async(
    buffer_handle: Handle,
    mode: u32,
    offset: f64,
    size: f64,
) -> *mut Promise {
    ffi_trace("js_webgpu_buffer_map_async");
    let promise = JsPromise::new();
    let raw = promise.as_raw();

    spawn_blocking(move || {
        let map_mode = match mode {
            1 => MapMode::Read,
            2 => MapMode::Write,
            _ => {
                promise.reject_string("webgpu mapAsync: invalid mode (expected 1=READ, 2=WRITE)");
                return;
            }
        };
        let off = offset.max(0.0) as u64;
        let sz = size.max(0.0) as u64;

        // The mapAsync callback fires when device.poll progresses the
        // queue past the mapping. We park on a `parking_lot::Mutex`
        // sentinel rather than a tokio channel — wgpu's callback isn't
        // async-aware and we're already inside spawn_blocking.
        let result_slot: std::sync::Arc<Mutex<Option<Result<(), wgpu::BufferAsyncError>>>> =
            std::sync::Arc::new(Mutex::new(None));
        let r2 = result_slot.clone();

        // Scope `with_handle` so we drop the borrow before `poll`.
        let ok = with_handle::<WGPUBuffer, _, _>(buffer_handle, |b| {
            let slice = if sz == 0 {
                b.0.slice(off..)
            } else {
                b.0.slice(off..off + sz)
            };
            slice.map_async(map_mode, move |r| {
                *r2.lock() = Some(r);
            });
            true
        })
        .unwrap_or(false);

        if !ok {
            promise.reject_string("webgpu mapAsync: invalid buffer handle");
            return;
        }

        // Spin-poll the device until the callback fires. We don't have
        // a direct handle on the device here, so the user must call
        // `device.poll()` (or equivalently, `queue.submit([])` followed
        // by `queue.onSubmittedWorkDone()`) before awaiting this
        // promise — which is also the browser pattern. We add a hard
        // ceiling so a buggy caller can't hang the worker forever.
        let mut spins = 0u32;
        loop {
            if result_slot.lock().is_some() {
                break;
            }
            spins += 1;
            if spins > 10_000 {
                promise.reject_string(
                    "webgpu mapAsync: timed out waiting for callback (did you forget to poll the device?)",
                );
                return;
            }
            std::thread::sleep(std::time::Duration::from_micros(100));
        }

        let result = result_slot.lock().take();
        match result {
            Some(Ok(())) => promise.resolve_undefined(),
            Some(Err(e)) => promise.reject_string(&format!("webgpu mapAsync: {}", e)),
            None => promise.reject_string("webgpu mapAsync: callback dropped without result"),
        }
    });
    raw
}

/// `buffer.getMappedRange(offset?, size?) -> ArrayBuffer` — copies
/// the mapped bytes into a Perry-runtime `Buffer` (Uint8Array view).
/// In the spec this returns an ArrayBuffer that aliases the GPU's
/// staging memory; under Perry we copy because Perry-runtime buffers
/// are independently GC-managed.
///
/// Returns an empty buffer if the handle is unknown or not mapped.
#[no_mangle]
pub extern "C" fn js_webgpu_buffer_get_mapped_range(
    buffer_handle: Handle,
    offset: f64,
    size: f64,
) -> JsValue {
    ffi_trace("js_webgpu_buffer_get_mapped_range");
    let off = offset.max(0.0) as u64;
    let sz = size.max(0.0) as u64;

    let bytes = with_handle::<WGPUBuffer, _, _>(buffer_handle, |b| {
        // wgpu 30: `BufferSlice::get_mapped_range()` became
        // `Buffer::get_mapped_range(range) -> Result<BufferView, MapRangeError>`
        // — the range is now the method's own argument (so the pre-`slice` is
        // redundant) and the call can fail. `BufferView` derefs to `[u8]`. The
        // two cases are normalised to one `Range` (an `if/else` must yield a
        // single type) and an end past the buffer maps to an empty result,
        // which the caller already reports as an empty buffer.
        let end = if sz == 0 { u64::MAX } else { off.saturating_add(sz) };
        match b.0.get_mapped_range(off..end) {
            Ok(view) => view.to_vec(),
            Err(_) => Vec::new(),
        }
    });

    match bytes {
        Some(v) => alloc_buffer_value(&v),
        None => alloc_buffer_value(&[]),
    }
}

/// `buffer.unmap()` — releases the host mapping. After this the host
/// can't read the mapped bytes any more, but the GPU can use the
/// buffer again. Idempotent at the wgpu layer.
#[no_mangle]
pub extern "C" fn js_webgpu_buffer_unmap(buffer_handle: Handle) {
    ffi_trace("js_webgpu_buffer_unmap");
    let _ = with_handle::<WGPUBuffer, _, _>(buffer_handle, |b| b.0.unmap());
}

// ════════════════════════════════════════════════════════════════════
// Shader Module
// ════════════════════════════════════════════════════════════════════

/// `device.createShaderModule({ code }) -> GPUShaderModule` — WGSL
/// only (matches the browser's spec — no GLSL/SPIR-V toggle on the
/// public API). The code is passed as a separate string param rather
/// than packed in a JSON descriptor because shader source can be very
/// large and JSON-escaping it is wasteful.
///
/// `label` is deferred to a v0.2 second-arg overload; the spec
/// supports `{ code, label, sourceMap, compilationHints }` but only
/// `code` is load-bearing for compilation.
///
/// # Safety
///
/// `code_ptr` must be a Perry-runtime `StringHeader`.
#[no_mangle]
pub unsafe extern "C" fn js_webgpu_device_create_shader_module(
    device_handle: Handle,
    code_ptr: *const StringHeader,
) -> Handle {
    ffi_trace("js_webgpu_device_create_shader_module");
    let Some(code) = read_str(code_ptr) else {
        return 0;
    };

    with_handle_unlocked::<WGPUDevice, _, _>(device_handle, |d| {
        let module = d.0.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: None,
            source: wgpu::ShaderSource::Wgsl(code.into()),
        });
        register_handle(WGPUShaderModule(module))
    })
    .unwrap_or(0)
}

// ════════════════════════════════════════════════════════════════════
// BindGroupLayout
// ════════════════════════════════════════════════════════════════════

#[derive(Deserialize)]
struct BglDescriptor {
    #[serde(default)]
    label: Option<String>,
    entries: Vec<BglEntry>,
}

#[derive(Deserialize)]
struct BglEntry {
    binding: u32,
    visibility: u32,
    #[serde(default)]
    buffer: Option<BglBuffer>,
    #[serde(default)]
    sampler: Option<BglSampler>,
    #[serde(default)]
    texture: Option<BglTexture>,
    #[serde(rename = "storageTexture", default)]
    storage_texture: Option<BglStorageTexture>,
}

#[derive(Deserialize)]
struct BglBuffer {
    #[serde(rename = "type", default = "default_buffer_type")]
    ty: String,
    #[serde(rename = "hasDynamicOffset", default)]
    has_dynamic_offset: bool,
    #[serde(rename = "minBindingSize", default)]
    min_binding_size: u64,
}
fn default_buffer_type() -> String {
    "uniform".into()
}

#[derive(Deserialize)]
struct BglSampler {
    #[serde(rename = "type", default)]
    ty: Option<String>,
}

#[derive(Deserialize)]
struct BglTexture {
    #[serde(rename = "sampleType", default)]
    sample_type: Option<String>,
    #[serde(rename = "viewDimension", default)]
    view_dimension: Option<String>,
    #[serde(default)]
    multisampled: bool,
}

#[derive(Deserialize)]
struct BglStorageTexture {
    #[serde(default)]
    access: Option<String>,
    format: String,
    #[serde(rename = "viewDimension", default)]
    view_dimension: Option<String>,
}

fn parse_buffer_binding_type(s: &str) -> wgpu::BufferBindingType {
    match s {
        "uniform" => wgpu::BufferBindingType::Uniform,
        "storage" => wgpu::BufferBindingType::Storage { read_only: false },
        "read-only-storage" => wgpu::BufferBindingType::Storage { read_only: true },
        _ => wgpu::BufferBindingType::Uniform,
    }
}

/// `device.createBindGroupLayout(descriptor) -> GPUBindGroupLayout` —
/// synchronous. Descriptor JSON shape mirrors the spec; only the
/// buffer/sampler/texture/storageTexture entry types are wired up in
/// v0.1. `externalTexture` is a v0.2 follow-up.
///
/// # Safety
///
/// `descriptor_ptr` must be a Perry-runtime `StringHeader` containing
/// `JSON.stringify(GPUBindGroupLayoutDescriptor)`.
#[no_mangle]
pub unsafe extern "C" fn js_webgpu_device_create_bind_group_layout(
    device_handle: Handle,
    descriptor_ptr: *const StringHeader,
) -> Handle {
    ffi_trace("js_webgpu_device_create_bind_group_layout");
    let Some(json) = read_str(descriptor_ptr) else {
        return 0;
    };
    let desc: BglDescriptor = match serde_json::from_str(&json) {
        Ok(d) => d,
        Err(_) => return 0,
    };

    with_handle_unlocked::<WGPUDevice, _, _>(device_handle, |d| {
        let entries: Vec<wgpu::BindGroupLayoutEntry> = desc
            .entries
            .iter()
            .map(|e| {
                let visibility = wgpu::ShaderStages::from_bits_truncate(e.visibility);
                let ty = if let Some(b) = &e.buffer {
                    wgpu::BindingType::Buffer {
                        ty: parse_buffer_binding_type(&b.ty),
                        has_dynamic_offset: b.has_dynamic_offset,
                        min_binding_size: std::num::NonZeroU64::new(b.min_binding_size),
                    }
                } else if let Some(s) = &e.sampler {
                    let sampler_ty = match s.ty.as_deref().unwrap_or("filtering") {
                        "non-filtering" => wgpu::SamplerBindingType::NonFiltering,
                        "comparison" => wgpu::SamplerBindingType::Comparison,
                        _ => wgpu::SamplerBindingType::Filtering,
                    };
                    wgpu::BindingType::Sampler(sampler_ty)
                } else if let Some(t) = &e.texture {
                    wgpu::BindingType::Texture {
                        sample_type: match t.sample_type.as_deref().unwrap_or("float") {
                            "unfilterable-float" => {
                                wgpu::TextureSampleType::Float { filterable: false }
                            }
                            "depth" => wgpu::TextureSampleType::Depth,
                            "sint" => wgpu::TextureSampleType::Sint,
                            "uint" => wgpu::TextureSampleType::Uint,
                            _ => wgpu::TextureSampleType::Float { filterable: true },
                        },
                        view_dimension: parse_view_dimension(t.view_dimension.as_deref()),
                        multisampled: t.multisampled,
                    }
                } else if let Some(st) = &e.storage_texture {
                    wgpu::BindingType::StorageTexture {
                        access: match st.access.as_deref().unwrap_or("write-only") {
                            "read-only" => wgpu::StorageTextureAccess::ReadOnly,
                            "read-write" => wgpu::StorageTextureAccess::ReadWrite,
                            _ => wgpu::StorageTextureAccess::WriteOnly,
                        },
                        format: parse_texture_format(&st.format),
                        view_dimension: parse_view_dimension(st.view_dimension.as_deref()),
                    }
                } else {
                    // Default to a uniform buffer if the entry has no
                    // type — keeps `serde_json::from_str` from rejecting
                    // older descriptor shapes that pre-date the typed
                    // entry split.
                    wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    }
                };
                wgpu::BindGroupLayoutEntry {
                    binding: e.binding,
                    visibility,
                    ty,
                    count: None,
                }
            })
            .collect();

        let layout = d.0.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: desc.label.as_deref(),
            entries: &entries,
        });
        register_handle(WGPUBindGroupLayout(layout))
    })
    .unwrap_or(0)
}

fn parse_view_dimension(s: Option<&str>) -> wgpu::TextureViewDimension {
    match s.unwrap_or("2d") {
        "1d" => wgpu::TextureViewDimension::D1,
        "3d" => wgpu::TextureViewDimension::D3,
        "cube" => wgpu::TextureViewDimension::Cube,
        "cube-array" => wgpu::TextureViewDimension::CubeArray,
        "2d-array" => wgpu::TextureViewDimension::D2Array,
        _ => wgpu::TextureViewDimension::D2,
    }
}

/// Map a WebGPU spec format string to a `wgpu::TextureFormat`. Covers
/// the formats most pipelines use; everything else returns
/// `Rgba8Unorm` as a safe fallback. v0.2 will harden this with a
/// Result-returning variant that surfaces the unknown name.
fn parse_texture_format(s: &str) -> wgpu::TextureFormat {
    use wgpu::TextureFormat::*;
    match s {
        "r8unorm" => R8Unorm,
        "r8snorm" => R8Snorm,
        "r8uint" => R8Uint,
        "r8sint" => R8Sint,
        "r16uint" => R16Uint,
        "r16sint" => R16Sint,
        "r16float" => R16Float,
        "rg8unorm" => Rg8Unorm,
        "rg8snorm" => Rg8Snorm,
        "rg8uint" => Rg8Uint,
        "rg8sint" => Rg8Sint,
        "r32uint" => R32Uint,
        "r32sint" => R32Sint,
        "r32float" => R32Float,
        "rg16uint" => Rg16Uint,
        "rg16sint" => Rg16Sint,
        "rg16float" => Rg16Float,
        "rgba8unorm" => Rgba8Unorm,
        "rgba8unorm-srgb" => Rgba8UnormSrgb,
        "rgba8snorm" => Rgba8Snorm,
        "rgba8uint" => Rgba8Uint,
        "rgba8sint" => Rgba8Sint,
        "bgra8unorm" => Bgra8Unorm,
        "bgra8unorm-srgb" => Bgra8UnormSrgb,
        "rgb10a2unorm" => Rgb10a2Unorm,
        "rg32uint" => Rg32Uint,
        "rg32sint" => Rg32Sint,
        "rg32float" => Rg32Float,
        "rgba16uint" => Rgba16Uint,
        "rgba16sint" => Rgba16Sint,
        "rgba16float" => Rgba16Float,
        "rgba32uint" => Rgba32Uint,
        "rgba32sint" => Rgba32Sint,
        "rgba32float" => Rgba32Float,
        "depth16unorm" => Depth16Unorm,
        "depth24plus" => Depth24Plus,
        "depth24plus-stencil8" => Depth24PlusStencil8,
        "depth32float" => Depth32Float,
        _ => Rgba8Unorm,
    }
}

// ════════════════════════════════════════════════════════════════════
// PipelineLayout
// ════════════════════════════════════════════════════════════════════

#[derive(Deserialize)]
struct PipelineLayoutDescriptor {
    #[serde(default)]
    label: Option<String>,
    #[serde(rename = "bindGroupLayouts")]
    bind_group_layouts: Vec<i64>,
}

/// `device.createPipelineLayout(descriptor) -> GPUPipelineLayout` —
/// synchronous. The TS-side `bindGroupLayouts: GPUBindGroupLayout[]`
/// array round-trips as numeric handles.
///
/// # Safety
///
/// `descriptor_ptr` must be a Perry-runtime `StringHeader`.
#[no_mangle]
pub unsafe extern "C" fn js_webgpu_device_create_pipeline_layout(
    device_handle: Handle,
    descriptor_ptr: *const StringHeader,
) -> Handle {
    ffi_trace("js_webgpu_device_create_pipeline_layout");
    let Some(json) = read_str(descriptor_ptr) else {
        return 0;
    };
    let desc: PipelineLayoutDescriptor = match serde_json::from_str(&json) {
        Ok(d) => d,
        Err(_) => return 0,
    };

    // Look up each layout via `with_handle` — but `wgpu::PipelineLayoutDescriptor`
    // wants `&[&BindGroupLayout]`, so we collect the raw pointers and re-borrow.
    // Safe because the registry pins each layout for its handle's lifetime.
    let layout_ptrs: Vec<*const BindGroupLayout> = desc
        .bind_group_layouts
        .iter()
        .filter_map(|h| {
            with_handle::<WGPUBindGroupLayout, _, _>(*h, |bgl| &bgl.0 as *const _)
        })
        .collect();

    if layout_ptrs.len() != desc.bind_group_layouts.len() {
        return 0;
    }

    with_handle_unlocked::<WGPUDevice, _, _>(device_handle, |d| {
        // wgpu 30: `bind_group_layouts` entries became `Option<&BindGroupLayout>`
        // (an entry may be absent), and `push_constant_ranges: &[Range<u32>]` was
        // replaced by `immediate_size: u32` (WebGPU "immediate data"). This
        // crate's WGSL uses neither, so the slot is 0 and every layout is Some.
        let layouts: Vec<Option<&BindGroupLayout>> = layout_ptrs.iter().map(|p| Some(&**p)).collect();
        let pl = d.0.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: desc.label.as_deref(),
            bind_group_layouts: &layouts,
            immediate_size: 0,
        });
        register_handle(WGPUPipelineLayout(pl))
    })
    .unwrap_or(0)
}

// ════════════════════════════════════════════════════════════════════
// BindGroup
// ════════════════════════════════════════════════════════════════════

#[derive(Deserialize)]
struct BindGroupDescriptor {
    #[serde(default)]
    label: Option<String>,
    layout: i64,
    entries: Vec<BindGroupEntry>,
}

#[derive(Deserialize)]
struct BindGroupEntry {
    binding: u32,
    resource: BindGroupResource,
}

/// Wire format for `GPUBindGroupEntry.resource`. The spec's TS shape
/// is a *union* without a tag — `GPUBufferBinding` is an object with
/// a `buffer` field, a `GPUSampler` is a bare number, a
/// `GPUTextureView` is a bare number too. JSON can't distinguish bare
/// samplers from bare texture views, so the binding wraps each in a
/// single-key object on the way across the FFI: `{buffer:n, …}`,
/// `{sampler:n}`, or `{textureView:n}`. `serde(untagged)` then decides
/// which variant by which key is present.
#[derive(Deserialize)]
#[serde(untagged)]
enum BindGroupResource {
    Buffer(BindGroupBufferBinding),
    Sampler { sampler: i64 },
    TextureView {
        #[serde(rename = "textureView")]
        texture_view: i64,
    },
}

#[derive(Deserialize)]
struct BindGroupBufferBinding {
    buffer: i64,
    #[serde(default)]
    offset: u64,
    /// `0` means "to the end of the buffer", matching the spec's
    /// `undefined` sentinel.
    #[serde(default)]
    size: u64,
}

/// `device.createBindGroup(descriptor) -> GPUBindGroup` — synchronous.
/// Supports the spec's three resource forms: `GPUBufferBinding`
/// (`{buffer, offset?, size?}`), `GPUSampler` (`{sampler}`), and
/// `GPUTextureView` (`{textureView}`). External textures are deferred
/// until the canvas integration crate exposes them.
///
/// # Safety
///
/// `descriptor_ptr` must be a Perry-runtime `StringHeader`.
#[no_mangle]
pub unsafe extern "C" fn js_webgpu_device_create_bind_group(
    device_handle: Handle,
    descriptor_ptr: *const StringHeader,
) -> Handle {
    ffi_trace("js_webgpu_device_create_bind_group");
    let Some(json) = read_str(descriptor_ptr) else {
        return 0;
    };
    let desc: BindGroupDescriptor = match serde_json::from_str(&json) {
        Ok(d) => d,
        Err(_) => return 0,
    };

    // Resolve the layout pointer first (lifetime-pinned by registry).
    let layout_ptr = match with_handle::<WGPUBindGroupLayout, _, _>(desc.layout, |bgl| {
        &bgl.0 as *const BindGroupLayout
    }) {
        Some(p) => p,
        None => return 0,
    };

    // Resolve each entry's pointer up front. Pointer-based here
    // because the registry pins each resource for its handle's
    // lifetime — the wgpu side wants `&` references and we can't hold
    // a `with_handle` guard across the closure boundary.
    enum ResolvedEntry {
        Buffer {
            binding: u32,
            buffer_ptr: *const Buffer,
            offset: u64,
            size: u64,
        },
        Sampler {
            binding: u32,
            sampler_ptr: *const wgpu::Sampler,
        },
        TextureView {
            binding: u32,
            view_ptr: *const wgpu::TextureView,
        },
    }
    let mut resolved: Vec<ResolvedEntry> = Vec::with_capacity(desc.entries.len());
    for e in desc.entries.iter() {
        match &e.resource {
            BindGroupResource::Buffer(b) => {
                let bp = with_handle::<WGPUBuffer, _, _>(b.buffer, |bb| &bb.0 as *const Buffer);
                let Some(bp) = bp else {
                    return 0;
                };
                resolved.push(ResolvedEntry::Buffer {
                    binding: e.binding,
                    buffer_ptr: bp,
                    offset: b.offset,
                    size: b.size,
                });
            }
            BindGroupResource::Sampler { sampler } => {
                let sp = with_handle::<WGPUSampler, _, _>(*sampler, |s| {
                    &s.0 as *const wgpu::Sampler
                });
                let Some(sp) = sp else { return 0 };
                resolved.push(ResolvedEntry::Sampler {
                    binding: e.binding,
                    sampler_ptr: sp,
                });
            }
            BindGroupResource::TextureView { texture_view } => {
                let vp = with_handle::<WGPUTextureView, _, _>(*texture_view, |v| {
                    &v.0 as *const wgpu::TextureView
                });
                let Some(vp) = vp else { return 0 };
                resolved.push(ResolvedEntry::TextureView {
                    binding: e.binding,
                    view_ptr: vp,
                });
            }
        }
    }

    with_handle_unlocked::<WGPUDevice, _, _>(device_handle, |d| {
        let bind_entries: Vec<wgpu::BindGroupEntry> = resolved
            .iter()
            .map(|r| match r {
                ResolvedEntry::Buffer {
                    binding,
                    buffer_ptr,
                    offset,
                    size,
                } => wgpu::BindGroupEntry {
                    binding: *binding,
                    resource: wgpu::BindingResource::Buffer(wgpu::BufferBinding {
                        buffer: unsafe { &**buffer_ptr },
                        offset: *offset,
                        size: std::num::NonZeroU64::new(*size),
                    }),
                },
                ResolvedEntry::Sampler {
                    binding,
                    sampler_ptr,
                } => wgpu::BindGroupEntry {
                    binding: *binding,
                    resource: wgpu::BindingResource::Sampler(unsafe { &**sampler_ptr }),
                },
                ResolvedEntry::TextureView { binding, view_ptr } => wgpu::BindGroupEntry {
                    binding: *binding,
                    resource: wgpu::BindingResource::TextureView(unsafe { &**view_ptr }),
                },
            })
            .collect();
        let bg = d.0.create_bind_group(&wgpu::BindGroupDescriptor {
            label: desc.label.as_deref(),
            layout: unsafe { &*layout_ptr },
            entries: &bind_entries,
        });
        register_handle(WGPUBindGroup(bg))
    })
    .unwrap_or(0)
}

// ════════════════════════════════════════════════════════════════════
// Compute Pipeline
// ════════════════════════════════════════════════════════════════════

#[derive(Deserialize)]
struct ComputePipelineDescriptor {
    #[serde(default)]
    label: Option<String>,
    /// Either a numeric `GPUPipelineLayout` handle or the literal
    /// string `"auto"` per the spec.
    layout: serde_json::Value,
    compute: ProgrammableStage,
}

#[derive(Deserialize)]
struct ProgrammableStage {
    module: i64,
    #[serde(rename = "entryPoint", default)]
    entry_point: Option<String>,
}

/// `device.createComputePipeline(descriptor) -> GPUComputePipeline` —
/// synchronous. `descriptor.layout` accepts either `"auto"` (per
/// spec — wgpu picks the layout from the shader bindings) or a
/// numeric `GPUPipelineLayout` handle.
///
/// # Safety
///
/// `descriptor_ptr` must be a Perry-runtime `StringHeader`.
#[no_mangle]
pub unsafe extern "C" fn js_webgpu_device_create_compute_pipeline(
    device_handle: Handle,
    descriptor_ptr: *const StringHeader,
) -> Handle {
    ffi_trace("js_webgpu_device_create_compute_pipeline");
    let Some(json) = read_str(descriptor_ptr) else {
        return 0;
    };
    let desc: ComputePipelineDescriptor = match serde_json::from_str(&json) {
        Ok(d) => d,
        Err(_) => return 0,
    };

    let layout_ptr: Option<*const PipelineLayout> = match &desc.layout {
        serde_json::Value::String(s) if s == "auto" => None,
        serde_json::Value::Number(n) => {
            let h = n.as_i64().unwrap_or(0);
            with_handle::<WGPUPipelineLayout, _, _>(h, |pl| &pl.0 as *const _)
        }
        _ => return 0,
    };
    let layout_explicit = match &desc.layout {
        serde_json::Value::Number(_) => true,
        _ => false,
    };
    if layout_explicit && layout_ptr.is_none() {
        return 0;
    }

    let module_ptr = match with_handle::<WGPUShaderModule, _, _>(desc.compute.module, |m| {
        &m.0 as *const ShaderModule
    }) {
        Some(p) => p,
        None => return 0,
    };

    // wgpu 22 requires a non-optional `entry_point: &str`; the spec
    // permits omission, but wgpu picks the unique entry by name when
    // the shader has exactly one. Default to `"main"` (the canonical
    // WGSL entry name) to mirror that behaviour.
    let entry_point = desc.compute.entry_point.as_deref().unwrap_or("main");

    with_handle_unlocked::<WGPUDevice, _, _>(device_handle, |d| {
        let pipeline = d.0.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
            label: desc.label.as_deref(),
            layout: layout_ptr.map(|p| unsafe { &*p }),
            module: unsafe { &*module_ptr },
            // wgpu 30: `entry_point` became `Option<&str>` (the entry may be
            // inferred from the module). This crate always names one explicitly,
            // matching the spec's required argument.
            entry_point: Some(entry_point),
            compilation_options: wgpu::PipelineCompilationOptions::default(),
            cache: None,
        });
        register_handle(WGPUComputePipeline(pipeline))
    })
    .unwrap_or(0)
}

/// `pipeline.getBindGroupLayout(index) -> GPUBindGroupLayout` —
/// synchronous accessor, useful when the pipeline was created with
/// `layout: "auto"` and the user needs the implicit layout for a
/// matching `createBindGroup`.
#[no_mangle]
pub extern "C" fn js_webgpu_compute_pipeline_get_bind_group_layout(
    pipeline_handle: Handle,
    index: u32,
) -> Handle {
    ffi_trace("js_webgpu_compute_pipeline_get_bind_group_layout");
    with_handle_unlocked::<WGPUComputePipeline, _, _>(pipeline_handle, |p| {
        let bgl = p.0.get_bind_group_layout(index);
        register_handle(WGPUBindGroupLayout(bgl))
    })
    .unwrap_or(0)
}

// ════════════════════════════════════════════════════════════════════
// Command Encoder + Compute Pass
// ════════════════════════════════════════════════════════════════════

/// `device.createCommandEncoder() -> GPUCommandEncoder` — synchronous.
/// v0.1 takes no descriptor; the spec's `label` slot is a v0.2 add.
#[no_mangle]
pub extern "C" fn js_webgpu_device_create_command_encoder(device_handle: Handle) -> Handle {
    ffi_trace("js_webgpu_device_create_command_encoder");
    with_handle_unlocked::<WGPUDevice, _, _>(device_handle, |d| {
        let encoder = d
            .0
            .create_command_encoder(&wgpu::CommandEncoderDescriptor { label: None });
        register_handle(WGPUCommandEncoder(Mutex::new(Some(encoder))))
    })
    .unwrap_or(0)
}

/// `encoder.beginComputePass() -> GPUComputePassEncoder` — synchronous.
/// We use `forget_lifetime()` to detach the pass from its parent
/// encoder's borrow — the registry holds both as 'static-flavoured
/// owned values, and the user is contractually obligated (per spec) to
/// `pass.end()` before `encoder.finish()`.
#[no_mangle]
pub extern "C" fn js_webgpu_command_encoder_begin_compute_pass(
    encoder_handle: Handle,
) -> Handle {
    ffi_trace("js_webgpu_command_encoder_begin_compute_pass");
    with_handle_unlocked::<WGPUCommandEncoder, _, _>(encoder_handle, |ce| {
        let mut slot = ce.0.lock();
        let Some(encoder) = slot.as_mut() else {
            return 0;
        };
        let pass = encoder
            .begin_compute_pass(&wgpu::ComputePassDescriptor {
                label: None,
                timestamp_writes: None,
            })
            .forget_lifetime();
        register_handle(WGPUComputePass(Mutex::new(Some(pass))))
    })
    .unwrap_or(0)
}

/// `encoder.copyBufferToBuffer(src, srcOffset, dst, dstOffset, size)` —
/// synchronous. All offsets and size are in bytes; `size` must be a
/// multiple of 4 per the spec.
#[no_mangle]
pub extern "C" fn js_webgpu_command_encoder_copy_buffer_to_buffer(
    encoder_handle: Handle,
    src: Handle,
    src_offset: f64,
    dst: Handle,
    dst_offset: f64,
    size: f64,
) {
    ffi_trace("js_webgpu_command_encoder_copy_buffer_to_buffer");
    let _ = with_handle::<WGPUCommandEncoder, _, _>(encoder_handle, |ce| {
        let mut slot = ce.0.lock();
        let Some(encoder) = slot.as_mut() else { return };
        // Resolve both buffers; we deliberately don't bail silently if
        // either is unknown — wgpu will surface a validation error via
        // the device's error scope, which is the spec-correct path.
        let _ = with_handle::<WGPUBuffer, _, _>(src, |sb| {
            let _ = with_handle::<WGPUBuffer, _, _>(dst, |db| {
                encoder.copy_buffer_to_buffer(
                    &sb.0,
                    src_offset.max(0.0) as u64,
                    &db.0,
                    dst_offset.max(0.0) as u64,
                    size.max(0.0) as u64,
                );
            });
        });
    });
}

/// `encoder.finish() -> GPUCommandBuffer` — synchronous. Consumes the
/// encoder; subsequent calls on the encoder handle are no-ops.
#[no_mangle]
pub extern "C" fn js_webgpu_command_encoder_finish(encoder_handle: Handle) -> Handle {
    ffi_trace("js_webgpu_command_encoder_finish");
    let out = with_handle_unlocked::<WGPUCommandEncoder, _, _>(encoder_handle, |ce| {
        let encoder = match ce.0.lock().take() {
            Some(e) => e,
            None => return 0,
        };
        let cb = encoder.finish();
        register_handle(WGPUCommandBuffer(Mutex::new(Some(cb))))
    })
    .unwrap_or(0);
    // The encoder payload was taken above; its registry entry is dead weight.
    let _ = take_handle::<WGPUCommandEncoder>(encoder_handle);
    drop_handle(encoder_handle);
    out
}

/// `pass.setPipeline(pipeline)` — synchronous.
#[no_mangle]
pub extern "C" fn js_webgpu_compute_pass_set_pipeline(
    pass_handle: Handle,
    pipeline_handle: Handle,
) {
    ffi_trace("js_webgpu_compute_pass_set_pipeline");
    let _ = with_handle::<WGPUComputePass, _, _>(pass_handle, |cp| {
        let mut slot = cp.0.lock();
        let Some(pass) = slot.as_mut() else { return };
        let _ = with_handle::<WGPUComputePipeline, _, _>(pipeline_handle, |p| {
            pass.set_pipeline(&p.0);
        });
    });
}

/// `pass.setBindGroup(index, bindGroup, dynamicOffsets?)` —
/// synchronous. Dynamic offsets are deferred to v0.2; v0.1 takes
/// `&[]`.
#[no_mangle]
pub extern "C" fn js_webgpu_compute_pass_set_bind_group(
    pass_handle: Handle,
    index: u32,
    bind_group_handle: Handle,
) {
    ffi_trace("js_webgpu_compute_pass_set_bind_group");
    let _ = with_handle::<WGPUComputePass, _, _>(pass_handle, |cp| {
        let mut slot = cp.0.lock();
        let Some(pass) = slot.as_mut() else { return };
        let _ = with_handle::<WGPUBindGroup, _, _>(bind_group_handle, |bg| {
            pass.set_bind_group(index, &bg.0, &[]);
        });
    });
}

/// `pass.dispatchWorkgroups(x, y?, z?)` — synchronous. `y` and `z`
/// default to 1 in the spec; here the caller passes 1 explicitly when
/// omitting (TS-level wrapper handles the default).
#[no_mangle]
pub extern "C" fn js_webgpu_compute_pass_dispatch_workgroups(
    pass_handle: Handle,
    x: u32,
    y: u32,
    z: u32,
) {
    ffi_trace("js_webgpu_compute_pass_dispatch_workgroups");
    let _ = with_handle::<WGPUComputePass, _, _>(pass_handle, |cp| {
        let mut slot = cp.0.lock();
        let Some(pass) = slot.as_mut() else { return };
        pass.dispatch_workgroups(x.max(1), y.max(1), z.max(1));
    });
}

/// `pass.end()` — synchronous. After `end()` the pass handle is
/// effectively dead; subsequent set/dispatch calls are no-ops.
#[no_mangle]
pub extern "C" fn js_webgpu_compute_pass_end(pass_handle: Handle) {
    ffi_trace("js_webgpu_compute_pass_end");
    let _ = take_handle::<WGPUComputePass>(pass_handle);
    drop_handle(pass_handle);
}

// ════════════════════════════════════════════════════════════════════
// Queue
// ════════════════════════════════════════════════════════════════════

/// `queue.submit(commandBuffers) -> undefined` — synchronous.
/// `command_buffers_json` is a JSON array of numeric handles, e.g.
/// `"[123, 456]"`. Each handle is consumed (taken) — submitting twice
/// is a spec error.
///
/// # Safety
///
/// `command_buffers_json_ptr` must be a Perry-runtime `StringHeader`.
#[no_mangle]
pub unsafe extern "C" fn js_webgpu_queue_submit(
    queue_handle: Handle,
    command_buffers_json_ptr: *const StringHeader,
) {
    ffi_trace("js_webgpu_queue_submit");
    let Some(json) = read_str(command_buffers_json_ptr) else {
        return;
    };
    let handles: Vec<i64> = match serde_json::from_str(&json) {
        Ok(v) => v,
        Err(_) => return,
    };

    // Take each command buffer out of its slot (consuming the handle).
    let mut buffers: Vec<CommandBuffer> = Vec::with_capacity(handles.len());
    for h in handles.iter() {
        let mut taken = None;
        let _ = with_handle::<WGPUCommandBuffer, _, _>(*h, |cb| {
            taken = cb.0.lock().take();
        });
        if let Some(cb) = taken {
            buffers.push(cb);
        }
        // The payload was consumed above; reclaim the registry entry.
        let _ = take_handle::<WGPUCommandBuffer>(*h);
        drop_handle(*h);
    }

    let _ = with_handle::<WGPUQueue, _, _>(queue_handle, |q| {
        q.queue.submit(buffers);
    });
}

/// `queue.writeBuffer(buffer, bufferOffset, data) -> undefined` —
/// synchronous. `data` is a Perry-runtime `Buffer` or `Uint8Array`;
/// the bytes are copied into the staging path — no aliasing with the
/// caller's data once this returns.
///
/// # Safety
///
/// `data_ptr` must be null or a Perry-runtime `BufferHeader`.
#[no_mangle]
pub unsafe extern "C" fn js_webgpu_queue_write_buffer(
    queue_handle: Handle,
    buffer_handle: Handle,
    buffer_offset: f64,
    data_ptr: *const BufferHeader,
) {
    ffi_trace("js_webgpu_queue_write_buffer");
    let Some(bytes) = perry_ffi::read_buffer_bytes(data_ptr) else {
        return;
    };

    // Trace BEFORE any early return: the alignment guard below bails out, and
    // when the trace ran after it the offending call left no record at all
    // (only the guard's message, with no offset/buffer context).
    if std::env::var_os("PERRY_WEBGPU_TRACE").is_some() {
        let head: String = bytes
            .iter()
            .take(16)
            .map(|b| format!("{b:02x}"))
            .collect::<Vec<_>>()
            .join(" ");
        let ascii: String = bytes
            .iter()
            .take(16)
            .map(|&b| if (0x20..0x7f).contains(&b) { b as char } else { '.' })
            .collect();
        eprintln!(
            "[webgpu]   queue_write_buffer buffer={} offset={} len={} len%4={} head=[{head}] ascii=\"{ascii}\"",
            buffer_handle,
            buffer_offset,
            bytes.len(),
            bytes.len() % 4
        );
    }

    // wgpu (like the browser spec) requires the copy size to be a multiple of
    // `COPY_BUFFER_ALIGNMENT` (4). Letting a violation through reaches
    // wgpu-core's validation, which PANICS — and because this runs on a runtime
    // thread that cannot unwind, the panic aborts the whole process with only
    // "Copy size N does not respect COPY_BUFFER_ALIGNMENT" to go on.
    //
    // A browser throws a catchable TypeError here instead. Match that severity
    // rather than wgpu's: report precisely which call was malformed, then skip
    // it. Skipping is the honest option — the caller computed a range that is
    // not representable in any buffer format, so there are no correct bytes to
    // write. Truncating up would write past the caller's intent; truncating
    // down would silently drop a partial element.
    if bytes.len() % 4 != 0 {
        eprintln!(
            "webgpu queueWriteBuffer: refusing to write {} bytes (not a multiple of 4) \
             to buffer handle {} at offset {}. The caller sliced a source buffer on a \
             non-4-aligned boundary and ran past its end — check the (dataOffset, size) \
             pair against the source's byteLength. Re-run with PERRY_WEBGPU_TRACE=1 for \
             the surrounding call sequence.",
            bytes.len(),
            buffer_handle,
            buffer_offset.max(0.0) as u64,
        );
        return;
    }

    if std::env::var_os("PERRY_WEBGPU_TRACE").is_some() {
        let head: String = bytes
            .iter()
            .take(16)
            .map(|b| format!("{b:02x}"))
            .collect::<Vec<_>>()
            .join(" ");
        let ascii: String = bytes
            .iter()
            .take(16)
            .map(|&b| if (0x20..0x7f).contains(&b) { b as char } else { '.' })
            .collect();
        eprintln!(
            "[webgpu]   queue_write_buffer offset={} len={} len%4={} head=[{head}] ascii=\"{ascii}\"",
            buffer_offset,
            bytes.len(),
            bytes.len() % 4
        );
    }
    let _ = with_handle::<WGPUQueue, _, _>(queue_handle, |q| {
        let _ = with_handle::<WGPUBuffer, _, _>(buffer_handle, |b| {
            q.queue
                .write_buffer(&b.0, buffer_offset.max(0.0) as u64, bytes);
        });
    });
}

/// `queue.onSubmittedWorkDone() -> Promise<undefined>` — resolves once
/// every command buffer submitted to this queue *before* this call
/// has finished executing. We use wgpu's `Queue::on_submitted_work_done`
/// callback to capture the "before this call" snapshot, then poll the
/// queue's parent device (tracked on the queue wrapper since v0.2) so
/// the callback actually fires.
#[no_mangle]
pub extern "C" fn js_webgpu_queue_on_submitted_work_done(queue_handle: Handle) -> *mut Promise {
    ffi_trace("js_webgpu_queue_on_submitted_work_done");
    let promise = JsPromise::new();
    let raw = promise.as_raw();

    spawn_blocking(move || {
        // Snapshot: drop a parking-lot sentinel into the
        // on_submitted_work_done callback so we know when wgpu has
        // signalled completion.
        let done: std::sync::Arc<Mutex<bool>> = std::sync::Arc::new(Mutex::new(false));
        let done2 = done.clone();
        let device_handle = match with_handle::<WGPUQueue, _, _>(queue_handle, |q| {
            q.queue.on_submitted_work_done(move || {
                *done2.lock() = true;
            });
            q.device_handle
        }) {
            Some(h) => h,
            None => {
                promise.reject_string("webgpu onSubmittedWorkDone: invalid queue handle");
                return;
            }
        };

        // Pump the device until the callback fires. Mirrors the
        // mapAsync poll loop — same hard ceiling so a buggy caller
        // can't hang the worker forever.
        let mut spins = 0u32;
        loop {
            if *done.lock() {
                break;
            }
            let _ = with_handle::<WGPUDevice, _, _>(device_handle, |d| {
                // wgpu 30: `Maintain::Poll` → `PollType::Poll`. `poll` now
                // returns `Result<PollStatus, PollError>`; the spin loop only
                // needs the driver to have made progress, so the result is
                // deliberately dropped (a device-lost is reported by the map
                // path itself).
                let _ = d.0.poll(wgpu::PollType::Poll);
            });
            spins += 1;
            if spins > 10_000 {
                promise.reject_string(
                    "webgpu onSubmittedWorkDone: timed out (callback never fired)",
                );
                return;
            }
            std::thread::sleep(std::time::Duration::from_micros(100));
        }
        promise.resolve_undefined();
    });
    raw
}

/// `device.poll() -> undefined` — synchronous. Not in the WebGPU spec
/// (browsers poll implicitly via the event loop), but native runtimes
/// must call this between `mapAsync` and the get/unmap cycle so the
/// driver progresses the queue. Equivalent to wgpu's
/// `device.poll(Maintain::Wait)`.
#[no_mangle]
pub extern "C" fn js_webgpu_device_poll(device_handle: Handle) {
    ffi_trace("js_webgpu_device_poll");
    let _ = with_handle::<WGPUDevice, _, _>(device_handle, |d| {
        // wgpu 30: `Maintain::Wait` → `PollType::wait_indefinitely()` — the `Wait`
        // variant now carries `submission_index` + `timeout`, and this call wants
        // the old semantics (block until the most recent submission completes and
        // its callbacks fire). Returns `Result<PollStatus, PollError>`; a device
        // loss surfaces on the subsequent getMappedRange/unmap, so the result is
        // dropped here.
        let _ = d.0.poll(wgpu::PollType::wait_indefinitely());
    });
}

// ════════════════════════════════════════════════════════════════════
// Errors / introspection (v0.1 stubs)
// ════════════════════════════════════════════════════════════════════

fn parse_error_filter(s: &str) -> wgpu::ErrorFilter {
    match s {
        "out-of-memory" => wgpu::ErrorFilter::OutOfMemory,
        "internal" => wgpu::ErrorFilter::Internal,
        // Spec: "validation" is the default, and the parser is
        // permissive — anything unrecognised falls through here.
        _ => wgpu::ErrorFilter::Validation,
    }
}

/// `device.pushErrorScope(filter) -> undefined` — synchronous. Filter
/// is `"validation"` (default) / `"out-of-memory"` / `"internal"`,
/// matching the spec.
///
/// # Safety
///
/// `filter_ptr` must be null or a Perry-runtime `StringHeader`.
/// Live error-scope guards, innermost last.
///
/// wgpu 30 made `push_error_scope` RAII: it returns an `ErrorScopeGuard`, and
/// **dropping that guard pops the scope and discards whatever it captured**.
/// The previous call ignored the return value, which under the new API is
/// equivalent to never having scoped anything at all. The guard is `!Send` /
/// `!Sync` — wgpu scopes are per-thread by design — so this stack is
/// thread-local and push/pop must happen on the same thread, which is exactly
/// how the WebGPU API nests them.
thread_local! {
    static ERROR_SCOPES: std::cell::RefCell<Vec<wgpu::ErrorScopeGuard>> =
        std::cell::RefCell::new(Vec::new());
}

#[no_mangle]
pub unsafe extern "C" fn js_webgpu_device_push_error_scope(
    device_handle: Handle,
    filter_ptr: *const StringHeader,
) {
    ffi_trace("js_webgpu_device_push_error_scope");
    let filter = read_str(filter_ptr).unwrap_or_else(|| "validation".to_string());
    let _ = with_handle::<WGPUDevice, _, _>(device_handle, |d| {
        ERROR_SCOPES.with(|s| s.borrow_mut().push(d.0.push_error_scope(parse_error_filter(&filter))));
    });
}

/// `device.popErrorScope() -> Promise<GPUError | null>` — resolves
/// with a JSON-encoded `{type, message}` describing the captured
/// error, or the empty string when the scope captured nothing (which
/// the call site can map to `null`, matching the spec).
///
/// `wgpu::Device::pop_error_scope()` returns a future; we bridge it
/// through `spawn_blocking` + `block_on` like every other async path
/// in this crate.
#[no_mangle]
pub extern "C" fn js_webgpu_device_pop_error_scope(device_handle: Handle) -> *mut Promise {
    ffi_trace("js_webgpu_device_pop_error_scope");
    let promise = JsPromise::new();
    let raw = promise.as_raw();
    // Validate the handle up front: the guard is not keyed by handle, so taking
    // one for a rejected call would silently consume someone else's scope.
    if with_handle::<WGPUDevice, _, _>(device_handle, |_| ()).is_none() {
        promise.reject_string("webgpu popErrorScope: invalid device handle");
        return raw;
    }
    // wgpu 30 replaced `Device::pop_error_scope()` with
    // `ErrorScopeGuard::pop(self) -> impl Future<Output = Option<Error>>`. The
    // guard is `!Send` and lives on this thread's stack (see `ERROR_SCOPES`), so
    // the pop cannot happen on a tokio worker — it happens here, on the thread
    // that pushed. wgpu documents `pop` as taking effect immediately (the future
    // only carries the captured error), so blocking on it does not stall the
    // device.
    let outcome = ERROR_SCOPES
        .with(|s| s.borrow_mut().pop())
        .map(|guard| pollster::block_on(guard.pop()));
    match outcome {
        Some(Some(err)) => {
            // Wrap the error into a `{type, message}` JSON blob —
            // matches the GPUError union the spec uses
            // (GPUValidationError / GPUOutOfMemoryError /
            // GPUInternalError).
            let (kind, msg) = match &err {
                wgpu::Error::OutOfMemory { .. } => ("out-of-memory", err.to_string()),
                wgpu::Error::Validation { .. } => ("validation", err.to_string()),
                wgpu::Error::Internal { .. } => ("internal", err.to_string()),
            };
            let json = format!(
                "{{\"type\":\"{}\",\"message\":{}}}",
                kind,
                serde_json::to_string(&msg).unwrap_or_else(|_| "\"\"".into())
            );
            promise.resolve(alloc_str_value(&json));
        }
        // No error captured, or nothing was pushed at all — the spec's
        // `GPUError | null`, encoded as the empty string.
        Some(None) | None => promise.resolve(alloc_str_value("")),
    }
    raw
}

// ════════════════════════════════════════════════════════════════════
// Texture / TextureView / Sampler
// ════════════════════════════════════════════════════════════════════

#[derive(Deserialize)]
struct Extent3dDesc {
    width: u32,
    #[serde(default = "default_one")]
    height: u32,
    #[serde(rename = "depthOrArrayLayers", default = "default_one")]
    depth_or_array_layers: u32,
}
fn default_one() -> u32 {
    1
}

#[derive(Deserialize)]
struct TextureDescriptor {
    #[serde(default)]
    label: Option<String>,
    size: Extent3dDesc,
    #[serde(rename = "mipLevelCount", default = "default_one")]
    mip_level_count: u32,
    #[serde(rename = "sampleCount", default = "default_one")]
    sample_count: u32,
    #[serde(default)]
    dimension: Option<String>,
    format: String,
    usage: u32,
    #[serde(rename = "viewFormats", default)]
    view_formats: Vec<String>,
}

fn parse_texture_dimension(s: Option<&str>) -> wgpu::TextureDimension {
    match s.unwrap_or("2d") {
        "1d" => wgpu::TextureDimension::D1,
        "3d" => wgpu::TextureDimension::D3,
        _ => wgpu::TextureDimension::D2,
    }
}

/// `device.createTexture(descriptor) -> GPUTexture` — synchronous.
///
/// # Safety
///
/// `descriptor_ptr` must be a Perry-runtime `StringHeader`.
#[no_mangle]
pub unsafe extern "C" fn js_webgpu_device_create_texture(
    device_handle: Handle,
    descriptor_ptr: *const StringHeader,
) -> Handle {
    ffi_trace("js_webgpu_device_create_texture");
    let Some(json) = read_str(descriptor_ptr) else {
        return 0;
    };
    let desc: TextureDescriptor = match serde_json::from_str(&json) {
        Ok(d) => d,
        Err(_) => return 0,
    };

    with_handle_unlocked::<WGPUDevice, _, _>(device_handle, |d| {
        let view_formats: Vec<wgpu::TextureFormat> = desc
            .view_formats
            .iter()
            .map(|s| parse_texture_format(s))
            .collect();
        let texture = d.0.create_texture(&wgpu::TextureDescriptor {
            label: desc.label.as_deref(),
            size: wgpu::Extent3d {
                width: desc.size.width,
                height: desc.size.height,
                depth_or_array_layers: desc.size.depth_or_array_layers,
            },
            mip_level_count: desc.mip_level_count.max(1),
            sample_count: desc.sample_count.max(1),
            dimension: parse_texture_dimension(desc.dimension.as_deref()),
            format: parse_texture_format(&desc.format),
            usage: wgpu::TextureUsages::from_bits_truncate(desc.usage),
            view_formats: &view_formats,
        });
        register_handle(WGPUTexture(texture))
    })
    .unwrap_or(0)
}

#[derive(Deserialize, Default)]
struct TextureViewDescriptor {
    #[serde(default)]
    label: Option<String>,
    #[serde(default)]
    format: Option<String>,
    #[serde(rename = "dimension", default)]
    dimension: Option<String>,
    #[serde(rename = "aspect", default)]
    aspect: Option<String>,
    #[serde(rename = "baseMipLevel", default)]
    base_mip_level: u32,
    #[serde(rename = "mipLevelCount", default)]
    mip_level_count: u32,
    #[serde(rename = "baseArrayLayer", default)]
    base_array_layer: u32,
    #[serde(rename = "arrayLayerCount", default)]
    array_layer_count: u32,
}

fn parse_texture_aspect(s: Option<&str>) -> wgpu::TextureAspect {
    match s.unwrap_or("all") {
        "stencil-only" => wgpu::TextureAspect::StencilOnly,
        "depth-only" => wgpu::TextureAspect::DepthOnly,
        _ => wgpu::TextureAspect::All,
    }
}

/// `texture.createView(descriptor?) -> GPUTextureView` — synchronous.
/// `descriptor_ptr` may be null/empty for a default view (most common
/// case when binding the whole texture as a render attachment).
///
/// # Safety
///
/// `descriptor_ptr` must be null or a Perry-runtime `StringHeader`.
#[no_mangle]
pub unsafe extern "C" fn js_webgpu_texture_create_view(
    texture_handle: Handle,
    descriptor_ptr: *const StringHeader,
) -> Handle {
    ffi_trace("js_webgpu_texture_create_view");
    let parsed: TextureViewDescriptor = match read_str(descriptor_ptr) {
        Some(json) if !json.is_empty() => serde_json::from_str(&json).unwrap_or_default(),
        _ => TextureViewDescriptor::default(),
    };

    // Build + register a view from whichever texture the handle names.
    let make = |tex: &wgpu::Texture| -> Handle {
        let view = tex.create_view(&wgpu::TextureViewDescriptor {
            label: parsed.label.as_deref(),
            format: parsed.format.as_deref().map(parse_texture_format),
            // wgpu 30: a view may narrow the texture's usage. `None` means
            // "inherit every usage of the texture", which is what a spec-faithful
            // `createView()` does when the descriptor omits it.
            usage: None,
            dimension: parsed
                .dimension
                .as_deref()
                .map(|s| parse_view_dimension(Some(s))),
            aspect: parse_texture_aspect(parsed.aspect.as_deref()),
            base_mip_level: parsed.base_mip_level,
            mip_level_count: if parsed.mip_level_count == 0 {
                None
            } else {
                Some(parsed.mip_level_count)
            },
            base_array_layer: parsed.base_array_layer,
            array_layer_count: if parsed.array_layer_count == 0 {
                None
            } else {
                Some(parsed.array_layer_count)
            },
        });
        register_handle(WGPUTextureView(view))
    };

    // A normal device texture.
    //
    // `get_handle` hands back a `'static` borrow and releases the registry
    // guard before returning. That is what makes it correct to call `make`
    // (which ends in `register_handle`) from here: an insert into the registry
    // must never happen while a registry guard is held. The original code used
    // `with_handle`, which holds a shard read-lock for the whole closure, and
    // nested a second `with_handle` inside it — so this call hung whenever the
    // new view's handle hashed to one of those shards. That is a probabilistic
    // stall (a dozen frames in, with no Metal frame on the stack), which is why
    // it read as a GPU problem rather than a lock ordering bug.
    if let Some(t) = get_handle::<WGPUTexture>(texture_handle) {
        return make(&t.0);
    }

    // A swapchain texture from `surfaceGetCurrentTexture` — the live
    // `SurfaceTexture` lives on the surface (it isn't cloneable), so borrow it
    // back through the parent handle.
    let surface_handle = match get_handle::<WGPUSurfaceTexture>(texture_handle) {
        Some(st) => st.surface_handle,
        None => return 0,
    };

    match get_handle::<WGPUSurface>(surface_handle) {
        Some(s) => s
            .current
            .lock()
            .as_ref()
            .map(|frame| make(&frame.texture))
            .unwrap_or(0),
        None => 0,
    }
}

/// `texture.destroy()` — release the GPU memory. Idempotent.
#[no_mangle]
pub extern "C" fn js_webgpu_texture_destroy(texture_handle: Handle) {
    ffi_trace("js_webgpu_texture_destroy");
    let _ = take_handle::<WGPUTexture>(texture_handle);
    drop_handle(texture_handle);
}

/// Release a texture view handle.
///
/// Without this the per-frame `createView` handle (and the swapchain texture
/// it keeps alive) is never reclaimed, so the CAMetalLayer drawable pool
/// (`maximumDrawableCount = desired_maximum_frame_latency + 1`) drains and the
/// next `Surface::get_current_texture()` blocks the calling thread forever.
#[no_mangle]
pub extern "C" fn js_webgpu_texture_view_destroy(view_handle: Handle) {
    ffi_trace("js_webgpu_texture_view_destroy");
    let _ = take_handle::<WGPUTextureView>(view_handle);
    drop_handle(view_handle);
}

#[derive(Deserialize, Default)]
struct SamplerDescriptor {
    #[serde(default)]
    label: Option<String>,
    #[serde(rename = "addressModeU", default)]
    address_mode_u: Option<String>,
    #[serde(rename = "addressModeV", default)]
    address_mode_v: Option<String>,
    #[serde(rename = "addressModeW", default)]
    address_mode_w: Option<String>,
    #[serde(rename = "magFilter", default)]
    mag_filter: Option<String>,
    #[serde(rename = "minFilter", default)]
    min_filter: Option<String>,
    #[serde(rename = "mipmapFilter", default)]
    mipmap_filter: Option<String>,
    #[serde(rename = "lodMinClamp", default)]
    lod_min_clamp: f32,
    #[serde(rename = "lodMaxClamp", default = "default_lod_max")]
    lod_max_clamp: f32,
    #[serde(default)]
    compare: Option<String>,
    #[serde(rename = "maxAnisotropy", default = "default_one")]
    max_anisotropy: u32,
}
fn default_lod_max() -> f32 {
    32.0
}

fn parse_address_mode(s: Option<&str>) -> wgpu::AddressMode {
    match s.unwrap_or("clamp-to-edge") {
        "repeat" => wgpu::AddressMode::Repeat,
        "mirror-repeat" => wgpu::AddressMode::MirrorRepeat,
        _ => wgpu::AddressMode::ClampToEdge,
    }
}

fn parse_filter_mode(s: Option<&str>) -> wgpu::FilterMode {
    match s.unwrap_or("nearest") {
        "linear" => wgpu::FilterMode::Linear,
        _ => wgpu::FilterMode::Nearest,
    }
}

/// wgpu 30 split the sampler's mip filter out of `FilterMode` into its own
/// `MipmapFilterMode` — the same two modes under a separate type.
fn parse_mipmap_filter_mode(s: Option<&str>) -> wgpu::MipmapFilterMode {
    match s.unwrap_or("nearest") {
        "linear" => wgpu::MipmapFilterMode::Linear,
        _ => wgpu::MipmapFilterMode::Nearest,
    }
}

fn parse_compare_function(s: &str) -> wgpu::CompareFunction {
    match s {
        "never" => wgpu::CompareFunction::Never,
        "less" => wgpu::CompareFunction::Less,
        "equal" => wgpu::CompareFunction::Equal,
        "less-equal" => wgpu::CompareFunction::LessEqual,
        "greater" => wgpu::CompareFunction::Greater,
        "not-equal" => wgpu::CompareFunction::NotEqual,
        "greater-equal" => wgpu::CompareFunction::GreaterEqual,
        _ => wgpu::CompareFunction::Always,
    }
}

/// `device.createSampler(descriptor?) -> GPUSampler` — synchronous.
/// All fields are optional; defaults match the spec (clamp-to-edge,
/// nearest, no compare, anisotropy 1).
///
/// # Safety
///
/// `descriptor_ptr` must be null or a Perry-runtime `StringHeader`.
#[no_mangle]
pub unsafe extern "C" fn js_webgpu_device_create_sampler(
    device_handle: Handle,
    descriptor_ptr: *const StringHeader,
) -> Handle {
    ffi_trace("js_webgpu_device_create_sampler");
    let desc: SamplerDescriptor = match read_str(descriptor_ptr) {
        Some(json) if !json.is_empty() => serde_json::from_str(&json).unwrap_or_default(),
        _ => SamplerDescriptor::default(),
    };

    with_handle_unlocked::<WGPUDevice, _, _>(device_handle, |d| {
        let sampler = d.0.create_sampler(&wgpu::SamplerDescriptor {
            label: desc.label.as_deref(),
            address_mode_u: parse_address_mode(desc.address_mode_u.as_deref()),
            address_mode_v: parse_address_mode(desc.address_mode_v.as_deref()),
            address_mode_w: parse_address_mode(desc.address_mode_w.as_deref()),
            mag_filter: parse_filter_mode(desc.mag_filter.as_deref()),
            min_filter: parse_filter_mode(desc.min_filter.as_deref()),
            mipmap_filter: parse_mipmap_filter_mode(desc.mipmap_filter.as_deref()),
            lod_min_clamp: desc.lod_min_clamp,
            lod_max_clamp: desc.lod_max_clamp,
            compare: desc.compare.as_deref().map(parse_compare_function),
            anisotropy_clamp: desc.max_anisotropy.max(1) as u16,
            border_color: None,
        });
        register_handle(WGPUSampler(sampler))
    })
    .unwrap_or(0)
}

// ════════════════════════════════════════════════════════════════════
// Render Pipeline
// ════════════════════════════════════════════════════════════════════

#[derive(Deserialize)]
struct VertexAttributeDesc {
    format: String,
    offset: u64,
    #[serde(rename = "shaderLocation")]
    shader_location: u32,
}

#[derive(Deserialize)]
struct VertexBufferLayoutDesc {
    #[serde(rename = "arrayStride")]
    array_stride: u64,
    #[serde(rename = "stepMode", default)]
    step_mode: Option<String>,
    attributes: Vec<VertexAttributeDesc>,
}

#[derive(Deserialize)]
struct VertexStateDesc {
    module: i64,
    #[serde(rename = "entryPoint", default)]
    entry_point: Option<String>,
    #[serde(default)]
    buffers: Vec<VertexBufferLayoutDesc>,
}

#[derive(Deserialize, Default)]
struct PrimitiveStateDesc {
    #[serde(default)]
    topology: Option<String>,
    #[serde(rename = "stripIndexFormat", default)]
    strip_index_format: Option<String>,
    #[serde(rename = "frontFace", default)]
    front_face: Option<String>,
    #[serde(rename = "cullMode", default)]
    cull_mode: Option<String>,
}

#[derive(Deserialize)]
struct StencilFaceStateDesc {
    #[serde(default)]
    compare: Option<String>,
    #[serde(rename = "failOp", default)]
    fail_op: Option<String>,
    #[serde(rename = "depthFailOp", default)]
    depth_fail_op: Option<String>,
    #[serde(rename = "passOp", default)]
    pass_op: Option<String>,
}

#[derive(Deserialize)]
struct DepthStencilStateDesc {
    format: String,
    #[serde(rename = "depthWriteEnabled", default)]
    depth_write_enabled: bool,
    #[serde(rename = "depthCompare", default)]
    depth_compare: Option<String>,
    #[serde(rename = "stencilFront", default)]
    stencil_front: Option<StencilFaceStateDesc>,
    #[serde(rename = "stencilBack", default)]
    stencil_back: Option<StencilFaceStateDesc>,
    #[serde(rename = "stencilReadMask", default = "default_stencil_mask")]
    stencil_read_mask: u32,
    #[serde(rename = "stencilWriteMask", default = "default_stencil_mask")]
    stencil_write_mask: u32,
    #[serde(rename = "depthBias", default)]
    depth_bias: i32,
    #[serde(rename = "depthBiasSlopeScale", default)]
    depth_bias_slope_scale: f32,
    #[serde(rename = "depthBiasClamp", default)]
    depth_bias_clamp: f32,
}
fn default_stencil_mask() -> u32 {
    0xFFFF_FFFF
}

#[derive(Deserialize, Default)]
struct MultisampleStateDesc {
    #[serde(default = "default_one")]
    count: u32,
    #[serde(default = "default_mask_u64")]
    mask: u64,
    #[serde(rename = "alphaToCoverageEnabled", default)]
    alpha_to_coverage_enabled: bool,
}
fn default_mask_u64() -> u64 {
    !0u64
}

#[derive(Deserialize)]
struct BlendComponentDesc {
    #[serde(rename = "srcFactor", default)]
    src_factor: Option<String>,
    #[serde(rename = "dstFactor", default)]
    dst_factor: Option<String>,
    #[serde(default)]
    operation: Option<String>,
}

#[derive(Deserialize)]
struct BlendStateDesc {
    color: BlendComponentDesc,
    alpha: BlendComponentDesc,
}

#[derive(Deserialize)]
struct ColorTargetStateDesc {
    format: String,
    #[serde(default)]
    blend: Option<BlendStateDesc>,
    #[serde(rename = "writeMask", default = "default_write_mask_u32")]
    write_mask: u32,
}
fn default_write_mask_u32() -> u32 {
    0xF
}

#[derive(Deserialize)]
struct FragmentStateDesc {
    module: i64,
    #[serde(rename = "entryPoint", default)]
    entry_point: Option<String>,
    targets: Vec<Option<ColorTargetStateDesc>>,
}

#[derive(Deserialize)]
struct RenderPipelineDescriptor {
    #[serde(default)]
    label: Option<String>,
    layout: serde_json::Value,
    vertex: VertexStateDesc,
    #[serde(default)]
    primitive: PrimitiveStateDesc,
    #[serde(rename = "depthStencil", default)]
    depth_stencil: Option<DepthStencilStateDesc>,
    #[serde(default)]
    multisample: MultisampleStateDesc,
    #[serde(default)]
    fragment: Option<FragmentStateDesc>,
}

fn parse_vertex_format(s: &str) -> wgpu::VertexFormat {
    use wgpu::VertexFormat::*;
    match s {
        "uint8x2" => Uint8x2,
        "uint8x4" => Uint8x4,
        "sint8x2" => Sint8x2,
        "sint8x4" => Sint8x4,
        "unorm8x2" => Unorm8x2,
        "unorm8x4" => Unorm8x4,
        "snorm8x2" => Snorm8x2,
        "snorm8x4" => Snorm8x4,
        "uint16x2" => Uint16x2,
        "uint16x4" => Uint16x4,
        "sint16x2" => Sint16x2,
        "sint16x4" => Sint16x4,
        "unorm16x2" => Unorm16x2,
        "unorm16x4" => Unorm16x4,
        "snorm16x2" => Snorm16x2,
        "snorm16x4" => Snorm16x4,
        "float16x2" => Float16x2,
        "float16x4" => Float16x4,
        "float32" => Float32,
        "float32x2" => Float32x2,
        "float32x3" => Float32x3,
        "float32x4" => Float32x4,
        "uint32" => Uint32,
        "uint32x2" => Uint32x2,
        "uint32x3" => Uint32x3,
        "uint32x4" => Uint32x4,
        "sint32" => Sint32,
        "sint32x2" => Sint32x2,
        "sint32x3" => Sint32x3,
        "sint32x4" => Sint32x4,
        // Fallback for unknown — same defaulting strategy as
        // texture-format parsing; v0.3 will harden this.
        _ => Float32,
    }
}

fn parse_step_mode(s: Option<&str>) -> wgpu::VertexStepMode {
    match s.unwrap_or("vertex") {
        "instance" => wgpu::VertexStepMode::Instance,
        _ => wgpu::VertexStepMode::Vertex,
    }
}

fn parse_topology(s: Option<&str>) -> wgpu::PrimitiveTopology {
    match s.unwrap_or("triangle-list") {
        "point-list" => wgpu::PrimitiveTopology::PointList,
        "line-list" => wgpu::PrimitiveTopology::LineList,
        "line-strip" => wgpu::PrimitiveTopology::LineStrip,
        "triangle-strip" => wgpu::PrimitiveTopology::TriangleStrip,
        _ => wgpu::PrimitiveTopology::TriangleList,
    }
}

fn parse_index_format(s: &str) -> wgpu::IndexFormat {
    match s {
        "uint16" => wgpu::IndexFormat::Uint16,
        _ => wgpu::IndexFormat::Uint32,
    }
}

fn parse_front_face(s: Option<&str>) -> wgpu::FrontFace {
    match s.unwrap_or("ccw") {
        "cw" => wgpu::FrontFace::Cw,
        _ => wgpu::FrontFace::Ccw,
    }
}

fn parse_cull_mode(s: Option<&str>) -> Option<wgpu::Face> {
    match s.unwrap_or("none") {
        "front" => Some(wgpu::Face::Front),
        "back" => Some(wgpu::Face::Back),
        _ => None,
    }
}

fn parse_blend_factor(s: Option<&str>) -> wgpu::BlendFactor {
    match s.unwrap_or("one") {
        "zero" => wgpu::BlendFactor::Zero,
        "src" => wgpu::BlendFactor::Src,
        "one-minus-src" => wgpu::BlendFactor::OneMinusSrc,
        "src-alpha" => wgpu::BlendFactor::SrcAlpha,
        "one-minus-src-alpha" => wgpu::BlendFactor::OneMinusSrcAlpha,
        "dst" => wgpu::BlendFactor::Dst,
        "one-minus-dst" => wgpu::BlendFactor::OneMinusDst,
        "dst-alpha" => wgpu::BlendFactor::DstAlpha,
        "one-minus-dst-alpha" => wgpu::BlendFactor::OneMinusDstAlpha,
        "src-alpha-saturated" => wgpu::BlendFactor::SrcAlphaSaturated,
        "constant" => wgpu::BlendFactor::Constant,
        "one-minus-constant" => wgpu::BlendFactor::OneMinusConstant,
        _ => wgpu::BlendFactor::One,
    }
}

fn parse_blend_op(s: Option<&str>) -> wgpu::BlendOperation {
    match s.unwrap_or("add") {
        "subtract" => wgpu::BlendOperation::Subtract,
        "reverse-subtract" => wgpu::BlendOperation::ReverseSubtract,
        "min" => wgpu::BlendOperation::Min,
        "max" => wgpu::BlendOperation::Max,
        _ => wgpu::BlendOperation::Add,
    }
}

fn parse_blend_component(c: &BlendComponentDesc) -> wgpu::BlendComponent {
    wgpu::BlendComponent {
        src_factor: parse_blend_factor(c.src_factor.as_deref()),
        dst_factor: parse_blend_factor(c.dst_factor.as_deref()),
        operation: parse_blend_op(c.operation.as_deref()),
    }
}

fn parse_stencil_op(s: Option<&str>) -> wgpu::StencilOperation {
    match s.unwrap_or("keep") {
        "zero" => wgpu::StencilOperation::Zero,
        "replace" => wgpu::StencilOperation::Replace,
        "invert" => wgpu::StencilOperation::Invert,
        "increment-clamp" => wgpu::StencilOperation::IncrementClamp,
        "decrement-clamp" => wgpu::StencilOperation::DecrementClamp,
        "increment-wrap" => wgpu::StencilOperation::IncrementWrap,
        "decrement-wrap" => wgpu::StencilOperation::DecrementWrap,
        _ => wgpu::StencilOperation::Keep,
    }
}

fn parse_stencil_face(s: &Option<StencilFaceStateDesc>) -> wgpu::StencilFaceState {
    match s {
        Some(f) => wgpu::StencilFaceState {
            compare: f
                .compare
                .as_deref()
                .map(parse_compare_function)
                .unwrap_or(wgpu::CompareFunction::Always),
            fail_op: parse_stencil_op(f.fail_op.as_deref()),
            depth_fail_op: parse_stencil_op(f.depth_fail_op.as_deref()),
            pass_op: parse_stencil_op(f.pass_op.as_deref()),
        },
        None => wgpu::StencilFaceState::IGNORE,
    }
}

/// Build a `RenderPipeline` from a parsed descriptor, given the
/// already-resolved layout / vertex-module / fragment-module
/// pointers. Shared by the sync + async create paths.
unsafe fn build_render_pipeline(
    device: &wgpu::Device,
    desc: &RenderPipelineDescriptor,
    layout_ptr: Option<*const PipelineLayout>,
    vertex_module_ptr: *const ShaderModule,
    fragment_module_ptr: Option<*const ShaderModule>,
) -> wgpu::RenderPipeline {
    // Vertex buffers: collect attributes per-buffer first (they need
    // to outlive the `&` borrow inside `VertexBufferLayout`).
    let attrs_per_buffer: Vec<Vec<wgpu::VertexAttribute>> = desc
        .vertex
        .buffers
        .iter()
        .map(|b| {
            b.attributes
                .iter()
                .map(|a| wgpu::VertexAttribute {
                    format: parse_vertex_format(&a.format),
                    offset: a.offset,
                    shader_location: a.shader_location,
                })
                .collect()
        })
        .collect();
    // wgpu 30: `VertexState::buffers` is `&[Option<VertexBufferLayout>]` — a
    // slot may be left empty ("sparse" layout), which lets several pipelines
    // keep the same buffer bindings. Every buffer the descriptor lists is
    // bound here, so each becomes `Some`.
    let vertex_buffers: Vec<Option<wgpu::VertexBufferLayout>> = desc
        .vertex
        .buffers
        .iter()
        .enumerate()
        .map(|(i, b)| {
            Some(wgpu::VertexBufferLayout {
                array_stride: b.array_stride,
                step_mode: parse_step_mode(b.step_mode.as_deref()),
                attributes: &attrs_per_buffer[i],
            })
        })
        .collect();

    let vertex_entry = desc
        .vertex
        .entry_point
        .as_deref()
        .unwrap_or("vs_main");

    let primitive = wgpu::PrimitiveState {
        topology: parse_topology(desc.primitive.topology.as_deref()),
        strip_index_format: desc
            .primitive
            .strip_index_format
            .as_deref()
            .map(parse_index_format),
        front_face: parse_front_face(desc.primitive.front_face.as_deref()),
        cull_mode: parse_cull_mode(desc.primitive.cull_mode.as_deref()),
        unclipped_depth: false,
        polygon_mode: wgpu::PolygonMode::Fill,
        conservative: false,
    };

    let depth_stencil = desc.depth_stencil.as_ref().map(|ds| wgpu::DepthStencilState {
        format: parse_texture_format(&ds.format),
        // wgpu 30: both fields became `Option` — `None` means "no depth
        // writes" / "no depth test". The descriptor's historical defaults
        // (write enabled, compare `Always`) stay in effect by filling them in.
        depth_write_enabled: Some(ds.depth_write_enabled),
        depth_compare: Some(
            ds.depth_compare
                .as_deref()
                .map(parse_compare_function)
                .unwrap_or(wgpu::CompareFunction::Always),
        ),
        stencil: wgpu::StencilState {
            front: parse_stencil_face(&ds.stencil_front),
            back: parse_stencil_face(&ds.stencil_back),
            read_mask: ds.stencil_read_mask,
            write_mask: ds.stencil_write_mask,
        },
        bias: wgpu::DepthBiasState {
            constant: ds.depth_bias,
            slope_scale: ds.depth_bias_slope_scale,
            clamp: ds.depth_bias_clamp,
        },
    });

    let multisample = wgpu::MultisampleState {
        count: desc.multisample.count.max(1),
        mask: desc.multisample.mask,
        alpha_to_coverage_enabled: desc.multisample.alpha_to_coverage_enabled,
    };

    let fragment_targets: Vec<Option<wgpu::ColorTargetState>> = desc
        .fragment
        .as_ref()
        .map(|f| {
            f.targets
                .iter()
                .map(|t| {
                    t.as_ref().map(|t| wgpu::ColorTargetState {
                        format: parse_texture_format(&t.format),
                        blend: t.blend.as_ref().map(|b| wgpu::BlendState {
                            color: parse_blend_component(&b.color),
                            alpha: parse_blend_component(&b.alpha),
                        }),
                        write_mask: wgpu::ColorWrites::from_bits_truncate(t.write_mask),
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    let fragment_entry = desc
        .fragment
        .as_ref()
        .and_then(|f| f.entry_point.as_deref())
        .unwrap_or("fs_main");

    let fragment_state =
        if let (Some(fmp), Some(_)) = (fragment_module_ptr, desc.fragment.as_ref()) {
            Some(wgpu::FragmentState {
                module: &*fmp,
                // wgpu 30: `entry_point` is `Option<&str>` — this crate always
                // names it explicitly (the spec's argument is required).
                entry_point: Some(fragment_entry),
                compilation_options: wgpu::PipelineCompilationOptions::default(),
                targets: &fragment_targets,
            })
        } else {
            None
        };

    device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: desc.label.as_deref(),
        layout: layout_ptr.map(|p| &*p),
        vertex: wgpu::VertexState {
            module: &*vertex_module_ptr,
            entry_point: Some(vertex_entry),
            compilation_options: wgpu::PipelineCompilationOptions::default(),
            // wgpu 30: `buffers` is `&[Option<VertexBufferLayout>]` — a slot
            // may be left empty (a "sparse" layout). See `vertex_buffers` below.
            buffers: &vertex_buffers,
        },
        primitive,
        depth_stencil,
        multisample,
        fragment: fragment_state,
        // wgpu 30: `multiview: Option<NonZeroU32>` → `multiview_mask:
        // Option<NonZeroU32>` — the multiview count became a mask of target
        // views. `None` is "not multiview", unchanged.
        multiview_mask: None,
        cache: None,
    })
}

/// Resolve a `RenderPipelineDescriptor`'s handle fields to raw
/// pointers (registry-pinned). Returns `None` if any handle is bad.
/// Shared by sync + async create paths.
fn resolve_render_pipeline_handles(
    desc: &RenderPipelineDescriptor,
) -> Option<(
    Option<*const PipelineLayout>,
    *const ShaderModule,
    Option<*const ShaderModule>,
    bool, // layout was explicit (not "auto")
)> {
    let layout_explicit = matches!(desc.layout, serde_json::Value::Number(_));
    let layout_ptr: Option<*const PipelineLayout> = match &desc.layout {
        serde_json::Value::String(s) if s == "auto" => None,
        serde_json::Value::Number(n) => with_handle::<WGPUPipelineLayout, _, _>(
            n.as_i64().unwrap_or(0),
            |pl| &pl.0 as *const _,
        ),
        _ => return None,
    };
    if layout_explicit && layout_ptr.is_none() {
        return None;
    }
    let vmodule_ptr = with_handle::<WGPUShaderModule, _, _>(desc.vertex.module, |m| {
        &m.0 as *const ShaderModule
    })?;
    let fmodule_ptr = match &desc.fragment {
        Some(f) => Some(with_handle::<WGPUShaderModule, _, _>(f.module, |m| {
            &m.0 as *const ShaderModule
        })?),
        None => None,
    };
    Some((layout_ptr, vmodule_ptr, fmodule_ptr, layout_explicit))
}

/// `device.createRenderPipeline(descriptor) -> GPURenderPipeline` —
/// synchronous. The descriptor mirrors `GPURenderPipelineDescriptor`
/// from the spec — vertex / fragment / primitive / depthStencil /
/// multisample, with `"auto"` or a `GPUPipelineLayout` handle for
/// `layout`.
///
/// # Safety
///
/// `descriptor_ptr` must be a Perry-runtime `StringHeader`.
#[no_mangle]
pub unsafe extern "C" fn js_webgpu_device_create_render_pipeline(
    device_handle: Handle,
    descriptor_ptr: *const StringHeader,
) -> Handle {
    ffi_trace("js_webgpu_device_create_render_pipeline");
    let Some(json) = read_str(descriptor_ptr) else {
        return 0;
    };
    let desc: RenderPipelineDescriptor = match serde_json::from_str(&json) {
        Ok(d) => d,
        Err(_) => return 0,
    };
    let Some((layout_ptr, vmod_ptr, fmod_ptr, _)) = resolve_render_pipeline_handles(&desc) else {
        return 0;
    };

    with_handle_unlocked::<WGPUDevice, _, _>(device_handle, |d| {
        let pipeline = build_render_pipeline(&d.0, &desc, layout_ptr, vmod_ptr, fmod_ptr);
        register_handle(WGPURenderPipeline(pipeline))
    })
    .unwrap_or(0)
}

/// `pipeline.getBindGroupLayout(index) -> GPUBindGroupLayout` —
/// synchronous accessor for render pipelines (mirrors the compute
/// version above).
#[no_mangle]
pub extern "C" fn js_webgpu_render_pipeline_get_bind_group_layout(
    pipeline_handle: Handle,
    index: u32,
) -> Handle {
    ffi_trace("js_webgpu_render_pipeline_get_bind_group_layout");
    with_handle_unlocked::<WGPURenderPipeline, _, _>(pipeline_handle, |p| {
        let bgl = p.0.get_bind_group_layout(index);
        register_handle(WGPUBindGroupLayout(bgl))
    })
    .unwrap_or(0)
}

/// `device.createRenderPipelineAsync(descriptor) -> Promise<GPURenderPipeline>`.
/// wgpu has no native async pipeline-create, so we run the sync
/// build inside a `spawn_blocking` task — same effect as the browser's
/// async dispatch (the work happens off the JS thread; the user's
/// promise unblocks when the pipeline is ready).
///
/// # Safety
///
/// `descriptor_ptr` must be a Perry-runtime `StringHeader`.
#[no_mangle]
pub unsafe extern "C" fn js_webgpu_device_create_render_pipeline_async(
    device_handle: Handle,
    descriptor_ptr: *const StringHeader,
) -> *mut Promise {
    ffi_trace("js_webgpu_device_create_render_pipeline_async");
    let promise = JsPromise::new();
    let raw = promise.as_raw();
    let Some(json) = read_str(descriptor_ptr) else {
        promise.reject_string("webgpu createRenderPipelineAsync: missing descriptor");
        return raw;
    };

    spawn_blocking(move || {
        let desc: RenderPipelineDescriptor = match serde_json::from_str(&json) {
            Ok(d) => d,
            Err(e) => {
                promise.reject_string(&format!(
                    "webgpu createRenderPipelineAsync: bad descriptor: {}",
                    e
                ));
                return;
            }
        };
        let Some((layout_ptr, vmod_ptr, fmod_ptr, _)) = resolve_render_pipeline_handles(&desc)
        else {
            promise.reject_string(
                "webgpu createRenderPipelineAsync: invalid layout / module handle",
            );
            return;
        };

        let outcome = with_handle_unlocked::<WGPUDevice, _, _>(device_handle, |d| unsafe {
            let pipeline = build_render_pipeline(&d.0, &desc, layout_ptr, vmod_ptr, fmod_ptr);
            register_handle(WGPURenderPipeline(pipeline))
        });
        match outcome {
            Some(h) => promise.resolve(JsValue::from_number(h as f64)),
            None => {
                promise.reject_string("webgpu createRenderPipelineAsync: invalid device handle")
            }
        }
    });
    raw
}

/// `device.createComputePipelineAsync(descriptor) -> Promise<GPUComputePipeline>`.
/// Same dispatch model as the render variant — wgpu compiles the
/// pipeline synchronously, we run it off the JS thread via
/// `spawn_blocking`.
///
/// # Safety
///
/// `descriptor_ptr` must be a Perry-runtime `StringHeader`.
#[no_mangle]
pub unsafe extern "C" fn js_webgpu_device_create_compute_pipeline_async(
    device_handle: Handle,
    descriptor_ptr: *const StringHeader,
) -> *mut Promise {
    ffi_trace("js_webgpu_device_create_compute_pipeline_async");
    let promise = JsPromise::new();
    let raw = promise.as_raw();
    let Some(json) = read_str(descriptor_ptr) else {
        promise.reject_string("webgpu createComputePipelineAsync: missing descriptor");
        return raw;
    };

    spawn_blocking(move || {
        let desc: ComputePipelineDescriptor = match serde_json::from_str(&json) {
            Ok(d) => d,
            Err(e) => {
                promise.reject_string(&format!(
                    "webgpu createComputePipelineAsync: bad descriptor: {}",
                    e
                ));
                return;
            }
        };

        let layout_ptr: Option<*const PipelineLayout> = match &desc.layout {
            serde_json::Value::String(s) if s == "auto" => None,
            serde_json::Value::Number(n) => with_handle::<WGPUPipelineLayout, _, _>(
                n.as_i64().unwrap_or(0),
                |pl| &pl.0 as *const _,
            ),
            _ => {
                promise.reject_string("webgpu createComputePipelineAsync: bad layout");
                return;
            }
        };
        let layout_explicit = matches!(desc.layout, serde_json::Value::Number(_));
        if layout_explicit && layout_ptr.is_none() {
            promise.reject_string("webgpu createComputePipelineAsync: invalid layout handle");
            return;
        }
        let module_ptr = match with_handle::<WGPUShaderModule, _, _>(desc.compute.module, |m| {
            &m.0 as *const ShaderModule
        }) {
            Some(p) => p,
            None => {
                promise.reject_string(
                    "webgpu createComputePipelineAsync: invalid shader module handle",
                );
                return;
            }
        };
        let entry_point = desc.compute.entry_point.as_deref().unwrap_or("main");

        let outcome = with_handle_unlocked::<WGPUDevice, _, _>(device_handle, |d| {
            let pipeline = d.0.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
                label: desc.label.as_deref(),
                layout: layout_ptr.map(|p| unsafe { &*p }),
                module: unsafe { &*module_ptr },
                entry_point: Some(entry_point),
                compilation_options: wgpu::PipelineCompilationOptions::default(),
                cache: None,
            });
            register_handle(WGPUComputePipeline(pipeline))
        });
        match outcome {
            Some(h) => promise.resolve(JsValue::from_number(h as f64)),
            None => {
                promise.reject_string(
                    "webgpu createComputePipelineAsync: invalid device handle",
                )
            }
        }
    });
    raw
}

// ════════════════════════════════════════════════════════════════════
// Render Pass + draw / set ops
// ════════════════════════════════════════════════════════════════════

#[derive(Deserialize)]
struct RenderPassColorAttachmentDesc {
    view: i64,
    #[serde(rename = "resolveTarget", default)]
    resolve_target: Option<i64>,
    /// `"clear"` or `"load"` per the spec.
    #[serde(rename = "loadOp", default)]
    load_op: Option<String>,
    /// `"store"` or `"discard"` per the spec.
    #[serde(rename = "storeOp", default)]
    store_op: Option<String>,
    /// Spec wire shape: `{r,g,b,a}` (numbers in 0..=1 for unorm formats).
    #[serde(rename = "clearValue", default)]
    clear_value: Option<ColorClearValue>,
}

#[derive(Deserialize)]
struct ColorClearValue {
    #[serde(default)]
    r: f64,
    #[serde(default)]
    g: f64,
    #[serde(default)]
    b: f64,
    #[serde(default)]
    a: f64,
}

#[derive(Deserialize)]
struct RenderPassDepthStencilAttachmentDesc {
    view: i64,
    #[serde(rename = "depthClearValue", default)]
    depth_clear_value: f32,
    #[serde(rename = "depthLoadOp", default)]
    depth_load_op: Option<String>,
    #[serde(rename = "depthStoreOp", default)]
    depth_store_op: Option<String>,
    #[serde(rename = "depthReadOnly", default)]
    depth_read_only: bool,
    #[serde(rename = "stencilClearValue", default)]
    stencil_clear_value: u32,
    #[serde(rename = "stencilLoadOp", default)]
    stencil_load_op: Option<String>,
    #[serde(rename = "stencilStoreOp", default)]
    stencil_store_op: Option<String>,
    #[serde(rename = "stencilReadOnly", default)]
    stencil_read_only: bool,
}

#[derive(Deserialize)]
struct RenderPassDescriptor {
    #[serde(default)]
    label: Option<String>,
    #[serde(rename = "colorAttachments")]
    color_attachments: Vec<Option<RenderPassColorAttachmentDesc>>,
    #[serde(rename = "depthStencilAttachment", default)]
    depth_stencil_attachment: Option<RenderPassDepthStencilAttachmentDesc>,
    #[serde(rename = "occlusionQuerySet", default)]
    occlusion_query_set: Option<i64>,
}

fn parse_load_op_color(s: Option<&str>, clear: Option<&ColorClearValue>) -> wgpu::LoadOp<wgpu::Color> {
    match s.unwrap_or("clear") {
        "load" => wgpu::LoadOp::Load,
        _ => wgpu::LoadOp::Clear(match clear {
            Some(c) => wgpu::Color {
                r: c.r,
                g: c.g,
                b: c.b,
                a: c.a,
            },
            None => wgpu::Color::TRANSPARENT,
        }),
    }
}

fn parse_load_op_f32(s: Option<&str>, clear: f32) -> wgpu::LoadOp<f32> {
    match s.unwrap_or("clear") {
        "load" => wgpu::LoadOp::Load,
        _ => wgpu::LoadOp::Clear(clear),
    }
}

fn parse_load_op_u32(s: Option<&str>, clear: u32) -> wgpu::LoadOp<u32> {
    match s.unwrap_or("clear") {
        "load" => wgpu::LoadOp::Load,
        _ => wgpu::LoadOp::Clear(clear),
    }
}

fn parse_store_op(s: Option<&str>) -> wgpu::StoreOp {
    match s.unwrap_or("store") {
        "discard" => wgpu::StoreOp::Discard,
        _ => wgpu::StoreOp::Store,
    }
}

/// `encoder.beginRenderPass(descriptor) -> GPURenderPassEncoder` —
/// synchronous. Same `forget_lifetime()` trick as `beginComputePass`:
/// the registry holds the pass as a 'static-flavoured owned value;
/// the user is contractually obligated to `pass.end()` before
/// `encoder.finish()`.
///
/// # Safety
///
/// `descriptor_ptr` must be a Perry-runtime `StringHeader`.
#[no_mangle]
pub unsafe extern "C" fn js_webgpu_command_encoder_begin_render_pass(
    encoder_handle: Handle,
    descriptor_ptr: *const StringHeader,
) -> Handle {
    ffi_trace("js_webgpu_command_encoder_begin_render_pass");
    let Some(json) = read_str(descriptor_ptr) else {
        return 0;
    };
    let desc: RenderPassDescriptor = match serde_json::from_str(&json) {
        Ok(d) => d,
        Err(_) => return 0,
    };

    // Resolve all texture-view + query-set handles up front so the
    // wgpu call only sees registry-pinned `&` references.
    let view_ptrs: Vec<Option<(*const wgpu::TextureView, Option<*const wgpu::TextureView>)>> = desc
        .color_attachments
        .iter()
        .map(|a| match a {
            Some(att) => {
                let v = with_handle::<WGPUTextureView, _, _>(att.view, |v| {
                    &v.0 as *const wgpu::TextureView
                })?;
                let r = match att.resolve_target {
                    Some(rh) => with_handle::<WGPUTextureView, _, _>(rh, |v| {
                        &v.0 as *const wgpu::TextureView
                    }),
                    None => None,
                };
                Some((v, r))
            }
            None => None,
        })
        .collect();
    if desc
        .color_attachments
        .iter()
        .zip(view_ptrs.iter())
        .any(|(a, p)| a.is_some() && p.is_none())
    {
        return 0;
    }

    let depth_view_ptr = match &desc.depth_stencil_attachment {
        Some(d) => {
            let v = with_handle::<WGPUTextureView, _, _>(d.view, |v| {
                &v.0 as *const wgpu::TextureView
            });
            let Some(v) = v else { return 0 };
            Some(v)
        }
        None => None,
    };
    let occlusion_qs_ptr = match desc.occlusion_query_set {
        Some(h) => with_handle::<WGPUQuerySet, _, _>(h, |q| &q.0 as *const wgpu::QuerySet),
        None => None,
    };

    with_handle_unlocked::<WGPUCommandEncoder, _, _>(encoder_handle, |ce| {
        let mut slot = ce.0.lock();
        let Some(encoder) = slot.as_mut() else {
            return 0;
        };

        let color_attachments: Vec<Option<wgpu::RenderPassColorAttachment>> = desc
            .color_attachments
            .iter()
            .zip(view_ptrs.iter())
            .map(|(att, ptrs)| match (att, ptrs) {
                (Some(att), Some((view_ptr, resolve_ptr))) => {
                    Some(wgpu::RenderPassColorAttachment {
                        view: unsafe { &**view_ptr },
                        resolve_target: resolve_ptr.map(|p| unsafe { &*p }),
                        // wgpu 30: the slice of a 3D texture to render into.
                        // This crate renders 2D colour targets only, so it is
                        // always `None` ("whole texture").
                        depth_slice: None,
                        ops: wgpu::Operations {
                            load: parse_load_op_color(
                                att.load_op.as_deref(),
                                att.clear_value.as_ref(),
                            ),
                            store: parse_store_op(att.store_op.as_deref()),
                        },
                    })
                }
                _ => None,
            })
            .collect();

        let depth_stencil =
            if let (Some(d), Some(vp)) = (&desc.depth_stencil_attachment, depth_view_ptr) {
                Some(wgpu::RenderPassDepthStencilAttachment {
                    view: unsafe { &*vp },
                    depth_ops: if d.depth_load_op.is_some() || d.depth_store_op.is_some() {
                        Some(wgpu::Operations {
                            load: parse_load_op_f32(d.depth_load_op.as_deref(), d.depth_clear_value),
                            store: parse_store_op(d.depth_store_op.as_deref()),
                        })
                    } else if d.depth_read_only {
                        None
                    } else {
                        None
                    },
                    stencil_ops: if d.stencil_load_op.is_some() || d.stencil_store_op.is_some() {
                        Some(wgpu::Operations {
                            load: parse_load_op_u32(
                                d.stencil_load_op.as_deref(),
                                d.stencil_clear_value,
                            ),
                            store: parse_store_op(d.stencil_store_op.as_deref()),
                        })
                    } else if d.stencil_read_only {
                        None
                    } else {
                        None
                    },
                })
            } else {
                None
            };

        let pass = encoder
            .begin_render_pass(&wgpu::RenderPassDescriptor {
                label: desc.label.as_deref(),
                color_attachments: &color_attachments,
                depth_stencil_attachment: depth_stencil,
                timestamp_writes: None,
                occlusion_query_set: occlusion_qs_ptr.map(|p| unsafe { &*p }),
                // wgpu 30: multiview moved from the pipeline to the pass (and
                // became a mask). This crate is single-view throughout.
                multiview_mask: None,
            })
            .forget_lifetime();
        register_handle(WGPURenderPass(Mutex::new(Some(pass))))
    })
    .unwrap_or(0)
}

/// `pass.setPipeline(pipeline)` for render passes.
#[no_mangle]
pub extern "C" fn js_webgpu_render_pass_set_pipeline(
    pass_handle: Handle,
    pipeline_handle: Handle,
) {
    ffi_trace("js_webgpu_render_pass_set_pipeline");
    let _ = with_handle::<WGPURenderPass, _, _>(pass_handle, |rp| {
        let mut slot = rp.0.lock();
        let Some(pass) = slot.as_mut() else { return };
        let _ = with_handle::<WGPURenderPipeline, _, _>(pipeline_handle, |p| {
            pass.set_pipeline(&p.0);
        });
    });
}

/// `pass.setBindGroup(index, bindGroup)` for render passes.
#[no_mangle]
pub extern "C" fn js_webgpu_render_pass_set_bind_group(
    pass_handle: Handle,
    index: u32,
    bind_group_handle: Handle,
) {
    ffi_trace("js_webgpu_render_pass_set_bind_group");
    let _ = with_handle::<WGPURenderPass, _, _>(pass_handle, |rp| {
        let mut slot = rp.0.lock();
        let Some(pass) = slot.as_mut() else { return };
        let _ = with_handle::<WGPUBindGroup, _, _>(bind_group_handle, |bg| {
            pass.set_bind_group(index, &bg.0, &[]);
        });
    });
}

/// `pass.setBindGroup(index, bindGroup, dynamicOffsets)` — render
/// pass variant with dynamic offsets, JSON-encoded as a number array.
///
/// # Safety
///
/// `offsets_json_ptr` must be a Perry-runtime `StringHeader`.
#[no_mangle]
pub unsafe extern "C" fn js_webgpu_render_pass_set_bind_group_dyn(
    pass_handle: Handle,
    index: u32,
    bind_group_handle: Handle,
    offsets_json_ptr: *const StringHeader,
) {
    ffi_trace("js_webgpu_render_pass_set_bind_group_dyn");
    let offsets: Vec<u32> = match read_str(offsets_json_ptr) {
        Some(j) => serde_json::from_str(&j).unwrap_or_default(),
        None => Vec::new(),
    };
    let _ = with_handle::<WGPURenderPass, _, _>(pass_handle, |rp| {
        let mut slot = rp.0.lock();
        let Some(pass) = slot.as_mut() else { return };
        let _ = with_handle::<WGPUBindGroup, _, _>(bind_group_handle, |bg| {
            pass.set_bind_group(index, &bg.0, &offsets);
        });
    });
}

/// `setBindGroup` with dynamic offsets for compute passes.
///
/// # Safety
///
/// `offsets_json_ptr` must be a Perry-runtime `StringHeader`.
#[no_mangle]
pub unsafe extern "C" fn js_webgpu_compute_pass_set_bind_group_dyn(
    pass_handle: Handle,
    index: u32,
    bind_group_handle: Handle,
    offsets_json_ptr: *const StringHeader,
) {
    ffi_trace("js_webgpu_compute_pass_set_bind_group_dyn");
    let offsets: Vec<u32> = match read_str(offsets_json_ptr) {
        Some(j) => serde_json::from_str(&j).unwrap_or_default(),
        None => Vec::new(),
    };
    let _ = with_handle::<WGPUComputePass, _, _>(pass_handle, |cp| {
        let mut slot = cp.0.lock();
        let Some(pass) = slot.as_mut() else { return };
        let _ = with_handle::<WGPUBindGroup, _, _>(bind_group_handle, |bg| {
            pass.set_bind_group(index, &bg.0, &offsets);
        });
    });
}

/// `pass.setVertexBuffer(slot, buffer, offset?, size?)`.
#[no_mangle]
pub extern "C" fn js_webgpu_render_pass_set_vertex_buffer(
    pass_handle: Handle,
    slot: u32,
    buffer_handle: Handle,
    offset: f64,
    size: f64,
) {
    ffi_trace("js_webgpu_render_pass_set_vertex_buffer");
    let _ = with_handle::<WGPURenderPass, _, _>(pass_handle, |rp| {
        let mut slot_g = rp.0.lock();
        let Some(pass) = slot_g.as_mut() else { return };
        let _ = with_handle::<WGPUBuffer, _, _>(buffer_handle, |b| {
            let off = offset.max(0.0) as u64;
            let sz = size.max(0.0) as u64;
            let bs = if sz == 0 { b.0.slice(off..) } else { b.0.slice(off..off + sz) };
            pass.set_vertex_buffer(slot, bs);
        });
    });
}

/// `pass.setIndexBuffer(buffer, indexFormat, offset?, size?)`.
///
/// # Safety
///
/// `format_ptr` must be a Perry-runtime `StringHeader`.
#[no_mangle]
pub unsafe extern "C" fn js_webgpu_render_pass_set_index_buffer(
    pass_handle: Handle,
    buffer_handle: Handle,
    format_ptr: *const StringHeader,
    offset: f64,
    size: f64,
) {
    ffi_trace("js_webgpu_render_pass_set_index_buffer");
    let format = read_str(format_ptr).unwrap_or_else(|| "uint32".to_string());
    let _ = with_handle::<WGPURenderPass, _, _>(pass_handle, |rp| {
        let mut slot_g = rp.0.lock();
        let Some(pass) = slot_g.as_mut() else { return };
        let _ = with_handle::<WGPUBuffer, _, _>(buffer_handle, |b| {
            let off = offset.max(0.0) as u64;
            let sz = size.max(0.0) as u64;
            let bs = if sz == 0 { b.0.slice(off..) } else { b.0.slice(off..off + sz) };
            pass.set_index_buffer(bs, parse_index_format(&format));
        });
    });
}

/// `pass.draw(vertexCount, instanceCount?, firstVertex?, firstInstance?)`.
#[no_mangle]
pub extern "C" fn js_webgpu_render_pass_draw(
    pass_handle: Handle,
    vertex_count: u32,
    instance_count: u32,
    first_vertex: u32,
    first_instance: u32,
) {
    ffi_trace("js_webgpu_render_pass_draw");
    let _ = with_handle::<WGPURenderPass, _, _>(pass_handle, |rp| {
        let mut slot = rp.0.lock();
        let Some(pass) = slot.as_mut() else { return };
        let inst = instance_count.max(1);
        pass.draw(
            first_vertex..first_vertex + vertex_count,
            first_instance..first_instance + inst,
        );
    });
}

/// `pass.drawIndexed(indexCount, instanceCount?, firstIndex?, baseVertex?, firstInstance?)`.
#[no_mangle]
pub extern "C" fn js_webgpu_render_pass_draw_indexed(
    pass_handle: Handle,
    index_count: u32,
    instance_count: u32,
    first_index: u32,
    base_vertex: i32,
    first_instance: u32,
) {
    ffi_trace("js_webgpu_render_pass_draw_indexed");
    let _ = with_handle::<WGPURenderPass, _, _>(pass_handle, |rp| {
        let mut slot = rp.0.lock();
        let Some(pass) = slot.as_mut() else { return };
        let inst = instance_count.max(1);
        pass.draw_indexed(
            first_index..first_index + index_count,
            base_vertex,
            first_instance..first_instance + inst,
        );
    });
}

/// `pass.setViewport(x, y, w, h, minDepth, maxDepth)`.
#[no_mangle]
pub extern "C" fn js_webgpu_render_pass_set_viewport(
    pass_handle: Handle,
    x: f32,
    y: f32,
    w: f32,
    h: f32,
    min_depth: f32,
    max_depth: f32,
) {
    ffi_trace("js_webgpu_render_pass_set_viewport");
    let _ = with_handle::<WGPURenderPass, _, _>(pass_handle, |rp| {
        let mut slot = rp.0.lock();
        let Some(pass) = slot.as_mut() else { return };
        pass.set_viewport(x, y, w, h, min_depth, max_depth);
    });
}

/// `pass.setScissorRect(x, y, w, h)`.
#[no_mangle]
pub extern "C" fn js_webgpu_render_pass_set_scissor_rect(
    pass_handle: Handle,
    x: u32,
    y: u32,
    w: u32,
    h: u32,
) {
    ffi_trace("js_webgpu_render_pass_set_scissor_rect");
    let _ = with_handle::<WGPURenderPass, _, _>(pass_handle, |rp| {
        let mut slot = rp.0.lock();
        let Some(pass) = slot.as_mut() else { return };
        pass.set_scissor_rect(x, y, w, h);
    });
}

/// `pass.setBlendConstant({r,g,b,a})` — components in 0..=1 for unorm
/// formats. Spec wire shape is the same `{r,g,b,a}` clear-color blob.
#[no_mangle]
pub extern "C" fn js_webgpu_render_pass_set_blend_constant(
    pass_handle: Handle,
    r: f64,
    g: f64,
    b: f64,
    a: f64,
) {
    ffi_trace("js_webgpu_render_pass_set_blend_constant");
    let _ = with_handle::<WGPURenderPass, _, _>(pass_handle, |rp| {
        let mut slot = rp.0.lock();
        let Some(pass) = slot.as_mut() else { return };
        pass.set_blend_constant(wgpu::Color { r, g, b, a });
    });
}

/// `pass.setStencilReference(reference)`.
#[no_mangle]
pub extern "C" fn js_webgpu_render_pass_set_stencil_reference(
    pass_handle: Handle,
    reference: u32,
) {
    ffi_trace("js_webgpu_render_pass_set_stencil_reference");
    let _ = with_handle::<WGPURenderPass, _, _>(pass_handle, |rp| {
        let mut slot = rp.0.lock();
        let Some(pass) = slot.as_mut() else { return };
        pass.set_stencil_reference(reference);
    });
}

/// `pass.beginOcclusionQuery(queryIndex)`.
#[no_mangle]
pub extern "C" fn js_webgpu_render_pass_begin_occlusion_query(
    pass_handle: Handle,
    query_index: u32,
) {
    ffi_trace("js_webgpu_render_pass_begin_occlusion_query");
    let _ = with_handle::<WGPURenderPass, _, _>(pass_handle, |rp| {
        let mut slot = rp.0.lock();
        let Some(pass) = slot.as_mut() else { return };
        pass.begin_occlusion_query(query_index);
    });
}

/// `pass.endOcclusionQuery()`.
#[no_mangle]
pub extern "C" fn js_webgpu_render_pass_end_occlusion_query(pass_handle: Handle) {
    ffi_trace("js_webgpu_render_pass_end_occlusion_query");
    let _ = with_handle::<WGPURenderPass, _, _>(pass_handle, |rp| {
        let mut slot = rp.0.lock();
        let Some(pass) = slot.as_mut() else { return };
        pass.end_occlusion_query();
    });
}

/// `pass.end()`.
#[no_mangle]
pub extern "C" fn js_webgpu_render_pass_end(pass_handle: Handle) {
    ffi_trace("js_webgpu_render_pass_end");
    let _ = take_handle::<WGPURenderPass>(pass_handle);
    drop_handle(pass_handle);
}

// ════════════════════════════════════════════════════════════════════
// QuerySet
// ════════════════════════════════════════════════════════════════════

#[derive(Deserialize)]
struct QuerySetDescriptor {
    #[serde(default)]
    label: Option<String>,
    #[serde(rename = "type")]
    ty: String,
    count: u32,
}

/// `device.createQuerySet({type, count}) -> GPUQuerySet` —
/// synchronous. Type is `"occlusion"` or `"timestamp"` per the spec.
/// Pipeline-statistics queries are gated behind a wgpu feature we
/// don't request; v0.1 surfaces them as `"occlusion"` (a safe
/// default — same fallthrough strategy as `parse_buffer_binding_type`).
///
/// # Safety
///
/// `descriptor_ptr` must be a Perry-runtime `StringHeader`.
#[no_mangle]
pub unsafe extern "C" fn js_webgpu_device_create_query_set(
    device_handle: Handle,
    descriptor_ptr: *const StringHeader,
) -> Handle {
    ffi_trace("js_webgpu_device_create_query_set");
    let Some(json) = read_str(descriptor_ptr) else {
        return 0;
    };
    let desc: QuerySetDescriptor = match serde_json::from_str(&json) {
        Ok(d) => d,
        Err(_) => return 0,
    };
    let ty = match desc.ty.as_str() {
        "timestamp" => wgpu::QueryType::Timestamp,
        _ => wgpu::QueryType::Occlusion,
    };

    with_handle_unlocked::<WGPUDevice, _, _>(device_handle, |d| {
        let qs = d.0.create_query_set(&wgpu::QuerySetDescriptor {
            label: desc.label.as_deref(),
            ty,
            count: desc.count,
        });
        register_handle(WGPUQuerySet(qs))
    })
    .unwrap_or(0)
}

/// `querySet.destroy()` — release. Idempotent.
#[no_mangle]
pub extern "C" fn js_webgpu_query_set_destroy(query_set_handle: Handle) {
    ffi_trace("js_webgpu_query_set_destroy");
    let _ = take_handle::<WGPUQuerySet>(query_set_handle);
    drop_handle(query_set_handle);
}

/// `encoder.resolveQuerySet(querySet, firstQuery, queryCount, destination, destinationOffset)`.
#[no_mangle]
pub extern "C" fn js_webgpu_command_encoder_resolve_query_set(
    encoder_handle: Handle,
    query_set: Handle,
    first_query: u32,
    query_count: u32,
    destination: Handle,
    destination_offset: f64,
) {
    ffi_trace("js_webgpu_command_encoder_resolve_query_set");
    let _ = with_handle::<WGPUCommandEncoder, _, _>(encoder_handle, |ce| {
        let mut slot = ce.0.lock();
        let Some(encoder) = slot.as_mut() else { return };
        let _ = with_handle::<WGPUQuerySet, _, _>(query_set, |qs| {
            let _ = with_handle::<WGPUBuffer, _, _>(destination, |b| {
                encoder.resolve_query_set(
                    &qs.0,
                    first_query..first_query + query_count,
                    &b.0,
                    destination_offset.max(0.0) as u64,
                );
            });
        });
    });
}

// ════════════════════════════════════════════════════════════════════
// Queue.writeTexture + texture-related copy ops
// ════════════════════════════════════════════════════════════════════

#[derive(Deserialize)]
struct TexelCopyTextureInfoDesc {
    texture: i64,
    #[serde(rename = "mipLevel", default)]
    mip_level: u32,
    #[serde(default)]
    origin: Option<Origin3dDesc>,
    #[serde(default)]
    aspect: Option<String>,
}

#[derive(Deserialize, Default, Clone)]
struct Origin3dDesc {
    #[serde(default)]
    x: u32,
    #[serde(default)]
    y: u32,
    #[serde(default)]
    z: u32,
}

#[derive(Deserialize)]
struct TexelCopyBufferLayoutDesc {
    #[serde(default)]
    offset: u64,
    #[serde(rename = "bytesPerRow", default)]
    bytes_per_row: u32,
    #[serde(rename = "rowsPerImage", default)]
    rows_per_image: u32,
}

#[derive(Deserialize)]
struct TexelCopyBufferInfoDesc {
    buffer: i64,
    #[serde(default)]
    offset: u64,
    #[serde(rename = "bytesPerRow", default)]
    bytes_per_row: u32,
    #[serde(rename = "rowsPerImage", default)]
    rows_per_image: u32,
}

#[derive(Deserialize)]
struct WriteTextureCall {
    destination: TexelCopyTextureInfoDesc,
    #[serde(rename = "dataLayout")]
    data_layout: TexelCopyBufferLayoutDesc,
    size: Extent3dDesc,
}

/// `queue.writeTexture(destination, data, dataLayout, size)`. The
/// four spec args are packed into one JSON descriptor + a separate
/// data buffer to keep the FFI surface tractable.
///
/// # Safety
///
/// `descriptor_ptr` must be a Perry-runtime `StringHeader`; `data_ptr`
/// must be null or a Perry-runtime `BufferHeader`.
#[no_mangle]
pub unsafe extern "C" fn js_webgpu_queue_write_texture(
    queue_handle: Handle,
    descriptor_ptr: *const StringHeader,
    data_ptr: *const BufferHeader,
) {
    ffi_trace("js_webgpu_queue_write_texture");
    let Some(json) = read_str(descriptor_ptr) else {
        return;
    };
    let call: WriteTextureCall = match serde_json::from_str(&json) {
        Ok(c) => c,
        Err(e) => {
            // This used to `return` silently, which turned a mistyped
            // descriptor into a no-op that reported nothing: the call was made,
            // the texture stayed zeroed, and every sprite sampled alpha 0 while
            // the app ran at full frame rate. Never swallow it again.
            eprintln!(
                "webgpu queueWriteTexture: descriptor did not parse ({e}); \
                 texture NOT uploaded. descriptor was: {}",
                &json[..json.len().min(400)]
            );
            return;
        }
    };

    {
        let Some(bytes_preview) = perry_ffi::read_buffer_bytes(data_ptr) else {
            eprintln!("webgpu queueWriteTexture: data ptr was null");
            return;
        };
        if std::env::var_os("PERRY_WEBGPU_TRACE").is_some() {
            eprintln!(
                "[webgpu]   write_texture texture={} size={}x{}x{} bytes={} bytes_per_row={} rows_per_image={}",
                call.destination.texture,
                call.size.width,
                call.size.height,
                call.size.depth_or_array_layers,
                bytes_preview.len(),
                call.data_layout.bytes_per_row,
                call.data_layout.rows_per_image
            );
        }
    }

    let Some(bytes) = perry_ffi::read_buffer_bytes(data_ptr) else {
        return;
    };

    let _ = with_handle::<WGPUQueue, _, _>(queue_handle, |q| {
        let _ = with_handle::<WGPUTexture, _, _>(call.destination.texture, |t| {
            let origin = call.destination.origin.unwrap_or_default();
            q.queue.write_texture(
                wgpu::TexelCopyTextureInfo {
                    texture: &t.0,
                    mip_level: call.destination.mip_level,
                    origin: wgpu::Origin3d {
                        x: origin.x,
                        y: origin.y,
                        z: origin.z,
                    },
                    aspect: parse_texture_aspect(call.destination.aspect.as_deref()),
                },
                bytes,
                wgpu::TexelCopyBufferLayout {
                    offset: call.data_layout.offset,
                    bytes_per_row: if call.data_layout.bytes_per_row == 0 {
                        None
                    } else {
                        Some(call.data_layout.bytes_per_row)
                    },
                    rows_per_image: if call.data_layout.rows_per_image == 0 {
                        None
                    } else {
                        Some(call.data_layout.rows_per_image)
                    },
                },
                wgpu::Extent3d {
                    width: call.size.width,
                    height: call.size.height,
                    depth_or_array_layers: call.size.depth_or_array_layers,
                },
            );
        });
    });
}

#[derive(Deserialize)]
struct CopyBufferToTextureCall {
    source: TexelCopyBufferInfoDesc,
    destination: TexelCopyTextureInfoDesc,
    size: Extent3dDesc,
}

#[derive(Deserialize)]
struct CopyTextureToBufferCall {
    source: TexelCopyTextureInfoDesc,
    destination: TexelCopyBufferInfoDesc,
    size: Extent3dDesc,
}

#[derive(Deserialize)]
struct CopyTextureToTextureCall {
    source: TexelCopyTextureInfoDesc,
    destination: TexelCopyTextureInfoDesc,
    size: Extent3dDesc,
}

/// `encoder.copyBufferToTexture(source, destination, copySize)`.
///
/// # Safety
///
/// `descriptor_ptr` must be a Perry-runtime `StringHeader`.
#[no_mangle]
pub unsafe extern "C" fn js_webgpu_command_encoder_copy_buffer_to_texture(
    encoder_handle: Handle,
    descriptor_ptr: *const StringHeader,
) {
    ffi_trace("js_webgpu_command_encoder_copy_buffer_to_texture");
    let Some(json) = read_str(descriptor_ptr) else {
        return;
    };
    let call: CopyBufferToTextureCall = match serde_json::from_str(&json) {
        Ok(c) => c,
        Err(_) => return,
    };

    let _ = with_handle::<WGPUCommandEncoder, _, _>(encoder_handle, |ce| {
        let mut slot = ce.0.lock();
        let Some(encoder) = slot.as_mut() else { return };
        let _ = with_handle::<WGPUBuffer, _, _>(call.source.buffer, |sb| {
            let _ = with_handle::<WGPUTexture, _, _>(call.destination.texture, |dt| {
                let dorigin = call.destination.origin.clone().unwrap_or_default();
                encoder.copy_buffer_to_texture(
                    wgpu::TexelCopyBufferInfo {
                        buffer: &sb.0,
                        layout: wgpu::TexelCopyBufferLayout {
                            offset: call.source.offset,
                            bytes_per_row: if call.source.bytes_per_row == 0 {
                                None
                            } else {
                                Some(call.source.bytes_per_row)
                            },
                            rows_per_image: if call.source.rows_per_image == 0 {
                                None
                            } else {
                                Some(call.source.rows_per_image)
                            },
                        },
                    },
                    wgpu::TexelCopyTextureInfo {
                        texture: &dt.0,
                        mip_level: call.destination.mip_level,
                        origin: wgpu::Origin3d {
                            x: dorigin.x,
                            y: dorigin.y,
                            z: dorigin.z,
                        },
                        aspect: parse_texture_aspect(call.destination.aspect.as_deref()),
                    },
                    wgpu::Extent3d {
                        width: call.size.width,
                        height: call.size.height,
                        depth_or_array_layers: call.size.depth_or_array_layers,
                    },
                );
            });
        });
    });
}

/// `encoder.copyTextureToBuffer(source, destination, copySize)`.
///
/// # Safety
///
/// `descriptor_ptr` must be a Perry-runtime `StringHeader`.
#[no_mangle]
pub unsafe extern "C" fn js_webgpu_command_encoder_copy_texture_to_buffer(
    encoder_handle: Handle,
    descriptor_ptr: *const StringHeader,
) {
    ffi_trace("js_webgpu_command_encoder_copy_texture_to_buffer");
    let Some(json) = read_str(descriptor_ptr) else {
        return;
    };
    let call: CopyTextureToBufferCall = match serde_json::from_str(&json) {
        Ok(c) => c,
        Err(_) => return,
    };

    let _ = with_handle::<WGPUCommandEncoder, _, _>(encoder_handle, |ce| {
        let mut slot = ce.0.lock();
        let Some(encoder) = slot.as_mut() else { return };
        let _ = with_handle::<WGPUTexture, _, _>(call.source.texture, |st| {
            let _ = with_handle::<WGPUBuffer, _, _>(call.destination.buffer, |db| {
                let sorigin = call.source.origin.clone().unwrap_or_default();
                encoder.copy_texture_to_buffer(
                    wgpu::TexelCopyTextureInfo {
                        texture: &st.0,
                        mip_level: call.source.mip_level,
                        origin: wgpu::Origin3d {
                            x: sorigin.x,
                            y: sorigin.y,
                            z: sorigin.z,
                        },
                        aspect: parse_texture_aspect(call.source.aspect.as_deref()),
                    },
                    wgpu::TexelCopyBufferInfo {
                        buffer: &db.0,
                        layout: wgpu::TexelCopyBufferLayout {
                            offset: call.destination.offset,
                            bytes_per_row: if call.destination.bytes_per_row == 0 {
                                None
                            } else {
                                Some(call.destination.bytes_per_row)
                            },
                            rows_per_image: if call.destination.rows_per_image == 0 {
                                None
                            } else {
                                Some(call.destination.rows_per_image)
                            },
                        },
                    },
                    wgpu::Extent3d {
                        width: call.size.width,
                        height: call.size.height,
                        depth_or_array_layers: call.size.depth_or_array_layers,
                    },
                );
            });
        });
    });
}

/// `encoder.copyTextureToTexture(source, destination, copySize)`.
///
/// # Safety
///
/// `descriptor_ptr` must be a Perry-runtime `StringHeader`.
#[no_mangle]
pub unsafe extern "C" fn js_webgpu_command_encoder_copy_texture_to_texture(
    encoder_handle: Handle,
    descriptor_ptr: *const StringHeader,
) {
    ffi_trace("js_webgpu_command_encoder_copy_texture_to_texture");
    let Some(json) = read_str(descriptor_ptr) else {
        return;
    };
    let call: CopyTextureToTextureCall = match serde_json::from_str(&json) {
        Ok(c) => c,
        Err(_) => return,
    };

    let _ = with_handle::<WGPUCommandEncoder, _, _>(encoder_handle, |ce| {
        let mut slot = ce.0.lock();
        let Some(encoder) = slot.as_mut() else { return };
        let _ = with_handle::<WGPUTexture, _, _>(call.source.texture, |st| {
            let _ = with_handle::<WGPUTexture, _, _>(call.destination.texture, |dt| {
                let sorigin = call.source.origin.clone().unwrap_or_default();
                let dorigin = call.destination.origin.clone().unwrap_or_default();
                encoder.copy_texture_to_texture(
                    wgpu::TexelCopyTextureInfo {
                        texture: &st.0,
                        mip_level: call.source.mip_level,
                        origin: wgpu::Origin3d {
                            x: sorigin.x,
                            y: sorigin.y,
                            z: sorigin.z,
                        },
                        aspect: parse_texture_aspect(call.source.aspect.as_deref()),
                    },
                    wgpu::TexelCopyTextureInfo {
                        texture: &dt.0,
                        mip_level: call.destination.mip_level,
                        origin: wgpu::Origin3d {
                            x: dorigin.x,
                            y: dorigin.y,
                            z: dorigin.z,
                        },
                        aspect: parse_texture_aspect(call.destination.aspect.as_deref()),
                    },
                    wgpu::Extent3d {
                        width: call.size.width,
                        height: call.size.height,
                        depth_or_array_layers: call.size.depth_or_array_layers,
                    },
                );
            });
        });
    });
}

// ════════════════════════════════════════════════════════════════════
// On-screen surface — `GPUSurface` / `GPUCanvasContext`
// ════════════════════════════════════════════════════════════════════
//
// WebGPU presents to a window via a swapchain. The browser hides this
// behind `canvas.getContext("webgpu")`; natively, wgpu wants a
// `Surface` built from a platform window/view handle.
//
// Perry programs are headless by default, so on-screen rendering rides
// on perry-ui: it owns the OS window and the main-thread event loop and
// exposes one cross-platform seam — `perry_ui_embed_nsview(ptr)` — that
// adopts an externally-created native view into the widget tree (the
// symbol name is historical; on Windows it takes an `HWND`, on GTK a
// widget pointer, on iOS/Android a `UIView`/Android `View`).
//
// The dependency direction matters: `@perryts/webgpu` must stay useful
// headless (compute, render-to-texture), so it does **not** link
// perry-ui. Instead:
//
//   1. `requestSurface({width,height})` allocates a GPU-capable native
//      view, builds the `wgpu::Surface`, and returns a surface handle.
//   2. `surfaceGetViewPtr(surface)` hands the raw view pointer back; the
//      caller passes it to perry-ui's `embedNativeView()`.
//   3. The usual configure / getCurrentTexture / render / present loop
//      drives frames.
//
// `surfaceFromNativeView(ptr)` is the inverse seam: wrap a view the host
// already created (the path for platforms whose toolkit owns the view,
// and the hook a future "wrap an existing wgpu device" bloom-interop
// entry point builds on).
//
// Threading: a swapchain surface must be configured / acquired /
// presented on the thread that owns its backing layer — the main thread
// under every platform's UI toolkit. Perry runs JS on the main thread,
// so these calls are main-thread by construction; calling them from a
// worker is undefined behaviour (same constraint as the spec, where
// `GPUCanvasContext` lives on the `Window`).

pub struct WGPUSurface {
    surface: wgpu::Surface<'static>,
    /// Pointer to a native view we allocated in `requestSurface` and own
    /// (`0` when we merely wrapped a caller-supplied view — then we must
    /// not release it). Released in `surfaceDrop`.
    owned_view: i64,
    /// The pointer handed back via `surfaceGetViewPtr` for embedding —
    /// equal to `owned_view` for a created view, or the wrapped pointer.
    view_ptr: i64,
    /// Last applied configuration, kept so a resize can re-`configure`
    /// with the same format/usage by only swapping width/height.
    config: Mutex<Option<wgpu::SurfaceConfiguration>>,
    /// The swapchain image acquired by `getCurrentTexture`, held until
    /// `present` consumes it. `wgpu::SurfaceTexture` is neither `Clone`
    /// nor splittable, so the frame lives here and the handle handed to
    /// JS ([`WGPUSurfaceTexture`]) just points back at this surface.
    current: Mutex<Option<wgpu::SurfaceTexture>>,
    /// Handle of the [`WGPUSurfaceTexture`] currently issued to JS, so a
    /// new acquire / a present can free the previous one and per-frame
    /// handles don't accumulate.
    issued_tex: Mutex<Handle>,
    /// The [`wgpu::Queue`] used to present, captured by `surfaceConfigure`.
    ///
    /// wgpu 30 moved presentation here: `SurfaceTexture::present()` is gone and
    /// `Queue::present(surface_texture)` takes the frame by value. wgpu still
    /// has no `Device::queue()` accessor, and the queue stashed in
    /// `sync_queue_slot` can be taken out again by `deviceGetQueueSync`, so the
    /// surface keeps its own clone — `wgpu::Queue` is an `Arc` internally and a
    /// clone is a refcount bump. `None` until the first `configure`.
    queue: Mutex<Option<wgpu::Queue>>,
    /// Device handle captured by `surfaceConfigure` (0 = unconfigured),
    /// so the swapchain can be re-`configure`d without JS involvement
    /// when the backing window is reparented (see `configured_root`).
    #[cfg(target_os = "windows")]
    configured_device: Mutex<Handle>,
    /// Top-level ancestor (`GetAncestor(GA_ROOT)`) of `view_ptr` when
    /// `surfaceConfigure` ran. perry-ui creates widget HWNDs under a
    /// hidden *parking* window and only reparents them into the real
    /// app window when the body is mounted — typically *after* the
    /// surface was configured. A DXGI swapchain created while the HWND
    /// hung under the parking window presents successfully but never
    /// composites into the on-screen window (#5812 item 5), so
    /// `getCurrentTexture` compares the current root against this and
    /// re-configures (rebuilding the swapchain) when it changed.
    #[cfg(target_os = "windows")]
    configured_root: Mutex<i64>,
}

/// The handle `getCurrentTexture` returns. It carries no texture of its
/// own — the live `SurfaceTexture` sits on the parent [`WGPUSurface`] —
/// so `textureCreateView` resolves the texture by borrowing it back.
/// This keeps the spec's two-step `getCurrentTexture().createView()`
/// shape despite `wgpu::Texture` not being cloneable.
pub struct WGPUSurfaceTexture {
    pub surface_handle: Handle,
}

fn parse_present_mode(s: Option<&str>) -> wgpu::PresentMode {
    match s.unwrap_or("fifo") {
        "immediate" => wgpu::PresentMode::Immediate,
        "mailbox" => wgpu::PresentMode::Mailbox,
        "fifo-relaxed" => wgpu::PresentMode::FifoRelaxed,
        // The spec's `GPUCanvasConfiguration` has no presentMode knob;
        // FIFO (vsync) is the universally-supported default and matches
        // the browser's implicit behaviour.
        _ => wgpu::PresentMode::Fifo,
    }
}

fn parse_alpha_mode(s: Option<&str>) -> wgpu::CompositeAlphaMode {
    match s.unwrap_or("opaque") {
        "premultiplied" => wgpu::CompositeAlphaMode::PreMultiplied,
        "postmultiplied" => wgpu::CompositeAlphaMode::PostMultiplied,
        "inherit" => wgpu::CompositeAlphaMode::Inherit,
        "auto" => wgpu::CompositeAlphaMode::Auto,
        _ => wgpu::CompositeAlphaMode::Opaque,
    }
}

/// Reverse of [`parse_texture_format`] for the formats a swapchain
/// actually reports. Not exhaustive over every `TextureFormat` — only
/// the surface-capable set `getPreferredFormat` can return — with a
/// `bgra8unorm` fallback (the most widely-supported swapchain format).
fn surface_format_to_str(f: wgpu::TextureFormat) -> &'static str {
    use wgpu::TextureFormat as F;
    match f {
        F::Bgra8Unorm => "bgra8unorm",
        F::Bgra8UnormSrgb => "bgra8unorm-srgb",
        F::Rgba8Unorm => "rgba8unorm",
        F::Rgba8UnormSrgb => "rgba8unorm-srgb",
        F::Rgba16Float => "rgba16float",
        F::Rgb10a2Unorm => "rgb10a2unorm",
        _ => "bgra8unorm",
    }
}

/// `navigator.gpu` → request a swapchain surface. `descriptor` is the
/// JSON form of `{ width, height, label? }`. Allocates a GPU-capable
/// native view (see [`surface_view`]) and builds the `wgpu::Surface`.
/// Returns a numeric surface handle, or `0` on failure (bad JSON, no
/// view available on this platform, or surface creation rejected).
///
/// The created view is retained for the surface's lifetime; retrieve its
/// pointer with `surfaceGetViewPtr` and embed it via perry-ui.
///
/// # Safety
///
/// `descriptor_ptr` must be a Perry-runtime `StringHeader`.
#[no_mangle]
pub unsafe extern "C" fn js_webgpu_request_surface(descriptor_ptr: *const StringHeader) -> Handle {
    ffi_trace("js_webgpu_request_surface");
    #[derive(Deserialize)]
    struct SurfaceDescriptor {
        width: u32,
        height: u32,
        #[serde(default)]
        #[allow(dead_code)]
        label: Option<String>,
    }

    let Some(json) = read_str(descriptor_ptr) else {
        return 0;
    };
    let desc: SurfaceDescriptor = match serde_json::from_str(&json) {
        Ok(d) => d,
        Err(_) => return 0,
    };

    let Some(view) = surface_view::create(desc.width.max(1), desc.height.max(1)) else {
        return 0;
    };

    // SAFETY: the handles describe the live view we just created; it
    // outlives the surface because the wrapper holds a +1 ref (released
    // in `surfaceDrop`).
    // wgpu 30: `SurfaceTargetUnsafe::RawHandle`'s two fields became
    // `Option<...>` (some backends accept only one of them). Both are known
    // for a native view.
    let target = wgpu::SurfaceTargetUnsafe::RawHandle {
        raw_display_handle: Some(view.display_handle),
        // wgpu 30: `raw_window_handle` is a bare `RawWindowHandle` — only the
        // display handle is `Option`.
        raw_window_handle: view.window_handle,
    };
    match instance().create_surface_unsafe(target) {
        Ok(surface) => register_handle(WGPUSurface {
            surface,
            owned_view: view.view_ptr,
            view_ptr: view.view_ptr,
            config: Mutex::new(None),
            current: Mutex::new(None),
            issued_tex: Mutex::new(0),
            queue: Mutex::new(None),
            #[cfg(target_os = "windows")]
            configured_device: Mutex::new(0),
            #[cfg(target_os = "windows")]
            configured_root: Mutex::new(0),
        }),
        Err(e) => {
            eprintln!("webgpu requestSurface: create_surface failed: {e}");
            surface_view::destroy(view.view_ptr);
            0
        }
    }
}

/// Wrap a native view/window the host already created into a wgpu
/// surface — the inverse of `requestSurface`. `view_ptr` is interpreted
/// per platform: `NSView*` (macOS), `UIView*` (iOS), `HWND` (Windows),
/// `ANativeWindow*` (Android). The view must be GPU-capable (e.g. a
/// `CAMetalLayer`-backed view on Apple platforms). We do **not** take
/// ownership — the host keeps managing the view's lifetime, which must
/// outlive the surface. Returns `0` if `view_ptr` is null or the
/// platform isn't wired.
#[no_mangle]
pub extern "C" fn js_webgpu_surface_from_native_view(view_ptr: i64) -> Handle {
    ffi_trace("js_webgpu_surface_from_native_view");
    if view_ptr == 0 {
        return 0;
    }
    #[cfg(target_os = "windows")]
    win32::diag("surfaceFromNativeView", view_ptr);
    let Some((window_handle, display_handle)) = surface_view::wrap(view_ptr) else {
        return 0;
    };
    // wgpu 30: `SurfaceTargetUnsafe::RawHandle`'s two fields became `Option<...>`.
    let target = wgpu::SurfaceTargetUnsafe::RawHandle {
        raw_display_handle: Some(display_handle),
        raw_window_handle: window_handle,
    };
    // SAFETY: caller guarantees `view_ptr` references a live GPU-capable
    // view that outlives the returned surface.
    match unsafe { instance().create_surface_unsafe(target) } {
        Ok(surface) => register_handle(WGPUSurface {
            surface,
            owned_view: 0, // borrowed — never released by us
            view_ptr,
            config: Mutex::new(None),
            current: Mutex::new(None),
            issued_tex: Mutex::new(0),
            queue: Mutex::new(None),
            #[cfg(target_os = "windows")]
            configured_device: Mutex::new(0),
            #[cfg(target_os = "windows")]
            configured_root: Mutex::new(0),
        }),
        Err(e) => {
            eprintln!("webgpu surfaceFromNativeView: create_surface failed: {e}");
            0
        }
    }
}

/// The native view pointer backing this surface — pass it to perry-ui's
/// `embedNativeView()` to mount the surface in the widget tree. Returns
/// `0` for an unknown handle.
#[no_mangle]
pub extern "C" fn js_webgpu_surface_get_view_ptr(surface_handle: Handle) -> i64 {
    ffi_trace("js_webgpu_surface_get_view_ptr");
    with_handle::<WGPUSurface, _, _>(surface_handle, |s| s.view_ptr).unwrap_or(0)
}

/// The backing (pixel) size and scale of a native view, as JSON:
/// `{"w":<points>,"h":<points>,"pw":<pixels>,"ph":<pixels>,"scale":<f>}`.
///
/// Empty string for a null/unsupported view.
///
/// # Why a host needs this
///
/// `surfaceConfigure` takes **physical pixels**, and wgpu-hal sizes the
/// CAMetalLayer's drawable to exactly that value with `kCAGravityTopLeft` and
/// **no stretching**. If the configured extent and the layer's real backing size
/// disagree, CoreAnimation scales the presented frame to fit — non-uniformly
/// when the aspect ratios differ — and the picture comes out squashed with no
/// error reported anywhere.
///
/// The view is the only trustworthy source for its own size. A host that
/// assumes one instead (the nikke example hardcoded its centre panel's
/// dimensions, 852x814 points, while perry-ui laid the view out to fill the
/// window at 1440x932) configures a perfectly valid-looking swapchain and
/// presents a distorted image.
///
/// Declared `i64_str` in the manifest; the returned `i64` is a
/// `*StringHeader` address.
#[no_mangle]
pub extern "C" fn js_webgpu_view_backing_size(view_ptr: i64) -> i64 {
    ffi_trace("js_webgpu_view_backing_size");
    let json = surface_view::backing_size_json(view_ptr).unwrap_or_default();
    if std::env::var_os("PERRY_WEBGPU_TRACE").is_some() {
        eprintln!("[webgpu]   view_backing_size {json}");
    }
    perry_ffi::alloc_string(&json).as_raw() as i64
}

/// Walk the window's view tree and list every BloomView host, with size and
/// parent class.
///
/// The host holds one view pointer and keeps presenting into it, so a second
/// BloomView elsewhere in the tree — or the original one being replaced after the
/// UI re-renders — is invisible from the geometry alone. This enumerates them so
/// "which view is mine, and is it the one on screen?" is answerable instead of
/// inferred.
#[no_mangle]
pub extern "C" fn js_webgpu_list_bloom_views(view_ptr: i64) -> i64 {
    ffi_trace("js_webgpu_list_bloom_views");
    let json = surface_view::list_bloomviews_json(view_ptr).unwrap_or_else(|| String::from("[]"));
    if std::env::var_os("PERRY_WEBGPU_TRACE").is_some() {
        eprintln!("[webgpu]   list_bloomviews {json}");
    }
    perry_ffi::alloc_string(&json).as_raw() as i64
}

/// `navigator.gpu.getPreferredCanvasFormat()` (queried per-surface so we
/// can validate it against the chosen adapter). Returns the surface's
/// first supported format as a string, or `"bgra8unorm"` if the handle
/// pair is unknown. The returned `i64` is a `*StringHeader` address —
/// declared `i64_str` in the manifest.
#[no_mangle]
pub extern "C" fn js_webgpu_surface_get_preferred_format(
    surface_handle: Handle,
    adapter_handle: Handle,
) -> i64 {
    ffi_trace("js_webgpu_surface_get_preferred_format");
    let fmt = with_handle::<WGPUSurface, _, _>(surface_handle, |s| {
        with_handle::<WGPUAdapter, _, _>(adapter_handle, |a| {
            s.surface.get_capabilities(&a.0).formats.first().copied()
        })
        .flatten()
    })
    .flatten();
    let name = fmt.map(surface_format_to_str).unwrap_or("bgra8unorm");
    perry_ffi::alloc_string(name).as_raw() as i64
}

/// `context.configure(configuration)` — bind the surface to a device and
/// swapchain format. `descriptor` is the JSON form of a
/// `GPUCanvasConfiguration` extended with the native swapchain knobs:
/// `{ device, format, usage?, alphaMode?, width, height, presentMode?,
/// viewFormats? }`. `width`/`height` are required here (the browser
/// reads them from the canvas element; natively we have no element).
///
/// # Safety
///
/// `descriptor_ptr` must be a Perry-runtime `StringHeader`.
#[no_mangle]
pub unsafe extern "C" fn js_webgpu_surface_configure(
    surface_handle: Handle,
    descriptor_ptr: *const StringHeader,
) {
    ffi_trace("js_webgpu_surface_configure");
    #[derive(Deserialize)]
    struct CanvasConfig {
        device: Handle,
        format: String,
        #[serde(default)]
        usage: Option<u32>,
        #[serde(rename = "alphaMode", default)]
        alpha_mode: Option<String>,
        width: u32,
        height: u32,
        #[serde(rename = "presentMode", default)]
        present_mode: Option<String>,
        #[serde(rename = "viewFormats", default)]
        view_formats: Vec<String>,
    }

    let Some(json) = read_str(descriptor_ptr) else {
        return;
    };
    let cfg: CanvasConfig = match serde_json::from_str(&json) {
        Ok(c) => c,
        Err(_) => return,
    };

    // Log the requested swapchain extent. wgpu-hal sets the CAMetalLayer drawable
    // to exactly this size with `kCAGravityTopLeft` and no stretching, so if it
    // disagrees with the layer's real backing size the presented image is scaled
    // or clipped by CoreAnimation — which reads on screen as a squashed or
    // partial picture rather than as an error.
    if std::env::var_os("PERRY_WEBGPU_TRACE").is_some() {
        eprintln!(
            "[webgpu]   surface_configure {}x{} format={} present={:?} usage={:?}",
            cfg.width, cfg.height, cfg.format, cfg.present_mode, cfg.usage
        );
    }

    let config = wgpu::SurfaceConfiguration {
        // Spec default for a canvas context is RENDER_ATTACHMENT.
        usage: cfg
            .usage
            .map(wgpu::TextureUsages::from_bits_truncate)
            .unwrap_or(wgpu::TextureUsages::RENDER_ATTACHMENT),
        format: parse_texture_format(&cfg.format),
        // wgpu 30: required. `Auto` reproduces wgpu's historical behaviour
        // (sRGB for 8-bit formats, extended sRGB linear for `Rgba16Float`),
        // which is exactly what a browser canvas context picks.
        color_space: wgpu::SurfaceColorSpace::Auto,
        width: cfg.width.max(1),
        height: cfg.height.max(1),
        present_mode: parse_present_mode(cfg.present_mode.as_deref()),
        alpha_mode: parse_alpha_mode(cfg.alpha_mode.as_deref()),
        view_formats: cfg
            .view_formats
            .iter()
            .map(|s| parse_texture_format(s))
            .collect(),
        // macOS FIFO swapchain deadlocks when >1 frame is in
        // flight and the JS pump is slower than the GPU.
        desired_maximum_frame_latency: 2,
    };

    let _ = with_handle::<WGPUSurface, _, _>(surface_handle, |s| {
        let applied = with_handle::<WGPUDevice, _, _>(cfg.device, |d| {
            s.surface.configure(&d.0, &config);
        })
        .is_some();
        if applied {
            *s.config.lock() = Some(config.clone());
            // wgpu 30 presents through `Queue::present`, so keep this surface's
            // own clone of the queue. `sync_queue_slot` is the only place it
            // lives (wgpu has no `Device::queue()`); `deviceGetQueueSync` only
            // clones it out, so it stays available here. `wgpu::Queue` is an
            // `Arc` internally — this is a refcount bump.
            *s.queue.lock() = sync_queue_slot().lock().unwrap().get(&cfg.device).cloned();
            #[cfg(target_os = "windows")]
            {
                *s.configured_device.lock() = cfg.device;
                *s.configured_root.lock() = win32::root_of(s.view_ptr);
                win32::diag("surfaceConfigure", s.view_ptr);
            }
        }
    });
}

/// `context.getCurrentTexture()` — acquire the next swapchain image.
/// Returns a texture handle (a [`WGPUSurfaceTexture`]) usable with
/// `textureCreateView` exactly like a device texture; the view is the
/// render-pass color attachment for this frame. Returns `0` if the
/// surface is unconfigured or the swapchain is lost (reconfigure and
/// retry, per the spec). Call `surfacePresent` after submitting the
/// frame's command buffers.
/// #5812 item 5 — rebind the swapchain after the backing window was
/// reparented. perry-ui creates widget HWNDs under a hidden *message-only*
/// parking window (`HWND_MESSAGE`) and moves them into the real app window
/// when the body mounts — typically AFTER `surfaceConfigure` already built
/// the swapchain. A DXGI swapchain created while its HWND hung under a
/// message-only window is outside DWM's composition tree: `Present`
/// succeeds forever but the content never reaches the screen (the reported
/// gray window). Re-`configure` alone doesn't help — wgpu's dx12 backend
/// calls `ResizeBuffers` on the *existing* swapchain, keeping the stale
/// binding — so on a top-level-ancestor change we recreate the
/// `wgpu::Surface` itself and configure the fresh one, which goes through
/// `CreateSwapChainForHwnd` against the HWND's current (visible) ancestry.
///
/// Lock discipline: the DashMap write borrow (`with_handle_mut`) never
/// nests another handle lookup — the device configure runs under the same
/// read-borrow pattern `surfaceConfigure` already uses.
#[cfg(target_os = "windows")]
fn rebind_surface_if_reparented(surface_handle: Handle) {
    // Debug escape hatch (bisection only): reproduce the pre-fix behavior.
    if std::env::var_os("PERRY_WEBGPU_NO_REBIND").is_some() {
        return;
    }
    // Cheap read: has the top-level ancestor changed since configure?
    let needs = with_handle::<WGPUSurface, _, _>(surface_handle, |s| {
        let root_now = win32::root_of(s.view_ptr);
        let cfg_root = *s.configured_root.lock();
        if cfg_root != 0 && root_now != 0 && root_now != cfg_root {
            Some((s.view_ptr, root_now))
        } else {
            None
        }
    })
    .flatten();
    let Some((view_ptr, root_now)) = needs else {
        return;
    };
    win32::diag("getCurrentTexture: window reparented — rebinding", view_ptr);

    // Build the replacement surface outside any handle borrow.
    let Some((window_handle, display_handle)) = surface_view::wrap(view_ptr) else {
        return;
    };
    // wgpu 30: `SurfaceTargetUnsafe::RawHandle`'s two fields became `Option<...>`.
    let target = wgpu::SurfaceTargetUnsafe::RawHandle {
        raw_display_handle: Some(display_handle),
        raw_window_handle: window_handle,
    };
    // SAFETY: `view_ptr` referenced a live view when the surface was
    // created and the caller keeps it alive for the surface's lifetime
    // (same contract as `surfaceFromNativeView`).
    let new_surface = match unsafe { instance().create_surface_unsafe(target) } {
        Ok(s) => s,
        Err(e) => {
            eprintln!("webgpu surfaceGetCurrentTexture: rebind create_surface failed: {e}");
            return;
        }
    };

    // Swap it in under the write borrow (drops the old surface + its
    // stale swapchain), then configure under read borrows.
    let swapped = perry_ffi::with_handle_mut::<WGPUSurface, _, _>(surface_handle, |s| {
        *s.current.lock() = None; // stale frame from the old swapchain
        s.surface = new_surface;
    })
    .is_some();
    if !swapped {
        return;
    }
    let _ = with_handle::<WGPUSurface, _, _>(surface_handle, |s| {
        let device = *s.configured_device.lock();
        let config = s.config.lock().clone();
        if let Some(config) = config {
            let applied = with_handle::<WGPUDevice, _, _>(device, |d| {
                s.surface.configure(&d.0, &config);
            })
            .is_some();
            if applied {
                *s.configured_root.lock() = root_now;
                win32::diag("getCurrentTexture: swapchain recreated", s.view_ptr);
            } else {
                eprintln!(
                    "webgpu surfaceGetCurrentTexture: reparent rebind failed \
                     (device handle {device} gone?)"
                );
            }
        }
    });
}

#[no_mangle]
pub extern "C" fn js_webgpu_surface_get_current_texture(surface_handle: Handle) -> Handle {
    ffi_trace("js_webgpu_surface_get_current_texture");
    // #5812 item 5 (Windows): while the backing HWND is not visible —
    // parked under perry-ui's hidden parking window before `App()` mounts
    // the body, or the app window is hidden — report "not presentable
    // yet" (0) instead of acquiring. Presents against an invisible child
    // are never consumed by DWM, so after the swapchain queue fills
    // (buffer count + frame latency ≈ 10 frames) the next acquire blocks
    // the main thread FOREVER — before `App()` even runs. Returning 0
    // matches the macOS "view not yet on screen; wait + retry" contract
    // the render-loop examples already handle, and lets bounded-burst
    // renderers survive the mount instead of exhausting their frames
    // into the invisible parking window (the reporter's "15 frames
    // present fine but the window stays gray").
    #[cfg(target_os = "windows")]
    {
        let visible = with_handle::<WGPUSurface, _, _>(surface_handle, |s| {
            let v = win32::is_visible(s.view_ptr);
            if !v {
                win32::diag("getCurrentTexture: view not visible — not presentable", s.view_ptr);
            }
            v
        })
        .unwrap_or(false);
        if !visible {
            return 0;
        }
        rebind_surface_if_reparented(surface_handle);
    }

    let acquired = with_handle::<WGPUSurface, _, _>(surface_handle, |s| {
        // wgpu 30: `get_current_texture()` returns a `CurrentSurfaceTexture`
        // status enum instead of a `Result`. `Success`/`Suboptimal` carry the
        // acquired texture (`Suboptimal` only means the config is stale — the
        // texture is still presentable). The rest mean "no frame this round".
        match s.surface.get_current_texture() {
            wgpu::CurrentSurfaceTexture::Success(st)
            | wgpu::CurrentSurfaceTexture::Suboptimal(st) => {
                *s.current.lock() = Some(st);
                true
            }
            status => {
                eprintln!("webgpu surfaceGetCurrentTexture: {status:?} — skipping frame");
                false
            }
        }
    })
    .unwrap_or(false);
    if !acquired {
        return 0;
    }

    let tex_handle = register_handle(WGPUSurfaceTexture { surface_handle });
    // Drop a prior frame's handle the caller never presented, so the
    // registry doesn't grow one entry per frame.
    let _ = with_handle_unlocked::<WGPUSurface, _, _>(surface_handle, |s| {
        let prev = std::mem::replace(&mut *s.issued_tex.lock(), tex_handle);
        if prev != 0 {
            let _ = take_handle::<WGPUSurfaceTexture>(prev);
            drop_handle(prev);
        }
    });
    tex_handle
}

/// Present the frame previously acquired by `getCurrentTexture`. The
/// browser presents implicitly at the end of the task that drew; native
/// wgpu requires an explicit hand-back, so this is a spec-extra (the one
/// call a ported render loop must add). No-op if nothing is in flight.
#[no_mangle]
pub extern "C" fn js_webgpu_surface_present(surface_handle: Handle) {
    ffi_trace("js_webgpu_surface_present");
    let _ = with_handle_unlocked::<WGPUSurface, _, _>(surface_handle, |s| {
        if let Some(st) = s.current.lock().take() {
            // wgpu 30: `SurfaceTexture::present()` is gone — presentation moved
            // to `Queue::present`, which takes the frame BY VALUE (it marks the
            // texture presented internally). The queue is this surface's own
            // clone, captured at `surfaceConfigure`.
            match s.queue.lock().clone() {
                Some(q) => q.present(st),
                None => eprintln!("webgpu surfacePresent: surface has no queue (never configured)"),
            }
            #[cfg(target_os = "windows")]
            win32::diag("surfacePresent", s.view_ptr);
        }
        let prev = std::mem::replace(&mut *s.issued_tex.lock(), 0);
        if prev != 0 {
            let _ = take_handle::<WGPUSurfaceTexture>(prev);
            drop_handle(prev);
        }
    });
}

/// `context.unconfigure()` — drop the swapchain and any in-flight frame.
/// The surface can be re-`configure`d afterwards (e.g. after a resize).
#[no_mangle]
pub extern "C" fn js_webgpu_surface_unconfigure(surface_handle: Handle) {
    ffi_trace("js_webgpu_surface_unconfigure");
    let _ = with_handle_unlocked::<WGPUSurface, _, _>(surface_handle, |s| {
        *s.current.lock() = None;
        *s.config.lock() = None;
        let prev = std::mem::replace(&mut *s.issued_tex.lock(), 0);
        if prev != 0 {
            let _ = take_handle::<WGPUSurfaceTexture>(prev);
            drop_handle(prev);
        }
    });
}

/// Release the surface and, if we created its view, the native view too.
/// Idempotent. (The wgpu `Surface` drops with the wrapper.)
#[no_mangle]
pub extern "C" fn js_webgpu_surface_drop(surface_handle: Handle) {
    ffi_trace("js_webgpu_surface_drop");
    if let Some(s) = take_handle::<WGPUSurface>(surface_handle) {
        let prev = *s.issued_tex.lock();
        if prev != 0 {
            let _ = take_handle::<WGPUSurfaceTexture>(prev);
            drop_handle(prev);
        }
        if s.owned_view != 0 {
            surface_view::destroy(s.owned_view);
        }
    }
    drop_handle(surface_handle);
}

// ─── Per-platform native-view creation ──────────────────────────────
//
// `create` allocates a brand-new GPU-capable view (the `requestSurface`
// path); `wrap` builds raw-window handles from a caller-supplied view
// pointer (the `surfaceFromNativeView` path); `destroy` releases a view
// `create` allocated. Only the host target's arm compiles.
//
// `wrap` needs nothing but `raw-window-handle`, so it is wired on every
// platform that has a single unambiguous window-handle variant. `create`
// is currently implemented for macOS (where wgpu's Metal HAL turns a
// bare `NSView` into a `CAMetalLayer`-backed swapchain for us); other
// desktop targets allocate their view through perry-ui and use `wrap`.
/// Minimal user32 bindings for the reparent-detection fix + `PERRY_WEBGPU_DIAG`
/// window-state logging (#5812). Raw externs — not worth a `windows` crate
/// dependency for four calls.
#[cfg(target_os = "windows")]
mod win32 {
    #[repr(C)]
    pub struct Rect {
        pub left: i32,
        pub top: i32,
        pub right: i32,
        pub bottom: i32,
    }

    #[link(name = "user32")]
    extern "system" {
        fn GetAncestor(hwnd: isize, ga_flags: u32) -> isize;
        fn GetParent(hwnd: isize) -> isize;
        fn IsWindowVisible(hwnd: isize) -> i32;
        fn GetWindowRect(hwnd: isize, rect: *mut Rect) -> i32;
    }

    const GA_ROOT: u32 = 2;

    /// Top-level ancestor of `hwnd` (the window DWM composes it under).
    pub fn root_of(hwnd: i64) -> i64 {
        unsafe { GetAncestor(hwnd as isize, GA_ROOT) as i64 }
    }

    /// Whole-chain visibility: false while the window (or any ancestor —
    /// e.g. perry-ui's hidden parking window) is not shown.
    pub fn is_visible(hwnd: i64) -> bool {
        unsafe { IsWindowVisible(hwnd as isize) != 0 }
    }

    /// One-line window-state dump, gated on `PERRY_WEBGPU_DIAG=1`.
    pub fn diag(tag: &str, hwnd: i64) {
        if std::env::var_os("PERRY_WEBGPU_DIAG").is_none() {
            return;
        }
        unsafe {
            let mut rc = Rect {
                left: 0,
                top: 0,
                right: 0,
                bottom: 0,
            };
            GetWindowRect(hwnd as isize, &mut rc);
            eprintln!(
                "[webgpu diag] {tag}: hwnd={hwnd:#x} visible={} parent={:#x} root={:#x} rect=({},{})-({},{})",
                IsWindowVisible(hwnd as isize),
                GetParent(hwnd as isize) as i64,
                root_of(hwnd),
                rc.left,
                rc.top,
                rc.right,
                rc.bottom,
            );
        }
    }
}

mod surface_view {
    use raw_window_handle::{RawDisplayHandle, RawWindowHandle};

    pub struct NativeView {
        pub view_ptr: i64,
        pub window_handle: RawWindowHandle,
        pub display_handle: RawDisplayHandle,
    }

    #[cfg(target_os = "macos")]
    pub fn create(width: u32, height: u32) -> Option<NativeView> {
        use objc2::rc::Retained;
        use objc2::MainThreadOnly;
        use objc2_app_kit::NSView;
        use objc2_foundation::{MainThreadMarker, NSPoint, NSRect, NSSize};
        use raw_window_handle::{AppKitDisplayHandle, AppKitWindowHandle};
        use std::ptr::NonNull;

        // A swapchain view must be created on the main thread — bail
        // clearly rather than tripping AppKit's own assertion deep in
        // wgpu if a worker called us.
        let Some(mtm) = MainThreadMarker::new() else {
            eprintln!("webgpu requestSurface: must be called on the main thread");
            return None;
        };
        let frame = NSRect::new(
            NSPoint::new(0.0, 0.0),
            NSSize::new(width as f64, height as f64),
        );
        // Standard AppKit alloc/init on the main thread (`mtm` proves it).
        let view = {
            let v = NSView::initWithFrame(NSView::alloc(mtm), frame);
            // `wantsLayer` lets wgpu attach a CAMetalLayer to this view.
            v.setWantsLayer(true);
            v
        };
        // Leak a +1 reference: the surface owns the view for its
        // lifetime. perry-ui's `embedNativeView` retains its own +1, so
        // the view survives until both release it. `destroy` reclaims
        // this ref.
        let raw: *mut NSView = Retained::into_raw(view);
        let ns_view = NonNull::new(raw as *mut std::ffi::c_void)?;
        Some(NativeView {
            view_ptr: raw as i64,
            window_handle: RawWindowHandle::AppKit(AppKitWindowHandle::new(ns_view)),
            display_handle: RawDisplayHandle::AppKit(AppKitDisplayHandle::new()),
        })
    }

    #[cfg(not(target_os = "macos"))]
    pub fn create(_width: u32, _height: u32) -> Option<NativeView> {
        // Only macOS can allocate the view itself today. On other
        // platforms the toolkit owns view creation — make the view via
        // perry-ui and adopt it with `surfaceFromNativeView`.
        eprintln!(
            "webgpu requestSurface: window creation is only wired on macOS; \
             create the platform view via perry-ui and pass its pointer to \
             surfaceFromNativeView()"
        );
        None
    }

    #[cfg(target_os = "macos")]
    pub fn destroy(view_ptr: i64) {
        use objc2::rc::Retained;
        use objc2_app_kit::NSView;
        if view_ptr == 0 {
            return;
        }
        // Reclaim the +1 leaked in `create`; dropping releases it.
        // SAFETY: `view_ptr` came from `Retained::into_raw` in `create`
        // and is released exactly once (guarded by `owned_view != 0`).
        unsafe {
            let _ = Retained::from_raw(view_ptr as *mut NSView);
        }
    }

    #[cfg(not(target_os = "macos"))]
    pub fn destroy(_view_ptr: i64) {}

    /// The view's size in points and in backing pixels, as JSON.
    ///
    /// `surfaceConfigure` wants PHYSICAL pixels, and wgpu-hal gives the
    /// CAMetalLayer exactly that drawable size with `kCAGravityTopLeft` and
    /// **no stretching**. So when the configured extent disagrees with the
    /// layer's real backing size, CoreAnimation scales the presented image to
    /// fit — non-uniformly if the two aspect ratios differ — and the result is a
    /// squashed picture with no error anywhere.
    ///
    /// The only trustworthy source for "how big is this view" is the view. A
    /// host that instead assumes a size (this example hardcoded its centre
    /// panel's dimensions while perry-ui laid the view out to fill the window,
    /// 852x814 assumed vs 1440x932 actual) configures something that looks
    /// perfectly valid and presents a distorted frame.
    #[cfg(target_os = "macos")]
    pub fn backing_size_json(view_ptr: i64) -> Option<String> {
        use objc2_app_kit::NSView;
        if view_ptr == 0 {
            return None;
        }
        // SAFETY: the caller passes a live NSView pointer — in the native
        // pattern that is perry-ui's BloomView handle, already validated by the
        // surface it was used to create.
        let view: &NSView = unsafe { &*(view_ptr as *const NSView) };
        let bounds = view.bounds();
        let backing = view.convertRectToBacking(bounds);
        let (w, h) = (bounds.size.width, bounds.size.height);
        let (pw, ph) = (backing.size.width, backing.size.height);
        let scale = if w > 0.0 && h > 0.0 { pw / w } else { 0.0 };

        // Position and visibility matter as much as size: a view can report a
        // perfectly good 852x814 while the layout clips it to a sliver or parks
        // it off the visible area, and then the rendered frame is correct,
        // presented, and invisible. Report:
        //   fx/fy  frame origin in the SUPERVIEW's coordinates (where the layout
        //          actually put it)
        //   vis    1 when the view and its ancestors are all visible
        //   sup    1 when it has a superview at all
        let frame = view.frame();
        let (fx, fy) = (frame.origin.x, frame.origin.y);
        // `isHidden` / `superview` are `unsafe` in objc2 0.3 — the caller already
        // guarantees a live NSView pointer (see the SAFETY note above), so the
        // extra assertions here are covered by that same contract.
        let (hidden, has_super) = unsafe { (view.isHidden(), view.superview().is_some()) };
        let vis = if has_super && !hidden { 1 } else { 0 };

        // Identity, not just size.
        //
        // A host hands over a view pointer once and keeps presenting into it. If
        // the UI layer later frees that view, the address can be reallocated for
        // something else entirely (observed: a 36x36 thumbnail image view reused
        // the address of the 852x814 GPU view), and the same pointer then reports
        // a completely different geometry. The class name and the window
        // membership are what distinguish "our view got resized" from "our view is
        // gone and something else owns the address".
        let cls = {
            let c: *const std::ffi::c_char = unsafe {
                objc2::ffi::object_getClassName(view as *const NSView as *const _)
            };
            if c.is_null() {
                String::from("?")
            } else {
                unsafe { std::ffi::CStr::from_ptr(c) }
                    .to_string_lossy()
                    .into_owned()
            }
        };
        // Walk up to the window, bounded, to prove the view is still in a live
        // window hierarchy and to see how deep it sits.
        let mut depth = 0usize;
        let mut has_window = false;
        {
            let mut cur: Option<objc2::rc::Retained<NSView>> =
                unsafe { view.superview() };
            while let Some(v) = cur {
                depth += 1;
                if unsafe { v.window() }.is_some() {
                    has_window = true;
                    break;
                }
                if depth >= 16 {
                    break;
                }
                cur = unsafe { v.superview() };
            }
        }
        // Which window, and is that window actually on screen?
        //
        // Being in *a* window is not the same as being visible: perry-ui builds
        // widgets under a hidden parking window and reparents them into the real
        // app window on mount (the same pattern its Windows backend uses). A GPU
        // view left in the parking window reports perfectly good geometry,
        // presents every frame, and is never seen. The window's title, its
        // visibility, and its size are what separate the two cases.
        let (win_title, win_visible, win_w, win_h, win_onscreen) = unsafe {
            use objc2::msg_send;
            match view.window() {
                Some(w) => {
                    let t = w.title();
                    let frame = w.frame();
                    // occlusionState bit 1 == NSWindowOcclusionStateVisible
                    let occ: usize = msg_send![&w, occlusionState];
                    (
                        t.to_string(),
                        w.isVisible(),
                        frame.size.width,
                        frame.size.height,
                        (occ & 2) != 0,
                    )
                }
                None => (String::new(), false, 0.0, 0.0, false),
            }
        };
        // Ancestor chain: sizes AND classes.
        //
        // The view ends up 36x36 points while the swapchain stays 1704x1628, so
        // something in the layout collapsed it. Which element collapsed decides
        // where the fix belongs, and the parent's size is the cheapest way to
        // tell: if the immediate container is also ~36 wide the stack itself
        // collapsed, and if the container is full width then this child alone was
        // shrunk.
        let mut chain = String::new();
        {
            let mut cur: Option<objc2::rc::Retained<NSView>> = unsafe { view.superview() };
            let mut i = 0;
            while let Some(v) = cur {
                let b = v.bounds().size;
                let cn: *const std::ffi::c_char = unsafe {
                    objc2::ffi::object_getClassName(&*v as *const NSView as *const _)
                };
                let name = if cn.is_null() {
                    String::from("?")
                } else {
                    unsafe { std::ffi::CStr::from_ptr(cn) }.to_string_lossy().into_owned()
                };
                // Include the PARENT POINTER, not just its size.
                //
                // "the view shrank" and "the view was moved into a different
                // container that happens to be small" look identical in the
                // geometry, and they need opposite fixes. The pointer tells them
                // apart: a different pointer means the layout re-parented it, the
                // same pointer means the original container was resized.
                if i > 0 {
                    chain.push('|');
                }
                chain.push_str(&format!(
                    "{}@{:p}:{}x{}",
                    name,
                    objc2::rc::Retained::as_ptr(&v) as *const std::ffi::c_void,
                    b.width,
                    b.height
                ));
                i += 1;
                if i >= 4 {
                    break;
                }
                cur = unsafe { v.superview() };
            }
        }
        Some(format!(
            "{{\"w\":{w},\"h\":{h},\"pw\":{pw},\"ph\":{ph},\"scale\":{scale},\
             \"fx\":{fx},\"fy\":{fy},\"vis\":{vis},\"sup\":{},\"hid\":{},\
             \"cls\":\"{cls}\",\"depth\":{depth},\"win\":{},\
             \"wt\":\"{win_title}\",\"wv\":{},\"ww\":{win_w},\"wh\":{win_h},\"wos\":{},\
             \"chain\":\"{chain}\"}}",
            if has_super { 1 } else { 0 },
            if hidden { 1 } else { 0 },
            if has_window { 1 } else { 0 },
            if win_visible { 1 } else { 0 },
            if win_onscreen { 1 } else { 0 },
        ))  
    }

    #[cfg(not(target_os = "macos"))]
    pub fn backing_size_json(_view_ptr: i64) -> Option<String> {
        None
    }

    /// List every BloomView host in the window's view tree.
    ///
    /// Walks from the window's `contentView` and reports each view whose class
    /// name contains `BloomView`, with its size, its parent's class and size, and
    /// how deep it sits. The host has exactly one of these; seeing two (or
    /// seeing the original survive while the app reads a different one) is what
    /// separates "the UI replaced my view" from "my view is fine and the picture
    /// is simply not being drawn".
    #[cfg(target_os = "macos")]
    pub fn list_bloomviews_json(view_ptr: i64) -> Option<String> {
        use objc2_app_kit::{NSView, NSWindow};

        if view_ptr == 0 {
            return None;
        }
        // SAFETY: caller passes a live NSView pointer, same contract as
        // `backing_size_json`.
        let view: &NSView = unsafe { &*(view_ptr as *const NSView) };
        let window: Option<objc2::rc::Retained<NSWindow>> = unsafe { view.window() };
        let window = window?;
        let root: objc2::rc::Retained<NSView> = unsafe { window.contentView() }?;

        fn class_of(v: &NSView) -> String {
            let c: *const std::ffi::c_char =
                unsafe { objc2::ffi::object_getClassName(v as *const NSView as *const _) };
            if c.is_null() {
                String::from("?")
            } else {
                unsafe { std::ffi::CStr::from_ptr(c) }.to_string_lossy().into_owned()
            }
        }

        let mut found: Vec<String> = Vec::new();
        // Iterative DFS with an explicit stack: the tree is small (a few dozen
        // views) and this keeps the borrow scopes obvious.
        let mut stack: Vec<(objc2::rc::Retained<NSView>, usize)> = vec![(root, 0)];
        let mut budget = 4000usize;
        while let Some((v, depth)) = stack.pop() {
            budget -= 1;
            if budget == 0 {
                break;
            }
            let cls = class_of(&v);
            if cls.contains("BloomView") {
                let b = v.bounds().size;
                let parent = unsafe { v.superview() };
                let (pcls, pw, ph) = match &parent {
                    Some(p) => {
                        let ps = p.bounds().size;
                        (class_of(p), ps.width, ps.height)
                    }
                    None => (String::from("<none>"), 0.0, 0.0),
                };
                found.push(format!(
                    "{{\"cls\":\"{cls}\",\"w\":{},\"h\":{},\"parent\":\"{pcls}\",\
                     \"pw\":{pw},\"ph\":{ph},\"depth\":{depth}}}",
                    b.width, b.height
                ));
            }
            let subs = unsafe { v.subviews() };
            for s in subs.iter() {
                stack.push((s, depth + 1));
            }
        }
        Some(format!("[{}]", found.join(",")))
    }

    #[cfg(not(target_os = "macos"))]
    pub fn list_bloomviews_json(_view_ptr: i64) -> Option<String> {
        None
    }

    /// Build `(window, display)` raw handles from a caller-supplied
    /// native view pointer. Returns `None` on platforms whose handle is
    /// ambiguous from a single pointer (e.g. X11/Wayland, which also
    /// need a display connection) — those need a richer entry point.
    #[allow(unused_variables)]
    pub fn wrap(view_ptr: i64) -> Option<(RawWindowHandle, RawDisplayHandle)> {
        // Windows wraps an integer HWND (NonZeroIsize) and the fallback
        // arm wraps nothing — only the pointer-handle platforms need
        // NonNull, so scope the import to them to stay warning-free.
        #[cfg(any(target_os = "macos", target_os = "ios", target_os = "android"))]
        use std::ptr::NonNull;
        #[cfg(target_os = "macos")]
        {
            use raw_window_handle::{AppKitDisplayHandle, AppKitWindowHandle};
            let v = NonNull::new(view_ptr as *mut std::ffi::c_void)?;
            Some((
                RawWindowHandle::AppKit(AppKitWindowHandle::new(v)),
                RawDisplayHandle::AppKit(AppKitDisplayHandle::new()),
            ))
        }
        #[cfg(target_os = "ios")]
        {
            use raw_window_handle::{UiKitDisplayHandle, UiKitWindowHandle};
            let v = NonNull::new(view_ptr as *mut std::ffi::c_void)?;
            Some((
                RawWindowHandle::UiKit(UiKitWindowHandle::new(v)),
                RawDisplayHandle::UiKit(UiKitDisplayHandle::new()),
            ))
        }
        #[cfg(target_os = "windows")]
        {
            use raw_window_handle::{Win32WindowHandle, WindowsDisplayHandle};
            let hwnd = std::num::NonZeroIsize::new(view_ptr as isize)?;
            Some((
                RawWindowHandle::Win32(Win32WindowHandle::new(hwnd)),
                RawDisplayHandle::Windows(WindowsDisplayHandle::new()),
            ))
        }
        #[cfg(target_os = "android")]
        {
            use raw_window_handle::{AndroidDisplayHandle, AndroidNdkWindowHandle};
            // `view_ptr` is an `ANativeWindow*` (e.g. from
            // `ANativeWindow_fromSurface`), not a Java `View`.
            let w = NonNull::new(view_ptr as *mut std::ffi::c_void)?;
            Some((
                RawWindowHandle::AndroidNdk(AndroidNdkWindowHandle::new(w)),
                RawDisplayHandle::Android(AndroidDisplayHandle::new()),
            ))
        }
        #[cfg(not(any(
            target_os = "macos",
            target_os = "ios",
            target_os = "windows",
            target_os = "android"
        )))]
        {
            // X11/Wayland need a display connection alongside the window,
            // which a single pointer can't carry — see the README's
            // platform-status note.
            eprintln!(
                "webgpu surfaceFromNativeView: not wired on this platform \
                 (X11/Wayland need a display handle too)"
            );
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_buffer_bindings() {
        assert!(matches!(
            parse_buffer_binding_type("uniform"),
            wgpu::BufferBindingType::Uniform
        ));
        assert!(matches!(
            parse_buffer_binding_type("storage"),
            wgpu::BufferBindingType::Storage { read_only: false }
        ));
        assert!(matches!(
            parse_buffer_binding_type("read-only-storage"),
            wgpu::BufferBindingType::Storage { read_only: true }
        ));
        // unknown defaults to uniform — same fallback the spec uses.
        assert!(matches!(
            parse_buffer_binding_type("garbage"),
            wgpu::BufferBindingType::Uniform
        ));
    }

    #[test]
    fn parse_view_dim_defaults_2d() {
        assert!(matches!(
            parse_view_dimension(None),
            wgpu::TextureViewDimension::D2
        ));
        assert!(matches!(
            parse_view_dimension(Some("3d")),
            wgpu::TextureViewDimension::D3
        ));
        assert!(matches!(
            parse_view_dimension(Some("cube")),
            wgpu::TextureViewDimension::Cube
        ));
    }

    #[test]
    fn parse_format_known_and_fallback() {
        assert!(matches!(
            parse_texture_format("rgba8unorm"),
            wgpu::TextureFormat::Rgba8Unorm
        ));
        assert!(matches!(
            parse_texture_format("depth32float"),
            wgpu::TextureFormat::Depth32Float
        ));
        // Unknown format falls back to rgba8unorm — see fn doc comment.
        assert!(matches!(
            parse_texture_format("definitely-not-a-format"),
            wgpu::TextureFormat::Rgba8Unorm
        ));
    }

    #[test]
    fn buffer_descriptor_round_trip() {
        let json = r#"{"size": 1024, "usage": 140, "mappedAtCreation": true}"#;
        let d: BufferDescriptor = serde_json::from_str(json).unwrap();
        assert_eq!(d.size, 1024);
        assert_eq!(d.usage, 140);
        assert!(d.mapped_at_creation);
        assert!(d.label.is_none());
    }

    #[test]
    fn bind_group_layout_descriptor_buffer_entry() {
        let json = r#"{
            "entries": [
              {"binding": 0, "visibility": 4, "buffer": {"type": "storage"}},
              {"binding": 1, "visibility": 4, "buffer": {"type": "read-only-storage"}}
            ]
        }"#;
        let d: BglDescriptor = serde_json::from_str(json).unwrap();
        assert_eq!(d.entries.len(), 2);
        assert_eq!(d.entries[0].binding, 0);
        assert_eq!(d.entries[0].visibility, 4);
        assert_eq!(
            d.entries[0].buffer.as_ref().unwrap().ty,
            "storage".to_string()
        );
    }

    #[test]
    fn pipeline_layout_descriptor_handles() {
        let json = r#"{"bindGroupLayouts": [42, 99]}"#;
        let d: PipelineLayoutDescriptor = serde_json::from_str(json).unwrap();
        assert_eq!(d.bind_group_layouts, vec![42i64, 99i64]);
    }

    #[test]
    fn compute_pipeline_descriptor_layout_auto() {
        let json = r#"{
            "layout": "auto",
            "compute": {"module": 5, "entryPoint": "main"}
        }"#;
        let d: ComputePipelineDescriptor = serde_json::from_str(json).unwrap();
        assert!(matches!(d.layout, serde_json::Value::String(ref s) if s == "auto"));
        assert_eq!(d.compute.module, 5);
        assert_eq!(d.compute.entry_point.as_deref(), Some("main"));
    }

    #[test]
    fn compute_pipeline_descriptor_layout_handle() {
        let json = r#"{
            "layout": 7,
            "compute": {"module": 5}
        }"#;
        let d: ComputePipelineDescriptor = serde_json::from_str(json).unwrap();
        assert!(matches!(d.layout, serde_json::Value::Number(_)));
        assert!(d.compute.entry_point.is_none());
    }

    #[test]
    fn bind_group_descriptor_buffer_entry() {
        let json = r#"{
            "layout": 1,
            "entries": [
              {"binding": 0, "resource": {"buffer": 5, "offset": 0, "size": 64}}
            ]
        }"#;
        let d: BindGroupDescriptor = serde_json::from_str(json).unwrap();
        assert_eq!(d.layout, 1);
        assert_eq!(d.entries.len(), 1);
        match &d.entries[0].resource {
            BindGroupResource::Buffer(b) => {
                assert_eq!(b.buffer, 5);
                assert_eq!(b.size, 64);
            }
            _ => panic!("expected Buffer resource"),
        }
    }

    #[test]
    fn texture_descriptor_round_trip() {
        let json = r#"{
            "size": {"width": 256, "height": 256},
            "format": "rgba8unorm",
            "usage": 18,
            "viewFormats": ["rgba8unorm-srgb"]
        }"#;
        let d: TextureDescriptor = serde_json::from_str(json).unwrap();
        assert_eq!(d.size.width, 256);
        assert_eq!(d.size.height, 256);
        assert_eq!(d.size.depth_or_array_layers, 1); // default
        assert_eq!(d.format, "rgba8unorm");
        assert_eq!(d.usage, 18);
        assert_eq!(d.view_formats, vec!["rgba8unorm-srgb".to_string()]);
    }

    #[test]
    fn sampler_descriptor_defaults() {
        let json = r#"{}"#;
        let d: SamplerDescriptor = serde_json::from_str(json).unwrap();
        assert!(d.address_mode_u.is_none());
        assert!(d.compare.is_none());
        assert_eq!(d.lod_min_clamp, 0.0);
        assert_eq!(d.lod_max_clamp, 32.0); // default
        assert_eq!(d.max_anisotropy, 1); // default
    }

    #[test]
    fn render_pipeline_descriptor_minimal() {
        // Vertex stage only, no fragment, layout: "auto" — exercises
        // the most-defaulted path through the parser.
        let json = r#"{
            "layout": "auto",
            "vertex": {"module": 7}
        }"#;
        let d: RenderPipelineDescriptor = serde_json::from_str(json).unwrap();
        assert_eq!(d.vertex.module, 7);
        assert!(d.vertex.buffers.is_empty());
        assert!(d.fragment.is_none());
        assert!(d.depth_stencil.is_none());
    }

    #[test]
    fn render_pipeline_descriptor_full() {
        let json = r#"{
            "layout": 1,
            "vertex": {
                "module": 7,
                "entryPoint": "vs_main",
                "buffers": [
                    {
                        "arrayStride": 32,
                        "stepMode": "vertex",
                        "attributes": [
                            {"format": "float32x3", "offset": 0,  "shaderLocation": 0},
                            {"format": "float32x2", "offset": 12, "shaderLocation": 1}
                        ]
                    }
                ]
            },
            "primitive": {"topology": "triangle-list", "cullMode": "back"},
            "depthStencil": {
                "format": "depth32float",
                "depthWriteEnabled": true,
                "depthCompare": "less"
            },
            "multisample": {"count": 4, "alphaToCoverageEnabled": true},
            "fragment": {
                "module": 8,
                "entryPoint": "fs_main",
                "targets": [
                    {"format": "bgra8unorm", "writeMask": 15}
                ]
            }
        }"#;
        let d: RenderPipelineDescriptor = serde_json::from_str(json).unwrap();
        assert_eq!(d.vertex.buffers.len(), 1);
        assert_eq!(d.vertex.buffers[0].attributes.len(), 2);
        assert_eq!(d.multisample.count, 4);
        assert!(d.multisample.alpha_to_coverage_enabled);
        let frag = d.fragment.as_ref().unwrap();
        assert_eq!(frag.targets.len(), 1);
    }

    #[test]
    fn render_pass_descriptor_with_color_attachment() {
        let json = r#"{
            "colorAttachments": [
                {
                    "view": 5,
                    "loadOp": "clear",
                    "storeOp": "store",
                    "clearValue": {"r": 0.1, "g": 0.2, "b": 0.3, "a": 1.0}
                }
            ]
        }"#;
        let d: RenderPassDescriptor = serde_json::from_str(json).unwrap();
        assert_eq!(d.color_attachments.len(), 1);
        let att = d.color_attachments[0].as_ref().unwrap();
        assert_eq!(att.view, 5);
        assert_eq!(att.load_op.as_deref(), Some("clear"));
    }

    #[test]
    fn bind_group_resource_sampler_and_texture_view() {
        // The new {sampler:n} / {textureView:n} wire shapes — see the
        // module-level doc comment on `BindGroupResource`.
        let json = r#"{
            "layout": 1,
            "entries": [
              {"binding": 0, "resource": {"sampler": 11}},
              {"binding": 1, "resource": {"textureView": 22}},
              {"binding": 2, "resource": {"buffer": 33}}
            ]
        }"#;
        let d: BindGroupDescriptor = serde_json::from_str(json).unwrap();
        assert_eq!(d.entries.len(), 3);
        assert!(matches!(
            d.entries[0].resource,
            BindGroupResource::Sampler { sampler: 11 }
        ));
        assert!(matches!(
            d.entries[1].resource,
            BindGroupResource::TextureView { texture_view: 22 }
        ));
        assert!(matches!(d.entries[2].resource, BindGroupResource::Buffer(_)));
    }

    #[test]
    fn write_texture_call_round_trip() {
        let json = r#"{
            "destination": {
                "texture": 5,
                "mipLevel": 0,
                "origin": {"x": 0, "y": 0, "z": 0},
                "aspect": "all"
            },
            "dataLayout": {"offset": 0, "bytesPerRow": 1024, "rowsPerImage": 256},
            "size": {"width": 256, "height": 256}
        }"#;
        let c: WriteTextureCall = serde_json::from_str(json).unwrap();
        assert_eq!(c.destination.texture, 5);
        assert_eq!(c.data_layout.bytes_per_row, 1024);
        assert_eq!(c.size.width, 256);
    }

    #[test]
    fn query_set_descriptor_round_trip() {
        let d: QuerySetDescriptor =
            serde_json::from_str(r#"{"type": "timestamp", "count": 16}"#).unwrap();
        assert_eq!(d.ty, "timestamp");
        assert_eq!(d.count, 16);
    }

    #[test]
    fn parse_address_mode_defaults_clamp() {
        assert!(matches!(parse_address_mode(None), wgpu::AddressMode::ClampToEdge));
        assert!(matches!(
            parse_address_mode(Some("repeat")),
            wgpu::AddressMode::Repeat
        ));
    }

    #[test]
    fn parse_blend_factor_known_and_fallback() {
        assert!(matches!(
            parse_blend_factor(Some("zero")),
            wgpu::BlendFactor::Zero
        ));
        assert!(matches!(
            parse_blend_factor(Some("one-minus-src-alpha")),
            wgpu::BlendFactor::OneMinusSrcAlpha
        ));
        assert!(matches!(parse_blend_factor(None), wgpu::BlendFactor::One));
        // Unknown falls back to one.
        assert!(matches!(parse_blend_factor(Some("nope")), wgpu::BlendFactor::One));
    }

    // End-to-end wgpu tests need a live GPU adapter, which we can't
    // assume in CI. The wrapper just plumbs through wgpu's public
    // methods, which have their own upstream test coverage. Smoke
    // testing happens via TS integration in release builds (mirrors
    // iroh-bindings' approach).
}
