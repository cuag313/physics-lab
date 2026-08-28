/**
 * 自动重构：把<Overlay>替换为registerUI调用
 * 
 * 转换规则：
 * 1. import { Overlay } → import { registerUI }
 * 2. <Overlay>内容</Overlay> → ui.set(内容) + 从return中移除
 * 3. 在函数体开头添加 const ui = registerUI('函数名')
 */
const fs = require('fs')
const path = require('path')

const expDir = path.join(__dirname, 'src/components/experiments')
const files = fs.readdirSync(expDir).filter(f => f.endsWith('.jsx'))

function findMatchingClose(content, openIdx, openTag, closeTag) {
  let depth = 0
  let i = openIdx
  while (i < content.length) {
    if (content.substring(i, i + openTag.length) === openTag) {
      const tagEnd = content.indexOf('>', i)
      if (tagEnd !== -1 && content[tagEnd - 1] === '/') {
      } else {
        depth++
      }
      i += openTag.length
    } else if (content.substring(i, i + closeTag.length) === closeTag) {
      depth--
      if (depth === 0) return i + closeTag.length
      i += closeTag.length
    } else {
      i++
    }
  }
  return -1
}

let success = 0
let skipped = 0
let errors = []

for (const file of files) {
  const filePath = path.join(expDir, file)
  let content = fs.readFileSync(filePath, 'utf-8')
  
  // 只处理有Overlay的R3F实验
  if (!content.includes('<Overlay>') && !content.includes('<Overlay ')) continue
  
  const funcMatch = content.match(/export\s+default\s+function\s+(\w+)/)
  if (!funcMatch) {
    console.log(`⏭️ ${file}: 找不到export default function`)
    skipped++
    continue
  }
  const funcName = funcMatch[1]
  
  try {
    // 1. 替换import
    content = content.replace(
      /import\s+\{[^}]*\bOverlay\b[^}]*\}\s+from\s+['"][^'"]*Overlay['"]\s*\n?/g,
      "import { registerUI } from '../../utils/ui-registry'\n"
    )
    
    // 2. 找到所有Overlay块
    const overlayBlocks = []
    const regex = /<Overlay[^>]*>/g
    let m
    while ((m = regex.exec(content)) !== null) {
      const openIdx = m.index
      const closeIdx = findMatchingClose(content, openIdx, '<Overlay', '</Overlay>')
      if (closeIdx === -1) {
        console.log(`⚠️ ${file}: 找不到</Overlay>闭合`)
        continue
      }
      
      // 提取内部内容
      const fullBlock = content.substring(openIdx, closeIdx)
      const innerMatch = fullBlock.match(/<Overlay[^>]*>([\s\S]*)<\/Overlay>/)
      if (!innerMatch) continue
      
      let inner = innerMatch[1].trim()
      
      // 获取缩进
      const lineStart = content.lastIndexOf('\n', openIdx) + 1
      const indent = content.substring(lineStart, openIdx).match(/^(\s*)/)[1]
      
      overlayBlocks.push({ openIdx, closeIdx, inner, indent })
    }
    
    if (overlayBlocks.length === 0) {
      console.log(`⏭️ ${file}: 无Overlay块`)
      skipped++
      continue
    }
    
    // 3. 从后往前替换Overlay块为ui.set()调用
    for (let i = overlayBlocks.length - 1; i >= 0; i--) {
      const block = overlayBlocks[i]
      const replacement = block.indent + `ui.set(\n${block.indent}  ${block.inner.split('\n').join('\n' + block.indent + '  ')}\n${block.indent})`
      content = content.substring(0, block.openIdx) + replacement + content.substring(block.closeIdx)
    }
    
    // 4. 在函数体开头添加ui注册
    const funcStart = content.indexOf(funcMatch[0])
    const bodyStart = content.indexOf('{', funcStart + funcMatch[0].length)
    
    // 找到第一个非空行的缩进
    const afterBrace = content.substring(bodyStart + 1)
    const firstLineMatch = afterBrace.match(/\n(\s*)\S/)
    const bodyIndent = firstLineMatch ? firstLineMatch[1] : '  '
    
    const uiDecl = `\n${bodyIndent}const ui = registerUI('${funcName}')\n`
    content = content.substring(0, bodyStart + 1) + uiDecl + content.substring(bodyStart + 1)
    
    // 5. 清理多余空行
    content = content.replace(/\n{3,}/g, '\n\n')
    
    fs.writeFileSync(filePath, content, 'utf-8')
    console.log(`✅ ${file}: ${overlayBlocks.length}个Overlay → registerUI('${funcName}')`)
    success++
  } catch (err) {
    console.log(`❌ ${file}: ${err.message}`)
    errors.push({ file, error: err.message })
  }
}

console.log(`\n完成: ${success} 成功, ${skipped} 跳过, ${errors.length} 错误`)
if (errors.length) {
  console.log('错误详情:')
  errors.forEach(e => console.log(`  ${e.file}: ${e.error}`))
}
