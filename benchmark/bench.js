#!/usr/bin/env node
/* eslint-disable */

/**
 * Rasen 性能基准测试工具
 * 
 * 该工具自动化测试 Rasen 框架的性能，基于 js-framework-benchmark 规范
 * 不依赖外部框架，使用 Puppeteer 直接自动化浏览器
 * 
 * 使用方法：
 *   npm run benchmark                  # 运行所有测试
 *   npm run benchmark -- --headless    # 无头模式
 *   npm run benchmark -- --count 1     # 单次迭代
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const puppeteer = require('puppeteer');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs = require('fs');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const path = require('path');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const net = require('net');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { spawn } = require('child_process');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { performance } = require('perf_hooks');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const vm = require('vm');

// 配置
const CONFIG = {
  serverUrl: 'http://localhost:5174',
  timeout: 60000,
  // Official default: NUM_ITERATIONS_FOR_BENCHMARK_CPU = 15
  defaultIterations: 15,
  warmupIterations: 1
};

// Benchmark targets. The harness starts each package's `npm start` itself,
// passing a dynamically allocated free port via the PORT env var and a ready
// signal via BENCH_READY_SIGNAL. Each server is shut down after its package
// is measured ("测完一个关一个"), so packages stay fully decoupled.
// Local targets: Rasen (reactive-vue), Native DOM (vanillajs, aligned with
// official `vanillajs-keyed`) and Rasen backed by alien-signals. All other
// framework comparisons are fetched dynamically from the official
// js-framework-benchmark `results.ts` at runtime.
const TARGETS = [
  // Rasen variants stay fully separate: one measurement and one report column
  // per reactive runtime, never merged into a single "Rasen" number.
  { name: 'Rasen (reactive-vue)', dir: 'rasen' },
  { name: 'Native DOM (vanillajs)', dir: 'vanillajs' },
  { name: 'Rasen (alien-signals)', dir: 'rasen-alien' },
  { name: 'Vue Vapor (local)', dir: 'vapor' }
];

// Allocate a free TCP port the OS won't reuse immediately.
function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
  });
}

// Start a package's server via `npm start`, wait until it prints the ready
// signal (or the port responds), and return the child process.
function startServer(dir, port, signal) {
  return new Promise((resolve, reject) => {
    const cwd = path.join(__dirname, dir);
    const child = spawn('npm', ['start'], {
      cwd,
      env: { ...process.env, PORT: String(port), BENCH_READY_SIGNAL: signal },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let resolved = false;
    const finish = (proc) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      clearInterval(poll);
      resolve(proc);
    };
    const onData = (data) => {
      process.stdout.write(`[${dir}] ${data}`);
      if (!resolved && data.toString().includes(signal)) finish(child);
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', (d) => process.stdout.write(`[${dir}] ${d}`));
    const timer = setTimeout(() => {
      if (!resolved) {
        child.kill('SIGKILL');
        reject(new Error(`Server in ${dir} did not become ready (signal: "${signal}")`));
      }
    }, 45000);
    const start = Date.now();
    const poll = setInterval(async () => {
      if (resolved) return;
      try {
        const res = await fetch(`http://localhost:${port}/`);
        if (res.ok) finish(child);
      } catch (e) { /* not up yet */ }
      if (Date.now() - start > 45000) clearInterval(poll);
    }, 500);
    child.on('exit', (code) => {
      if (!resolved) {
        clearTimeout(timer);
        clearInterval(poll);
        reject(new Error(`Server in ${dir} exited early with code ${code}`));
      }
    });
  });
}

// Stop a server: kill the process tree and force-free the port as a fallback.
function stopServer(child, port) {
  return new Promise((resolve) => {
    const cleanup = () => {
      try { child.kill('SIGKILL'); } catch (e) { /* already gone */ }
      try {
        // Fallback: free the port in case the child left orphans. Scope to
        // LISTENERS only — a plain `lsof -ti tcp:PORT` also matches CLIENT
        // connections with that remote port, i.e. this process's own pooled
        // keep-alive socket, which would SIGKILL the harness itself.
        spawn('sh', ['-c', `lsof -ti tcp:${port} -sTCP:LISTEN | xargs -r kill -9`], { stdio: 'ignore' });
      } catch (e) { /* ignore */ }
      resolve();
    };
    if (!child) return resolve();
    child.on('exit', () => resolve());
    cleanup();
    setTimeout(resolve, 2000);
  });
}

// ---------------------------------------------------------------------------
// Benchmark suite — strict port of the OFFICIAL js-framework-benchmark
// measurement methodology (webdriver-ts Puppeteer runner + timeline.ts).
//
// How the official harness measures:
//   1. Fresh page per iteration, loaded with waitUntil: 'networkidle0'.
//   2. benchmark.init() runs UNTRACED: builds the table and performs
//      warmupCount warmup cycles (JIT warm-up; row ids keep incrementing
//      across cycles — the run() assertions rely on that).
//   3. CPU throttling via CDP emulation for the fast benchmarks
//      (03/04/05/09 -> 4x, 06 -> 2x) so trace granularity stays meaningful.
//   4. page.tracing.start(devtools.timeline categories), wait 50ms,
//      forced GC via window.gc(), then benchmark.run(): exactly ONE real
//      mouse click plus a DOM assertion.
//   5. wait 100ms, stop tracing.
//   6. Duration comes FROM THE TRACE: from the single click EventDispatch
//      to the end of the first renderer Commit following the last relevant
//      event (click/fireAnimationFrame/timerFire/layout/functionCall) on the
//      same process — i.e. click-to-paint-commit including layout & paint.
//      An unusually long (>16ms) rAF scheduling delay is corrected out.
//   7. Default 15 iterations (04_select runs 15+10), statistics over ALL
//      values — no trimming.// ---------------------------------------------------------------------------

const TRACE_CATEGORIES = [
  'disabled-by-default-v8.cpu_profiler',
  'blink.user_timing',
  'devtools.timeline',
  'disabled-by-default-devtools.timeline'
];

const TRACES_DIR = path.join(__dirname, 'traces');

const waitMs = (delay) => new Promise((res) => setTimeout(res, delay));

async function forceGC(page) {
  await page.evaluate("window.gc({type:'major',execution:'sync',flavor:'last-resort'})");
}

// --- Browser configuration, exact parity with the official runner ---
// The official js-framework-benchmark drives REAL Google Chrome via
// executablePath (webdriver-ts browserPath()), NOT Puppeteer's bundled
// Chromium, and it never passes --disable-gpu (we previously forced software
// rendering — an environment difference that inflates paint/commit times).
function browserExecutablePath() {
  switch (process.platform) {
    case 'darwin': return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    case 'win32': return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    default: return 'chrome'; // resolved via PATH on Linux (official behavior)
  }
}

