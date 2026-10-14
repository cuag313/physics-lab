import { useState, useRef, useEffect, useCallback } from 'react'
import SceneShell from '../ui/SceneShell'

/**
 * RefractionLawScene — 光的折射定律
 * 入射角 i / 折射角 r，验证 n = sin i / sin r
 */
export default function RefractionLawScene() {
  const canvasRef = useRef(null)
  const S = useRef({ i: 40, n: 1.5, showNormal: true })
  const [, forceUpdate] = useState(0)
  const [conclusionOpen, setConclusionOpen] = useState(false)

  const handleReset = useCallback(() => {
    S.current.i = 40
    S.current.n = 1.5
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

      const ox = W * 0.5
      const oy = H * 0.48
      // media
      ctx.fillStyle = 'rgba(33,150,243,0.12)'
      ctx.fillRect(0, oy, W, H - oy)
      ctx.strokeStyle = '#1565C0'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(40, oy)
      ctx.lineTo(W - 40, oy)
      ctx.stroke()
      ctx.fillStyle = '#555'
      ctx.font = '12px sans-serif'
      ctx.fillText('空气 n₁ ≈ 1', 48, oy - 12)
      ctx.fillText(`介质 n₂ = ${s.n.toFixed(2)}`, 48, oy + 22)

      // normal
      if (s.showNormal) {
        ctx.strokeStyle = '#999'
        ctx.setLineDash([6, 4])
        ctx.beginPath()
        ctx.moveTo(ox, oy - H * 0.35)
        ctx.lineTo(ox, oy + H * 0.35)
        ctx.stroke()
        ctx.setLineDash([])
      }

      const iRad = (s.i * Math.PI) / 180
      const sinR = Math.sin(iRad) / s.n
      const rRad = Math.asin(Math.min(1, sinR))
      const rDeg = (rRad * 180) / Math.PI

      // incident ray
      const L = Math.min(W, H) * 0.32
      const ix = ox - Math.sin(iRad) * L
      const iy = oy - Math.cos(iRad) * L
      ctx.strokeStyle = '#E53935'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(ix, iy)
      ctx.lineTo(ox, oy)
      ctx.stroke()
      // arrow
      ctx.fillStyle = '#E53935'
      ctx.beginPath()
      ctx.arc(ox - Math.sin(iRad) * L * 0.55, oy - Math.cos(iRad) * L * 0.55, 4, 0, Math.PI * 2)
      ctx.fill()

      // reflected ray
      const rx = ox + Math.sin(iRad) * L * 0.7
      const ry = oy - Math.cos(iRad) * L * 0.7
      ctx.strokeStyle = '#FF9800'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(ox, oy)
      ctx.lineTo(rx, ry)
      ctx.stroke()

      // refracted ray
      const tx = ox + Math.sin(rRad) * L
      const ty = oy + Math.cos(rRad) * L
      ctx.strokeStyle = '#4CAF50'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(ox, oy)
      ctx.lineTo(tx, ty)
      ctx.stroke()

      // angles
      ctx.fillStyle = '#E53935'
      ctx.font = 'bold 13px sans-serif'
      ctx.fillText(`i = ${s.i.toFixed(0)}°`, ox - 70, oy - 28)
      ctx.fillStyle = '#4CAF50'
      ctx.fillText(`r = ${rDeg.toFixed(1)}°`, ox + 12, oy + 36)
      ctx.fillStyle = '#333'
      ctx.font = '13px sans-serif'
      ctx.fillText(`sin i / sin r = ${(Math.sin(iRad) / Math.sin(rRad)).toFixed(3)}`, 24, 28)
    }
    draw()
    const ro = new ResizeObserver(draw)
    ro.observe(cvs)
    return () => ro.disconnect()
  }, [])

  return (
    <SceneShell
      title="光的折射定律"
      showTabs={false}
      onReset={handleReset}
      toolbarExtra={(
        <>
          <label style={sLabel}>入射角 i
            <input type="range" min="5" max="80" step="1" value={S.current.i}
              onChange={(e) => { S.current.i = +e.target.value; forceUpdate((n) => n + 1) }} style={sSlider} />
            <span style={sVal}>{S.current.i}°</span>
          </label>
          <label style={sLabel}>折射率 n
            <input type="range" min="1.1" max="2.4" step="0.05" value={S.current.n}
              onChange={(e) => { S.current.n = +e.target.value; forceUpdate((n) => n + 1) }} style={sSlider} />
            <span style={sVal}>{S.current.n.toFixed(2)}</span>
          </label>
        </>
      )}
      desc={<span>红光入射 · 橙光反射 · 绿光折射。拖动滑块改变入射角和介质折射率。</span>}
      conclusionOpen={conclusionOpen}
      onConclusionToggle={() => setConclusionOpen((o) => !o)}
      conclusion={{
        phenomenon: '光从空气斜射入介质时，折射光线向法线偏折；入射角越大，折射角也越大。',
        formula: 'n = sin i / sin r',
        summary: '当入射角增大时，sin i / sin r 保持不变，等于介质相对折射率。光垂直入射时方向不变。',
      }}
    >
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
    </SceneShell>
  )
}

const sLabel = { display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#666' }
const sSlider = { width: 90, accentColor: '#4A90D9' }
const sVal = { color: '#4A90D9', fontWeight: 600, minWidth: 40 }
