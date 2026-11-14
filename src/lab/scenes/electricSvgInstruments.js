/**
 * electricSvgInstruments.js — 真实器材图版仪器定义（SVG 合成渲染）
 *
 * 每件仪器 = public/assets/equipment/fig 的真实器材照片（裁剪版）
 *          + 可动 SVG 叠层（表针 / 闸刀 / 滑片 / 灯光）
 *          + 剖视用内部结构层（.inner + .plabel，沿用源实验的构造图）。
 * 照片作为 .casing：点「内部结构」时整体变透明，露出内部构造。
 */

import { capPaint } from '../theme/termColors.js'

export const FIG = '/physics-lab/assets/equipment/fig'
/* 实拍图版本号：同名图片被覆盖后浏览器会继续用旧缓存（元件库缩略图尤其明显），
   所有 fig 图片 URL 统一带这串版本参数，改图时把它 +1 即可强制刷新。 */
export const FIG_V = '20261114d'
export const figURL = (file) => `${FIG}/${file}?v=${FIG_V}`

/** 滑动变阻器滑片轨道（显示坐标）：与实拍图里瓷筒绕线的左右端对齐（33..159） */
export const RHEO_TRACK = { x0: 34, x1: 158 }

/**
 * 滑动变阻器接入方式（Prompt 1 的 mode 表，映射到 tl/tr/bl/br 四柱）：
 * 电阻丝只在 bl-br 之间连续；tl/tr 经金属杆连通（与滑片等电位）。
 * @param {Set<string>} wired 已接线的端口 id
 * @returns {'left-wire'|'right-wire'|'full-wire'|'short'|'open'}
 */
export function rheostatMode(wired) {
  const hasL = wired.has('bl')
  const hasR = wired.has('br')
  const rodN = (wired.has('tl') ? 1 : 0) + (wired.has('tr') ? 1 : 0)
  // 金属杆两柱接入 → 短路
  if (rodN >= 2 && !hasL && !hasR) return 'short'
  const groups = (hasL ? 1 : 0) + (hasR ? 1 : 0) + (rodN > 0 ? 1 : 0)
  if (groups <= 1) return 'open'
  if (hasL && rodN > 0 && !hasR) return 'left-wire'
  if (hasR && rodN > 0 && !hasL) return 'right-wire'
  return 'full-wire'
}

/**
 * 灯丝温度色阶（对照帧理：暗红 → 橙红 → 亮黄 → 刺眼白）。
 * 2D SVG 光晕与 3D emissive 共用这一份，避免两套色表分家。
 * 每档：[功率比阈值, 灯丝芯色, 外围光晕色]，颜色为 0~255 RGB。
 */
export const BULB_STAGE = [
  [0.0, [104, 112, 124], [104, 112, 124]], // 断路：冷灰
  [0.18, [127, 29, 29], [220, 38, 38]],     // 暗红（低电流）
  [0.42, [194, 65, 12], [249, 115, 22]],    // 橙红
  [0.68, [251, 191, 36], [251, 191, 36]],   // 亮黄
  [1.0, [255, 253, 235], [255, 255, 240]],  // 刺眼白（额定）
]

/** 按功率比取灯丝色温：{ core, halo } 均为 [r,g,b]（0~255），档间线性插值 */
export function bulbTempColor(bright) {
  const k = Math.max(0, Math.min(1, Number(bright) || 0))
  let si = 0
  while (si < BULB_STAGE.length - 2 && k > BULB_STAGE[si + 1][0]) si++
  const [t0, c0, h0] = BULB_STAGE[si]
  const [t1, c1, h1] = BULB_STAGE[si + 1]
  const u = t1 > t0 ? Math.max(0, Math.min(1, (k - t0) / (t1 - t0))) : 0
  const mix = (a, b) => a.map((v, j) => Math.round(v + (b[j] - v) * u))
  return { core: mix(c0, c1), halo: mix(h0, h1) }
}

/** 源实验的内部结构图按比例居中嵌入 */
function fitInner(sw, sh, w, h, body) {
  const k = Math.min(w / sw, h / sh)
  const tx = (w - sw * k) / 2
  const ty = (h - sh * k) / 2
  return `<g class="inner" transform="translate(${tx.toFixed(1)},${ty.toFixed(1)}) scale(${k.toFixed(3)})">${body}</g>`
}

function photo(file, w, h, style = '') {
  return `<image class="casing" href="${figURL(file)}" x="0" y="0" width="${w}" height="${h}"
    preserveAspectRatio="none" style="${style}"/>`
}

/* 内部结构图（移植自源实验的 .inner 层） */
const INNER = {
  batteryCells() {
    // 电池组剖视，直接按机框 150×42 画：两节干电池 = 锌筒(−) 外套 + 中央碳棒(+) + 电解糊，
    // 两节之间用金属片串起来。原来 render 里没挂内部层，透视时只剩半透明照片（用户看不明白）。
    return `
      <rect x="8" y="4" width="134" height="34" rx="8" fill="#f8f3e6" stroke="#c9b892"/>
      <rect x="16" y="8" width="54" height="26" rx="7" fill="#d5dae0" stroke="#98a1ab"/>
      <rect x="16" y="8" width="7" height="26" rx="3" fill="#b2bac4"/>
      <rect x="40" y="6" width="7" height="30" rx="2.5" fill="#3f4650"/>
      <rect x="80" y="8" width="54" height="26" rx="7" fill="#d5dae0" stroke="#98a1ab"/>
      <rect x="104" y="6" width="7" height="30" rx="2.5" fill="#3f4650"/>
      <line x1="70" y1="21" x2="80" y2="21" stroke="#8a6a3c" stroke-width="2.6"/>`
  },

  battery() {
    // 电池组（干电池串联）剖视：两节锌筒(−) + 碳棒(+)，浸在电解糊中；不写文字标注。
    return `
      <rect x="34" y="20" width="82" height="42" rx="4" fill="#efe7d3" stroke="#cdbc93"/>
      <rect x="43" y="26" width="18" height="30" rx="2.5" fill="#3d4148"/>
      <rect x="47" y="21" width="5" height="36" rx="1.5" fill="#9aa3ad"/>
      <rect x="84" y="26" width="18" height="30" rx="2.5" fill="#3d4148"/>
      <rect x="88" y="21" width="5" height="36" rx="1.5" fill="#9aa3ad"/>
      <rect x="34" y="20" width="82" height="42" rx="4" fill="none" stroke="#9aa3ad" stroke-width="1.6"/>`
  },
  accumulator() {
    // 蓄电池剖视：透明槽体 + 电解液 + 交错的正(棕)负(灰)极板组；不写文字标注。
    const plates = []
    const n = 6
    for (let i = 0; i < n; i++) {
      const x = 44 + i * 12
      plates.push(`<rect x="${x}" y="26" width="7" height="30" rx="1.5" fill="${i % 2 ? '#5b6470' : '#b87333'}" stroke="#3f4650" stroke-width="0.6"/>`)
    }
    return `
      <rect x="34" y="20" width="82" height="44" rx="4" fill="#eaf6ff" stroke="#9db8cf"/>
      <rect x="36" y="38" width="78" height="24" rx="2" fill="#bfe3f5" opacity=".85"/>
      ${plates.join('')}
      <line x1="44" y1="22" x2="44" y2="26" stroke="#8a6a3c" stroke-width="2.4"/>
      <line x1="106" y1="22" x2="106" y2="26" stroke="#8a6a3c" stroke-width="2.4"/>
      <rect x="34" y="20" width="82" height="44" rx="4" fill="none" stroke="#9db8cf" stroke-width="1.6"/>`
  },
  bulb() {
    // 坐标系与实拍图一致（256×121）：灯泡心 (129,105)、灯座 (129,155)
    return `
      <rect x="123" y="138" width="14" height="30" rx="3" fill="#dbe4ee" stroke="#b6c2d1"/>
      <line x1="112" y1="120" x2="112" y2="86" stroke="#94a3b8" stroke-width="3"/>
      <line x1="146" y1="120" x2="146" y2="86" stroke="#94a3b8" stroke-width="3"/>
      <polyline points="112,86 116,72 120,86 124,72 128,86 132,72 136,86 140,72 146,86"
        fill="none" stroke="#6b7280" stroke-width="2.6" stroke-linejoin="round"/>`
  },
  switch() {
    // 原来这里挂的是「静触点 / 闸刀」文字标注 + 两个红色虚线框，按要求全部去掉；
    // 开关内部没有剖面内容，保留空层以维持 .inner 结构一致。
    return ''
  },
  meter(deg = 0, kind = 'mA') {
    /* 磁电式表头：线圈在 N/S 极磁场中随电流转动 → 游丝扭转 → 指针偏转。
       剖视时线圈按指针比例同步偏转（绕中心 65,61），不是静态图。
       kind 区分量程扩展零件（三块表看着"一模一样"就是因为以前不分）：
         'mA' 微安级表头直测；'A' 并一只分流电阻扩大量程；'V' 串一只分压电阻扩量程。
       标注一律 ≤12 字：长句在 130~150px 的表上会整行溢出壳外（N/S 极 + 一句短标签足够）。 */
    const extra = kind === 'A'
      ? `<rect x="40" y="99" width="50" height="8" rx="4" fill="#b87333" stroke="#7c4a1b"/>
         <text class="plabel" x="65" y="122">分流电阻（扩大量程）</text>`
      : kind === 'V'
        ? `<rect x="34" y="99" width="62" height="8" rx="4" fill="#ece7d8" stroke="#a89d80"/>
           <rect x="43" y="98" width="3.4" height="10" fill="#1d4ed8"/>
           <rect x="55" y="98" width="3.4" height="10" fill="#f59e0b"/>
           <rect x="67" y="98" width="3.4" height="10" fill="#16a34a"/>
           <rect x="79" y="98" width="3.4" height="10" fill="#b87333"/>
           <text class="plabel" x="65" y="122">分压电阻（扩大量程）</text>`
        : `<text class="plabel" x="65" y="122">表头直测（微安级）</text>`
    return `
      <rect x="26" y="40" width="16" height="42" rx="3" fill="#e11d48" opacity=".75"/>
      <rect x="88" y="40" width="16" height="42" rx="3" fill="#2563eb" opacity=".75"/>
      <text class="plabel" x="34" y="36">N 极</text>
      <text class="plabel" x="96" y="36">S 极</text>
      <g transform="rotate(${Number(deg || 0).toFixed(1)} 65 61)">
        <rect x="50" y="46" width="30" height="30" rx="4" fill="#a16207" stroke="#78350f"/>
        <line x1="50" y1="52" x2="80" y2="52" stroke="#fde68a" stroke-width="1.4"/>
        <line x1="50" y1="58" x2="80" y2="58" stroke="#fde68a" stroke-width="1.4"/>
        <line x1="50" y1="64" x2="80" y2="64" stroke="#fde68a" stroke-width="1.4"/>
        <line x1="50" y1="70" x2="80" y2="70" stroke="#fde68a" stroke-width="1.4"/>
        <line x1="65" y1="61" x2="65" y2="90" stroke="#d6b25f" stroke-width="2"/>
      </g>
      ${extra}`
  },
  rheostat() {
    return `
      <text class="plabel" x="96" y="18">金属杆（与滑片相连）</text>
      <text class="plabel" x="96" y="100">电阻丝（绕在瓷筒上）</text>
      <text class="plabel" x="96" y="86">瓷筒</text>
      <rect class="ann" x="32" y="44" width="126" height="32" rx="12" fill="none" stroke="#2563eb" stroke-width="1.2" stroke-dasharray="4 3"/>
      <rect class="ann" x="32" y="20" width="126" height="7" rx="3.5" fill="none" stroke="#2563eb" stroke-width="1.2" stroke-dasharray="4 3"/>`
  },
  resistor() {
    return `
      <!-- 瓷棒基体 + 螺旋电阻膜（半剖） -->
      <rect x="48" y="22" width="80" height="24" rx="7" fill="#efe7d3" stroke="#cdbc93"/>
      <path d="M56 28 h64 M56 40 h64" stroke="#b08d55" stroke-width="1" stroke-dasharray="3 2"/>
      <path d="M58 34 q4 -7 8 0 q4 7 8 0 q4 -7 8 0 q4 7 8 0 q4 -7 8 0 q4 7 8 0 q4 -7 8 0 q4 7 8 0"
            fill="none" stroke="#8a6a3c" stroke-width="1.6"/>
      <rect x="42" y="24" width="8" height="20" rx="2" fill="#9aa3ad"/>
      <rect x="126" y="24" width="8" height="20" rx="2" fill="#9aa3ad"/>
      <path d="M46 44 C46 60, 30 62, 26 74" fill="none" stroke="#b87333" stroke-width="3"/>
      <path d="M130 44 C130 60, 146 62, 150 74" fill="none" stroke="#b87333" stroke-width="3"/>
      <text class="plabel" x="42" y="60">瓷棒基体</text>
      <text class="plabel" x="88" y="60">电阻膜（碳膜/电阻丝）</text>
      <text class="plabel" x="26" y="92">铜引线</text>
      <text class="plabel" x="142" y="28">金属端帽</text>`
  },
  switch2() {
    return `
      <text class="plabel" x="90" y="22">绝缘手柄</text>
      <text class="plabel" x="34" y="22">静触点 A</text>
      <text class="plabel" x="146" y="22">静触点 B</text>
      <text class="plabel" x="90" y="126">转轴（公共端 com）</text>
      <rect x="26" y="38" width="16" height="16" rx="3" fill="none" stroke="#e11d48" stroke-width="1.4"/>
      <rect x="138" y="38" width="16" height="16" rx="3" fill="none" stroke="#e11d48" stroke-width="1.4"/>
      <line x1="90" y1="102" x2="90" y2="58" stroke="#2563eb" stroke-width="1.2" stroke-dasharray="5 3"/>
      <circle cx="90" cy="102" r="11" fill="none" stroke="#2563eb" stroke-width="1.2" stroke-dasharray="3 2"/>`
  },
  motor() {
    return `
      <!-- 教学剖视：磁极 / 转子线圈 / 换向器 / 电刷 -->
      <rect x="118" y="86" width="30" height="44" rx="3" fill="#e11d48" opacity=".7"/>
      <rect x="176" y="86" width="30" height="44" rx="3" fill="#2563eb" opacity=".7"/>
      <text class="plabel" x="133" y="80">N 极</text>
      <text class="plabel" x="191" y="80">S 极</text>
      <rect x="152" y="94" width="22" height="28" rx="3" fill="#a16207" stroke="#78350f"/>
      <line x1="152" y1="100" x2="174" y2="100" stroke="#fde68a" stroke-width="1.4"/>
      <line x1="152" y1="106" x2="174" y2="106" stroke="#fde68a" stroke-width="1.4"/>
      <line x1="152" y1="112" x2="174" y2="112" stroke="#fde68a" stroke-width="1.4"/>
      <text class="plabel" x="163" y="140">转子线圈</text>
      <rect x="150" y="122" width="26" height="8" rx="2" fill="#c9a227" stroke="#8a6a3c"/>
      <text class="plabel" x="163" y="158">换向器 · 电刷</text>
      <text class="plabel" x="59" y="120">皮带轮（带动风扇）</text>
      <line x1="59" y1="60" x2="59" y2="104" stroke="#2563eb" stroke-width="1.2" stroke-dasharray="5 3"/>`
  },
  diode() {
    return `
      <!-- PN 结结构 -->
      <rect x="70" y="30" width="15" height="26" rx="2" fill="#e11d48" opacity=".72"/>
      <rect x="85" y="30" width="15" height="26" rx="2" fill="#2563eb" opacity=".72"/>
      <line x1="85" y1="28" x2="85" y2="58" stroke="#1d4ed8" stroke-width="1.4" stroke-dasharray="3 2"/>
      <text class="plabel" x="56" y="20">P 型半导体</text>
      <text class="plabel" x="116" y="20">N 型半导体</text>
      <text class="plabel" x="85" y="66">PN 结（单向导电）</text>
      <path d="M77 56 L77 70 L48 79" fill="none" stroke="#b87333" stroke-width="3"/>
      <path d="M93 56 L93 64 L122 79" fill="none" stroke="#b87333" stroke-width="3"/>
      <text class="plabel" x="44" y="96">长脚 = 阳极（正）</text>
      <text class="plabel" x="124" y="96">短脚 = 阴极（负）</text>`
  },
  fuse() {
    return `
      <!-- 熔丝管剖视：熔丝 + 填砂 + 管体 -->
      <rect x="58" y="24" width="84" height="22" rx="9" fill="#eef3f8" stroke="#b6c2d1" stroke-width="1.2"/>
      <path d="M68 35 H132" stroke="#8a6a3c" stroke-width="2.2" stroke-linecap="round"/>
      <path d="M68 35 v-3 M132 35 v-3" stroke="#8a6a3c" stroke-width="2"/>
      <text class="plabel" x="100" y="18">熔丝（铅锑合金）</text>
      <text class="plabel" x="100" y="62">管体（玻璃/瓷）+ 灭弧填砂</text>
      <text class="plabel" x="52" y="30">金属端帽</text>
      <text class="plabel" x="152" y="30">金属端帽</text>`
  },
  testPencil() {
    return `
      <!-- 测电笔内部：氖泡 / 高值电阻 / 弹簧 -->
      <rect x="40" y="36" width="30" height="14" rx="7" fill="#ff8c42" stroke="#c25a12" stroke-width="1.2"/>
      <path d="M76 43 q4 -7 8 0 q4 7 8 0 q4 -7 8 0 q4 7 8 0" fill="none" stroke="#8a6a3c" stroke-width="1.8"/>
      <rect x="106" y="34" width="34" height="18" rx="5" fill="#e8dcc0" stroke="#b7a888" stroke-width="1"/>
      <path d="M112 38 h22 M112 43 h22 M112 48 h22" stroke="#8a6a3c" stroke-width="1.2"/>
      <path d="M18 43 H38 M148 43 H212" stroke="#9aa3ad" stroke-width="3"/>
      <text class="plabel" x="56" y="22">氖管</text>
      <text class="plabel" x="92" y="72">弹簧</text>
      <text class="plabel" x="128" y="22">高值电阻</text>
      <text class="plabel" x="16" y="22">金属笔尖</text>
      <text class="plabel" x="206" y="22">笔尾金属体</text>`
  },
  electroscope() {
    return `
      <!-- 验电器剖视：球 / 杆 / 箔片 / 外壳 -->
      <circle cx="68" cy="24" r="12" fill="none" stroke="#2563eb" stroke-width="1.2" stroke-dasharray="3 2"/>
      <line x1="68" y1="36" x2="68" y2="112" stroke="#9aa3ad" stroke-width="2.4"/>
      <rect x="34" y="110" width="68" height="68" rx="8" fill="none" stroke="#2563eb" stroke-width="1.2" stroke-dasharray="4 3"/>
      <path d="M65 114 L58 158 M71 114 L78 158" stroke="#c9a227" stroke-width="3" stroke-linecap="round"/>
      <text class="plabel" x="68" y="14">金属球（带电体接触）</text>
      <text class="plabel" x="88" y="80">金属杆</text>
      <text class="plabel" x="68" y="172">金属箔片（同种电荷相斥）</text>
      <text class="plabel" x="30" y="98">玻璃外壳</text>
      <text class="plabel" x="112" y="196">底座（可接地）</text>`
  },
  mains() {
    return `
      <!-- 市电进线：火线 / 零线 / 地线 -->
      <path d="M52 24 V70 M118 24 V70" stroke="#9aa3ad" stroke-width="3"/>
      <path d="M85 24 V60" stroke="#c9a227" stroke-width="3"/>
      <text class="plabel" x="118" y="18">火线 L（红）</text>
      <text class="plabel" x="52" y="18">零线 N（蓝）</text>
      <text class="plabel" x="85" y="76">接地线（黄绿）</text>
      <text class="plabel" x="85" y="118">进户线 · 220V 50Hz</text>`
  },
  energyMeter() {
    return `
      <!-- 电能表剖视：电流线圈 / 电压线圈 + 铝转盘 + 制动磁铁 + 计数器齿轮 -->
      <rect x="30" y="34" width="14" height="30" rx="3" fill="#b45309" stroke="#78350f" stroke-width="1.2"/>
      <path d="M37 34 V24 M37 64 V74" stroke="#b45309" stroke-width="2"/>
      <text class="plabel" x="37" y="20">电流线圈</text>
      <rect x="46" y="34" width="10" height="26" rx="2" fill="#a16207" stroke="#78350f" stroke-width="1"/>
      <text class="plabel" x="52" y="20">电压线圈</text>
      <circle cx="95" cy="66" r="28" fill="none" stroke="#2563eb" stroke-width="1.2" stroke-dasharray="4 3"/>
      <text class="plabel" x="95" y="104">铝转盘（涡流驱动力矩）</text>
      <rect x="118" y="44" width="12" height="44" rx="2" fill="#e11d48" opacity=".75"/>
      <text class="plabel" x="124" y="40">制动磁铁</text>
      <path d="M130 66 H152" stroke="#8a6a3c" stroke-width="2"/>
      <text class="plabel" x="156" y="70" text-anchor="end">齿轮 → 计数器</text>`
  },
  jouleTube() {
    return `
      <!-- 焦耳定律 U 形管剖视：电阻丝浸在液体里，通电发热使液体膨胀、液柱上升 -->
      <rect x="46" y="120" width="16" height="26" rx="3" fill="#b45309" opacity=".85"/>
      <rect x="128" y="112" width="16" height="34" rx="3" fill="#b45309" opacity=".85"/>
      <path d="M54 138 q8 -10 0 -20 q-8 -10 0 -20" stroke="#fca5a5" stroke-width="1.6" fill="none"/>
      <path d="M136 138 q8 -10 0 -20 q-8 -10 0 -20 q8 -10 0 -20 q-8 -10 0 -20" stroke="#fca5a5" stroke-width="1.6" fill="none"/>
      <text class="plabel" x="54" y="42">R1 = 2Ω（2 段）</text>
      <text class="plabel" x="136" y="42">R2 = 4Ω（4 段）</text>
      <path d="M62 108 h6 M62 96 h6 M62 84 h6" stroke="#fb7185" stroke-width="1.4" opacity=".9"/>
      <path d="M144 104 h6 M144 92 h6 M144 80 h6" stroke="#fb7185" stroke-width="1.4" opacity=".9"/>
      <text class="plabel" x="95" y="72">液体受热膨胀</text>
      <text class="plabel" x="95" y="82">→ 液柱沿玻璃管上升</text>
      <text class="plabel" x="95" y="164">两支管串联，电流相同 → Q ∝ R</text>`
  },
  resBox() {
    return `
      <!-- 电阻箱剖视：盘式电阻 + 刷片 -->
      <rect x="20" y="30" width="110" height="150" rx="8" fill="none" stroke="#2563eb" stroke-width="1.2" stroke-dasharray="4 3"/>
      ${[0, 1, 2, 3].map((i) => `
        <circle cx="${[42, 109, 42, 109][i]}" cy="${[60, 60, 123, 123][i]}" r="20" fill="none" stroke="#2563eb" stroke-width="1.1" stroke-dasharray="3 2"/>`).join('')}
      <path d="M28 180 H122" stroke="#8a6a3c" stroke-width="2.2"/>
      <text class="plabel" x="75" y="18">盘式电阻丝（每档一段）</text>
      <text class="plabel" x="75" y="198">刷片（随旋钮换挡）</text>`
  },
  multimeter() {
    return `
      <!-- 多用电表剖视：表头 + 分流/分压电阻 + 电池 + 转换开关 -->
      <rect x="30" y="30" width="90" height="26" rx="4" fill="#e11d48" opacity=".72"/>
      <text class="plabel" x="75" y="24">表头（磁电式微安表）</text>
      <rect x="26" y="66" width="34" height="16" rx="3" fill="#2563eb" opacity=".7"/>
      <rect x="26" y="88" width="34" height="16" rx="3" fill="#2563eb" opacity=".7"/>
      <rect x="26" y="110" width="34" height="16" rx="3" fill="#a16207" opacity=".8"/>
      <text class="plabel" x="43" y="62">分压电阻</text>
      <text class="plabel" x="43" y="84">分流电阻</text>
      <text class="plabel" x="43" y="128">内置电池（Ω 档）</text>
      <circle cx="108" cy="120" r="26" fill="none" stroke="#2563eb" stroke-width="1.2" stroke-dasharray="4 3"/>
      <text class="plabel" x="108" y="158">档位转换开关</text>`
  },
  relay() {
    return `
      <!-- 继电器剖视：线圈 / 铁芯 / 衔铁 / 弹簧 / 触点 -->
      <rect x="142" y="108" width="22" height="36" rx="2" fill="none" stroke="#e11d48" stroke-width="1.3" stroke-dasharray="3 2"/>
      <text class="plabel" x="153" y="106">电磁铁（线圈+铁芯）</text>
      <line x1="28" y1="92" x2="182" y2="92" stroke="#2563eb" stroke-width="1.2" stroke-dasharray="5 3"/>
      <text class="plabel" x="105" y="84">衔铁（软铁）</text>
      <circle cx="128" cy="110" r="7" fill="none" stroke="#e11d48" stroke-width="1.3"/>
      <text class="plabel" x="128" y="128">触点（常开）</text>
      <text class="plabel" x="108" y="40">弹簧（释放衔铁）</text>
      <text class="plabel" x="34" y="84">转轴</text>`
  },
}

