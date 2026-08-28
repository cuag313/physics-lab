import { useRef, useEffect, useState } from 'react'

/**
 * BernoulliPrincipleScene — 流体压强与流速关系
 *
 * 初中八年级物理 · 伯努利原理初步
 *
 * 核心规律：在流体中，流速越大的位置，压强越小
 *
 * 应用：
 * - 飞机升力（机翼上下表面流速差）
 * - 喷雾器
 * - 列车安全线
 * - 两张纸吹气靠拢
 */

export default function BernoulliPrincipleScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)

  const [mode, setMode] = useState('pipe')      // 'pipe' | 'wing' | 'paper'
  const [flowSpeed, setFlowSpeed] = useState(0) // 0~100
  const [narrowRatio, setNarrowRatio] = useState(40) // 管道狭窄处占比 10~80%

  const stateRef = useRef({
    particles: [],
    phase: 0,
    paperAngle: 0,   // 两张纸的角度
    targetPaperAngle: 0,
  })

  // 初始化粒子
  useEffect(() => {
    const ps = []
    for (let i = 0; i < 60; i++) {
      ps.push({
        x: Math.random(),
        y: 0.2 + Math.random() * 0.6,
        speed: 0.003 + Math.random() * 0.004,
        baseY: 0,
      })
    }
    stateRef.current.particles = ps
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let W = 0, H = 0

    function resize() {
      const rect = canvas.getBoundingClientRect()
      const dpr = devicePixelRatio || 1
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      W = rect.width
      H = rect.height
    }
    resize()

    const loop = () => {
      const s = stateRef.current
      s.phase += 0.01

      // 更新粒子（关键：速度与截面成反比，保持密度均匀）
      s.particles.forEach(p => {
        // 计算当前位置的管道高度比例
        const narrowScale = narrowRatio / 100
        const dist = Math.abs(p.x - 0.5) * 2
        const localScale = dist < 0.3 ? narrowScale : dist < 0.6 ? narrowScale + (1 - narrowScale) * ((dist - 0.3) / 0.3) : 1
        // A₁v₁=A₂v₂ → v₂=v₁×(A₁/A₂)=v₁/localScale
        const localSpeed = p.speed / localScale
        p.x += localSpeed * (flowSpeed / 50)
        if (p.x > 1) p.x -= 1
        if (p.x < 0) p.x += 1
        // 粒子Y钳位在管道内
        const narrowScale2 = narrowRatio / 100
        const dist2 = Math.abs(p.x - 0.5) * 2
        const localScale2 = dist2 < 0.3 ? narrowScale2 : dist2 < 0.6 ? narrowScale2 + (1 - narrowScale2) * ((dist2 - 0.3) / 0.3) : 1
        const hRatio = localScale2
        const margin = 0.05
        p.y = Math.max(margin, Math.min(1 - margin, p.y))
      })

      // 纸张动画
      s.targetPaperAngle = (flowSpeed / 100) * 25
      s.paperAngle += (s.targetPaperAngle - s.paperAngle) * 0.05

      render(ctx, W, H, mode, s, flowSpeed, narrowRatio)
      animRef.current = requestAnimationFrame(loop)
    }
    loop()

    window.addEventListener('resize', resize)
    return () => {
      window.removeEventListener('resize', resize)
      if (animRef.current) cancelAnimationFrame(animRef.current)
    }
  }, [mode, flowSpeed, narrowRatio])

  return (
    <div style={S.container}>
      <div style={S.header}>
        <span style={S.title}>流体压强与流速关系</span>
        <span style={S.grade}>八年级</span>
        <span style={S.formula}>流速大 → 压强小</span>
      </div>

      <div style={S.body}>
        <div style={S.sidebar}>
          {/* 模式 */}
          <div style={S.card}>
            <div style={S.cardTitle}>🔬 实验模式</div>
            {[
              { key: 'pipe', label: '变截面管道', desc: '流速与截面积关系' },
              { key: 'wing', label: '飞机升力', desc: '机翼上下流速差' },
              { key: 'paper', label: '吹纸实验', desc: '两张纸吹气靠拢' },
            ].map(m => (
              <button key={m.key} onClick={() => setMode(m.key)}
                style={{
                  ...S.modeBtn,
                  background: mode === m.key ? '#4A90D9' : '#f5f5f5',
                  color: mode === m.key ? '#fff' : '#555',
                  borderColor: mode === m.key ? '#4A90D9' : '#ddd',
                }}>
                <div style={{ fontWeight: 600, fontSize: 12 }}>{m.label}</div>
                <div style={{ fontSize: 10, opacity: 0.8 }}>{m.desc}</div>
              </button>
            ))}
          </div>

          {/* 控制 */}
          <div style={S.card}>
            <div style={S.cardTitle}>🎛️ 实验控制</div>
            <div style={S.sliderGroup}>
              <div style={S.sliderLabel}>
                <span>流速</span>
                <span style={S.valBlue}>{flowSpeed}%</span>
              </div>
              <input type="range" min={0} max={100} step={5} value={flowSpeed}
                onChange={e => setFlowSpeed(+e.target.value)}
                style={{ ...S.slider, accentColor: '#4A90D9' }} />
            </div>
            {mode === 'pipe' && (
              <div style={S.sliderGroup}>
                <div style={S.sliderLabel}>
                  <span>狭窄处占比</span>
                  <span style={S.valOrange}>{narrowRatio}%</span>
                </div>
                <input type="range" min={10} max={80} step={5} value={narrowRatio}
                  onChange={e => setNarrowRatio(+e.target.value)}
                  style={{ ...S.slider, accentColor: '#FF9800' }} />
                <div style={S.range}>管道最窄处占截面的比例</div>
              </div>
            )}
          </div>

          {/* 笔记 */}
          <div style={S.card}>
            <div style={S.cardTitle}>📝 知识要点</div>
            {mode === 'pipe' && (
              <>
                <div style={S.note}>① 流体连续性：A₁v₁ = A₂v₂</div>
                <div style={S.note}>② 截面小 → 流速大 → 压强小</div>
                <div style={S.note}>③ 截面大 → 流速小 → 压强大</div>
                <div style={S.note}>④ 解释：喷雾器、化油器原理</div>
              </>
            )}
            {mode === 'wing' && (
              <>
                <div style={S.note}>① 机翼上凸下平，上方流速更大</div>
                <div style={S.note}>② 上方压强小，下方压强大</div>
                <div style={S.note}>③ 压力差 → 向上的升力</div>
                <div style={S.note}>④ 升力 = F下 - F上</div>
              </>
            )}
            {mode === 'paper' && (
              <>
                <div style={S.note}>① 对着两张纸中间吹气</div>
                <div style={S.note}>② 中间流速大 → 压强小</div>
                <div style={S.note}>③ 外侧压强大 → 纸被压向中间</div>
                <div style={S.note}>④ 生活实例：列车安全线</div>
              </>
            )}
          </div>
        </div>

        {/* Canvas */}
        <div style={S.canvasArea}>
          <canvas ref={canvasRef} style={S.canvas} />
        </div>

        {/* 右侧 */}
        <div style={S.rightPanel}>
          <div style={S.panelCard}>
            <div style={S.panelTitle}>📊 压强分析</div>

            {mode === 'pipe' && (
              <>
                <div style={S.section}>
                  <div style={S.sectionLabel}>截面与流速</div>
                  <Row label="宽处截面 A₁" value="大" color="#4CAF50" />
                  <Row label="窄处截面 A₂" value={`${narrowRatio}% A₁（占宽处比例）`} color="#FF9800" />
                  <Row label="宽处流速 v₁" value="小" color="#4CAF50" />
                  <Row label="窄处流速 v₂" value={`≈${(100 / narrowRatio).toFixed(1)}·v₁`} color="#FF6B6B" />
                </div>
                <div style={S.section}>
                  <div style={S.sectionLabel}>压强关系</div>
                  <div style={S.compareBox}>
                    <div style={S.compareItem}>
                      <span style={{ fontSize: 11, color: '#666' }}>宽处 p₁</span>
                      <span style={{ fontSize: 18, fontWeight: 700, color: '#4CAF50' }}>大</span>
                    </div>
                    <span style={{ fontSize: 16, color: '#999' }}>{'>'}</span>
                    <div style={S.compareItem}>
                      <span style={{ fontSize: 11, color: '#666' }}>窄处 p₂</span>
                      <span style={{ fontSize: 18, fontWeight: 700, color: '#FF6B6B' }}>小</span>
                    </div>
                  </div>
                </div>
              </>
            )}

            {mode === 'wing' && (
              <>
                <div style={S.section}>
                  <div style={S.sectionLabel}>机翼上下</div>
                  <Row label="上方流速" value="大（路程长）" color="#FF6B6B" />
                  <Row label="下方流速" value="小（路程短）" color="#4CAF50" />
                  <Row label="上方压强" value="小" color="#FF6B6B" />
                  <Row label="下方压强" value="大" color="#4CAF50" />
                  <div style={{ fontSize: 9, color: '#aaa', marginTop: 4 }}>初中简化模型，真实升力不完全由路程差决定</div>
                </div>
                <div style={S.section}>
                  <div style={S.sectionLabel}>升力</div>
                  <div style={S.liftBox}>
                    <span style={{ fontSize: 12, color: '#555' }}>升力方向 ↑</span>
                    <span style={{ fontSize: 13, fontFamily: 'serif', color: '#333', marginTop: 4 }}>F升 = p下×A − p上×A</span>
                  </div>
                </div>
              </>
            )}

            {mode === 'paper' && (
              <>
                <div style={S.section}>
                  <div style={S.sectionLabel}>吹纸实验</div>
                  <Row label="纸间流速" value="大" color="#FF6B6B" />
                  <Row label="纸间压强" value="小" color="#FF6B6B" />
                  <Row label="纸外流速" value="小（静止）" color="#4CAF50" />
                  <Row label="纸外压强" value="大（大气压）" color="#4CAF50" />
                </div>
                <div style={S.section}>
                  <div style={S.sectionLabel}>结果</div>
                  <div style={S.resultBox}>
                    外侧大气压 &gt; 内侧压强 → 纸向中间靠拢
                  </div>
                </div>
              </>
            )}

            <div style={S.warning}>
              ⚠ 伯努利原理适用于理想流体（不可压缩、无粘性）。实际流体有粘性损耗。
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
      <span style={{ color: '#666' }}>{label}</span>
      <span style={{ color, fontWeight: 700 }}>{value}</span>
    </div>
  )
}


