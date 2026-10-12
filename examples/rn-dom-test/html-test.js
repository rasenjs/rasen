/**
 * rn-html end-to-end test page.
 *
 * Renders four rows so the screenshot can tell apart "the app is broken" from
 * "a specific tag is broken":
 *
 *   1. CONTROL  — plain rn-dom `Text`       → proves the runtime works at all
 *   2. TEST A   — `div` with a background   → proves HTMLDivElement is created + laid out
 *   3. TEST B   — `div` > `span` with text  → proves Android span renders text
 *   4. TEST C   — `div` with bare textContent → documents the known raw-text gap
 *
 * Run via the example's Metro entry (this file replaces index.js while testing).
 */
const { AppRegistry } = require('react-native')
const { RNDocument } = require('@rasenjs/rn-dom')
const { registerHtmlComponents } = require('@rasenjs/rn-html')
const { name: appName } = require('./app.json')

// Bring the HTML native components into Fabric's view config registry, exactly
// as an app would. rn-dom resolves `div` → `HTMLDivElement` on its own (its
// HTML fallback), this call is what makes the name resolvable.
registerHtmlComponents()

// RN built-ins rn-dom needs for the control row.
require('react-native').View
require('react-native/Libraries/Text/TextNativeComponent')

if (typeof window === 'undefined') global.window = global
if (typeof performance === 'undefined') global.performance = { now: () => Date.now() }

AppRegistry.registerRunnable(appName, ({ rootTag }) => {
  const doc = RNDocument.getOrCreate(rootTag)
  const body = doc.body

  // ── Diagnostics: is the native ViewManager actually registered? ───────────
  // The JS-side view config registry and the NATIVE view manager registry are
  // two different things; this tells them apart when div fails to resolve.
  try {
    const { UIManager } = require('react-native')
    const cfg = UIManager.getViewManagerConfig('HTMLDivElement')
    console.log(
      '[html-test] native config for HTMLDivElement:',
      cfg ? 'FOUND keys=' + Object.keys(cfg).slice(0, 6).join(',') : 'NULL — native ViewManager NOT registered',
    )
  } catch (e) {
    console.log('[html-test] UIManager probe threw:', e.message)
  }
  try {
    doc.createElement('div')
    console.log('[html-test] createElement("div") OK')
  } catch (e) {
    console.log('[html-test] createElement("div") FAILED:', e.message)
  }
  // Probe the SAME registry rn-dom reads, to tell "not registered" apart from
  // "different registry instance".
  try {
    const pi = require('react-native/Libraries/ReactPrivate/ReactNativePrivateInterface')
    const reg = (pi.default || pi).ReactNativeViewConfigRegistry
    const probe = (n) => {
      try { return reg.get(n) ? 'OK' : 'null' } catch (e) { return 'THREW(' + e.message.slice(0, 40) + ')' }
    }
    console.log('[html-test] rndom registry RCTView        :', probe('RCTView'))
    console.log('[html-test] rndom registry HTMLDivElement  :', probe('HTMLDivElement'))
  } catch (e) {
    console.log('[html-test] registry probe threw:', e.message)
  }

  const page = doc.createElement('div')
  page.setAttribute('style', {
    flex: 1,
    backgroundColor: '#0f0f1a',
    paddingTop: 80,
    paddingHorizontal: 20,
    gap: 12,
  })

  // ── 1. CONTROL: plain Text ────────────────────────────────────────────────
  const control = doc.createElement('Text')
  control.setAttribute('style', { color: '#e0e0ee', fontSize: 16 })
  control.appendChild(doc.createTextNode('CONTROL: plain rn-dom Text works'))
  page.appendChild(control)

  // ── 2. TEST A: div with a background ─────────────────────────────────────
  const boxA = doc.createElement('div')
  boxA.setAttribute('style', {
    backgroundColor: '#1a1a2e',
    borderWidth: 2,
    borderColor: '#16c79a',
    padding: 12,
    height: 60,
  })
  page.appendChild(boxA)

  // ── 3. TEST B: div > span with text ──────────────────────────────────────
  const boxB = doc.createElement('div')
  boxB.setAttribute('style', { backgroundColor: '#16c79a', padding: 12 })
  const span = doc.createElement('span')
  span.setAttribute('style', { color: '#0f0f1a', fontSize: 15 })
  span.appendChild(doc.createTextNode('TEST B: div > span text renders'))
  boxB.appendChild(span)
  page.appendChild(boxB)

  // ── 4. TEST C: bare text directly inside div (known gap) ─────────────────
  const boxC = doc.createElement('div')
  boxC.setAttribute('style', {
    backgroundColor: '#e94560',
    padding: 12,
    minHeight: 44,
  })
  boxC.textContent = 'TEST C: bare text in div (expected: invisible)'
  page.appendChild(boxC)

  body.appendChild(page)
  // NOTE: no completeFabric() call — RNBody has no such method. Mounting is
  // automatic: appendChild marks the subtree dirty and rn-dom schedules a
  // flush (rAF) that commits to Fabric via completeRoot.
  console.log('[html-test] mounted')
})
