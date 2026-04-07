# WinUI 3 实施指引

> **Agent 执行指南**: 为 rasenjs 添加 WinUI 3 目标框架支持

---

## 📋 任务概述

### 目标
为 rasenjs 添加 WinUI 3 支持，使开发者可以使用相同的 Rasen 组件模型开发 Windows 原生桌面应用。

### 技术栈
- **前端**: TypeScript + JavaScript
- **JS 引擎**: QuickJS (rquickjs)
- **UI 框架**: WinUI 3 (winrt-xaml)
- **语言**: Rust

### 架构
```
JavaScript (TypeScript)
       ↓
  QuickJS (rquickjs)     ← 与 GPUI 共享
       ↓
  winrt-xaml (Rust)      ← 直接调用 WinUI 3
       ↓
  WinUI 3 XAML
```

---

## 🎯 实施阶段

### Phase 1: 项目初始化 ⚠️ 重要

**目标**: 创建项目结构，验证技术可行性

#### 1.1 创建 Rust 项目

```bash
cd packages/winui3
mkdir -p native/src
cd native
cargo init --lib
```

#### 1.2 配置 Cargo.toml

```toml
[package]
name = "rasen-winui3"
version = "0.1.0"
edition = "2021"

[lib]
name = "rasen_winui3"
crate-type = ["cdylib", "rlib"]

[dependencies]
# QuickJS (与 GPUI 共享)
rquickjs = { version = "0.6", features = ["full-async", "parallel"] }

# WinUI 3 UI
winrt-xaml = "1.0"

# Windows 运行时
windows = { version = "0.61", features = [
    "Win32_Foundation",
    "Win32_System_Com",
    "Foundation",
]}

# 工具库
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
anyhow = "1.0"
clap = { version = "4", features = ["derive"] }
```

#### 1.3 创建 TypeScript 项目结构

```typescript
// src/index.ts
export { div, button, text, span } from './components'
export { run } from './app'
export type { WinUI3Host } from './types'
```

#### 1.4 验证 winrt-xaml

⚠️ **关键验证点**: 在继续之前，必须验证 winrt-xaml 能正常工作

创建测试文件 `native/src/test_winrt.rs`:

```rust
use winrt_xaml::{XamlManager, create_host_window, XamlButton, XamlStackPanel};

fn main() -> anyhow::Result<()> {
    // 初始化 COM
    unsafe {
        windows::Win32::System::Com::CoInitializeEx(
            None,
            windows::Win32::System::Com::COINIT_APARTMENTTHREADED
        ).ok()?;
    }

    // 初始化 XAML
    let _manager = XamlManager::new()?;

    // 创建窗口
    let hwnd = create_host_window("Rasen WinUI 3 Test", 800, 600)?;

    // 创建按钮
    let button = XamlButton::new()?;
    button.set_content("Click Me!")?;
    button.on_click(|| println!("Button clicked!"))?;

    println!("✅ winrt-xaml 验证成功!");
    Ok(())
}
```

**验证步骤**:
```bash
cd native
cargo build
# 如果编译成功，继续 Phase 2
# 如果失败，查看 winrt-xaml 官方示例
```

#### 1.5 创建 TypeScript API 骨架

```typescript
// src/types.ts
export interface WinUI3Host {
  appendChild(element: ElementDescriptor): void
  requestRender(): void
  on(event: string, handler: () => void): () => void
}

export interface ElementDescriptor {
  type: 'div' | 'text' | 'button'
  class?: string
  text?: string
  children?: ElementDescriptor[]
  handlers?: Record<string, () => void>
}

export type SyncComponent<Host, Props extends any[]> = 
  (...props: Props) => (host: Host) => (() => void) | undefined
```

---

### Phase 2: 核心模块开发 ⭐ 重点

**目标**: 实现 QuickJS 运行时、事件系统，并验证与 GPUI 的共享

#### 2.1 创建 Rust 库入口

```rust
// native/src/lib.rs

mod js_runtime;
mod tw_parser;
mod event_manager;
mod xaml_builder;
mod winui3_app;

pub use js_runtime::JsRuntime;
pub use tw_parser::{parse, TwStyles};
pub use event_manager::EventManager;
pub use xaml_builder::XamlBuilder;
pub use winui3_app::WinUI3App;
```

#### 2.2 移植 js_runtime.rs ⚠️ 关键

**策略**: 从 GPUI 复制并适配

