/**
 * JSX 类型声明
 */

import type { Mountable, PropValue, Ref, ReadonlyRef, Getter } from '@rasenjs/core'

/**
 * 子元素单项类型
 * 支持：静态值、响应式引用、getter 函数
 */
type ChildItem = 
  | JSX.Element 
  | string 
  | number 
  | boolean 
  | null 
  | undefined
  | Ref<string | number>
  | ReadonlyRef<string | number>
  | Getter<string | number>
  | Mountable<unknown>

declare global {
  namespace JSX {
    // 所有 HTML 元素的通用属性
    interface IntrinsicAttributes {
      key?: string | number
    }

    // 子元素类型
    type ElementChildrenAttribute = { children: NonNullable<unknown> }
    
    // HTML 元素属性接口
    interface HTMLAttributes {
      // 基础属性
      id?: PropValue<string>
      className?: PropValue<string>
      class?: PropValue<string>
      style?: PropValue<Record<string, string | number>>
      
      // 内容
      textContent?: PropValue<string | number>
      
      // 事件
      onClick?: (e: Event) => void
      onInput?: (e: Event) => void
      onKeyPress?: (e: Event) => void
      onChange?: (e: Event) => void
      onSubmit?: (e: Event) => void
      onFocus?: (e: Event) => void
      onBlur?: (e: Event) => void
      onMouseEnter?: (e: Event) => void
      onMouseLeave?: (e: Event) => void
      
      // 子元素 - 支持文本、数字、布尔值、响应式 ref、getter 函数、JSX 元素
      children?: ChildItem | ChildItem[]
    }

    // Input 元素特殊属性
    interface InputHTMLAttributes extends HTMLAttributes {
      type?: PropValue<string>
      value?: PropValue<string | number>
      placeholder?: PropValue<string>
      disabled?: PropValue<boolean>
      checked?: PropValue<boolean>
    }

    // Textarea 元素特殊属性
    interface TextareaHTMLAttributes extends HTMLAttributes {
      value?: PropValue<string>
      placeholder?: PropValue<string>
      rows?: PropValue<number>
      cols?: PropValue<number>
    }

    // Anchor 元素特殊属性
    interface AnchorHTMLAttributes extends HTMLAttributes {
      href?: PropValue<string>
      target?: PropValue<string>
      rel?: PropValue<string>
    }

    // Image 元素特殊属性
    interface ImgHTMLAttributes extends HTMLAttributes {
      src?: PropValue<string>
      alt?: PropValue<string>
      width?: PropValue<number | string>
      height?: PropValue<number | string>
    }

    // 内置 HTML 元素
    interface IntrinsicElements {
      // 常用元素
      div: HTMLAttributes
      span: HTMLAttributes
      p: HTMLAttributes
      button: HTMLAttributes
      input: InputHTMLAttributes
      textarea: TextareaHTMLAttributes
      a: AnchorHTMLAttributes
      img: ImgHTMLAttributes
      
      // 标题
      h1: HTMLAttributes
      h2: HTMLAttributes
      h3: HTMLAttributes
      h4: HTMLAttributes
      h5: HTMLAttributes
      h6: HTMLAttributes
      
      // 列表
      ul: HTMLAttributes
      ol: HTMLAttributes
      li: HTMLAttributes
      
      // 表单
      form: HTMLAttributes
      label: HTMLAttributes
      select: HTMLAttributes
      option: HTMLAttributes
      
      // 布局
      section: HTMLAttributes
      article: HTMLAttributes
      header: HTMLAttributes
      footer: HTMLAttributes
      nav: HTMLAttributes
      main: HTMLAttributes
      aside: HTMLAttributes
      
      // 文本格式
      code: HTMLAttributes
      pre: HTMLAttributes
      strong: HTMLAttributes
      em: HTMLAttributes
      small: HTMLAttributes
      
      // 其他
      svg: HTMLAttributes
      br: HTMLAttributes
      hr: HTMLAttributes
    }

    // JSX 元素类型
    type Element = Mountable<HTMLElement>
  }
}

export {}
