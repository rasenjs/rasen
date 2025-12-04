/**
 * @rasenjs/shared - Template
 *
 * 字符串模板序列化/反序列化工具
 * 基于 Tagged Template Literal + Zod
 *
 * @example
 * ```typescript
 * import { z } from 'zod'
 * import { template } from '@rasenjs/shared'
 *
 * // 定义模板
 * const userPath = template`/users/${{ id: z.string() }}`
 *
 * // 解析
 * userPath.parse('/users/123')  // { id: '123' }
 *
 * // 格式化
 * userPath.format({ id: '123' })  // '/users/123'
 *
 * // 类型转换
 * const postPath = template`/posts/${{ id: z.coerce.number() }}`
 * postPath.parse('/posts/42')  // { id: 42 } (number)
 * ```
 */

import { z, type ZodType, type ZodObject, type ZodRawShape } from 'zod'

/**
 * 参数定义：{ name: ZodSchema }
 */
export type ParamDef<T extends ZodRawShape = ZodRawShape> = T

/**
 * 模板参数：可以是参数定义对象，也可以是另一个 Template
 */
export type TemplateParam = Record<string, ZodType> | Template<Record<string, unknown>>

/**
 * 判断是否为 Template 实例
 */
export function isTemplate(value: unknown): value is Template<Record<string, unknown>> {
  return (
    value !== null &&
    typeof value === 'object' &&
    'parse' in value &&
    'format' in value &&
    'regex' in value &&
    '_isTemplate' in value
  )
}

/**
 * 模板实例接口
 */
export interface Template<TParams extends Record<string, unknown> = Record<string, never>> {
  /**
   * 解析字符串，返回参数对象
   * 解析失败返回 null
   */
  parse(input: string): TParams | null

  /**
   * 安全解析，返回 { success, data, error }
   */
  safeParse(input: string):
    | { success: true; data: TParams }
    | { success: false; error: Error }

  /**
   * 格式化参数为字符串
   */
  format(params: TParams): string

  /**
   * 测试字符串是否匹配模板
   */
  test(input: string): boolean

  /**
   * 获取模板的正则表达式
   */
  readonly regex: RegExp

  /**
   * 获取参数名列表
   */
  readonly paramNames: string[]

  /**
   * 原始模板模式（用于调试）
   */
  readonly pattern: string

  /**
   * 合并的 Zod schema
   */
  readonly schema: ZodObject<ZodRawShape>

  /**
   * 创建带前缀的新模板（不修改原模板）
   * @param prefix 要添加的前缀字符串
   * @returns 新的 Template 实例
   */
  prefix(prefix: string): Template<TParams>

  /**
   * 内部标记
   * @internal
   */
  readonly _isTemplate: true
}

/**
 * 转义正则特殊字符
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 从 Zod schema 获取匹配正则
 */
function getParamPattern(schema: ZodType): string {
  // 使用 any 来访问内部结构，因为 Zod 没有暴露这些类型
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const def = schema._def as any

  // ZodNumber / z.coerce.number()
  if (def.typeName === 'ZodNumber') {
    return '-?\\d+(?:\\.\\d+)?'
  }

  // z.coerce.number() 是 ZodPipeline
  if (def.typeName === 'ZodPipeline' && def.out?._def?.typeName === 'ZodNumber') {
    return '-?\\d+(?:\\.\\d+)?'
  }

  // ZodEnum
  if (def.typeName === 'ZodEnum' && def.values) {
    return `(?:${(def.values as string[]).map(escapeRegex).join('|')})`
  }

  // ZodLiteral
  if (def.typeName === 'ZodLiteral' && def.value !== undefined) {
    return escapeRegex(String(def.value))
  }

  // ZodBoolean / z.coerce.boolean()
  if (def.typeName === 'ZodBoolean') {
    return '(?:true|false|1|0)'
  }

  // 默认匹配非斜杠字符
  return '[^/]+'
}

/**
 * 从参数定义提取信息
 */
function parseParamDef(param: Record<string, ZodType>): {
  name: string
  schema: ZodType
  pattern: string
} {
  const entries = Object.entries(param)
  if (entries.length !== 1) {
    throw new Error(`Param definition must have exactly one key, got ${entries.length}`)
  }
  const [name, schema] = entries[0]
  return {
    name,
    schema,
    pattern: getParamPattern(schema)
  }
}

/**
 * 合并参数类型的辅助类型
 * 支持 Record<string, ZodType> 和 Template 两种参数类型
 */
type ExtractParams<T> = T extends Template<infer P>
  ? P extends Record<string, never>
    ? unknown  // 空参数返回 unknown，合并时会被忽略
    : P
  : T extends Record<string, ZodType>
    ? { [K in keyof T]: z.infer<T[K]> }
    : never

