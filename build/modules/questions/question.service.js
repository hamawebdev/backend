"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const tsyringe_1 = require("tsyringe");
const db_1 = __importDefault(require("../../config/db"));
const AppError_1 = require("../../core/errors/AppError");
let QuestionService = class QuestionService {
    constructor(prismaService) {
        this.prismaService = prismaService;
    }
    get prisma() {
        return this.prismaService.getClient();
    }
    /**
     * Create a single question with unified metadata
     */
    createQuestion(questionData, createdById) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e, _f;
            // Validate question type vs correct answers
            const correctAnswersCount = questionData.answers.filter(a => a.isCorrect).length;
            if (questionData.questionType === client_1.QuestionType.SINGLE_CHOICE && correctAnswersCount !== 1) {
                throw new AppError_1.BadRequestError("Single choice questions must have exactly one correct answer");
            }
            if (questionData.questionType === client_1.QuestionType.MULTIPLE_CHOICE && correctAnswersCount < 2) {
                throw new AppError_1.BadRequestError("Multiple choice questions must have at least two correct answers");
            }
            // Validate references
            yield this.validateReferences(questionData);
            const question = yield this.prisma.question.create({
                data: {
                    questionText: questionData.questionText,
                    explanation: questionData.explanation,
                    questionType: questionData.questionType || client_1.QuestionType.SINGLE_CHOICE,
                    courseId: questionData.courseId,
                    examId: questionData.examId,
                    sourceId: questionData.sourceId,
                    universityId: questionData.universityId,
                    yearLevel: questionData.yearLevel,
                    examYear: questionData.examYear,
                    metadata: questionData.metadata,
                    createdById,
                    questionImages: questionData.questionImages ? {
                        create: questionData.questionImages.map(img => ({
                            imagePath: img.imagePath,
                            altText: img.altText
                        }))
                    } : undefined,
                    questionExplanationImages: questionData.explanationImages ? {
                        create: questionData.explanationImages.map(img => ({
                            imagePath: img.imagePath,
                            altText: img.altText
                        }))
                    } : undefined,
                    questionAnswers: {
                        create: questionData.answers.map(answer => ({
                            answerText: answer.answerText,
                            isCorrect: answer.isCorrect,
                            explanation: answer.explanation,
                            explanationImages: answer.images ? {
                                create: answer.images.map(img => ({
                                    imagePath: img.imagePath,
                                    altText: img.altText
                                }))
                            } : undefined
                        }))
                    }
                },
                include: {
                    questionImages: true,
                    questionExplanationImages: true,
                    questionAnswers: {
                        include: {
                            explanationImages: true
                        }
                    }
                }
            });
            // Return canonical response format
            return {
                success: true,
                data: {
                    id: question.id,
                    questionText: question.questionText,
                    questionType: question.questionType,
                    courseId: (_a = question.courseId) !== null && _a !== void 0 ? _a : undefined,
                    answers: question.questionAnswers.map(a => ({
                        id: a.id,
                        answerText: a.answerText,
                        isCorrect: a.isCorrect
                    })),
                    explanation: (_b = question.explanation) !== null && _b !== void 0 ? _b : undefined,
                    universityId: (_c = question.universityId) !== null && _c !== void 0 ? _c : undefined,
                    yearLevel: (_d = question.yearLevel) !== null && _d !== void 0 ? _d : undefined,
                    examYear: (_e = question.examYear) !== null && _e !== void 0 ? _e : undefined,
                    sourceId: (_f = question.sourceId) !== null && _f !== void 0 ? _f : undefined,
                    createdAt: question.createdAt
                },
                message: "Question created successfully"
            };
        });
    }
    /**
     * Create multiple questions with shared metadata
     * Returns canonical format: {created, failed, errors[]}
     */
    createQuestionsInBulk(bulkData, createdById) {
        return __awaiter(this, void 0, void 0, function* () {
            const { metadata, questions } = bulkData;
            // Validate shared metadata references
            yield this.validateReferences(metadata);
            let created = 0;
            let failed = 0;
            const errors = [];
            // Process each question individually to track errors
            for (let index = 0; index < questions.length; index++) {
                const questionData = questions[index];
                try {
                    // Validate question type vs correct answers
                    const correctAnswersCount = questionData.answers.filter(a => a.isCorrect).length;
                    if (questionData.questionType === client_1.QuestionType.SINGLE_CHOICE && correctAnswersCount !== 1) {
                        throw new Error("Single choice questions must have exactly one correct answer");
                    }
                    if (questionData.questionType === client_1.QuestionType.MULTIPLE_CHOICE && correctAnswersCount < 2) {
                        throw new Error("Multiple choice questions must have at least two correct answers");
                    }
                    // Create the question
                    yield this.prisma.question.create({
                        data: {
                            questionText: questionData.questionText,
                            explanation: questionData.explanation,
                            questionType: questionData.questionType || client_1.QuestionType.SINGLE_CHOICE,
                            courseId: metadata.courseId,
                            examId: metadata.examId,
                            sourceId: metadata.sourceId,
                            universityId: metadata.universityId,
                            yearLevel: metadata.yearLevel,
                            examYear: metadata.examYear,
                            metadata: metadata.metadata,
                            createdById,
                            questionImages: questionData.questionImages ? {
                                create: questionData.questionImages.map(img => ({
                                    imagePath: img.imagePath,
                                    altText: img.altText
                                }))
                            } : undefined,
                            questionExplanationImages: questionData.explanationImages ? {
                                create: questionData.explanationImages.map(img => ({
                                    imagePath: img.imagePath,
                                    altText: img.altText
                                }))
                            } : undefined,
                            questionAnswers: {
                                create: questionData.answers.map(answer => ({
                                    answerText: answer.answerText,
                                    isCorrect: answer.isCorrect,
                                    explanation: answer.explanation,
                                    explanationImages: answer.images ? {
                                        create: answer.images.map(img => ({
                                            imagePath: img.imagePath,
                                            altText: img.altText
                                        }))
                                    } : undefined
                                }))
                            }
                        }
                    });
                    created++;
                }
                catch (error) {
                    failed++;
                    errors.push({
                        index,
                        error: error.message || "Failed to create question"
                    });
                }
            }
            return {
                success: true,
                data: {
                    created,
                    failed,
                    errors
                },
                message: `Created ${created} questions, ${failed} failed`
            };
        });
    }
    /**
     * Update question explanation with comprehensive image management
     */
    updateQuestionExplanation(questionId, explanationData, updatedById) {
        return __awaiter(this, void 0, void 0, function* () {
            // Check if question exists and get current explanation images
            const existingQuestion = yield this.prisma.question.findUnique({
                where: { id: questionId },
                include: {
                    questionExplanationImages: true,
                    questionAnswers: {
                        include: {
                            explanationImages: true
                        }
                    }
                }
            });
            if (!existingQuestion) {
                throw new AppError_1.NotFoundError(`Question with ID ${questionId} not found`);
            }
            // Validate explanation images if provided
            if (explanationData.explanationImages && explanationData.explanationImages.length > 0) {
                this.validateExplanationImages(explanationData.explanationImages);
            }
            // Update question explanation and handle images in transaction
            const result = yield this.prisma.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
                // Update the question explanation
                const question = yield tx.question.update({
                    where: { id: questionId },
                    data: {
                        explanation: explanationData.explanation,
                        updatedAt: new Date()
                    }
                });
                let finalImageCount = existingQuestion.questionExplanationImages.length;
                let addedImages = 0;
                let replacedImages = false;
                // Handle explanation images if provided
                if (explanationData.explanationImages && explanationData.explanationImages.length > 0) {
                    // Check if we're replacing all images or adding to existing ones
                    const totalImagesAfterUpdate = existingQuestion.questionExplanationImages.length + explanationData.explanationImages.length;
                    if (totalImagesAfterUpdate > 10) {
                        // If adding would exceed limit, replace existing images
                        yield tx.questionExplanationImage.deleteMany({
                            where: { questionId: questionId }
                        });
                        replacedImages = true;
                        finalImageCount = 0;
                    }
                    // Add new explanation images
                    const sanitizedImages = explanationData.explanationImages.map(img => {
                        var _a;
                        return ({
                            questionId: questionId,
                            imagePath: img.imagePath.split('/').pop() || img.imagePath, // Security: strip directories
                            altText: ((_a = img.altText) === null || _a === void 0 ? void 0 : _a.trim()) || null
                        });
                    });
                    yield tx.questionExplanationImage.createMany({
                        data: sanitizedImages
                    });
                    addedImages = sanitizedImages.length;
                    finalImageCount = replacedImages ? addedImages : finalImageCount + addedImages;
                }
                // Get updated question with all explanation images
                const updatedQuestionWithImages = yield tx.question.findUnique({
                    where: { id: questionId },
                    include: {
                        questionExplanationImages: {
                            orderBy: { createdAt: 'desc' }
                        }
                    }
                });
                return {
                    question: updatedQuestionWithImages,
                    addedImages,
                    replacedImages,
                    finalImageCount
                };
            }));
            // Return canonical response format
            return {
                success: true,
                data: {
                    id: result.question.id,
                    explanation: result.question.explanation || '',
                    explanationImages: result.question.questionExplanationImages.map(img => ({
                        id: img.id,
                        imagePath: img.imagePath,
                        altText: img.altText || null
                    }))
                },
                message: result.replacedImages
                    ? `Question explanation updated successfully. Replaced all images with ${result.addedImages} new image(s).`
                    : `Question explanation updated successfully. Added ${result.addedImages} new image(s).`
            };
        });
    }
    /**
     * Update a question and its answers (basic fields)
     */
    updateQuestion(questionId, update, updatedById) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d;
            const existing = yield this.prisma.question.findUnique({
                where: { id: questionId },
                include: { questionAnswers: true }
            });
            if (!existing) {
                throw new AppError_1.NotFoundError(`Question with ID ${questionId} not found`);
            }
            // Validate references if provided
            yield this.validateReferences(update);
            // If answers provided, we will upsert minimal fields
            const answersUpdate = Array.isArray(update.answers) ? update.answers : [];
            const result = yield this.prisma.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
                // Build update data object
                const updateData = {
                    updatedAt: new Date()
                };
                if (update.questionText !== undefined)
                    updateData.questionText = update.questionText;
                if (update.explanation !== undefined)
                    updateData.explanation = update.explanation;
                if (update.questionType !== undefined)
                    updateData.questionType = update.questionType;
                if (update.courseId !== undefined)
                    updateData.courseId = update.courseId;
                if (update.examId !== undefined)
                    updateData.examId = update.examId;
                if (update.sourceId !== undefined)
                    updateData.sourceId = update.sourceId;
                if (update.universityId !== undefined)
                    updateData.universityId = update.universityId;
                if (update.yearLevel !== undefined)
                    updateData.yearLevel = update.yearLevel;
                if (update.metadata !== undefined)
                    updateData.metadata = update.metadata;
                const updatedQuestion = yield tx.question.update({
                    where: { id: questionId },
                    data: updateData
                });
                // Upsert answers if provided
                for (const ans of answersUpdate) {
                    if (ans.id) {
                        yield tx.questionAnswer.update({
                            where: { id: ans.id },
                            data: {
                                answerText: ans.answerText,
                                isCorrect: ans.isCorrect,
                                explanation: ans.explanation
                            }
                        });
                    }
                    else {
                        yield tx.questionAnswer.create({
                            data: {
                                questionId: questionId,
                                answerText: ans.answerText || '',
                                isCorrect: ans.isCorrect || false,
                                explanation: ans.explanation || null
                            }
                        });
                    }
                }
                return updatedQuestion;
            }));
            return {
                success: true,
                data: {
                    question: {
                        id: result.id,
                        questionText: result.questionText,
                        questionType: result.questionType,
                        courseId: (_a = result.courseId) !== null && _a !== void 0 ? _a : undefined,
                        universityId: (_b = result.universityId) !== null && _b !== void 0 ? _b : undefined,
                        yearLevel: (_c = result.yearLevel) !== null && _c !== void 0 ? _c : undefined,
                        examYear: (_d = result.examYear) !== null && _d !== void 0 ? _d : undefined
                    }
                },
                message: 'Question updated successfully'
            };
        });
    }
    /**
     * Delete a question
     * Returns canonical format: { message: "..." }
     */
    deleteQuestion(questionId, deletedById) {
        return __awaiter(this, void 0, void 0, function* () {
            const existing = yield this.prisma.question.findUnique({ where: { id: questionId } });
            if (!existing) {
                throw new AppError_1.NotFoundError(`Question with ID ${questionId} not found`);
            }
            yield this.prisma.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
                yield tx.explanationImage.deleteMany({
                    where: { answer: { questionId } }
                });
                yield tx.questionAnswer.deleteMany({ where: { questionId } });
                yield tx.questionImage.deleteMany({ where: { questionId } });
                yield tx.quizQuestion.deleteMany({ where: { questionId } });
                yield tx.examQuestion.deleteMany({ where: { questionId } });
                yield tx.question.delete({ where: { id: questionId } });
            }));
            return { message: "Question deleted successfully" };
        });
    }
    /**
     * Get question by ID with images and answer explanation images
     */
    getQuestionById(id) {
        return __awaiter(this, void 0, void 0, function* () {
            const question = yield this.prisma.question.findUnique({
                where: { id },
                include: {
                    questionImages: true,
                    questionExplanationImages: true,
                    questionAnswers: {
                        include: { explanationImages: true }
                    },
                    university: {
                        select: {
                            id: true,
                            name: true,
                            country: true
                        }
                    },
                    course: {
                        include: {
                            module: {
                                select: {
                                    id: true,
                                    name: true
                                }
                            }
                        }
                    },
                    source: {
                        select: {
                            id: true,
                            name: true
                        }
                    }
                }
            });
            if (!question)
                throw new AppError_1.NotFoundError(`Question with ID ${id} not found`);
            return question;
        });
    }
    /**
     * Add images to an existing question
     */
    addQuestionImages(questionId, images, userId) {
        return __awaiter(this, void 0, void 0, function* () {
            // Ensure question exists
            const exists = yield this.prisma.question.findUnique({ where: { id: questionId }, select: { id: true } });
            if (!exists)
                throw new AppError_1.NotFoundError(`Question with ID ${questionId} not found`);
            if (!Array.isArray(images) || images.length === 0) {
                throw new AppError_1.BadRequestError("No images provided");
            }
            // Basic filename safety: strip directories
            const sanitized = images.map(img => ({
                imagePath: img.imagePath.split('/').pop() || img.imagePath,
                altText: img.altText
            }));
            yield this.prisma.questionImage.createMany({
                data: sanitized.map(s => ({ questionId, imagePath: s.imagePath, altText: s.altText }))
            });
            const updated = yield this.getQuestionById(questionId);
            return { questionId, imageCount: updated.questionImages.length };
        });
    }
    /**
     * Update a specific image from a question
     */
    updateQuestionImage(questionId, imageId, updateData, userId) {
        return __awaiter(this, void 0, void 0, function* () {
            // Verify the question exists
            const question = yield this.prisma.question.findUnique({ where: { id: questionId } });
            if (!question) {
                throw new AppError_1.NotFoundError(`Question with ID ${questionId} not found`);
            }
            // Verify the image exists and belongs to this question
            const existingImage = yield this.prisma.questionImage.findUnique({ where: { id: imageId } });
            if (!existingImage || existingImage.questionId !== questionId) {
                throw new AppError_1.NotFoundError("Image not found for this question");
            }
            // Basic filename safety: strip directories
            const sanitizedImagePath = updateData.imagePath.split('/').pop() || updateData.imagePath;
            // Update the image
            const updatedImage = yield this.prisma.questionImage.update({
                where: { id: imageId },
                data: {
                    imagePath: sanitizedImagePath,
                    altText: updateData.altText
                }
            });
            return {
                questionId,
                imageId,
                imagePath: updatedImage.imagePath,
                altText: updatedImage.altText
            };
        });
    }
    /**
     * Delete a specific image from a question
     */
    deleteQuestionImage(questionId, imageId, userId) {
        return __awaiter(this, void 0, void 0, function* () {
            const img = yield this.prisma.questionImage.findUnique({ where: { id: imageId } });
            if (!img || img.questionId !== questionId) {
                throw new AppError_1.NotFoundError("Image not found for this question");
            }
            yield this.prisma.questionImage.delete({ where: { id: imageId } });
            return { questionId, imageId };
        });
    }
    /**
     * Validate explanation image data
     */
    validateExplanationImages(images) {
        if (!Array.isArray(images) || images.length === 0) {
            throw new AppError_1.BadRequestError("No explanation images provided");
        }
        if (images.length > 10) {
            throw new AppError_1.BadRequestError("Maximum 10 explanation images allowed per question");
        }
        for (const img of images) {
            if (!img.imagePath || typeof img.imagePath !== 'string') {
                throw new AppError_1.BadRequestError("Invalid image path provided");
            }
            // Basic file extension validation
            const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.webp', '.svg'];
            const extension = img.imagePath.toLowerCase().substring(img.imagePath.lastIndexOf('.'));
            if (!allowedExtensions.includes(extension)) {
                throw new AppError_1.BadRequestError(`Invalid image format: ${extension}. Allowed formats: ${allowedExtensions.join(', ')}`);
            }
            // Validate alt text if provided
            if (img.altText && typeof img.altText !== 'string') {
                throw new AppError_1.BadRequestError("Invalid alt text provided");
            }
            if (img.altText && img.altText.length > 255) {
                throw new AppError_1.BadRequestError("Alt text must be 255 characters or less");
            }
        }
    }
    /**
     * Add explanation images to an existing question
     */
    addQuestionExplanationImages(questionId, images, userId) {
        return __awaiter(this, void 0, void 0, function* () {
            // Ensure question exists
            const exists = yield this.prisma.question.findUnique({ where: { id: questionId }, select: { id: true } });
            if (!exists)
                throw new AppError_1.NotFoundError(`Question with ID ${questionId} not found`);
            // Validate images
            this.validateExplanationImages(images);
            // Check current image count to prevent exceeding limits
            const currentImages = yield this.prisma.questionExplanationImage.count({
                where: { questionId }
            });
            if (currentImages + images.length > 10) {
                throw new AppError_1.BadRequestError(`Adding ${images.length} images would exceed the maximum limit of 10 images per question`);
            }
            // Basic filename safety: strip directories and validate
            const sanitized = images.map(img => {
                var _a;
                return ({
                    imagePath: img.imagePath.split('/').pop() || img.imagePath,
                    altText: ((_a = img.altText) === null || _a === void 0 ? void 0 : _a.trim()) || null
                });
            });
            yield this.prisma.questionExplanationImage.createMany({
                data: sanitized.map(s => ({ questionId, imagePath: s.imagePath, altText: s.altText }))
            });
            const updated = yield this.getQuestionById(questionId);
            return { questionId, explanationImageCount: updated.questionExplanationImages.length };
        });
    }
    /**
     * Update a specific explanation image from a question
     */
    updateQuestionExplanationImage(questionId, imageId, updateData, userId) {
        return __awaiter(this, void 0, void 0, function* () {
            // Verify the question exists
            const question = yield this.prisma.question.findUnique({ where: { id: questionId } });
            if (!question) {
                throw new AppError_1.NotFoundError(`Question with ID ${questionId} not found`);
            }
            // Verify the explanation image exists and belongs to this question
            const existingImage = yield this.prisma.questionExplanationImage.findUnique({ where: { id: imageId } });
            if (!existingImage || existingImage.questionId !== questionId) {
                throw new AppError_1.NotFoundError("Explanation image not found for this question");
            }
            // Basic filename safety: strip directories
            const sanitizedImagePath = updateData.imagePath.split('/').pop() || updateData.imagePath;
            // Update the explanation image
            const updatedImage = yield this.prisma.questionExplanationImage.update({
                where: { id: imageId },
                data: {
                    imagePath: sanitizedImagePath,
                    altText: updateData.altText
                }
            });
            return {
                questionId,
                imageId,
                imagePath: updatedImage.imagePath,
                altText: updatedImage.altText
            };
        });
    }
    /**
     * Delete a specific explanation image from a question
     */
    deleteQuestionExplanationImage(questionId, imageId, userId) {
        return __awaiter(this, void 0, void 0, function* () {
            const img = yield this.prisma.questionExplanationImage.findUnique({ where: { id: imageId } });
            if (!img || img.questionId !== questionId) {
                throw new AppError_1.NotFoundError("Explanation image not found for this question");
            }
            yield this.prisma.questionExplanationImage.delete({ where: { id: imageId } });
            return { questionId, imageId };
        });
    }
    /**
     * Replace all question images with new ones
     * Used by PUT /admin/image/:questionId/question-images
     */
    replaceQuestionImages(questionId, images) {
        return __awaiter(this, void 0, void 0, function* () {
            // Ensure question exists
            const question = yield this.prisma.question.findUnique({ where: { id: questionId } });
            if (!question) {
                throw new AppError_1.NotFoundError(`Question with ID ${questionId} not found`);
            }
            // Delete all existing question images
            yield this.prisma.questionImage.deleteMany({
                where: { questionId }
            });
            // Create new images
            const createdImages = yield Promise.all(images.map(img => this.prisma.questionImage.create({
                data: {
                    questionId,
                    imagePath: img.imagePath,
                    altText: img.altText || null
                }
            })));
            // Return canonical response format
            return {
                id: questionId,
                images: createdImages.map(img => ({
                    id: img.id,
                    imagePath: img.imagePath,
                    altText: img.altText
                }))
            };
        });
    }
    /**
     * Replace all explanation images with new ones
     * Used by PUT /admin/image/:questionId/explanation-images
     */
    replaceExplanationImages(questionId, images) {
        return __awaiter(this, void 0, void 0, function* () {
            // Ensure question exists
            const question = yield this.prisma.question.findUnique({ where: { id: questionId } });
            if (!question) {
                throw new AppError_1.NotFoundError(`Question with ID ${questionId} not found`);
            }
            // Delete all existing explanation images
            yield this.prisma.questionExplanationImage.deleteMany({
                where: { questionId }
            });
            // Create new images
            const createdImages = yield Promise.all(images.map(img => this.prisma.questionExplanationImage.create({
                data: {
                    questionId,
                    imagePath: img.imagePath,
                    altText: img.altText || null
                }
            })));
            // Return canonical response format
            return {
                id: questionId,
                explanationImages: createdImages.map(img => ({
                    id: img.id,
                    imagePath: img.imagePath,
                    altText: img.altText
                }))
            };
        });
    }
    /**
     * Get questions with unified filtering
     */
    getQuestionsWithFilters(filters, accessibleStudyPackIds, questionCount) {
        return __awaiter(this, void 0, void 0, function* () {
            const whereConditions = {
                course: {
                    module: {
                        unite: {
                            studyPackId: { in: accessibleStudyPackIds }
                        }
                    }
                }
            };
            // Apply filters
            if (filters.courseIds && filters.courseIds.length > 0) {
                whereConditions.courseId = { in: filters.courseIds };
            }
            if (filters.moduleIds && filters.moduleIds.length > 0) {
                whereConditions.course = Object.assign(Object.assign({}, whereConditions.course), { moduleId: { in: filters.moduleIds } });
            }
            if (filters.uniteIds && filters.uniteIds.length > 0) {
                whereConditions.course = Object.assign(Object.assign({}, whereConditions.course), { module: {
                        uniteId: { in: filters.uniteIds }
                    } });
            }
            if (filters.universityIds && filters.universityIds.length > 0) {
                whereConditions.universityId = { in: filters.universityIds };
            }
            if (filters.yearLevels && filters.yearLevels.length > 0) {
                whereConditions.yearLevel = { in: filters.yearLevels };
            }
            if (filters.examYears && filters.examYears.length > 0) {
                whereConditions.examYear = { in: filters.examYears };
            }
            if (filters.questionTypes && filters.questionTypes.length > 0) {
                whereConditions.questionType = { in: filters.questionTypes };
            }
            if (filters.examIds && filters.examIds.length > 0) {
                whereConditions.examId = { in: filters.examIds };
            }
            // Filter by question source IDs - direct question source filtering
            if (filters.questionSourceIds && filters.questionSourceIds.length > 0) {
                whereConditions.sourceId = { in: filters.questionSourceIds };
            }
            return yield this.prisma.question.findMany({
                where: whereConditions,
                include: {
                    questionAnswers: {
                        include: {
                            explanationImages: true
                        }
                    },
                    questionImages: true,
                    questionExplanationImages: true,
                    course: {
                        include: {
                            module: {
                                include: {
                                    unite: true
                                }
                            }
                        }
                    },
                    university: {
                        select: {
                            id: true,
                            name: true,
                            country: true
                        }
                    },
                    source: {
                        select: {
                            id: true,
                            name: true
                        }
                    }
                },
                take: questionCount,
                orderBy: [
                    { createdAt: 'desc' },
                    { id: 'asc' }
                ]
            });
        });
    }
    /**
     * Validate references exist in database
     */
    validateReferences(data) {
        return __awaiter(this, void 0, void 0, function* () {
            if (data.courseId) {
                const course = yield this.prisma.course.findUnique({ where: { id: data.courseId } });
                if (!course) {
                    throw new AppError_1.BadRequestError(`Course with ID ${data.courseId} does not exist`);
                }
            }
            if (data.examId) {
                const exam = yield this.prisma.exam.findUnique({ where: { id: data.examId } });
                if (!exam) {
                    throw new AppError_1.BadRequestError(`Exam with ID ${data.examId} does not exist`);
                }
            }
            if (data.sourceId) {
                const source = yield this.prisma.questionSource.findUnique({ where: { id: data.sourceId } });
                if (!source) {
                    throw new AppError_1.BadRequestError(`Question source with ID ${data.sourceId} does not exist`);
                }
            }
            if (data.universityId) {
                const university = yield this.prisma.university.findUnique({ where: { id: data.universityId } });
                if (!university) {
                    throw new AppError_1.BadRequestError(`University with ID ${data.universityId} does not exist`);
                }
            }
        });
    }
    /**
     * Get available filters for question selection
     */
    getAvailableFilters(accessibleStudyPackIds) {
        return __awaiter(this, void 0, void 0, function* () {
            const [courses, universities, examYears, questionTypes, questionSources, typeCounts] = yield Promise.all([
                // Get available courses with question counts
                this.prisma.course.findMany({
                    where: {
                        module: {
                            unite: {
                                studyPackId: { in: accessibleStudyPackIds }
                            }
                        }
                    },
                    include: {
                        module: {
                            include: {
                                unite: true
                            }
                        },
                        _count: {
                            select: { questions: true }
                        }
                    },
                    orderBy: { name: 'asc' }
                }),
                // Get available universities
                this.prisma.university.findMany({
                    where: {
                        questions: {
                            some: {
                                course: {
                                    module: {
                                        unite: {
                                            studyPackId: { in: accessibleStudyPackIds }
                                        }
                                    }
                                }
                            }
                        }
                    },
                    orderBy: { name: 'asc' }
                }),
                // Get available exam years
                this.prisma.question.findMany({
                    where: {
                        examYear: { not: null },
                        course: {
                            module: {
                                unite: {
                                    studyPackId: { in: accessibleStudyPackIds }
                                }
                            }
                        }
                    },
                    select: { examYear: true },
                    distinct: ['examYear'],
                    orderBy: { examYear: 'desc' }
                }),
                // Get available question types
                this.prisma.question.findMany({
                    where: {
                        course: {
                            module: {
                                unite: {
                                    studyPackId: { in: accessibleStudyPackIds }
                                }
                            }
                        }
                    },
                    select: { questionType: true },
                    distinct: ['questionType']
                }),
                // Get available question sources
                this.prisma.questionSource.findMany({
                    where: {
                        questions: {
                            some: {
                                course: {
                                    module: {
                                        unite: {
                                            studyPackId: { in: accessibleStudyPackIds }
                                        }
                                    }
                                }
                            }
                        }
                    },
                    include: {
                        _count: {
                            select: { questions: true }
                        }
                    },
                    orderBy: { name: 'asc' }
                }),
                // Grouped counts per course and type
                this.prisma.question.groupBy({
                    by: ['courseId', 'questionType'],
                    where: {
                        course: {
                            module: {
                                unite: {
                                    studyPackId: { in: accessibleStudyPackIds }
                                }
                            }
                        }
                    },
                    _count: { _all: true }
                })
            ]);
            // Build a quick lookup map: courseId -> { singleChoiceCount, multipleChoiceCount }
            const perCourseTypeCounts = new Map();
            typeCounts.forEach((row) => {
                const existing = perCourseTypeCounts.get(row.courseId) || { singleChoiceCount: 0, multipleChoiceCount: 0 };
                if (row.questionType === 'SINGLE_CHOICE')
                    existing.singleChoiceCount += row._count._all;
                if (row.questionType === 'MULTIPLE_CHOICE')
                    existing.multipleChoiceCount += row._count._all;
                perCourseTypeCounts.set(row.courseId, existing);
            });
            const coursesWithCounts = courses.map((c) => {
                var _a, _b;
                const typeCount = perCourseTypeCounts.get(c.id) || { singleChoiceCount: 0, multipleChoiceCount: 0 };
                return Object.assign(Object.assign({}, c), { questionCount: (_b = (_a = c === null || c === void 0 ? void 0 : c._count) === null || _a === void 0 ? void 0 : _a.questions) !== null && _b !== void 0 ? _b : 0, singleChoiceCount: typeCount.singleChoiceCount, multipleChoiceCount: typeCount.multipleChoiceCount });
            });
            return {
                courses: coursesWithCounts,
                universities,
                examYears: examYears.map((q) => q.examYear).filter(Boolean),
                questionTypes: questionTypes.map((q) => q.questionType),
                questionSources: questionSources.map((qs) => {
                    var _a;
                    return ({
                        id: qs.id,
                        name: qs.name,
                        questionCount: ((_a = qs._count) === null || _a === void 0 ? void 0 : _a.questions) || 0
                    });
                })
            };
        });
    }
};
QuestionService = __decorate([
    (0, tsyringe_1.injectable)(),
    __param(0, (0, tsyringe_1.inject)("db")),
    __metadata("design:paramtypes", [db_1.default])
], QuestionService);
exports.default = QuestionService;
