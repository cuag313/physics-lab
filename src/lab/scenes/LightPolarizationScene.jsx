import { useState, useRef, useEffect, useCallback } from 'react'
import SceneShell from '../ui/SceneShell'

/** LightPolarizationScene — 光的偏振 */
export default function LightPolarizationScene() {
  const canvasRef = useRef(null)
  const S = useRef({ angle: 45, polarizerOn: true, analyzerOn: true })
  const [, forceUpdate] = useState(0)
  const [conclusionOpen, setConclusionOpen] = useState(false)

  const handleReset = useCallback(() => {
    S.current.angle = 45
    S.current.polarizerOn = true
    S.current.analyzerOn = true
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

      const cy = H * 0.52
      const xs = [W * 0.12, W * 0.38, W * 0.62, W * 0.88]
      // light source
      ctx.fillStyle = '#FFC107'
      ctx.beginPath()
      ctx.arc(xs[0], cy, 18, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#333'
      ctx.font = '12px sans-serif'
      ctx.fillText('自然光', xs[0] - 18, cy + 36)

      const angle = (s.angle * Math.PI) / 180
      // intensity after two polarizers: I = I0 * cos^2(theta) if both on
      let intensity = 1
      if (s.polarizerOn && s.analyzerOn) intensity = Math.cos(angle) ** 2
      else if (s.polarizerOn || s.analyzerOn) intensity = 0.5

      // rays
      const drawRay = (x1, x2, alpha, color) => {
        ctx.strokeStyle = color
        ctx.globalAlpha = alpha
        ctx.lineWidth = 8
        ctx.beginPath()
        ctx.moveTo(x1, cy)
        ctx.lineTo(x2, cy)
        ctx.stroke()
        ctx.globalAlpha = 1
      }
      drawRay(xs[0] + 18, xs[1] - 8, 0.85, '#FFC107')
      drawRay(xs[1] + 8, xs[2] - 8, s.polarizerOn ? 0.55 : 0.85, '#FF9800')
      drawRay(xs[2] + 8, xs[3] - 8, Math.max(0.08, intensity), '#FF5722')

      // polarizer disks
      const drawDisk = (x, on, label) => {
        ctx.fillStyle = on ? 'rgba(33,150,243,0.85)' : 'rgba(150,150,150,0.35)'
        ctx.fillRect(x - 8, cy - 55, 16, 110)
        ctx.fillStyle = '#333'
        ctx.font = '11px sans-serif'
        ctx.fillText(label, x - 20, cy + 78)
      }
      drawDisk(xs[1], s.polarizerOn, '起偏器')
      drawDisk(xs[2], s.analyzerOn, '检偏器')

      // vibration direction for polarized light
      if (s.polarizerOn) {
        ctx.strokeStyle = '#1565C0'
        ctx.lineWidth = 2
        const mid = (xs[1] + xs[2]) / 2
        for (let i = -2; i <= 2; i++) {
          const y = cy + i * 14
          const dx = Math.cos(angle) * 12
          const dy = Math.sin(angle) * 12
          ctx.beginPath()
          ctx.moveTo(mid - dx, y - dy)
          ctx.lineTo(mid + dx, y + dy)
          ctx.stroke()
        }
        ctx.fillStyle = '#1565C0'
        ctx.fillText(`偏振方向 θ = ${s.angle}°`, mid - 40, cy - 80)
      }

      const bright = Math.round(40 + intensity * 200)
      ctx.fillStyle = `rgb(${bright},${bright},${bright})`
      ctx.beginPath()
      ctx.arc(xs[3], cy, 22, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#333'
      ctx.fillText('出射光强', xs[3] - 22, cy + 40)
      ctx.font = 'bold 13px sans-serif'
      ctx.fillText(`I/I₀ = ${intensity.toFixed(3)}`, 24, 28)
      ctx.font = '12px sans-serif'
      ctx.fillText('马吕斯定律：I = I₀ cos²θ', 24, 48)
    }
    draw()
    const ro = new ResizeObserver(draw)
    ro.observe(cvs)
    return () => ro.disconnect()
  }, [])

  return (
    <SceneShell
      title="光的偏振"
      showTabs={false}
      onReset={handleReset}
      toolbarExtra={(
        <>
          <label style={lab}>夹角 θ
            <input type="range" min="0" max="90" step="1" value={S.current.angle}
              onChange={(e) => { S.current.angle = +e.target.value; forceUpdate((n) => n + 1) }} style={sl} />
            <span style={val}>{S.current.angle}°</span>
          </label>
          <button type="button" style={btn} onClick={() => { S.current.polarizerOn = !S.current.polarizerOn; forceUpdate((n) => n + 1) }}>
            起偏器 {S.current.polarizerOn ? '开' : '关'}
          </button>
          <button type="button" style={btn} onClick={() => { S.current.analyzerOn = !S.current.analyzerOn; forceUpdate((n) => n + 1) }}>
            检偏器 {S.current.analyzerOn ? '开' : '关'}
          </button>
        </>
      )}
      desc={<span>自然光经起偏器后成为线偏振光；旋转检偏器，观察出射光强变化。</span>}
      conclusionOpen={conclusionOpen}
      onConclusionToggle={() => setConclusionOpen((o) => !o)}
      conclusion={{
        phenomenon: '只放一块偏振片时光强约一半；再放检偏器并旋转，θ=0° 最亮，θ=90° 最暗（消光）。',
        formula: 'I = I₀ cos²θ',
        summary: '光是横波。两偏振片透振方向平行时透光最强，垂直时几乎完全消光。',
      }}
    >
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
    </SceneShell>
  )
}

const lab = { display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#666' }
const sl = { width: 90, accentColor: '#4A90D9' }
const val = { color: '#4A90D9', fontWeight: 600, minWidth: 40 }
const btn = { background: '#f0f0f0', border: '1px solid #ddd', borderRadius: 4, padding: '5px 10px', fontSize: 12, cursor: 'pointer' }
