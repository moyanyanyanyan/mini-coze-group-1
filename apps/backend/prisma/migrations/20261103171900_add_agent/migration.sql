-- Agent was previously created by `prisma db push` in some local databases.
-- Keep this migration idempotent so those databases can record the missing migration.
DO $$
BEGIN
    IF to_regtype('"AgentStatus"') IS NULL THEN
        CREATE TYPE "AgentStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');
    END IF;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "Agent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "avatarUrl" TEXT,
    "systemPrompt" TEXT NOT NULL,
    "model" TEXT NOT NULL DEFAULT 'deepseek-ai/DeepSeek-V4.1-Flash',
    "temperature" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "maxTokens" INTEGER NOT NULL DEFAULT 4096,
    "contextLimit" INTEGER NOT NULL DEFAULT 20,
    "openingMessage" TEXT,
    "status" "AgentStatus" NOT NULL DEFAULT 'DRAFT',
    "currentVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

DO $$
DECLARE
    missing_columns TEXT;
BEGIN
    SELECT string_agg(required.column_name, ', ')
    INTO missing_columns
    FROM (
        VALUES
            ('id'),
            ('workspaceId'),
            ('ownerId'),
            ('name'),
            ('description'),
            ('avatarUrl'),
            ('systemPrompt'),
            ('model'),
            ('temperature'),
            ('maxTokens'),
            ('contextLimit'),
            ('openingMessage'),
            ('status'),
            ('currentVersionId'),
            ('createdAt'),
            ('updatedAt')
    ) AS required(column_name)
    WHERE NOT EXISTS (
        SELECT 1
        FROM information_schema.columns existing
        WHERE existing.table_schema = current_schema()
          AND existing.table_name = 'Agent'
          AND existing.column_name = required.column_name
    );

    IF missing_columns IS NOT NULL THEN
        RAISE EXCEPTION 'Agent table is missing required columns: %', missing_columns;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint existing
        WHERE existing.conrelid = '"Agent"'::regclass
          AND existing.contype = 'p'
    ) THEN
        ALTER TABLE "Agent" ADD CONSTRAINT "Agent_pkey" PRIMARY KEY ("id");
    END IF;
END $$;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Agent_workspaceId_idx" ON "Agent"("workspaceId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Agent_status_idx" ON "Agent"("status");
