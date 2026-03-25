# Input 输入组件组

## 组件概述

Input 组件组提供了一系列高级输入组件，用于增强表单输入体验。这些组件是 Reka UI 独有的，Radix UI 没有对应实现。

## 组件列表

### 1. Autocomplete 自动完成组件

自动完成输入框，支持从预定义列表中选择或自由输入。

**组件结构**:
```vue
<Autocomplete.Root>
  <Autocomplete.Input />
  <Autocomplete.Portal>
    <Autocomplete.Content>
      <Autocomplete.Item />
    </Autocomplete.Content>
  </Autocomplete.Portal>
</Autocomplete.Root>
```

**主要 Props**:
- `value`: string - 当前输入值
- `defaultValue`: string - 默认值
- `onValueChange`: (value: string) => void - 值变化回调
- `filter`: (value: string, items: Item[]) => Item[] - 过滤函数
- `allowCustomValue`: boolean - 是否允许自定义值
- `disabled`: boolean - 是否禁用

**使用示例**:
```vue
<script setup>
import { Autocomplete } from 'reka-ui'
import { ref } from 'vue'

const value = ref('')
const items = ['Apple', 'Banana', 'Cherry', 'Date', 'Elderberry']
</script>

<template>
  <Autocomplete.Root v-model="value">
    <Autocomplete.Input placeholder="搜索水果..." />
    <Autocomplete.Portal>
      <Autocomplete.Content>
        <Autocomplete.Item 
          v-for="item in items.filter(i => i.toLowerCase().includes(value.toLowerCase()))"
          :key="item"
          :value="item"
        >
          {{ item }}
        </Autocomplete.Item>
      </Autocomplete.Content>
    </Autocomplete.Portal>
  </Autocomplete.Root>
</template>
```

### 2. Combobox 组合框组件

组合框结合了输入框和下拉列表，支持搜索、选择和自由输入。

**组件结构**:
```vue
<Combobox.Root>
  <Combobox.Input />
  <Combobox.Trigger />
  <Combobox.Portal>
    <Combobox.Content>
      <Combobox.Item />
      <Combobox.Empty />
    </Combobox.Content>
  </Combobox.Portal>
</Combobox.Root>
```

**主要 Props**:
- `value`: string - 当前选中值
- `inputValue`: string - 当前输入值
- `onValueChange`: (value: string) => void - 选中值变化回调
- `onInputValueChange`: (value: string) => void - 输入值变化回调
- `filter`: (value: string, items: Item[]) => Item[] - 过滤函数
- `allowCustomValue`: boolean - 是否允许自定义值

**与 Autocomplete 的区别**:
- Autocomplete: 侧重于自动完成，通常不需要触发按钮
- Combobox: 侧重于选择和输入结合，通常有触发按钮

### 3. NumberField 数字字段组件

数字输入字段，支持步进器、格式化和范围限制。

**组件结构**:
```vue
<NumberField.Root>
  <NumberField.Label />
  <NumberField.Input />
  <NumberField.Increment />
  <NumberField.Decrement />
</NumberField.Root>
```

**主要 Props**:
- `value`: number - 当前值
- `defaultValue`: number - 默认值
- `onValueChange`: (value: number) => void - 值变化回调
- `min`: number - 最小值
- `max`: number - 最大值
- `step`: number - 步长
- `formatOptions`: Intl.NumberFormatOptions - 格式化选项
- `locale`: string - 语言环境
- `disabled`: boolean - 是否禁用

**使用示例**:
```vue
<script setup>
import { NumberField } from 'reka-ui'
import { ref } from 'vue'

const value = ref(0)
</script>

<template>
  <NumberField.Root 
    v-model="value"
    :min="0"
    :max="100"
    :step="1"
  >
    <NumberField.Label>数量</NumberField.Label>
    <NumberField.Input />
    <NumberField.Increment>+</NumberField.Increment>
    <NumberField.Decrement>-</NumberField.Decrement>
  </NumberField.Root>
</template>
```

### 4. PinInput PIN 输入组件

一次性密码输入组件，常用于验证码输入。

**组件结构**:
```vue
<PinInput.Root>
  <PinInput.Input />
  <PinInput.Input />
  <PinInput.Input />
  <PinInput.Input />
</PinInput.Root>
```

**主要 Props**:
- `value`: string - 当前值
- `defaultValue`: string - 默认值
- `onValueChange`: (value: string) => void - 值变化回调
- `onComplete`: (value: string) => void - 完成回调
- `length`: number - 输入框数量
- `type`: 'numeric' | 'alphanumeric' | 'text' - 输入类型
- `otp`: boolean - 是否为 OTP（自动填充支持）
- `disabled`: boolean - 是否禁用

**使用示例**:
```vue
<script setup>
import { PinInput } from 'reka-ui'

const handleComplete = (value) => {
  console.log('验证码:', value)
}
</script>

<template>
  <PinInput.Root 
    :length="6"
    type="numeric"
    otp
    @complete="handleComplete"
  >
    <PinInput.Input v-for="i in 6" :key="i" />
  </PinInput.Root>
</template>
```

### 5. TagsInput 标签输入组件

多标签输入组件，支持添加、删除和编辑标签。

**组件结构**:
```vue
<TagsInput.Root>
  <TagsInput.Item>
    <TagsInput.ItemText />
    <TagsInput.ItemDelete />
  </TagsInput.Item>
  <TagsInput.Input />
</TagsInput.Root>
```

