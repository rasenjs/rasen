# Color 颜色选择组件组

## 组件概述

Color 组件组提供了一整套颜色选择相关的组件，这是 Reka UI 独有的功能，Radix UI 没有对应实现。支持多种颜色格式、颜色空间和交互方式。

## 组件列表

### 1. ColorPicker 颜色选择器

完整的颜色选择器组件，结合了颜色区域、滑块和输入字段。

**组件结构**:
```vue
<ColorPicker.Root>
  <ColorPicker.Label />
  <ColorPicker.Trigger />
  <ColorPicker.Portal>
    <ColorPicker.Content>
      <ColorPicker.Area>
        <ColorPicker.AreaThumb />
      </ColorPicker.Area>
      <ColorPicker.Slider>
        <ColorPicker.SliderTrack />
        <ColorPicker.SliderThumb />
      </ColorPicker.Slider>
      <ColorPicker.Input />
    </ColorPicker.Content>
  </ColorPicker.Portal>
</ColorPicker.Root>
```

**主要 Props**:
- `value`: string - 当前颜色值（支持多种格式）
- `defaultValue`: string - 默认颜色
- `onValueChange`: (value: string) => void - 颜色变化回调
- `format`: 'hex' | 'rgb' | 'hsl' | 'hsb' - 颜色格式
- `disabled`: boolean - 是否禁用

**使用示例**:
```vue
<script setup>
import { ColorPicker } from 'reka-ui'
import { ref } from 'vue'

const color = ref('#FF0000')
</script>

<template>
  <ColorPicker.Root v-model="color">
    <ColorPicker.Label>选择颜色</ColorPicker.Label>
    <ColorPicker.Trigger>
      <div :style="{ backgroundColor: color }" />
    </ColorPicker.Trigger>
    <ColorPicker.Portal>
      <ColorPicker.Content>
        <ColorPicker.Area>
          <ColorPicker.AreaThumb />
        </ColorPicker.Area>
        <ColorPicker.Slider channel="hue">
          <ColorPicker.SliderTrack />
          <ColorPicker.SliderThumb />
        </ColorPicker.Slider>
      </ColorPicker.Content>
    </ColorPicker.Portal>
  </ColorPicker.Root>
</template>
```

### 2. ColorArea 颜色区域

二维颜色选择区域，通常用于选择饱和度和亮度。

**组件结构**:
```vue
<ColorArea.Root>
  <ColorArea.Background />
  <ColorArea.Thumb />
</ColorArea.Root>
```

**主要 Props**:
- `value`: Color - 当前颜色值
- `defaultValue`: Color - 默认颜色
- `onValueChange`: (value: Color) => void - 颜色变化回调
- `xChannel`: 'hue' | 'saturation' | 'brightness' - X 轴通道
- `yChannel`: 'hue' | 'saturation' | 'brightness' - Y 轴通道
- `disabled`: boolean - 是否禁用

### 3. ColorSlider 颜色滑块

单轴颜色滑块，用于选择色相、透明度等。

**组件结构**:
```vue
<ColorSlider.Root>
  <ColorSlider.Track />
  <ColorSlider.Thumb />
</ColorSlider.Root>
```

**主要 Props**:
- `value`: Color - 当前颜色值
- `defaultValue`: Color - 默认颜色
- `onValueChange`: (value: Color) => void - 颜色变化回调
- `channel`: 'hue' | 'saturation' | 'brightness' | 'alpha' - 颜色通道
- `disabled`: boolean - 是否禁用

### 4. ColorField 颜色字段

颜色输入字段，支持多种颜色格式的输入和解析。

**组件结构**:
```vue
<ColorField.Root>
  <ColorField.Label />
  <ColorField.Input />
</ColorField.Root>
```

**主要 Props**:
- `value`: string - 当前颜色值
- `defaultValue`: string - 默认颜色
- `onValueChange`: (value: string) => void - 颜色变化回调
- `format`: 'hex' | 'rgb' | 'hsl' | 'hsb' - 颜色格式
- `disabled`: boolean - 是否禁用

### 5. ColorSwatch 颜色色块

单个颜色色块，用于显示或选择颜色。

**组件结构**:
```vue
<ColorSwatch.Root>
  <ColorSwatch.Background />
</ColorSwatch.Root>
```

**主要 Props**:
- `value`: string - 颜色值
- `disabled`: boolean - 是否禁用

### 6. ColorSwatchPicker 色块选择器

多个颜色色块的选择器，用于预设颜色选择。

**组件结构**:
```vue
<ColorSwatchPicker.Root>
  <ColorSwatchPicker.Item>
    <ColorSwatchPicker.ItemBackground />
  </ColorSwatchPicker.Item>
</ColorSwatchPicker.Root>
```

**主要 Props**:
- `value`: string - 当前选中颜色
- `defaultValue`: string - 默认颜色
- `onValueChange`: (value: string) => void - 颜色变化回调
- `disabled`: boolean - 是否禁用

