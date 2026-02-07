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
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const tsyringe_1 = require("tsyringe");
const admin_service_1 = __importDefault(require("./admin.service"));
const response_utils_1 = __importDefault(require("../../core/utils/response.utils"));
const activation_code_service_1 = require("./services/activation-code.service");
let AdminController = class AdminController {
    constructor(adminService, responseUtils, activationCodeService) {
        this.adminService = adminService;
        this.responseUtils = responseUtils;
        this.activationCodeService = activationCodeService;
    }
    // ==========================================
    // DASHBOARD & ANALYTICS
    // ==========================================
    getDashboardStats(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const stats = yield this.adminService.getDashboardStats();
                this.responseUtils.sendSuccessResponse(res, stats);
            }
            catch (error) {
                next(error);
            }
        });
    }
    getUserAnalytics(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { timeframe } = req.query;
                const analytics = yield this.adminService.getUserAnalytics(timeframe);
                this.responseUtils.sendSuccessResponse(res, analytics);
            }
            catch (error) {
                next(error);
            }
        });
    }
    // ==========================================
    // USER MANAGEMENT
    // ==========================================
    getAllUsers(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Use validated pagination parameters from middleware
                const filters = {
                    page: req.query.page, // Already validated and converted by middleware
                    limit: req.query.limit, // Already validated and converted by middleware
                    role: req.query.role,
                    universityId: req.query.universityId ? parseInt(req.query.universityId) : undefined,
                    specialtyId: req.query.specialtyId ? parseInt(req.query.specialtyId) : undefined,
                    currentYear: req.query.currentYear,
                    isActive: req.query.isActive ? req.query.isActive === 'true' : undefined,
                    search: req.query.search
                };
                const result = yield this.adminService.getAllUsers(filters);
                this.responseUtils.sendSuccessResponse(res, result);
            }
            catch (error) {
                next(error);
            }
        });
    }
    getUserById(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const userId = parseInt(req.params.id);
                const user = yield this.adminService.getUserById(userId);
                this.responseUtils.sendSuccessResponse(res, user);
            }
            catch (error) {
                next(error);
            }
        });
    }
    createUser(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const createdById = req.user.user_data.id;
                const user = yield this.adminService.createUser(req.body, createdById);
                // Canonical: Return user object directly with 201 (no message wrapper)
                const { passwordHash } = user, userWithoutPassword = __rest(user, ["passwordHash"]);
                res.status(201).json({
                    id: userWithoutPassword.id,
                    email: userWithoutPassword.email,
                    fullName: userWithoutPassword.fullName,
                    role: userWithoutPassword.role,
                    universityId: userWithoutPassword.universityId,
                    specialtyId: userWithoutPassword.specialtyId,
                    currentYear: userWithoutPassword.currentYear,
                    isActive: userWithoutPassword.isActive,
                    createdAt: userWithoutPassword.createdAt
                });
            }
            catch (error) {
                next(error);
            }
        });
    }
    updateUser(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const userId = parseInt(req.params.id);
                const updatedById = req.user.user_data.id;
                const user = yield this.adminService.updateUser(userId, req.body, updatedById);
                // Canonical: Return user object directly with updatedAt (no message wrapper)
                const { passwordHash } = user, userWithoutPassword = __rest(user, ["passwordHash"]);
                res.status(200).json({
                    id: userWithoutPassword.id,
                    email: userWithoutPassword.email,
                    fullName: userWithoutPassword.fullName,
                    role: userWithoutPassword.role,
                    universityId: userWithoutPassword.universityId,
                    specialtyId: userWithoutPassword.specialtyId,
                    currentYear: userWithoutPassword.currentYear,
                    isActive: userWithoutPassword.isActive,
                    createdAt: userWithoutPassword.createdAt,
                    updatedAt: userWithoutPassword.updatedAt
                });
            }
            catch (error) {
                next(error);
            }
        });
    }
    deactivateUser(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const userId = parseInt(req.params.id);
                const deactivatedById = req.user.user_data.id;
                yield this.adminService.deactivateUser(userId, deactivatedById);
                // Canonical: "User deleted successfully" message
                res.status(200).json({
                    message: "User deleted successfully"
                });
            }
            catch (error) {
                next(error);
            }
        });
    }
    resetUserPassword(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const userId = parseInt(req.params.id);
                const { newPassword } = req.body;
                const resetById = req.user.user_data.id;
                yield this.adminService.resetUserPassword(userId, newPassword, resetById);
                this.responseUtils.sendSuccessResponse(res, {
                    message: "Password reset successfully"
                });
            }
            catch (error) {
                next(error);
            }
        });
    }
    // ==========================================
    // STUDY PACK MANAGEMENT
    // ==========================================
    getAllStudyPacks(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Use validated pagination parameters from middleware
                const page = req.query.page;
                const limit = req.query.limit;
                const result = yield this.adminService.getAllStudyPacksCanonical(page, limit);
                // Canonical: Return {items, total, page, limit, totalPages}
                res.status(200).json(result);
            }
            catch (error) {
                next(error);
            }
        });
    }
    createStudyPack(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const createdById = req.user.user_data.id;
                const studyPack = yield this.adminService.createStudyPackCanonical(req.body, createdById);
                // Canonical: Return flat object directly with 201 status
                res.status(201).json(studyPack);
            }
            catch (error) {
                next(error);
            }
        });
    }
    updateStudyPack(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const id = parseInt(req.params.studyPackId);
                const updatedById = req.user.user_data.id;
                const studyPack = yield this.adminService.updateStudyPackCanonical(id, req.body, updatedById);
                // Canonical: Return flat object directly with updatedAt
                res.status(200).json(studyPack);
            }
            catch (error) {
                next(error);
            }
        });
    }
    deleteStudyPack(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const id = parseInt(req.params.studyPackId);
                const deletedById = req.user.user_data.id;
                yield this.adminService.deleteStudyPack(id, deletedById);
                // Canonical: Return {message}
                res.status(200).json({
                    message: "Study pack deleted successfully"
                });
            }
            catch (error) {
                next(error);
            }
        });
    }
    // ==========================================
    // COURSE STRUCTURE MANAGEMENT
    // ==========================================
    createUnite(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const createdById = req.user.user_data.id;
                const unite = yield this.adminService.createUniteCanonical(req.body, createdById);
                // Canonical: Return flat object directly with 201 status
                res.status(201).json(unite);
            }
            catch (error) {
                next(error);
            }
        });
    }
    createModule(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const createdById = req.user.user_data.id;
                const module = yield this.adminService.createModuleCanonical(req.body, createdById);
                // Canonical: Return flat object directly with 201 status
                res.status(201).json(module);
            }
            catch (error) {
                next(error);
            }
        });
    }
    createCourse(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const createdById = req.user.user_data.id;
                const course = yield this.adminService.createCourseCanonical(req.body, createdById);
                // Canonical: Return flat object directly with 201 status
                res.status(201).json(course);
            }
            catch (error) {
                next(error);
            }
        });
    }
    createCourseResource(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const createdById = req.user.user_data.id;
                const resource = yield this.adminService.createCourseResource(req.body, createdById);
                this.responseUtils.sendSuccessResponse(res, {
                    message: "Resource created successfully",
                    resource
                }, 201);
            }
            catch (error) {
                next(error);
            }
        });
    }
    /**
     * GET /admin/content/filters
     * Returns hierarchical content structure for admin filtering
     * Optional filters: isResidency, yearLevel
     */
    getAdminContentFilters(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const filters = {
                    isResidency: req.query.isResidency === 'true' ? true : req.query.isResidency === 'false' ? false : undefined,
                    yearLevel: req.query.yearLevel
                };
                const result = yield this.adminService.getAdminContentFilters(filters);
                res.status(200).json(result);
            }
            catch (error) {
                next(error);
            }
        });
    }
    // ==========================================
    // UPDATE OPERATIONS
    // ==========================================
    updateUnite(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const id = parseInt(req.params.unitId);
                if (isNaN(id)) {
                    this.responseUtils.sendBadRequestResponse(res, "Valid unite ID is required");
                    return;
                }
                const updatedUnite = yield this.adminService.updateUniteCanonical(id, req.body);
                // Canonical: Return flat object directly with updatedAt
                res.status(200).json(updatedUnite);
            }
            catch (error) {
                next(error);
            }
        });
    }
    updateModule(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const id = parseInt(req.params.moduleId);
                if (isNaN(id)) {
                    this.responseUtils.sendBadRequestResponse(res, "Valid module ID is required");
                    return;
                }
                const updatedModule = yield this.adminService.updateModuleCanonical(id, req.body);
                // Canonical: Return flat object directly with updatedAt
                res.status(200).json(updatedModule);
            }
            catch (error) {
                next(error);
            }
        });
    }
    updateCourse(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const id = parseInt(req.params.courseId);
                if (isNaN(id)) {
                    this.responseUtils.sendBadRequestResponse(res, "Valid course ID is required");
                    return;
                }
                const updatedCourse = yield this.adminService.updateCourseCanonical(id, req.body);
                // Canonical: Return flat object directly with updatedAt
                res.status(200).json(updatedCourse);
            }
            catch (error) {
                next(error);
            }
        });
    }
    updateCourseResource(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const id = parseInt(req.params.resourceId);
                if (isNaN(id)) {
                    this.responseUtils.sendBadRequestResponse(res, "Valid course resource ID is required");
                    return;
                }
                const updatedResource = yield this.adminService.updateCourseResource(id, req.body);
                // Canonical: return flat resource object (no message wrapper)
                res.json(updatedResource);
            }
            catch (error) {
                next(error);
            }
        });
    }
    // ==========================================
    // DELETE OPERATIONS
    // ==========================================
    deleteUnite(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const id = parseInt(req.params.unitId);
                if (isNaN(id)) {
                    this.responseUtils.sendBadRequestResponse(res, "Valid unite ID is required");
                    return;
                }
                const result = yield this.adminService.deleteUnite(id);
                // Canonical: Return {message}
                res.status(200).json(result);
            }
            catch (error) {
                next(error);
            }
        });
    }
    deleteModule(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const id = parseInt(req.params.moduleId);
                if (isNaN(id)) {
                    this.responseUtils.sendBadRequestResponse(res, "Valid module ID is required");
                    return;
                }
                const result = yield this.adminService.deleteModule(id);
                // Canonical: Return {message}
                res.status(200).json(result);
            }
            catch (error) {
                next(error);
            }
        });
    }
    deleteCourse(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const id = parseInt(req.params.courseId);
                if (isNaN(id)) {
                    this.responseUtils.sendBadRequestResponse(res, "Valid course ID is required");
                    return;
                }
                const result = yield this.adminService.deleteCourse(id);
                // Canonical: Return {message}
                res.status(200).json(result);
            }
            catch (error) {
                next(error);
            }
        });
    }
    deleteCourseResource(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const id = parseInt(req.params.resourceId);
                if (isNaN(id)) {
                    this.responseUtils.sendBadRequestResponse(res, "Valid course resource ID is required");
                    return;
                }
                const result = yield this.adminService.deleteCourseResource(id);
                this.responseUtils.sendSuccessResponse(res, result);
            }
            catch (error) {
                next(error);
            }
        });
    }
    // ==========================================
    // QUIZ MANAGEMENT
    // ==========================================
    getAllQuizzes(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Use validated pagination parameters from middleware
                const page = req.query.page;
                const limit = req.query.limit;
                const result = yield this.adminService.getAllQuizzes(page, limit);
                this.responseUtils.sendSuccessResponse(res, result);
            }
            catch (error) {
                next(error);
            }
        });
    }
    createQuizWithQuestions(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const createdById = req.user.user_data.id;
                const quiz = yield this.adminService.createQuizWithQuestions(req.body, createdById);
                this.responseUtils.sendSuccessResponse(res, {
                    message: "Quiz created successfully with questions",
                    quiz
                }, 201);
            }
            catch (error) {
                next(error);
            }
        });
    }
    updateQuiz(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const id = parseInt(req.params.id);
                const updatedById = req.user.user_data.id;
                const quiz = yield this.adminService.updateQuiz(id, req.body, updatedById);
                this.responseUtils.sendSuccessResponse(res, {
                    message: "Quiz updated successfully",
                    quiz
                });
            }
            catch (error) {
                next(error);
            }
        });
    }
    deleteQuiz(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const id = parseInt(req.params.id);
                const deletedById = req.user.user_data.id;
                yield this.adminService.deleteQuiz(id, deletedById);
                this.responseUtils.sendSuccessResponse(res, {
                    message: "Quiz deleted successfully"
                });
            }
            catch (error) {
                next(error);
            }
        });
    }
    // ==========================================
    // EXAM MANAGEMENT
    // ==========================================
    getAllExams(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Use validated pagination parameters from middleware
                const page = req.query.page;
                const limit = req.query.limit;
                const result = yield this.adminService.getAllExams(page, limit);
                this.responseUtils.sendSuccessResponse(res, result);
            }
            catch (error) {
                next(error);
            }
        });
    }
    createExamWithQuestions(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const createdById = req.user.user_data.id;
                const exam = yield this.adminService.createExamWithQuestions(req.body, createdById);
                this.responseUtils.sendSuccessResponse(res, {
                    message: "Exam created successfully with questions",
                    exam
                }, 201);
            }
            catch (error) {
                next(error);
            }
        });
    }
    // ==========================================
    // QUESTION MANAGEMENT
    // ==========================================
    getAllQuestions(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Use validated pagination parameters from middleware
                const page = req.query.page;
                const limit = req.query.limit;
                // Extract filters from query params
                const filters = {
                    courseId: req.query.courseId ? parseInt(req.query.courseId) : undefined,
                    moduleId: req.query.moduleId ? parseInt(req.query.moduleId) : undefined,
                    questionType: req.query.questionType,
                    yearLevel: req.query.yearLevel,
                    examYear: req.query.examYear ? parseInt(req.query.examYear) : undefined,
                    sourceId: req.query.sourceId ? parseInt(req.query.sourceId) : undefined,
                    search: req.query.search
                };
                const result = yield this.adminService.getAllQuestions(page, limit, filters);
                this.responseUtils.sendSuccessResponse(res, result);
            }
            catch (error) {
                next(error);
            }
        });
    }
    getQuestionReports(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const page = parseInt(req.query.page) || 1;
                const limit = parseInt(req.query.limit) || 10;
                // Extract all canonical filters
                const filters = {
                    status: req.query.status,
                    reportType: req.query.reportType,
                    questionId: req.query.questionId ? parseInt(req.query.questionId) : undefined,
                    userId: req.query.userId ? parseInt(req.query.userId) : undefined,
                    search: req.query.search
                };
                const result = yield this.adminService.getQuestionReportsCanonical(page, limit, filters);
                // Canonical: Return items with pagination directly
                res.status(200).json(result);
            }
            catch (error) {
                next(error);
            }
        });
    }
    reviewQuestionReport(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const reportId = parseInt(req.params.id);
                const reviewerId = req.user.user_data.id;
                const { status, adminNotes } = req.body;
                const report = yield this.adminService.reviewQuestionReportCanonical(reportId, reviewerId, { status, adminNotes });
                // Canonical: Return report object directly (no message wrapper)
                res.status(200).json(report);
            }
            catch (error) {
                next(error);
            }
        });
    }
    // ==========================================
    // SUBSCRIPTION MANAGEMENT
    // ==========================================
    getAllSubscriptions(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const filters = {
                    // Use validated pagination parameters from middleware
                    page: req.query.page,
                    limit: req.query.limit,
                    status: req.query.status,
                    userId: req.query.userId ? parseInt(req.query.userId) : undefined,
                    studyPackId: req.query.studyPackId ? parseInt(req.query.studyPackId) : undefined,
                };
                const result = yield this.adminService.getAllSubscriptions(filters);
                this.responseUtils.sendSuccessResponse(res, result);
            }
            catch (error) {
                next(error);
            }
        });
    }
    updateSubscription(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const id = parseInt(req.params.id);
                const updatedById = req.user.user_data.id;
                const { status, endDate } = req.body;
                // Use canonical service method
                const subscription = yield this.adminService.updateSubscriptionCanonical(id, { status, endDate }, updatedById);
                // Canonical: Return subscription object directly (no message wrapper)
                res.status(200).json(subscription);
            }
            catch (error) {
                next(error);
            }
        });
    }
    getSubscriptionStats(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const stats = yield this.adminService.getSubscriptionStats();
                this.responseUtils.sendSuccessResponse(res, stats);
            }
            catch (error) {
                next(error);
            }
        });
    }
    // ==========================================
    // MONTHLY SUBSCRIPTION MANAGEMENT
    // ==========================================
    cancelSubscription(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const id = parseInt(req.params.id);
                const { reason } = req.body;
                const cancelledById = req.user.user_data.id;
                // Use canonical service method
                const result = yield this.adminService.cancelSubscriptionCanonical(id, reason, cancelledById);
                // Canonical: Return {id, status, cancellationDate, cancellationReason}
                res.status(200).json(result);
            }
            catch (error) {
                next(error);
            }
        });
    }
    addMonthsToSubscription(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const id = parseInt(req.params.id);
                const { months, reason } = req.body;
                const updatedById = req.user.user_data.id;
                // Use canonical service method
                const subscription = yield this.adminService.addMonthsToSubscriptionCanonical(id, months, reason, updatedById);
                // Canonical: Return subscription object directly (no message wrapper)
                res.status(200).json(subscription);
            }
            catch (error) {
                next(error);
            }
        });
    }
    activateSubscription(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const id = parseInt(req.params.id);
                const { startDate, endDate, reason } = req.body;
                const activatedById = req.user.user_data.id;
                const subscription = yield this.adminService.activateSubscription(id, startDate, endDate, reason, activatedById);
                this.responseUtils.sendSuccessResponse(res, {
                    message: "Subscription activated successfully",
                    subscription
                });
            }
            catch (error) {
                next(error);
            }
        });
    }
    // ==========================================
    // UNIVERSITY & SPECIALTY MANAGEMENT (Canonical spec)
    // ==========================================
    /**
     * GET /admin/universities
     * Paginated list with optional filters (search, country)
     * Returns: {items, total, page, limit, totalPages}
     */
    getAllUniversities(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const filters = {
                    page: req.query.page ? parseInt(req.query.page) : 1,
                    limit: req.query.limit ? parseInt(req.query.limit) : 10,
                    search: req.query.search,
                    country: req.query.country
                };
                const result = yield this.adminService.getAllUniversitiesCanonical(filters);
                res.status(200).json(result);
            }
            catch (error) {
                next(error);
            }
        });
    }
    /**
     * POST /admin/universities
     * Create university - returns flat object directly with 201
     */
    createUniversity(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const createdById = req.user.user_data.id;
                const university = yield this.adminService.createUniversityCanonical(req.body, createdById);
                // Canonical: Return flat object directly with 201 status
                res.status(201).json(university);
            }
            catch (error) {
                next(error);
            }
        });
    }
    /**
     * PUT /admin/universities/:universityId
     * Update university - returns flat object with updatedAt
     */
    updateUniversity(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const id = parseInt(req.params.universityId);
                if (isNaN(id)) {
                    this.responseUtils.sendBadRequestResponse(res, "Valid university ID is required");
                    return;
                }
                const updatedById = req.user.user_data.id;
                const university = yield this.adminService.updateUniversity(id, req.body, updatedById);
                // Canonical: Return flat object directly
                res.status(200).json(university);
            }
            catch (error) {
                next(error);
            }
        });
    }
    /**
     * DELETE /admin/universities/:universityId
     * Delete university - returns {message}
     */
    deleteUniversity(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const id = parseInt(req.params.universityId);
                if (isNaN(id)) {
                    this.responseUtils.sendBadRequestResponse(res, "Valid university ID is required");
                    return;
                }
                const deletedById = req.user.user_data.id;
                const result = yield this.adminService.deleteUniversity(id, deletedById);
                // Canonical: Return {message}
                res.status(200).json(result);
            }
            catch (error) {
                next(error);
            }
        });
    }
    /**
     * GET /admin/specialties
     * Paginated list with optional search filter
     * Returns: {items, total, page, limit, totalPages}
     */
    getAllSpecialties(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const filters = {
                    page: req.query.page ? parseInt(req.query.page) : 1,
                    limit: req.query.limit ? parseInt(req.query.limit) : 10,
                    search: req.query.search
                };
                const result = yield this.adminService.getAllSpecialtiesCanonical(filters);
                res.status(200).json(result);
            }
            catch (error) {
                next(error);
            }
        });
    }
    /**
     * POST /admin/specialties
     * Create specialty - returns flat object directly with 201
     */
    createSpecialty(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const createdById = req.user.user_data.id;
                const specialty = yield this.adminService.createSpecialtyCanonical(req.body, createdById);
                // Canonical: Return flat object directly with 201 status
                res.status(201).json(specialty);
            }
            catch (error) {
                next(error);
            }
        });
    }
    /**
     * PUT /admin/specialties/:specialtyId
     * Update specialty - returns flat object with updatedAt
     */
    updateSpecialty(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const id = parseInt(req.params.specialtyId);
                if (isNaN(id)) {
                    this.responseUtils.sendBadRequestResponse(res, "Valid specialty ID is required");
                    return;
                }
                const updatedById = req.user.user_data.id;
                const specialty = yield this.adminService.updateSpecialty(id, req.body, updatedById);
                // Canonical: Return flat object directly
                res.status(200).json(specialty);
            }
            catch (error) {
                next(error);
            }
        });
    }
    /**
     * DELETE /admin/specialties/:specialtyId
     * Delete specialty - returns {message}
     */
    deleteSpecialty(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const id = parseInt(req.params.specialtyId);
                if (isNaN(id)) {
                    this.responseUtils.sendBadRequestResponse(res, "Valid specialty ID is required");
                    return;
                }
                const deletedById = req.user.user_data.id;
                const result = yield this.adminService.deleteSpecialty(id, deletedById);
                // Canonical: Return {message}
                res.status(200).json(result);
            }
            catch (error) {
                next(error);
            }
        });
    }
    // ==========================================
    // QUESTION SOURCE MANAGEMENT
    // ==========================================
    getAllQuestionSources(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Use validated pagination parameters from middleware
                const page = req.query.page;
                const limit = req.query.limit;
                const search = req.query.search;
                const result = yield this.adminService.getAllQuestionSources(page, limit, search);
                this.responseUtils.sendSuccessResponse(res, result);
            }
            catch (error) {
                next(error);
            }
        });
    }
    createQuestionSource(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const createdById = req.user.user_data.id;
                const questionSource = yield this.adminService.createQuestionSource(req.body.name, createdById);
                // Return canonical format - source object directly at root level
                this.responseUtils.sendSuccessResponse(res, {
                    id: questionSource.id,
                    name: questionSource.name,
                    createdAt: questionSource.createdAt
                }, 201);
            }
            catch (error) {
                next(error);
            }
        });
    }
    getQuestionSourceById(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const id = parseInt(req.params.id);
                const questionSource = yield this.adminService.getQuestionSourceById(id);
                // Service already returns canonical format
                this.responseUtils.sendSuccessResponse(res, questionSource);
            }
            catch (error) {
                next(error);
            }
        });
    }
    updateQuestionSource(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const id = parseInt(req.params.id);
                const updatedById = req.user.user_data.id;
                const questionSource = yield this.adminService.updateQuestionSource(id, req.body.name, updatedById);
                // Return canonical format - source object directly at root level
                this.responseUtils.sendSuccessResponse(res, {
                    id: questionSource.id,
                    name: questionSource.name,
                    createdAt: questionSource.createdAt,
                    updatedAt: questionSource.updatedAt
                });
            }
            catch (error) {
                next(error);
            }
        });
    }
    deleteQuestionSource(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const id = parseInt(req.params.id);
                const deletedById = req.user.user_data.id;
                yield this.adminService.deleteQuestionSource(id, deletedById);
                this.responseUtils.sendSuccessResponse(res, {
                    message: "Question source deleted successfully"
                });
            }
            catch (error) {
                next(error);
            }
        });
    }
    // ==========================================
    // ACTIVATION CODE MANAGEMENT (Canonical spec)
    // ==========================================
    /**
     * POST /admin/activation-codes
     * Create a new activation code
     * Supports: auto-generated code, multiple study packs, both duration types
     */
    createActivationCode(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { code, description, studyPackId, studyPackIds, expiryDate, expiresAt, maxUses, durationType, durationMonths, durationDays, isActive } = req.body;
                const createdById = req.user.user_data.id;
                const activationCode = yield this.activationCodeService.createActivationCode({
                    code,
                    description,
                    studyPackId,
                    studyPackIds,
                    expiryDate,
                    expiresAt,
                    maxUses,
                    durationType,
                    durationMonths,
                    durationDays,
                    isActive
                }, createdById);
                // Canonical: Return created object directly with 201 status
                res.status(201).json(activationCode);
            }
            catch (error) {
                next(error);
            }
        });
    }
    /**
     * GET /admin/activation-codes
     * Get all activation codes with filtering and pagination
     */
    getAllActivationCodes(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { page, limit, isActive, search, studyPackId, expiryDate } = req.query;
                const filters = {
                    isActive: isActive !== undefined ? isActive === 'true' : undefined,
                    search: search,
                    studyPackId: studyPackId ? parseInt(studyPackId) : undefined,
                    expiryDate: expiryDate
                };
                const result = yield this.activationCodeService.getAllActivationCodes(filters, parseInt(page) || 1, parseInt(limit) || 10);
                // Canonical: Return { items, total, page, limit, totalPages }
                res.status(200).json(result);
            }
            catch (error) {
                next(error);
            }
        });
    }
    /**
     * GET /admin/activation-codes/:id
     * Get activation code by ID with usage history
     */
    getActivationCodeById(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const id = parseInt(req.params.id);
                if (isNaN(id)) {
                    this.responseUtils.sendBadRequestResponse(res, "Invalid activation code ID");
                    return;
                }
                const activationCode = yield this.activationCodeService.getActivationCodeById(id);
                // Canonical: Return activation code object directly
                res.status(200).json(activationCode);
            }
            catch (error) {
                next(error);
            }
        });
    }
    /**
     * PUT /admin/activation-codes/:id
     * Update activation code
     */
    updateActivationCode(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const id = parseInt(req.params.id);
                if (isNaN(id)) {
                    this.responseUtils.sendBadRequestResponse(res, "Invalid activation code ID");
                    return;
                }
                const { code, studyPackId, expiryDate, maxUses, durationMonths, isActive } = req.body;
                const activationCode = yield this.activationCodeService.updateActivationCode(id, {
                    code,
                    studyPackId,
                    expiryDate,
                    maxUses,
                    durationMonths,
                    isActive
                });
                // Canonical: Return updated activation code with updatedAt
                res.status(200).json(activationCode);
            }
            catch (error) {
                next(error);
            }
        });
    }
    /**
     * DELETE /admin/activation-codes/:id
     * Delete activation code
     */
    deleteActivationCode(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const id = parseInt(req.params.id);
                if (isNaN(id)) {
                    this.responseUtils.sendBadRequestResponse(res, "Invalid activation code ID");
                    return;
                }
                const result = yield this.activationCodeService.deleteActivationCode(id);
                // Canonical: Return { message }
                res.status(200).json(result);
            }
            catch (error) {
                next(error);
            }
        });
    }
    /**
     * PATCH /admin/activation-codes/:id/deactivate
     * Deactivate activation code
     */
    deactivateActivationCode(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const id = parseInt(req.params.id);
                if (isNaN(id)) {
                    this.responseUtils.sendBadRequestResponse(res, "Invalid activation code ID");
                    return;
                }
                const result = yield this.activationCodeService.deactivateActivationCode(id);
                // Canonical: Return { id, code, isActive, deactivatedAt }
                res.status(200).json(result);
            }
            catch (error) {
                next(error);
            }
        });
    }
    // ==========================================
    // RESIDENCY QUESTION MANAGEMENT (Canonical spec)
    // ==========================================
    /**
     * GET /admin/residency-questions
     * List residency questions with pagination and filters
     */
    getResidencyQuestions(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const filters = {
                    page: req.query.page ? parseInt(req.query.page) : 1,
                    limit: req.query.limit ? parseInt(req.query.limit) : 10,
                    part: req.query.part,
                    examYear: req.query.examYear ? parseInt(req.query.examYear) : undefined,
                    universityId: req.query.universityId ? parseInt(req.query.universityId) : undefined,
                    search: req.query.search
                };
                const result = yield this.adminService.getResidencyQuestions(filters);
                res.status(200).json(result);
            }
            catch (error) {
                next(error);
            }
        });
    }
    /**
     * GET /admin/residency-questions/:id
     * Get single residency question with answers and images
     */
    getResidencyQuestionById(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const questionId = parseInt(req.params.id);
                const result = yield this.adminService.getResidencyQuestionById(questionId);
                res.status(200).json(result);
            }
            catch (error) {
                next(error);
            }
        });
    }
    /**
     * POST /admin/residency-questions
     * Create a new residency question
     */
    createResidencyQuestion(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const createdById = req.user.user_data.id;
                const result = yield this.adminService.createResidencyQuestion(req.body, createdById);
                res.status(201).json(result);
            }
            catch (error) {
                next(error);
            }
        });
    }
    /**
     * PUT /admin/residency-questions/:id
     * Update a residency question
     */
    updateResidencyQuestion(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const questionId = parseInt(req.params.id);
                const result = yield this.adminService.updateResidencyQuestion(questionId, req.body);
                res.status(200).json(result);
            }
            catch (error) {
                next(error);
            }
        });
    }
    /**
     * DELETE /admin/residency-questions/:id
     * Delete a residency question
     */
    deleteResidencyQuestion(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const questionId = parseInt(req.params.id);
                yield this.adminService.deleteResidencyQuestion(questionId);
                res.status(200).json({ message: "Residency question deleted successfully" });
            }
            catch (error) {
                next(error);
            }
        });
    }
    /**
     * POST /admin/residency-questions/bulk
     * Bulk create residency questions
     */
    bulkCreateResidencyQuestions(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const createdById = req.user.user_data.id;
                const result = yield this.adminService.bulkCreateResidencyQuestions(req.body, createdById);
                res.status(201).json(result);
            }
            catch (error) {
                next(error);
            }
        });
    }
    // ==========================================
    // MODULE BOOKS MANAGEMENT
    // ==========================================
    /**
     * GET /admin/modules/:id/books
     * Get all books for a module
     * Returns: { books: [...] }
     */
    getModuleBooks(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const moduleId = parseInt(req.params.id);
                if (isNaN(moduleId)) {
                    this.responseUtils.sendBadRequestResponse(res, "Valid module ID is required");
                    return;
                }
                const result = yield this.adminService.getModuleBooks(moduleId);
                res.status(200).json(result);
            }
            catch (error) {
                next(error);
            }
        });
    }
    /**
     * POST /admin/modules/:id/books
     * Bulk create books for a module
     * Returns: { books: [...], totalCreated, message }
     */
    createModuleBooks(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const moduleId = parseInt(req.params.id);
                if (isNaN(moduleId)) {
                    this.responseUtils.sendBadRequestResponse(res, "Valid module ID is required");
                    return;
                }
                const createdById = req.user.user_data.id;
                const { books } = req.body;
                if (!Array.isArray(books) || books.length === 0) {
                    this.responseUtils.sendBadRequestResponse(res, "Books array is required and cannot be empty");
                    return;
                }
                const result = yield this.adminService.createModuleBooks(moduleId, books, createdById);
                res.status(201).json(result);
            }
            catch (error) {
                next(error);
            }
        });
    }
};
AdminController = __decorate([
    (0, tsyringe_1.injectable)(),
    __param(0, (0, tsyringe_1.inject)(admin_service_1.default)),
    __param(1, (0, tsyringe_1.inject)(response_utils_1.default)),
    __param(2, (0, tsyringe_1.inject)(activation_code_service_1.ActivationCodeService)),
    __metadata("design:paramtypes", [admin_service_1.default,
        response_utils_1.default,
        activation_code_service_1.ActivationCodeService])
], AdminController);
exports.default = AdminController;