/* ==================== Canvas 渲染 ==================== */

function render(ctx, W, H, mode, s, flowSpeed, narrowRatio) {
  ctx.clearRect(0, 0, W, H)
  ctx.fillStyle = '#f8f8f8'
  ctx.fillRect(0, 0, W, H)

  if (mode === 'pipe') drawPipe(ctx, W, H, s, flowSpeed, narrowRatio)
  else if (mode === 'wing') drawWing(ctx, W, H, s, flowSpeed)
  else if (mode === 'paper') drawPaper(ctx, W, H, s, flowSpeed)
}

/* ==================== 管道几何辅助 ==================== */
// 获取管道在x位置的半高（贝塞尔平滑过渡）
function getPipeHalfH(x, pipeLeft, pipeRight, pipeMid, wideH, narrowH) {
  const totalW = pipeRight - pipeLeft
  const t = (x - pipeLeft) / totalW // 0~1
  // 用cos平滑：0→1→0 的缩放因子
  const cosFactor = (1 - Math.cos(t * Math.PI * 2)) / 2 // 0→1→0（中间=1）
  // 但我们需要中间=窄，两端=宽
  // 实际上 narrowRatio 是窄处占宽处的比例
  // 所以中间缩放因子 = narrowRatio/100
  const narrowScale = narrowH / wideH
  const scale = 1 - (1 - narrowScale) * Math.max(0, 1 - Math.abs(t - 0.5) * 4) // 梯形过渡
  // 用更平滑的过渡
  const dist = Math.abs(t - 0.5) * 2 // 0(中间) ~ 1(两端)
  const smoothScale = dist < 0.3 ? narrowScale : dist < 0.6 ? narrowScale + (1 - narrowScale) * ((dist - 0.3) / 0.3) : 1
  const h = wideH * smoothScale
  return h / 2
}

