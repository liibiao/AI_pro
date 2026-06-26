ALTER TABLE "ai_models"
ALTER COLUMN "cost_price" TYPE DECIMAL(12,4) USING "cost_price"::DECIMAL(12,4),
ALTER COLUMN "cost_price" SET DEFAULT 0;

ALTER TABLE "model_usages"
ALTER COLUMN "cost_amount" TYPE DECIMAL(12,4) USING "cost_amount"::DECIMAL(12,4),
ALTER COLUMN "cost_amount" SET DEFAULT 0;

ALTER TABLE "generation_tasks"
ALTER COLUMN "cost_amount" TYPE DECIMAL(12,4) USING "cost_amount"::DECIMAL(12,4),
ALTER COLUMN "cost_amount" SET DEFAULT 0;
