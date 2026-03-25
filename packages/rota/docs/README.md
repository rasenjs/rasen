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

## 下一步计划

### 1. 优先实现的核心组件

#### 高优先级
- [ ] Accordion - 手风琴
- [ ] Dialog - 对话框
- [ ] DropdownMenu - 下拉菜单
- [ ] Checkbox - 复选框
- [ ] Select - 选择器
- [ ] Tabs - 标签页

#### 中优先级
- [ ] Popover - 弹出框
- [ ] Tooltip - 工具提示
- [ ] Switch - 开关
- [ ] Slider - 滑块
- [ ] Progress - 进度条

#### 低优先级
- [ ] Reka UI 独有组件（DateTime、Color、Input 等）

### 2. 实现步骤

1. 创建基础组件结构
2. 实现响应式状态管理
3. 添加键盘交互
4. 实现无障碍支持
5. 添加动画支持

### 3. 技术栈

- 基于 Rasen 框架的响应式系统
- 使用 Floating UI 进行定位
- 完整的 TypeScript 支持
- WAI-ARIA 合规

## 总结

本次调研完成了 Reka UI 和 Radix UI 两个 Headless UI 框架的全面分析，创建了完整的组件文档。调研发现两个框架的核心组件 API 高度一致，主要差异在于框架特性。这为 Rota 框架的设计提供了良好的参考基础。

Reka UI 提供了更多的高级组件（日期时间、颜色选择等），这些可以作为 Rota 框架的扩展功能。核心组件应该优先实现，确保与两个参考框架的 API 兼容性。