/** 变截面管道 — 流速与压强 */
function drawPipe(ctx, W, H, s, flowSpeed, narrowRatio) {
  const pipeY = H * 0.35
  const pipeH = H * 0.3
  const pipeLeft = W * 0.08
  const pipeRight = W * 0.92
  const pipeMid = W / 2
  const wideH = pipeH
  const narrowH = pipeH * (narrowRatio / 100)
  const segments = 60

  // ---- 管道轮廓 ----
  function pipeHeightAt(x) {
    const t = (x - pipeLeft) / (pipeRight - pipeLeft) // 0~1
    const dist = Math.abs(t - 0.5) * 2 // 0(中间) ~ 1(两端)
    const narrowScale = narrowRatio / 100
    const scale = dist < 0.3 ? narrowScale : dist < 0.6 ? narrowScale + (1 - narrowScale) * ((dist - 0.3) / 0.3) : 1
    return wideH * scale
  }

  // 填充
  ctx.fillStyle = 'rgba(100, 180, 255, 0.12)'
  ctx.beginPath()
  for (let i = 0; i <= segments; i++) {
    const x = pipeLeft + (i / segments) * (pipeRight - pipeLeft)
    const h = pipeHeightAt(x)
    const topY = pipeY + (wideH - h) / 2
    i === 0 ? ctx.moveTo(x, topY) : ctx.lineTo(x, topY)
  }
  for (let i = segments; i >= 0; i--) {
    const x = pipeLeft + (i / segments) * (pipeRight - pipeLeft)
    const h = pipeHeightAt(x)
    const bottomY = pipeY + (wideH + h) / 2
    ctx.lineTo(x, bottomY)
  }
  ctx.closePath(); ctx.fill()

  // 边线
  ctx.strokeStyle = '#4A90D9'; ctx.lineWidth = 2.5
  ctx.beginPath()
  for (let i = 0; i <= segments; i++) {
    const x = pipeLeft + (i / segments) * (pipeRight - pipeLeft)
    const h = pipeHeightAt(x)
    const topY = pipeY + (wideH - h) / 2
    i === 0 ? ctx.moveTo(x, topY) : ctx.lineTo(x, topY)
  }
  ctx.stroke()
  ctx.beginPath()
  for (let i = 0; i <= segments; i++) {
    const x = pipeLeft + (i / segments) * (pipeRight - pipeLeft)
    const h = pipeHeightAt(x)
    const bottomY = pipeY + (wideH + h) / 2
    i === 0 ? ctx.moveTo(x, bottomY) : ctx.lineTo(x, bottomY)
  }
  ctx.stroke()

  // ---- 流动粒子（均匀密度，速度随截面变化，严格管内）----
  const speedMul = 100 / narrowRatio
  ctx.fillStyle = 'rgba(74, 144, 217, 0.7)'
  s.particles.forEach(p => {
    const x = pipeLeft + p.x * (pipeRight - pipeLeft)
    const h = pipeHeightAt(x)
    const topY = pipeY + (wideH - h) / 2
    const margin = h * 0.06 // 边距，不贴管壁
    const y = topY + margin + p.y * (h - 2 * margin)
    ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill()
  })

  // ---- 管道上方标注：流速 ----
  const v1x = pipeLeft + (pipeRight - pipeLeft) * 0.15
  const v2x = pipeMid
  const v3x = pipeLeft + (pipeRight - pipeLeft) * 0.85
  const annY = pipeY - 24
  ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
  ctx.fillStyle = '#4CAF50'; ctx.fillText('v₁（小）', v1x, annY)
  ctx.fillStyle = '#FF6B6B'; ctx.fillText(`v₂ ≈ ${speedMul.toFixed(1)}v₁（大）`, v2x, annY)
  ctx.fillStyle = '#4CAF50'; ctx.fillText('v₁（小）', v3x, annY)

  // ---- 管道下方标注：压强 ----
  const pAnnY = pipeY + wideH + 28
  ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
  ctx.fillStyle = '#4CAF50'; ctx.fillText('p₁（大）', v1x, pAnnY)
  ctx.fillStyle = '#FF6B6B'; ctx.fillText('p₂（小）', v2x, pAnnY)
  ctx.fillStyle = '#4CAF50'; ctx.fillText('p₁（大）', v3x, pAnnY)

  // 标题
  ctx.fillStyle = '#333'; ctx.font = 'bold 14px sans-serif'
  ctx.textAlign = 'center'; ctx.textBaseline = 'top'
  ctx.fillText('变截面管道 — 流速与压强', W / 2, H * 0.03)
}

