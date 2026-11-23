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
/* NB 原厂电动机贴图（audit/nb_gen/motor_export.py 从 D:\NB物理实验 的加密图集里裁出来的） */
export const MOTOR_FIG = '/physics-lab/assets/equipment/motor'
export const motorURL = (file) => `${MOTOR_FIG}/${file}?v=20261123a`
/* 实拍图版本号：同名图片被覆盖后浏览器会继续用旧缓存（元件库缩略图尤其明显），
   所有 fig 图片 URL 统一带这串版本参数，改图时把它 +1 即可强制刷新。 */
export const FIG_V = '20261120f'
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

/* ── 家用电器（用户给的产品图标直接当器材面） ──
 * 图标本身带插头与电线，用之前已裁掉（washer_body.png / kettle_body.png 只留机体），
 * 机体按 meet 放进器材框；额定功率写在图标下沿的小铭牌上，通电后改成实测电流。
 * 两台器材的物理口径一致：R = U²/P（洗衣机 500 W → 96.8 Ω，电热水壶 1500 W → 32.3 Ω），
 * 接上 220 V 后 I 分别是 2.27 A / 6.82 A —— 电能表走字快慢差 3 倍。 */
const APPLIANCE = {
  washer: { file: 'washer_body.png', label: '洗衣机', P: 500 },
  kettle: { file: 'kettle_body.png', label: '电热水壶', P: 1500 },
  riceCooker: { file: 'ricecooker_body.png', label: '电饭煲', P: 800 },
  heater: { file: 'heater_body.png', label: '电暖器', P: 1500 },
}

