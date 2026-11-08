BEGIN;

ALTER TABLE "KnowledgeBaseAgentBinding"
  ADD CONSTRAINT "KnowledgeBaseAgentBinding_knowledgeBaseId_fkey"
  FOREIGN KEY ("knowledgeBaseId") REFERENCES "KnowledgeBase"("id")
  ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;

-- 历史孤立绑定无法再使用，先清理再校验外键。
DELETE FROM "KnowledgeBaseAgentBinding" AS binding
WHERE NOT EXISTS (
  SELECT 1 FROM "KnowledgeBase" AS kb WHERE kb.id = binding."knowledgeBaseId"
);

ALTER TABLE "KnowledgeBaseAgentBinding"
  VALIDATE CONSTRAINT "KnowledgeBaseAgentBinding_knowledgeBaseId_fkey";

CREATE INDEX "KnowledgeBaseAgentBinding_knowledgeBaseId_idx"
  ON "KnowledgeBaseAgentBinding"("knowledgeBaseId");

COMMIT;
