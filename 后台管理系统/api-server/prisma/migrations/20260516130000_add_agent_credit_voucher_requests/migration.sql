ALTER TYPE "AgentReconciliationOrderType" ADD VALUE IF NOT EXISTS 'VOUCHER_REQUEST';

CREATE TYPE "AgentCreditVoucherRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

CREATE TABLE "agent_credit_voucher_requests" (
  "id" TEXT NOT NULL,
  "request_no" TEXT NOT NULL,
  "agent_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "credits" INTEGER NOT NULL,
  "amount_cents" INTEGER NOT NULL DEFAULT 0,
  "valid_days" INTEGER NOT NULL DEFAULT 30,
  "transfer_channel" TEXT,
  "transfer_no" TEXT,
  "proof_image_url" TEXT,
  "remark" TEXT,
  "status" "AgentCreditVoucherRequestStatus" NOT NULL DEFAULT 'PENDING',
  "voucher_id" TEXT,
  "reconciliation_order_id" TEXT,
  "code_encrypted" TEXT,
  "code_viewed_at" TIMESTAMP(3),
  "reviewed_by_admin_id" TEXT,
  "reviewed_at" TIMESTAMP(3),
  "reject_reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "agent_credit_voucher_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "agent_credit_voucher_requests_request_no_key" ON "agent_credit_voucher_requests"("request_no");
CREATE UNIQUE INDEX "agent_credit_voucher_requests_voucher_id_key" ON "agent_credit_voucher_requests"("voucher_id");
CREATE UNIQUE INDEX "agent_credit_voucher_requests_reconciliation_order_id_key" ON "agent_credit_voucher_requests"("reconciliation_order_id");
CREATE INDEX "agent_credit_voucher_requests_agent_id_status_created_at_idx" ON "agent_credit_voucher_requests"("agent_id", "status", "created_at");
CREATE INDEX "agent_credit_voucher_requests_status_created_at_idx" ON "agent_credit_voucher_requests"("status", "created_at");
CREATE INDEX "agent_credit_voucher_requests_user_id_created_at_idx" ON "agent_credit_voucher_requests"("user_id", "created_at");

ALTER TABLE "agent_credit_voucher_requests" ADD CONSTRAINT "agent_credit_voucher_requests_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agent_credit_voucher_requests" ADD CONSTRAINT "agent_credit_voucher_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agent_credit_voucher_requests" ADD CONSTRAINT "agent_credit_voucher_requests_voucher_id_fkey" FOREIGN KEY ("voucher_id") REFERENCES "agent_credit_vouchers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "agent_credit_voucher_requests" ADD CONSTRAINT "agent_credit_voucher_requests_reconciliation_order_id_fkey" FOREIGN KEY ("reconciliation_order_id") REFERENCES "agent_reconciliation_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "agent_credit_voucher_requests" ADD CONSTRAINT "agent_credit_voucher_requests_reviewed_by_admin_id_fkey" FOREIGN KEY ("reviewed_by_admin_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
