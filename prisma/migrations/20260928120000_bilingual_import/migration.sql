-- AlterTable
ALTER TABLE "courses" ADD COLUMN     "source_key" TEXT;

-- AlterTable
ALTER TABLE "exams" ADD COLUMN     "source_key" TEXT;

-- AlterTable
ALTER TABLE "modules" ADD COLUMN     "source_key" TEXT;

-- AlterTable
ALTER TABLE "question_answers" ADD COLUMN     "answer_text_en" TEXT,
ADD COLUMN     "explanation_en" TEXT,
ADD COLUMN     "position" INTEGER;

-- AlterTable
ALTER TABLE "question_sources" ADD COLUMN     "source_key" TEXT;

-- AlterTable
ALTER TABLE "questions" ADD COLUMN     "content_hash" TEXT,
ADD COLUMN     "explanation_en" TEXT,
ADD COLUMN     "is_published" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "question_text_en" TEXT,
ADD COLUMN     "source_key" TEXT;

-- AlterTable
ALTER TABLE "study_packs" ADD COLUMN     "source_key" TEXT;

-- AlterTable
ALTER TABLE "unites" ADD COLUMN     "source_key" TEXT;

-- AlterTable
ALTER TABLE "universities" ADD COLUMN     "source_key" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "courses_source_key_key" ON "courses"("source_key");

-- CreateIndex
CREATE INDEX "courses_module_id_idx" ON "courses"("module_id");

-- CreateIndex
CREATE UNIQUE INDEX "exams_source_key_key" ON "exams"("source_key");

-- CreateIndex
CREATE UNIQUE INDEX "modules_source_key_key" ON "modules"("source_key");

-- CreateIndex
CREATE INDEX "modules_unite_id_idx" ON "modules"("unite_id");

-- CreateIndex
CREATE INDEX "question_answers_question_id_position_idx" ON "question_answers"("question_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "question_sources_source_key_key" ON "question_sources"("source_key");

-- CreateIndex
CREATE UNIQUE INDEX "questions_source_key_key" ON "questions"("source_key");

-- CreateIndex
CREATE INDEX "quiz_attempts_selected_answer_id_idx" ON "quiz_attempts"("selected_answer_id");

-- CreateIndex
CREATE INDEX "quiz_session_questions_question_id_idx" ON "quiz_session_questions"("question_id");

-- CreateIndex
CREATE UNIQUE INDEX "study_packs_source_key_key" ON "study_packs"("source_key");

-- CreateIndex
CREATE UNIQUE INDEX "unites_source_key_key" ON "unites"("source_key");

-- CreateIndex
CREATE INDEX "unites_study_pack_id_idx" ON "unites"("study_pack_id");

-- CreateIndex
CREATE UNIQUE INDEX "universities_source_key_key" ON "universities"("source_key");