/**
 * 动画表针叠层：pivot/len 为显示坐标，frac∈[0,1]。
 * zero/full 为零位与满偏角（相对竖直，向右为正），按实拍图刻度弧实测；
 * 必要时传 clipId，把针的尾部裁进表盘内，看起来像从框后穿出。
 */
function needleSVG(px, py, len, frac, zero = -52, full = 52, clipId = '') {
  const a = zero + Math.max(0, Math.min(1, frac)) * (full - zero)
  const c = clipId ? ` clip-path="url(#${clipId})"` : ''
  return `
    <line class="needle" x1="${px}" y1="${py}" x2="${px}" y2="${py - len}" stroke="#e11d48" stroke-width="1.7"
      stroke-linecap="round" transform="rotate(${a.toFixed(2)} ${px} ${py})"${c}/>`
}

/**
 * 电表表盘（矢量重绘：盖住实拍图上印死的表盘与固定红针，2D 上只留一根动态针）。
 *
 * 几何全部按 iconsnewname 两张 256×256 原图**逐像素实测**（8电流表.png / 电压表_2.png
 * 是同一副机芯）：白面 x23..232 / y27..168（210×142），轴心 (128,164)，
 * 刻度带 r 92..109（斜齿，切向偏 16°），外圈数字 r 119、内圈数字 r 80、单位字母 r 42、
 * 字母下横杠 r 24 / 宽 26；主刻度弧 0 位 243.5°、满偏 322.2°（canvas 角，270° 朝上），
 * 负量程尾段 213.5..243.5、+ 号尾段 322.2..341.2。
 * 显示坐标按 s = w / 210 缩放（w 传白面宽，h 传白面高 = 142·s）。
 */
const FACE = {
  dialX: 24, dialY: 26, dialW: 207, dialH: 143, hubX: 128, hubY: 164,
  rOut: 111, rIn: 94, rNum: 119, rInner: 80, rUnit: 42,
  aNeg: 213.5, aZero: 243.5, aFull: 322.2, aTail: 341.2,
}

function meterFaceSVG(x, y, w, h, cfg) {
  const s = w / FACE.dialW
  const cx = x + (FACE.hubX - FACE.dialX) * s
  const cy = y + (FACE.hubY - FACE.dialY) * s
  const rad = (d) => (d * Math.PI) / 180
  const at = (a, r) => [cx + Math.cos(rad(a)) * r, cy + Math.sin(rad(a)) * r]
  const f = (v) => v.toFixed(2)
  const IN_R = (x) => x * s
  const INK = '#6c7176'
  const TICK = '#74797e'
  const TICK_M = '#50555b'

  /* 刻度带实测（256 原图逐齿重算，A/V 同一副 CAD）：
   * 齿中心**不在一个圆上** —— 整条刻度带向外拱成抛物线 r = 99.6 + 8.0·t²
   * （t = (θ−270)/48.6，270° 是正上方）。齿长：短齿 5.6、长齿 14.4，中心压在带上
   * （内端 band−3.0、外端 band+2.6 / band+11.4）。
   * 每根齿沿该点弧线的**法线**站住 —— 与切线垂直。原来是从轴心径向甩出去（+1.1° 斜偏），
   * 弧带既然是拱形、不共心，径向齿就会歪 2~4°，看着"不垂直"。 */
  const BAND = { mid: 270, half: 48.6, r0: 99.6, bend: 8.0 }
  const bandR = (a) => {
    const t = Math.abs(a - BAND.mid) / BAND.half
    return BAND.r0 + BAND.bend * t * t
  }
  // 弧带在 a 处的单位法线（朝外）：取 a±1.3° 两点的连线作切线，转 90°
  const bandNormal = (a) => {
    const p1 = at(a - 1.3, IN_R(bandR(a - 1.3)))
    const p2 = at(a + 1.3, IN_R(bandR(a + 1.3)))
    const tx = p2[0] - p1[0]
    const ty = p2[1] - p1[1]
    const l = Math.hypot(tx, ty) || 1
    let nx = -ty / l
    let ny = tx / l
    const p = at(a, IN_R(bandR(a)))
    if (nx * (p[0] - cx) + ny * (p[1] - cy) < 0) { nx = -nx; ny = -ny }
    return [nx, ny]
  }
  let ticks = ''
  const tick = (a, major) => {
    const [nx, ny] = bandNormal(a)
    const [px, py] = at(a, IN_R(bandR(a)))
    const inR = IN_R(3.0)
    const outR = IN_R(major ? 11.4 : 3.6)
    const x1 = px - nx * inR
    const y1 = py - ny * inR
    const x2 = px + nx * outR
    const y2 = py + ny * outR
    ticks += `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${major ? TICK_M : TICK}" stroke-width="${f((major ? 2.4 : 2.2) * s)}"/>`
  }
  // 0 往左 9 根短齿（实测 2.56°/格，最左到 220.5°；左端那个「−」是记号，不是齿）
  for (let i = 9; i >= 1; i--) tick(FACE.aZero - 2.56 * i, false)
  // 正量程段：0..满偏 30 小格，每 10 格一根长齿（0/1/2/3）
  for (let i = 0; i <= 30; i++) tick(FACE.aZero + (FACE.aFull - FACE.aZero) * (i / 30), i % 10 === 0)

  const mark = (a, str, r, size, color = INK, weight = '500') => {
    const [tx, ty] = at(a, r)
    return `<text x="${f(tx)}" y="${f(ty)}" transform="rotate(${f(a + 90)} ${f(tx)} ${f(ty)})" text-anchor="middle" dominant-baseline="middle" font-size="${f(size)}" font-weight="${weight}" fill="${color}">${str}</text>`
  }

  const A0 = FACE.aZero
  const SPAN = FACE.aFull - FACE.aZero
  const rOuter = (cfg.outerR || 121) * s
  let marks = ''
  cfg.outer.forEach((str, i) => {
    marks += mark(A0 + SPAN * (i / (cfg.outer.length - 1)), str, rOuter, 14.5 * s)
  })
  cfg.inner.forEach((str, i) => {
    marks += mark(A0 + SPAN * ((i + 1) / cfg.inner.length), str, 85 * s, 14 * s)
  })
  // 左侧记号：原图是手摆的，逐个给角度/半径（安培表「1」在 220.5°/r129.5、电压表「5」在 221°/r128；两表的「−」都压在弧最左端 213.3°/r111.7）
  for (const m of cfg.leftMarks || []) marks += mark(m.a, m.s, m.r * s, (m.fs || 18) * s, INK, m.w || '500')
  marks += mark(FACE.aFull + 5, cfg.plus, 113 * s, 14 * s)

  return `
    <defs>
      <clipPath id="es-cp-${cfg.clip || 'face'}">
        <rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}"/>
      </clipPath>
    </defs>
    <rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="${f(2.5 * s)}" fill="url(#es-g-meterface)"/>
    <g clip-path="url(#es-cp-${cfg.clip || 'face'})">${ticks}</g>
    ${marks}
    <text x="${f(cx)}" y="${f(cy - FACE.rUnit * s)}" text-anchor="middle" dominant-baseline="middle"
      font-size="${f(34 * s)}" font-weight="500" fill="#878c91">${cfg.unit}</text>
    <rect x="${f(cx - 13 * s)}" y="${f(cy - 24 * s)}" width="${f(26 * s)}" height="${f(1.7 * s)}" fill="#5e6368"/>`
}

