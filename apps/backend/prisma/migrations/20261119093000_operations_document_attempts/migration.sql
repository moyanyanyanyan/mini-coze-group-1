-- Operations 独立记录文档处理事实，与业务状态同事务提交；不回填虚构历史。
CREATE TABLE "OperationDocumentAttempt" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "documentId" TEXT NOT NULL,
  "ordinal" INTEGER NOT NULL,
  "source" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "stage" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "events" JSONB NOT NULL DEFAULT '[]',
  CONSTRAINT "OperationDocumentAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OperationDocumentAttempt_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "KnowledgeDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "OperationDocumentAttempt_documentId_ordinal_key" ON "OperationDocumentAttempt"("documentId", "ordinal");

CREATE FUNCTION operations_capture_document_attempt() RETURNS TRIGGER AS $$
DECLARE
  current_attempt "OperationDocumentAttempt"%ROWTYPE;
  observed_at TIMESTAMP(3) := clock_timestamp();
  next_ordinal INTEGER;
  start_new BOOLEAN;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status = OLD.status AND NEW.stage = OLD.stage
    AND NEW."errorCode" IS NOT DISTINCT FROM OLD."errorCode"
    AND NEW."errorMessage" IS NOT DISTINCT FROM OLD."errorMessage" THEN
    RETURN NEW;
  END IF;

  SELECT * INTO current_attempt FROM "OperationDocumentAttempt"
    WHERE "documentId" = NEW.id ORDER BY ordinal DESC LIMIT 1;

  -- 旧文档的第一次变化先保留已存在状态，时间未知，不冒充首次执行。
  IF TG_OP = 'UPDATE' AND current_attempt.id IS NULL THEN
    INSERT INTO "OperationDocumentAttempt" ("documentId", ordinal, source, status, stage, "capturedAt", "errorCode", "errorMessage", events)
    VALUES (OLD.id, 1, 'OBSERVED', OLD.status::text, OLD.stage::text, observed_at, OLD."errorCode", OLD."errorMessage",
      jsonb_build_array(jsonb_build_object('stage', OLD.stage, 'status', OLD.status, 'at', observed_at, 'snapshot', true)))
    RETURNING * INTO current_attempt;
  END IF;

  start_new := TG_OP = 'INSERT';
  IF TG_OP = 'UPDATE' THEN
    start_new := OLD.status = 'FAILED' AND NEW.status = 'PROCESSING';
  END IF;
  IF start_new THEN
    next_ordinal := COALESCE(current_attempt.ordinal, 0) + 1;
    INSERT INTO "OperationDocumentAttempt" ("documentId", ordinal, source, status, stage, "startedAt", "finishedAt", "capturedAt", "errorCode", "errorMessage", events)
    VALUES (NEW.id, next_ordinal, CASE WHEN TG_OP = 'INSERT' AND NEW.status = 'PROCESSING' THEN 'INITIAL' WHEN TG_OP = 'UPDATE' THEN 'RETRY' ELSE 'OBSERVED' END,
      NEW.status::text, NEW.stage::text, CASE WHEN NEW.status = 'PROCESSING' THEN observed_at END, NULL, observed_at,
      NEW."errorCode", NEW."errorMessage", jsonb_build_array(jsonb_build_object('stage', NEW.stage, 'status', NEW.status, 'at', observed_at)));
  ELSE
    UPDATE "OperationDocumentAttempt" SET
      status = NEW.status::text,
      stage = CASE WHEN NEW.status = 'FAILED' THEN OLD.stage::text ELSE NEW.stage::text END,
      "finishedAt" = CASE WHEN NEW.status IN ('READY', 'FAILED') THEN observed_at ELSE NULL END,
      "errorCode" = NEW."errorCode", "errorMessage" = NEW."errorMessage",
      events = events || jsonb_build_array(jsonb_build_object(
        'stage', CASE WHEN NEW.status = 'FAILED' THEN OLD.stage::text ELSE NEW.stage::text END,
        'status', NEW.status, 'at', observed_at))
    WHERE id = current_attempt.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER operations_document_attempt
AFTER INSERT OR UPDATE OF status, stage, "errorCode", "errorMessage" ON "KnowledgeDocument"
FOR EACH ROW EXECUTE FUNCTION operations_capture_document_attempt();