type UnionToIntersection<U> = (U extends unknown ? (k: U) => void : never) extends (k: infer I) => void ? I : never

type MergeParams<T extends TemplateParam[]> = T extends []
  ? Record<string, never>
  : UnionToIntersection<ExtractParams<T[number]>> extends infer R
    ? R extends unknown
      ? { [K in keyof R]: R[K] }
      : never
    : never

/**
 * 创建模板
 *
 * @example
 * ```typescript
 * // 单参数
 * const tpl = template`/users/${{ id: z.string() }}`
 * tpl.parse('/users/123')  // { id: '123' }
 * tpl.format({ id: '123' }) // '/users/123'
 *
 * // 多参数 + 类型转换
 * const tpl = template`/users/${{ userId: z.string() }}/posts/${{ postId: z.coerce.number() }}`
 * tpl.parse('/users/abc/posts/123')  // { userId: 'abc', postId: 123 }
 *
 * // 枚举
 * const tpl = template`/status/${{ status: z.enum(['active', 'inactive']) }}`
 * tpl.parse('/status/active')  // { status: 'active' }
 * tpl.parse('/status/unknown') // null
 *
 * // 嵌套模板
 * const user = template`/users/${{ userId: z.string() }}`
 * const userPost = template`${user}/posts/${{ postId: z.coerce.number() }}`
 * userPost.parse('/users/abc/posts/123')  // { userId: 'abc', postId: 123 }
 * ```
 */
