# Rota Headless UI 框架调研文档

## 项目概述

Rota 是一个基于 Rasen 框架的 Headless UI 组件库，参考了 Reka UI 和 Radix UI 的设计理念和 API 设计。

## 调研目标

1. 深入了解 Reka UI 和 Radix UI 的组件 API 设计
2. 分析两个框架的异同点
3. 为 Rota 框架提供设计参考

## 组件目录对比

### Reka UI 组件列表（70个）

#### 基础组件（20个）
- Accordion, AlertDialog, AspectRatio, Avatar
- Checkbox, Collapsible, Dialog, Label
- Popover, Progress, RadioGroup, ScrollArea
- Select, Separator, Slider, Switch
- Tabs, Toggle, ToggleGroup, Tooltip

#### 菜单组件（4个）
- ContextMenu, DropdownMenu, Menubar, NavigationMenu

#### 表单增强（10个）
- Autocomplete, Combobox
- DatePicker, DateRangePicker, DateField, DateRangeField
- NumberField, PinInput, TagsInput
- TimeField, TimeRangeField

#### 颜色选择（6个）
- ColorArea, ColorField, ColorPicker
- ColorSlider, ColorSwatch, ColorSwatchPicker

#### 日期时间（8个）
- Calendar, RangeCalendar
- MonthPicker, MonthRangePicker
- YearPicker, YearRangePicker
- TimeField, TimeRangeField

#### 其他组件（22个）
- Tree, Rating, Stepper, Pagination
- Listbox, Editable, Splitter, Viewport
- Toast, HoverCard
- 内部组件：Collection, ConfigProvider, DismissableLayer, FocusGuards, FocusScope, Menu, Popper, Presence, Primitive, RovingFocus, Teleport, VisuallyHidden

### Radix UI 组件列表（30个）

#### 基础组件（20个）
- Accordion, AlertDialog, AspectRatio, Avatar
- Checkbox, Collapsible, Dialog, Label
- Popover, Progress, RadioGroup, ScrollArea
- Select, Separator, Slider, Switch
- Tabs, Toggle, ToggleGroup, Tooltip

#### 菜单组件（4个）
- ContextMenu, DropdownMenu, Menubar, NavigationMenu

#### 表单增强（3个）
- Form, One-Time Password Field, Password Toggle Field

#### 其他组件（3个）
- HoverCard, Toast, Toolbar

### 组件差异分析

**Reka UI 独有**（40个）:
- 日期时间系列（12个）
- 颜色选择系列（6个）
- 表单增强（6个）
- 其他（16个）

**Radix UI 独有**（3个）:
- Form, One-Time Password Field, Password Toggle Field

**两者共有**（27个）:
- 核心组件基本一致

## 调研进度

### ✅ 已完成

#### 1. 目录结构创建
- 创建了完整的文档目录结构
- 按组件组分类组织

#### 2. Disclosure 组件组
- [Accordion](./components/disclosure/accordion.md) - 手风琴组件
- [Collapsible](./components/disclosure/collapsible.md) - 可折叠面板

#### 3. Overlay 组件组
- [Dialog](./components/overlay/dialog.md) - 对话框
- [AlertDialog](./components/overlay/alert-dialog.md) - 警告对话框
- [Popover](./components/overlay/popover.md) - 弹出框
- [Tooltip](./components/overlay/tooltip.md) - 工具提示
- [HoverCard](./components/overlay/hover-card.md) - 悬停卡片

#### 4. Menu 组件组
- [DropdownMenu](./components/menu/dropdown-menu.md) - 下拉菜单
- [ContextMenu](./components/menu/context-menu.md) - 右键菜单
- [NavigationMenu](./components/menu/navigation-menu.md) - 导航菜单
- [Menubar](./components/menu/menubar.md) - 菜单栏

#### 5. Form 组件组
- [Checkbox](./components/form/checkbox.md) - 复选框
- [RadioGroup](./components/form/radio-group.md) - 单选按钮组
- [Switch](./components/form/switch.md) - 开关
- [Select](./components/form/select.md) - 选择器
- [Slider](./components/form/slider.md) - 滑块

