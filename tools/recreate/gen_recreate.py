"""Generate an HTML+SVG low-poly recreation of the target image.

Constraints honored:
- No <canvas>, no <img> used as the artwork (pure vector shapes).
- The original PNG is referenced ONLY as a ghost overlay for pixel alignment.
- Artwork is built from relatively large standard shapes (triangles via SVG
  <polygon>, which are vector shapes, not pixels/bitmap texture).
"""
import argparse
import math
import os
import random
from PIL import Image

parser = argparse.ArgumentParser(
    description="Generate a low-poly SVG vector recreation of a target image for pixel-alignment comparison."
)
parser.add_argument(
    "--src", default="Pasted Image.png",
    help="Source image to recreate (any PNG/JPG). Not bound to a specific asset.",
)
parser.add_argument(
    "--out", default="recreate.html",
    help="Output HTML path (generated artifact; keep out of git).",
)
parser.add_argument(
    "--cols", type=int, default=22,
    help="Grid columns -> each facet is a relatively large area.",
)
parser.add_argument(
    "--seed", type=int, default=42,
    help="Jitter seed for reproducible output.",
)
args = parser.parse_args()

SRC = args.src
OUT = args.out
COLS = args.cols

random.seed(args.seed)

# Reference overlay path, relative to the output file so the HTML stays portable
# regardless of where the source image lives (not bound to one model/asset).
_out_dir = os.path.dirname(os.path.abspath(OUT)) or "."
try:
    REF_SRC = os.path.relpath(os.path.abspath(SRC), _out_dir)
except ValueError:
    REF_SRC = SRC

img = Image.open(SRC).convert("RGBA")
W, H = img.size
px = img.load()

ROWS = max(1, round(COLS * H / W))
cw = W / COLS
ch = H / ROWS

# Build jittered grid of vertex points (no jitter on the outer frame so the
# picture stays fully covered edge-to-edge).
pts = []
for r in range(ROWS + 1):
    row = []
    for c in range(COLS + 1):
        x = c * cw
        y = r * ch
        on_edge = (r == 0 or r == ROWS or c == 0 or c == COLS)
        if not on_edge:
            x += random.uniform(-0.28, 0.28) * cw
            y += random.uniform(-0.28, 0.28) * ch
        row.append((x, y))
    pts.append(row)


def sample(x, y):
    xi = min(W - 1, max(0, int(round(x))))
    yi = min(H - 1, max(0, int(round(y))))
    r, g, b, a = px[xi, yi]
    if a < 128:
        return (255, 255, 255)
    return (r, g, b)


def avg(cols):
    r = sum(c[0] for c in cols) / len(cols)
    g = sum(c[1] for c in cols) / len(cols)
    b = sum(c[2] for c in cols) / len(cols)
    return f"rgb({int(r)},{int(g)},{int(b)})"


polys = []
for r in range(ROWS):
    for c in range(COLS):
        x0, y0 = pts[r][c]
        x1, y1 = pts[r][c + 1]
        x2, y2 = pts[r + 1][c + 1]
        x3, y3 = pts[r + 1][c]
        # two triangles
        t1 = ((x0, y0), (x1, y1), (x2, y2))
        t2 = ((x0, y0), (x2, y2), (x3, y3))
        for tri in (t1, t2):
            cols = [sample(x, y) for (x, y) in tri]
            fill = avg(cols)
            pts_str = " ".join(f"{x:.1f},{y:.1f}" for (x, y) in tri)
            polys.append(f'    <polygon points="{pts_str}" fill="{fill}"/>')

svg_polys = "\n".join(polys)

html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Rasen - Vector Recreation: {os.path.basename(SRC)}</title>
<style>
  :root {{
    --art-w: {W}px;
    --art-h: {H}px;
  }}
  * {{ box-sizing: border-box; }}
  body {{
    margin: 0;
    background: #1b1f24;
    color: #e6edf3;
    font: 14px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 24px;
    gap: 16px;
  }}
  h1 {{ font-size: 18px; margin: 0; font-weight: 600; }}
  .hint {{ opacity: .7; max-width: 720px; text-align: center; }}
  .stage {{
    position: relative;
    width: var(--art-w);
    height: var(--art-h);
    max-width: 92vw;
    /* keep aspect ratio when scaled down on small screens */
    aspect-ratio: {W} / {H};
    background: #fff;
    box-shadow: 0 10px 40px rgba(0,0,0,.5);
    overflow: hidden;
    border-radius: 4px;
  }}
  /* The artwork itself: pure vector shapes, no bitmap */
  .art {{ position: absolute; inset: 0; width: 100%; height: 100%; display: block; }}
  /* Reference overlay: the ORIGINAL image, used ONLY for pixel alignment */
  .reference {{
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: fill;
    opacity: 0;            /* hidden by default; fade in to align */
    pointer-events: none;
    mix-blend-mode: normal;
  }}
  .reference.diff {{ mix-blend-mode: difference; }}
  .controls {{
    display: flex;
    flex-wrap: wrap;
    gap: 18px;
    align-items: center;
    background: #24292f;
    padding: 12px 18px;
    border-radius: 10px;
  }}
  .controls label {{ display: flex; align-items: center; gap: 8px; }}
  input[type=range] {{ width: 220px; }}
  .badge {{ font-size: 12px; opacity: .65; }}
</style>
</head>
<body>
  <h1>Vector recreation &mdash; pixel-alignment studio</h1>
  <p class="hint">
    Artwork is drawn only with SVG &lt;polygon&gt; vector shapes (no canvas, no bitmap texture).
    Use the controls below to fade the original picture in as a ghost layer and
    align the vector art pixel-by-pixel.
  </p>

  <div class="controls">
    <label>Reference opacity
      <input id="op" type="range" min="0" max="1" step="0.01" value="0"/>
    </label>
    <label><input id="diff" type="checkbox"/> Difference blend</label>
    <label><input id="swap" type="checkbox"/> Show reference only</label>
    <span class="badge" id="stat"></span>
  </div>

  <div class="stage" id="stage">
    <svg class="art" viewBox="0 0 {W} {H}" preserveAspectRatio="none"
         xmlns="http://www.w3.org/2000/svg" shape-rendering="geometricPrecision">
{svg_polys}
    </svg>
    <img class="reference" id="ref" src="{REF_SRC}" alt="original reference"/>
  </div>

<script>
  const op = document.getElementById('op');
  const diff = document.getElementById('diff');
  const swap = document.getElementById('swap');
  const ref = document.getElementById('ref');
  const art = document.querySelector('.art');
  const stat = document.getElementById('stat');

  function update() {{
    const v = parseFloat(op.value);
    ref.style.opacity = swap.checked ? 1 : v;
    ref.classList.toggle('diff', diff.checked && !swap.checked);
    art.style.visibility = swap.checked ? 'hidden' : 'visible';
    stat.textContent = swap.checked
      ? 'reference only'
      : `ghost opacity ${{v.toFixed(2)}}` + (diff.checked ? ' · difference' : '');
  }}
  op.addEventListener('input', update);
  diff.addEventListener('change', update);
  swap.addEventListener('change', update);
  update();
</script>
</body>
</html>
"""

with open(OUT, "w", encoding="utf-8") as f:
    f.write(html)

print(f"Wrote {OUT}: {len(polys)} polygons, grid {COLS}x{ROWS}")
