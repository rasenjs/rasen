/**
 * Router Demo - @rasenjs/router
 *
 * 演示路由的基本使用
 * 遵循 Rasen 组件架构：setup => mount => unmount
 */

import { z } from 'zod'
import { ref } from '@rasenjs/reactive-signals'
import { com, type Mountable } from '@rasenjs/core'
import { useReactiveRuntime } from '@rasenjs/reactive-signals'
import {
  div,
  a,
  h1,
  h2,
  h3,
  p,
  span,
  ul,
  li,
  code,
  nav,
  mount,
  input,
  button,
  when,
} from '@rasenjs/dom'
import {
  tpl,
  createRouter,
  createBrowserHistory,
  NavigationAbortedError
} from '@rasenjs/router'
import {
  createRouterLink,
  createRouterView,
  createLeaveGuard,
  layout
} from '@rasenjs/router/components'

// ============================================
// 初始化响应式运行时
// ============================================
useReactiveRuntime()

// ============================================
// 1. 定义路由（使用模板字面量）
// ============================================

// 简单的登录状态管理
const isLoggedIn = ref(false)

const router = createRouter({
  // 绝对路径（以 / 开头）- 纯字符串
  home: '/',
  about: '/about',
  scroll: '/scroll', // 滚动演示页面
  login: '/login', // 登录页面

  // 带参数的路由 - 使用 tpl
  user: tpl`/users/${{ id: z.string() }}`,

  // 带数字参数（自动转换）
  post: tpl`/posts/${{ id: z.coerce.number() }}`,

  // 受保护的路由 - 需要登录才能访问
  protected: {
    path: '/protected',
    beforeEnter: () => {
      if (!isLoggedIn.value) {
        alert('请先登录！')
        return false
      }
      return true
    }
  },

  // 嵌套路由（相对路径）
  settings: {
    profile: {}, // → /settings/profile
    account: {}, // → /settings/account
    security: 'password' // → /settings/security/password
  }
}, {
  history: createBrowserHistory()
})

// ============================================
// 2.1 全局钩子
// ============================================

// 前置守卫：页面标题 & 日志
router.beforeEach((to, from) => {
  console.log(`[Router] ${from?.path ?? '(initial)'} → ${to.path}`)
  return true
})

// 后置钩子：更新页面标题
router.afterEach((to) => {
  const titles: Record<string, string> = {
    '/': 'Home - Router Demo',
    '/about': 'About - Router Demo'
  }
  document.title = titles[to.path] ?? 'Router Demo'
})

// 错误处理
router.onError((error) => {
  if (error instanceof NavigationAbortedError) {
    console.log('[Router] Navigation aborted:', error.message)
  } else {
    console.error('[Router] Navigation error:', error)
  }
})

// ============================================
// 3. 创建 Link 和 LeaveGuard 组件
// ============================================

// 直接使用 @rasenjs/dom 的 a 组件
const Link = createRouterLink(router, a)

// 创建 leaveGuard 组件
const leaveGuard = createLeaveGuard(router)

// ============================================
// 4. 定义视图组件（Rasen 组件模式）
// ============================================

/**
 * 首页视图
 */
const HomeView = com((): Mountable<HTMLElement> => {
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
})

/**
 * 关于页视图
 */
const AboutView = com((): Mountable<HTMLElement> => {
  return div(
    { class: 'view' },
    h2('📖 关于'),
    p('@rasenjs/router 是 Rasen 项目的路由模块。'),
    p({ style: { marginTop: '10px' } }, '设计原则：'),
    ul(
      { style: { margin: '15px 0 0 20px', color: '#666' } },
      li(
        span({ style: { fontWeight: 'bold' } }, 'Headless'),
        ' - 核心逻辑与视图分离'
      ),
      li(
        span({ style: { fontWeight: 'bold' } }, 'Type-safe'),
        ' - 完整的 TypeScript 类型推断'
      ),
      li(
        span({ style: { fontWeight: 'bold' } }, 'Platform-agnostic'),
        ' - 适配任何渲染目标'
      )
    )
  )
})

/**
 * 用户详情视图
 */
const UserView = com((params: { id: string }): Mountable<HTMLElement> => {
  return div(
    { class: 'view' },
    h2('👤 用户详情'),
    div(
      { class: 'user-card' },
      div({ class: 'card-title' }, `User ID: ${params.id}`),
      p('这是用户 ', code(params.id), ' 的详情页面。'),
      p(
        { style: { marginTop: '10px', color: '#888' } },
        '参数类型：string（原样保留）'
      )
    )
  )
})

/**
 * 文章详情视图
 */
const PostView = com((params: { id: number }): Mountable<HTMLElement> => {
  return div(
    { class: 'view' },
    h2('📝 文章详情'),
    div(
      { class: 'post-card' },
      div({ class: 'card-title' }, `Post ID: ${params.id}`),
      p('这是文章 ', code(String(params.id)), ' 的详情页面。'),
      p(
        { style: { marginTop: '10px', color: '#888' } },
        '参数类型：number（使用 z.coerce.number() 自动转换）'
      ),
      p(
        { style: { marginTop: '5px', color: '#888' } },
        `typeof id = ${typeof params.id}`
      )
    )
  )
})

