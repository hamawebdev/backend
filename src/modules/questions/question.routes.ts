import { Router, Request, Response, NextFunction } from "express";
import { container } from "tsyringe";
import { z } from "zod";
import QuestionController from "./question.controller";
import authMiddleware from "../../core/middlewares/auth.middleware";
import { adminOrEmployee } from "../../core/middlewares/roleCheck.middleware";
import { validateRequest } from "../../middleware/validation.middleware";
import MediaHandler, { FileType } from "../../core/utils/media.utils";
import { QuestionType, YearLevel } from "@prisma/client";

const router = Router();
const questionController = container.resolve(QuestionController);
const mediaHandler = container.resolve<MediaHandler>("mediaHandler");

/**
 * PUT /:id/explanation accepts JSON ({ explanation, explanationImages: [{ imagePath }] })
 * or multipart (field `explanation` plus up to 10 `explanationImages` files). For
 * multipart, the stored files become the explanationImages list.
 */
const explanationUpload = mediaHandler.uploadMultipleFiles(FileType.EXPLANATION, 'explanationImages', 10);
const explanationFilesToBody = (req: Request, _res: Response, next: NextFunction) => {
  const files = req.files as Express.Multer.File[] | undefined;
  if (Array.isArray(files) && files.length > 0) {
    req.body.explanationImages = files.map(file => ({
      imagePath: mediaHandler.getFileUrl(file.filename, FileType.EXPLANATION)
    }));
  } else if (req.is('multipart/form-data') && req.body && typeof req.body.explanationImages === 'string') {
    // A multipart request with no files but a stray text field: ignore it
    delete req.body.explanationImages;
  }
  next();
};

// Validation schemas
const imageSchema = z.object({
  imagePath: z.string().min(1, "Image path is required"),
  altText: z.string().optional(),
});

const createQuestionSchema = z.object({
  questionText: z.string().min(2, "Question text must be at least 3 characters"),
  explanation: z.string().optional(),
  questionType: z.nativeEnum(QuestionType).optional(),
  courseId: z.number().int().positive().optional(),
  examId: z.number().int().positive().optional(),
  sourceId: z.number().int().positive().optional(),
  universityId: z.number().int().positive().optional(),
  yearLevel: z.nativeEnum(YearLevel).optional(),
  examYear: z.number().int().min(2000).max(2100).optional(),
  metadata: z.string().max(5000, "Metadata cannot exceed 5000 characters").optional(),
  questionImages: z.array(imageSchema).max(10).optional(),
  explanationImages: z.array(imageSchema).max(10).optional(),
  answers: z.array(z.object({
    answerText: z.string().min(1, "Answer text is required"),
    isCorrect: z.boolean(),
    explanation: z.string().optional(),
    images: z.array(z.object({
      imagePath: z.string(),
      altText: z.string().optional(),
    })).optional(),
  })).min(2, "At least 2 answers are required"),
}).refine((data) => {
  const correctAnswersCount = data.answers.filter(a => a.isCorrect).length;

  // QROC questions don't need multiple answers
  if (data.questionType === QuestionType.QROC) {
    return true;
  }

  if (data.questionType === QuestionType.SINGLE_CHOICE) {
    return correctAnswersCount === 1;
  }

  if (data.questionType === QuestionType.MULTIPLE_CHOICE) {
    return correctAnswersCount >= 2;
  }

  // Default to single choice validation
  return correctAnswersCount === 1;
}, {
  message: "Invalid number of correct answers for the question type",
});

const updateQuestionSchema = z.object({
  questionText: z.string().min(2).optional(),
  explanation: z.string().optional(),
  questionType: z.nativeEnum(QuestionType).optional(),
  courseId: z.number().int().positive().optional(),
  examId: z.number().int().positive().optional(),
  sourceId: z.number().int().positive().optional(),
  universityId: z.number().int().positive().optional(),
  yearLevel: z.nativeEnum(YearLevel).optional(),
  metadata: z.string().max(5000, "Metadata cannot exceed 5000 characters").optional(),
  answers: z.array(z.object({
    id: z.number().int().positive().optional(),
    answerText: z.string().min(1).optional(),
    isCorrect: z.boolean().optional(),
    explanation: z.string().optional()
  })).optional()
});

const updateQuestionExplanationSchema = z.object({
  explanation: z.string().min(1, "Explanation is required").max(5000, "Explanation must be 5000 characters or less"),
  explanationImages: z.array(z.object({
    imagePath: z.string()
      .min(1, "Image path is required")
      .max(255, "Image path must be 255 characters or less")
      .refine(
        (path) => {
          const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.webp', '.svg'];
          const extension = path.toLowerCase().substring(path.lastIndexOf('.'));
          return allowedExtensions.includes(extension);
        },
        {
          message: "Invalid image format. Allowed formats: .jpg, .jpeg, .png, .gif, .bmp, .tiff, .webp, .svg"
        }
      ),
    altText: z.string()
      .max(255, "Alt text must be 255 characters or less")
      .optional(),
  }))
    .max(10, "Maximum 10 explanation images allowed")
    .optional(),
});

