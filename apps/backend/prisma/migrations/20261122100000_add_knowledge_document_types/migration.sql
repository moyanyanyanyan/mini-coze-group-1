-- 追加知识库文档来源类型，仅新增取值，不修改已有数据。
ALTER TYPE "KnowledgeDocumentSourceType" ADD VALUE IF NOT EXISTS 'MD';
ALTER TYPE "KnowledgeDocumentSourceType" ADD VALUE IF NOT EXISTS 'HTML';
ALTER TYPE "KnowledgeDocumentSourceType" ADD VALUE IF NOT EXISTS 'CSV';
ALTER TYPE "KnowledgeDocumentSourceType" ADD VALUE IF NOT EXISTS 'XLSX';
ALTER TYPE "KnowledgeDocumentSourceType" ADD VALUE IF NOT EXISTS 'DOCX';
ALTER TYPE "KnowledgeDocumentSourceType" ADD VALUE IF NOT EXISTS 'PPTX';
ALTER TYPE "KnowledgeDocumentSourceType" ADD VALUE IF NOT EXISTS 'PDF';
ALTER TYPE "KnowledgeDocumentSourceType" ADD VALUE IF NOT EXISTS 'IMAGE';
