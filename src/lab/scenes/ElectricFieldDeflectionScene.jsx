import { useState, useRef, useEffect, useCallback } from 'react'
import SceneShell from '../ui/SceneShell'

/** ElectricFieldDeflectionScene — 带电粒子在电场中的偏转 */
export default function ElectricFieldDeflectionScene() {
  const canvasRef = useRef(null)
  const S = useRef({ U: 200, v0: 2.5, q: 1, m: 1 })
  const [, forceUpdate] = useState(0)
  const [conclusionOpen, setConclusionOpen] = useState(false)

  const handleReset = useCallback(() => {
    S.current.U = 200
    S.current.v0 = 2.5
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

      const plateTop = H * 0.28
      const plateBot = H * 0.72
      const plateL = W * 0.18
      const plateR = W * 0.72

      // plates
      ctx.fillStyle = '#546E7A'
      ctx.fillRect(plateL, plateTop, plateR - plateL, 8)
      ctx.fillRect(plateL, plateBot, plateR - plateL, 8)
      ctx.fillStyle = '#E53935'
      ctx.font = 'bold 14px sans-serif'
      ctx.fillText('+', plateL + 12, plateTop - 8)
      ctx.fillStyle = '#1565C0'
      ctx.fillText('−', plateL + 12, plateBot + 22)

      // field lines
      ctx.strokeStyle = 'rgba(33,150,243,0.25)'
      ctx.lineWidth = 1
      for (let i = 1; i < 10; i++) {
        const x = plateL + ((plateR - plateL) * i) / 10
        ctx.beginPath()
        ctx.moveTo(x, plateTop + 10)
        ctx.lineTo(x, plateBot - 2)
        ctx.stroke()
      }

      // trajectory: y = y0 + (qU/(2md v0^2)) x^2  (scaled)
      const y0 = (plateTop + plateBot) / 2
      const k = (s.U / 500) * (1 / Math.max(0.5, s.v0))
      ctx.strokeStyle = '#FF9800'
      ctx.lineWidth = 3
      ctx.beginPath()
      for (let t = 0; t <= 1.001; t += 0.02) {
        const x = plateL + t * (plateR - plateL + 40)
        const y = y0 + k * (t * t) * 90
        if (t === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
        if (y > plateBot - 4) break
      }
      ctx.stroke()

      // electron
      const xEnd = plateL + 0.55 * (plateR - plateL)
      const yEnd = y0 + k * 0.55 * 0.55 * 90
      ctx.fillStyle = '#333'
      ctx.beginPath()
      ctx.arc(xEnd, yEnd, 8, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.font = 'bold 10px sans-serif'
      ctx.fillText('e⁻', xEnd - 7, yEnd + 3)

      ctx.fillStyle = '#333'
      ctx.font = '13px sans-serif'
      ctx.fillText(`板间电压 U = ${s.U}V    初速度 v₀ = ${s.v0.toFixed(1)}`, 24, 28)
      ctx.fillText('偏转量 ∝ qU / (m v₀²)', 24, H - 18)
    }
    draw()
    const ro = new ResizeObserver(draw)
    ro.observe(cvs)
    return () => ro.disconnect()
  }, [])

  return (
    <SceneShell
      title="带电粒子在电场中的偏转"
      showTabs={false}
      onReset={handleReset}
      toolbarExtra={(
        <>
          <label style={lab}>电压 U
            <input type="range" min="50" max="500" step="10" value={S.current.U}
              onChange={(e) => { S.current.U = +e.target.value; forceUpdate((n) => n + 1) }} style={sl} />
            <span style={val}>{S.current.U}V</span>
          </label>
          <label style={lab}>初速度 v₀
            <input type="range" min="0.5" max="6" step="0.1" value={S.current.v0}
              onChange={(e) => { S.current.v0 = +e.target.value; forceUpdate((n) => n + 1) }} style={sl} />
            <span style={val}>{S.current.v0.toFixed(1)}</span>
          </label>
        </>
      )}
      desc={<span>电子以初速度水平射入平行板电场，轨迹近似抛物线。</span>}
      conclusionOpen={conclusionOpen}
      onConclusionToggle={() => setConclusionOpen((o) => !o)}
      conclusion={{
        phenomenon: '电压越大，电子偏转越明显；初速度越大，偏转越小。',
        formula: 'y ∝ qU / (m v₀²)',
        summary: '类平抛：水平匀速，竖直匀加速。示波管、粒子加速器都用到电场偏转。',
      }}
    >
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
    </SceneShell>
  )
}

const lab = { display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#666' }
const sl = { width: 90, accentColor: '#4A90D9' }
const val = { color: '#4A90D9', fontWeight: 600, minWidth: 48 }
