import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'

// ===== 全局触摸→鼠标事件桥接（让所有 canvas 场景自动支持触屏）=====
;(function() {
  function touchToMouse(e) {
    if (e.touches.length === 0) return
    const t = e.touches[0] || e.changedTouches[0]
    const typeMap = {
      touchstart: 'mousedown',
      touchmove: 'mousemove',
      touchend: 'mouseup',
    }
    const mouseEvent = new MouseEvent(typeMap[e.type], {
      bubbles: true,
      cancelable: true,
      clientX: t.clientX,
      clientY: t.clientY,
      button: 0,
    })
    e.target.dispatchEvent(mouseEvent)
    if (e.type !== 'touchmove') e.preventDefault()
  }
  document.addEventListener('touchstart', touchToMouse, { passive: false })
  document.addEventListener('touchmove', touchToMouse, { passive: false })
  document.addEventListener('touchend', touchToMouse, { passive: false })
  // 双击缩放禁止
  let lastTouch = 0
  document.addEventListener('touchend', (e) => {
    const now = Date.now()
    if (now - lastTouch < 300) e.preventDefault()
    lastTouch = now
  }, { passive: false })
})()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
