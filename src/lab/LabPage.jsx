/**
 * LabPage — 实验平台主页
 *
 * 实验目录 + 实验台
 * 点击目录中的实验卡片直接进入对应实验
 */

import { useState, useCallback } from 'react'
import ExperimentBench from './ui/ExperimentBench'
import ConvexLensImaging from './scenes/ConvexLensImaging'
import ConcaveLensImaging from './scenes/ConcaveLensImaging'
import ReflectionLawScene from './scenes/ReflectionLawScene'
import PlaneMirrorImageScene from './scenes/PlaneMirrorImageScene'
import GlassRefractionScene from './scenes/GlassRefractionScene'
import InterferenceDiffractionScene from './scenes/InterferenceDiffractionScene'
import PrismDispersionScene from './scenes/PrismDispersionScene'
import LeverBalanceScene from './scenes/LeverBalanceScene'
import FrictionForceScene from './scenes/FrictionForceScene'
import ProjectileMotionScene from './scenes/ProjectileMotionScene'
import NewtonSecondLawScene from './scenes/NewtonSecondLawScene'
import SpringForceScene from './scenes/SpringForceScene'
import HookeLawScene from './scenes/HookeLawScene'
import DensityMeasurementScene from './scenes/DensityMeasurementScene'
import UniformAccelScene from './scenes/UniformAccelScene'
import ParallelogramRuleScene from './scenes/ParallelogramRuleScene'
import ArchimedesPrincipleScene from './scenes/ArchimedesPrincipleScene'
import PressureEffectScene from './scenes/PressureEffectScene'
import LiquidPressureScene from './scenes/LiquidPressureScene'
import PulleyEfficiencyScene from './scenes/PulleyEfficiencyScene'
import EnergyConservationScene from './scenes/EnergyConservationScene'
import MomentumConservationScene from './scenes/MomentumConservationScene'
import CollisionLabScene from './scenes/CollisionLabScene'
import MeasureSpeedScene from './scenes/MeasureSpeedScene'
import BuoyancyFactorsScene from './scenes/BuoyancyFactorsScene'
import FloatSinkScene from './scenes/FloatSinkScene'
import PascalPrincipleScene from './scenes/PascalPrincipleScene'
import AtmosphericPressureScene from './scenes/AtmosphericPressureScene'
import BernoulliPrincipleScene from './scenes/BernoulliPrincipleScene'
import NewtonFirstLawScene from './scenes/NewtonFirstLawScene'
import NewtonThirdLawScene from './scenes/NewtonThirdLawScene'
import CircularMotionScene from './scenes/CircularMotionScene'
import GalileoFreeFallScene from './scenes/GalileoFreeFallScene'
import KeplerLawsScene from './scenes/KeplerLawsScene'
import UniversalGravitationScene from './scenes/UniversalGravitationScene'
import CosmicVelocityScene from './scenes/CosmicVelocityScene'
import RocketScene from './scenes/RocketScene'
import SoundWaveScene from './scenes/SoundWaveScene'
import { PRESETS } from './scenes'
import { EXPERIMENT_CATALOG, CATEGORIES, DIFFICULTY_LABELS } from './scenes/catalog'