#### 6. Navigation 组件组
- [Tabs](./components/navigation/tabs.md) - 标签页

#### 7. Feedback 组件组
- [Progress](./components/feedback/progress.md) - 进度条
- [Toast](./components/feedback/toast.md) - 消息提示

#### 8. Layout 组件组
- [ScrollArea](./components/layout/scroll-area.md) - 滚动区域
- [Separator](./components/layout/separator.md) - 分隔符
- [AspectRatio](./components/layout/aspect-ratio.md) - 宽高比
- [Avatar](./components/layout/avatar.md) - 头像

#### 9. Reka UI 独有组件组
- [DateTime](./components/datetime/README.md) - 日期时间组件组（12个组件）
- [Color](./components/color/README.md) - 颜色选择组件组（6个组件）
- [Input](./components/input/README.md) - 输入组件组（6个组件）
- [Data](./components/data/README.md) - 数据展示组件组（4个组件）

## 文档结构

```
rota/docs/
├── README.md                    # 本文档
└── components/
    ├── disclosure/              # 折叠类组件
    │   ├── accordion.md
    │   └── collapsible.md
    ├── overlay/                 # 覆盖层组件
    │   ├── dialog.md
    │   ├── alert-dialog.md
    │   ├── popover.md
    │   ├── tooltip.md
    │   └── hover-card.md
    ├── menu/                    # 菜单组件
    │   ├── dropdown-menu.md
    │   ├── context-menu.md
    │   ├── navigation-menu.md
    │   └── menubar.md
    ├── form/                    # 表单组件
    │   ├── checkbox.md
    │   ├── radio-group.md
    │   ├── switch.md
    │   ├── select.md
    │   └── slider.md
    ├── navigation/              # 导航组件
    │   └── tabs.md
    ├── feedback/                # 反馈组件
    │   ├── progress.md
    │   └── toast.md
    ├── layout/                  # 布局组件
    │   ├── scroll-area.md
    │   ├── separator.md
    │   ├── aspect-ratio.md
    │   └── avatar.md
    ├── datetime/                # 日期时间组件（Reka独有）
    │   └── README.md
    ├── color/                   # 颜色选择组件（Reka独有）
    │   └── README.md
    ├── input/                   # 输入组件（Reka独有）
    │   └── README.md
    └── data/                    # 数据展示组件
        └── README.md
```

## 每个组件文档包含

1. **组件概述** - 功能描述和使用场景
2. **Reka UI API** - 完整的 Props、Events、Slots
3. **Radix UI API** - 完整的 Props、Events、Data Attributes
4. **使用示例对比** - 两者的代码示例
5. **差异分析** - API 差异分析
6. **可访问性** - ARIA 属性和键盘交互
7. **Rota 实现建议** - 基于 Rasen 的实现方案

## 关键发现

### API 设计一致性

- Reka UI 和 Radix UI 的核心组件 API 几乎完全一致
- 主要差异在于框架特性（Vue vs React）
- 组件结构和命名规范高度统一

### 实现差异

1. **响应式系统**
   - Reka UI: Vue 的 ref, reactive
   - Radix UI: React 的 useState, useEffect

2. **事件处理**
   - Reka UI: v-model, @事件
   - Radix UI: props + callbacks

3. **内容分发**
   - Reka UI: 插槽（slots）
   - Radix UI: children prop

### 可访问性

两个框架都高度重视可访问性：
- 完整的 WAI-ARIA 支持
- 键盘导航
- 屏幕阅读器支持
- 焦点管理

## 实现状态

> **这张表是唯一的进度来源。** 每份组件文档末尾的「实现优先级」清单记录的是调研阶段的
> 计划，长期没有随实现更新 —— 它会把早已完成的能力显示为未完成（例如 accordion 的键盘
> 导航、水平方向）。以本表为准。

### 已实现（21 个）

均有单元测试 + 浏览器 e2e 覆盖，并参与 SSR（服务端渲染）验证。

| 分类 | 组件 |
|------|------|
| 基础 | `aspect-ratio` `avatar` `label` `separator` |
| 披露 | `accordion` `collapsible` `tabs` |
| 表单 | `checkbox` `switch` `radio-group` `slider` `number-field` `tags-input` `pin-input` `toggle` `toggle-group` |
| 反馈 | `progress` |
| 浮层 | `dialog` `alert-dialog` `popover` `tooltip` |

