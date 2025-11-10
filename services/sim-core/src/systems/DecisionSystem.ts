export interface DecisionConfig {
  recruitCostPerStrength?: number;
}

export const defaultDecisionConfig: Required<DecisionConfig> = {
  recruitCostPerStrength: 50, // real recruitment cost model
};

export async function runDecisionSystem(prisma: any, llm: any, tick: number, config: DecisionConfig = {}) {
  if (!prisma) return;
  const cfg = { ...defaultDecisionConfig, ...config };

  try {
    const llmStates: Array<{ id: string; treasury: number; militaryStrength: number; stability: number; relations: any[] }> = await prisma.state.findMany({
      where: { OR: [{ isLlmControlled: true }, { llmEnabled: true }] as any },
      select: { id: true, treasury: true, militaryStrength: true, stability: true, relations: true },
    });

    // Gather war context: active conflicts + recent casualties
    const activeConflicts = await prisma.conflict.count({ where: { status: 'ACTIVE' } });
    const recentCas = await prisma.tickMetric.findMany({
      where: { systemType: 'war', metricKey: 'war_casualties', tick: { gte: tick - 5 } },
      select: { tick: true, value: true, stateId: true },
    });
    const casualtiesByState = recentCas.reduce((m: Record<string, number>, r: any) => {
      if (r.stateId) m[r.stateId] = (m[r.stateId] || 0) + Number(r.value || 0);
      return m;
    }, {} as Record<string, number>);

    const hostileStrengthAverageCache = new Map<string, number>();
    function computeHostileAverage(stateId: string, relations: any[]): number {
      if (hostileStrengthAverageCache.has(stateId)) return hostileStrengthAverageCache.get(stateId)!;
      const hostileIds = relations.filter(r => typeof r.attitude === 'number' && r.attitude < -40).map(r => r.stateId);
      if (hostileIds.length === 0) { hostileStrengthAverageCache.set(stateId, 0); return 0; }
      // Load strengths of hostile neighbors
      return prisma.state.findMany({ where: { id: { in: hostileIds } }, select: { militaryStrength: true } })
        .then((rows: Array<{ militaryStrength: number }>) => {
          const avg = rows.length ? rows.reduce((a: number, b: { militaryStrength: number }) => a + (b.militaryStrength || 0), 0) / rows.length : 0;
          hostileStrengthAverageCache.set(stateId, avg);
          return avg;
        });
    }

    for (const st of llmStates) {
      let decision: any;
      const econLow = st.treasury < 200;
      const inWar = activeConflicts > 0; // global war presence (could refine to per-state later)
      const recentLosses = casualtiesByState[st.id] || 0;
      const hostileAvg = await computeHostileAverage(st.id, (st.relations as any[]) || []);
      const weakerThanHostiles = hostileAvg > 0 && st.militaryStrength < hostileAvg;

      if (llm && typeof llm.generateDecision === 'function') {
        decision = await llm.generateDecision({ stateId: st.id, tick, econLow, inWar, recentLosses, hostileAvg, weakerThanHostiles });
      } else {
        // Fallback heuristic AI
        if (inWar && econLow) {
          decision = { action: 'AdjustSpending', amount: 50, confidence: 0.7, rationale: 'Ajuste de gastos para sostener guerra', target: null };
        } else if (!inWar && econLow) {
          decision = { action: 'AdjustSpending', amount: 100, confidence: 0.8, rationale: 'Tesorería baja; recortes administrativos', target: null };
        } else if (weakerThanHostiles && st.treasury > 500) {
          const recruitAmt = Math.min(20, Math.floor((st.treasury - 500) / cfg.recruitCostPerStrength));
          decision = { action: 'RecruitUnits', amount: recruitAmt, confidence: 0.75, rationale: 'Incrementar fuerza ante vecinos hostiles', target: null };
        } else {
          decision = { action: 'AdjustSpending', amount: 0, confidence: 0.5, rationale: 'Sin acción estratégica necesaria', target: null };
        }
      }

      if (decision.action === 'AdjustSpending' && typeof decision.amount === 'number' && decision.amount !== 0) {
        const s = await prisma.state.findUnique({ where: { id: st.id }, select: { treasury: true } });
        if (s) {
          const newTre = Number(s.treasury || 0) + decision.amount;
          await prisma.state.update({ where: { id: st.id }, data: { treasury: newTre } });
          await prisma.tickMetric.create({
            data: { tick, stateId: st.id, systemType: 'decision', metricKey: 'ai_decision_treasury_delta', value: decision.amount },
          });
        }
      }

      if (decision.action === 'RecruitUnits' && typeof decision.amount === 'number') {
        const strengthToRecruit = Math.max(0, Math.floor(decision.amount));
        if (strengthToRecruit > 0) {
          const s = await prisma.state.findUnique({ where: { id: st.id }, select: { treasury: true, militaryStrength: true } });
          if (s) {
            const cost = -strengthToRecruit * cfg.recruitCostPerStrength;
            const newTre = Number(s.treasury || 0) + cost;
            const newMil = Number(s.militaryStrength || 0) + strengthToRecruit;
            await prisma.state.update({ where: { id: st.id }, data: { treasury: newTre, militaryStrength: newMil } });
            await prisma.tickMetric.create({ data: { tick, stateId: st.id, systemType: 'decision', metricKey: 'ai_decision_treasury_delta', value: cost } });
            await prisma.tickMetric.create({ data: { tick, stateId: st.id, systemType: 'decision', metricKey: 'ai_decision_military_delta', value: strengthToRecruit } });
          }
        }
      }

      const text = `IA (${st.id}) decidió: ${decision.action}${decision.target ? ' sobre ' + decision.target : ''}${typeof decision.amount === 'number' ? ' (' + (decision.amount >= 0 ? '+' : '') + decision.amount + ')' : ''} · confianza ${(decision.confidence * 100).toFixed(0)}%. ${decision.rationale}`;
      await prisma.narrativeEvent.create({ data: { tick, stateId: st.id, text } });
    }
  } catch {}
}
