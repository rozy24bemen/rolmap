import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { mockFaction, mockCell } from './mocks.js';
// --- In-memory state and SSE clients ---
let currentTick = 0;
const sseClients = new Set();
function broadcastTick() {
    const payload = JSON.stringify({ type: 'tick-update', tick: currentTick });
    for (const res of sseClients) {
        try {
            res.write(`event: tick-update\n`);
            res.write(`data: ${payload}\n\n`);
        }
        catch { }
    }
}
const PORT = Number(process.env.PORT || 4000);
const app = express();
// CORS to allow local web dev
app.use(cors({ origin: [/^http:\/\/localhost:\d+$/], credentials: true }));
app.use(bodyParser.json());
// Load SDL
const schemaPath = resolve(process.cwd(), '../../packages/schema/graphql/schema.graphql');
const typeDefs = readFileSync(schemaPath, 'utf8');
const resolvers = {
    Query: {
        tickInfo: () => ({ tick: currentTick, season: 'spring' }),
        factions: () => [
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
        ],
        faction: (_, args) => ({
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
        }),
        cell: (_, args) => ({ ...mockCell, id: args.id }),
        settlement: (_, args) => mockFaction.settlements.find(s => s.id === args.id) || mockFaction.settlements[0],
        army: (_, args) => mockFaction.armies.find(a => a.id === args.id) || mockFaction.armies[0],
    },
};
const schema = makeExecutableSchema({ typeDefs, resolvers });
const server = new ApolloServer({ schema });
await server.start();
app.use('/graphql', expressMiddleware(server, {
    context: async () => ({})
}));
// REST endpoints used by SDK
app.post('/api/factions/:id/llm', (req, res) => {
    // Could persist settings, for now just OK
    res.json({ ok: true });
});
app.post('/api/factions/:id/suggest', (req, res) => {
    // Could route to LLM proxy, for now just OK
    res.json({ ok: true });
});
app.post('/api/world/tick', (req, res) => {
    const count = Number((req.body && req.body.count) ?? 1) || 1;
    currentTick += count;
    broadcastTick();
    res.json({ ok: true, tick: currentTick });
});
// SSE endpoint to stream world events (ticks etc.)
app.get('/api/events/subscribe', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    sseClients.add(res);
    // Send initial tick snapshot
    try {
        const payload = JSON.stringify({ type: 'tick-update', tick: currentTick });
        res.write(`event: tick-update\n`);
        res.write(`data: ${payload}\n\n`);
    }
    catch { }
    req.on('close', () => {
        sseClients.delete(res);
        try {
            res.end();
        }
        catch { }
    });
});
app.listen(PORT, () => {
    console.log(`BFF listening on http://localhost:${PORT}\n- GraphQL: http://localhost:${PORT}/graphql`);
});