function drawSpeedAnnotation(ctx, x, y, text, color) {
  ctx.fillStyle = color; ctx.font = 'bold 11px sans-serif'
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
  ctx.fillText(text, x, y)
}
function drawPressureAnnotation(ctx, x, y, text, color) {
  ctx.fillStyle = color; ctx.font = 'bold 11px sans-serif'
  ctx.textAlign = 'center'; ctx.textBaseline = 'top'
  ctx.fillText(text, x, y)
}


/** 飞机升力原理 */
function drawWing(ctx, W, H, s, flowSpeed) {
  const cx = W / 2, cy = H * 0.48
  const wingW = W * 0.45, wingH = 36
  const speedFactor = flowSpeed / 50
  const startX = W * 0.04, endX = W * 0.96
  const totalLen = endX - startX

  // ---- 机翼贝塞尔参数 ----
  const leX = cx - wingW / 2, teX = cx + wingW / 2
  const cp1x = cx - wingW * 0.2, cp1y = cy - wingH
  const cp2x = cx + wingW * 0.2, cp2y = cy - wingH
  function wingUpperY(bt) {
    const u = 1 - bt
    return u * u * u * cy + 3 * u * u * bt * cp1y + 3 * u * bt * bt * cp2y + bt * bt * bt * cy
  }

  // ---- 机翼截面 ----
  ctx.fillStyle = '#ddd'
  ctx.beginPath(); ctx.moveTo(leX, cy)
  ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, teX, cy)
  ctx.lineTo(leX, cy); ctx.closePath(); ctx.fill()
  ctx.strokeStyle = '#888'; ctx.lineWidth = 2; ctx.stroke()

  // ---- 核心：近翼流线跟随弧形弯曲，远翼流线保持直线 ----
  // followStrength: 0=完全直线，1=完全跟随翼面弧形
  function computeStreamlineY(x, flatY, gapIndex) {
    const transL = wingW * 0.20, transR = wingW * 0.20
    const leftStart = leX - transL, rightEnd = teX + transR
    if (x <= leftStart || x >= rightEnd) return flatY

    const gap = 8 + gapIndex * 8
    const bt = Math.max(0, Math.min(1, (x - leX) / (teX - leX)))
    // 目标：跟随翼面弧形，在翼面上方 gap 像素处
    const targetY = wingUpperY(bt) - gap

    // 跟随强度：近翼=1，远翼=0
    const followStrength = Math.max(0, 1 - gapIndex * 0.22)

    let env
    if (x >= leX && x <= teX) { env = 1 }
    else if (x < leX) { const t = (x - leftStart) / transL; env = t * t * (3 - 2 * t) }
    else { const t = (rightEnd - x) / transR; env = t * t * (3 - 2 * t) }

    return flatY + (targetY - flatY) * followStrength * env
  }

  // ---- 上方红色流线 ----
  const upperCount = 6
  for (let i = 0; i < upperCount; i++) {
    const gap = 8 + i * 8
    const flatY = cy - gap  // 基准线在翼面底边高度，翼顶处才有明显偏移
    ctx.strokeStyle = `rgba(255, 80, 80, ${0.5 - i * 0.04})`; ctx.lineWidth = 1.5
    const pts = []
    for (let k = 0; k <= 50; k++) {
      const x = startX + (k / 50) * totalLen
      pts.push({ x, y: computeStreamlineY(x, flatY, i) })
    }
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y)
    for (let k = 1; k < pts.length - 1; k++) {
      const xc = (pts[k].x + pts[k + 1].x) / 2, yc = (pts[k].y + pts[k + 1].y) / 2
      ctx.quadraticCurveTo(pts[k].x, pts[k].y, xc, yc)
    }
    ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y); ctx.stroke()
    // 粒子
    for (let j = 0; j < 4; j++) {
      const pt = ((s.phase * speedFactor * 2.0 + j / 4 + i * 0.09) % 1)
      const px = startX + pt * totalLen, py = computeStreamlineY(px, flatY, i)
      ctx.fillStyle = 'rgba(255, 80, 80, 0.75)'
      ctx.beginPath(); ctx.arc(px, py, 2.8, 0, Math.PI * 2); ctx.fill()
    }
  }

  // ---- 下方绿色流线 ----
  const lowerCount = 5
  for (let i = 0; i < lowerCount; i++) {
    const gap = 8 + i * 8, flatY = cy + gap
    ctx.strokeStyle = `rgba(80, 180, 80, ${0.5 - i * 0.04})`; ctx.lineWidth = 1.5
    const pts = []
    for (let k = 0; k <= 50; k++) {
      const x = startX + (k / 50) * totalLen
      const transL = wingW * 0.15, transR = wingW * 0.15
      const leftStart = leX - transL, rightEnd = teX + transR
      let y = flatY
      if (x > leftStart && x < rightEnd) {
        const bt = Math.max(0, Math.min(1, (x - leX) / (teX - leX)))
        const squeeze = Math.sin(bt * Math.PI) * wingH * 0.15 * Math.max(0.15, 0.8 - i * 0.15)
        let env; if (x >= leX && x <= teX) env = 1
        else if (x < leX) { const t = (x - leftStart) / transL; env = t * t * (3 - 2 * t) }
        else { const t = (rightEnd - x) / transR; env = t * t * (3 - 2 * t) }
        y = flatY + squeeze * env
      }
      pts.push({ x, y })
    }
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y)
    for (let k = 1; k < pts.length - 1; k++) {
      const xc = (pts[k].x + pts[k + 1].x) / 2, yc = (pts[k].y + pts[k + 1].y) / 2
      ctx.quadraticCurveTo(pts[k].x, pts[k].y, xc, yc)
    }
    ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y); ctx.stroke()
    for (let j = 0; j < 3; j++) {
      const pt = ((s.phase * speedFactor * 0.8 + j / 3 + i * 0.13) % 1)
      const px = startX + pt * totalLen
      let py = flatY
      const tl = wingW * 0.15, tr = wingW * 0.15, ls = leX - tl, re = teX + tr
      if (px > ls && px < re) {
        const bt = Math.max(0, Math.min(1, (px - leX) / (teX - leX)))
        const sq = Math.sin(bt * Math.PI) * wingH * 0.15 * Math.max(0.15, 0.8 - i * 0.15)
        let env; if (px >= leX && px <= teX) env = 1
        else if (px < leX) { const t = (px - ls) / tl; env = t * t * (3 - 2 * t) }
        else { const t = (re - px) / tr; env = t * t * (3 - 2 * t) }
        py = flatY + sq * env
      }
      ctx.fillStyle = 'rgba(80, 180, 80, 0.75)'
      ctx.beginPath(); ctx.arc(px, py, 2.8, 0, Math.PI * 2); ctx.fill()
    }
  }

  // ---- 升力箭头 ----
  const liftLen = Math.min(70, flowSpeed * 0.7)
  if (liftLen > 5) {
    ctx.strokeStyle = '#FF4444'; ctx.lineWidth = 3; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(cx, cy + 24); ctx.lineTo(cx, cy + 24 - liftLen); ctx.stroke()
    ctx.fillStyle = '#FF4444'
    ctx.beginPath(); ctx.moveTo(cx, cy + 24 - liftLen)
    ctx.lineTo(cx - 7, cy + 24 - liftLen + 12); ctx.lineTo(cx + 7, cy + 24 - liftLen + 12)
    ctx.closePath(); ctx.fill()
    ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    ctx.fillText('F升', cx + 12, cy + 24 - liftLen / 2)
  }

  // ---- 标注 ----
  ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'
  ctx.fillStyle = '#FF4444'; ctx.textBaseline = 'bottom'
  ctx.fillText('上方：流速大 → 压强小', cx, cy - upperCount * 8 - 28)
  ctx.fillStyle = '#4CAF50'; ctx.textBaseline = 'top'
  ctx.fillText('下方：流速小 → 压强大', cx, cy + lowerCount * 8 + 28)
  ctx.fillStyle = '#333'; ctx.font = 'bold 14px sans-serif'
  ctx.textAlign = 'center'; ctx.textBaseline = 'top'
  ctx.fillText('飞机升力原理', cx, H * 0.03)
}

