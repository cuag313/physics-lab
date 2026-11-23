/**
 * MotorNBSpinLayer —— 电动机（NB 原厂分层贴图）转子的运动层（自己动手页）
 *
 * 为什么单独一层：BuilderSVG 的器材卡片是每 ~250 ms 用 dangerouslySetInnerHTML 重建的，
 * 卡片里的动画会被反复冻回起始帧；这里自己跑 rAF，每帧只换"第几帧"。
 *
 * 图集：mt_coil_sheet.png = 28 帧线圈横排（每帧 191×324），mt_ring_sheet.png = 28 帧换向器（81×85）。
 * 换帧的做法是把整条图集往左平移 k 帧、再用 clip 裁出那一格 —— 不重画、不缩放，贴图永远是原厂的。
 *
 * 转速 ∝ 电流（和演示页同一口径）：|I| ≤ 0.02 A 视为没通电，停在上一角度；
 * 接线柱接反（I 为负）→ 反转（帧号往回走）。整周 28 帧，所以一帧 = 12.86°。
 */
import { useEffect, useRef } from 'react'
import { MOTOR_NB, motorFrameImg } from '../scenes/electricSvgInstruments.js'

export default function MotorNBSpinLayer({ I = 0 }) {
  const gRef = useRef(null)
  const st = useRef({ ang: 0, frame: 0 })

  useEffect(() => {
    let raf = 0
    let last = performance.now()
    const m = MOTOR_NB
    const clip =
      `<defs><clipPath id="nbmc"><rect x="${m.coil.x}" y="${m.coil.y}" width="${m.coil.w}" height="${m.coil.h}"/></clipPath>` +
      `<clipPath id="nbmr"><rect x="${m.ring.x}" y="${m.ring.y}" width="${m.ring.w}" height="${m.ring.h}"/></clipPath></defs>`

    const paint = () => {
      const k = Math.floor(st.current.frame)
      if (gRef.current) {
        gRef.current.innerHTML =
          clip +
          motorFrameImg('mt_coil_sheet.png', m.coil, k, 'nbmc', m.coil.n) +
          motorFrameImg('mt_ring_sheet.png', m.ring, k, 'nbmr', m.ring.n)
      }
    }
    paint()

    const loop = (now) => {
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000))
      last = now
      const i = Math.abs(I)
      if (i > 0.02) {
        const w = (1.9 + 2.2 * Math.min(1.4, i)) * (I < 0 ? -1 : 1)
        st.current.ang += w * dt
        st.current.frame = (st.current.ang / (Math.PI * 2)) * m.coil.n
        paint()
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [I])

  return (
    <svg
      viewBox={`0 0 ${MOTOR_NB.aw} ${MOTOR_NB.ah}`}
      style={{
        position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none',
      }}
      aria-hidden="true"
    >
      <g ref={gRef} />
    </svg>
  )
}
