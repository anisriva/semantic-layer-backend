-- Splits the overloaded `OperationType` enum into:
--   * `OperationType`      — top-level execution context on `AuditLog`
--                            (JOB vs CHAT), newly added as `AuditLog.operation_type`.
--   * `CostOperationType`  — the billable/model activity a `CostMetrics`
--                            row accounts for (renamed from
--                            `CostMetrics.operation_type`).
--
-- Backfill strategy (see task spec section 13):
--   AuditLog.operation_type  <- 'JOB'  where job_id IS NOT NULL
--                             <- 'CHAT' where conversation_id IS NOT NULL
--   CostMetrics.operation_type (old enum) -> cost_operation_type (new enum):
--     EMBEDDING  -> EMBEDDING
--     ENRICHMENT -> ENRICHMENT
--     RETRIEVAL  -> RETRIEVAL
--     CHAT       -> CHAT_COMPLETION
--
-- Both backfills were validated against current data before writing this
-- migration: every existing AuditLog row has exactly one of job_id /
-- conversation_id populated, and every existing CostMetrics.operation_type
-- value falls into the mapping above.

-- CreateEnum: new stage values for the chat pipeline (real boundaries in
-- ChatService: hybrid retrieval, then LLM answer generation).
ALTER TYPE "PipelineStage" ADD VALUE 'RETRIEVAL';
ALTER TYPE "PipelineStage" ADD VALUE 'CHAT_COMPLETION';

-- CreateEnum
CREATE TYPE "CostOperationType" AS ENUM ('EMBEDDING', 'ENRICHMENT', 'CHAT_COMPLETION', 'RETRIEVAL');

-- Rename the existing OperationType enum out of the way so it can keep
-- backing CostMetrics.operation_type until that column is migrated below,
-- while a fresh OperationType (JOB | CHAT) is created for AuditLog.
ALTER TYPE "OperationType" RENAME TO "OperationType_old";
CREATE TYPE "OperationType" AS ENUM ('JOB', 'CHAT');

-- AlterTable: add AuditLog.operation_type nullable first so it can be
-- backfilled from existing job_id/conversation_id data, then enforced NOT
-- NULL. Also add message_id (Section 4: optional attribution of a CHAT
-- audit entry to the triggering user Message).
ALTER TABLE "AuditLog" ADD COLUMN "operation_type" "OperationType";
ALTER TABLE "AuditLog" ADD COLUMN "message_id" TEXT;

UPDATE "AuditLog" SET "operation_type" = 'JOB' WHERE "job_id" IS NOT NULL;
UPDATE "AuditLog" SET "operation_type" = 'CHAT' WHERE "conversation_id" IS NOT NULL;

-- Guard: fail loudly instead of silently defaulting if any historical row
-- has both or neither job_id/conversation_id (Section 13).
DO $$
DECLARE
  ambiguous_count INTEGER;
BEGIN
  SELECT count(*) INTO ambiguous_count FROM "AuditLog" WHERE "operation_type" IS NULL;
  IF ambiguous_count > 0 THEN
    RAISE EXCEPTION '% AuditLog row(s) have neither job_id nor conversation_id set; inspect before backfilling operation_type', ambiguous_count;
  END IF;
END $$;

ALTER TABLE "AuditLog" ALTER COLUMN "operation_type" SET NOT NULL;

-- Enforce the JOB/CHAT <-> job_id/conversation_id invariant at the database
-- level (Section 3), in addition to DAO-level validation.
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_operation_type_context_check" CHECK (
  ("operation_type" = 'JOB' AND "job_id" IS NOT NULL AND "conversation_id" IS NULL)
  OR
  ("operation_type" = 'CHAT' AND "conversation_id" IS NOT NULL AND "job_id" IS NULL)
);

-- AlterTable: CostMetrics.operation_type -> cost_operation_type
ALTER TABLE "CostMetrics" ADD COLUMN "cost_operation_type" "CostOperationType";

UPDATE "CostMetrics" SET "cost_operation_type" = (
  CASE "operation_type"::text
    WHEN 'EMBEDDING' THEN 'EMBEDDING'
    WHEN 'ENRICHMENT' THEN 'ENRICHMENT'
    WHEN 'RETRIEVAL' THEN 'RETRIEVAL'
    WHEN 'CHAT' THEN 'CHAT_COMPLETION'
  END
)::"CostOperationType";

DO $$
DECLARE
  unmapped_count INTEGER;
BEGIN
  SELECT count(*) INTO unmapped_count FROM "CostMetrics" WHERE "cost_operation_type" IS NULL;
  IF unmapped_count > 0 THEN
    RAISE EXCEPTION '% CostMetrics row(s) have an operation_type value with no CostOperationType mapping; inspect before continuing', unmapped_count;
  END IF;
END $$;

ALTER TABLE "CostMetrics" ALTER COLUMN "cost_operation_type" SET NOT NULL;

-- DropIndex
DROP INDEX "CostMetrics_operation_type_idx";

-- AlterTable: drop the old column now that data has been migrated.
ALTER TABLE "CostMetrics" DROP COLUMN "operation_type";

-- DropEnum: no longer referenced by any column.
DROP TYPE "OperationType_old";

-- CreateIndex
CREATE INDEX "AuditLog_message_id_idx" ON "AuditLog"("message_id");

-- CreateIndex
CREATE INDEX "AuditLog_operation_type_idx" ON "AuditLog"("operation_type");

-- CreateIndex
CREATE INDEX "CostMetrics_cost_operation_type_idx" ON "CostMetrics"("cost_operation_type");

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;
