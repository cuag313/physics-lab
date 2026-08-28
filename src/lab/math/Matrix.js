/**
 * 矩阵运算库 — 用于MNA电路求解
 * 纯数值计算，无外部依赖
 */

/**
 * 创建 n×m 零矩阵
 */
export function zeros(n, m = n) {
  return Array.from({ length: n }, () => new Float64Array(m))
}

/**
 * 创建 n 维零向量
 */
export function zerosVec(n) {
  return new Float64Array(n)
}

/**
 * 深拷贝矩阵
 */
export function clone(A) {
  return A.map(row => new Float64Array(row))
}

/**
 * 高斯消元法求解 Ax = b（部分主元选取）
 * 返回解向量 x，原地修改 A 和 b
 */
export function solve(A, b) {
  const n = A.length
  if (n === 0) return zerosVec(0)

  // 增广矩阵
  const aug = A.map((row, i) => {
    const extended = new Float64Array(n + 1)
    extended.set(row)
    extended[n] = b[i]
    return extended
  })

  // 前向消元（部分主元选取）
  for (let col = 0; col < n; col++) {
    // 选主元
    let maxRow = col
    let maxVal = Math.abs(aug[col][col])
    for (let row = col + 1; row < n; row++) {
      const val = Math.abs(aug[row][col])
      if (val > maxVal) {
        maxVal = val
        maxRow = row
      }
    }

    // 奇异矩阵检测
    if (maxVal < 1e-12) {
      console.warn(`Matrix singular at column ${col}, pivot=${maxVal}`)
      continue
    }

    // 交换行
    if (maxRow !== col) {
      const tmp = aug[col]
      aug[col] = aug[maxRow]
      aug[maxRow] = tmp
    }

    // 消元
    const pivot = aug[col][col]
    for (let row = col + 1; row < n; row++) {
      const factor = aug[row][col] / pivot
      for (let j = col; j <= n; j++) {
        aug[row][j] -= factor * aug[col][j]
      }
    }
  }

  // 回代
  const x = zerosVec(n)
  for (let i = n - 1; i >= 0; i--) {
    if (Math.abs(aug[i][i]) < 1e-12) {
      x[i] = 0 // 自由变量设为0
      continue
    }
    let sum = aug[i][n]
    for (let j = i + 1; j < n; j++) {
      sum -= aug[i][j] * x[j]
    }
    x[i] = sum / aug[i][i]
  }

  return x
}

/**
 * 矩阵加法 A += B（原地）
 */
export function addInPlace(A, B) {
  for (let i = 0; i < A.length; i++) {
    for (let j = 0; j < A[i].length; j++) {
      A[i][j] += B[i][j]
    }
  }
  return A
}

/**
 * 向量加法 a += b（原地）
 */
export function addVecInPlace(a, b) {
  for (let i = 0; i < a.length; i++) {
    a[i] += b[i]
  }
  return a
}
