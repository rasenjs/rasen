#!/bin/bash
# Regenerate src/original/__tests__/fixtures/nvn-golden.json.
#
# The fixture is output from the reference project's own C — `nvn_tex.c` and
# `nvn_deswizzle.c` — compiled unmodified and run over a descriptor matrix. It
# pins our TypeScript port to that behaviour, so it should be regenerated only
# when the reference sources change (and the diff reviewed, because a change here
# means the port has to change too).
#
# Usage: gen-nvn-golden.sh <path to a checkout of the reference project>
#
# The reference sources are not vendored into this repository; this script needs
# a local checkout (for example a clone of the fork) to build against.
set -euo pipefail

REF=${1:-/tmp/d2r-mobile}
NVN="$REF/dm/gfx/nvn"
TEX="$REF/dm/gfx/tex"
OUT="$(cd "$(dirname "$0")/.." && pwd)/src/original/__tests__/fixtures/nvn-golden.json"

[ -f "$NVN/nvn_tex.c" ] || { echo "no reference sources under $REF" >&2; exit 1; }

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

cat > "$WORK/harness.c" <<'EOF'
#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include "nvn_tex.h"
#include "nvn_deswizzle.h"

static unsigned long long fnv(const unsigned char *p, size_t n) {
    unsigned long long h = 1469598103934665603ULL;
    for (size_t i = 0; i < n; i++) { h ^= p[i]; h *= 1099511628211ULL; }
    return h;
}

int main(int argc, char **argv) {
    FILE *f = fopen(argv[1], "r");
    char line[512];
    int first = 1;
    printf("[");
    while (fgets(line, sizeof line, f)) {
        if (line[0] == '#' || line[0] == '\n') continue;
        int target, format, flags, samples, levels, pkg;
        unsigned width, height, depth, stride;
        if (sscanf(line, "%d %d %d %d %u %u %u %d %u %d",
                   &target, &format, &flags, &samples, &width, &height, &depth,
                   &levels, &stride, &pkg) != 10) continue;

        nvn_texdesc d; memset(&d, 0, sizeof d);
        d.target = target; d.format = format; d.flags = flags; d.samples = samples;
        d.width = width; d.height = height; d.depth = depth; d.levels = levels;
        d.stride = stride; d.pkg_block_h = pkg;

        nvn_texlayout L; nvn_tex_layout(&d, &L);

        char offsets[512]; offsets[0] = 0; size_t at = 0;
        for (int l = 0; l < levels; l++)
            at += snprintf(offsets + at, sizeof offsets - at, "%s%llu", l ? "," : "",
                           (unsigned long long)nvn_tex_level_offset(&d, l));

        unsigned rowBytes = 0, rows = 0, slices = 0, th = 0, td = 0, bpb = 0;
        unsigned long long base = 0;
        int ok = nvn_deswizzle_geom(&d, 0, 0, &rowBytes, &rows, &slices, &base, &th, &td, &bpb) == 0;

        unsigned long long blFnv = 0, rtFnv = 0;
        if (ok && L.size > 0) {
            unsigned char *storage = calloc(1, L.size);
            for (size_t i = 0; i < L.size; i++) storage[i] = (unsigned char)((i * 37 + 11) & 0xff);
            size_t pitch = rowBytes;
            unsigned char *linear = calloc(1, pitch * rows * slices + 64);
            if (nvn_deswizzle(&d, 0, 0, storage, linear, pitch) == 0) blFnv = fnv(linear, pitch * rows * slices);
            unsigned char *back = calloc(1, L.size);
            if (nvn_swizzle(&d, 0, 0, linear, pitch, back) == 0) rtFnv = fnv(back, L.size);
            free(storage); free(linear); free(back);
        }

        printf("%s{\"target\":%d,\"format\":%d,\"flags\":%d,\"samples\":%d,\"width\":%u,\"height\":%u,"
               "\"depth\":%u,\"levels\":%d,\"stride\":%u,\"pkgBlockH\":%d,"
               "\"size\":%llu,\"layerSize\":%llu,\"align\":%u,\"layers\":%u,\"bpb\":%u,"
               "\"tileH\":%u,\"tileD\":%u,\"levelOffsets\":[%s],"
               "\"geomOk\":%s,\"rowBytes\":%u,\"rows\":%u,\"slices\":%u,\"geomBase\":%llu,"
               "\"geomTileH\":%u,\"geomTileD\":%u,\"deswizzleFnv\":%llu,\"roundTripFnv\":%llu}",
               first ? "" : ",", d.target, d.format, d.flags, d.samples, d.width, d.height,
               d.depth, d.levels, d.stride, d.pkg_block_h,
               (unsigned long long)L.size, (unsigned long long)L.layer_size, L.align, L.layers, L.bpb,
               L.tileH, L.tileD, offsets, ok ? "true" : "false",
               ok ? rowBytes : 0, ok ? rows : 0, ok ? slices : 0,
               ok ? (unsigned long long)base : 0ULL, ok ? th : 0, ok ? td : 0, blFnv, rtFnv);
        first = 0;
    }
    printf("]\n");
    return 0;
}
EOF