1. 复制 `packages/gpui/native/src/js_runtime.rs`
2. 修改依赖:
   ```rust
   // 修改前 (GPUI)
   use crate::elements::{Element, DivElement, TextElement, EventHandlers};
   
   // 修改后 (WinUI 3)
   use crate::xaml_builder::{Element, XamlElement, EventHandlers};
   ```
3. 修改元素构建调用

**验证**: 运行简单 JS 代码
```rust
let runtime = JsRuntime::new()?;
runtime.execute("console.log('Hello from QuickJS!')")?;
```

#### 2.3 创建 tw_parser.rs ⚠️ 关键

**策略**: 从 GPUI 复制并适配输出格式

1. 复制 `packages/gpui/native/src/tw_parser.rs`
2. 修改输出类型:
   ```rust
   // 修改前 (GPUI)
   use gpui::*;
   
   #[derive(Default, Debug, Clone)]
   pub struct ParsedStyles {
       pub display: Option<Display>,
       pub background: Option<Hsla>,
       // ...
   }
   
   // 修改后 (WinUI 3)
   #[derive(Default, Debug, Clone)]
   pub struct TwStyles {
       pub display_flex: bool,
       pub flex_direction: Option<String>,  // "Row" | "Column"
       pub background_color: Option<String>, // "#RRGGBB"
       // ...
   }
   ```

**验证**: 解析 Tailwind 类
```rust
let styles = parse("flex flex-col gap-4 bg-[#1a1a2e]");
assert!(styles.display_flex);
assert_eq!(styles.flex_direction, Some("Column".to_string()));
assert_eq!(styles.background_color, Some("#FF1A1A2E".to_string()));
```

#### 2.4 创建 event_manager.rs

**策略**: 直接从 GPUI 复制（应该 95% 相同）

1. 复制 `packages/gpui/native/src/event_manager.rs`
2. 检查是否有 GPUI 特有引用
3. 如有必要，进行微小修改

#### 2.5 创建 xaml_builder.rs ⭐ 核心

**这是 WinUI 3 特有的模块，需要全新开发**

