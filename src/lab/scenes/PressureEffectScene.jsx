import { useRef, useEffect, useState, useCallback } from 'react'

/**
 * PressureEffectScene — 探究压力作用效果（压强）
 *
 * 初中八年级物理 · 控制变量法 · 转换法
 *
 * 物理公式：p = F/S
 *   F(N), S(m²), p(Pa)
 *   1cm² = 1e-4 m²
 *
 * 控制变量法：
 *   ① S不变，F越大 → p越大，凹陷越深
 *   ② F不变，S越小 → p越大，凹陷越深
 *
 * 转换法：海绵凹陷程度反映压强大小（需控制另一变量不变）
 *
 * 海绵形变：非线性，接近弹性限度时凹陷增长放缓
 */

// ---- 常量 ----
const FORCE_MIN = 0
const FORCE_MAX = 50
const FORCE_STEP = 2
const AREA_MIN_CM2 = 10
const AREA_MAX_CM2 = 400
const AREA_STEP_CM2 = 10

// 海绵形变参数（非线性饱和模型）
const DEFORM_K = 0.008   // 形变灵敏度系数
const DEFORM_MAX = 0.85  // 最大凹陷比（0~1，留余量）

/**
 * 非线性形变函数
 * 输入：压强 p (Pa)
 * 输出：凹陷比 0~DEFORM_MAX
 * 特性：低压强段近似线性，高压强段增长放缓（对数饱和）
 */
function calcDeformation(pressure) {
  if (pressure <= 0) return 0
  // 用 ln(1 + k*p) 实现饱和曲线，再归一化到 DEFORM_MAX
  const raw = Math.log(1 + DEFORM_K * pressure)
  const maxRaw = Math.log(1 + DEFORM_K * 5000) // 5000Pa作为参考上限
  return Math.min(DEFORM_MAX, (raw / maxRaw) * DEFORM_MAX)
}

