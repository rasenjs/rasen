/**
 * 类型检查测试文件
 * 用于验证 router.routes 和 push 等方法的类型推断
 */

import { z } from 'zod'
import { template as tpl, createRouter } from '../index'

// 创建路由配置
const router = createRouter({
  home: { path: tpl`/` },
  about: { path: tpl`/about` },
  user: tpl`/users/${{ id: z.string() }}`,
  post: tpl`/posts/${{ id: z.coerce.number() }}`,
  settings: {
    profile: {},
    account: tpl`${{ section: z.string() }}`,
  }
})

// 测试 routes 类型推断
const routes = router.routes

// ✅ 应该有正确的嵌套结构
routes.home // Route<{}>
routes.about // Route<{}>
routes.user // Route<{ id: string }>
routes.post // Route<{ id: number }>
routes.settings.profile // Route<{}>
routes.settings.account // Route<{ section: string }>

// ✅ href 应该有正确的类型提示
router.href(routes.home)
router.href(routes.user, { params: { id: '123' } })
router.href(routes.post, { params: { id: 42 } })
router.href(routes.settings.account, { params: { section: 'password' } })

// @ts-expect-error id 应该是 string
router.href(routes.user, { params: { id: 123 } })

// @ts-expect-error id 应该是 number
router.href(routes.post, { params: { id: '42' } })

// @ts-expect-error home 不需要参数
router.href(routes.home, { params: { id: '123' } })

// ✅ push 应该有正确的类型提示
router.push(routes.home, {})
router.push(routes.user, { params: { id: 'alice' } })
router.push(routes.post, { params: { id: 42 } })
router.push(routes.settings.account, { params: { section: 'security' } })

// ❌ 应该报错：参数类型不匹配
// @ts-expect-error 参数类型不匹配
router.push(routes.user, { params: { id: 123 } })

// @ts-expect-error 参数类型不匹配
router.push(routes.post, { params: { id: '42' } })

// ✅ match 返回值类型
const match = router.match('/users/alice')
if (match) {
  match.params // { id: string } | { id: number } | { section: string } | {} (联合类型)
  match.route // Route
}

// ============================================
// Link 组件类型检查
// ============================================
import { createRouterLink } from '../components/index'

const Link = createRouterLink(router, () => () => () => null)

// ✅ 通过 Route 对象：无参数时 params 可选
Link({ to: routes.home })
Link({ to: routes.about })
Link({ to: routes.settings.profile })

// ✅ 通过 Route 对象：有参数时 params 必需
Link({ to: routes.user, params: { id: 'bob' } })
Link({ to: routes.post, params: { id: 123 } })
Link({ to: routes.settings.account, params: { section: 'privacy' } })

// ✅ 通过字符串键：无参数
Link({ to: 'home' })
Link({ to: 'about' })
Link({ to: 'settings.profile' })

// ✅ 通过字符串键：有参数
Link({ to: 'user', params: { id: 'alice' } })
Link({ to: 'post', params: { id: 456 } })
Link({ to: 'settings.account', params: { section: 'password' } })

// 注意：虽然 routes.user 需要 params，但由于 TypeScript 类型系统的限制，
// 在 Link 组件中我们无法在编译时完全捕获这个错误（需要在运行时由 router.push 验证）
// 这与 router.push 的行为保持一致

// @ts-expect-error id 应该是 string
Link({ to: routes.user, params: { id: 123 } })

// @ts-expect-error id 应该是 number
Link({ to: routes.post, params: { id: '123' } })

// @ts-expect-error section 应该是 string
Link({ to: routes.settings.account, params: { section: 123 } })

console.log('✅ 类型检查通过！')
