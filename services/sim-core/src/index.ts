import { runEconomicSystem as econRun, defaultEconomicConfig } from './systems/EconomicSystem';
import { runPoliticalSystem as polRun } from './systems/PoliticalSystem';
import { runEventSystem } from './systems/EventSystem';
import { runDecisionSystem } from './systems/DecisionSystem';
import { runWarSystem } from './systems/WarSystem';

export interface EconomicConfig {
  incomePopDivisor?: number; // income from population: pop / divisor
  incomePerMarketTier?: number; // per settlement market tier
  armyMaintenancePerStrength?: number; // cost per strength point
  baseBureaucracy?: number; // fixed per-state cost per tick
  bureaucracyPerTerritory?: number; // add-on per owned cell/territory
}

export class SimCore {
  private prisma?: any;
  private memTick = 0;
  private llm: any;
  private econ: Required<EconomicConfig> = {
    incomePopDivisor: 100,
    incomePerMarketTier: 5,
    armyMaintenancePerStrength: 0.02,
    baseBureaucracy: 100,
    bureaucracyPerTerritory: 1,
  };

  constructor(prisma?: any, econ?: EconomicConfig) {
    this.prisma = prisma;
    if (econ) {
      this.econ = { ...this.econ, ...econ };
    }
    // Optional LLM proxy is disabled in core build to avoid hard dependency
    this.llm = null;
  }

  async getCurrentTick(): Promise<number> {
    if (this.prisma) {
      const t = await this.prisma.tickState.upsert({
        where: { id: 1 },
        update: {},
        create: { id: 1, currentTick: 0 },
      });
      return t.currentTick;
    }
    return this.memTick;
  }

  async runTick(count: number): Promise<number> {
    // 1) Advance the world clock persistently or in-memory
    let newTick: number;
    if (this.prisma) {
      const t = await this.prisma.tickState.upsert({
        where: { id: 1 },
        update: {},
        create: { id: 1, currentTick: 0 },
      });
      const n = await this.prisma.tickState.update({ where: { id: 1 }, data: { currentTick: t.currentTick + count } });
      newTick = n.currentTick;
    } else {
      this.memTick += count;
      newTick = this.memTick;
    }

    // 2) Scheduler — fixed order systems, and collect messages
    if (this.prisma) {
  await polRun(this.prisma, newTick);
  console.debug(`[SimCore] Political System executed at tick ${newTick}`);
  await runWarSystem(this.prisma, newTick);
  console.debug(`[SimCore] War System executed at tick ${newTick}`);
      // Map local econ config to system config
      const cfg = {
        incomePopDivisor: this.econ.incomePopDivisor,
        incomePerMarketTier: this.econ.incomePerMarketTier,
        armyUpkeepPerStrength: this.econ.armyMaintenancePerStrength,
        bureaucracyBase: this.econ.baseBureaucracy,
        bureaucracyPerTerritory: this.econ.bureaucracyPerTerritory,
      } as typeof defaultEconomicConfig;
      await econRun(this.prisma, newTick, cfg);
      console.debug(`[SimCore] Economic System executed at tick ${newTick}`);
    } else {
      console.debug(`[SimCore] (no-DB) Systems skipped at tick ${newTick}`);
    }
    // Event System (Suggestions/Narratives)
    await runEventSystem(this.prisma, this.llm, newTick);
    console.debug(`[SimCore] Event System executed at tick ${newTick}`);

    // Decision System (AI Decisions / Effects)
    await runDecisionSystem(this.prisma, this.llm, newTick);
    console.debug(`[SimCore] Decision System executed at tick ${newTick}`);

    return newTick;
  }

  // former economic/political system logic moved into systems/* modules
}
