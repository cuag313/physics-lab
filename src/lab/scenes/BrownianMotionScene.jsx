import { useRef, useEffect, useState, useCallback } from 'react'

/**
 * BrownianMotionScene — 布朗运动模拟
 *
 * - 花粉颗粒受水分子碰撞的随机运动
 * - 温度越高运动越剧烈
 * - 可调温度和粒子数
 * - 轨迹记录
 */
export default function BrownianMotionScene() {
  const canvasRef = useRef(null)
  const [temperature, setTemperature] = useState(300)
  const [particleCount, setParticleCount] = useState(1)
  const [showTrail, setShowTrail] = useState(true)
  const [paused, setPaused] = useState(false)
  const S = useRef({ particles: [], molecules: [], trails: [], raf: null, last: 0 })

  const init = useCallback(() => {
    const cvs = canvasRef.current
    if (!cvs) return
    const w = cvs.width, h = cvs.height
    const s = S.current
    // 花粉颗粒
    s.particles = Array.from({ length: particleCount }, () => ({
      x: w / 2 + (Math.random() - 0.5) * 200,
      y: h / 2 + (Math.random() - 0.5) * 200,
      vx: 0, vy: 0, r: 6,
    }))
    // 水分子（大量小粒子）
    s.molecules = Array.from({ length: 80 }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      vx: (Math.random() - 0.5) * 4, vy: (Math.random() - 0.5) * 4, r: 2,
    }))
    s.trails = s.particles.map(() => [])
  }, [particleCount])

  useEffect(() => {
    const cvs = canvasRef.current
    if (!cvs) return
    const ctx = cvs.getContext('2d')
    const resize = () => { cvs.width = cvs.clientWidth * devicePixelRatio; cvs.height = cvs.clientHeight * devicePixelRatio }
    resize()
    window.addEventListener('resize', resize)
    init()

    const loop = (ts) => {
      const dt = Math.min((ts - (S.current.last || ts)) / 1000, 0.05)
      S.current.last = ts
      const s = S.current
      const w = cvs.width, h = cvs.height
      const speed = temperature / 300

      if (!paused) {
        // 更新水分子
        s.molecules.forEach(m => {
          m.x += m.vx * speed * 60 * dt
          m.y += m.vy * speed * 60 * dt
          if (m.x < 0 || m.x > w) m.vx *= -1
          if (m.y < 0 || m.y > h) m.vy *= -1
          m.x = Math.max(0, Math.min(w, m.x))
          m.y = Math.max(0, Math.min(h, m.y))
        })

        // 花粉受随机碰撞
        s.particles.forEach((p, i) => {
          // 随机力（模拟分子碰撞）
          const force = speed * 80
          p.vx += (Math.random() - 0.5) * force * dt
          p.vy += (Math.random() - 0.5) * force * dt
          // 阻尼
          p.vx *= 0.96
          p.vy *= 0.96
          p.x += p.vx * 60 * dt
          p.y += p.vy * 60 * dt
          // 边界反弹
          if (p.x < p.r) { p.x = p.r; p.vx = Math.abs(p.vx) * 0.5 }
          if (p.x > w - p.r) { p.x = w - p.r; p.vx = -Math.abs(p.vx) * 0.5 }
          if (p.y < p.r) { p.y = p.r; p.vy = Math.abs(p.vy) * 0.5 }
          if (p.y > h - p.r) { p.y = h - p.r; p.vy = -Math.abs(p.vy) * 0.5 }
          // 记录轨迹
          if (showTrail) {
            s.trails[i].push({ x: p.x, y: p.y })
            if (s.trails[i].length > 300) s.trails[i].shift()
          }
        })
      }

      // 绘制
      ctx.save()
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
      const W = cvs.clientWidth, H = cvs.clientHeight
      ctx.clearRect(0, 0, W, H)

      // 背景
      ctx.fillStyle = '#E3F2FD'
      ctx.fillRect(0, 0, W, H)

      // 水分子
      ctx.fillStyle = 'rgba(33,150,243,0.3)'
      s.molecules.forEach(m => {
        ctx.beginPath()
        ctx.arc(m.x / devicePixelRatio, m.y / devicePixelRatio, m.r, 0, Math.PI * 2)
        ctx.fill()
      })

      // 轨迹
      if (showTrail) {
        s.trails.forEach(trail => {
          if (trail.length < 2) return
          ctx.strokeStyle = 'rgba(244,67,54,0.3)'
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.moveTo(trail[0].x / devicePixelRatio, trail[0].y / devicePixelRatio)
          for (let i = 1; i < trail.length; i++) {
            ctx.lineTo(trail[i].x / devicePixelRatio, trail[i].y / devicePixelRatio)
          }
          ctx.stroke()
        })
      }

      // 花粉颗粒
      s.particles.forEach(p => {
        const cx = p.x / devicePixelRatio, cy = p.y / devicePixelRatio
        // 花粉（橙色不规则形状模拟）
        ctx.fillStyle = '#FF8F00'
        ctx.beginPath()
        ctx.arc(cx, cy, p.r, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = '#E65100'
        ctx.lineWidth = 1.5
        ctx.stroke()
        // 高光
        ctx.fillStyle = 'rgba(255,255,255,0.4)'
        ctx.beginPath()
        ctx.arc(cx - 2, cy - 2, p.r * 0.4, 0, Math.PI * 2)
        ctx.fill()
      })

      // 标注
      ctx.fillStyle = '#1565C0'
      ctx.font = 'bold 13px sans-serif'
      ctx.fillText(`T = ${temperature} K`, 12, 22)
      ctx.fillStyle = '#555'
      ctx.font = '12px sans-serif'
      ctx.fillText(`花粉颗粒: ${particleCount}`, 12, 40)
      ctx.fillText(`温度越高，布朗运动越剧烈`, 12, 56)

      ctx.restore()
      s.raf = requestAnimationFrame(loop)
    }
    s.raf = requestAnimationFrame(loop)
    return () => { cancelAnimationFrame(s.raf); window.removeEventListener('resize', resize) }
  }, [temperature, particleCount, showTrail, paused, init])

  return (
    <div style={styles.container}>
      <div style={styles.topBar}>
        <span style={styles.title}>布朗运动模拟</span>
        <div style={styles.topActions}>
          <button style={styles.setBtn} onClick={() => { S.current.trails = S.current.particles.map(() => []) }}>清除轨迹</button>
          <button style={styles.setBtn} onClick={() => setPaused(p => !p)}>{paused ? '▶ 继续' : '⏸ 暂停'}</button>
          <button style={styles.setBtn} onClick={init}>⚙ 重置</button>
        </div>
      </div>
      <div style={styles.controlBar}>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>温度 T</span>
          <input type="range" min="100" max="800" step="10" value={temperature}
            onChange={e => setTemperature(+e.target.value)} style={styles.slider} />
          <span style={styles.sliderVal}>{temperature} K</span>
        </label>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>花粉数</span>
          <input type="range" min="1" max="5" step="1" value={particleCount}
            onChange={e => setParticleCount(+e.target.value)} style={styles.slider} />
          <span style={styles.sliderVal}>{particleCount}</span>
        </label>
        <label style={styles.controlLabel}>
          <input type="checkbox" checked={showTrail} onChange={e => setShowTrail(e.target.checked)} />
          <span style={styles.controlName}>轨迹</span>
        </label>
      </div>
      <div style={styles.main}>
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
      </div>
      <div style={styles.desc}>
        <b>实验：布朗运动</b>
        <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
          模拟花粉颗粒受水分子碰撞的随机运动。温度越高，分子热运动越剧烈，布朗运动越明显。
        </span>
      </div>
    </div>
  )
}

const styles = {
  container: { display: 'flex', flexDirection: 'column', height: '100vh', maxHeight: '100vh', background: '#e8e8e8', color: '#333', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', overflow: 'hidden' },
  topBar: { background: '#f5f5f5', borderBottom: '1px solid #ccc', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', flexShrink: 0 },
  title: { fontSize: 14, fontWeight: 600 },
  topActions: { display: 'flex', gap: 6 },
  controlBar: { background: '#fafafa', borderBottom: '1px solid #ddd', display: 'flex', alignItems: 'center', padding: '4px 12px', flexShrink: 0, gap: 12 },
  controlLabel: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#555' },
  controlName: { fontWeight: 600, color: '#4A90D9' },
  slider: { width: 120, accentColor: '#4A90D9' },
  sliderVal: { color: '#4A90D9', fontWeight: 600, fontSize: 12, minWidth: 50 },
  setBtn: { background: '#7B1FA2', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', fontSize: 12, cursor: 'pointer' },
  main: { flex: 1, minHeight: 0, background: '#fff' },
  desc: { padding: '6px 14px', background: '#fff', borderTop: '1px solid #ddd', fontSize: 13, flexShrink: 0 },
}