export default function PressureEffectScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)
  const rendererRef = useRef(null)

  // 状态
  const [force, setForce] = useState(10)        // N
  const [areaCm2, setAreaCm2] = useState(100)   // cm²
  const [deformDisplay, setDeformDisplay] = useState(0) // 面板显示用凹陷比

  // 动画状态（ref，避免Canvas每帧setState）
  const animRef2 = useRef({
    deformCurrent: 0,  // 当前动画中的凹陷比
    targetDeform: 0,   // 目标凹陷比
  })

  // 计算物理量
  const areaM2 = areaCm2 * 1e-4
  const pressure = areaM2 > 0 ? force / areaM2 : 0
  const targetDeform = calcDeformation(pressure)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const renderer = createRenderer(canvas)
    rendererRef.current = renderer

    let frameCount = 0
    const loop = () => {
      // 缓动动画
      const a = animRef2.current
      a.targetDeform = targetDeform
      a.deformCurrent += (a.targetDeform - a.deformCurrent) * 0.06
      if (Math.abs(a.deformCurrent - a.targetDeform) < 0.001) {
        a.deformCurrent = a.targetDeform
      }

      // 每10帧同步一次到state（面板显示，避免每帧setState）
      frameCount++
      if (frameCount % 10 === 0) {
        setDeformDisplay(a.deformCurrent)
      }

      renderFrame(renderer, force, areaCm2, areaM2, pressure, a.deformCurrent)
      animRef.current = requestAnimationFrame(loop)
    }
    loop()

    const onResize = () => renderer.resize()
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      if (animRef.current) cancelAnimationFrame(animRef.current)
    }
  }, [force, areaCm2, pressure, targetDeform])

  return (
    <div style={styles.container}>
      {/* 标题栏 */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.title}>探究压力作用效果</span>
          <span style={styles.grade}>八年级基础</span>
        </div>
        <div style={styles.headerRight}>
          <span style={styles.formula}>p = F / S</span>
        </div>
      </div>

      {/* 主体区域 */}
      <div style={styles.body}>
        {/* 左侧：实验笔记 */}
        <div style={styles.sidebar}>
          <div style={styles.notesCard}>
            <div style={styles.notesTitle}>📝 实验笔记</div>
            <div style={styles.noteItem}>
              <span style={styles.noteNum}>①</span>
              <span>改变砝码压力，保持受力面积不变，观察海绵凹陷（控制变量）</span>
            </div>
            <div style={styles.noteItem}>
              <span style={styles.noteNum}>②</span>
              <span>改变受力面积，保持砝码压力不变，观察海绵凹陷（控制变量）</span>
            </div>
            <div style={styles.noteItem}>
              <span style={styles.noteNum}>③</span>
              <span>转换法：用海绵凹陷程度，间接表示压力的作用效果</span>
            </div>
          </div>

          {/* 控制面板 */}
          <div style={styles.controlCard}>
            <div style={styles.controlTitle}>🎛️ 实验控制</div>

            <div style={styles.sliderGroup}>
              <div style={styles.sliderLabel}>
                <span>压力 F</span>
                <span style={styles.sliderValueRed}>{force} N</span>
              </div>
              <input
                type="range"
                min={FORCE_MIN} max={FORCE_MAX} step={FORCE_STEP}
                value={force}
                onChange={e => setForce(Number(e.target.value))}
                style={{ ...styles.slider, accentColor: '#FF6B6B' }}
              />
              <div style={styles.sliderRange}>{FORCE_MIN}N ~ {FORCE_MAX}N，步长{FORCE_STEP}N</div>
            </div>

            <div style={styles.sliderGroup}>
              <div style={styles.sliderLabel}>
                <span>受力面积 S</span>
                <span style={styles.sliderValueBlue}>{areaCm2} cm²</span>
              </div>
              <input
                type="range"
                min={AREA_MIN_CM2} max={AREA_MAX_CM2} step={AREA_STEP_CM2}
                value={areaCm2}
                onChange={e => setAreaCm2(Number(e.target.value))}
                style={{ ...styles.slider, accentColor: '#4A90D9' }}
              />
              <div style={styles.sliderRange}>{AREA_MIN_CM2}cm² ~ {AREA_MAX_CM2}cm²，步长{AREA_STEP_CM2}cm²</div>
            </div>
          </div>
        </div>

        {/* 中间：Canvas 仿真 */}
        <div style={styles.canvasArea}>
          <canvas ref={canvasRef} style={styles.canvas} />
        </div>

        {/* 右侧：压强分析面板 */}
        <div style={styles.rightPanel}>
          <PressurePanel
            force={force}
            areaCm2={areaCm2}
            areaM2={areaM2}
            pressure={pressure}
            deformCurrent={deformDisplay}
          />
        </div>
      </div>
    </div>
  )
}