// Exact official chromeArgs (forkedBenchmarkRunnerPuppeteer.ts).
const CHROME_ARGS = [
  '--window-size=1280,800',
  '--js-flags=--expose-gc',
  '--no-default-browser-check',
  '--disable-sync',
  '--no-first-run',
  '--ash-no-nudges',
  '--disable-extensions',
  '--disable-features=Translate,PrivacySandboxSettings4,IPH_SidePanelGenericMenuFeature'
];

async function launchBrowser(headless) {
  const args = [...CHROME_ARGS];
  // The official runner always launches with headless:false and expresses
  // headless mode purely through the --headless=new CLI arg.
  if (headless) args.push('--headless=new');
  const options = {
    headless: false,
    dumpio: false,
    defaultViewport: { width: 1280, height: 800 },
    args
  };
  const chromePath = browserExecutablePath();
  if (process.platform === 'linux' || fs.existsSync(chromePath)) {
    options.executablePath = chromePath;
  } else {
    console.warn(`⚠️ 未找到系统 Chrome (${chromePath})，回退到内置 Chromium（与官方环境略有差异）`);
  }
  return puppeteer.launch(options);
}

// --- Check helpers (ported from webdriver-ts/src/puppeteerAccess.ts):
// poll up to 10 times — fast (10ms) for the first 3 attempts, then 1s apart.
async function checkElementExists(page, selector) {
  for (let k = 0; k < 10; k++) {
    const sel = await page.$(selector);
    if (sel) {
      await sel.dispose();
      return;
    }
    await waitMs(k < 3 ? 10 : 1000);
  }
  throw `checkElementExists failed for ${selector}`;
}

async function checkElementNotExists(page, selector) {
  for (let k = 0; k < 10; k++) {
    const sel = await page.$(selector);
    if (!sel) return;
    if (sel.dispose) await sel.dispose();
    await waitMs(k < 3 ? 10 : 1000);
  }
  throw `checkElementNotExists failed for ${selector}`;
}

async function clickElement(page, selector) {
  const elem = await page.$(selector);
  if (!elem) throw `clickElement failed. Element was not found: ${selector}`;
  await elem.click();
  await elem.dispose();
}

async function checkElementContainsText(page, selector, expectedText) {
  let txt;
  for (let k = 0; k < 10; k++) {
    const elem = await page.$(selector);
    if (elem) {
      txt = await elem.evaluate((e) => e.innerText);
      await elem.dispose();
      if (typeof txt === 'string' && txt.includes(expectedText)) return;
    }
    await waitMs(k < 3 ? 10 : 1000);
  }
  throw `checkElementContainsText ${selector} failed. expected ${expectedText}, but was ${txt}`;
}

async function checkElementHasClass(page, selector, className) {
  let clazzes;
  for (let k = 0; k < 10; k++) {
    const elem = await page.$(selector);
    if (elem) {
      clazzes = await elem.evaluate((e) => [...e.classList]);
      await elem.dispose();
      if (clazzes.includes(className)) return;
    }
    await waitMs(k < 3 ? 10 : 1000);
  }
  throw `checkElementHasClass ${selector} failed. expected ${className}, but was ${clazzes}`;
}

// --- Trace-based duration (strict port of timeline.ts computeResultsCPU):
// duration = firstCommitAfterLastRelevantEvent.end - clickEvent.ts (ms).
function extractRelevantEvents(entries, startLogicEventName) {
  const filtered = [];
  for (const e of entries) {
    const type = e.args && e.args.data && e.args.data.type;
    if (e.name === 'EventDispatch') {
      if (type === startLogicEventName) {
        filtered.push({ type: 'startLogicEvent', ts: +e.ts, dur: +e.dur, end: +e.ts + +e.dur, pid: e.pid });
      }
      if (type === 'click') {
        filtered.push({ type: 'click', ts: +e.ts, dur: +e.dur, end: +e.ts + +e.dur, pid: e.pid });
      } else if (type === 'mousedown') {
        filtered.push({ type: 'mousedown', ts: +e.ts, dur: +e.dur, end: +e.ts + +e.dur, pid: e.pid });
      } else if (type === 'pointerup') {
        filtered.push({ type: 'pointerup', ts: +e.ts, dur: +e.dur, end: +e.ts + +e.dur, pid: e.pid });
      }
    } else if (e.name === 'Layout' && e.ph === 'X') {
      filtered.push({ type: 'layout', ts: +e.ts, dur: +e.dur, end: +e.ts + +e.dur, pid: e.pid });
    } else if (e.name === 'FunctionCall' && e.ph === 'X') {
      filtered.push({ type: 'functioncall', ts: +e.ts, dur: +e.dur, end: +e.ts + +e.dur, pid: e.pid });
    } else if (e.name === 'Commit' && e.ph === 'X') {
      filtered.push({ type: 'commit', ts: +e.ts, dur: +e.dur, end: +e.ts + +e.dur, pid: e.pid });
    } else if (e.name === 'Paint' && e.ph === 'X') {
      filtered.push({ type: 'paint', ts: +e.ts, dur: +e.dur, end: +e.ts + +e.dur, pid: e.pid });
    } else if (e.name === 'FireAnimationFrame' && e.ph === 'X') {
      filtered.push({ type: 'fireAnimationFrame', ts: +e.ts, dur: +e.dur, end: +e.ts + +e.dur, pid: e.pid });
    } else if (e.name === 'TimerFire' && e.ph === 'X') {
      filtered.push({ type: 'timerFire', ts: +e.ts, dur: 0, end: +e.ts, pid: e.pid });
    } else if (e.name === 'RequestAnimationFrame') {
      filtered.push({ type: 'requestAnimationFrame', ts: +e.ts, dur: 0, end: +e.ts, pid: e.pid });
    }
  }
  return filtered;
}