/** 吹纸实验 */
function drawPaper(ctx, W, H, s, flowSpeed) {
  const cx = W / 2
  const paperTop = H * 0.12
  const paperH = H * 0.55
  const paperW = 44
  const baseGap = 30 // 初始间距（流速0时）
  const speedFactor = flowSpeed / 100

  // 纸片绕顶端旋转角度（流速越大角度越大）
  // 最大角度：确保两纸下端最多接触，不交叉不重叠
  // 纸张宽度paperW，间距baseGap，纸张高度paperH
  // 旋转后底部边缘刚好接触：paperH*sin(θ) = baseGap - paperW/2
  const safeAngle = Math.asin(Math.max(0.01, (baseGap - paperW / 2) / paperH))
  const maxAngle = Math.min(0.35, safeAngle * 0.95)
  const angle = speedFactor * maxAngle

  // Canvas rotate(正) → x'=-h*sin(a)<0 向左移
  // 左纸底部需向右(向中心) → 负角度；右纸底部需向左(向中心) → 正角度
  drawPaperV(ctx, cx - baseGap, paperTop, paperH, paperW, -angle)
  drawPaperV(ctx, cx + baseGap, paperTop, paperH, paperW, angle)

  // ---- 中间向下吹气粒子 ----
  if (flowSpeed > 3) {
    const particleCount = Math.floor(flowSpeed / 5)
    ctx.fillStyle = 'rgba(74, 144, 217, 0.6)'
    for (let i = 0; i < particleCount; i++) {
      const phase = (s.phase * speedFactor * 3 + i * 0.12) % 1
      const convergeAmount = speedFactor * baseGap * 0.8
      const gapAtY = baseGap - convergeAmount * phase // 缝隙随Y变窄
      const x = cx + (Math.sin(i * 7.3 + s.phase) * 0.3) * gapAtY * 0.4
      const y = paperTop - 20 + phase * (paperH + 30)
      const size = 2.5
      ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill()
    }
    // 吹气方向指示（向下箭头）
    ctx.strokeStyle = 'rgba(74, 144, 217, 0.4)'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(cx, paperTop - 30); ctx.lineTo(cx, paperTop - 8); ctx.stroke()
    ctx.fillStyle = 'rgba(74, 144, 217, 0.4)'
    ctx.beginPath(); ctx.moveTo(cx, paperTop - 6); ctx.lineTo(cx - 5, paperTop - 14); ctx.lineTo(cx + 5, paperTop - 14); ctx.closePath(); ctx.fill()
  }

  // ---- 大气压箭头（外侧指向纸张）----
  drawAtmArrowsPaper(ctx, cx, paperTop, paperH, baseGap, paperW, -1)
  drawAtmArrowsPaper(ctx, cx, paperTop, paperH, baseGap, paperW, 1)

  // ---- 标注 ----
  ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'
  ctx.fillStyle = '#FF6B6B'; ctx.textBaseline = 'top'
  ctx.fillText('中间：流速大 → 压强小', cx, paperTop + paperH + 16)
  ctx.fillStyle = '#4CAF50'
  ctx.fillText('外侧：流速小 → 压强大（大气压）', cx, paperTop + paperH + 36)

  // 标题
  ctx.fillStyle = '#333'; ctx.font = 'bold 14px sans-serif'
  ctx.textAlign = 'center'; ctx.textBaseline = 'top'
  ctx.fillText('吹纸实验', cx, H * 0.03)
}

