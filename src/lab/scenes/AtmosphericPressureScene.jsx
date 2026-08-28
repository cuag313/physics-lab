import { useRef, useEffect, useState } from 'react'

const STD_ATM_PA = 101325
const STD_HG_MM = 760
const RHO_HG = 13600
const G_ACC = 9.8
const AIR_LEAK_RATIO = 0.30

function pressureToHgMm(pa) { return pa / (RHO_HG * G_ACC) * 1000 }
function altitudeToHgMm(m) { return Math.max(0, STD_HG_MM - m / 12) }

export default function AtmosphericPressureScene() {
  const canvasRef = useRef(null)
  const animRef = useRef(null)
  const [mode, setMode] = useState('torricelli')
  const [extKpa, setExtKpa] = useState(STD_ATM_PA / 1000)
  const [tubeTilt, setTubeTilt] = useState(false)
  const [tubeWidth, setTubeWidth] = useState(26)
  const [airLeak, setAirLeak] = useState(false)
  const [tubeFailed, setTubeFailed] = useState(false)
  const [altitude, setAltitude] = useState(0)
  const [sphereRadius, setSphereRadius] = useState(20)
  const [innerKpa, setInnerKpa] = useState(0)
  const [tick, setTick] = useState(0) // 强制React刷新（面板实时数据）

  const S = useRef({
    curHg: 760, tgtHg: 760, curAlt: 0, tgtAlt: 0,
    pullF: 0, pulling: false, separated: false, sep: 0,
    phase: 0,
    tiltAnim: 0, tgtTilt: 0,   // 倾斜角动画
    offsetAnim: 0, tgtOffset: 0, // 管深度偏移动画
    failAnim: 0,
    dragging: false, dragType: null, dragStartX: 0, dragStartY: 0, dragStartTilt: 0,
  })

  // 物理
  const extPa = extKpa * 1000
  const h0_mm = pressureToHgMm(extPa)
  const pGasPa = airLeak ? AIR_LEAK_RATIO * extPa : 0
  const h_mm = tubeFailed ? 0 : pressureToHgMm(extPa - pGasPa)
  const theta = S.current.tiltAnim
  const L_mm = tubeTilt ? h_mm / Math.cos(theta) : h_mm

  // 马德堡
  const extPaM = (S.current.curHg / STD_HG_MM) * STD_ATM_PA
  const intPaM = innerKpa * 1000
  const deltaPa = Math.max(0, extPaM - intPaM)
  const sphereA = Math.PI * (sphereRadius * 1e-2) ** 2
  const reqF = deltaPa * sphereA
  const isStd = Math.abs(extPaM - STD_ATM_PA) < 500
  const isVac = intPaM < 500

  // 模式切换
  useEffect(() => {
    const s = S.current
    if (mode === 'torricelli') { s.tgtHg = STD_HG_MM; s.tgtOffset = 0; s.tgtTilt = 0; setTubeFailed(false) }
    else if (mode === 'altitude') { s.tgtAlt = altitude; s.tgtHg = altitudeToHgMm(altitude) }
    else if (mode === 'magdeburg') { s.pullF = 0; s.separated = false; s.sep = 0 }
  }, [mode])

  useEffect(() => { if (mode === 'torricelli') S.current.tgtHg = h_mm }, [mode, h_mm])
  useEffect(() => { if (mode === 'altitude') { S.current.tgtAlt = altitude; S.current.tgtHg = altitudeToHgMm(altitude) } }, [mode, altitude])
  useEffect(() => {
    const s = S.current
    s.tgtTilt = tubeTilt ? 0.45 : 0
    // 倾斜时自动下压管口，保证整个椭圆切面浸没
    const autoOffset = tubeWidth / 2 * Math.sin(s.tgtTilt) + 6
    s.tgtOffset = tubeTilt ? autoOffset : 0
  }, [tubeTilt, tubeWidth])
  useEffect(() => { setTubeFailed(false); S.current.tgtOffset = 0 }, [extKpa, airLeak])

  // 渲染循环 + 拖拽
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let W = 0, H = 0
    function resize() {
      const r = canvas.getBoundingClientRect()
      const dpr = devicePixelRatio || 1
      canvas.width = Math.max(1, r.width * dpr)
      canvas.height = Math.max(1, r.height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      W = r.width; H = r.height
    }
    resize()

    const loop = () => {
      const s = S.current
      s.phase += 0.016
      s.curHg += (s.tgtHg - s.curHg) * 0.05
      s.curAlt += (s.tgtAlt - s.curAlt) * 0.05
      s.tiltAnim += (s.tgtTilt - s.tiltAnim) * 0.15
      // 每4帧强制React刷新，同步面板角度数据
      if (Math.floor(s.phase * 60) % 4 === 0) setTick(t => t + 1)
      // 倾斜越大，管子自动下扎越深，保证管口椭圆切面全部浸没
      const autoDepth = tubeWidth / 2 * Math.sin(s.tiltAnim) + 6
      if (s.tiltAnim > 0.02) s.tgtOffset = Math.max(s.tgtOffset, autoDepth)
      s.offsetAnim += (s.tgtOffset - s.offsetAnim) * 0.12
      if (tubeFailed) s.failAnim = Math.min(1, s.failAnim + 0.02)
      else s.failAnim = Math.max(0, s.failAnim - 0.05)

      if (mode === 'magdeburg') {
        if (s.pulling && !s.separated) { s.pullF += 1.2; if (s.pullF >= reqF && reqF > 0) s.separated = true }
        else if (!s.pulling && !s.separated) { s.pullF *= 0.93; if (s.pullF < 0.5) s.pullF = 0 }
        if (s.separated) s.sep += (120 - s.sep) * 0.04
        else s.sep = Math.min(8, s.pullF / Math.max(1, reqF) * 8)
      }

      try {
        ctx.clearRect(0, 0, W, H)
        ctx.fillStyle = '#f8f8f8'; ctx.fillRect(0, 0, W, H)
        if (mode === 'torricelli') drawTorr(ctx, W, H, s, { h0_mm, h_mm, pGasPa, tubeTilt, airLeak, tubeFailed, tubeWidth, extKpa })
        else if (mode === 'altitude') drawAlt(ctx, W, H, s)
        else if (mode === 'magdeburg') drawMag(ctx, W, H, s, { sphereRadius, extPaM, deltaPa, reqF, isStd, isVac })
      } catch (e) { console.error(e) }

      animRef.current = requestAnimationFrame(loop)
    }
    loop()

    // 拖拽
    function pos(e) { const r = canvas.getBoundingClientRect(); const t = e.touches ? e.touches[0] : e; return { x: t.clientX - r.left, y: t.clientY - r.top } }
    function layout() {
      const tankY = H * 0.72, tbX = W * 0.42 + 35, tbY = tankY + S.current.offsetAnim
      return { tankY, tbX, tbY }
    }
    function hitTest(mx, my) {
      if (mode !== 'torricelli' || tubeFailed) return null
      const { tbX, tbY } = layout()
      const a = S.current.tiltAnim, cosA = Math.cos(a), sinA = Math.sin(a)
      const tLen = 260
      const topX = tbX - sinA * tLen, topY = tbY - cosA * tLen
      if (Math.hypot(mx - topX, my - topY) < 35) return 'rotate'
      const dx = mx - tbX, dy = my - tbY
      const along = -dx * sinA + -dy * cosA, perp = Math.abs(dx * cosA - dy * sinA)
      if (along > 10 && along < tLen && perp < 28) return 'drag'
      return null
    }
    function onDown(e) {
      const p = pos(e), hit = hitTest(p.x, p.y)
      if (hit) {
        const s = S.current; s.dragging = true; s.dragType = hit
        s.dragStartX = p.x; s.dragStartY = p.y; s.dragStartTilt = s.tgtTilt
        canvas.style.cursor = hit === 'rotate' ? 'crosshair' : 'grabbing'
        e.preventDefault()
      }
    }
    function onMove(e) {
      const p = pos(e), s = S.current
      if (s.dragging) {
        if (s.dragType === 'rotate') {
          const { tbX, tbY } = layout()
          const a = Math.atan2(tbX - p.x, tbY - p.y)
          const clampedAngle = Math.max(0, Math.min(Math.PI / 3, a))
          s.tgtTilt = clampedAngle
          // 倾斜越大，管子自动下扎越深，保证管口椭圆切面全部浸没
          const autoDepth = tubeWidth / 2 * Math.sin(clampedAngle) + 6
          s.tgtOffset = Math.max(s.tgtOffset, autoDepth)
        } else if (s.dragType === 'drag') {
          const dy = p.y - s.dragStartY
          s.tgtOffset = Math.max(0, Math.min(40, dy))
          if (s.tgtOffset > 35) setTubeFailed(true)
        }
        e.preventDefault()
      } else {
        const hit = hitTest(p.x, p.y)
        canvas.style.cursor = hit === 'rotate' ? 'crosshair' : hit === 'drag' ? 'grab' : 'default'
      }
    }
    function onUp() { S.current.dragging = false; S.current.dragType = null; canvas.style.cursor = 'default' }

    canvas.addEventListener('mousedown', onDown); canvas.addEventListener('mousemove', onMove)
    canvas.addEventListener('mouseup', onUp); canvas.addEventListener('mouseleave', onUp)
    canvas.addEventListener('touchstart', onDown, { passive: false }); canvas.addEventListener('touchmove', onMove, { passive: false })
    canvas.addEventListener('touchend', onUp)
    window.addEventListener('resize', resize)
    return () => {
      canvas.removeEventListener('mousedown', onDown); canvas.removeEventListener('mousemove', onMove)
      canvas.removeEventListener('mouseup', onUp); canvas.removeEventListener('mouseleave', onUp)
      canvas.removeEventListener('touchstart', onDown); canvas.removeEventListener('touchmove', onMove)
      canvas.removeEventListener('touchend', onUp)
      window.removeEventListener('resize', resize)
      if (animRef.current) cancelAnimationFrame(animRef.current)
    }
  }, [mode, sphereRadius, extPa, intPaM, deltaPa, reqF, isStd, isVac, h0_mm, h_mm, pGasPa, tubeTilt, airLeak, tubeWidth, extKpa, tubeFailed])

  const resetTube = () => { setTubeFailed(false); S.current.tgtOffset = 0; S.current.failAnim = 0 }
  const resetSphere = () => { const s = S.current; s.pullF = 0; s.separated = false; s.sep = 0; s.pulling = false }

  return (
    <div style={st.container}>
      <div style={st.header}>
        <span style={st.title}>大气压强</span>
        <span style={st.grade}>八年级</span>
        <span style={st.formula}>p₀ = ρgh</span>
      </div>
      <div style={st.body}>
        <div style={st.sidebar}>
          <div style={st.card}>
            <div style={st.cardTitle}>🔬 实验模式</div>
            {[{ k: 'torricelli', l: '托里拆利实验', d: '水银气压计' },
              { k: 'altitude', l: '海拔与气压', d: '气压随海拔变化' },
              { k: 'magdeburg', l: '马德堡半球', d: '气压差原理' }].map(m => (
              <button key={m.k} onClick={() => setMode(m.k)}
                style={{ ...st.modeBtn, background: mode === m.k ? '#4A90D9' : '#f5f5f5', color: mode === m.k ? '#fff' : '#555', borderColor: mode === m.k ? '#4A90D9' : '#ddd' }}>
                <div style={{ fontWeight: 600, fontSize: 12 }}>{m.l}</div>
                <div style={{ fontSize: 10, opacity: 0.8 }}>{m.d}</div>
              </button>
            ))}
          </div>
          <div style={st.card}>
            <div style={st.cardTitle}>🎛️ 实验控制</div>
            {mode === 'torricelli' && (<>
              <div style={st.sliderGroup}>
                <div style={st.sliderLabel}><span>外界大气压</span><span style={st.valBlue}>{extKpa.toFixed(1)} kPa</span></div>
                <input type="range" min={40} max={120} step={0.5} value={extKpa} onChange={e => setExtKpa(+e.target.value)} style={{ ...st.slider, accentColor: '#4A90D9' }} />
                <div style={st.range}>{(extPa / STD_ATM_PA * STD_HG_MM).toFixed(0)} mmHg</div>
              </div>
              <div style={st.readonlyBox}>
                <span style={{ fontSize: 11, color: '#666' }}>真空理论高度 h₀</span>
                <span style={{ fontSize: 18, fontWeight: 700, color: '#E6A800' }}>{h0_mm.toFixed(1)} mm</span>
                <span style={{ fontSize: 9, color: '#aaa' }}>课本取760mm，微差来自ρ=13600, g=9.8取值</span>
              </div>
              <div style={st.sliderGroup}>
                <div style={st.sliderLabel}><span>玻璃管粗细</span><span style={st.valBlue}>{tubeWidth}px</span></div>
                <input type="range" min={16} max={50} step={2} value={tubeWidth} onChange={e => setTubeWidth(+e.target.value)} style={{ ...st.slider, accentColor: '#4A90D9' }} />
                <div style={st.range}>验证：管粗细改变，竖直高度h不变</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
                <label style={st.cbLabel}><input type="checkbox" checked={tubeTilt} onChange={e => setTubeTilt(e.target.checked)} /><span>玻璃管倾斜（可拖管顶旋转）</span></label>
                <label style={st.cbLabel}><input type="checkbox" checked={airLeak} onChange={e => setAirLeak(e.target.checked)} /><span>管内混入空气</span></label>
              </div>
              <div style={{ fontSize: 10, color: '#4A90D9', marginTop: 8 }}>💡 拖管身下压 · 拖管顶旋转</div>
              {tubeFailed && (<div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 11, color: '#f44336', fontWeight: 700 }}>❌ 管口脱离液面，水银全部流出，实验失效！</div>
                <button onClick={resetTube} style={{ ...st.resetBtn, marginTop: 6, width: '100%' }}>🔄 重新实验</button>
              </div>)}
            </>)}
            {mode === 'altitude' && (
              <div style={st.sliderGroup}>
                <div style={st.sliderLabel}><span>海拔</span><span style={st.valGreen}>{altitude} m</span></div>
                <input type="range" min={0} max={9000} step={100} value={altitude} onChange={e => setAltitude(+e.target.value)} style={{ ...st.slider, accentColor: '#4CAF50' }} />
              </div>
            )}
            {mode === 'magdeburg' && (<>
              <div style={st.sliderGroup}>
                <div style={st.sliderLabel}><span>半球半径</span><span style={st.valOrange}>{sphereRadius} cm</span></div>
                <input type="range" min={10} max={30} step={1} value={sphereRadius} onChange={e => { setSphereRadius(+e.target.value); resetSphere() }} style={{ ...st.slider, accentColor: '#FF9800' }} />
              </div>
              <div style={st.sliderGroup}>
                <div style={st.sliderLabel}><span>球内气压</span><span style={st.valPurple}>{innerKpa.toFixed(1)} kPa</span></div>
                <input type="range" min={0} max={Math.max(1, extPaM / 1000)} step={0.5} value={Math.min(innerKpa, extPaM / 1000)} onChange={e => { setInnerKpa(+e.target.value); resetSphere() }} style={{ ...st.slider, accentColor: '#9C27B0' }} />
                {isVac && <div style={{ fontSize: 10, color: '#4A90D9', marginTop: 2 }}>🔵 球内接近真空</div>}
              </div>
              {!isStd && <div style={st.nonStd}>⚠ 当前为<strong>非标准大气压</strong></div>}
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button onMouseDown={() => { if (!S.current.separated) S.current.pulling = true }} onMouseUp={() => { S.current.pulling = false }} onMouseLeave={() => { S.current.pulling = false }} onTouchStart={e => { e.preventDefault(); if (!S.current.separated) S.current.pulling = true }} onTouchEnd={() => { S.current.pulling = false }} style={{ ...st.pullBtn, opacity: S.current.separated ? 0.5 : 1 }} disabled={S.current.separated}>🤏 {S.current.separated ? '已分开！' : '按住拉动'}</button>
                {S.current.separated && <button onClick={resetSphere} style={st.resetBtn}>🔄 重新合上</button>}
              </div>
            </>)}
          </div>
          <div style={st.card}>
            <div style={st.cardTitle}>📝 知识要点</div>
            {mode === 'torricelli' && (<>
              <div style={st.note}>① 托里拆利实验，历史上第一次测出大气压强的数值</div>
              <div style={st.note}>② 标准大气压对应 760 mm 高水银柱</div>
              <div style={st.note}>③ 玻璃管上方近乎真空（托里拆利真空），存在微量水银饱和蒸汽，初中简化为真空</div>
              <div style={st.note}>④ 水银柱高度是<strong>竖直高度差</strong>，与管粗细、倾斜、上下移动无关。前提：管口始终不能离开液面</div>
              <div style={st.note}>⑤ 玻璃管倾斜：竖直高度不变，但管内水银<strong>斜向液柱长度变大</strong></div>
              <div style={st.note}>⑥ 管内混入空气 → p外=p气+ρgh → 水银柱变小 → 测量值偏小</div>
            </>)}
            {mode === 'altitude' && (<><div style={st.note}>① 海拔越高，气压越低</div><div style={st.note}>② 每升高约12m，气压降低1mmHg</div></>)}
            {mode === 'magdeburg' && (<><div style={st.note}>① 马德堡半球实验1654年</div><div style={st.note}>② F=Δp·S，标准大气压+真空需16匹马</div><div style={st.note}>③ 大气压朝各个方向都存在</div></>)}
          </div>
        </div>
        <div style={st.canvasArea}><canvas ref={canvasRef} style={st.canvas} /></div>
        <div style={st.rightPanel}>
          <div style={st.panelCard}>
            <div style={st.panelTitle}>📊 大气压分析</div>
            <div style={st.section}><div style={st.sectionLabel}>标准大气压（常量）</div><div style={st.eq}>p₀ = 1.013×10⁵ Pa = 760 mmHg</div></div>
            <div style={st.section}><div style={st.sectionLabel}>当前外部气压</div><div style={st.bigVal}>{(extPa / 1000).toFixed(1)} kPa</div><div style={st.subVal}>{(extPa / STD_ATM_PA * STD_HG_MM).toFixed(0)} mmHg</div></div>
            {mode === 'torricelli' && (<>
              <div style={st.section}><div style={st.sectionLabel}>真空理论高度 h₀</div><div style={st.calcBox}>h₀ = p/(ρg) = <strong>{h0_mm.toFixed(1)}</strong> mm<div style={{ fontSize: 9, color: '#aaa', marginTop: 2 }}>课本取760mm，微差来自ρ/g取值</div></div></div>
              {airLeak && (<>
                <div style={st.section}><div style={st.sectionLabel}>管内气体压强</div><div style={{ fontSize: 14, fontWeight: 700, color: '#9C27B0' }}>{(pGasPa / 1000).toFixed(1)} kPa</div></div>
                <div style={st.section}><div style={st.sectionLabel}>分压公式</div><div style={st.calcBox}>p外 = p_gas + ρgh<br />h = (p外−p_gas)/(ρg) = <strong style={{ color: '#FF6B6B' }}>{h_mm.toFixed(1)} mm</strong></div></div>
              </>)}
              {!airLeak && <div style={st.section}><div style={st.sectionLabel}>实际竖直高度 h</div><div style={{ fontSize: 16, fontWeight: 700, color: '#E6A800' }}>{h_mm.toFixed(1)} mm</div></div>}
              {tubeTilt && !tubeFailed && (
                <div style={st.section}><div style={st.sectionLabel}>倾斜管液柱</div>
                  <div style={{ fontSize: 12, color: '#555' }}>倾斜角 θ = <strong>{(theta * 180 / Math.PI).toFixed(1)}°</strong></div>
                  <div style={{ fontSize: 12, color: '#555', marginTop: 2 }}>竖直高度 h = <strong>{h_mm.toFixed(1)}</strong> mm（不变）</div>
                  <div style={{ fontSize: 12, color: '#FF9800', marginTop: 2 }}>斜向液柱 L = h/cosθ = <strong>{L_mm.toFixed(1)}</strong> mm（变长）</div>
                </div>
              )}
              <div style={st.warning}>⚠ 水银柱高度是<strong>竖直高度</strong>，与管粗细、倾斜无关<br />前提：管口始终不离开水银槽液面<br />⚠ 若管口离开液面，水银全部流出，实验失效</div>
            </>)}
            {mode === 'altitude' && (<>
              <div style={st.section}><div style={st.sectionLabel}>海拔信息</div>
                <R label="海拔" v={`${altitude} m`} c="#4CAF50" />
                <R label="气压" v={`${(Math.max(0, STD_HG_MM - altitude / 12)).toFixed(0)} mmHg`} c="#4A90D9" />
                <R label="" v={`${(Math.max(0, STD_HG_MM - altitude / 12) / STD_HG_MM * STD_ATM_PA / 1000).toFixed(1)} kPa`} c="#4A90D9" />
              </div>
            </>)}
            {mode === 'magdeburg' && (<>
              <div style={st.section}><div style={st.sectionLabel}>球内气压</div><div style={{ fontSize: 16, fontWeight: 700, color: '#9C27B0' }}>{innerKpa.toFixed(1)} kPa</div></div>
              <div style={st.section}><div style={st.sectionLabel}>拉开所需拉力</div><div style={st.forceBox}><span style={{ fontSize: 22, fontWeight: 700, color: '#f44336' }}>{reqF >= 1000 ? (reqF / 1000).toFixed(2) + ' kN' : reqF.toFixed(1) + ' N'}</span><span style={{ fontSize: 10, color: '#999' }}>≈ {(reqF / 9.8).toFixed(0)} kgf</span></div></div>
              {isStd && isVac && <div style={st.historyBox}>🐴 标准大气压+真空 → 需16匹马！</div>}
            </>)}
            {mode !== 'torricelli' && <div style={st.warning}>⚠ 760mmHg是海平面标准值。</div>}
          </div>
        </div>
      </div>
    </div>
  )
}

