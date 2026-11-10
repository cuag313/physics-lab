/**
 * workbench.js — 深色实验桌面背景（渲染层·环境）
 *
 * 参考真实理化生实验室的深色防静电桌垫：
 *   · 桌面本体：上浅下深，让器材"坐"在桌面上
 *   · 环境光：屏幕上方偏左一盏柔光，暗角压住四周
 *   · 纹理：极淡的防静电点阵（不抢戏，只提供材质感）
 *   · 台面分隔：一条柔和的分界线，暗示"实验区/器材区"
 */

import { T } from './theme.js'

/** 点阵纹理缓存（一次生成，全局复用） */
let _dotPat = null
let _dotPatCtx = null

function dotPattern(ctx) {
  if (_dotPat && _dotPatCtx === ctx) return _dotPat
  if (typeof document === 'undefined') return null
  const tile = document.createElement('canvas')
  tile.width = tile.height = 24
  const c = tile.getContext('2d')
  // 编织纹理：一个亮点 + 一个极淡的横线
  c.fillStyle = 'rgba(255,255,255,0.055)'
  c.fillRect(0, 0, 1.2, 1.2)
  c.fillStyle = 'rgba(0,0,0,0.10)'
  c.fillRect(0, 23, 24, 1)
  _dotPat = ctx.createPattern(tile, 'repeat')
  _dotPatCtx = ctx
  return _dotPat
}

/**
 * 工作台背景
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} W 画布宽（CSS px）
 * @param {number} H 画布高（CSS px）
 * @param {object} o {time} time 用于让环境光极缓慢呼吸（0→1 秒）
 */
export function drawBench(ctx, W, H, o = {}) {
  const t = o.time || 0
  ctx.save()

  // 1. 桌面本体：上浅下深
  const base = ctx.createLinearGradient(0, 0, 0, H)
  base.addColorStop(0, T.benchHi)
  base.addColorStop(0.55, '#1b2126')
  base.addColorStop(1, T.benchLo)
  ctx.fillStyle = base
  ctx.fillRect(0, 0, W, H)

  // 2. 顶部柔和主光（缓慢呼吸 ±3%，避免画面死板）
  const breathe = 1 + Math.sin(t * 0.6) * 0.03
  const key = ctx.createRadialGradient(W * 0.42, -H * 0.18, 0, W * 0.42, -H * 0.18, H * 1.15 * breathe)
  key.addColorStop(0, 'rgba(190, 220, 255, 0.16)')
  key.addColorStop(0.45, 'rgba(150, 190, 240, 0.06)')
  key.addColorStop(1, 'rgba(0, 0, 0, 0)')
  ctx.fillStyle = key
  ctx.fillRect(0, 0, W, H)

  // 3. 防静电点阵纹理
  const pat = dotPattern(ctx)
  if (pat) {
    ctx.fillStyle = pat
    ctx.fillRect(0, 0, W, H)
  }

  // 4. 器材区暖色反光：暗示台灯从右上打下来
  const warm = ctx.createRadialGradient(W * 0.78, H * 0.16, 0, W * 0.78, H * 0.16, W * 0.55)
  warm.addColorStop(0, 'rgba(255, 214, 150, 0.075)')
  warm.addColorStop(1, 'rgba(255, 214, 150, 0)')
  ctx.fillStyle = warm
  ctx.fillRect(0, 0, W, H)

  // 5. 暗角：四周压暗，视线集中到中央电路
  const vig = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.34, W / 2, H / 2, Math.max(W, H) * 0.78)
  vig.addColorStop(0, 'rgba(0,0,0,0)')
  vig.addColorStop(0.72, 'rgba(0,0,0,0.28)')
  vig.addColorStop(1, 'rgba(0,0,0,0.62)')
  ctx.fillStyle = vig
  ctx.fillRect(0, 0, W, H)

  ctx.restore()
}

/**
 * 电路工作区：桌面上一块略微内凹的浅色区域，用来"托住"电路
 * （保留一点专业感：不是白卡片，而是一块带内阴影的暗色垫板）
 */
export function drawWorkArea(ctx, rect, o = {}) {
  const { x, y, w, h } = rect
  const glow = o.glow || 0 // 0~1：电路导通时区域亮度微升
  ctx.save()

  // 垫板本体：极低对比，只比桌面亮一点点
  const g = ctx.createLinearGradient(x, y, x, y + h)
  g.addColorStop(0, `rgba(255,255,255,${0.035 + glow * 0.03})`)
  g.addColorStop(0.5, 'rgba(255,255,255,0.012)')
  g.addColorStop(1, 'rgba(0,0,0,0.10)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, 14)
  ctx.fill()

  // 边缘高光（左上）+ 深色（右下）
  ctx.strokeStyle = 'rgba(255,255,255,0.075)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.roundRect(x + 0.5, y + 0.5, w - 1, h - 1, 13)
  ctx.stroke()

  // 内阴影：做出"凹陷"的层次
  const inner = ctx.createLinearGradient(x, y, x, y + 26)
  inner.addColorStop(0, 'rgba(0,0,0,0.30)')
  inner.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = inner
  ctx.beginPath()
  ctx.roundRect(x + 1, y + 1, w - 2, 26, 13)
  ctx.fill()

  ctx.restore()
}
