import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// ===== 触摸桥接：让 canvas 的 mousedown/move/up 在手机上可用 =====
// 注意：touchend 时 e.touches 为空，必须用 changedTouches；
// 不要全局 preventDefault，否则目录无法滚动、按钮点击会被吞掉。
;(function () {
  const TYPE_MAP = {
    touchstart: 'mousedown',
    touchmove: 'mousemove',
    touchend: 'mouseup',
    touchcancel: 'mouseup',
  }

  function firstTouch(e) {
    return (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0])
  }

  function isCanvasTarget(target) {
    if (!target || !target.closest) return false
    return !!target.closest('canvas')
  }

  function touchToMouse(e) {
    const t = firstTouch(e)
    if (!t) return

    const type = TYPE_MAP[e.type]
    if (!type) return

    const mouseEvent = new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: t.clientX,
      clientY: t.clientY,
      button: 0,
      buttons: type === 'mouseup' ? 0 : 1,
    })
    e.target.dispatchEvent(mouseEvent)

    // 只在 canvas 交互时阻止默认滚动，目录页保留系统滚动
    if (isCanvasTarget(e.target) && e.type !== 'touchend' && e.type !== 'touchcancel') {
      e.preventDefault()
    }
  }

  document.addEventListener('touchstart', touchToMouse, { passive: false })
  document.addEventListener('touchmove', touchToMouse, { passive: false })
  document.addEventListener('touchend', touchToMouse, { passive: false })
  document.addEventListener('touchcancel', touchToMouse, { passive: false })
})()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
