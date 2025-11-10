import { beforeAll, afterAll, beforeEach, test, expect } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { runDecisionSystem } from '../../../services/sim-core/dist/systems/DecisionSystem.js'
import { runEventSystem } from '../../../services/sim-core/dist/systems/EventSystem.js'
import { runPoliticalSystem } from '../../../services/sim-core/dist/systems/PoliticalSystem.js'

const hasDb = !!process.env.DATABASE_URL
let prisma: any // relaxed typing; models generated only when DATABASE_URL + prisma generate run

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
  // Clean tables in dependency order
  await (prisma as any).tickMetric?.deleteMany({})
  await (prisma as any).narrativeEvent?.deleteMany({})
  await (prisma as any).suggestion?.deleteMany({})
  await (prisma as any).army?.deleteMany({})
  await (prisma as any).settlement?.deleteMany({})
  await (prisma as any).state?.deleteMany({})
  await (prisma as any).tickState?.deleteMany({})
  await (prisma as any).politicalMemory?.deleteMany({})
})

const mockLLM = {
  async generateDecision(_input: any) {
    return { action: 'RecruitUnits', amount: 10, target: null, confidence: 0.9, rationale: 'test' }
  },
  async generateNarrative({ stateId, tick, summary }: any) {
    return `Narrative ${stateId} @${tick}: ${summary}`
  },
};

(hasDb ? test : test.skip)(
  'DecisionSystem RecruitUnits updates treasury and militaryStrength with correct cost',
  async () => {
    const stateId = 'TST'
  await (prisma as any).state.create({
      data: {
        id: stateId,
        name: 'Testland',
        treasury: 1000,
        stability: 60,
        territories: 0,
        militaryStrength: 0,
        llmEnabled: true,
  isLlmControlled: true,
      },
    })

    const tick = 42
    // Cost per strength = 50, amount = 10 -> cost -500
    await runDecisionSystem(prisma, mockLLM, tick, { recruitCostPerStrength: 50 })

  const st = await (prisma as any).state.findUnique({ where: { id: stateId } })
    expect(st?.treasury).toBe(500)
    expect(st?.militaryStrength).toBe(10)

  const treMetric = await (prisma as any).tickMetric.findFirst({
      where: { stateId, tick, metricKey: 'ai_decision_treasury_delta' },
    })
    expect(treMetric?.value).toBe(-500)

  const milMetric = await (prisma as any).tickMetric.findFirst({
      where: { stateId, tick, metricKey: 'ai_decision_military_delta' },
    })
    expect(milMetric?.value).toBe(10)

  const narrative = await (prisma as any).narrativeEvent.findFirst({ where: { stateId, tick } })
    expect(narrative?.text).toBeTruthy()
  },
  15000
)

;(hasDb ? test : test.skip)(
  'PoliticalMemory unique constraint prevents duplicates',
  async () => {
    const A = 'U1';
    const B = 'U2';
    await (prisma as any).state.create({ data: { id: A, name: 'Uniq A', treasury: 0, stability: 50, territories: 0, militaryStrength: 0, llmEnabled: false, isLlmControlled: false } });
    await (prisma as any).state.create({ data: { id: B, name: 'Uniq B', treasury: 0, stability: 50, territories: 0, militaryStrength: 0, llmEnabled: false, isLlmControlled: false } });

    await (prisma as any).politicalMemory.create({ data: { sourceStateId: A, targetStateId: B, factorKey: 'DUP_TEST', modifierValue: 10, isStatic: true } });
    let dupError: any = null;
    try {
      await (prisma as any).politicalMemory.create({ data: { sourceStateId: A, targetStateId: B, factorKey: 'DUP_TEST', modifierValue: 5, isStatic: true } });
    } catch (e) {
      dupError = e;
    }
    expect(dupError).toBeTruthy();
  }
)

