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
        ? `<animateTransform attributeName="transform" type="scale"
             values="1 1;0.18 1;-1 1;-0.18 1;1 1" keyTimes="0;.25;.5;.75;1"
             dur="${dur}s" repeatCount="indefinite"/>`
        : ''
      const ringAnim = ''
      const RR = 15.2
      const ga = (16 * Math.PI) / 180
      const sx = (RR * Math.sin(ga)).toFixed(2)
      const sy = (RR * Math.cos(ga)).toFixed(2)
      const segTopBlue = [-sx, `-${sy}`]
      const segBotBlue = [-sx, sy]
      const segTopRed = [sx, `-${sy}`]
      const segBotRed = [sx, sy]
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
        <clipPath id="${cid}rhalf"><rect x="0" y="-60" width="60" height="120"/></clipPath>
        <linearGradient id="${cid}red" gradientUnits="userSpaceOnUse" x1="0" y1="15" x2="0" y2="138.5">
          <stop offset="0%" stop-color="#fb3d4b"/>
          <stop offset="12%" stop-color="#f83c49"/>
          <stop offset="58%" stop-color="#e63844"/>
          <stop offset="100%" stop-color="#ca303b"/>
        </linearGradient>
        <linearGradient id="${cid}blue" gradientUnits="userSpaceOnUse" x1="0" y1="15" x2="0" y2="138.5">
          <stop offset="0%" stop-color="#258be1"/>
          <stop offset="12%" stop-color="#2589de"/>
          <stop offset="58%" stop-color="#2381cf"/>
          <stop offset="100%" stop-color="#1c6aac"/>
        </linearGradient>
        <clipPath id="${cid}pr"><rect x="12" y="15" width="73" height="123.5" rx="7"/></clipPath>
        <clipPath id="${cid}pb"><rect x="117.8" y="15" width="72.2" height="123.5" rx="7"/></clipPath>
        <radialGradient id="${cid}boreIn" gradientUnits="userSpaceOnUse" cx="101.4" cy="77.6" r="53">
          <stop offset="78%" stop-color="rgba(20,26,36,0)"/>
          <stop offset="93%" stop-color="rgba(20,26,36,.05)"/>
          <stop offset="100%" stop-color="rgba(16,20,30,.30)"/>
        </radialGradient>
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
        <linearGradient id="${cid}belowSh" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="rgba(24,32,44,.20)"/>
          <stop offset="55%" stop-color="rgba(24,32,44,.07)"/>
          <stop offset="100%" stop-color="rgba(24,32,44,0)"/>
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
        <rect x="16.5" y="19.5" width="72" height="122" rx="7" fill="#a82531"/>
        <rect x="119" y="19.5" width="72" height="122" rx="7" fill="#14548f"/>
      </g>

      <!-- 板正面（圆角 + 顶面亮带 + 侧壁暗边 + 底面压暗） -->
      <g mask="url(#${cid}m)">
        <g clip-path="url(#${cid}pr)">
          <rect class="casing" x="12" y="15" width="73" height="123.5" fill="url(#${cid}red)"/>
          <rect x="12" y="15" width="73" height="3.4" fill="#8a1c23"/>
          <rect x="12" y="18.4" width="73" height="3.3" fill="#a32029"/>
          <rect x="12" y="21.7" width="73" height="0.9" fill="#fb4758"/>
          <rect x="12" y="21.7" width="73" height="0.9" fill="rgba(255,255,255,.30)"/>
          <rect x="12" y="15" width="4.6" height="123.5" fill="rgba(0,0,0,.10)"/>
          <rect x="12" y="133.5" width="73" height="5" fill="rgba(0,0,0,.13)"/>
          <rect x="12" y="137.1" width="73" height="1.4" fill="#2a2e35"/>
          <rect x="12" y="15" width="73" height="123.5" fill="url(#${cid}sheen)"/>\n          <rect x="12" y="15" width="73" height="123.5" fill="none" stroke="rgba(255,255,255,.14)" stroke-width="1"/>
        </g>
        <g clip-path="url(#${cid}pb)">
          <rect class="casing" x="117.8" y="15" width="72.2" height="123.5" fill="url(#${cid}blue)"/>
          <rect x="117.8" y="15" width="72.2" height="3.4" fill="#0e3f6b"/>
          <rect x="117.8" y="18.4" width="72.2" height="3.3" fill="#105690"/>
          <rect x="117.8" y="21.7" width="72.2" height="0.9" fill="#2b9be8"/>
          <rect x="117.8" y="21.7" width="72.2" height="0.9" fill="rgba(255,255,255,.28)"/>
          <rect x="185.4" y="15" width="4.6" height="123.5" fill="rgba(255,255,255,.14)"/>
          <rect x="117.8" y="133.5" width="72.2" height="5" fill="rgba(0,0,0,.15)"/>
          <rect x="117.8" y="137.1" width="72.2" height="1.4" fill="#232a33"/>
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
        <path d="M 101.4 20.6 A 57 57 0 0 0 101.4 134.6 L 101.4 130.6 A 53 53 0 0 1 101.4 24.6 Z"
          fill="rgba(12,16,22,.22)"/>
        <path d="M 101.4 20.6 A 57 57 0 0 1 101.4 134.6 L 101.4 130.6 A 53 53 0 0 0 101.4 24.6 Z"
          fill="rgba(12,16,22,.22)"/>
        <path d="M 101.4 20.6 L 101.4 134.6" stroke="rgba(0,0,0,.30)" stroke-width="1.2"/>
        <circle cx="101.4" cy="77.6" r="53" fill="none" stroke="rgba(0,0,0,.46)" stroke-width="1.6"/>
        <circle cx="101.4" cy="77.6" r="57" fill="none" stroke="rgba(0,0,0,.18)" stroke-width="1"/>
      </g>
      <!-- 孔里的内阴影（孔本身是透的 = 露背景，靠这一圈才读得出"洞"） -->
      <g clip-path="url(#${cid}bore)">
        <circle cx="101.4" cy="77.6" r="53" fill="url(#${cid}boreIn)"/>
      </g>

      <!-- 板底投在背景上的软阴影：这块空间亮着才显得"板是浮在面板前的" -->
      <ellipse cx="48" cy="146" rx="38" ry="15" fill="rgba(24,32,44,.20)" filter="url(#${cid}sh)"/>
      <ellipse cx="154" cy="146" rx="38" ry="15" fill="rgba(24,32,44,.20)" filter="url(#${cid}sh)"/>

      <text x="25.4" y="78" fontSize="21" fontWeight="700" fill="#fff" textAnchor="middle"
        stroke="rgba(96,0,8,.32)" stroke-width="1" paintOrder="stroke">N</text>
      <text x="179" y="78" fontSize="21" fontWeight="700" fill="#fff" textAnchor="middle"
        stroke="rgba(0,34,84,.32)" stroke-width="1" paintOrder="stroke">S</text>

      <!-- 电刷杆：两根细杆，落在环外两侧（NB 里它们从环的两边升到底座） -->
      <rect x="79.4" y="128" width="2.4" height="56" rx="1" fill="#dfe6ec"/>
      <rect x="79.4" y="128" width="0.8" height="56" fill="rgba(74,90,108,.42)"/>
      <rect x="121.6" y="128" width="2.4" height="56" rx="1" fill="#dfe6ec"/>
      <rect x="121.6" y="128" width="0.8" height="56" fill="rgba(74,90,108,.42)"/>

      <!-- 线圈：NB 是一匝线的"T 形"轮廓（左半蓝、右半红，x=0 处硬切），
           框底两钩直接落成两条竖直引线，钉在换向环顶部的两段上；
           框绕竖直引线轴转 → 宽/薄两个相位（NB 截图里就是这两种姿态） -->
      <g transform="translate(101.4,92)">
        <!-- 两条引线（竖直，不跟着转）：左蓝右红，正好落在换向环顶沿 -->
        <path d="M -6.5 2 L -6.5 44" stroke="#3f90d8" stroke-width="2.6"/>
        <path d="M 6.5 2 L 6.5 44" stroke="#d9434e" stroke-width="2.6"/>
        <g transform="${on ? '' : 'scale(0.9,1)'}">${coilAnim}
          <!-- 背沿：深一档的同形线，错一格，框就有了厚度 -->
          <g transform="translate(1.1,1.8)" opacity=".40">
            <path d="M -6.5 2 V -12 H -33 V -32 Q -33 -38 -27 -38 H 0" fill="none" stroke="#20303c" stroke-width="2.4"/>
            <path d="M 6.5 2 V -12 H 33 V -32 Q 33 -38 27 -38 H 0" fill="none" stroke="#20303c" stroke-width="2.4"/>
          </g>
          <!-- 左半（蓝）：从引线顶端绕到框顶中线 -->
          <path d="M -6.5 2 V -12 H -33 V -32 Q -33 -38 -27 -38 H 0"
            fill="none" stroke="#3f90d8" stroke-width="2.6" stroke-linejoin="round"/>
          <!-- 右半（红）：同一形，clip 在 x=0 处硬切 -->
          <g clip-path="url(#${cid}rhalf)">
            <path d="M 6.5 2 V -12 H 33 V -32 Q 33 -38 27 -38 H 0"
              fill="none" stroke="#d9434e" stroke-width="2.6" stroke-linejoin="round"/>
          </g>
        </g>
      </g>

      <!-- 换向环：两段（左蓝右红）带上下两个缺口，缺口就在两条引线落下的地方 -->
      <g transform="translate(101.9,156)">
        <g>${ringAnim}
          <path d="M ${segTopBlue[0]} ${segTopBlue[1]} A 15.2 15.2 0 0 1 ${segBotBlue[0]} ${segBotBlue[1]}"
            fill="none" stroke="#2e9ae8" stroke-width="8.4" stroke-linecap="butt"/>
          <path d="M ${segTopRed[0]} ${segTopRed[1]} A 15.2 15.2 0 0 1 ${segBotRed[0]} ${segBotRed[1]}"
            fill="none" stroke="#e0424e" stroke-width="8.4" stroke-linecap="butt"/>
          <path d="M -12 -9 A 15.2 15.2 0 0 1 -4 -14.8" fill="none" stroke="rgba(255,255,255,.40)" stroke-width="2.4"/>
          <path d="M 12 9 A 15.2 15.2 0 0 1 4 14.8" fill="none" stroke="rgba(255,255,255,.28)" stroke-width="2.4"/>
          <circle r="19.4" fill="none" stroke="rgba(0,0,0,.30)" stroke-width="1.2"/>
          <circle r="11" fill="none" stroke="rgba(0,0,0,.34)" stroke-width="1.4"/>
        </g>
        <circle r="7.4" fill="#2b3037"/>
        <circle r="7.4" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="1.1"/>
        <circle r="3.2" fill="#3d444d"/>
      </g>

      <!-- 引线压在环上的"焊点"：两条引线的末端确实搭在两段换向片上 -->
      <g transform="translate(101.9,156)">
        <path d="M -6.5 -19.6 L -6.5 -14.4" stroke="#3f90d8" stroke-width="2.8"/>
        <path d="M 6.5 -19.6 L 6.5 -14.4" stroke="#d9434e" stroke-width="2.8"/>
        <circle cx="-6.5" cy="-15.4" r="2.1" fill="#7cbcee"/>
        <circle cx="6.5" cy="-15.4" r="2.1" fill="#ec7d85"/>
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

















