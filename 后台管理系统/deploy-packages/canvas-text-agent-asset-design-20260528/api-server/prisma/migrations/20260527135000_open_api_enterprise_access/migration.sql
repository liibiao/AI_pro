-- Open API personal/enterprise access
CREATE TYPE "ApiTokenStatus" AS ENUM ('ACTIVE', 'DISABLED');
CREATE TYPE "EnterpriseStatus" AS ENUM ('ACTIVE', 'DISABLED');
CREATE TYPE "EnterpriseUserRole" AS ENUM ('ENTERPRISE_ADMIN', 'ENTERPRISE_VIEWER');
CREATE TYPE "EnterpriseUserStatus" AS ENUM ('ACTIVE', 'DISABLED');

CREATE TABLE "personal_api_tokens" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL,
  "token_prefix" TEXT NOT NULL,
  "status" "ApiTokenStatus" NOT NULL DEFAULT 'ACTIVE',
  "last_used_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "personal_api_tokens_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "enterprise_accounts" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "billing_user_id" TEXT NOT NULL,
  "status" "EnterpriseStatus" NOT NULL DEFAULT 'ACTIVE',
  "remark" TEXT,
  "created_by_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "enterprise_accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "enterprise_users" (
  "id" TEXT NOT NULL,
  "enterprise_id" TEXT NOT NULL,
  "email" TEXT,
  "phone" TEXT,
  "password_hash" TEXT NOT NULL,
  "nickname" TEXT NOT NULL,
  "role" "EnterpriseUserRole" NOT NULL DEFAULT 'ENTERPRISE_ADMIN',
  "status" "EnterpriseUserStatus" NOT NULL DEFAULT 'ACTIVE',
  "last_login_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "enterprise_users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "enterprise_api_tokens" (
  "id" TEXT NOT NULL,
  "enterprise_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL,
  "token_prefix" TEXT NOT NULL,
  "status" "ApiTokenStatus" NOT NULL DEFAULT 'ACTIVE',
  "expired_at" TIMESTAMP(3),
  "last_used_at" TIMESTAMP(3),
  "created_by_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "enterprise_api_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "personal_api_tokens_token_hash_key" ON "personal_api_tokens"("token_hash");
CREATE INDEX "personal_api_tokens_user_id_status_idx" ON "personal_api_tokens"("user_id", "status");

CREATE UNIQUE INDEX "enterprise_accounts_billing_user_id_key" ON "enterprise_accounts"("billing_user_id");
CREATE INDEX "enterprise_accounts_status_created_at_idx" ON "enterprise_accounts"("status", "created_at");

CREATE UNIQUE INDEX "enterprise_users_email_key" ON "enterprise_users"("email");
CREATE UNIQUE INDEX "enterprise_users_phone_key" ON "enterprise_users"("phone");
CREATE INDEX "enterprise_users_enterprise_id_status_idx" ON "enterprise_users"("enterprise_id", "status");

CREATE UNIQUE INDEX "enterprise_api_tokens_token_hash_key" ON "enterprise_api_tokens"("token_hash");
CREATE INDEX "enterprise_api_tokens_enterprise_id_status_idx" ON "enterprise_api_tokens"("enterprise_id", "status");

ALTER TABLE "personal_api_tokens" ADD CONSTRAINT "personal_api_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "enterprise_accounts" ADD CONSTRAINT "enterprise_accounts_billing_user_id_fkey" FOREIGN KEY ("billing_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "enterprise_accounts" ADD CONSTRAINT "enterprise_accounts_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "enterprise_users" ADD CONSTRAINT "enterprise_users_enterprise_id_fkey" FOREIGN KEY ("enterprise_id") REFERENCES "enterprise_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "enterprise_api_tokens" ADD CONSTRAINT "enterprise_api_tokens_enterprise_id_fkey" FOREIGN KEY ("enterprise_id") REFERENCES "enterprise_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