/** 绘制单张纸（矩形绕顶端旋转）*/
function drawPaperV(ctx, pivotX, top, h, w, angle) {
  ctx.save()
  ctx.translate(pivotX, top)
  ctx.rotate(angle) // 绕顶端旋转，正值=顺时针（右纸向左靠），负值=逆时针（左纸向右靠）

  const hw = w / 2
  const grad = ctx.createLinearGradient(-hw, 0, hw, 0)
  grad.addColorStop(0, '#f5f5dc'); grad.addColorStop(1, '#e8e8c8')
  ctx.fillStyle = grad
  ctx.fillRect(-hw, 0, w, h) // 标准矩形，宽度不变
  ctx.strokeStyle = '#aaa'; ctx.lineWidth = 1; ctx.strokeRect(-hw, 0, w, h)

  // 纸张纹理线
  ctx.strokeStyle = 'rgba(0,0,0,0.05)'
  for (let y = 20; y < h; y += 25) {
    ctx.beginPath(); ctx.moveTo(-hw + 2, y); ctx.lineTo(hw - 2, y); ctx.stroke()
  }

  ctx.restore()
}

/** 大气压箭头（从外侧指向纸张）*/
function drawAtmArrowsPaper(ctx, cx, top, h, baseGap, paperW, side) {
  const arrowX = cx + side * (baseGap + paperW / 2 + 20)
  ctx.strokeStyle = 'rgba(74, 144, 217, 0.6)'; ctx.lineWidth = 1.5
  ctx.fillStyle = 'rgba(74, 144, 217, 0.6)'
  for (let i = 0; i < 4; i++) {
    const ay = top + h * 0.15 + i * 35
    // 箭头从外侧指向纸张（向内）
    ctx.beginPath(); ctx.moveTo(arrowX + side * 18, ay); ctx.lineTo(arrowX + side * 4, ay); ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(arrowX + side * 2, ay)
    ctx.lineTo(arrowX + side * 10, ay - 4)
    ctx.lineTo(arrowX + side * 10, ay + 4)
    ctx.closePath(); ctx.fill()
  }
  ctx.fillStyle = '#4A90D9'; ctx.font = '10px sans-serif'
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText('大气压', arrowX + side * 24, top + h * 0.5)
}

