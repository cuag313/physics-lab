/**
 * 移除所有R3F实验中的<Overlay>标签
 * 保留内部的ControlPanel等HTML内容
 * ExperimentScene会自动检测并把HTML内容移到Canvas外面
 */
const fs = require('fs')
const path = require('path')

const expDir = path.join(__dirname, 'src/components/experiments')
const files = fs.readdirSync(expDir).filter(f => f.endsWith('.jsx'))

let modified = 0
let skipped = 0

for (const file of files) {
  const filePath = path.join(expDir, file)
  let content = fs.readFileSync(filePath, 'utf-8')
  
  // 只处理有Overlay的R3F实验
  if (!content.includes('<Overlay>') && !content.includes('<Overlay ')) continue
  
  let changed = false
  
  // 1. 移除Overlay import
  const importBefore = content
  content = content.replace(/import\s+\{[^}]*\bOverlay\b[^}]*\}\s+from\s+['"][^'"]*Overlay['"]\s*\n?/g, '')
  if (content !== importBefore) changed = true
  
  // 2. 移除<Overlay>和</Overlay>标签（保留内部内容和缩进）
  const before = content
  // 处理 <Overlay> 开始标签（可能有属性）
  content = content.replace(/(\s*)<Overlay[^>]*>\s*\n?/g, '')
  // 处理 </Overlay> 结束标签
  content = content.replace(/\s*<\/Overlay>\s*\n?/g, '\n')
  
  if (content !== before) changed = true
  
  if (changed) {
    fs.writeFileSync(filePath, content, 'utf-8')
    console.log(`✅ ${file}`)
    modified++
  } else {
    skipped++
  }
}

console.log(`\n完成: ${modified} 修改, ${skipped} 跳过`)