/* ── 中心零位表盘（照 iconsnewname/电流表_6.png：−50..0..50 双极性刻度，0 在正上） ──
 * 与 A/V 表同一副 CAD：白面 (25,27)-(230,169)、轴心 (128,164)、两柱 x59.5 / 196.5 @ y194。
 * 刻度由「连续弧线 + 站在弧上的短齿」组成（不是一整排长刺）：
 *   弧线内沿实测 r93(正上) → r105(弧两端)，拍照透视下呈抛物线 r = 93 + 12·t²（t = |θ−270|/53）；
 *   短齿从弧线向外 5.2、长齿 8.5，齿宽 1.3 / 1.8。
 * 数字按 256 原图连通块逐个定位（r 110..122）；左右两端只有 5~7px 的「−」「+」小记号。
 */
const CZ = {
  dialX: 25, dialY: 27, dialW: 206, dialH: 143, hubX: 128, hubY: 164,
  aMid: 270, aL: 215.8, aR: 324.6,
  rArc: 93, rBend: 9, tickShort: 5.5, tickLong: 9.8,
}
/* 21 根齿的逐处实测角（沿弧外侧逐 0.2° 扫暗段得到，原图本身不是等分的：
 * 左侧 10.3/10.9/10.7/11.0/10.8，右侧 11.0/11.2/10.6/10.8/10.6 —— 照抄比“等分”更准）。
 * 偶数位是长齿（= 数字），奇数位一根短齿：**每两个大格之间只有一根短齿**。 */
const CZ_TICKS = [
  216.3, 221.0, 226.6, 231.7, 237.5, 242.6, 248.2, 253.6, 259.2, 264.6,
  270.0,
  275.6, 281.0, 286.8, 292.2, 297.8, 302.8, 308.5, 313.6, 319.3, 324.2,
]
/* 大格 = 数字所在的长齿（左右各 5 大格），**大格之间只有一根短齿**。原图沿弧外侧逐 0.2°
 * 采样得 21 根齿：长齿在 216.3 / 226.7 / 237.5 / 248.2 / 259.2 / 270 / 281 / 292.2 /
 * 302.8 / 313.6 / 324.2（间距 10.78°，即 step 5.39 的偶数格），短齿夹在中间。 */
/* 11 个数字：角取长齿角（数字正对长齿），半径照原图逐处实测 119/116/113.5/112/111/111/111/113/114/117.5/121.5 */
const CZ_NUMS = [
  ['50', 119], ['40', 116], ['30', 113.5], ['20', 112], ['10', 111], ['0', 111],
  ['10', 111], ['20', 113], ['30', 114], ['40', 117.5], ['50', 121.5],
]

function centerFaceSVG(x, y, w, h, cfg = {}) {
  const s = w / CZ.dialW
  const cx = x + (CZ.hubX - CZ.dialX) * s
  const cy = y + (CZ.hubY - CZ.dialY) * s
  const rad = (d) => (d * Math.PI) / 180
  const f = (v) => v.toFixed(2)
  const INK = '#777c81'
  const ARC = '#5a5f64'
  const TICK = '#7d8287'
  const TICK_M = '#4b5056'
  const arcR = (a) => (CZ.rArc + CZ.rBend * Math.pow(Math.abs(a - CZ.aMid) / 53, 2)) * s
  const pt = (a, r) => [cx + Math.cos(rad(a)) * r, cy + Math.sin(rad(a)) * r]

  // 刻度弧线（80 段折线，等效抛物线弧）
  let d = ''
  for (let i = 0; i <= 80; i++) {
    const a = CZ.aL + (CZ.aR - CZ.aL) * (i / 80)
    const [px, py] = pt(a, arcR(a))
    d += `${i ? 'L' : 'M'}${f(px)} ${f(py)}`
  }

  // 齿：垂直弧线在该点的切线（沿法线向外），不是指向轴心的径向
  const arcPt = (a) => pt(a, arcR(a))
  const tick = (a, len, w, color) => {
    const [q1x, q1y] = arcPt(a - 1.2)
    const [q2x, q2y] = arcPt(a + 1.2)
    let nx = -(q2y - q1y)
    let ny = q2x - q1x
    const L = Math.hypot(nx, ny) || 1
    nx /= L
    ny /= L
    const [px, py] = arcPt(a)
    if (nx * (px - cx) + ny * (py - cy) < 0) { nx = -nx; ny = -ny }   // 只取朝弧外那一侧
    return `<line x1="${f(px)}" y1="${f(py)}" x2="${f(px + nx * len * s)}" y2="${f(py + ny * len * s)}" stroke="${color}" stroke-width="${f(w * s)}"/>`
  }
  // 21 根齿逐处落位；偶数位是长齿（= 数字），奇数位一根短齿
  let ticks = ''
  CZ_TICKS.forEach((a, k) => {
    const major = k % 2 === 0
    ticks += tick(a, major ? CZ.tickLong : CZ.tickShort, major ? 2.2 : 1.7, major ? TICK_M : TICK)
  })

  const mark = (a, str, r, size, weight) => {
    const [tx, ty] = pt(a, r * s)
    return `<text x="${f(tx)}" y="${f(ty)}" transform="rotate(${f(a + 90)} ${f(tx)} ${f(ty)})" text-anchor="middle" dominant-baseline="middle" font-size="${f(size * s)}" font-weight="${weight || 500}" letter-spacing="${f(-1 * s)}" fill="${INK}">${str}</text>`
  }
  let marks = ''
  // 数字：原图是“字基线压在长齿上”，墨迹质心比长齿朝中心偏约 1°、半径小 1.2px —— 照此落位
  CZ_NUMS.forEach(([str, r], k) => {
    const a = CZ_TICKS[k * 2]
    marks += mark(a + (a <= CZ.aMid ? 0.7 : -1.1), str, r - 1.0, 12)
  })
  marks += mark(213.4, '−', 94.6, 11, 600)   // 左端「−」：原图只是弧首外侧一小横
  marks += mark(325.3, '+', 93.6, 13, 600)        // 右端「+」

  return `
    <defs>
      <clipPath id="es-cp-${cfg.clip || 'czf'}">
        <rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}"/>
      </clipPath>
    </defs>
    <rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="${f(2.5 * s)}" fill="url(#es-g-meterface)"/>
    <g clip-path="url(#es-cp-${cfg.clip || 'czf'})">
      <path d="${d}" fill="none" stroke="${ARC}" stroke-width="${f(1.9 * s)}" stroke-linejoin="round"/>
      ${ticks}
    </g>
    ${marks}
    <text x="${f(cx)}" y="${f(cy - 38 * s)}" text-anchor="middle" dominant-baseline="middle"
      font-size="${f(28 * s)}" font-weight="400" fill="#969ba0">mA</text>
    <rect x="${f(cx - 14 * s)}" y="${f(cy - 25 * s)}" width="${f(28 * s)}" height="${f(2.2 * s)}" fill="#5e6368"/>`
}
/** 接线柱圆点叠层：黑、红、红（金属座圈 + 彩色柱帽，照片缺中柱时补齐三个柱位） */
function termDotsSVG(dots) {
  return dots.map(({ x, y, label, dark }) => {
    const cp = capPaint(dark)
    return `
    <circle cx="${x}" cy="${y}" r="7" fill="#0b0d10" stroke="#8d96a1" stroke-width="1.6"/>
    <circle cx="${x}" cy="${y}" r="4.8" fill="${cp.fill}" stroke="${cp.stroke}" stroke-width="1"/>
    <circle cx="${x - 1.4}" cy="${y - 1.4}" r="1.5" fill="rgba(255,255,255,0.45)"/>
    <text x="${x}" y="${y + 16}" text-anchor="middle" font-size="8.5" font-weight="700" fill="#24292f">${label}</text>`
  }).join('')
}

/**
 * 单向开关：底座 + 接线柱 + 铰链柱 + 触口前后卡槽 + 闸刀，全部矢量。
 * 结构照 12开关拆解.png，光位与配色照 2.单向开关.png。换算：参考图 3..228 → 0..150（×0.6667），
 * 底座顶面后沿 y179 → y80（Y = 80 + (y-179)×0.6667）。
 */
/**
 * 单向开关的渐变定义：灰阶按 `2.单向开关.png` 逐处取样（后暗前亮、上暗下亮），
 * 柱帽照电池组/蓄电池已定的标杆做法：**凹陷帽顶（外圈亮、帽心暗）+ 镀铬底圈**。
 * id 前缀 swi- ，避免和场景里其它器材的 defs 撞名。
 */
function switchSVGDefs() {
  const lin = (id, x1, y1, x2, y2, stops) =>
    `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">` +
    stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('') +
    `</linearGradient>`
  const rad = (id, stops, cx = '50%', cy = '46%', r = '56%') =>
    `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}">` +
    stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('') +
    `</radialGradient>`
  // 横向圆柱渐变（相对元素自身包围盒，左右两帽共用）：两侧压暗、偏左一道亮带 → 金属柱面感
  const cyl = (id, stops) =>
    `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0">` +
    stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('') +
    `</linearGradient>`
  return `<defs>
    ${lin('swi-bt', 0, 74.3, 0, 99.1, [[0, '#7d8288'], [0.27, '#868a90'], [0.365, '#9ba0a5'], [0.455, '#a7acb1'], [0.55, '#b8bdc2'], [0.65, '#c7cbcf'], [0.74, '#d0d4d8'], [0.84, '#d8dbde'], [0.93, '#dcdedf'], [1, '#dcdedf']])}
    ${lin('swi-bx', 0, 0, 176, 0, [[0, 'rgba(20,24,30,.10)'], [0.55, 'rgba(20,24,30,.02)'], [1, 'rgba(255,255,255,.06)']])}
    ${lin('swi-bf', 0, 99.1, 0, 107.7, [[0, '#a8acb1'], [0.2, '#a0a4a9'], [0.55, '#7e8287'], [0.9, '#63676c'], [1, '#5e6267']])}
    ${lin('swi-pt', 0, 53.5, 0, 89.5, [[0, '#b0b5bb'], [0.04, '#a9afb5'], [0.11, '#a6acb3'], [0.24, '#a8aeb5'], [0.34, '#b2b8bf'], [0.42, '#c4cad0'], [0.5, '#d6dbe0'], [0.58, '#e8ecef'], [0.64, '#f2f4f6'], [0.71, '#f3f5f6'], [0.8, '#e8ebee'], [1, '#d8dcdf']])}
    ${lin('swi-cb', 0, 53.5, 0, 89, [[0, '#c4c9cf'], [0.3, '#d9dde1'], [1, '#eff2f4']])}
    ${lin('swi-cf', 0, 55.5, 0, 89, [[0, '#5a5f66'], [0.12, '#70767d'], [0.21, '#8f959c'], [0.33, '#aeB4bb'], [0.45, '#cacfd5'], [0.57, '#e4e8ec'], [0.69, '#f2f4f6'], [0.81, '#eaedef'], [1, '#e0e4e7']])}
    ${lin('swi-bl', 0, 57.5, 0, 71.5, [[0, '#e2e7ec'], [0.08, '#b8bec5'], [0.16, '#a6acb3'], [0.26, '#91979e'], [0.45, '#999fa6'], [0.66, '#a7adb4'], [0.86, '#b5bbc2'], [0.95, '#c3c9cf'], [1, '#e8edf1']])}
    ${lin('swi-hd', 0, 56.25, 0, 72.75, [[0, '#7b8187'], [0.05, '#3d4248'], [0.2, '#4f545a'], [0.4, '#454a50'], [0.62, '#3d4248'], [0.86, '#373b40'], [1, '#4d5258']])}
    ${cyl('swi-kb', [[0, '#41454a'], [0.16, '#4e5257'], [0.36, '#5f6367'], [0.48, '#6b6f73'], [0.6, '#5b5f63'], [0.84, '#474b4f'], [1, '#3c4044']])}
    ${cyl('swi-kr', [[0, '#8e1a09'], [0.16, '#b2240d'], [0.36, '#c93010'], [0.48, '#d63c16'], [0.6, '#c52e0f'], [0.84, '#a02008'], [1, '#7f1506']])}
    ${cyl('swi-ch', [[0, '#64686d'], [0.16, '#979ca1'], [0.3, '#cdd1d5'], [0.42, '#e9ecee'], [0.56, '#c3c7cc'], [0.8, '#8e9297'], [1, '#666a6f']])}
    ${rad('swi-sp', [[0, 'rgba(255,255,255,.9)'], [0.45, 'rgba(255,255,255,.32)'], [1, 'rgba(255,255,255,0)']], '50%', '50%', '50%')}
    ${rad('swi-kbt', [[0, '#1f2124'], [0.42, '#26282b'], [0.62, '#313438'], [0.78, '#4a4f54'], [0.88, '#65696d'], [0.96, '#7d8185'], [1, '#8a8e92']])}
    ${rad('swi-krt', [[0, '#6f1408'], [0.42, '#8e1c0b'], [0.62, '#ab2a13'], [0.78, '#c23520'], [0.88, '#cb3a24'], [0.96, '#d2402a'], [1, '#d5442e']])}
  </defs>`
}

/**
 * 开关底座 + 接线柱：照 `12开关拆解.png` 底座与柱帽、`2.单向开关.png` 的光位重绘。
 *   底座一块板：长 176 = 灯泡底板同长；进深 24.8 = 0.141×宽、前沿 8.6 = 0.054×宽（与灯泡同一透视）。
 *   顶面（后暗 → 前亮）、横向再叠一层左暗右亮；前沿暗面、底沿亮线 + 近白倒角；左右亮棱。
 *   柱帽：**以灯泡底座（`bulb_c.png`）的柱帽为基准**——凹心帽顶 + 滚花帽身 + 帽下镀铬柱体（横向圆柱渐变）。
 *   柱心 x28（左黑）/ x151（右红）= 灯泡接线柱同一 x；帽径 23.4 = 底板的 13.3%（同灯泡）；
 *   帽脚线 y89.5（进深 61%，比灯泡基准的 74% 略往里收）。
 */
function switchBodySVG() {
  return `
    ${switchSVGDefs()}
    <!-- 底座顶面：长 176 / 进深 24.8（后暗前亮） -->
    <path d="M3 74.3 H173 L176 99.1 H0 Z" fill="url(#swi-bt)"/>
    <path d="M3 74.3 H173 L176 99.1 H0 Z" fill="url(#swi-bx)"/>
    <line x1="3" y1="74.5" x2="173" y2="74.5" stroke="#ffffff" stroke-width=".9" opacity=".9"/>
    <line x1="3" y1="76.3" x2="173" y2="76.3" stroke="#82878d" stroke-width="1.2" opacity=".45"/>
    <path d="M3 74.3 L0 99.1" stroke="#eef2f4" stroke-width="1" opacity=".85"/>
    <path d="M173 74.3 L176 99.1" stroke="#eef2f4" stroke-width="1" opacity=".85"/>
    <!-- 底座：前沿暗面 + 底沿亮线 + 近白倒角 -->
    <rect x="0" y="99.1" width="176" height="8.6" fill="url(#swi-bf)"/>
    <rect x="0" y="107.7" width="176" height="1.1" fill="#a9aaaa"/>
    <rect x="0" y="108.6" width="176" height="0.9" fill="#ececec"/>`
}

