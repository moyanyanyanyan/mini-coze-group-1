-- 模型配置表：Agent.model 存 key，Runtime 按 provider 取凭据、用 upstreamModel 调供应商。
CREATE TABLE IF NOT EXISTS "ModelConfig" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "description" TEXT,
    "provider" TEXT NOT NULL,
    "upstreamModel" TEXT NOT NULL,
    "contextWindow" INTEGER NOT NULL DEFAULT 32768,
    "maxOutputTokens" INTEGER NOT NULL DEFAULT 8192,
    "supportsVision" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModelConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ModelConfig_key_key" ON "ModelConfig"("key");
CREATE INDEX IF NOT EXISTS "ModelConfig_enabled_sortOrder_idx" ON "ModelConfig"("enabled", "sortOrder");

INSERT INTO "ModelConfig" (
    "id", "key", "displayName", "provider", "upstreamModel",
    "contextWindow", "maxOutputTokens", "supportsVision",
    "enabled", "isDefault", "sortOrder", "createdAt", "updatedAt"
) VALUES
    (
        'modelconfig-deepseek-v41-flash', 'deepseek-ai/DeepSeek-V4.1-Flash', 'DeepSeek V4.1 Flash',
        'siliconflow', 'deepseek-ai/DeepSeek-V4.1-Flash',
        32768, 8192, false, true, true, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    ),
    (
        'modelconfig-deepseek-v32', 'deepseek-ai/DeepSeek-V3.2', 'DeepSeek V3.2',
        'siliconflow', 'deepseek-ai/DeepSeek-V3.2',
        32768, 8192, false, true, false, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    ),
    (
        'modelconfig-deepseek-chat', 'deepseek-chat', 'DeepSeek Chat',
        'deepseek', 'deepseek-chat',
        32768, 8192, false, true, false, 20, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
ON CONFLICT ("key") DO NOTHING;
