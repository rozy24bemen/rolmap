import { start } from './server.js';
const PORT = Number(process.env.PORT || 4000);
await start(PORT);
console.log(`BFF listening on http://localhost:${PORT}\n- GraphQL: http://localhost:${PORT}/graphql`);