/**
 * 两颗接线柱（画在闸刀之后：闭合时刀柄会掠过红帽顶，柱帽在前、压住刀柄下缘才自然）。
 *   右柱心 x151 = 灯泡位置；左柱心 x26（比灯泡的 28 左让 2，让开铰链柱免得两件贴在一起）；
 *   帽径 20.4 = 176 宽底板的 11.6%，帽高/帽宽 0.56（灯泡实测 0.57 → 偏扁）；
 *   帽脚线 y89.5 = 进深 61%，比两块立片的柱脚（86.4 / 86.8 / 87.2，约进深 50%）略靠前——
 *   照 `2.单向开关.png` 放大 8 倍的实测：柱脚落在进深 ~61%、立片脚落在 ~50%，两者不是同一根线。
 */
function switchKnobsSVG() {
  const dark = capPaint(true), red = capPaint(false)
  const D = 20.4, R = D / 2, FOOT = 89.5
  const knob = (cx, cp, bodyId, topId) => {
    // 竖纹：灯泡柱帽是滚花旋钮，横向 9 道细竖纹（间距≈0.1 帽径，低对比）
    const ribs = [-4, -3, -2, -1, 0, 1, 2, 3, 4].map(i => {
      const x0 = cx + i * 2.1, x1 = x0 - i * .3
      const c = i % 2 === 0 ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.11)'
      return `<line x1="${x0}" y1="80.6" x2="${x1}" y2="85.5" stroke="${c}" stroke-width=".8"/>`
    }).join('')
    return `
    <ellipse cx="${cx}" cy="91" rx="10.6" ry="1.9" fill="#7c8186" opacity=".3"/>
    <!-- 帽下镀铬柱体（宽 ≈0.81 帽径；横向圆柱渐变 → 两侧压暗、偏左一道高光，金属光泽） -->
    <path d="M${cx - R * .76} 85.6 L${cx - R * .81} ${FOOT} H${cx + R * .81} L${cx + R * .76} 85.6 Z" fill="url(#swi-ch)"/>
    <ellipse cx="${cx}" cy="${FOOT}" rx="${R * .81}" ry="1.4" fill="#6b6f74" opacity=".95"/>
    <ellipse cx="${cx}" cy="88.7" rx="4.6" ry=".65" fill="url(#swi-sp)"/>
    <!-- 帽身（圆柱横向渐变）+ 凹心帽顶（帽心暗、帽沿一圈中灰）
         灯泡实测：帽高/帽宽≈0.57、顶椭圆 ry/rx≈0.33、帽面可见高度≈0.275 帽宽；这里 12.2/20.4 = 0.60 -->
    <rect x="${cx - R}" y="78.4" width="${D}" height="7.2" rx="1.7" fill="url(#${bodyId})" stroke="${cp.stroke}" stroke-width=".9"/>
    <ellipse cx="${cx}" cy="85.6" rx="${R}" ry="1.7" fill="url(#${bodyId})"/>
    ${ribs}
    <ellipse cx="${cx}" cy="78.4" rx="${R}" ry="3.3" fill="url(#${topId})"/>`
  }
  return `
    ${knob(26, dark, 'swi-kb', 'swi-kbt')}
    ${knob(151, red, 'swi-kr', 'swi-krt')}`
}

/**
 * 铰链柱 + 右触口前后卡槽 + 闸刀（正视角，比例按 2.单向开关.png 实测换算到 150×105）：
 *   两块立片都站在底座顶面的**进深约 50%**（脚下 y≈86.4~87.2，顶面 74.3~99.1），
 *   比接线柱（61%，y89.5）略靠后——照 `2.单向开关.png` 8 倍放大实测，不是同一条线；
 *   脚下再压一道椭圆投影；绘制顺序 = 后卡槽片 → 闸刀（含黑柄）→ 铰链柱 → 前卡槽片 → 铰链螺栓。
 *   **杠杆穿在铰链柱后面**（照参考图：柱头压在刀身上，刀尾圆头从柱左侧露出来，穿孔在柱面上）；
 *   右触口前后两片错开 1 个单位，前片顶部那道暗带就是"卡槽"开口（参考 y138~152 的 #5c~#95 暗带），
 *   闭合时闸刀穿在前片后面、后片前面，刀尖从前片右侧露出再接黑柄。
 *   铰链穿孔 = 深环 4.6 + 亮垫圈 3.4 + 背景色通孔 2.2；开启角 -27°。
 */
function bladeSVG(open) {
  const PX = 46.3, PY = 64.5       // 铰链轴心（刀与柱共用的穿孔中心）
  const BUTT = 35                 // 刀尾圆头（探出铰链柱左侧 4.3）
  const TIP = 140                 // 刀尖：穿过卡槽、从前片右侧露出（柄再往后接）
  const BX0 = 121.7, BX1 = 133    // 后卡槽片（略高、向后错开）
  const FX0 = 122.7, FX1 = 134    // 前卡槽片
  const PTW = 14                  // 铰链柱宽
  const ang = open ? -27 : 0
  const BG = '#fbfcfe'
  // 立片轮廓（圆头立板）：顶部半圆 + 直边到底
  const tomb = (x, w, top, bot) => {
    const r = w / 2
    return `M${x} ${bot} V${top + r} A${r} ${r} 0 0 1 ${x + w} ${top + r} V${bot} Z`
  }
  const capArc = (x, w, top) => {
    const r = w / 2
    return `M${x} ${top + r} A${r} ${r} 0 0 1 ${x + w} ${top + r}`
  }
  return `
    <!-- 两块立片脚下各一道投影（落在顶面进深约 50% 处，比接线柱略靠后） -->
    <ellipse cx="${PX}" cy="88.4" rx="7.6" ry="2" fill="#8b8f94" opacity=".2"/>
    <ellipse cx="${(BX0 + FX1) / 2}" cy="88.8" rx="7.6" ry="2" fill="#8b8f94" opacity=".2"/>
    <!-- 右触口：后卡槽片（先画，刀从它前面穿过） -->
    <path d="${tomb(BX0, BX1 - BX0, 53.5, 86.4)}" fill="url(#swi-cb)" stroke="#90969d" stroke-width=".9"/>
    <!-- 闸刀（刀尾探出柱左侧 + 刀身穿进卡槽 + 末端黑柄）：画在铰链柱后面 -->
    <g transform="rotate(${ang} ${PX} ${PY})">
      <rect x="${BUTT}" y="${PY - 7}" width="${TIP - BUTT}" height="14" rx="3.5" fill="url(#swi-bl)" stroke="rgba(126,132,139,.45)" stroke-width=".7"/>
      <!-- 黑色绝缘柄（照拆解图：罩在刀末端，圆角矩形、比刀略厚） -->
      <rect x="${TIP - 1}" y="${PY - 8.25}" width="27" height="16.5" rx="5" fill="url(#swi-hd)" stroke="#24272b" stroke-width=".8"/>
    </g>
    <!-- 左：铰链柱（站在顶面进深中间，柱头压在刀身上；顶缘一道亮箍） -->
    <path d="${tomb(PX - PTW / 2, PTW, 53.5, 86.8)}" fill="url(#swi-pt)" stroke="#7d838a" stroke-width=".9"/>
    <path d="${capArc(PX - PTW / 2, PTW, 53.5)}" fill="none" stroke="#dfe3e7" stroke-width=".8" opacity=".75"/>
    <!-- 右触口：前卡槽片（后画；圆头顶部那道暗带就是卡槽开口，刀夹在前后两片之间） -->
    <path d="${tomb(FX0, FX1 - FX0, 55.5, 87.2)}" fill="url(#swi-cf)" stroke="#6a7077" stroke-width=".9"/>
    <path d="${capArc(FX0, FX1 - FX0, 55.5)}" fill="none" stroke="#cfd4d9" stroke-width=".8" opacity=".85"/>
    <!-- 铰链螺栓：深色环 + 亮垫圈 + 与背景同色的通孔（压在柱面上） -->
    <circle cx="${PX}" cy="${PY}" r="4.6" fill="#6d737a" stroke="#4a5057" stroke-width=".8"/>
    <circle cx="${PX}" cy="${PY}" r="3.4" fill="#e2e6ea"/>
    <circle cx="${PX}" cy="${PY}" r="2.2" fill="${BG}"/>`
}

/**
 * 单个接线柱圆点（金属座圈 + 彩色柱帽）。
 * 全项目统一配色约定：**位于器材右侧（正极/后接端）的柱帽用红色 #c0392b，
 * 左侧（负极/前端）用黑色 #1c1f24**；纵向排布、无左右之分的（验电器球/地、
 * 继电器线圈圈1/圈2）不套用此约定。新增器材请照此传 dark。
 */
function termDotSVG(x, y, dark = false, label = '') {
  const cp = capPaint(dark)
  return `
    <circle cx="${x}" cy="${y}" r="6.4" fill="#0b0d10" stroke="#8d96a1" stroke-width="1.5"/>
    <circle cx="${x}" cy="${y}" r="4.4" fill="${cp.fill}" stroke="${cp.stroke}" stroke-width="1"/>
    <circle cx="${x - 1.2}" cy="${y - 1.2}" r="1.3" fill="rgba(255,255,255,0.45)"/>
    ${label ? `<text x="${x}" y="${y + 15}" text-anchor="middle" font-size="8.5" font-weight="700" fill="#24292f">${label}</text>` : ''}`
}

/** 旁注胶囊（深底彩字） */
function noteChipSVG(x, y, text, color = '#4ade80', w = 84) {
  return `
    <g transform="translate(${x},${y})">
      <rect x="${-w / 2}" y="-9" width="${w}" height="18" rx="6" fill="#0f172a" opacity="0.88"/>
      <text x="0" y="4" text-anchor="middle" font-size="10" font-weight="600" fill="${color}"
            font-family="ui-monospace,Consolas,monospace">${text}</text>
    </g>`
}

/**
 * 单刀双掷闸刀叠层：绕 com 转轴摆向掷点 A（pos=0）或 B（pos=1）。
 * 转轴 (90,102) → 掷点 (34,46)/(146,46)，与 TYPES.switch2 柱位一致。
 */
function spdtBladeSVG(pos) {
  const px = 90, py = 102
  const ang = (pos ?? 0) === 1 ? 45 : -45
  return `
    <g transform="rotate(${ang} ${px} ${py})">
      <!-- 杠杆（钢色，末端黑色绝缘柄） -->
      <rect x="${px - 5}" y="${py - 86}" width="10" height="92" rx="3"
            fill="url(#es-g-steel)" stroke="#6b7684" stroke-width="1"/>
      <rect x="${px - 11}" y="${py - 108}" width="22" height="26" rx="11"
            fill="#232426" stroke="#101113" stroke-width="1.2"/>
      <rect x="${px - 6.5}" y="${py - 102}" width="13" height="4" rx="2" fill="#3c3e42"/>
    </g>`
}

/**
 * 电动机叶轮叠层（装在皮带轮上）：on 时按电流大小转速旋转。
 */
function motorFanSVG(cx, cy, on, I) {
  const speed = Math.max(0.32, Math.min(3.2, 1.6 / (0.35 + Math.abs(I || 0) * 5)))
  const blade = (rot) => `
    <g transform="rotate(${rot} ${cx} ${cy})">
      <path d="M${cx} ${cy - 7} C${cx + 16} ${cy - 20}, ${cx + 30} ${cy - 40}, ${cx + 22} ${cy - 52}
               C${cx + 12} ${cy - 46}, ${cx + 4} ${cy - 26}, ${cx} ${cy - 7} Z"
            fill="#dde5ee" stroke="#7c8693" stroke-width="1.1" opacity="0.93"/>
    </g>`
  return `
    <style>.es-motor-fan{transform-box:view-box;transform-origin:${cx}px ${cy}px;
      animation:es-motor-spin linear infinite;animation-play-state:${on ? 'running' : 'paused'}}
      @keyframes es-motor-spin{to{transform:rotate(360deg)}}</style>
    <g class="es-motor-fan" style="animation-duration:${speed.toFixed(2)}s">
      ${blade(0)}${blade(120)}${blade(240)}
      <circle cx="${cx}" cy="${cy}" r="9.5" fill="#333a44" stroke="#1d232b" stroke-width="1.2"/>
      <circle cx="${cx}" cy="${cy}" r="4.4" fill="#8d96a1"/>
    </g>`
}

/**
 * 发光二极管灯罩：on 时亮起 + 光晕。
 */
function ledDomeSVG(cx, cy, on) {
  const glow = on
    ? `<circle cx="${cx}" cy="${cy}" r="34" fill="url(#es-g-glow)" opacity="0.95"/>
       <circle cx="${cx}" cy="${cy - 4}" r="12" fill="#fff3d6" opacity="0.9"/>`
    : ''
  return `
    ${glow}
    <!-- 环氧树脂半球灯罩（阴极侧有平面切口） -->
    <path d="M${cx - 17} ${cy + 12} L${cx - 17} ${cy - 2} A17 19 0 0 1 ${cx + 17} ${cy - 2} L${cx + 17} ${cy + 12} Z"
          fill="${on ? 'url(#es-g-glow)' : 'url(#es-g-glass)'}"
          stroke="${on ? '#f59e0b' : '#b6cfe6'}" stroke-width="1.4"
          style="${on ? 'filter:saturate(1.6) brightness(1.35)' : ''}"/>
    <path d="M${cx + 12} ${cy - 8} L${cx + 17} ${cy - 2} L${cx + 17} ${cy + 12} L${cx + 8} ${cy + 12} Z"
          fill="${on ? 'rgba(255,220,150,0.55)' : 'rgba(182,207,230,0.35)'}"/>
    <!-- 管座（金属卡环） -->
    <rect x="${cx - 15}" y="${cy + 11}" width="30" height="8" rx="2.5"
          fill="url(#es-g-steel)" stroke="#7c8693" stroke-width="1"/>`
}

/**
 * 定值电阻（色环电阻）工厂：5/10/15Ω 共用外观，色环与读数随阻值变化。
 * 色环 4 环制：[十位色, 个位色, 倍率色, 误差金]。
 */
function resistorType(ohm, bands) {
  const band = (x, c) => `<rect x="${x}" y="26" width="7" height="22" fill="${c}"/>`
  return {
    label: `定值电阻 ${ohm}Ω`, w: 176, h: 92,
    terminals: [
      { id: 'a', label: '1', name: '左接线柱', x: 30, y: 72 },
      { id: 'b', label: '2', name: '右接线柱', x: 146, y: 72 },
    ],
    render() {
      return `
    <svg width="176" height="92" viewBox="0 0 176 92">
      ${fitInner(176, 92, 176, 92, INNER.resistor())}
      <g class="casing">
        <!-- 胶木底板 -->
        <rect x="20" y="62" width="136" height="22" rx="6" fill="#2b2e33" stroke="#14171b" stroke-width="1"/>
        <rect x="20" y="62" width="136" height="7" rx="3.5" fill="#3a3f46" opacity=".8"/>
        <!-- 铜引线 -->
        <path d="M50 47 C50 60, 34 58, 30 68" fill="none" stroke="#b87333" stroke-width="3.2" stroke-linecap="round"/>
        <path d="M126 47 C126 60, 142 58, 146 68" fill="none" stroke="#b87333" stroke-width="3.2" stroke-linecap="round"/>
        <!-- 金属端帽 + 瓷体 -->
        <rect x="46" y="27" width="8" height="20" rx="2" fill="url(#es-g-steel)" stroke="#7c8693" stroke-width="0.8"/>
        <rect x="122" y="27" width="8" height="20" rx="2" fill="url(#es-g-steel)" stroke="#7c8693" stroke-width="0.8"/>
        <rect x="52" y="26" width="72" height="22" rx="8" fill="url(#es-g-ceramic)" stroke="#b7a888" stroke-width="1"/>
        ${band(62, bands[0])}${band(72, bands[1])}${band(104, bands[2])}${band(114, bands[3])}
        <rect x="52" y="26" width="72" height="7" rx="3.5" fill="#fff" opacity=".22"/>
      </g>
      ${termDotSVG(30, 72, true, '1')}
      ${termDotSVG(146, 72, false, '2')}
      ${noteChipSVG(88, 12, `R = ${ohm} Ω`, '#fbbf24', 72)}
    </svg>` }
  }
}

