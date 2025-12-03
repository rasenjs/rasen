/**
 * Router Demo - @rasenjs/router
 * 
 * 演示路由的基本使用
 * 遵循 Rasen 组件架构：setup => mount => unmount
 */

import { z } from 'zod'
import { setReactiveRuntime, type Mountable } from '@rasenjs/core'
import { createReactiveRuntime } from '@rasenjs/reactive-signals'
import { div, a, h1, h2, p, span, ul, li, code, nav, mount } from '@rasenjs/dom'
import { route, tpl, createRoutes, createRouter, createBrowserHistory } from '@rasenjs/router'
import { createRouterLink, createRouterView, layout, type ViewsConfig } from '@rasenjs/router/components'

// ============================================
// 初始化响应式运行时
// ============================================
setReactiveRuntime(createReactiveRuntime())

// ============================================
// 1. 定义路由（使用模板字面量）
// ============================================

const routes = createRoutes({
  // 绝对路径（以 / 开头）
  home: route(tpl`/`),
  about: route(tpl`/about`),
  
  // 带参数的路由
  user: route(tpl`/users/${{ id: z.string() }}`),
  
  // 带数字参数（自动转换）
  post: route(tpl`/posts/${{ id: z.coerce.number() }}`),
  
  // 嵌套路由（相对路径）
  settings: {
    profile: route(),                                  // → /settings/profile
    account: route(),                                  // → /settings/account
    security: route(tpl`password`),                    // → /settings/security/password
  },
})

// ============================================
// 2. 创建路由器
// ============================================

const router = createRouter(routes, {
  history: createBrowserHistory(),
})

// ============================================
// 3. 创建 Link 组件
// ============================================

// 直接使用 @rasenjs/dom 的 a 组件
const Link = createRouterLink(router, a)

// ============================================
// 4. 定义视图组件（Rasen 组件模式）
// ============================================

/**
 * 首页视图
 */
function HomeView(): Mountable<HTMLElement> {
  return div(
    { class: 'view' },
    h2('🏠 首页'),
    p('欢迎使用 @rasenjs/router！'),
    p('这是一个 headless 路由器，支持：'),
    ul(
      { style: { margin: '15px 0 0 20px', color: '#666' } },
      li('类型安全的路由定义'),
      li('Zod 参数验证和类型转换'),
      li('嵌套路由（相对路径 vs 绝对路径）'),
      li('框架无关的设计')
    )
  )
}

/**
 * 关于页视图
 */
function AboutView(): Mountable<HTMLElement> {
  return div(
    { class: 'view' },
    h2('📖 关于'),
    p('@rasenjs/router 是 Rasen 项目的路由模块。'),
    p({ style: { marginTop: '10px' } }, '设计原则：'),
    ul(
      { style: { margin: '15px 0 0 20px', color: '#666' } },
      li(span({ style: { fontWeight: 'bold' } }, 'Headless'), ' - 核心逻辑与视图分离'),
      li(span({ style: { fontWeight: 'bold' } }, 'Type-safe'), ' - 完整的 TypeScript 类型推断'),
      li(span({ style: { fontWeight: 'bold' } }, 'Platform-agnostic'), ' - 适配任何渲染目标')
    )
  )
}

/**
 * 用户详情视图
 */
function UserView(params: { id: string }): Mountable<HTMLElement> {
  return div(
    { class: 'view' },
    h2('👤 用户详情'),
    div(
      { class: 'user-card' },
      div({ class: 'card-title' }, `User ID: ${params.id}`),
      p('这是用户 ', code(params.id), ' 的详情页面。'),
      p({ style: { marginTop: '10px', color: '#888' } }, '参数类型：string（原样保留）')
    )
  )
}

/**
 * 文章详情视图
 */
function PostView(params: { id: number }): Mountable<HTMLElement> {
  return div(
    { class: 'view' },
    h2('📝 文章详情'),
    div(
      { class: 'post-card' },
      div({ class: 'card-title' }, `Post ID: ${params.id}`),
      p('这是文章 ', code(String(params.id)), ' 的详情页面。'),
      p({ style: { marginTop: '10px', color: '#888' } }, '参数类型：number（使用 z.coerce.number() 自动转换）'),
      p({ style: { marginTop: '5px', color: '#888' } }, `typeof id = ${typeof params.id}`)
    )
  )
}