function R({ label, v, c }) { return <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}><span style={{ color: '#666' }}>{label}</span><span style={{ color: c, fontWeight: 700 }}>{v}</span></div> }

/* ==================== 托里拆利 ==================== */
function drawTorr(ctx, W, H, s, p) {
  if (W < 10 || H < 10) return
  const { h0_mm, h_mm, pGasPa, tubeTilt, airLeak, tubeFailed, tubeWidth } = p

  const tankCX = W * 0.42, tankY = H * 0.72, tankW = 170, tankH = 50
  const maxPx = H * 0.48
  const h0px = Math.max(0, Math.min(h0_mm / 800 * maxPx, maxPx))
  const hpx = Math.max(0, Math.min(h_mm / 800 * maxPx, maxPx))
  const tw = tubeWidth
  const angle = Math.max(0, Math.min(s.tiltAnim, Math.PI / 3))
  const cosA = Math.cos(angle) || 1, sinA = Math.sin(angle) || 0
  const tbX = tankCX + 35, tbY = tankY + Math.max(0, s.offsetAnim || 0)
  const failScale = tubeFailed ? Math.max(0, 1 - (s.failAnim || 0)) : 1
  const actualHpx = Math.max(0, hpx * failScale)
  const tLen = Math.min(h0px / cosA + 30, maxPx * 1.3)

  // ---- 水银槽 ----
  ctx.fillStyle = '#b0b0b0'
  ctx.beginPath(); ctx.roundRect(tankCX - tankW / 2, tankY, tankW, tankH, [0, 0, 8, 8]); ctx.fill()
  ctx.strokeStyle = '#888'; ctx.lineWidth = 2
  ctx.beginPath(); ctx.roundRect(tankCX - tankW / 2, tankY, tankW, tankH, [0, 0, 8, 8]); ctx.stroke()
  const hgG = ctx.createLinearGradient(0, tankY, 0, tankY + tankH)
  hgG.addColorStop(0, '#c0c0c0'); hgG.addColorStop(1, '#999')
  ctx.fillStyle = hgG; ctx.fillRect(tankCX - tankW / 2 + 4, tankY + 2, tankW - 8, tankH - 6)

  // 液面基准线
  ctx.strokeStyle = 'rgba(100, 150, 255, 0.5)'; ctx.lineWidth = 1.5; ctx.setLineDash([8, 5])
  ctx.beginPath(); ctx.moveTo(16, tankY + 2); ctx.lineTo(W - 16, tankY + 2); ctx.stroke(); ctx.setLineDash([])
  ctx.fillStyle = 'rgba(100, 150, 255, 0.6)'; ctx.font = '9px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'
  ctx.fillText('← 槽液面基准线', 18, tankY - 2)

  // 大气压箭头（只在槽液面）
  for (let i = 0; i < 3; i++) {
    const ax = tankCX - tankW / 2 + 10 + i * ((tankW - 20) / 2)
    ctx.strokeStyle = '#4A90D9'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(ax, tankY - 22); ctx.lineTo(ax, tankY - 4); ctx.stroke()
    ctx.fillStyle = '#4A90D9'
    ctx.beginPath(); ctx.moveTo(ax, tankY - 2); ctx.lineTo(ax - 5, tankY - 10); ctx.lineTo(ax + 5, tankY - 10); ctx.closePath(); ctx.fill()
  }
  ctx.fillStyle = '#4A90D9'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
  ctx.fillText('大气压 p₀ 压迫液面', tankCX, tankY - 26)

  // ---- 玻璃管壁（旋转绘制）----
  ctx.save(); ctx.translate(tbX, tbY); ctx.rotate(-angle)
  ctx.strokeStyle = '#666'; ctx.lineWidth = 2.5
  ctx.beginPath(); ctx.moveTo(-tw / 2, 0); ctx.lineTo(-tw / 2, -tLen); ctx.moveTo(tw / 2, 0); ctx.lineTo(tw / 2, -tLen); ctx.stroke()
  ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-tw / 2 - 2, -tLen); ctx.lineTo(tw / 2 + 2, -tLen); ctx.stroke()
  ctx.restore()

  // ---- 管内水银（多边形方案：顶面水平，侧壁贴紧管内壁）----
  if (actualHpx > 0.5) {
    const hgSurfaceY = tbY - actualHpx // 水银液面世界Y（水平，不随管倾斜）

    // 倾斜管壁的四角（世界坐标）
    const mouthLx = tbX - cosA * tw / 2, mouthLy = tbY + sinA * tw / 2
    const mouthRx = tbX + cosA * tw / 2, mouthRy = tbY - sinA * tw / 2

    // 水银液面与左右管壁的交点（水平线 y=hgSurfaceY 切管壁）
    const tL = (mouthLy - hgSurfaceY) / cosA
    const tR = (mouthRy - hgSurfaceY) / cosA
    const surfLx = mouthLx - sinA * tL, surfLy = hgSurfaceY
    const surfRx = mouthRx - sinA * tR, surfRy = hgSurfaceY

    // 水银多边形：管口左 → 沿左壁上到液面 → 水平跨到右壁交点 → 沿右壁下到管口右
    ctx.beginPath()
    ctx.moveTo(mouthLx, mouthLy)   // 管口左
    ctx.lineTo(surfLx, surfLy)     // 左壁与液面交点
    ctx.lineTo(surfRx, surfRy)     // 右壁与液面交点（水平液面）
    ctx.lineTo(mouthRx, mouthRy)   // 管口右
    ctx.closePath()

    const hgG2 = ctx.createLinearGradient(surfLx, hgSurfaceY, surfRx, hgSurfaceY)
    hgG2.addColorStop(0, '#aaa'); hgG2.addColorStop(0.5, '#d0d0d0'); hgG2.addColorStop(1, '#aaa')
    ctx.fillStyle = hgG2
    ctx.fill()
    // 液面高光线
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(surfLx, surfLy); ctx.lineTo(surfRx, surfRy); ctx.stroke()

    // 管顶内容（空气分子/真空标注）
    const midX = (surfLx + surfRx) / 2
    const tubeTopY = tbY - cosA * tLen
    const airTop = tubeTopY + 6
    const airBottom = hgSurfaceY
    if (airLeak && !tubeFailed && failScale > 0.99 && airBottom - airTop > 20) {
      const airCenterY = (airTop + airBottom) / 2
      ctx.fillStyle = 'rgba(200, 220, 255, 0.2)'
      ctx.fillRect(midX - tw / 3, airTop, tw * 2 / 3, airBottom - airTop)
      ctx.fillStyle = 'rgba(100, 150, 220, 0.6)'
      for (let i = 0; i < 14; i++) {
        const dx = midX + Math.sin(s.phase * 1.8 + i * 2.3) * (tw / 3 - 3)
        const dy = airTop + (airBottom - airTop) * (0.1 + (i / 14) * 0.8)
        ctx.beginPath(); ctx.arc(dx, dy, 1.8, 0, Math.PI * 2); ctx.fill()
      }
      ctx.fillStyle = '#9C27B0'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText('空气↓', midX, airCenterY - 4)
      ctx.fillText(`${(pGasPa / 1000).toFixed(1)}kPa`, midX, airCenterY + 10)
    } else if (!airLeak && h_mm > 10 && !tubeFailed) {
      ctx.fillStyle = '#4A90D9'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText('真空', midX, (airTop + airBottom) / 2)
    }
  }

  // ---- 失败提示 ----
  if (tubeFailed && s.failAnim > 0.3) {
    ctx.fillStyle = 'rgba(244, 67, 54, 0.9)'; ctx.font = 'bold 15px sans-serif'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('❌ 管口脱离液面，水银全部流回，实验失效！', W / 2, H * 0.12)
  }

  // ---- 世界坐标标注 ----
  if (h_mm > 2 && !tubeFailed && failScale > 0.99) {
    const hgSurfaceY = tbY - actualHpx // 水银液面世界Y（水平）

    // ① 黄色斜向虚线（沿管轴，从管口到水银面交点）
    if (angle > 0.02) {
      // 水银面与管中心线的交点
      const tCenter = (tbY - hgSurfaceY) / cosA
      const endX = tbX - sinA * tCenter
      const endY = hgSurfaceY
      ctx.strokeStyle = '#FF9800'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4])
      ctx.beginPath(); ctx.moveTo(tbX, tbY); ctx.lineTo(endX, endY); ctx.stroke(); ctx.setLineDash([])
      const lx = (tbX + endX) / 2 - 20, ly = (tbY + endY) / 2
      ctx.fillStyle = '#FF9800'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'
      const deg = (angle * 180 / Math.PI).toFixed(1)
      ctx.fillText(`θ = ${deg}°`, lx, ly - 10)
      ctx.fillText(`L = h/cosθ`, lx, ly + 4)
      ctx.fillText(`= ${(h_mm / Math.cos(angle)).toFixed(1)} mm`, lx, ly + 18)
    }

    // ② 红色竖直虚线（从水银面垂直向下到槽液面）
    const redX = tbX + (angle > 0.02 ? -sinA * (actualHpx / cosA) : 0) + tw / 2 + 20
    ctx.strokeStyle = '#FF4444'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4])
    ctx.beginPath(); ctx.moveTo(redX, hgSurfaceY); ctx.lineTo(redX, tankY + 2); ctx.stroke(); ctx.setLineDash([])
    ctx.beginPath(); ctx.moveTo(redX - 5, hgSurfaceY); ctx.lineTo(redX + 5, hgSurfaceY)
    ctx.moveTo(redX - 5, tankY + 2); ctx.lineTo(redX + 5, tankY + 2); ctx.stroke()
    ctx.fillStyle = '#FF4444'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    ctx.fillText(`h = ${h_mm.toFixed(1)} mm`, redX + 8, (hgSurfaceY + tankY + 2) / 2)
    ctx.font = '10px sans-serif'; ctx.fillText('（竖直高度）', redX + 8, (hgSurfaceY + tankY + 2) / 2 + 15)

    // ③ 水银液面水平参考线（从管内延伸到右侧）
    ctx.strokeStyle = 'rgba(100, 150, 255, 0.25)'; ctx.lineWidth = 1; ctx.setLineDash([6, 4])
    ctx.beginPath(); ctx.moveTo(leftX, hgSurfaceY); ctx.lineTo(W - 16, hgSurfaceY); ctx.stroke(); ctx.setLineDash([])
    ctx.fillStyle = 'rgba(100, 150, 255, 0.5)'; ctx.font = '9px sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'
    ctx.fillText(`液面水平`, W - 20, hgSurfaceY - 3)
  }

  // 标题
  ctx.fillStyle = '#333'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
  ctx.fillText('托里拆利实验', W / 2, H * 0.02)
  ctx.fillStyle = '#888'; ctx.font = '11px sans-serif'
  ctx.fillText(airLeak ? 'p外 = p_gas + ρgh' : 'p₀ = ρgh → h = p/(ρg)', W / 2, H * 0.02 + 18)
}

