CREATE TABLE "OperationRuntimeRun" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "agentId" TEXT NOT NULL,
    "conversationId" UUID NOT NULL,
    "assistantMessageId" UUID NOT NULL,
    "mode" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "firstTokenMs" INTEGER,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "totalTokens" INTEGER,
    "errorCode" TEXT,
    "events" JSONB NOT NULL DEFAULT '[]',
    "truncated" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "OperationRuntimeRun_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OperationRuntimeRun_userId_startedAt_id_idx" ON "OperationRuntimeRun"("userId", "startedAt", "id");
CREATE INDEX "OperationRuntimeRun_userId_conversationId_startedAt_idx" ON "OperationRuntimeRun"("userId", "conversationId", "startedAt");
ALTER TABLE "OperationRuntimeRun" ADD CONSTRAINT "OperationRuntimeRun_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