/* ---- 压强分析面板（React组件，纯文字） ---- */
function PressurePanel({ force, areaCm2, areaM2, pressure, deformCurrent }) {
  const deformPct = (deformCurrent * 100).toFixed(1)
  // 凹陷程度用于比较的前提提示
  const showWarning = true // 始终显示提醒

  return (
    <div style={panelStyles.card}>
      <div style={panelStyles.title}>📊 压强分析</div>

      {/* 已知量 */}
      <div style={panelStyles.section}>
        <div style={panelStyles.sectionTitle}>已知量</div>
        <div style={panelStyles.row}>
          <span style={panelStyles.label}>压力 F</span>
          <span style={panelStyles.valueRed}>{force} N</span>
        </div>
        <div style={panelStyles.row}>
          <span style={panelStyles.label}>受力面积 S</span>
          <span style={panelStyles.valueBlue}>{areaCm2} cm²</span>
        </div>
        <div style={panelStyles.row}>
          <span style={panelStyles.label}>　　换算</span>
          <span style={panelStyles.valueBlue}>{areaM2.toExponential(2)} m²</span>
        </div>
      </div>

      {/* 计算过程 */}
      <div style={panelStyles.section}>
        <div style={panelStyles.sectionTitle}>计算过程</div>
        <div style={panelStyles.calcStep}>
          <span style={panelStyles.calcLabel}>公式</span>
          <span style={panelStyles.calcFormula}>p = F / S</span>
        </div>
        <div style={panelStyles.calcStep}>
          <span style={panelStyles.calcLabel}>代入</span>
          <span style={panelStyles.calcFormula}>p = {force} / {areaM2.toExponential(2)}</span>
        </div>
        <div style={panelStyles.calcStep}>
          <span style={panelStyles.calcLabel}>结果</span>
          <span style={panelStyles.calcResult}>
            p = {pressure >= 1000 ? (pressure / 1000).toFixed(2) + ' kPa' : pressure.toFixed(1) + ' Pa'}
          </span>
        </div>
      </div>

      {/* 凹陷程度 */}
      <div style={panelStyles.section}>
        <div style={panelStyles.sectionTitle}>凹陷程度</div>
        <div style={panelStyles.deformBar}>
          <div style={{ ...panelStyles.deformFill, width: `${Math.min(100, deformCurrent / DEFORM_MAX * 100)}%` }} />
        </div>
        <div style={panelStyles.deformText}>{deformPct}%</div>
      </div>

      {/* 警告 */}
      {showWarning && (
        <div style={panelStyles.warning}>
          ⚠ 凹陷程度仅在<strong>控制另一变量不变</strong>时，才能比较压强大小。不能单凭凹陷深浅直接判断。
        </div>
      )}

      {/* 形变说明 */}
      <div style={panelStyles.footnote}>
        海绵形变在弹性限度内近似与压强成正比；超过限度后凹陷增长放缓，不能无限成比例。
      </div>
    </div>
  )
}


/* ==================== Canvas 渲染 ==================== */

function createRenderer(canvas) {
  const r = {
    canvas,
    ctx: canvas.getContext('2d'),
    W: 0, H: 0,
    resize() {
      const rect = canvas.getBoundingClientRect()
      const dpr = devicePixelRatio || 1
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      this.W = rect.width
      this.H = rect.height
    },
  }
  r.resize()
  return r
}

function renderFrame(renderer, force, areaCm2, areaM2, pressure, deform) {
  const { ctx, W, H } = renderer
  ctx.clearRect(0, 0, W, H)

  // ---- 布局参数 ----
  const spongeW = Math.min(W * 0.65, 500)
  const spongeH = 100
  const spongeX = (W - spongeW) / 2
  const spongeBaseY = H * 0.58  // 海绵顶部基准Y

  // 方块尺寸：底面积决定宽度
  const blockW = Math.max(30, Math.sqrt(areaCm2 / 100) * 80)
  const blockH = 36
  const blockX = W / 2 - blockW / 2
  // 方块底部贴合海绵凹陷表面
  const indentDepth = deform * 50  // 凹陷像素深度
  const blockBottomY = spongeBaseY + indentDepth
  const blockTopY = blockBottomY - blockH

  // 砝码参数
  const weightCount = Math.floor(force / FORCE_STEP)
  const weightH = 8
  const weightGap = 2

  drawBackground(ctx, W, H)
  drawSponge(ctx, spongeX, spongeBaseY, spongeW, spongeH, blockX, blockW, indentDepth, deform)
  drawBlock(ctx, blockX, blockTopY, blockW, blockH, areaCm2)
  drawWeights(ctx, blockX, blockTopY, blockW, weightCount, weightH, weightGap)
  drawForceArrow(ctx, W / 2, blockTopY, weightCount, weightH, weightGap, force)
  drawLabels(ctx, W, H, spongeX, spongeW, spongeBaseY, spongeH, indentDepth, deform, pressure)
}

function drawBackground(ctx, W, H) {
  // 浅灰背景
  ctx.fillStyle = '#f8f8f8'
  ctx.fillRect(0, 0, W, H)

  // 台面
  const tableY = H * 0.58 + 100 + 4
  ctx.fillStyle = '#e0d5c8'
  ctx.fillRect(0, tableY, W, H - tableY)
  ctx.strokeStyle = '#c8b8a8'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, tableY)
  ctx.lineTo(W, tableY)
  ctx.stroke()
}

