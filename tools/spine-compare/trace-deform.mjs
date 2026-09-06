/**
 * Trace deform binary parsing for n_breast_l in 777_00.skel
 * to find the exact byte offset where parsing diverges from official spine.
 */
import { readFileSync } from 'fs';

const bytes = new Uint8Array(readFileSync('/tmp/777_00.skel'));
const buf = bytes.buffer;

// Minimal BinaryInput matching our parser
class Input {
  constructor(b) { this.d = new DataView(b); this.i = 0; }
  byte() { return this.d.getUint8(this.i++); }
  int(s) {
    let r = 0, sh = 0;
    for (;;) {
      const b = this.d.getUint8(this.i++);
      r |= (b & 0x7f) << sh;
      if ((b & 0x80) === 0) break;
      sh += 7;
    }
    return s ? r : (r << 24) >> 24;
  }
  float() { const v = this.d.getFloat32(this.i); this.i += 4; return v; }
  int32() { const v = this.d.getInt32(this.i); this.i += 4; return v; }
  strRef() {
    const len = this.int(true);
    if (len <= 0) return null;
    const s = new TextDecoder().decode(new Uint8Array(buf, this.i, len));
    this.i += len;
    return s;
  }
  bool() { return this.byte() !== 0; }
  skip(n) { this.i += n; }
  pos() { return this.i; }
}

const input = new Input(buf);

// Parse header (hash, version, etc.) to reach deform section
// This mirrors parseSpineBinary structure
const lowHash = input.int32();
const highHash = input.int32();

// Version string (varint length + bytes)
const vlen = input.int(true);
input.skip(vlen);

const x = input.float();
const y = input.float();
const w = input.float();
const h = input.float();
const nonessential = input.bool();
if (nonessential) { input.float(); input.strRef(); input.strRef(); }

// Bone count
const boneCount = input.int(true);
for (let i = 0; i < boneCount; i++) {
  const name = input.strRef();
  const hasParent = input.bool();
  if (hasParent) input.int(true); // parent index
  const len = input.float();
  const rot = input.float();
  const bx = input.float();
  const by = input.float();
  const sx = input.float();
  const sy = input.float();
  const shx = input.float();
  const shy = input.float();
  const bLen = input.float();
  const transform = input.int(true);
  const skin = input.bool();
  const noness = input.bool();
  if (noness) input.int32();
}

// Slot count
const slotCount = input.int(true);
for (let i = 0; i < slotCount; i++) {
  const name = input.strRef();
  const boneIdx = input.int(true);
  const color = input.int32();
  const hasDark = input.bool();
  if (hasDark) input.int32();
  const blend = input.int(true);
}

// IK count
const ikCount = input.int(true);
for (let i = 0; i < ikCount; i++) {
  const name = input.strRef();
  const order = input.int(true);
  const skinReq = input.bool();
  const bc = input.int(true);
  for (let j = 0; j < bc; j++) input.int(true);
  input.int(true); // target
  input.float(); input.float(); // mix, softness
  input.byte(); // bendDirection
  input.bool(); input.bool(); input.bool(); // compress, stretch, uniform
}

// Transform constraint count
const tcCount = input.int(true);
for (let i = 0; i < tcCount; i++) {
  const name = input.strRef();
  const order = input.int(true);
  const skinReq = input.bool();
  const bc = input.int(true);
  for (let j = 0; j < bc; j++) input.int(true);
  input.int(true); // target
  for (let j = 0; j < 9; j++) input.float(); // offset + mix values
}

// Path constraint count
const pcCount = input.int(true);
for (let i = 0; i < pcCount; i++) {
  const name = input.strRef();
  const order = input.int(true);
  const skinReq = input.bool();
  const bc = input.int(true);
  for (let j = 0; j < bc; j++) input.int(true);
  input.int(true); // target
  input.int(true); input.int(true); input.int(true); // modes
  for (let j = 0; j < 5; j++) input.float(); // rotation, position, spacing, rotateMix, translateMix
  input.float(); // mixY
}