**使用示例**:
```vue
<script setup>
import { ColorSwatchPicker } from 'reka-ui'
import { ref } from 'vue'

const color = ref('#FF0000')
const colors = ['#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF']
</script>

<template>
  <ColorSwatchPicker.Root v-model="color">
    <ColorSwatchPicker.Item 
      v-for="c in colors" 
      :key="c"
      :value="c"
    >
      <ColorSwatchPicker.ItemBackground />
    </ColorSwatchPicker.Item>
  </ColorSwatchPicker.Root>
</template>
```

## 颜色格式支持

### 支持的颜色格式

| 格式 | 示例 | 说明 |
|------|------|------|
| HEX | `#FF0000` | 十六进制 |
| HEXA | `#FF0000FF` | 十六进制（含透明度） |
| RGB | `rgb(255, 0, 0)` | RGB 格式 |
| RGBA | `rgba(255, 0, 0, 1)` | RGB（含透明度） |
| HSL | `hsl(0, 100%, 50%)` | HSL 格式 |
| HSLA | `hsla(0, 100%, 50%, 1)` | HSL（含透明度） |
| HSB/HSV | `hsb(0, 100%, 100%)` | HSB/HSV 格式 |

### 颜色通道

| 通道 | 说明 | 范围 |
|------|------|------|
| hue | 色相 | 0-360 |
| saturation | 饱和度 | 0-100 |
| brightness | 亮度 | 0-100 |
| alpha | 透明度 | 0-1 |
| red | 红色通道 | 0-255 |
| green | 绿色通道 | 0-255 |
| blue | 蓝色通道 | 0-255 |

## 颜色值类型

### Color 对象

```typescript
interface Color {
  // HSB/HSV
  hue: number
  saturation: number
  brightness: number
  
  // RGB
  red: number
  green: number
  blue: number
  
  // HSL
  hue: number
  saturation: number
  lightness: number
  
  // Alpha
  alpha: number
  
  // 方法
  toHex(): string
  toRgb(): string
  toHsl(): string
  toHsb(): string
  toString(format?: string): string
}
```

## 可访问性

### WAI-ARIA 角色

- ColorPicker: `role="dialog"` + `aria-label`
- ColorArea: `role="slider"` + `aria-valuetext`
- ColorSlider: `role="slider"` + `aria-valuemin` + `aria-valuemax` + `aria-valuenow`
- ColorField: `role="textbox"` + `aria-label`

### 键盘交互

#### ColorArea
| 按键 | 行为 |
|------|------|
| ArrowUp | 向上移动 |
| ArrowDown | 向下移动 |
| ArrowLeft | 向左移动 |
| ArrowRight | 向右移动 |
| PageUp | 大幅向上移动 |
| PageDown | 大幅向下移动 |
| Home | 移到左上角 |
| End | 移到右下角 |

#### ColorSlider
| 按键 | 行为 |
|------|------|
| ArrowRight / ArrowUp | 增加值 |
| ArrowLeft / ArrowDown | 减少值 |
| PageUp | 大幅增加值 |
| PageDown | 大幅减少值 |
| Home | 设置为最小值 |
| End | 设置为最大值 |

## Rota 实现建议

### 1. 依赖库

建议使用以下库来处理颜色：
- **@ctrl/tinycolor**: 轻量级颜色处理库
- **colord**: 小巧快速的颜色操作库
- **color**: JavaScript 颜色转换库

### 2. 实现优先级

#### 高优先级
- [ ] ColorPicker - 完整的颜色选择器
- [ ] ColorArea - 颜色区域
- [ ] ColorSlider - 颜色滑块

#### 中优先级
- [ ] ColorField - 颜色输入字段
- [ ] ColorSwatch - 颜色色块

#### 低优先级
- [ ] ColorSwatchPicker - 色块选择器

### 3. 关键特性

1. **多格式支持**: 支持多种颜色格式
2. **颜色转换**: 自动格式转换
3. **透明度**: Alpha 通道支持
4. **键盘导航**: 完整的键盘支持
5. **无障碍**: 屏幕阅读器支持
6. **触摸支持**: 移动端触摸交互

### 4. 实现挑战

1. **颜色空间转换**: RGB、HSL、HSB 之间的转换
2. **精度问题**: 颜色计算的精度
3. **性能**: 实时颜色预览的性能
4. **触摸交互**: 移动端的触摸体验
5. **无障碍**: 颜色的无障碍描述

## 与其他组件库对比

| 特性 | Reka UI | Radix UI | React Aria | Ant Design |
|------|---------|----------|------------|------------|
| ColorPicker | ✅ | ❌ | ✅ | ✅ |
| ColorArea | ✅ | ❌ | ✅ | ❌ |
| ColorSlider | ✅ | ❌ | ✅ | ❌ |
| ColorField | ✅ | ❌ | ✅ | ❌ |
| ColorSwatch | ✅ | ❌ | ✅ | ✅ |
| 多格式支持 | ✅ | ❌ | ✅ | ✅ |

## 参考资料

- [Reka UI Color Components](https://reka-ui.dev/docs/components/color-picker)
- [React Aria Color](https://react-spectrum.adobe.com/react-aria/useColor.html)
- [WAI-ARIA Slider Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/slider/)
- [Color Space Conversions](https://www.easyrgb.com/en/math.php)
