/**
 * InternalPanel — 「拆开看内部结构」浮层面板（交互层）
 *
 * DOM 覆盖层：内嵌一块小 canvas，调用 render/internals.js 画教学剖视图，
 * 旁边配部件图注。本层不认识电路拓扑、不做物理计算。
 * 标题栏可拖动（老师上课时可把它挪到一边对照实物讲）。
 */
import { useEffect, useRef, useState } from 'react'
import { drawInternal } from '../render/internals.js'

const PANEL_W = 460
const CANVAS_W = 320
const CANVAS_H = 250

export default function InternalPanel({ type, anchor, bounds, onClose }) {
  const cvRef = useRef(null)
  const [meta, setMeta] = useState(null)
  const [pos, setPos] = useState({ x: anchor?.x ?? 60, y: anchor?.y ?? 60 })
  const dragRef = useRef(null)

  // 画剖视图
  useEffect(() => {
    const cv = cvRef.current
    if (!cv) return
    const dpr = window.devicePixelRatio || 1
    cv.width = CANVAS_W * dpr
    cv.height = CANVAS_H * dpr
    const ctx = cv.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H)
    const m = drawInternal(ctx, CANVAS_W, CANVAS_H, type)
    setMeta(m)
  }, [type])

  // 标题栏拖动
  const onDown = (e) => {
    dragRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y }
    e.preventDefault()
  }
  useEffect(() => {
    const move = (e) => {
      const d = dragRef.current
      if (!d) return
      const vw = window.innerWidth, vh = window.innerHeight
      setPos({
        x: Math.max(4, Math.min(vw - PANEL_W - 4, e.clientX - d.dx)),
        y: Math.max(4, Math.min(vh - 120, e.clientY - d.dy)),
      })
    }
    const up = () => { dragRef.current = null }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    return () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
  }, [pos.x, pos.y])

  // 初始位置夹在画布内
  const bx = bounds?.w || window.innerWidth
  const by = bounds?.h || window.innerHeight
  const left = Math.max(6, Math.min(bx - PANEL_W - 6, pos.x))
  const top = Math.max(6, Math.min(by - 160, pos.y))

  return (
    <div
      style={{
        position: 'absolute', left, top, width: PANEL_W, zIndex: 55,
        background: 'rgba(24,28,34,0.97)', border: '1px solid rgba(255,255,255,0.13)',
        borderRadius: 12, boxShadow: '0 16px 40px rgba(0,0,0,0.5)', overflow: 'hidden',
        color: '#e6edf3',
      }}
    >
      {/* 标题栏（可拖动） */}
      <div
        onMouseDown={onDown}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, height: 36, padding: '0 12px',
          background: 'rgba(255,255,255,0.06)', cursor: 'move', userSelect: 'none',
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 700 }}>
          🔬 拆开看内部结构 — {meta?.title || ''}
        </span>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          onClick={onClose}
          style={{
            width: 24, height: 24, borderRadius: 6, border: 'none', cursor: 'pointer',
            background: 'rgba(255,255,255,0.10)', color: '#cbd5e1', fontSize: 13, lineHeight: '22px',
          }}
        >✕</button>
      </div>

      <div style={{ display: 'flex', gap: 10, padding: 12, alignItems: 'flex-start' }}>
        {/* 剖视图 */}
        <canvas
          ref={cvRef}
          style={{
            width: CANVAS_W, height: CANVAS_H, borderRadius: 8, flex: '0 0 auto',
            background: '#f4f6f8', border: '1px solid rgba(255,255,255,0.10)',
          }}
        />
        {/* 图注 */}
        <div style={{ flex: 1, minWidth: 0, maxHeight: CANVAS_H, overflowY: 'auto', paddingRight: 2 }}>
          <div style={{ fontSize: 11, color: '#93a3b5', marginBottom: 8, lineHeight: 1.5 }}>
            剖视图：外壳切开，露出内部结构。
          </div>
          {(meta?.parts || []).map((p, i) => (
            <div key={i} style={{ display: 'flex', gap: 7, marginBottom: 8, alignItems: 'flex-start' }}>
              <span
                style={{
                  width: 10, height: 10, borderRadius: 3, marginTop: 3, flex: '0 0 auto',
                  background: p.color, border: '1px solid rgba(255,255,255,0.22)',
                }}
              />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: '#e6edf3' }}>{p.name}</div>
                <div style={{ fontSize: 10.5, color: '#93a3b5', lineHeight: 1.45 }}>{p.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
