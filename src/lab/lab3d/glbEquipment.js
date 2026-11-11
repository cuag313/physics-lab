/**
 * glbEquipment.js — 加载 Blender 导出的器材模型（GLB）。
 *
 * 用途：形体复杂的器材（电表楔形壳、滑变瓷管绕线、电动机皮带轮）用 Blender 建模，
 * 导出 GLB 放到 public/assets/models/，运行时按需加载；动态件（指针、闸刀、滑片）
 * 仍由代码挂在模型上，物理接口不变。
 *
 * 坐标约定：Blender 里 +Z 上、正面朝 -Y；glTF 转换后正面朝 +Z，与 three 场景一致，
 * 所以载入后不需要翻轴，只需要确保底面对齐 y=0。
 */
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

const BASE = '/physics-lab/assets/models/'
const loader = new GLTFLoader()
const ready = new Map() // type -> THREE.Group（已载入）
const pending = new Map() // type -> Promise

/** 某件模型是否已就绪（同步判断，给 buildSolid 用） */
export function gearReady(type) {
  return ready.get(type) || null
}

/** 预加载（不会抛错；失败时静默回退到代码几何） */
export function preloadGear(type) {
  if (ready.has(type)) return Promise.resolve(ready.get(type))
  if (pending.has(type)) return pending.get(type)
  const p = new Promise((resolve) => {
    loader.load(
      BASE + type + '.glb',
      (gltf) => {
        const g = gltf.scene
        g.traverse((o) => {
          if (o.isMesh) {
            o.castShadow = true
            o.receiveShadow = true
            if (o.material) o.material.side = 2 // DoubleSide：剖视时也能看到内壁
            // 多份副本共用几何与贴图：标记后 renderer 的 dispose 循环会跳过它们
            if (o.geometry) o.geometry.userData.sharedGeo = true
            const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []
            for (const m of mats) {
              if (m.map) m.map.userData.sharedPhoto = true
            }
          }
        })
        ready.set(type, g)
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('gear-ready', { detail: { type } }))
        }
        resolve(g)
      },
      undefined,
      () => resolve(null)
    )
  })
  pending.set(type, p)
  return p
}

/** 取一份可挂进场景的副本（模型可被多件器材复用，必须 clone） */
export function cloneGear(type) {
  const src = ready.get(type)
  if (!src) return null
  const c = src.clone(true)
  c.traverse((o) => {
    if (o.isMesh && o.material) o.material = o.material.clone()
  })
  return c
}