const updateQuestionImageSchema = z.object({
  imagePath: z.string().min(1, "Image path is required"),
  altText: z.string().optional(),
});

const addQuestionExplanationImagesSchema = z.object({
  images: z.array(z.object({
    imagePath: z.string().min(1, "Image path is required"),
    altText: z.string().optional(),
  })).min(1, "At least one image is required"),
});

const updateQuestionExplanationImageSchema = z.object({
  imagePath: z.string().min(1, "Image path is required"),
  altText: z.string().optional(),
});

const bulkCreateQuestionsSchema = z.object({
  metadata: z.object({
    courseId: z.number().int().positive().optional(),
    examId: z.number().int().positive().optional(),
    sourceId: z.number().int().positive().optional(),
    universityId: z.number().int().positive().optional(),
    yearLevel: z.nativeEnum(YearLevel).optional(),
    examYear: z.number().int().min(2000).max(2100).optional(),
  }),
  questions: z.array(z.object({
    questionText: z.string().min(2, "Question text must be at least 3 characters"),
    explanation: z.string().optional(),
    questionType: z.nativeEnum(QuestionType).optional(),
    questionTags: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
    questionImages: z.array(imageSchema).max(10).optional(),
    explanationImages: z.array(imageSchema).max(10).optional(),
    repetitionCount: z.number().int().min(0).optional(),
    repetitionYears: z.array(z.number().int().refine(val => val === 0 || (val >= 1950 && val <= 2100), { message: "Year must be 0 or between 2000 and 2100" })).optional(),
    answers: z.array(z.object({
      answerText: z.string().min(1, "Answer text is required"),
      isCorrect: z.boolean(),
      explanation: z.string().optional(),
      images: z.array(z.object({
        imagePath: z.string(),
        altText: z.string().optional(),
      })).optional(),
    })).min(0), // Allow 0 answers for QROC questions
  })).min(1, "At least one question is required"),
}).refine((data) => {
  // Validate each question's answers
  for (const question of data.questions) {
    const correctAnswersCount = question.answers.filter(a => a.isCorrect).length;

    // QROC questions don't need answer validation
    if (question.questionType === QuestionType.QROC) {
      continue;
    }

    if (question.questionType === QuestionType.SINGLE_CHOICE && correctAnswersCount !== 1) {
      return false;
    }

    if (question.questionType === QuestionType.MULTIPLE_CHOICE && correctAnswersCount < 2) {
      return false;
    }

    // Default to single choice validation (requires answers)
    if (!question.questionType && (question.answers.length < 2 || correctAnswersCount !== 1)) {
      return false;
    }
  }

  return true;
}, {
  message: "One or more questions have invalid number of correct answers for their type",
});

// Apply global middleware
router.use(authMiddleware);
router.use(adminOrEmployee);

// Question management routes
router.post("/",
  validateRequest(createQuestionSchema),
  (req, res, next) => questionController.createQuestion(req, res, next)
);

router.post("/bulk",
  validateRequest(bulkCreateQuestionsSchema),
  (req, res, next) => questionController.createQuestionsInBulk(req, res, next)
);

// NEW: Update a question
router.put("/:id",
  validateRequest(updateQuestionSchema),
  (req, res, next) => questionController.updateQuestion(req as any, res, next)
);

router.put("/:id/explanation",
  explanationUpload,
  explanationFilesToBody,
  validateRequest(updateQuestionExplanationSchema),
  (req, res, next) => questionController.updateQuestionExplanation(req, res, next)
);

router.get("/filters",
  (req, res, next) => questionController.getQuestionFilters(req, res, next)
);

// Get single question
router.get("/:id",
  (req, res, next) => questionController.getQuestionById(req as any, res, next)
);

// Attach images to a question
router.post("/:id/images",
  (req, res, next) => questionController.addQuestionImages(req as any, res, next)
);

// Update a specific image from a question
router.put("/:id/images/:imageId",
  validateRequest(updateQuestionImageSchema),
  (req, res, next) => questionController.updateQuestionImage(req as any, res, next)
);

// Delete a specific image from a question
router.delete("/:id/images/:imageId",
  (req, res, next) => questionController.deleteQuestionImage(req as any, res, next)
);

// NEW: Delete a question
router.delete("/:id",
  (req, res, next) => questionController.deleteQuestion(req as any, res, next)
);

// Explanation Images Management Routes

// Attach explanation images to a question
router.post("/:id/explanation-images",
  validateRequest(addQuestionExplanationImagesSchema),
  (req, res, next) => questionController.addQuestionExplanationImages(req as any, res, next)
);

// Update a specific explanation image from a question
router.put("/:id/explanation-images/:imageId",
  validateRequest(updateQuestionExplanationImageSchema),
  (req, res, next) => questionController.updateQuestionExplanationImage(req as any, res, next)
);

// Delete a specific explanation image from a question
router.delete("/:id/explanation-images/:imageId",
  (req, res, next) => questionController.deleteQuestionExplanationImage(req as any, res, next)
);

export default router;
