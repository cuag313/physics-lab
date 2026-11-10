/**
 * ComponentParamPanel — 元件参数面板（交互层）
 *
 * 双击画布上的元件弹出，直接改「电源电压 / 电阻阻值 / 变阻器接入阻值 / 电表量程」。
 * 设计取舍：
 *   · 参数写进 S.current.components[i].props，不动数据模型（引擎已经按 props 取值）
 *   · 面板是 DOM，不是画在 canvas 上 —— 输入框可聚焦、可用键盘、可无障碍操作
 *   · 深色玻璃卡片，和实验桌面的视觉语言一致
 */
import { METER_SCALES } from '../render/needle.js'

const PANEL_W = 196

/** 每种元件的参数表：{label, key, min, max, step, unit, presets?} */
function fieldsFor(comp) {
  const p = comp.props || {}
  switch (comp.type) {
    case 'battery':
      return [
        { label: '电源电压', key: 'voltage', min: 1, max: 12, step: 0.5, unit: 'V', value: p.voltage ?? 3, presets: [1.5, 3, 4.5, 6] },
      ]
    case 'resistor':
      return [
        { label: '定值阻值', key: 'resistance', min: 1, max: 100, step: 1, unit: 'Ω', value: p.resistance ?? 10, presets: [5, 10, 15, 20] },
      ]
    case 'bulb':
      return [
        { label: '灯丝电阻', key: 'resistance', min: 5, max: 40, step: 1, unit: 'Ω', value: p.resistance ?? 10 },
        { label: '额定电压', key: 'ratedV', min: 1.5, max: 6, step: 0.5, unit: 'V', value: p.ratedV ?? 2.5 },
      ]
    case 'rheostat':
      return [
        { label: '接入阻值', key: 'resistance', min: 0, max: 50, step: 1, unit: 'Ω', value: p.resistance ?? 20, presets: [0, 10, 20, 50] },
      ]
    case 'switch':
      return []
    default:
      return []
  }
}

/** 电表量程档位 */
function rangesFor(comp) {
  if (comp.type === 'ammeter') return METER_SCALES.ammeter.map((s) => s.range)
  if (comp.type === 'voltmeter') return METER_SCALES.voltmeter.map((s) => s.range)
  return []
}

