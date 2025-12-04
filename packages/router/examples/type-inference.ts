/**
 * 演示类型推断的示例
 */

import { z } from 'zod'
import { template as tpl, createRouter } from '../src/index'

// 创建路由配置 - 使用新的声明式 API
const router = createRouter({
  home: '/',
  about: '/about',
  user: tpl`/users/${{ id: z.string() }}`,
  post: tpl`/posts/${{ id: z.coerce.number() }}`,
  settings: {
    profile: {},
    account: tpl`${{ section: z.string() }}`,
  }
})

// ✅ router.routes 现在有正确的嵌套类型
const { routes } = router

// TypeScript 会正确推断每个 route 的类型
routes.home // Route<{}, {}, unknown>
routes.about // Route<{}, {}, unknown>
routes.user // Route<{ id: string }, {}, unknown>
routes.post // Route<{ id: number }, {}, unknown>
routes.settings.profile // Route<{}, {}, unknown>
routes.settings.account // Route<{ section: string }, {}, unknown>

// ✅ href 有正确的参数类型提示（通过 Route 对象）
const userHref = router.href(routes.user, { params: { id: '123' } }) // ✅
const postHref = router.href(routes.post, { params: { id: 42 } }) // ✅
const accountHref = router.href(routes.settings.account, { params: { section: 'password' } }) // ✅

// ✅ href 也支持字符串键（类型安全）
const userHref2 = router.href('user', { params: { id: '456' } }) // ✅
const accountHref2 = router.href('settings.account', { params: { section: 'security' } }) // ✅

// ✅ push 有正确的参数类型提示（通过 Route 对象）
router.push(routes.user, { params: { id: 'alice' } }) // ✅
router.push(routes.post, { params: { id: 42 } }) // ✅
router.push(routes.settings.account, { params: { section: 'security' } }) // ✅

// ✅ push 也支持字符串键（类型安全）
router.push('user', { params: { id: 'bob' } }) // ✅
router.push('settings.profile') // ✅
router.push('settings.account', { params: { section: 'password' } }) // ✅

console.log('✅ Type inference works correctly!')
console.log('userHref:', userHref)
console.log('postHref:', postHref)
console.log('accountHref:', accountHref)
console.log('userHref2:', userHref2)
console.log('accountHref2:', accountHref2)
