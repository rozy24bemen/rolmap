export const mockFaction = {
    id: 'F1',
    name: 'Imperio de Azgaar',
    cultureId: 'C1',
    treasury: 53000,
    stability: 78.5,
    territories: 120,
    militaryStrength: 45000,
    relations: [
        { stateId: 'F2', attitude: -45, tradeVolume: 1200 },
        { stateId: 'F3', attitude: 85, tradeVolume: 5000 },
    ],
    objectives: [
        { id: 'o1', title: 'Asegurar el Paso del Dragón', status: 'active' },
        {
            id: 'o2', title: 'Equilibrar Balanza Comercial (Norte)', status: 'blocked',
            children: [
                { id: 'o2a', title: 'Abrir nueva ruta a Montaña', status: 'planned' },
                { id: 'o2b', title: 'Negociar tratado con Reino del Sol', status: 'blocked' },
            ],
        },
        { id: 'o3', title: 'Reforma Agraria y Tributaria', status: 'done' },
    ],
    llmStatus: { enabled: true, decisionsPerEra: 3, remainingQuota: 2 },
    alerts: [
        { type: 'war', severity: 'high', message: '¡Guerra abierta con la Federación Costera!' },
        { type: 'bankrupt', severity: 'med', message: 'Tesoro bajo. Posible crisis de suministro.' },
    ],
    armies: [
        { id: 'A01', stateId: 'F1', locationCellId: 1024, strength: 8000, supply: 65, stance: 'move', composition: { inf: 5000, cav: 2000, arty: 1000 }, orders: [{ kind: 'move', etaTick: 250, pathLen: 12 }] },
    ],
    settlements: [
        { id: 'S01', name: 'Puerto Imperial', cellId: 205, pop: 15000, marketTier: 3, garrison: 500, ownerStateId: 'F1', tradeLinks: [{ toSettlementId: 'S02', volume: 800 }] },
    ],
};
export const mockCell = { id: 1024, q: 5, r: 8, biome: 3, height: 120, passable: true, movementCost: 2, stateId: 'F1', provinceId: 'P1', cultureId: 'C1' };