/**
 * 滚动恢复演示视图
 */
const ScrollView = com((): Mountable<HTMLElement> => {
  return div(
    { class: 'view' },
    h2('↕️ 滚动恢复演示'),
    p('这个页面有大量内容，用于演示滚动位置的保存和恢复。'),
    p(
      { style: { marginTop: '10px', color: '#666', fontStyle: 'italic' } },
      '功能说明：向下滚动此页面，然后点击导航链接去其他页面，再返回。你会发现滚动位置被自动恢复了！'
    ),
    p({ style: { marginTop: '20px', fontWeight: 'bold' } }, '这利用了 useScrollRestoration 钩子的功能：'),
    ul(
      { style: { margin: '10px 0 0 20px' } },
      li('导航离开时自动保存滚动位置'),
      li('返回时自动恢复保存的位置'),
      li('新导航时自动滚动到顶部')
    ),

    // 添加大量内容以实现可滚动效果
    ...Array.from({ length: 20 }, (_, i) => {
      return div(
        { style: { marginTop: '30px', padding: '15px', background: '#f0f0f0', borderRadius: '4px' } },
        h3(`Section ${i + 1}`),
        p(
          `这是第 ${i + 1} 个内容区块。Lorem ipsum dolor sit amet, consectetur adipiscing elit. `
        ),
        p(
          `Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.`
        ),
        p(
          { style: { color: '#888', fontSize: '12px' } },
          `Current scroll position: Y = ${Math.round(window.scrollY)}`
        )
      )
    })
  )
})

/**
 * 登录视图
 */
