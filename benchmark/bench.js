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
  defaultIterations: 3,
  warmupIterations: 1
};

// Benchmark targets. The harness starts each package's `npm start` itself,
// passing a dynamically allocated free port via the PORT env var and a ready
// signal via BENCH_READY_SIGNAL. Each server is shut down after its package
// is measured ("测完一个关一个"), so packages stay fully decoupled.
// Only two local targets: Rasen + Native DOM (vanillajs, aligned with official
// `vanillajs-keyed`). All other framework comparisons are fetched dynamically
// from the official js-framework-benchmark `results.ts` at runtime.
const TARGETS = [
  { name: 'Rasen', dir: 'rasen' },
  { name: 'Native DOM (vanillajs)', dir: 'vanillajs' }
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
        // Fallback: free the port in case the child left orphans.
        spawn('sh', ['-c', `lsof -ti tcp:${port} | xargs -r kill -9`], { stdio: 'ignore' });
      } catch (e) { /* ignore */ }
      resolve();
    };
    if (!child) return resolve();
    child.on('exit', () => resolve());
    cleanup();
    setTimeout(resolve, 2000);
  });
}

// 测试套件定义
const BENCHMARKS = [
  {
    id: '01_run1k',
    label: 'Create 1,000 rows',
    action: async (page) => {
      const startTime = performance.now();
      await page.click('#run');
      // 等待表格渲染完成
      await page.waitForFunction(
        () => document.querySelectorAll('tbody tr').length >= 1000,
        { timeout: 10000 }
      );
      return performance.now() - startTime;
    }
  },
  {
    id: '02_runlots',
    label: 'Create 10,000 rows',
    action: async (page) => {
      const startTime = performance.now();
      await page.click('#runlots');
      await page.waitForFunction(
        () => document.querySelectorAll('tbody tr').length >= 10000,
        { timeout: 15000 }
      );
      return performance.now() - startTime;
    }
  },
  {
    id: '03_update',
    label: 'Update every 10th row',
    setup: async (page) => {
      await page.click('#run');
      await page.waitForFunction(
        () => document.querySelectorAll('tbody tr').length >= 1000,
        { timeout: 10000 }
      );
    },
    action: async (page) => {
      const startTime = performance.now();
      await page.click('#update');
      // Wait until the " !!!" suffix actually appears in the DOM instead of
      // a fixed delay — makes the measurement reflect real render time.
      await page.waitForFunction(
        () => document.body.textContent.includes(' !!!'),
        { timeout: 10000 }
      );
      return performance.now() - startTime;
    }
  },
  {
    id: '04_select',
    label: 'Select row (highlight)',
    setup: async (page) => {
      await page.click('#run');
      await page.waitForFunction(
        () => document.querySelectorAll('tbody tr').length >= 1000,
        { timeout: 10000 }
      );
    },
    action: async (page) => {
      const startTime = performance.now();
      await page.evaluate(() => {
        const firstLink = document.querySelector('tbody tr a');
        if (firstLink) firstLink.click();
      });
      // Wait until the selected row actually gets the `danger` class.
      await page.waitForFunction(
        () => document.querySelector('tbody tr.danger') !== null,
        { timeout: 10000 }
      );
      return performance.now() - startTime;
    }
  },
  {
    id: '05_swap',
    label: 'Swap rows 1 and 998',
    setup: async (page) => {
      await page.click('#run');
      await page.waitForFunction(
        () => document.querySelectorAll('tbody tr').length >= 1000,
        { timeout: 10000 }
      );
    },
    action: async (page) => {
      const startTime = performance.now();
      // Capture the 2nd row's id cell before swapping (swapRows swaps
      // index 1 and 998, so the first row is unchanged).
      const before = await page
        .$eval('tbody tr:nth-child(2) td:first-child', el => el.textContent)
        .catch(() => null);
      await page.click('#swaprows');
      await page.waitForFunction(
        (b) => {
          const el = document.querySelector('tbody tr:nth-child(2) td:first-child');
          return el !== null && el.textContent !== b;
        },
        { timeout: 10000 },
        before
      );
      return performance.now() - startTime;
    }
  },
  {
    id: '06_remove',
    label: 'Remove a row',
    setup: async (page) => {
      await page.click('#run');
      await page.waitForFunction(
        () => document.querySelectorAll('tbody tr').length >= 1000,
        { timeout: 10000 }
      );
    },
    action: async (page) => {
      const startTime = performance.now();
      const before = await page.$$eval('tbody tr', rows => rows.length);
      await page.evaluate(() => {
        const firstDeleteBtn = document.querySelector('tbody tr a.remove');
        if (firstDeleteBtn) firstDeleteBtn.click();
      });
      // Wait until the row count actually drops.
      await page.waitForFunction(
        (n) => document.querySelectorAll('tbody tr').length < n,
        { timeout: 10000 },
        before
      );
      return performance.now() - startTime;
    }
  },
  {
    id: '07_clear',
    label: 'Clear all rows',
    action: async (page) => {
      await page.click('#run');
      await page.waitForFunction(
        () => document.querySelectorAll('tbody tr').length >= 1000,
        { timeout: 10000 }
      );

      const startTime = performance.now();
      await page.click('#clear');
      // Wait until all rows are actually removed.
      await page.waitForFunction(
        () => document.querySelectorAll('tbody tr').length === 0,
        { timeout: 10000 }
      );
      return performance.now() - startTime;
    }
  }
];

