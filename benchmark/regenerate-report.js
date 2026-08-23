#!/usr/bin/env node
/* eslint-disable */
/**
 * Regenerate the multiplier report (report.json + report.html) WITHOUT
 * re-running the Puppeteer benchmark.
 *
 * It reuses the locally measured Rasen + Native DOM (vanillajs) results that
 * were cached inside the previously generated `multiplier-*.json` (under the
 * `localRaw` field), then re-fetches the official js-framework-benchmark data
 * live (now including Solid / Svelte / Angular) and rebuilds the report.
 *
 * Usage: node regenerate-report.js
 */

const path = require('path');
const fs = require('fs');
const bench = require('./bench.js');

async function main() {
  const reportsDir = path.join(__dirname, 'reports');
  if (!fs.existsSync(reportsDir)) {
    console.error('No reports/ directory found — run the benchmark first.');
    process.exit(1);
  }

  // Pick the most recently generated multiplier-*.json as the cache source.
  const files = fs.readdirSync(reportsDir)
    .filter(f => /^multiplier-.*\.json$/.test(f))
    .map(f => ({ f, mtime: fs.statSync(path.join(reportsDir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);

  if (!files.length) {
    console.error('No cached multiplier-*.json found in reports/.');
    process.exit(1);
  }

  const cachedPath = path.join(reportsDir, files[0].f);
  console.log(`📂 读取缓存的本地结果: ${cachedPath}`);
  const cached = JSON.parse(fs.readFileSync(cachedPath, 'utf8'));
  const localRaw = cached.localRaw;
  if (!Array.isArray(localRaw) || !localRaw.length) {
    console.error('Cached file is missing the `localRaw` field.');
    process.exit(1);
  }

  // Re-fetch official data (includes Solid / Svelte / Angular) and rebuild.
  await bench.finalizeMultiplierReport(localRaw);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
