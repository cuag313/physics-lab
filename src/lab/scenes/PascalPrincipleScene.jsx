import { useRef, useEffect, useState } from 'react'

/**
 * PascalPrincipleScene — 帕斯卡原理（液压机）
 *
 * 初中八年级物理 · 帕斯卡原理
 *
 * 核心公式：p₁ = p₂  →  F₁/S₁ = F₂/S₂  →  F₂ = F₁ × (S₂/S₁)
 *
 * 交互：按住"下压"按钮 → 小活塞下推 → 大活塞缓慢上升
 *       松手 → 两活塞回弹复位
 */

// 活塞面积范围 cm²
const SMALL_AREA_MIN = 5
const SMALL_AREA_MAX = 50
const LARGE_AREA_MIN = 50
const LARGE_AREA_MAX = 500

export default function PascalPrincipleScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)

  const [smallArea, setSmallArea] = useState(10)   // cm²
  const [largeArea, setLargeArea] = useState(100)  // cm²
  const [inputForce, setInputForce] = useState(40) // N（控制下压力度）

  // 推压状态
  const [pushing, setPushing] = useState(false)

  // 动画状态
  const stateRef = useRef({
    smallPistonY: 0,    // 小活塞下降量 (px)
    largePistonY: 0,    // 大活塞上升量 (px)
    targetSmallY: 0,
    targetLargeY: 0,
    particles: [],       // 流动粒子
    phase: 0,
    currentForce: 0,     // 当前实时力（动画过渡用）
  })

  // 物理计算
  const smallAreaM2 = smallArea * 1e-4
  const largeAreaM2 = largeArea * 1e-4
  const forceRatio = largeArea / smallArea

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

    // 初始化粒子
    const particles = []
    for (let i = 0; i < 30; i++) {
      particles.push({
        t: Math.random(),
        speed: 0.001 + Math.random() * 0.002,
      })
    }
    stateRef.current.particles = particles

    const loop = () => {
      const s = stateRef.current
      s.phase += 0.01

      // ---- 活塞动画 ----
      if (pushing) {
        // 按住：小活塞缓慢下压，力逐渐增大到 inputForce
        s.currentForce += (inputForce - s.currentForce) * 0.03
      } else {
        // 松手：力逐渐归零（回弹）
        s.currentForce *= 0.94
        if (s.currentForce < 0.1) s.currentForce = 0
      }

      // 小活塞行程：与力成正比
      const maxSmallTravel = 80  // 最大下压像素
      s.targetSmallY = (s.currentForce / 100) * maxSmallTravel

      // 大行程 = 小行程 × (S₁/S₂)（体积守恒：A₁×Δh₁ = A₂×Δh₂）
      s.targetLargeY = s.targetSmallY * (smallArea / largeArea)

      // lerp 平滑
      s.smallPistonY += (s.targetSmallY - s.smallPistonY) * 0.06
      s.largePistonY += (s.targetLargeY - s.largePistonY) * 0.04 // 大活塞更慢

      // 粒子流动（只在推压时流动）
      if (s.currentForce > 1) {
        particles.forEach(p => {
          p.t += p.speed * (s.currentForce / 40)
          if (p.t > 1) p.t -= 1
        })
      }

      // 实时力、压强、输出力
      const liveForce = s.currentForce
      const livePressure = smallAreaM2 > 0 ? liveForce / smallAreaM2 : 0
      const liveOutputForce = livePressure * largeAreaM2

      render(ctx, W, H, s, smallArea, largeArea, liveForce, livePressure, liveOutputForce)
      animRef.current = requestAnimationFrame(loop)
    }
    loop()

    window.addEventListener('resize', resize)
    return () => {
      window.removeEventListener('resize', resize)
      if (animRef.current) cancelAnimationFrame(animRef.current)
    }
  }, [smallArea, largeArea, inputForce, pushing, smallAreaM2, largeAreaM2])

  // 实时显示值
  const liveForce = stateRef.current.currentForce
  const livePressure = smallAreaM2 > 0 ? liveForce / smallAreaM2 : 0
  const liveOutputForce = livePressure * largeAreaM2

  return (
    <div style={S.container}>
      <div style={S.header}>
        <span style={S.title}>帕斯卡原理</span>
        <span style={S.grade}>八年级</span>
        <span style={S.formula}>F₁/S₁ = F₂/S₂</span>
      </div>

      <div style={S.body}>
        {/* 左侧控制 */}
        <div style={S.sidebar}>
          <div style={S.card}>
            <div style={S.cardTitle}>🎛️ 实验控制</div>

            <div style={S.sliderGroup}>
              <div style={S.sliderLabel}>
                <span>小活塞面积 S₁</span>
                <span style={S.valBlue}>{smallArea} cm²</span>
              </div>
              <input type="range" min={SMALL_AREA_MIN} max={SMALL_AREA_MAX} step={5}
                value={smallArea} onChange={e => setSmallArea(+e.target.value)}
                style={{ ...S.slider, accentColor: '#4A90D9' }} />
              <div style={S.range}>{SMALL_AREA_MIN}~{SMALL_AREA_MAX} cm²</div>
            </div>

            <div style={S.sliderGroup}>
              <div style={S.sliderLabel}>
                <span>大活塞面积 S₂</span>
                <span style={S.valGreen}>{largeArea} cm²</span>
              </div>
              <input type="range" min={LARGE_AREA_MIN} max={LARGE_AREA_MAX} step={10}
                value={largeArea} onChange={e => setLargeArea(+e.target.value)}
                style={{ ...S.slider, accentColor: '#4CAF50' }} />
              <div style={S.range}>{LARGE_AREA_MIN}~{LARGE_AREA_MAX} cm²</div>
            </div>

            <div style={S.sliderGroup}>
              <div style={S.sliderLabel}>
                <span>施加力 F₁</span>
                <span style={S.valRed}>{inputForce} N</span>
              </div>
              <input type="range" min={5} max={100} step={5}
                value={inputForce} onChange={e => setInputForce(+e.target.value)}
                style={{ ...S.slider, accentColor: '#FF6B6B' }} />
              <div style={S.range}>5~100 N（控制下压深度）</div>
            </div>

            {/* 推压按钮 */}
            <div style={{ marginTop: 12, textAlign: 'center' }}>
              <button
                onMouseDown={() => setPushing(true)}
                onMouseUp={() => setPushing(false)}
                onMouseLeave={() => setPushing(false)}
                onTouchStart={e => { e.preventDefault(); setPushing(true) }}
                onTouchEnd={() => setPushing(false)}
                style={{
                  ...S.pushBtn,
                  background: pushing ? '#c0392b' : '#e74c3c',
                  transform: pushing ? 'scale(0.96)' : 'scale(1)',
                }}
              >
                {pushing ? '⬇ 下压中...' : '⬇ 按住下压小活塞'}
              </button>
              <div style={{ fontSize: 10, color: '#999', marginTop: 4 }}>松手自动回弹</div>
            </div>
          </div>

          {/* 笔记 */}
          <div style={S.card}>
            <div style={S.cardTitle}>📝 实验笔记</div>
            <div style={S.note}>① 密闭液体上的压强，大小不变地向各个方向传递</div>
            <div style={S.note}>② 小活塞压强 = 大活塞压强：p₁ = p₂</div>
            <div style={S.note}>③ 大活塞受力更大：F₂ = F₁ × (S₂/S₁)</div>
            <div style={S.note}>④ 大行程更短：Δh₂ = Δh₁ × (S₁/S₂)</div>
            <div style={S.note}>⑤ 应用：液压机、千斤顶、刹车系统</div>
          </div>
        </div>

        {/* 中间Canvas */}
        <div style={S.canvasArea}>
          <canvas ref={canvasRef} style={S.canvas} />
        </div>

        {/* 右侧分析面板 */}
        <div style={S.rightPanel}>
          <div style={S.panelCard}>
            <div style={S.panelTitle}>📊 帕斯卡原理分析</div>

            <div style={S.section}>
              <div style={S.sectionLabel}>已知量</div>
              <Row label="小活塞面积 S₁" value={`${smallArea} cm² = ${smallAreaM2.toExponential(2)} m²`} color="#4A90D9" />
              <Row label="大活塞面积 S₂" value={`${largeArea} cm² = ${largeAreaM2.toExponential(2)} m²`} color="#4CAF50" />
              <Row label="施加力 F₁" value={`${liveForce.toFixed(1)} N`} color="#FF6B6B" />
            </div>

            <div style={S.section}>
              <div style={S.sectionLabel}>实时计算</div>
              <Calc label="① p₁" expr={`F₁/S₁ = ${liveForce.toFixed(1)} / ${smallAreaM2.toExponential(2)}`}
                result={`${livePressure.toFixed(0)} Pa`} active={liveForce > 0.5} />
              <Calc label="② p₂" expr="p₂ = p₁（帕斯卡原理）"
                result={`${livePressure.toFixed(0)} Pa`} active={liveForce > 0.5} />
              <Calc label="③ F₂" expr={`p₂×S₂ = ${livePressure.toFixed(0)} × ${largeAreaM2.toExponential(2)}`}
                result={`${liveOutputForce.toFixed(1)} N`} active={liveForce > 0.5} />
            </div>

            <div style={S.section}>
              <div style={S.sectionLabel}>液压放大</div>
              <div style={S.ratioBox}>
                <span style={S.ratioLabel}>力放大倍数</span>
                <span style={S.ratioValue}>{forceRatio.toFixed(1)}×</span>
              </div>
              <div style={S.footnote}>S₂/S₁ = {largeArea}/{smallArea} = {forceRatio.toFixed(1)}</div>
            </div>

            <div style={S.section}>
              <div style={S.sectionLabel}>行程关系</div>
              <div style={{ fontSize: 11, color: '#555', lineHeight: 1.6 }}>
                体积守恒：S₁×Δh₁ = S₂×Δh₂<br />
                大活塞行程更短：Δh₂ = Δh₁ × (S₁/S₂)
              </div>
            </div>

            <div style={S.warning}>
              ⚠ 大活塞受力更大，但移动距离更小。理想情况：W₁ = W₂（功的原理）
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

function Calc({ label, expr, result, active }) {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', marginBottom: 4, fontSize: 12, opacity: active ? 1 : 0.4 }}>
      <span style={{ color: '#999', width: 28, textAlign: 'right', flexShrink: 0, fontSize: 10 }}>{label}</span>
      <span style={{ color: '#555', fontFamily: 'serif', flex: 1 }}>{expr}</span>
      <span style={{ color: '#E6A800', fontWeight: 700, fontFamily: 'serif' }}>= {result}</span>
    </div>
  )
}