# Descriptor matrix: every branch the layout code has.
python3 - > "$WORK/descs.tsv" <<'EOF'
rows = []
for fmt in (0x44, 0x41):
    for (w, h) in [(4,4),(8,8),(16,16),(32,32),(64,64),(128,128),(256,128),(64,256),
                   (512,512),(1024,64),(50,30),(130,66),(1920,1080),(7,3)]:
        for pkg in (0, 1, 2, 3, 4):
            rows.append((1, fmt, 0, 0, w, h, 1, 1, 0, pkg))
for levels in (2, 3, 5, 8):
    rows.append((1, 0x44, 0, 0, 128, 128, 1, levels, 0, 0))
    rows.append((1, 0x44, 0, 0, 512, 256, 1, levels, 0, 2))
for fmt in (0x01, 0x05, 0x0a, 0x19, 0x2e, 0x36, 0x3d, 0x9c):
    rows.append((1, fmt, 0, 0, 64, 64, 1, 1, 0, 0))
    rows.append((1, fmt, 0, 0, 257, 129, 1, 1, 0, 1))
for fmt in (0x79, 0x7f, 0x86, 0x94):
    rows.append((1, fmt, 0, 0, 128, 128, 1, 1, 0, 0))
rows.append((0, 0x36, 0, 0, 64, 1, 1, 1, 0, 0))
rows.append((2, 0x36, 0, 0, 32, 32, 8, 1, 0, 0))
rows.append((4, 0x44, 0, 0, 64, 64, 1, 1, 0, 0))
rows.append((8, 0x44, 0, 0, 64, 64, 1, 1, 0, 0))
rows.append((9, 0x44, 0, 0, 64, 64, 3, 1, 0, 0))
rows.append((3, 0x36, 0, 0, 16, 4, 1, 1, 0, 0))
rows.append((1, 0x36, 0x10, 0, 64, 64, 1, 1, 0, 0))
rows.append((1, 0x36, 0x10, 0, 64, 64, 1, 1, 256, 0))
rows.append((1, 0x36, 0x50, 0, 64, 64, 1, 1, 0, 0))
rows.append((1, 0x44, 0, 4, 64, 64, 1, 1, 0, 0))
rows.append((10, 0x36, 0, 0, 64, 1, 1, 1, 0, 0))
rows.append((1, 0x1234, 0, 0, 64, 64, 1, 1, 0, 0))
print('# target format flags samples width height depth levels stride pkgBlockH')
for r in rows:
    print(' '.join(str(x) for x in r))
EOF

cc -O2 -I "$NVN" -I "$TEX" -o "$WORK/harness" "$WORK/harness.c" "$NVN/nvn_tex.c" "$TEX/nvn_deswizzle.c"
"$WORK/harness" "$WORK/descs.tsv" | python3 -c 'import json,sys; print(json.dumps(json.load(sys.stdin), separators=(",",":")))' > "$OUT"
echo "wrote $OUT ($(python3 -c 'import json,sys; print(len(json.load(open(sys.argv[1]))))' "$OUT") records)"
