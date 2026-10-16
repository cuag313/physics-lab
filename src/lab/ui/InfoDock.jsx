/**
 * InfoDock — 实验说明/目的/步骤的 HTML 信息坞
 *
 * 设计原则（电脑与手机兼顾）：
 * - 画布只画可交互的实验本体，不画大块说明框，避免遮挡操作
 * - 电脑：右侧常驻竖栏，不挡画布
 * - 手机横屏：收成右上角「说明」按钮，点开为半高抽屉；关闭时全屏给实验
 */
import { useState } from 'react'

export default function InfoDock({ purpose, steps, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <>
      <button
        type="button"
        className="info-dock-toggle"
        style={styles.toggle(open)}
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
      >
        {open ? '收起说明' : '说明'}
      </button>
      <aside className={`info-dock${open ? ' is-open' : ''}`} style={styles.dock(open)}>
        <div style={styles.dockHead}>
          <span style={styles.dockTitle}>实验说明</span>
          <button type="button" style={styles.close} onClick={() => setOpen(false)}>×</button>
        </div>
        <div style={styles.dockBody}>
          {purpose && (
            <section style={styles.block}>
              <h3 style={styles.h}>🎯 实验目的</h3>
              <p style={styles.p}>{purpose}</p>
            </section>
          )}
          {steps && steps.length > 0 && (
            <section style={styles.block}>
              <h3 style={styles.h}>📋 操作步骤</h3>
              <ol style={styles.ol}>
                {steps.map((s, i) => <li key={i} style={styles.li}>{s}</li>)}
              </ol>
            </section>
          )}
          {children}
        </div>
      </aside>
    </>
  )
}

const styles = {
  toggle: (open) => ({
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 30,
    border: '1px solid #c5daf0',
    background: open ? '#4A90D9' : 'rgba(255,255,255,0.92)',
    color: open ? '#fff' : '#1a5a8a',
    borderRadius: 14,
    padding: '6px 12px',
    fontSize: 12,
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
  }),
  dock: (open) => ({
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: 'min(320px, 86vw)',
    maxWidth: '100%',
    background: 'rgba(255,255,255,0.98)',
    borderLeft: '1px solid #d0d7de',
    boxShadow: '-4px 0 16px rgba(0,0,0,0.08)',
    zIndex: 25,
    display: 'flex',
    flexDirection: 'column',
    transform: open ? 'translateX(0)' : 'translateX(105%)',
    transition: 'transform 0.2s ease',
    pointerEvents: open ? 'auto' : 'none',
  }),
  dockHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    borderBottom: '1px solid #eee',
    flexShrink: 0,
  },
  dockTitle: { fontSize: 13, fontWeight: 700, color: '#333' },
  close: {
    border: 'none', background: 'transparent', fontSize: 20, cursor: 'pointer',
    color: '#666', lineHeight: 1, padding: 0, width: 28, height: 28,
  },
  dockBody: {
    overflow: 'auto',
    WebkitOverflowScrolling: 'touch',
    padding: '10px 12px 16px',
    fontSize: 12,
    color: '#444',
  },
  block: { marginBottom: 12 },
  h: { fontSize: 12, fontWeight: 700, color: '#1a5a8a', margin: '0 0 6px' },
  p: { margin: 0, lineHeight: 1.55 },
  ol: { margin: 0, paddingLeft: 18 },
  li: { marginBottom: 6, lineHeight: 1.5 },
}
