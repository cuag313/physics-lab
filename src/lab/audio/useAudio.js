import { useRef, useCallback, useEffect } from 'react'

/**
 * useAudio — Web Audio API hook（带安全限幅）
 *
 * 提供：
 * - 多振荡器（拍频/和弦）
 * - AnalyserNode 实时波形/频谱
 * - 硬限幅防爆音
 * - pause/resume
 */
export default function useAudio() {
  const ctxRef = useRef(null)
  const oscsRef = useRef([])
  const gainsRef = useRef([])
  const masterGainRef = useRef(null)
  const limiterRef = useRef(null)    // DynamicsCompressorNode 硬限幅
  const analyserRef = useRef(null)
  const waveformRef = useRef(null)
  const spectrumRef = useRef(null)

  const ensureContext = useCallback(() => {
    if (!ctxRef.current) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext
      const ctx = new AudioCtx()
      ctxRef.current = ctx

      // 硬限幅器（防爆音）
      const limiter = ctx.createDynamicsCompressor()
      limiter.threshold.setValueAtTime(-3, ctx.currentTime)  // -3dB 开始压缩
      limiter.knee.setValueAtTime(0, ctx.currentTime)         // 硬拐点
      limiter.ratio.setValueAtTime(20, ctx.currentTime)       // 20:1 压缩比
      limiter.attack.setValueAtTime(0.003, ctx.currentTime)
      limiter.release.setValueAtTime(0.1, ctx.currentTime)
      limiter.connect(ctx.destination)
      limiterRef.current = limiter

      // 主音量
      const master = ctx.createGain()
      master.gain.value = 0.4
      master.connect(limiter)
      masterGainRef.current = master

      // 分析器
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 4096
      analyser.smoothingTimeConstant = 0.75
      master.connect(analyser)
      analyserRef.current = analyser

      waveformRef.current = new Uint8Array(analyser.frequencyBinCount)
      spectrumRef.current = new Uint8Array(analyser.frequencyBinCount)
    }
    if (ctxRef.current.state === 'suspended') {
      ctxRef.current.resume()
    }
    return ctxRef.current
  }, [])

  const stopAll = useCallback(() => {
    oscsRef.current.forEach(osc => {
      try { osc.stop(); osc.disconnect() } catch (e) { /* */ }
    })
    gainsRef.current.forEach(g => { try { g.disconnect() } catch (e) { /* */ } })
    oscsRef.current = []
    gainsRef.current = []
  }, [])

  const play = useCallback((freq, type = 'sine', volume = 0.4) => {
    const ctx = ensureContext()
    stopAll()
    const osc = ctx.createOscillator()
    osc.type = type
    osc.frequency.setValueAtTime(freq, ctx.currentTime)
    const gain = ctx.createGain()
    gain.gain.value = Math.min(volume, 0.8)
    osc.connect(gain)
    gain.connect(masterGainRef.current)
    osc.start()
    oscsRef.current = [osc]
    gainsRef.current = [gain]
  }, [ensureContext, stopAll])

  const addOscillator = useCallback((freq, type = 'sine', volume = 0.4) => {
    const ctx = ensureContext()
    const osc = ctx.createOscillator()
    osc.type = type
    osc.frequency.setValueAtTime(freq, ctx.currentTime)
    const gain = ctx.createGain()
    gain.gain.value = Math.min(volume, 0.8)
    osc.connect(gain)
    gain.connect(masterGainRef.current)
    osc.start()
    oscsRef.current.push(osc)
    gainsRef.current.push(gain)
    return oscsRef.current.length - 1
  }, [ensureContext])

  const removeOscillator = useCallback((index) => {
    if (index >= 0 && index < oscsRef.current.length) {
      try { oscsRef.current[index].stop(); oscsRef.current[index].disconnect() } catch (e) { /* */ }
      try { gainsRef.current[index].disconnect() } catch (e) { /* */ }
      oscsRef.current.splice(index, 1)
      gainsRef.current.splice(index, 1)
    }
  }, [])

  const setFrequency = useCallback((index, freq) => {
    if (index >= 0 && index < oscsRef.current.length && ctxRef.current) {
      oscsRef.current[index].frequency.setValueAtTime(freq, ctxRef.current.currentTime)
    }
  }, [])

  const setVolume = useCallback((index, vol) => {
    if (index >= 0 && index < gainsRef.current.length && ctxRef.current) {
      gainsRef.current[index].gain.setValueAtTime(Math.min(vol, 0.8), ctxRef.current.currentTime)
    }
  }, [])

  const setMasterVolume = useCallback((vol) => {
    if (masterGainRef.current && ctxRef.current) {
      masterGainRef.current.gain.setValueAtTime(Math.min(vol, 0.8), ctxRef.current.currentTime)
    }
  }, [])

  const pause = useCallback(() => {
    if (ctxRef.current && ctxRef.current.state === 'running') {
      ctxRef.current.suspend()
    }
  }, [])

  const resume = useCallback(() => {
    if (ctxRef.current && ctxRef.current.state === 'suspended') {
      ctxRef.current.resume()
    }
  }, [])

  const stop = useCallback(() => { stopAll() }, [stopAll])

  const getWaveform = useCallback(() => {
    if (analyserRef.current && waveformRef.current) {
      analyserRef.current.getByteTimeDomainData(waveformRef.current)
      return waveformRef.current
    }
    return null
  }, [])

  const getSpectrum = useCallback(() => {
    if (analyserRef.current && spectrumRef.current) {
      analyserRef.current.getByteFrequencyData(spectrumRef.current)
      return spectrumRef.current
    }
    return null
  }, [])

  const getSampleRate = useCallback(() => {
    return ctxRef.current ? ctxRef.current.sampleRate : 44100
  }, [])

  useEffect(() => {
    return () => {
      stopAll()
      if (ctxRef.current && ctxRef.current.state !== 'closed') {
        ctxRef.current.close()
      }
    }
  }, [stopAll])

  return {
    play, addOscillator, removeOscillator,
    setFrequency, setVolume, setMasterVolume,
    pause, resume, stop,
    getWaveform, getSpectrum, getSampleRate,
    ensureContext,
    get isPlaying() { return oscsRef.current.length > 0 },
    get oscillatorCount() { return oscsRef.current.length },
  }
}
