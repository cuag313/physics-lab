/**
 * 场景懒加载注册表
 *
 * 105 个实验各自一个 dynamic import() —— 打包后一实验一 chunk，
 * 只有用户点开某个实验时才下载它的代码；首屏只需要目录 + 实验台外壳。
 *
 * lazy() 本身不触发下载，真正的 import() 发生在组件第一次渲染时，
 * 因此这里在模块加载期建 105 个 lazy 包装对象的开销可以忽略。
 */

import { lazy } from 'react'

/** 实验 key → 加载器（key 与 catalog.js 中的 key 一一对应） */
const LOADERS = {
  convexLensImaging: () => import('./ConvexLensImaging'),
  concaveLensImaging: () => import('./ConcaveLensImaging'),
  reflectionLaw: () => import('./ReflectionLawScene'),
  planeMirrorImage: () => import('./PlaneMirrorImageScene'),
  glassRefraction: () => import('./GlassRefractionScene'),
  interferenceDiffraction: () => import('./InterferenceDiffractionScene'),
  prismDispersion: () => import('./PrismDispersionScene'),
  leverBalance: () => import('./LeverBalanceScene'),
  frictionForce: () => import('./FrictionForceScene'),
  projectileMotion: () => import('./ProjectileMotionScene'),
  newtonSecondLaw: () => import('./NewtonSecondLawScene'),
  springForce: () => import('./SpringForceScene'),
  hookeLaw: () => import('./HookeLawScene'),
  densityMeasurement: () => import('./DensityMeasurementScene'),
  uniformAccel: () => import('./UniformAccelScene'),
  parallelogramRule: () => import('./ParallelogramRuleScene'),
  archimedesPrinciple: () => import('./ArchimedesPrincipleScene'),
  floatSink: () => import('./FloatSinkScene'),
  pressureEffect: () => import('./PressureEffectScene'),
  liquidPressure: () => import('./LiquidPressureScene'),
  pascalPrinciple: () => import('./PascalPrincipleScene'),
  atmosphericPressure: () => import('./AtmosphericPressureScene'),
  bernoulliPrinciple: () => import('./BernoulliPrincipleScene'),
  pulleyEfficiency: () => import('./PulleyEfficiencyScene'),
  energyConservation: () => import('./EnergyConservationScene'),
  collisionLab: () => import('./CollisionLabScene'),
  momentumConservation: () => import('./CollisionLabScene'),
  newtonFirstLaw: () => import('./NewtonFirstLawScene'),
  newtonThirdLaw: () => import('./NewtonThirdLawScene'),
  circularMotion: () => import('./CircularMotionScene'),
  galileoFreeFall: () => import('./GalileoFreeFallScene'),
  keplerLaws: () => import('./KeplerLawsScene'),
  universalGravitation: () => import('./UniversalGravitationScene'),
  pendulum: () => import('./PendulumScene'),
  simpleHarmonicMotion: () => import('./SimpleHarmonicMotionScene'),
  cosmicVelocity: () => import('./CosmicVelocityScene'),
  rocket: () => import('./RocketScene'),
  soundWave: () => import('./SoundWaveScene'),
  soundPropagation: () => import('./SoundPropagationScene'),
  soundPitch: () => import('./SoundPitchScene'),
  soundLoudness: () => import('./SoundLoudnessScene'),
  soundTimbre: () => import('./SoundTimbreScene'),
  soundNoise: () => import('./SoundNoiseScene'),
  soundResonance: () => import('./SoundResonanceScene'),
  soundString: () => import('./SoundStringScene'),
  soundPipe: () => import('./SoundPipeScene'),
  soundDoppler: () => import('./SoundDopplerScene'),
  soundInterference: () => import('./SoundInterferenceScene'),
  soundEcho: () => import('./SoundEchoScene'),
  photoelectric: () => import('./PhotoelectricScene'),
  rutherford: () => import('./RutherfordScene'),
  bohr: () => import('./BohrScene'),
  radioactiveDecay: () => import('./RadioactiveDecayScene'),
  blackbody: () => import('./BlackbodyScene'),
  electronDoubleSlit: () => import('./ElectronDoubleSlitScene'),
  nuclearReaction: () => import('./NuclearReactionScene'),
  relativity: () => import('./RelativityScene'),
  compton: () => import('./ComptonScene'),
  millikan: () => import('./MillikanScene'),
  meltingCurve: () => import('./MeltingCurveScene'),
  boilingWater: () => import('./BoilingWaterScene'),
  specificHeat: () => import('./SpecificHeatScene'),
  brownianMotion: () => import('./BrownianMotionScene'),
  diffusion: () => import('./DiffusionScene'),
  evaporation: () => import('./EvaporationScene'),
  phaseChange: () => import('./PhaseChangeScene'),
  oilFilmMethod: () => import('./OilFilmMethodScene'),
  gasLaws: () => import('./GasLawsScene'),
  thermodynamicsFirst: () => import('./ThermodynamicsFirstScene'),
  carnotEngine: () => import('./CarnotEngineScene'),
  electricEnergy: () => import('./ElectricEnergyScene'),
  ostersExperiment: () => import('./OstersExperimentScene'),
  electricMotor: () => import('./ElectricMotorScene'),
  electromagneticInduction: () => import('./ElectromagneticInductionScene'),
  coulombLaw: () => import('./CoulombLawScene'),
  electricFieldLine: () => import('./ElectricFieldLineScene'),
  electricPotential: () => import('./ElectricPotentialScene'),
  capacitorCharge: () => import('./CapacitorChargeScene'),
  closedCircuitOhm: () => import('./ClosedCircuitOhmScene'),
  practiceRheostat: () => import('./PracticeRheostatScene'),
  simpleCircuit: () => import('./SimpleCircuitScene'),
  seriesParallel: () => import('./SeriesParallelScene'),
  meterConversion: () => import('./MeterConversionScene'),
  faradayLaw: () => import('./FaradayLawScene'),
  selfInduction: () => import('./SelfInductionScene'),
  alternatingCurrent: () => import('./AlternatingCurrentScene'),
  lorentzForce: () => import('./LorentzForceScene'),
  hallEffect: () => import('./HallEffectScene'),
  jouleLaw: () => import('./JouleLawScene'),
  electromagnet: () => import('./ElectromagnetScene'),
  emfInternalResistance: () => import('./EmfInternalResistanceScene'),
  ohmsLaw: () => import('./OhmsLawScene'),
  bulbPower: () => import('./VoltAmpereResistorScene'),
  voltAmpereResistor: () => import('./VoltAmpereResistorScene'),
  multimeter: () => import('./MultimeterScene'),
  ampereForce: () => import('./AmpereForceScene'),
  lenzLaw: () => import('./LenzLawScene'),
  measureSpeed: () => import('./MeasureSpeedScene'),
  refractionLaw: () => import('./RefractionLawScene'),
  totalInternalReflection: () => import('./TotalInternalReflectionScene'),
  lightPolarization: () => import('./LightPolarizationScene'),
  transformer: () => import('./TransformerScene'),
  electricFieldDeflection: () => import('./ElectricFieldDeflectionScene'),
  bulbIVCurve: () => import('./BulbIVCurveScene'),
  voltAmpereMethodHS: () => import('./VoltAmpereMethodHSScene'),
  electricLab3D: () => import('./ElectricSvgLabScene'),
}

