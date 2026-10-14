import { useState, useRef, useEffect, useCallback } from 'react'
import SceneShell from '../ui/SceneShell'

/** TotalInternalReflectionScene — 光的全反射 / 临界角 */
export default function TotalInternalReflectionScene() {
  const canvasRef = useRef(null)
  const S = useRef({ i: 50, n: 1.5 })
  const [, forceUpdate] = useState(0)
  const [conclusionOpen, setConclusionOpen] = useState(false)

  const handleReset = useCallback(() => {
    S.current.i = 50
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
      const oy = H * 0.5
      // denser medium on top (light comes from n>1)
      ctx.fillStyle = 'rgba(63,81,181,0.15)'
      ctx.fillRect(0, 0, W, oy)
      ctx.strokeStyle = '#3F51B5'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(40, oy)
      ctx.lineTo(W - 40, oy)
      ctx.stroke()
      ctx.fillStyle = '#555'
      ctx.font = '12px sans-serif'
      ctx.fillText(`介质 n = ${s.n.toFixed(2)}`, 48, 24)
      ctx.fillText('空气 n ≈ 1', 48, oy + 24)

      ctx.strokeStyle = '#999'
      ctx.setLineDash([6, 4])
      ctx.beginPath()
      ctx.moveTo(ox, oy - H * 0.38)
      ctx.lineTo(ox, oy + H * 0.38)
      ctx.stroke()
      ctx.setLineDash([])

      const iRad = (s.i * Math.PI) / 180
      const ic = Math.asin(Math.min(1, 1 / s.n))
      const icDeg = (ic * 180) / Math.PI
      const tir = iRad > ic

      const L = Math.min(W, H) * 0.3
      // incident from inside
      const ix = ox - Math.sin(iRad) * L
      const iy = oy - Math.cos(iRad) * L
      ctx.strokeStyle = '#E53935'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(ix, iy)
      ctx.lineTo(ox, oy)
      ctx.stroke()

      if (tir) {
        const rx = ox + Math.sin(iRad) * L
        const ry = oy - Math.cos(iRad) * L
        ctx.strokeStyle = '#FF9800'
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.moveTo(ox, oy)
        ctx.lineTo(rx, ry)
        ctx.stroke()
        ctx.fillStyle = '#E65100'
        ctx.font = 'bold 14px sans-serif'
        ctx.fillText('全反射！', ox + 16, oy - 20)
      } else {
        const sinR = s.n * Math.sin(iRad)
        const rRad = Math.asin(Math.min(1, sinR))
        const tx = ox + Math.sin(rRad) * L
        const ty = oy + Math.cos(rRad) * L
        ctx.strokeStyle = '#4CAF50'
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.moveTo(ox, oy)
        ctx.lineTo(tx, ty)
        ctx.stroke()
      }

      ctx.fillStyle = '#333'
      ctx.font = '13px sans-serif'
      ctx.fillText(`临界角 C = ${icDeg.toFixed(1)}°    当前 i = ${s.i}°`, 24, H - 20)
    }
    draw()
    const ro = new ResizeObserver(draw)
    ro.observe(cvs)
    return () => ro.disconnect()
  }, [])

  return (
    <SceneShell
      title="光的全反射"
      showTabs={false}
      onReset={handleReset}
      toolbarExtra={(
        <>
          <label style={lab}>入射角 i
            <input type="range" min="5" max="85" step="1" value={S.current.i}
              onChange={(e) => { S.current.i = +e.target.value; forceUpdate((n) => n + 1) }} style={sl} />
            <span style={val}>{S.current.i}°</span>
          </label>
          <label style={lab}>折射率 n
            <input type="range" min="1.2" max="2.4" step="0.05" value={S.current.n}
              onChange={(e) => { S.current.n = +e.target.value; forceUpdate((n) => n + 1) }} style={sl} />
            <span style={val}>{S.current.n.toFixed(2)}</span>
          </label>
        </>
      )}
      desc={<span>光从光密介质射向光疏介质。当入射角大于临界角时发生全反射。</span>}
      conclusionOpen={conclusionOpen}
      onConclusionToggle={() => setConclusionOpen((o) => !o)}
      conclusion={{
        phenomenon: '入射角较小时，界面同时有反射和折射；增大到临界角后，折射光消失，只有反射光。',
        formula: 'sin C = 1 / n',
        summary: '全反射条件：① 光从光密→光疏；② 入射角 ≥ 临界角 C。光纤、全反射棱镜都基于此。',
      }}
    >
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
    </SceneShell>
  )
}

const lab = { display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#666' }
const sl = { width: 90, accentColor: '#4A90D9' }
const val = { color: '#4A90D9', fontWeight: 600, minWidth: 40 }
