import LabPage from './lab/LabPage'

/**
 * 应用入口。
 *
 * 这里原先有一个全局悬浮的「平面画布 / 3D 实验台」切换条，挂的是
 * render/three-render.js 里的 ThreeLab —— 那套只有一个空台面，从来没有
 * 被喂过器材（addComponentAt 无调用方），点过去就是"一张空桌子、没有仪器、
 * 没有物理"。而它覆盖在所有场景页面上，会把用户从真正可用的
 * 「电学虚拟实验室」内部的「🧊 3D 实验台」引到死路上，故移除。
 *
 * 3D 视图的唯一入口：场景内的 ElectricSvgLabScene 顶部切换按钮。
 */
function App() {
  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <LabPage />
    </div>
  )
}

export default App
