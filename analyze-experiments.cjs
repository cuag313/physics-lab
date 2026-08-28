/**
 * 自动重构实验组件：
 * 1. 提取hooks到useXxxState hook
 * 2. 提取3D场景到XxxScene组件
 * 3. 主组件组合两者
 * 
 * 转换前：
 *   export default function AirplaneAssembly() {
 *     const [x, setX] = useState()
 *     return (<>  <ControlPanel>x</ControlPanel>  <mesh/></>)
 *   }
 * 
 * 转换后：
 *   function useAirplaneAssemblyState() {
 *     const [x, setX] = useState()
 *     return { x, setX }
 *   }
 *   function AirplaneAssemblyScene({ x }) { return (<mesh/>) }
 *   export default function AirplaneAssembly() {
 *     const state = useAirplaneAssemblyState()
 *     return (<>  <ControlPanel>{state.x}</ControlPanel>  <AirplaneAssemblyScene {...state} /></>)
 *   }
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

// 分析实验文件
function analyzeExperiment(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8')
  
  // 找export default function
  const exportMatch = content.match(/export\s+default\s+function\s+(\w+)/)
  if (!exportMatch) return null
  
  const funcName = exportMatch[1]
  const funcStart = content.indexOf(exportMatch[0])
  
  // 找函数体的开始和结束
  const bodyStart = content.indexOf('{', funcStart + exportMatch[0].length)
  let depth = 0
  let bodyEnd = -1
  for (let i = bodyStart; i < content.length; i++) {
    if (content[i] === '{') depth++
    else if (content[i] === '}') {
      depth--
      if (depth === 0) { bodyEnd = i; break }
    }
  }
  if (bodyEnd === -1) return null
  
  const funcBody = content.substring(bodyStart + 1, bodyEnd)
  
  // 找return语句
  const returnMatch = funcBody.match(/return\s*\(/)
  if (!returnMatch) return null
  
  const returnStart = funcBody.indexOf(returnMatch[0])
  
  // 找hooks部分（return之前）
  const hooksPart = funcBody.substring(0, returnStart)
  
  // 找JSX部分（return之后）
  const jsxPart = funcBody.substring(returnStart + returnMatch[0].length)
  
  return { funcName, funcStart, bodyStart, bodyEnd, funcBody, hooksPart, jsxPart, content }
}

// 测试
for (const file of files) {
  const filePath = path.join(expDir, file)
  const result = analyzeExperiment(filePath)
  if (!result) continue
  
  // 检查是否有Overlay
  if (!result.content.includes('<Overlay>')) continue
  
  console.log(`\n=== ${file} ===`)
  console.log(`函数名: ${result.funcName}`)
  console.log(`Hooks部分长度: ${result.hooksPart.length}`)
  console.log(`JSX部分长度: ${result.jsxPart.length}`)
  
  // 找hooks中使用的state变量
  const stateVars = []
  const setterPattern = /const\s+\[(\w+),\s*(\w+)\]\s*=/g
  let m
  while ((m = setterPattern.exec(result.hooksPart)) !== null) {
    stateVars.push({ name: m[1], setter: m[2] })
  }
  console.log(`State变量: ${stateVars.map(v => v.name).join(', ')}`)
  
  // 找return中的Overlay内容
  const overlayMatch = result.jsxPart.match(/<Overlay[^>]*>([\s\S]*?)<\/Overlay>/)
  if (overlayMatch) {
    console.log(`Overlay内容长度: ${overlayMatch[1].length}`)
  }
  
  // 只分析前3个
  if (files.indexOf(file) >= 3) break
}