export default function LabPage({ onBack }) {
  const [currentExperiment, setCurrentExperiment] = useState(null)
  const [showCatalog, setShowCatalog] = useState(true)
  const [activeCategory, setActiveCategory] = useState('mechanics')

  const handleSelectExperiment = useCallback((exp) => {
    if (exp.comingSoon) return
    setCurrentExperiment(exp)
    setShowCatalog(false)
  }, [])

  const handleBackToCatalog = useCallback(() => {
    setShowCatalog(true)
    setCurrentExperiment(null)
  }, [])

  // 获取当前实验的预设
  const getPreset = useCallback(() => {
    if (!currentExperiment) return null
    if (currentExperiment.preset && PRESETS[currentExperiment.preset]) {
      return PRESETS[currentExperiment.preset]
    }
    return null
  }, [currentExperiment])

  // 目录页
  if (showCatalog) {
    const filteredExps = EXPERIMENT_CATALOG.filter(e => e.category === activeCategory)

    return (
      <div style={styles.catalogPage}>
        {/* 顶部导航 */}
        <div style={styles.catalogHeader}>
          {onBack && (
            <div style={styles.backBtn} onClick={onBack}>← 返回</div>
          )}
          <div style={styles.catalogTitle}>
            <span style={styles.catalogLogo}>🔬</span>
            <span>物理仿真实验室</span>
          </div>
          <div style={styles.catalogSubtitle}>课程标准 · 交互仿真 · 实时数据</div>
        </div>

        {/* 分类标签 */}
        <div style={styles.categoryTabs}>
          {CATEGORIES.map(cat => {
            const count = EXPERIMENT_CATALOG.filter(e => e.category === cat.key).length
            const ready = EXPERIMENT_CATALOG.filter(e => e.category === cat.key && !e.comingSoon).length
            return (
              <div
                key={cat.key}
                style={{
                  ...styles.categoryTab,
                  borderColor: activeCategory === cat.key ? cat.color : 'transparent',
                  background: activeCategory === cat.key ? `${cat.color}15` : 'transparent',
                }}
                onClick={() => setActiveCategory(cat.key)}
              >
                <span style={styles.categoryIcon}>{cat.icon}</span>
                <span style={{
                  ...styles.categoryName,
                  color: activeCategory === cat.key ? cat.color : '#8b949e',
                }}>
                  {cat.name}
                </span>
                <span style={styles.categoryCount}>{ready}/{count}</span>
              </div>
            )
          })}
        </div>

        {/* 实验卡片网格 */}
        <div style={styles.experimentGrid}>
          {filteredExps.map(exp => (
            <div
              key={exp.key}
              style={{
                ...styles.experimentCard,
                opacity: exp.comingSoon ? 0.5 : 1,
                cursor: exp.comingSoon ? 'not-allowed' : 'pointer',
                borderColor: exp.comingSoon ? '#21262d' : '#30363d',
              }}
              onClick={() => handleSelectExperiment(exp)}
            >
              {/* 卡片头部 */}
              <div style={styles.cardHeader}>
                <span style={styles.cardIcon}>
                  {CATEGORIES.find(c => c.key === exp.category)?.icon ?? '🔬'}
                </span>
                <div style={styles.cardBadges}>
                  {exp.examLevel && (
                    <span style={{
                      fontSize: 11,
                      color: exp.examLevel === '★★★' ? '#f44336' : exp.examLevel === '★★' ? '#FF9800' : '#8b949e',
                      background: exp.examLevel === '★★★' ? 'rgba(244,67,54,0.1)' : exp.examLevel === '★★' ? 'rgba(255,152,0,0.1)' : 'rgba(139,148,158,0.1)',
                      padding: '2px 8px',
                      borderRadius: 4,
                    }}>
                      {exp.examLevel}
                    </span>
                  )}
                  <span style={styles.difficultyBadge}>
                    {DIFFICULTY_LABELS[exp.difficulty]}
                  </span>
                  <span style={styles.gradeBadge}>{exp.grade}</span>
                  {exp.beyondCurriculum && (
                    <span style={styles.beyondBadge} title={exp.beyondReason || '超出中学物理课标'}>超纲</span>
                  )}
                </div>
              </div>

              {/* 卡片内容 */}
              <div style={styles.cardBody}>
                <div style={styles.cardName}>{exp.name}</div>
                <div style={styles.cardDesc}>{exp.description}</div>
              </div>

              {/* 标签 */}
              <div style={styles.cardTags}>
                {exp.tags.map(tag => (
                  <span key={tag} style={styles.tag}>{tag}</span>
                ))}
              </div>

              {/* 状态指示 */}
              {exp.comingSoon ? (
                <div style={styles.comingSoon}>🔜 即将上线</div>
              ) : (
                <div style={styles.startHint}>▶ 点击进入实验</div>
              )}
            </div>
          ))}
        </div>

        {/* 底部统计 */}
        <div style={styles.catalogFooter}>
          <span>
            共 {EXPERIMENT_CATALOG.length} 个实验，
            已上线 {EXPERIMENT_CATALOG.filter(e => !e.comingSoon).length} 个，
            超纲 {EXPERIMENT_CATALOG.filter(e => e.beyondCurriculum).length} 个
          </span>
        </div>
      </div>
    )
  }

  // 实验台
  return (
    <div style={styles.labContainer}>
      <div style={styles.labHeader}>
        <div style={styles.backToCatalog} onClick={handleBackToCatalog}>
          ← 返回目录
        </div>
        <div style={styles.labTitle}>
          <span>{CATEGORIES.find(c => c.key === currentExperiment?.category)?.icon}</span>
          <span>{currentExperiment?.name ?? '自由实验'}</span>
        </div>
        <div style={styles.labMeta}>
          <span>{currentExperiment?.grade}</span>
          <span>{DIFFICULTY_LABELS[currentExperiment?.difficulty ?? 0]}</span>
          {currentExperiment?.beyondCurriculum && (
            <span style={{
              fontSize: 11,
              color: '#e6db74',
              background: 'rgba(230,219,116,0.15)',
              padding: '2px 8px',
              borderRadius: 4,
            }} title={currentExperiment?.beyondReason || '超出中学物理课标'}>
              超纲
            </span>
          )}
        </div>
      </div>

      <div style={styles.labBody}>
        {currentExperiment?.key === 'convexLensImaging' ? (
          <ConvexLensImaging
            preset={{ focalLength: 1.0 }}
          />
        ) : currentExperiment?.key === 'concaveLensImaging' ? (
          <ConcaveLensImaging
            preset={{ focalLength: 1.0 }}
          />
        ) : currentExperiment?.key === 'reflectionLaw' ? (
          <ReflectionLawScene
            preset={{ mirrorAngle: 90 }}
          />
        ) : currentExperiment?.key === 'planeMirrorImage' ? (
          <PlaneMirrorImageScene
            preset={{ objX: -3, objH: 1.0 }}
          />
        ) : currentExperiment?.key === 'glassRefraction' ? (
          <GlassRefractionScene
            preset={{ n: 1.5 }}
          />
        ) : currentExperiment?.key === 'interferenceDiffraction' ? (
          <InterferenceDiffractionScene />
        ) : currentExperiment?.key === 'prismDispersion' ? (
          <PrismDispersionScene />
        ) : currentExperiment?.key === 'leverBalance' ? (
          <LeverBalanceScene />
        ) : currentExperiment?.key === 'frictionForce' ? (
          <FrictionForceScene />
        ) : currentExperiment?.key === 'projectileMotion' ? (
          <ProjectileMotionScene />
        ) : currentExperiment?.key === 'newtonSecondLaw' ? (
          <NewtonSecondLawScene />
        ) : currentExperiment?.key === 'springForce' ? (
          <SpringForceScene />
        ) : currentExperiment?.key === 'hookeLaw' ? (
          <HookeLawScene />
        ) : currentExperiment?.key === 'densityMeasurement' ? (
          <DensityMeasurementScene />
        ) : currentExperiment?.key === 'uniformAccel' ? (
          <UniformAccelScene />
        ) : currentExperiment?.key === 'parallelogramRule' ? (
          <ParallelogramRuleScene />
        ) : currentExperiment?.key === 'archimedesPrinciple' ? (
          <ArchimedesPrincipleScene />
        ) : currentExperiment?.key === 'buoyancyFactors' ? (
          <BuoyancyFactorsScene />
        ) : currentExperiment?.key === 'floatSink' ? (
          <FloatSinkScene />
        ) : currentExperiment?.key === 'pressureEffect' ? (
          <PressureEffectScene />
        ) : currentExperiment?.key === 'liquidPressure' ? (
          <LiquidPressureScene />
        ) : currentExperiment?.key === 'pascalPrinciple' ? (
          <PascalPrincipleScene />
        ) : currentExperiment?.key === 'atmosphericPressure' ? (
          <AtmosphericPressureScene />
        ) : currentExperiment?.key === 'bernoulliPrinciple' ? (
          <BernoulliPrincipleScene />
        ) : currentExperiment?.key === 'pulleyEfficiency' ? (
          <PulleyEfficiencyScene />
        ) : currentExperiment?.key === 'energyConservation' ? (
          <EnergyConservationScene />
        ) : currentExperiment?.key === 'momentumConservation' ? (
          <MomentumConservationScene />
        ) : currentExperiment?.key === 'collisionLab' ? (
          <CollisionLabScene />
        ) : currentExperiment?.key === 'newtonFirstLaw' ? (
          <NewtonFirstLawScene />
        ) : currentExperiment?.key === 'newtonThirdLaw' ? (
          <NewtonThirdLawScene />
        ) : currentExperiment?.key === 'circularMotion' ? (
          <CircularMotionScene />
        ) : currentExperiment?.key === 'galileoFreeFall' ? (
          <GalileoFreeFallScene />
        ) : currentExperiment?.key === 'keplerLaws' ? (
          <KeplerLawsScene />
        ) : currentExperiment?.key === 'universalGravitation' ? (
          <UniversalGravitationScene />
        ) : currentExperiment?.key === 'cosmicVelocity' ? (
          <CosmicVelocityScene />
        ) : currentExperiment?.key === 'rocket' ? (
          <RocketScene />
        ) : currentExperiment?.key === 'soundWave' ? (
          <SoundWaveScene />
        ) : currentExperiment?.key === 'measureSpeed' ? (
          <MeasureSpeedScene />
        ) : (
          <ExperimentBench
            preset={getPreset()}
            title={currentExperiment?.name ?? '自由实验'}
            quickCircuit={currentExperiment?.quickCircuit ?? false}
            category={currentExperiment?.category ?? null}
          />
        )}
      </div>
    </div>
  )
}

