import { readFileSync } from 'fs';

const bytes = new Uint8Array(readFileSync('/tmp/777_00.skel'));
const dv = new DataView(bytes.buffer);

// Search for deform frame patterns: time(float) + end=264(varint 0x88 0x02)
// Then skip 264*4=1056 bytes of vertex data, check time2 and curve
console.log('Searching for deform frames with end=264...');

for (let i = 4; i < bytes.length - 1070; i++) {
  // Check if bytes[i-4..i] form a valid time (0-10, round to 0.001)
  const time = dv.getFloat32(i - 4, false);
  if (time < 0 || time > 10) continue;
  if (Math.abs(time - Math.round(time * 1000) / 1000) > 0.001) continue;

  // Check if bytes[i..i+2] form varint 264 (0x88 0x02)
  if (bytes[i] !== 0x88 || bytes[i + 1] !== 0x02) continue;

  // Found a match! Check what comes after vertex data
  const afterPos = i + 2 + 1056; // end(2bytes) + 264 floats
  if (afterPos + 20 >= bytes.length) continue;

  const time2 = dv.getFloat32(afterPos, false);
  const curveType = bytes[afterPos + 4];

  if (time2 < 0 || time2 > 10) continue;

  const result = { time, time2, curveType };
  if (curveType === 2) {
    result.c0 = dv.getFloat32(afterPos + 5, false);
    result.c1 = dv.getFloat32(afterPos + 9, false);
    result.c2 = dv.getFloat32(afterPos + 13, false);
    result.c3 = dv.getFloat32(afterPos + 17, false);
  }
  console.log(JSON.stringify(result));
}