```rust
// native/src/xaml_builder.rs

use winrt_xaml::{XamlButton, XamlTextBlock, XamlStackPanel, XamlGrid};
use crate::tw_parser::TwStyles;

/// WinUI 3 元素类型
#[derive(Debug, Clone)]
pub enum XamlElement {
    Button(XamlButtonElement),
    TextBlock(XamlTextBlockElement),
    StackPanel(XamlStackPanelElement),
    Grid(XamlGridElement),
}

#[derive(Debug, Clone)]
pub struct XamlButtonElement {
    pub content: String,
    pub styles: TwStyles,
    pub on_click: Option<u32>,
}

#[derive(Debug, Clone)]
pub struct XamlTextBlockElement {
    pub text: String,
    pub styles: TwStyles,
}

#[derive(Debug, Clone)]
pub struct XamlStackPanelElement {
    pub children: Vec<XamlElement>,
    pub styles: TwStyles,
}

#[derive(Debug, Clone)]
pub struct XamlGridElement {
    pub children: Vec<XamlElement>,
    pub styles: TwStyles,
}

/// 构建器主结构
pub struct XamlBuilder {
    // 内部状态
}

impl XamlBuilder {
    pub fn new() -> Self {
        Self {}
    }

    /// 从元素描述符构建 XAML 元素
    pub fn build(&self, element: Element) -> anyhow::Result<XamlElement> {
        match element {
            Element::Div(desc) => self.build_stackpanel(&desc),
            Element::Text(desc) => self.build_textblock(&desc),
            Element::Button(desc) => self.build_button(&desc),
            _ => anyhow::bail!("Unsupported element type"),
        }
    }

    /// 构建 StackPanel (对应 div)
    fn build_stackpanel(&self, desc: &DivElement) -> anyhow::Result<XamlElement> {
        let mut children = Vec::new();
        
        for child in &desc.children {
            children.push(self.build(child.clone())?);
        }

        Ok(XamlElement::StackPanel(XamlStackPanelElement {
            children,
            styles: desc.styles.clone(),
        }))
    }

    /// 构建 TextBlock (对应 text)
    fn build_textblock(&self, desc: &TextElement) -> anyhow::Result<XamlElement> {
        Ok(XamlElement::TextBlock(XamlTextBlockElement {
            text: desc.text.clone(),
            styles: desc.styles.clone(),
        }))
    }

    /// 构建 Button
    fn build_button(&self, desc: &DivElement) -> anyhow::Result<XamlElement> {
        Ok(XamlElement::Button(XamlButtonElement {
            content: desc.text.clone().unwrap_or_default(),
            styles: desc.styles.clone(),
            on_click: desc.handlers.on_click,
        }))
    }
}

impl Default for XamlBuilder {
    fn default() -> Self {
        Self::new()
    }
}

/// 将 XamlElement 渲染为 winrt-xaml 控件
pub fn render_to_winrt(element: &XamlElement) -> anyhow::Result<winrt_xaml::UIElement> {
    match element {
        XamlElement::StackPanel(panel) => render_stackpanel(panel),
        XamlElement::TextBlock(text) => render_textblock(text),
        XamlElement::Button(button) => render_button(button),
        XamlElement::Grid(grid) => render_grid(grid),
    }
}

fn render_stackpanel(panel: &XamlStackPanelElement) -> anyhow::Result<winrt_xaml::UIElement> {
    let stackpanel = XamlStackPanel::new()?;
    
    // 设置方向
    if panel.styles.flex_direction == Some("Column".to_string()) {
        stackpanel.set_vertical(true)?;
    } else {
        stackpanel.set_vertical(false)?;
    }

    // 设置间距
    if let Some(gap) = panel.styles.gap {
        stackpanel.set_spacing(gap)?;
    }

    // 添加子元素
    for child in &panel.children {
        let child_ui = render_to_winrt(child)?;
        stackpanel.add_child(&child_ui)?;
    }

    Ok(stackpanel.as_uielement())
}

fn render_textblock(text: &XamlTextBlockElement) -> anyhow::Result<winrt_xaml::UIElement> {
    let textblock = XamlTextBlock::new()?;
    textblock.set_text(&text.text)?;

    // 应用样式
    if let Some(font_size) = text.styles.font_size {
        textblock.set_font_size(font_size)?;
    }
    
    if let Some(color) = &text.styles.text_color {
        textblock.set_foreground(parse_color(color)?)?;
    }

    Ok(textblock.as_uielement())
}

fn render_button(button: &XamlButtonElement) -> anyhow::Result<winrt_xaml::UIElement> {
    let btn = XamlButton::new()?;
    btn.set_content(&button.content)?;

    // 应用样式
    if let Some(bg) = &button.styles.background_color {
        btn.set_background(parse_color(bg)?)?;
    }
    
    if let Some(radius) = button.styles.border_radius {
        btn.set_corner_radius(radius)?;
    }

    Ok(btn.as_uielement())
}

fn parse_color(hex: &str) -> anyhow::Result<u32> {
    let hex = hex.trim_start_matches('#');
    let r = u8::from_str_radix(&hex[0..2], 16)?;
    let g = u8::from_str_radix(&hex[2..4], 16)?;
    let b = u8::from_str_radix(&hex[4..6], 16)?;
    Ok((0xFF << 24) | ((r as u32) << 16) | ((g as u32) << 8) | (b as u32))
}
```

**验证**: 构建简单 UI
```rust
let builder = XamlBuilder::new();
let element = Element::Div(DivElement {
    type_: "div".to_string(),
    class: "flex flex-col".to_string(),
    styles: parse("flex flex-col gap-4"),
    children: vec![
        Element::Text(TextElement {
            text: "Hello".to_string(),
            styles: parse("text-xl"),
        }),
    ],
    handlers: EventHandlers::default(),
});

let xaml = builder.build(element)?;
assert!(matches!(xaml, XamlElement::StackPanel(_)));
```

---

### Phase 3: TypeScript API 开发

#### 3.1 创建基础组件

```typescript
// src/components/div.ts
import type { WinUI3Host, ElementDescriptor, SyncComponent } from '../types'

export const div: SyncComponent<WinUI3Host, [{ 
  class?: string
  children?: any[]
  onClick?: () => void
}]> = (props) => {
  return (host: WinUI3Host) => {
    const descriptor: ElementDescriptor = {
      type: 'div',
      class: props.class || '',
      children: [],
      handlers: {}
    }

    if (props.onClick) {
      descriptor.handlers!['click'] = props.onClick
    }

    if (props.children) {
      for (const child of props.children) {
        if (typeof child === 'function') {
          child(host)
        }
      }
    }

    host.appendChild(descriptor)

    return () => {
      // 清理逻辑
    }
  }
}
```

