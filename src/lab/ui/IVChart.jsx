/**
 * IVChart — I-V曲线实时图表（Canvas2D）
 *
 * 特性：
 * - 实时绘制电压-电流关系
 * - 自动缩放坐标轴
 * - 网格 + 刻度
 * - 数据点连线 + 最新点高亮
 */

import { useRef, useEffect, useCallback } from 'react'

export default function IVChart({ data = [], width = 190, height = 140 }) {
  const canvasRef = useRef(null)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    // 背景
    ctx.fillStyle = '#0d1117'
    ctx.fillRect(0, 0, width, height)

    const pad = { top: 12, right: 10, bottom: 22, left: 32 }
    const plotW = width - pad.left - pad.right
    const plotH = height - pad.top - pad.bottom

    // 数据范围
    if (data.length === 0) {
      ctx.fillStyle = '#484f58'
      ctx.font = '11px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('暂无数据', width / 2, height / 2)
      return
    }

    let maxV = 0, maxI = 0
    for (const d of data) {
      if (d.v > maxV) maxV = d.v
      if (d.i > maxI) maxI = d.i
    }
    maxV = Math.max(maxV * 1.2, 0.1)
    maxI = Math.max(maxI * 1.2, 0.01)

    // 网格
    ctx.strokeStyle = '#21262d'
    ctx.lineWidth = 0.5
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (plotH / 4) * i
      ctx.beginPath()
      ctx.moveTo(pad.left, y)
      ctx.lineTo(pad.left + plotW, y)
      ctx.stroke()

      const x = pad.left + (plotW / 4) * i
      ctx.beginPath()
      ctx.moveTo(x, pad.top)
      ctx.lineTo(x, pad.top + plotH)
      ctx.stroke()
    }

    // 坐标轴
    ctx.strokeStyle = '#30363d'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(pad.left, pad.top)
    ctx.lineTo(pad.left, pad.top + plotH)
    ctx.lineTo(pad.left + plotW, pad.top + plotH)
    ctx.stroke()

    // 刻度标签
    ctx.fillStyle = '#8b949e'
    ctx.font = '9px monospace'
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    for (let i = 0; i <= 4; i++) {
      const val = (maxI / 4) * (4 - i)
      const y = pad.top + (plotH / 4) * i
      ctx.fillText(val.toFixed(2), pad.left - 3, y)
    }
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    for (let i = 0; i <= 4; i++) {
      const val = (maxV / 4) * i
      const x = pad.left + (plotW / 4) * i
      ctx.fillText(val.toFixed(1), x, pad.top + plotH + 3)
    }

    // 轴标签
    ctx.fillStyle = '#8b949e'
    ctx.font = '9px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('U (V)', pad.left + plotW / 2, height - 3)
    ctx.save()
    ctx.translate(8, pad.top + plotH / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.fillText('I (A)', 0, 0)
    ctx.restore()

    // 数据线
    if (data.length >= 2) {
      ctx.strokeStyle = '#4CAF50'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      for (let i = 0; i < data.length; i++) {
        const x = pad.left + (data[i].v / maxV) * plotW
        const y = pad.top + plotH - (data[i].i / maxI) * plotH
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
    }

    // 数据点
    for (let i = 0; i < data.length; i++) {
      const x = pad.left + (data[i].v / maxV) * plotW
      const y = pad.top + plotH - (data[i].i / maxI) * plotH
      const isLast = i === data.length - 1

      ctx.beginPath()
      ctx.arc(x, y, isLast ? 4 : 2, 0, Math.PI * 2)
      ctx.fillStyle = isLast ? '#FFD700' : '#4CAF50'
      ctx.fill()
      if (isLast) {
        ctx.strokeStyle = '#FFD700'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.arc(x, y, 7, 0, Math.PI * 2)
        ctx.stroke()
      }
    }

    // 数据点数
    ctx.fillStyle = '#484f58'
    ctx.font = '9px monospace'
    ctx.textAlign = 'right'
    ctx.fillText(`${data.length}点`, width - pad.right, pad.top + 2)
  }, [data, width, height])

  useEffect(() => { draw() }, [draw])

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height, borderRadius: 4, border: '1px solid #21262d' }}
    />
  )
}
