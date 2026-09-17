-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('REGULAR', 'ADMIN');

-- CreateEnum
CREATE TYPE "RepositoryStatus" AS ENUM ('NOT_READY', 'READY', 'ERROR');

-- CreateEnum
CREATE TYPE "RepositorySourceType" AS ENUM ('LOCAL', 'GIT');

-- CreateEnum
CREATE TYPE "RepositoryPermission" AS ENUM ('READ', 'READ_WRITE');

-- CreateEnum
CREATE TYPE "AccessRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('INDEX', 'REFRESH');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('pending', 'processing', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "PipelineStage" AS ENUM ('JOB_CLAIM', 'JOB_HEARTBEAT', 'JOB_COMPLETE', 'JOB_RETRY', 'JOB_FAILED', 'GIT_CONNECT_REPO', 'GIT_CLONE_REPO', 'GIT_DIFF', 'RESOLVE_SOURCE', 'RESET_COLLECTION', 'REFRESH_COLLECTION', 'SCAN_FILES', 'INITIALIZE_PROVIDERS', 'PARSE_FILES', 'GENERATE_CHUNKS', 'BUILD_GRAPH', 'ENRICH_CHUNKS', 'EMBED_CHUNKS', 'INDEX_CHUNKS', 'PROCESS_DOCUMENTATION');

-- CreateEnum
CREATE TYPE "PipelineStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'SKIPPED', 'RETRYING');

-- CreateEnum
CREATE TYPE "ScanType" AS ENUM ('FULL', 'DIFF');

-- CreateEnum
CREATE TYPE "MetricsType" AS ENUM ('PERFORMANCE', 'COST', 'RESOURCE', 'QUALITY', 'BUSINESS');

-- CreateEnum
CREATE TYPE "OperationType" AS ENUM ('EMBEDDING', 'ENRICHMENT', 'CHAT', 'RETRIEVAL');

-- CreateEnum
CREATE TYPE "ProviderType" AS ENUM ('OPENAI', 'OLLAMA', 'AZURE', 'ANTHROPIC', 'CUSTOM');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('user', 'assistant');

