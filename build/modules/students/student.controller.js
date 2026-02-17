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
const zod_1 = require("zod");
const student_service_1 = __importDefault(require("./student.service"));
const response_utils_1 = __importDefault(require("../../core/utils/response.utils"));
const code_redemption_service_1 = require("./services/code-redemption.service");
// Validation schemas
const updateCourseProgressSchema = zod_1.z.object({
    layer: zod_1.z.number().min(1).max(3),
    completed: zod_1.z.boolean()
});
let StudentController = class StudentController {
    constructor(studentService, responseUtils, codeRedemptionService) {
        this.studentService = studentService;
        this.responseUtils = responseUtils;
        this.codeRedemptionService = codeRedemptionService;
    }
    // GET /api/v1/students/progress/overview - Canonical: flat {overallProgress, moduleProgress[]}
    getProgressOverview(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const result = yield this.studentService.getProgressOverviewCanonical(req.user);
                res.status(200).json(result);
            }
            catch (error) {
                console.error("Error getting progress overview:", error);
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    // PUT /api/v1/students/courses/:courseId/progress - Canonical: {courseId, progress, updatedAt}
    updateCourseProgress(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const courseId = parseInt(req.params.courseId);
                if (!courseId || isNaN(courseId)) {
                    this.responseUtils.sendBadRequestResponse(res, "Valid Course ID is required");
                    return;
                }
                // Canonical spec takes progress as percentage
                const { progress } = req.body;
                if (progress === undefined || typeof progress !== 'number' || progress < 0 || progress > 100) {
                    this.responseUtils.sendBadRequestResponse(res, "Valid progress value (0-100) is required");
                    return;
                }
                const result = yield this.studentService.updateCourseProgressCanonical(courseId, progress, req.user);
                res.status(200).json(result);
            }
            catch (error) {
                console.error("Error updating course progress:", error);
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    // GET /api/v1/students/quiz-history - Canonical: {items, total, page, limit, totalPages}
    getQuizHistory(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { type, status, page, limit, sortBy, sortOrder } = req.query;
                const parsedPage = page ? parseInt(page) : 1;
                const parsedLimit = limit ? parseInt(limit) : 10;
                const result = yield this.studentService.getQuizHistoryCanonical(req.user, type, status, parsedPage, parsedLimit, sortBy, sortOrder);
                res.status(200).json(result);
            }
            catch (error) {
                console.error("Error getting quiz history:", error);
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    // GET /api/v1/students/course-analytics - Canonical: {items, total, page, limit, totalPages}
    getCourseAnalytics(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { sessionId, sessionType, page, limit } = req.query;
                const parsedPage = page ? parseInt(page) : 1;
                const parsedLimit = limit ? parseInt(limit) : 10;
                const parsedSessionId = sessionId ? parseInt(sessionId) : undefined;
                const result = yield this.studentService.getCourseAnalyticsCanonical(req.user, parsedSessionId, sessionType, parsedPage, parsedLimit);
                res.status(200).json(result);
            }
            catch (error) {
                console.error("Error getting course analytics:", error);
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    // GET /api/v1/students/session-results - Canonical: {items, total, page, limit, totalPages}
    getStudentSessionResults(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { page, limit, sessionType, completedAfter, completedBefore, sessionIds } = req.query;
                const parsedPage = page ? parseInt(page, 10) : 1;
                const parsedLimit = limit ? parseInt(limit, 10) : 10;
                // Parse sessionIds if provided
                let parsedSessionIds;
                if (sessionIds) {
                    parsedSessionIds = sessionIds
                        .split(',')
                        .map((id) => parseInt(id.trim(), 10))
                        .filter((id) => !isNaN(id) && id > 0);
                }
                const filters = {
                    sessionType,
                    completedAfter,
                    completedBefore,
                    sessionIds: parsedSessionIds
                };
                const result = yield this.studentService.getSessionResultsCanonical(req.user, filters, parsedPage, parsedLimit);
                res.status(200).json(result);
            }
            catch (error) {
                console.error("Error getting student session results:", error);
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    // GET /api/v1/students/available-sessions - Canonical: flat array
    getAvailableSessionsForFiltering(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { sessionType } = req.query;
                if (!sessionType) {
                    this.responseUtils.sendBadRequestResponse(res, "sessionType query parameter is required");
                    return;
                }
                const result = yield this.studentService.getAvailableSessionsCanonical(req.user, sessionType);
                res.status(200).json(result);
            }
            catch (error) {
                console.error("Error getting available sessions:", error);
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    // GET /api/v1/students/analytics
    getPerformanceAnalytics(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const result = yield this.studentService.getPerformanceAnalytics(req.user);
                this.responseUtils.sendSuccessResponse(res, result);
            }
            catch (error) {
                console.error("Error getting performance analytics:", error);
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    // GET /api/v1/students/dashboard
    getStudentDashboard(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const result = yield this.studentService.getStudentDashboard(req.user);
                this.responseUtils.sendSuccessResponse(res, result);
            }
            catch (error) {
                console.error("Error getting student dashboard:", error);
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    // ==========================================
    // STUDY CONTENT ACCESS & NAVIGATION
    // ==========================================
    // GET /api/v1/students/content/filters
    getContentFilters(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const yearLevel = req.query.yearLevel;
                const result = yield this.studentService.getContentFilters(req.user, yearLevel);
                // Canonical spec: { unites: [...], independentModules: [...] }
                this.responseUtils.sendSuccessResponse(res, result);
            }
            catch (error) {
                console.error("Error getting content filters:", error);
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    // GET /api/v1/study-packs
    getStudyPacks(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const page = req.query.page ? parseInt(req.query.page) : 1;
                const limit = req.query.limit ? parseInt(req.query.limit) : 10;
                const search = req.query.search;
                const result = yield this.studentService.getStudyPacks(req.user, { page, limit, search });
                // Canonical spec: { items, total, page, limit, totalPages }
                this.responseUtils.sendSuccessResponse(res, result);
            }
            catch (error) {
                console.error("Error getting study packs:", error);
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    // GET /api/v1/study-packs/:id
    getStudyPackById(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const id = parseInt(req.params.id);
                if (!id || isNaN(id)) {
                    this.responseUtils.sendBadRequestResponse(res, "Valid study pack ID is required");
                    return;
                }
                const result = yield this.studentService.getStudyPackById(id, req.user);
                // Canonical spec: study pack with modules (not unites)
                this.responseUtils.sendSuccessResponse(res, result);
            }
            catch (error) {
                console.error("Error getting study pack details:", error);
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    // GET /api/v1/student/study-pack/:studyPackId - Student context
    getStudentStudyPack(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const id = parseInt(req.params.studyPackId);
                if (!id || isNaN(id)) {
                    this.responseUtils.sendBadRequestResponse(res, "Valid study pack ID is required");
                    return;
                }
                const result = yield this.studentService.getStudentStudyPack(id, req.user);
                // Canonical spec: study pack in student context with modules
                this.responseUtils.sendSuccessResponse(res, result);
            }
            catch (error) {
                console.error("Error getting student study pack:", error);
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    // GET /api/v1/courses/:id/resources
    getCourseResources(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const id = parseInt(req.params.id);
                if (!id || isNaN(id)) {
                    this.responseUtils.sendBadRequestResponse(res, "Valid course ID is required");
                    return;
                }
                const page = req.query.page ? parseInt(req.query.page) : 1;
                const limit = req.query.limit ? parseInt(req.query.limit) : 10;
                const type = req.query.type;
                const result = yield this.studentService.getCourseResources(id, req.user, { page, limit, type });
                // Canonical spec: { items, total, page, limit, totalPages }
                this.responseUtils.sendSuccessResponse(res, result);
            }
            catch (error) {
                console.error("Error getting course resources:", error);
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    // GET /api/v1/students/courses/by-module
    getCoursesByModule(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const moduleId = req.query.moduleId ? parseInt(req.query.moduleId) : undefined;
                const uniteId = req.query.uniteId ? parseInt(req.query.uniteId) : undefined;
                // Validate: either moduleId OR uniteId must be provided, not both
                if ((moduleId && uniteId) || (!moduleId && !uniteId)) {
                    this.responseUtils.sendBadRequestResponse(res, "Either moduleId OR uniteId must be provided, not both");
                    return;
                }
                const result = yield this.studentService.getCoursesByModule(req.user, { moduleId, uniteId });
                // Canonical spec: { courses: [...] }
                this.responseUtils.sendSuccessResponse(res, result);
            }
            catch (error) {
                console.error("Error getting courses by module:", error);
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    // ==========================================
    // MODULE BOOKS
    // ==========================================
    // GET /students/modules/:moduleId/books
    getModuleBooks(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const moduleId = parseInt(req.params.moduleId);
                if (!moduleId || isNaN(moduleId)) {
                    this.responseUtils.sendBadRequestResponse(res, "Valid moduleId is required");
                    return;
                }
                const result = yield this.studentService.getModuleBooksCanonical(req.user, moduleId);
                this.responseUtils.sendSuccessResponse(res, result);
            }
            catch (error) {
                console.error("Error getting module books:", error);
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    // ==========================================
    // SUBSCRIPTION-BASED QUESTION RETRIEVAL
    // ==========================================
    // GET /api/v1/students/questions
    getQuestionsBasedOnSubscription(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Validation handled by middleware - query params are already validated and transformed
                const filters = req.query;
                const result = yield this.studentService.getQuestionsBasedOnSubscription(req.user, filters);
                this.responseUtils.sendSuccessResponse(res, result.data);
            }
            catch (error) {
                console.error("Error getting subscription-based questions:", error);
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    // ==========================================
    // SUBSCRIPTION MANAGEMENT
    // ==========================================
    // GET /api/v1/students/subscriptions
    // Canonical spec: Returns array of subscriptions
    getUserSubscriptions(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const result = yield this.studentService.getUserSubscriptions(req.user);
                // Canonical spec: returns array directly, not wrapped in { success, data }
                this.responseUtils.sendSuccessResponse(res, result);
            }
            catch (error) {
                console.error("Error getting user subscriptions:", error);
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    // GET /api/v1/subscriptions/check-access
    // Canonical spec: { hasAccess, subscriptionRequired, subscriptionType?, trialAvailable? }
    checkSubscriptionAccess(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const contentId = req.query.contentId ? parseInt(req.query.contentId) : undefined;
                const contentType = req.query.contentType;
                if (!contentId || isNaN(contentId)) {
                    this.responseUtils.sendBadRequestResponse(res, "Valid contentId is required");
                    return;
                }
                if (!contentType || (contentType !== 'study-pack' && contentType !== 'course')) {
                    this.responseUtils.sendBadRequestResponse(res, "contentType must be 'study-pack' or 'course'");
                    return;
                }
                const result = yield this.studentService.checkSubscriptionAccess(req.user, contentId, contentType);
                this.responseUtils.sendSuccessResponse(res, result);
            }
            catch (error) {
                console.error("Error checking subscription access:", error);
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    // POST /api/v1/subscriptions/:subscriptionId/cancel
    // Canonical spec: { success, message, cancellationDate }
    cancelSubscription(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const subscriptionId = parseInt(req.params.subscriptionId);
                if (!subscriptionId || isNaN(subscriptionId)) {
                    this.responseUtils.sendBadRequestResponse(res, "Valid subscription ID is required");
                    return;
                }
                const result = yield this.studentService.cancelSubscription(subscriptionId, req.user);
                this.responseUtils.sendSuccessResponse(res, result);
            }
            catch (error) {
                console.error("Error cancelling subscription:", error);
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    // ==========================================
    // STUDENT NOTES SYSTEM (Canonical API)
    // ==========================================
    // GET /api/v1/students/notes - Canonical: returns flat array with labels
    getStudentNotes(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const search = req.query.search;
                const questionId = req.query.questionId ? parseInt(req.query.questionId) : undefined;
                const quizId = req.query.quizId ? parseInt(req.query.quizId) : undefined;
                // Parse labelIds[] - can be passed as labelIds[]=1&labelIds[]=2 or labelIds=1,2
                let labelIds;
                if (req.query['labelIds[]']) {
                    const rawLabelIds = req.query['labelIds[]'];
                    labelIds = Array.isArray(rawLabelIds)
                        ? rawLabelIds.map(id => parseInt(id)).filter(id => !isNaN(id))
                        : [parseInt(rawLabelIds)].filter(id => !isNaN(id));
                }
                else if (req.query.labelIds) {
                    const rawLabelIds = req.query.labelIds;
                    if (Array.isArray(rawLabelIds)) {
                        labelIds = rawLabelIds.map(id => parseInt(id)).filter(id => !isNaN(id));
                    }
                    else if (typeof rawLabelIds === 'string') {
                        labelIds = rawLabelIds.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
                    }
                }
                const result = yield this.studentService.getStudentNotesCanonical(req.user, { search, questionId, quizId, labelIds });
                // Canonical spec: returns array directly
                res.status(200).json(result);
            }
            catch (error) {
                console.error("Error getting student notes:", error);
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    // GET /api/v1/students/notes/by-module - Canonical: returns grouped notes
    getNotesByModule(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const moduleId = req.query.moduleId ? parseInt(req.query.moduleId) : undefined;
                const uniteId = req.query.uniteId ? parseInt(req.query.uniteId) : undefined;
                // Validation: exactly one of moduleId or uniteId must be provided
                if ((!moduleId && !uniteId) || (moduleId && uniteId)) {
                    this.responseUtils.sendBadRequestResponse(res, "Exactly one of moduleId or uniteId must be provided");
                    return;
                }
                const result = yield this.studentService.getNotesByModuleCanonical(req.user, moduleId, uniteId);
                res.status(200).json(result);
            }
            catch (error) {
                console.error("Error getting notes by module:", error);
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    // POST /api/v1/students/notes - Canonical: returns note object with 201 status
    createStudentNote(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const noteSchema = zod_1.z.object({
                    noteText: zod_1.z.string().min(1, "Note text is required").max(5000, "Note text must be at most 5000 characters"),
                    questionId: zod_1.z.number().int().positive().optional(),
                    quizId: zod_1.z.number().int().positive().optional(),
                    labelIds: zod_1.z.array(zod_1.z.number().int().positive()).optional()
                });
                const validation = noteSchema.safeParse(req.body);
                if (!validation.success) {
                    this.responseUtils.sendValidationError(res, "Validation failed", validation.error.issues);
                    return;
                }
                const { noteText, questionId, quizId, labelIds } = validation.data;
                // Canonical spec: at least one of questionId or quizId must be provided
                if (!questionId && !quizId) {
                    this.responseUtils.sendBadRequestResponse(res, "At least one of questionId or quizId must be provided");
                    return;
                }
                const result = yield this.studentService.createStudentNoteCanonical(req.user, noteText, questionId, quizId, labelIds);
                res.status(201).json(result);
            }
            catch (error) {
                console.error("Error creating student note:", error);
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    // PUT /api/v1/students/notes/:noteId - Canonical: returns note object with labels
    updateStudentNote(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const noteId = parseInt(req.params.noteId || req.params.id);
                const noteSchema = zod_1.z.object({
                    noteText: zod_1.z.string().min(1).max(5000).optional(),
                    labelIds: zod_1.z.array(zod_1.z.number().int().positive()).optional()
                });
                if (!noteId || isNaN(noteId)) {
                    this.responseUtils.sendBadRequestResponse(res, "Valid note ID is required");
                    return;
                }
                const validation = noteSchema.safeParse(req.body);
                if (!validation.success) {
                    this.responseUtils.sendValidationError(res, "Validation failed", validation.error.issues);
                    return;
                }
                const { noteText, labelIds } = validation.data;
                const result = yield this.studentService.updateStudentNoteCanonical(noteId, req.user, noteText, labelIds);
                res.status(200).json(result);
            }
            catch (error) {
                console.error("Error updating student note:", error);
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    // DELETE /api/v1/students/notes/:noteId - Canonical: returns { message }
    deleteStudentNote(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const noteId = parseInt(req.params.noteId || req.params.id);
                if (!noteId || isNaN(noteId)) {
                    this.responseUtils.sendBadRequestResponse(res, "Valid note ID is required");
                    return;
                }
                yield this.studentService.deleteStudentNoteCanonical(noteId, req.user);
                res.status(200).json({ message: "Note deleted successfully" });
            }
            catch (error) {
                console.error("Error deleting student note:", error);
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    // GET /api/v1/students/questions/:questionId/notes - Canonical: returns array with labels
    getQuestionNotes(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const questionId = parseInt(req.params.questionId || req.params.id);
                if (!questionId || isNaN(questionId)) {
                    this.responseUtils.sendBadRequestResponse(res, "Valid question ID is required");
                    return;
                }
                const result = yield this.studentService.getQuestionNotesCanonical(questionId, req.user);
                // Canonical spec: returns array directly
                res.status(200).json(result);
            }
            catch (error) {
                console.error("Error getting question notes:", error);
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    // ==========================================
    // LABELING SYSTEM (Canonical API)
    // ==========================================
    // GET /api/v1/students/labels - Canonical: returns { data: [...] }
    getStudentLabels(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const result = yield this.studentService.getStudentLabelsCanonical(req.user);
                res.status(200).json(result);
            }
            catch (error) {
                console.error("Error getting student labels:", error);
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    // GET /api/v1/students/labels/:labelId - Canonical: returns object directly
    getStudentLabelById(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            try {
                const labelId = parseInt(req.params.labelId || req.params.id);
                if (!labelId || isNaN(labelId)) {
                    this.responseUtils.sendBadRequestResponse(res, "Valid label ID is required");
                    return;
                }
                const result = yield this.studentService.getStudentLabelByIdCanonical(labelId, req.user);
                res.status(200).json(result);
            }
            catch (error) {
                console.error("Error getting student label by ID:", error);
                if (((_a = error.message) === null || _a === void 0 ? void 0 : _a.includes('not found')) || ((_b = error.message) === null || _b === void 0 ? void 0 : _b.includes('permission'))) {
                    res.status(404).json({ message: 'Label not found' });
                    return;
                }
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    // POST /api/v1/students/labels - Canonical: returns object with 201 status
    createStudentLabel(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const labelSchema = zod_1.z.object({
                    name: zod_1.z.string().min(1, "Label name is required").max(50, "Label name too long")
                });
                const validation = labelSchema.safeParse(req.body);
                if (!validation.success) {
                    this.responseUtils.sendValidationError(res, "Validation failed", validation.error.issues);
                    return;
                }
                const { name } = validation.data;
                const result = yield this.studentService.createStudentLabelCanonical(req.user, name);
                res.status(201).json(result);
            }
            catch (error) {
                console.error("Error creating student label:", error);
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    // PUT /api/v1/students/labels/:labelId - Canonical: returns object with statistics
    updateStudentLabel(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            try {
                const labelId = parseInt(req.params.labelId || req.params.id);
                const labelSchema = zod_1.z.object({
                    name: zod_1.z.string().min(1, "Label name is required").max(50, "Label name too long")
                });
                if (!labelId || isNaN(labelId)) {
                    this.responseUtils.sendBadRequestResponse(res, "Valid label ID is required");
                    return;
                }
                const validation = labelSchema.safeParse(req.body);
                if (!validation.success) {
                    this.responseUtils.sendValidationError(res, "Validation failed", validation.error.issues);
                    return;
                }
                const { name } = validation.data;
                const result = yield this.studentService.updateStudentLabelCanonical(labelId, req.user, name);
                res.status(200).json(result);
            }
            catch (error) {
                console.error("Error updating student label:", error);
                if (((_a = error.message) === null || _a === void 0 ? void 0 : _a.includes('not found')) || ((_b = error.message) === null || _b === void 0 ? void 0 : _b.includes('permission'))) {
                    res.status(404).json({ message: 'Label not found' });
                    return;
                }
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    // DELETE /api/v1/students/labels/:labelId - Canonical: returns { message }
    deleteStudentLabel(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            try {
                const labelId = parseInt(req.params.labelId || req.params.id);
                if (!labelId || isNaN(labelId)) {
                    this.responseUtils.sendBadRequestResponse(res, "Valid label ID is required");
                    return;
                }
                yield this.studentService.deleteStudentLabel(labelId, req.user);
                res.status(200).json({ message: 'Label deleted successfully' });
            }
            catch (error) {
                console.error("Error deleting student label:", error);
                if (((_a = error.message) === null || _a === void 0 ? void 0 : _a.includes('not found')) || ((_b = error.message) === null || _b === void 0 ? void 0 : _b.includes('permission'))) {
                    res.status(404).json({ message: 'Label not found' });
                    return;
                }
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    // GET /api/v1/students/labels/by-module - Canonical: returns { labels: [...] }
    getLabelsByModule(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                const moduleId = req.query.moduleId ? parseInt(req.query.moduleId) : undefined;
                const uniteId = req.query.uniteId ? parseInt(req.query.uniteId) : undefined;
                // Validate mutually exclusive params
                if ((moduleId && uniteId) || (!moduleId && !uniteId)) {
                    res.status(400).json({ message: 'Either moduleId or uniteId must be provided (not both)' });
                    return;
                }
                const result = yield this.studentService.getLabelsByModuleCanonical(req.user, moduleId, uniteId);
                res.status(200).json(result);
            }
            catch (error) {
                console.error("Error getting labels by module:", error);
                if ((_a = error.message) === null || _a === void 0 ? void 0 : _a.includes('not found')) {
                    res.status(404).json({ message: error.message });
                    return;
                }
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    // POST /api/v1/students/quizzes/:quizId/labels/:labelId
    addQuizToLabel(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const quizId = parseInt(req.params.quizId);
                const labelId = parseInt(req.params.labelId);
                if (!quizId || isNaN(quizId) || !labelId || isNaN(labelId)) {
                    this.responseUtils.sendBadRequestResponse(res, "Valid Quiz ID and Label ID are required");
                    return;
                }
                const result = yield this.studentService.addQuizToLabel(req.user.user_data.id, quizId, labelId, req.user);
                this.responseUtils.sendSuccessResponse(res, result);
            }
            catch (error) {
                console.error("Error adding quiz to label:", error);
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    // POST /api/v1/students/questions/:questionId/labels/:labelId - Canonical: returns { message }
    addQuestionToLabel(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            try {
                const questionId = parseInt(req.params.questionId);
                const labelId = parseInt(req.params.labelId);
                if (!questionId || isNaN(questionId) || !labelId || isNaN(labelId)) {
                    this.responseUtils.sendBadRequestResponse(res, "Valid Question ID and Label ID are required");
                    return;
                }
                yield this.studentService.addQuestionToLabelCanonical(req.user, questionId, labelId);
                res.status(200).json({ message: 'Question added to label successfully' });
            }
            catch (error) {
                console.error("Error adding question to label:", error);
                if ((_a = error.message) === null || _a === void 0 ? void 0 : _a.includes('already')) {
                    res.status(400).json({ message: 'Question already in label' });
                    return;
                }
                if (((_b = error.message) === null || _b === void 0 ? void 0 : _b.includes('not found')) || ((_c = error.message) === null || _c === void 0 ? void 0 : _c.includes('permission'))) {
                    res.status(404).json({ message: error.message });
                    return;
                }
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    // DELETE /api/v1/students/questions/:questionId/labels/:labelId - Canonical: returns { message }
    removeQuestionFromLabel(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            try {
                const questionId = parseInt(req.params.questionId);
                const labelId = parseInt(req.params.labelId);
                if (!questionId || isNaN(questionId) || !labelId || isNaN(labelId)) {
                    this.responseUtils.sendBadRequestResponse(res, "Valid Question ID and Label ID are required");
                    return;
                }
                yield this.studentService.removeQuestionFromLabelCanonical(req.user, questionId, labelId);
                res.status(200).json({ message: 'Question removed from label successfully' });
            }
            catch (error) {
                console.error("Error removing question from label:", error);
                if (((_a = error.message) === null || _a === void 0 ? void 0 : _a.includes('not found')) || ((_b = error.message) === null || _b === void 0 ? void 0 : _b.includes('permission'))) {
                    res.status(404).json({ message: error.message });
                    return;
                }
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    // ==========================================
    // TODO & TASK MANAGEMENT
    // ==========================================
    // GET /api/v1/students/todos
    getTodos(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const status = req.query.status;
                const type = req.query.type;
                const priority = req.query.priority;
                const includeCompleted = req.query.includeCompleted === 'true';
                // Use validated pagination parameters from middleware
                const page = req.query.page;
                const limit = req.query.limit;
                const result = yield this.studentService.getTodos(req.user, status, type, priority, page, limit, includeCompleted);
                this.responseUtils.sendSuccessResponse(res, result);
            }
            catch (error) {
                console.error("Error getting todos:", error);
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    // POST /api/v1/students/todos
    createTodo(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const todoSchema = zod_1.z.object({
                    title: zod_1.z.string().min(1, "Title is required"),
                    description: zod_1.z.string().optional(),
                    type: zod_1.z.enum(["READING", "QUIZ", "SESSION", "EXAM", "OTHER"]).optional(),
                    priority: zod_1.z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
                    dueDate: zod_1.z.string().datetime().optional(),
                    courseId: zod_1.z.number().int().positive().optional(),
                    quizId: zod_1.z.number().int().positive().optional()
                });
                const validation = todoSchema.safeParse(req.body);
                if (!validation.success) {
                    this.responseUtils.sendValidationError(res, "Validation failed", validation.error.issues);
                    return;
                }
                const { title, description, type, priority, dueDate, courseId, quizId } = validation.data;
                const result = yield this.studentService.createTodo(req.user, title, description, type, priority, dueDate ? new Date(dueDate) : undefined, courseId, // Already a number or undefined
                quizId // Already a number or undefined
                );
                this.responseUtils.sendSuccessResponse(res, result);
            }
            catch (error) {
                console.error("Error creating todo:", error);
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    // PUT /api/v1/students/todos/:id
    updateTodo(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const id = parseInt(req.params.id);
                const todoSchema = zod_1.z.object({
                    title: zod_1.z.string().min(1).optional(),
                    description: zod_1.z.string().optional(),
                    priority: zod_1.z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
                    dueDate: zod_1.z.string().datetime().optional(),
                    status: zod_1.z.enum(["PENDING", "IN_PROGRESS", "COMPLETED"]).optional()
                });
                if (!id || isNaN(id)) {
                    this.responseUtils.sendBadRequestResponse(res, "Valid todo ID is required");
                    return;
                }
                const validation = todoSchema.safeParse(req.body);
                if (!validation.success) {
                    this.responseUtils.sendValidationError(res, "Validation failed", validation.error.issues);
                    return;
                }
                const updateData = validation.data;
                if (updateData.dueDate) {
                    updateData.dueDate = new Date(updateData.dueDate);
                }
                const result = yield this.studentService.updateTodo(id, req.user, updateData);
                this.responseUtils.sendSuccessResponse(res, result);
            }
            catch (error) {
                console.error("Error updating todo:", error);
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    // DELETE /api/v1/students/todos/:id
    deleteTodo(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const id = parseInt(req.params.id);
                if (!id || isNaN(id)) {
                    this.responseUtils.sendBadRequestResponse(res, "Valid todo ID is required");
                    return;
                }
                const result = yield this.studentService.deleteTodo(id, req.user);
                this.responseUtils.sendSuccessResponse(res, result);
            }
            catch (error) {
                console.error("Error deleting todo:", error);
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    // PUT /api/v1/students/todos/:id/complete
    completeTodo(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const id = parseInt(req.params.id);
                if (!id || isNaN(id)) {
                    this.responseUtils.sendBadRequestResponse(res, "Valid todo ID is required");
                    return;
                }
                const result = yield this.studentService.completeTodo(id, req.user);
                this.responseUtils.sendSuccessResponse(res, result);
            }
            catch (error) {
                console.error("Error completing todo:", error);
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    // ==========================================
    // QUESTION REPORTING SYSTEM
    // ==========================================
    // POST /api/v1/students/questions/:questionId/report - Canonical spec
    createQuestionReport(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                const questionId = parseInt(req.params.questionId);
                const reportSchema = zod_1.z.object({
                    reportType: zod_1.z.enum(["INCORRECT_ANSWER", "TYPO", "UNCLEAR_QUESTION", "MISSING_INFO", "OTHER"]),
                    description: zod_1.z.string().optional()
                });
                if (!questionId || isNaN(questionId)) {
                    this.responseUtils.sendBadRequestResponse(res, "Valid question ID is required");
                    return;
                }
                const validation = reportSchema.safeParse(req.body);
                if (!validation.success) {
                    this.responseUtils.sendValidationError(res, "Validation failed", validation.error.issues);
                    return;
                }
                const { reportType, description } = validation.data;
                const report = yield this.studentService.createQuestionReportCanonical(req.user, questionId, reportType, description);
                res.status(201).json(report);
            }
            catch (error) {
                console.error("Error creating question report:", error);
                if ((_a = error.message) === null || _a === void 0 ? void 0 : _a.includes('not found')) {
                    res.status(404).json({ message: 'Question not found' });
                    return;
                }
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    // GET /api/v1/students/reports
    getUserReports(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const result = yield this.studentService.getUserReports(req.user);
                this.responseUtils.sendSuccessResponse(res, result);
            }
            catch (error) {
                console.error("Error getting user reports:", error);
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    // GET /api/v1/students/reports/:reportId - Canonical spec
    getReportById(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const reportId = parseInt(req.params.reportId);
                if (!reportId || isNaN(reportId)) {
                    this.responseUtils.sendBadRequestResponse(res, "Valid report ID is required");
                    return;
                }
                const report = yield this.studentService.getReportById(reportId, req.user);
                res.status(200).json(report);
            }
            catch (error) {
                console.error("Error getting report details:", error);
                if (error.message === 'Report not found') {
                    res.status(404).json({ message: 'Report not found' });
                    return;
                }
                if (error.message === 'Not owner of report') {
                    res.status(403).json({ message: 'Not owner of report' });
                    return;
                }
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    // ==========================================
    // ENHANCED DASHBOARD FEATURES
    // ==========================================
    // GET /api/v1/students/dashboard/performance - Canonical: flat object
    getDetailedPerformanceAnalytics(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const result = yield this.studentService.getDashboardPerformanceCanonical(req.user);
                res.status(200).json(result);
            }
            catch (error) {
                console.error("Error getting detailed performance analytics:", error);
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    // GET /api/v1/students/dashboard/stats - Canonical: flat object with stats
    getDashboardStats(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const result = yield this.studentService.getDashboardStatsCanonical(req.user);
                res.status(200).json({
                    success: true,
                    data: result
                });
            }
            catch (error) {
                console.error("Error getting dashboard stats:", error);
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    // GET /api/v1/students/analytics/time-based - Canonical: {period, data[]}
    getTimeBasedAnalytics(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { period, startDate, endDate } = req.query;
                if (!period || !['daily', 'weekly', 'monthly'].includes(period)) {
                    this.responseUtils.sendBadRequestResponse(res, "period query parameter is required (daily, weekly, or monthly)");
                    return;
                }
                const result = yield this.studentService.getTimeBasedAnalyticsCanonical(req.user, period, startDate, endDate);
                res.status(200).json(result);
            }
            catch (error) {
                console.error("Error getting time-based analytics:", error);
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    // GET /api/v1/students/courses/:courseId/progress - Canonical: {courseId, courseName, progress, lastAccessedAt}
    getCourseProgress(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const courseId = parseInt(req.params.courseId);
                if (!courseId || isNaN(courseId)) {
                    this.responseUtils.sendBadRequestResponse(res, "Valid Course ID is required");
                    return;
                }
                const result = yield this.studentService.getCourseProgressCanonical(courseId, req.user);
                res.status(200).json(result);
            }
            catch (error) {
                console.error("Error getting course progress:", error);
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    // GET /api/v1/students/session-stats
    getSessionStatistics(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const result = yield this.studentService.getSessionStatistics(req.user);
                this.responseUtils.sendSuccessResponse(res, result.data);
            }
            catch (error) {
                console.error("Error getting session statistics:", error);
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    // ==========================================
    // ACTIVATION CODE VALIDATION
    // ==========================================
    // POST /api/v1/students/codes/validate
    validateActivationCode(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { code } = req.body;
                if (!code || typeof code !== 'string') {
                    this.responseUtils.sendBadRequestResponse(res, "Activation code is required");
                    return;
                }
                const result = yield this.codeRedemptionService.validateActivationCode(code);
                if (result.isValid) {
                    this.responseUtils.sendSuccessResponse(res, {
                        message: result.message,
                        isValid: true,
                        code: result.code,
                        studyPacks: result.studyPacks
                    });
                }
                else {
                    this.responseUtils.sendBadRequestResponse(res, result.message || "Invalid activation code");
                }
            }
            catch (error) {
                console.error("Error validating activation code:", error);
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    // POST /api/v1/students/codes/redeem
    // Canonical spec: { message, subscription: {...} }
    redeemActivationCode(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            try {
                const { code } = req.body;
                const userId = req.user.user_data.id;
                if (!code || typeof code !== 'string') {
                    this.responseUtils.sendBadRequestResponse(res, "Activation code is required");
                    return;
                }
                const result = yield this.codeRedemptionService.redeemActivationCode(code, userId);
                // Format for canonical spec: { message, subscription }
                const canonicalResponse = {
                    message: result.message,
                    subscription: ((_b = (_a = result.data) === null || _a === void 0 ? void 0 : _a.subscriptions) === null || _b === void 0 ? void 0 : _b[0]) ? {
                        id: result.data.subscriptions[0].id,
                        studyPackId: result.data.subscriptions[0].studyPackId,
                        status: result.data.subscriptions[0].status,
                        startDate: result.data.subscriptions[0].startDate,
                        endDate: result.data.subscriptions[0].endDate,
                        studyPack: result.data.subscriptions[0].studyPack ? {
                            id: result.data.subscriptions[0].studyPack.id,
                            name: result.data.subscriptions[0].studyPack.name,
                            type: result.data.subscriptions[0].studyPack.type,
                            yearNumber: result.data.subscriptions[0].studyPack.yearNumber
                        } : undefined
                    } : null
                };
                this.responseUtils.sendSuccessResponse(res, canonicalResponse, 200);
            }
            catch (error) {
                console.error("Error redeeming activation code:", error);
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    // ==========================================
    // CANONICAL SPEC ENDPOINTS - Practice Sessions
    // ==========================================
    /**
     * GET /students/sessions/filters - Canonical spec
     * Returns filter options for sessions by type (PRACTICE/EXAM)
     */
    getSessionsFilters(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const sessionType = req.query.sessionType;
                const yearLevel = req.query.yearLevel;
                if (!sessionType || !['PRACTICE', 'EXAM'].includes(sessionType)) {
                    this.responseUtils.sendBadRequestResponse(res, "sessionType is required and must be PRACTICE or EXAM");
                    return;
                }
                const result = yield this.studentService.getSessionsFilters(req.user, sessionType, yearLevel);
                this.responseUtils.sendSuccessResponse(res, result);
            }
            catch (error) {
                console.error("Error getting sessions filters:", error);
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    /**
     * GET /students/sessions/residency-filters - Canonical spec
     * Returns: { universities: [{id, name, examYears}], parts: ['PART_1', 'PART_2'], totalQuestions }
     */
    getResidencyFilters(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const result = yield this.studentService.getResidencyFiltersCanonical(req.user);
                this.responseUtils.sendSuccessResponse(res, result);
            }
            catch (error) {
                console.error("Error getting residency filters:", error);
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    /**
     * GET /students/practise-sessions - Canonical spec
     * Returns practice sessions with pagination and optional filtering
     */
    getPractiseSessions(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const sessionType = req.query.sessionType;
                if (!sessionType || !['PRACTICE', 'EXAM'].includes(sessionType)) {
                    this.responseUtils.sendBadRequestResponse(res, "sessionType is required and must be PRACTICE or EXAM");
                    return;
                }
                const moduleId = req.query.moduleId ? parseInt(req.query.moduleId) : undefined;
                const uniteId = req.query.uniteId ? parseInt(req.query.uniteId) : undefined;
                const page = req.query.page ? parseInt(req.query.page) : 1;
                const limit = req.query.limit ? parseInt(req.query.limit) : 10;
                // Validation: moduleId and uniteId are mutually exclusive
                if (moduleId && uniteId) {
                    this.responseUtils.sendBadRequestResponse(res, "Cannot specify both moduleId and uniteId");
                    return;
                }
                const result = yield this.studentService.getPractiseSessions(req.user, sessionType, { moduleId, uniteId, page, limit });
                this.responseUtils.sendSuccessResponse(res, result);
            }
            catch (error) {
                console.error("Error getting practise sessions:", error);
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    // ==========================================
    // CANONICAL SPEC ENDPOINTS - Course Layers & Cards
    // ==========================================
    /**
     * POST /students/course-layers - Canonical spec
     * Upsert course layer completion status
     */
    upsertCourseLayer(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                const layerSchema = zod_1.z.object({
                    courseId: zod_1.z.number().int().positive("courseId must be a positive integer"),
                    layerNumber: zod_1.z.number().int().min(1).max(3, "layerNumber must be between 1 and 3"),
                    completed: zod_1.z.boolean()
                });
                const validation = layerSchema.safeParse(req.body);
                if (!validation.success) {
                    this.responseUtils.sendValidationError(res, "Validation failed", validation.error.issues);
                    return;
                }
                const { courseId, layerNumber, completed } = validation.data;
                const result = yield this.studentService.upsertCourseLayerCanonical(req.user, courseId, layerNumber, completed);
                res.status(200).json(result);
            }
            catch (error) {
                console.error("Error upserting course layer:", error);
                if ((_a = error.message) === null || _a === void 0 ? void 0 : _a.includes('not found')) {
                    res.status(404).json({ message: 'Course not found' });
                    return;
                }
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    /**
     * GET /students/courses/:courseId/layers - Canonical spec
     * Get all layer completion statuses for a course
     */
    getCourseLayersCanonical(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                const courseId = parseInt(req.params.courseId);
                if (!courseId || isNaN(courseId)) {
                    this.responseUtils.sendBadRequestResponse(res, "Valid course ID is required");
                    return;
                }
                const result = yield this.studentService.getCourseLayersCanonical(req.user, courseId);
                res.status(200).json(result);
            }
            catch (error) {
                console.error("Error getting course layers:", error);
                if ((_a = error.message) === null || _a === void 0 ? void 0 : _a.includes('not found')) {
                    res.status(404).json({ message: 'Course not found' });
                    return;
                }
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    /**
     * POST /students/cards - Canonical spec
     * Create a study card with optional courses
     */
    createCard(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const cardSchema = zod_1.z.object({
                    title: zod_1.z.string().min(1, "Title is required").max(100, "Title too long"),
                    description: zod_1.z.string().max(500, "Description too long").optional(),
                    courseIds: zod_1.z.array(zod_1.z.number().int().positive()).optional()
                });
                const validation = cardSchema.safeParse(req.body);
                if (!validation.success) {
                    this.responseUtils.sendValidationError(res, "Validation failed", validation.error.issues);
                    return;
                }
                const { title, description, courseIds } = validation.data;
                const result = yield this.studentService.createCardCanonical(req.user, title, description, courseIds);
                res.status(201).json(result);
            }
            catch (error) {
                console.error("Error creating card:", error);
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    /**
     * GET /students/cards - Canonical spec
     * Get all cards for the authenticated user
     */
    getAllCards(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const result = yield this.studentService.getAllCardsCanonical(req.user);
                res.status(200).json(result);
            }
            catch (error) {
                console.error("Error getting all cards:", error);
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    /**
     * GET /students/cards/filter-by-unit-module - Canonical spec
     * Get cards filtered by uniteId or moduleId
     */
    getCardsByUnitModule(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                const uniteId = req.query.uniteId ? parseInt(req.query.uniteId) : undefined;
                const moduleId = req.query.moduleId ? parseInt(req.query.moduleId) : undefined;
                // Validation: exactly one of uniteId or moduleId must be provided
                if ((!uniteId && !moduleId) || (uniteId && moduleId)) {
                    res.status(400).json({ message: 'Either uniteId or moduleId must be provided (not both)' });
                    return;
                }
                const result = yield this.studentService.getCardsByUnitModuleCanonical(req.user, uniteId, moduleId);
                res.status(200).json(result);
            }
            catch (error) {
                console.error("Error getting cards by unit/module:", error);
                if ((_a = error.message) === null || _a === void 0 ? void 0 : _a.includes('not found')) {
                    res.status(404).json({ message: error.message });
                    return;
                }
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    /**
     * GET /students/cards/:cardId - Canonical spec
     * Get card by ID with full course details
     */
    getCardById(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            try {
                const cardId = parseInt(req.params.cardId);
                if (!cardId || isNaN(cardId)) {
                    this.responseUtils.sendBadRequestResponse(res, "Valid card ID is required");
                    return;
                }
                const result = yield this.studentService.getCardByIdCanonical(req.user, cardId);
                if (!result) {
                    res.status(404).json({ message: 'Card not found' });
                    return;
                }
                res.status(200).json(result);
            }
            catch (error) {
                console.error("Error getting card by ID:", error);
                if (((_a = error.message) === null || _a === void 0 ? void 0 : _a.includes('not found')) || ((_b = error.message) === null || _b === void 0 ? void 0 : _b.includes('permission'))) {
                    res.status(404).json({ message: 'Card not found' });
                    return;
                }
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    /**
     * PUT /students/cards/:cardId - Canonical spec
     * Update card title and/or description
     */
    updateCard(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            try {
                const cardId = parseInt(req.params.cardId);
                const cardSchema = zod_1.z.object({
                    title: zod_1.z.string().min(1).max(100).optional(),
                    description: zod_1.z.string().max(500).optional()
                });
                if (!cardId || isNaN(cardId)) {
                    this.responseUtils.sendBadRequestResponse(res, "Valid card ID is required");
                    return;
                }
                const validation = cardSchema.safeParse(req.body);
                if (!validation.success) {
                    this.responseUtils.sendValidationError(res, "Validation failed", validation.error.issues);
                    return;
                }
                const result = yield this.studentService.updateCardCanonical(req.user, cardId, validation.data);
                if (!result) {
                    res.status(404).json({ message: 'Card not found' });
                    return;
                }
                res.status(200).json(result);
            }
            catch (error) {
                console.error("Error updating card:", error);
                if (((_a = error.message) === null || _a === void 0 ? void 0 : _a.includes('not found')) || ((_b = error.message) === null || _b === void 0 ? void 0 : _b.includes('permission'))) {
                    res.status(404).json({ message: 'Card not found' });
                    return;
                }
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    /**
     * DELETE /students/cards/:cardId - Canonical spec
     * Delete a card
     */
    deleteCard(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            try {
                const cardId = parseInt(req.params.cardId);
                if (!cardId || isNaN(cardId)) {
                    this.responseUtils.sendBadRequestResponse(res, "Valid card ID is required");
                    return;
                }
                const deleted = yield this.studentService.deleteCardCanonical(req.user, cardId);
                if (!deleted) {
                    res.status(404).json({ message: 'Card not found' });
                    return;
                }
                res.status(200).json({ message: 'Card deleted successfully' });
            }
            catch (error) {
                console.error("Error deleting card:", error);
                if (((_a = error.message) === null || _a === void 0 ? void 0 : _a.includes('not found')) || ((_b = error.message) === null || _b === void 0 ? void 0 : _b.includes('permission'))) {
                    res.status(404).json({ message: 'Card not found' });
                    return;
                }
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    /**
     * POST /students/cards/:cardId/courses/:courseId - Canonical spec
     * Add a course to a card
     */
    addCourseToCard(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                const cardId = parseInt(req.params.cardId);
                const courseId = parseInt(req.params.courseId);
                if (!cardId || isNaN(cardId)) {
                    this.responseUtils.sendBadRequestResponse(res, "Valid card ID is required");
                    return;
                }
                if (!courseId || isNaN(courseId)) {
                    this.responseUtils.sendBadRequestResponse(res, "Valid course ID is required");
                    return;
                }
                const result = yield this.studentService.addCourseToCardCanonical(req.user, cardId, courseId);
                if (!result.success) {
                    if (result.alreadyExists) {
                        res.status(400).json({ message: 'Course already in card' });
                    }
                    else {
                        res.status(404).json({ message: 'Card not found' });
                    }
                    return;
                }
                res.status(200).json({ message: 'Course added to card successfully' });
            }
            catch (error) {
                console.error("Error adding course to card:", error);
                if ((_a = error.message) === null || _a === void 0 ? void 0 : _a.includes('not found')) {
                    res.status(404).json({ message: error.message });
                    return;
                }
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    /**
     * DELETE /students/cards/:cardId/courses/:courseId - Canonical spec
     * Remove a course from a card
     */
    removeCourseFromCard(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            try {
                const cardId = parseInt(req.params.cardId);
                const courseId = parseInt(req.params.courseId);
                if (!cardId || isNaN(cardId)) {
                    this.responseUtils.sendBadRequestResponse(res, "Valid card ID is required");
                    return;
                }
                if (!courseId || isNaN(courseId)) {
                    this.responseUtils.sendBadRequestResponse(res, "Valid course ID is required");
                    return;
                }
                const deleted = yield this.studentService.removeCourseFromCardCanonical(req.user, cardId, courseId);
                if (!deleted) {
                    res.status(404).json({ message: 'Card, course, or association not found' });
                    return;
                }
                res.status(200).json({ message: 'Course removed from card successfully' });
            }
            catch (error) {
                console.error("Error removing course from card:", error);
                if (((_a = error.message) === null || _a === void 0 ? void 0 : _a.includes('not found')) || ((_b = error.message) === null || _b === void 0 ? void 0 : _b.includes('permission'))) {
                    res.status(404).json({ message: 'Card or course not found' });
                    return;
                }
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    /**
     * GET /students/cards/:cardId/progress - Canonical spec
     * Get progress for all courses in a card based on layer completion
     */
    getCardProgress(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            try {
                const cardId = parseInt(req.params.cardId);
                if (!cardId || isNaN(cardId)) {
                    this.responseUtils.sendBadRequestResponse(res, "Valid card ID is required");
                    return;
                }
                const result = yield this.studentService.getCardProgressCanonical(req.user, cardId);
                if (!result) {
                    res.status(404).json({ message: 'Card not found' });
                    return;
                }
                res.status(200).json(result);
            }
            catch (error) {
                console.error("Error getting card progress:", error);
                if (((_a = error.message) === null || _a === void 0 ? void 0 : _a.includes('not found')) || ((_b = error.message) === null || _b === void 0 ? void 0 : _b.includes('permission'))) {
                    res.status(404).json({ message: 'Card not found' });
                    return;
                }
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
};
StudentController = __decorate([
    (0, tsyringe_1.injectable)(),
    __param(0, (0, tsyringe_1.inject)(student_service_1.default)),
    __param(1, (0, tsyringe_1.inject)(response_utils_1.default)),
    __param(2, (0, tsyringe_1.inject)(code_redemption_service_1.CodeRedemptionService)),
    __metadata("design:paramtypes", [student_service_1.default,
        response_utils_1.default,
        code_redemption_service_1.CodeRedemptionService])
], StudentController);
exports.default = StudentController;
