# Data 数据展示组件组

## 组件概述

Data 组件组提供了一系列用于数据展示和交互的组件，包括树形结构、分页、列表框等。这些组件帮助用户更好地浏览和操作大量数据。

## 组件列表

### 1. Tree 树形组件

树形结构组件，用于展示层级数据，支持展开/折叠、选择、拖拽等功能。

**组件结构**:
```vue
<Tree.Root>
  <Tree.Item>
    <Tree.Header>
      <Tree.Trigger />
      <Tree.Title />
    </Tree.Header>
    <Tree.Content>
      <Tree.Item>
        <!-- 子项 -->
      </Tree.Item>
    </Tree.Content>
  </Tree.Item>
</Tree.Root>
```

**主要 Props**:
- `value`: string - 当前选中项
- `defaultValue`: string - 默认选中项
- `onValueChange`: (value: string) => void - 选中项变化回调
- `expanded`: string[] - 展开的节点
- `defaultExpanded`: string[] - 默认展开的节点
- `onExpandedChange`: (expanded: string[]) => void - 展开状态变化回调
- `selectionMode`: 'single' | 'multiple' | 'none' - 选择模式
- `disabled`: boolean - 是否禁用

**使用示例**:
```vue
<script setup>
import { Tree } from 'reka-ui'
import { ref } from 'vue'

const treeData = [
  {
    id: '1',
    title: '文件夹 1',
    children: [
      { id: '1-1', title: '文件 1-1' },
      { id: '1-2', title: '文件 1-2' }
    ]
  },
  {
    id: '2',
    title: '文件夹 2',
    children: [
      { id: '2-1', title: '文件 2-1' }
    ]
  }
]

const expanded = ref(['1'])
const selected = ref('')
</script>

<template>
  <Tree.Root 
    v-model="selected"
    v-model:expanded="expanded"
  >
    <TreeItem 
      v-for="item in treeData" 
      :key="item.id"
      :item="item"
    />
  </Tree.Root>
</template>

<script setup>
const TreeItem = {
  props: ['item'],
  setup(props) {
    return () => (
      <Tree.Item :value="props.item.id">
        <Tree.Header>
          {props.item.children && <Tree.Trigger />}
          <Tree.Title>{props.item.title}</Tree.Title>
        </Tree.Header>
        {props.item.children && (
          <Tree.Content>
            <TreeItem 
              v-for="child in props.item.children"
              :key="child.id"
              :item="child"
            />
          </Tree.Content>
        )}
      </Tree.Item>
    )
  }
}
</script>
```

### 2. Pagination 分页组件

分页组件，用于大数据集的分页导航。

**组件结构**:
```vue
<Pagination.Root>
  <Pagination.First />
  <Pagination.Prev />
  <Pagination.Pages>
    <Pagination.Page />
  </Pagination.Pages>
  <Pagination.Next />
  <Pagination.Last />
  <Pagination.Ellipsis />
</Pagination.Root>
```

**主要 Props**:
- `page`: number - 当前页码
- `defaultPage`: number - 默认页码
- `onPageChange`: (page: number) => void - 页码变化回调
- `total`: number - 总条目数
- `pageSize`: number - 每页条目数
- `siblingCount`: number - 显示的页码按钮数量
- `disabled`: boolean - 是否禁用

**使用示例**:
```vue
<script setup>
import { Pagination } from 'reka-ui'
import { ref } from 'vue'

const page = ref(1)
const total = 100
const pageSize = 10
</script>

<template>
  <Pagination.Root 
    v-model="page"
    :total="total"
    :page-size="pageSize"
  >
    <Pagination.First>首页</Pagination.First>
    <Pagination.Prev>上一页</Pagination.Prev>
    <Pagination.Pages>
      <template #default="{ pages }">
        <Pagination.Page 
          v-for="p in pages"
          :key="p"
          :value="p"
        >
          {{ p }}
        </Pagination.Page>
      </template>
    </Pagination.Pages>
    <Pagination.Next>下一页</Pagination.Next>
    <Pagination.Last>末页</Pagination.Last>
  </Pagination.Root>
</template>
```

### 3. Listbox 列表框组件

列表框组件，用于从列表中选择一个或多个选项。

**组件结构**:
```vue
<Listbox.Root>
  <Listbox.Item>
    <Listbox.ItemText />
    <Listbox.ItemIndicator />
  </Listbox.Item>
</Listbox.Root>
```

**主要 Props**:
- `value`: string | string[] - 当前选中值
- `defaultValue`: string | string[] - 默认值
- `onValueChange`: (value: string | string[]) => void - 值变化回调
- `selectionMode`: 'single' | 'multiple' - 选择模式
- `disabled`: boolean - 是否禁用

**与 Select 的区别**:
- Listbox: 列表始终可见，适合少量选项
- Select: 下拉选择，适合节省空间

