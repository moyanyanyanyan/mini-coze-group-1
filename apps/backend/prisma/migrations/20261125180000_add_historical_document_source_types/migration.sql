-- Keep every historical document source type in the shared enum.
-- These labels are required even on branches that do not implement the
-- corresponding parser yet: old rows must remain readable by Prisma clients.
ALTER TYPE "KnowledgeDocumentSourceType" ADD VALUE IF NOT EXISTS 'PDF' BEFORE 'MARKDOWN';
ALTER TYPE "KnowledgeDocumentSourceType" ADD VALUE IF NOT EXISTS 'IMAGE' BEFORE 'MARKDOWN';
ALTER TYPE "KnowledgeDocumentSourceType" ADD VALUE IF NOT EXISTS 'DOCX' BEFORE 'MARKDOWN';
ALTER TYPE "KnowledgeDocumentSourceType" ADD VALUE IF NOT EXISTS 'PPTX' BEFORE 'MARKDOWN';
