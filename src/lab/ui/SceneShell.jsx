/**
 * SceneShell — 实验场景统一外壳
 *
 * 提炼自各 *Scene 自己拼的顶栏/底栏：
 *   标题 + 模式 Tab + 重置 + 可选控件 + 画布 + 可选说明条
 *
 * 目的：
 * 1. 交互一致（魔兔式：演示 / 自己动手 / 重置 固定位置）
 * 2. 新场景只写画布物理，不再复制顶栏
 * 3. 步骤与说明尽量走 DOM，便于移动端点击与缩放
 */

import ConclusionCard from './ConclusionCard'

export default function SceneShell({
  title,
  tab = 1,
  onTabChange,
  tab1Label = '📊 实验演示',
  tab2Label = '🔧 自己动手',
  showTabs = true,
  onReset,
  resetLabel = '↺ 重置',
  toolbarExtra = null,
  desc = null,
  purpose = null,
  footer = null,
  // 结论卡片（可选）
  conclusion = null,
  conclusionOpen = false,
  onConclusionToggle,
  children,
}) {
  return (
    <div className="scene-shell" style={styles.container}>
      <div style={styles.toolbar}>
        <span style={styles.title}>{title}</span>
        <div style={styles.actions}>
          {showTabs && onTabChange && (
            <>
              <button
                type="button"
                style={tab === 1 ? styles.tabA : styles.tab}
                onClick={() => onTabChange(1)}
              >
                {tab1Label}
              </button>
              <button
                type="button"
                style={tab === 2 ? styles.tabA : styles.tab}
                onClick={() => onTabChange(2)}
              >
                {tab2Label}
              </button>
            </>
          )}
          {toolbarExtra && (
            <div
              className="scene-toolbar-extra"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                flexWrap: 'wrap',
                minWidth: 0,
              }}
            >
              {toolbarExtra}
            </div>
          )}
          <div style={{ flex: 1 }} />
          {onReset && (
            <button type="button" style={styles.btn} onClick={onReset}>
              {resetLabel}
            </button>
          )}
        </div>
      </div>

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

      {desc && <div style={styles.desc}>{desc}</div>}
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
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  toolbar: {
    minHeight: 44,
    background: '#f5f5f5',
    borderBottom: '1px solid #ccc',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 12px',
    flexShrink: 0,
    flexWrap: 'wrap',
    gap: 6,
  },
  title: {
    fontSize: 14,
    fontWeight: 600,
    color: '#333',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: 'min(40vw, 220px)',
    flexShrink: 0,
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
    flex: 1,
    minWidth: 0,
  },
  tab: {
    background: '#f0f0f0',
    color: '#666',
    border: '1px solid #ddd',
    borderRadius: 4,
    padding: '5px 12px',
    fontSize: 12,
    cursor: 'pointer',
  },
  tabA: {
    background: '#4A90D9',
    color: '#fff',
    border: '1px solid #4A90D9',
    borderRadius: 4,
    padding: '5px 12px',
    fontSize: 12,
    cursor: 'pointer',
    fontWeight: 600,
  },
  btn: {
    background: '#f0f0f0',
    color: '#333',
    border: '1px solid #ddd',
    borderRadius: 4,
    padding: '5px 12px',
    fontSize: 12,
    cursor: 'pointer',
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
  // canvas 子元素在手机上由 .scene-canvas-fill 控高
  desc: {
    padding: '8px 14px',
    background: '#f5f5f5',
    borderTop: '1px solid #ccc',
    fontSize: 13,
    color: '#333',
    flexShrink: 0,
  },
}