/**
 * 绘制海绵 — 黄色网格 + 矩形凹陷
 */
function drawSponge(ctx, sx, sy, sw, sh, blockX, blockW, indentDepth, deform) {
  const topY = sy
  const bottomY = sy + sh

  // ---- 海绵主体轮廓（带矩形凹陷）----
  ctx.beginPath()
  // 从左下角开始，逆时针
  ctx.moveTo(sx, bottomY)           // 左下
  ctx.lineTo(sx, topY)              // 左上
  // 顶部：左侧平台 → 凹陷 → 右侧平台
  ctx.lineTo(blockX, topY)          // 凹陷左边缘

  // 矩形凹陷：垂直下降 → 平底 → 垂直上升
  ctx.lineTo(blockX, topY + indentDepth)                    // 左壁垂直下降
  ctx.lineTo(blockX + blockW, topY + indentDepth)           // 平底
  ctx.lineTo(blockX + blockW, topY)                         // 右壁垂直上升

  ctx.lineTo(sx + sw, topY)         // 右上
  ctx.lineTo(sx + sw, bottomY)      // 右下
  ctx.closePath()

  // 黄色填充
  ctx.fillStyle = '#FFD93D'
  ctx.fill()

  // ---- 网格纹理 ----
  ctx.save()
  ctx.clip()  // 裁剪到海绵轮廓内

  ctx.strokeStyle = 'rgba(200, 160, 0, 0.25)'
  ctx.lineWidth = 0.8
  // 横线
  for (let y = topY; y <= bottomY; y += 14) {
    ctx.beginPath()
    ctx.moveTo(sx, y)
    ctx.lineTo(sx + sw, y)
    ctx.stroke()
  }
  // 竖线
  for (let x = sx; x <= sx + sw; x += 14) {
    ctx.beginPath()
    ctx.moveTo(x, topY)
    ctx.lineTo(x, bottomY)
    ctx.stroke()
  }

  ctx.restore()

  // ---- 海绵边框 ----
  ctx.beginPath()
  ctx.moveTo(sx, bottomY)
  ctx.lineTo(sx, topY)
  ctx.lineTo(blockX, topY)
  ctx.lineTo(blockX, topY + indentDepth)
  ctx.lineTo(blockX + blockW, topY + indentDepth)
  ctx.lineTo(blockX + blockW, topY)
  ctx.lineTo(sx + sw, topY)
  ctx.lineTo(sx + sw, bottomY)
  ctx.closePath()
  ctx.strokeStyle = '#c8a000'
  ctx.lineWidth = 2
  ctx.stroke()

  // ---- 凹陷深度标注（右侧） ----
  if (deform > 0.01) {
    const markX = sx + sw + 16
    const dipPx = indentDepth

    ctx.strokeStyle = '#FF6B6B'
    ctx.lineWidth = 1.5
    ctx.setLineDash([4, 3])
    ctx.beginPath()
    ctx.moveTo(markX, topY)
    ctx.lineTo(markX, topY + dipPx)
    ctx.stroke()
    ctx.setLineDash([])

    // 上下短横线
    ctx.beginPath()
    ctx.moveTo(markX - 4, topY)
    ctx.lineTo(markX + 4, topY)
    ctx.moveTo(markX - 4, topY + dipPx)
    ctx.lineTo(markX + 4, topY + dipPx)
    ctx.stroke()

    ctx.fillStyle = '#FF6B6B'
    ctx.font = '10px sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText('凹陷', markX + 6, topY + dipPx / 2)
  }
}

/**
 * 绘制方块（灰色，带面积标签）
 */