export default function ComponentParamPanel({ comp, anchor, bounds, onChange, onDelete, onClose }) {
  if (!comp) return null
  const fields = fieldsFor(comp)
  const ranges = rangesFor(comp)
  const hasSwitch = comp.type === 'switch'
  const rows = fields.length + (ranges.length ? 1 : 0) + (hasSwitch ? 1 : 0)
  const H = 62 + rows * 46

  // 贴着元件弹出，但始终夹在画布内
  const w = bounds?.w || 320
  const h = bounds?.h || 400
  const left = Math.max(6, Math.min(w - PANEL_W - 6, (anchor?.x ?? 0) + 34))
  const top = Math.max(6, Math.min(h - H - 6, (anchor?.y ?? 0) - H / 2))

  const title = {
    battery: '电源', resistor: '定值电阻', bulb: '小灯泡',
    rheostat: '滑动变阻器', switch: '开关', ammeter: '电流表', voltmeter: '电压表',
    multimeter: '万用表',
  }[comp.type] || '元件'

  return (
    <div style={{ ...styles.panel, left, top, width: PANEL_W }} onMouseDown={(e) => e.stopPropagation()}>
      <div style={styles.head}>
        <span style={styles.title}>{title}</span>
        <button type="button" style={styles.close} onClick={onClose} title="关闭">✕</button>
      </div>

      {fields.map((f) => (
        <div key={f.key} style={styles.row}>
          <div style={styles.rowHead}>
            <span style={styles.label}>{f.label}</span>
            <span style={styles.value}>
              {formatNum(f.value)}
              <span style={styles.unit}>{f.unit}</span>
            </span>
          </div>
          <input
            type="range"
            min={f.min}
            max={f.max}
            step={f.step}
            value={f.value}
            style={styles.range}
            onChange={(e) => onChange(comp, f.key, parseFloat(e.target.value))}
          />
          {f.presets && (
            <div style={styles.presetRow}>
              {f.presets.map((v) => (
                <button
                  key={v}
                  type="button"
                  style={{ ...styles.preset, ...(Math.abs(v - f.value) < 1e-6 ? styles.presetOn : null) }}
                  onClick={() => onChange(comp, f.key, v)}
                >
                  {v}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}

      {ranges.length > 0 && (
        <div style={styles.row}>
          <div style={styles.rowHead}>
            <span style={styles.label}>量程</span>
            <span style={styles.hint}>超量程指针打表</span>
          </div>
          <div style={styles.presetRow}>
            {ranges.map((r) => (
              <button
                key={r}
                type="button"
                style={{ ...styles.preset, ...(Math.abs(r - (comp.props?.range ?? ranges[0])) < 1e-6 ? styles.presetOn : null) }}
                onClick={() => onChange(comp, 'range', r)}
              >
                0~{r}
                {comp.type === 'ammeter' ? 'A' : 'V'}
              </button>
            ))}
          </div>
        </div>
      )}

      {hasSwitch && (
        <div style={styles.row}>
          <div style={styles.rowHead}>
            <span style={styles.label}>通断</span>
          </div>
          <button
            type="button"
            style={{ ...styles.toggle, background: comp.closed === false ? '#3a2226' : '#1f3a2c', color: comp.closed === false ? '#ff9d95' : '#7ce8b0' }}
            onClick={() => onChange(comp, '__closed', comp.closed === false)}
          >
            {comp.closed === false ? '断开（点击闭合）' : '闭合（点击断开）'}
          </button>
        </div>
      )}

      <div style={styles.foot}>
        <button type="button" style={styles.del} onClick={onDelete}>删除元件</button>
      </div>
    </div>
  )
}

function formatNum(v) {
  if (!Number.isFinite(v)) return '--'
  return Number.isInteger(v) ? String(v) : v.toFixed(1)
}

const styles = {
  panel: {
    position: 'absolute',
    zIndex: 20,
    background: 'rgba(23, 29, 34, 0.96)',
    border: '1px solid rgba(120, 160, 200, 0.35)',
    borderRadius: 10,
    boxShadow: '0 10px 28px rgba(0,0,0,0.55)',
    padding: '8px 10px 10px',
    color: '#cfdae4',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    backdropFilter: 'blur(6px)',
  },
  head: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 6,
  },
  title: { fontSize: 12, fontWeight: 700, color: '#e8f1f8' },
  close: {
    border: 'none', background: 'transparent', color: '#8fa3b3',
    fontSize: 13, cursor: 'pointer', padding: 0, lineHeight: 1,
  },
  row: { marginBottom: 8 },
  rowHead: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' },
  label: { fontSize: 11, color: '#9fb3c4' },
  value: {
    fontSize: 13, fontWeight: 700, color: '#7cc4ff',
    fontFamily: 'ui-monospace, Consolas, monospace',
  },
  unit: { fontSize: 10, marginLeft: 1, color: '#6e8ba3' },
  hint: { fontSize: 9, color: '#71889b' },
  range: { width: '100%', accentColor: '#4A90D9', margin: '2px 0 0' },
  presetRow: { display: 'flex', gap: 4, marginTop: 5, flexWrap: 'wrap' },
  preset: {
    flex: '1 1 auto', minWidth: 34, padding: '4px 6px',
    fontSize: 10, fontWeight: 600, cursor: 'pointer',
    background: 'rgba(255,255,255,0.06)',
    color: '#a8bccd',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 6,
  },
  presetOn: {
    background: 'rgba(74,144,217,0.28)',
    color: '#dceeff',
    border: '1px solid rgba(74,144,217,0.85)',
  },
  toggle: {
    width: '100%', padding: '7px 8px', marginTop: 4,
    fontSize: 11, fontWeight: 600, cursor: 'pointer',
    border: '1px solid rgba(255,255,255,0.12)', borderRadius: 7,
  },
  foot: { display: 'flex', justifyContent: 'flex-end', marginTop: 2 },
  del: {
    padding: '5px 10px', fontSize: 11, cursor: 'pointer',
    background: 'rgba(255,82,82,0.14)', color: '#ff9d95',
    border: '1px solid rgba(255,82,82,0.45)', borderRadius: 7,
  },
}
