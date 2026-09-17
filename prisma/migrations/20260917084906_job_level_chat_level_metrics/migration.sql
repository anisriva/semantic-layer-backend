/*
  Warnings:

  - You are about to drop the column `metrics` on the `AuditLog` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "AuditLog" DROP CONSTRAINT "AuditLog_job_id_fkey";

-- AlterTable
ALTER TABLE "AuditLog" DROP COLUMN "metrics",
ADD COLUMN     "conversation_id" TEXT,
ALTER COLUMN "job_id" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "AuditLog_conversation_id_stage_idx" ON "AuditLog"("conversation_id", "stage");

-- CreateIndex
CREATE INDEX "Job_triggered_by_idx" ON "Job"("triggered_by");

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
