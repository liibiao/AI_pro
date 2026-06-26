ALTER TABLE "generation_tasks"
ADD COLUMN "client_request_id" TEXT;

CREATE UNIQUE INDEX "generation_tasks_user_id_client_request_id_key"
ON "generation_tasks"("user_id", "client_request_id");
