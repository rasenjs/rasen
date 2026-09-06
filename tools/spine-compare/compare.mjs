#!/usr/bin/env node
/**
 * Spine Runtime Comparison Tool
 * Compares @rasenjs/spine vs official Spine runtime bone positions.
 *
 * Usage:
 *   node compare.mjs --char c010_03 --anim idle --time 0
 *   node compare.mjs --char c091_01 --anim action --time 3.8
 *   node compare.mjs --char 777 --anim idle --time 0
 *   node compare.mjs --char c010_03 --anim action --start 0 --end 3 --step 0.2
 */
import { readFileSync } from 'fs';
import { JSDOM } from 'jsdom';
import { resolve } from 'path';

const args = process.argv.slice(2);
const getArg = (n, d) => { const i = args.indexOf(n); return i >= 0 && i + 1 < args.length ? args[i + 1] : d; };
const hasFlag = (n) => args.includes(n);

const charName = getArg('--char', 'c010_03');
const animName = getArg('--anim', 'idle');
const time = parseFloat(getArg('--time', '0'));
const startT = parseFloat(getArg('--start', String(time)));
const endT = parseFloat(getArg('--end', String(time)));
const step = parseFloat(getArg('--step', '0.2'));
const filterBones = getArg('--bones')?.split(',').map(s => s.trim());
const officialPath = getArg('--official-path', '/tmp/spine-compare/spine-webgl.js');
const tolerance = parseFloat(getArg('--tolerance', '2.0'));

// Resolve data files
const dataDir = '/tmp';
let skelPath, atlasPath;
for (const sfx of ['_00', '_01', '', '_02', '_03']) {
  try { readFileSync(`${dataDir}/${charName}${sfx}.skel`); skelPath = `${dataDir}/${charName}${sfx}.skel`; atlasPath = `${dataDir}/${charName}${sfx}.atlas`; break; } catch {}
}
if (!skelPath) { console.error(`Cannot find skeleton for ${charName}`); process.exit(1); }

// === Our runtime ===
const { parseSpineBinary, parseSpineAtlas, Skeleton, applyAnimation } = await import(resolve(import.meta.dirname, '../../packages/spine/dist/index.js'));

function snapshot(sk) {
  const bones = {};
  for (const b of sk.bones) {
    bones[b.data.name] = { x: b.worldX, y: b.worldY, a: b.a, b: b.b, c: b.c, d: b.d, rot: b.rotation };
  }
  const slots = {};
  for (const s of sk.drawOrder) {
    slots[s.data.name] = { att: s.attachment || null, alpha: parseInt(s.color.slice(6, 8), 16) / 255 };
  }
  const tc = {};
  for (const c of sk.transformConstraints) tc[c.data.name] = { mixX: c.mixX, mixY: c.mixY };
  const ik = {};
  for (const i of sk.ikConstraints) ik[i.data.name] = { mix: i.mix };
  return { bones, slots, constraints: tc, ik };
}

function runOurs(skelBuf, atlasText, anim, t) {
  const data = parseSpineBinary(new Uint8Array(skelBuf));
  const atlas = parseSpineAtlas(atlasText);
  if (!data.animations[anim]) return null;
  const sk = new Skeleton(data);
  applyAnimation(sk, data.animations[anim], t, true);
  return snapshot(sk);
}

// === Official runtime ===
async function loadOfficial() {
  const vm = await import('vm');
  const code = readFileSync(officialPath, 'utf8');
  const dom = new JSDOM('<!DOCTYPE html><html><body><canvas id="c" width="1" height="1"></canvas></body></html>', {
    url: 'http://localhost', pretendVisualViewport: true,
  });
  const canvas = dom.window.document.getElementById('c');
  canvas.getContext = () => ({});
  const ctx = vm.createContext({
    window: dom.window, document: dom.window.document, self: dom.window, canvas,
    Image: class Image { set src(v) { this._src = v; this.onload?.(); } get src() { return this._src; } },
    console, setTimeout, setInterval, clearTimeout, clearInterval,
    Error, RangeError, TypeError, parseInt, parseFloat, isNaN, isFinite,
    Infinity, NaN, undefined, Math, Date, Array, Object, String, Number, Boolean,
    Map, Set, WeakMap, WeakSet, Symbol, Proxy, Reflect,
    Float32Array, Uint8Array, Uint16Array, Uint32Array, Int32Array,
    ArrayBuffer, DataView, TextDecoder, TextEncoder,
    performance: { now: () => Date.now() },
    navigator: { userAgent: 'node' },
    location: { href: 'http://localhost', origin: 'http://localhost' },
    requestAnimationFrame: () => {}, cancelAnimationFrame: () => {},
    addEventListener: () => {}, removeEventListener: () => {},
  });
  vm.runInContext(code, ctx, { filename: 'spine.js' });
  const spine = ctx.spine;
  dom.window.close();
  return spine;
}

