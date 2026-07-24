'use strict'
// Minimal CJS stub for nostics (ESM-only dependency of vue-router).
// vue-router uses it only for dev diagnostics — no-op is safe.
function noop() {}
module.exports = {
  defineDiagnostics: () => new Proxy({}, { get: () => noop }),
  createConsoleReporter: () => noop,
  VUE: {},
  ts: {},
}