/* ==================== Canvas 渲染 ==================== */

function render(ctx, W, H, s, smallArea, largeArea, force, pressure, outputForce) {
  ctx.clearRect(0, 0, W, H)

  // 背景
  ctx.fillStyle = '#f8f8f8'
  ctx.fillRect(0, 0, W, H)

  // 布局
  const centerY = H * 0.5
  const smallX = W * 0.32
  const largeX = W * 0.68
  const pipeY = centerY + 40
  const pipeH = 30

  // 活塞半径（像素，按面积比例缩放）
  const smallR = Math.max(18, Math.sqrt(smallArea) * 3.5)
  const largeR = Math.max(30, Math.sqrt(largeArea) * 3.5)

  // 活塞位置（小活塞下压，大活塞上升）
  const smallTop = centerY - 60 + s.smallPistonY
  const largeTop = centerY - 60 - s.largePistonY * 0.5 // 大活塞向上（减小Y）

  drawFluid(ctx, W, H, smallX, largeX, pipeY, pipeH, smallR, largeR, s)
  drawCylinder(ctx, smallX, smallTop, smallR, pipeY, '#4A90D9', 'S₁', smallArea, true)
  drawCylinder(ctx, largeX, largeTop, largeR, pipeY, '#4CAF50', 'S₂', largeArea, false)
  drawPiston(ctx, smallX, smallTop, smallR, force, '#FF6B6B', 'F₁', true)
  drawPiston(ctx, largeX, largeTop, largeR, outputForce, '#FF9800', 'F₂', false)
  drawMovementArrows(ctx, smallX, largeX, smallTop, largeTop, smallR, largeR, s)
  drawParticles(ctx, s.particles, smallX, largeX, pipeY, pipeH, smallR, largeR)
  drawPressureLabel(ctx, W, pipeY + pipeH + 20, pressure, s)
}

