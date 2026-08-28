/**
 * 自动重构实验组件：将Overlay内的ControlPanel提取为独立UI函数
 * 
 * 转换前：
 *   export default function Exp() {
 *     return (<><Overlay><ControlPanel>...</ControlPanel></Overlay><mesh/></>)
 *   }
 * 
 * 转换后：
 *   function ExpUI() { return (<ControlPanel>...</ControlPanel>) }
 *   export default function Exp() {
 *     return (<><ExpUI/><mesh/></>)
 *   }
 * 
 * 这样ExperimentScene可以把UI渲染到Canvas外面
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
        // self-closing
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
  if (!content.includes('@react-three/fiber')) continue
  
  // 找到export default function
  const exportMatch = content.match(/export\s+default\s+function\s+(\w+)/)
  if (!exportMatch) {
    console.log(`⏭️ ${file}: 找不到export default function`)
    skipped++
    continue
  }
  const funcName = exportMatch[1]
  const uiFuncName = funcName + 'UI'
  
  // 找到所有Overlay块的位置
  const overlayOpens = []
  const regex = /<Overlay[\s>]/g
  let m
  while ((m = regex.exec(content)) !== null) {
    overlayOpens.push(m.index)
  }
  
  if (overlayOpens.length === 0) {
    console.log(`⏭️ ${file}: 找不到<Overlay>`)
    skipped++
    continue
  }
  
  // 处理每个Overlay块（从后往前避免偏移问题）
  const overlayBlocks = []
  for (let i = overlayOpens.length - 1; i >= 0; i--) {
    const openIdx = overlayOpens[i]
    const closeIdx = findMatchingClose(content, openIdx, '<Overlay', '</Overlay>')
    if (closeIdx === -1) {
      console.log(`⚠️ ${file}: 找不到</Overlay>闭合标签`)
      continue
    }
    
    // 提取Overlay内的内容（去掉<Overlay>和</Overlay>标签）
    const overlayBlock = content.substring(openIdx, closeIdx)
    const innerMatch = overlayBlock.match(/<Overlay[^>]*>([\s\S]*)<\/Overlay>/)
    if (!innerMatch) continue
    
    let innerContent = innerMatch[1].trim()
    
    // 获取缩进
    const lineStart = content.lastIndexOf('\n', openIdx) + 1
    const indent = content.substring(lineStart, openIdx).match(/^(\s*)/)[1]
    
    overlayBlocks.push({ openIdx, closeIdx, innerContent, indent })
  }
  
  if (overlayBlocks.length === 0) {
    console.log(`⏭️ ${file}: 无法提取Overlay内容`)
    skipped++
    continue
  }
  
  // 从后往前替换：把<Overlay>...</Overlay>替换为函数调用
  let newContent = content
  for (const block of overlayBlocks) {
    const callStr = block.indent + `<${uiFuncName} />`
    newContent = newContent.substring(0, block.openIdx) + callStr + newContent.substring(block.closeIdx)
  }
  
  // 收集所有Overlay内的内容，合并为UI函数
  const uiBody = overlayBlocks.map(b => b.innerContent).join('\n\n')
  
  // 找到合适的位置插入UI函数（在export default function之前）
  const exportIdx = newContent.indexOf(exportMatch[0])
  const uiFunc = `function ${uiFuncName}() {\n  return (\n    <>\n      ${uiBody.split('\n').join('\n      ')}\n    </>\n  )\n}\n\n`
  
  newContent = newContent.substring(0, exportIdx) + uiFunc + newContent.substring(exportIdx)
  
  // 移除Overlay import（如果不再使用）
  if (!newContent.includes('<Overlay>') && !newContent.includes('<Overlay ')) {
    newContent = newContent.replace(/import\s+\{[^}]*Overlay[^}]*\}\s+from\s+['"][^'"]*Overlay['"]\n?/g, '')
  }
  
  fs.writeFileSync(filePath, newContent, 'utf-8')
  console.log(`✅ ${file}: 提取了 ${overlayBlocks.length} 个Overlay块为 ${uiFuncName}`)
  success++
}

console.log(`\n完成: ${success} 成功, ${skipped} 跳过`)
if (errors.length) console.log('错误:', errors)
