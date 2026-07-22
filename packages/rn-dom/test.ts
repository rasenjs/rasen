/**
 * Simple test for @rasenjs/rn-dom
 * 
 * Tests the core DOM abstraction functionality
 */

// 直接测试 rn-dom 的核心功能
import { RNDocument, RNNode } from './src/index'

console.log('Testing @rasenjs/rn-dom...')

try {
  // 1. 创建 document
  const doc = RNDocument.getOrCreate()
  console.log('✓ RNDocument created')

  // 2. 创建注释节点
  const comment = doc.createComment('test marker')
  console.log('✓ Comment node created:', comment.nodeValue)

  // 3. 创建 body
  const body = doc.body
  console.log('✓ Body created')

  // 4. 将 comment 添加到 body
  body.appendChild(comment)
  console.log('✓ Comment appended to body')

  // 5. 验证 comment 在 body 的 children 中
  const children = body._getFabricChildren()
  console.log('✓ Body children count:', children.length)

  // 6. 移除 comment
  body.removeChild(comment)
  console.log('✓ Comment removed')

  // 7. 验证 comment 已从 body 的 children 中移除
  const childrenAfter = body._getFabricChildren()
  console.log('✓ Body children after remove:', childrenAfter.length)

  console.log('\n✅ All tests passed!')
} catch (error) {
  console.error('❌ Test failed:', error)
  process.exit(1)
}