**主要 Props**:
- `value`: string[] - 当前标签列表
- `defaultValue`: string[] - 默认标签
- `onValueChange`: (value: string[]) => void - 值变化回调
- `max`: number - 最大标签数
- `delimiter`: string | RegExp - 分隔符
- `addOnPaste`: boolean - 粘贴时添加
- `addOnBlur`: boolean - 失焦时添加
- `allowCustomValue`: boolean - 是否允许自定义值
- `disabled`: boolean - 是否禁用

**使用示例**:
```vue
<script setup>
import { TagsInput } from 'reka-ui'
import { ref } from 'vue'

const tags = ref(['Vue', 'React'])
</script>

<template>
  <TagsInput.Root v-model="tags">
    <TagsInput.Item 
      v-for="tag in tags" 
      :key="tag"
      :value="tag"
    >
      <TagsInput.ItemText>{{ tag }}</TagsInput.ItemText>
      <TagsInput.ItemDelete>×</TagsInput.ItemDelete>
    </TagsInput.Item>
    <TagsInput.Input placeholder="添加标签..." />
  </TagsInput.Root>
</template>
```

### 6. Editable 可编辑组件

可编辑文本组件，支持查看和编辑模式切换。

**组件结构**:
```vue
<Editable.Root>
  <Editable.Area>
    <Editable.Input />
    <Editable.Preview />
  </Editable.Area>
  <Editable.Trigger />
</Editable.Root>
```

**主要 Props**:
- `value`: string - 当前值
- `defaultValue`: string - 默认值
- `onValueChange`: (value: string) => void - 值变化回调
- `placeholder`: string - 占位符
- `disabled`: boolean - 是否禁用
- `readOnly`: boolean - 是否只读
- `autoResize`: boolean - 自动调整大小

**使用示例**:
```vue
<script setup>
import { Editable } from 'reka-ui'
import { ref } from 'vue'

const value = ref('点击编辑')
</script>

<template>
  <Editable.Root v-model="value">
    <Editable.Area>
      <Editable.Input />
      <Editable.Preview />
    </Editable.Area>
    <Editable.Trigger>
      <button>编辑</button>
    </Editable.Trigger>
  </Editable.Root>
</template>
```

## 可访问性

### WAI-ARIA 角色

- Autocomplete: `role="combobox"` + `aria-autocomplete`
- Combobox: `role="combobox"` + `aria-expanded`
- NumberField: `role="spinbutton"` + `aria-valuemin` + `aria-valuemax` + `aria-valuenow`
- PinInput: `role="textbox"` + `aria-label`
- TagsInput: `role="listbox"` + `aria-label`
- Editable: `role="textbox"` + `aria-readonly`

### 键盘交互

#### Autocomplete / Combobox
| 按键 | 行为 |
|------|------|
| ArrowDown | 移动到下一项 |
| ArrowUp | 移动到上一项 |
| Enter | 选择当前项 |
| Escape | 关闭列表 |
| Tab | 选择并移到下一项 |

#### NumberField
| 按键 | 行为 |
|------|------|
| ArrowUp | 增加值 |
| ArrowDown | 减少值 |
| PageUp | 大幅增加值 |
| PageDown | 大幅减少值 |
| Home | 设置为最小值 |
| End | 设置为最大值 |

#### PinInput
| 按键 | 行为 |
|------|------|
| Backspace | 删除并移到上一格 |
| Delete | 删除当前格 |
| ArrowLeft | 移到上一格 |
| ArrowRight | 移到下一格 |
| Ctrl + V | 粘贴并自动分配 |

#### TagsInput
| 按键 | 行为 |
|------|------|
| Enter | 添加标签 |
| Backspace | 删除最后一个标签 |
| Delete | 删除选中的标签 |
| ArrowLeft | 移到上一个标签 |
| ArrowRight | 移到下一个标签 |

## Rota 实现建议

### 1. 实现优先级

#### 高优先级
- [ ] NumberField - 数字输入（常用）
- [ ] TagsInput - 标签输入（常用）
- [ ] PinInput - PIN 输入（验证码场景）

#### 中优先级
- [ ] Autocomplete - 自动完成
- [ ] Combobox - 组合框

#### 低优先级
- [ ] Editable - 可编辑文本

### 2. 关键特性

1. **键盘导航**: 完整的键盘支持
2. **自动完成**: 智能过滤和匹配
3. **格式化**: 数字格式化和本地化
4. **验证**: 输入验证和限制
5. **粘贴支持**: 智能粘贴处理
6. **无障碍**: 完整的 ARIA 支持

### 3. 实现挑战

1. **过滤逻辑**: 高效的过滤算法
2. **焦点管理**: 复杂的焦点切换
3. **键盘导航**: 多种键盘交互模式
4. **自动完成**: 智能匹配和补全
5. **性能**: 大量选项的渲染优化

## 与其他组件库对比

| 特性 | Reka UI | Radix UI | React Aria | Headless UI |
|------|---------|----------|------------|-------------|
| Autocomplete | ✅ | ❌ | ✅ | ✅ |
| Combobox | ✅ | ❌ | ✅ | ✅ |
| NumberField | ✅ | ❌ | ✅ | ❌ |
| PinInput | ✅ | ❌ | ✅ | ❌ |
| TagsInput | ✅ | ❌ | ✅ | ❌ |
| Editable | ✅ | ❌ | ✅ | ❌ |

## 参考资料

- [Reka UI Input Components](https://reka-ui.dev/docs/components/autocomplete)
- [React Aria Inputs](https://react-spectrum.adobe.com/react-aria/useTextField.html)
- [WAI-ARIA Combobox Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/)