function computeResultsCPU(traceFile, startLogicEventName = 'click') {
  const json = JSON.parse(fs.readFileSync(traceFile, { encoding: 'utf8' }));
  const events = extractRelevantEvents(json.traceEvents || [], startLogicEventName)
    .sort((a, b) => a.end - b.end);

  const mousedowns = events.filter((e) => e.type === 'mousedown');
  if (mousedowns.length > 1) throw 'at most one mousedown event is expected';

  // Invariant: exactly ONE click dispatch inside the traced window.
  const clicks = events.filter((e) => e.type === 'startLogicEvent');
  if (clicks.length !== 1) throw 'exactly one click event is expected';
  const click = clicks[0];

  // Drop events from other processes (compositor/GPU), like the original.
  const pid = click.pid;
  const eventsDuringBenchmark = events.filter((e) => e.ts > click.end || e.type === 'click');
  const mainThread = eventsDuringBenchmark.filter((e) => e.pid === pid);

  const startFrom = mainThread.filter((e) =>
    [startLogicEventName, 'fireAnimationFrame', 'timerFire', 'layout', 'functioncall'].includes(e.type)
  );
  const startFromEvent = startFrom[startFrom.length - 1];
  if (!startFromEvent) throw 'unexpected situation. There must be some events, but there were none.';

  const allCommitsAfterClick = mainThread.filter((e) => e.type === 'commit');
  let commit = mainThread.find((e) => e.type === 'commit' && e.ts > startFromEvent.end);
  if (!commit) {
    if (allCommitsAfterClick.length === 0) throw 'No commit event found for ' + traceFile;
    commit = allCommitsAfterClick[allCommitsAfterClick.length - 1];
  }

  let duration = (commit.end - clicks[0].ts) / 1000.0;

  // Correct an unusually long delay between requestAnimationFrame and its
  // firing (official raf_long_delay adjustment).
  const layouts = mainThread.filter((e) => e.type === 'layout');
  const rafsWithinClick = events.filter(
    (e) => e.type === 'requestAnimationFrame' && e.ts >= click.ts && e.ts <= click.end
  );
  const fafs = events.filter(
    (e) => e.type === 'fireAnimationFrame' && e.ts >= click.ts && e.ts < commit.ts
  );
  if (rafsWithinClick.length > 0 && fafs.length > 0) {
    const waitDelay = (fafs[0].ts - click.end) / 1000.0;
    if (rafsWithinClick.length === 1 && fafs.length === 1) {
      if (waitDelay > 16) {
        const ignored = layouts.some((e) => e.ts < fafs[0].ts);
        if (!ignored) duration -= waitDelay - 16;
      }
    } else if (fafs.length === 1) {
      throw 'Unexpected situation. One fire animation frame, but non consistent request animation frames';
    }
  }
  return duration;
}

// --- Benchmark definitions (ports of webdriver-ts/src/benchmarksPuppeteer.ts).
// Each entry: init(page) = untraced warmup/setup, run(page) = the single
// TRACED interaction, throttle = CPU slowdown factor around the traced run.
const BENCHMARKS = [
  {
    id: '01_run1k',
    label: 'Create 1,000 rows',
    async init(page) {
      await checkElementExists(page, '#run');
      for (let i = 0; i < 5; i++) {
        await clickElement(page, '#run');
        await checkElementContainsText(page, 'tbody>tr:nth-of-type(1)>td:nth-of-type(1)', (i * 1000 + 1).toFixed());
        await clickElement(page, '#clear');
        await checkElementNotExists(page, 'tbody>tr:nth-of-type(1000)>td:nth-of-type(1)');
      }
    },
    async run(page) {
      await clickElement(page, '#run');
      await checkElementContainsText(page, 'tbody>tr:nth-of-type(1000)>td:nth-of-type(1)', ((5 + 1) * 1000).toFixed());
    }
  },
  {
    id: '02_runlots',
    label: 'Create 10,000 rows',
    async init(page) {
      await checkElementExists(page, '#run');
      for (let i = 0; i < 5; i++) {
        await clickElement(page, '#run');
        await checkElementContainsText(page, 'tbody>tr:nth-of-type(1)>td:nth-of-type(1)', (i * 1000 + 1).toFixed());
        await clickElement(page, '#clear');
        await checkElementNotExists(page, 'tbody>tr:nth-of-type(1000)>td:nth-of-type(1)');
      }
    },
    async run(page) {
      await clickElement(page, '#runlots');
      await checkElementExists(page, 'tbody>tr:nth-of-type(10000)>td:nth-of-type(2)>a');
    }
  },
  {
    id: '03_update',
    label: 'Update every 10th row',
    throttle: 4,
    async init(page) {
      await checkElementExists(page, '#run');
      await clickElement(page, '#run');
      await checkElementExists(page, 'tbody>tr:nth-of-type(1000)>td:nth-of-type(1)');
      for (let i = 0; i < 3; i++) {
        await clickElement(page, '#update');
        await checkElementContainsText(page, 'tbody>tr:nth-of-type(991)>td:nth-of-type(2)>a', ' !!!'.repeat(i + 1));
      }
    },
    async run(page) {
      await clickElement(page, '#update');
      await checkElementContainsText(page, 'tbody>tr:nth-of-type(991)>td:nth-of-type(2)>a', ' !!!'.repeat(3 + 1));
    }
  },
  {
    id: '04_select',
    label: 'Select row (highlight)',
    throttle: 4,
    additionalRuns: 10,
    async init(page) {
      await checkElementExists(page, '#run');
      await clickElement(page, '#run');
      await checkElementContainsText(page, 'tbody>tr:nth-of-type(1000)>td:nth-of-type(1)', '1000');
      await clickElement(page, 'tbody>tr:nth-of-type(5)>td:nth-of-type(2)>a');
      await checkElementHasClass(page, 'tbody>tr:nth-of-type(5)', 'danger');
      const dangers = await page.$$('tbody>tr.danger');
      if (dangers.length !== 1) throw `checkCountForSelector tbody>tr.danger failed. expected 1, but ${dangers.length} were found`;
    },
    async run(page) {
      await clickElement(page, 'tbody>tr:nth-of-type(2)>td:nth-of-type(2)>a');
      await checkElementHasClass(page, 'tbody>tr:nth-of-type(2)', 'danger');
    }
  },
  {
    id: '05_swap',
    label: 'Swap rows 1 and 998',
    throttle: 4,
    async init(page) {
      await checkElementExists(page, '#run');
      await clickElement(page, '#run');
      await checkElementExists(page, 'tbody>tr:nth-of-type(1000)>td:nth-of-type(1)');
      for (let i = 0; i <= 5; i++) {
        const text = i % 2 === 0 ? '2' : '999';
        await clickElement(page, '#swaprows');
        await checkElementContainsText(page, 'tbody>tr:nth-of-type(999)>td:nth-of-type(1)', text);
      }
    },
    async run(page) {
      await clickElement(page, '#swaprows');
      // warmupCount (5) is odd -> after the run swap the parity flips.
      await checkElementContainsText(page, 'tbody>tr:nth-of-type(999)>td:nth-of-type(1)', '2');
      await checkElementContainsText(page, 'tbody>tr:nth-of-type(2)>td:nth-of-type(1)', '999');
    }
  },
  {
    id: '06_remove',
    label: 'Remove a row',
    throttle: 2,
    async init(page) {
      const rowsToSkip = 4;
      const warmupCount = 5;
      await checkElementExists(page, '#run');
      await clickElement(page, '#run');
      await checkElementExists(page, 'tbody>tr:nth-of-type(1000)>td:nth-of-type(1)');
      for (let i = 0; i < warmupCount; i++) {
        const rowToClick = warmupCount - i + rowsToSkip;
        await checkElementContainsText(page, `tbody>tr:nth-of-type(${rowToClick})>td:nth-of-type(1)`, String(rowToClick));
        await clickElement(page, `tbody>tr:nth-of-type(${rowToClick})>td:nth-of-type(3)>a>span:nth-of-type(1)`);
        await checkElementContainsText(page, `tbody>tr:nth-of-type(${rowToClick})>td:nth-of-type(1)`, String(rowsToSkip + warmupCount + 1));
      }
      await checkElementContainsText(page, `tbody>tr:nth-of-type(${rowsToSkip + 1})>td:nth-of-type(1)`, String(rowsToSkip + warmupCount + 1));
      await checkElementContainsText(page, `tbody>tr:nth-of-type(${rowsToSkip})>td:nth-of-type(1)`, String(rowsToSkip));
      // Click on a row the second time
      await checkElementContainsText(page, `tbody>tr:nth-of-type(${rowsToSkip + 2})>td:nth-of-type(1)`, String(rowsToSkip + warmupCount + 2));
      await clickElement(page, `tbody>tr:nth-of-type(${rowsToSkip + 2})>td:nth-of-type(3)>a>span:nth-of-type(1)`);
      await checkElementContainsText(page, `tbody>tr:nth-of-type(${rowsToSkip + 2})>td:nth-of-type(1)`, String(rowsToSkip + warmupCount + 3));
    },
    async run(page) {
      await clickElement(page, 'tbody>tr:nth-of-type(4)>td:nth-of-type(3)>a>span:nth-of-type(1)');
      await checkElementContainsText(page, 'tbody>tr:nth-of-type(4)>td:nth-of-type(1)', String(4 + 5 + 1));
    }
  },
  {
    id: '07_clear',
    label: 'Clear all rows',
    throttle: 4,
    async init(page) {
      await checkElementExists(page, '#run');
      for (let i = 0; i < 5; i++) {
        await clickElement(page, '#run');
        await checkElementContainsText(page, 'tbody>tr:nth-of-type(1)>td:nth-of-type(1)', (i * 1000 + 1).toFixed());
        await clickElement(page, '#clear');
        await checkElementNotExists(page, 'tbody>tr:nth-of-type(1000)>td:nth-of-type(1)');
      }
      await clickElement(page, '#run');
      await checkElementContainsText(page, 'tbody>tr:nth-of-type(1)>td:nth-of-type(1)', (5 * 1000 + 1).toFixed());
    },
    async run(page) {
      await clickElement(page, '#clear');
      await checkElementNotExists(page, 'tbody>tr:nth-of-type(1000)>td:nth-of-type(1)');
    }
  }
];

