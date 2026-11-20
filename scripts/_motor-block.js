  /* ── 小电动机（2026-11-20 第 7 版：补"立体感"和真转动）
      尺寸仍按 NB 242×246 逐行扫描结果（§8.51），这一版改的是"形体"：
        1) 磁铁板做成有厚度的板：后面垫一层错位的暗侧壁 + 左侧折边 + 顶沿亮倒角 + 底面压暗；
        2) 圆柱腔做成"隧道"：腔底平色 #343941，腔口内侧一道内壁（下半圈红/蓝各半，往上收成黑），
           顶部再加一层内阴影，孔才有纵深；
        3) 线圈改成 NB 那样的大片矩形线圈（宽 ≈ 0.58 腔径、高 ≈ 0.5 腔径）+ 中间引线杆，
           而不是细楔子。通电时绕竖直轴转（SMIL x 向 scale，16 采样），转到侧视整片收成一条竖线
           —— 这是"转圈"，不是"左右晃"；
        4) 换向环按 NB 透视略压扁，红 −120°→+30°、蓝补剩余，正面加亮边。
      绘制顺序：侧壁 → 板正面（mask 开腔开槽）→ 腔/槽暗色 + 内壁 → 转子 → 环 → 底座 → 柱。 ── */
  motor: {
    label: '小电动机', w: 200, h: 212,
    terminals: [
      { id: 'a', label: '1', name: '接线柱 1', x: 71.6, y: 171 },
      { id: 'b', label: '2', name: '接线柱 2', x: 128.7, y: 171 },
    ],
    render(c, dyn = {}) {
      const I = dyn.I || 0
      const on = Math.abs(I) > 0.005
      const dir = dyn.dir || 1
      const speed = 1.9 + 2.2 * Math.min(1.4, Math.abs(I))
      const cid = `esmm${c.id}`
      const dur = ((2 * Math.PI) / speed).toFixed(2)
      const coilAnim = on
        ? `<animateTransform attributeName="transform" type="rotate"
             from="-16" to="${-16 + 360 * dir}" dur="${dur}s" repeatCount="indefinite"/>`
        : ''
      const ringAnim = on
        ? `<animateTransform attributeName="transform" type="rotate"
             from="0" to="${-360 * dir}" dur="${dur}s" repeatCount="indefinite"/>`
        : ''
      const R = 11
      const a1 = (-120 * Math.PI) / 180
      const a2 = (30 * Math.PI) / 180
      const p1 = [R * Math.cos(a1), R * Math.sin(a1)].map((v) => v.toFixed(2))
      const p2 = [R * Math.cos(a2), R * Math.sin(a2)].map((v) => v.toFixed(2))
      return `
    <svg width="200" height="212" viewBox="0 0 200 212">
      <defs>
        <mask id="${cid}m">
          <rect x="0" y="0" width="200" height="212" fill="#fff"/>
          <circle cx="101.4" cy="77.6" r="53" fill="#000"/>
          <rect x="96" y="0" width="10.8" height="212" fill="#000"/>
        </mask>
        <clipPath id="${cid}body">
          <rect x="12" y="15" width="73" height="123.5"/>
          <rect x="96" y="15" width="10.8" height="123.5"/>
          <rect x="117.8" y="15" width="72.2" height="123.5"/>
          <circle cx="101.4" cy="77.6" r="53"/>
        </clipPath>
        <clipPath id="${cid}bore"><circle cx="101.4" cy="77.6" r="53"/></clipPath>
        <linearGradient id="${cid}red" gradientUnits="userSpaceOnUse" x1="0" y1="15" x2="0" y2="138.5">
          <stop offset="0%" stop-color="#ff5f6a"/>
          <stop offset="7%" stop-color="#f74754"/>
          <stop offset="58%" stop-color="#ef3a47"/>
          <stop offset="100%" stop-color="#c62f3d"/>
        </linearGradient>
        <linearGradient id="${cid}blue" gradientUnits="userSpaceOnUse" x1="0" y1="15" x2="0" y2="138.5">
          <stop offset="0%" stop-color="#4aaef7"/>
          <stop offset="7%" stop-color="#3395e8"/>
          <stop offset="58%" stop-color="#2488dc"/>
          <stop offset="100%" stop-color="#1866ae"/>
        </linearGradient>
        <clipPath id="${cid}pr"><rect x="12" y="15" width="73" height="123.5" rx="10"/></clipPath>
        <clipPath id="${cid}pb"><rect x="117.8" y="15" width="72.2" height="123.5" rx="10"/></clipPath>
        <radialGradient id="${cid}colR" gradientUnits="userSpaceOnUse" cx="101.4" cy="77.6" r="58">
          <stop offset="90%" stop-color="#7e1b23"/>
          <stop offset="98%" stop-color="#b73540"/>
          <stop offset="100%" stop-color="#d8414c"/>
        </radialGradient>
        <radialGradient id="${cid}colB" gradientUnits="userSpaceOnUse" cx="101.4" cy="77.6" r="58">
          <stop offset="90%" stop-color="#0f3c60"/>
          <stop offset="98%" stop-color="#1c69a6"/>
          <stop offset="100%" stop-color="#2277bb"/>
        </radialGradient>
        <linearGradient id="${cid}soft" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="rgba(0,0,0,.55)"/>
          <stop offset="100%" stop-color="rgba(0,0,0,0)"/>
        </linearGradient>
        <linearGradient id="${cid}boreSh" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="rgba(0,0,0,.30)"/>
          <stop offset="35%" stop-color="rgba(0,0,0,.06)"/>
          <stop offset="68%" stop-color="rgba(0,0,0,0)"/>
          <stop offset="100%" stop-color="rgba(0,0,0,.42)"/>
        </linearGradient>
        <linearGradient id="${cid}sheen" x1="0" y1="0" x2="0.55" y2="1">
          <stop offset="0%" stop-color="rgba(255,255,255,.30)"/>
          <stop offset="45%" stop-color="rgba(255,255,255,.06)"/>
          <stop offset="100%" stop-color="rgba(0,0,0,.10)"/>
        </linearGradient>
        <filter id="${cid}sh" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="5.5"/></filter>
        <linearGradient id="${cid}pl" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#f0f4f7"/>
          <stop offset="40%" stop-color="#ccd4dc"/>
          <stop offset="100%" stop-color="#94a0aa"/>
        </linearGradient>
      </defs>

      <ellipse cx="101" cy="188" rx="74" ry="11" fill="rgba(22,28,36,.30)" filter="url(#${cid}sh)"/>
      <!-- 板厚：两块板的侧壁整块垫在后面，向右下错一点，露出厚度（同样要过 mask，否则会从镂空的孔里透出来） -->
      <g mask="url(#${cid}m)">
        <rect x="16.5" y="19.5" width="72" height="122" rx="10" fill="#a82531"/>
        <rect x="119" y="19.5" width="72" height="122" rx="10" fill="#14548f"/>
      </g>

      <!-- 板正面（圆角 + 顶面亮带 + 侧壁暗边 + 底面压暗） -->
      <g mask="url(#${cid}m)">
        <g clip-path="url(#${cid}pr)">
          <rect class="casing" x="12" y="15" width="73" height="123.5" fill="url(#${cid}red)"/>
          <rect x="12" y="15" width="73" height="6.4" fill="#ff7378"/>
          <rect x="12" y="21.4" width="73" height="1.6" fill="rgba(120,10,20,.30)"/>
          <rect x="12" y="15" width="4.6" height="123.5" fill="rgba(0,0,0,.17)"/>
          <rect x="12" y="129.5" width="73" height="9" fill="rgba(0,0,0,.22)"/>
          <rect x="12" y="15" width="73" height="123.5" fill="url(#${cid}sheen)"/>\n          <rect x="12" y="15" width="73" height="123.5" fill="none" stroke="rgba(255,255,255,.14)" stroke-width="1"/>
        </g>
        <g clip-path="url(#${cid}pb)">
          <rect class="casing" x="117.8" y="15" width="72.2" height="123.5" fill="url(#${cid}blue)"/>
          <rect x="117.8" y="15" width="72.2" height="6.4" fill="#6dc2fb"/>
          <rect x="117.8" y="21.4" width="72.2" height="1.6" fill="rgba(10,40,80,.30)"/>
          <rect x="185.4" y="15" width="4.6" height="123.5" fill="rgba(255,255,255,.16)"/>
          <rect x="117.8" y="129.5" width="72.2" height="9" fill="rgba(0,0,0,.24)"/>
          <rect x="117.8" y="15" width="72.2" height="123.5" fill="url(#${cid}sheen)"/>\n          <rect x="117.8" y="15" width="72.2" height="123.5" fill="none" stroke="rgba(255,255,255,.16)" stroke-width="1"/>
        </g>
      </g>

      <!-- 孔 / 板间槽不填色 = 镂空，直接露卡片背景（NB 就是"挖穿的板"），厚度全靠孔沿那圈压暗的倒角 -->
      <!-- 腔口的彩色倒角环（r53→65，左红右蓝）：NB 的板内边其实绕着孔转了一圈，
           靠这圈倒角把孔上方那道缝桥接住，孔才有纵深 -->
      <g clip-path="url(#${cid}body)">
        <path d="M 101.4 20.6 A 57 57 0 0 0 101.4 134.6 L 101.4 130.6 A 53 53 0 0 1 101.4 24.6 Z"
          fill="url(#${cid}colR)"/>
        <path d="M 101.4 20.6 A 57 57 0 0 1 101.4 134.6 L 101.4 130.6 A 53 53 0 0 0 101.4 24.6 Z"
          fill="url(#${cid}colB)"/>
        <!-- 倒角整体压暗：板的切口在暗处，厚度才读得出来 -->
        <path d="M 101.4 20.6 A 57 57 0 0 0 101.4 134.6 L 101.4 130.6 A 53 53 0 0 1 101.4 24.6 Z"
          fill="rgba(12,16,22,.20)"/>
        <path d="M 101.4 20.6 A 57 57 0 0 1 101.4 134.6 L 101.4 130.6 A 53 53 0 0 0 101.4 24.6 Z"
          fill="rgba(12,16,22,.20)"/>
        <path d="M 101.4 20.6 L 101.4 134.6" stroke="rgba(0,0,0,.30)" stroke-width="1.2"/>
        <circle cx="101.4" cy="77.6" r="53" fill="none" stroke="rgba(0,0,0,.42)" stroke-width="1.6"/>
        <circle cx="101.4" cy="77.6" r="57" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="1"/>
      </g>

      <text x="25.4" y="78" fontSize="21" fontWeight="700" fill="#fff" textAnchor="middle"
        stroke="rgba(96,0,8,.32)" stroke-width="1" paintOrder="stroke">N</text>
      <text x="179" y="78" fontSize="21" fontWeight="700" fill="#fff" textAnchor="middle"
        stroke="rgba(0,34,84,.32)" stroke-width="1" paintOrder="stroke">S</text>

      <!-- 电刷杆 -->
      <rect x="82.6" y="134" width="2.4" height="50" rx="1" fill="#dfe6ec"/>
      <rect x="82.6" y="134" width="0.8" height="50" fill="rgba(74,90,108,.42)"/>
      <rect x="118.4" y="134" width="2.4" height="50" rx="1" fill="#dfe6ec"/>
      <rect x="118.4" y="134" width="0.8" height="50" fill="rgba(74,90,108,.42)"/>

      <!-- 线圈：一片矩形单匝框（左蓝右红）+ 中间引线杆；绕竖直轴转 = 水平压缩 -->
      <!-- 线圈：绕朝向屏幕的轴自转（画面里像叶片扫过），这正是 NB 的观感；
           叶片本身带一点斜切（skew）才显得是"有厚度的一片框" -->
      <path d="M 101.9 128 L 101.9 146" stroke="#cf7480" stroke-width="2.2"/>
      <g transform="translate(101.9,92)">
        <g transform="${on ? '' : 'rotate(-16)'}">${coilAnim}
          <g transform="skewY(-11)">
            <!-- 后沿（暗）露出厚度 -->
            <path d="M -8 -46 L 8 -44 L 8 25 L -8 23 Z"
              fill="none" stroke="rgba(72,128,180,.50)" stroke-width="2.2"/>
            <!-- 叶片框：左蓝右红 -->
            
            <path d="M -9 -45 L -9 24" stroke="#4a97dc" stroke-width="2.6"/>
            <path d="M 9 -44 L 9 26" stroke="#d8454f" stroke-width="2.6"/>
            <path d="M -9 -45 L 9 -44" stroke="#7fb2e2" stroke-width="2.2"/>
            <path d="M -9 24 L 9 26" stroke="#e0777e" stroke-width="2.2"/>
          </g>
        </g>
      </g>

      <!-- 换向环（透视略压扁） -->
      <g transform="translate(101.9,155.1) scale(1,0.96)">
        <g>${ringAnim}
          <circle r="${R}" fill="none" stroke="#e0404c" stroke-width="7.4"/>
          <path d="M ${p1[0]} ${p1[1]} A ${R} ${R} 0 0 1 ${p2[0]} ${p2[1]}"
            fill="none" stroke="#e8454f" stroke-width="7.4" stroke-linecap="butt"/>
          <path d="M ${p2[0]} ${p2[1]} A ${R} ${R} 0 1 1 ${p1[0]} ${p1[1]}"
            fill="none" stroke="#2e9ae8" stroke-width="7.4" stroke-linecap="butt"/>
          <path d="M -3 -12 A ${R} ${R} 0 0 1 11.6 4.4" fill="none" stroke="rgba(255,255,255,.45)" stroke-width="2.6"/>
          <path d="M 3 12 A ${R} ${R} 0 0 1 -11.6 -4.4" fill="none" stroke="rgba(0,0,0,.26)" stroke-width="2.6"/>
          <circle r="${R + 4.4}" fill="none" stroke="rgba(0,0,0,.26)" stroke-width="1.2"/>
          <circle r="${R - 4.4}" fill="none" stroke="rgba(0,0,0,.30)" stroke-width="1.4"/>
        </g>
        <circle r="6.2" fill="#2b3037"/>
        <circle r="6.2" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="1.1"/>
      </g>

      <!-- 底座 -->
      <rect x="68" y="178" width="67" height="12" rx="3" fill="url(#${cid}pl)"/>
      <rect x="68" y="178" width="67" height="4.4" rx="2.2" fill="#f1f5f8"/>
      <rect x="68" y="185.6" width="67" height="4.4" rx="2.2" fill="#8d98a2"/>
      <rect x="68" y="178" width="67" height="12" rx="3" fill="none" stroke="rgba(64,76,90,.24)" stroke-width="1"/>
      <!-- 接线柱 -->
      <rect x="66.6" y="170" width="10" height="11" rx="3.2" fill="#1d2126"/>
      <rect x="66.6" y="170" width="10" height="3.4" rx="1.8" fill="#333a41"/>
      <rect x="68.9" y="179.6" width="5.4" height="4" rx="1.4" fill="#c79a4a"/>
      <rect x="123.7" y="170" width="10" height="11" rx="3.2" fill="#c62f37"/>
      <rect x="123.7" y="170" width="10" height="3.4" rx="1.8" fill="#e0555c"/>
      <rect x="126" y="179.6" width="5.4" height="4" rx="1.4" fill="#c79a4a"/>

      ${on ? noteChipSVG(100, 202, `I = ${Math.abs(I).toFixed(2)} A`, '#4ade80', 96) : noteChipSVG(100, 202, '未通电', '#94a3b8', 58)}
      ${on ? motorSpinBadgeSVG(176, 116, dir) : ''}
    </svg>` }
  },

















