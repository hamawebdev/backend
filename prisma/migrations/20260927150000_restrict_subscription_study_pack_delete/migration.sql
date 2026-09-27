-- DropForeignKey
ALTER TABLE "subscriptions" DROP CONSTRAINT "subscriptions_study_pack_id_fkey";

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_study_pack_id_fkey" FOREIGN KEY ("study_pack_id") REFERENCES "study_packs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

