export async function runEventSystem(prisma: any, llm: any, tick: number) {
  if (!prisma) return;
  // Process pending suggestions and generate narratives
  const suggestions: Array<{ id: string; stateId: string; text: string }> = await prisma.suggestion.findMany({
    where: { status: 'pending' },
    orderBy: { createdAt: 'asc' },
    take: 5,
    select: { id: true, stateId: true, text: true },
  });

  for (const s of suggestions) {
    const st = await prisma.state.findUnique({ where: { id: s.stateId }, select: { stability: true } });
    if (st) {
      const oldStab = Number(st.stability || 0);
      const newStab = Math.min(100, oldStab * 1.05);
      await prisma.state.update({ where: { id: s.stateId }, data: { stability: newStab } });
      await prisma.tickMetric.create({
        data: { tick, stateId: s.stateId, systemType: 'event', metricKey: 'stability_change', value: newStab - oldStab },
      });
    }
    await prisma.suggestion.update({ where: { id: s.id }, data: { status: 'processed', processedAt: new Date() } });
    try {
      let text = `Sugerencia aplicada al estado ${s.stateId}`;
      if (llm && typeof llm.generateNarrative === 'function') {
        text = await llm.generateNarrative({ stateId: s.stateId, tick, summary: s.text });
      }
      // Enrich narrative with strongest static PoliticalMemory factor (if any)
      const topMemory = await prisma.politicalMemory.findFirst({
        where: { sourceStateId: s.stateId, isStatic: true },
        orderBy: { modifierValue: 'desc' },
        select: { targetStateId: true, factorKey: true, modifierValue: true },
      });
      if (topMemory) {
        const factorPhrase = `La relación con ${topMemory.targetStateId} se mantuvo estable por ${topMemory.factorKey} (+${topMemory.modifierValue}).`;
        text = `${text} ${factorPhrase}`;
      }
      await prisma.narrativeEvent.create({ data: { tick, stateId: s.stateId, text } });
    } catch {}
  }

  // Generate narratives for conflicts resolved this tick (VICTORY or CEASEFIRE)
  const resolved = await prisma.conflict.findMany({
    where: { lastCombatTick: tick, status: { in: ['VICTORY', 'CEASEFIRE'] } },
  });
  for (const c of resolved) {
    const [agg, def] = await Promise.all([
      prisma.state.findUnique({ where: { id: c.aggressorStateId }, select: { name: true } }),
      prisma.state.findUnique({ where: { id: c.defenderStateId }, select: { name: true } }),
    ]);
    const aName = agg?.name || c.aggressorStateId;
    const dName = def?.name || c.defenderStateId;
    const duration = Math.max(1, tick - (c.startTick ?? tick));
    const outcome = c.status === 'VICTORY'
      ? (c.victoryStateId === c.aggressorStateId ? `${aName} declaró la victoria sobre ${dName}` : `${dName} declaró la victoria sobre ${aName}`)
      : `Cese al fuego entre ${aName} y ${dName}`;
    const text = `${outcome} tras ${duration} tick(s) de guerra.`;
    await prisma.narrativeEvent.create({ data: { tick, stateId: c.aggressorStateId, text } });
    await prisma.narrativeEvent.create({ data: { tick, stateId: c.defenderStateId, text } });
  }
}
