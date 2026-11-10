import { useState, useEffect, useRef } from 'react'
import LabPage from './lab/LabPage'
// 新增：导入之前创建的3D渲染模块，路径与你项目结构完全匹配
import { ThreeLab } from './render/three-render.js'

function App() {
  // 约定默认加载原版2D Canvas，完全不改变用户进入体验
  const [viewMode, setViewMode] = useState('2d')
  // 3D容器引用，用于ThreeLab挂载画布
  const threeRootRef = useRef(null)
  // 3D实例单例，避免重复创建渲染器
  const threeLabInstance = useRef(null)

  // 3D生命周期管理：幂等、自动销毁，无内存泄漏
  useEffect(() => {
    // 不在3D模式/容器未就绪时，直接跳过初始化
    if (viewMode !== '3d' || !threeRootRef.current) {
      return () => {
        // 切换出3D模式时，安全销毁旧实例
        threeLabInstance.current?.dispose()
        threeLabInstance.current = null
      }
    }

    // 创建ThreeLab实例，自动生成顶层labTableGroup
    threeLabInstance.current = new ThreeLab(threeRootRef.current)

    // ========== 【预留对接接口，不侵入你的core模块】 ==========
    // 后续只需把你scene-store里的器材列表透传给3D模块即可，场景JSON格式完全复用：
    // const componentsFromStore = window.__YOUR_EXISTING_SCENE_STORE__.getAllComponents()
    // componentsFromStore.forEach(comp => {
    //   threeLabInstance.current.addComponentAt(
    //     {
    //       id: comp.id,
    //       kind: comp.type,
    //       color: YOUR_COMPONENT_REGISTRY[comp.type].color,
    //       size: YOUR_COMPONENT_REGISTRY[comp.type].size,
    //     },
    //     comp.position.x,
    //     comp.position.z
    //   )
    // })
    // ========================================================

    // 清理函数：切回2D/组件卸载时，销毁Three.js资源
    return () => {
      threeLabInstance.current?.dispose()
      threeLabInstance.current = null
    }
  }, [viewMode])

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
      {/* 新增模式切换条：悬浮在全局右上角，不侵入LabPage原有导航栏布局 */}
      <div style={{
        position: 'fixed', top: 12, right: 16, zIndex: 9999,
        background: 'rgba(0,0,0,0.65)', padding: '8px 12px', borderRadius: 8,
        backdropFilter: 'blur(6px)', display: 'flex', gap: 8, alignItems: 'center'
      }}>
        <span style={{ color: '#fff', fontSize: 13 }}>
          {viewMode === '2d' ? '平面画布' : '3D实验台'}
        </span>
        <button
          onClick={() => setViewMode(viewMode === '2d' ? '3d' : '2d')}
          style={{
            border: 'none', borderRadius: 6, padding: '4px 12px',
            background: '#2563eb', color: '#fff', cursor: 'pointer', fontSize: 13
          }}
        >
          切换视图
        </button>
      </div>

      {/* 原有2D电学实验室完整保留，仅在2D模式下渲染 */}
      <div style={{ display: viewMode === '2d' ? 'block' : 'none', width: '100%', height: '100%' }}>
        <LabPage />
      </div>

      {/* 3D实验台根容器：仅在3D模式下挂载，给ThreeLab渲染画布用 */}
      <div
        ref={threeRootRef}
        id="three-lab-root"
        style={{
          display: viewMode === '3d' ? 'block' : 'none',
          width: '100%', height: '100%'
        }}
      />
    </div>
  )
}

export default App