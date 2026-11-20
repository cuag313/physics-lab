/* 临时海报入口：只画 3D 电动机机芯（给 Tab2 剖面图离线截图用），不参与产品路由 */
import { createRoot } from 'react-dom/client'
import Motor3D from './Motor3D.jsx'

const STATE = { theta: 0.42, switchClosed: true, iNow: 0.6, I: 0.6, commutator: true, field: true }
const getState = () => STATE

/* 机芯在页面设计坐标里占 x∈[120,464]、y∈[129,402]。
   取 384×325（≈200:169）的窗口，上下各留一点：顶 19、底 33（底部留白正好接导线） */
const CUT = { x: 100, y: 110, w: 384, h: 325 }

createRoot(document.getElementById('stage')).render(
  <Motor3D sc={1} ox={0} oy={0} vw={800} vh={730} cx={292} cy={244} getState={getState} cut={CUT} bare />
)
