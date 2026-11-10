// 路径：D:\PythonProject\physics-lab\src\render\three-render.js
// Three.js 实验台骨架：labTableGroup + 立方体器材占位 + 阻尼旋转 + 滚轮缩放
// 依赖 vanila Three.js，经 index.html 的 importmap 解析 'three'（需先完成 importmap 配置）

import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

export class ThreeLab {
  constructor(container) {
    this.container = container
    this.disposed = false

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x11161d)

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000)
    this.camera.position.set(0, 6, 10)
    this.camera.lookAt(0, 0, 0)

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    // 3D 画布打标记，让 main.jsx 的触摸桥接跳过它
    this.renderer.domElement.setAttribute('data-three-lab', '1')
    container.appendChild(this.renderer.domElement)

    const hemi = new THREE.HemisphereLight(0xffffff, 0x223344, 1.1)
    this.scene.add(hemi)
    const dir = new THREE.DirectionalLight(0xffffff, 1.6)
    dir.position.set(6, 12, 8)
    dir.castShadow = true
    dir.shadow.mapSize.set(1024, 1024)
    this.scene.add(dir)

    // 顶层容器 labTableGroup：桌面、器材、导线全挂这
    this.labTableGroup = new THREE.Group()
    this.labTableGroup.name = 'labTableGroup'
    this.scene.add(this.labTableGroup)

    // 桌面平面
    const tableGeo = new THREE.BoxGeometry(10, 0.3, 8)
    const tableMat = new THREE.MeshStandardMaterial({ color: 0x2c3542, roughness: 0.85 })
    const tableTop = new THREE.Mesh(tableGeo, tableMat)
    tableTop.position.y = -0.15
    tableTop.receiveShadow = true
    this.labTableGroup.add(tableTop)

    this.TABLE_TOP_Y = 0 // 器材底面贴 y=0

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.enablePan = false
    this.controls.minDistance = 4
    this.controls.maxDistance = 30
    this.controls.minPolarAngle = 0.15
    this.controls.maxPolarAngle = Math.PI / 2 - 0.05
    this.controls.target.set(0, 1, 0)

    this.componentGroup = new THREE.Group()
    this.componentGroup.name = 'components'
    this.labTableGroup.add(this.componentGroup)
    this.components = new Map() // id -> { mesh, meta }

    this._onResize = this._onResize.bind(this)
    this._animate = this._animate.bind(this)
    window.addEventListener('resize', this._onResize)
    this._onResize()
    this._animate()
  }

  _onResize() {
    if (this.disposed) return
    const w = this.container.clientWidth || 1
    const h = this.container.clientHeight || 1
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h, false)
  }

  _animate() {
    if (this.disposed) return
    this._raf = requestAnimationFrame(this._animate)
    this.controls.update()
    this.renderer.render(this.scene, this.camera)
  }

  addComponentAt(meta, x = 0, z = 0) {
    const size = meta.size || { w: 1, h: 1, d: 1 }
    const geo = new THREE.BoxGeometry(size.w, size.h, size.d)
    const mat = new THREE.MeshStandardMaterial({
      color: meta.color != null ? meta.color : 0x58a6ff,
      roughness: 0.6,
      metalness: 0.05,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.castShadow = true
    mesh.position.set(x, this.TABLE_TOP_Y + size.h / 2, z)
    mesh.userData.meta = meta
    mesh.userData.isComponent = true
    this.componentGroup.add(mesh)
    this.components.set(meta.id, { mesh, meta })
    return mesh
  }

  rotateComponentY(id, rad) {
    const item = this.components.get(id)
    if (item) item.mesh.rotation.y = rad
  }

  removeComponent(id) {
    const item = this.components.get(id)
    if (!item) return
    this.componentGroup.remove(item.mesh)
    item.mesh.geometry.dispose()
    item.mesh.material.dispose()
    this.components.delete(id)
  }

  clearComponents() {
    ;[...this.components.keys()].forEach((id) => this.removeComponent(id))
  }

  dispose() {
    this.disposed = true
    cancelAnimationFrame(this._raf)
    window.removeEventListener('resize', this._onResize)
    this.controls.dispose()
    this.clearComponents()
    this.renderer.dispose()
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement)
    }
  }
}