const styles = {
  // ===== 目录页 =====
  catalogPage: {
    minHeight: '100vh',
    background: '#0d1117',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    display: 'flex',
    flexDirection: 'column',
  },
  catalogHeader: {
    padding: '32px 40px 0',
    textAlign: 'center',
  },
  backBtn: {
    position: 'absolute',
    top: 20,
    left: 20,
    padding: '6px 16px',
    background: '#161b22',
    color: '#8b949e',
    border: '1px solid #30363d',
    borderRadius: 6,
    fontSize: 13,
    cursor: 'pointer',
  },
  catalogTitle: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    fontSize: 28,
    fontWeight: 700,
    color: '#c9d1d9',
  },
  catalogLogo: { fontSize: 36 },
  catalogSubtitle: {
    fontSize: 14,
    color: '#8b949e',
    marginTop: 8,
  },

  // 分类标签
  categoryTabs: {
    display: 'flex',
    justifyContent: 'center',
    gap: 8,
    padding: '24px 40px 0',
  },
  categoryTab: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 20px',
    borderRadius: 8,
    border: '2px solid transparent',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  categoryIcon: { fontSize: 20 },
  categoryName: {
    fontSize: 15,
    fontWeight: 600,
  },
  categoryCount: {
    fontSize: 11,
    color: '#484f58',
    fontFamily: 'monospace',
  },

  // 实验卡片网格
  experimentGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: 16,
    padding: '24px 40px',
    flex: 1,
  },
  experimentCard: {
    background: '#161b22',
    border: '1px solid #30363d',
    borderRadius: 12,
    padding: 20,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    transition: 'all 0.2s',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardIcon: { fontSize: 28 },
  cardBadges: {
    display: 'flex',
    gap: 6,
  },
  difficultyBadge: {
    fontSize: 11,
    color: '#FFD700',
    background: 'rgba(255, 215, 0, 0.1)',
    padding: '2px 8px',
    borderRadius: 4,
  },
  gradeBadge: {
    fontSize: 11,
    color: '#8b949e',
    background: '#21262d',
    padding: '2px 8px',
    borderRadius: 4,
  },
  cardBody: {
    flex: 1,
  },
  cardName: {
    fontSize: 16,
    fontWeight: 600,
    color: '#c9d1d9',
    marginBottom: 6,
  },
  cardDesc: {
    fontSize: 13,
    color: '#8b949e',
    lineHeight: 1.5,
  },
  cardTags: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 4,
  },
  tag: {
    fontSize: 10,
    color: '#58a6ff',
    background: 'rgba(88, 166, 255, 0.1)',
    padding: '2px 8px',
    borderRadius: 4,
  },
  startHint: {
    fontSize: 12,
    color: '#4CAF50',
    fontWeight: 500,
    textAlign: 'center',
    padding: '6px 0',
    borderTop: '1px solid #21262d',
  },
  comingSoon: {
    fontSize: 12,
    color: '#484f58',
    textAlign: 'center',
    padding: '6px 0',
    borderTop: '1px solid #21262d',
  },
  beyondBadge: {
    fontSize: 10,
    color: '#e6db74',
    background: 'rgba(230,219,116,0.12)',
    padding: '1px 6px',
    borderRadius: 3,
    fontWeight: 600,
  },
  catalogFooter: {
    padding: '16px 40px',
    textAlign: 'center',
    fontSize: 12,
    color: '#484f58',
    borderTop: '1px solid #21262d',
  },

  // ===== 实验台 =====
  labContainer: {
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    background: '#0d1117',
  },
  labHeader: {
    height: 44,
    background: '#161b22',
    borderBottom: '1px solid #30363d',
    display: 'flex',
    alignItems: 'center',
    padding: '0 16px',
    gap: 16,
    flexShrink: 0,
  },
  backToCatalog: {
    padding: '4px 12px',
    background: '#21262d',
    color: '#c9d1d9',
    border: '1px solid #30363d',
    borderRadius: 4,
    fontSize: 12,
    cursor: 'pointer',
  },
  labTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 15,
    fontWeight: 600,
    color: '#c9d1d9',
  },
  labMeta: {
    display: 'flex',
    gap: 12,
    fontSize: 12,
    color: '#8b949e',
    marginLeft: 'auto',
  },
  labBody: {
    flex: 1,
    overflow: 'hidden',
  },
}
