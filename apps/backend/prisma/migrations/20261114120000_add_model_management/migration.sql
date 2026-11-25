-- 模型管理：服务商、模型配置，以及 Agent 的模型配置绑定

CREATE TYPE "ModelType" AS ENUM ('CHAT', 'EMBEDDING');

CREATE TABLE "ModelProvider" (
    "id" TEXT NOT NULL,
    "ownerId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "protocol" TEXT NOT NULL DEFAULT 'openai_compatible',
    "defaultBaseUrl" TEXT NOT NULL,
    "builtinKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModelProvider_pkey" PRIMARY KEY ("id")
);

-- 兼容旧版模型配置表：20261112120000 已创建同名旧结构表，先改名保留数据，再建模型管理版本
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'ModelConfig'
    ) THEN
        ALTER TABLE "ModelConfig" RENAME TO "ModelConfigLegacy";
        ALTER INDEX IF EXISTS "ModelConfig_pkey" RENAME TO "ModelConfigLegacy_pkey";
        ALTER INDEX IF EXISTS "ModelConfig_key_key" RENAME TO "ModelConfigLegacy_key_key";
        ALTER INDEX IF EXISTS "ModelConfig_enabled_sortOrder_idx" RENAME TO "ModelConfigLegacy_enabled_sortOrder_idx";
    END IF;
END $$;

CREATE TABLE "ModelConfig" (
    "id" TEXT NOT NULL,
    "ownerId" UUID NOT NULL,
    "providerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "modelIdentifier" TEXT NOT NULL,
    "type" "ModelType" NOT NULL DEFAULT 'CHAT',
    "dimension" INTEGER,
    "baseUrl" TEXT,
    "apiKeyCipher" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastTestedAt" TIMESTAMP(3),
    "lastTestStatus" TEXT,
    "lastTestLatencyMs" INTEGER,
    "lastTestErrorType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModelConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ModelProvider_ownerId_name_key" ON "ModelProvider"("ownerId", "name");
CREATE UNIQUE INDEX "ModelProvider_ownerId_builtinKey_key" ON "ModelProvider"("ownerId", "builtinKey");
CREATE INDEX "ModelProvider_ownerId_idx" ON "ModelProvider"("ownerId");

CREATE UNIQUE INDEX "ModelConfig_ownerId_name_key" ON "ModelConfig"("ownerId", "name");
CREATE INDEX "ModelConfig_ownerId_type_enabled_idx" ON "ModelConfig"("ownerId", "type", "enabled");
CREATE INDEX "ModelConfig_providerId_idx" ON "ModelConfig"("providerId");

ALTER TABLE "Agent" ADD COLUMN "modelConfigId" TEXT;
CREATE INDEX "Agent_modelConfigId_idx" ON "Agent"("modelConfigId");

ALTER TABLE "ModelProvider" ADD CONSTRAINT "ModelProvider_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ModelConfig" ADD CONSTRAINT "ModelConfig_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ModelConfig" ADD CONSTRAINT "ModelConfig_providerId_fkey"
    FOREIGN KEY ("providerId") REFERENCES "ModelProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Agent" ADD CONSTRAINT "Agent_modelConfigId_fkey"
    FOREIGN KEY ("modelConfigId") REFERENCES "ModelConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;