/**
 * 计算统计数据（官方口径：全部样本参与统计，不裁剪）
 */
function calculateStats(times) {
  if (times.length === 0) return null;

  const sorted = [...times].sort((a, b) => a - b);

  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  const median = sorted.length % 2 === 0
    ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : sorted[Math.floor(sorted.length / 2)];

  const variance = times.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / times.length;
  const stdDev = Math.sqrt(variance);

  return { min, max, mean, median, stdDev, count: times.length, values: times };
}

/**
 * 运行单个基准测试（官方方法论：trace 计时 + CPU 节流 + 强制 GC）
 */
async function runBenchmark(browser, benchmark, iterations) {
  const throttleNote = benchmark.throttle ? `, CPU节流${benchmark.throttle}×` : '';
  const totalRuns = iterations + (benchmark.additionalRuns || 0);
  console.log(`\n▶ ${benchmark.label} (${totalRuns}次迭代${throttleNote}, 官方trace计时)`);

  const times = [];

  for (let i = 0; i < totalRuns; i++) {
    let time = null;
    // The official runner retries an iteration when the trace invariants
    // fail ("exactly one click event is expected").
    for (let attempt = 1; attempt <= 3 && time === null; attempt++) {
      const page = await browser.newPage();
      try {
        page.setDefaultNavigationTimeout(CONFIG.timeout);
        page.setDefaultTimeout(CONFIG.timeout);

        await page.goto(CONFIG.serverUrl, { waitUntil: 'networkidle0', timeout: 30000 });

        // Untraced init: build the table + warmup cycles.
        await benchmark.init(page);

        const throttle = benchmark.throttle;
        if (throttle) await page.emulateCPUThrottling(throttle);

        if (!fs.existsSync(TRACES_DIR)) fs.mkdirSync(TRACES_DIR, { recursive: true });
        const tracePath = path.join(TRACES_DIR, `${benchmark.id}_${Date.now()}_${i}.json`);

        await page.tracing.start({ path: tracePath, screenshots: false, categories: TRACE_CATEGORIES });
        await waitMs(50);
        await forceGC(page);

        await benchmark.run(page);

        await waitMs(100);
        await page.tracing.stop();
        if (throttle) await page.emulateCPUThrottling(1);

        time = computeResultsCPU(tracePath);
      } catch (error) {
        const msg = String((error && error.message) || error);
        if (attempt < 3 && /click event|commit event|mousedown/.test(msg)) {
          console.log(`  迭代 ${i + 1}/${totalRuns}: 重试 (${msg})`);
        } else {
          console.error(`  ✗ 迭代 ${i + 1}/${totalRuns} 失败: ${msg}`);
        }
      } finally {
        await page.close();
      }
    }
    if (time !== null) {
      times.push(time);
      console.log(`  迭代 ${i + 1}/${totalRuns}: 耗时 ${time.toFixed(2)}ms`);
    }
  }

  return calculateStats(times);
}

/**
 * 生成 HTML 报告
 */
