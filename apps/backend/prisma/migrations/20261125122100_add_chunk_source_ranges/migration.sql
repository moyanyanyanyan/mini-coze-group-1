-- Chunk-level source ranges for Office parsing. Nullable on purpose: existing
-- TXT/JSON/PDF/IMAGE chunks and legacy rows keep NULL and need no backfill.
ALTER TABLE "KnowledgeChunk" ADD COLUMN "sourceRanges" JSONB;