/* ---- 海拔与气压 ---- */
function drawAlt(ctx, W, H, s) {
  const cx = W / 2, mB = H * 0.8, mT = H * 0.15
  const altNorm = Math.max(0, Math.min(s.curAlt / 9000, 1))
  const pY = mB - altNorm * (mB - mT) // 红点Y坐标
  const curHg = Math.max(0, s.curHg) // 气压钳位≥0

  // 天空渐变
  const sky = ctx.createLinearGradient(0, 0, 0, mB)
  sky.addColorStop(0, '#87CEEB'); sky.addColorStop(1, '#e8f4f8')
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, mB)

  // 山体
  ctx.fillStyle = '#8B7355'
  ctx.beginPath()
  ctx.moveTo(cx - W * 0.35, mB); ctx.lineTo(cx - 20, mT)
  ctx.lineTo(cx + 20, mT); ctx.lineTo(cx + W * 0.35, mB)
  ctx.closePath(); ctx.fill()
  // 雪顶
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.moveTo(cx - 30, mT + 30); ctx.lineTo(cx - 20, mT)
  ctx.lineTo(cx + 20, mT); ctx.lineTo(cx + 30, mT + 30)
  ctx.closePath(); ctx.fill()

  // 左侧纵轴刻度线（0m/3000m/6000m/9000m）
  for (let a = 0; a <= 9000; a += 3000) {
    const y = mB - (a / 9000) * (mB - mT)
    ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 1; ctx.setLineDash([5, 5])
    ctx.beginPath(); ctx.moveTo(50, y); ctx.lineTo(W - 90, y); ctx.stroke(); ctx.setLineDash([])
    ctx.fillStyle = '#555'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    ctx.fillText(`${a}m`, 12, y)
  }

  // 红色海拔标记点（严格对应当前海拔高度）
  const pX = cx + 40
  ctx.fillStyle = '#FF6B6B'
  ctx.beginPath(); ctx.arc(pX, pY - 16, 7, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath()
  ctx.moveTo(pX, pY - 9); ctx.lineTo(pX - 8, pY + 5); ctx.lineTo(pX + 8, pY + 5)
  ctx.closePath(); ctx.fill()
  // 海拔标注
  ctx.fillStyle = '#FF6B6B'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
  ctx.fillText(`海拔：${s.curAlt.toFixed(0)} m`, pX + 16, pY - 24)
  // 气压标注
  const curPa = curHg / STD_HG_MM * STD_ATM_PA
  ctx.fillStyle = '#4A90D9'; ctx.font = '12px sans-serif'
  ctx.fillText(`气压：${(curPa / 1000).toFixed(1)} kPa (${curHg.toFixed(0)} mmHg)`, pX + 16, pY - 6)

  // 右侧蓝色气压计液柱（顶部白色=真空，蓝色=气压液柱）
  const bX = W - 70, bW = 30, bB = mB - 20, bT = mT + 20, bH = bB - bT
  const fillRatio = Math.max(0, Math.min(curHg / STD_HG_MM, 1)) // 0m满格，高空缩短
  const fillH = bH * fillRatio

  // 白色背景（真空区域）
  ctx.fillStyle = '#f8f8f8'; ctx.fillRect(bX, bT, bW, bH)
  // 蓝色液柱（从底部向上）
  if (fillH > 0) {
    const bG = ctx.createLinearGradient(0, bB - fillH, 0, bB)
    bG.addColorStop(0, '#4A90D9'); bG.addColorStop(1, '#2196F3')
    ctx.fillStyle = bG; ctx.fillRect(bX, bB - fillH, bW, fillH)
  }
  // 边框
  ctx.strokeStyle = '#333'; ctx.lineWidth = 1.5; ctx.strokeRect(bX, bT, bW, bH)
  // 标签
  ctx.fillStyle = '#333'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'; ctx.fillText('气压', bX + bW / 2, bT - 4)
  ctx.textBaseline = 'top'; ctx.fillText(`${curHg.toFixed(0)}mmHg`, bX + bW / 2, bB + 4)
  // 真空标注
  if (fillH > 30) {
    ctx.fillStyle = '#ccc'; ctx.font = '9px sans-serif'; ctx.textBaseline = 'middle'
    ctx.fillText('真空', bX + bW / 2, bT + 10)
  }
}

