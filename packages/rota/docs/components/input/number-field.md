# NumberField 数字字段组件

数字输入字段，支持步进器、格式化和范围限制。

## 使用示例

```typescript
import { numberField } from '@rasenjs/rota'

// 基本用法
const MyComponent = () => {
  const container = document.getElementById('container')

  const unmount = numberField({
    defaultValue: 0,
    min: 0,
    max: 100,
    step: 1,
    onValueChange: (value) => {
      console.log('Current value:', value)
    }
  })(container)

  return unmount // 返回卸载函数
}
```

## API

### NumberFieldRoot Props

- `value?: number` - 当前值（受控模式）
- `defaultValue?: number` - 默认值（非受控模式）
- `min?: number` - 最小值（默认 0）
- `max?: number` - 最大值（默认 100）
- `step?: number` - 步长（默认 1）
- `formatOptions?: Intl.NumberFormatOptions` - 格式化选项
- `locale?: string` - 语言环境
- `disabled?: boolean` - 是否禁用
- `required?: boolean` - 是否必填
- `name?: string` - 名称
- `onValueChange?: (value: number | null) => void` - 值变更回调
- `class?: string` - CSS类名
- `style?: Record<string, string | number> | string` - 内联样式

### NumberFieldInput Props

- `class?: string` - CSS类名
- `style?: Record<string, string | number> | string` - 内联样式

### NumberFieldIncrement Props

- `class?: string` - CSS类名
- `style?: Record<string, string | number> | string` - 内联样式
- `children?: string` - 按钮内容（默认为 '+'）

### NumberFieldDecrement Props

- `class?: string` - CSS类名
- `style?: Record<string, string | number> | string` - 内联样式
- `children?: string` - 按钮内容（默认为 '-'）

```

```
