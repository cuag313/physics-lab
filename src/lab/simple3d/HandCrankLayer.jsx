/**
 * HandCrankLayer —— 手摇发电机的"飞轮 + 转子线圈"运动层（自己动手页）
 *
 * 为什么单独一层：BuilderSVG 的器材卡片是每 ~250 ms 用 dangerouslySetInnerHTML 重建的，
 * 字符串里的动画会被反复冻回起始帧；这里用 <img> + CSS rotate 每帧改 transform，
 * 与卡片重渲染解耦。
 *
 * 交互：按住飞轮（圆盘区域）拖动 = 手摇。角速度换算成转速 spd（r/s，限 6），
 * 松手后按 30 r/s² 衰减。转角与转速存在父组件的 crankRef（Map: id → state），
 * 父组件每 ~70 ms 读一次，换算成瞬时电动势写回 comp.emf 再解一遍电路。
 * 另外 s.auto = true 时（工具栏按了「摇起来」）转速自动拉到 6 r/s 并保持，松手也不衰减；
 * 这时按住飞轮拖动不生效，避免按钮和手摇抢转速。
 */
import { useEffect, useRef, useState } from 'react'
import { figURL, HG_CRANK } from '../scenes/electricSvgInstruments.js'

export default function HandCrankLayer({ id, crankRef }) {
  const [, setTick] = useState(0)
  const dragRef = useRef(false)

  const s = (() => {
    const map = crankRef.current
    let v = map.get(id)
    if (!v) {
      v = { ang: 0, spd: 0, dir: 1, drag: false, auto: false, lastAng: 0, lastT: 0 }
      map.set(id, v)
    }
    return v
  })()

  useEffect(() => {
    const s = crankRef.current.get(id)
    let raf = 0
    let last = performance.now()
    const loop = (now) => {
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000))
      last = now
      if (s.auto && !s.drag) {
        /* 自动起转：0.4 s 内升到工具栏设定的转速（spinSpeed，缺省 6 r/s 才看得见灯泡亮）；
           慢摇（1~2 r/s）时电流低于 10 Hz，灵敏电流计的指针就能左右对称地摆起来 */
        const target = Math.min(6, Math.max(0.5, s.autoSpd || 6))
        if (s.spd < target) s.spd = Math.min(target, s.spd + dt * 15)
        else s.spd = Math.max(target, s.spd - dt * 15)
      } else if (!s.drag && s.spd > 0) {
        s.spd = Math.max(0, s.spd - dt * 30)
      }
      if (s.spd > 0.004 || s.drag) {
        s.ang += 2 * Math.PI * s.spd * s.dir * dt
        setTick((n) => n + 1)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [id, crankRef])

  const onDown = (e) => {
    e.stopPropagation()
    e.preventDefault()
    if (s.auto) return // 自动摇起来时不接受手摇，免得两套转速打架
    const el = e.currentTarget
    try { el.setPointerCapture(e.pointerId) } catch { /* 老浏览器没有指针捕获 */ }
    const r = el.getBoundingClientRect()
    s.lastAng = Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2))
    s.lastT = performance.now()
    s.drag = true
    dragRef.current = true
    setTick((n) => n + 1)
  }
  const onMove = (e) => {
    if (!s.drag) return
    e.stopPropagation()
    const el = e.currentTarget
    const r = el.getBoundingClientRect()
    const ang = Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2))
    let d = ang - s.lastAng
    while (d > Math.PI) d -= Math.PI * 2
    while (d < -Math.PI) d += Math.PI * 2
    s.ang += d
    s.lastAng = ang
    const now = performance.now()
    const dt = Math.max(0.008, (now - s.lastT) / 1000)
    s.lastT = now
    /* 角速度 → 转速（r/s），限幅 6（与演示页同一标度：6 r/s ↔ 峰值 6 V） */
    const rev = Math.min(6, Math.abs(d) / (2 * Math.PI) / dt)
    s.spd = s.spd * 0.55 + rev * 0.45
    if (Math.abs(d) > 0.002) s.dir = d > 0 ? 1 : -1
    setTick((n) => n + 1)
  }
  const onUp = (e) => {
    s.drag = false
    dragRef.current = false
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* noop */ }
    setTick((n) => n + 1)
  }

  const deg = (s.ang * 180) / Math.PI
  const idle = s.spd < 0.02 && !s.drag

  return (
    <div
      style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible',
      }}
    >
      {/* 转子线圈（皮带增速：2 倍） */}
      <img
        src={figURL('hg_coil.png')}
        alt=""
        draggable={false}
        style={{
          position: 'absolute',
          left: HG_CRANK.coilX - HG_CRANK.coilW / 2,
          top: HG_CRANK.coilY - HG_CRANK.coilH / 2,
          width: HG_CRANK.coilW, height: HG_CRANK.coilH,
          transform: `rotate(${(deg * 2).toFixed(1)}deg)`,
          pointerEvents: 'none',
        }}
      />
      {/* 飞轮：按住它拖 = 手摇（这一块吃掉指针事件，不会把整台机器拖走） */}
      <div
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        style={{
          position: 'absolute',
          left: HG_CRANK.hubX - HG_CRANK.hubR,
          top: HG_CRANK.hubY - HG_CRANK.hubR,
          width: HG_CRANK.hubR * 2, height: HG_CRANK.hubR * 2,
          pointerEvents: 'auto', cursor: 'grab', touchAction: 'none',
          borderRadius: '50%',
        }}
      >
        <img
          src={figURL('hg_crank.png')}
          alt=""
          draggable={false}
          style={{
            width: '100%', height: '100%',
            transform: `rotate(${deg.toFixed(1)}deg)`,
            pointerEvents: 'none',
          }}
        />
        {idle && (
          <div
            style={{
              position: 'absolute', inset: 2, borderRadius: '50%',
              border: '1.5px dashed rgba(37,99,235,0.55)', pointerEvents: 'none',
            }}
          />
        )}
      </div>
    </div>
  )
}
