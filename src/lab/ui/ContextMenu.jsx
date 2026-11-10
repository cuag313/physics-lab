/**
 * ContextMenu — 画布右键菜单（交互层）
 *
 * 挂在画布外的 DOM 浮层：本层只负责「在某处弹一列可点的条目」，
 * 不认识电路拓扑。条目由调用方给出（拆开看内部 / 复制 / 删除 …）。
 * 点击菜单外任意处或按 Esc 关闭。
 */
import { useEffect, useRef } from 'react'

const MENU_W = 148

export default function ContextMenu({ x, y, items, onClose }) {
  const ref = useRef(null)

  useEffect(() => {
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  if (!items || !items.length) return null

  // 夹在视口内，避免贴边溢出
  const vw = window.innerWidth, vh = window.innerHeight
  const h = items.length * 32 + 8
  const left = Math.max(6, Math.min(vw - MENU_W - 6, x))
  const top = Math.max(6, Math.min(vh - h - 6, y))

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed', left, top, width: MENU_W, zIndex: 60,
        background: 'rgba(28,32,38,0.97)', border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 10, padding: '4px 0', boxShadow: '0 10px 28px rgba(0,0,0,0.42)',
      }}
    >
      {items.map((it, i) => (
        <button
          key={i}
          type="button"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => { onClose(); it.onClick?.() }}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, width: '100%', height: 32,
            padding: '0 12px', border: 'none', background: 'transparent', cursor: 'pointer',
            color: it.danger ? '#ff8a80' : '#e6edf3', fontSize: 12.5, textAlign: 'left',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = it.danger ? 'rgba(255,82,82,0.18)' : 'rgba(120,170,255,0.16)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
        >
          <span style={{ width: 16, textAlign: 'center', opacity: 0.85 }}>{it.icon || ''}</span>
          <span>{it.label}</span>
        </button>
      ))}
    </div>
  )
}
