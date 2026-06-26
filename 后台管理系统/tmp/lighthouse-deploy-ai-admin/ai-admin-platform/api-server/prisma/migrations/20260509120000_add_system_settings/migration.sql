CREATE TYPE "SystemSettingValueType" AS ENUM ('STRING', 'NUMBER', 'BOOLEAN', 'SECRET');

CREATE TABLE "system_settings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "setting_group" TEXT NOT NULL,
    "value" TEXT,
    "value_type" "SystemSettingValueType" NOT NULL DEFAULT 'STRING',
    "is_secret" BOOLEAN NOT NULL DEFAULT false,
    "remark" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "system_settings_key_key" ON "system_settings"("key");
CREATE INDEX "system_settings_setting_group_idx" ON "system_settings"("setting_group");