/**
 * 计算统计数据
 */
function calculateStats(times) {
  if (times.length === 0) return null;

  const sorted = [...times].sort((a, b) => a - b);
  
  // 去掉最快和最慢的结果（冷启动和异常数据）
  if (sorted.length > 2) {
    sorted.shift();
    sorted.pop();
  }

  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;
  const median = sorted.length % 2 === 0
    ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : sorted[Math.floor(sorted.length / 2)];

  const variance = sorted.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / sorted.length;
  const stdDev = Math.sqrt(variance);

  return { min, max, mean, median, stdDev, count: sorted.length, values: sorted };
}

/**
 * 清空表格
 */
async function clearTable(page) {
  try {
    await page.click('#clear');
    await new Promise(r => setTimeout(r, 300));
  } catch (e) {
    // 忽略错误
  }
}

/**
 * 运行单个基准测试
 */
async function runBenchmark(browser, benchmark, iterations) {
  console.log(`\n▶ ${benchmark.label} (${iterations}次迭代)`);
  
  const times = [];
  
  // 预热
  if (iterations > 1) {
    console.log('  预热...');
    const page = await browser.newPage();
    try {
      page.setDefaultNavigationTimeout(CONFIG.timeout);
      page.setDefaultTimeout(CONFIG.timeout);
      await page.goto(CONFIG.serverUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await new Promise(r => setTimeout(r, 500));
      if (benchmark.setup) {
        await benchmark.setup(page);
      }
      await benchmark.action(page);
      await clearTable(page);
    } catch (e) {
      console.log(`  预热失败: ${e.message}`);
    } finally {
      await page.close();
    }
  }

  // 正式测试
  for (let i = 0; i < iterations; i++) {
    const page = await browser.newPage();
    try {
      // 设置超时
      page.setDefaultNavigationTimeout(CONFIG.timeout);
      page.setDefaultTimeout(CONFIG.timeout);
      
      // 导航到基准测试页面
      console.log(`  迭代 ${i + 1}/${iterations}: 加载页面...`);
      await page.goto(CONFIG.serverUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      
      // 等待页面初始化
      await new Promise(r => setTimeout(r, 500));
      
      // 执行 setup（如果有）
      if (benchmark.setup) {
        console.log(`  迭代 ${i + 1}/${iterations}: setup...`);
        await benchmark.setup(page);
      }
      
      // 执行基准测试
      console.log(`  迭代 ${i + 1}/${iterations}: 运行...`);
      const time = await benchmark.action(page);
      times.push(time);
      
      // 清理
      await clearTable(page);
      
      console.log(`    耗时: ${time.toFixed(2)}ms`);
    } catch (error) {
      console.error(`  ✗ 错误: ${error.message}`);
      console.error(error.stack);
    } finally {
      await page.close();
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
      const browser = await puppeteer.launch({
        headless: headless,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu'
        ]
      });
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
      const signal = 'Benchmark Ready';
      const allResults = [];
      for (const target of TARGETS) {
        const port = await findFreePort();
        console.log(`\n🌐 [${target.name}] 分配空闲端口 ${port}，启动服务器...`);
        let server;
        let browser;
        try {
          server = await startServer(target.dir, port, signal);
          CONFIG.serverUrl = `http://localhost:${port}`;
          console.log(`📊 [${target.name}] 服务器就绪，开始基准测试 (count=${iterations})...`);
          browser = await puppeteer.launch({
            headless: headless,
            args: [
              '--no-sandbox',
              '--disable-setuid-sandbox',
              '--disable-dev-shm-usage',
              '--disable-gpu'
            ]
          });
          const results = await runAllBenchmarks(
            browser, iterations, captureProfile && allResults.length === 0, activeBenchmarks
          );
          allResults.push({ target: target.name, results });
        } finally {
          if (browser) await browser.close();
          await stopServer(server, port);
          console.log(`🔌 [${target.name}] 服务器已关闭`);
        }
      }
      await finalizeMultiplierReport(allResults);
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
  const rasen = allResults.find(t => t.target === 'Rasen');
  const vanilla = allResults.find(t => t.target === 'Native DOM (vanillajs)');
  if (!rasen || !vanilla) return null;

  // Iterate over the benchmarks that were ACTUALLY run (rasen.results), keyed
  // by `id`, so partial runs (--bench filter) produce correctly aligned rows
  // instead of indexing the full BENCHMARKS list.
  const rows = rasen.results.map((r, i) => {
    const vResult = vanilla.results[i];
    const rMean = r.stats.mean;
    const vMean = vResult ? vResult.stats.mean : null;
    const row = { id: r.id, label: r.label, native: 1.0, rasen: (rMean && vMean) ? rMean / vMean : null };
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

  const summary = { id: 'geo', label: 'Geometric mean', native: 1.0 };
  summary.rasen = geoMean(rows.map(r => r.rasen));
  OFFICIAL_COMPARISONS.forEach(comp => {
    summary[comp.label] = geoMean(rows.map(r => r[comp.label]));
  });
  rows.push(summary);
  return rows;
}

function generateMultiplierReport(rows, officialAvailable) {
  const timestamp = new Date().toISOString();
  const columns = ['Rasen', ...OFFICIAL_COMPARISONS.map(c => c.label), 'Native'];
  const head = `<tr><th>Benchmark</th>${columns.map(c => `<th>${c}</th>`).join('')}</tr>`;
  const body = rows.map(row => {
    const cells = [
      fmtMult(row.rasen),
      ...OFFICIAL_COMPARISONS.map(c => fmtMult(row[c.label])),
      fmtMult(row.native)
    ].map(v => `<td>${v}</td>`).join('');
    const isSummary = row.id === 'geo';
    return `<tr${isSummary ? ' style="font-weight:700;border-top:2px solid #ddd;"' : ''}><td>${row.label}</td>${cells}</tr>`;
  }).join('');
  const note = officialAvailable
    ? `官方对比数据动态拉取自 js-framework-benchmark（vanillajs-keyed 为基准 1.00×）。本地 Rasen 乘数 = 本地 Rasen 均值 / 本地 Native 均值；官方框架乘数 = 官方均值 / 官方 vanillajs 均值。`
    : `⚠️ 官方数据拉取失败，仅显示本地 Rasen vs Native 乘数。`;
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
    console.error('无法构建乘数报告：缺少 Rasen 或 Native DOM 结果。');
    return;
  }

  console.log(`\n\n${'═'.repeat(70)}`);
  console.log(`性能乘数报告（Native DOM = 1.00×）`);
  console.log(`${'═'.repeat(70)}\n`);
  const header = ['Benchmark'.padEnd(26), 'Rasen'.padStart(8),
    ...OFFICIAL_COMPARISONS.map(c => c.label.padStart(14)), 'Native'.padStart(9)].join('  ');
  console.log(header);
  console.log('-'.repeat(70));
  rows.forEach(r => {
    const cells = [
      fmtMult(r.rasen).padStart(8),
      ...OFFICIAL_COMPARISONS.map(c => fmtMult(r[c.label]).padStart(14)),
      fmtMult(r.native).padStart(9)
    ].join('  ');
    console.log(`${r.label.padEnd(26)} ${cells}`);
  });

  const htmlFile = path.join(__dirname, 'report.html');
  fs.writeFileSync(htmlFile, generateMultiplierReport(rows, officialAvailable));
  console.log(`\n✓ 乘数报告已保存到: ${htmlFile}`);

  const jsonFile = path.join(__dirname, 'report.json');
  fs.writeFileSync(jsonFile, JSON.stringify({
    generatedAt: new Date().toISOString(),
    baseline: 'Native DOM (vanillajs) = 1.00×',
    officialAvailable,
    officialVanillaName: official ? official.vanillaName : null,
    rows,
    localRaw: allResults
  }, null, 2));
  console.log(`✓ JSON 数据已保存到: ${jsonFile}`);
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
