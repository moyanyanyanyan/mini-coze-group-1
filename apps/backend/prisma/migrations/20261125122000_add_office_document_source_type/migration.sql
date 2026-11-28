-- Add the Office document source types. This migration only extends the enum;
-- there is no historical data to backfill because DOCX/PPTX uploads were not
-- accepted before this release.
ALTER TYPE "KnowledgeDocumentSourceType" ADD VALUE IF NOT EXISTS 'DOCX';
ALTER TYPE "KnowledgeDocumentSourceType" ADD VALUE IF NOT EXISTS 'PPTX';
