/* 临时入口：把「电路演示」那台 3D 电动机按 parts 拆开渲染（给 Tab2 卡片用）
   ?parts=stator → 只画不动的（极靴/字母/电刷/底座/接线柱），出一张底图
   ?parts=rotor&theta=… → 只画转的（轴/单匝线圈/换向片），出 24 帧序列
   窗口 392×331（≈ 卡 200×169 的比例），盖住整机：x 96..488、y 120..451。 */
import { createRoot } from 'react-dom/client'
import Motor3D from './Motor3D.jsx'

const q = new URLSearchParams(location.search)
const theta = Number(q.get('theta') || 0)
const on = q.get('on') !== '0'
const parts = q.get('parts') || 'all'

const STATE = {
  theta,
  switchClosed: on,
  iNow: on ? 0.6 : 0,
  I: on ? 0.6 : 0,
  commutator: true,
  field: true,
}
const getState = () => STATE

const WIN = { x: 96, y: 120, w: 392, h: 331 }

createRoot(document.getElementById('stage')).render(
  <Motor3D sc={1} ox={0} oy={0} vw={800} vh={730} cx={292} cy={244} getState={getState} cut={WIN} parts={parts} />
)
