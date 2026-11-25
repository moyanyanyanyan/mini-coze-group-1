-- Markdown and HTML are parsed by their own adapters, then normalized into the
-- same rawText + segments contract as the existing text formats.
ALTER TYPE "KnowledgeDocumentSourceType" ADD VALUE IF NOT EXISTS 'MARKDOWN';
ALTER TYPE "KnowledgeDocumentSourceType" ADD VALUE IF NOT EXISTS 'HTML';
