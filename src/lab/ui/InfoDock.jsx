/**
 * InfoDock — 图标气泡（悬停/点按显示标题）
 * 收起：一列小图标；点开：下拉卡片；同时只开一个
 */
import { useState } from 'react'

function Chip({ id, icon, title, open, onToggle, children }) {
  const [peek, setPeek] = useState(false)
  return (
    <div className={`info-bubble${open ? ' is-open' : ''}`} style={styles.wrap}>
      <button
        type="button"
        className="info-bubble-chip"
        style={styles.chip(open)}
        onClick={() => onToggle(id)}
        onMouseEnter={() => setPeek(true)}
        onMouseLeave={() => setPeek(false)}
        onFocus={() => setPeek(true)}
        onBlur={() => setPeek(false)}
        onTouchStart={() => setPeek(true)}
        aria-expanded={open}
        aria-label={title}
        title={title}
      >
        <span style={styles.icon}>{icon}</span>
        <span style={styles.label}>{open || peek ? title : title.slice(0, 1)}</span>
      </button>
      {open && (
        <div className="info-bubble-card" style={styles.card}>
          <div style={styles.cardHead}>
            <span style={styles.cardTitle}>{title}</span>
            <button type="button" style={styles.x} onClick={() => onToggle(id)} aria-label="收起">×</button>
          </div>
          <div style={styles.cardBody}>{children}</div>
        </div>
      )}
    </div>
  )
}

export default function InfoDock({
  purpose,
  purposeTitle = '实验目的',
  steps,
  stepsTitle = '操作手册',
  hint,
  hintTitle = '提示',
  children,
  defaultOpen = null,
}) {
  const [openId, setOpenId] = useState(defaultOpen)
  const toggle = (id) => setOpenId((cur) => (cur === id ? null : id))

  const items = []
  if (purpose) {
    items.push({ id: 'purpose', icon: '🎯', title: purposeTitle, body: <p style={styles.p}>{purpose}</p> })
  }
  if (steps && steps.length) {
    items.push({
      id: 'steps',
      icon: '📋',
      title: stepsTitle,
      body: (
        <ol style={styles.ol}>
          {steps.map((s, i) => <li key={i} style={styles.li}>{s}</li>)}
        </ol>
      ),
    })
  }
  const extra = hint || children
  if (extra) {
    items.push({
      id: 'hint',
      icon: '💡',
      title: hintTitle,
      body: typeof extra === 'string' ? <p style={styles.p}>{extra}</p> : extra,
    })
  }
  if (!items.length) return null

  return (
    <div className="info-bubbles" style={styles.rail}>
      {items.map((it) => (
        <Chip key={it.id} id={it.id} icon={it.icon} title={it.title} open={openId === it.id} onToggle={toggle}>
          {it.body}
        </Chip>
      ))}
    </div>
  )
}

const styles = {
  rail: {
    position: 'absolute',
    right: 4,
    top: 4,
    zIndex: 30,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 8,
    pointerEvents: 'none',
  },
  wrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    pointerEvents: 'auto',
  },
  chip: (open) => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 2,
    border: '1px solid ' + (open ? '#4A90D9' : '#c5daf0'),
    background: open ? '#4A90D9' : 'rgba(255,255,255,0.95)',
    color: open ? '#fff' : '#1a5a8a',
    borderRadius: 18,
    padding: '8px 6px',
    minWidth: 42,
    justifyContent: 'flex-start',
    cursor: 'pointer',
    boxShadow: '0 2px 10px rgba(0,0,0,0.16)',
    overflow: 'hidden',
    transition: 'min-width 0.15s ease, background 0.15s',
    whiteSpace: 'nowrap',
    lineHeight: 1,
  }),
  icon: { fontSize: 15, flexShrink: 0 },
  label: {
    fontSize: 11,
    fontWeight: 700,
    maxWidth: 80,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  card: {
    marginTop: 6,
    background: 'rgba(255,255,255,0.98)',
    border: '1px solid #d0d7de',
    borderRadius: 12,
    boxShadow: '0 8px 24px rgba(0,0,0,0.16)',
    maxHeight: 'min(220px, 46vh)',
    overflow: 'auto',
    WebkitOverflowScrolling: 'touch',
    width: 'min(260px, 72vw)',
  },
  cardHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 10px 4px',
    position: 'sticky',
    top: 0,
    background: 'rgba(255,255,255,0.98)',
  },
  cardTitle: { fontSize: 12, fontWeight: 700, color: '#1a5a8a' },
  x: {
    border: 'none', background: 'transparent', fontSize: 18, cursor: 'pointer',
    color: '#666', width: 28, height: 28, lineHeight: 1,
  },
  cardBody: { padding: '4px 12px 12px', fontSize: 12, color: '#444', lineHeight: 1.55 },
  p: { margin: 0 },
  ol: { margin: 0, paddingLeft: 18 },
  li: { marginBottom: 5 },
}
