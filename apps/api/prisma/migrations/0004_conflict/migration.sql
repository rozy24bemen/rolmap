-- Create ConflictStatus enum and Conflict table
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ConflictStatus') THEN
    CREATE TYPE "ConflictStatus" AS ENUM ('ACTIVE', 'CEASEFIRE', 'VICTORY');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "Conflict" (
  "id" TEXT PRIMARY KEY,
  "aggressorStateId" TEXT NOT NULL,
  "defenderStateId" TEXT NOT NULL,
  "status" "ConflictStatus" NOT NULL DEFAULT 'ACTIVE',
  "startTick" INTEGER NOT NULL,
  "lastCombatTick" INTEGER,
  "victoryStateId" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "Conflict_aggressor_defender_idx" ON "Conflict" ("aggressorStateId", "defenderStateId");
CREATE INDEX IF NOT EXISTS "Conflict_status_idx" ON "Conflict" ("status");
