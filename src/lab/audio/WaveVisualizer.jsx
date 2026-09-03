import { useRef, useEffect, useCallback } from 'react'

/**
 * WaveVisualizer — 声波可视化 Canvas 组件
 *
 * 模式：
 * - 'waveform'：时域波形（示波器），横轴自适应显示4-6个完整周期
 * - 'spectrum'：FFT频谱，横轴Hz，纵轴振幅
 * - 'both'：上下分屏
 */
export default function WaveVisualizer({
  getWaveform,
  getSpectrum,
  mode = 'waveform',
  freq = 440,           // 当前频率，用于自适应时间轴
  sampleRate = 44100,   // 采样率
  lineColor = '#1976D2',
  lineColor2 = '#D32F2F', // 第二路颜色（拍频）
  waveType = 'sine',
  style = {},
}) {
  const canvasRef = useRef(null)
  const animRef = useRef(null)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()

    if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      ctx.scale(dpr, dpr)
    }

    const w = rect.width
    const h = rect.height

    ctx.fillStyle = 'rgba(255,255,255,0.97)'
    ctx.fillRect(0, 0, w, h)

    if (mode === 'both') {
      drawWaveform(ctx, w, h / 2 - 1, getWaveform, freq, sampleRate, lineColor, waveType)
      ctx.strokeStyle = 'rgba(0,0,0,0.08)'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke()
      drawSpectrum(ctx, w, h / 2 - 1, h / 2 + 1, getSpectrum, sampleRate, lineColor)
    } else if (mode === 'spectrum') {
      drawSpectrum(ctx, w, h, 0, getSpectrum, sampleRate, lineColor)
    } else {
      drawWaveform(ctx, w, h, getWaveform, freq, sampleRate, lineColor, waveType)
    }

    animRef.current = requestAnimationFrame(draw)
  }, [getWaveform, getSpectrum, mode, freq, sampleRate, lineColor, waveType])

  function drawWaveform(ctx, w, h, getData, freq, sr, color, wType) {
    const data = getData?.()
    const ox = 45, oy = 12, pw = w - ox - 12, ph = h - oy * 2 - 14

    // 网格
    ctx.strokeStyle = 'rgba(0,0,0,0.05)'; ctx.lineWidth = 0.5
    for (let i = 0; i <= 4; i++) {
      const y = oy + ph * i / 4
      ctx.beginPath(); ctx.moveTo(ox, y); ctx.lineTo(ox + pw, y); ctx.stroke()
    }

    // 中线
    ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(ox, oy + ph / 2); ctx.lineTo(ox + pw, oy + ph / 2); ctx.stroke()

    // y轴刻度
    ctx.fillStyle = 'rgba(100,100,100,0.5)'; ctx.font = '8px monospace'
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle'
    ctx.fillText('+1', ox - 4, oy + 2)
    ctx.fillText('0', ox - 4, oy + ph / 2)
    ctx.fillText('-1', ox - 4, oy + ph - 2)

    // 标签
    ctx.fillStyle = '#888'; ctx.font = '9px sans-serif'
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('时域波形', ox + pw / 2, oy + ph + 4)

    if (!data) {
      ctx.fillStyle = 'rgba(139,148,158,0.3)'; ctx.font = '11px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('点击"发声"查看波形', ox + pw / 2, oy + ph / 2)
      return
    }

    // ★ 自适应：显示4-6个完整周期
    const targetCycles = 5
    const samplesPerCycle = sr / Math.max(freq, 1)
    const visibleSamples = Math.min(data.length, Math.round(targetCycles * samplesPerCycle))
    const startIdx = Math.max(0, Math.floor((data.length - visibleSamples) / 2))

    // 波形
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.lineJoin = 'round'
    ctx.beginPath()
    const sliceWidth = pw / visibleSamples
    for (let i = 0; i < visibleSamples; i++) {
      const di = startIdx + i
      if (di >= data.length) break
      const v = (data[di] - 128) / 128
      const x = ox + i * sliceWidth
      const y = oy + ph / 2 - v * (ph / 2 - 4)
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
    }
    ctx.stroke()

    // x轴刻度（时间）
    ctx.fillStyle = 'rgba(100,100,100,0.4)'; ctx.font = '8px monospace'
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    const totalTime = visibleSamples / sr * 1000  // ms
    for (let i = 0; i <= 4; i++) {
      const x = ox + pw * i / 4
      const t = totalTime * i / 4
      ctx.fillText(`${t.toFixed(1)}`, x, oy + ph + 2)
      if (i > 0 && i < 4) {
        ctx.strokeStyle = 'rgba(0,0,0,0.04)'; ctx.lineWidth = 0.5
        ctx.beginPath(); ctx.moveTo(x, oy); ctx.lineTo(x, oy + ph); ctx.stroke()
      }
    }
    ctx.fillStyle = '#888'; ctx.font = '9px sans-serif'
    ctx.fillText('t (ms)', ox + pw / 2, oy + ph + 12)
  }

  function drawSpectrum(ctx, w, h, offsetY, getData, sr, color) {
    const data = getData?.()
    const ox = 45, oy = offsetY + 12, pw = w - ox - 12, ph = h - 26

    // 网格
    ctx.strokeStyle = 'rgba(0,0,0,0.05)'; ctx.lineWidth = 0.5
    for (let i = 0; i <= 4; i++) {
      const y = oy + ph * i / 4
      ctx.beginPath(); ctx.moveTo(ox, y); ctx.lineTo(ox + pw, y); ctx.stroke()
    }

    // y轴
    ctx.fillStyle = 'rgba(100,100,100,0.5)'; ctx.font = '8px monospace'
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle'
    ctx.fillText('max', ox - 4, oy + 4)
    ctx.fillText('0', ox - 4, oy + ph)

    // y轴标签
    ctx.save()
    ctx.translate(10, oy + ph / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.fillStyle = '#888'; ctx.font = '9px sans-serif'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('振幅', 0, 0)
    ctx.restore()

    // 标签
    ctx.fillStyle = '#888'; ctx.font = '9px sans-serif'
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText('频谱 (FFT)  横轴: 频率(Hz)  纵轴: 振幅', ox + pw / 2, oy + ph + 4)

    if (!data) {
      ctx.fillStyle = 'rgba(139,148,158,0.3)'; ctx.font = '11px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('发声后显示频谱', ox + pw / 2, oy + ph / 2)
      return
    }

    // 频谱：横轴Hz，显示到5kHz
    const maxFreq = 5000
    const binCount = data.length
    const freqPerBin = sr / (binCount * 2)
    const maxBin = Math.min(Math.floor(maxFreq / freqPerBin), binCount)

    // 柱状图
    const barW = Math.max(1.5, pw / maxBin - 0.5)
    for (let i = 1; i < maxBin; i++) {
      const v = data[i] / 255
      if (v < 0.01) continue
      const barH = v * ph
      const x = ox + (i / maxBin) * pw
      // 颜色按频率渐变
      const hue = 200 + (i / maxBin) * 60  // 蓝→紫
      ctx.fillStyle = `hsla(${hue}, 70%, 50%, ${0.3 + v * 0.7})`
      ctx.fillRect(x, oy + ph - barH, barW, barH)
    }

    // x轴刻度（Hz）
    ctx.fillStyle = 'rgba(100,100,100,0.5)'; ctx.font = '8px monospace'
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    const hzSteps = [500, 1000, 2000, 3000, 4000, 5000]
    for (const hz of hzSteps) {
      const x = ox + (hz / maxFreq) * pw
      if (x > ox + pw - 10) continue
      ctx.fillText(`${hz}`, x, oy + ph + 2)
      ctx.strokeStyle = 'rgba(0,0,0,0.04)'; ctx.lineWidth = 0.5
      ctx.beginPath(); ctx.moveTo(x, oy); ctx.lineTo(x, oy + ph); ctx.stroke()
    }
    ctx.fillStyle = '#888'; ctx.font = '9px sans-serif'
    ctx.fillText('频率 (Hz)', ox + pw / 2, oy + ph + 12)
  }

  useEffect(() => {
    animRef.current = requestAnimationFrame(draw)
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [draw])

  return (
    <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', borderRadius: 8, ...style }} />
  )
}
