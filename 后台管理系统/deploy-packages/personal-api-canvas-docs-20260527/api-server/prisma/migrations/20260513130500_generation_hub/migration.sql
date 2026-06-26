CREATE TYPE "GenerationTaskStatus" AS ENUM ('CREATED', 'PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'TIMEOUT', 'REFUNDED', 'CANCELLED', 'MANUAL_REVIEW');
CREATE TYPE "GenerationRefundStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');
CREATE TYPE "GenerationRefundSource" AS ENUM ('AUTO', 'ADMIN');

ALTER TABLE "upstream_providers" ADD COLUMN "provider_key" TEXT;
ALTER TABLE "upstream_providers" ADD COLUMN "type" "ModelType";
ALTER TABLE "upstream_providers" ADD COLUMN "adapter" TEXT NOT NULL DEFAULT 'openai-image';
ALTER TABLE "upstream_providers" ADD COLUMN "endpoint_path" TEXT;
ALTER TABLE "upstream_providers" ADD COLUMN "status_endpoint_path" TEXT;
ALTER TABLE "upstream_providers" ADD COLUMN "upload_mode" TEXT;
ALTER TABLE "upstream_providers" ADD COLUMN "request_method" TEXT;
ALTER TABLE "upstream_providers" ADD COLUMN "default_model" TEXT;
ALTER TABLE "upstream_providers" ADD COLUMN "default_params" JSONB;
ALTER TABLE "upstream_providers" ADD COLUMN "timeout_ms" INTEGER NOT NULL DEFAULT 60000;
ALTER TABLE "upstream_providers" ADD COLUMN "weight" INTEGER NOT NULL DEFAULT 100;
ALTER TABLE "upstream_providers" ADD COLUMN "concurrency_limit" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "upstream_providers" ADD COLUMN "failure_threshold" INTEGER NOT NULL DEFAULT 5;

UPDATE "upstream_providers"
SET "provider_key" = regexp_replace(lower("name"), '[^a-z0-9]+', '_', 'g') || '_' || substr("id", 1, 8)
WHERE "provider_key" IS NULL;

ALTER TABLE "upstream_providers" ALTER COLUMN "provider_key" SET NOT NULL;
CREATE UNIQUE INDEX "upstream_providers_provider_key_key" ON "upstream_providers"("provider_key");
CREATE INDEX "upstream_providers_adapter_status_idx" ON "upstream_providers"("adapter", "status");

ALTER TABLE "ai_models" ADD COLUMN "model_key" TEXT;
CREATE INDEX "ai_models_provider_id_model_key_idx" ON "ai_models"("provider_id", "model_key");

CREATE TABLE "generation_tasks" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "provider_id" TEXT NOT NULL,
  "model_id" TEXT NOT NULL,
  "channel_key" TEXT NOT NULL,
  "type" "ModelType" NOT NULL,
  "mode" TEXT NOT NULL,
  "status" "GenerationTaskStatus" NOT NULL DEFAULT 'CREATED',
  "prompt" TEXT NOT NULL,
  "negative_prompt" TEXT,
  "input_files_json" JSONB,
  "params_json" JSONB,
  "request_json" JSONB,
  "response_json" JSONB,
  "upstream_task_id" TEXT,
  "upstream_request_id" TEXT,
  "result_json" JSONB,
  "result_urls_json" JSONB,
  "charged_credits" INTEGER NOT NULL DEFAULT 0,
  "cost_amount" INTEGER NOT NULL DEFAULT 0,
  "cost_usd" DECIMAL(12,6) NOT NULL DEFAULT 0,
  "refund_credits" INTEGER NOT NULL DEFAULT 0,
  "refund_status" TEXT NOT NULL DEFAULT 'NONE',
  "refund_reason" TEXT,
  "error_code" TEXT,
  "error_message" TEXT,
  "retry_count" INTEGER NOT NULL DEFAULT 0,
  "progress" INTEGER NOT NULL DEFAULT 0,
  "started_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "failed_at" TIMESTAMP(3),
  "refunded_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "generation_tasks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "generation_refunds" (
  "id" TEXT NOT NULL,
  "task_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "status" "GenerationRefundStatus" NOT NULL DEFAULT 'PENDING',
  "source" "GenerationRefundSource" NOT NULL DEFAULT 'AUTO',
  "reason" TEXT,
  "operator_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processed_at" TIMESTAMP(3),
  CONSTRAINT "generation_refunds_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "provider_health_logs" (
  "id" TEXT NOT NULL,
  "provider_id" TEXT NOT NULL,
  "model_id" TEXT,
  "task_id" TEXT,
  "status" TEXT NOT NULL,
  "latency_ms" INTEGER NOT NULL DEFAULT 0,
  "error_code" TEXT,
  "error_message" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "provider_health_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "generation_tasks_user_id_created_at_idx" ON "generation_tasks"("user_id", "created_at");
CREATE INDEX "generation_tasks_channel_key_status_created_at_idx" ON "generation_tasks"("channel_key", "status", "created_at");
CREATE INDEX "generation_tasks_type_status_created_at_idx" ON "generation_tasks"("type", "status", "created_at");
CREATE INDEX "generation_refunds_task_id_created_at_idx" ON "generation_refunds"("task_id", "created_at");
CREATE INDEX "generation_refunds_user_id_created_at_idx" ON "generation_refunds"("user_id", "created_at");
CREATE INDEX "provider_health_logs_provider_id_created_at_idx" ON "provider_health_logs"("provider_id", "created_at");
CREATE INDEX "provider_health_logs_status_created_at_idx" ON "provider_health_logs"("status", "created_at");

ALTER TABLE "generation_tasks" ADD CONSTRAINT "generation_tasks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "generation_tasks" ADD CONSTRAINT "generation_tasks_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "upstream_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "generation_tasks" ADD CONSTRAINT "generation_tasks_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "ai_models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "generation_refunds" ADD CONSTRAINT "generation_refunds_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "generation_tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "generation_refunds" ADD CONSTRAINT "generation_refunds_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "provider_health_logs" ADD CONSTRAINT "provider_health_logs_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "upstream_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "provider_health_logs" ADD CONSTRAINT "provider_health_logs_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "ai_models"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "provider_health_logs" ADD CONSTRAINT "provider_health_logs_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "generation_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
