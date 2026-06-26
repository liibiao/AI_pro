CREATE TYPE "AgentCreditVoucherSource" AS ENUM ('AGENT', 'ADMIN');

ALTER TABLE "agent_credit_vouchers"
  ADD COLUMN "source" "AgentCreditVoucherSource" NOT NULL DEFAULT 'AGENT',
  ADD COLUMN "created_by_admin_id" TEXT;

ALTER TABLE "agent_credit_vouchers"
  ALTER COLUMN "agent_id" DROP NOT NULL;

CREATE INDEX "agent_credit_vouchers_source_status_created_at_idx"
  ON "agent_credit_vouchers"("source", "status", "created_at");

ALTER TABLE "agent_credit_vouchers"
  ADD CONSTRAINT "agent_credit_vouchers_created_by_admin_id_fkey"
  FOREIGN KEY ("created_by_admin_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
