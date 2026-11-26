-- Additive enum value only. PostgreSQL requires the new label to be committed
-- before it can be used, so the data backfill lives in the next migration.
ALTER TYPE "KnowledgeDocumentSourceType" ADD VALUE IF NOT EXISTS 'IMAGE';
