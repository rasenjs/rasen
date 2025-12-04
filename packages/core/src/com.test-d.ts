/**
 * com 函数类型测试
 *
 * 这个文件只做类型检查，不运行
 */

/* eslint-disable @typescript-eslint/no-unused-vars */

import { com } from './com'
import type { Mountable } from './types'

// ============================================
// 测试辅助类型
// ============================================

// 断言类型相等
type Expect<T extends true> = T
type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false

// ============================================
// 测试用例
// ============================================

// 1. 无参数组件
{
  const NoArgsComponent = () => {
    return (_host: HTMLElement) => {
      return () => {}
    }
  }

  const wrapped = com(NoArgsComponent)

  // 类型应该保持一致
  type _Test1 = Expect<Equal<typeof wrapped, typeof NoArgsComponent>>

  // 调用方式应该一样
  const mountable = wrapped()
  const _unmount = mountable(document.body)
}

// 2. 单个 props 参数
{
  const PropsComponent = (_props: { count: number; label: string }) => {
    return (_host: HTMLElement) => {
      return () => {}
    }
  }

  const wrapped = com(PropsComponent)

  type _Test2 = Expect<Equal<typeof wrapped, typeof PropsComponent>>

  const mountable = wrapped({ count: 1, label: 'test' })
  const _unmount = mountable(document.body)
}

// 3. 多个参数
{
  const MultiArgsComponent = (
    _name: string,
    _age: number,
    _options?: { debug: boolean }
  ) => {
    return (_host: HTMLElement) => {
      return () => {}
    }
  }

  const wrapped = com(MultiArgsComponent)

  type _Test3 = Expect<Equal<typeof wrapped, typeof MultiArgsComponent>>

  const _mountable = wrapped('test', 18)
  const _mountable2 = wrapped('test', 18, { debug: true })
}

// 4. 异步组件
{
  const AsyncComp = async (_props: { url: string }) => {
    await Promise.resolve()
    return (_host: HTMLElement) => {
      return () => {}
    }
  }

  const wrapped = com(AsyncComp)

  type _Test4 = Expect<Equal<typeof wrapped, typeof AsyncComp>>

  const mountablePromise = wrapped({ url: 'test' })
  // mountablePromise 应该是 Promise
  mountablePromise.then((mountable) => {
    const _unmount = mountable(document.body)
  })
}

// 5. 带泛型的组件
{
  const GenericComponent = <T extends object>(
    _items: T[],
    _render: (_item: T) => Mountable<HTMLElement>
  ) => {
    return (_host: HTMLElement) => {
      return () => {}
    }
  }

  const wrapped = com(GenericComponent)

  // 泛型应该保留
  const _mountable = wrapped([{ id: 1 }], (_item) => (_host) => () => {})
}

// 6. 不同 Host 类型
{
  const CanvasComponent = (_props: { x: number }) => {
    return (_ctx: CanvasRenderingContext2D) => {
      return () => {}
    }
  }

  const wrapped = com(CanvasComponent)

  type _Test6 = Expect<Equal<typeof wrapped, typeof CanvasComponent>>
}

// 7. 返回带 node 属性的 unmount
{
  const WithNodeComponent = () => {
    return (_host: HTMLElement) => {
      const el = document.createElement('div')
      const unmount = () => el.remove()
      ;(unmount as unknown as { node: HTMLElement }).node = el
      return unmount
    }
  }

  const wrapped = com(WithNodeComponent)

  type _Test7 = Expect<Equal<typeof wrapped, typeof WithNodeComponent>>
}

console.log('类型测试通过！')