export function template<T extends TemplateParam[]>(
  strings: TemplateStringsArray,
  ...params: T
): Template<MergeParams<T>> {
  // 解析所有参数定义（包括嵌套模板）
  type ParamInfo = {
    type: 'param'
    name: string
    schema: ZodType
    pattern: string
  } | {
    type: 'template'
    template: Template<Record<string, unknown>>
  }

  const paramInfos: ParamInfo[] = params.map((p) => {
    if (isTemplate(p)) {
      return { type: 'template', template: p }
    }
    return { type: 'param', ...parseParamDef(p as Record<string, ZodType>) }
  })

  // 构建正则表达式
  let regexStr = '^'
  let pattern = ''

  for (let i = 0; i < strings.length; i++) {
    const staticPart = strings[i]
    regexStr += escapeRegex(staticPart)
    pattern += staticPart

    if (i < paramInfos.length) {
      const info = paramInfos[i]
      if (info.type === 'template') {
        // 嵌套模板：提取其正则（去掉 ^ 和 $）
        const nestedRegex = info.template.regex.source.slice(1, -1)
        regexStr += nestedRegex
        pattern += info.template.pattern
      } else {
        regexStr += `(${info.pattern})`
        pattern += `:${info.name}`
      }
    }
  }

  regexStr += '$'
  const regex = new RegExp(regexStr)

  // 收集所有参数名和 schema
  const allParamNames: string[] = []
  const schemaShape: ZodRawShape = {}

  for (const info of paramInfos) {
    if (info.type === 'template') {
      // 合并嵌套模板的参数
      allParamNames.push(...info.template.paramNames)
      const nestedShape = info.template.schema.shape
      for (const [key, value] of Object.entries(nestedShape)) {
        schemaShape[key] = value as ZodType
      }
    } else {
      allParamNames.push(info.name)
      schemaShape[info.name] = info.schema
    }
  }

  const mergedSchema = z.object(schemaShape)

  return {
    parse(input: string): MergeParams<T> | null {
      const match = input.match(regex)
      if (!match) return null

      // 提取原始字符串值，需要按顺序遍历捕获组
      const rawParams: Record<string, string> = {}
      let matchIndex = 1

      for (const info of paramInfos) {
        if (info.type === 'template') {
          // 嵌套模板的每个参数都有一个捕获组
          for (const name of info.template.paramNames) {
            rawParams[name] = match[matchIndex++]
          }
        } else {
          rawParams[info.name] = match[matchIndex++]
        }
      }

      // 用 Zod 解析和转换
      const result = mergedSchema.safeParse(rawParams)
      if (!result.success) return null

      return result.data as MergeParams<T>
    },

    safeParse(input: string) {
      const match = input.match(regex)
      if (!match) {
        return {
          success: false as const,
          error: new Error(`Input "${input}" does not match pattern "${pattern}"`)
        }
      }

      const rawParams: Record<string, string> = {}
      let matchIndex = 1

      for (const info of paramInfos) {
        if (info.type === 'template') {
          for (const name of info.template.paramNames) {
            rawParams[name] = match[matchIndex++]
          }
        } else {
          rawParams[info.name] = match[matchIndex++]
        }
      }

      const result = mergedSchema.safeParse(rawParams)
      if (!result.success) {
        return { success: false as const, error: new Error(result.error.message) }
      }

      return { success: true as const, data: result.data as MergeParams<T> }
    },

    format(params: MergeParams<T>): string {
      let result = ''
      for (let i = 0; i < strings.length; i++) {
        result += strings[i]
        if (i < paramInfos.length) {
          const info = paramInfos[i]
          if (info.type === 'template') {
            // 嵌套模板：使用其 format 方法
            result += info.template.format(params as Record<string, unknown>)
          } else {
            const value = (params as Record<string, unknown>)[info.name]
            if (value === undefined || value === null) {
              throw new Error(`Missing required parameter: ${info.name}`)
            }
            result += String(value)
          }
        }
      }
      return result
    },

    test(input: string): boolean {
      return regex.test(input)
    },

    get regex() {
      return regex
    },

    get paramNames() {
      return [...allParamNames]
    },

    get pattern() {
      return pattern
    },

    get schema() {
      return mergedSchema
    },

    prefix(prefixStr: string): Template<MergeParams<T>> {
      // 创建新的正则：prefix + 原正则（去掉 ^ 和 $）
      const innerRegex = regex.source.slice(1, -1) // 去掉 ^ 和 $
      const newRegex = new RegExp(`^${escapeRegex(prefixStr)}${innerRegex}$`)

      // 新的 pattern
      const newPattern = prefixStr + pattern

      // 保存原始 format 函数引用
      const originalFormat = (params: MergeParams<T>) => {
        let result = ''
        for (let i = 0; i < strings.length; i++) {
          result += strings[i]
          if (i < paramInfos.length) {
            const info = paramInfos[i]
            if (info.type === 'template') {
              result += info.template.format(params as Record<string, unknown>)
            } else {
              const value = (params as Record<string, unknown>)[info.name]
              if (value === undefined || value === null) {
                throw new Error(`Missing required parameter: ${info.name}`)
              }
              result += String(value)
            }
          }
        }
        return result
      }

      // 创建带前缀的新 Template
      const createPrefixedTemplate = (
        currentPrefix: string,
        currentPattern: string,
        currentRegex: RegExp
      ): Template<MergeParams<T>> => ({
        parse(input: string): MergeParams<T> | null {
          const match = input.match(currentRegex)
          if (!match) return null
          const rawParams: Record<string, string> = {}
          let matchIndex = 1
          for (const info of paramInfos) {
            if (info.type === 'template') {
              for (const name of info.template.paramNames) {
                rawParams[name] = match[matchIndex++]
              }
            } else {
              rawParams[info.name] = match[matchIndex++]
            }
          }
          const result = mergedSchema.safeParse(rawParams)
          if (!result.success) return null
          return result.data as MergeParams<T>
        },

        safeParse(input: string) {
          const match = input.match(currentRegex)
          if (!match) {
            return {
              success: false as const,
              error: new Error(`Input "${input}" does not match pattern "${currentPattern}"`)
            }
          }
          const rawParams: Record<string, string> = {}
          let matchIndex = 1
          for (const info of paramInfos) {
            if (info.type === 'template') {
              for (const name of info.template.paramNames) {
                rawParams[name] = match[matchIndex++]
              }
            } else {
              rawParams[info.name] = match[matchIndex++]
            }
          }
          const result = mergedSchema.safeParse(rawParams)
          if (!result.success) {
            return { success: false as const, error: new Error(result.error.message) }
          }
          return { success: true as const, data: result.data as MergeParams<T> }
        },

        format(params: MergeParams<T>): string {
          return currentPrefix + originalFormat(params)
        },

        test(input: string): boolean {
          return currentRegex.test(input)
        },

        get regex() {
          return currentRegex
        },

        get paramNames() {
          return [...allParamNames]
        },

        get pattern() {
          return currentPattern
        },

        get schema() {
          return mergedSchema
        },

        prefix(nextPrefix: string): Template<MergeParams<T>> {
          const nextPattern = nextPrefix + currentPattern
          const nextRegex = new RegExp(`^${escapeRegex(nextPrefix)}${currentRegex.source.slice(1, -1)}$`)
          return createPrefixedTemplate(nextPrefix + currentPrefix, nextPattern, nextRegex)
        },

        _isTemplate: true as const
      })

      return createPrefixedTemplate(prefixStr, newPattern, newRegex)
    },

    /**
     * 内部标记，用于识别 Template 实例
     */
    _isTemplate: true as const
  } as Template<MergeParams<T>>
}
