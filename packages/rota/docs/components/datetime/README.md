# DateTime 日期时间组件组

## 组件概述

DateTime 组件组提供了一整套用于日期和时间选择、显示和输入的组件。这是 Reka UI 独有的组件系列，Radix UI 没有对应实现。

## 组件列表

### 日期选择组件

#### 1. Calendar 日历组件
单日期选择日历，支持月份和年份导航。

**组件结构**:
```vue
<Calendar.Root>
  <Calendar.Header>
    <Calendar.PrevButton />
    <Calendar.Heading />
    <Calendar.NextButton />
  </Calendar.Header>
  <Calendar.Grid>
    <Calendar.GridHead>
      <Calendar.GridRow>
        <Calendar.HeadCell />
      </Calendar.GridRow>
    </Calendar.GridHead>
    <Calendar.GridBody>
      <Calendar.GridRow>
        <Calendar.Cell />
      </Calendar.GridRow>
    </Calendar.GridBody>
  </Calendar.Grid>
</Calendar.Root>
```

**主要 Props**:
- `value`: Date | DateRange - 当前选中日期
- `defaultValue`: Date | DateRange - 默认日期
- `onValueChange`: (date: Date | DateRange) => void - 日期变化回调
- `minValue`: Date - 最小日期
- `maxValue`: Date - 最大日期
- `isDisabled`: (date: Date) => boolean - 禁用日期判断
- `locale`: string - 语言环境

#### 2. RangeCalendar 范围日历
日期范围选择，支持选择开始和结束日期。

#### 3. DatePicker 日期选择器
带输入框的日期选择器，结合了 Input 和 Calendar。

**组件结构**:
```vue
<DatePicker.Root>
  <DatePicker.Label />
  <DatePicker.Input />
  <DatePicker.Trigger />
  <DatePicker.Portal>
    <DatePicker.Content>
      <DatePicker.Calendar />
    </DatePicker.Content>
  </DatePicker.Portal>
</DatePicker.Root>
```

#### 4. DateRangePicker 日期范围选择器
带输入框的日期范围选择器。

### 日期输入组件

#### 5. DateField 日期字段
纯输入的日期字段，支持键盘输入和格式化。

**组件结构**:
```vue
<DateField.Root>
  <DateField.Label />
  <DateField.Input />
</DateField.Root>
```

**主要 Props**:
- `value`: DateValue - 当前日期值
- `granularity`: 'day' | 'hour' | 'minute' | 'second' - 精度
- `placeholderValue`: DateValue - 占位符日期
- `isDisabled`: boolean - 是否禁用
- `isReadOnly`: boolean - 是否只读

#### 6. DateRangeField 日期范围字段
日期范围输入字段。

### 时间组件

#### 7. TimeField 时间字段
时间输入字段，支持小时、分钟、秒。

**组件结构**:
```vue
<TimeField.Root>
  <TimeField.Label />
  <TimeField.Input />
</TimeField.Root>
```

**主要 Props**:
- `value`: TimeValue - 当前时间值
- `granularity`: 'hour' | 'minute' | 'second' - 精度
- `hourCycle`: 12 | 24 - 小时周期
- `placeholderValue`: TimeValue - 占位符时间

#### 8. TimeRangeField 时间范围字段
时间范围输入字段。

### 月份和年份选择器

#### 9. MonthPicker 月份选择器
快速选择月份。

#### 10. MonthRangePicker 月份范围选择器
选择月份范围。

#### 11. YearPicker 年份选择器
快速选择年份。

#### 12. YearRangePicker 年份范围选择器
选择年份范围。

## 日期值类型

### DateValue
```typescript
interface DateValue {
  year: number
  month: number
  day: number
  calendar?: Calendar
  era?: Era
}
```

### TimeValue
```typescript
interface TimeValue {
  hour: number
  minute: number
  second?: number
  millisecond?: number
}
```

### DateTimeValue
```typescript
interface DateTimeValue extends DateValue, TimeValue {}
```

## 国际化支持

所有日期时间组件都支持国际化：
- `locale`: 语言环境（如 'zh-CN', 'en-US'）
- `calendar`: 日历系统（如 'gregory', 'japanese'）
- `timeZone`: 时区（如 'Asia/Shanghai'）

## 可访问性

### WAI-ARIA 角色

- Calendar: `role="application"` + `aria-label`
- Grid: `role="grid"` + `aria-labelledby`
- Cell: `role="gridcell"` + `aria-selected`
- Input: `role="combobox"` + `aria-expanded`

### 键盘交互

| 按键 | 行为 |
|------|------|
| ArrowRight | 下一天/下一项 |
| ArrowLeft | 上一天/上一项 |
| ArrowDown | 下一周/下一项 |
| ArrowUp | 上一周/上一项 |
| Home | 月初/第一项 |
| End | 月末/最后一项 |
| PageUp | 上月 |
| PageDown | 下月 |
| Enter / Space | 选择日期 |
| Escape | 关闭弹窗 |

## Rota 实现建议

### 1. 依赖库

建议使用以下库来处理日期时间：
- **@internationalized/date**: 提供日期时间类型和计算
- **date-fns**: 轻量级日期处理库
- **dayjs**: 轻量级日期处理库

### 2. 实现优先级

#### 高优先级
- [ ] Calendar - 核心日历组件
- [ ] DatePicker - 日期选择器
- [ ] DateField - 日期输入字段
- [ ] TimeField - 时间输入字段

#### 中优先级
- [ ] RangeCalendar - 范围日历
- [ ] DateRangePicker - 日期范围选择器
- [ ] DateRangeField - 日期范围字段

#### 低优先级
- [ ] MonthPicker - 月份选择器
- [ ] YearPicker - 年份选择器
- [ ] TimeRangeField - 时间范围字段

### 3. 关键特性

1. **国际化**: 支持多语言和多种日历系统
2. **键盘导航**: 完整的键盘支持
3. **范围选择**: 支持日期范围选择
4. **格式化**: 自动格式化输入
5. **验证**: 日期有效性验证
6. **禁用日期**: 支持禁用特定日期

### 4. 实现挑战

1. **时区处理**: 需要正确处理不同时区
2. **日历系统**: 支持多种日历系统（公历、农历等）
3. **格式化**: 不同地区的日期格式差异
4. **性能**: 大量日期单元格的渲染优化
5. **可访问性**: 复杂的键盘导航和屏幕阅读器支持

## 与其他组件库对比

| 特性 | Reka UI | Radix UI | React Aria |
|------|---------|----------|------------|
| 日期选择器 | ✅ | ❌ | ✅ |
| 时间选择器 | ✅ | ❌ | ✅ |
| 范围选择 | ✅ | ❌ | ✅ |
| 国际化 | ✅ | ❌ | ✅ |
| 多日历系统 | ✅ | ❌ | ✅ |

## 参考资料

- [Reka UI Date & Time](https://reka-ui.dev/docs/components/date-picker)
- [React Aria Dates](https://react-spectrum.adobe.com/react-aria/useDateField.html)
- [WAI-ARIA Date Picker Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/examples/datepicker-dialog/)