/* ==================== 样式 ==================== */

const S = {
  container: { display: 'flex', flexDirection: 'column', height: '100vh', background: '#f0f0f0', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  header: { display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', background: '#fff', borderBottom: '1px solid #ddd', flexShrink: 0 },
  title: { fontSize: 16, fontWeight: 700, color: '#333' },
  grade: { fontSize: 11, color: '#fff', background: '#4A90D9', borderRadius: 4, padding: '2px 8px' },
  formula: { fontSize: 13, fontWeight: 600, color: '#E6A800', marginLeft: 'auto' },
  body: { flex: 1, display: 'flex', overflow: 'hidden' },
  sidebar: { width: 250, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8, padding: 10, overflow: 'auto', borderRight: '1px solid #ddd', background: '#fafafa' },
  card: { background: '#fff', borderRadius: 8, padding: 12, border: '1px solid #e0e0e0' },
  cardTitle: { fontSize: 13, fontWeight: 700, color: '#333', marginBottom: 10 },
  modeBtn: { display: 'block', width: '100%', padding: '8px 10px', marginBottom: 6, borderRadius: 6, border: '1px solid #ddd', cursor: 'pointer', textAlign: 'left' },
  sliderGroup: { marginBottom: 12 },
  sliderLabel: { display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#444', marginBottom: 4 },
  valBlue: { color: '#4A90D9', fontWeight: 700 },
  valOrange: { color: '#FF9800', fontWeight: 700 },
  slider: { width: '100%' },
  range: { fontSize: 10, color: '#999', marginTop: 2 },
  note: { fontSize: 11, color: '#555', lineHeight: 1.6, marginBottom: 4 },
  canvasArea: { flex: 1, display: 'flex', overflow: 'hidden', background: '#fff' },
  canvas: { flex: 1, width: '100%' },
  rightPanel: { width: 240, flexShrink: 0, padding: 10, overflow: 'auto', borderLeft: '1px solid #ddd', background: '#fafafa' },
  panelCard: { background: '#fff', borderRadius: 8, padding: 14, border: '1px solid #e0e0e0' },
  panelTitle: { fontSize: 14, fontWeight: 700, color: '#333', marginBottom: 12 },
  section: { marginBottom: 14 },
  sectionLabel: { fontSize: 10, fontWeight: 700, color: '#888', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 },
  compareBox: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, background: '#f8f8f8', borderRadius: 6, padding: 10 },
  compareItem: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 },
  liftBox: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, background: '#E3F2FD', borderRadius: 6, padding: 10 },
  resultBox: { fontSize: 12, color: '#333', background: '#E8F5E9', borderRadius: 4, padding: 8, textAlign: 'center' },
  warning: { fontSize: 10, color: '#E65100', background: '#FFF3E0', borderRadius: 4, padding: '6px 8px', lineHeight: 1.5, border: '1px solid #FFE0B2' },
}
