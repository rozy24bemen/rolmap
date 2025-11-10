import { beforeAll, afterAll, beforeEach, test, expect } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { runDecisionSystem } from '../../../services/sim-core/dist/systems/DecisionSystem.js'

const hasDb = !!process.env.DATABASE_URL
let prisma: any

beforeAll(async () => {
  if (!hasDb) return
  prisma = new PrismaClient()
  await prisma.$connect()
})

afterAll(async () => {
  if (!hasDb) return
  await prisma.$disconnect()
})

beforeEach(async () => {
  if (!hasDb) return
  await prisma.$executeRawUnsafe('DELETE FROM "TickMetric"')
  await prisma.$executeRawUnsafe('DELETE FROM "NarrativeEvent"')
  await prisma.$executeRawUnsafe('DELETE FROM "Suggestion"')
  await prisma.$executeRawUnsafe('DELETE FROM "Conflict"')
  await prisma.$executeRawUnsafe('DELETE FROM "Army"')
  await prisma.$executeRawUnsafe('DELETE FROM "Settlement"')
  await prisma.$executeRawUnsafe('DELETE FROM "State"')
  await prisma.$executeRawUnsafe('DELETE FROM "PoliticalMemory"')
  await prisma.$executeRawUnsafe('DELETE FROM "TickState"')
})

;(hasDb ? test : test.skip)(
  'AI AdjustSpending triggers when treasury is low and no war',
  async () => {
    await prisma.state.create({ data: { id: 'E1', name: 'Eco1', treasury: 100, stability: 50, territories: 0, militaryStrength: 0, llmEnabled: true, isLlmControlled: true, relations: [] } })
    const tick = 1
    await runDecisionSystem(prisma, null, tick)

    const st = await prisma.state.findUnique({ where: { id: 'E1' } })
    expect(st.treasury).toBe(200) // +100 from heuristic

    const metric = await prisma.tickMetric.findFirst({ where: { stateId: 'E1', tick, metricKey: 'ai_decision_treasury_delta' } })
    expect(metric?.value).toBe(100)
  },
  10000
)

;(hasDb ? test : test.skip)(
  'AI RecruitUnits triggers when weaker than hostile average and treasury surplus',
  async () => {
    await prisma.state.create({ data: { id: 'H1', name: 'Hostile1', treasury: 0, stability: 50, territories: 0, militaryStrength: 50, llmEnabled: false, isLlmControlled: false } })
    await prisma.state.create({ data: { id: 'M1', name: 'Mil1', treasury: 2000, stability: 50, territories: 0, militaryStrength: 10, llmEnabled: true, isLlmControlled: true, relations: [{ stateId: 'H1', attitude: -60 }] as any } })

    const tick = 2
    await runDecisionSystem(prisma, null, tick, { recruitCostPerStrength: 50 })

    const st = await prisma.state.findUnique({ where: { id: 'M1' } })
    // recruit amount = min(20, floor((2000-500)/50)) = min(20, 30) = 20
    expect(st.militaryStrength).toBe(30)
    expect(st.treasury).toBe(2000 - (20 * 50))

    const milMetric = await prisma.tickMetric.findFirst({ where: { stateId: 'M1', tick, metricKey: 'ai_decision_military_delta' } })
    expect(milMetric?.value).toBe(20)
  },
  10000
)

;(hasDb ? test : test.skip)(
  'AI RecruitUnits suppressed when not weaker than hostile average',
  async () => {
    await prisma.state.create({ data: { id: 'H2', name: 'Hostile2', treasury: 0, stability: 50, territories: 0, militaryStrength: 5, llmEnabled: false, isLlmControlled: false } })
    await prisma.state.create({ data: { id: 'M2', name: 'Mil2', treasury: 2000, stability: 50, territories: 0, militaryStrength: 20, llmEnabled: true, isLlmControlled: true, relations: [{ stateId: 'H2', attitude: -60 }] as any } })

    const tick = 3
    await runDecisionSystem(prisma, null, tick, { recruitCostPerStrength: 50 })

    const st = await prisma.state.findUnique({ where: { id: 'M2' } })
    expect(st.militaryStrength).toBe(20) // unchanged
    const milMetric = await prisma.tickMetric.findFirst({ where: { stateId: 'M2', tick, metricKey: 'ai_decision_military_delta' } })
    expect(milMetric).toBeNull()
  },
  10000
)
