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
const quiz_service_1 = __importDefault(require("./quiz.service"));
const response_utils_1 = __importDefault(require("../../core/utils/response.utils"));
const validation_middleware_1 = require("../../middleware/validation.middleware");
let QuizController = class QuizController {
    constructor(quizService, responseUtils) {
        this.quizService = quizService;
        this.responseUtils = responseUtils;
    }
    // POST /api/v1/quizzes/quiz-sessions
    createQuizSession(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Body is already validated by middleware, just sanitize
                const sanitizedData = Object.assign(Object.assign({}, req.body), { title: (0, validation_middleware_1.sanitizeString)(req.body.title) });
                const result = yield this.quizService.createQuizSession(sanitizedData, req.user);
                this.responseUtils.sendSuccessResponse(res, result.data, 201);
            }
            catch (error) {
                console.error("Error creating quiz session:", error);
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    // GET /api/v1/quizzes/quiz-filters
    getQuizFilters(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const result = yield this.quizService.getQuizFilters(req.user);
                this.responseUtils.sendSuccessResponse(res, result.data);
            }
            catch (error) {
                console.error("Error getting quiz filters:", error);
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    // GET /api/v1/quizzes/session-filters - Canonical spec
    // Returns universities, questionSources, examYears, rotations, unites with questionCount
    // Optional query params: uniteId, moduleId for filtering by selection
    getSessionFilters(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const uniteId = req.query.uniteId ? parseInt(req.query.uniteId) : undefined;
                const moduleId = req.query.moduleId ? parseInt(req.query.moduleId) : undefined;
                const result = yield this.quizService.getSessionFilters(req.user, { uniteId, moduleId });
                this.responseUtils.sendSuccessResponse(res, result);
            }
            catch (error) {
                console.error("Error getting session filters:", error);
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    // GET /api/v1/quizzes/session-residency-filters
    getResidencySessionFilters(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const result = yield this.quizService.getResidencySessionFilters(req.user);
                this.responseUtils.sendSuccessResponse(res, result.data);
            }
            catch (error) {
                console.error("Error getting residency session filters:", error);
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    // GET /api/v1/quizzes/residency-available-parts?universityId=1&examYear=2024
    getResidencyAvailableParts(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const universityId = parseInt(req.query.universityId);
                const examYear = parseInt(req.query.examYear);
                if (!universityId || isNaN(universityId)) {
                    this.responseUtils.sendBadRequestResponse(res, "Valid universityId query parameter is required");
                    return;
                }
                if (!examYear || isNaN(examYear)) {
                    this.responseUtils.sendBadRequestResponse(res, "Valid examYear query parameter is required");
                    return;
                }
                const result = yield this.quizService.getResidencyAvailableParts(req.user, universityId, examYear);
                this.responseUtils.sendSuccessResponse(res, result);
            }
            catch (error) {
                console.error("Error getting residency available parts:", error);
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    // GET /api/v1/quizzes/exam-session-filters
    getExamSessionFilters(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const result = yield this.quizService.getExamSessionFilters(req.user);
                this.responseUtils.sendSuccessResponse(res, result.data);
            }
            catch (error) {
                console.error("Error getting exam session filters:", error);
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    // POST /api/v1/quiz-sessions/practice/:labelId
    createPracticeSessionByLabel(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const labelId = parseInt(req.params.labelId);
                if (!labelId || isNaN(labelId)) {
                    this.responseUtils.sendBadRequestResponse(res, "Valid label ID is required");
                    return;
                }
                const result = yield this.quizService.createPracticeSessionByLabel(req.user, labelId);
                this.responseUtils.sendSuccessResponse(res, result.data, 201);
            }
            catch (error) {
                console.error("Error creating practice session by label:", error);
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    // POST /api/v1/quizzes/create-session-by-questions
    createSessionByQuestions(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Sanitize the title field
                const sanitizedData = Object.assign(Object.assign({}, req.body), { title: (0, validation_middleware_1.sanitizeString)(req.body.title) });
                const result = yield this.quizService.createSessionByQuestions(req.user, sanitizedData);
                this.responseUtils.sendSuccessResponse(res, result.data, 201);
            }
            catch (error) {
                console.error("Error creating session by questions:", error);
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    // GET /api/v1/quizzes/question-count (legacy)
    getQuestionCount(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const result = yield this.quizService.getQuestionCount(req.user, req.query);
                this.responseUtils.sendSuccessResponse(res, result.data);
            }
            catch (error) {
                console.error("Error getting question count:", error);
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    // POST /api/v1/quizzes/question-count - Canonical spec
    // Returns totalQuestionCount and accessibleQuestionCount
    getQuestionCountPost(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                console.log("[DEBUG] question-count POST body:", JSON.stringify(req.body));
                console.log("[DEBUG] user study packs:", (_a = req.user) === null || _a === void 0 ? void 0 : _a.accessible_study_packs);
                const result = yield this.quizService.getQuestionCountCanonical(req.user, req.body);
                console.log("[DEBUG] question-count result:", JSON.stringify(result));
                this.responseUtils.sendSuccessResponse(res, result);
            }
            catch (error) {
                console.error("Error getting question count:", error);
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    // GET /api/v1/quizzes/questions-by-unite-or-module - Canonical spec
    getQuestionsByUniteOrModule(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const uniteId = req.query.uniteId ? parseInt(req.query.uniteId) : undefined;
                const moduleId = req.query.moduleId ? parseInt(req.query.moduleId) : undefined;
                // Validation: either uniteId OR moduleId must be provided, not both or neither
                if ((uniteId && moduleId) || (!uniteId && !moduleId)) {
                    this.responseUtils.sendBadRequestResponse(res, "Either uniteId OR moduleId must be provided, not both");
                    return;
                }
                const result = yield this.quizService.getQuestionsByUniteOrModule(req.user, uniteId, moduleId);
                this.responseUtils.sendSuccessResponse(res, result);
            }
            catch (error) {
                console.error("Error getting questions by unite/module:", error);
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    // POST /api/v1/quizzes/sessions - Canonical spec
    // Creates a quiz session and returns { sessionId }
    createQuizSessionCanonical(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const sanitizedData = Object.assign(Object.assign({}, req.body), { title: (0, validation_middleware_1.sanitizeString)(req.body.title) });
                const result = yield this.quizService.createQuizSessionCanonical(sanitizedData, req.user);
                this.responseUtils.sendSuccessResponse(res, result, 201);
            }
            catch (error) {
                console.error("Error creating quiz session:", error);
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    // GET /api/v1/quiz-sessions/:sessionId
    getQuizSession(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const sessionId = parseInt(req.params.sessionId);
                if (!sessionId || isNaN(sessionId)) {
                    this.responseUtils.sendBadRequestResponse(res, "Valid session ID is required");
                    return;
                }
                const result = yield this.quizService.getQuizSession(sessionId, req.user);
                this.responseUtils.sendSuccessResponse(res, result);
            }
            catch (error) {
                console.error("Error getting quiz session:", error);
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    // GET /api/v1/quiz-sessions/:sessionId/results
    // Returns computed session results with statistics
    getSessionResults(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const sessionId = parseInt(req.params.sessionId);
                if (!sessionId || isNaN(sessionId)) {
                    this.responseUtils.sendBadRequestResponse(res, "Valid session ID is required");
                    return;
                }
                const result = yield this.quizService.getSessionResults(sessionId, req.user);
                this.responseUtils.sendSuccessResponse(res, result);
            }
            catch (error) {
                console.error("Error getting session results:", error);
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    // POST /api/v1/quiz-sessions/:sessionId/submit-answer
    submitAnswers(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const sessionId = parseInt(req.params.sessionId);
                if (!sessionId || isNaN(sessionId)) {
                    this.responseUtils.sendBadRequestResponse(res, "Valid session ID is required");
                    return;
                }
                // Convert answer IDs to numbers and handle both single and multiple choice
                const sanitizedData = {
                    answers: req.body.answers.map((answer) => {
                        const sanitized = {
                            questionId: parseInt(answer.questionId)
                        };
                        // Handle single choice questions
                        if (answer.selectedAnswerId !== undefined) {
                            sanitized.selectedAnswerId = parseInt(answer.selectedAnswerId);
                        }
                        // Handle multiple choice questions
                        if (answer.selectedAnswerIds !== undefined && Array.isArray(answer.selectedAnswerIds)) {
                            sanitized.selectedAnswerIds = answer.selectedAnswerIds.map((id) => parseInt(id));
                        }
                        return sanitized;
                    })
                };
                // Sanitize QROC answers (textAnswer and isCorrect)
                sanitizedData.answers = req.body.answers.map((answer) => {
                    const sanitized = {
                        questionId: parseInt(answer.questionId)
                    };
                    // Handle single choice
                    if (answer.selectedAnswerId !== undefined) {
                        sanitized.selectedAnswerId = parseInt(answer.selectedAnswerId);
                    }
                    // Handle multiple choice
                    if (answer.selectedAnswerIds !== undefined && Array.isArray(answer.selectedAnswerIds)) {
                        sanitized.selectedAnswerIds = answer.selectedAnswerIds.map((id) => parseInt(id));
                    }
                    // Handle QROC
                    if (answer.textAnswer !== undefined) {
                        sanitized.textAnswer = (0, validation_middleware_1.sanitizeString)(answer.textAnswer);
                        if (answer.isCorrect !== undefined) {
                            sanitized.isCorrect = Boolean(answer.isCorrect);
                        }
                    }
                    return sanitized;
                });
                const result = yield this.quizService.submitAnswers(sessionId, sanitizedData, req.user);
                this.responseUtils.sendSuccessResponse(res, result);
            }
            catch (error) {
                console.error("Error submitting answers:", error);
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    // GET /api/v1/quiz-sessions
    getUserQuizSessions(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Use validated pagination parameters from middleware
                const page = req.query.page;
                const limit = req.query.limit;
                // Validation is now handled by middleware, so we can remove manual validation
                const result = yield this.quizService.getUserQuizSessions(req.user, page, limit);
                this.responseUtils.sendSuccessResponse(res, result);
            }
            catch (error) {
                console.error("Error getting user quiz sessions:", error);
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    // GET /api/v1/quiz-sessions/type/:sessionType - Canonical spec
    // Returns flat array (no pagination)
    getQuizSessionsByType(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const sessionType = req.params.sessionType;
                // Validate sessionType
                if (!sessionType || !['PRACTICE', 'EXAM', 'REMEDIAL'].includes(sessionType)) {
                    this.responseUtils.sendBadRequestResponse(res, "Valid session type is required (PRACTICE, EXAM, REMEDIAL)");
                    return;
                }
                const result = yield this.quizService.getQuizSessionsByTypeCanonical(req.user, sessionType);
                res.status(200).json(result);
            }
            catch (error) {
                console.error("Error getting quiz sessions by type:", error);
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    // PUT /api/v1/quiz-sessions/:sessionId/questions/:questionId/answer
    updateQuizAnswer(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const sessionId = parseInt(req.params.sessionId);
                const questionId = parseInt(req.params.questionId);
                const selectedAnswerId = parseInt(req.body.selectedAnswerId);
                if (!sessionId || isNaN(sessionId) || !questionId || isNaN(questionId) || !selectedAnswerId || isNaN(selectedAnswerId)) {
                    this.responseUtils.sendBadRequestResponse(res, "Valid session ID, question ID, and answer ID are required");
                    return;
                }
                const result = yield this.quizService.updateQuizAnswer(sessionId, questionId, selectedAnswerId, req.user);
                this.responseUtils.sendSuccessResponse(res, result);
            }
            catch (error) {
                console.error("Error updating quiz answer:", error);
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    // POST /api/v1/quiz-sessions/retake
    createRetakeSession(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const result = yield this.quizService.createRetakeSession(req.body, req.user);
                this.responseUtils.sendSuccessResponse(res, result, 201);
            }
            catch (error) {
                console.error("Error creating retake session:", error);
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    // DELETE /api/v1/students/quiz-sessions/:sessionId
    deleteQuizSession(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const sessionId = parseInt(req.params.sessionId);
                if (!sessionId || isNaN(sessionId)) {
                    this.responseUtils.sendBadRequestResponse(res, "Valid session ID is required");
                    return;
                }
                const result = yield this.quizService.deleteQuizSession(sessionId, req.user);
                // 200 OK with success message (following existing patterns)
                this.responseUtils.sendSuccessResponse(res, result);
            }
            catch (error) {
                console.error("Error deleting quiz session:", error);
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    // PATCH /api/v1/sessions/:sessionId/status - Canonical spec
    updateSessionStatus(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const sessionId = parseInt(req.params.sessionId);
                if (!sessionId || isNaN(sessionId)) {
                    this.responseUtils.sendBadRequestResponse(res, "Valid session ID is required");
                    return;
                }
                const result = yield this.quizService.updateSessionStatus(sessionId, req.body, req.user);
                // Canonical spec format: { message, sessionId, status }
                this.responseUtils.sendSuccessResponse(res, result);
            }
            catch (error) {
                console.error("Error updating session status:", error);
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    // ==========================================
    // RESIDENCY SESSION ENDPOINTS (Canonical spec)
    // ==========================================
    /**
     * GET /quizzes/residency-sessions-only - Canonical spec
     * Returns array of residency sessions for the logged-in user
     */
    getResidencySessionsOnly(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const result = yield this.quizService.getResidencySessionsOnlyCanonical(req.user);
                this.responseUtils.sendSuccessResponse(res, result);
            }
            catch (error) {
                console.error("Error getting residency sessions:", error);
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    /**
     * POST /quizzes/residency-sessions - Canonical spec
     * Creates a residency session. Body: {title, examYear, universityId, parts?}
     * Returns 201: {sessionId, questionCount, title}
     */
    createResidencySession(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { title, examYear, universityId, parts } = req.body;
                // Validate required fields
                if (!title || typeof title !== 'string') {
                    this.responseUtils.sendBadRequestResponse(res, "title is required and must be a string");
                    return;
                }
                if (!examYear || typeof examYear !== 'number') {
                    this.responseUtils.sendBadRequestResponse(res, "examYear is required and must be a number");
                    return;
                }
                if (!universityId || typeof universityId !== 'number') {
                    this.responseUtils.sendBadRequestResponse(res, "universityId is required and must be a number");
                    return;
                }
                // Validate parts if provided
                if (parts && !Array.isArray(parts)) {
                    this.responseUtils.sendBadRequestResponse(res, "parts must be an array");
                    return;
                }
                const validParts = ["Sciences_fondamentales", "Pathologie_medico_chirurgical", "Dossier_clinique"];
                if (parts && parts.some((p) => !validParts.includes(p))) {
                    this.responseUtils.sendBadRequestResponse(res, `parts must contain only ${validParts.join(', ')}`);
                    return;
                }
                const result = yield this.quizService.createResidencySessionCanonical(req.user, { title, examYear, universityId, parts });
                this.responseUtils.sendSuccessResponse(res, result, 201);
            }
            catch (error) {
                console.error("Error creating residency session:", error);
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
};
QuizController = __decorate([
    (0, tsyringe_1.injectable)(),
    __param(0, (0, tsyringe_1.inject)(quiz_service_1.default)),
    __param(1, (0, tsyringe_1.inject)(response_utils_1.default)),
    __metadata("design:paramtypes", [quiz_service_1.default,
        response_utils_1.default])
], QuizController);
exports.default = QuizController;