### 未实现

| 分类 | 组件 | 备注 |
|------|------|------|
| 浮层 | `hover-card` | |
| 表单 | `select` | 依赖 Portal 与定位能力，建议排在它们之后 |
| 布局 | `scroll-area` | |
| 反馈 | `toast` | |
| 菜单 | `dropdown-menu` `context-menu` `menubar` `navigation-menu` | 整族未开始 |
| 日期时间 | `calendar` `range-calendar` `date-picker` `date-range-picker` `date-field` `date-range-field` `time-field` `month-picker` `year-picker` | 整族未开始 |
| 颜色 | 整族 | |
| 数据 | `pagination` `listbox` `tree` `editable` | |
| 输入增强 | `autocomplete` `combobox` | |

### 已实现组件中仍缺的能力

| 能力 | 状态 |
|------|------|
| **Portal / teleport 层** | **有意不做**。`Mountable(host, hooks)` 本来就以 host 为参数，"渲染到别处"是**换一个 host**，不是新机制 —— 加一层 Portal 意味着每个渲染器（DOM/字符串/canvas/native）都要各自实现一套搬运协议。改为在流外部件上提供统一的 `container` 逃生口（见下行）。 |
| **`container` 逃生口** | 已完成，且**规则统一**：凡把内容渲染在流外的部件都接受同一个 `container`（6 处 —— `dialog` / `alert-dialog` 的 Content 与 Overlay，`popover` / `tooltip` 的 Content），prop 只声明一次（`ContainerProp`）。应用传入自己的容器元素，部件挂载后**移动过去**（身份不变，故焦点与外部点击判定照常工作；水合时先就地认领再移动，SSR 产物与默认路径**逐字节一致**；服务端**从不执行**消费者的 getter）。代价：部件不再是组件的后代（祖先作用域 CSS 失效），容器成为其定位上下文 —— 对锚定部件（popover/tooltip）意味着定位转由应用负责，但**不因此把它们排除在外**，否则 API 不可预测。 |
| **RTL** | **全部组件未做**（`dir` 没有任何组件读取）。方向敏感的是一批具体行为，而不只是样式：水平方向键（`accordion` / `tabs` / `toggle-group` / `radio-group`）、`slider` 的横向增减方向、以及 `popover` / `tooltip` 的 `side` / `align` 语义。 |
| **动画** | **有意不做，21 个组件全部如此**（源码里没有任何 `transition` / `animation`）。组件只暴露 `data-state`，动画交给消费方的 CSS —— headless 库的常规做法，因此不是缺口而是取舍。 |
| **Floating UI / 碰撞检测 / 箭头定位** | 有意不做。`popover`/`tooltip` 用 CSS 定位（`data-side` / `data-align`），使组件可静态渲染、也能在无布局的测试环境运行。 |
| Tooltip 的 Provider（共享延迟） | 未做。每个 Tooltip 各自设置 `delayMs`。 |
| `aspect-ratio` 的内容居中 | 未做。内容容器只负责填满比例盒，居中属消费方 CSS。 |

### 技术栈

- 基于 Rasen 框架的响应式系统
- **定位**：分层组件用 CSS 定位并暴露 `data-side` / `data-align`，未引入 Floating UI
  （原因见上表）
- 完整的 TypeScript 支持
- WAI-ARIA：角色、状态与键盘行为按 ARIA 模式实现，并由 e2e 断言覆盖（例如 radio group
  的方向键移动即选中、tooltip 的 Escape 可关闭且不立刻重现）

## 总结

本次调研完成了 Reka UI 和 Radix UI 两个 Headless UI 框架的全面分析，创建了完整的组件文档。调研发现两个框架的核心组件 API 高度一致，主要差异在于框架特性。这为 Rota 框架的设计提供了良好的参考基础。

Reka UI 提供了更多的高级组件（日期时间、颜色选择等），这些可以作为 Rota 框架的扩展功能。核心组件应该优先实现，确保与两个参考框架的 API 兼容性。
