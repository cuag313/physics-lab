/**
 * InfoDock — 可折叠浮动气泡说明
 *
 * 手机/电脑一致：
 * - 收起：右侧一列小胶囊（实验目的 / 操作手册 / 提示）
 * - 点开：该条下拉成浮动卡片，其它条自动收起（手风琴）
 * - 不占侧栏，不挡电路；再点胶囊或 × 收起
 */
import { useState } from 'react'

function Bubble({ id, icon, title, open, onToggle, children }) {
  return (
    <div className={`info-bubble${open ? ' is-open' : ''}`} style={styles.wrap}>
      <button
        type="button"
        className="info-bubble-chip"
        style={styles.chip(open)}
        onClick={() => onToggle(id)}
        aria-expanded={open}
      >
        <span style={styles.chipIcon}>{icon}</span>
        <span>{title}</span>
        <span style={styles.chev}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="info-bubble-card" style={styles.card}>
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
  defaultOpen = null, // 'purpose' | 'steps' | 'hint' | null
}) {
  const [openId, setOpenId] = useState(defaultOpen)
  const toggle = (id) => setOpenId((cur) => (cur === id ? null : id))

  const items = []
  if (purpose) {
    items.push({
      id: 'purpose',
      icon: '🎯',
      title: purposeTitle,
      body: <p style={styles.p}>{purpose}</p>,
    })
  }
  if (steps && steps.length) {
    items.push({
      id: 'steps',
      icon: '📋',
      title: stepsTitle,
      body: (
        <ol style={styles.ol}>
          {steps.map((s, i) => (
            <li key={i} style={styles.li}>{s}</li>
          ))}
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
        <Bubble
          key={it.id}
          id={it.id}
          icon={it.icon}
          title={it.title}
          open={openId === it.id}
          onToggle={toggle}
        >
          {it.body}
        </Bubble>
      ))}
    </div>
  )
}

const styles = {
  rail: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 30,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 6,
    pointerEvents: 'none',
  },
  wrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    maxWidth: 'min(280px, 70vw)',
    pointerEvents: 'auto',
  },
  chip: (open) => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    border: '1px solid ' + (open ? '#4A90D9' : '#c5daf0'),
    background: open ? '#4A90D9' : 'rgba(255,255,255,0.94)',
    color: open ? '#fff' : '#1a5a8a',
    borderRadius: 16,
    padding: '5px 10px',
    fontSize: 11,
    fontWeight: 600,
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
    whiteSpace: 'nowrap',
    lineHeight: 1.2,
  }),
  chipIcon: { fontSize: 12 },
  chev: { fontSize: 9, opacity: 0.85, marginLeft: 2 },
  card: {
    marginTop: 4,
    background: 'rgba(255,255,255,0.98)',
    border: '1px solid #d0d7de',
    borderRadius: 10,
    boxShadow: '0 6px 20px rgba(0,0,0,0.14)',
    maxHeight: 'min(240px, 50vh)',
    overflow: 'auto',
    WebkitOverflowScrolling: 'touch',
    width: 'min(260px, 68vw)',
  },
  cardBody: {
    padding: '10px 12px',
    fontSize: 12,
    color: '#444',
    lineHeight: 1.55,
  },
  p: { margin: 0 },
  ol: { margin: 0, paddingLeft: 18 },
  li: { marginBottom: 5 },
}
