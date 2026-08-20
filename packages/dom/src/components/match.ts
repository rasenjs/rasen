import { match as coreMatch } from '@rasenjs/core'

/**
 * @deprecated 从 @rasenjs/core 直接导入 `match`（宿主上下文由 mount 自动提供）
 */
export const match = coreMatch

/**
 * @deprecated Use `match` instead. Will be removed in future versions.
 */
export const switchCase = match