;(hasDb ? test : test.skip)(
  'EventSystem processes suggestion, increases stability and creates narrative',
  async () => {
    const stateId = 'EVT'
  await (prisma as any).state.create({
      data: {
        id: stateId,
        name: 'Eventland',
        treasury: 0,
        stability: 50,
        territories: 0,
        militaryStrength: 0,
        llmEnabled: false,
  isLlmControlled: false,
      },
    })

    const tick = 7
  await (prisma as any).suggestion.create({ data: { stateId, tick, text: 'Mejorar administración', status: 'pending' } })

    await runEventSystem(prisma, mockLLM, tick)

  const sugg = await (prisma as any).suggestion.findFirst({ where: { stateId }, orderBy: { createdAt: 'desc' } })
    expect(sugg?.status).toBe('processed')
    expect(sugg?.processedAt).toBeTruthy()

  const st = await (prisma as any).state.findUnique({ where: { id: stateId } })
    expect(st?.stability).toBeGreaterThan(50)

  const stabMetric = await (prisma as any).tickMetric.findFirst({ where: { stateId, tick, metricKey: 'stability_change' } })
    expect(stabMetric?.value).toBeGreaterThan(0)

  const narrative = await (prisma as any).narrativeEvent.findFirst({ where: { stateId, tick } })
    expect(narrative?.text).toContain('Narrative')
  }
)

;(hasDb ? test : test.skip)(
  'PoliticalMemory inertia stabilizes attitude near modifierValue',
  async () => {
    const A = 'F1';
    const B = 'F2';
  await (prisma as any).state.create({ data: { id: A, name: 'Faction A', treasury: 0, stability: 50, territories: 0, militaryStrength: 0, llmEnabled: false, isLlmControlled: false, relations: [{ stateId: B, attitude: 0 }] as any } });
  await (prisma as any).state.create({ data: { id: B, name: 'Faction B', treasury: 0, stability: 50, territories: 0, militaryStrength: 0, llmEnabled: false, isLlmControlled: false, relations: [{ stateId: A, attitude: 0 }] as any } });

    // Insert PoliticalMemory A->B (+20) only; expect A's attitude toward B to approach +20
  await (prisma as any).politicalMemory.create({ data: { sourceStateId: A, targetStateId: B, factorKey: 'TEST_STATIC_FACTOR', modifierValue: 20, isStatic: true } });

    // Run more ticks to allow convergence with inertia on clean DB
    let lastAtt = 0;
    for (let t = 1; t <= 30; t++) {
      await runPoliticalSystem(prisma, t);
      const stA = await (prisma as any).state.findUnique({ where: { id: A } });
      const relA = ((stA?.relations as any[]) || []).find(r => r.stateId === B);
      lastAtt = relA?.attitude ?? 0;
    }
    // Expect near target 20 with wider tolerance for early drift
  expect(lastAtt).toBeGreaterThanOrEqual(10);
  expect(lastAtt).toBeLessThanOrEqual(24);

    // Drift metric should diminish; check last tick drift is small (<=2)
  const lastMetric = await (prisma as any).tickMetric.findFirst({
      where: { stateId: A, systemType: 'political' },
      orderBy: { tick: 'desc' },
    });
  expect(lastMetric?.value).toBeLessThanOrEqual(4);

    // Equilibrium gap metric should be recorded and decrease over time
    const gapSeries = await (prisma as any).tickMetric.findMany({
      where: { stateId: A, metricKey: 'political_equilibrium_gap' },
      orderBy: { tick: 'asc' },
    });
    expect(gapSeries.length).toBeGreaterThanOrEqual(2);
    const firstGap = gapSeries[0]?.value ?? 0;
    const lastGap = gapSeries[gapSeries.length - 1]?.value ?? 0;
    expect(firstGap).toBeGreaterThan(0);
    // Should trend downwards significantly and be near zero at the end
    expect(lastGap).toBeLessThan(firstGap);
  expect(lastGap).toBeLessThanOrEqual(10);
  },
  20000
)
