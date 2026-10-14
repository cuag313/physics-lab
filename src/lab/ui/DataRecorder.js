/**
 * DataRecorder — 实验数据记录（跨渲染保留）
 *
 * 用法：
 *   const rec = createRecorder('ohmsLaw')
 *   rec.record({ U: 3, I: 0.3 })
 *   rec.rows() → [{U, I}, ...]
 *   rec.clear()
 *
 * 自动点：recordAuto(key, fn) 在条件满足时打点，避免重复。
 */

const stores = new Map()

export function createRecorder(key) {
  if (!stores.has(key)) {
    stores.set(key, { rows: [], autoKeys: new Set() })
  }
  const store = stores.get(key)

  return {
    key,
    record(row) {
      store.rows.push({ ...row, _t: Date.now() })
      return store.rows.length
    },
    rows() {
      return store.rows.map(({ _t, ...rest }) => rest)
    },
    raw() {
      return [...store.rows]
    },
    clear() {
      store.rows = []
      store.autoKeys.clear()
    },
    get length() {
      return store.rows.length
    },
    /** 条件打点：同一 autoKey 只记一次 */
    recordOnce(autoKey, row) {
      if (store.autoKeys.has(autoKey)) return false
      store.autoKeys.add(autoKey)
      this.record(row)
      return true
    },
  }
}

export function getRecorder(key) {
  return createRecorder(key)
}

export function clearRecorder(key) {
  stores.delete(key)
}

/** 从记录行提取成 ConclusionCard 的 dataRows（保留数值列） */
export function rowsToTable(rows, columns) {
  if (!rows.length) return []
  const cols = columns ?? Object.keys(rows[0]).filter((k) => !k.startsWith('_'))
  return rows.map((r) => {
    const o = {}
    for (const c of cols) {
      const v = r[c]
      o[c] = typeof v === 'number' ? (Number.isInteger(v) ? v : v.toFixed(2)) : v
    }
    return o
  })
}
