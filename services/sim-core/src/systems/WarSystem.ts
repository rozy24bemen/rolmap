type Prisma = any;

interface RelationEntry {
  stateId?: string; // preferred key
  id?: string; // fallback key
  attitude?: number;
}

// Configuration placeholder for future expansion (probabilities, casualty rates)
export const defaultWarConfig = {
  initiationAttitudeThreshold: -80,
  initiationProbability: 0.05, // 5% chance per qualifying relation per tick
  baseCasualtyRate: 0.1, // 10% of weaker side strength baseline
  strongerSideCasualtyFactor: 0.4, // stronger side takes fraction of weaker side casualties
  treasuryWarCostPerStrength: 2, // cost per current militaryStrength each tick while at war
  victoryStrengthThreshold: 0, // if enemy strength <= this -> victory
  maxWarCostRatio: 0.5, // if cumulative war cost exceeds ratio of initial treasury sum, trigger resolution chance
  resolutionCheckProbability: 0.2, // chance per tick to end when end conditions met
};

export async function runWarSystem(prisma: Prisma, tick: number, cfg = defaultWarConfig) {
  if (!prisma) return;
  // Load existing active conflicts (full objects for combat phase)
  const activeConflicts: Array<{ id: string; aggressorStateId: string; defenderStateId: string; status: string; startTick: number; lastCombatTick?: number | null; victoryStateId?: string | null; }> = await prisma.conflict.findMany({ where: { status: 'ACTIVE' } });
  const blockedPairs = new Set<string>(
    activeConflicts.flatMap(c => [
      `${c.aggressorStateId}|${c.defenderStateId}`,
      `${c.defenderStateId}|${c.aggressorStateId}`,
    ]),
  );

  const states = await prisma.state.findMany({ select: { id: true, relations: true } });
  let startedCount = 0;
  for (const s of states) {
    const rels = (s.relations as RelationEntry[]) || [];
    for (const rel of rels) {
      const targetId = rel.stateId || rel.id;
      if (!targetId || targetId === s.id) continue;
      const attitude = typeof rel.attitude === 'number' ? rel.attitude : 0;
      if (attitude >= cfg.initiationAttitudeThreshold) continue; // not hostile enough
      // Skip if conflict already exists between pair
      if (blockedPairs.has(`${s.id}|${targetId}`)) continue;
      // Probabilistic initiation
      if (Math.random() < cfg.initiationProbability) {
        await prisma.conflict.create({
          data: {
            aggressorStateId: s.id,
            defenderStateId: targetId,
            startTick: tick,
            status: 'ACTIVE',
          },
        });
        blockedPairs.add(`${s.id}|${targetId}`);
        blockedPairs.add(`${targetId}|${s.id}`);
        startedCount++;
        // Metric per aggressor
        await prisma.tickMetric.create({
          data: { tick, stateId: s.id, systemType: 'war', metricKey: 'conflict_started', value: 1 },
        });
      }
    }
  }
  if (startedCount > 0) {
    await prisma.tickMetric.create({
      data: { tick, stateId: null, systemType: 'war', metricKey: 'conflicts_started_total', value: startedCount },
    });
  }

  // --- Combat Resolution Phase ---
  if (activeConflicts.length > 0) {
    // Load current states (strength, treasury) into maps
    const combatStates = await prisma.state.findMany({ select: { id: true, militaryStrength: true, treasury: true } });
    const strengthMap = new Map<string, number>();
    const treasuryMap = new Map<string, number>();
    for (const s of combatStates) {
      strengthMap.set(s.id, s.militaryStrength);
      treasuryMap.set(s.id, s.treasury);
    }
    const stateCasualties = new Map<string, number>();
    const stateCosts = new Map<string, number>();

    for (const c of activeConflicts) {
      const aId = c.aggressorStateId;
      const dId = c.defenderStateId;
      const aStr = strengthMap.get(aId) ?? 0;
      const dStr = strengthMap.get(dId) ?? 0;
      if (aStr <= 0 && dStr <= 0) continue; // nothing to do
      const weaker = aStr <= dStr ? aStr : dStr;
      const stronger = aStr > dStr ? aStr : dStr;
      const baseCas = weaker * cfg.baseCasualtyRate;
      const weakerCas = Math.max(1, Math.floor(baseCas));
      const strongerCas = Math.max(0, Math.floor(baseCas * cfg.strongerSideCasualtyFactor));
      // Apply casualties to each side appropriately
      const aCas = aStr <= dStr ? weakerCas : strongerCas;
      const dCas = dStr < aStr ? weakerCas : strongerCas;
      strengthMap.set(aId, Math.max(0, aStr - aCas));
      strengthMap.set(dId, Math.max(0, dStr - dCas));
      stateCasualties.set(aId, (stateCasualties.get(aId) || 0) + aCas);
      stateCasualties.set(dId, (stateCasualties.get(dId) || 0) + dCas);
      // Treasury costs proportional to current (pre-deduction) strength
      const aCost = Math.min(treasuryMap.get(aId) ?? 0, Math.round(aStr * cfg.treasuryWarCostPerStrength));
      const dCost = Math.min(treasuryMap.get(dId) ?? 0, Math.round(dStr * cfg.treasuryWarCostPerStrength));
      treasuryMap.set(aId, (treasuryMap.get(aId) ?? 0) - aCost);
      treasuryMap.set(dId, (treasuryMap.get(dId) ?? 0) - dCost);
      stateCosts.set(aId, (stateCosts.get(aId) || 0) + aCost);
      stateCosts.set(dId, (stateCosts.get(dId) || 0) + dCost);

      // Victory / resolution checks
      const aNow = strengthMap.get(aId) ?? 0;
      const dNow = strengthMap.get(dId) ?? 0;
      let resolve = false;
      let winner: string | null = null;
      if (aNow <= cfg.victoryStrengthThreshold || dNow <= cfg.victoryStrengthThreshold) {
        resolve = true;
        winner = aNow > dNow ? aId : dId;
      } else if (Math.random() < cfg.resolutionCheckProbability) {
        // probabilistic ceasefire when both have taken significant losses ( >30% combined )
        const combinedLoss = (aStr - aNow) + (dStr - dNow);
        const combinedStart = aStr + dStr;
        if (combinedStart > 0 && combinedLoss / combinedStart > 0.3) {
          resolve = true;
          winner = aNow === dNow ? null : (aNow > dNow ? aId : dId);
        }
      }
      if (resolve) {
        await prisma.conflict.update({
          where: { id: c.id },
          data: {
            status: 'VICTORY',
            victoryStateId: winner || undefined,
            lastCombatTick: tick,
          },
        });
        await prisma.tickMetric.create({
          data: { tick, stateId: winner || null, systemType: 'war', metricKey: 'conflict_resolved', value: 1 },
        });
      } else {
        await prisma.conflict.update({ where: { id: c.id }, data: { lastCombatTick: tick } });
      }
    }
    // Persist state updates & metrics
    for (const [id, strength] of strengthMap.entries()) {
      const treasury = treasuryMap.get(id) ?? 0;
      await prisma.state.update({ where: { id }, data: { militaryStrength: strength, treasury } });
    }
    for (const [id, cas] of stateCasualties.entries()) {
      if (cas > 0) await prisma.tickMetric.create({ data: { tick, stateId: id, systemType: 'war', metricKey: 'war_casualties', value: cas } });
    }
    for (const [id, cost] of stateCosts.entries()) {
      if (cost > 0) await prisma.tickMetric.create({ data: { tick, stateId: id, systemType: 'war', metricKey: 'war_treasury_cost', value: cost } });
    }
    // Global risk intensity metric (sum casualties last 5 ticks / total current strength)
    const lookbackTicks = Array.from({ length: 5 }, (_, i) => tick - i).filter(t => t >= 0);
    const recentCas = await prisma.tickMetric.findMany({
      where: { systemType: 'war', metricKey: 'war_casualties', tick: { in: lookbackTicks } },
      select: { value: true },
    });
    const casSum = recentCas.reduce((a: number, b: any) => a + Number(b.value || 0), 0);
    const totalStrength = await prisma.state.aggregate({ _sum: { militaryStrength: true } });
    const denom = Number(totalStrength._sum.militaryStrength || 0) || 1;
    const riskIntensity = casSum / denom;
    await prisma.tickMetric.create({
      data: { tick, stateId: null, systemType: 'war', metricKey: 'global_risk_intensity', value: riskIntensity },
    });
  }
}
