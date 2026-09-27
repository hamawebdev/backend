-- AlterTable
ALTER TABLE "users" ADD COLUMN     "token_version" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "code_redemptions_activation_code_id_user_id_key" ON "code_redemptions"("activation_code_id", "user_id");
