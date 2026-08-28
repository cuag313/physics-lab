/**
 * 数据面板 — 右侧显示仪器读数、I-V曲线、数据导出
 *
 * 新增功能：
 * - I-V曲线实时图表
 * - 数据采集（自动/手动记录）
 * - CSV一键导出
 * - 数据清除
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import IVChart from './IVChart'

export default function DataPanel({ instruments, circuitValid, selectedInstrument }) {
  const [dataPoints, setDataPoints] = useState([])
  const [autoRecord, setAutoRecord] = useState(false)
  const [recordInterval, setRecordInterval] = useState(1000) // ms
  const lastRecordRef = useRef(0)
  const intervalRef = useRef(null)

  // 电学仪器
  const meters = instruments.filter(i => i.type === 'ammeter' || i.type === 'voltmeter')
  const batteries = instruments.filter(i => i.type === 'battery')
  const bulbs = instruments.filter(i => i.type === 'bulb')
  const rheostats = instruments.filter(i => i.type === 'rheostat')
  // 光学仪器
  const lenses = instruments.filter(i => i.type === 'convexLens' || i.type === 'concaveLens')
  const sources = instruments.filter(i => i.type === 'lightSource')

  // 当前电路 V/I 读数
  const getCurrentReadings = useCallback(() => {
    const ammeter = instruments.find(i => i.type === 'ammeter')
    const voltmeter = instruments.find(i => i.type === 'voltmeter')
    const battery = instruments.find(i => i.type === 'battery')

    let V = voltmeter?.state?.reading ?? 0
    let I = ammeter?.state?.reading ?? 0

    // 如果没有仪表，用电池估算
    if (!voltmeter && battery) V = battery.voltage ?? battery.emf ?? 0
    if (!ammeter && battery) I = battery.current ?? 0

    return { V: Math.abs(V), I: Math.abs(I) }
  }, [instruments])

  // 手动记录
  const handleRecord = useCallback(() => {
    const { V, I } = getCurrentReadings()
    if (V < 0.001 && I < 0.0001) return // 忽略无效数据
    setDataPoints(prev => [...prev, { v: V, i: I, t: Date.now() }])
  }, [getCurrentReadings])

  // 自动记录
  useEffect(() => {
    if (autoRecord && circuitValid) {
      intervalRef.current = setInterval(() => {
        const { V, I } = getCurrentReadings()
        if (V > 0.001 || I > 0.0001) {
          setDataPoints(prev => {
            // 限制500个点
            const next = [...prev, { v: V, i: I, t: Date.now() }]
            return next.length > 500 ? next.slice(-500) : next
          })
        }
      }, recordInterval)
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [autoRecord, circuitValid, recordInterval, getCurrentReadings])

  // CSV导出
  const handleExportCSV = useCallback(() => {
    if (dataPoints.length === 0) return

    const header = '序号,电压(V),电流(A),时间戳\n'
    const rows = dataPoints.map((d, i) =>
      `${i + 1},${d.v.toFixed(4)},${d.i.toFixed(6)},${new Date(d.t).toISOString()}`
    ).join('\n')

    const csv = header + rows
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `实验数据_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [dataPoints])

  // 清除数据
  const handleClear = useCallback(() => {
    setDataPoints([])
  }, [])

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.headerIcon}>📊</span>
        <span style={styles.headerText}>数据面板</span>
        <span style={styles.dataCount}>{dataPoints.length}点</span>
      </div>

      {/* I-V曲线 */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>I-V 曲线</div>
        <IVChart
          data={dataPoints}
          width={190}
          height={140}
        />
        <div style={styles.chartControls}>
          <button style={styles.btn} onClick={handleRecord}>📌 记录</button>
          <button
            style={{
              ...styles.btn,
              background: autoRecord ? '#1a7f37' : '#21262d',
              color: autoRecord ? '#fff' : '#c9d1d9',
            }}
            onClick={() => setAutoRecord(!autoRecord)}
          >
            {autoRecord ? '⏸ 停止' : '▶ 自动'}
          </button>
          <button style={styles.btn} onClick={handleExportCSV} disabled={dataPoints.length === 0}>
            💾 CSV
          </button>
          <button style={{ ...styles.btn, color: '#f44336' }} onClick={handleClear}>
            🗑
          </button>
        </div>
        {autoRecord && (
          <div style={styles.recordIndicator}>
            <span style={styles.recordDot}>●</span>
            <span style={styles.recordText}>
              自动记录中 ({recordInterval / 1000}s)
            </span>
            <select
              style={styles.intervalSelect}
              value={recordInterval}
              onChange={e => setRecordInterval(Number(e.target.value))}
            >
              <option value={500}>0.5s</option>
              <option value={1000}>1s</option>
              <option value={2000}>2s</option>
              <option value={5000}>5s</option>
            </select>
          </div>
        )}
      </div>

      {/* 电路状态 */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>电路状态</div>
        <div style={{
          ...styles.statusBadge,
          background: circuitValid ? 'rgba(76,175,80,0.15)' : 'rgba(244,67,54,0.15)',
          color: circuitValid ? '#4CAF50' : '#f44336',
        }}>
          {circuitValid ? '✓ 电路正常' : '✗ 电路断开'}
        </div>
      </div>

      {/* 仪表读数 */}
      {meters.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>仪表读数</div>
          {meters.map(meter => (
            <div key={meter.id} style={styles.reading}>
              <span style={styles.meterLabel}>
                {meter.type === 'ammeter' ? 'Ⓐ' : 'Ⓥ'} {meter.displayName}
              </span>
              <span style={{
                ...styles.meterValue,
                color: meter.state.reading > 0 ? '#4CAF50' : '#484f58',
              }}>
                {meter.type === 'ammeter'
                  ? `${meter.state.reading.toFixed(3)} A`
                  : `${meter.state.reading.toFixed(2)} V`
                }
              </span>
            </div>
          ))}
        </div>
      )}

      {/* 电源信息 */}
      {batteries.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>电源</div>
          {batteries.map(bat => (
            <div key={bat.id} style={styles.reading}>
              <span style={styles.meterLabel}>🔋 {bat.displayName}</span>
              <span style={styles.meterValue}>
                {bat.emf}V / {bat.current.toFixed(3)}A
              </span>
            </div>
          ))}
        </div>
      )}

      {/* 灯泡状态 */}
      {bulbs.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>灯泡</div>
          {bulbs.map(bulb => (
            <div key={bulb.id} style={styles.reading}>
              <span style={styles.meterLabel}>💡 {bulb.displayName}</span>
              <span style={{
                ...styles.meterValue,
                color: bulb.state.brightness > 0.1 ? '#FFD700' : '#484f58',
              }}>
                {bulb.state.brightness > 0.05
                  ? `${(bulb.voltage * bulb.current).toFixed(2)}W · ${Math.round(bulb.state.brightness * 100)}%`
                  : '灭'
                }
              </span>
            </div>
          ))}
        </div>
      )}

      {/* 滑动变阻器 */}
      {rheostats.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>滑动变阻器</div>
          {rheostats.map(rh => (
            <div key={rh.id} style={styles.reading}>
              <span style={styles.meterLabel}>🔧 {rh.displayName}</span>
              <span style={styles.meterValue}>
                {rh.leftResistance.toFixed(1)}Ω / {rh.rightResistance.toFixed(1)}Ω
              </span>
            </div>
          ))}
        </div>
      )}

      {/* 选中仪器详情 */}
      {selectedInstrument && selectedInstrument.type !== 'wire' && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>
            {selectedInstrument.icon} {selectedInstrument.displayName} 参数
          </div>
          {Object.entries(selectedInstrument.params).map(([key, param]) => (
            <div key={key} style={styles.paramRow}>
              <span style={styles.paramLabel}>{param.label}</span>
              <span style={styles.paramValue}>
                {typeof param.value === 'number'
                  ? (param.value < 0.01 ? param.value.toExponential(1) : param.value.toFixed(2))
                  : param.value
                } {param.unit}
              </span>
            </div>
          ))}
          {selectedInstrument.type === 'switch' && (
            <div style={{ marginTop: 8 }}>
              <button
                onClick={() => {
                  selectedInstrument.toggle()
                  window.__labScene?.markDirty()
                  window.__labScene?.solve()
                }}
                style={{
                  padding: '6px 16px',
                  background: selectedInstrument.state.closed ? '#4CAF50' : '#f44336',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                  width: '100%',
                }}
              >
                {selectedInstrument.state.closed ? '🟢 已闭合 — 点击断开' : '🔴 已断开 — 点击闭合'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* 光学信息 */}
      {(sources.length > 0 || lenses.length > 0) && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>光学</div>
          {sources.map(s => (
            <div key={s.id} style={styles.reading}>
              <span style={styles.meterLabel}>🕯️ 光源</span>
              <span style={styles.meterValue}>{s.getParam('rayCount')}条 · {s.getParam('spread')}°</span>
            </div>
          ))}
          {lenses.map(l => (
            <div key={l.id} style={styles.reading}>
              <span style={styles.meterLabel}>{l.type === 'convexLens' ? '🔍' : '🔎'} {l.displayName}</span>
              <span style={styles.meterValue}>f={l.getParam('focalLength')}m</span>
            </div>
          ))}
        </div>
      )}

      {/* 使用说明 */}
      <div style={styles.footer}>
        <div style={styles.tip}>📌 点击「记录」保存当前V/I</div>
        <div style={styles.tip}>▶ 开启「自动」连续采集</div>
        <div style={styles.tip}>💾 点击「CSV」导出数据</div>
      </div>
    </div>
  )
}