#### 3.2 创建应用运行器

```typescript
// src/app.ts
import type { WinUI3Host, ElementDescriptor } from './types'

let mountFn: ((host: WinUI3Host) => (() => void) | undefined) | null = null

export function run(App: () => (host: WinUI3Host) => (() => void) | undefined) {
  mountFn = App()
  
  // 创建 host 并执行
  const elements: ElementDescriptor[] = []
  
  const host: WinUI3Host = {
    appendChild(el: ElementDescriptor) {
      elements.push(el)
    },
    requestRender() {
      // 触发重新渲染
    },
    on(event: string, handler: () => void) {
      return () => {}
    }
  }

  // 执行 mount 函数
  mountFn(host)
}

// 导出给 Rust 调用
;(globalThis as any).__rerender = function() {
  if (!mountFn) return null
  
  const elements: ElementDescriptor[] = []
  
  const host: WinUI3Host = {
    appendChild(el: ElementDescriptor) {
      elements.push(el)
    },
    requestRender() {},
    on() { return () => {} }
  }

  mountFn(host)
  return elements
}
```

---

### Phase 4: 集成与测试 ⭐ 关键

#### 4.1 创建 WinUI 3 应用入口

```rust
// native/src/winui3_app.rs

pub struct WinUI3App {
    js_runtime: JsRuntime,
    xaml_builder: XamlBuilder,
}

impl WinUI3App {
    pub fn new() -> anyhow::Result<Self> {
        Ok(Self {
            js_runtime: JsRuntime::new()?,
            xaml_builder: XamlBuilder::new(),
        })
    }

    pub fn run_script(&self, script: &str) -> anyhow::Result<()> {
        // 执行 JS
        self.js_runtime.execute(script)?;
        
        // 获取元素
        let elements = self.js_runtime.get_elements()?;
        
        // 构建 XAML
        let xaml_elements: Vec<XamlElement> = elements
            .into_iter()
            .map(|e| self.xaml_builder.build(e))
            .collect::<anyhow::Result<Vec<_>>>()?;
        
        // 渲染到 winrt-xaml
        let root = render_elements(&xaml_elements)?;
        
        // 创建窗口
        self.create_window(root)
    }

    fn create_window(&self, root: winrt_xaml::UIElement) -> anyhow::Result<()> {
        unsafe {
            windows::Win32::System::Com::CoInitializeEx(
                None,
                windows::Win32::System::Com::COINIT_APARTMENTTHREADED
            ).ok()?;
        }

        let manager = XamlManager::new()?;
        let hwnd = create_host_window("Rasen WinUI 3", 800, 600)?;

        // 设置内容
        // ... (根据 winrt-xaml API 设置内容)

        Ok(())
    }
}
```

#### 4.2 创建 CLI 入口

```rust
// native/src/main.rs

use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(name = "rasen-winui3")]
#[command(about = "Run Rasen applications on WinUI 3")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    Run {
        path: String,
    },
}

fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();
    
    match cli.command {
        Commands::Run { path } => {
            let script = std::fs::read_to_string(&path)?;
            let app = WinUI3App::new()?;
            app.run_script(&script)?;
        }
    }
    
    Ok(())
}
```

#### 4.3 创建示例应用

```typescript
// examples/counter/src/main.ts
import { div, text, button, run } from '@rasenjs/winui3'
import { ref } from '@rasenjs/reactive-signals'

const App = () => {
  const count = ref(0)

  return div({
    class: 'flex flex-col items-center justify-center h-screen bg-[#1a1a2e]',
    children: [
      text({
        class: 'text-4xl text-white font-bold mb-4',
        children: () => `Count: ${count.value}`
      }),
      div({
        class: 'flex gap-4',
        children: [
          button({
            label: '-',
            class: 'px-4 py-2 bg-[#ef4444] text-white rounded-lg',
            onClick: () => count.value--
          }),
          button({
            label: '+',
            class: 'px-4 py-2 bg-[#3b82f6] text-white rounded-lg',
            onClick: () => count.value++
          })
        ]
      })
    ]
  })
}

run(App)
```

---

### Phase 5: 打包与发布

#### 5.1 配置 package.json