**使用示例**:
```vue
<script setup>
import { Listbox } from 'reka-ui'
import { ref } from 'vue'

const selected = ref([])
const items = ['Apple', 'Banana', 'Cherry', 'Date']
</script>

<template>
  <Listbox.Root 
    v-model="selected"
    selection-mode="multiple"
  >
    <Listbox.Item 
      v-for="item in items"
      :key="item"
      :value="item"
    >
      <Listbox.ItemText>{{ item }}</Listbox.ItemText>
      <Listbox.ItemIndicator>✓</Listbox.ItemIndicator>
    </Listbox.Item>
  </Listbox.Root>
</template>
```

### 4. Editable 可编辑组件

可编辑文本组件，支持查看和编辑模式切换（已在 Input 组件组中详细说明）。

## 可访问性

### WAI-ARIA 角色

#### Tree
- Root: `role="tree"` + `aria-label`
- Item: `role="treeitem"` + `aria-expanded` + `aria-selected`
- Header: 无特殊角色
- Trigger: 无特殊角色
- Content: `role="group"`

#### Pagination
- Root: `role="navigation"` + `aria-label`
- Page: `role="button"` + `aria-current`
- First/Prev/Next/Last: `role="button"` + `aria-disabled`

#### Listbox
- Root: `role="listbox"` + `aria-label`
- Item: `role="option"` + `aria-selected`

### 键盘交互

#### Tree
| 按键 | 行为 |
|------|------|
| ArrowRight | 展开节点 / 移到第一个子节点 |
| ArrowLeft | 折叠节点 / 移到父节点 |
| ArrowDown | 移到下一个可见节点 |
| ArrowUp | 移到上一个可见节点 |
| Enter | 选择节点 |
| Space | 选择节点 |
| Home | 移到第一个节点 |
| End | 移到最后一个可见节点 |
| * | 展开所有同级节点 |

#### Pagination
| 按键 | 行为 |
|------|------|
| Enter / Space | 跳转到指定页 |
| ArrowLeft | 上一页 |
| ArrowRight | 下一页 |
| Home | 第一页 |
| End | 最后一页 |

#### Listbox
| 按键 | 行为 |
|------|------|
| ArrowDown | 移到下一项 |
| ArrowUp | 移到上一项 |
| Enter / Space | 选择项 |
| Home | 移到第一项 |
| End | 移到最后一项 |
| A-Z | 类型搜索 |

## Rota 实现建议

### 1. 实现优先级

#### 高优先级
- [ ] Pagination - 分页（常用）
- [ ] Listbox - 列表框（常用）

#### 中优先级
- [ ] Tree - 树形结构

#### 低优先级
- [ ] Editable - 可编辑文本

### 2. 关键特性

#### Tree
1. **虚拟滚动**: 大数据量性能优化
2. **拖拽排序**: 支持拖拽调整层级
3. **异步加载**: 按需加载子节点
4. **多选**: 支持多选和范围选择
5. **搜索过滤**: 快速定位节点

#### Pagination
1. **智能省略**: 自动省略中间页码
2. **快速跳转**: 支持输入页码跳转
3. **自定义渲染**: 自定义页码按钮
4. **响应式**: 适应不同屏幕尺寸

#### Listbox
1. **虚拟滚动**: 大数据量性能优化
2. **多选**: 支持多选和范围选择
3. **搜索过滤**: 快速定位选项
4. **分组**: 支持选项分组

### 3. 实现挑战

#### Tree
1. **性能**: 大数据量的渲染性能
2. **拖拽**: 复杂的拖拽交互
3. **虚拟滚动**: 动态高度的虚拟滚动
4. **键盘导航**: 复杂的键盘交互

#### Pagination
1. **页码计算**: 智能省略算法
2. **响应式**: 不同屏幕的显示策略

#### Listbox
1. **性能**: 大数据量的渲染性能
2. **虚拟滚动**: 列表虚拟滚动
3. **键盘导航**: 多选时的键盘交互

## 与其他组件库对比

| 特性 | Reka UI | Radix UI | React Aria | Ant Design |
|------|---------|----------|------------|------------|
| Tree | ✅ | ❌ | ✅ | ✅ |
| Pagination | ✅ | ❌ | ✅ | ✅ |
| Listbox | ✅ | ❌ | ✅ | ❌ |
| 虚拟滚动 | ❌ | ❌ | ✅ | ✅ |
| 拖拽排序 | ❌ | ❌ | ❌ | ✅ |

## 参考资料

- [Reka UI Data Components](https://reka-ui.dev/docs/components/tree)
- [React Aria Tree](https://react-spectrum.adobe.com/react-aria/useTree.html)
- [WAI-ARIA Tree Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/treeview/)
- [WAI-ARIA Listbox Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/listbox/)