const styles = {
  container: {
    width: 220,
    background: '#161b22',
    borderLeft: '1px solid #30363d',
    display: 'flex',
    flexDirection: 'column',
    overflowY: 'auto',
    userSelect: 'none',
  },
  header: {
    padding: '12px 14px',
    borderBottom: '1px solid #30363d',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  headerIcon: { fontSize: 18 },
  headerText: {
    fontSize: 14,
    fontWeight: 600,
    color: '#c9d1d9',
    flex: 1,
  },
  dataCount: {
    fontSize: 10,
    color: '#484f58',
    fontFamily: 'monospace',
  },
  section: {
    padding: '10px 14px',
    borderBottom: '1px solid #21262d',
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 600,
    color: '#8b949e',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  chartControls: {
    display: 'flex',
    gap: 4,
    marginTop: 6,
  },
  btn: {
    flex: 1,
    padding: '4px 0',
    background: '#21262d',
    color: '#c9d1d9',
    border: '1px solid #30363d',
    borderRadius: 4,
    fontSize: 10,
    cursor: 'pointer',
    textAlign: 'center',
  },
  recordIndicator: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    padding: '4px 6px',
    background: 'rgba(244, 67, 54, 0.1)',
    borderRadius: 4,
  },
  recordDot: {
    fontSize: 8,
    color: '#f44336',
    animation: 'blink 1s infinite',
  },
  recordText: {
    fontSize: 10,
    color: '#f44336',
    flex: 1,
  },
  intervalSelect: {
    background: '#0d1117',
    color: '#c9d1d9',
    border: '1px solid #30363d',
    borderRadius: 3,
    fontSize: 10,
    padding: '1px 4px',
    cursor: 'pointer',
  },
  statusBadge: {
    padding: '4px 10px',
    borderRadius: 4,
    fontSize: 12,
    fontWeight: 600,
    textAlign: 'center',
  },
  reading: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '3px 0',
  },
  meterLabel: {
    fontSize: 12,
    color: '#8b949e',
  },
  meterValue: {
    fontSize: 13,
    fontWeight: 600,
    fontFamily: 'monospace',
    color: '#c9d1d9',
  },
  paramRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '2px 0',
  },
  paramLabel: {
    fontSize: 11,
    color: '#8b949e',
  },
  paramValue: {
    fontSize: 12,
    fontWeight: 500,
    fontFamily: 'monospace',
    color: '#c9d1d9',
  },
  footer: {
    padding: '12px 14px',
    borderTop: '1px solid #30363d',
    marginTop: 'auto',
  },
  tip: {
    fontSize: 10,
    color: '#484f58',
    lineHeight: 1.6,
  },
}
