import type { TweenRef, SpringRef, TweenOptions, SpringOptions } from './types'

type AnimationItem = 
  | [TweenRef, number, TweenOptions]
  | [SpringRef, number, SpringOptions?]

export function all(items: AnimationItem[]): Promise<void[]> {
  return Promise.all(
    items.map(([ref, target, options]) => ref.to(target, options as TweenOptions))
  )
}