function drawFluid(ctx, W, H, sx, lx, py, ph, sr, lr, s) {
  const top = py
  const bottom = py + ph

  ctx.fillStyle = 'rgba(100, 180, 255, 0.2)'
  ctx.beginPath()
  ctx.moveTo(sx - sr, top)
  ctx.lineTo(sx - sr, bottom)
  ctx.lineTo(lx - lr, bottom)
  ctx.lineTo(lx - lr, top)
  ctx.lineTo(lx + lr, top)
  ctx.lineTo(lx + lr, bottom)
  ctx.lineTo(sx + sr, bottom)
  ctx.lineTo(sx + sr, top)
  ctx.closePath()
  ctx.fill()

  // 管道连接
  ctx.fillStyle = 'rgba(100, 180, 255, 0.15)'
  ctx.fillRect(Math.min(sx + sr, lx - lr), py, Math.abs(lx - lr - sx - sr), ph)
}

function drawCylinder(ctx, cx, top, r, pipeTop, color, label, area, isLeft) {
  const h = pipeTop - top
  if (h <= 0) return

  // 筒壁
  ctx.strokeStyle = color
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(cx - r, Math.min(top, pipeTop - 10))
  ctx.lineTo(cx - r, pipeTop)
  ctx.moveTo(cx + r, Math.min(top, pipeTop - 10))
  ctx.lineTo(cx + r, pipeTop)
  ctx.stroke()

  // 面积标签（底部）
  ctx.fillStyle = color
  ctx.font = 'bold 11px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText(`${label}=${area}cm²`, cx, pipeTop + 6)
}

