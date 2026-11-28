ALTER TABLE "OperationRuntimeRun" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'unknown', ADD COLUMN "apiKeyId" TEXT;
CREATE TABLE "OperationTelemetry" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "ownerId" TEXT, "kind" TEXT NOT NULL,
  "status" TEXT NOT NULL, "knowledgeBaseId" TEXT, "documentId" TEXT, "agentId" TEXT,
  "runId" TEXT, "apiKeyId" TEXT, "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "durationMs" INTEGER NOT NULL, "inputTokens" INTEGER, "itemCount" INTEGER NOT NULL DEFAULT 0,
  "data" JSONB NOT NULL DEFAULT '{}', CONSTRAINT "OperationTelemetry_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OperationTelemetry_ownerId_kind_startedAt_idx" ON "OperationTelemetry"("ownerId", "kind", "startedAt");
CREATE INDEX "OperationTelemetry_ownerId_knowledgeBaseId_startedAt_idx" ON "OperationTelemetry"("ownerId", "knowledgeBaseId", "startedAt");
CREATE INDEX "OperationTelemetry_ownerId_runId_idx" ON "OperationTelemetry"("ownerId", "runId");
