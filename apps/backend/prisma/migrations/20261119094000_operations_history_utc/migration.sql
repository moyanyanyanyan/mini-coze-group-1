-- Prisma 的 timestamp 字段按 UTC 解释，触发器不能受连接会话时区影响。
ALTER FUNCTION operations_capture_document_attempt() SET timezone = 'UTC';
