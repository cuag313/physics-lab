import { useState, useRef, useEffect, useCallback } from 'react'
import SceneShell from '../ui/SceneShell'
import { rowsToTable } from '../ui/DataRecorder'

/**
 * VoltAmpereMethodHSScene — 高中：伏安法测电阻（内外接）
 * 对比电流表内接 / 外接的系统误差
 */
export default function VoltAmpereMethodHSScene() {
  const canvasRef = useRef(null)
  const S = useRef({ mode: 'outer', U: 2, Rx: 50, RA: 0.5, RV: 2000, switchClosed: false, rows: [] })
  const [, forceUpdate] = useState(0)
  const [conclusionOpen, setConclusionOpen] = useState(false)

  const handleReset = useCallback(() => {
    S.current.mode = 'outer'
    S.current.U = 2
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

      // measured values with systematic error
      let Umeas, Imeas, Rmeas
      if (!s.switchClosed) {
        Umeas = 0
        Imeas = 0
        Rmeas = 0
      } else if (s.mode === 'outer') {
        // 电流表外接：电压表测 Rx 电压准，电流表测 Ix+Iv 偏大 → R测偏小
        const Ix = s.U / s.Rx
        const Iv = s.U / s.RV
        Umeas = s.U
        Imeas = Ix + Iv
        Rmeas = Umeas / Imeas
      } else {
        // 内接：电流表测 Ix 准，电压表测 Ux+UA 偏大 → R测偏大
        const Ix = s.U / (s.Rx + s.RA)
        Umeas = Ix * (s.Rx + s.RA)
        Imeas = Ix
        Rmeas = Umeas / Imeas
      }

      const err = s.Rx > 0 && Rmeas > 0 ? ((Rmeas - s.Rx) / s.Rx) * 100 : 0

      // schematic
      const cx = W * 0.32
      const cy = H * 0.42
      ctx.strokeStyle = '#333'
      ctx.lineWidth = 2
      ctx.strokeRect(cx - 110, cy - 80, 220, 160)
      // Rx box
      ctx.fillStyle = '#FF9800'
      ctx.fillRect(cx - 30, cy - 14, 60, 28)
      ctx.fillStyle = '#fff'
      ctx.font = 'bold 12px sans-serif'
      ctx.fillText('Rx', cx - 10, cy + 5)
      ctx.fillStyle = '#1565C0'
      ctx.fillRect(cx - 100, cy - 14, 40, 28)
      ctx.fillStyle = '#fff'
      ctx.fillText('A', cx - 86, cy + 5)
      if (s.mode === 'outer') {
        ctx.fillStyle = '#4CAF50'
        ctx.fillRect(cx - 20, cy - 70, 40, 24)
      } else {
        ctx.fillStyle = '#4CAF50'
        ctx.fillRect(cx + 40, cy - 14, 36, 28)
      }
      ctx.fillStyle = '#fff'
      ctx.fillText('V', s.mode === 'outer' ? cx - 6 : cx + 52, s.mode === 'outer' ? cy - 53 : cy + 5)

      ctx.fillStyle = '#333'
      ctx.font = '13px sans-serif'
      ctx.fillText(s.mode === 'outer' ? '电流表外接（电压表并联在 Rx 两端）' : '电流表内接（电压表并联在 Rx+A 两端）', 24, 28)
      ctx.fillText(`真值 Rx = ${s.Rx}Ω   测量 R测 = ${Rmeas.toFixed(2)}Ω   误差 ${err.toFixed(2)}%`, 24, H - 40)
      ctx.fillText(`U测 = ${Umeas.toFixed(2)}V   I测 = ${Imeas.toFixed(3)}A`, 24, H - 18)
    }
    draw()
    const ro = new ResizeObserver(draw)
    ro.observe(cvs)
    return () => ro.disconnect()
  }, [])

  return (
    <SceneShell
      title="伏安法测电阻（内接/外接）"
      onTabChange={(t) => { S.current.mode = t === 1 ? 'outer' : 'inner'; forceUpdate((n) => n + 1) }}
      tab={S.current.mode === 'outer' ? 1 : 2}
      tab1Label="电流表外接"
      tab2Label="电流表内接"
      onReset={handleReset}
      toolbarExtra={(
        <>
          <label style={lab}>Rx
            <input type="range" min="5" max="200" step="1" value={S.current.Rx}
              onChange={(e) => { S.current.Rx = +e.target.value; forceUpdate((n) => n + 1) }} style={sl} />
            <span style={val}>{S.current.Rx}Ω</span>
          </label>
          <button type="button" style={btn}
            onClick={() => { S.current.switchClosed = !S.current.switchClosed; forceUpdate((n) => n + 1) }}>
            {S.current.switchClosed ? '断开' : '测量'}
          </button>
          <button type="button" style={btn}
            onClick={() => {
              if (!S.current.switchClosed) return
              const s = S.current
              let U, I
              if (s.mode === 'outer') {
                U = s.U
                I = s.U / s.Rx + s.U / s.RV
              } else {
                I = s.U / (s.Rx + s.RA)
                U = I * (s.Rx + s.RA)
              }
              S.current.rows = [...(S.current.rows || []), { U, I, R: U / I, mode: s.mode }]
              forceUpdate((n) => n + 1)
            }}>
            📝 记录
          </button>
        </>
      )}
      desc={<span>高中重点：选内接还是外接，要看待测电阻与电表内阻的相对大小。</span>}
      conclusionOpen={conclusionOpen}
      onConclusionToggle={() => setConclusionOpen((o) => !o)}
      conclusion={{
        phenomenon: '外接法电流偏大，测得电阻偏小；内接法电压偏大，测得电阻偏大。',
        dataRows: rowsToTable(S.current.rows || [], ['U', 'I', 'R', 'mode']).slice(-6),
        formula: '大内大，小外小',
        summary: '待测电阻较大（≫RA）用内接；较小（≪RV）用外接。也可用试触法比较两表变化幅度。',
      }}
    >
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
    </SceneShell>
  )
}

const lab = { display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#666' }
const sl = { width: 90, accentColor: '#4A90D9' }
const val = { color: '#4A90D9', fontWeight: 600, minWidth: 42 }
const btn = { background: '#f0f0f0', border: '1px solid #ddd', borderRadius: 4, padding: '5px 10px', fontSize: 12, cursor: 'pointer' }
