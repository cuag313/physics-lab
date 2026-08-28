/**
 * 批量给实验组件的ControlPanel包裹<Overlay>
 * 策略：找到每个实验文件中的 <ControlPanel 开始标签和对应的 </ControlPanel> 结束标签，
 * 在外面包裹 <Overlay>...</Overlay>，并添加import。
 */
const fs = require('fs')
const path = require('path')

const expDir = path.join(__dirname, 'src/components/experiments')
const files = fs.readdirSync(expDir).filter(f => f.endsWith('.jsx'))

// 找到匹配的闭合标签位置
function findClosingTag(content, openIdx, tagName) {
  const openPattern = `<${tagName}`
  const closePattern = `</${tagName}>`
  let depth = 0
  let i = openIdx
  while (i < content.length) {
    if (content.substring(i, i + openPattern.length) === openPattern) {
      // 检查是否是自闭合
      const tagEnd = content.indexOf('>', i)
      if (tagEnd !== -1 && content[tagEnd - 1] === '/') {
        // 自闭合，不增加depth
      } else {
        depth++
      }
      i += openPattern.length
    } else if (content.substring(i, i + closePattern.length) === closePattern) {
      depth--
      if (depth === 0) {
        return i + closePattern.length
      }
      i += closePattern.length
    } else {
      i++
    }
  }
  return -1
}

let modified = 0
let skipped = 0

for (const file of files) {
  const filePath = path.join(expDir, file)
  let content = fs.readFileSync(filePath, 'utf-8')
  
  // 跳过不使用R3F的文件
  if (!content.includes('@react-three/fiber')) {
    continue
  }
  
  // 跳过已有Overlay的文件
  if (content.includes('<Overlay>') || content.includes('<Overlay ')) {
    console.log(`⏭️  ${file}: 已有Overlay`)
    skipped++
    continue
  }
  
  // 跳过不使用ControlPanel的文件
  if (!content.includes('<ControlPanel')) {
    console.log(`⏭️  ${file}: 无ControlPanel`)
    skipped++
    continue
  }
  
  // 添加import（如果还没有）
  if (!content.includes("from '../common/Overlay'")) {
    const lines = content.split('\n')
    let lastImportIdx = -1
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('import ')) lastImportIdx = i
    }
    if (lastImportIdx >= 0) {
      lines.splice(lastImportIdx + 1, 0, "import { Overlay } from '../common/Overlay'")
      content = lines.join('\n')
    }
  }
  
  // 找到所有 <ControlPanel 的位置并包裹
  let newContent = content
  let offset = 0
  let wrapCount = 0
  
  // 用正则找到所有 <ControlPanel 的位置
  const regex = /<ControlPanel[\s>]/g
  let match
  const positions = []
  while ((match = regex.exec(content)) !== null) {
    positions.push(match.index)
  }
  
  // 从后往前处理（避免偏移问题）
  for (let i = positions.length - 1; i >= 0; i--) {
    const openIdx = positions[i]
    const closeIdx = findClosingTag(content, openIdx, 'ControlPanel')
    
    if (closeIdx === -1) {
      console.log(`  ⚠️ ${file}: 找不到ControlPanel闭合标签 (第${i+1}个)`)
      continue
    }
    
    // 获取该行的缩进
    const lineStart = content.lastIndexOf('\n', openIdx) + 1
    const lineContent = content.substring(lineStart, openIdx)
    const indent = lineContent.match(/^(\s*)/)[1]
    
    // 包裹
    const block = content.substring(openIdx, closeIdx)
    const wrapped = `<Overlay>\n${indent}${block}\n${indent}</Overlay>`
    
    newContent = newContent.substring(0, openIdx) + wrapped + newContent.substring(closeIdx)
    wrapCount++
  }
  
  if (wrapCount > 0) {
    fs.writeFileSync(filePath, newContent, 'utf-8')
    console.log(`✅ ${file}: 包裹了 ${wrapCount} 个ControlPanel`)
    modified++
  } else {
    console.log(`⏭️  ${file}: 未处理`)
    skipped++
  }
}

console.log(`\n完成: ${modified} 个修改, ${skipped} 个跳过`)
