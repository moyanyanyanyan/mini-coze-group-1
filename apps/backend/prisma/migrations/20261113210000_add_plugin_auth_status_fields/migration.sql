-- 为插件表补充鉴权方式、凭证与连接状态字段。
-- kind / endpoint 已在 20261105130654_align_main_schema 中存在，此处只补本轮新增列。
-- 全部使用 IF NOT EXISTS，兼容历史本地库中可能已手工加列的情况。

ALTER TABLE "plugins" ADD COLUMN IF NOT EXISTS "authType" TEXT NOT NULL DEFAULT 'none';
ALTER TABLE "plugins" ADD COLUMN IF NOT EXISTS "authCredential" TEXT;
ALTER TABLE "plugins" ADD COLUMN IF NOT EXISTS "connectionStatus" TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE "plugins" ADD COLUMN IF NOT EXISTS "lastError" TEXT;
