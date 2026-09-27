-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'QROC');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'EMPLOYEE', 'STUDENT');

-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('LOCAL', 'GOOGLE');

-- CreateEnum
CREATE TYPE "YearLevel" AS ENUM ('ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN');

-- CreateEnum
CREATE TYPE "PackType" AS ENUM ('YEAR', 'RESIDENCY');

-- CreateEnum
CREATE TYPE "ResourceType" AS ENUM ('OFFICIAL_SUPPORT', 'CHOICE_OF_TEAM', 'VIDEO', 'AUDIO', 'OTHER');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CANCELLED', 'PENDING');

-- CreateEnum
CREATE TYPE "QuizType" AS ENUM ('PRACTICE', 'EXAM', 'MOCK', 'QCM', 'QCS');

-- CreateEnum
CREATE TYPE "SessionType" AS ENUM ('PRACTICE', 'EXAM', 'REMEDIAL');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "TodoType" AS ENUM ('READING', 'QUIZ', 'SESSION', 'EXAM', 'OTHER');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "TodoStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ReportType" AS ENUM ('INCORRECT_ANSWER', 'TYPO', 'UNCLEAR_QUESTION', 'MISSING_INFO', 'OTHER');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('PENDING', 'REVIEWED', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "RetakeType" AS ENUM ('SAME', 'INCORRECT_ONLY', 'CORRECT_ONLY', 'NOT_RESPONDED');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('QUESTION_ADDED', 'QUESTION_EDITED', 'QUESTION_VERIFIED', 'COURSE_UPLOADED', 'RESOURCE_ADDED', 'QUIZ_CREATED', 'EXAM_CREATED', 'QUIZ_SOURCE_CREATED', 'QUIZ_SOURCE_UPDATED', 'QUIZ_SOURCE_DELETED');

-- CreateTable
CREATE TABLE "universities" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'Algeria',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "universities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "specialties" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "specialties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT,
    "full_name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'STUDENT',
    "university_id" INTEGER,
    "specialty_id" INTEGER,
    "current_year" "YearLevel",
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login" TIMESTAMP(3),
    "reset_code" TEXT,
    "reset_code_expires_at" TIMESTAMP(3),
    "google_id" TEXT,
    "avatar_url" TEXT,
    "auth_provider" "AuthProvider" NOT NULL DEFAULT 'LOCAL',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "token" TEXT NOT NULL,
    "device_fingerprint" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_packs" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "year_number" TEXT,
    "price_per_month" DECIMAL(65,30) NOT NULL,
    "price_per_year" DECIMAL(65,30),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "study_packs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unites" (
    "id" SERIAL NOT NULL,
    "study_pack_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "logo_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "unites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modules" (
    "id" SERIAL NOT NULL,
    "unite_id" INTEGER,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "image_path" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "module_books" (
    "id" SERIAL NOT NULL,
    "module_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "cover_path" TEXT,
    "view_url" TEXT NOT NULL,
    "tag" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "module_books_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sub_modules" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "module_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sub_modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sub_module_books" (
    "id" SERIAL NOT NULL,
    "sub_module_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "cover_path" TEXT,
    "view_url" TEXT NOT NULL,
    "tag" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sub_module_books_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courses" (
    "id" SERIAL NOT NULL,
    "module_id" INTEGER NOT NULL,
    "sub_module_id" INTEGER,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_layers" (
    "id" SERIAL NOT NULL,
    "course_id" INTEGER NOT NULL,
    "student_id" INTEGER NOT NULL,
    "layer_number" INTEGER NOT NULL,
    "is_completed" BOOLEAN NOT NULL DEFAULT false,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_layers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_cards" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_card_courses" (
    "id" SERIAL NOT NULL,
    "card_id" INTEGER NOT NULL,
    "course_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_card_courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_resources" (
    "id" SERIAL NOT NULL,
    "course_id" INTEGER NOT NULL,
    "type" "ResourceType" NOT NULL,
    "title" TEXT NOT NULL,
    "tag" TEXT,
    "description" TEXT,
    "file_path" TEXT,
    "external_url" TEXT,
    "youtube_video_id" TEXT,
    "is_paid" BOOLEAN NOT NULL DEFAULT false,
    "price" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_resources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "study_pack_id" INTEGER NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'PENDING',
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "amount_paid" DOUBLE PRECISION NOT NULL,
    "payment_method" TEXT,
    "payment_reference" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_events" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "checkoutId" TEXT,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_sources" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "question_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quizzes" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "QuizType" NOT NULL DEFAULT 'PRACTICE',
    "course_id" INTEGER,
    "university_id" INTEGER,
    "year_level" "YearLevel",
    "quiz_year" INTEGER,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quizzes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questions" (
    "id" SERIAL NOT NULL,
    "course_id" INTEGER,
    "exam_id" INTEGER,
    "source_id" INTEGER,
    "question_text" TEXT NOT NULL,
    "explanation" TEXT,
    "question_type" "QuestionType" NOT NULL DEFAULT 'SINGLE_CHOICE',
    "university_id" INTEGER,
    "year_level" "YearLevel",
    "exam_year" INTEGER,
    "metadata" TEXT,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "repetition_count" INTEGER NOT NULL DEFAULT 0,
    "repetition_years" TEXT NOT NULL DEFAULT '[]',
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_questions" (
    "id" SERIAL NOT NULL,
    "quiz_id" INTEGER NOT NULL,
    "question_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quiz_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_answers" (
    "id" SERIAL NOT NULL,
    "question_id" INTEGER NOT NULL,
    "answer_text" TEXT NOT NULL,
    "is_correct" BOOLEAN NOT NULL DEFAULT false,
    "explanation" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "explanation_images" (
    "id" SERIAL NOT NULL,
    "answer_id" INTEGER NOT NULL,
    "image_path" TEXT NOT NULL,
    "alt_text" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "explanation_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_images" (
    "id" SERIAL NOT NULL,
    "question_id" INTEGER NOT NULL,
    "image_path" TEXT NOT NULL,
    "alt_text" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_explanation_images" (
    "id" SERIAL NOT NULL,
    "question_id" INTEGER NOT NULL,
    "image_path" TEXT NOT NULL,
    "alt_text" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_explanation_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exams" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "module_id" INTEGER NOT NULL,
    "university_id" INTEGER NOT NULL,
    "year_level" "YearLevel" NOT NULL,
    "exam_year" TIMESTAMP(3) NOT NULL,
    "year" INTEGER NOT NULL,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_quizzes" (
    "id" SERIAL NOT NULL,
    "exam_id" INTEGER NOT NULL,
    "quiz_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_quizzes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_questions" (
    "id" SERIAL NOT NULL,
    "exam_id" INTEGER NOT NULL,
    "question_id" INTEGER NOT NULL,
    "order_in_exam" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_sessions" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "quiz_id" INTEGER,
    "exam_id" INTEGER,
    "title" TEXT NOT NULL,
    "type" "SessionType" NOT NULL DEFAULT 'PRACTICE',
    "quiz_type" "QuizType",
    "status" "SessionStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "percentage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "original_session_id" INTEGER,
    "retake_type" "RetakeType",
    "is_retake" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quiz_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_session_questions" (
    "id" SERIAL NOT NULL,
    "session_id" INTEGER NOT NULL,
    "question_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quiz_session_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_attempts" (
    "id" SERIAL NOT NULL,
    "session_id" INTEGER NOT NULL,
    "question_id" INTEGER NOT NULL,
    "selected_answer_id" INTEGER,
    "text_answer" TEXT,
    "isCorrect" BOOLEAN,
    "user_manual_correction" BOOLEAN,
    "answered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quiz_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "multiple_choice_attempts" (
    "id" SERIAL NOT NULL,
    "session_id" INTEGER NOT NULL,
    "question_id" INTEGER NOT NULL,
    "selected_answer_ids" TEXT NOT NULL,
    "isCorrect" BOOLEAN,
    "partial_score" DOUBLE PRECISION,
    "answered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "multiple_choice_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activation_codes" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "hashed_code" TEXT NOT NULL,
    "description" TEXT,
    "duration_months" INTEGER NOT NULL,
    "duration_days" INTEGER,
    "duration_type" TEXT NOT NULL DEFAULT 'MONTHS',
    "max_uses" INTEGER NOT NULL DEFAULT 1,
    "current_uses" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_by_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "activation_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activation_code_study_packs" (
    "id" SERIAL NOT NULL,
    "activation_code_id" INTEGER NOT NULL,
    "study_pack_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activation_code_study_packs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "code_redemptions" (
    "id" SERIAL NOT NULL,
    "activation_code_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "subscription_id" INTEGER,
    "redeemed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "code_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_progress" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "course_id" INTEGER NOT NULL,
    "layer_1_completed" BOOLEAN NOT NULL DEFAULT false,
    "layer_2_completed" BOOLEAN NOT NULL DEFAULT false,
    "layer_3_completed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_labels" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_labels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_labels" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "quiz_id" INTEGER NOT NULL,
    "label_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quiz_labels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_labels" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "question_id" INTEGER NOT NULL,
    "label_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_labels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_session_labels" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "quiz_session_id" INTEGER NOT NULL,
    "label_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quiz_session_labels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_notes" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "question_id" INTEGER,
    "quiz_id" INTEGER,
    "note_text" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "note_labels" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "note_id" INTEGER NOT NULL,
    "label_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "note_labels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_reports" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "question_id" INTEGER NOT NULL,
    "reportType" "ReportType" NOT NULL,
    "description" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'PENDING',
    "reviewed_by" INTEGER,
    "admin_response" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "question_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "todo_items" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "TodoType" NOT NULL,
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "status" "TodoStatus" NOT NULL DEFAULT 'PENDING',
    "due_date" TIMESTAMP(3),
    "course_id" INTEGER,
    "quiz_id" INTEGER,
    "exam_id" INTEGER,
    "quiz_session_id" INTEGER,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "todo_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_activities" (
    "id" SERIAL NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "activityType" "ActivityType" NOT NULL,
    "description" TEXT,
    "related_id" INTEGER,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "universities_name_idx" ON "universities"("name");

-- CreateIndex
CREATE INDEX "specialties_name_idx" ON "specialties"("name");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_google_id_key" ON "users"("google_id");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_university_id_idx" ON "users"("university_id");

-- CreateIndex
CREATE INDEX "users_specialty_id_idx" ON "users"("specialty_id");

-- CreateIndex
CREATE INDEX "users_current_year_idx" ON "users"("current_year");

-- CreateIndex
CREATE INDEX "users_google_id_idx" ON "users"("google_id");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "refresh_tokens"("token");

-- CreateIndex
CREATE INDEX "refresh_tokens_token_idx" ON "refresh_tokens"("token");

-- CreateIndex
CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens"("expires_at");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "study_packs_type_idx" ON "study_packs"("type");

-- CreateIndex
CREATE INDEX "study_packs_year_number_idx" ON "study_packs"("year_number");

-- CreateIndex
CREATE INDEX "study_packs_is_active_idx" ON "study_packs"("is_active");

-- CreateIndex
CREATE INDEX "module_books_module_id_idx" ON "module_books"("module_id");

-- CreateIndex
CREATE INDEX "sub_modules_module_id_idx" ON "sub_modules"("module_id");

-- CreateIndex
CREATE INDEX "sub_module_books_sub_module_id_idx" ON "sub_module_books"("sub_module_id");

-- CreateIndex
CREATE INDEX "course_layers_course_id_student_id_idx" ON "course_layers"("course_id", "student_id");

-- CreateIndex
CREATE INDEX "course_layers_layer_number_idx" ON "course_layers"("layer_number");

-- CreateIndex
CREATE UNIQUE INDEX "course_layers_course_id_student_id_layer_number_key" ON "course_layers"("course_id", "student_id", "layer_number");

-- CreateIndex
CREATE INDEX "student_cards_user_id_idx" ON "student_cards"("user_id");

-- CreateIndex
CREATE INDEX "student_card_courses_card_id_idx" ON "student_card_courses"("card_id");

-- CreateIndex
CREATE INDEX "student_card_courses_course_id_idx" ON "student_card_courses"("course_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_card_courses_card_id_course_id_key" ON "student_card_courses"("card_id", "course_id");

-- CreateIndex
CREATE INDEX "course_resources_course_id_type_idx" ON "course_resources"("course_id", "type");

-- CreateIndex
CREATE INDEX "course_resources_is_paid_idx" ON "course_resources"("is_paid");

-- CreateIndex
CREATE INDEX "subscriptions_user_id_study_pack_id_idx" ON "subscriptions"("user_id", "study_pack_id");

-- CreateIndex
CREATE INDEX "subscriptions_status_idx" ON "subscriptions"("status");

-- CreateIndex
CREATE INDEX "subscriptions_start_date_end_date_idx" ON "subscriptions"("start_date", "end_date");

-- CreateIndex
CREATE INDEX "payment_events_type_idx" ON "payment_events"("type");

-- CreateIndex
CREATE INDEX "payment_events_checkoutId_idx" ON "payment_events"("checkoutId");

-- CreateIndex
CREATE INDEX "payment_events_processed_at_idx" ON "payment_events"("processed_at");

-- CreateIndex
CREATE UNIQUE INDEX "question_sources_name_key" ON "question_sources"("name");

-- CreateIndex
CREATE INDEX "question_sources_name_idx" ON "question_sources"("name");

-- CreateIndex
CREATE INDEX "quizzes_type_idx" ON "quizzes"("type");

-- CreateIndex
CREATE INDEX "quizzes_course_id_idx" ON "quizzes"("course_id");

-- CreateIndex
CREATE INDEX "quizzes_university_id_year_level_idx" ON "quizzes"("university_id", "year_level");

-- CreateIndex
CREATE INDEX "quizzes_quiz_year_idx" ON "quizzes"("quiz_year");

-- CreateIndex
CREATE INDEX "questions_course_id_idx" ON "questions"("course_id");

-- CreateIndex
CREATE INDEX "questions_exam_id_idx" ON "questions"("exam_id");

-- CreateIndex
CREATE INDEX "questions_source_id_idx" ON "questions"("source_id");

-- CreateIndex
CREATE INDEX "questions_university_id_year_level_idx" ON "questions"("university_id", "year_level");

-- CreateIndex
CREATE INDEX "questions_question_type_idx" ON "questions"("question_type");

-- CreateIndex
CREATE INDEX "questions_exam_year_idx" ON "questions"("exam_year");

-- CreateIndex
CREATE INDEX "questions_university_id_exam_year_idx" ON "questions"("university_id", "exam_year");

-- CreateIndex
CREATE INDEX "questions_repetition_count_idx" ON "questions"("repetition_count");

-- CreateIndex
CREATE INDEX "quiz_questions_quiz_id_idx" ON "quiz_questions"("quiz_id");

-- CreateIndex
CREATE INDEX "quiz_questions_question_id_idx" ON "quiz_questions"("question_id");

-- CreateIndex
CREATE UNIQUE INDEX "quiz_questions_quiz_id_question_id_key" ON "quiz_questions"("quiz_id", "question_id");

-- CreateIndex
CREATE INDEX "question_answers_question_id_idx" ON "question_answers"("question_id");

-- CreateIndex
CREATE INDEX "explanation_images_answer_id_idx" ON "explanation_images"("answer_id");

-- CreateIndex
CREATE INDEX "question_images_question_id_idx" ON "question_images"("question_id");

-- CreateIndex
CREATE INDEX "question_explanation_images_question_id_idx" ON "question_explanation_images"("question_id");

-- CreateIndex
CREATE INDEX "exams_university_id_year_level_idx" ON "exams"("university_id", "year_level");

-- CreateIndex
CREATE INDEX "exams_module_id_idx" ON "exams"("module_id");

-- CreateIndex
CREATE INDEX "exams_year_idx" ON "exams"("year");

-- CreateIndex
CREATE INDEX "exams_module_id_year_idx" ON "exams"("module_id", "year");

-- CreateIndex
CREATE INDEX "exam_quizzes_exam_id_idx" ON "exam_quizzes"("exam_id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_quizzes_exam_id_quiz_id_key" ON "exam_quizzes"("exam_id", "quiz_id");

-- CreateIndex
CREATE INDEX "exam_questions_exam_id_idx" ON "exam_questions"("exam_id");

-- CreateIndex
CREATE INDEX "exam_questions_exam_id_order_in_exam_idx" ON "exam_questions"("exam_id", "order_in_exam");

-- CreateIndex
CREATE UNIQUE INDEX "exam_questions_exam_id_question_id_key" ON "exam_questions"("exam_id", "question_id");

-- CreateIndex
CREATE INDEX "quiz_sessions_user_id_status_idx" ON "quiz_sessions"("user_id", "status");

-- CreateIndex
CREATE INDEX "quiz_sessions_type_idx" ON "quiz_sessions"("type");

-- CreateIndex
CREATE INDEX "quiz_sessions_quiz_id_idx" ON "quiz_sessions"("quiz_id");

-- CreateIndex
CREATE INDEX "quiz_sessions_exam_id_idx" ON "quiz_sessions"("exam_id");

-- CreateIndex
CREATE INDEX "quiz_sessions_original_session_id_idx" ON "quiz_sessions"("original_session_id");

-- CreateIndex
CREATE INDEX "quiz_sessions_is_retake_idx" ON "quiz_sessions"("is_retake");

-- CreateIndex
CREATE INDEX "quiz_session_questions_session_id_idx" ON "quiz_session_questions"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "quiz_session_questions_session_id_question_id_key" ON "quiz_session_questions"("session_id", "question_id");

-- CreateIndex
CREATE INDEX "quiz_attempts_session_id_idx" ON "quiz_attempts"("session_id");

-- CreateIndex
CREATE INDEX "quiz_attempts_question_id_idx" ON "quiz_attempts"("question_id");

-- CreateIndex
CREATE INDEX "quiz_attempts_isCorrect_idx" ON "quiz_attempts"("isCorrect");

-- CreateIndex
CREATE UNIQUE INDEX "quiz_attempts_session_id_question_id_key" ON "quiz_attempts"("session_id", "question_id");

-- CreateIndex
CREATE INDEX "multiple_choice_attempts_session_id_idx" ON "multiple_choice_attempts"("session_id");

-- CreateIndex
CREATE INDEX "multiple_choice_attempts_question_id_idx" ON "multiple_choice_attempts"("question_id");

-- CreateIndex
CREATE INDEX "multiple_choice_attempts_isCorrect_idx" ON "multiple_choice_attempts"("isCorrect");

-- CreateIndex
CREATE UNIQUE INDEX "multiple_choice_attempts_session_id_question_id_key" ON "multiple_choice_attempts"("session_id", "question_id");

-- CreateIndex
CREATE UNIQUE INDEX "activation_codes_code_key" ON "activation_codes"("code");

-- CreateIndex
CREATE INDEX "activation_codes_code_idx" ON "activation_codes"("code");

-- CreateIndex
CREATE INDEX "activation_codes_is_active_expires_at_idx" ON "activation_codes"("is_active", "expires_at");

-- CreateIndex
CREATE INDEX "activation_codes_created_by_id_idx" ON "activation_codes"("created_by_id");

-- CreateIndex
CREATE INDEX "activation_code_study_packs_activation_code_id_idx" ON "activation_code_study_packs"("activation_code_id");

-- CreateIndex
CREATE INDEX "activation_code_study_packs_study_pack_id_idx" ON "activation_code_study_packs"("study_pack_id");

-- CreateIndex
CREATE UNIQUE INDEX "activation_code_study_packs_activation_code_id_study_pack_i_key" ON "activation_code_study_packs"("activation_code_id", "study_pack_id");

-- CreateIndex
CREATE INDEX "code_redemptions_activation_code_id_idx" ON "code_redemptions"("activation_code_id");

-- CreateIndex
CREATE INDEX "code_redemptions_user_id_idx" ON "code_redemptions"("user_id");

-- CreateIndex
CREATE INDEX "code_redemptions_subscription_id_idx" ON "code_redemptions"("subscription_id");

-- CreateIndex
CREATE INDEX "course_progress_user_id_idx" ON "course_progress"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "course_progress_user_id_course_id_key" ON "course_progress"("user_id", "course_id");

-- CreateIndex
CREATE INDEX "student_labels_user_id_idx" ON "student_labels"("user_id");

-- CreateIndex
CREATE INDEX "quiz_labels_user_id_quiz_id_idx" ON "quiz_labels"("user_id", "quiz_id");

-- CreateIndex
CREATE INDEX "quiz_labels_label_id_idx" ON "quiz_labels"("label_id");

-- CreateIndex
CREATE UNIQUE INDEX "quiz_labels_user_id_quiz_id_label_id_key" ON "quiz_labels"("user_id", "quiz_id", "label_id");

-- CreateIndex
CREATE INDEX "question_labels_user_id_question_id_idx" ON "question_labels"("user_id", "question_id");

-- CreateIndex
CREATE INDEX "question_labels_label_id_idx" ON "question_labels"("label_id");

-- CreateIndex
CREATE UNIQUE INDEX "question_labels_user_id_question_id_label_id_key" ON "question_labels"("user_id", "question_id", "label_id");

-- CreateIndex
CREATE INDEX "quiz_session_labels_user_id_quiz_session_id_idx" ON "quiz_session_labels"("user_id", "quiz_session_id");

-- CreateIndex
CREATE INDEX "quiz_session_labels_label_id_idx" ON "quiz_session_labels"("label_id");

-- CreateIndex
CREATE UNIQUE INDEX "quiz_session_labels_user_id_quiz_session_id_label_id_key" ON "quiz_session_labels"("user_id", "quiz_session_id", "label_id");

-- CreateIndex
CREATE INDEX "student_notes_user_id_question_id_idx" ON "student_notes"("user_id", "question_id");

-- CreateIndex
CREATE INDEX "student_notes_user_id_quiz_id_idx" ON "student_notes"("user_id", "quiz_id");

-- CreateIndex
CREATE INDEX "note_labels_user_id_note_id_idx" ON "note_labels"("user_id", "note_id");

-- CreateIndex
CREATE INDEX "note_labels_label_id_idx" ON "note_labels"("label_id");

-- CreateIndex
CREATE UNIQUE INDEX "note_labels_user_id_note_id_label_id_key" ON "note_labels"("user_id", "note_id", "label_id");

-- CreateIndex
CREATE INDEX "question_reports_user_id_question_id_idx" ON "question_reports"("user_id", "question_id");

-- CreateIndex
CREATE INDEX "question_reports_status_idx" ON "question_reports"("status");

-- CreateIndex
CREATE INDEX "question_reports_reportType_idx" ON "question_reports"("reportType");

-- CreateIndex
CREATE INDEX "todo_items_user_id_status_idx" ON "todo_items"("user_id", "status");

-- CreateIndex
CREATE INDEX "todo_items_due_date_idx" ON "todo_items"("due_date");

-- CreateIndex
CREATE INDEX "todo_items_priority_idx" ON "todo_items"("priority");

-- CreateIndex
CREATE INDEX "employee_activities_employee_id_activityType_idx" ON "employee_activities"("employee_id", "activityType");

-- CreateIndex
CREATE INDEX "employee_activities_created_at_idx" ON "employee_activities"("created_at");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_university_id_fkey" FOREIGN KEY ("university_id") REFERENCES "universities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_specialty_id_fkey" FOREIGN KEY ("specialty_id") REFERENCES "specialties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unites" ADD CONSTRAINT "unites_study_pack_id_fkey" FOREIGN KEY ("study_pack_id") REFERENCES "study_packs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modules" ADD CONSTRAINT "modules_unite_id_fkey" FOREIGN KEY ("unite_id") REFERENCES "unites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "module_books" ADD CONSTRAINT "module_books_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_modules" ADD CONSTRAINT "sub_modules_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_module_books" ADD CONSTRAINT "sub_module_books_sub_module_id_fkey" FOREIGN KEY ("sub_module_id") REFERENCES "sub_modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_sub_module_id_fkey" FOREIGN KEY ("sub_module_id") REFERENCES "sub_modules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_layers" ADD CONSTRAINT "course_layers_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_layers" ADD CONSTRAINT "course_layers_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_cards" ADD CONSTRAINT "student_cards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_card_courses" ADD CONSTRAINT "student_card_courses_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "student_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_card_courses" ADD CONSTRAINT "student_card_courses_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_resources" ADD CONSTRAINT "course_resources_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_study_pack_id_fkey" FOREIGN KEY ("study_pack_id") REFERENCES "study_packs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_university_id_fkey" FOREIGN KEY ("university_id") REFERENCES "universities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "question_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_university_id_fkey" FOREIGN KEY ("university_id") REFERENCES "universities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_questions" ADD CONSTRAINT "quiz_questions_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_questions" ADD CONSTRAINT "quiz_questions_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_answers" ADD CONSTRAINT "question_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "explanation_images" ADD CONSTRAINT "explanation_images_answer_id_fkey" FOREIGN KEY ("answer_id") REFERENCES "question_answers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_images" ADD CONSTRAINT "question_images_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_explanation_images" ADD CONSTRAINT "question_explanation_images_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_university_id_fkey" FOREIGN KEY ("university_id") REFERENCES "universities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_quizzes" ADD CONSTRAINT "exam_quizzes_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_quizzes" ADD CONSTRAINT "exam_quizzes_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_questions" ADD CONSTRAINT "exam_questions_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_questions" ADD CONSTRAINT "exam_questions_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_sessions" ADD CONSTRAINT "quiz_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_sessions" ADD CONSTRAINT "quiz_sessions_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "quizzes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_sessions" ADD CONSTRAINT "quiz_sessions_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_sessions" ADD CONSTRAINT "quiz_sessions_original_session_id_fkey" FOREIGN KEY ("original_session_id") REFERENCES "quiz_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_session_questions" ADD CONSTRAINT "quiz_session_questions_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "quiz_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_session_questions" ADD CONSTRAINT "quiz_session_questions_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "quiz_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_selected_answer_id_fkey" FOREIGN KEY ("selected_answer_id") REFERENCES "question_answers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "multiple_choice_attempts" ADD CONSTRAINT "multiple_choice_attempts_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "quiz_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "multiple_choice_attempts" ADD CONSTRAINT "multiple_choice_attempts_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activation_codes" ADD CONSTRAINT "activation_codes_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activation_code_study_packs" ADD CONSTRAINT "activation_code_study_packs_activation_code_id_fkey" FOREIGN KEY ("activation_code_id") REFERENCES "activation_codes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activation_code_study_packs" ADD CONSTRAINT "activation_code_study_packs_study_pack_id_fkey" FOREIGN KEY ("study_pack_id") REFERENCES "study_packs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "code_redemptions" ADD CONSTRAINT "code_redemptions_activation_code_id_fkey" FOREIGN KEY ("activation_code_id") REFERENCES "activation_codes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "code_redemptions" ADD CONSTRAINT "code_redemptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "code_redemptions" ADD CONSTRAINT "code_redemptions_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_progress" ADD CONSTRAINT "course_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_progress" ADD CONSTRAINT "course_progress_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_labels" ADD CONSTRAINT "student_labels_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_labels" ADD CONSTRAINT "quiz_labels_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_labels" ADD CONSTRAINT "quiz_labels_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_labels" ADD CONSTRAINT "quiz_labels_label_id_fkey" FOREIGN KEY ("label_id") REFERENCES "student_labels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_labels" ADD CONSTRAINT "question_labels_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_labels" ADD CONSTRAINT "question_labels_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_labels" ADD CONSTRAINT "question_labels_label_id_fkey" FOREIGN KEY ("label_id") REFERENCES "student_labels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_session_labels" ADD CONSTRAINT "quiz_session_labels_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_session_labels" ADD CONSTRAINT "quiz_session_labels_quiz_session_id_fkey" FOREIGN KEY ("quiz_session_id") REFERENCES "quiz_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_session_labels" ADD CONSTRAINT "quiz_session_labels_label_id_fkey" FOREIGN KEY ("label_id") REFERENCES "student_labels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_notes" ADD CONSTRAINT "student_notes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_notes" ADD CONSTRAINT "student_notes_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_notes" ADD CONSTRAINT "student_notes_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note_labels" ADD CONSTRAINT "note_labels_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note_labels" ADD CONSTRAINT "note_labels_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "student_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note_labels" ADD CONSTRAINT "note_labels_label_id_fkey" FOREIGN KEY ("label_id") REFERENCES "student_labels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_reports" ADD CONSTRAINT "question_reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_reports" ADD CONSTRAINT "question_reports_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_reports" ADD CONSTRAINT "question_reports_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "todo_items" ADD CONSTRAINT "todo_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "todo_items" ADD CONSTRAINT "todo_items_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "todo_items" ADD CONSTRAINT "todo_items_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "quizzes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "todo_items" ADD CONSTRAINT "todo_items_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "todo_items" ADD CONSTRAINT "todo_items_quiz_session_id_fkey" FOREIGN KEY ("quiz_session_id") REFERENCES "quiz_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_activities" ADD CONSTRAINT "employee_activities_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