/**
 * 设置 - 个人资料视图
 */
function SettingsProfileView(): Mountable<HTMLElement> {
  return div(
    { class: 'view' },
    h2('⚙️ 设置 - 个人资料'),
    p('这是嵌套路由示例：', code('/settings/profile')),
    p({ style: { marginTop: '10px', color: '#666' } }, '路由定义使用相对路径，自动添加父级前缀。')
  )
}

/**
 * 设置 - 账户视图
 */
function SettingsAccountView(): Mountable<HTMLElement> {
  return div(
    { class: 'view' },
    h2('⚙️ 设置 - 账户'),
    p('这是嵌套路由示例：', code('/settings/account'))
  )
}

/**
 * 设置 - 安全视图
 */
function SettingsSecurityView(): Mountable<HTMLElement> {
  return div(
    { class: 'view' },
    h2('⚙️ 设置 - 安全 - 密码'),
    p('深层嵌套路由：', code('/settings/security/password'))
  )
}

/**
 * 404 视图
 */
function NotFoundView(): Mountable<HTMLElement> {
  return div(
    { class: 'view' },
    h2('❌ 404 Not Found'),
    p('页面不存在')
  )
}

/**
 * Settings 布局组件
 * children 是一个返回 Mountable 的函数，需要在布局内部挂载
 */
function SettingsLayout(children: () => Mountable<HTMLElement>): Mountable<HTMLElement> {
  return div(
    { class: 'settings-layout' },
    div(
      { class: 'settings-nav' },
      Link({ to: routes.settings.profile, params: {}, children: ['个人资料'] }),
      Link({ to: routes.settings.account, params: {}, children: ['账户'] }),
      Link({ to: routes.settings.security, params: {}, children: ['安全'] })
    ),
    div(
      { class: 'settings-content' },
      // children() 返回 Mountable，直接作为子组件
      children()
    )
  )
}

// ============================================
// 5. 创建 RouterView（使用对象结构）
// ============================================

const RouterView = createRouterView(router, routes, {
  home: () => HomeView(),
  about: () => AboutView(),
  user: ({ id }) => UserView({ id }),
  post: ({ id }) => PostView({ id }),
  settings: {
    // 使用 layout Symbol 定义布局
    [layout]: SettingsLayout,
    profile: () => SettingsProfileView(),
    account: () => SettingsAccountView(),
    security: () => SettingsSecurityView(),
  },
}, {
  default: () => NotFoundView(),
})

// ============================================
// 6. Debug 组件
// ============================================

function DebugInfo(): Mountable<HTMLElement> {
  // mount 阶段处理
  return (host: HTMLElement) => {
    const container = document.createElement('div')
    container.className = 'debug'
    
    const render = () => {
      const current = router.current
      container.innerHTML = `
        <div class="debug-title">// Debug Info</div>
        <div>path: "${window.location.pathname}"</div>
        <div>match: ${current ? JSON.stringify(current, null, 2) : 'null'}</div>
      `
    }
    
    // 初始渲染
    render()
    
    // 订阅路由变化
    const unsubscribe = router.subscribe(render)
    
    host.appendChild(container)
    
    // unmount 时清理
    return () => {
      unsubscribe()
      container.remove()
    }
  }
}

// ============================================
// 7. 渲染应用
// ============================================

function App(): Mountable<HTMLElement> {
  return div(
    { class: 'app' },
    // Header
    div(
      { class: 'header' },
      h1('@rasenjs/router Demo'),
      nav(
        { class: 'nav' },
        // 使用 Route 对象（类型安全）
        Link({ to: routes.home, params: {} }, 'Home'),
        Link({ to: routes.about, params: {} }, 'About'),
        Link({ to: routes.user, params: { id: 'alice' } }, 'User: alice'),
        Link({ to: routes.user, params: { id: 'bob' } }, 'User: bob'),
        Link({ to: routes.post, params: { id: 42 } }, 'Post: 42'),
        // 也可以使用 children 属性
        Link({ to: routes.settings.profile, params: {}, children: ['Settings'] })
      )
    ),
    // Main content
    div(
      { class: 'main' },
      RouterView()
    ),
    // Debug info
    DebugInfo(),
    // Footer
    div({ class: 'footer' }, 'Built with @rasenjs/router')
  )
}

// Mount
mount(App(), document.getElementById('app')!)