/* ---- 马德堡 ---- */
function drawMag(ctx, W, H, s, p) {
  const { sphereRadius, extPaM, deltaPa, reqF, isStd, isVac } = p
  const cx = W / 2, cy = H * 0.42, r = Math.max(50, sphereRadius * 2.8), sep = s.sep
  ctx.fillStyle = '#333'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText('马德堡半球实验', cx, H * 0.04)
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; for (const sd of [-1, 1]) { const hx = cx + sd * sep; const x1 = hx + Math.cos(a) * (r + 22), y1 = cy + Math.sin(a) * (r + 22), x2 = hx + Math.cos(a) * (r + 6), y2 = cy + Math.sin(a) * (r + 6); ctx.strokeStyle = 'rgba(74,144,217,0.4)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.fillStyle = 'rgba(74,144,217,0.4)'; ctx.beginPath(); ctx.arc(x2, y2, 3, 0, Math.PI * 2); ctx.fill() } }
  for (const sd of [-1, 1]) { const hx = cx + sd * sep; ctx.fillStyle = '#888'; ctx.beginPath(); if (sd < 0) ctx.arc(hx, cy, r, Math.PI * 0.5, Math.PI * 1.5); else ctx.arc(hx, cy, r, -Math.PI * 0.5, Math.PI * 0.5); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#555'; ctx.lineWidth = 2.5; ctx.beginPath(); if (sd < 0) ctx.arc(hx, cy, r, Math.PI * 0.5, Math.PI * 1.5); else ctx.arc(hx, cy, r, -Math.PI * 0.5, Math.PI * 0.5); ctx.closePath(); ctx.stroke() }
  if (sep < 3) { ctx.strokeStyle = '#444'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r); ctx.stroke() }
  if (s.pullF > 2 && !s.separated) { for (const sd of [-1, 1]) { const x = cx + sd * (sep + r + 12); const len = Math.min(60, s.pullF / Math.max(1, reqF) * 60); ctx.strokeStyle = s.pullF >= reqF ? '#4CAF50' : '#FF6B6B'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, cy); ctx.lineTo(x + sd * len, cy); ctx.stroke(); ctx.fillStyle = ctx.strokeStyle; ctx.beginPath(); ctx.moveTo(x + sd * len, cy); ctx.lineTo(x + sd * (len - 8), cy - 5); ctx.lineTo(x + sd * (len - 8), cy + 5); ctx.closePath(); ctx.fill(); ctx.font = 'bold 11px sans-serif'; ctx.textAlign = sd > 0 ? 'left' : 'right'; ctx.fillText(`F=${s.pullF.toFixed(0)}N`, x + sd * (len + 4), cy - 6) } }
  if (s.separated) { ctx.fillStyle = '#4CAF50'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText('🔓 半球已分开！', cx, cy + r + 28) }
  else if (s.pullF > 2) { ctx.fillStyle = '#FF6B6B'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(`🔒 拉力不足（还差 ${Math.max(0, reqF - s.pullF).toFixed(0)} N）`, cx, cy + r + 28) }
  else { ctx.fillStyle = '#888'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText('按住"拉动"按钮', cx, cy + r + 28) }
  if (isStd && isVac && !s.separated) { ctx.fillStyle = '#E65100'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText('🐴 标准大气压+真空 → 需16匹马！', cx, cy + r + 48) }
}

