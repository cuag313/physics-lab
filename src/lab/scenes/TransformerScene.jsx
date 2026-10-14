import { useState, useRef, useEffect, useCallback } from 'react'
import SceneShell from '../ui/SceneShell'

/** TransformerScene — 变压器原理 */
export default function TransformerScene() {
  const canvasRef = useRef(null)
  const S = useRef({ U1: 220, n1: 400, n2: 100, f: 50 })
  const [, forceUpdate] = useState(0)
  const [conclusionOpen, setConclusionOpen] = useState(false)

  const handleReset = useCallback(() => {
    S.current.U1 = 220
    S.current.n1 = 400
    S.current.n2 = 100
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

      const cx = W * 0.5
      const cy = H * 0.48
      // core
      ctx.strokeStyle = '#5D4037'
      ctx.lineWidth = 10
      ctx.strokeRect(cx - 70, cy - 90, 140, 180)

      // primary coil
      ctx.strokeStyle = '#1565C0'
      ctx.lineWidth = 3
      for (let i = 0; i < 6; i++) {
        const y = cy - 70 + i * 12
        ctx.beginPath()
        ctx.ellipse(cx - 95, y, 14, 8, 0, 0, Math.PI * 2)
        ctx.stroke()
      }
      // secondary
      ctx.strokeStyle = '#E53935'
      for (let i = 0; i < 6; i++) {
        const y = cy - 70 + i * 12
        ctx.beginPath()
        ctx.ellipse(cx + 95, y, 14, 8, 0, 0, Math.PI * 2)
        ctx.stroke()
      }

      const U2 = s.U1 * (s.n2 / s.n1)
      ctx.fillStyle = '#333'
      ctx.font = 'bold 13px sans-serif'
      ctx.fillText(`原线圈 n₁=${s.n1}  U₁=${s.U1}V`, 24, 32)
      ctx.fillText(`副线圈 n₂=${s.n2}  U₂=${U2.toFixed(1)}V`, 24, 54)
      ctx.font = '14px sans-serif'
      ctx.fillStyle = '#1565C0'
      ctx.fillText(`U₁/U₂ = n₁/n₂ = ${(s.n1 / s.n2).toFixed(2)}`, cx - 80, cy + 120)
      ctx.fillStyle = '#666'
      ctx.font = '12px sans-serif'
      ctx.fillText('理想变压器：U₂ = U₁ · n₂/n₁', 24, H - 18)

      // load bulb brightness
      const bright = Math.min(1, U2 / 50)
      ctx.fillStyle = `rgba(255,193,7,${0.25 + bright * 0.75})`
      ctx.beginPath()
      ctx.arc(cx + 160, cy, 18, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#333'
      ctx.font = '11px sans-serif'
      ctx.fillText('负载', cx + 145, cy + 36)
    }
    draw()
    const ro = new ResizeObserver(draw)
    ro.observe(cvs)
    return () => ro.disconnect()
  }, [])

  return (
    <SceneShell
      title="变压器原理"
      showTabs={false}
      onReset={handleReset}
      toolbarExtra={(
        <>
          <label style={lab}>U₁
            <input type="range" min="12" max="220" step="1" value={S.current.U1}
              onChange={(e) => { S.current.U1 = +e.target.value; forceUpdate((n) => n + 1) }} style={sl} />
            <span style={val}>{S.current.U1}V</span>
          </label>
          <label style={lab}>n₁
            <input type="range" min="50" max="800" step="10" value={S.current.n1}
              onChange={(e) => { S.current.n1 = +e.target.value; forceUpdate((n) => n + 1) }} style={sl} />
            <span style={val}>{S.current.n1}</span>
          </label>
          <label style={lab}>n₂
            <input type="range" min="50" max="800" step="10" value={S.current.n2}
              onChange={(e) => { S.current.n2 = +e.target.value; forceUpdate((n) => n + 1) }} style={sl} />
            <span style={val}>{S.current.n2}</span>
          </label>
        </>
      )}
      desc={<span>改变原副线圈匝数比，观察副线圈电压如何变化。</span>}
      conclusionOpen={conclusionOpen}
      onConclusionToggle={() => setConclusionOpen((o) => !o)}
      conclusion={{
        phenomenon: '副线圈匝数越多，输出电压越高；匝数比不变时，改变原边电压，输出同比例变化。',
        formula: 'U₁ / U₂ = n₁ / n₂',
        summary: '理想变压器只改变电压，不消耗能量。n₂ > n₁ 为升压，n₂ < n₁ 为降压。',
      }}
    >
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
    </SceneShell>
  )
}

const lab = { display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#666' }
const sl = { width: 80, accentColor: '#4A90D9' }
const val = { color: '#4A90D9', fontWeight: 600, minWidth: 42 }
