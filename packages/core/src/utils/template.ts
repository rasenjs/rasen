/**
 * Template utilities for string template serialization/deserialization
 * Based on Tagged Template Literal + Zod
 *
 * @example
 * ```typescript
 * import { z } from 'zod'
 * import { template } from '@rasenjs/core'
 *
 * // Define template
 * const userPath = template`/users/${{ id: z.string() }}`
 *
 * // Parse
 * userPath.parse('/users/123')  // { id: '123' }
 *
 * // Format
 * userPath.format({ id: '123' })  // '/users/123'
 *
 * // Type conversion
 * const postPath = template`/posts/${{ id: z.coerce.number() }}`
 * postPath.parse('/posts/42')  // { id: 42 } (number)
 * ```
 */

import { z, type ZodType, type ZodObject, type ZodRawShape } from 'zod'

/**
 * Parameter definition: { name: ZodSchema }
 */
export type ParamDef<T extends ZodRawShape = ZodRawShape> = T

/**
 * Template parameter: can be parameter definition object or another Template
 */
export type TemplateParam = Record<string, ZodType> | Template<Record<string, unknown>>

/**
 * Check if value is a Template instance
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
 * Template instance interface
 */
export interface Template<TParams extends Record<string, unknown> = Record<string, never>> {
  /**
   * Parse string, return parameter object
   * Returns null if parsing fails
   */
  parse(input: string): TParams | null

  /**
   * Safe parse, returns { success, data, error }
   */
  safeParse(input: string):
    | { success: true; data: TParams }
    | { success: false; error: Error }

  /**
   * Format parameters to string
   */
  format(params: TParams): string

  /**
   * Test if string matches template
   */
  test(input: string): boolean

  /**
   * Get template regex
   */
  readonly regex: RegExp

  /**
   * Get parameter names list
   */
  readonly paramNames: string[]

  /**
   * Raw template pattern (for debugging)
   */
  readonly pattern: string

  /**
   * Merged Zod schema
   */
  readonly schema: ZodObject<ZodRawShape>

  /**
   * Create new template with prefix (does not modify original)
   * @param prefix Prefix string to add
   * @returns New Template instance
   */
  prefix(prefix: string): Template<TParams>

  /**
   * Internal marker
   * @internal
   */
  readonly _isTemplate: true
}

/**
 * Escape regex special characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Get matching regex from Zod schema
 */
function getParamPattern(schema: ZodType): string {
  // Use any to access internal structure, as Zod doesn't expose these types
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const def = schema._def as any

  // ZodNumber / z.coerce.number()
  if (def.typeName === 'ZodNumber') {
    return '-?\\d+(?:\\.\\d+)?'
  }

  // z.coerce.number() is ZodPipeline
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

  // Default: match non-slash characters
  return '[^/]+'
}

/**
 * Parse parameter definition info
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
 * Helper type for merging parameter types
 * Supports both Record<string, ZodType> and Template parameter types
 */
type ExtractParams<T> = T extends Template<infer P>
  ? P extends Record<string, never>
    ? unknown  // Empty params return unknown, will be ignored in merge
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
 * Create template
 *
 * @example
 * ```typescript
 * // Single parameter
 * const tpl = template`/users/${{ id: z.string() }}`
 * tpl.parse('/users/123')  // { id: '123' }
 * tpl.format({ id: '123' }) // '/users/123'
 *
 * // Multiple parameters + type conversion
 * const tpl = template`/users/${{ userId: z.string() }}/posts/${{ postId: z.coerce.number() }}`
 * tpl.parse('/users/abc/posts/123')  // { userId: 'abc', postId: 123 }
 *
 * // Enum
 * const tpl = template`/status/${{ status: z.enum(['active', 'inactive']) }}`
 * tpl.parse('/status/active')  // { status: 'active' }
 * tpl.parse('/status/unknown') // null
 *
 * // Nested template
 * const user = template`/users/${{ userId: z.string() }}`
 * const userPost = template`${user}/posts/${{ postId: z.coerce.number() }}`
 * userPost.parse('/users/abc/posts/123')  // { userId: 'abc', postId: 123 }
 * ```
 */
export function template<T extends TemplateParam[]>(
  strings: TemplateStringsArray,
  ...params: T
): Template<MergeParams<T>> {
  // Parse all parameter definitions (including nested templates)
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

  // Build regex
  let regexStr = '^'
  let pattern = ''

  for (let i = 0; i < strings.length; i++) {
    const staticPart = strings[i]
    regexStr += escapeRegex(staticPart)
    pattern += staticPart

    if (i < paramInfos.length) {
      const info = paramInfos[i]
      if (info.type === 'template') {
        // Nested template: extract its regex (remove ^ and $)
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

  // Collect all parameter names and schemas
  const allParamNames: string[] = []
  const schemaShape: ZodRawShape = {}

  for (const info of paramInfos) {
    if (info.type === 'template') {
      // Merge nested template parameters
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

      // Extract raw string values, need to traverse capture groups in order
      const rawParams: Record<string, string> = {}
      let matchIndex = 1

      for (const info of paramInfos) {
        if (info.type === 'template') {
          // Each parameter of nested template has a capture group
          for (const name of info.template.paramNames) {
            rawParams[name] = match[matchIndex++]
          }
        } else {
          rawParams[info.name] = match[matchIndex++]
        }
      }

      // Parse and convert with Zod
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
            // Nested template: use its format method
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
      // Create new regex: prefix + original regex (remove ^ and $)
      const innerRegex = regex.source.slice(1, -1) // Remove ^ and $
      const newRegex = new RegExp(`^${escapeRegex(prefixStr)}${innerRegex}$`)

      // New pattern
      const newPattern = prefixStr + pattern

      // Save original format function reference
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

      // Create new Template with prefix
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
     * Internal marker, used to identify Template instances
     */
    _isTemplate: true as const
  } as Template<MergeParams<T>>
}