function generateHtmlReport(results) {
  const timestamp = new Date().toISOString();
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Rasen 性能基准测试报告</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: #f5f5f5;
      padding: 40px 20px;
    }
    .container { max-width: 1000px; margin: 0 auto; }
    h1 {
      color: #333;
      margin-bottom: 10px;
      font-size: 28px;
    }
    .meta {
      color: #666;
      font-size: 14px;
      margin-bottom: 30px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      background: white;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      border-radius: 4px;
      overflow: hidden;
    }
    thead {
      background: #f8f8f8;
      border-bottom: 2px solid #ddd;
    }
    th, td {
      padding: 12px 16px;
      text-align: right;
      border-bottom: 1px solid #eee;
    }
    th:first-child, td:first-child {
      text-align: left;
      font-weight: 600;
    }
    th {
      color: #333;
      font-weight: 600;
    }
    tbody tr:hover {
      background: #f9f9f9;
    }
    .chart {
      margin-top: 40px;
      padding: 20px;
      background: white;
      border-radius: 4px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .bar {
      display: flex;
      align-items: center;
      margin-bottom: 15px;
    }
    .bar-label {
      width: 200px;
      font-weight: 500;
      padding-right: 10px;
    }
    .bar-value {
      flex: 1;
      height: 30px;
      background: linear-gradient(90deg, #4CAF50, #45a049);
      border-radius: 3px;
      display: flex;
      align-items: center;
      padding: 0 10px;
      color: white;
      font-weight: bold;
    }
    .unit {
      margin-left: 10px;
      color: #666;
      font-weight: normal;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Rasen 性能基准测试报告</h1>
    <div class="meta">
      生成时间: ${timestamp}
    </div>
    
    <table>
      <thead>
        <tr>
          <th>测试项</th>
          <th>平均 (ms)</th>
          <th>中位数 (ms)</th>
          <th>最小值 (ms)</th>
          <th>最大值 (ms)</th>
          <th>标准差 (ms)</th>
          <th>样本数</th>
        </tr>
      </thead>
      <tbody>
        ${results.map(r => `
        <tr>
          <td>${r.label}</td>
          <td>${r.stats.mean.toFixed(2)}</td>
          <td>${r.stats.median.toFixed(2)}</td>
          <td>${r.stats.min.toFixed(2)}</td>
          <td>${r.stats.max.toFixed(2)}</td>
          <td>${r.stats.stdDev.toFixed(2)}</td>
          <td>${r.stats.count}</td>
        </tr>
        `).join('')}
      </tbody>
    </table>

    <div class="chart">
      <h2 style="margin-bottom: 20px; color: #333;">平均执行时间对比</h2>
      ${results.map(r => {
        const maxMean = Math.max(...results.map(x => x.stats.mean));
        const width = (r.stats.mean / maxMean) * 100;
        return `
        <div class="bar">
          <div class="bar-label">${r.label}</div>
          <div class="bar-value" style="width: ${Math.max(width, 5)}%">
            ${r.stats.mean.toFixed(2)} <span class="unit">ms</span>
          </div>
        </div>
        `;
      }).join('')}
    </div>
  </div>
</body>
</html>`;
  
  return html;
}

// Generate an HTML report comparing multiple targets (one server per target).
// allResults: [{ target: string, results: [{ id, label, stats }] }]
function generateMultiTargetReport(allResults) {
  const timestamp = new Date().toISOString();
  const benchmarks = allResults[0]?.results || [];
  const targets = allResults.map(t => t.target);

  const tableHead = `<tr>
    <th>测试项</th>
    ${targets.map(t => `<th>${t} (ms)</th>`).join('')}
  </tr>`;

  const tableRows = benchmarks.map((bench, i) => {
    const cells = allResults.map(t => {
      const r = t.results[i];
      return `<td>${r ? r.stats.mean.toFixed(2) : '-'}</td>`;
    }).join('');
    return `<tr><td>${bench.label}</td>${cells}</tr>`;
  }).join('');

  const charts = allResults.map(t => {
    const bars = t.results.map(r => {
      const maxMean = Math.max(...t.results.map(x => x.stats.mean));
      const width = (r.stats.mean / maxMean) * 100;
      return `<div class="bar">
        <div class="bar-label">${r.label}</div>
        <div class="bar-value" style="width: ${Math.max(width, 5)}%">
          ${r.stats.mean.toFixed(2)} <span class="unit">ms</span>
        </div>
      </div>`;
    }).join('');
    return `<div class="chart">
      <h2 style="margin-bottom: 20px; color: #333;">${t.target} - 平均执行时间</h2>
      ${bars}
    </div>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Rasen 多框架性能基准测试报告</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: #f5f5f5;
      padding: 40px 20px;
    }
    .container { max-width: 1100px; margin: 0 auto; }
    h1 { color: #333; margin-bottom: 10px; font-size: 28px; }
    .meta { color: #666; font-size: 14px; margin-bottom: 30px; }
    table {
      width: 100%; border-collapse: collapse; background: white;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1); border-radius: 4px; overflow: hidden;
    }
    thead { background: #f8f8f8; border-bottom: 2px solid #ddd; }
    th, td { padding: 12px 16px; text-align: right; border-bottom: 1px solid #eee; }
    th:first-child, td:first-child { text-align: left; font-weight: 600; }
    th { color: #333; font-weight: 600; }
    tbody tr:hover { background: #f9f9f9; }
    .chart {
      margin-top: 40px; padding: 20px; background: white; border-radius: 4px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .bar { display: flex; align-items: center; margin-bottom: 15px; }
    .bar-label { width: 200px; font-weight: 500; padding-right: 10px; }
    .bar-value {
      flex: 1; height: 30px; background: linear-gradient(90deg, #4CAF50, #45a049);
      border-radius: 3px; display: flex; align-items: center; padding: 0 10px;
      color: white; font-weight: bold;
    }
    .unit { margin-left: 10px; color: #666; font-weight: normal; }
  </style>
</head>
<body>
  <div class="container">
    <h1>多框架性能基准测试报告</h1>
    <div class="meta">生成时间: ${timestamp} · 每个框架独立启动/关闭服务器</div>
    <table>
      <thead>${tableHead}</thead>
      <tbody>${tableRows}</tbody>
    </table>
    ${charts}
  </div>
</body>
</html>`;

  return html;
}

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2);
  const headless = !args.includes('--no-headless');
  const countIdx = args.findIndex(a => a.startsWith('--count'));
  let iterations = CONFIG.defaultIterations;
  if (countIdx !== -1) {
    const raw = args[countIdx].includes('=')
      ? args[countIdx].split('=')[1]
      : args[countIdx + 1];
    const parsed = parseInt(raw, 10);
    if (!Number.isNaN(parsed)) iterations = parsed;
  }
  const captureProfile = args.includes('--profile');
  const urlIdx = args.findIndex(a => a.startsWith('--url'));
  if (urlIdx !== -1) {
    CONFIG.serverUrl = args[urlIdx].includes('=')
      ? args[urlIdx].split('=')[1]
      : args[urlIdx + 1];
  }

  // --bench filter: select specific benchmark items to run (repeatable or
  // comma-separated). Matches by 1-based index, `id`, or `label` substring.
  // e.g. `--bench 04_select`, `--bench select`, `--bench 1,4`, `--bench=01_run1k,04_select`
  const benchFlags = [];
  args.forEach((a, i) => {
    if (a === '--bench') {
      if (args[i + 1] !== undefined) benchFlags.push(args[i + 1]);
    } else if (a.startsWith('--bench=')) {
      benchFlags.push(a.split('=')[1]);
    }
  });
  let activeBenchmarks = BENCHMARKS;
  if (benchFlags.length) {
    const filters = benchFlags.join(',').split(',').map(s => s.trim()).filter(Boolean);
    activeBenchmarks = BENCHMARKS.filter((bench, idx) => filters.some(f => {
      if (/^\d+$/.test(f)) return String(idx + 1) === f || bench.id === f;
      const fLower = f.toLowerCase();
      return bench.id.toLowerCase().includes(fLower) ||
        bench.label.toLowerCase().includes(fLower);
    }));
    if (!activeBenchmarks.length) {
      console.error(`\n✗ 没有匹配到任何测试项。可用项 (index / id / label):`);
      BENCHMARKS.forEach((b, i) => console.error(`  ${i + 1}. ${b.id} — ${b.label}`));
      process.exit(1);
    }
  }

  console.log(`
╔════════════════════════════════════════════╗
║   Rasen 性能基准测试工具                    ║
╚════════════════════════════════════════════╝
`);
  console.log(`配置:`);
  console.log(`  服务器: ${CONFIG.serverUrl}`);
  console.log(`  每项迭代: ${iterations}次`);
  console.log(`  无头模式: ${headless}`);
  console.log(`  测试项: ${activeBenchmarks.length}/${BENCHMARKS.length}个` +
    (activeBenchmarks.length < BENCHMARKS.length
      ? ` (${activeBenchmarks.map(b => b.id).join(', ')})`
      : ''));
  if (captureProfile) {
    console.log(`  捕获 profile: 是`);
  }

  try {
    if (urlIdx !== -1) {
      // 自定义 URL 模式：用户自行启动服务器，使用单个浏览器
      console.log(`\n启动浏览器...`);
      const browser = await launchBrowser(headless);
      console.log('✓ 浏览器已启动\n');
      try {
        const results = await runAllBenchmarks(browser, iterations, captureProfile, activeBenchmarks);
        await saveResults(results);
      } finally {
        await browser.close();
      }
    } else {
      // 自管理服务器模式：逐个启动/关闭每个 target（测完一个关一个）
      // 每个 target 使用独立的浏览器实例，避免跨 target 的浏览器状态污染与崩溃
      //
      // 断点续跑：每个 target 测完立即写入 .partial-results.json。长时运行
      // 可能被环境杀死（内存压力/终端回收），--resume 从缓存恢复已完成的
      // target，只补测缺失的部分；全部完成后缓存文件自动删除。
      const signal = 'Benchmark Ready';
      const partialPath = path.join(__dirname, '.partial-results.json');
      let allResults = [];
      if (args.includes('--resume') && fs.existsSync(partialPath)) {
        try {
          allResults = JSON.parse(fs.readFileSync(partialPath, 'utf8'));
          console.log(`\n♻️ --resume: 恢复 ${allResults.length} 个已完成 target: ` +
            allResults.map(r => r.target).join(', '));
        } catch (e) {
          console.warn(`⚠️ 缓存损坏，忽略: ${e.message}`);
          allResults = [];
        }
      }
      const doneNames = new Set(allResults.map(r => r.target));
      for (const target of TARGETS) {
        if (doneNames.has(target.name)) {
          console.log(`\n⏭️ [${target.name}] 已有缓存结果，跳过`);
          continue;
        }
        const port = await findFreePort();
        console.log(`\n🌐 [${target.name}] 分配空闲端口 ${port}，启动服务器...`);
        let server;
        let browser;
        try {
          server = await startServer(target.dir, port, signal);
          CONFIG.serverUrl = `http://localhost:${port}`;
          console.log(`📊 [${target.name}] 服务器就绪，开始基准测试 (count=${iterations})...`);
          browser = await launchBrowser(headless);
          const results = await runAllBenchmarks(
            browser, iterations, captureProfile && allResults.length === 0, activeBenchmarks
          );
          allResults.push({ target: target.name, results });
          fs.writeFileSync(partialPath, JSON.stringify(allResults, null, 2));
        } finally {
          if (browser) await browser.close();
          await stopServer(server, port);
          console.log(`🔌 [${target.name}] 服务器已关闭`);
        }
      }
      await finalizeMultiplierReport(allResults);
      try { fs.unlinkSync(partialPath); } catch (e) { /* not present */ }
    }

  } catch (error) {
    console.error(`\n✗ 错误: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the given benchmarks against the currently configured server URL.
// Optionally captures a performance profile on a separate page first.
// `benchmarks` defaults to the full BENCHMARKS list (or a filtered subset when
// the --bench flag is used).
async function runAllBenchmarks(browser, iterations, captureProfile, benchmarks = BENCHMARKS) {
  const results = [];

  if (captureProfile) {
    console.log('\n🔍 准备捕获性能 profile...');
    const profilePage = await browser.newPage();
    await profilePage.goto(CONFIG.serverUrl, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 500));

    const pageUrl = await profilePage.evaluate(() => window.location.href);
    console.log(`  访问页面: ${pageUrl}`);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const tracePath = `trace-${timestamp}.json`;

    await profilePage.tracing.start({
      path: tracePath,
      categories: ['devtools.timeline', 'v8.execute', 'disabled-by-default-v8.cpu_profiler']
    });

    console.log('  执行测试操作...');
    await profilePage.click('#run');
    await profilePage.waitForFunction(() => document.querySelectorAll('tbody tr').length >= 1000, { timeout: 10000 });
    await new Promise(r => setTimeout(r, 300));
    await profilePage.click('#update');
    await new Promise(r => setTimeout(r, 300));

    await profilePage.tracing.stop();
    console.log(`✓ Profile 已保存: ${tracePath}\n`);
    await profilePage.close();
  }

  for (const benchmark of benchmarks) {
    const stats = await runBenchmark(browser, benchmark, iterations);
    results.push({ id: benchmark.id, label: benchmark.label, stats });
  }
  return results;
}

// Save single-target results (HTML + JSON) and print a summary.
async function saveResults(results) {
  console.log(`\n\n${'═'.repeat(50)}`);
  console.log(`测试完成！`);
  console.log(`${'═'.repeat(50)}\n`);

  console.log(`测试结果摘要:`);
  console.log(`${'-'.repeat(50)}`);
  results.forEach(r => {
    console.log(`${r.label.padEnd(30)} ${r.stats.mean.toFixed(2).padStart(8)}ms (±${r.stats.stdDev.toFixed(2)})`);
  });
  console.log(`${'-'.repeat(50)}`);

  const reportDir = path.join(__dirname, 'reports');
  if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportFile = path.join(reportDir, `benchmark-${timestamp}.html`);
  fs.writeFileSync(reportFile, generateHtmlReport(results));
  console.log(`\n✓ 报告已保存到: ${reportFile}`);

  const jsonFile = path.join(reportDir, `benchmark-${timestamp}.json`);
  fs.writeFileSync(jsonFile, JSON.stringify(results, null, 2));
  console.log(`✓ JSON 数据已保存到: ${jsonFile}`);
}

// Save multi-target results (HTML + JSON) and print a summary.
async function saveMultiTargetResults(allResults) {
  console.log(`\n\n${'═'.repeat(50)}`);
  console.log(`全部测试完成！`);
  console.log(`${'═'.repeat(50)}\n`);

  const benchmarks = allResults[0]?.results || [];
  console.log(`测试结果摘要 (平均 ms):`);
  console.log(`${'-'.repeat(70)}`);
  benchmarks.forEach((bench, i) => {
    const cells = allResults.map(t => {
      const r = t.results[i];
      return r ? r.stats.mean.toFixed(2).padStart(8) : '      - ';
    }).join('  ');
    console.log(`${bench.label.padEnd(28)} ${cells}`);
  });
  console.log(`${'-'.repeat(70)}`);
  console.log(`框架: ${allResults.map(t => t.target).join(' | ')}`);

  const reportDir = path.join(__dirname, 'reports');
  if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportFile = path.join(reportDir, `benchmark-${timestamp}.html`);
  fs.writeFileSync(reportFile, generateMultiTargetReport(allResults));
  console.log(`\n✓ 报告已保存到: ${reportFile}`);

  const jsonFile = path.join(reportDir, `benchmark-${timestamp}.json`);
  fs.writeFileSync(jsonFile, JSON.stringify(allResults, null, 2));
  console.log(`✓ JSON 数据已保存到: ${jsonFile}`);
}

// ---------------------------------------------------------------------------
// Multiplier-only layer: Native = 1.00 baseline, official data fetched live
// ---------------------------------------------------------------------------

const BENCHMARK_OFFICIAL_ID = {
  '01_run1k': '01_run1k',
  '02_runlots': '07_create10k',
  '03_update': '03_update10th1k_x16',
  '04_select': '04_select1k',
  '05_swap': '05_swap1k',
  '06_remove': '06_remove-one-1k',
  '07_clear': '09_clear1k_x8'
};

const OFFICIAL_COMPARISONS = [
  // `match` is tested against official `framework.name`; `keyed: true` is also
  // required. Patterns tolerate version bumps and pre-release suffixes like
  // `-beta.17` so the lookup stays correct without hardcoding numbers.
  // render-fn variant removed — only SFC and Vapor are compared.
  { label: 'React 19', match: /^react-hooks-v.*-keyed$/ },
  { label: 'Vue (SFC)', match: /^vue-v[\d.]+-keyed$/ },
  { label: 'Vue (Vapor)', match: /^vue-vapor-v.*-keyed$/ },
  { label: 'Solid', match: /^solid-v.*-keyed$/ },
  { label: 'Svelte', match: /^svelte-v.*-keyed$/ },
  { label: 'Angular', match: /^angular-cf-v[\d.]+-keyed$/ }
];

const OFFICIAL_RESULTS_URL =
  'https://raw.githubusercontent.com/krausest/js-framework-benchmark/master/webdriver-ts-results/src/results.ts';

async function fetchOfficialResults() {
  console.log(`\n🌍 动态拉取官方 js-framework-benchmark 数据...`);
  console.log(`  ${OFFICIAL_RESULTS_URL}`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  let text;
  try {
    const res = await fetch(OFFICIAL_RESULTS_URL, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    text = await res.text();
  } finally {
    clearTimeout(timer);
  }

  // results.ts is TypeScript: `export const results: RawResult[] = [...]`
  // Normalize to plain JS var-decls so vm can evaluate it.
  const code = text
    .replace(/^\s*import\s+[^\n]*\n/, '')
    .replace(/export const results\s*:?\s*RawResult\[\]\s*=/, 'var results =')
    .replace(/export const frameworks\s*=/, 'var frameworks =')
    .replace(/export const benchmarks\s*=/, 'var benchmarks =');

  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  const { results, frameworks, benchmarks } = sandbox;

  const byF = {};
  results.forEach(r => { byF[r.f] = r; });

  const byName = {};
  frameworks.forEach((fw, i) => {
    const r = byF[i];
    if (!r) return;
    const benchMap = {};
    r.b.forEach(bEntry => {
      const benchId = benchmarks[bEntry.b] && benchmarks[bEntry.b].id;
      if (!benchId) return;
      const vals = bEntry.v && bEntry.v.total;
      if (Array.isArray(vals) && vals.length) {
        benchMap[benchId] = vals.reduce((a, b) => a + b, 0) / vals.length;
      }
      // type-1 / type-5 benchmarks use DEFAULT — ignore for multiplier calc
    });
    byName[fw.name] = benchMap;
  });

  const vanilla = frameworks.find(fw => fw.name === 'vanillajs-keyed')
    || frameworks.find(fw => /vanillajs.*keyed/.test(fw.name));
  return { byName, frameworks, vanillaName: vanilla ? vanilla.name : 'vanillajs-keyed' };
}

function resolveOfficialName(frameworks, matchRegex) {
  const found = frameworks.find(fw => fw.keyed && matchRegex.test(fw.name));
  return found ? found.name : null;
}

function geoMean(values) {
  const valid = values.filter(v => typeof v === 'number' && v > 0 && Number.isFinite(v));
  if (!valid.length) return null;
  const logSum = valid.reduce((s, v) => s + Math.log(v), 0);
  return Math.exp(logSum / valid.length);
}

function fmtMult(v) {
  return v == null ? '-' : `${v.toFixed(2)}×`;
}

function buildMultiplierRows(allResults, official) {
  // New caches store 'Rasen (reactive-vue)'; fall back to the legacy 'Rasen'
  // name so older multiplier-*.json caches still regenerate correctly.
  const rasen = allResults.find(t => t.target === 'Rasen (reactive-vue)')
    || allResults.find(t => t.target === 'Rasen');
  const vanilla = allResults.find(t => t.target === 'Native DOM (vanillajs)');
  const alien = allResults.find(t => t.target === 'Rasen (alien-signals)');
  if (!rasen || !vanilla) return null;

  // Iterate over the benchmarks that were ACTUALLY run (rasen.results), keyed
  // by `id`, so partial runs (--bench filter) produce correctly aligned rows
  // instead of indexing the full BENCHMARKS list.
  const rows = rasen.results.map((r, i) => {
    const vResult = vanilla.results[i];
    if (!r.stats || !vResult || !vResult.stats) return null; // failed run
    const rMean = r.stats.mean;
    const vMean = vResult.stats.mean;
    const aResult = alien && alien.results[i];
    const aMean = aResult && aResult.stats ? aResult.stats.mean : null;
    const row = {
      id: r.id,
      label: r.label,
      native: 1.0,
      rasen: (rMean && vMean) ? rMean / vMean : null,
      // Optional column: absent when the cached localRaw predates the
      // rasen-alien target (older multiplier-*.json caches).
      alien: (aMean && vMean) ? aMean / vMean : null
    };
    const officialId = BENCHMARK_OFFICIAL_ID[r.id];
    OFFICIAL_COMPARISONS.forEach(comp => {
      let mult = null;
      if (official && officialId) {
        const fwName = resolveOfficialName(official.frameworks, comp.match);
        const fwMean = fwName && official.byName[fwName] && official.byName[fwName][officialId];
        const vMeanOff = official.byName[official.vanillaName] && official.byName[official.vanillaName][officialId];
        if (fwMean != null && vMeanOff != null && vMeanOff > 0) mult = fwMean / vMeanOff;
      }
      row[comp.label] = mult;
    });
    return row;
  });

  const validRows = rows.filter(Boolean);
  const summary = { id: 'geo', label: 'Geometric mean', native: 1.0 };
  summary.rasen = geoMean(validRows.map(r => r.rasen));
  summary.alien = geoMean(validRows.map(r => r.alien));
  OFFICIAL_COMPARISONS.forEach(comp => {
    summary[comp.label] = geoMean(validRows.map(r => r[comp.label]));
  });
  rows.push(summary);
  return rows;
}

function generateMultiplierReport(rows, officialAvailable) {
  const timestamp = new Date().toISOString();
  const columns = [
    'Rasen (reactive-vue)',
    'Rasen (alien-signals)',
    ...OFFICIAL_COMPARISONS.map(c => c.label),
    'Native'
  ];
  const head = `<tr><th>Benchmark</th>${columns.map(c => `<th>${c}</th>`).join('')}</tr>`;
  const body = rows.filter(Boolean).map(row => {
    const cells = [
      fmtMult(row.rasen),
      fmtMult(row.alien),
      ...OFFICIAL_COMPARISONS.map(c => fmtMult(row[c.label])),
      fmtMult(row.native)
    ].map(v => `<td>${v}</td>`).join('');
    const isSummary = row.id === 'geo';
    return `<tr${isSummary ? ' style="font-weight:700;border-top:2px solid #ddd;"' : ''}><td>${row.label}</td>${cells}</tr>`;
  }).join('');
  const note = officialAvailable
    ? `官方对比数据动态拉取自 js-framework-benchmark（vanillajs-keyed 为基准 1.00×）。本地乘数（Rasen (reactive-vue) / Rasen (alien-signals)，两个变体独立计算）= 本地均值 / 本地 Native 均值；官方框架乘数 = 官方均值 / 官方 vanillajs 均值。`
    : `⚠️ 官方数据拉取失败，仅显示本地 Rasen 变体 vs Native 乘数。`;
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Rasen 性能乘数报告</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; padding: 40px 20px; }
    .container { max-width: 980px; margin: 0 auto; }
    h1 { color: #333; margin-bottom: 10px; font-size: 28px; }
    .meta { color: #666; font-size: 14px; margin-bottom: 30px; }
    table { width: 100%; border-collapse: collapse; background: white; box-shadow: 0 1px 3px rgba(0,0,0,0.1); border-radius: 4px; overflow: hidden; }
    thead { background: #f8f8f8; border-bottom: 2px solid #ddd; }
    th, td { padding: 12px 16px; text-align: right; border-bottom: 1px solid #eee; }
    th:first-child, td:first-child { text-align: left; font-weight: 600; }
    th { color: #333; font-weight: 600; }
    tbody tr:hover { background: #f9f9f9; }
    .note { margin-top: 20px; color: #888; font-size: 13px; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Rasen 性能乘数报告</h1>
    <div class="meta">生成时间: ${timestamp} · 乘数 = 框架耗时 / Native DOM 耗时（Native = 1.00×）</div>
    <table><thead>${head}</thead><tbody>${body}</tbody></table>
    <div class="note">${note}</div>
  </div>
</body>
</html>`;
}

async function finalizeMultiplierReport(allResults) {
  let official = null;
  let officialAvailable = false;
  try {
    official = await fetchOfficialResults();
    officialAvailable = true;
    console.log(`✓ 官方数据已就绪（vanilla baseline: ${official.vanillaName}）`);
  } catch (e) {
    console.error(`\n⚠️ 官方数据拉取失败: ${e.message}（仅输出本地乘数）`);
  }

  const rows = buildMultiplierRows(allResults, official);
  if (!rows) {
    console.error('无法构建乘数报告：缺少 Rasen 变体或 Native DOM 结果。');
    return;
  }

  console.log(`\n\n${'═'.repeat(70)}`);
  console.log(`性能乘数报告（Native DOM = 1.00×）`);
  console.log(`${'═'.repeat(70)}\n`);
  const header = ['Benchmark'.padEnd(26), 'Rasen(vue)'.padStart(10), 'Rasen(alien)'.padStart(12),
    ...OFFICIAL_COMPARISONS.map(c => c.label.padStart(14)), 'Native'.padStart(9)].join('  ');
  console.log(header);
  console.log('-'.repeat(70));
  rows.forEach(r => {
    if (!r) return; // benchmark failed -> no stats
    const cells = [
      fmtMult(r.rasen).padStart(10),
      fmtMult(r.alien).padStart(12),
      ...OFFICIAL_COMPARISONS.map(c => fmtMult(r[c.label]).padStart(14)),
      fmtMult(r.native).padStart(9)
    ].join('  ');
    console.log(`${r.label.padEnd(26)} ${cells}`);
  });

  const reportPayload = JSON.stringify({
    generatedAt: new Date().toISOString(),
    baseline: 'Native DOM (vanillajs) = 1.00×',
    officialAvailable,
    officialVanillaName: official ? official.vanillaName : null,
    rows,
    localRaw: allResults
  }, null, 2);

  const htmlFile = path.join(__dirname, 'report.html');
  fs.writeFileSync(htmlFile, generateMultiplierReport(rows, officialAvailable));
  console.log(`\n✓ 乘数报告已保存到: ${htmlFile}`);

  const jsonFile = path.join(__dirname, 'report.json');
  fs.writeFileSync(jsonFile, reportPayload);
  console.log(`✓ JSON 数据已保存到: ${jsonFile}`);

  // Archive timestamped copies under reports/: preserves every run's history
  // and gives regenerate-report.js its multiplier-*.json cache source.
  // Both files are gitignored via benchmark/.gitignore.
  const reportDir = path.join(__dirname, 'reports');
  if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.writeFileSync(
    path.join(reportDir, `multiplier-${stamp}.html`),
    generateMultiplierReport(rows, officialAvailable)
  );
  fs.writeFileSync(path.join(reportDir, `multiplier-${stamp}.json`), reportPayload);
  console.log(`✓ 已归档到 reports/: multiplier-${stamp}.html / .json`);
}

module.exports = {
  fetchOfficialResults,
  buildMultiplierRows,
  generateMultiplierReport,
  finalizeMultiplierReport
};

if (require.main === module) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