-- CreateEnum
CREATE TYPE "JobLogLevel" AS ENUM ('info', 'warn', 'error');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'REGULAR',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Repository" (
    "id" TEXT NOT NULL,
    "source_type" "RepositorySourceType" NOT NULL DEFAULT 'LOCAL',
    "git_url" TEXT,
    "local_path" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "RepositoryStatus" NOT NULL DEFAULT 'NOT_READY',
    "last_processed_job_id" TEXT,
    "owner_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Repository_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepositoryAccess" (
    "id" TEXT NOT NULL,
    "repository_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "permission" "RepositoryPermission" NOT NULL,
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "granted_by" TEXT,

    CONSTRAINT "RepositoryAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessRequest" (
    "id" TEXT NOT NULL,
    "repository_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" "AccessRequestStatus" NOT NULL DEFAULT 'PENDING',
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responded_at" TIMESTAMP(3),
    "responded_by" TEXT,
    "response_message" TEXT,

    CONSTRAINT "AccessRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "repository_id" TEXT NOT NULL,
    "type" "JobType" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'pending',
    "commit_head" TEXT NOT NULL,
    "worker_id" TEXT,
    "error_message" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "triggered_by" TEXT,
    "scan_type" "ScanType",
    "job_metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "last_heartbeat" TIMESTAMP(3),

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "stage" "PipelineStage" NOT NULL,
    "status" "PipelineStatus" NOT NULL,
    "metrics_type" "MetricsType" NOT NULL,
    "metrics" JSONB,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "user_id" TEXT,
    "worker_id" TEXT,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformanceMetrics" (
    "id" TEXT NOT NULL,
    "audit_log_id" TEXT NOT NULL,
    "duration_ms" INTEGER NOT NULL,
    "files_processed" INTEGER,
    "chunks_generated" INTEGER,
    "files_per_second" DOUBLE PRECISION,
    "chunks_per_second" DOUBLE PRECISION,
    "scan_file_count" INTEGER,
    "scan_duration_ms" INTEGER,
    "scan_files_per_second" DOUBLE PRECISION,
    "processing_successful_files" INTEGER,
    "processing_failed_files" INTEGER,
    "processing_total_files" INTEGER,
    "processing_duration_ms" INTEGER,
    "processing_success_rate" DOUBLE PRECISION,
    "graph_node_count" INTEGER,
    "graph_edge_count" INTEGER,
    "graph_duration_ms" INTEGER,
    "graph_density" DOUBLE PRECISION,

    CONSTRAINT "PerformanceMetrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostMetrics" (
    "id" TEXT NOT NULL,
    "audit_log_id" TEXT NOT NULL,
    "operation_type" "OperationType" NOT NULL,
    "provider_type" "ProviderType" NOT NULL,
    "model_name" TEXT NOT NULL,
    "base_url" TEXT,
    "prompt_tokens" INTEGER,
    "completion_tokens" INTEGER,
    "total_tokens" INTEGER,
    "cost_usd" DOUBLE PRECISION,
    "cost_per_1k_prompt_tokens" DOUBLE PRECISION,
    "cost_per_1k_completion_tokens" DOUBLE PRECISION,
    "duration_ms" INTEGER,
    "chunk_count" INTEGER,

    CONSTRAINT "CostMetrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResourceMetrics" (
    "id" TEXT NOT NULL,
    "audit_log_id" TEXT NOT NULL,
    "memory_used_mb" DOUBLE PRECISION,
    "memory_peak_mb" DOUBLE PRECISION,
    "cpu_percent" DOUBLE PRECISION,
    "cpu_time_ms" INTEGER,
    "storage_used_mb" DOUBLE PRECISION,
    "storage_freed_mb" DOUBLE PRECISION,
    "network_bytes_sent" BIGINT,
    "network_bytes_received" BIGINT,
    "active_workers" INTEGER,
    "queue_depth" INTEGER,

    CONSTRAINT "ResourceMetrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QualityMetrics" (
    "id" TEXT NOT NULL,
    "audit_log_id" TEXT NOT NULL,
    "parse_success_rate" DOUBLE PRECISION,
    "enrichment_success_rate" DOUBLE PRECISION,
    "indexing_success_rate" DOUBLE PRECISION,
    "average_chunk_size" DOUBLE PRECISION,
    "empty_chunks" INTEGER,
    "duplicate_chunks" INTEGER,
    "graph_connectivity" DOUBLE PRECISION,
    "orphan_nodes" INTEGER,
    "checksum_passed" BOOLEAN,
    "integrity_total_checks" INTEGER,
    "integrity_passed_checks" INTEGER,
    "integrity_failed_checks" INTEGER,

    CONSTRAINT "QualityMetrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessMetrics" (
    "id" TEXT NOT NULL,
    "audit_log_id" TEXT NOT NULL,
    "repositories_indexed" INTEGER,
    "users_affected" INTEGER,
    "query_count" INTEGER,
    "unique_queries" INTEGER,
    "user_satisfaction" DOUBLE PRECISION,
    "resolution_rate" DOUBLE PRECISION,
    "sla_compliance" BOOLEAN,
    "priority_level" TEXT,

    CONSTRAINT "BusinessMetrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobLog" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "level" "JobLogLevel" NOT NULL DEFAULT 'info',
    "message" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "repository_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "role" "MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE UNIQUE INDEX "Repository_git_url_key" ON "Repository"("git_url");

-- CreateIndex
CREATE INDEX "Repository_status_idx" ON "Repository"("status");

-- CreateIndex
CREATE INDEX "Repository_git_url_idx" ON "Repository"("git_url");

-- CreateIndex
CREATE INDEX "Repository_owner_id_idx" ON "Repository"("owner_id");

-- CreateIndex
CREATE INDEX "Repository_last_processed_job_id_idx" ON "Repository"("last_processed_job_id");

-- CreateIndex
CREATE INDEX "Repository_source_type_idx" ON "Repository"("source_type");

-- CreateIndex
CREATE INDEX "RepositoryAccess_user_id_idx" ON "RepositoryAccess"("user_id");

-- CreateIndex
CREATE INDEX "RepositoryAccess_repository_id_idx" ON "RepositoryAccess"("repository_id");

-- CreateIndex
CREATE UNIQUE INDEX "RepositoryAccess_repository_id_user_id_key" ON "RepositoryAccess"("repository_id", "user_id");

-- CreateIndex
CREATE INDEX "AccessRequest_repository_id_status_idx" ON "AccessRequest"("repository_id", "status");

-- CreateIndex
CREATE INDEX "AccessRequest_user_id_status_idx" ON "AccessRequest"("user_id", "status");

-- CreateIndex
CREATE INDEX "Job_status_created_at_idx" ON "Job"("status", "created_at");

-- CreateIndex
CREATE INDEX "Job_repository_id_idx" ON "Job"("repository_id");

-- CreateIndex
CREATE INDEX "Job_worker_id_idx" ON "Job"("worker_id");

-- CreateIndex
CREATE INDEX "Job_scan_type_idx" ON "Job"("scan_type");

-- CreateIndex
CREATE INDEX "AuditLog_job_id_stage_idx" ON "AuditLog"("job_id", "stage");

-- CreateIndex
CREATE INDEX "AuditLog_status_idx" ON "AuditLog"("status");

-- CreateIndex
CREATE INDEX "AuditLog_user_id_idx" ON "AuditLog"("user_id");

-- CreateIndex
CREATE INDEX "AuditLog_metrics_type_idx" ON "AuditLog"("metrics_type");

-- CreateIndex
CREATE UNIQUE INDEX "PerformanceMetrics_audit_log_id_key" ON "PerformanceMetrics"("audit_log_id");

-- CreateIndex
CREATE INDEX "PerformanceMetrics_audit_log_id_idx" ON "PerformanceMetrics"("audit_log_id");

-- CreateIndex
CREATE UNIQUE INDEX "CostMetrics_audit_log_id_key" ON "CostMetrics"("audit_log_id");

-- CreateIndex
CREATE INDEX "CostMetrics_audit_log_id_idx" ON "CostMetrics"("audit_log_id");

-- CreateIndex
CREATE INDEX "CostMetrics_operation_type_idx" ON "CostMetrics"("operation_type");

-- CreateIndex
CREATE INDEX "CostMetrics_provider_type_idx" ON "CostMetrics"("provider_type");

-- CreateIndex
CREATE UNIQUE INDEX "ResourceMetrics_audit_log_id_key" ON "ResourceMetrics"("audit_log_id");

-- CreateIndex
CREATE INDEX "ResourceMetrics_audit_log_id_idx" ON "ResourceMetrics"("audit_log_id");

-- CreateIndex
CREATE UNIQUE INDEX "QualityMetrics_audit_log_id_key" ON "QualityMetrics"("audit_log_id");

-- CreateIndex
CREATE INDEX "QualityMetrics_audit_log_id_idx" ON "QualityMetrics"("audit_log_id");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessMetrics_audit_log_id_key" ON "BusinessMetrics"("audit_log_id");

-- CreateIndex
CREATE INDEX "BusinessMetrics_audit_log_id_idx" ON "BusinessMetrics"("audit_log_id");

-- CreateIndex
CREATE INDEX "JobLog_job_id_created_at_idx" ON "JobLog"("job_id", "created_at");

-- CreateIndex
CREATE INDEX "Conversation_repository_id_idx" ON "Conversation"("repository_id");

-- CreateIndex
CREATE INDEX "Conversation_user_id_idx" ON "Conversation"("user_id");

-- CreateIndex
CREATE INDEX "Conversation_created_at_idx" ON "Conversation"("created_at");

-- CreateIndex
CREATE INDEX "Message_conversation_id_idx" ON "Message"("conversation_id");

-- CreateIndex
CREATE INDEX "Message_created_at_idx" ON "Message"("created_at");

-- AddForeignKey
ALTER TABLE "Repository" ADD CONSTRAINT "Repository_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Repository" ADD CONSTRAINT "Repository_last_processed_job_id_fkey" FOREIGN KEY ("last_processed_job_id") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepositoryAccess" ADD CONSTRAINT "RepositoryAccess_repository_id_fkey" FOREIGN KEY ("repository_id") REFERENCES "Repository"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepositoryAccess" ADD CONSTRAINT "RepositoryAccess_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessRequest" ADD CONSTRAINT "AccessRequest_repository_id_fkey" FOREIGN KEY ("repository_id") REFERENCES "Repository"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessRequest" ADD CONSTRAINT "AccessRequest_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_repository_id_fkey" FOREIGN KEY ("repository_id") REFERENCES "Repository"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_triggered_by_fkey" FOREIGN KEY ("triggered_by") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceMetrics" ADD CONSTRAINT "PerformanceMetrics_audit_log_id_fkey" FOREIGN KEY ("audit_log_id") REFERENCES "AuditLog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostMetrics" ADD CONSTRAINT "CostMetrics_audit_log_id_fkey" FOREIGN KEY ("audit_log_id") REFERENCES "AuditLog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceMetrics" ADD CONSTRAINT "ResourceMetrics_audit_log_id_fkey" FOREIGN KEY ("audit_log_id") REFERENCES "AuditLog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityMetrics" ADD CONSTRAINT "QualityMetrics_audit_log_id_fkey" FOREIGN KEY ("audit_log_id") REFERENCES "AuditLog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessMetrics" ADD CONSTRAINT "BusinessMetrics_audit_log_id_fkey" FOREIGN KEY ("audit_log_id") REFERENCES "AuditLog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobLog" ADD CONSTRAINT "JobLog_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_repository_id_fkey" FOREIGN KEY ("repository_id") REFERENCES "Repository"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "Conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
