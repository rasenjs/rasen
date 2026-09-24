Perry v0.5.1654 — give a pumping UI host an agent loop
=====================================================

STATUS: candidate, not yet validated. Baseline (unpatched) behaviour is being
measured first; apply only if the unpatched build fails to load over the network.

WHY THIS IS DIFFERENT FROM THE FAILED v0.5.1647 ATTEMPT
------------------------------------------------------
The earlier attempt drove the LEGACY wait driver (tokio) from the pump and had no
effect, because on v0.5.1647+ fetch no longer uses tokio: `perry-stdlib`'s
reqwest fallback has been removed and fetch is turnloop-only. The missing piece
was never "a tick", it was **agent-loop ownership on the host's thread**.

Meanwhile upstream now ships the entry a host needs, already `pub`, already used
the same way by two other subsystems:

    crates/perry-ext-ioredis/src/turnloop_io.rs:1010   js_loop_turn_bounded(0)
    crates/perry-runtime/src/node_api_host/async_work.rs:266  js_loop_turn_bounded(0)

    pub fn js_loop_turn_bounded(budget_ms: u64) {
        if !agent_loop::eligible() || !agent_loop::ensure_loop() { return; }
        if budget_ms == 0 || !agent_loop::has_outstanding_work() {
            agent_loop::settle_turn();   // non-blocking collect
            return;
        }
        let _ = agent_loop::park_until(deadline);
    }

`ensure_loop()` creates the loop on the CALLING thread and claims the route for
that thread's agent; `budget_ms = 0` then performs one non-blocking turn. That is
exactly a pump tick. So no new runtime API is required — only a C entry point and
a call from the host's main-thread pump.

WHY THE PUMP, AND WHY ONLY THE MAIN-THREAD PUMP
-----------------------------------------------
`claim_route()` gives ownership to the FIRST thread that claims for an agent;
every other thread is then declined for the life of the process. So the claiming
call must come from the thread that will keep driving — the app's main thread.
`js_run_stdlib_pump` is tempting (every UI host calls it, and nothing in the CLI
does), but it is ALSO called from media/audio/location/camera callbacks that may
run on other threads; a claim from one of those would permanently decline the
main thread. The patch therefore targets `perry-ui-macos`'s own NSTimer pump,
which `scheduledTimerWithTimeInterval:` installs on the main run loop.

PATCH
-----
1. crates/perry-runtime/src/event_pump.rs — expose a C-callable driver:

       #[cfg(not(target_arch = "wasm32"))]
       #[no_mangle]
       pub extern "C" fn js_drive_agent_loop() {
           js_loop_turn_bounded(0);
       }

2. crates/perry-ui-macos/src/app.rs — declare it beside js_run_stdlib_pump and
   call it once per pump tick, on the main thread.

TEST
----
    rm -f /tmp/probe-cache.json
    NIKKE_CACHE=/tmp/probe-cache.json PERRY_RUNTIME_DIR=<libs> <perry> \
      compile src/main.ts -o app && ./app

Pass = the cache file is written, the catalogue reports its full row count and
the model reaches `animations[N]`. Anything less means fetch still never
completed.
