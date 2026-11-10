/**
 * sandbox3d/SandboxRoot.jsx — 电学仿真实验室入口（2D / 3D 视图切换壳）
 *
 * 2D = 原 CircuitSandbox（电路图模式），3D = 新拟物实验台。
 * 两者读写同一个 sandbox3d/store.js，切换视图时电路模型与读数保持一致。
 */

import { useCircuitStore } from './store.js'
import CircuitSandbox from '../sandbox/CircuitSandbox.jsx'
import Sandbox3D from './Sandbox3D.jsx'

export default function SandboxRoot() {
  const mode = useCircuitStore((s) => s.mode)
  const setMode = useCircuitStore((s) => s.setMode)

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {mode === '2d' ? <CircuitSandbox /> : <Sandbox3D />}

      {/* 视图切换（浮层，两视图共用） */}
      <div style={styles.switch}>
        <button
          type="button"
          style={{ ...styles.btn, ...(mode === '2d' ? styles.active : null) }}
          onClick={() => setMode('2d')}
          title="电路图模式（原 2D 沙盒）"
        >
          📐 电路图
        </button>
        <button
          type="button"
          style={{ ...styles.btn, ...(mode === '3d' ? styles.active : null) }}
          onClick={() => setMode('3d')}
          title="3D 拟物实验台"
        >
          🧊 3D 拟物
        </button>
      </div>
    </div>
  )
}

const styles = {
  switch: {
    position: 'absolute', top: 6, left: '50%', transform: 'translateX(-50%)', zIndex: 120,
    display: 'flex', gap: 2, padding: 3,
    background: 'rgba(13,17,23,0.82)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 10,
    boxShadow: '0 6px 20px rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)',
  },
  btn: {
    padding: '4px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
    background: 'transparent', color: '#8b98a5', border: 'none', borderRadius: 7, whiteSpace: 'nowrap',
  },
  active: {
    background: 'rgba(90,169,255,0.22)', color: '#cfe4ff',
  },
}