/** 固定预设参数（与改造前 LabPage 里写死的比照一致） */
const PROPS = {
  convexLensImaging: {
    preset: { focalLength: 1.0 },
  },
  concaveLensImaging: {
    preset: { focalLength: 1.0 },
  },
  reflectionLaw: {
    preset: { mirrorAngle: 90 },
  },
  planeMirrorImage: {
    preset: { objX: -3, objH: 1.0 },
  },
  glassRefraction: {
    preset: { n: 1.5 },
  },
  collisionLab: {
    defaultTab: 'lab',
  },
  momentumConservation: {
    defaultTab: 'conservation',
  },
  bulbPower: {
    title: '伏安法测小灯泡电功率',
  },
}

const CACHE = new Map()

/**
 * 取实验场景组件。同一 key 返回同一个 lazy 组件实例，
 * 避免每次 render 生成新组件导致整棵场景树被 remount。
 * @returns {{Component: import('react').LazyExoticComponent<any>, props: object} | null}
 */
export function getScene(key) {
  if (!key || !LOADERS[key]) return null
  let entry = CACHE.get(key)
  if (!entry) {
    entry = { Component: lazy(LOADERS[key]), props: PROPS[key] ?? {} }
    CACHE.set(key, entry)
  }
  return entry
}

/** 是否已有懒加载实现（false 表示回落到通用实验台 ExperimentBench） */
export function hasScene(key) {
  return !!LOADERS[key]
}

export const SCENE_KEYS = Object.keys(LOADERS)