function drawBlock(ctx, bx, by, bw, bh, areaCm2) {
  const grad = ctx.createLinearGradient(bx, by, bx, by + bh)
  grad.addColorStop(0, '#bbb')
  grad.addColorStop(1, '#999')
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.roundRect(bx, by, bw, bh, 3)
  ctx.fill()

  ctx.strokeStyle = '#777'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.roundRect(bx, by, bw, bh, 3)
  ctx.stroke()

  // 面积标签
  if (bw > 40) {
    ctx.fillStyle = '#fff'
    ctx.font = `bold ${Math.min(12, bw * 0.15)}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(`S=${areaCm2}cm²`, bx + bw / 2, by + bh / 2)
  }
}

/**
 * 绘制砝码（在方块上方堆叠）
 */
function drawWeights(ctx, bx, by, bw, count, wh, gap) {
  const wW = bw * 0.6
  const wX = bx + (bw - wW) / 2

  for (let i = 0; i < count; i++) {
    const wy = by - (i + 1) * (wh + gap)
    const grad = ctx.createLinearGradient(wX, wy, wX, wy + wh)
    grad.addColorStop(0, '#6ECFCF')
    grad.addColorStop(1, '#4AB8B8')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.roundRect(wX, wy, wW, wh, 2)
    ctx.fill()
    ctx.strokeStyle = '#3AA0A0'
    ctx.lineWidth = 0.8
    ctx.beginPath()
    ctx.roundRect(wX, wy, wW, wh, 2)
    ctx.stroke()
  }
}

/**
 * 绘制压力箭头（红色，垂直向下，垂直于接触面）
 */
function drawForceArrow(ctx, cx, topY, weightCount, wh, gap, force) {
  if (force <= 0) return

  const arrowStartY = topY - weightCount * (wh + gap) - 24
  const arrowEndY = topY - weightCount * (wh + gap) - 4
  const arrowLen = arrowEndY - arrowStartY

  // 箭头线
  ctx.strokeStyle = '#FF4444'
  ctx.lineWidth = 3
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(cx, arrowStartY)
  ctx.lineTo(cx, arrowEndY)
  ctx.stroke()

  // 箭头头部
  ctx.fillStyle = '#FF4444'
  ctx.beginPath()
  ctx.moveTo(cx, arrowEndY)
  ctx.lineTo(cx - 6, arrowEndY - 10)
  ctx.lineTo(cx + 6, arrowEndY - 10)
  ctx.closePath()
  ctx.fill()

  // 标签
  ctx.fillStyle = '#FF4444'
  ctx.font = 'bold 12px sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(`F = ${force} N`, cx + 10, (arrowStartY + arrowEndY) / 2)

  // 垂直标记（小直角）
  ctx.strokeStyle = '#FF4444'
  ctx.lineWidth = 1
  const markSize = 6
  ctx.beginPath()
  ctx.moveTo(cx - markSize, arrowEndY)
  ctx.lineTo(cx - markSize, arrowEndY + markSize)
  ctx.lineTo(cx, arrowEndY + markSize)
  ctx.stroke()
}

/**
 * 绘制辅助标签
 */
function drawLabels(ctx, W, H, sx, sw, sy, sh, indentDepth, deform, pressure) {
  // 海绵标注
  ctx.fillStyle = '#888'
  ctx.font = '11px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText('黄色海绵', sx + sw / 2, sy + sh + 8)

  // 台面标注
  ctx.fillStyle = '#aaa'
  ctx.fillText('水平台面', sx + sw / 2, sy + sh + 24)

  // 转换法提示（左上角）
  ctx.fillStyle = '#4A90D9'
  ctx.font = '11px sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText('💡 转换法：海绵凹陷程度 → 压力作用效果', 12, 12)
}


/* ==================== 样式 ==================== */

const styles = {
  container: {
    display: 'flex', flexDirection: 'column', height: '100vh',
    background: '#f0f0f0', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  // 标题栏
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '8px 16px', background: '#fff', borderBottom: '1px solid #ddd', flexShrink: 0,
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 12 },
  title: { fontSize: 16, fontWeight: 700, color: '#333' },
  grade: { fontSize: 11, color: '#fff', background: '#4A90D9', borderRadius: 4, padding: '2px 8px' },
  headerRight: {},
  formula: { fontSize: 15, fontWeight: 600, color: '#E6A800', fontFamily: 'serif' },
  // 主体
  body: {
    flex: 1, display: 'flex', overflow: 'hidden', gap: 0,
  },
  // 左侧栏
  sidebar: {
    width: 260, flexShrink: 0, display: 'flex', flexDirection: 'column',
    gap: 8, padding: 10, overflow: 'auto',
    borderRight: '1px solid #ddd', background: '#fafafa',
  },
  notesCard: {
    background: '#fff', borderRadius: 8, padding: 12,
    border: '1px solid #e0e0e0',
  },
  notesTitle: { fontSize: 13, fontWeight: 700, color: '#333', marginBottom: 8 },
  noteItem: { display: 'flex', gap: 6, fontSize: 11, color: '#555', lineHeight: 1.5, marginBottom: 6 },
  noteNum: { color: '#4A90D9', fontWeight: 700, flexShrink: 0 },
  // 控制面板
  controlCard: {
    background: '#fff', borderRadius: 8, padding: 12,
    border: '1px solid #e0e0e0',
  },
  controlTitle: { fontSize: 13, fontWeight: 700, color: '#333', marginBottom: 10 },
  sliderGroup: { marginBottom: 14 },
  sliderLabel: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    fontSize: 12, color: '#444', marginBottom: 4,
  },
  sliderValueRed: { color: '#FF6B6B', fontWeight: 700, fontSize: 13 },
  sliderValueBlue: { color: '#4A90D9', fontWeight: 700, fontSize: 13 },
  slider: { width: '100%' },
  sliderRange: { fontSize: 10, color: '#999', marginTop: 2 },
  // Canvas区域
  canvasArea: { flex: 1, display: 'flex', overflow: 'hidden', background: '#fff' },
  canvas: { flex: 1, width: '100%' },
  // 右侧面板
  rightPanel: {
    width: 240, flexShrink: 0, padding: 10, overflow: 'auto',
    borderLeft: '1px solid #ddd', background: '#fafafa',
  },
}

const panelStyles = {
  card: {
    background: '#fff', borderRadius: 8, padding: 14,
    border: '1px solid #e0e0e0',
  },
  title: { fontSize: 14, fontWeight: 700, color: '#333', marginBottom: 12 },
  section: { marginBottom: 14 },
  sectionTitle: { fontSize: 11, fontWeight: 700, color: '#888', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 },
  row: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    fontSize: 12, marginBottom: 4,
  },
  label: { color: '#666' },
  valueRed: { color: '#FF6B6B', fontWeight: 700, fontSize: 13 },
  valueBlue: { color: '#4A90D9', fontWeight: 700, fontSize: 13 },
  // 计算过程
  calcStep: {
    display: 'flex', gap: 8, alignItems: 'baseline', marginBottom: 4,
  },
  calcLabel: {
    fontSize: 10, color: '#999', width: 36, textAlign: 'right', flexShrink: 0,
  },
  calcFormula: {
    fontSize: 13, color: '#333', fontFamily: 'serif',
  },
  calcResult: {
    fontSize: 14, color: '#E6A800', fontWeight: 700, fontFamily: 'serif',
  },
  // 凹陷进度条
  deformBar: {
    height: 10, background: '#eee', borderRadius: 5, overflow: 'hidden', marginBottom: 4,
  },
  deformFill: {
    height: '100%', background: 'linear-gradient(90deg, #4CAF50, #FF9800, #f44336)',
    borderRadius: 5, transition: 'width 0.15s ease',
  },
  deformText: { fontSize: 11, color: '#666', textAlign: 'right' },
  // 警告
  warning: {
    fontSize: 10, color: '#E65100', background: '#FFF3E0',
    borderRadius: 4, padding: '6px 8px', lineHeight: 1.5,
    border: '1px solid #FFE0B2', marginBottom: 8,
  },
  footnote: {
    fontSize: 10, color: '#999', lineHeight: 1.4,
  },
}
