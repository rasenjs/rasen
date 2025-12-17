/**
 * Geometry Pool - shares geometry data across instances
 */

export class GeometryPool {
  private static instance: GeometryPool | null = null
  private geometries = new Map<string, Float32Array>()

  private constructor() {}

  static getInstance(): GeometryPool {
    if (!GeometryPool.instance) {
      GeometryPool.instance = new GeometryPool()
    }
    return GeometryPool.instance
  }

  /**
   * Get or create geometry with given key and generator
   */
  getOrCreate(key: string, generator: () => Float32Array): Float32Array {
    let geometry = this.geometries.get(key)
    if (!geometry) {
      geometry = generator()
      this.geometries.set(key, geometry)
    }
    return geometry
  }

  /**
   * Get the number of cached geometries
   */
  getSize(): number {
    return this.geometries.size
  }

  /**
   * Clear all cached geometries
   */
  clear() {
    this.geometries.clear()
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      count: this.geometries.size,
      keys: Array.from(this.geometries.keys())
    }
  }
}
