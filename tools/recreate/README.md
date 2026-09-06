# tools/recreate

把**任意**目标图生成低多边形（low-poly）SVG 矢量复刻 HTML，用于「矢量复刻 vs 原图」的像素对齐对比（ghost overlay + difference blend）。

## 用法

```bash
# 需要 Pillow: pip install pillow
python gen_recreate.py --src path/to/target.png --out recreate.html
```

参数：

| 参数 | 默认 | 说明 |
| --- | --- | --- |
| `--src` | `Pasted Image.png` | 要复刻的源图（任意 PNG/JPG）。**不绑定任何特定模型/资产**。 |
| `--out` | `recreate.html` | 输出 HTML 路径（生成物，已在根 `.gitignore` 忽略）。 |
| `--cols` | `22` | 网格列数，决定每个 facet 的大小。 |
| `--seed` | `42` | 抖动随机种子，保证可复现。 |

生成的 HTML 中 ghost 图层的 `src` 会相对 `--out` 路径计算，因此输出文件可随源图位置任意搬运。

## 统一约定

对比类工具统一放在 `tools/` 下、按 `--char` / `--src` 等参数驱动，**不绑定单个模型**：

- `tools/spine-compare/compare.mjs` —— Spine 运行时骨骼/变换对比（`@rasenjs/spine` vs 官方 Spine 运行时），按 `--char` / `--anim` / `--time` 参数化。
- `tools/recreate/` —— 矢量复刻像素对齐对比，按 `--src` 参数化（本目录）。

两者都是「传入什么就对比什么」的通用工具，仓库里不再保留写死某张图/某个角色的对比产物。