export const TYPES = {
  /* ── 电池组（两节干电池串联 3V，平放电池槽实拍图；黑/红柱就是照片上的接线柱，不再另画帽子） ──
   * 图 battery_c.png 已按实体紧裁（原图 y 92~164）并 4 倍放大锐化，1024×288，按 150×42 等比贴。
   * 柱心坐标不是换算出来的，而是在 4 倍 1:1 渲染上逐柱量出来的（tools/term-audit.html +
   * scripts/post-grid.py 的绝对标尺 + scripts/post-local.py 的局部色块）：黑柱 (16,22)、红柱 (137,22)。
   * 原先写的 (25,28)/(134,28) 是拿照片整体比例估的，黑柱往右偏了 8、两颗柱子都低了 6~7 ——
   * 用户点名的"电池左接线柱明显偏右"就是这个。 */
  battery: {
    label: '电池组', w: 150, h: 46,
    terminals: [
      { id: 'n', label: '−', name: '负极接线柱（黑）', x: 16, y: 22 },
      { id: 'p', label: '+', name: '正极接线柱（红）', x: 135, y: 22 },
    ],
    render() {
      return `
    <svg width="150" height="46" viewBox="0 0 150 46">
      ${fitInner(150, 42, 150, 42, INNER.batteryCells())}
      <image class="casing" href="${figURL('battery_c.png')}" x="0" y="0" width="150" height="42"/>
    </svg>` }
  },

  /* ── 蓄电池（12V，蓝色壳体实拍图 accumulator_c.png；柱帽即照片上的金属柱，不再套红黑圆环） ──
   * 照片 175×180 → 150×154 等比贴；柱心不是换算的，是按 4 倍 1:1 渲染实测的 (41,9)、(106,9)。
   * 原先估的 y=19 落在柱帽下方的壳面上（核查图里圈明显偏下）。 */
  accumulator: {
    label: '蓄电池', w: 150, h: 154,
    terminals: [
      { id: 'n', label: '−', name: '负极接线柱', x: 41, y: 9 },
      { id: 'p', label: '+', name: '正极接线柱', x: 106, y: 9 },
    ],
    render() {
      return `
    <svg width="150" height="154" viewBox="0 0 150 154">
      ${fitInner(150, 80, 150, 154, INNER.accumulator())}
      ${photo('accumulator_c.png', 150, 154)}
    </svg>` }
  },

  /* ── 小灯泡（实拍图 1:1：玻璃泡+灯丝+白瓷灯座+台板，左黑右红接线柱 + 四档灯丝色温） ──
   * 柱心按 4 倍 1:1 渲染实测：黑帽 (26,52)、红帽 (146,52)。 */
  bulb: {
    label: '小灯泡', w: 176, h: 83,
    terminals: [
      { id: 'a', label: '1', name: '接线柱 1', x: 26, y: 52 },
      { id: 'b', label: '2', name: '接线柱 2', x: 146, y: 52 },
    ],
    render(c, dyn = {}) {
      const bright = Math.max(0, Math.min(1, Number(dyn.bright) || 0))
      const over = !!dyn.over // 超过额定功率：刺白 + 闪烁警示

      // 灯丝色温四档：与 3D emissive 共用同一份 BULB_STAGE（见文件头）
      const { core, halo } = bulbTempColor(bright)
      const rgb = (a) => `rgb(${a[0]},${a[1]},${a[2]})`

      // 渐变 id 必须按器材 + 亮度唯一，否则同一文档里多只亮度不同的灯泡会串色
      const uid = String(c.id || 'x').replace(/[^A-Za-z0-9_-]/g, '')
      const gid = `es-bulbfil-${uid}-${Math.round(bright * 100)}${over ? '-o' : ''}`
      const oid = `es-bulbout-${uid}-${Math.round(bright * 100)}`
      const rid = `es-bulbray-${uid}-${Math.round(bright * 100)}`
      const animOver = over
        ? '<animate attributeName="opacity" values="1;0.55;1" dur="0.9s" repeatCount="indefinite"/>'
        : ''

      /* 发光＝「中心亮、向外逐步淡」的三层同心柔光 + 一圈等长细芒。
         以前是 12 长 + 12 短的交错锥形（长短不一 → 看着像四射的爆炸，太夸张），
         现在：① 光芒 18 根、角度均分、长度一致；② 长度收短（满亮也只有 9+11px，越出玻璃泡不多）；
         ③ 主要亮度交给径向渐变（中心 → 外圈连续掉到 0），所以整体是柔和的光团而不是尖刺。 */
      const hot = Math.max(0, Math.min(1, (bright - 0.40) / 0.60))
      const rMid = 25 + bright * 11          // 近玻璃的暖白光晕（核心）
      const rOut = 38 + bright * 13          // 外圈大范围柔光（让边缘自然消失）
      const cx = 89, cy = 25
      const gold = [255, 190, 110]   // 暖金：白光芒在浅色底板上等于看不见
      const lid = `es-bulblit-${uid}-${Math.round(bright * 100)}`

      const rays = (dyn.rays !== false) && hot > 0.03
        ? (() => {
          const R0 = 26 + bright * 3                  // 起点：玻璃泡外沿，别压住泡本身
          const L = 9 + 11 * hot                      // 等长细芒（原来 14+25，太长了）
          let out = ''
          for (let i = 0; i < 18; i++) {
            out += `<g transform="rotate(${i * 20})"><path d="M -1.15 ${-R0} L 0 ${-(R0 + L)} L 1.15 ${-R0} Z" fill="url(#${rid})"/></g>`
          }
          return out
        })()
        : ''

      // 内部结构层按 256×121 的坐标画，其中灯座一段落在机框之外（y>83），
      // 会从底板下缘露出一截灰条——裁到机框内即可（剖视时也只该看机框内的东西）
      const clipId = `escl-bulb-${uid}`

      return `
    <svg width="176" height="83" viewBox="0 0 176 83">
      <defs>
        <clipPath id="${clipId}"><rect x="0" y="0" width="176" height="83"/></clipPath>
        <radialGradient id="${gid}" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="${rgb(core)}" stop-opacity="${(0.90 * bright).toFixed(3)}"/>
          <stop offset="22%" stop-color="${rgb(halo)}" stop-opacity="${(0.62 * bright).toFixed(3)}"/>
          <stop offset="52%" stop-color="${rgb(halo)}" stop-opacity="${(0.26 * bright).toFixed(3)}"/>
          <stop offset="100%" stop-color="${rgb(halo)}" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="${oid}" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="${rgb(gold)}" stop-opacity="${(0.24 * bright).toFixed(3)}"/>
          <stop offset="48%" stop-color="${rgb(gold)}" stop-opacity="${(0.10 * bright).toFixed(3)}"/>
          <stop offset="100%" stop-color="${rgb(gold)}" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="${lid}" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#FFFEF8" stop-opacity="${(0.95 * bright).toFixed(3)}"/>
          <stop offset="40%" stop-color="#FFE6AE" stop-opacity="${(0.52 * bright).toFixed(3)}"/>
          <stop offset="100%" stop-color="#FFC46A" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="${rid}" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stop-color="${rgb(gold)}" stop-opacity="0.62"/>
          <stop offset="55%" stop-color="${rgb(gold)}" stop-opacity="0.26"/>
          <stop offset="100%" stop-color="${rgb(gold)}" stop-opacity="0"/>
        </linearGradient>
        <radialGradient id="es-g-hub" cx="42%" cy="34%" r="62%">
          <stop offset="0%" stop-color="#f2f4f5"/>
          <stop offset="62%" stop-color="#cfd4d8"/>
          <stop offset="100%" stop-color="#a3a9af"/>
        </radialGradient>
      </defs>
      <g clip-path="url(#${clipId})">${fitInner(256, 121, 176, 83, INNER.bulb())}</g>
      ${bright > 0.02 ? `<circle cx="${cx}" cy="${cy}" r="${rOut.toFixed(1)}" fill="url(#${oid})" style="mix-blend-mode:screen"/>` : ''}
      ${hot > 0.03
        ? `<g transform="translate(${cx} ${cy})" opacity="${(0.18 + 0.34 * hot).toFixed(3)}">
        <g><animate attributeName="opacity" values="0.88;1;0.88" dur="2.8s" repeatCount="indefinite"/>${rays}</g>
      </g>`
        : ''}
      ${photo('bulb_c.png', 176, 83, `filter:brightness(${(0.97 + 0.07 * bright).toFixed(3)}) saturate(${(0.94 + 0.14 * bright).toFixed(2)})`)}
      ${bright > 0.02
        ? `<circle cx="${cx}" cy="${cy}" r="${(20 + 12 * bright).toFixed(1)}" fill="url(#${lid})" style="mix-blend-mode:screen"/>`
        : ''}
      ${bright > 0.02
        ? `<circle class="es-bulb-halo" cx="${cx}" cy="${cy}" r="${rMid.toFixed(1)}" fill="url(#${gid})" style="mix-blend-mode:screen">${animOver}</circle>`
        : ''}
      ${bright > 0.02
        ? `<circle cx="${cx}" cy="${cy}" r="${(3 + 8 * bright + 5 * hot).toFixed(1)}" fill="${rgb(core)}" opacity="${(0.55 * bright).toFixed(3)}" style="mix-blend-mode:screen"/>`
        : ''}
    </svg>` }
  },

  /* ── 单刀开关（实拍底座 + 可动闸刀：黑色手柄、左侧铰链） ──
   * 柱心必须跟 switchKnobsSVG 里画的那两个旋钮对齐（黑 x26 / 红 x151、帽身 78.4~85.6、
   * 柱脚 FOOT 89.5）→ 取 (26,82)/(151,82)；wireanchor +7 正好落在柱脚 89 上。 */
  switch: {
    label: '开关', w: 176, h: 110,
    terminals: [
      { id: 'a', label: '1', name: '接线柱 1', x: 26, y: 82 },
      { id: 'b', label: '2', name: '接线柱 2', x: 151, y: 82 },
    ],
    render(c) {
      const open = !c.closed
      return `
    <svg width="176" height="110" viewBox="0 0 176 110">
      ${fitInner(176, 100, 176, 110, INNER.switch())}
      ${switchBodySVG()}
      ${bladeSVG(open)}
      ${switchKnobsSVG()}
    </svg>` }
  },

  /* ── 电流表（1:1 复刻 iconsnewname/电流表_6.png：中心零位 −50..0..50，黑/红两柱） ── */
  ammeter: {
    label: '电流表', w: 150, h: 150, meter: 'I', centerZero: true,
    terminals: [
      { id: 'neg', label: '−', name: '负接线柱', x: 35, y: 114 },
      { id: 'pos', label: '+', name: '正接线柱', x: 115, y: 114 },
    ],
    render(c, dyn) {
      const K = 150 / 256
      const HUB = { x: 128 * K, y: 164 * K }
      const frac = Math.max(-1, Math.min(1, dyn?.frac || 0))
      // 中心零位：静止指正上（270°），左右各 52.5° 满偏；正电流向右偏
      const ang = (frac * 52.5).toFixed(2)
      const LEN = 101 * K
      return `
    <svg width="150" height="150" viewBox="0 0 150 150">
      <defs>
        <radialGradient id="es-g-meterface" cx="50%" cy="40%" r="66%">
          <stop offset="0%" stop-color="#ffffff"/>
          <stop offset="62%" stop-color="#fdfdfd"/>
          <stop offset="100%" stop-color="#f0f0ee"/>
        </radialGradient>
        <radialGradient id="es-g-hub" cx="42%" cy="34%" r="62%">
          <stop offset="0%" stop-color="#f2f4f5"/>
          <stop offset="62%" stop-color="#cfd4d8"/>
          <stop offset="100%" stop-color="#a3a9af"/>
        </radialGradient>
      </defs>
      ${fitInner(150, 150, 150, 150, INNER.meter(Math.abs(frac) * 22, 'mA'))}
      ${photo('ammeter6_c.png', 150, 150)}
      <!-- 表壳黑框 + 白盘归成「可淡出的一层」：一键透视时盘面半透明，露出后面的磁钢/线圈 -->
      <g class="esb-dial">
        <rect x="${25 * K}" y="${27 * K}" width="${206 * K}" height="${143 * K}" rx="${2.5 * K}" fill="#101317"/>
        ${centerFaceSVG(25 * K, 27 * K, 206 * K, 143 * K, { clip: 'czA' })}
      </g>
      <line x1="${HUB.x}" y1="${HUB.y}" x2="${HUB.x}" y2="${HUB.y - LEN}" stroke="#d01f24" stroke-width="1.45" stroke-linecap="round"
        transform="rotate(${ang} ${HUB.x} ${HUB.y})"/>
      <!-- 轴心：原图是一枚扁圆镀铬轴帽（y156..167），不是正圆 -->
      <ellipse cx="${HUB.x}" cy="${161.5 * K}" rx="${9.6 * K}" ry="${6.6 * K}" fill="url(#es-g-hub)" stroke="#7b8288" stroke-width="${1.0 * K}"/>
      <ellipse cx="${HUB.x}" cy="${161.5 * K}" rx="${4.6 * K}" ry="${3.0 * K}" fill="#c9ced3" stroke="#9aa1a7" stroke-width="${0.8 * K}"/>
      <ellipse cx="${(HUB.x - 1.2 * K)}" cy="${160.8 * K}" rx="${2.6 * K}" ry="${1.6 * K}" fill="#eef1f3" opacity="0.85"/>
    </svg>` }
  },

  /* ── 安培表（1:1 复刻 iconsnewname/8电流表.png：黑壳白盘双刻度 + 黑外伸底座三柱） ── */
  ammeterA: {
    label: '安培表', w: 150, h: 150, meter: 'I',
    terminals: [
      { id: 'neg', label: '−', name: '负接线柱', x: 33, y: 120 },
      { id: 'mid', label: '0.6', name: '0.6A 接线柱', x: 75, y: 120 },
      { id: 'full', label: '3', name: '3A 接线柱', x: 115, y: 120 },
    ],
    render(c, dyn) {
      // 接反（frac<0）时指针必须往 0 的左边甩，最多压到零位左限位（约 −0.28 满幅，
      // 再往左就出盘面了；读数里同时出现负号与「接反」）
      const frac = Math.max(-0.28, Math.min(1, dyn?.frac || 0))
      // 满幅 150 = 原图 256 的 0.58594 倍（原图逐像素实测，见 meterFaceSVG 注释）
      const K = 150 / 256
      const HUB = { x: 128 * K, y: 164 * K }
      // 针角：0 位 243.5°、满偏 322.2°（canvas 角）→ 相对竖直 -26.5° → +52.2°
      const ang = (-26.5 + frac * 78.7).toFixed(2)
      const LEN = 104 * K
      return `
    <svg width="150" height="150" viewBox="0 0 150 150">
      <defs>
        <radialGradient id="es-g-meterface" cx="50%" cy="40%" r="66%">
          <stop offset="0%" stop-color="#ffffff"/>
          <stop offset="62%" stop-color="#fdfdfd"/>
          <stop offset="100%" stop-color="#f0f0ee"/>
        </radialGradient>
        <radialGradient id="es-g-hub" cx="42%" cy="34%" r="62%">
          <stop offset="0%" stop-color="#f2f4f5"/>
          <stop offset="62%" stop-color="#cfd4d8"/>
          <stop offset="100%" stop-color="#a3a9af"/>
        </radialGradient>
      </defs>
      ${fitInner(150, 150, 150, 150, INNER.meter(Math.abs(frac) * 22, 'A'))}
      ${photo('ammeterA_c.png', 150, 150)}
      <g class="esb-dial">
        <rect x="${23 * K}" y="${27 * K}" width="${210 * K}" height="${142 * K}" rx="${2.5 * K}" fill="#101317"/>
        ${meterFaceSVG(24 * K, 26 * K, 207 * K, 143 * K, {
          clip: 'mA', unit: 'A', outer: ['0', '1', '2', '3'], inner: ['0.2', '0.4', '0.6'],
          /* 左端照 8电流表.png：外圈最左边那个字形是「1」（样本里 (29,82) 处，r129/220.5°），
           * 「−」不是标签、而是压在弧线最左端的小记号（213.2° / r111.8）。
           * 内圈左端的 0.2 样本在 (52,104.5) → 218° / r96.5。 */
          leftMarks: [
            { s: '1', a: 220.5, r: 129.5, fs: 18, w: '700' },
            { s: '\u2212', a: 213.2, r: 111.8, fs: 13 },
            { s: '0.2', a: 218, r: 96.5, fs: 14 },
          ],
          plus: '+',
        })}
      </g>
      <line x1="${HUB.x}" y1="${HUB.y}" x2="${HUB.x}" y2="${HUB.y - LEN}" stroke="#d01f24" stroke-width="1.7" stroke-linecap="round"
        transform="rotate(${ang} ${HUB.x} ${HUB.y})"/>
      <circle cx="${HUB.x}" cy="${HUB.y}" r="${9 * K}" fill="url(#es-g-hub)" stroke="#878d93" stroke-width="${1.1 * K}"/>
      <circle cx="${HUB.x}" cy="${HUB.y}" r="${3.2 * K}" fill="#a9afb5"/>
    </svg>` }
  },

  /* ── 电压表（1:1 复刻 iconsnewname/电压表_2.png：同副机芯，双刻度 0..15 / 0..3） ── */
  voltmeter: {
    label: '电压表', w: 130, h: 130, meter: 'U',
    terminals: [
      { id: 'neg', label: '−', name: '负接线柱', x: 29, y: 104 },
      { id: 'mid', label: '3', name: '3V 接线柱', x: 65, y: 104 },
      { id: 'full', label: '15', name: '15V 接线柱', x: 100, y: 104 },
    ],
    render(c, dyn) {
      // 同安培表：接反时指针压到零位左侧限位
      const frac = Math.max(-0.28, Math.min(1, dyn?.frac || 0))
      const K = 130 / 256
      const HUB = { x: 128 * K, y: 164 * K }
      const ang = (-26.5 + frac * 78.7).toFixed(2)
      const LEN = 104 * K
      return `
    <svg width="130" height="130" viewBox="0 0 130 130">
      <defs>
        <radialGradient id="es-g-meterface" cx="50%" cy="40%" r="66%">
          <stop offset="0%" stop-color="#ffffff"/>
          <stop offset="62%" stop-color="#fdfdfd"/>
          <stop offset="100%" stop-color="#f0f0ee"/>
        </radialGradient>
        <radialGradient id="es-g-hub" cx="42%" cy="34%" r="62%">
          <stop offset="0%" stop-color="#f2f4f5"/>
          <stop offset="62%" stop-color="#cfd4d8"/>
          <stop offset="100%" stop-color="#a3a9af"/>
        </radialGradient>
      </defs>
      ${fitInner(130, 150, 130, 130, INNER.meter(Math.abs(frac) * 22, 'V'))}
      ${photo('voltmeter2_c.png', 130, 130)}
      <g class="esb-dial">
        <rect x="${23 * K}" y="${27 * K}" width="${210 * K}" height="${142 * K}" rx="${2.5 * K}" fill="#101317"/>
        ${meterFaceSVG(24 * K, 26 * K, 207 * K, 143 * K, {
          clip: 'mV', outerR: 118, unit: 'V', outer: ['0', '5', '10', '15'], inner: ['1', '2', '3'],
          leftMarks: [
            { s: '\u2212', a: 213.3, r: 111.6, fs: 15 },
            { s: '5', a: 221, r: 128, fs: 15 },
            { s: '1', a: 218, r: 86, fs: 14 },
          ],
          plus: '+',
        })}
      </g>
      <line x1="${HUB.x}" y1="${HUB.y}" x2="${HUB.x}" y2="${HUB.y - LEN}" stroke="#d01f24" stroke-width="1.7" stroke-linecap="round"
        transform="rotate(${ang} ${HUB.x} ${HUB.y})"/>
      <circle cx="${HUB.x}" cy="${HUB.y}" r="${9 * K}" fill="url(#es-g-hub)" stroke="#878d93" stroke-width="${1.1 * K}"/>
      <circle cx="${HUB.x}" cy="${HUB.y}" r="${3.2 * K}" fill="#a9afb5"/>
    </svg>` }
  },

  /* ── 滑动变阻器（真实瓷筒图 + 真实绕线 + 有效电阻丝高亮 + 可拖滑片） ──
   * 柱心按 4 倍 1:1 渲染实测（rheostat_c2.png 448×186 → 190×79 是 2.36 倍，不能按 2 倍换算）：
   * 上左 (5,5) 贴边保留、上右 (184,6)、下左 (18,39)、下右 (174,39)。 */
  rheostat: {
    label: '滑动变阻器', w: 190, h: 79,
    terminals: [
      { id: 'tl', label: '1', name: '上左接线柱', x: 5, y: 5 },
      { id: 'tr', label: '2', name: '上右接线柱', x: 184, y: 6 },
      { id: 'bl', label: '3', name: '下左接线柱', x: 18, y: 39 },
      { id: 'br', label: '4', name: '下右接线柱', x: 174, y: 39 },
    ],
    render(c, dyn) {
      const f = c.f ?? 0.4
      const xw = RHEO_TRACK.x0 + f * (RHEO_TRACK.x1 - RHEO_TRACK.x0)
      const rmax = c.rmax ?? 10
      const mode = dyn?.mode || 'open'

      // ── 实测几何（rheostat_c2.png 224×93 → 190×79，sx 0.848 / sy 0.849）──
      // 底图取自拆解图里"没有滑片"的整机：金属杆 y5.9；绕线 x34..158、瓷筒顶棱 y12.7，
      // 亮条走 y14.2（压在绕线上沿，不外溢到瓷筒顶棱外的空白）
      const ROD_Y = 5.9
      const CO = { x0: 34, x1: 158, y: 14.2 }
      const BL = { x: 16, y: 38.5 }, BR = { x: 174, y: 38 }
      const TL = { x: 5, y: 5 }, TR = { x: 184, y: 5 }

      // 通电段：只有绕在瓷筒上的线圈着金黄，瓷筒本体/金属环/金属杆保持原色。
      // 用 rheostat_coilmask.png 当 mask —— 它按"暗且饱和"从底图里挑出绕线像素（band 外为 0），
      // 所以每匝线里的明暗和匝与匝之间的缝都还在，不像刷了一层色块。
      const live = !!dyn?.live
      const xwClamped = Math.max(CO.x0, Math.min(CO.x1, xw))
      const segX = mode === 'left-wire' ? [CO.x0, xwClamped]
        : mode === 'right-wire' ? [xwClamped, CO.x1]
          : mode === 'full-wire' ? [CO.x0, CO.x1]
            : null
      const WY = 12.6, WH = 42.0 // 绕线可见带：瓷筒顶棱 12.7 → 绕线下缘 54.5（再往下是瓷筒底和脚）
      const highlight = (live && segX)
        ? `<rect class="rheo-live" x="${segX[0].toFixed(1)}" y="${WY}" width="${Math.max(0, segX[1] - segX[0]).toFixed(1)}" height="${WH}"
             fill="url(#es-g-rheoGold)" mask="url(#es-m-rheoCoil)"/>`
        : ''

      // 金属杆红色高亮（短路）：压在照片里的金属杆上
      const rodHi = mode === 'short'
        ? `<line x1="${TL.x}" y1="${ROD_Y}" x2="${TR.x}" y2="${ROD_Y}" stroke="#ef4444" stroke-width="3.6" stroke-linecap="round" opacity="0.95"/>`
        : ''

      // 旁注
      const chip = (x, y, text, color, w = 78) => `
        <g transform="translate(${x},${y})">
          <rect x="${-w / 2}" y="-9" width="${w}" height="17" rx="5" fill="#0f172a" opacity="0.88"/>
          <text x="0" y="3.5" text-anchor="middle" font-size="10" font-weight="600" fill="${color}"
                font-family="ui-monospace,Consolas,monospace">${text}</text>
        </g>`
      const notes = mode === 'short' ? chip(95, 20, '短路', '#f87171')
        : mode === 'full-wire' ? chip(95, 45, '最大阻值，不可调', '#fbbf24', 104)
        : ''

      // 4 个接线柱：只做半透明标记，不盖住照片柱帽的立体感（上黑 / 下红）
      const dot = (p, dark) => {
        const cp = capPaint(dark)
        return `
        <circle cx="${p.x}" cy="${p.y}" r="4.6" fill="${cp.fill}" fill-opacity="0.5" stroke="${cp.stroke}" stroke-width="1" stroke-opacity="0.8"/>
        <circle cx="${p.x - 1.2}" cy="${p.y - 1.3}" r="1.3" fill="rgba(255,255,255,0.45)"/>`
      }

      // 等效电阻读数（按接入方式取有效段）
      const rEff = mode === 'right-wire' ? (1 - f) * rmax
        : mode === 'full-wire' ? rmax
        : mode === 'short' ? 0
        : f * rmax

      /* 滑片：一件式结构（黑绝缘柄横跨金属杆 → 两根钢触臂 → 白绝缘隔板挂着压住绕线），
         形状照拆解图左下角那块单独滑片零件：上端黑柄、两侧细触脚带触头、中间白色圆底隔板 */
      const slider = `
      <g class="slider-handle" data-role="slider" style="cursor:ew-resize">
        <!-- 滑片压板在绕线上的落影：让"压着绕线"这件事看得出来 -->
        <ellipse cx="${xw.toFixed(1)}" cy="19.6" rx="7.6" ry="8.2" fill="#0b1118" opacity="0.16"/>
        <path d="M${(xw - 6.4).toFixed(1)} 6.6 H${(xw + 6.4).toFixed(1)} V20.6
                 Q${(xw + 6.4).toFixed(1)} 27.6 ${xw.toFixed(1)} 27.6
                 Q${(xw - 6.4).toFixed(1)} 27.6 ${(xw - 6.4).toFixed(1)} 20.6 Z"
              fill="url(#es-g-rheoPlate)" stroke="#7d8894" stroke-width="0.55" stroke-opacity="0.85"
              filter="url(#es-f-rheoPlate)"/>
        <!-- 压板左侧的镜面高光：金属件不亮就是一张纸 -->
        <path d="M${(xw - 5.2).toFixed(1)} 8.2 V20.0 Q${(xw - 5.2).toFixed(1)} 24.4 ${(xw - 2.9).toFixed(1)} 25.4"
              fill="none" stroke="#ffffff" stroke-width="1.1" stroke-opacity="0.75"/>
        <!-- 两根钢触臂：从黑柄两侧贴着压板边缘下来，触头压在绕线上（不再悬空） -->
        <rect x="${(xw - 8.0).toFixed(1)}" y="5.4" width="1.9" height="10.4" rx="0.9"
              fill="url(#es-g-rheoArm)" stroke="#6f7a86" stroke-width="0.45"/>
        <rect x="${(xw + 6.1).toFixed(1)}" y="5.4" width="1.9" height="10.4" rx="0.9"
              fill="url(#es-g-rheoArm)" stroke="#6f7a86" stroke-width="0.45"/>
        <circle cx="${(xw - 7.05).toFixed(1)}" cy="15.4" r="1.35" fill="#2f363e"/>
        <circle cx="${(xw + 7.05).toFixed(1)}" cy="15.4" r="1.35" fill="#2f363e"/>
        <rect x="${(xw - 8.4).toFixed(1)}" y="${(ROD_Y - 5.3).toFixed(1)}" width="16.8" height="6.2" rx="2.6"
              fill="url(#es-g-rheoHandle)" stroke="#0b0d10" stroke-width="0.9"/>
        <rect x="${(xw - 4.8).toFixed(1)}" y="${(ROD_Y - 3.7).toFixed(1)}" width="9.6" height="1.3" rx="0.65"
              fill="#5a606a" opacity="0.55"/>
      </g>`

      return `
    <svg width="190" height="79" viewBox="0 0 190 79">
      <defs>
        <!-- 通电绕线的金黄色：竖向明暗照圆柱受光走，透明度靠下面的 mask 逐像素开合 -->
        <linearGradient id="es-g-rheoGold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#ffe08a" stop-opacity="0.88"/>
          <stop offset="0.26" stop-color="#ffc63a" stop-opacity="0.86"/>
          <stop offset="0.66" stop-color="#f0a010" stop-opacity="0.82"/>
          <stop offset="1" stop-color="#c07c08" stop-opacity="0.74"/>
        </linearGradient>
        <!-- 线圈蒙版：只有绕线的像素是白的（见 scripts/make-rheostat-asset.py） -->
        <mask id="es-m-rheoCoil" maskUnits="userSpaceOnUse" x="0" y="0" width="190" height="79">
          <image href="${figURL('rheostat_coilmask.png')}" x="0" y="0" width="190" height="79"
                 preserveAspectRatio="none"/>
        </mask>
        <linearGradient id="es-g-rheoPlate" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#a7b5c3"/><stop offset="0.48" stop-color="#e3ebf3"/><stop offset="1" stop-color="#fbfdff"/>
        </linearGradient>
        <linearGradient id="es-g-rheoHandle" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#4b515a"/><stop offset="0.55" stop-color="#2a2e34"/><stop offset="1" stop-color="#121417"/>
        </linearGradient>
        <linearGradient id="es-g-rheoArm" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#9aa5b1"/><stop offset="0.5" stop-color="#e4eaf0"/><stop offset="1" stop-color="#8d98a4"/>
        </linearGradient>
        <filter id="es-f-rheoPlate" x="-30%" y="-15%" width="160%" height="140%">
          <feDropShadow dx="1.2" dy="1.4" stdDeviation="1.4" flood-color="#0b1220" flood-opacity="0.30"/>
        </filter>
      </defs>
      ${fitInner(190, 110, 190, 79, INNER.rheostat())}
      ${photo('rheostat_c2.png', 190, 79)}
      <g class="casing">
        <!-- 有效段高亮（随滑片实时变化，压在照片的绕线上） -->
        ${highlight}
        ${rodHi}
        ${notes}
        <!-- 柱帽：位置与颜色照照片（上左黑 / 上右红 / 下左黑 / 下右红） -->
        ${dot(TL, true)}${dot(TR, false)}${dot(BL, true)}${dot(BR, false)}
      </g>
      ${slider}
      <g transform="translate(95,67)">
        <rect x="-36" y="-8" width="72" height="16" rx="5" fill="#0f172a" opacity="0.88"/>
        <text x="0" y="4" text-anchor="middle" font-size="10" font-weight="600" fill="#4ade80"
              font-family="ui-monospace,Consolas,monospace">R = ${rEff.toFixed(1)} Ω</text>
      </g>
    </svg>` }
  },

  /* ── 定值电阻（彩色环电阻）5Ω / 10Ω / 15Ω ── */
  resistor5: resistorType(5, ['#0f7a3d', '#1b1b1b', '#c9a227', '#c9a227']),
  resistor10: resistorType(10, ['#7a4a12', '#1b1b1b', '#1b1b1b', '#c9a227']),
  resistor15: resistorType(15, ['#7a4a12', '#0f7a3d', '#1b1b1b', '#c9a227']),

  /* ── 单刀双掷开关（胶木底座 + 钢闸刀摆向掷点 A/B） ── */
  switch2: {
    label: '单刀双掷开关', w: 180, h: 130,
    terminals: [
      { id: 'com', label: 'C', name: '公共端（刀闸转轴）', x: 90, y: 102 },
      { id: 'a', label: 'A', name: '掷点 A', x: 34, y: 46 },
      { id: 'b', label: 'B', name: '掷点 B', x: 146, y: 46 },
    ],
    render(c) {
      const pos = (c.pos ?? 0) === 1 ? 1 : 0
      return `
    <svg width="180" height="130" viewBox="0 0 180 130">
      ${fitInner(180, 130, 180, 130, INNER.switch2())}
      <g class="casing">
        <!-- 两根绝缘支柱 -->
        <rect x="26" y="54" width="16" height="50" rx="4" fill="#3a3f46" stroke="#14171b" stroke-width="1"/>
        <rect x="138" y="54" width="16" height="50" rx="4" fill="#3a3f46" stroke="#14171b" stroke-width="1"/>
        <!-- 黄铜静触点夹片 -->
        <rect x="27" y="48" width="14" height="6" rx="1.5" fill="#c9a227" stroke="#8a6a3c" stroke-width="0.8"/>
        <rect x="27" y="58" width="14" height="6" rx="1.5" fill="#c9a227" stroke="#8a6a3c" stroke-width="0.8"/>
        <rect x="139" y="48" width="14" height="6" rx="1.5" fill="#c9a227" stroke="#8a6a3c" stroke-width="0.8"/>
        <rect x="139" y="58" width="14" height="6" rx="1.5" fill="#c9a227" stroke="#8a6a3c" stroke-width="0.8"/>
        <!-- 胶木底座 -->
        <rect x="22" y="96" width="136" height="26" rx="7" fill="#2b2e33" stroke="#14171b" stroke-width="1"/>
        <rect x="22" y="96" width="136" height="8" rx="4" fill="#3a3f46" opacity=".8"/>
        <!-- 转轴铰链 -->
        <circle cx="90" cy="102" r="11" fill="url(#es-g-steel)" stroke="#6b7684" stroke-width="1"/>
        <circle cx="90" cy="102" r="5" fill="#c3ccd6" stroke="#4d5560" stroke-width="1"/>
      </g>
      ${spdtBladeSVG(pos)}
      ${termDotSVG(34, 46, true, 'A')}
      ${termDotSVG(146, 46, false, 'B')}
      ${termDotSVG(90, 102, true, 'C')}
      ${noteChipSVG(90, 76, pos === 0 ? '闸刀接通 A' : '闸刀接通 B', '#4ade80', 88)}
    </svg>` }
  },

  /* ── 小电动机模型（真实图 + 皮带轮叶轮随电流转动） ── */
  motor: {
    label: '小电动机', w: 200, h: 169,
    terminals: [
      { id: 'a', label: '1', name: '接线柱 1', x: 116, y: 153 },
      { id: 'b', label: '2', name: '接线柱 2', x: 182, y: 149 },
    ],
    render(c, dyn = {}) {
      const I = dyn.I || 0
      const on = Math.abs(I) > 0.005
      return `
    <svg width="200" height="169" viewBox="0 0 200 169">
      ${fitInner(200, 169, 200, 169, INNER.motor())}
      ${photo('motor_c.png', 200, 169)}
      ${motorFanSVG(59, 60, on, I)}
      ${on ? noteChipSVG(118, 14, `I = ${Math.abs(I).toFixed(2)} A`, '#4ade80', 96) : noteChipSVG(59, 140, '未通电', '#94a3b8', 58)}
    </svg>` }
  },

  /* ── 发光二极管（长脚正 · 短脚负 · 反向不亮） ── */
  diode: {
    label: '二极管（LED）', w: 170, h: 120,
    terminals: [
      { id: 'a', label: '+', name: '阳极（长脚）', x: 48, y: 87 },
      { id: 'k', label: '−', name: '阴极（短脚）', x: 122, y: 87 },
    ],
    render(c, dyn = {}) {
      const on = !!dyn.on
      const rev = !!dyn.rev
      return `
    <svg width="170" height="120" viewBox="0 0 170 120">
      ${fitInner(170, 120, 170, 120, INNER.diode())}
      <g class="casing">
        <!-- 胶木底板 -->
        <rect x="26" y="76" width="118" height="22" rx="6" fill="#2b2e33" stroke="#14171b" stroke-width="1"/>
        <!-- 引脚：左长脚（阳极）/ 右短脚（阴极） -->
        <path d="M78 56 L78 68 L48 80" fill="none" stroke="#d98a3d" stroke-width="3.4" stroke-linecap="round"/>
        <path d="M92 56 L92 62 L122 80" fill="none" stroke="#d98a3d" stroke-width="3.4" stroke-linecap="round"/>
        ${ledDomeSVG(85, 42, on)}
      </g>
      ${termDotSVG(48, 87, false, '+')}
      ${termDotSVG(122, 87, true, '−')}
      ${noteChipSVG(85, 112, on ? '正向导通 · 发光' : rev ? '反向截止 · 不亮' : '未导通',
        on ? '#4ade80' : rev ? '#fbbf24' : '#94a3b8', 120)}
    </svg>` }
  },

  /* ── 保险丝（真实图 + 熔丝叠层：过流时中间熔断） ── */
  fuse: {
    label: '保险丝', w: 200, h: 80,
    terminals: [
      { id: 'a', label: '1', name: '左接线柱', x: 47, y: 35 },
      { id: 'b', label: '2', name: '右接线柱', x: 155, y: 35 },
    ],
    render(c, dyn = {}) {
      const blown = !!dyn.blown
      const I = dyn.I || 0
      const filament = blown
        ? `<path d="M52 35 H84 q3 -5 6 -9" fill="none" stroke="#6b5a48" stroke-width="2.2" stroke-linecap="round"/>
           <path d="M110 35 H150 q-3 5 -6 9" fill="none" stroke="#6b5a48" stroke-width="2.2" stroke-linecap="round"/>
           <circle cx="88" cy="27" r="3.4" fill="#4a3a2a" opacity=".8"/>
           <circle cx="106" cy="43" r="3.4" fill="#4a3a2a" opacity=".8"/>`
        : `<path d="M52 35 H150" fill="none" stroke="#5a4a3a" stroke-width="2.2" stroke-linecap="round"/>`
      return `
    <svg width="200" height="80" viewBox="0 0 200 80">
      ${fitInner(200, 80, 200, 80, INNER.fuse())}
      ${photo('fuse_c.png', 200, 80)}
      <g class="casing">${filament}</g>
      ${noteChipSVG(100, 12, blown ? '已熔断 · 双击换新' : `I = ${Math.abs(I).toFixed(2)} A`,
        blown ? '#fb7185' : '#4ade80', blown ? 116 : 92)}
    </svg>` }
  },

  /* ── 测电笔（透明笔身：氖管 + 高值电阻 + 弹簧，接触火线氖管发光） ── */
  testPencil: {
    label: '测电笔', w: 230, h: 86,
    terminals: [
      { id: 'tip', label: '尖', name: '笔尖（接触被测导体）', x: 16, y: 43 },
      { id: 'tail', label: '尾', name: '笔尾金属体（手触端）', x: 214, y: 43 },
    ],
    render(c, dyn = {}) {
      const glow = !!dyn.glow
      return `
    <svg width="230" height="86" viewBox="0 0 230 86">
      ${fitInner(230, 86, 230, 86, INNER.testPencil())}
      <g class="casing">
        <!-- 金属笔尖 -->
        <path d="M6 43 L26 35 L26 51 Z" fill="url(#es-g-steel)" stroke="#6b7684" stroke-width="1"/>
        <rect x="24" y="36" width="10" height="14" rx="2" fill="url(#es-g-steel)" stroke="#6b7684" stroke-width="1"/>
        <!-- 透明笔身（有机玻璃） -->
        <rect x="32" y="28" width="156" height="30" rx="15" fill="rgba(226,238,250,0.5)" stroke="#a9bccc" stroke-width="1.4"/>
        <path d="M46 33 H172" stroke="#fff" stroke-width="2.6" opacity=".55" stroke-linecap="round"/>
        <!-- 笔尾金属体 + 挂钩 -->
        <rect x="182" y="30" width="34" height="26" rx="9" fill="url(#es-g-steel)" stroke="#6b7684" stroke-width="1.2"/>
        <rect x="196" y="24" width="8" height="8" rx="2" fill="#8d96a1" stroke="#5b6570"/>
      </g>
      <!-- 内部构件（透过笔身可见，剖视时保留） -->
      <rect x="40" y="36" width="32" height="15" rx="7.5"
            fill="${glow ? '#ff9a4d' : '#e8763a'}" stroke="#c25a12" stroke-width="1.2"
            style="${glow ? 'filter:brightness(1.35) saturate(1.4)' : ''}"/>
      ${glow ? `<circle cx="56" cy="43" r="20" fill="url(#es-g-glow)" opacity="0.9"/>` : ''}
      <path d="M78 43 q4 -7 8 0 q4 7 8 0 q4 -7 8 0 q4 7 8 0" fill="none" stroke="#8a6a3c" stroke-width="1.8"/>
      <rect x="108" y="34" width="36" height="18" rx="5" fill="#e8dcc0" stroke="#b7a888" stroke-width="1"/>
      <path d="M114 38 h24 M114 43 h24 M114 48 h24" stroke="#8a6a3c" stroke-width="1.2"/>
      <path d="M146 43 H184" stroke="#9aa3ad" stroke-width="3"/>
      ${termDotSVG(16, 43, true, '尖')}
      ${termDotSVG(214, 43, false, '尾')}
      ${noteChipSVG(115, 74, glow ? '氖管发光（接触火线）' : '氖管不亮', glow ? '#fb923c' : '#94a3b8', 148)}
    </svg>` }
  },

  /* ── 验电器（带电时两片金属箔张开） ── */
  electroscope: {
    label: '验电器', w: 130, h: 210,
    terminals: [
      { id: 'cap', label: '球', name: '金属球（接被测带电体）', x: 30, y: 24 },
      { id: 'gnd', label: '地', name: '底座接地柱', x: 108, y: 186 },
    ],
    render(c, dyn = {}) {
      // 箔片张角：0~1 对应 0°~32°（模拟带电量）
      const ang = Math.max(0, Math.min(1, dyn.angle || 0)) * 32
      return `
    <svg width="130" height="210" viewBox="0 0 130 210">
      ${fitInner(130, 210, 130, 210, INNER.electroscope())}
      <g class="casing">
        <!-- 接线柱引出杆 + 金属球 -->
        <path d="M36 24 H57" stroke="#c9a227" stroke-width="4" stroke-linecap="round"/>
        <circle cx="68" cy="24" r="12" fill="url(#es-g-gold)" stroke="#8a6a3c" stroke-width="1.2"/>
        <circle cx="64" cy="20" r="3.4" fill="#f6d98a" opacity=".8"/>
        <!-- 金属杆 -->
        <rect x="65.5" y="36" width="5" height="78" rx="2" fill="#c9a227" stroke="#8a6a3c" stroke-width="0.8"/>
        <!-- 玻璃外壳 + 顶盖 -->
        <rect x="34" y="104" width="68" height="76" rx="10" fill="rgba(214,232,246,0.42)" stroke="#a9bccc" stroke-width="1.6"/>
        <rect x="30" y="96" width="76" height="12" rx="5" fill="#3a3f46" stroke="#14171b" stroke-width="1"/>
        <!-- 箔片（带电张开） -->
        <g transform="rotate(${(-ang).toFixed(1)} 66 114)">
          <rect x="63.4" y="114" width="4.4" height="46" rx="2" fill="url(#es-g-gold)" stroke="#8a6a3c" stroke-width="0.7"/>
        </g>
        <g transform="rotate(${ang.toFixed(1)} 70 114)">
          <rect x="68" y="114" width="4.4" height="46" rx="2" fill="url(#es-g-gold)" stroke="#8a6a3c" stroke-width="0.7"/>
        </g>
        <!-- 底座 + 接地柱 -->
        <rect x="42" y="178" width="52" height="14" rx="4" fill="#2b2e33" stroke="#14171b" stroke-width="1"/>
        <path d="M94 186 H102" stroke="#8d96a1" stroke-width="4"/>
      </g>
      ${termDotSVG(30, 24, true, '球')}
      ${termDotSVG(108, 186, true, '地')}
      ${noteChipSVG(65, 202, ang > 2 ? '箔片张开 · 带电' : '箔片闭合',
        ang > 2 ? '#4ade80' : '#94a3b8', 118)}
    </svg>` }
  },

  /* ── 家庭电源 220V（火线 L / 零线 N，家庭电路用电源支持件） ── */
  mains: {
    label: '家庭电源 220V', w: 170, h: 130,
    terminals: [
      { id: 'n', label: 'N', name: '零线（N，蓝）', x: 52, y: 108 },
      { id: 'l', label: 'L', name: '火线（L，红）', x: 118, y: 108 },
    ],
    render() {
      return `
    <svg width="170" height="130" viewBox="0 0 170 130">
      ${fitInner(170, 130, 170, 130, INNER.mains())}
      <g class="casing">
        <!-- 面板箱体 -->
        <rect x="22" y="18" width="126" height="82" rx="10" fill="#f2ede3" stroke="#c9c0ab" stroke-width="1.4"/>
        <rect x="22" y="18" width="126" height="16" rx="8" fill="#e2d9c6" stroke="#c9c0ab" stroke-width="1"/>
        <text x="85" y="44" text-anchor="middle" font-size="12.5" font-weight="700" fill="#4a4238">家庭电源 220V</text>
        <text x="85" y="58" text-anchor="middle" font-size="9" fill="#8a7f6c">交流 50Hz · 有效值（按直流等效）</text>
        <!-- 正弦标记 -->
        <path d="M66 74 q5 -9 10 0 q5 9 10 0 q5 -9 10 0 q5 9 10 0" fill="none" stroke="#c25a12" stroke-width="1.8"/>
        <!-- 引线柱脚 -->
        <path d="M52 100 V106 M118 100 V106" stroke="#8d96a1" stroke-width="5"/>
      </g>
      ${termDotSVG(52, 108, true, 'N')}
      ${termDotSVG(118, 108, false, 'L')}
      ${noteChipSVG(85, 122, 'L 火线 · N 零线', '#fbbf24', 112)}
    </svg>` }
  },

  /* ── 单相电能表（仓库无实拍图，按实物 1:1 绘：铝转盘窗 + 6 位计数器 + 1/2/3/4 四柱） ── */
  energyMeter: {
    label: '电能表', w: 190, h: 150,
    terminals: [
      { id: 'i1', label: '1', name: '进线 1（相线）', x: 40, y: 132 },
      { id: 'i2', label: '2', name: '进线 2（零线）', x: 76, y: 132 },
      { id: 'o1', label: '3', name: '出线 3（相线）', x: 114, y: 132 },
      { id: 'o2', label: '4', name: '出线 4（零线）', x: 150, y: 132 },
    ],
    render(c, dyn = {}) {
      const kwh = Math.max(0, Number(dyn.kwh ?? c.kwh0 ?? 0))
      const I = Math.abs(Number(dyn.I) || 0)
      // 5 位整数 + 1 位小数（红色），与机械表同款
      const digits = String(Math.floor(kwh * 10) % 1000000).padStart(6, '0')
      // 铝盘转速 ∝ 干路电流；无电流时静止（真实表断电不转）
      const dur = I > 0.005 ? Math.max(0.3, 0.6 / Math.max(I, 0.02)) : 0
      const spin = dur
        ? `<animateTransform attributeName="transform" type="rotate" from="0 62 66" to="360 62 66" dur="${dur.toFixed(2)}s" repeatCount="indefinite"/>`
        : ''
      const cells = digits.split('').map((d, i) => {
        const x = 106 + i * 12
        const red = i === digits.length - 1
        return `<rect x="${x}" y="46" width="10.5" height="16" rx="1.5" fill="${red ? '#7f1d1d' : '#0f172a'}"/>`
          + `<text x="${x + 5.25}" y="58.5" text-anchor="middle" font-size="12" font-family="ui-monospace,Consolas,monospace" fill="${red ? '#fecaca' : '#e5eef7'}">${d}</text>`
      }).join('')
      return `
    <svg width="190" height="150" viewBox="0 0 190 150">
      <defs>
        <linearGradient id="es-em-case" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#f4f7fb"/><stop offset="100%" stop-color="#d5dde8"/>
        </linearGradient>
      </defs>
      ${fitInner(190, 150, 190, 150, INNER.energyMeter())}
      <g class="casing">
        <rect x="3" y="4" width="184" height="132" rx="9" fill="url(#es-em-case)" stroke="#b9c3d1" stroke-width="1.6"/>
        <rect x="3" y="4" width="184" height="132" rx="9" fill="none" stroke="#ffffff" stroke-width="1" opacity=".75"/>
        <rect x="11" y="10" width="168" height="17" rx="4" fill="#334155"/>
        <text x="95" y="22.5" text-anchor="middle" font-size="9.5" fill="#dbeafe"
          font-family="system-ui,-apple-system,'Segoe UI',sans-serif">单相电能表 · 220V 10(40)A</text>
        <circle cx="62" cy="66" r="29" fill="#0b1220" stroke="#8b98a9" stroke-width="2"/>
        <g>
          ${spin}
          <circle cx="62" cy="66" r="26" fill="#e8edf4"/>
          <path d="M62 40 A26 26 0 0 1 88 66 L62 66 Z" fill="#9fb0c4" opacity=".8"/>
          <rect x="58" y="41" width="8" height="13" rx="2" fill="#1f2937"/>
          <circle cx="62" cy="66" r="2.6" fill="#64748b"/>
        </g>
        <rect x="100" y="42" width="78" height="24" rx="3" fill="#0b1220" stroke="#8b98a9" stroke-width="1.4"/>
        <text x="139" y="74" text-anchor="middle" font-size="8" fill="#64748b">kW·h</text>
        <text x="62" y="104" text-anchor="middle" font-size="8.5" fill="#475569"
          font-family="system-ui,-apple-system,'Segoe UI',sans-serif">${I > 0.005 ? `I = ${I.toFixed(2)} A · 600r/kWh` : '无电流 · 转盘静止'}</text>
        <rect x="14" y="116" width="162" height="18" rx="4" fill="#c3ccd8" opacity=".55"/>
      </g>
      ${cells}
      ${termDotsSVG([
        { x: 40, y: 132, label: '1', dark: true },
        { x: 76, y: 132, label: '2', dark: true },
        { x: 114, y: 132, label: '3', dark: false },
        { x: 150, y: 132, label: '4', dark: false },
      ])}
    </svg>` }
  },
  jouleTube: {
    label: '焦耳定律演示器', w: 190, h: 190,
    terminals: [
      { id: 'a', label: 'a', name: '接线柱 a', x: 30, y: 166 },
      { id: 'b', label: 'b', name: '接线柱 b', x: 160, y: 166 },
    ],
    render(c, dyn = {}) {
      const h1 = Math.max(0, Math.min(1, Number(dyn.h1) || 0))
      const h2 = Math.max(0, Math.min(1, Number(dyn.h2) || 0))
      const q1 = Math.max(0, Number(dyn.q1) || 0)
      const q2 = Math.max(0, Number(dyn.q2) || 0)
      const I = Math.abs(Number(dyn.I) || 0)
      // 初始液面 y=118，满刻度再升 62（液柱高度 62 → 0）
      const Y0 = 118
      const SPAN = 62
      const yL = Y0 - h1 * SPAN
      const yR = Y0 - h2 * SPAN
      // 电阻丝：左 2 段、右 4 段，密绕成横向扁环（像线圈，不像一排数字）
      const coil = (cx, ys) => ys.map((y) =>
        `<ellipse cx="${cx}" cy="${y}" rx="5.4" ry="1.25" fill="none" stroke="#7f1d1d" stroke-width="1.1"/>`).join('')
      const ticks = [0, 1, 2, 3, 4, 5].map((i) => {
        const y = Y0 - i * 12.4
        return `<line x1="144" y1="${y}" x2="149" y2="${y}" stroke="#94a3b8" stroke-width="1"/>`
          + (i ? `<text x="151" y="${y + 2.4}" font-size="6.5" fill="#64748b">${i * 10}</text>` : '')
      }).join('')
      return `
    <svg width="190" height="190" viewBox="0 0 190 190">
      ${fitInner(190, 190, 190, 190, INNER.jouleTube())}
      <g class="casing">
        <rect x="16" y="156" width="158" height="20" rx="5" fill="#cbd5e1" stroke="#94a3b8" stroke-width="1.2"/>
        <!-- 玻璃管：左右竖管 + 底部连通的横管 -->
        <rect x="52" y="46" width="16" height="96" rx="3" fill="#eaf4ff" stroke="#a8b5c4" stroke-width="1.4"/>
        <rect x="122" y="46" width="16" height="96" rx="3" fill="#eaf4ff" stroke="#a8b5c4" stroke-width="1.4"/>
        <rect x="52" y="132" width="86" height="14" rx="3" fill="#eaf4ff" stroke="#a8b5c4" stroke-width="1.4"/>
        <ellipse cx="60" cy="46" rx="8" ry="3" fill="none" stroke="#a8b5c4" stroke-width="1.2"/>
        <ellipse cx="130" cy="46" rx="8" ry="3" fill="none" stroke="#a8b5c4" stroke-width="1.2"/>
        <!-- 有色液体：底部连通段常满，两竖管液面各自独立 -->
        <rect x="54" y="134" width="82" height="10" fill="#ef5350" opacity=".88"/>
        <rect x="54" y="${yL}" width="12" height="${134 - yL}" fill="#ef5350" opacity=".88"/>
        <rect x="124" y="${yR}" width="12" height="${134 - yR}" fill="#ef5350" opacity=".88"/>
        <ellipse cx="60" cy="${yL}" rx="6" ry="1.6" fill="#fca5a5"/>
        <ellipse cx="130" cy="${yR}" rx="6" ry="1.6" fill="#fca5a5"/>
        <!-- 电阻丝：浸在液体里，圈数即阻值 -->
        ${coil(60, [131, 127])}
        ${coil(130, [131, 128, 125, 122])}
        <!-- 刻度（mm） -->
        <line x1="144" y1="46" x2="144" y2="132" stroke="#e2e8f0" stroke-width="1"/>
        ${ticks}
        <rect x="26" y="24" width="138" height="16" rx="4" fill="#334155"/>
        <text x="95" y="35.5" text-anchor="middle" font-size="9" fill="#dbeafe"
          font-family="system-ui,-apple-system,'Segoe UI',sans-serif">焦耳定律演示器 · R1 2Ω / R2 4Ω</text>
        <text x="95" y="187" text-anchor="middle" font-size="8.5" fill="#475569"
          font-family="ui-monospace,Consolas,monospace">Q1 ${q1.toFixed(1)} J · Q2 ${q2.toFixed(1)} J${I > 0.005 ? '' : ' · 断电'}</text>
      </g>
      ${termDotsSVG([
        { x: 30, y: 166, label: 'a', dark: true },
        { x: 160, y: 166, label: 'b', dark: false },
      ])}
    </svg>` }
  },

  /* ── 电阻箱（真实图 + 拨盘叠层：点击拨盘进位，读数实时） ── */
  resBox: {
    label: '电阻箱', w: 150, h: 204, meter: 'R',
    terminals: [
      { id: 'a', label: '1', name: '左接线柱', x: 31, y: 167 },
      { id: 'b', label: '2', name: '右接线柱', x: 120, y: 167 },
    ],
    render(c) {
      const dials = Array.isArray(c.dials) ? c.dials : [0, 0, 0, 0]
      // 拨盘指针：0 在 225°（左下），每档 +30°（与照片盘面刻度一致）
      const dialKnob = (cx, cy, v, i) => {
        const th = ((225 + 30 * v) * Math.PI) / 180
        const px = cx + 11.5 * Math.sin(th)
        const py = cy - 11.5 * Math.cos(th)
        return `
        <g data-role="dial" data-i="${i}" style="cursor:pointer">
          <circle cx="${cx}" cy="${cy}" r="16" fill="#20242a" stroke="#12151a" stroke-width="1.2"/>
          <circle cx="${cx}" cy="${cy}" r="10.5" fill="#2b3038" stroke="#3c434c" stroke-width="0.8"/>
          <line x1="${cx}" y1="${cy}" x2="${px.toFixed(1)}" y2="${py.toFixed(1)}" stroke="#fbbf24" stroke-width="2.4" stroke-linecap="round"/>
          <circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="2.6" fill="#fde68a"/>
          <circle cx="${cx}" cy="${cy}" r="2.2" fill="#8d96a1"/>
        </g>`
      }
      return `
    <svg width="150" height="204" viewBox="0 0 150 204">
      ${fitInner(150, 204, 150, 204, INNER.resBox())}
      ${photo('resbox_c.png', 150, 204)}
      <g class="casing">
        ${dialKnob(42, 60, dials[0] | 0, 0)}
        ${dialKnob(109, 60, dials[1] | 0, 1)}
        ${dialKnob(42, 123, dials[2] | 0, 2)}
        ${dialKnob(109, 123, dials[3] | 0, 3)}
      </g>
      ${termDotSVG(31, 167, true, '1')}
      ${termDotSVG(120, 167, false, '2')}
    </svg>` }
  },

  /* ── 多用电表（真实图 + 档位旋钮 + LCD 读数，双击切档） ── */
  multimeter: {
    label: '多用电表', w: 150, h: 207,
    terminals: [
      { id: 'com', label: '−', name: '公共端（黑表笔）', x: 31, y: 186 },
      { id: 'in', label: '+', name: '输入端（红表笔，V·Ω·A 共用）', x: 121, y: 186 },
    ],
    render(c, dyn = {}) {
      const mode = c.mode === 'A' || c.mode === 'Ω' ? c.mode : 'V'
      // 档位指针角（顺时针，0=正上）：Ω 指左上、V 指右上、A 指右下
      const ang = mode === 'Ω' ? -54 : mode === 'A' ? 135 : 53
      const th = (ang * Math.PI) / 180
      const kx = 75, ky = 108, kr = 40
      const px = kx + kr * Math.sin(th)
      const py = ky - kr * Math.cos(th)
      // LCD 读数
      const value = dyn.value
      const text = mode === 'A'
        ? `A ${value == null ? '0.000' : Number(value).toFixed(3)}`
        : mode === 'Ω'
          ? `Ω ${value == null ? '---' : (value === Infinity ? '∞' : Number(value).toFixed(1))}`
          : `V ${value == null ? '0.000' : Number(value).toFixed(3)}`
      return `
    <svg width="150" height="207" viewBox="0 0 150 207">
      ${fitInner(150, 207, 150, 207, INNER.multimeter())}
      ${photo('multimeter_c.png', 150, 207)}
      <!-- 档位旋钮指针 -->
      <g class="casing">
        <line x1="${kx}" y1="${ky}" x2="${px.toFixed(1)}" y2="${py.toFixed(1)}" stroke="#20242a" stroke-width="5" stroke-linecap="round"/>
        <circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="4.6" fill="#20242a"/>
        <circle cx="${kx}" cy="${ky}" r="6" fill="#e8edf3" stroke="#9aa3ad" stroke-width="1.2"/>
      </g>
      <!-- LCD 读数（盖住照片屏） -->
      <rect x="21" y="23" width="122" height="15" rx="3" fill="#1a2228" stroke="#0c1014" stroke-width="1"/>
      <text x="82" y="34.5" text-anchor="middle" font-size="11" font-weight="700" fill="#4ade80"
            font-family="ui-monospace,Consolas,monospace">${text}</text>
      ${termDotSVG(31, 186, true, '−')}
      ${termDotSVG(121, 186, false, '+')}
      ${noteChipSVG(75, 11, `档位 ${mode === 'Ω' ? '欧姆' : mode === 'A' ? '电流' : '电压'} · 双击切换`, '#60a5fa', 142)}
    </svg>` }
  },

  /* ── 电磁继电器（线圈通电 → 衔铁吸合 → 触点闭合） ── */
  relay: {
    label: '电磁继电器', w: 210, h: 175,
    terminals: [
      { id: 'ct1', label: '触1', name: '触点接线柱 1', x: 130, y: 152 },
      { id: 'ct2', label: '触2', name: '触点接线柱 2', x: 172, y: 152 },
      { id: 'ck1', label: '圈1', name: '线圈接线柱 1', x: 48, y: 152 },
      { id: 'ck2', label: '圈2', name: '线圈接线柱 2', x: 84, y: 152 },
    ],
    render(c, dyn = {}) {
      const pulled = !!dyn.pulled
      // SVG 旋转角：正=顺时针（右端下压触磁铁），负=右端上抬（弹簧释放）
      const ang = pulled ? 4 : -8
      return `
    <svg width="210" height="175" viewBox="0 0 210 175">
      ${fitInner(210, 175, 210, 175, INNER.relay())}
      <g class="casing">
        <!-- 电磁铁：铁芯 + 铜线圈 -->
        <rect x="142" y="110" width="22" height="32" rx="2" fill="#5b6570" stroke="#3a434c" stroke-width="1"/>
        ${Array.from({ length: 7 }, (_, i) => `
          <ellipse cx="153" cy="${114 + i * 4.2}" rx="16" ry="3.2" fill="none" stroke="#c87533" stroke-width="2.1"/>`).join('')}
        <!-- 弹簧（拉住衔铁，释放态） -->
        <path d="M108 54 v6 ${Array.from({ length: 6 }, (_, i) => `l${i % 2 ? 6 : -6} 5`).join(' ')} v6"
              fill="none" stroke="#8d96a1" stroke-width="2.2" stroke-linejoin="round"/>
        <rect x="100" y="48" width="17" height="6" rx="3" fill="#6b7684" stroke="#4d5560"/>
        <!-- 触点（固定） -->
        <rect x="124" y="110" width="9" height="28" rx="3" fill="#3a3f46" stroke="#14171b"/>
        <circle cx="128.5" cy="110" r="5" fill="#c9a227" stroke="#8a6a3c"/>
        <!-- 衔铁（绕左端转轴） -->
        <g transform="rotate(${ang} 34 96)">
          <rect x="28" y="89" width="148" height="13" rx="4" fill="url(#es-g-steel)" stroke="#6b7684" stroke-width="1"/>
          <circle cx="128.5" cy="104" r="5" fill="#c9a227" stroke="#8a6a3c"/>
          <!-- 动触点引线（经转轴到触2） -->
          <path d="M34 96 H60" stroke="#8d96a1" stroke-width="2.4"/>
        </g>
        <!-- 转轴 -->
        <circle cx="34" cy="96" r="8" fill="url(#es-g-steel)" stroke="#4d5560" stroke-width="1"/>
        <circle cx="34" cy="96" r="3.6" fill="#c3ccd6" stroke="#4d5560"/>
        <!-- 线圈引线 → 线圈柱 -->
        <path d="M48 148 C60 142, 120 146, 146 140" fill="none" stroke="#c87533" stroke-width="2.2"/>
        <path d="M84 148 C100 144, 140 146, 158 140" fill="none" stroke="#c87533" stroke-width="2.2"/>
        <!-- 触点引线 → 触点柱 -->
        <path d="M128 138 V148 H130" fill="none" stroke="#8d96a1" stroke-width="2.4"/>
        <path d="M60 96 C90 118, 150 150, 172 148" fill="none" stroke="#8d96a1" stroke-width="2.4"/>
        <!-- 底座 -->
        <rect x="18" y="138" width="174" height="26" rx="7" fill="#2b2e33" stroke="#14171b" stroke-width="1"/>
        <rect x="18" y="138" width="174" height="8" rx="4" fill="#3a3f46" opacity=".8"/>
      </g>
      ${termDotSVG(48, 152, true, '圈1')}
      ${termDotSVG(84, 152, true, '圈2')}
      ${termDotSVG(130, 152, true, '触1')}
      ${termDotSVG(172, 152, false, '触2')}
      ${noteChipSVG(118, 32, pulled ? '衔铁吸合 · 触点闭合' : '衔铁释放 · 触点断开',
        pulled ? '#4ade80' : '#94a3b8', 152)}
    </svg>` }
  },
}
