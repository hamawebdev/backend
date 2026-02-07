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
const exam_service_1 = __importDefault(require("./exam.service"));
const response_utils_1 = __importDefault(require("../../core/utils/response.utils"));
let ExamController = class ExamController {
    constructor(examService, responseUtils) {
        this.examService = examService;
        this.responseUtils = responseUtils;
    }
    // POST /api/v1/exams/exam-sessions
    createExamSession(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const examId = parseInt(req.body.examId);
                if (!examId || isNaN(examId)) {
                    this.responseUtils.sendBadRequestResponse(res, "Invalid exam ID format");
                    return;
                }
                const result = yield this.examService.createExamSession(examId, req.user);
                this.responseUtils.sendSuccessResponse(res, result);
            }
            catch (error) {
                console.error("Error creating exam session:", error);
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    // GET /api/v1/exams/available
    getAvailableExams(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const year = req.query.year;
                const moduleId = req.query.moduleId ? parseInt(req.query.moduleId) : undefined;
                const result = yield this.examService.getAvailableExams(year, req.user, moduleId);
                this.responseUtils.sendSuccessResponse(res, result);
            }
            catch (error) {
                console.error("Error getting available exams:", error);
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    // GET /api/v1/exams/:examId
    getExamDetails(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const examId = parseInt(req.params.examId);
                if (!examId || isNaN(examId)) {
                    this.responseUtils.sendBadRequestResponse(res, "Valid exam ID is required");
                    return;
                }
                const result = yield this.examService.getExamDetails(examId, req.user);
                this.responseUtils.sendSuccessResponse(res, result);
            }
            catch (error) {
                console.error("Error getting exam details:", error);
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    // GET /api/v1/exams/:examId/questions
    getExamQuestions(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const examId = parseInt(req.params.examId);
                if (!examId || isNaN(examId)) {
                    this.responseUtils.sendBadRequestResponse(res, "Valid exam ID is required");
                    return;
                }
                const result = yield this.examService.getExamQuestions(examId, req.user);
                this.responseUtils.sendSuccessResponse(res, result);
            }
            catch (error) {
                console.error("Error getting exam questions:", error);
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    // GET /api/v1/exams/by-module/:moduleId/:year
    getExamsByModuleAndYear(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const moduleId = parseInt(req.params.moduleId);
                const year = parseInt(req.params.year);
                if (!moduleId || isNaN(moduleId)) {
                    this.responseUtils.sendBadRequestResponse(res, "Valid module ID is required");
                    return;
                }
                if (!year || isNaN(year)) {
                    this.responseUtils.sendBadRequestResponse(res, "Valid year is required");
                    return;
                }
                const result = yield this.examService.getExamsByModuleAndYear(moduleId, year, req.user);
                this.responseUtils.sendSuccessResponse(res, result);
            }
            catch (error) {
                console.error("Error getting exams by module and year:", error);
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
    // POST /api/v1/exams/exam-sessions/from-modules
    createExamSessionFromModules(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { moduleIds, year } = req.body;
                if (!moduleIds || !Array.isArray(moduleIds) || moduleIds.length === 0) {
                    this.responseUtils.sendBadRequestResponse(res, "Module IDs array is required");
                    return;
                }
                if (!year || isNaN(year)) {
                    this.responseUtils.sendBadRequestResponse(res, "Valid year is required");
                    return;
                }
                const result = yield this.examService.createExamSessionFromModules(moduleIds, year, req.user);
                this.responseUtils.sendSuccessResponse(res, result);
            }
            catch (error) {
                console.error("Error creating exam session from modules:", error);
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
    }
};
ExamController = __decorate([
    (0, tsyringe_1.injectable)(),
    __param(0, (0, tsyringe_1.inject)(exam_service_1.default)),
    __param(1, (0, tsyringe_1.inject)(response_utils_1.default)),
    __metadata("design:paramtypes", [exam_service_1.default,
        response_utils_1.default])
], ExamController);
exports.default = ExamController;
