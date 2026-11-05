-- 对齐 main 的库结构（合并 origin/main 后的本机对齐迁移）
-- 来源：migrate diff --from-schema-datasource --to-schema-datamodel prisma
-- 幂等化处理：IF NOT EXISTS / DO 块，组员机器上已建过这些表时重复执行不报错

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum（幂等：已存在时跳过）
DO $$ BEGIN
  CREATE TYPE "KnowledgeBaseStatus" AS ENUM ('ACTIVE', 'DISABLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "KnowledgeDocumentSourceType" AS ENUM ('TEXT', 'TXT', 'JSON');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "KnowledgeDocumentStatus" AS ENUM ('PROCESSING', 'READY', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "KnowledgeDocumentStage" AS ENUM ('VALIDATING', 'EXTRACTING', 'CHUNKING', 'EMBEDDING', 'PERSISTING', 'COMPLETED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "AgentStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AlterTable（main 的 Agent 主键是 cuid 字符串，agentId 从 UUID 改为 TEXT）
ALTER TABLE "Conversation" ALTER COLUMN "agentId" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "Message" ALTER COLUMN "status" DROP DEFAULT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "KnowledgeBase" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" "KnowledgeBaseStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeBase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "KnowledgeDocument" (
    "id" TEXT NOT NULL,
    "knowledgeBaseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sourceType" "KnowledgeDocumentSourceType" NOT NULL,
    "originalFileName" TEXT,
    "sourceBytes" BYTEA,
    "rawText" TEXT,
    "status" "KnowledgeDocumentStatus" NOT NULL DEFAULT 'PROCESSING',
    "stage" "KnowledgeDocumentStage" NOT NULL DEFAULT 'VALIDATING',
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "chunkCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "KnowledgeChunk" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "knowledgeBaseId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "startOffset" INTEGER NOT NULL,
    "endOffset" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "KnowledgeChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "KnowledgeChunkVector" (
    "chunkId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "dimension" INTEGER NOT NULL,
    "embedding" vector(512) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeChunkVector_pkey" PRIMARY KEY ("chunkId")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Workflow" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "draftDefinition" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "WorkflowRun" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "definition" JSONB NOT NULL,
    "input" JSONB NOT NULL,
    "output" JSONB,
    "nodeResults" JSONB,
    "error" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "WorkflowRun_pkey" PRIMARY KEY ("id")
);

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

-- CreateTable
CREATE TABLE IF NOT EXISTS "AgentVersion" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AgentPluginBinding" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "pluginId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "autoInvoke" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "config" JSONB,

    CONSTRAINT "AgentPluginBinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "KnowledgeBaseAgentBinding" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "knowledgeBaseId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB,

    CONSTRAINT "KnowledgeBaseAgentBinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AgentWorkflow" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AgentWorkflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "plugins" (
    "id" SERIAL NOT NULL,
    "pluginId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "icon" TEXT,
    "tags" JSONB NOT NULL DEFAULT '[]',
    "configSchema" JSONB NOT NULL DEFAULT '{}',
    "tools" JSONB NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'builtin',
    "endpoint" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plugins_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "KnowledgeBase_workspaceId_createdAt_idx" ON "KnowledgeBase"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "KnowledgeDocument_knowledgeBaseId_createdAt_idx" ON "KnowledgeDocument"("knowledgeBaseId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "KnowledgeChunk_knowledgeBaseId_enabled_idx" ON "KnowledgeChunk"("knowledgeBaseId", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "KnowledgeChunk_documentId_position_key" ON "KnowledgeChunk"("documentId", "position");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Workflow_workspaceId_creatorId_updatedAt_idx" ON "Workflow"("workspaceId", "creatorId", "updatedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "WorkflowRun_workflowId_startedAt_idx" ON "WorkflowRun"("workflowId", "startedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Agent_workspaceId_idx" ON "Agent"("workspaceId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Agent_status_idx" ON "Agent"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AgentVersion_agentId_idx" ON "AgentVersion"("agentId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AgentVersion_agentId_version_key" ON "AgentVersion"("agentId", "version");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AgentPluginBinding_agentId_enabled_idx" ON "AgentPluginBinding"("agentId", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AgentPluginBinding_agentId_pluginId_key" ON "AgentPluginBinding"("agentId", "pluginId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "KnowledgeBaseAgentBinding_agentId_knowledgeBaseId_key" ON "KnowledgeBaseAgentBinding"("agentId", "knowledgeBaseId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AgentWorkflow_agentId_workflowId_key" ON "AgentWorkflow"("agentId", "workflowId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "plugins_pluginId_key" ON "plugins"("pluginId");

-- AddForeignKey（幂等：已存在时跳过）
DO $$ BEGIN
  ALTER TABLE "KnowledgeDocument" ADD CONSTRAINT "KnowledgeDocument_knowledgeBaseId_fkey" FOREIGN KEY ("knowledgeBaseId") REFERENCES "KnowledgeBase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "KnowledgeChunk" ADD CONSTRAINT "KnowledgeChunk_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "KnowledgeDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "KnowledgeChunk" ADD CONSTRAINT "KnowledgeChunk_knowledgeBaseId_fkey" FOREIGN KEY ("knowledgeBaseId") REFERENCES "KnowledgeBase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "KnowledgeChunkVector" ADD CONSTRAINT "KnowledgeChunkVector_chunkId_fkey" FOREIGN KEY ("chunkId") REFERENCES "KnowledgeChunk"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "WorkflowRun" ADD CONSTRAINT "WorkflowRun_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "AgentVersion" ADD CONSTRAINT "AgentVersion_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "AgentPluginBinding" ADD CONSTRAINT "AgentPluginBinding_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "KnowledgeBaseAgentBinding" ADD CONSTRAINT "KnowledgeBaseAgentBinding_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "AgentWorkflow" ADD CONSTRAINT "AgentWorkflow_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
