ALTER TYPE "PaymentChannel" ADD VALUE IF NOT EXISTS 'AGENT_VOUCHER';
ALTER TYPE "PaymentChannel" ADD VALUE IF NOT EXISTS 'ADMIN_MANUAL';

CREATE TYPE "AgentCreditVoucherStatus" AS ENUM ('AVAILABLE', 'REDEEMED', 'CANCELLED', 'EXPIRED');
CREATE TYPE "AgentCreditLedgerType" AS ENUM ('ADMIN_GRANT', 'VOUCHER_FREEZE', 'VOUCHER_REDEEM', 'VOUCHER_CANCEL', 'VOUCHER_EXPIRE', 'MANUAL_ADJUST');
CREATE TYPE "AgentReconciliationOrderType" AS ENUM ('PREPAID_GRANT', 'VOUCHER_REDEEM', 'SETTLEMENT', 'MANUAL_ADJUST');
CREATE TYPE "AgentReconciliationOrderStatus" AS ENUM ('PENDING', 'CONFIRMED', 'SETTLED', 'CANCELLED');

CREATE TABLE "agent_credit_accounts" (
  "id" TEXT NOT NULL,
  "agent_id" TEXT NOT NULL,
  "available_credits" INTEGER NOT NULL DEFAULT 0,
  "frozen_credits" INTEGER NOT NULL DEFAULT 0,
  "used_credits" INTEGER NOT NULL DEFAULT 0,
  "credit_limit" INTEGER NOT NULL DEFAULT 0,
  "receivable_credits" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "agent_credit_accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent_credit_vouchers" (
  "id" TEXT NOT NULL,
  "voucher_no" TEXT NOT NULL,
  "code_hash" TEXT NOT NULL,
  "code_last4" TEXT NOT NULL,
  "agent_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "credits" INTEGER NOT NULL,
  "amount_cents" INTEGER NOT NULL DEFAULT 0,
  "status" "AgentCreditVoucherStatus" NOT NULL DEFAULT 'AVAILABLE',
  "expired_at" TIMESTAMP(3) NOT NULL,
  "redeemed_at" TIMESTAMP(3),
  "recharge_order_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "agent_credit_vouchers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent_credit_ledgers" (
  "id" TEXT NOT NULL,
  "agent_id" TEXT NOT NULL,
  "type" "AgentCreditLedgerType" NOT NULL,
  "amount" INTEGER NOT NULL,
  "balance_before" INTEGER NOT NULL,
  "balance_after" INTEGER NOT NULL,
  "related_type" TEXT,
  "related_id" TEXT,
  "remark" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agent_credit_ledgers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent_reconciliation_orders" (
  "id" TEXT NOT NULL,
  "order_no" TEXT NOT NULL,
  "agent_id" TEXT NOT NULL,
  "type" "AgentReconciliationOrderType" NOT NULL,
  "status" "AgentReconciliationOrderStatus" NOT NULL DEFAULT 'PENDING',
  "credits" INTEGER NOT NULL DEFAULT 0,
  "amount_cents" INTEGER NOT NULL DEFAULT 0,
  "transfer_channel" TEXT,
  "transfer_no" TEXT,
  "proof_image_url" TEXT,
  "related_type" TEXT,
  "related_id" TEXT,
  "remark" TEXT,
  "confirmed_by_admin_id" TEXT,
  "confirmed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "agent_reconciliation_orders_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "agent_credit_accounts_agent_id_key" ON "agent_credit_accounts"("agent_id");
CREATE UNIQUE INDEX "agent_credit_vouchers_voucher_no_key" ON "agent_credit_vouchers"("voucher_no");
CREATE UNIQUE INDEX "agent_credit_vouchers_code_hash_key" ON "agent_credit_vouchers"("code_hash");
CREATE UNIQUE INDEX "agent_credit_vouchers_recharge_order_id_key" ON "agent_credit_vouchers"("recharge_order_id");
CREATE INDEX "agent_credit_vouchers_agent_id_created_at_idx" ON "agent_credit_vouchers"("agent_id", "created_at");
CREATE INDEX "agent_credit_vouchers_user_id_status_idx" ON "agent_credit_vouchers"("user_id", "status");
CREATE INDEX "agent_credit_ledgers_agent_id_created_at_idx" ON "agent_credit_ledgers"("agent_id", "created_at");
CREATE UNIQUE INDEX "agent_reconciliation_orders_order_no_key" ON "agent_reconciliation_orders"("order_no");
CREATE INDEX "agent_reconciliation_orders_agent_id_created_at_idx" ON "agent_reconciliation_orders"("agent_id", "created_at");
CREATE INDEX "agent_reconciliation_orders_status_created_at_idx" ON "agent_reconciliation_orders"("status", "created_at");

ALTER TABLE "agent_credit_accounts" ADD CONSTRAINT "agent_credit_accounts_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agent_credit_vouchers" ADD CONSTRAINT "agent_credit_vouchers_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agent_credit_vouchers" ADD CONSTRAINT "agent_credit_vouchers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agent_credit_vouchers" ADD CONSTRAINT "agent_credit_vouchers_recharge_order_id_fkey" FOREIGN KEY ("recharge_order_id") REFERENCES "recharge_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "agent_credit_ledgers" ADD CONSTRAINT "agent_credit_ledgers_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agent_reconciliation_orders" ADD CONSTRAINT "agent_reconciliation_orders_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agent_reconciliation_orders" ADD CONSTRAINT "agent_reconciliation_orders_confirmed_by_admin_id_fkey" FOREIGN KEY ("confirmed_by_admin_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
