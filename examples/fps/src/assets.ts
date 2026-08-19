/**
 * Asset loader — loads all Kenney FPS models, textures, and sounds.
 *
 * Models are loaded via the glTF/GLB loader into rasen MeshGeometry.
 * Textures are loaded as Image elements.
 * Sounds are loaded as HTMLAudioElement (OGG format).
 */

import { loadGLB, type LoadedGLTF } from '@rasenjs/webgl'

export interface FPSAssets {
  models: Map<string, LoadedGLTF>
  textures: Map<string, HTMLImageElement>
  sounds: Map<string, HTMLAudioElement>
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`))
    img.src = url
  })
}

function loadSound(url: string): HTMLAudioElement {
  const audio = new Audio(url)
  audio.preload = 'auto'
  return audio
}

export async function loadFPSAssets(
  onProgress?: (msg: string) => void,
): Promise<FPSAssets> {
  onProgress?.('Loading 3D models...')

  // Load ONE shared colormap texture and reuse it for every model. Sharing
  // the same Image object means the batch renderer groups all textured meshes
  // into a single draw call, which keeps depth ordering correct between
  // models (e.g. enemies vs. platforms) — otherwise separate draw groups can
  // be depth-culled in the wrong order.
  const sharedColormap = await loadImage('/models/Textures/colormap.png')
  
  const models = await loadGLBAssets([
    { name: 'grass', url: '/models/grass.glb', textureUrl: '/models/Textures/colormap.png' },
    { name: 'grass-small', url: '/models/grass-small.glb', textureUrl: '/models/Textures/colormap.png' },
    { name: 'wall-high', url: '/models/wall-high.glb', textureUrl: '/models/Textures/colormap.png' },
    { name: 'wall-low', url: '/models/wall-low.glb', textureUrl: '/models/Textures/colormap.png' },
    { name: 'platform', url: '/models/platform.glb', textureUrl: '/models/Textures/colormap.png' },
    { name: 'platform-large-grass', url: '/models/platform-large-grass.glb', textureUrl: '/models/Textures/colormap.png' },
    { name: 'cloud', url: '/models/cloud.glb', textureUrl: '/models/Textures/colormap.png' },
    { name: 'enemy-flying', url: '/models/enemy-flying.glb', textureUrl: '/models/Textures/colormap.png' },
    { name: 'blaster', url: '/models/blaster.glb', textureUrl: '/models/Textures/colormap.png' },
    { name: 'blaster-repeater', url: '/models/blaster-repeater.glb', textureUrl: '/models/Textures/colormap.png' },
  ], (loaded, total) => onProgress?.(`Models: ${loaded}/${total}`), sharedColormap)

  onProgress?.('Loading textures...')
  const textures = new Map<string, HTMLImageElement>()
  const texList = [
    ['skybox', '/skybox.png'],
    ['crosshair', '/crosshair.png'],
    ['crosshair-repeater', '/crosshair-repeater.png'],
    ['burst', '/burst.png'],
    ['hit', '/hit.png'],
    ['blob_shadow', '/blob_shadow.png'],
  ]
  for (const [name, url] of texList) {
    textures.set(name, await loadImage(url))
  }

  onProgress?.('Loading sounds...')
  const sounds = new Map<string, HTMLAudioElement>()
  const soundList = [
    'blaster', 'blaster_repeater', 'enemy_attack', 'enemy_destroy',
    'enemy_hurt', 'jump_a', 'jump_b', 'jump_c', 'land', 'walking', 'weapon_change',
  ]
  for (const name of soundList) {
    sounds.set(name, loadSound(`/sounds/${name}.ogg`))
  }

  onProgress?.('Ready!')
  return { models, textures, sounds }
}

async function loadGLBAssets(
  assets: Array<{ name: string; url: string; textureUrl?: string }>,
  onProgress?: (loaded: number, total: number) => void,
  sharedTexture?: HTMLImageElement,
): Promise<Map<string, LoadedGLTF>> {
  const result = new Map<string, LoadedGLTF>()
  let loaded = 0
  for (const a of assets) {
    result.set(a.name, await loadGLB(a.url, a.textureUrl, sharedTexture))
    loaded++
    onProgress?.(loaded, assets.length)
  }
  return result
}
