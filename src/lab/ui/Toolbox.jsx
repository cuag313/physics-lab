import { useState, useEffect } from 'react'

/**
 * 器材工具箱 v2
 * - 根据实验类别只显示对应器材
 * - 每个器材有icon（可替换为图片）
 */

const INSTRUMENT_CATEGORIES = {
  electric: {
    name: '电学器材',
    icon: '⚡',
    items: [
      { type: 'battery', name: '电池', icon: '🔋', desc: '提供电压' },
      { type: 'resistor', name: '电阻', icon: '⚡', desc: '限流元件' },
      { type: 'bulb', name: '小灯泡', icon: '💡', desc: '发光指示' },
      { type: 'switch', name: '开关', icon: '🔌', desc: '通断控制' },
      { type: 'ammeter', name: '电流表', icon: 'Ⓐ', desc: '测电流' },
      { type: 'voltmeter', name: '电压表', icon: 'Ⓥ', desc: '测电压' },
      { type: 'rheostat', name: '滑动变阻器', icon: '🔧', desc: '可变电阻' },
    ]
  },
  optics: {
    name: '光学器材',
    icon: '🔬',
    items: [
      { type: 'lightSource', name: '光源', icon: '🕯️', desc: '发射光线' },
      { type: 'convexLens', name: '凸透镜', icon: '🔍', desc: '汇聚光线' },
      { type: 'concaveLens', name: '凹透镜', icon: '🔎', desc: '发散光线' },
      { type: 'planeMirror', name: '平面镜', icon: '🪞', desc: '反射光线' },
      { type: 'screen', name: '光屏', icon: '📺', desc: '接收成像' },
    ]
  },
  mechanics: {
    name: '力学器材',
    icon: '⚙️',
    items: [
      { type: 'spring', name: '弹簧', icon: '🌀', desc: '弹性元件' },
      { type: 'pulley', name: '滑轮', icon: '⚙️', desc: '改变力方向' },
      { type: 'weight', name: '砝码', icon: '🏋️', desc: '施加拉力' },
    ]
  },
  thermal: {
    name: '热学器材',
    icon: '🌡️',
    items: [
      { type: 'thermometer', name: '温度计', icon: '🌡️', desc: '测温度' },
      { type: 'heater', name: '加热器', icon: '🔥', desc: '提供热量' },
    ]
  },
  sound: {
    name: '声学器材',
    icon: '🔊',
    items: [
      { type: 'tuningFork', name: '音叉', icon: '🔔', desc: '发声体' },
      { type: 'oscilloscope', name: '示波器', icon: '📊', desc: '显示波形' },
    ]
  },
}

// 图标映射：将emoji替换为图片路径
// 示例：ICON_MAP['battery'] = '/instruments/electric/battery.png'
const ICON_MAP = {
  // 电学
  // battery: '/instruments/electric/battery.png',
  // bulb: '/instruments/electric/bulb.png',
  // 光学（已准备好图片）
  // convexLens: '/instruments/optics/convex-lens.jpg',
  // concaveLens: '/instruments/optics/lens.png',
  // planeMirror: '/instruments/optics/plane-mirror.png',
  // screen: '/instruments/optics/screen.png',
  // lightSource: '/instruments/optics/candle.jpg',
}

export default function Toolbox({ onAddInstrument, visible = true, category = null }) {
  // 获取当前类别的器材列表
  const catKey = category && INSTRUMENT_CATEGORIES[category] ? category : 'electric'
  const cat = INSTRUMENT_CATEGORIES[catKey]

  if (!visible) return null

  return (
    <div style={styles.container}>
      {/* 类别标题 */}
      <div style={styles.header}>
        <span style={styles.headerIcon}>{cat.icon}</span>
        <span style={styles.headerText}>{cat.name}</span>
      </div>

      {/* 器材列表 */}
      <div style={styles.itemList}>
        {cat.items.map(item => (
          <div
            key={item.type}
            style={styles.item}
            onClick={() => onAddInstrument(item.type)}
            title={`点击添加${item.name}`}
          >
            {/* Icon区域（可替换为图片） */}
            <div style={styles.iconBox}>
              {ICON_MAP[item.type] ? (
                <img
                  src={ICON_MAP[item.type]}
                  alt={item.name}
                  style={styles.iconImg}
                />
              ) : (
                <span style={styles.iconEmoji}>{item.icon}</span>
              )}
            </div>

            {/* 名称和描述 */}
            <div style={styles.itemInfo}>
              <span style={styles.itemName}>{item.name}</span>
              <span style={styles.itemDesc}>{item.desc}</span>
            </div>
          </div>
        ))}
      </div>

      {/* 底部提示 */}
      <div style={styles.footer}>
        <div style={styles.tip}>💡 点击器材添加到实验台</div>
        <div style={styles.tip}>🖱️ 拖拽移动器材位置</div>
      </div>
    </div>
  )
}

const styles = {
  container: {
    width: 180,
    background: '#161b22',
    borderRight: '1px solid #30363d',
    display: 'flex',
    flexDirection: 'column',
    overflowY: 'auto',
    userSelect: 'none',
  },
  header: {
    padding: '12px 14px',
    borderBottom: '1px solid #30363d',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    background: '#0d1117',
  },
  headerIcon: { fontSize: 18 },
  headerText: {
    fontSize: 14,
    fontWeight: 600,
    color: '#c9d1d9',
  },
  itemList: {
    padding: '4px 0',
    flex: 1,
  },
  item: {
    padding: '8px 12px',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    cursor: 'pointer',
    transition: 'background 0.15s',
    borderBottom: '1px solid #21262d',
  },
  iconBox: {
    width: 40,
    height: 40,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#0d1117',
    borderRadius: 6,
    border: '1px solid #30363d',
    flexShrink: 0,
  },
  iconImg: {
    width: 36,
    height: 36,
    objectFit: 'contain',
    borderRadius: 4,
  },
  iconEmoji: {
    fontSize: 22,
  },
  itemInfo: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
  },
  itemName: {
    fontSize: 13,
    color: '#c9d1d9',
    fontWeight: 500,
  },
  itemDesc: {
    fontSize: 10,
    color: '#484f58',
    marginTop: 2,
  },
  footer: {
    padding: '10px 14px',
    borderTop: '1px solid #30363d',
  },
  tip: {
    fontSize: 10,
    color: '#484f58',
    lineHeight: 1.6,
  },
}