// Skin count
const skinCount = input.int(true);
for (let i = 0; i < skinCount; i++) {
  const name = input.strRef();
  const skinBoneCount = input.int(true);
  for (let j = 0; j < skinBoneCount; j++) input.int(true);
  const ikCount2 = input.int(true);
  for (let j = 0; j < ikCount2; j++) input.int(true);
  const tcCount2 = input.int(true);
  for (let j = 0; j < tcCount2; j++) input.int(true);
  const pcCount2 = input.int(true);
  for (let j = 0; j < pcCount2; j++) input.int(true);
  const slotCount2 = input.int(true);
  for (let j = 0; j < slotCount2; j++) {
    input.int(true); // slot index
    const attCount = input.int(true);
    for (let k = 0; k < attCount; k++) {
      const attName = input.strRef();
      const attType = input.byte();
      switch (attType) {
        case 1: // region
          input.strRef(); input.float(); input.float(); input.float(); input.float(); input.float(); input.float();
          input.int32();
          break;
        case 2: // linkedmesh
          input.strRef(); input.byte(); input.strRef(); input.bool();
          input.float(); input.float(); input.float(); input.float();
          input.int32();
          break;
        case 3: // mesh
          const hasFFD = input.bool();
          const vCount = input.int(true);
          for (let v = 0; v < vCount; v++) input.int(true);
          const uvCount = input.int(true);
          for (let v = 0; v < uvCount; v++) { input.float(); input.float(); }
          const triCount = input.int(true);
          for (let v = 0; v < triCount; v++) input.int(true);
          const hull = input.int(true);
          const edgeCount = input.int(true);
          for (let v = 0; v < edgeCount; v++) input.int(true);
          input.float(); input.float(); input.float(); input.float();
          input.int32();
          const width = input.float();
          const height = input.float();
          break;
        case 4: // boundingbox
          input.int(true); // vertexCount
          for (let v = 0; v < input.int(true); v++) input.float(); input.float();
          input.int32();
          break;
        case 5: // path
          const closed = input.bool();
          const cspeed = input.bool();
          const vCount2 = input.int(true);
          for (let v = 0; v < vCount2; v++) input.float(); input.float();
          const lenCount = input.int(true);
          for (let v = 0; v < lenCount; v++) input.float();
          input.int32();
          break;
        case 6: // point
          input.float(); input.float();
          input.int32();
          break;
        case 7: // clipping
          const endSlot = input.strRef();
          const vCount3 = input.int(true);
          for (let v = 0; v < vCount3; v++) input.float(); input.float();
          input.int32();
          break;
      }
    }
  }
}

// Events
const eventCount = input.int(true);
for (let i = 0; i < eventCount; i++) {
  input.strRef(); input.float(); input.int(false); input.float();
  const hasStr = input.bool(); if (hasStr) input.strRef();
  const hasInt = input.bool(); if (hasInt) input.int(true);
  const hasFloat = input.bool(); if (hasFloat) input.float();
  const hasAudio = input.bool(); if (hasAudio) input.strRef();
  const hasVolume = input.bool(); if (hasVolume) input.float();
  const hasBalance = input.bool(); if (hasBalance) input.float();
}

