import { parseSpineBinary, Skeleton, applyAnimation } from "../../packages/spine/dist/index.js";
import fs from "fs";

const data = parseSpineBinary(new Uint8Array(fs.readFileSync("/tmp/c310_00.skel")));
console.log("version:", data.version, "slots:", data.slots.length);

// List ALL slots with draw order index
for (let i = 0; i < data.slots.length; i++) {
  const s = data.slots[i];
  const att = data.skins[0]?.attachments[s.name]?.[s.attachment];
  const t = att?.type || "none";
  const name = s.name;
  const isSkirt = name.toLowerCase().includes("skirt") || name.toLowerCase().includes("pleat") || name.toLowerCase().includes("lining");
  const marker = isSkirt ? " ★" : "";
  if (t !== "none") {
    console.log(`  ${String(i).padStart(3)}: ${name.padEnd(35)} ${t.padEnd(12)} bone:${s.bone}${marker}`);
  }
}

// Compare slot draw order between our runtime and official spine 4.2
const { JSDOM } = await import("jsdom");
const vm = await import("vm");
const spineCode = fs.readFileSync("output/spine-webgl.js", "utf8");
const dom = new JSDOM("<!DOCTYPE html><html><body><canvas></canvas></body></html>", { url: "http://localhost" });
const canvas = dom.window.document.querySelector("canvas");
canvas.getContext = () => ({ createTexture: () => ({}), bindTexture: () => {}, texImage2D: () => {}, texParameteri: () => {}, getParameter: () => 4096, getExtension: () => null });
const ctx = vm.createContext({
  window: dom.window, document: dom.window.document, self: dom.window, canvas,
  Image: class { set src(v) {} },
  console, setTimeout, setInterval, clearTimeout, clearInterval,
  Error, RangeError, TypeError, parseInt, parseFloat, isNaN, isFinite,
  Infinity, NaN, undefined, Math, Date, Array, Object, String, Number, Boolean,
  Map, Set, WeakMap, WeakSet, Symbol, Proxy, Reflect,
  Float32Array, Uint8Array, Uint16Array, Uint32Array, Int32Array, ArrayBuffer, DataView,
  TextDecoder, TextEncoder, performance: { now: () => Date.now() },
  navigator: { userAgent: "node" }, location: { href: "http://localhost" },
  requestAnimationFrame: () => {}, cancelAnimationFrame: () => {},
  addEventListener: () => {}, removeEventListener: () => {},
});
vm.runInContext(spineCode, ctx);
const spine = ctx.spine;
dom.window.close();

// Parse with official spine
const skelBuf = fs.readFileSync("/tmp/c310_00.skel");
const atlasText = fs.readFileSync("/tmp/c310_00.atlas", "utf8");
const atlas = new spine.TextureAtlas(atlasText, (p) => ({ setFilter: () => {}, setWraps: () => {}, getRegion: () => null, dispose: () => {} }));
const loader = new spine.AtlasAttachmentLoader(atlas);
const sd = new spine.SkeletonBinary(loader).readSkeletonData(new Uint8Array(skelBuf));
const sk = new spine.Skeleton(sd);
sk.setSkinByName("default");
sk.setSlotsToSetupPose();
sk.updateWorldTransform();
const sd2 = new spine.AnimationStateData(sd);
const st = new spine.AnimationState(sd2);
st.setAnimation(0, "idle", true);
st.update(0);
st.apply(sk);
sk.updateWorldTransform();

console.log("\n=== Official spine 4.2 draw order (mesh/region only) ===");
for (let i = 0; i < sk.drawOrder.length; i++) {
  const slot = sk.drawOrder[i];
  const att = slot.attachment;
  if (att) {
    const isSkirt = slot.data.name.toLowerCase().includes("skirt") || slot.data.name.toLowerCase().includes("pleat");
    const marker = isSkirt ? " ★" : "";
    console.log(`  ${String(i).padStart(3)}: ${slot.data.name.padEnd(35)} ${att.constructor.name.padEnd(20)} bone:${slot.bone.data.name}${marker}`);
  }
}

// Parse with our runtime
const sk2 = new Skeleton(data);
applyAnimation(sk2, data.animations["idle"], 0, true);

console.log("\n=== Our runtime draw order (mesh/region only) ===");
for (let i = 0; i < sk2.drawOrder.length; i++) {
  const slot = sk2.drawOrder[i];
  if (slot.attachment) {
    const attData = sk2.findAttachment(slot.data.name, slot.attachment);
    const isSkirt = slot.data.name.toLowerCase().includes("skirt") || slot.data.name.toLowerCase().includes("pleat");
    const marker = isSkirt ? " ★" : "";
    console.log(`  ${String(i).padStart(3)}: ${slot.data.name.padEnd(35)} ${(attData?.type||"none").padEnd(20)} bone:${slot.bone.data.name}${marker}`);
  }
}
