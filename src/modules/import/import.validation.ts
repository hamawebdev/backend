import { z, ZodError } from "zod";
import { PackType, QuestionType, YearLevel } from "@prisma/client";
import { isHttpUrlOrPath } from "../../middleware/validation.middleware";
import { BadRequestError } from "../../core/errors/AppError";

// Limits of the import API (see the routes for the endpoints)
export const MAX_MEDIA_BYTES = 20 * 1024 * 1024;
export const MEDIA_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "avif", "svg"] as const;
export const MAX_MEDIA_CHECK_FILES = 10000;
export const MAX_IMPORT_QUESTIONS = 200;
export const MAX_STATE_KEYS = 5000;
export const MAX_IMPORT_EXAMS = 50;
export const MAX_METADATA_LENGTH = 50000;

/** A content-addressed image file name: <sha1>.<ext> */
export const MEDIA_FILE_NAME = new RegExp(`^[0-9a-f]{40}\\.(${MEDIA_EXTENSIONS.join("|")})$`, "i");

// Text is stored as imported (HTML, Markdown+HTML or plain text); the web sanitizes on render
const TEXT_MAX = 100000;
const ANSWER_TEXT_MAX = 20000;

const sourceKey = z.string().trim().min(1, "sourceKey is required").max(500, "sourceKey is too long");
const name = z.string().trim().min(1, "name is required").max(500, "name is too long");
const longText = z.string().max(TEXT_MAX, `Text cannot exceed ${TEXT_MAX} characters`);
const imageUrl = z.string().trim().min(1).max(2048)
  .refine(isHttpUrlOrPath, "Image must be an http(s) URL or a /path such as /api/v1/media/images/<sha1>.<ext>");

// ------------------------------------------------------------------ media

export const mediaCheckSchema = z.object({
  files: z.array(z.string().max(255)).max(MAX_MEDIA_CHECK_FILES, `At most ${MAX_MEDIA_CHECK_FILES} files per check`)
});

// -------------------------------------------------------------- hierarchy

export const hierarchySchema = z.object({
  universities: z.array(z.object({
    sourceKey,
    name,
    country: z.string().trim().min(1).max(100).optional()
  })).max(1000).optional(),
  sources: z.array(z.object({
    sourceKey,
    name: name.max(100, "Question source names are at most 100 characters")
  })).max(2000).optional(),
  studyPacks: z.array(z.object({
    sourceKey,
    name,
    type: z.nativeEnum(PackType),
    yearNumber: z.nativeEnum(YearLevel).nullish(),
    description: z.string().max(5000).nullish(),
    pricePerMonth: z.number().min(0),
    pricePerYear: z.number().min(0).nullish(),
    isActive: z.boolean().optional()
  })).max(200).optional(),
  unites: z.array(z.object({ sourceKey, studyPackKey: sourceKey, name })).max(5000).optional(),
  modules: z.array(z.object({ sourceKey, uniteKey: sourceKey, name })).max(20000).optional(),
  courses: z.array(z.object({ sourceKey, moduleKey: sourceKey, name })).max(20000).optional(),
  // Existing records are left untouched unless this is true
  updateExisting: z.boolean().optional()
});

// Explicit shapes of the validated input (zod's inferred types need strict mode,
// which the test compiler does not use)
export interface HierarchyInput {
  universities?: Array<{ sourceKey: string; name: string; country?: string }>;
  sources?: Array<{ sourceKey: string; name: string }>;
  studyPacks?: Array<{
    sourceKey: string;
    name: string;
    type: PackType;
    yearNumber?: YearLevel | null;
    description?: string | null;
    pricePerMonth: number;
    pricePerYear?: number | null;
    isActive?: boolean;
  }>;
  unites?: Array<{ sourceKey: string; studyPackKey: string; name: string }>;
  modules?: Array<{ sourceKey: string; uniteKey: string; name: string }>;
  courses?: Array<{ sourceKey: string; moduleKey: string; name: string }>;
  updateExisting?: boolean;
}

// -------------------------------------------------------------- questions

const importAnswerSchema = z.object({
  position: z.number().int().min(0).max(10000),
  answerText: z.string().max(ANSWER_TEXT_MAX),
  answerTextEn: z.string().max(ANSWER_TEXT_MAX).nullish(),
  isCorrect: z.boolean(),
  explanation: longText.nullish(),
  explanationEn: longText.nullish()
});