```json
{
  "name": "@rasenjs/winui3",
  "version": "0.1.0",
  "description": "WinUI 3 target for Rasen framework",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsup src/index.ts --format esm --dts",
    "build:native": "cd native && cargo build --release",
    "dev": "npm run build && npm run build:native",
    "test": "npm run build && cargo test"
  },
  "dependencies": {
    "@rasenjs/core": "workspace:*",
    "@rasenjs/reactive-signals": "workspace:*"
  },
  "devDependencies": {
    "tsup": "^8.0.0",
    "typescript": "^5.3.0"
  }
}
```

#### 5.2 创建 MSIX 配置

```xml
<!-- native/Package.appxmanifest -->
<?xml version="1.0" encoding="utf-8"?>
<Package
  xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"
  xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10">

  <Identity
    Name="Rasen.WinUI3"
    Publisher="CN=Rasen"
    Version="1.0.0.0" />

  <Properties>
    <DisplayName>Rasen WinUI 3</DisplayName>
    <PublisherDisplayName>Rasen</PublisherDisplayName>
  </Properties>

  <Dependencies>
    <TargetDeviceFamily Name="Windows.Desktop" 
                       MinVersion="10.0.17763.0" 
                       MaxVersionTested="10.0.22621.0" />
  </Dependencies>

  <Resources>
    <Resource Language="en-us"/>
  </Resources>

  <Applications>
    <Application Id="App"
      Executable="rasen-winui3.exe"
      EntryPoint="Windows.FullTrustApplication">
      <uap:VisualElements
        DisplayName="Rasen"
        Description="Rasen WinUI 3 App"
        BackgroundColor="transparent"
        Square150x150Logo="Assets\Square150x150Logo.png"
        Square44x44Logo="Assets\Square44x44Logo.png">
        <uap:DefaultTile Wide310x150Logo="Assets\Wide310x150Logo.png" />
        <uap:SplashScreen Image="Assets\SplashScreen.png" />
      </uap:VisualElements>
    </Application>
  </Applications>

  <Capabilities>
    <rescap:Capability Name="runFullTrust" />
  </Capabilities>
</Package>
```

---

## ✅ 验证清单

### Phase 1 完成标准
- [ ] Rust 项目编译成功
- [ ] winrt-xaml 示例运行成功
- [ ] TypeScript 项目结构创建完成

### Phase 2 完成标准
- [ ] js_runtime.rs 从 GPUI 移植成功
- [ ] tw_parser.rs 从 GPUI 移植成功
- [ ] event_manager.rs 从 GPUI 移植成功
- [ ] xaml_builder.rs 开发完成
- [ ] Tailwind → XAML 映射覆盖 80% 常用类

### Phase 3 完成标准
- [ ] TypeScript 组件 API 实现
- [ ] div, button, text 组件工作正常
- [ ] 事件绑定工作正常
- [ ] 响应式更新工作正常

### Phase 4 完成标准
- [ ] 端到端集成测试通过
- [ ] Counter 示例应用运行成功
- [ ] 性能测试达标 (启动 < 500ms)

### Phase 5 完成标准
- [ ] npm 包发布成功
- [ ] MSIX 安装包生成成功
- [ ] 文档编写完成

---

## 🔧 常见问题

### Q1: winrt-xaml 编译失败

**原因**: Windows SDK 版本不匹配

**解决方案**:
```bash
# 安装 Windows SDK
winget install Microsoft.WindowsSDK.10.0.22621.757
```

### Q2: Tailwind 类解析不完整

**解决方案**: 分阶段实现，优先支持:
1. 布局类: flex, flex-col, gap-{n}
2. 尺寸类: w-{n}, h-{n}, size-{n}
3. 颜色类: bg-{color}, text-{color}
4. 圆角类: rounded, rounded-lg
5. 间距类: p-{n}, m-{n}

### Q3: 事件处理不工作

**检查点**:
1. EventManager 是否正确注册
2. 处理器 ID 是否正确传递
3. Rust 和 JS 之间的 ID 映射是否正确

---

## 📞 获取帮助

- **winrt-xaml Issues**: https://github.com/JosephLaiAI/winrt-xaml/issues
- **rasenjs GPUI**: 参考 `packages/gpui/native/src/`
- **Windows Rust Discord**: https://discord.gg/7yFeXhK

---

## 🎯 成功标准

实施成功的标志：

1. **功能**: Counter 示例应用能正常运行
2. **性能**: 启动时间 < 500ms，内存 < 50MB
3. **代码质量**: 与 GPUI 共享 > 60% 代码
4. **开发者体验**: TypeScript API 与 GPUI 95% 相似
5. **可维护性**: 清晰的模块划分，易于后续扩展
