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
const tsyringe_1 = require("tsyringe");
const question_service_1 = __importDefault(require("./question.service"));
const response_utils_1 = __importDefault(require("../../core/utils/response.utils"));
let QuestionController = class QuestionController {
    constructor(questionService, responseUtils) {
        this.questionService = questionService;
        this.responseUtils = responseUtils;
    }
    /**
     * Create a single question
     * POST /api/v1/admin/questions
     */
    createQuestion(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const createdById = req.user.user_data.id;
                const questionData = req.body;
                const result = yield this.questionService.createQuestion(questionData, createdById);
                this.responseUtils.sendSuccessResponse(res, result.data, 201, result.message);
            }
            catch (error) {
                next(error);
            }
        });
    }
    /**
     * Create multiple questions with shared metadata
     * POST /api/v1/admin/questions/bulk
     */
    createQuestionsInBulk(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const createdById = req.user.user_data.id;
                const bulkData = req.body;
                const result = yield this.questionService.createQuestionsInBulk(bulkData, createdById);
                this.responseUtils.sendSuccessResponse(res, result.data, 201, result.message);
            }
            catch (error) {
                next(error);
            }
        });
    }
    /**
     * Update question explanation with comprehensive image management
     * PUT /api/v1/admin/questions/:id/explanation
     */
    updateQuestionExplanation(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const questionId = parseInt(req.params.id);
                const updatedById = req.user.user_data.id;
                const explanationData = req.body;
                // Validate question ID
                if (isNaN(questionId) || questionId <= 0) {
                    this.responseUtils.sendBadRequestResponse(res, "Valid question ID is required");
                    return;
                }
                // Validate explanation data
                if (!explanationData.explanation || explanationData.explanation.trim().length === 0) {
                    this.responseUtils.sendBadRequestResponse(res, "Explanation text is required");
                    return;
                }
                // Additional validation for explanation images
                if (explanationData.explanationImages) {
                    if (explanationData.explanationImages.length > 10) {
                        this.responseUtils.sendBadRequestResponse(res, "Maximum 10 explanation images allowed");
                        return;
                    }
                    // Validate each image
                    for (const img of explanationData.explanationImages) {
                        if (!img.imagePath || img.imagePath.trim().length === 0) {
                            this.responseUtils.sendBadRequestResponse(res, "Image path is required for all images");
                            return;
                        }
                        if (img.altText && img.altText.length > 255) {
                            this.responseUtils.sendBadRequestResponse(res, "Alt text must be 255 characters or less");
                            return;
                        }
                    }
                }
                const result = yield this.questionService.updateQuestionExplanation(questionId, explanationData, updatedById);
                this.responseUtils.sendSuccessResponse(res, result.data, 200, result.message);
            }
            catch (error) {
                next(error);
            }
        });
    }
    /**
     * Update an existing question
     * PUT /api/v1/admin/questions/:id
     */
    updateQuestion(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const questionId = parseInt(req.params.id);
                const updatedById = req.user.user_data.id;
                if (isNaN(questionId)) {
                    this.responseUtils.sendBadRequestResponse(res, "Valid question ID is required");
                    return;
                }
                const result = yield this.questionService.updateQuestion(questionId, req.body, updatedById);
                this.responseUtils.sendSuccessResponse(res, result.data, 200, result.message);
            }
            catch (error) {
                next(error);
            }
        });
    }
    /**
     * Delete a question
     * DELETE /api/v1/admin/questions/:id
     */
    deleteQuestion(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const questionId = parseInt(req.params.id);
                const deletedById = req.user.user_data.id;
                if (isNaN(questionId)) {
                    this.responseUtils.sendBadRequestResponse(res, "Valid question ID is required");
                    return;
                }
                const result = yield this.questionService.deleteQuestion(questionId, deletedById);
                // Service returns canonical format { message: "..." }
                this.responseUtils.sendSuccessResponse(res, result);
            }
            catch (error) {
                next(error);
            }
        });
    }
    /**
     * Get available filters for question selection
     * GET /api/v1/admin/questions/filters
     */
    getQuestionFilters(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const user = req.user;
                const filters = yield this.questionService.getAvailableFilters(user.accessible_study_packs);
                this.responseUtils.sendSuccessResponse(res, { filters });
            }
            catch (error) {
                next(error);
            }
        });
    }
    /**
     * Get a single question by ID with images
     * GET /api/v1/admin/questions/:id
     * Returns canonical format with answers, images arrays at root level
     */
    getQuestionById(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const questionId = parseInt(req.params.id);
                if (isNaN(questionId)) {
                    this.responseUtils.sendBadRequestResponse(res, "Valid question ID is required");
                    return;
                }
                const question = yield this.questionService.getQuestionById(questionId);
                // Transform to canonical format
                const response = {
                    id: question.id,
                    questionText: question.questionText,
                    questionType: question.questionType,
                    courseId: question.courseId,
                    course: question.course ? {
                        id: question.course.id,
                        name: question.course.name
                    } : null,
                    answers: question.questionAnswers.map((a) => ({
                        id: a.id,
                        answerText: a.answerText,
                        isCorrect: a.isCorrect
                    })),
                    explanation: question.explanation,
                    images: question.questionImages.map((img) => ({
                        id: img.id,
                        imagePath: img.imagePath,
                        altText: img.altText
                    })),
                    universityId: question.universityId,
                    yearLevel: question.yearLevel,
                    examYear: question.examYear,
                    sourceId: question.sourceId,
                    createdAt: question.createdAt
                };
                this.responseUtils.sendSuccessResponse(res, response);
            }
            catch (error) {
                next(error);
            }
        });
    }
    /**
     * Attach images to an existing question
     * POST /api/v1/admin/questions/:id/images
     */
    addQuestionImages(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                const questionId = parseInt(req.params.id);
                if (isNaN(questionId)) {
                    this.responseUtils.sendBadRequestResponse(res, "Valid question ID is required");
                    return;
                }
                const images = (((_a = req.body) === null || _a === void 0 ? void 0 : _a.images) || []);
                const updated = yield this.questionService.addQuestionImages(questionId, images, req.user.user_data.id);
                this.responseUtils.sendSuccessResponse(res, updated, 201, "Images attached to question");
            }
            catch (error) {
                next(error);
            }
        });
    }
    /**
     * Update an image from a question
     * PUT /api/v1/admin/questions/:id/images/:imageId
     */
    updateQuestionImage(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const questionId = parseInt(req.params.id);
                const imageId = parseInt(req.params.imageId);
                if (isNaN(questionId) || isNaN(imageId)) {
                    this.responseUtils.sendBadRequestResponse(res, "Valid IDs are required");
                    return;
                }
                const { imagePath, altText } = req.body;
                const result = yield this.questionService.updateQuestionImage(questionId, imageId, { imagePath, altText }, req.user.user_data.id);
                this.responseUtils.sendSuccessResponse(res, result, 200, "Question image updated successfully");
            }
            catch (error) {
                next(error);
            }
        });
    }
    /**
     * Remove an image from a question
     * DELETE /api/v1/admin/questions/:id/images/:imageId
     */
    deleteQuestionImage(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const questionId = parseInt(req.params.id);
                const imageId = parseInt(req.params.imageId);
                if (isNaN(questionId) || isNaN(imageId)) {
                    this.responseUtils.sendBadRequestResponse(res, "Valid IDs are required");
                    return;
                }
                const result = yield this.questionService.deleteQuestionImage(questionId, imageId, req.user.user_data.id);
                this.responseUtils.sendSuccessResponse(res, result, 200, "Image removed from question");
            }
            catch (error) {
                next(error);
            }
        });
    }
    /**
     * Attach explanation images to an existing question
     * POST /api/v1/admin/questions/:id/explanation-images
     */
    addQuestionExplanationImages(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                const questionId = parseInt(req.params.id);
                if (isNaN(questionId)) {
                    this.responseUtils.sendBadRequestResponse(res, "Valid question ID is required");
                    return;
                }
                const images = (((_a = req.body) === null || _a === void 0 ? void 0 : _a.images) || []);
                // Additional validation
                if (!Array.isArray(images) || images.length === 0) {
                    this.responseUtils.sendBadRequestResponse(res, "At least one image is required");
                    return;
                }
                if (images.length > 10) {
                    this.responseUtils.sendBadRequestResponse(res, "Maximum 10 images allowed per request");
                    return;
                }
                const updated = yield this.questionService.addQuestionExplanationImages(questionId, images, req.user.user_data.id);
                this.responseUtils.sendSuccessResponse(res, updated, 201, "Explanation images attached to question");
            }
            catch (error) {
                next(error);
            }
        });
    }
    /**
     * Update an explanation image from a question
     * PUT /api/v1/admin/questions/:id/explanation-images/:imageId
     */
    updateQuestionExplanationImage(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const questionId = parseInt(req.params.id);
                const imageId = parseInt(req.params.imageId);
                if (isNaN(questionId) || isNaN(imageId)) {
                    this.responseUtils.sendBadRequestResponse(res, "Valid IDs are required");
                    return;
                }
                const { imagePath, altText } = req.body;
                const result = yield this.questionService.updateQuestionExplanationImage(questionId, imageId, { imagePath, altText }, req.user.user_data.id);
                this.responseUtils.sendSuccessResponse(res, result, 200, "Question explanation image updated successfully");
            }
            catch (error) {
                next(error);
            }
        });
    }
    /**
     * Remove an explanation image from a question
     * DELETE /api/v1/admin/questions/:id/explanation-images/:imageId
     */
    deleteQuestionExplanationImage(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const questionId = parseInt(req.params.id);
                const imageId = parseInt(req.params.imageId);
                if (isNaN(questionId) || isNaN(imageId)) {
                    this.responseUtils.sendBadRequestResponse(res, "Valid IDs are required");
                    return;
                }
                const result = yield this.questionService.deleteQuestionExplanationImage(questionId, imageId, req.user.user_data.id);
                this.responseUtils.sendSuccessResponse(res, result, 200, "Explanation image removed from question");
            }
            catch (error) {
                next(error);
            }
        });
    }
};
QuestionController = __decorate([
    (0, tsyringe_1.injectable)(),
    __param(0, (0, tsyringe_1.inject)(question_service_1.default)),
    __param(1, (0, tsyringe_1.inject)(response_utils_1.default)),
    __metadata("design:paramtypes", [question_service_1.default,
        response_utils_1.default])
], QuestionController);
exports.default = QuestionController;