/* ==================== 样式 ==================== */
const st = {
  container: { display: 'flex', flexDirection: 'column', height: '100vh', background: '#f0f0f0', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  header: { display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', background: '#fff', borderBottom: '1px solid #ddd', flexShrink: 0 },
  title: { fontSize: 16, fontWeight: 700, color: '#333' }, grade: { fontSize: 11, color: '#fff', background: '#4A90D9', borderRadius: 4, padding: '2px 8px' },
  formula: { fontSize: 13, fontWeight: 600, color: '#E6A800', fontFamily: 'serif', marginLeft: 'auto' },
  body: { flex: 1, display: 'flex', overflow: 'hidden' },
  sidebar: { width: 260, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8, padding: 10, overflow: 'auto', borderRight: '1px solid #ddd', background: '#fafafa' },
  card: { background: '#fff', borderRadius: 8, padding: 12, border: '1px solid #e0e0e0' }, cardTitle: { fontSize: 13, fontWeight: 700, color: '#333', marginBottom: 10 },
  modeBtn: { display: 'block', width: '100%', padding: '8px 10px', marginBottom: 6, borderRadius: 6, border: '1px solid #ddd', cursor: 'pointer', textAlign: 'left' },
  sliderGroup: { marginBottom: 12 }, sliderLabel: { display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#444', marginBottom: 4 },
  valBlue: { color: '#4A90D9', fontWeight: 700 }, valGreen: { color: '#4CAF50', fontWeight: 700 }, valOrange: { color: '#FF9800', fontWeight: 700 }, valPurple: { color: '#9C27B0', fontWeight: 700 },
  slider: { width: '100%' }, range: { fontSize: 10, color: '#999', marginTop: 2 },
  readonlyBox: { display: 'flex', flexDirection: 'column', gap: 2, background: '#FFF8E1', borderRadius: 6, padding: '8px 12px', marginTop: 4, border: '1px solid #FFE082' },
  cbLabel: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#444', cursor: 'pointer' },
  nonStd: { fontSize: 10, color: '#E65100', background: '#FFF3E0', borderRadius: 4, padding: '5px 8px', border: '1px solid #FFE0B2', marginBottom: 8 },
  pullBtn: { flex: 1, padding: '12px', borderRadius: 6, border: '1px solid #FF9800', background: '#FFF3E0', color: '#E65100', fontWeight: 700, fontSize: 13, cursor: 'pointer' },
  resetBtn: { padding: '10px 14px', borderRadius: 6, border: '1px solid #4A90D9', background: '#E3F2FD', color: '#1565C0', fontWeight: 600, fontSize: 12, cursor: 'pointer' },
  note: { fontSize: 11, color: '#555', lineHeight: 1.6, marginBottom: 5 },
  canvasArea: { flex: 1, display: 'flex', overflow: 'hidden', background: '#fff' }, canvas: { flex: 1, width: '100%' },
  rightPanel: { width: 260, flexShrink: 0, padding: 10, overflow: 'auto', borderLeft: '1px solid #ddd', background: '#fafafa' },
  panelCard: { background: '#fff', borderRadius: 8, padding: 14, border: '1px solid #e0e0e0' }, panelTitle: { fontSize: 14, fontWeight: 700, color: '#333', marginBottom: 12 },
  section: { marginBottom: 14 }, sectionLabel: { fontSize: 10, fontWeight: 700, color: '#888', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 },
  bigVal: { fontSize: 24, fontWeight: 700, color: '#4A90D9' }, subVal: { fontSize: 12, color: '#888', marginTop: 2 },
  eq: { fontSize: 12, color: '#555', fontFamily: 'serif', marginBottom: 2 },
  calcBox: { background: '#f8f8f8', borderRadius: 6, padding: '8px 12px', fontFamily: 'serif', fontSize: 13, color: '#333', lineHeight: 1.8 },
  forceBox: { display: 'flex', flexDirection: 'column', gap: 2, background: '#FFF8E1', borderRadius: 6, padding: '10px 12px', alignItems: 'center' },
  historyBox: { fontSize: 11, color: '#E65100', background: '#FFF8E1', borderRadius: 6, padding: '8px 10px', border: '1px solid #FFE082', marginBottom: 10, lineHeight: 1.5 },
  warning: { fontSize: 10, color: '#E65100', background: '#FFF3E0', borderRadius: 4, padding: '6px 8px', lineHeight: 1.5, border: '1px solid #FFE0B2' },
}
