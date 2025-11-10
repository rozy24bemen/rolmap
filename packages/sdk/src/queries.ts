import type { FactionSummary, Army, Settlement, Cell, TickInfo } from "../../schema/ts/types";
import { createGraphQLClient } from "./graphqlClient";
import type { SDKConfig } from "./config";

// GraphQL documents (alineados con packages/schema/graphql/schema.graphql)
const Q_TICK_INFO = /* GraphQL */ `
  query TickInfo { tickInfo { tick season } }
`;

const Q_FACTIONS = /* GraphQL */ `
  query Factions($filter: String, $page: Int, $pageSize: Int) {
    factions(filter: $filter, page: $page, pageSize: $pageSize) {
      id name cultureId treasury stability territories militaryStrength
      relations { stateId attitude tradeVolume }
      objectives { id title status children { id title status } }
      llmStatus { enabled decisionsPerEra remainingQuota }
      alerts { type severity message }
    }
  }
`;

const Q_FACTION = /* GraphQL */ `
  query Faction($id: ID!) {
    faction(id: $id) {
      id name cultureId treasury stability
      relations { stateId attitude tradeVolume }
      objectives { id title status children { id title status } }
      armies { id stateId locationCellId strength supply stance composition { inf cav arty } orders { kind etaTick pathLen } }
      settlements { id name cellId pop marketTier garrison ownerStateId tradeLinks { toSettlementId volume } }
      llmStatus { enabled decisionsPerEra remainingQuota }
    }
  }
`;

const Q_CELL = /* GraphQL */ `
  query Cell($id: Int!) {
    cell(id: $id) { id q r biome height passable movementCost stateId provinceId cultureId }
  }
`;

const Q_SETTLEMENT = /* GraphQL */ `
  query Settlement($id: ID!) {
    settlement(id: $id) { id name cellId pop marketTier garrison ownerStateId tradeLinks { toSettlementId volume } }
  }
`;

const Q_ARMY = /* GraphQL */ `
  query Army($id: ID!) {
    army(id: $id) { id stateId locationCellId strength supply stance composition { inf cav arty } orders { kind etaTick pathLen } }
  }
`;

const Q_TICK_METRICS = /* GraphQL */ `
  query TickMetrics($stateId: ID, $metricKey: String, $fromTick: Int, $toTick: Int, $limit: Int) {
    tickMetrics(stateId: $stateId, metricKey: $metricKey, fromTick: $fromTick, toTick: $toTick, limit: $limit) {
      id tick stateId systemType metricKey value createdAt
    }
  }
`;

const Q_NARRATIVE_EVENTS = /* GraphQL */ `
  query NarrativeEvents($stateId: ID, $fromTick: Int, $toTick: Int, $limit: Int) {
    narrativeEvents(stateId: $stateId, fromTick: $fromTick, toTick: $toTick, limit: $limit) {
      id tick stateId text createdAt
    }
  }
`;

const Q_CONFLICTS = /* GraphQL */ `
  query Conflicts($stateId: ID, $status: ConflictStatus, $limit: Int) {
    conflicts(stateId: $stateId, status: $status, limit: $limit) {
      id aggressorStateId defenderStateId status startTick lastCombatTick victoryStateId
    }
  }
`;

export const createQueries = (cfg: SDKConfig) => {
  const client = createGraphQLClient(cfg);
  return {
    getTickInfo: async () => {
      type R = { tickInfo: TickInfo };
      const r = await client.query<R>(Q_TICK_INFO);
      return r.tickInfo;
    },
    getFactions: async (filter?: string, page = 1, pageSize = 20) => {
      type R = { factions: FactionSummary[] };
      const r = await client.query<R>(Q_FACTIONS, { filter, page, pageSize });
      return r.factions;
    },
    getFaction: async (id: string) => {
      const r = await client.query<{ faction: any }>(Q_FACTION, { id });
      return r.faction;
    },
    getCell: async (id: number) => {
      const r = await client.query<{ cell: Cell }>(Q_CELL, { id });
      return r.cell;
    },
    getSettlement: async (id: string) => {
      const r = await client.query<{ settlement: Settlement }>(Q_SETTLEMENT, { id });
      return r.settlement;
    },
    getArmy: async (id: string) => {
      const r = await client.query<{ army: Army }>(Q_ARMY, { id });
      return r.army;
    },
    getTickMetrics: async (params: { stateId?: string; metricKey?: string; fromTick?: number; toTick?: number; limit?: number }) => {
      const r = await client.query<{ tickMetrics: any[] }>(Q_TICK_METRICS, params);
      return r.tickMetrics;
    },
    // Convenience: global metrics (stateId null) e.g. global_political_health
    getGlobalTickMetrics: async (params: { metricKey?: string; fromTick?: number; toTick?: number; limit?: number }) => {
      const r = await client.query<{ tickMetrics: any[] }>(Q_TICK_METRICS, { stateId: null, ...params });
      return r.tickMetrics;
    },
    getNarrativeEvents: async (params: { stateId?: string; fromTick?: number; toTick?: number; limit?: number }) => {
      const r = await client.query<{ narrativeEvents: any[] }>(Q_NARRATIVE_EVENTS, params);
      return r.narrativeEvents;
    },
    getConflicts: async (params: { stateId?: string; status?: string; limit?: number }) => {
      const r = await client.query<{ conflicts: any[] }>(Q_CONFLICTS, params);
      return r.conflicts;
    },
  };
};