function applianceSVG(kind, c) {
  const art = APPLIANCE[kind]
  /* 用户口径：**家电卡片上的文字一律不要**（标题带、额定参数、"运行中"、并联/串联说明全删），
     只要那台机器本身 —— 照 NB 实拍，机身上是没有任何字的，状态靠蒸汽、指示灯和插头自己看。
     所以这里只剩一张整机图；接线柱热点也不画（插头就是接头）。 */
  return `
    <svg width="150" height="168" viewBox="0 0 150 168">
      ${fitInner(150, 168, 150, 168, INNER.homeLoad())}
      <g class="casing">
        <image href="${figURL(art.file)}" x="22" y="26" width="106" height="92"
          preserveAspectRatio="xMidYMid meet"/>
      </g>
    </svg>`
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
    /* 透视标注改在 BuilderSVG 的 MotionLayer 里画（那里能同时把通电的电流带叠上去），
       这里留空，避免「内部结构」和「电机结构」两个开关同时打开时标注叠两遍。 */
    return ''
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
      <path d="M65 114 L58 158 M71 114 L78 158" stroke="#c9a227" stroke-width="3.4" stroke-linecap="round"/>
      <text class="plabel" x="68" y="14">金属球（带电体接触）</text>
      <text class="plabel" x="88" y="80">金属杆</text>
      <text class="plabel" x="68" y="172">金属箔片（同种电荷相斥）</text>
      <text class="plabel" x="30" y="98">玻璃外壳</text>
      <text class="plabel" x="112" y="196">底座（可接地）</text>`
  },
  mains() {
    /* 剖视：三孔插座内部就是三条通路 —— 上孔接保护地 PE，左下孔零线 N，右下孔火线 L。
       坐标按图标里三个孔的位置对位（上孔 85,62；下两孔 70,87 / 100,87），
       字只写三个字母：再多写整句会压到柱子与标题条（第一版就压了）。 */
    return `
      <rect x="36" y="25" width="98" height="98" rx="14" fill="none" stroke="#2563eb" stroke-width="1.2" stroke-dasharray="4 3"/>
      <path d="M85 62 V112" stroke="#9aa3ad" stroke-width="2.4"/>
      <path d="M70 87 L52 124 M100 87 L118 124" stroke="#9aa3ad" stroke-width="2.4"/>
      <text class="plabel" x="93" y="54" font-size="8">PE</text>
      <text class="plabel" x="58" y="96" font-size="8">N</text>
      <text class="plabel" x="103" y="96" font-size="8">L</text>`
  },
  homeLoad() {
    /* 剖视：家用电器里真正"用电"的只有一段发热电阻 —— 两根柱之间串的就是它。
       P = U²/R：额定 220 V 下 P 一换（洗衣机 500 W / 电热水壶 1500 W），阻值就变，
       电能表走字快慢也跟着变。 */
    return `
      <path d="M42 124 V104 Q42 98 50 98 M108 124 V104 Q108 98 100 98" stroke="#9aa3ad" stroke-width="3"/>
      <rect x="52" y="70" width="46" height="22" rx="4" fill="#fecaca" opacity=".8" stroke="#b91c1c" stroke-width="1.1"/>
      <path d="M58 81 q6 -8 12 0 q6 8 12 0 q6 -8 12 0" fill="none" stroke="#b45309" stroke-width="2"/>
      <text class="plabel" x="75" y="62" font-size="8.5">发热电阻丝 R</text>
      <rect x="62" y="97" width="26" height="7" rx="2" fill="#f59e0b" opacity=".85"/>`
  },
  energyMeter() {
    /* 透视层：器材面是实拍图标，内部只画四个关键件，位置压在铭牌贴纸下沿（y ≥ 116）到接线柱
       （y 160.7）之间那道空档里，图例排成一行"彩色词"，词色 = 元件色 —— 不用编号圆章，
       因为圆章要么压计数器数字，要么压铭牌贴纸，两版都返工过。 */
    return `
      <rect x="48" y="116" width="9" height="20" rx="2" fill="#b45309" stroke="#78350f" stroke-width="1"/>
      <path d="M52.5 116 V108 M52.5 136 V148" stroke="#b45309" stroke-width="2"/>
      <rect x="66" y="116" width="8" height="18" rx="2" fill="#a16207" stroke="#78350f" stroke-width="1"/>
      <circle cx="100" cy="126" r="15" fill="none" stroke="#2563eb" stroke-width="1.1" stroke-dasharray="3 2"/>
      <rect x="124" y="116" width="10" height="22" rx="2" fill="#e11d48" opacity=".7"/>
      <path d="M134 127 H152" stroke="#8a6a3c" stroke-width="1.6"/>
      <text x="100" y="150" text-anchor="middle" font-size="6.3"
        font-family="system-ui,-apple-system,'Segoe UI',sans-serif"><tspan fill="#b45309">电流线圈（串 1-3）</tspan><tspan fill="#334155"> · </tspan><tspan fill="#a16207">电压线圈（并 1-2）</tspan><tspan fill="#334155"> · </tspan><tspan fill="#2563eb">铝盘</tspan><tspan fill="#334155"> · </tspan><tspan fill="#e11d48">制动磁铁 → 计数器</tspan></text>`
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
  return dots.map(({ x, y, label, dark, labelFill = '#24292f' }) => {
    const cp = capPaint(dark)
    return `
    <circle cx="${x}" cy="${y}" r="7" fill="#0b0d10" stroke="#8d96a1" stroke-width="1.6"/>
    <circle cx="${x}" cy="${y}" r="4.8" fill="${cp.fill}" stroke="${cp.stroke}" stroke-width="1"/>
    <circle cx="${x - 1.4}" cy="${y - 1.4}" r="1.5" fill="rgba(255,255,255,0.45)"/>
    <text x="${x}" y="${y + 16}" text-anchor="middle" font-size="8.5" font-weight="700" fill="${labelFill}">${label}</text>`
  }).join('')
}

/**
 * 电能表四柱的「接法」标签。单独一层画（见 BuilderSVG 的 .esb-taglayer）——因为导线本体
 * 是压在器材之上的，标签留在器材字符串里会被从柱脚引出的导线整段盖住。
 * 每根柱正上方一行功能、一行 L/N，末尾一行说明表内 1-3 / 2-4 的关系。
 * 字用深色描边打底（paint-order=stroke），压在照片的深色表体或任何背景上都读得清。
 */
export function meterTermTagsSVG() {
  const cols = [
    { x: 46.4, s: '相线进', l: 'L', c: '#f87171' },
    { x: 77.6, s: '零线进', l: 'N', c: '#60a5fa' },
    { x: 108.7, s: '相线出', l: 'L', c: '#f87171' },
    { x: 139.9, s: '零线出', l: 'N', c: '#60a5fa' },
  ]
  const FONT = "system-ui,-apple-system,'Segoe UI',sans-serif"
  return `
    <g font-family="${FONT}" text-anchor="middle" stroke="#0b0d10" stroke-width="2.4"
       paint-order="stroke" stroke-linejoin="round">
      ${cols.map((k) => `<text x="${k.x}" y="129.5" font-size="6.6" fill="#e2ecf8">${k.s}</text>`).join('')}
      ${cols.map((k) => `<text x="${k.x}" y="140.5" font-size="8.2" font-weight="700" fill="${k.c}">${k.l}</text>`).join('')}
      <text x="95.5" y="150.5" font-size="6.2" fill="#c3ccd9">1-3 串电流线圈 · 2-4 零线直通</text>
    </g>`
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
 * 家庭电路这一组（交流电源 / 插座）改传 tint：柱帽跟着导线颜色走 —— 红 L、蓝 N、黑 E。
 */
function termDotSVG(x, y, dark = false, label = '', tint = '') {
  const cp = capPaint(dark, tint)
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
 * 电动机转向标识（右上角小圆牌）：↻ / ↺。转速本身由 BuilderSVG 的 MotionLayer
 * 让实拍图标里的皮带轮真转（字符串里的 CSS 动画会被 250ms 重渲染打断，看不到在转）。
 */
function motorSpinBadgeSVG(cx, cy, dir) {
  const cw = dir < 0 ? '↺' : '↻'
  return `
    <g>
      <circle cx="${cx}" cy="${cy}" r="12.5" fill="#0b1220" opacity="0.62"/>
      <circle cx="${cx}" cy="${cy}" r="12.5" fill="none" stroke="#34d399" stroke-width="1.1" opacity="0.55"/>
      <text x="${cx}" y="${cy + 5.4}" text-anchor="middle" font-size="15" font-weight="700"
        fill="#34d399" font-family="Segoe UI Symbol, serif">${cw}</text>
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

/* ── 交流电源三根引线的几何（器材本地坐标）──
 * 三根线从圆右侧圆周上引出来，线头默认落在 x152；拖线头就能把线拉长、拉歪。
 * BuilderSVG 也 import 这一份：渲染、命中、导线"接在线上任意一点"都用同一套数，
 * 免得两边各写一份 88/98/152 之后对一个像素对不上。 */
export const AC_LEAD = {
  l: { x0: 88.4, y0: 48, ex: 152, ey: 48, color: '#e53935' },
  n: { x0: 98, y0: 74, ex: 152, ey: 74, color: '#2f6fdc' },
  e: { x0: 88.4, y0: 100, ex: 152, ey: 100, color: '#111827' },
}

/* ── 空气开关的内部结构（"内部结构（透视）"打开时露出来）──
 * 照用户给的剖视实拍摆件：左模一整摞**灭弧栅** + 动触点臂与静触点；右模**电磁脱扣线圈**（绕满铜线）
 * + 铁芯撞针 + 双金属片与小弹簧；右侧露出**蓝色手柄的传动臂**，底部两条铜连杆通到下排螺钉。
 * 画布就是本器材的 124×152，跟外壳件一一对应；不写文字标注。 */
function breakerInner() {
  const chute = []
  for (let i = 0; i < 8; i++) {
    const y = 34 + i * 5.2
    chute.push(`<rect x="14" y="${y}" width="38" height="3.2" rx=".7" fill="url(#es-i-bk-chute)" stroke="#8b5c14" stroke-width=".4"/>
      <rect x="14" y="${y}" width="38" height="1" fill="#f2c878" opacity=".5"/>
      <rect x="23.4" y="${y}" width="4.6" height="3.2" fill="#7a4e0e" opacity=".42"/>
      <rect x="33.6" y="${y}" width="4.6" height="3.2" fill="#7a4e0e" opacity=".42"/>`)
  }
  const coil = []
  for (let i = 0; i < 10; i++) {
    const y = 52 + i * 4
    coil.push(`<rect x="83" y="${y}" width="21" height="2.8" rx="1.3" fill="url(#es-i-bk-coil)" stroke="#7d2a17" stroke-width=".4"/>
      <rect x="83" y="${y}" width="21" height=".9" rx=".45" fill="#f0a58c" opacity=".45"/>`)
  }
  return `<defs>
    <linearGradient id="es-i-bk-chute" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#e8bc6c"/><stop offset="55%" stop-color="#c68f38"/><stop offset="100%" stop-color="#8b5c17"/>
    </linearGradient>
    <linearGradient id="es-i-bk-coil" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#d96a4a"/><stop offset="52%" stop-color="#b34327"/><stop offset="100%" stop-color="#7d2a17"/>
    </linearGradient>
    <linearGradient id="es-i-bk-steel" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#8f98a3"/><stop offset="38%" stop-color="#eef2f6"/><stop offset="100%" stop-color="#7e8792"/>
    </linearGradient>
    <linearGradient id="es-i-bk-bimetal" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f0cd8a"/><stop offset="60%" stop-color="#d9a83c"/><stop offset="100%" stop-color="#a97a20"/>
    </linearGradient>
  </defs>
  <!-- 壳内腔（浅灰塑料内壁） -->
  <rect x="6.5" y="7.5" width="111" height="137" rx="5" fill="#f2f5f8" stroke="#c3cbd4" stroke-width="1"/>
  <rect x="9" y="10" width="106" height="132" rx="4" fill="#e9edf1" stroke="#cfd6de"/>
  <!-- 左模：灭弧栅槽 + 8 片灭弧栅 -->
  <rect x="11.4" y="29.6" width="43.2" height="47.4" rx="3" fill="#dee4ea" stroke="#b6c0ca"/>
  ${chute.join('\n      ')}
  <!-- 左模：动触点臂（底部枢轴 → 静触点）+ 两端铜连杆 -->
  <path d="M21.6 121 L27 107 L45.4 82" stroke="#c07a2c" stroke-width="3.6" stroke-linecap="round" fill="none"/>
  <path d="M21.6 121 L27 107 L45.4 82" stroke="#e7ac63" stroke-width="1.2" stroke-linecap="round" fill="none" opacity=".55"/>
  <circle cx="21.6" cy="121" r="4.4" fill="#b06a22" stroke="#81501a" stroke-width=".9"/>
  <rect x="43" y="76.6" width="8.2" height="5.4" rx="1.3" fill="#dde3ea" stroke="#8d97a3" stroke-width=".8"/>
  <rect x="43.6" y="77.2" width="7" height="1.6" rx=".8" fill="#ffffff" opacity=".8"/>
  <path d="M21.6 121 L18.4 130 L34 138.4" stroke="#c07a2c" stroke-width="3.6" fill="none" stroke-linejoin="round"/>
  <rect x="25" y="12.4" width="27" height="9.4" rx="2" fill="#e39b3c" stroke="#a96720" stroke-width=".8"/>
  <path d="M29.4 21.8 L33 29" stroke="#c07a2c" stroke-width="3.2" fill="none"/>
  <!-- 右模：电磁脱扣线圈（骨架 + 10 圈绕组 + 上下黄铜端板） -->
  <rect x="80.4" y="49.8" width="25.8" height="45.4" rx="3" fill="#e7ecf1" stroke="#b6c0ca"/>
  ${coil.join('\n      ')}
  <rect x="79.6" y="45.4" width="27.4" height="4.8" rx="1.9" fill="url(#es-i-bk-bimetal)" stroke="#a97a20" stroke-width=".7"/>
  <rect x="79.6" y="94.8" width="27.4" height="4.8" rx="1.9" fill="url(#es-i-bk-bimetal)" stroke="#a97a20" stroke-width=".7"/>
  <!-- 线圈里的铁芯撞针 + 顶端的橙色绝缘块 -->
  <rect x="89.8" y="25.4" width="6.6" height="22" rx="2.2" fill="url(#es-i-bk-steel)" stroke="#828b96" stroke-width=".7"/>
  <rect x="86.4" y="17.4" width="13.4" height="9" rx="2" fill="#e39b3c" stroke="#a96720" stroke-width=".8"/>
  <path d="M93 99.6 L93 130 L103 137.6" stroke="#c07a2c" stroke-width="3.6" fill="none" stroke-linejoin="round"/>
  <!-- 双金属片（黄铜弯片）与小弹簧、主弹簧 -->
  <path d="M100.4 96 C 112.4 100, 112.4 111, 101.6 115.4" stroke="url(#es-i-bk-bimetal)" stroke-width="4.8" stroke-linecap="round" fill="none"/>
  <path d="M100.4 96 C 112.4 100, 112.4 111, 101.6 115.4" stroke="#fbe3ad" stroke-width="1.1" stroke-linecap="round" fill="none" opacity=".65"/>
  <g stroke="#9aa3ad" stroke-width="1.5" fill="none">
    <path d="M98.4 90 q 3.6 -6 7.2 0 q 3.6 6 7.2 0"/>
    <path d="M70 104 q 4 -6.4 8 0 q 4 6.4 8 0 q 4 -6.4 8 0"/>
  </g>
  <!-- 右侧：蓝色手柄的传动臂 + 连到触点臂的连杆 -->
  <path d="M112.6 60.4 L120 69 L113.4 79" stroke="#2f73c4" stroke-width="5.4" fill="none" stroke-linejoin="round"/>
  <path d="M112.6 60.4 L120 69 L113.4 79" stroke="#79b2ee" stroke-width="1.5" fill="none" stroke-linejoin="round" opacity=".7"/>
  <line x1="111" y1="70.6" x2="60.6" y2="72" stroke="#98a2ad" stroke-width="2"/>
  <!-- 两道内壁加强筋 -->
  <rect x="9" y="98.4" width="44" height="1.4" fill="#d3dae2"/>
  <rect x="72" y="24" width="1.4" height="36" fill="#d3dae2"/>`
}

/* ── 闸刀（手柄）单独成一张图 ──
 * 它不跟外壳一起画：`BuilderSVG` 把它挂成独立一层，按"合闸 0° / 跳闸 180°"给一个 CSS transition，
 * 于是翻转是**真的绕"两竖与面板接触处"（30.6, 79.5）转过去**，而不是跳到另一个位置。
 * 图里按**合闸**位画（横杆在上 66..74.6、两根腿 74.6..97.6），转 180° 后横杆正好落到 84.4..93、
 * 两根腿翻到 61.4..84.4 —— 就是实拍里"横在下、两竖在上"。 */
export function breakerLeverSVG(dark) {
  const barFill = dark ? '#23538c' : 'url(#es-lv-lever)'
  const legFill = dark ? '#1c4674' : 'url(#es-lv-leg)'
  const edge = dark ? '#0e2d50' : '#123f6d'
  return `
    <svg width="124" height="152" viewBox="0 0 124 152">
      <defs>
        <linearGradient id="es-lv-lever" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#7ab6ef"/><stop offset="28%" stop-color="#3d84d6"/>
          <stop offset="72%" stop-color="#2a6cc0"/><stop offset="100%" stop-color="#1a4d90"/>
        </linearGradient>
        <linearGradient id="es-lv-leg" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#1f5aa6"/><stop offset="34%" stop-color="#3a80d2"/>
          <stop offset="66%" stop-color="#3a80d2"/><stop offset="100%" stop-color="#1f5aa6"/>
        </linearGradient>
      </defs>
      ${dark ? '' : `
      <!-- 投在面板/滑槽上的落影 -->
      <rect x="4.6" y="73.4" width="55.3" height="13" rx="3" fill="rgba(23,37,58,.10)"/>`}
      <!-- 两根腿（横杆压在上面） -->
      <rect x="9.9" y="74.6" width="18" height="23" rx="2.2" fill="${legFill}" stroke="${edge}" stroke-width=".8"/>
      <rect x="32.7" y="74.6" width="18" height="23" rx="2.2" fill="${legFill}" stroke="${edge}" stroke-width=".8"/>
      ${dark ? '' : `
      <!-- 腿的自由端亮面 + 贴横杆那头压暗 -->
      <rect x="10.9" y="91.2" width="16" height="4.8" rx="2" fill="#a6ccf2" opacity=".45"/>
      <rect x="33.7" y="91.2" width="16" height="4.8" rx="2" fill="#a6ccf2" opacity=".45"/>
      <rect x="9.9" y="75.4" width="18" height="2.6" fill="rgba(9,26,48,.32)"/>
      <rect x="32.7" y="75.4" width="18" height="2.6" fill="rgba(9,26,48,.32)"/>`}
      <!-- 横杆 -->
      <rect x="3.6" y="66" width="55.3" height="8.6" rx="2.2" fill="${barFill}" stroke="${edge}" stroke-width=".9"/>
      ${dark ? '' : `
      <rect x="4.8" y="67.1" width="53" height="2.6" rx="1.3" fill="#ffffff" opacity=".40"/>
      <rect x="3.6" y="73.4" width="55.3" height="1.4" rx=".7" fill="rgba(9,26,48,.35)"/>`}
    </svg>`
}

const breakerType = {
  label: '空气开关', w: 124, h: 152, hideWrap: true,

    /* 接线柱的热点就压在**螺钉正上方 7px**（不是浮在壳体外面）：热点在柱帽上、柱子一点就到；
       导线锚点 = 热点 + TERM_DROP(7) = **螺钉圆心**，而导线层在器材层之下 —— 露在外面的那截到壳沿就
       "进壳"了，既不在面板上压着，也不会在螺钉上绕铜丝（用户两条口径同时满足）。
       进线对左模的两颗螺钉；出线对右模的两颗（照用户口径：下面那排导线接在右边两颗上）。 */
    terminals: [
      { id: 'li', label: 'L进', name: '相线进（左上）', x: 13.6, y: 16.7 },
      { id: 'ni', label: 'N进', name: '零线进（右上）', x: 48.1, y: 16.7 },
      { id: 'lo', label: 'L出', name: '相线出（右下）', x: 84.3, y: 128.1 },
      { id: 'no', label: 'N出', name: '零线出（右下）', x: 109.7, y: 128.1 },
    ],
    render(c) {
      const on = !!c.closed
      /* 严格照用户新给的 NB 实拍（1P+N，两个模数）逐件对位：
         · 上排：左模两颗金螺钉（沉在白色凹坑里）+ 右模一颗白按环；
         · 每条模数上印 **蓝字 NOBOOK + 一道蓝横条**（不是实色印带，字是蓝的）；
         · 左模：绿指示灯、"230/400V~" 小字、↑ON 箭头、一个哑铃小标；
         · 手柄是**两根并排的蓝腿 + 一根横杆**，坐在两条灰白的滑槽里 —— 用户口径：**上推到顶=合，压到底=关**；
         · 右模：橙指示钮、"IΔn 0.03A" 印刷字、一幅**内部结构示意图**（触点 + 虚线箭头）、
           一块蓝标条 + "合闸前请按下"中文印刷；
         · 下排四颗金螺钉，右模那两颗坐在一条灰白凹槽里。
         立体感靠：外壳顶部高光/右侧压深/底部压深、螺钉凹坑的双层环、手柄的斜面渐变与落影。 */
      const screw = (x, y) => `
        <g>
          <ellipse cx="${x}" cy="${y + .8}" rx="10.8" ry="10.4" fill="rgba(23,37,58,.15)"/>
          <circle cx="${x}" cy="${y}" r="9.6" fill="#f7f9fb" stroke="#c2cad4" stroke-width=".9"/>
          <circle cx="${x}" cy="${y}" r="8.4" fill="#e3e9ef"/>
          <circle cx="${x}" cy="${y}" r="8.4" fill="none" stroke="rgba(35,55,80,.30)" stroke-width="2.2"/>
          <circle cx="${x}" cy="${y}" r="7.6" fill="none" stroke="#ffffff" stroke-width="1" opacity=".75"/>
          <circle cx="${x}" cy="${y}" r="6.8" fill="url(#es-g-bk-screw)" stroke="#8a6d24" stroke-width=".9"/>
          <circle cx="${x}" cy="${y}" r="6.8" fill="none" stroke="rgba(96,74,20,.5)" stroke-width="1.5"/>
          <line x1="${x - 4.7}" y1="${y}" x2="${x + 4.7}" y2="${y}" stroke="#6b5416" stroke-width="1.4"/>
          <line x1="${x}" y1="${y - 4.7}" x2="${x}" y2="${y + 4.7}" stroke="#6b5416" stroke-width="1.4"/>
          <circle cx="${x - 2.7}" cy="${y - 3}" r="1.3" fill="#ffe9a8" opacity=".5"/>
        </g>`
      const ringBtn = (x, y) => `
        <g>
          <ellipse cx="${x}" cy="${y + .6}" rx="9.6" ry="9.2" fill="rgba(23,37,58,.13)"/>
          <circle cx="${x}" cy="${y}" r="8.6" fill="#f4f6f9" stroke="#b7c0cb" stroke-width="1"/>
          <circle cx="${x}" cy="${y}" r="6.2" fill="none" stroke="rgba(60,80,105,.3)" stroke-width="1.8"/>
          <circle cx="${x}" cy="${y}" r="5.4" fill="#fdfefe" stroke="#cfd7e0" stroke-width=".8"/>
        </g>`
      /* 蓝字 + 蓝横条（照实物：字是蓝的，后面跟一段实心蓝条） */
      const silk = (x, w) => `
        <text x="${x}" y="49.4" font-size="4.5" font-weight="700" letter-spacing=".3" fill="#2f6fb8"
          font-family="system-ui,-apple-system,'Segoe UI',sans-serif">NOBOOK</text>
        <rect x="${x + 25.4}" y="46.2" width="${w}" height="2.6" fill="#2f6fb8"/>`
      /* 手柄两条滑槽（凹进去的灰白窗） */
      const slot = (x, w) => `
        <g>
          <rect x="${x}" y="65.4" width="${w}" height="34.4" rx="1.6" fill="#dde3ea" stroke="#c6ced8" stroke-width=".8"/>
          <rect x="${x + .8}" y="66.2" width="${w - 1.6}" height="3.2" fill="rgba(23,37,58,.20)"/>
          <rect x="${x + .8}" y="95" width="${w - 1.6}" height="3.2" fill="#ffffff" opacity=".62"/>
        </g>`
      /* 闸刀在独立图层里画（见 breakerLeverSVG），这里只留滑槽 —— 翻转时闸刀是"转"过去的 */
      return `
    <svg width="124" height="152" viewBox="0 0 124 152">
      <defs>
        <linearGradient id="es-g-bk-body" x1="0" y1="0" x2="0.16" y2="1">
          <stop offset="0%" stop-color="#ffffff"/><stop offset="46%" stop-color="#fbfcfd"/>
          <stop offset="100%" stop-color="#e2e7ec"/>
        </linearGradient>
        <linearGradient id="es-g-bk-lever" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#6fb0f0"/><stop offset="30%" stop-color="#3d84d6"/>
          <stop offset="72%" stop-color="#2a6cc0"/><stop offset="100%" stop-color="#1a4d90"/>
        </linearGradient>
        <linearGradient id="es-g-bk-leg" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#1f5aa6"/><stop offset="34%" stop-color="#3a80d2"/>
          <stop offset="70%" stop-color="#2b6cbd"/><stop offset="100%" stop-color="#194a8c"/>
        </linearGradient>
        <radialGradient id="es-g-bk-screw" cx="42%" cy="32%" r="78%">
          <stop offset="0%" stop-color="#f0d78f"/><stop offset="55%" stop-color="#d3ac4a"/><stop offset="100%" stop-color="#96731f"/>
        </radialGradient>
        <linearGradient id="es-g-bk-pill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#ffc94f"/><stop offset="55%" stop-color="#f39207"/><stop offset="100%" stop-color="#c06a04"/>
        </linearGradient>
        <linearGradient id="es-g-bk-shade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="rgba(23,37,58,0)"/><stop offset="60%" stop-color="rgba(23,37,58,.10)"/>
          <stop offset="100%" stop-color="rgba(23,37,58,.26)"/>
        </linearGradient>
        <linearGradient id="es-g-bk-lip" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stop-color="rgba(23,37,58,.13)"/><stop offset="100%" stop-color="rgba(23,37,58,0)"/>
        </linearGradient>
      </defs>
      <!-- 透视层：灭弧栅 / 脱扣线圈 / 双金属片 / 触点臂（默认隐藏，点"内部结构"才露出来） -->
      ${fitInner(124, 152, 124, 152, breakerInner())}
      <g class="casing">
        <!-- 白壳：一块料 + 顶部斜面高光 + 右/底压深，中间一道模缝 -->
        <ellipse cx="64" cy="152.4" rx="58" ry="4.6" fill="rgba(23,37,58,.14)"/>
        <rect x="0.6" y="0.6" width="122.8" height="150.8" rx="3" fill="url(#es-g-bk-body)" stroke="#b3bcc7" stroke-width="1"/>
        <rect x="1.3" y="1.2" width="121.4" height="3.6" rx="1.6" fill="#ffffff"/>
        <rect x="1.3" y="4.6" width="121.4" height="1.2" fill="rgba(23,37,58,.09)"/>
        <rect x="1.3" y="5.8" width="1.6" height="112" fill="#ffffff" opacity=".7"/>
        <rect x="116" y="5.4" width="7.6" height="138.6" fill="url(#es-g-bk-shade)"/>
        <rect x="1.4" y="107.6" width="121.2" height="11.6" fill="url(#es-g-bk-lip)"/>
        <rect x="1.3" y="143.4" width="121.4" height="7" rx="1.6" fill="rgba(23,37,58,.06)"/>
        <line x1="1.6" y1="119.4" x2="122.2" y2="119.4" stroke="rgba(23,37,58,.10)" stroke-width="1.1"/>
        <line x1="1.6" y1="120.5" x2="122.2" y2="120.5" stroke="#ffffff" stroke-width="1" opacity=".9"/>
        <rect x="65.2" y="3" width="1.5" height="145" fill="#cbd3dc"/>
        <rect x="66.7" y="3" width="1.1" height="145" fill="#ffffff" opacity=".8"/>

        <!-- 蓝字 NOBOOK + 蓝横条（左右各一条） -->
        ${silk(3.6, 28.6)}
        ${silk(66.6, 29.8)}

        <!-- 左模：绿指示灯 + 230/400V~ + 哑铃小标 + ↑ON -->
        <ellipse cx="11.8" cy="58.6" rx="2.6" ry="1.9" fill="#1d5b2c" stroke="#134a24" stroke-width=".6"/>
        <ellipse cx="11.8" cy="58.4" rx="2" ry="1.3" fill="#43c262"/>
        <text x="4.4" y="64.6" font-size="3.2" fill="#7c8794"
          font-family="system-ui,-apple-system,'Segoe UI',sans-serif">230/400V~</text>
        <line x1="4.4" y1="66.2" x2="19" y2="66.2" stroke="#aeb7c2" stroke-width=".6"/>
        <g stroke="#8d97a3" stroke-width=".7" fill="none">
          <ellipse cx="37.4" cy="61.4" rx="1.9" ry="1.5"/><ellipse cx="41.4" cy="61.4" rx="1.9" ry="1.5"/>
          <line x1="39.3" y1="61.4" x2="39.5" y2="61.4"/>
        </g>
        <line x1="48.9" y1="66.6" x2="48.9" y2="57.4" stroke="#6b7583" stroke-width=".9"/>
        <path d="M46.6 59.6 L48.9 57.2 L51.2 59.6" fill="none" stroke="#6b7583" stroke-width="1.1"/>
        <text x="51.8" y="61.6" font-size="3.9" font-weight="600" fill="#6b7583"
          font-family="system-ui,-apple-system,'Segoe UI',sans-serif">ON</text>

        <!-- 右模：白按环 + 橙指示钮 + 漏电参数印刷 + 内部结构示意图 + 蓝标条 + 中文 -->
        ${ringBtn(81.6, 23.7)}
        <ellipse cx="80.8" cy="59.1" rx="10.6" ry="3.4" fill="url(#es-g-bk-pill)" stroke="#a86206" stroke-width=".7"/>
        <ellipse cx="80.8" cy="59.9" rx="9.6" ry="1.1" fill="rgba(120,60,0,.28)"/>
        <ellipse cx="77.4" cy="57.9" rx="4.6" ry="1.1" fill="#ffffff" opacity=".34"/>
        <text x="73.6" y="66" font-size="2.7" fill="#7c8794"
          font-family="system-ui,-apple-system,'Segoe UI',sans-serif">IΔn 0.03A</text>
        <text x="73.6" y="69.6" font-size="2.7" fill="#7c8794"
          font-family="system-ui,-apple-system,'Segoe UI',sans-serif">t ≤ 0.1s</text>
        <!-- 内部结构示意图：触点 + 电磁线圈 + 虚线箭头（照实物那幅细黑线印刷图） -->
        <g stroke="#5d6773" stroke-width=".62" fill="none" opacity=".92">
          <rect x="104.6" y="74.6" width="9.4" height="12.2" rx="1"/>
          <line x1="104.6" y1="80.4" x2="100.4" y2="80.4"/>
          <line x1="114" y1="80.4" x2="119.2" y2="80.4"/>
          <line x1="119.2" y1="76.8" x2="119.2" y2="84.2"/>
          <path d="M119.2 76.8 L122.4 75.4"/>
          <line x1="101.4" y1="87.4" x2="115.6" y2="87.4"/>
          <line x1="101.4" y1="87.4" x2="101.4" y2="90.4"/>
          <line x1="106" y1="87.4" x2="106" y2="90.4"/>
          <line x1="108.6" y1="90.4" x2="112.4" y2="90.4"/>
          <line x1="99.2" y1="76.6" x2="99.2" y2="84.2"/>
          <line x1="96" y1="80.4" x2="92" y2="80.4"/>
        </g>
        <g stroke="#8d97a3" stroke-width=".9" stroke-dasharray="2.2 1.6" fill="none">
          <line x1="72" y1="79.4" x2="93.4" y2="79.4"/>
          <path d="M74.4 76.8 L71.6 79.4 L74.4 82" stroke-dasharray="0"/>
        </g>
        <rect x="74.4" y="99.6" width="13" height="11.4" rx=".8" fill="#2f6cb5"/>
        <g stroke="#ffffff" stroke-width=".7" opacity=".85">
          <line x1="76.2" y1="102.4" x2="85.6" y2="102.4"/>
          <line x1="76.2" y1="105.4" x2="85.6" y2="105.4"/>
          <line x1="76.2" y1="108.4" x2="85.6" y2="108.4"/>
        </g>
        <text x="90.6" y="106.6" font-size="3.4" fill="#4b5563"
          font-family="system-ui,-apple-system,'PingFang SC','Microsoft YaHei',sans-serif">合闸前请按下</text>

        <!-- 手柄：两条灰白滑槽 + 两根蓝腿 + 横杆，**整块绕"两竖与面板接触处"转**。
             用户口径：合闸"横在上、两竖在下"，跳闸"横在下、两竖在上"，而且要看得出是**旋转**（不是镜像翻转）：
             所以整块给了 ±5° 的转角（同一个转轴：滑槽下口 x30.6 / y96，就是两竖跟面板接触的地方），
             再把投在面板上的落影一起转 —— 斜着看就是"刚转过一把"。合闸时腿被压短（俯视）、
             跳闸时腿缩短且顶面更亮（仰视），两端还各补一道面光，避免"两块贴纸"。 -->
        ${slot(5.4, 23.6)}
        ${slot(30.9, 23.5)}
        <!-- 两条灰白滑槽（闸刀本身在独立的 .esb-bklever 层里画，好让翻转时真的"转"起来） -->
        ${slot(5.4, 23.6)}
        ${slot(30.9, 23.5)}

        <!-- 下排：右模两颗螺钉坐在一条灰白凹槽里 -->
        <rect x="76.4" y="127.8" width="42" height="14.6" rx="3.2" fill="#eef1f5" stroke="#dde3ea" stroke-width=".8"/>
        ${screw(13.6, 23.7)}
        ${screw(48.1, 23.7)}
        ${screw(13.6, 135.1)}
        ${screw(48.1, 135.1)}
        ${screw(84.3, 135.1)}
        ${screw(109.7, 135.1)}
      </g>
    </svg>` }
}

/* 小电动机的转子本体（线圈 + 两条引线 + 换向器），deg = 转角（度）。
   卡片在「未通电 / 导出预览」时用 deg=0 画静态转子；通电时卡片让开（dyn.hideRotor），
   由 Scenario 的转子层每帧按转角重画 —— 因为器材字符串每 250ms 会被 dangerouslySetInnerHTML
   重建成起始帧，字符串里的 SMIL/CSS 动画根本转不起来（见 BuilderSVG 里 MotionLayer 的注释）。

   **线圈 → 引线 → 换向器是同一台转子，共用一个 deg，同步转。**
   线圈绕竖轴 (x=101.4) 转，按"略俯视"的正视图投影：
       X = 101.4 + x·cosθ ，  Y = y − sinθ·K·x   （K = 0.34，就是略俯视的"看下去"量）
   所以它不是原地平面打转：转到 90° 时线圈侧身、只剩一条边，红蓝两半上下错开；
   转到 180° 时红蓝左右互换，但 T 不会翻个底朝天。这就是真实线圈绕轴转的正视图。
   换向器是与轴垂直的圆盘：外径恒定（转到哪一格，铜片外沿都压在两侧碳刷上），
   两片扇形随同一个 θ 扫过电刷 —— 它"环内原地转"和线圈"侧身"是同一根轴的两种投影，不是两套动画。
   换向器不能挂在线圈下面当子对象（那样它绕线圈圆心公转，会跑出磁极）；线圈也不能绕换向器转（会甩出极缝）。

   引线是**刚性铜线**，上端焊在颈口（线圈正面），下端**接进换向器背面**（局部 ±7.0, −6.4，r=9.5 正好落在铜片
   背面：铜片压住末端，看不到接头，和标杆图一样）。两端各自随所属零件动，引线不会被抽成长条、也不会斜穿线圈。 */
function motorRotorBody(cid, deg = 0) {
  /* 静止相位：整台转子（线圈 + 两条引线 + 换向器）绕竖轴**向左偏 10°**。
     0° 时线圈完全正对镜头、俯视一点厚度都看不出；偏 10° 才像标杆那样"侧面略露"。
     只改这一个入口 = 静态卡片与 rAF 转子层一起偏，转子内部仍然只用一个角度。 */
  const deg0 = deg - 10
  const rad = (deg0 * Math.PI) / 180
  const c = Math.cos(rad), s = Math.sin(rad)
  const K = 0.34                                   // 略俯视的"看下去"量
  /* 线圈局部 (x, y)（x 是离轴距离，y 以 107.5 为基准）→ 页面绝对坐标：绕竖轴转 + 略俯视错位。
     deg=0 时 X = 101.4+x、Y = 107.5+y，与原来的静态画法逐像素一致。
     符号取 +s·K·x：θ>0 时线圈右侧转向观众 —— 略俯视下"离眼睛更近"的点在屏幕上更低，
     这和换向器 rotate(+θ) 是顺时针、整台转子同一根轴的同一个 ω 对得上。 */
  const px = (x, y) => [101.4 + x * c, 107.5 + y + s * K * x]
  const P = (x, y) => { const [X, Y] = px(x, y); return `${X.toFixed(2)} ${Y.toFixed(2)}` }
  /* 线圈半边轮廓：肩 → 外圆角 → 侧边 → 上圆角 → 顶中线（可按 ox/oy 偏移一份深色描边当阴影）。
     CO = 线圈整体的竖向位置：宽部（高 29）的**中心**压在磁铁块中心（15..140 → 77.5），窄部因此加长 */
  const CO = 0
  const half = (sgn, col, w, ox = 0, oy = 0) =>
    `<path d="M ${P(8.3 * sgn + ox, -11 + oy + CO)} L ${P(34.5 * sgn + ox, -11 + oy + CO)}` +
    ` Q ${P(39 * sgn + ox, -11 + oy + CO)} ${P(39 * sgn + ox, -15.5 + oy + CO)}` +
    ` L ${P(39 * sgn + ox, -35.5 + oy + CO)} Q ${P(39 * sgn + ox, -40 + oy + CO)} ${P(35 * sgn + ox, -40 + oy + CO)}` +
    ` L ${P(ox, -40 + oy + CO)}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linejoin="round"/>`
  const tib = (sgn) => px(8.3 * sgn, -11 + CO)                              // 颈口下端（在线圈上）
  const sol = (sgn) => [101.4 + (8.3 * sgn) * c + 4.6 * s,
                        153.5 + (8.3 * sgn) * s - 4.6 * c]                    // 换向片背面接点（r=9.5，落在铜片后面）
  const lead = (sgn, dark, main) => {
    const [x1, y1] = tib(sgn)
    const [x2, y2] = sol(sgn)
    const d = `M ${x1.toFixed(2)} ${y1.toFixed(2)} L ${x2.toFixed(2)} ${y2.toFixed(2)}`
    return `
          <path d="${d}" fill="none" stroke="${dark}" stroke-width="4.2" stroke-linecap="round"/>
          <path d="${d}" fill="none" stroke="${main}" stroke-width="3.3" stroke-linecap="round"/>
          <path d="${d}" fill="none" stroke="rgba(255,255,255,.22)" stroke-width="1.0" stroke-linecap="round"/>`
  }
  return `
          <defs>
            <linearGradient id="${cid}rr" x1="0" y1="0" x2="0.7" y2="1">
              <stop offset="0%" stop-color="#f4575f"/><stop offset="55%" stop-color="#e0424e"/>
              <stop offset="100%" stop-color="#b52c37"/>
            </linearGradient>
            <linearGradient id="${cid}rb" x1="0" y1="0" x2="0.7" y2="1">
              <stop offset="0%" stop-color="#57b4f2"/><stop offset="55%" stop-color="#2e9ae8"/>
              <stop offset="100%" stop-color="#1b6fb2"/>
            </linearGradient>
            <linearGradient id="${cid}sh" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stop-color="#7f8992"/><stop offset="38%" stop-color="#e8eff6"/>
              <stop offset="100%" stop-color="#616b75"/>
            </linearGradient>
          </defs>
          <!-- 转轴：线圈与换向器同装在这一根轴上，轴心 x=101.4 就是两者的旋转轴 ——
               看图纸就能看出是"一台转子"，不是两件各转各的。轴从线圈臂里穿出来，
               经换向器的内孔（r=7.6 的空心正好给轴让位）一直扎进底座。 -->
          <rect x="99.7" y="96.5" width="3.4" height="74.5" rx="1.7" fill="url(#${cid}sh)"/>
          <rect x="99.7" y="96.5" width="1.1" height="74.5" rx="0.55" fill="rgba(255,255,255,.40)"/>
          <!-- 线圈：一匝闭合框（宽 78 / 高 29），左红右蓝在中缝相接；按"绕竖轴 + 略俯视"的投影画，
               与换向器拿同一个 deg —— 一台转子，同步转。
               描边用各自色系的深色（深红/深蓝），不用黑线：轮廓靠"颜色深浅"体现 -->
          <g opacity=".22" transform="translate(1 1.1)">
            ${half(-1, '#8c1a24', 3.4)}
            ${half(1, '#0e3d68', 3.4)}
          </g>
          ${half(-1, '#d9434e', 3.2)}
          ${half(1, '#3f90d8', 3.2)}

          <!-- 两条引线：刚性铜线，上端焊在线圈颈口（正面），下端**从换向器背面接进去** ——
               所以先画引线、后画换向器：铜片压住引线末端，接头看不见（和标杆图一致） -->
          ${lead(-1, '#b03340', '#d9434e')}
          ${lead(1, '#2b6ba6', '#3f90d8')}

          <!-- 换向器：两片扇形（缝 15° 落在 12 点与 6 点），环心是空的（r=7.4 让轴穿过）；
               绕自己圆心 (101.4,153.5) 转，与线圈同一个 deg —— 这就是 NB 的 luna/lunb 共用 rotation。
               外径 24（两个半环外沿 89.4 / 113.4）收在极间缝里，与两侧磁极各留 3.4px -->
          <g transform="translate(101.4 153.5) rotate(${deg0})">
            <!-- 环心与两片之间都透（不刷底），只有两片扇形本身是红/蓝 -->
            <path d="M 0 -12 A 12 12 0 0 0 0 12" fill="none" stroke="rgba(126,18,26,.42)" stroke-width="1"/>
            <path d="M 0 -12 A 12 12 0 0 1 0 12" fill="none" stroke="rgba(10,48,90,.42)" stroke-width="1"/>
            <path d="M -1.566 -11.897 A 12 12 0 0 0 -1.566 11.897 L -0.966 7.337 A 7.4 7.4 0 0 1 -0.966 -7.337 Z"
              fill="url(#${cid}rr)"/>
            <path d="M 1.566 -11.897 A 12 12 0 0 1 1.566 11.897 L 0.966 7.337 A 7.4 7.4 0 0 0 0.966 -7.337 Z"
              fill="url(#${cid}rb)"/>
            <path d="M -1.566 -11.897 A 12 12 0 0 0 -1.566 11.897" fill="none" stroke="rgba(126,18,26,.55)" stroke-width="1.1"/>
            <path d="M 1.566 -11.897 A 12 12 0 0 1 1.566 11.897" fill="none" stroke="rgba(10,48,90,.55)" stroke-width="1.1"/>
            <circle r="7.4" fill="none" stroke="rgba(74,42,48,.32)" stroke-width="1.2"/>
            <circle r="7.4" fill="none" stroke="rgba(255,255,255,.16)" stroke-width=".8"/>
            <path d="M -10.7 -4.73 A 12 12 0 0 0 -4.51 -11" fill="none" stroke="rgba(255,255,255,.42)" stroke-width="1.2"/>
            <path d="M 10.7 4.73 A 12 12 0 0 1 4.51 11" fill="none" stroke="rgba(255,255,255,.34)" stroke-width="1.2"/>
          </g>`
}

/* 换向器两侧的两片碳刷（不随转子转；压在 r=12 的环外沿 x=89.4 / 113.4 上，内缘咬进 0.1px，
   外缘离磁极内缘仍有 1~1.2px，不再压在磁极上） */
function motorBrushBody() {
  return `
    <rect x="87.0" y="147.8" width="2.4" height="10.6" rx="1.0" fill="#2b3036"/>
    <rect x="87.0" y="147.8" width="2.4" height="2.4" rx="1.0" fill="#525a62"/>
    <rect x="113.4" y="147.8" width="2.4" height="10.6" rx="1.0" fill="#2b3036"/>
    <rect x="113.4" y="147.8" width="2.4" height="2.4" rx="1.0" fill="#525a62"/>`
}

/* ── 手摇发电机的卡片几何（N B 原厂图集按 0.6237 从机身坐标换算）──
 * 机身 497×419 → 卡 310×261；飞轮轴心 (145,138.5)、线圈轴心 (365.35,300)（皮带增速 2 倍）、
 * 黑柱 (272,366)、红柱 (452,361)。飞轮与线圈由场景的 HandCrankLayer 真转，
 * 卡片只在缩略图（dyn.hideCrank 为假）里静态画一份。 */
export const HG_CRANK = {
  hubX: 90.4, hubY: 86.4, hubR: 65.5,
  coilX: 227.9, coilY: 187.1, coilW: 51.8, coilH: 32.4,
}
export function handGenSVG(bodyFile, hideCrank) {
  const k = HG_CRANK
  return `
    <svg width="310" height="261" viewBox="0 0 310 261">
      <image href="${figURL(bodyFile)}" x="0" y="0" width="310" height="261"
        preserveAspectRatio="none"/>
      ${hideCrank ? '' : `
      <image href="${figURL('hg_crank.png')}" x="${k.hubX - k.hubR}" y="${k.hubY - k.hubR}"
        width="${k.hubR * 2}" height="${k.hubR * 2}" preserveAspectRatio="none"/>
      <image href="${figURL('hg_coil.png')}" x="${k.coilX - k.coilW / 2}" y="${k.coilY - k.coilH / 2}"
        width="${k.coilW}" height="${k.coilH}" preserveAspectRatio="none"/>`}
    </svg>`
}

/* ── 电动机（NB electrical/ElectriMotorElectri 的原厂分层贴图）─────────────────────
 * NB「电动机原理」（nobook.db → experiments id 252）那台机器，就是这张图集里的 `电机1.png`：
 * 左红 N / 右蓝 S 两块弧形极靴、极间圆形磁场间隙、灰色小底座 + 两根细立柱（电刷/支架）+ 左黑右红两接线柱。
 * 图集 58 帧已按 atlas 坐标裁出来（audit/nb_gen/motor_export.py）：
 *   机身 mt_body.png 457×443；极性反像 mt_body_rev.png（N/S 对调，用于"对调磁极"演示）；
 *   线圈整周 28 帧 mt_coil_sheet.png（每帧 191×324 横排）；换向器环 28 帧 mt_ring_sheet.png（每帧 81×85）。
 * 叠放位置是拿 28 帧在机身上逐帧对出来的（不是估的）：
 *   线圈 (124,37) 191×324 —— 线圈环中心正落在磁场间隙中心；
 *   换向器 (180,288) 81×85 —— 正坐在两根立柱之间的电刷缝里，线圈两条引线的末端压进环口。
 * 卡片按 0.5 缩到 229×222；线圈/换向器的转动交给 <MotorNBSpinLayer> 每帧换帧号，
 * 卡片自己只在缩略图（dyn.motorLayer 不设）里静态画第 1 帧。 */
export const MOTOR_NB = {
  aw: 457, ah: 443, s: 0.5,
  coil: { x: 133, y: 37, w: 191, h: 324, n: 28 },
  /* 换向器正坐在两立柱（电刷）之间：立柱在机身 x≈190 / 269，环心 229.5、外径 76 → 两侧贴着电刷，不留缝；
     线圈两根引线落在环的上表面（左红右蓝），也不留缝 */
  ring: { x: 189, y: 288, w: 81, h: 85, n: 28 },
  terms: { a: { x: 155, y: 406 }, b: { x: 296, y: 406 } },
}

/** 第 k 帧盖上去的 <image>：横排图集用 clip 裁出那一格（不用 JS 重画图） */
export function motorFrameImg(sheet, box, k, cid, n) {
  const i = ((Math.floor(k) % n) + n) % n
  return `<g clip-path="url(#${cid})"><image href="${motorURL(sheet)}"
      x="${box.x - i * box.w}" y="${box.y}" width="${box.w * n}" height="${box.h}"
      preserveAspectRatio="none"/></g>`
}

/**
 * 电动机整机（机身 + 可选线圈/换向器某一帧）
 * @param {object} o
 * @param {'mt_body.png'|'mt_body_rev.png'} o.body 机身贴图（对调磁极时用反像）
 * @param {number|null} o.coilFrame 线圈帧号（null = 不画线圈）
 * @param {number|null} o.ringFrame 换向器帧号（null = 不画）
 * @param {string} o.cid clipPath id（同一页面多台机器不能重名）
 * @param {number} [o.scale] 卡片缩放（缺省 0.5）
 */
export function motorNBSVG({ body = 'mt_body.png', coilFrame = 0, ringFrame = 0, cid = 'nbm', scale = MOTOR_NB.s }) {
  const m = MOTOR_NB
  const w = m.aw * scale, h = m.ah * scale
  const clip = []
  if (coilFrame != null) clip.push(`<clipPath id="${cid}c"><rect x="${m.coil.x}" y="${m.coil.y}" width="${m.coil.w}" height="${m.coil.h}"/></clipPath>`)
  if (ringFrame != null) clip.push(`<clipPath id="${cid}r"><rect x="${m.ring.x}" y="${m.ring.y}" width="${m.ring.w}" height="${m.ring.h}"/></clipPath>`)
  return `
    <svg width="${w}" height="${h}" viewBox="0 0 ${m.aw} ${m.ah}" style="display:block">
      ${clip.length ? `<defs>${clip.join('')}</defs>` : ''}
      <image href="${motorURL(body)}" x="0" y="0" width="${m.aw}" height="${m.ah}" preserveAspectRatio="none"/>
      ${coilFrame == null ? '' : motorFrameImg('mt_coil_sheet.png', m.coil, coilFrame, `${cid}c`, m.coil.n)}
      ${ringFrame == null ? '' : motorFrameImg('mt_ring_sheet.png', m.ring, ringFrame, `${cid}r`, m.ring.n)}
    </svg>`
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
      /* 渐变 id 按实例加后缀：同一页面里同时有器材栏缩略图 + 桌面卡片 + 演示页时，
         固定 id（swi-bt 等）会互相撞名 —— 撞名后 refs 落到被 display:none 藏起来的那一份上，
         整件器材就只剩线框（没有金属渐变）。这里把 id 与 url(#…) 一次性改成实例专属。 */
      const sfx = `sw${String(c.id || 'x').replace(/[^a-zA-Z0-9]/g, '')}`
      const html = `
    <svg width="176" height="110" viewBox="0 0 176 110">
      ${fitInner(176, 100, 176, 110, INNER.switch())}
      ${switchBodySVG()}
      ${bladeSVG(open)}
      ${switchKnobsSVG()}
    </svg>`
      return html
        .replace(/id="swi-/g, `id="${sfx}-swi-`)
        .replace(/url\(#swi-/g, `url(#${sfx}-swi-`)
    },
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

  /* ── 小电动机（2026-11-22 第 11 版 = 照 NB"电动机原理"的代码重做转子）
      NB 物理实验装在 D:\NB物理实验（Electron + 本地 Egg 服务 + nbData 加密缓存）。
      它的"电动机原理"（nobook.db → experiments id 252，教材/知识点节点同名）是**组件拼装**的：
        · 组件库 modules 里"小电机" = definitionName "ElecMotors"，is3d:true，model3dName "ElecMotors"；
        · 组件类落 module 75740 / 65272（原件已导出到 audit/nb_motor/ElecMotors_module.js），
          转动的全部逻辑就这一行：
              _lunHandle(){ const t = this.curPower/this._maxV*this._maxAngle;
                            this.luna.rotation += t;  this.lunb.rotation = this.luna.rotation }
          —— luna（线圈）与 lunb（换向器）**共用同一个 rotation**，是同一个刚体；
             磁极 magnet 只按极性 gotoAndStop(0/1)、电刷只换极性，都不转；
             _maxAngle = toHu(30)、_maxV = 6，所以转速 ∝ 电功率；
             电气模型：ratedV 2.5/3/6/12V、ratedP 1.5W、ratedI 0.5A、内阻 1/2/5/10Ω，
             |I·R| > 0.6V 起转、< 0.5V 停、> 1.2·ratedV 烧毁（setWorkElec）。
      第 11 版据此改三件事：
        ① 转子做成**一个刚体**：线圈 + 两条引线 + 换向器全包在同一组 <g data-rotor> 里，
           只挂**一个** animateTransform —— 绕竖直轴旋转的正交投影就是水平 scale
           （1 → 0 → -1 → 0 → 1）；半个周期里红蓝两片半环随整机翻面，电刷下始终一红一蓝，
           这就是换向器在换向（不是两套动画各自转）；
        ② 线圈加宽（半宽 27/33 → 32/38、颈口 6.5 → 12.6），两条引线跟着拉开到 x = 88.8 / 114.0，
           从线圈框底口直接落进两片铜片（y = 148，锡珠点住）—— 换向器与线圈就是同一根导线；
        ③ 俯视做实：腔体填深灰（和标杆图一样"挖穿见底"）、极靴顶面由 13px 梯形收成 6px 薄盖板、
           换向器去掉 ivory 轴套（标杆图环心本来就是空的）。
      坐标契约不变：w/h = 200×212，terminals (71.6,171)/(128.7,171)，整机 0.95 竖向压缩（y' = 0.95y + 8.55）。 ── */
  motor: {
    label: '小电动机', w: 200, h: 212,
    /* 供场景转子层调用：同一份转子几何 */
    rotorBody: motorRotorBody,
    brushBody: motorBrushBody,
    terminals: [
      { id: 'a', label: '1', name: '接线柱 1', x: 71.6, y: 171 },
      { id: 'b', label: '2', name: '接线柱 2', x: 128.7, y: 171 },
    ],
    render(c, dyn = {}) {
      const I = dyn.I || 0
      const on = Math.abs(I) > 0.005
      const dir = dyn.dir || 1
      const cid = `esmm${c.id}`
      /* 转子的转动交给场景转子层（ElectricSvgLabScene 的 MotorRotors）：器材料字符串每 250ms
         重建，这里挂动画只会被反复冻回起始帧。卡片只在"未通电 / 导出预览"时画静态转子。 */
      return `
    <svg width="200" height="212" viewBox="0 0 200 212">
      <defs>
        <mask id="${cid}m">
          <rect x="0" y="0" width="200" height="212" fill="#fff"/>
          <!-- 磁腔：上极点 y=27 不动、左右 ±51 不动；只把下半收短（底 137→128），
               让它和极间缝竖壁（86/117）在 y≈125.6 相交，磁铁底部于是有一个"台阶" -->
          <ellipse cx="101.4" cy="77.5" rx="51" ry="50.5" fill="#000"/>
          <rect x="86" y="0" width="31" height="212" fill="#000"/>
        </mask>
        <!-- 只保留"磁铁块"的矩形范围：给孔口倒角带收口用，倒角带不许拖到磁铁下缘以外 -->
        <mask id="${cid}pm">
          <rect x="0" y="0" width="200" height="212" fill="#000"/>
          <rect x="12" y="15" width="74" height="117" fill="#fff"/>
          <rect x="117" y="15" width="73" height="117" fill="#fff"/>
        </mask>
        <clipPath id="${cid}body">
          <rect x="12" y="15" width="74" height="117"/>
          <rect x="117" y="15" width="73" height="117"/>
          <ellipse cx="101.4" cy="77.5" rx="51" ry="50.5"/>
        </clipPath>
        <!-- 板正面：上沿直角（与顶面共边）、下沿 r8；内缘是一条直边（极间缝 31），
             换向器（外径 24）、电刷、立柱全都收在这条缝里，谁也不压磁极 -->
        <clipPath id="${cid}pr"><path d="M12,15 L83,15 Q86,15 86,18 L86,124 A8,8 0 0 1 78,132 L20,132 A8,8 0 0 1 12,124 Z"/></clipPath>
        <clipPath id="${cid}pb"><path d="M190,15 L120,15 Q117,15 117,18 L117,124 A8,8 0 0 1 125,132 L182,132 A8,8 0 0 1 190,124 Z"/></clipPath>
        <clipPath id="${cid}bpl"><path d="M58,178 L145,178 L145,187.2 A3.8,3.8 0 0 1 141.2,191 L61.8,191 A3.8,3.8 0 0 1 58,187.2 Z"/></clipPath>
        <clipPath id="${cid}bore"><ellipse cx="101.4" cy="77.5" rx="51" ry="50.5"/></clipPath>
        <linearGradient id="${cid}red" gradientUnits="userSpaceOnUse" x1="0" y1="15" x2="0" y2="132">
          <stop offset="0%" stop-color="#fb3d4b"/>
          <stop offset="14%" stop-color="#f4444f"/>
          <stop offset="62%" stop-color="#e63844"/>
          <stop offset="100%" stop-color="#c8303b"/>
        </linearGradient>
        <linearGradient id="${cid}blue" gradientUnits="userSpaceOnUse" x1="0" y1="15" x2="0" y2="132">
          <stop offset="0%" stop-color="#2a93e8"/>
          <stop offset="14%" stop-color="#268ce2"/>
          <stop offset="62%" stop-color="#2381cf"/>
          <stop offset="100%" stop-color="#1a66a8"/>
        </linearGradient>
        <!-- 腔体：挖穿见底（深灰），跟标杆图一致 -->
        <radialGradient id="${cid}cav" gradientUnits="userSpaceOnUse" cx="101.4" cy="64" r="116">
          <stop offset="0%" stop-color="#41474f"/>
          <stop offset="58%" stop-color="#3a4048"/>
          <stop offset="100%" stop-color="#333941"/>
        </radialGradient>
        <linearGradient id="${cid}gap" gradientUnits="userSpaceOnUse" x1="0" y1="3" x2="0" y2="171">
          <stop offset="0%" stop-color="#4a515a"/>
          <stop offset="22%" stop-color="#3d434b"/>
          <stop offset="100%" stop-color="#2f353d"/>
        </linearGradient>
        <radialGradient id="${cid}boreIn" gradientUnits="userSpaceOnUse" cx="101.4" cy="77.5" r="51">          <stop offset="76%" stop-color="rgba(20,26,36,0)"/>
          <stop offset="92%" stop-color="rgba(20,26,36,.07)"/>
          <stop offset="100%" stop-color="rgba(16,20,30,.34)"/>
        </radialGradient>
        <linearGradient id="${cid}boreDir" gradientUnits="userSpaceOnUse" x1="0" y1="27" x2="0" y2="128">
          <stop offset="0%" stop-color="rgba(20,26,36,.30)"/>
          <stop offset="26%" stop-color="rgba(20,26,36,0)"/>
          <stop offset="62%" stop-color="rgba(20,26,36,0)"/>
          <stop offset="88%" stop-color="rgba(255,255,255,.30)"/>
        </linearGradient>
        <!-- 孔口倒角：极靴切面的受光带（板色的浅色版），顶部厚度 0、越往下越厚 -->
        <linearGradient id="${cid}bevR" gradientUnits="userSpaceOnUse" x1="0" y1="27" x2="0" y2="140">
          <stop offset="0%" stop-color="#ff7d84"/>
          <stop offset="52%" stop-color="#ff6a72"/>
          <stop offset="100%" stop-color="#ff9aa1"/>
        </linearGradient>
        <linearGradient id="${cid}bevB" gradientUnits="userSpaceOnUse" x1="0" y1="27" x2="0" y2="140">
          <stop offset="0%" stop-color="#79cbf9"/>
          <stop offset="52%" stop-color="#4fb1ef"/>
          <stop offset="100%" stop-color="#a2dafa"/>
        </linearGradient>
        <radialGradient id="${cid}colR" gradientUnits="userSpaceOnUse" cx="101.4" cy="82" r="56">
          <stop offset="88%" stop-color="#7e1b23"/>
          <stop offset="97%" stop-color="#bd3944"/>
          <stop offset="100%" stop-color="#e4484f"/>
        </radialGradient>
        <radialGradient id="${cid}colB" gradientUnits="userSpaceOnUse" cx="101.4" cy="82" r="56">
          <stop offset="88%" stop-color="#0e3a5e"/>
          <stop offset="97%" stop-color="#1e6cab"/>
          <stop offset="100%" stop-color="#2a86cd"/>
        </radialGradient>
        <linearGradient id="${cid}sheen" x1="0" y1="0" x2="0.55" y2="1">
          <stop offset="0%" stop-color="rgba(255,255,255,.28)"/>
          <stop offset="48%" stop-color="rgba(255,255,255,.05)"/>
          <stop offset="100%" stop-color="rgba(0,0,0,.12)"/>
        </linearGradient>
        <linearGradient id="${cid}pl" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#edf2f6"/>
          <stop offset="34%" stop-color="#c4cdd6"/>
          <stop offset="100%" stop-color="#8793a0"/>
        </linearGradient>
        <linearGradient id="${cid}ringR" x1="0" y1="0" x2="0.7" y2="1">
          <stop offset="0%" stop-color="#f4575f"/>
          <stop offset="55%" stop-color="#e0424e"/>
          <stop offset="100%" stop-color="#b52c37"/>
        </linearGradient>
        <linearGradient id="${cid}ringB" x1="0" y1="0" x2="0.7" y2="1">
          <stop offset="0%" stop-color="#57b4f2"/>
          <stop offset="55%" stop-color="#2e9ae8"/>
          <stop offset="100%" stop-color="#1b6fb2"/>
        </linearGradient>
        <!-- 略俯视：底座顶面（放接线柱） -->
        <linearGradient id="${cid}topP" gradientUnits="userSpaceOnUse" x1="0" y1="172" x2="0" y2="178">
          <stop offset="0%" stop-color="#fbfdfe"/>
          <stop offset="100%" stop-color="#dfe6ec"/>
        </linearGradient>
        <linearGradient id="${cid}topR" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#ff8a90"/>
          <stop offset="55%" stop-color="#fb6069"/>
          <stop offset="100%" stop-color="#f24954"/>
        </linearGradient>
        <linearGradient id="${cid}topB" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#8ecdf7"/>
          <stop offset="55%" stop-color="#57b0ef"/>
          <stop offset="100%" stop-color="#3b95df"/>
        </linearGradient>
        <filter id="${cid}sh" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="5.5"/></filter>
        <filter id="${cid}sh2" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.2"/></filter>
      </defs>

      <ellipse cx="101" cy="189" rx="76" ry="10" fill="rgba(22,28,36,.26)" filter="url(#${cid}sh)"/>

      <!-- 整体 0.95 竖向压缩：等价于镜头抬高 ~18°，接线柱锚点 (y=171) 不动 -->
      <g transform="translate(0 171) scale(1 .95) translate(0 -171)">

      <!-- 极间与腔体都是空的：不刷任何底色，直接透出场景底色（"黑的是背景，应该透"） -->

      <!-- 左板（N）：略俯视 —— 6px 薄顶盖（后沿右错、只露一道薄面）+ 正面
           （描边一律用"深红"而不是黑线；底面是看不见的，所以底板下沿不再画厚带，只留一道贴地接触线） -->
      <g mask="url(#${cid}m)">
        <path d="M 12.4 15 L 84 15 Q 86 15 86 13 L 86 5.4 Q 86 3.2 83.8 3.2 L 13.8 3.2 Q 12.4 3.2 12.4 4.6 Z"
          fill="url(#${cid}topR)"/>
        <path d="M 12.4 4.6 Q 12.4 3.2 13.8 3.2 L 83.8 3.2 Q 86 3.2 86 5.4 L 86 13 Q 86 15 84 15 L 12.4 15"
          fill="none" stroke="rgba(126,12,22,.55)" stroke-width="1.3"/>
        <path d="M 12.4 15 L 86 15" stroke="rgba(126,12,22,.40)" stroke-width="1"/>
        <g clip-path="url(#${cid}pr)">
          <rect class="casing" x="12" y="15" width="74" height="117" fill="url(#${cid}red)"/>

          <rect x="12" y="15" width="3.4" height="125" fill="rgba(90,0,8,.26)"/>
          <rect x="12" y="14.9" width="74" height="1.7" fill="rgba(96,4,14,.44)"/>
          <rect x="12" y="15" width="74" height="117" fill="url(#${cid}sheen)"/>
          <rect x="12" y="131" width="74" height="1.2" fill="rgba(112,10,20,.55)"/>
          <rect x="12" y="15" width="74" height="117" fill="none" stroke="rgba(255,255,255,.20)" stroke-width="1"/>
          <rect x="12" y="15.6" width="74" height="116.8" fill="none" stroke="rgba(128,14,24,.26)" stroke-width="1.1"/>
        </g>
      </g>

      <!-- 右板（S）：同构，顶盖后沿同样右错 -->
      <g mask="url(#${cid}m)">
        <path d="M 190.4 15 L 119 15 Q 117 15 117 13 L 117 5.4 Q 117 3.2 119.2 3.2 L 189 3.2 Q 190.4 3.2 190.4 4.6 Z"
          fill="url(#${cid}topB)"/>
        <path d="M 190.4 4.6 Q 190.4 3.2 189 3.2 L 119.2 3.2 Q 117 3.2 117 5.4 L 117 13 Q 117 15 119 15 L 190.4 15"
          fill="none" stroke="rgba(8,42,80,.55)" stroke-width="1.3"/>
        <path d="M 117 15 L 190.4 15" stroke="rgba(8,42,80,.40)" stroke-width="1"/>
        <g clip-path="url(#${cid}pb)">
          <rect class="casing" x="117" y="15" width="73" height="117" fill="url(#${cid}blue)"/>

          <rect x="186.6" y="15" width="3.4" height="125" fill="rgba(0,18,40,.28)"/>
          <rect x="117" y="14.9" width="73" height="1.7" fill="rgba(6,34,66,.46)"/>
          <rect x="117" y="15" width="73" height="117" fill="url(#${cid}sheen)"/>
          <rect x="117" y="131" width="73" height="1.2" fill="rgba(6,34,66,.55)"/>
          <rect x="117" y="15" width="73" height="117" fill="none" stroke="rgba(255,255,255,.20)" stroke-width="1"/>
          <rect x="117" y="15.6" width="73" height="116.8" fill="none" stroke="rgba(10,42,80,.26)" stroke-width="1.1"/>
        </g>
      </g>      <!-- 孔口倒角（"略俯视"的骨架）：两条弧在顶部 (101.4,24) 并成一条线（厚度 0），
           往下逐渐分开、到底部最厚 5px —— 这条就是极靴切面的受光带（板色浅色版 + 两侧深线）。
           深线用"深红/深蓝"而不是黑：红线跟着红板、蓝线跟着蓝板 -->
      <g mask="url(#${cid}m)"><g mask="url(#${cid}pm)">
        <path d="M 101.4 27 A 56.5 56.5 0 0 0 101.4 140 L 101.4 128 A 51 50.5 0 0 1 101.4 27 Z"
          fill="url(#${cid}bevR)"/>
        <path d="M 101.4 27 A 56.5 56.5 0 0 1 101.4 140 L 101.4 128 A 51 50.5 0 0 0 101.4 27 Z"
          fill="url(#${cid}bevB)"/>
        <path d="M 101.4 27 A 56.5 56.5 0 0 0 101.4 140" fill="none" stroke="rgba(122,14,24,.48)" stroke-width="1.6"/>
        <path d="M 101.4 27 A 56.5 56.5 0 0 1 101.4 140" fill="none" stroke="rgba(8,40,76,.48)" stroke-width="1.6"/>
        <path d="M 101.4 27 A 51 50.5 0 0 0 101.4 128" fill="none" stroke="rgba(122,14,24,.48)" stroke-width="1.6"/>
        <path d="M 101.4 27 A 51 50.5 0 0 1 101.4 128" fill="none" stroke="rgba(8,40,76,.48)" stroke-width="1.6"/>
        <path d="M 101.4 28 A 50.2 49.6 0 0 0 101.4 126" fill="none" stroke="rgba(255,255,255,.34)" stroke-width="1"/>
        <path d="M 101.4 28 A 50.2 49.6 0 0 1 101.4 126" fill="none" stroke="rgba(255,255,255,.34)" stroke-width="1"/>
      </g></g>

      <!-- 板底投在面板上的软阴影（磁铁块比底座短：底下照标杆"看不到下表面"处理，只留一道贴身淡影） -->
      <ellipse cx="48" cy="133.5" rx="36" ry="4.2" fill="rgba(24,32,44,.16)" filter="url(#${cid}sh)"/>
      <ellipse cx="154" cy="133.5" rx="36" ry="4.2" fill="rgba(24,32,44,.16)" filter="url(#${cid}sh)"/>

      <text x="25.4" y="84" fontSize="21" fontWeight="700" fill="#fff" textAnchor="middle"
        stroke="rgba(96,0,8,.32)" strokeWidth="1" paintOrder="stroke">N</text>
      <text x="179" y="84" fontSize="21" fontWeight="700" fill="#fff" textAnchor="middle"
        stroke="rgba(0,34,84,.32)" strokeWidth="1" paintOrder="stroke">S</text>

      <!-- 电刷支架（支撑柱）：**在换向器后面**、靠环内侧（x=90.4 / 109.4，藏在 r=12 的环后面）。
           磁铁块下缘抬到 140 之后，柱子只露出环顶上方一小截（139→141.5），其余被铜片盖住，与标杆一致 -->
      <rect x="90.4" y="151" width="3" height="26.6" rx="1.2" fill="#e6edf3"/>
      <rect x="92.3" y="151" width="1.1" height="26.6" fill="rgba(84,100,118,.38)"/>
      <rect x="90.4" y="151" width="1.1" height="26.6" fill="rgba(255,255,255,.55)"/>
      <rect x="109.4" y="151" width="3" height="26.6" rx="1.2" fill="#e6edf3"/>
      <rect x="109.4" y="151" width="1.1" height="26.6" fill="rgba(255,255,255,.55)"/>
      <rect x="111.3" y="151" width="1.1" height="26.6" fill="rgba(84,100,118,.38)"/>

      <!-- ══ 转子：线圈 + 两条引线 + 换向器（同一个刚体；通电时由场景转子层每帧画） ══ -->
      ${dyn.hideRotor ? '' : `<g>${motorRotorBody(cid, 0)}</g>`}

      <!-- 电刷（碳块）：**不转**，内缘咬进环 0.4px，压在环外沿上
           （通电时由转子层画在转子之后 = 碳块在环前面，卡片这里让开） -->
      ${dyn.hideRotor ? '' : motorBrushBody()}

      <!-- 底座：略俯视 —— 顶面（接线柱坐在上面）+ 正面 -->
      <ellipse cx="101.4" cy="193" rx="46" ry="4.4" fill="rgba(24,32,44,.20)" filter="url(#${cid}sh2)"/>
      <path d="M 58 178 L 145 178 L 145 172 L 64 172 Z" fill="url(#${cid}topP)"/>
      <path d="M 64 172 L 145 172" stroke="rgba(118,132,148,.60)" stroke-width="1"/>
      <path d="M 58 178 L 145 178 L 145 187.2 A 3.8 3.8 0 0 1 141.2 191 L 61.8 191 A 3.8 3.8 0 0 1 58 187.2 Z"
        fill="url(#${cid}pl)"/>
      <path d="M 58 178 L 145 178" stroke="rgba(255,255,255,.85)" stroke-width="1.2"/>
      <rect x="58" y="186.4" width="87" height="4.6" fill="#7b8794" clip-path="url(#${cid}bpl)"/>
      <path d="M 58 178 L 145 178 L 145 187.2 A 3.8 3.8 0 0 1 141.2 191 L 61.8 191 A 3.8 3.8 0 0 1 58 187.2 Z"
        fill="none" stroke="rgba(64,76,90,.30)" stroke-width="1"/>

      <!-- 接线柱：圆柱形转帽（俯视能看到顶面椭圆），柱子落在底座顶沿 -->
      <rect x="66.6" y="170" width="10" height="11" rx="4.6" fill="#1d2126"/>
      <ellipse cx="71.6" cy="170.9" rx="4.7" ry="2.4" fill="#3c444c"/>
      <rect x="66.6" y="174.6" width="10" height="1.2" fill="rgba(255,255,255,.10)"/>
      <rect x="123.7" y="170" width="10" height="11" rx="4.6" fill="#c62f37"/>
      <ellipse cx="128.7" cy="170.9" rx="4.7" ry="2.4" fill="#e4666d"/>
      <rect x="123.7" y="174.6" width="10" height="1.2" fill="rgba(255,255,255,.16)"/>

      </g>

      ${on ? noteChipSVG(100, 202, `I = ${Math.abs(I).toFixed(2)} A`, '#4ade80', 96) : noteChipSVG(100, 202, '未通电 · 转子不转', '#94a3b8', 104)}
      ${on ? motorSpinBadgeSVG(176, 116, dir) : ''}
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

  /* ── 手摇发电机（NB electrical/HandGenerator 的原厂分层贴图拼的整机）──
   * 卡 310×266：机身 310×261 —— hg_body_ac.png / hg_body_dc.png 已经把木底座、环形护圈、
   * 极靴、中心轴、接线柱合成好了；飞轮（hg_crank.png 210×210）和转子线圈（hg_coil.png 83×52）
   * 交给场景的 HandCrankLayer 每帧真转，所以卡片这里只在缩略图里静态画一份（dyn.hideCrank 时让开）。
   * 几何按 0.6237 从机身坐标换算：飞轮轴心 (145,138.5)、线圈轴心 (365.35,300)（转速是飞轮 2 倍）、
   * 黑柱 (272,366)、红柱 (452,361)。交流款用左右分体柱，直流款用合并柱块。 */
  handGenerator: {
    label: '手摇发电机', w: 310, h: 266, meter: true, alwaysRead: true,
    terminals: [
      { id: 'a', label: '−', name: '黑柱（负）', x: 169.6, y: 228.2 },
      { id: 'b', label: '+', name: '红柱（正）', x: 281.9, y: 225.2 },
    ],
    crank: HG_CRANK,
    render(c, dyn = {}) {
      return handGenSVG('hg_body_ac.png', !!dyn.hideCrank)
    },
  },

  /* ── 手摇发电机（直流款：同一台机器换向器整流，机身换成合并接线柱块） ── */
  handGeneratorDC: {
    label: '手摇发电机（直流）', w: 310, h: 266, meter: true, alwaysRead: true,
    terminals: [
      { id: 'a', label: '−', name: '黑柱（负）', x: 169.6, y: 228.2 },
      { id: 'b', label: '+', name: '红柱（正）', x: 281.9, y: 225.2 },
    ],
    crank: HG_CRANK,
    render(c, dyn = {}) {
      return handGenSVG('hg_body_dc.png', !!dyn.hideCrank)
    },
  },

  /* ── 电动机（NB 252「电动机原理」的整机，见上方 MOTOR_NB 说明）──
   * 卡片 229×222（0.5 版）；线圈/换向器的转动由 <MotorNBSpinLayer> 叠层每帧换帧号，
   * 卡片在 dyn.motorLayer 时只画机身（否则静态第 1 帧会和运动层叠成双影）。 */
  motorNB: {
    label: '电动机', w: 229, h: 222, meter: true,
    terminals: [
      { id: 'a', label: '−', name: '黑柱（负）', x: 77.5, y: 203 },
      { id: 'b', label: '+', name: '红柱（正）', x: 148, y: 203 },
    ],
    render(c, dyn = {}) {
      const cid = `esnb${c.id}`
      const still = !dyn.motorLayer
      /* 「内部结构（透视）」：这台机器的内部本来就在明处，只加三条带引线的标注 */
      const labels = dyn.dissect ? `
        <g font-family="Microsoft YaHei, sans-serif" font-size="20" font-weight="700"
           fill="#B45309" stroke="#FFFBEB" stroke-width="4" paint-order="stroke">
          <path d="M318 96 H352" stroke="#B45309" stroke-width="3" fill="none"/>
          <text x="358" y="103">线圈（转子）</text>
          <path d="M262 330 H300" stroke="#B45309" stroke-width="3" fill="none"/>
          <text x="306" y="337">换向器 · 电刷</text>
          <path d="M176 420 H150" stroke="#B45309" stroke-width="3" fill="none"/>
          <text x="30" y="427">接线柱</text>
        </g>` : ''
      return motorNBSVG({
        body: dyn.swapMag ? 'mt_body_rev.png' : 'mt_body.png',
        coilFrame: still ? 0 : null,
        ringFrame: still ? 0 : null,
        cid,
      }).replace('</svg>', `${labels}</svg>`)
    },
  },

  /* ── 家用交流电（三孔插座：用户给的面板图标，L / N 两柱接进家庭电路） ── */
  /* ── 交流电源（教材符号：一个圆 + 圆内**一个周期**正弦 + 圆外三根引线朝右，L / N / E 三柱）──
   * 用户口径：正弦只画一个周期；三根线从圆右侧引出去（不是朝下），线色红（相线）、蓝（零线）、黑（接地）；
   * 三根线是**能拉长的**：拖线头可以把线拉长、拉歪，导线也能接在线上任意一点（见 BuilderSVG 的 AC_LEAD/leadHit）。
   * 线头位置存在 comp.lead = { l:[x,y], n:[x,y], e:[x,y] }（器材本地坐标），默认落在 x152。 */
  acSource: {
    label: '交流电源', w: 200, h: 168,
    terminals: [
      { id: 'l', label: 'L', name: '相线（L，红）', x: 152, y: 48 },
      { id: 'n', label: 'N', name: '零线（N，蓝）', x: 152, y: 74 },
      { id: 'e', label: 'E', name: '接地（E，黑）', x: 152, y: 100 },
    ],
    render(c, dyn = {}) {
      const I = Math.abs(Number(dyn.I) || 0)
      const on = I > 1e-3
      /* 圆内正弦：**一个整周期**，幅度 13，横向占圆周 60%（左右各留 1/5 给圆周） */
      let d = ''
      for (let i = 0; i <= 40; i++) {
        const t = i / 40
        const x = 34 + 48 * t
        const y = 74 - Math.sin(t * Math.PI * 2) * 13
        d += (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1) + ' '
      }
      /* 三根引线的线头位置（拉长后就是 c.lead 里的值）；线从圆周上那个点引出来，
         线头画成一小段"露铜 + 彩色护套"，拖它就是拉线 */
      const leadHead = (key) => {
        const g = AC_LEAD[key]
        const e = (c && c.lead && c.lead[key]) || [g.ex, g.ey]
        return { g, x: e[0], y: e[1] }
      }
      const leadSVG = (key, label) => {
        const { g, x, y } = leadHead(key)
        const lx = Math.max(4, Math.min(196, x))
        const ly = Math.max(6, Math.min(162, y))
        return `
          <line x1="${g.x0}" y1="${g.y0}" x2="${lx}" y2="${ly}" stroke="${g.color}" stroke-width="3"
            stroke-linecap="round"/>
          <circle cx="${lx}" cy="${ly}" r="3.6" fill="${g.color}" stroke="#ffffff" stroke-width="1.1"/>
          <circle cx="${lx}" cy="${ly}" r="1.5" fill="#ffffff" opacity=".85"/>
          <text x="${lx + 9}" y="${ly - 6}" font-size="8.5" font-weight="700" fill="#24292f"
            paint-order="stroke" stroke="#ffffff" stroke-width="2.2"
            font-family="system-ui,-apple-system,'Segoe UI',sans-serif">${label}</text>`
      }
      return `
    <svg width="200" height="168" viewBox="0 0 200 168">
      <defs>
        <radialGradient id="es-g-ac-face" cx="38%" cy="30%" r="72%">
          <stop offset="0%" stop-color="#ffffff"/><stop offset="68%" stop-color="#f3f7fb"/><stop offset="100%" stop-color="#dde6ee"/>
        </radialGradient>
      </defs>
      <g class="casing">
        <circle cx="58" cy="74" r="40" fill="url(#es-g-ac-face)" stroke="#b6c4d1" stroke-width="1.7"/>
        <circle cx="58" cy="74" r="37" fill="none" stroke="#ffffff" stroke-width="1" opacity=".9"/>
        <path d="${d}" stroke="${on ? '#c2410c' : '#7b8794'}" stroke-width="2.4" fill="none"/>
        <text x="58" y="130" text-anchor="middle" font-size="9" font-weight="700" fill="#5A4636"
          font-family="system-ui,-apple-system,'Segoe UI',sans-serif">220 V ~ 50 Hz</text>
        <text x="58" y="143" text-anchor="middle" font-size="7" fill="#475569"
          font-family="system-ui,-apple-system,'Segoe UI',sans-serif">红 相线 · 蓝 零线 · 黑 接地</text>
      </g>
      ${['l', 'n', 'e'].map((k) => leadSVG(k, { l: 'L', n: 'N', e: 'E' }[k])).join('')}
      ${noteChipSVG(100, 158, on ? `交流 · I = ${I.toFixed(2)} A` : '交流电源 · 待接线', on ? '#4ade80' : '#94a3b8', 120)}
    </svg>` }
  },

  /* ── 空气开关（双极小型断路器 C16，家庭电路里电能表后面那一个）──
   * 4 柱：左上相线进、右上零线进、左下相线出、右下零线出；
   * 引擎里是两条彼此独立的支路（合闸 0.001 Ω / 分闸 1e8 Ω），两路同时通断。
   * 单击本体（或双击）就合闸 / 分闸 —— 学生在 Tab2 里拉闸就能看到各支路同时灭。 */
  breaker: breakerType,

  /* ── 面板开关（墙上的翘板开关；面板面用用户给的实拍图，合 / 断两态各一张）
   * 用户口径：开关状态靠**明暗**表示 —— 合闸时翘板是近白色（亮），分闸时整块面板与翘板同时变暗（灰），
   * 不再用 ON/OFF 文字（文字版看着像"坏了"）。两张面 switch_on_face.png / switch_off_face.png 直接从
   * 用户给的按钮图标里裁出来（左=合、右=断）；接线柱 1、2 仍在面板下沿。 */
  wallSwitch: {
    label: '面板开关', w: 100, h: 156,
    terminals: [
      { id: 'a', label: '1', name: '接线柱 1', x: 30, y: 18 },
      { id: 'b', label: '2', name: '接线柱 2', x: 70, y: 18 },
    ],
    render(c) {
      const on = !!c.closed
      return `
    <svg width="100" height="156" viewBox="0 0 100 156">
      <g class="casing">
        <!-- 面板上方两根线头 + 接线热点（与插座同一套做法） -->
        <path d="M30 48 L30 24" stroke="#e53935" stroke-width="2.8" stroke-linecap="round" fill="none"/>
        <path d="M70 48 L70 24" stroke="#111827" stroke-width="2.8" stroke-linecap="round" fill="none"/>
        <image href="${figURL(on ? 'switch_on_face.png' : 'switch_off_face.png')}"
          x="4" y="46" width="92" height="100" preserveAspectRatio="none"/>
      </g>
      ${termDotSVG(30, 18, false, '', 'red')}
      ${termDotSVG(70, 18, true, '', 'black')}
      <text x="30" y="11" text-anchor="middle" font-size="8.5" font-weight="700" fill="#24292f"
        font-family="system-ui,-apple-system,'Segoe UI',sans-serif">1</text>
      <text x="70" y="11" text-anchor="middle" font-size="8.5" font-weight="700" fill="#24292f"
        font-family="system-ui,-apple-system,'Segoe UI',sans-serif">2</text>
    </svg>` }
  },

  /* ── 两孔插座：三个接线端（L / N）按家用习惯放在**面板上方**，
   *    线头从面板上沿引上来，末端才是接线热点；家电把插脚往孔里一插就自动并联 ── */
  socket2: {
    label: '两孔插座', w: 96, h: 118,
    terminals: [
      { id: 'l', label: 'L', name: '火线（L，红）', x: 24, y: 18 },
      { id: 'n', label: 'N', name: '零线（N，蓝）', x: 72, y: 18 },
    ],
    render() {
      return `
    <svg width="96" height="118" viewBox="0 0 96 118">
      <g class="casing">
        <!-- 上方两根线头：红 L、蓝 N（面板上沿 34 引到柱帽 24） -->
        <path d="M36 36 L36 24" stroke="#e53935" stroke-width="2.8" stroke-linecap="round" fill="none"/>
        <path d="M58 36 L58 24" stroke="#2f6fdc" stroke-width="2.8" stroke-linecap="round" fill="none"/>
        <!-- 面板直接用用户给的两孔插座图标（用户 2026-11-17 口径：以产品图标为准，不自己画） -->
        <image href="${figURL('socket2_face.png')}" x="9" y="34" width="78" height="78"
          preserveAspectRatio="none" style="filter:drop-shadow(0 1.6px 2.4px rgba(15,23,42,.28))"/>
      </g>
      ${termDotSVG(36, 18, false, '', 'red')}
      ${termDotSVG(58, 18, true, '', 'blue')}
      <text x="36" y="11" text-anchor="middle" font-size="8.5" font-weight="700" fill="#24292f"
        font-family="system-ui,-apple-system,'Segoe UI',sans-serif">L</text>
      <text x="58" y="11" text-anchor="middle" font-size="8.5" font-weight="700" fill="#24292f"
        font-family="system-ui,-apple-system,'Segoe UI',sans-serif">N</text>
    </svg>` }
  },

  /* ── 三孔插座（面板同样是用户给的三孔图标；L / E / N 三个线头引到**面板上方**，
   *    线头长度按用户口径拉长到 3 倍（12 → 36 px），末端即接线热点）── */
  socket3: {
    label: '三孔插座', w: 104, h: 152,
    terminals: [
      { id: 'l', label: 'L', name: '火线（L，红）', x: 30, y: 18 },
      { id: 'e', label: 'E', name: '接地（E，黑）', x: 52, y: 18 },
      { id: 'n', label: 'N', name: '零线（N，蓝）', x: 74, y: 18 },
    ],
    render() {
      return `
    <svg width="104" height="152" viewBox="0 0 104 152">
      <g class="casing">
        <!-- 上方三根线头（长 36 px）：红 L、黑 E、蓝 N -->
        <path d="M30 60 L30 24" stroke="#e53935" stroke-width="2.8" stroke-linecap="round" fill="none"/>
        <path d="M52 60 L52 24" stroke="#111827" stroke-width="2.8" stroke-linecap="round" fill="none"/>
        <path d="M74 60 L74 24" stroke="#2f6fdc" stroke-width="2.8" stroke-linecap="round" fill="none"/>
        <!-- 面板用用户给的三孔插座图标：上竖孔(E) + 下方两斜孔(L/N) -->
        <image href="${figURL('socket3_face.png')}" x="8" y="60" width="88" height="88"
          preserveAspectRatio="none" style="filter:drop-shadow(0 1.6px 2.4px rgba(15,23,42,.28))"/>
      </g>
      ${termDotSVG(30, 18, false, '', 'red')}
      ${termDotSVG(52, 18, true, '', 'black')}
      ${termDotSVG(74, 18, true, '', 'blue')}
      <text x="30" y="11" text-anchor="middle" font-size="8.5" font-weight="700" fill="#24292f"
        font-family="system-ui,-apple-system,'Segoe UI',sans-serif">L</text>
      <text x="52" y="11" text-anchor="middle" font-size="8.5" font-weight="700" fill="#24292f"
        font-family="system-ui,-apple-system,'Segoe UI',sans-serif">E</text>
      <text x="74" y="11" text-anchor="middle" font-size="8.5" font-weight="700" fill="#24292f"
        font-family="system-ui,-apple-system,'Segoe UI',sans-serif">N</text>
    </svg>` }
  },

  mains: {
    label: '家用交流电', w: 170, h: 156,
    terminals: [
      { id: 'n', label: 'N', name: '零线（N，蓝）', x: 52, y: 132 },
      { id: 'l', label: 'L', name: '火线（L，红）', x: 118, y: 132 },
    ],
    render() {
      return `
    <svg width="170" height="156" viewBox="0 0 170 156">
      ${fitInner(170, 156, 170, 156, INNER.mains())}
      <g class="casing">
        <rect x="6" y="1" width="158" height="16" rx="4" fill="#334155"/>
        <text x="85" y="13" text-anchor="middle" font-size="9.5" fill="#dbeafe"
          font-family="system-ui,-apple-system,'Segoe UI',sans-serif">家用交流电 · 三孔插座 220 V</text>
        <image href="${figURL('socket_face.png')}" x="32" y="21" width="106" height="106"
          preserveAspectRatio="xMidYMid meet"/>
        <rect x="30" y="124" width="110" height="14" rx="5" fill="#d8dee7" stroke="#a9b3c0" stroke-width="1.2"/>
      </g>
      ${termDotSVG(52, 132, true, 'N')}
      ${termDotSVG(118, 132, false, 'L')}
    </svg>` }
  },

  /* ── 家用电器（家庭电路里真正"用电"的器材，用户给的产品图标当器材面） ──
   * 为什么要单列：电池组只有 3 V，干路电流零点几安，电能表的转盘与计数器几乎不动，
   * 「转数法测电功」在 Tab2 里演不出来。换成家用交流电 220 V + 这两台电器，
   * I = P/U 才有 2.27 A / 6.82 A，配右上「走字倍速」才看得见转盘快慢与计数器跳字。
   * 两台都按 R = U²/P 定阻（洗衣机 500 W → 96.8 Ω，电热水壶 1500 W → 32.3 Ω）。 */
  /* 四台家电口径：R = U²/P（洗衣机 500 W → 96.8 Ω，电饭煲 800 W → 60.5 Ω，
   * 电热水壶 / 电暖器 1500 W → 32.3 Ω）。它们**不设接线柱热点**，插脚就是接头：
   * 把电器拖到插座孔上自动吸附并联，见 BuilderSVG 的 withPlug / PLUG_TYPES。 */
  washer: {
    label: '洗衣机', w: 150, h: 168, noTermUI: true,
    terminals: [
      { id: 'a', label: '1', name: '插脚 1（火线侧）', x: 65, y: 160 },
      { id: 'b', label: '2', name: '插脚 2（零线侧）', x: 85, y: 160 },
    ],
    render(c, dyn = {}) { return applianceSVG('washer', c, dyn) },
  },
  kettle: {
    label: '电热水壶', w: 150, h: 168, noTermUI: true,
    terminals: [
      { id: 'a', label: '1', name: '插脚 1（火线侧）', x: 65, y: 160 },
      { id: 'b', label: '2', name: '插脚 2（零线侧）', x: 85, y: 160 },
    ],
    render(c, dyn = {}) { return applianceSVG('kettle', c, dyn) },
  },
  riceCooker: {
    label: '电饭煲', w: 150, h: 168, noTermUI: true,
    terminals: [
      { id: 'a', label: '1', name: '插脚 1（火线侧）', x: 65, y: 160 },
      { id: 'b', label: '2', name: '插脚 2（零线侧）', x: 85, y: 160 },
    ],
    render(c, dyn = {}) { return applianceSVG('riceCooker', c, dyn) },
  },
  heater: {
    label: '电暖器', w: 150, h: 168, noTermUI: true,
    terminals: [
      { id: 'a', label: '1', name: '插脚 1（火线侧）', x: 65, y: 160 },
      { id: 'b', label: '2', name: '插脚 2（零线侧）', x: 85, y: 160 },
    ],
    render(c, dyn = {}) { return applianceSVG('heater', c, dyn) },
  },

  /* ── 单相电能表（器材面用用户给的实拍图标 meter_face.png，1/2/3/4 四柱照图标上的位置对位）
   * 图标自己印的是 2000 r/kWh，与本仿真「转数法」用的 600 r/kWh 口径不一致，
   * 所以计数器窗口和铭牌两行都用本工程的图层盖上去：窗口换成随 kwh 变化的六位数字，
   * 铭牌换成 220 V 10(40) A · 600 r/kWh 的贴纸（不盖的话学生会按 2000 去算转数）。 */
  energyMeter: {
    label: '电能表', w: 190, h: 190,
    meter: true,     // 双击弹读数条（W = … kW·h · I = … A）——BuilderSVG 只给 meter 类器材挂 readout
    tagsSVG: meterTermTagsSVG,   // 四柱接法标签：由 BuilderSVG 画在导线之上（.esb-taglayer）
    /* 四柱位置直接从图标上量（256 坐标里柱心 x = 62.5 / 104.5 / 146.5 / 188.5，间距 42，
       y ≈ 216.5；这张图标按 190×190 铺满，换算 ×190/256 = 46.4 / 77.6 / 108.7 / 139.9、y 160.7）。
       颜色也照图标：1、2 柱帽是红色，3、4 是灰黑色 —— 不能套项目里"右红左黑"的约定。 */
    terminals: [
      { id: 'i1', label: '1', name: '进线 1（相线）', x: 46.4, y: 160.7 },
      { id: 'i2', label: '2', name: '进线 2（零线）', x: 77.6, y: 160.7 },
      { id: 'o1', label: '3', name: '出线 3（相线）', x: 108.7, y: 160.7 },
      { id: 'o2', label: '4', name: '出线 4（零线）', x: 139.9, y: 160.7 },
    ],
    render(c, dyn = {}) {
      const kwh = Math.max(0, Number(dyn.kwh ?? c.kwh0 ?? 0))
      const I = Math.abs(Number(dyn.I) || 0)
      // 5 位整数 + 1 位小数（红色），与机械表同款
      const digits = String(Math.floor(kwh * 10) % 1000000).padStart(6, '0')
      const cells = digits.split('').map((d, i) => {
        const cx = 53.3 + i * 16.5
        const red = i === digits.length - 1
        return (red ? `<rect x="${cx - 7.5}" y="46.5" width="15" height="20" rx="2" fill="#7f1d1d" stroke="#b91c1c" stroke-width=".9"/>` : '')
          + `<text x="${cx}" y="62" text-anchor="middle" font-size="13" font-weight="700"
             font-family="ui-monospace,Consolas,monospace" fill="${red ? '#fecaca' : '#e7eef7'}">${d}</text>`
      }).join('')
      return `
    <svg width="190" height="190" viewBox="0 0 190 190">
      ${fitInner(190, 190, 190, 190, INNER.energyMeter())}
      <g class="casing">
        <image href="${figURL('meter_face.png')}" x="0" y="0" width="190" height="190"
          preserveAspectRatio="xMidYMid meet"/>
        <!-- 计数器窗口：盖掉图标里的静态 000000，换成随 kwh 变化的六位数字 -->
        <rect x="45" y="44" width="99" height="25" rx="3" fill="#0a0d12"/>
        ${cells}
        <!-- 铭牌贴纸：把图标印的 2000 r/kWh 换成 600 r/kWh，并显示实际电流 -->
        <rect x="46" y="86" width="99" height="36" rx="3" fill="#f8f8f5" stroke="#dddbd2" stroke-width="1"/>
        <text x="95.5" y="98" text-anchor="middle" font-size="7.5" fill="#3f3f46"
          font-family="system-ui,-apple-system,'Segoe UI',sans-serif">220 V 10(40) A · 600 r/kWh</text>
        <text x="95.5" y="110" text-anchor="middle" font-size="7.5" fill="${I > 0.005 ? '#b45309' : '#64748b'}"
          font-family="system-ui,-apple-system,'Segoe UI',sans-serif">${I > 0.005 ? `I = ${I.toFixed(2)} A · 铝盘转动中` : '无电流 · 铝盘不转'}</text>
      </g>
      ${noteChipSVG(95, 13, '串在干路 · 计总电功', '#fbbf24', 100)}
      ${termDotsSVG([
        { x: 46.4, y: 160.7, label: '1', dark: false, labelFill: '#e5e7eb' },
        { x: 77.6, y: 160.7, label: '2', dark: false, labelFill: '#e5e7eb' },
        { x: 108.7, y: 160.7, label: '3', dark: true, labelFill: '#e5e7eb' },
        { x: 139.9, y: 160.7, label: '4', dark: true, labelFill: '#e5e7eb' },
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

  /* ── 焦耳定律演示器（两支温度计 + A/B 两段发热电阻丝，4 个接线柱，可各自串进电路） ──
   * 造型取自成套教具（江苏省华茂科教「焦耳定律实验」那支）：黄色 ABS 立板中间开跑道形孔，
   * 两侧各插一支温度计（玻璃泡浸在发热电阻丝里），底板下沿四颗接线柱 A1/A2、B1/B2。
   * 通电后电阻丝红热、温度计红液柱上升（热量由 BuilderSVG 按 Q = P·t 积分后传进来）。 */
  jouleSet: {
    label: '焦耳定律演示器', w: 210, h: 150,
    terminals: [
      { id: 'a1', label: 'A1', name: 'A 组（5 Ω）接线柱 1', x: 52, y: 120 },
      { id: 'a2', label: 'A2', name: 'A 组（5 Ω）接线柱 2', x: 76, y: 120 },
      { id: 'b1', label: 'B1', name: 'B 组（10 Ω）接线柱 1', x: 134, y: 120 },
      { id: 'b2', label: 'B2', name: 'B 组（10 Ω）接线柱 2', x: 158, y: 120 },
    ],
    render(c, dyn = {}) {
      const tA = Number.isFinite(dyn.tempA) ? dyn.tempA : 20
      const tB = Number.isFinite(dyn.tempB) ? dyn.tempB : 20
      const hA = Math.max(0, Math.min(1, (tA - 20) / 75))
      const hB = Math.max(0, Math.min(1, (tB - 20) / 75))
      const fA = hA
      const fB = hB
      const coilColor = (h) => (h > 0.04 ? `rgba(214,64,32,${(0.42 + 0.58 * h).toFixed(2)})` : '#b87333')
      /* 一支温度计：白槽 + 玻璃管 + 刻度 + 红液柱 + 球泡（球泡上绕两圈发热电阻丝）
       * 温度计本身不放进 .casing —— 透视（X-ray）时外壳淡掉，正好露出里面的丝和液柱。 */
      const thermo = (x, frac, hot, tw) => `
        <rect x="${x - 7}" y="4" width="14" height="92" rx="7" fill="#fffdf6" opacity="0.92"/>
        <rect x="${x - 4.6}" y="6" width="9.2" height="86" rx="4.6" fill="#f7fbff" stroke="#b6c9d8" stroke-width="1"/>
        ${[0, 1, 2, 3, 4].map((i) => `<line x1="${x + 1.4}" y1="${16 + i * 14}" x2="${x + 4.4}" y2="${16 + i * 14}" stroke="#a9bccb" stroke-width="0.8"/>`).join('')}
        <rect x="${x - 1.7}" y="${(88 - frac * 66).toFixed(1)}" width="3.4" height="${Math.max(3, frac * 66).toFixed(1)}" rx="1.7" fill="#e53935"/>
        <circle cx="${x}" cy="93" r="5.6" fill="#e53935" stroke="#c62828" stroke-width="0.7"/>
        <ellipse cx="${x}" cy="89" rx="9.4" ry="3.4" fill="none" stroke="${coilColor(hot)}" stroke-width="1.9"/>
        <ellipse cx="${x}" cy="95" rx="9.4" ry="3.4" fill="none" stroke="${coilColor(hot)}" stroke-width="1.9"/>
        <text x="${x}" y="38" text-anchor="middle" font-size="7.4" font-weight="700"
              fill="${hot > 0.3 ? '#c2410c' : '#5b6470'}"
              font-family="ui-monospace,Consolas,monospace">${tw}℃</text>`
      return `
    <svg width="210" height="150" viewBox="0 0 210 150">
      <!-- 黄色 ABS 立板（中间跑道形孔）；外壳归入 .casing，透视时淡出 -->
      <g class="casing">
        <rect x="40" y="6" width="130" height="120" rx="10" fill="#F2C63D" stroke="#D3A22A" stroke-width="1.2"/>
        <rect x="40" y="6" width="130" height="9" rx="4.5" fill="#F8D96A" opacity=".75"/>
        <rect x="93" y="20" width="26" height="66" rx="13" fill="#e9edf2" stroke="#c8ad55" stroke-width="1"/>
        <rect x="16" y="124" width="178" height="18" rx="7" fill="#E8C25A" stroke="#C79A28" stroke-width="1.1"/>
        <rect x="16" y="124" width="178" height="7" rx="3.5" fill="#F7DA86" opacity=".9"/>
      </g>
      ${thermo(64, fA, hA, tA.toFixed(0))}
      ${thermo(146, fB, hB, tB.toFixed(0))}
      <!-- 球泡引线 → 两组接线柱 -->
      <path d="M59 97 L52 116" fill="none" stroke="#b87333" stroke-width="2"/>
      <path d="M69 97 L76 116" fill="none" stroke="#b87333" stroke-width="2"/>
      <path d="M141 97 L134 116" fill="none" stroke="#b87333" stroke-width="2"/>
      <path d="M151 97 L158 116" fill="none" stroke="#b87333" stroke-width="2"/>
      <!-- 组别（5Ω / 10Ω）标在球泡右边 -->
      <text x="78" y="91" font-size="8" font-weight="700" fill="#5b4636">5Ω</text>
      <text x="154" y="91" font-size="8" font-weight="700" fill="#5b4636">10Ω</text>
      ${termDotSVG(52, 120, true, 'A1')}
      ${termDotSVG(76, 120, false, 'A2')}
      ${termDotSVG(134, 120, true, 'B1')}
      ${termDotSVG(158, 120, false, 'B2')}
    </svg>` }
  },

  /* ── 电磁铁（线圈 + 可插拔软铁芯 + 吸起的大头针）──
   * 探究电磁铁的磁性专用器材：通电后线圈磁化铁芯，磁性强弱 ∝ 匝数 N × 电流 I，
   * 大头针被吸在磁极上，数量就是磁性强弱的"读数"（转换法）。
   * 双击器材可插拔铁芯（抽出后磁性骤减）。 */
  electromagnet: {
    label: '电磁铁', w: 210, h: 200,
    terminals: [
      { id: 'a', label: '−', name: '线圈左端接线柱（黑）', x: 48, y: 148 },
      { id: 'b', label: '+', name: '线圈右端接线柱（红）', x: 162, y: 148 },
    ],
    render(c, dyn = {}) {
      const turns = Math.max(3, Math.round(Number(c.turns) || 10))   // 匝数 5~20 可调，线圈圈数跟着变
      const core = c.core !== false
      const I = Math.max(0, Number(dyn.I) || 0)
      const pins = Number.isFinite(dyn.pins) ? dyn.pins : 0
      const on = I > 1e-3
      const hot = on ? Math.min(1, I / 0.6) : 0
      // 磁极所在端：电流从右端接线柱（b）流入 ⇒ N 在右（nside = 1）；反接电池则 N 移到左端
      const nRight = (Number(dyn.nside) || 1) > 0
      const src = nRight ? 1 : -1            // N 极所在的一侧（+1 = 右端）
      /* 横躺、无底座：铁芯水平穿过线圈，引出线直接接线圈两端 */
      const axisY = 104
      const coreX = 20, coreLen = 170, coreH = 26
      const coilW = 132                        // 10 圈，圈间留缝露出铁芯
      const coilH = 56
      const cL = 105 - coilW / 2, cR = cL + coilW
      const cT = axisY - coilH / 2, cB = cT + coilH
      const liftY = core ? 0 : -58            // 抽出：铁芯抬到线圈上方
      const wire = on
        ? `rgb(${Math.round(201 + 36 * hot)},${Math.round(129 + 34 * hot)},${Math.round(62 - 12 * hot)})`
        : '#C8813E'
      const coreBody = core ? '#9DA8B4' : '#CDD5DE'
      const coreLine = core ? '#6B7684' : '#A9B5C0'
      /* 一条连续螺旋线的侧视投影（正弦波）：前面可见；背面且落在铁芯轮廓内的一段被挡住 → 断开不画 */
      const loops = Math.max(3, Math.round(turns) || 10)   // 圈数 = 匝数（5~20 可调）
      const gapX = coilW / loops
      const Rcoil = coreH / 2 + 3
      const rCore = coreH / 2
      const yT0 = axisY - coreH / 2, yB0 = axisY + coreH / 2
      const xStart = cL
      const xEndC = cL + gapX * (loops - 0.5 - Math.asin(rCore / Rcoil) / Math.PI)
      const xEnd = xEndC
      const phase0 = Math.asin(rCore / Rcoil)
      let dPath = '', pen = false
      for (let x = xStart; x <= xEnd + 0.01; x += 0.8) {
        const th = (2 * Math.PI * (x - xStart)) / gapX + phase0
        const sy = Math.sin(th), cz = Math.cos(th)
        if (core && cz < 0 && Math.abs(sy) < rCore / Rcoil) { pen = false; continue }   // 铁芯抽出后无遮挡，整圈补全
        dPath += (pen ? ' L' : ' M') + x.toFixed(1) + ' ' + (axisY - Rcoil * sy).toFixed(1)
        pen = true
      }
      const coil = `<path d="${dPath}" fill="none" stroke="${wire}" stroke-width="2.6" stroke-linecap="round"/>`
      /* 铁芯：一根水平圆柱棒（两端不收缩、不画端面圆）；内部磁力线 S→N 画在铁芯之上、线圈之下 */
      const coreSvg = `<g transform="translate(0,${liftY})">
        <rect x="${coreX}" y="${axisY - coreH / 2}" width="${coreLen}" height="${coreH}" rx="${coreH / 2}"
              fill="${coreBody}" stroke="${coreLine}" stroke-width="1.1"/>
        <rect x="${coreX + 9}" y="${axisY - coreH / 2 + 4}" width="${coreLen - 18}" height="3.6" rx="1.8"
              fill="#F0F4F9" opacity="0.48"/>
        ${(on && core) ? [-1, 0, 1].map((k) => (
        `<line x1="${coreX + coreLen - 7}" y1="${(axisY + k * coreH * 0.24).toFixed(1)}"
              x2="${coreX + 7}" y2="${(axisY + k * coreH * 0.24).toFixed(1)}"
              stroke="rgba(37,99,235,${(0.30 + 0.20 * hot).toFixed(2)})" stroke-width="1.1" stroke-dasharray="3 3"/>`
      )).join('') + (on && core ? [-26, 20].map((dx) => (
        `<polygon points="${(105 + dx + 4.4 * src).toFixed(1)},${axisY} ${(105 + dx - 4.4 * src).toFixed(1)},${axisY - 4} ${(105 + dx - 4.4 * src).toFixed(1)},${axisY + 4}"
              fill="rgba(37,99,235,${(0.5 + 0.3 * hot).toFixed(2)})"/>`
      )).join('') : '') : ''}
      </g>`
      /* 磁极标注：铁芯以上、两端各一个（通电时按电流方向定：右端进电流 ⇒ 右 N 红、左 S 蓝） */
      const poles = (on && core) ? `
        <text x="${coreX + (nRight ? coreLen - 9 : 9)}" y="${axisY - coreH / 2 - 6}" text-anchor="middle" font-size="12" font-weight="700" fill="#DC2626">N</text>
        <text x="${coreX + (nRight ? 9 : coreLen - 9)}" y="${axisY - coreH / 2 - 6}" text-anchor="middle" font-size="12" font-weight="700" fill="#2563EB">S</text>` : ''
      /* 桌上备着 4 根竖立的大头针：一列，从吸附点正下方由近到远往下排；通电后从最近那根开始被吸走 */
      const bedAnchorX = 105 + (nRight ? 1 : -1) * coreLen * 0.20
      const bedMarks = (() => {
        const bedDys = [30, 42, 54, 66]
        const liftN = Math.max(0, Math.min(bedDys.length, pins))
        let s = ''
        const bedDxs = [0, 6, -5, 3]
        for (let i = liftN; i < bedDys.length; i++) {
          const bx = bedAnchorX + bedDxs[i]
          const byBot = axisY + coreH / 2 + bedDys[i]
          s += `<g>
        <line x1="${bx}" y1="${byBot}" x2="${bx}" y2="${byBot - 8}" stroke="#4B5563" stroke-width="1.4" stroke-linecap="round"/>
        <circle cx="${bx}" cy="${(byBot + 0.6).toFixed(1)}" r="1.5" fill="#B9C3CE" stroke="#5b6470" stroke-width="0.5"/>
      </g>`
        }
        return s
      })()
      /* 大头针：被吸起后吸在 N 极那一侧（磁极处磁性最强），下方散开 —— N 在哪边针就挂在哪边 */
      const pinX = nRight ? 105 + coreLen / 2 - 16 : 105 - coreLen / 2 + 16
      const pinY0 = core ? axisY + coreH / 2 : axisY + coilH / 2 - 2
      const gapPin = pins > 1 ? Math.min(3.0, 34 / (pins - 1)) : 0
      const pinMarks = Array.from({ length: pins }, (_, i) => {
        const off = (i - (pins - 1) / 2) * gapPin
        const tipY = pinY0 + 9 + Math.abs(off) * 0.26
        return `<g>
        <line x1="${(pinX + off * 0.18).toFixed(1)}" y1="${pinY0 + 1}" x2="${(pinX + off).toFixed(1)}" y2="${tipY.toFixed(1)}" stroke="#727C89" stroke-width="1.4"/>
        <circle cx="${(pinX + off).toFixed(1)}" cy="${(tipY + 1.2).toFixed(1)}" r="1.6" fill="#B9C3CE" stroke="#5b6470" stroke-width="0.5"/>
      </g>`
      }).join('')
      /* 通电时铁芯外部磁力线（照教材标准螺线管图）：上下各若干族闭合椭圆环，两端收在铁芯端面处；
         ★ 用疏密表示强弱：环的条数 / 外张范围 / 浓淡 都随 磁性强弱 = N·I·μ 变化，径向按 k^1.8 递疏
         （贴铁芯处密、远处疏 ⇒ 两端磁极处最密）；抽芯 μ=0.25 后不消失，只变成一两圈稀淡的线 */
      const strength = Math.abs(I) * turns * (core ? 1 : 0.25)
      const layers = core ? Math.min(5, 1 + pins) : Math.min(2, 1 + Math.round(pins / 2))
      const sNorm = Math.min(1, strength / 24)
      const bMin = coreH / 2 + 6
      const aExtra = Math.min(18, 6 + strength * 1.0)
      const bMax = Math.max(bMin + 8, Math.min(70, 34 + strength * 2)) * (core ? 1 : 0.78)
      const ringList = []
      for (let k = 0; k < layers; k++) ringList.push(k)
      const field = on ? [-1, 1].map((dir) => ringList.map((k) => {
        const f = Math.pow((k + 1) / layers, 1.8)
        const a = (coreLen / 2 + 2) + aExtra * f
        const b = bMin + (bMax - bMin) * f
        const op = (0.34 + 0.4 * sNorm) * (1 - 0.08 * k)
        let d = ''
        for (let i = 0; i <= 28; i++) {
          const t = (Math.PI * i) / 28
          const x = 105 + a * Math.cos(t)
          const y = axisY + dir * b * Math.sin(t)
          d += (i ? ' L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1)
        }
        const fill = `rgba(124,58,237,${Math.min(0.94, op + 0.24).toFixed(2)})`
        const tipY = axisY + dir * b
        return `<path d="${d}" fill="none" stroke="rgba(124,58,237,${op.toFixed(2)})" stroke-width="1.1" stroke-dasharray="4 3"/>
        <polygon points="${(105 - src * 3.3).toFixed(1)},${tipY.toFixed(1)} ${(105 + src * 3.3).toFixed(1)},${(tipY - 2.6).toFixed(1)} ${(105 + src * 3.3).toFixed(1)},${(tipY + 2.6).toFixed(1)}" fill="${fill}"/>`
      }).join('')).join('') : ''
      /* N/S 极高度处的短水平线：N 极向外张、S 极向里收；长度随磁场强弱变化 */
      const leadLen = Math.min(15, 6 + strength * 0.6)
      const fieldEnds = on ? [-1, 1].map((dir) => {
        const fill = `rgba(124,58,237,${Math.min(0.94, 0.55 + 0.35 * sNorm).toFixed(2)})`
        const stroke = `rgba(124,58,237,${(0.32 + 0.4 * sNorm).toFixed(2)})`
        const yy = (axisY + dir * (coreH / 2 + 4)).toFixed(1)
        const xN = 105 + src * (coreLen / 2 + 1.5), xN2 = 105 + src * (coreLen / 2 + 1.5 + leadLen)
        const xS = 105 - src * (coreLen / 2 + 1.5), xS2 = 105 - src * (coreLen / 2 + 1.5 + leadLen)
        const triX = (x, u) => `<polygon points="${x.toFixed(1)},${yy} ${(x - u * 4).toFixed(1)},${(+yy - 2.4).toFixed(1)} ${(x - u * 4).toFixed(1)},${(+yy + 2.4).toFixed(1)}" fill="${fill}"/>`
        return `<line x1="${xN.toFixed(1)}" y1="${yy}" x2="${xN2.toFixed(1)}" y2="${yy}" stroke="${stroke}" stroke-width="1.1" stroke-dasharray="4 3"/>
        ${triX(xN2, src)}
        <line x1="${xS.toFixed(1)}" y1="${yy}" x2="${xS2.toFixed(1)}" y2="${yy}" stroke="${stroke}" stroke-width="1.1" stroke-dasharray="4 3"/>
        ${triX(xS2, -src)}`
      }).join('') : ''
      return `
    <svg width="210" height="200" viewBox="0 0 210 200">
      ${coreSvg}
      ${poles}
      ${!core ? `<text x="105" y="${axisY + liftY + coreH / 2 + 16}" text-anchor="middle" font-size="8" font-weight="700" fill="#DC2626">铁芯已抽出（磁性骤减）</text>` : ''}
      <!-- 左引出线从上沿斜穿铁芯；右引出线：铁芯插着只画下沿以外，抽出后整段画 -->
      <path d="M${cL.toFixed(1)} ${(axisY - rCore).toFixed(1)} L48 148" fill="none" stroke="#8D96A1" stroke-width="2"/>
      ${core
        ? `<path d="M${(xEnd + (162 - xEnd) * ((2 * rCore) / (148 - axisY + rCore))).toFixed(1)} ${(axisY + rCore).toFixed(1)} L162 148" fill="none" stroke="#8D96A1" stroke-width="2"/>`
        : `<path d="M${xEnd.toFixed(1)} ${(axisY - rCore).toFixed(1)} L162 148" fill="none" stroke="#8D96A1" stroke-width="2"/>`}
      ${coil}
      ${field}
      ${fieldEnds}
      ${pinMarks}
      ${bedMarks}
      ${termDotSVG(48, 148, true, '−')}
      ${termDotSVG(162, 148, false, '+')}
      ${noteChipSVG(105, 14, `${turns} 匝 · ${I.toFixed(2)} A · 吸 ${pins} 针`,
        on ? '#93C5FD' : '#94a3b8', 156)}
    </svg>` }
  },

  /* ── 奥斯特实验板（本专题专用）：一段垂直穿过板面的直导线 + 板上 4 支小磁针 ──
   * 通电后：磁感线按电流大小决定条数（疏密表达强弱），4 支磁针的 N 极同向指向该处磁感线的切向。
   * ⊙ = 电流向外（磁感线逆时针，逆时针走一圈再回到自身）；⊗ = 电流向里（顺时针）。
   * 透视（.inner）里能看到板下走线槽与导线的走向。 */
  ostersBoard: {
    label: '奥斯特实验板', w: 230, h: 170,
    terminals: [
      { id: 'a', label: '1', name: '接线柱 1（接电源）', x: 30, y: 150 },
      { id: 'b', label: '2', name: '接线柱 2', x: 200, y: 150 },
    ],
    render(c, dyn = {}) {
      const cx = 115, cy = 80
      const I = Number(dyn.I) || 0
      const sign = Number(dyn.sign) || 0
      const on = I > 1e-3
      const rings = on ? Math.min(3, 1 + Math.round(I / 0.6)) : 0
      const dirs = [-Math.PI / 2, 0, Math.PI / 2, Math.PI]
      const pr = 50

      let field = ''
      for (let k = 0; k < rings; k++) {
        const r = 26 + k * 11
        const op = (0.8 - k * 0.15).toFixed(2)
        field += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#a78bfa" stroke-width="1.15" stroke-dasharray="5 4" opacity="${op}"/>`
        for (let a = 0; a < 4; a++) {
          const ang = a * Math.PI / 2 + Math.PI / 4
          const px = cx + Math.cos(ang) * r, py = cy + Math.sin(ang) * r
          const tan = sign > 0 ? ang - Math.PI / 2 : ang + Math.PI / 2
          field += `<path d="M ${(px + Math.cos(tan) * 4.6).toFixed(1)} ${(py + Math.sin(tan) * 4.6).toFixed(1)}
            L ${(px + Math.cos(tan + 2.5) * 3.1).toFixed(1)} ${(py + Math.sin(tan + 2.5) * 3.1).toFixed(1)}
            L ${(px + Math.cos(tan - 2.5) * 3.1).toFixed(1)} ${(py + Math.sin(tan - 2.5) * 3.1).toFixed(1)} Z"
            fill="#7c3aed" opacity="${op}"/>`
        }
      }

      let pins4 = ''
      for (let k = 0; k < 4; k++) {
        const a = dirs[k]
        const px = cx + Math.cos(a) * pr, py = cy + Math.sin(a) * pr
        const ang = on ? (sign > 0 ? a - Math.PI / 2 : a + Math.PI / 2) : -Math.PI / 2
        pins4 += compassSVG(px, py, 15, ang)
      }

      /* 中心：导线截面（⊙ / ⊗） */
      const hole = sign !== 0
        ? `<circle cx="${cx}" cy="${cy}" r="11" fill="url(#ostCoin)"/>
           <circle cx="${cx}" cy="${cy}" r="11" fill="none" stroke="#8C5A2B" stroke-width="1.6"/>
           <circle cx="${cx}" cy="${cy}" r="8.6" fill="#1E293B"/>
           ${sign > 0
    ? `<circle cx="${cx}" cy="${cy}" r="5" fill="none" stroke="#F8FAFC" stroke-width="1.6"/>
               <circle cx="${cx}" cy="${cy}" r="1.8" fill="#F8FAFC"/>`
    : `<path d="M ${cx - 4.2} ${cy - 4.2} L ${cx + 4.2} ${cy + 4.2} M ${cx + 4.2} ${cy - 4.2} L ${cx - 4.2} ${cy + 4.2}" stroke="#F8FAFC" stroke-width="1.7" stroke-linecap="round"/>`}`
        : `<circle cx="${cx}" cy="${cy}" r="11" fill="#3B4A5A" stroke="#26333F" stroke-width="1.4"/>
           <circle cx="${cx}" cy="${cy}" r="6.4" fill="none" stroke="#5B6B7B" stroke-width="1.5"/>`

      /* 透视层：板内走线槽 + 导线穿过板面 + 电流箭头 */
      const inner = `<g class="inner">
        <path d="M 30 150 L 68 133 L ${cx - 13} ${cy + 2} M 200 150 L 162 133 L ${cx + 13} ${cy + 2}"
          fill="none" stroke="#c2410c" stroke-width="2" stroke-dasharray="4 3" opacity="0.9"/>
        <line x1="${cx - 13}" y1="${cy}" x2="${cx + 13}" y2="${cy}" stroke="#f59e0b" stroke-width="2.4" opacity="0.95"/>
        ${sign !== 0 ? `<path d="M ${cx + (sign > 0 ? 9 : -9) - 4.4} ${cy - 6} L ${cx + (sign > 0 ? 9 : -9) + 4} ${cy} L ${cx + (sign > 0 ? 9 : -9) - 4.4} ${cy + 6} Z" fill="#fbbf24"/>` : ''}
        <text class="plabel" x="${cx}" y="${cy + 22}">直导线垂直穿板面</text>
      </g>`

      return `
    <svg width="230" height="170" viewBox="0 0 230 170">
      <defs>
        <radialGradient id="ostCoin" cx="35%" cy="30%" r="75%">
          <stop offset="0" stop-color="#E8B06A"/><stop offset="1" stop-color="#B87333"/>
        </radialGradient>
      </defs>
      <rect class="casing" x="2" y="2" width="226" height="166" rx="12" fill="#26323F" stroke="#121A22" stroke-width="2"/>
      <rect class="casing" x="10" y="10" width="210" height="126" rx="8" fill="#2F3E4E" stroke="#3D5062" stroke-width="1.2"/>
      <rect class="casing" x="10" y="10" width="210" height="126" rx="8" fill="none" stroke="#0f1720" stroke-width="0.8" opacity="0.6"/>
      ${inner}
      ${field}
      ${pins4}
      ${hole}
      ${termDotSVG(30, 150, true, '1')}
      ${termDotSVG(200, 150, false, '2')}
      ${noteChipSVG(115, 148, on ? `${I.toFixed(2)} A · 磁针偏转` : '未通电 · 磁针指南北',
    on ? '#C4B5FD' : '#94a3b8', 148)}
    </svg>` }
  },

  /* ── 灵敏电流计（本专题专用）：中央零点，指针左右都能偏 ──
   * 电磁感应／法拉第实验的核心仪表：指针居中 = 没有电流；
   * 指针偏左 / 偏右 = 电流方向相反 —— 交流电方向来回变，就是指针左右摆。
   * 表盘照真实教学表画：弧刻度 −50…0…+50，中央零位加粗红；
   * 透视（.inner）里露出上下磁钢 + 线圈，说明指针为什么会被电流"推"动。 */
  galvanometer: {
    label: '灵敏电流计', w: 176, h: 132, meter: true,
    terminals: [
      { id: 'neg', label: '−', name: '黑柱（−）', x: 38, y: 112 },
      { id: 'pos', label: '+', name: '红柱（+）', x: 138, y: 112 },
    ],
    render(c, dyn = {}) {
      const frac = Math.max(-1, Math.min(1, Number(dyn.frac) || 0))
      const over = Math.abs(frac) >= 0.995
      const PX = 88, PY = 100, R = 56, NEEDLE = 50, SWEEP = 46 * Math.PI / 180

      const f = (v) => v.toFixed(1)
      const pt = (ang, r) => [PX + Math.cos(ang) * r, PY + Math.sin(ang) * r]

      // 刻度弧：-46° … +46°（以"向上"为 0）
      const aL = -Math.PI / 2 - SWEEP, aR = -Math.PI / 2 + SWEEP
      const [lx, ly] = pt(aL, R), [rx, ry] = pt(aR, R)

      let ticks = ''
      for (let i = -5; i <= 5; i++) {
        const a = -Math.PI / 2 + (i / 5) * SWEEP
        const r0 = i === 0 ? 44 : 48
        const [x0, y0] = pt(a, r0), [x1, y1] = pt(a, R)
        const zero = i === 0
        ticks += `<line x1="${f(x0)}" y1="${f(y0)}" x2="${f(x1)}" y2="${f(y1)}"
          stroke="${zero ? '#DC2626' : '#64748B'}" stroke-width="${zero ? 1.9 : 1}"/>`
      }

      // 指针（中央零点 → 按 frac 左右偏）；有发电机在转时由动态层按相位重画，这里不画
      const hideNeedle = !!dyn.hideNeedle
      const aN = -Math.PI / 2 + frac * SWEEP
      const [nx, ny] = pt(aN, NEEDLE)
      const needle = hideNeedle ? '' : `<line x1="${PX}" y1="${PY}" x2="${f(nx)}" y2="${f(ny)}"
        stroke="${over ? '#DC2626' : '#111827'}" stroke-width="2.2" stroke-linecap="round"/>
        <circle cx="${PX}" cy="${PY}" r="3.6" fill="#334155"/>`

      const inner = `<g class="inner">
        <rect x="26" y="14" width="124" height="13" rx="3" fill="#C0392B" opacity="0.6"/>
        <text x="88" y="24" text-anchor="middle" font-size="8" font-weight="700" fill="#7F1D1D">N 磁钢</text>
        <rect x="26" y="78" width="124" height="13" rx="3" fill="#1D4ED8" opacity="0.5"/>
        <text x="88" y="88" text-anchor="middle" font-size="8" font-weight="700" fill="#1E3A8A">S 磁钢</text>
        <rect x="62" y="36" width="52" height="42" rx="5" fill="#B45309" opacity="0.78"/>
        <path d="M 64 40 H 112 M 64 48 H 112 M 64 56 H 112 M 64 64 H 112 M 64 72 H 112"
          stroke="#F59E0B" stroke-width="1.3" opacity="0.92"/>
        <text class="plabel" x="88" y="118">表头：磁钢 + 线圈</text>
      </g>`

      const dial = `<g class="esb-dial">
        <rect x="10" y="6" width="156" height="106" rx="9" fill="#FBFDFF" stroke="#CBD5E1" stroke-width="1.2"/>
        <path d="M ${f(lx)} ${f(ly)} A ${R} ${R} 0 0 1 ${f(rx)} ${f(ry)}"
          fill="none" stroke="#94A3B8" stroke-width="1"/>
        ${ticks}
        <text x="88" y="33" text-anchor="middle" font-size="10" font-weight="700" fill="#64748B">0</text>
        <text x="34" y="70" text-anchor="middle" font-size="9" font-weight="600" fill="#64748B">−150</text>
        <text x="142" y="70" text-anchor="middle" font-size="9" font-weight="600" fill="#64748B">+150</text>
        <text x="150" y="104" text-anchor="middle" font-size="10" font-weight="700" fill="#94A3B8">G</text>
        <text x="24" y="104" text-anchor="middle" font-size="9" font-weight="600" fill="#94A3B8">mA</text>
        ${needle}
      </g>`

      return `
    <svg width="176" height="132" viewBox="0 0 176 132">
      <defs>
        <linearGradient id="galv-shell" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#64748B"/><stop offset="0.45" stop-color="#4B5563"/>
          <stop offset="1" stop-color="#334155"/>
        </linearGradient>
      </defs>
      <rect class="casing" x="1" y="1" width="174" height="122" rx="12" fill="url(#galv-shell)" stroke="#1E293B" stroke-width="1.6"/>
      <rect x="5" y="3" width="166" height="6" rx="3" fill="rgba(255,255,255,0.16)"/>
      ${inner}
      ${dial}
      ${termDotSVG(38, 112, true, '−')}
      ${termDotSVG(138, 112, false, '+')}
    </svg>` }
  },
}

/* 手摇发电机配套的 6 V 小灯泡：画法 / 尺寸 / 接线柱与 3 V 小灯泡完全一样（直接沿用），
   只换电学参数：灯丝 48 Ω、额定 0.75 W。手摇发电机 6 r/s 时峰值 6 V、有效值 4.24 V，
   串这只灯泡约 0.37 W ≈ 额定的一半，肉眼能看见灯丝发亮、有光芒；
   若用 3 V 那只（5 Ω），6 V 直连功率会到 6.9 W，直接烧掉。 */
export const BULB6 = { ohm: 48, rated: 0.75 }
TYPES.bulb6 = { ...TYPES.bulb, label: '小灯泡', ...BULB6 }

/** 一支小磁针（SVG 片段）：白盘 + 红(N)/蓝(S) 针；ang 为 N 极方向（屏幕坐标，y 向下） */
function compassSVG(x, y, r, ang) {
  const L = r * 0.76, wd = r * 0.19
  const nx = (x + Math.cos(ang) * L).toFixed(1), ny = (y + Math.sin(ang) * L).toFixed(1)
  const sx = (x - Math.cos(ang) * L).toFixed(1), sy = (y - Math.sin(ang) * L).toFixed(1)
  const px = (Math.cos(ang + Math.PI / 2) * wd).toFixed(1)
  const py = (Math.sin(ang + Math.PI / 2) * wd).toFixed(1)
  return `<g>
        <circle cx="${x}" cy="${y}" r="${r}" fill="#FFFDF8" stroke="#C9B18A" stroke-width="1.2"/>
        <circle cx="${x}" cy="${y}" r="${(r * 0.8).toFixed(1)}" fill="none" stroke="#E2D3B8" stroke-width="0.8"/>
        <path d="M ${nx} ${ny} L ${(x + Number(px)).toFixed(1)} ${(y + Number(py)).toFixed(1)} L ${(x - Number(px)).toFixed(1)} ${(y - Number(py)).toFixed(1)} Z" fill="#E5484D"/>
        <path d="M ${sx} ${sy} L ${(x + Number(px)).toFixed(1)} ${(y + Number(py)).toFixed(1)} L ${(x - Number(px)).toFixed(1)} ${(y - Number(py)).toFixed(1)} Z" fill="#2563EB"/>
        <circle cx="${x}" cy="${y}" r="${(r * 0.15).toFixed(1)}" fill="#B8860B"/>
      </g>`
}








