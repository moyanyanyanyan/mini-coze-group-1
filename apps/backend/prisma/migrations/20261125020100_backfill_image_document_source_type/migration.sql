-- Backfill picture documents that T7 temporarily stored as TEXT.
-- Scope is derived from the validated original file name; no historical IDs are hardcoded.
-- Idempotent: a second run matches no rows. rawText, chunks and vectors are untouched.
UPDATE "KnowledgeDocument"
SET "sourceType" = 'IMAGE'
WHERE "sourceType" = 'TEXT'
  AND "originalFileName" ~* '\.(png|jpe?g)$';
