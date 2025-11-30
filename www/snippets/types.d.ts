declare module '*?raw' {
  const content: string
  export default content
}

declare module '@snippets' {
  export const counterDom: string
  export const counterRn: string
  export const todoDom: string
  export const canvasBasic: string
  export const canvasAnimation: string
  export const basicDom: string
  export const ssrHtml: string
  export const jsxCounter: string
}

declare module '@snippets/*' {
  const content: string
  export default content
}
