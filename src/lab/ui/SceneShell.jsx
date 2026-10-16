/**
 * SceneShell — 实验场景统一外壳
 * 手机横屏分行：Tab 一行 · 控件一行 · 重置一行，演示区尽量大
 */
import ConclusionCard from './ConclusionCard'

export default function SceneShell({
  title,
  tab = 1,
  onTabChange,
  tab1Label = '实验演示',
  tab2Label = '自己动手',
  showTabs = true,
  onReset,
  resetLabel = '重置',
  toolbarExtra = null,
  desc = null,
  purpose = null,
  footer = null,
  conclusion = null,
  conclusionOpen = false,
  onConclusionToggle,
  children,
}) {
  return (
    <div className="scene-shell" style={styles.container}>
      {/* 行1：标题 + 重置 */}
      <div className="scene-bar scene-bar-head" style={styles.bar}>
        <span style={styles.title}>{title}</span>
        <div style={{ flex: 1 }} />
        {onReset && (
          <button type="button" className="scene-btn" style={styles.btn} onClick={onReset}>
            {resetLabel}
          </button>
        )}
      </div>

      {/* 行2：Tab 独占一行 */}
      {showTabs && onTabChange && (
        <div className="scene-bar scene-bar-tabs" style={styles.bar}>
          <button
            type="button"
            className={`scene-tab${tab === 1 ? ' is-on' : ''}`}
            style={tab === 1 ? styles.tabA : styles.tab}
            onClick={() => onTabChange(1)}
          >
            {tab1Label}
          </button>
          <button
            type="button"
            className={`scene-tab${tab === 2 ? ' is-on' : ''}`}
            style={tab === 2 ? styles.tabA : styles.tab}
            onClick={() => onTabChange(2)}
          >
            {tab2Label}
          </button>
        </div>
      )}

      {/* 行3：参数控件独占一行 */}
      {toolbarExtra && (
        <div className="scene-bar scene-bar-extra" style={styles.bar}>
          <div className="scene-toolbar-extra" style={styles.extra}>
            {toolbarExtra}
          </div>
        </div>
      )}

      {purpose && <div style={styles.purpose}>{purpose}</div>}

      <div className="scene-main" style={styles.main}>
        {children}
        {conclusion && (
          <ConclusionCard
            open={conclusionOpen}
            onToggle={onConclusionToggle}
            onReset={onReset}
            {...conclusion}
          />
        )}
      </div>

      {desc && <div className="scene-desc" style={styles.desc}>{desc}</div>}
      {footer}
    </div>
  )
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    minHeight: 0,
    background: '#f0f4f8',
    color: '#333',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  bar: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '4px 10px',
    background: '#f5f5f5',
    borderBottom: '1px solid #ddd',
    flexShrink: 0,
    minHeight: 36,
    flexWrap: 'wrap',
  },
  title: {
    fontSize: 13,
    fontWeight: 600,
    color: '#333',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: '55%',
  },
  extra: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
    minWidth: 0,
    width: '100%',
  },
  tab: {
    flex: 1,
    background: '#fff',
    color: '#555',
    border: '1px solid #d0d7de',
    borderRadius: 8,
    padding: '8px 10px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    minHeight: 36,
  },
  tabA: {
    flex: 1,
    background: '#4A90D9',
    color: '#fff',
    border: '1px solid #4A90D9',
    borderRadius: 8,
    padding: '8px 10px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    minHeight: 36,
  },
  btn: {
    background: '#fff',
    color: '#333',
    border: '1px solid #d0d7de',
    borderRadius: 8,
    padding: '6px 14px',
    fontSize: 12,
    cursor: 'pointer',
    minHeight: 32,
    flexShrink: 0,
  },
  purpose: {
    padding: '6px 14px',
    background: '#eef6ff',
    borderBottom: '1px solid #c5daf0',
    fontSize: 12,
    color: '#1a5a8a',
    flexShrink: 0,
  },
  main: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
    minHeight: 0,
    position: 'relative',
  },
  desc: {
    padding: '6px 12px',
    background: '#f5f5f5',
    borderTop: '1px solid #ccc',
    fontSize: 12,
    color: '#333',
    flexShrink: 0,
  },
}
