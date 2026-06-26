-- CreateEnum
CREATE TYPE "PaymentChannel" AS ENUM ('ALIPAY', 'MOCK');

-- CreateEnum
CREATE TYPE "RechargeOrderStatus" AS ENUM ('PENDING', 'PAID', 'CLOSED', 'FAILED');

-- CreateTable
CREATE TABLE "recharge_orders" (
    "id" TEXT NOT NULL,
    "order_no" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "channel" "PaymentChannel" NOT NULL,
    "status" "RechargeOrderStatus" NOT NULL DEFAULT 'PENDING',
    "amount_cents" INTEGER NOT NULL,
    "credits" INTEGER NOT NULL,
    "qr_code" TEXT,
    "payment_trade_no" TEXT,
    "notify_payload" JSONB,
    "paid_at" TIMESTAMP(3),
    "expired_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recharge_orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "recharge_orders_order_no_key" ON "recharge_orders"("order_no");

-- CreateIndex
CREATE INDEX "recharge_orders_user_id_created_at_idx" ON "recharge_orders"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "recharge_orders_status_created_at_idx" ON "recharge_orders"("status", "created_at");

-- AddForeignKey
ALTER TABLE "recharge_orders" ADD CONSTRAINT "recharge_orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
