import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { mockFaction, mockCell } from './mocks.js';
import { PrismaClient } from '@prisma/client';
import { SimCore } from '../../../services/sim-core/dist/index.js';
import { LlmProxy } from 'llm-proxy';
const prisma = (() => {
    try {
        if (!process.env.DATABASE_URL)
            return null;
        return new PrismaClient();
    }
    catch {
        return null;
    }
})();
// Initialize SimCore using prisma (or undefined for in-memory)
const simCore = new SimCore(prisma || undefined);
async function getCurrentTick() { return await simCore.getCurrentTick(); }
async function incrementTick(count) { return await simCore.runTick(count); }
let currentTick = 0;
const sseClients = new Set();
async function broadcastTick(messages) {
    const tick = prisma ? await getCurrentTick() : currentTick;
    if (!prisma)
        currentTick = tick;
    const body = { type: 'tick-update', tick };
    if (messages && messages.length)
        body.messages = messages;
    const payload = JSON.stringify(body);
    for (const res of sseClients) {
        try {
            res.write(`event: tick-update\n`);
            res.write(`data: ${payload}\n\n`);
        }
        catch { }
    }
}
export async function createApp() {
    const app = express();
    app.use(cors({ origin: [/^http:\/\/localhost:\d+$/], credentials: true }));
    app.use(bodyParser.json());
    // Initialize in-memory tick from DB if available
    try {
        if (prisma) {
            currentTick = await getCurrentTick();
        }
    }
    catch { }
    const schemaPath = fileURLToPath(new URL('../../../packages/schema/graphql/schema.graphql', import.meta.url));
    const typeDefs = readFileSync(schemaPath, 'utf8');
    const resolvers = {
        Query: {
            tickInfo: async () => ({ tick: await getCurrentTick(), season: 'spring' }),
            tickMetrics: async (_, args) => {
                if (!prisma)
                    return [];
                const where = {};
                if (args.stateId)
                    where.stateId = args.stateId;
                if (args.metricKey)
                    where.metricKey = args.metricKey;
                if (typeof args.fromTick === 'number' || typeof args.toTick === 'number') {
                    where.tick = {};
                    if (typeof args.fromTick === 'number')
                        where.tick.gte = args.fromTick;
                    if (typeof args.toTick === 'number')
                        where.tick.lte = args.toTick;
                }
                const limit = Math.max(1, Math.min(500, args.limit ?? 10));
                const rows = await prisma.tickMetric.findMany({
                    where,
                    orderBy: [{ tick: 'desc' }, { createdAt: 'desc' }],
                    take: limit,
                });
                return rows.map((m) => ({
                    id: m.id,
                    tick: m.tick,
                    stateId: m.stateId ?? undefined,
                    systemType: m.systemType,
                    metricKey: m.metricKey,
                    value: m.value,
                    createdAt: m.createdAt.toISOString(),
                }));
            },
            narrativeEvents: async (_, args) => {
                if (!prisma)
                    return [];
                const where = {};
                if (args.stateId)
                    where.stateId = args.stateId;
                if (typeof args.fromTick === 'number' || typeof args.toTick === 'number') {
                    where.tick = {};
                    if (typeof args.fromTick === 'number')
                        where.tick.gte = args.fromTick;
                    if (typeof args.toTick === 'number')
                        where.tick.lte = args.toTick;
                }
                const limit = Math.max(1, Math.min(500, args.limit ?? 20));
                const rows = await prisma.narrativeEvent.findMany({
                    where,
                    orderBy: [{ tick: 'desc' }, { createdAt: 'desc' }],
                    take: limit,
                });
                return rows.map((e) => ({
                    id: e.id,
                    tick: e.tick,
                    stateId: e.stateId ?? undefined,
                    text: e.text,
                    createdAt: e.createdAt.toISOString(),
                }));
            },
            factions: async () => {
                if (!prisma) {
                    return [
                        {
                            id: mockFaction.id,
                            name: mockFaction.name,
                            cultureId: mockFaction.cultureId,
                            treasury: mockFaction.treasury,
                            stability: mockFaction.stability,
                            territories: mockFaction.territories,
                            militaryStrength: mockFaction.militaryStrength,
                            relations: mockFaction.relations,
                            objectives: mockFaction.objectives,
                            llmStatus: mockFaction.llmStatus,
                            alerts: mockFaction.alerts,
                        },
                    ];
                }
                const rows = await prisma.state.findMany();
                return rows.map((s) => ({
                    id: s.id,
                    name: s.name,
                    cultureId: s.cultureId || undefined,
                    treasury: s.treasury,
                    stability: s.stability,
                    territories: s.territories,
                    militaryStrength: s.militaryStrength,
                    relations: s.relations || [],
                    objectives: s.objectives || [],
                    llmStatus: { enabled: ((s.isLlmControlled ?? s.llmEnabled)), decisionsPerEra: s.decisionsPerEra, remainingQuota: s.remainingQuota },
                    alerts: s.alerts || [],
                }));
            },
            faction: async (_, args) => {
                if (!prisma) {
                    return {
                        id: args.id,
                        name: mockFaction.name,
                        cultureId: mockFaction.cultureId,
                        treasury: mockFaction.treasury,
                        stability: mockFaction.stability,
                        relations: mockFaction.relations,
                        objectives: mockFaction.objectives,
                        armies: mockFaction.armies,
                        settlements: mockFaction.settlements,
                        llmStatus: mockFaction.llmStatus,
                    };
                }
                const s = await prisma.state.findUnique({ where: { id: args.id }, include: { armies: true, settlements: true } });
                if (!s)
                    return null;
                return {
                    id: s.id,
                    name: s.name,
                    cultureId: s.cultureId || undefined,
                    treasury: s.treasury,
                    stability: s.stability,
                    relations: s.relations || [],
                    objectives: s.objectives || [],
                    armies: s.armies.map((a) => ({ id: a.id, stateId: a.stateId, locationCellId: a.locationCellId, strength: a.strength, supply: a.supply, stance: a.stance, composition: a.composition || { inf: 0, cav: 0, arty: 0 }, orders: a.orders || [] })),
                    settlements: s.settlements.map((t) => ({ id: t.id, name: t.name, cellId: t.cellId, pop: t.pop, marketTier: t.marketTier, garrison: t.garrison, ownerStateId: t.ownerStateId, tradeLinks: t.tradeLinks || [] })),
                    llmStatus: { enabled: ((s.isLlmControlled ?? s.llmEnabled)), decisionsPerEra: s.decisionsPerEra, remainingQuota: s.remainingQuota },
                };
            },
            // Use Prisma-backed cell when available
            cell: async (_, args) => {
                if (!prisma)
                    return { ...mockCell, id: args.id };
                const c = await prisma.cell.findUnique({ where: { id: args.id } });
                if (!c)
                    return null;
                return {
                    id: c.id,
                    q: c.q ?? undefined,
                    r: c.r ?? undefined,
                    biome: c.biome ?? undefined,
                    height: c.height ?? undefined,
                    passable: c.passable ?? undefined,
                    movementCost: c.movementCost ?? undefined,
                    stateId: c.stateId ?? undefined,
                    provinceId: c.provinceId ?? undefined,
                    cultureId: c.cultureId ?? undefined,
                };
            },
            settlement: async (_, args) => {
                if (!prisma)
                    return mockFaction.settlements.find(s => s.id === args.id) || mockFaction.settlements[0];
                const s = await prisma.settlement.findUnique({ where: { id: args.id } });
                if (!s)
                    return null;
                return { id: s.id, name: s.name, cellId: s.cellId, pop: s.pop, marketTier: s.marketTier, garrison: s.garrison, ownerStateId: s.ownerStateId, tradeLinks: s.tradeLinks || [] };
            },
            army: async (_, args) => {
                if (!prisma)
                    return mockFaction.armies.find(a => a.id === args.id) || mockFaction.armies[0];
                const a = await prisma.army.findUnique({ where: { id: args.id } });
                if (!a)
                    return null;
                return { id: a.id, stateId: a.stateId, locationCellId: a.locationCellId, strength: a.strength, supply: a.supply, stance: a.stance, composition: a.composition || { inf: 0, cav: 0, arty: 0 }, orders: a.orders || [] };
            },
        },
    };
    const schema = makeExecutableSchema({ typeDefs, resolvers });
    const server = new ApolloServer({ schema });
    await server.start();
    app.use('/graphql', expressMiddleware(server, { context: async () => ({}) }));
    app.post('/api/factions/:id/llm', async (req, res) => {
        try {
            if (!prisma)
                return res.status(503).json({ ok: false, error: 'DB unavailable' });
            const id = String(req.params.id);
            const enabled = Boolean(req.body?.enabled);
            await prisma.state.update({ where: { id }, data: { isLlmControlled: enabled, llmEnabled: enabled } });
            res.json({ ok: true });
        }
        catch (e) {
            res.status(500).json({ ok: false, error: e?.message || 'Error' });
        }
    });
    app.post('/api/factions/:id/suggest', async (req, res) => {
        try {
            const id = String(req.params.id);
            const text = String(req.body?.text ?? '').trim();
            if (!text)
                return res.status(400).json({ ok: false, error: 'Missing text' });
            const tick = await getCurrentTick();
            if (!prisma)
                return res.status(503).json({ ok: false, error: 'DB unavailable' });
            const proxy = new LlmProxy();
            const r = await proxy.saveSuggestion(prisma, id, tick, text);
            if (!r.ok)
                return res.status(500).json({ ok: false, error: 'Failed to save suggestion' });
            return res.json({ ok: true, id: r.id });
        }
        catch (e) {
            return res.status(500).json({ ok: false, error: e?.message || 'Error' });
        }
    });
    app.post('/api/world/tick', async (req, res) => {
        const count = Number((req.body && req.body.count) ?? 1) || 1;
        const tick = await incrementTick(count);
        if (!prisma)
            currentTick = tick;
        // Enrich SSE with simple scheduler messages
        const messages = [
            `Political System executed at tick ${tick}`,
            `Economic System executed at tick ${tick}`,
        ];
        await broadcastTick(messages);
        res.json({ ok: true, tick, messages });
    });
    app.get('/api/events/subscribe', (req, res) => {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders?.();
        sseClients.add(res);
        (async () => {
            try {
                const tick = prisma ? await getCurrentTick() : currentTick;
                if (!prisma)
                    currentTick = tick;
                const payload = JSON.stringify({ type: 'tick-update', tick });
                res.write(`event: tick-update\n`);
                res.write(`data: ${payload}\n\n`);
            }
            catch { }
        })();
        req.on('close', () => { sseClients.delete(res); try {
            res.end();
        }
        catch { } });
    });
    return app;
}
export async function start(port) {
    const app = await createApp();
    return new Promise((resolve) => {
        app.listen(port, () => resolve());
    });
}
