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
const { performance } = require('perf_hooks');

// 配置
const CONFIG = {
  serverUrl: 'http://localhost:5174',
  timeout: 60000,
  defaultIterations: 3,
  warmupIterations: 1
};

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
      await new Promise(r => setTimeout(r, 1000));
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
      await new Promise(r => setTimeout(r, 300));
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
      await page.click('#swaprows');
      await new Promise(r => setTimeout(r, 500));
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
      await page.evaluate(() => {
        const firstDeleteBtn = document.querySelector('tbody tr td:last-child button');
        if (firstDeleteBtn) firstDeleteBtn.click();
      });
      await new Promise(r => setTimeout(r, 300));
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
      await new Promise(r => setTimeout(r, 500));
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

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2);
  const headless = !args.includes('--no-headless');
  const countArg = args.find(a => a.startsWith('--count'));
  const iterations = countArg ? parseInt(countArg.split('=')[1]) : CONFIG.defaultIterations;
  const captureProfile = args.includes('--profile');

  console.log(`
╔════════════════════════════════════════════╗
║   Rasen 性能基准测试工具                    ║
╚════════════════════════════════════════════╝
`);
  console.log(`配置:`);
  console.log(`  服务器: ${CONFIG.serverUrl}`);
  console.log(`  每项迭代: ${iterations}次`);
  console.log(`  无头模式: ${headless}`);
  console.log(`  测试项: ${BENCHMARKS.length}个`);
  if (captureProfile) {
    console.log(`  捕获 profile: 是`);
  }

  let browser;
  try {
    // 启动浏览器
    console.log(`\n启动浏览器...`);
    browser = await puppeteer.launch({
      headless: headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--single-process'
      ]
    });
    console.log('✓ 浏览器已启动\n');

    // 运行所有基准测试
    const results = [];
    
    // 如果需要捕获 profile，在第一个测试前启动
    let profilePage = null;
    if (captureProfile) {
      console.log('\n🔍 准备捕获性能 profile...');
      profilePage = await browser.newPage();
      await profilePage.goto(CONFIG.serverUrl, { waitUntil: 'domcontentloaded' });
      await new Promise(r => setTimeout(r, 500));
      
      // 验证端口
      const pageUrl = await profilePage.evaluate(() => window.location.href);
      console.log(`  访问页面: ${pageUrl}`);
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const tracePath = `trace-${timestamp}.json`;
      
      await profilePage.tracing.start({ 
        path: tracePath,
        categories: ['devtools.timeline', 'v8.execute', 'disabled-by-default-v8.cpu_profiler']
      });
      
      // 执行一次完整的 run + update 测试
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
    
    for (const benchmark of BENCHMARKS) {
      const stats = await runBenchmark(browser, benchmark, iterations);
      results.push({
        id: benchmark.id,
        label: benchmark.label,
        stats: stats
      });
    }

    // 生成报告
    console.log(`\n\n${'═'.repeat(50)}`);
    console.log(`测试完成！`);
    console.log(`${'═'.repeat(50)}\n`);

    // 打印摘要
    console.log(`测试结果摘要:`);
    console.log(`${'-'.repeat(50)}`);
    results.forEach(r => {
      console.log(`${r.label.padEnd(30)} ${r.stats.mean.toFixed(2).padStart(8)}ms (±${r.stats.stdDev.toFixed(2)})`);
    });
    console.log(`${'-'.repeat(50)}`);

    // 保存 HTML 报告
    const reportDir = path.join(__dirname, 'reports');
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportFile = path.join(reportDir, `benchmark-${timestamp}.html`);
    const html = generateHtmlReport(results);
    fs.writeFileSync(reportFile, html);
    console.log(`\n✓ 报告已保存到: ${reportFile}`);

    // 保存 JSON 结果
    const jsonFile = path.join(reportDir, `benchmark-${timestamp}.json`);
    fs.writeFileSync(jsonFile, JSON.stringify(results, null, 2));
    console.log(`✓ JSON 数据已保存到: ${jsonFile}`);

  } catch (error) {
    console.error(`\n✗ 错误: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
