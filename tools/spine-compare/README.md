# tools/spine-compare

把 `@rasenjs/spine` 运行时与**官方 Spine 运行时**做对比（骨骼/变换/绘制顺序等），用于验证我们运行时的正确性。

## 目录结构（统一约定）

```
tools/spine-compare/
  compare.mjs        # 主对比 CLI，按 --char / --anim / --time 参数化（非绑定模型）
  find-deform.mjs    # 查找 deform 相关问题的工具脚本
  trace-deform.mjs   # 追踪 deform 的工具脚本
  check-c310.mjs     # 针对 c310 的角色专用检查脚本（依赖 output/spine-webgl.js）
  output/            # 生成的对比产物（已在根 .gitignore 忽略，按需重新生成）
    official-viewer-*.html  # 官方运行时单角色查看器（c010_03 / c015 / c310 / c310-42）
    rasen-viewer-*.html     # 我们的运行时单角色查看器（c015 / c310）
    spine-4.1.js / spine-webgl.js  # 下载的官方运行时
    spine-dist/       # 我们构建出的运行时副本（compare 产物）
    data/            # 单角色资产（.skel / .atlas / .png），按需下载
```

## 统一原则

- **源码脚本留在根目录**；所有绑定到具体角色/模型的产物（HTML 查看器、下载的运行时、角色数据）统一放进 `output/`，不进 git。
- 对比脚本一律**参数驱动**（`--char` 等），不在脚本里写死角色。
- 运行 `compare.mjs` 时官方运行时默认从 `/tmp/spine-compare/spine-webgl.js` 读取（见 `--official-path`），与 `output/` 解耦。

## 用法

```bash
# 骨骼/变换对比（官方运行时需先就位，例如放到 /tmp/spine-compare/）
node compare.mjs --char c010_03 --anim idle --time 0
node compare.mjs --char c310 --anim action --start 0 --end 3 --step 0.2

# 单角色查看器（output/ 下的 html 直接用浏览器打开，资产通过相对路径 ./data、./spine-*.js 加载）
```

矢量复刻像素对齐对比请见同级 `tools/recreate/`。