const LoginView = com((): Mountable<HTMLElement> => {
  return div(
    { class: 'view' },
    h2('🔐 登录'),
    p('点击下方按钮登录后，即可访问受保护的页面。'),
    div(
      { style: { marginTop: '20px' } },
      button(
        {
          style: {
            padding: '10px 20px',
            fontSize: '16px',
            background: isLoggedIn.value ? '#95de64' : '#1890ff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          },
          onClick: () => {
            isLoggedIn.value = !isLoggedIn.value
            alert(isLoggedIn.value ? '登录成功！' : '已退出登录')
          },
          children: () => (isLoggedIn.value ? '退出登录' : '登录')
        }
      ),
    ),
    p(
      { style: { marginTop: '15px', color: '#888' } },
      '当前状态：',
      when({
        condition: isLoggedIn,
        then: () => span(
          { style: { fontWeight: 'bold', color: '#52c41a' } },
          '已登录'
        ),
        else: () => span(
          { style: { fontWeight: 'bold', color: '#f5222d' } },
          '未登录'
        )
      })
    )
  )
})

/**
 * 受保护的视图
 */
const ProtectedView = com((): Mountable<HTMLElement> => {
  return div(
    { class: 'view' },
    h2('🔒 受保护的页面'),
    p('恭喜！你已经登录，可以看到这个受保护的页面了。'),
    p(
      { style: { marginTop: '10px', color: '#666', fontStyle: 'italic' } },
      '这个页面使用了 beforeEnter 守卫，只有登录后才能访问。'
    ),
    div(
      {
        style: {
          marginTop: '20px',
          padding: '15px',
          background: '#f6ffed',
          border: '1px solid #b7eb8f',
          borderRadius: '4px'
        }
      },
      p({ style: { fontWeight: 'bold', color: '#52c41a' } }, '✓ 权限验证通过'),
      p({ style: { marginTop: '10px', fontSize: '14px' } }, '这演示了如何使用单路由守卫来保护特定页面。')
    )
  )
})

/**
 * 设置 - 个人资料视图（带 leaveGuard 示例）
 */
const SettingsProfileView = com((): Mountable<HTMLElement> => {
  // 表单脏状态
  const formDirty = ref(false)

  return div(
    { class: 'view' },
    h2('⚙️ 设置 - 个人资料'),
    p('这是嵌套路由示例：', code('/settings/profile')),
    p(
      { style: { marginTop: '10px', color: '#666' } },
      '路由定义使用相对路径，自动添加父级前缀。'
    ),

    // leaveGuard：离开前确认
    leaveGuard({
      guard: () => {
        if (formDirty.value) {
          return confirm('有未保存的更改，确定离开吗？')
        }
        return true
      }
    }),

    // 模拟表单
    div(
      {
        style: {
          marginTop: '20px',
          padding: '15px',
          background: '#f5f5f5',
          borderRadius: '8px'
        }
      },
      p(
        { style: { marginBottom: '10px', fontWeight: 'bold' } },
        '📝 编辑个人资料（leaveGuard 示例）'
      ),
      input({
        type: 'text',
        placeholder: '输入内容后尝试离开此页面...',
        style: { padding: '8px', width: '300px', marginRight: '10px' },
        onInput: () => {
          formDirty.value = true
        }
      }),
      button(
        {
          style: { padding: '8px 16px' },
          onClick: () => {
            formDirty.value = false
            alert('已保存！')
          }
        },
        '保存'
      )
    )
  )
})

/**
 * 设置 - 账户视图
 */
const SettingsAccountView = com((): Mountable<HTMLElement> => {
  return div(
    { class: 'view' },
    h2('⚙️ 设置 - 账户'),
    p('这是嵌套路由示例：', code('/settings/account'))
  )
})

/**
 * 设置 - 安全视图
 */
const SettingsSecurityView = com((): Mountable<HTMLElement> => {
  return div(
    { class: 'view' },
    h2('⚙️ 设置 - 安全 - 密码'),
    p('深层嵌套路由：', code('/settings/security/password'))
  )
})

/**
 * 404 视图
 */
const NotFoundView = com((): Mountable<HTMLElement> => {
  return div({ class: 'view' }, h2('❌ 404 Not Found'), p('页面不存在'))
})

/**
 * Settings 布局组件
 * children 是一个返回 Mountable 的函数，需要在布局内部挂载
 */
function SettingsLayout(
  children: () => Mountable<HTMLElement>
): Mountable<HTMLElement> {
  return div(
    { class: 'settings-layout' },
    div(
      { class: 'settings-nav' },
      Link({ to: router.routes.settings.profile, params: {} }, '个人资料'),
      Link({ to: router.routes.settings.account, params: {} }, '账户'),
      Link({ to: router.routes.settings.security }, '安全')
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

// 简化：不再需要传 routes，从 router.routes 获取
const RouterView = createRouterView(
  router,
  {
    home: () => HomeView(),
    about: () => AboutView(),
    scroll: () => ScrollView(),
    login: () => LoginView(),
    protected: () => ProtectedView(),
    user: ({ id }) => UserView({ id }),
    post: ({ id }) => PostView({ id }),
    settings: {
      // 使用 layout Symbol 定义布局
      [layout]: SettingsLayout,
      profile: () => SettingsProfileView(),
      account: () => SettingsAccountView(),
      security: () => SettingsSecurityView()
    }
  },
  {
    default: () => NotFoundView()
  }
)

// ============================================
// 6. Debug 组件
// ============================================

const DebugInfo = com((): Mountable<HTMLElement> => {
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
    const unregister = router.afterEach(render)

    host.appendChild(container)

    // unmount 时清理
    return () => {
      unregister()
      container.remove()
    }
  }
})

// ============================================
// 7. 渲染应用
// ============================================

const App = com((): Mountable<HTMLElement> => {
  return div(
    { class: 'app' },
    // Header
    div(
      { class: 'header' },
      h1('@rasenjs/router Demo'),
      nav(
        { class: 'nav' },
        // 使用 Route 对象（类型安全）
        Link({ to: router.routes.home }, 'Home'),
        Link({ to: router.routes.about }, 'About'),
        Link({ to: router.routes.scroll }, 'Scroll Demo'),
        Link({ to: router.routes.login }, 'Login'),
        Link({ to: router.routes.protected }, 'Protected'),
        Link({ to: router.routes.user, params: { id: 'alice' } }, 'User: alice'),
        Link({ to: router.routes.user, params: { id: 'bob' } }, 'User: bob'),
        Link({ to: router.routes.post, params: { id: 42 } }, 'Post: 42'),
        Link({ to: router.routes.settings.profile, params: {} }, 'Settings')
      )
    ),
    // Main content
    div({ class: 'main' }, RouterView()),
    // Debug info
    DebugInfo(),
    // Footer
    div({ class: 'footer' }, 'Built with @rasenjs/router')
  )
})

// Mount
mount(App(), document.getElementById('app')!)

// ============================================
// 8. 演示滚动恢复功能
// ============================================
// 这是一个简单的滚动位置保存和恢复演示
// 在实际应用中，应该使用 @rasenjs/router-dom 的 useScrollRestoration 钩子

const scrollPositions = new Map<string, { x: number; y: number }>()
let currentPath = router.current?.path || null

// 导航前保存位置
router.beforeEach((_to, from) => {
  if (from && currentPath) {
    scrollPositions.set(currentPath, {
      x: window.scrollX || 0,
      y: window.scrollY || 0
    })
  }
})

// 导航后处理滚动
router.afterEach((to) => {
  currentPath = to.path
  
  requestAnimationFrame(() => {
    const saved = scrollPositions.get(to.path)
    if (saved) {
      // 返回到之前访问过的页面，恢复位置
      window.scrollTo(saved.x, saved.y)
      console.log(`✓ 滚动位置已恢复: (${saved.x}, ${saved.y})`)
    } else {
      // 首次访问，滚动到顶部
      window.scrollTo(0, 0)
      console.log('✓ 新页面已加载，滚动到顶部')
    }
  })
})

console.log('✓ 滚动恢复演示已启用')