function drawPiston(ctx, cx, top, r, force, color, label, isInput) {
  // 活塞头
  const grad = ctx.createLinearGradient(cx - r, top, cx + r, top)
  grad.addColorStop(0, '#999')
  grad.addColorStop(0.5, '#ccc')
  grad.addColorStop(1, '#999')
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.roundRect(cx - r, top - 8, r * 2, 12, 3)
  ctx.fill()
  ctx.strokeStyle = '#777'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.roundRect(cx - r, top - 8, r * 2, 12, 3)
  ctx.stroke()

  // 力标签
  ctx.fillStyle = color
  ctx.font = 'bold 12px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  if (force > 0.5) {
    ctx.fillText(`${label}=${force.toFixed(isInput ? 1 : 1)}N`, cx, top - 12)
  }
}

function drawMovementArrows(ctx, sx, lx, st, lt, sr, lr, s) {
  // 小活塞：向下运动箭头
  if (s.smallPistonY > 2) {
    const arrowLen = Math.min(40, s.smallPistonY * 0.6)
    const ax = sx
    const ay = st - 20
    drawMotionArrow(ctx, ax, ay, ay + arrowLen, '#FF6B6B', '↓ 下压')
  }

  // 大活塞：向上运动箭头
  if (s.largePistonY > 0.5) {
    const arrowLen = Math.min(30, s.largePistonY * 2)
    const ax = lx
    const ay = lt - 20
    drawMotionArrow(ctx, ax, ay, ay - arrowLen, '#FF9800', '↑ 上升')
  }
}

function drawMotionArrow(ctx, cx, y1, y2, color, label) {
  ctx.strokeStyle = color
  ctx.lineWidth = 2.5
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(cx, y1)
  ctx.lineTo(cx, y2)
  ctx.stroke()

  // 箭头头部
  const dir = y2 > y1 ? 1 : -1
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(cx, y2)
  ctx.lineTo(cx - 5, y2 - dir * 8)
  ctx.lineTo(cx + 5, y2 - dir * 8)
  ctx.closePath()
  ctx.fill()

  // 标签
  ctx.font = '10px sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, cx + 8, (y1 + y2) / 2)
}

