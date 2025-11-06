import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { runEtl } from 'etl-azgaar';
async function main() {
    const file = process.argv[2];
    if (!file) {
        console.error('Usage: npm run etl:azgaar -- <map.json> [--mode=replace|upsert] [--batch=1000] [--minBurgPop=100]');
        process.exit(1);
    }
    const abs = path.resolve(process.cwd(), file);
    if (!fs.existsSync(abs)) {
        console.error(`File not found: ${abs}`);
        process.exit(1);
    }
    const raw = fs.readFileSync(abs, 'utf8');
    const json = JSON.parse(raw);
    const prisma = new PrismaClient();
    const modeArg = process.argv.find((a) => a.startsWith('--mode='));
    const mode = modeArg ? modeArg.split('=')[1] : 'replace';
    const batchArg = process.argv.find((a) => a.startsWith('--batch='));
    const batchSize = batchArg ? Number(batchArg.split('=')[1]) : 1000;
    const minBurgPopArg = process.argv.find((a) => a.startsWith('--minBurgPop='));
    const minBurgPop = minBurgPopArg ? Number(minBurgPopArg.split('=')[1]) : 100;
    try {
        await runEtl(prisma, json, { mode, batchSize, minBurgPop });
    }
    finally {
        await prisma.$disconnect();
    }
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
