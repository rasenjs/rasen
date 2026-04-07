# @rasenjs/winui3

> ⚠️ **规划中**: WinUI 3 目标框架支持

## 📋 项目状态

**当前阶段**: 技术调研完成，实施指引已编写

**技术方案**: Rust + winrt-xaml + rquickjs

## 📚 文档

- [📖 技术调研报告](RESEARCH.md)
- [🤖 实施指引](AGENTS.md)
- [🏗️ 示例代码](../examples/winui3-counter/)

## 🔧 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| **前端 API** | TypeScript | 与 GPUI 95% 相同 |
| **JS 引擎** | QuickJS (rquickjs) | 与 GPUI 共享 |
| **UI 框架** | WinUI 3 (winrt-xaml) | 原生 Windows UI |
| **语言** | Rust | 统一技术栈 |

## 🚀 架构

```
JavaScript (TypeScript)
       ↓
  QuickJS (rquickjs)     ← 与 GPUI 共享
       ↓
  winrt-xaml (Rust)      ← 直接调用 WinUI 3
       ↓
  WinUI 3 XAML
```

## 📊 代码共享

| 模块 | 共享程度 | 说明 |
|------|---------|------|
| **QuickJS 运行时** | ✅ 100% | 直接复用 |
| **事件管理器** | ✅ 95% | 几乎完全共享 |
| **Tailwind 解析器** | ✅ 80% | 核心逻辑共享 |
| **XAML 构建器** | ❌ 0% | WinUI 3 特有 |
| **总体** | **~70%** | 核心逻辑共享 |

## ⏰ 实施计划

| Phase | 任务 | 预计时间 |
|-------|------|---------|
| Phase 1 | 项目初始化 + 技术验证 | 1 周 |
| Phase 2 | 核心模块开发 | 2-3 周 |
| Phase 3 | TypeScript API 开发 | 1 周 |
| Phase 4 | 集成与测试 | 1 周 |
| Phase 5 | 打包与发布 | 1 周 |

**总计**: 6-7 周

## 📦 包结构

```
packages/winui3/
├── README.md              ← 你在这里
├── RESEARCH.md           ← 技术调研报告
├── AGENTS.md            ← 实施指引
├── src/                 # TypeScript API（待实现）
│   ├── index.ts
│   ├── components/
│   └── types.ts
├── native/               # Rust 原生代码（待实现）
│   ├── Cargo.toml
│   └── src/
├── examples/            # 示例应用（待实现）
│   └── counter/
└── package.json
```

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT
