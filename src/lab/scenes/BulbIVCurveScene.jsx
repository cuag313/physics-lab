import { useState, useRef, useEffect, useCallback } from 'react'
import SceneShell from '../ui/SceneShell'
import { rowsToTable } from '../ui/DataRecorder'

/** BulbIVCurveScene — 描绘小灯泡的伏安特性曲线 */
export default function BulbIVCurveScene() {
  const canvasRef = useRef(null)
  const S = useRef({ U: 0, switchClosed: false, rows: [] })
  const [, forceUpdate] = useState(0)
  const [conclusionOpen, setConclusionOpen] = useState(false)

  const handleReset = useCallback(() => {
    S.current.U = 0
    S.current.switchClosed = false
    S.current.rows = []
    forceUpdate((n) => n + 1)
  }, [])

  useEffect(() => {
    const cvs = canvasRef.current
    if (!cvs) return
    const draw = () => {
      const rect = cvs.getBoundingClientRect()
      const dpr = devicePixelRatio || 1
      cvs.width = rect.width * dpr
      cvs.height = rect.height * dpr
      const ctx = cvs.getContext('2d')
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const W = rect.width
      const H = rect.height
      const s = S.current
      ctx.clearRect(0, 0, W, H)
      ctx.fillStyle = '#f0f4f8'
      ctx.fillRect(0, 0, W, H)

      // bulb resistance grows with temperature ~ R0(1+alpha T) ~ U-dependent
      const R = 8 + 2.2 * s.U // 非线性灯丝
      const I = s.switchClosed ? s.U / R : 0

      // left: simple circuit
      const bx = W * 0.18
      const by = H * 0.4
      ctx.strokeStyle = s.switchClosed ? '#1565C0' : '#999'
      ctx.lineWidth = 2.5
      ctx.strokeRect(bx - 70, by - 70, 140, 140)
      // bulb
      const glow = Math.min(1, I / 1.2)
      ctx.fillStyle = `rgba(255,193,7,${0.2 + glow * 0.8})`
      ctx.beginPath()
      ctx.arc(bx, by - 70, 16, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#333'
      ctx.font = '12px sans-serif'
      ctx.fillText(`U=${s.U.toFixed(1)}V  I=${I.toFixed(3)}A  R=${R.toFixed(1)}Ω`, 24, 28)

      // right: I-U graph
      const gx = W * 0.52
      const gy = 40
      const gw = W * 0.4
      const gh = H - 100
      ctx.strokeStyle = '#ccc'
      ctx.strokeRect(gx, gy, gw, gh)
      ctx.strokeStyle = '#4A90D9'
      ctx.lineWidth = 2
      ctx.beginPath()
      const rows = S.current.rows || []
      const maxU = 12
      const maxI = 1.2
      // theoretical curve
      for (let u = 0; u <= maxU; u += 0.25) {
        const r = 8 + 2.2 * u
        const ii = u / r
        const x = gx + (u / maxU) * gw
        const y = gy + gh - (ii / maxI) * gh
        if (u === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.globalAlpha = 0.35
      ctx.stroke()
      ctx.globalAlpha = 1

      // measured points
      for (const row of rows) {
        const x = gx + (row.U / maxU) * gw
        const y = gy + gh - (row.I / maxI) * gh
        ctx.fillStyle = '#E53935'
        ctx.beginPath()
        ctx.arc(x, y, 4, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.fillStyle = '#666'
      ctx.font = '11px sans-serif'
      ctx.fillText('I (A)', gx - 28, gy + 12)
      ctx.fillText('U (V)', gx + gw - 24, gy + gh + 16)
      ctx.fillText('曲线弯曲 → 灯丝电阻随温度升高', gx, gy - 12)
    }
    draw()
    const ro = new ResizeObserver(draw)
    ro.observe(cvs)
    return () => ro.disconnect()
  }, [])

  return (
    <SceneShell
      title="小灯泡的伏安特性曲线"
      showTabs={false}
      onReset={handleReset}
      toolbarExtra={(
        <>
          <label style={lab}>电压 U
            <input type="range" min="0" max="12" step="0.25" value={S.current.U}
              onChange={(e) => { S.current.U = +e.target.value; forceUpdate((n) => n + 1) }} style={sl} />
            <span style={val}>{S.current.U.toFixed(2)}V</span>
          </label>
          <button type="button" style={btn}
            onClick={() => { S.current.switchClosed = !S.current.switchClosed; forceUpdate((n) => n + 1) }}>
            {S.current.switchClosed ? '断开开关' : '闭合开关'}
          </button>
          <button type="button" style={btn}
            onClick={() => {
              if (!S.current.switchClosed) return
              const R = 8 + 2.2 * S.current.U
              S.current.rows = [...(S.current.rows || []), { U: S.current.U, I: S.current.U / R, R }]
              forceUpdate((n) => n + 1)
            }}>
            📝 记录
          </button>
        </>
      )}
      desc={<span>调节电压并记录 I-U 数据，点「查看结论」看曲线特征。</span>}
      conclusionOpen={conclusionOpen}
      onConclusionToggle={() => setConclusionOpen((o) => !o)}
      conclusion={{
        phenomenon: 'I-U 图像不是过原点的直线，电压越高曲线越“平”，说明灯丝电阻在增大。',
        dataRows: rowsToTable(S.current.rows || [], ['U', 'I', 'R']).slice(-8),
        formula: 'R = U / I（随温度升高而增大）',
        summary: '小灯泡是非线性元件：温度升高 → 电阻变大 → 伏安曲线弯曲。定值电阻才是线性元件。',
      }}
    >
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
    </SceneShell>
  )
}

const lab = { display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#666' }
const sl = { width: 100, accentColor: '#4A90D9' }
const val = { color: '#4A90D9', fontWeight: 600, minWidth: 52 }
const btn = { background: '#f0f0f0', border: '1px solid #ddd', borderRadius: 4, padding: '5px 10px', fontSize: 12, cursor: 'pointer' }
