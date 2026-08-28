/**
 * Batch script to wrap HTML elements in <Overlay> for all experiments
 * that use R3F Canvas.
 * 
 * Pattern: find ControlPanel and other HTML-heavy components used inside
 * experiments that also import from @react-three/fiber, and wrap them
 * in <Overlay>...</Overlay> so they render outside the Canvas.
 */
const fs = require('fs')
const path = require('path')

const expDir = path.join(__dirname, 'src/components/experiments')

// Components that should be wrapped in Overlay (HTML-heavy UI components)
const UI_COMPONENTS = [
  'ControlPanel', 'DataCard', 'ParamSlider', 'ActionButton',
  'FormulaDisplay', 'StatusIndicator', 'ToggleGroup', 'OptionSelector',
  'DataTable'
]

const files = fs.readdirSync(expDir).filter(f => f.endsWith('.jsx'))

let modified = 0
let skipped = 0

for (const file of files) {
  const filePath = path.join(expDir, file)
  let content = fs.readFileSync(filePath, 'utf-8')
  
  // Check if this file uses R3F
  if (!content.includes('@react-three/fiber')) {
    skipped++
    continue
  }
  
  // Check if already wrapped in Overlay
  if (content.includes('<Overlay>')) {
    console.log(`⏭️  ${file}: Already has Overlay`)
    skipped++
    continue
  }
  
  // Check if it uses any UI components
  const usesUI = UI_COMPONENTS.some(comp => content.includes(`<${comp}`))
  if (!usesUI) {
    console.log(`⏭️  ${file}: No UI components found`)
    skipped++
    continue
  }
  
  // Add Overlay import if not present
  if (!content.includes("from '../common/Overlay'")) {
    // Find the last import line
    const importLines = content.split('\n')
    let lastImportIdx = -1
    for (let i = 0; i < importLines.length; i++) {
      if (importLines[i].startsWith('import ')) {
        lastImportIdx = i
      }
    }
    if (lastImportIdx >= 0) {
      importLines.splice(lastImportIdx + 1, 0, "import { Overlay } from '../common/Overlay'")
      content = importLines.join('\n')
    }
  }
  
  // Find the main return statement and wrap UI components in Overlay
  // Strategy: find the return ( ... ) and wrap consecutive UI component blocks
  
  // Find the last "return (" in the file (main render return)
  const lastReturnIdx = content.lastIndexOf('return (')
  if (lastReturnIdx === -1) {
    console.log(`⚠️  ${file}: No return statement found`)
    skipped++
    continue
  }
  
  // Get the return statement content
  const returnContent = content.substring(lastReturnIdx)
  
  // Check if return uses fragment (<>...</>)
  const fragmentStart = returnContent.indexOf('<>')
  const fragmentEnd = returnContent.lastIndexOf('</>')
  
  if (fragmentStart === -1 || fragmentEnd === -1) {
    // Not a fragment - might be a single element like <group>
    // Check if there are UI components as siblings
    console.log(`⚠️  ${file}: Not a fragment, skipping auto-wrap`)
    skipped++
    continue
  }
  
  // Find UI component blocks inside the fragment
  // We need to find top-level UI components and wrap them
  const fragmentContent = returnContent.substring(fragmentStart, fragmentEnd + 3)
  
  // Strategy: find each top-level UI component and wrap it in Overlay
  // Top-level means direct children of the fragment, not nested
  
  let newFragment = fragmentContent
  let changesMade = false
  
  // Find each UI component that appears at the top level
  for (const comp of UI_COMPONENTS) {
    // Find opening tags like <ControlPanel or <ControlPanel>
    const openTagRegex = new RegExp(`(\\s*)(<${comp}[\\s/>])`, 'g')
    let match
    
    while ((match = openTagRegex.exec(newFragment)) !== null) {
      const matchStart = match.index
      const indent = match[1]
      
      // Check if this is a top-level element (direct child of fragment)
      // Count the nesting level by looking at what comes before
      const beforeMatch = newFragment.substring(0, matchStart)
      const lastNewline = beforeMatch.lastIndexOf('\n')
      const lineStart = lastNewline + 1
      const linePrefix = beforeMatch.substring(lineStart)
      
      // Simple heuristic: if the line starts with spaces and then the component,
      // and the indentation is at the fragment's child level (usually 6-8 spaces)
      const trimmedPrefix = linePrefix.trimStart()
      if (!trimmedPrefix.startsWith(`<${comp}`)) {
        continue // Not at the start of a line, skip
      }
      
      // Find the matching closing tag
      const closingTag = `</${comp}>`
      const closingRegex = new RegExp(`</${comp}>`, 'g')
      closingRegex.lastIndex = matchStart + match[0].length
      
      // Handle nested components - count opening and closing tags
      let depth = 1
      let searchStart = matchStart + match[0].length
      let closingIdx = -1
      
      // Simple approach: find the matching closing tag by counting
      const openRegex = new RegExp(`<${comp}[\\s/>]`, 'g')
      const closeRegex = new RegExp(`</${comp}>`, 'g')
      
      const allOpens = []
      const allCloses = []
      
      let m
      while ((m = openRegex.exec(newFragment)) !== null) {
        if (m.index >= matchStart) allOpens.push(m.index)
      }
      while ((m = closeRegex.exec(newFragment)) !== null) {
        allCloses.push(m.index)
      }
      
      // Find the matching close for our open
      let openCount = 0
      for (let i = 0; i < allOpens.length; i++) {
        if (allOpens[i] === matchStart) {
          openCount = 1
          // Find the close at the same depth
          for (let j = 0; j < allCloses.length; j++) {
            if (allCloses[j] > allOpens[i]) {
              // Check if there's another open before this close
              let opensBeforeClose = 0
              for (let k = i + 1; k < allOpens.length; k++) {
                if (allOpens[k] < allCloses[j]) opensBeforeClose++
              }
              if (opensBeforeClose === 0) {
                closingIdx = allCloses[j]
                break
              }
            }
          }
          break
        }
      }
      
      if (closingIdx === -1) {
        // Try simple self-closing or no-children pattern
        const simpleClose = newFragment.indexOf(`</${comp}>`, matchStart)
        if (simpleClose !== -1) {
          closingIdx = simpleClose
        } else {
          continue
        }
      }
      
      const closingTagLen = closingTag.length
      const componentBlock = newFragment.substring(matchStart, closingIdx + closingTagLen)
      
      // Check if already wrapped in Overlay
      const beforeBlock = newFragment.substring(Math.max(0, matchStart - 20), matchStart)
      if (beforeBlock.includes('<Overlay>')) {
        continue
      }
      
      // Wrap in Overlay
      const wrapped = `<Overlay>\n${indent}${componentBlock}\n${indent}</Overlay>`
      newFragment = newFragment.substring(0, matchStart) + wrapped + newFragment.substring(closingIdx + closingTagLen)
      changesMade = true
      
      // Re-create regex since string changed
      break // Process one at a time, restart
    }
    
    if (changesMade) break // Restart for each component type
  }
  
  if (changesMade) {
    // Replace the fragment in the content
    content = content.substring(0, lastReturnIdx + fragmentStart) + newFragment + content.substring(lastReturnIdx + fragmentEnd)
    fs.writeFileSync(filePath, content, 'utf-8')
    console.log(`✅ ${file}: Wrapped UI components in Overlay`)
    modified++
  } else {
    console.log(`⏭️  ${file}: No changes needed`)
    skipped++
  }
}

console.log(`\nDone: ${modified} modified, ${skipped} skipped`)