function runOfficial(spine, skelBuf, atlasText, anim, t) {
  // Parse atlas first
  const atlas = new spine.TextureAtlas(atlasText, (path) => ({
    setFilter: () => {}, setWraps: () => {},
    getRegion: () => null, dispose: () => {},
  }));
  // Create skeleton with proper attachment loader
  const loader = new spine.AtlasAttachmentLoader(atlas);
  const sd = new spine.SkeletonBinary(loader).readSkeletonData(new Uint8Array(skelBuf));
  const sk = new spine.Skeleton(sd);
  sk.setSkinByName('default');
  const sd2 = new spine.AnimationStateData(sd);
  const st = new spine.AnimationState(sd2);
  st.setAnimation(0, anim, true);
  st.update(t);
  st.apply(sk);
  sk.updateWorldTransform();
  // Snapshot
  const bones = {};
  for (const b of sk.bones) bones[b.data.name] = { x: b.worldX, y: b.worldY, a: b.a, b: b.b, c: b.c, d: b.d, rot: b.rotation };
  const slots = {};
  for (const s of sk.drawOrder) slots[s.data.name] = { att: s.attachment?.name ?? null, alpha: s.color.a };
  const tc = {};
  for (const c of sk.transformConstraints) tc[c.data.name] = { mixX: c.mixX, mixY: c.mixY };
  const ik = {};
  for (const i of sk.ikConstraints) ik[i.data.name] = { mix: i.mix };
  return { bones, slots, constraints: tc, ik };
}

// === Compare ===
function compare(ours, official) {
  const diffs = [];
  const allBones = new Set([...Object.keys(ours.bones), ...Object.keys(official.bones)]);
  for (const name of allBones) {
    if (filterBones && !filterBones.includes(name)) continue;
    const o = ours.bones[name], f = official.bones[name];
    if (!o || !f) { diffs.push({ type: 'bone', name, issue: o ? 'missing in official' : 'missing in ours' }); continue; }
    const dx = Math.abs(o.x - f.x), dy = Math.abs(o.y - f.y), dr = Math.abs(o.rot - f.rot);
    if (dx > tolerance || dy > tolerance) {
      diffs.push({ type: 'bone', name, ours: `${o.x.toFixed(1)},${o.y.toFixed(1)}`, official: `${f.x.toFixed(1)},${f.y.toFixed(1)}`, dx: dx.toFixed(1), dy: dy.toFixed(1) });
    }
  }
  // Constraints
  const allTC = new Set([...Object.keys(ours.constraints), ...Object.keys(official.constraints)]);
  for (const name of allTC) {
    const o = ours.constraints[name], f = official.constraints[name];
    if (o && f && (Math.abs(o.mixX - f.mixX) > 0.001 || Math.abs(o.mixY - f.mixY) > 0.001))
      diffs.push({ type: 'tc', name, ours: `x=${o.mixX.toFixed(2)} y=${o.mixY.toFixed(2)}`, official: `x=${f.mixX.toFixed(2)} y=${f.mixY.toFixed(2)}` });
  }
  const allIK = new Set([...Object.keys(ours.ik), ...Object.keys(official.ik)]);
  for (const name of allIK) {
    const o = ours.ik[name], f = official.ik[name];
    if (o && f && Math.abs(o.mix - f.mix) > 0.001)
      diffs.push({ type: 'ik', name, ours: o.mix.toFixed(2), official: f.mix.toFixed(2) });
  }
  return diffs;
}

// === Main ===
async function main() {
  console.log(`\n🔬 Spine Runtime Comparison`);
  console.log(`   char=${charName} anim=${animName} time=${startT}..${endT} step=${step} tol=${tolerance}px\n`);

  const skelBuf = readFileSync(skelPath);
  const atlasText = readFileSync(atlasPath, 'utf8');

  console.log('Loading official spine runtime...');
  const officialSpine = await loadOfficial();
  console.log('✅ Official runtime loaded\n');

  const times = [];
  for (let t = startT; t <= endT + 0.001; t += step) times.push(Math.round(t * 1000) / 1000);
  if (times.length === 0) times.push(startT);

  let totalDiffs = 0;
  for (const t of times) {
    process.stdout.write(`t=${t.toFixed(2)}  `);
    const ours = runOurs(skelBuf, atlasText, animName, t);
    const official = runOfficial(officialSpine, skelBuf, atlasText, animName, t);
    if (!ours || !official) { console.log('SKIP'); continue; }
    const diffs = compare(ours, official);
    totalDiffs += diffs.length;
    if (diffs.length === 0) { console.log('✅ MATCH'); }
    else {
      console.log(`❌ ${diffs.length} diffs`);
      for (const d of diffs) console.log(`    [${d.type}] ${d.name}: ours=${d.ours} official=${d.official} Δ=${d.dx||''}${d.dy?'x'+d.dy:''}`);
    }
  }
  console.log(`\n📊 Total: ${totalDiffs} diffs across ${times.length} frames`);
}
main().catch(e => { console.error(e); process.exit(1); });
