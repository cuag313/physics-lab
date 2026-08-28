/**
 * 修复被破坏的import：在ControlPanel等UI组件前面补回 import {
 */
const fs = require('fs')
const path = require('path')

const expDir = path.join(__dirname, 'src/components/experiments')
const files = fs.readdirSync(expDir).filter(f => f.endsWith('.jsx'))

// UI组件名列表（出现在import语句中的）
const UI_COMPONENTS = [
  'ControlPanel', 'DataCard', 'ParamSlider', 'ActionButton', 'FormulaDisplay',
  'StatusIndicator', 'DataTable', 'ToggleGroup', 'OptionSelector', 'StepIndicator',
  'LineChart', 'Line', 'XAxis', 'YAxis', 'CartesianGrid', 'Tooltip',
  'ResponsiveContainer', 'BarChart', 'Bar', 'Cell', 'AreaChart', 'Area',
  'Legend', 'ReferenceLine', 'RechartsLine'
]

let fixed = 0

for (const file of files) {
  const filePath = path.join(expDir, file)
  let content = fs.readFileSync(filePath, 'utf-8')
  
  if (!content.includes('registerUI')) continue
  
  const lines = content.split('\n')
  let changed = false
  
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    
    // 检查是否是孤立的UI组件行（没有import {在前面）
    if (UI_COMPONENTS.some(c => trimmed.startsWith(c + ',') || trimmed.startsWith(c + ' ') || trimmed === c)) {
      // 往上找，看是否有import {在前面
      let hasImport = false
      for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
        const prevLine = lines[j].trim()
        if (prevLine.includes('import {') || prevLine.includes('import{')) {
          hasImport = true
          break
        }
        if (prevLine === '' || prevLine.startsWith('//') || prevLine.startsWith('/*') || prevLine.startsWith('*')) continue
        break // 遇到非空非注释行，停止
      }
      
      if (!hasImport) {
        lines[i] = 'import {\n' + lines[i]
        changed = true
      }
    }
  }
  
  if (changed) {
    fs.writeFileSync(filePath, lines.join('\n'), 'utf-8')
    console.log(`✅ ${file}`)
    fixed++
  }
}

console.log(`\n修复了 ${fixed} 个文件`)