function drawParticles(ctx, particles, sx, lx, py, ph, sr, lr) {
  ctx.fillStyle = 'rgba(74, 144, 217, 0.6)'
  const pipeLeft = sx + sr
  const pipeRight = lx - lr
  const pipeWidth = pipeRight - pipeLeft

  particles.forEach(p => {
    const x = pipeLeft + p.t * pipeWidth
    const y = py + ph / 2 + Math.sin(p.t * Math.PI * 4) * 4
    ctx.beginPath()
    ctx.arc(x, y, 2.5, 0, Math.PI * 2)
    ctx.fill()
  })
}

function drawPressureLabel(ctx, W, y, pressure, s) {
  ctx.fillStyle = '#4A90D9'
  ctx.font = 'bold 13px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  if (s.currentForce > 0.5) {
    ctx.fillText(`密闭液体内部压强处处相等：p = ${pressure.toFixed(0)} Pa`, W / 2, y)
  } else {
    ctx.fillStyle = '#999'
    ctx.fillText('按住"下压"按钮，观察活塞运动', W / 2, y)
  }
}


/* ==================== 样式 ==================== */

const S = {
  container: { display: 'flex', flexDirection: 'column', height: '100vh', background: '#f0f0f0', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  header: { display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', background: '#fff', borderBottom: '1px solid #ddd', flexShrink: 0 },
  title: { fontSize: 16, fontWeight: 700, color: '#333' },
  grade: { fontSize: 11, color: '#fff', background: '#4A90D9', borderRadius: 4, padding: '2px 8px' },
  formula: { fontSize: 15, fontWeight: 600, color: '#E6A800', fontFamily: 'serif', marginLeft: 'auto' },
  body: { flex: 1, display: 'flex', overflow: 'hidden' },
  sidebar: { width: 250, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8, padding: 10, overflow: 'auto', borderRight: '1px solid #ddd', background: '#fafafa' },
  card: { background: '#fff', borderRadius: 8, padding: 12, border: '1px solid #e0e0e0' },
  cardTitle: { fontSize: 13, fontWeight: 700, color: '#333', marginBottom: 10 },
  sliderGroup: { marginBottom: 12 },
  sliderLabel: { display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#444', marginBottom: 4 },
  valBlue: { color: '#4A90D9', fontWeight: 700 },
  valGreen: { color: '#4CAF50', fontWeight: 700 },
  valRed: { color: '#FF6B6B', fontWeight: 700 },
  slider: { width: '100%' },
  range: { fontSize: 10, color: '#999', marginTop: 2 },
  pushBtn: {
    width: '100%', padding: '14px 16px', borderRadius: 8,
    border: 'none', color: '#fff', fontWeight: 700, fontSize: 14,
    cursor: 'pointer', transition: 'all 0.1s', userSelect: 'none',
    WebkitUserSelect: 'none', touchAction: 'none',
  },
  note: { fontSize: 11, color: '#555', lineHeight: 1.6, marginBottom: 4 },
  canvasArea: { flex: 1, display: 'flex', overflow: 'hidden', background: '#fff' },
  canvas: { flex: 1, width: '100%' },
  rightPanel: { width: 250, flexShrink: 0, padding: 10, overflow: 'auto', borderLeft: '1px solid #ddd', background: '#fafafa' },
  panelCard: { background: '#fff', borderRadius: 8, padding: 14, border: '1px solid #e0e0e0' },
  panelTitle: { fontSize: 14, fontWeight: 700, color: '#333', marginBottom: 12 },
  section: { marginBottom: 14 },
  sectionLabel: { fontSize: 10, fontWeight: 700, color: '#888', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 },
  ratioBox: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#FFF8E1', borderRadius: 6, padding: '8px 12px', marginBottom: 4 },
  ratioLabel: { fontSize: 12, color: '#555' },
  ratioValue: { fontSize: 20, fontWeight: 700, color: '#E6A800' },
  footnote: { fontSize: 10, color: '#999' },
  warning: { fontSize: 10, color: '#E65100', background: '#FFF3E0', borderRadius: 4, padding: '6px 8px', lineHeight: 1.5, border: '1px solid #FFE0B2' },
}