export const importQuestionSchema = z.object({
  sourceKey,
  contentHash: z.string().trim().min(1, "contentHash is required").max(128),
  courseKey: sourceKey.nullish(),
  universityKey: sourceKey.nullish(),
  questionSourceKey: sourceKey.nullish(),
  examYear: z.number().int().min(1900).max(2100).nullish(),
  yearLevel: z.nativeEnum(YearLevel).nullish(),
  questionType: z.nativeEnum(QuestionType),
  isPublished: z.boolean(),
  questionText: longText,
  questionTextEn: longText.nullish(),
  explanation: longText.nullish(),
  explanationEn: longText.nullish(),
  metadata: z.record(z.unknown()).nullish(),
  tags: z.array(z.string().max(200)).max(100).nullish(),
  repetitionCount: z.number().int().min(0).max(100000).nullish(),
  repetitionYears: z.array(z.number().int().min(0).max(2100)).max(200).nullish(),
  questionImages: z.array(imageUrl).max(50).nullish(),
  explanationImages: z.array(imageUrl).max(50).nullish(),
  answers: z.array(importAnswerSchema).max(100)
}).superRefine((question, ctx) => {
  const positions = new Set<number>();
  question.answers.forEach((answer, index) => {
    if (positions.has(answer.position)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["answers", index, "position"],
        message: `Answer position ${answer.position} is used more than once`
      });
    }
    positions.add(answer.position);
  });
});

export interface ImportAnswer {
  position: number;
  answerText: string;
  answerTextEn?: string | null;
  isCorrect: boolean;
  explanation?: string | null;
  explanationEn?: string | null;
}

export interface ImportQuestion {
  sourceKey: string;
  contentHash: string;
  courseKey?: string | null;
  universityKey?: string | null;
  questionSourceKey?: string | null;
  examYear?: number | null;
  yearLevel?: YearLevel | null;
  questionType: QuestionType;
  isPublished: boolean;
  questionText: string;
  questionTextEn?: string | null;
  explanation?: string | null;
  explanationEn?: string | null;
  metadata?: Record<string, unknown> | null;
  tags?: string[] | null;
  repetitionCount?: number | null;
  repetitionYears?: number[] | null;
  questionImages?: string[] | null;
  explanationImages?: string[] | null;
  answers: ImportAnswer[];
}

// Questions are validated one by one, so one bad question fails alone
export const importQuestionsSchema = z.object({
  questions: z.array(z.unknown())
    .min(1, "questions must not be empty")
    .max(MAX_IMPORT_QUESTIONS, `At most ${MAX_IMPORT_QUESTIONS} questions per request`)
});

export const questionStateSchema = z.object({
  sourceKeys: z.array(sourceKey).max(MAX_STATE_KEYS, `At most ${MAX_STATE_KEYS} sourceKeys per request`)
});

// ------------------------------------------------------------------ exams

export const importExamSchema = z.object({
  sourceKey,
  title: z.string().trim().min(1).max(500),
  moduleKey: sourceKey,
  universityKey: sourceKey,
  yearLevel: z.nativeEnum(YearLevel),
  year: z.number().int().min(1900).max(2100),
  // Defaults to January 1st of year
  examYearDate: z.string().trim().refine(value => !Number.isNaN(Date.parse(value)), "examYearDate must be a date").nullish(),
  description: z.string().max(5000).nullish(),
  // Question sourceKeys in paper order
  questionKeys: z.array(sourceKey).max(2000)
});

export interface ImportExam {
  sourceKey: string;
  title: string;
  moduleKey: string;
  universityKey: string;
  yearLevel: YearLevel;
  year: number;
  examYearDate?: string | null;
  description?: string | null;
  questionKeys: string[];
}

export const importExamsSchema = z.object({
  exams: z.array(z.unknown())
    .min(1, "exams must not be empty")
    .max(MAX_IMPORT_EXAMS, `At most ${MAX_IMPORT_EXAMS} exams per request`)
});

// ---------------------------------------------------------------- helpers

/** One line describing every issue of a failed validation */
export function describeZodError(error: ZodError): string {
  return error.issues
    .map(issue => `${issue.path.join(".") || "body"}: ${issue.message}`)
    .join("; ");
}

/** Parse a request body, or throw 400 with the issues */
export function parseBody<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new BadRequestError(`Request validation failed: ${describeZodError(result.error)}`, {
      errors: result.error.issues.map(issue => ({ field: issue.path.join(".") || "body", message: issue.message }))
    });
  }
  return result.data;
}