// ANIMATION SECTION
const animCount = input.int(true);
for (let i = 0; i < animCount; i++) {
  const animName = input.strRef();
  
  // Bone timelines
  const boneTimelines = input.int(true);
  for (let j = 0; j < boneTimelines; j++) {
    const boneIdx = input.int(true);
    const types = input.int(true);
    const frameCounts = [];
    for (let k = 0; k < 6; k++) frameCounts.push(input.int(true));
    // rotate, translate, scale, shear
    for (let k = 0; k < 4; k++) {
      const fc = frameCounts[k];
      if (fc === 0) continue;
      let bezierCount = 0;
      if (k < 4) bezierCount = input.int(true); // only rotate/translate/scale/shear use bezier
      const time = input.float();
      for (let f = 0; f < fc; f++) {
        if (k === 0) input.float(); // rotate angle
        else if (k === 1) { input.float(); input.float(); } // x, y
        else if (k === 2) { input.float(); input.float(); } // scaleX, scaleY
        else { input.float(); input.float(); } // shearX, shearY
        if (f < fc - 1) {
          input.float(); // time2
          input.byte(); // curve type
          if (input.d.getUint8(input.i - 1) === 2) input.skip(16); // bezier 4 floats
        }
      }
    }
  }
  
  // Slot timelines
  const slotTimelines = input.int(true);
  for (let j = 0; j < slotTimelines; j++) {
    const slotIdx = input.int(true);
    const types = input.int(true);
    // attachment
    if (types & 1) {
      const fc = input.int(true);
      for (let f = 0; f < fc; f++) {
        input.float(); // time
        input.strRef(); // attachment name
      }
    }
    // rgba
    if (types & 2) {
      const bc = input.int(true);
      const fc = input.int(true);
      for (let f = 0; f < fc; f++) {
        input.float(); input.int32(); // time, color
        if (f < fc - 1) {
          input.float(); // time2
          input.byte(); // curve
          const ct = input.d.getUint8(input.i - 1);
          if (ct === 2) input.skip(16);
        }
      }
    }
    // rgba2
    if (types & 4) {
      const bc = input.int(true);
      const fc = input.int(true);
      for (let f = 0; f < fc; f++) {
        input.float(); input.int32(); input.int32(); // time, light, dark
        if (f < fc - 1) {
          input.float(); input.byte();
          const ct = input.d.getUint8(input.i - 1);
          if (ct === 2) input.skip(16);
        }
      }
    }
  }
  
  // Deform timelines
  const deformCount = input.int(true);
  for (let j = 0; j < deformCount; j++) {
    const skinIdx = input.int(true);
    const subCount = input.int(true);
    for (let k = 0; k < subCount; k++) {
      const slotIdx = input.int(true);
      const meshCount = input.int(true);
      for (let m = 0; m < meshCount; m++) {
        const attName = input.strRef();
        const timelineType = input.byte(); // 4.1+ sequence support
        const frameCount = input.int(true);
        
        if (timelineType === 1) { // ATTACHMENT_SEQUENCE
          for (let f = 0; f < frameCount; f++) {
            input.float(); input.int32(); input.float(); // time, modeAndIndex, delay
          }
          continue;
        }
        
        const bezierCount = input.int(true);
        console.log(`\n=== DEFORM: skin=${skinIdx} slot=${slotIdx} att=${attName} frames=${frameCount} beziers=${bezierCount} ===`);
        console.log(`  Position before first frame: ${input.pos()}`);
        
        let time = input.float();
        for (let f = 0; f < frameCount; f++) {
          const end = input.int(true);
          let start = 0;
          let verts = [];
          if (end === 0) {
            verts = [];
          } else {
            start = input.int(true);
            const endVal = end + start;
            for (let v = start; v < endVal; v++) {
              verts.push(input.float());
            }
          }
          
          console.log(`  Frame ${f}: time=${time.toFixed(3)} end=${end} start=${start} verts=${verts.length} pos=${input.pos()}`);
          
          if (f < frameCount - 1) {
            const time2 = input.float();
            const curveType = input.byte();
            let curveInfo = '';
            if (curveType === 0) curveInfo = 'linear';
            else if (curveType === 1) curveInfo = 'stepped';
            else if (curveType === 2) {
              const c0 = input.float();
              const c1 = input.float();
              const c2 = input.float();
              const c3 = input.float();
              curveInfo = `bezier[${c0.toFixed(4)}, ${c1.toFixed(4)}, ${c2.toFixed(4)}, ${c3.toFixed(4)}]`;
            }
            console.log(`    time2=${time2.toFixed(3)} curveType=${curveType} ${curveInfo} pos=${input.pos()}`);
            time = time2;
          }
        }
      }
    }
  }
  
  // Draw order
  const drawOrderCount = input.int(true);
  if (drawOrderCount > 0) {
    const slotCount2 = input.int(true);
    for (let j = 0; j < drawOrderCount; j++) {
      const offsetCount = input.int(true);
      for (let k = 0; k < offsetCount; k++) {
        input.int(true); // slot index
        input.int(true); // offset
      }
    }
  }
}
