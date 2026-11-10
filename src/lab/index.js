// 新架构统一导出
export { default as ExperimentBench } from './ui/ExperimentBench'
export { default as Toolbox } from './ui/Toolbox'
export { default as DataPanel } from './ui/DataPanel'
export { default as SceneShell } from './ui/SceneShell'
export { default as ConclusionCard } from './ui/ConclusionCard'
export { createRecorder, rowsToTable } from './ui/DataRecorder'
// 3D 栈已收敛为 simple3d + lab3d；ElectricLab3DScene / three 系列已移入 _archive
export { PhysicsScene } from './core/PhysicsScene'
export { SceneRenderer } from './renderers/SceneRenderer'
export { CircuitEngine } from './engines/CircuitEngine'
export * from './instruments'
export * from './scenes'
