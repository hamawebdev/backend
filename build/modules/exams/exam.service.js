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
const exam_repository_1 = __importDefault(require("./exam.repository"));
const QuizErrors_1 = require("../../core/errors/QuizErrors");
const AppError_1 = require("../../core/errors/AppError");
let ExamService = class ExamService {
    constructor(examRepository) {
        this.examRepository = examRepository;
    }
    /**
     * Get available exams - Canonical spec format
     * Without moduleId: returns { items: [...] }
     * With moduleId: returns { examsByYear: [...], residencyExams: {...} }
     */
    getAvailableExams(year, user, moduleId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!user.has_active_subscription) {
                throw new QuizErrors_1.SubscriptionRequiredError("exams");
            }
            const hasResidencyAccess = this.hasResidencyAccess(user);
            const examData = yield this.examRepository.getAvailableExams(year, user.accessible_study_packs, user.user_data.currentYear, hasResidencyAccess, moduleId);
            // Canonical spec: different response format based on moduleId
            if (moduleId) {
                // With moduleId: return examsByYear and residencyExams
                return {
                    examsByYear: examData.examsByYear.map(yearGroup => ({
                        year: yearGroup.year,
                        exams: yearGroup.exams.map(exam => ({
                            id: exam.id,
                            title: exam.title,
                            university: {
                                id: exam.universityId || 0,
                                name: exam.university
                            },
                            yearLevel: exam.yearLevel,
                            year: exam.year,
                            module: {
                                id: exam.module.id,
                                name: exam.module.name
                            }
                        }))
                    })),
                    residencyExams: {
                        available: examData.residencyExams.available,
                        yearsAvailable: examData.residencyExams.yearsAvailable,
                        exams: examData.residencyExams.exams.map(exam => ({
                            id: exam.id,
                            title: exam.title,
                            university: {
                                id: exam.universityId || 0,
                                name: exam.university
                            },
                            yearLevel: exam.yearLevel,
                            year: exam.year,
                            module: {
                                id: exam.module.id,
                                name: exam.module.name
                            }
                        }))
                    }
                };
            }
            else {
                // Without moduleId: return items array
                const allExams = examData.examsByYear.flatMap(yearGroup => yearGroup.exams);
                return {
                    items: allExams.map(exam => ({
                        id: exam.id,
                        title: exam.title,
                        university: {
                            id: exam.universityId || 0,
                            name: exam.university
                        },
                        yearLevel: exam.yearLevel,
                        year: exam.year,
                        module: {
                            id: exam.module.id,
                            name: exam.module.name
                        },
                        isActive: true, // Default value - field not in schema
                        startDate: null, // Field not in schema
                        endDate: null // Field not in schema
                    }))
                };
            }
        });
    }
    /**
     * Get exam details - Canonical spec format
     * Returns flat exam object with all fields
     */
    getExamDetails(examId, user) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!user.has_active_subscription) {
                throw new QuizErrors_1.SubscriptionRequiredError("exam details");
            }
            const exam = yield this.examRepository.getExamById(examId);
            if (!exam) {
                throw new QuizErrors_1.ExamNotFoundError(examId);
            }
            // Check if user can access this exam
            const hasResidencyAccess = this.hasResidencyAccess(user);
            const canAccess = hasResidencyAccess ||
                exam.yearLevel === user.user_data.currentYear;
            if (!canAccess) {
                throw new QuizErrors_1.AccessDeniedError("this exam", "insufficient subscription level or year mismatch");
            }
            // Canonical spec format: flat exam object
            return {
                id: exam.id,
                title: exam.title,
                university: {
                    id: exam.university.id,
                    name: exam.university.name
                },
                yearLevel: exam.yearLevel,
                year: exam.year,
                module: {
                    id: exam.module.id,
                    name: exam.module.name
                },
                isActive: true, // Default value - field not in schema
                startDate: null, // Field not in schema
                endDate: null, // Field not in schema
                duration: null, // Field not in schema
                questionCount: exam.examQuestions.length,
                passingScore: null // Field not in schema
            };
        });
    }
    /**
     * Get exam questions - Canonical spec format
     * Returns { questions: [...] } with questionType and images
     */
    getExamQuestions(examId, user) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!user.has_active_subscription) {
                throw new QuizErrors_1.SubscriptionRequiredError("exam questions");
            }
            const exam = yield this.examRepository.getExamById(examId);
            if (!exam) {
                throw new QuizErrors_1.ExamNotFoundError(examId);
            }
            // Check if user can access this exam
            const hasResidencyAccess = this.hasResidencyAccess(user);
            const canAccess = hasResidencyAccess ||
                exam.yearLevel === user.user_data.currentYear;
            if (!canAccess) {
                throw new QuizErrors_1.AccessDeniedError("this exam", "insufficient subscription level or year mismatch");
            }
            const questions = yield this.examRepository.getExamQuestions(examId);
            // Canonical spec format: questions with questionType and images
            const formattedQuestions = questions.map(question => {
                var _a;
                return ({
                    id: question.id,
                    questionText: question.questionText,
                    questionType: question.questionType,
                    answers: question.questionAnswers.map((answer) => ({
                        id: answer.id,
                        answerText: answer.answerText,
                        isCorrect: answer.isCorrect
                    })),
                    explanation: question.explanation,
                    images: ((_a = question.questionImages) === null || _a === void 0 ? void 0 : _a.map((img) => ({
                        imagePath: img.imagePath,
                        altText: img.altText
                    }))) || []
                });
            });
            return {
                questions: formattedQuestions
            };
        });
    }
    /**
     * Get exams by module and year - Canonical spec format
     * Returns array directly with detailed exam info
     */
    getExamsByModuleAndYear(moduleId, year, user) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!user.has_active_subscription) {
                throw new QuizErrors_1.SubscriptionRequiredError("exams");
            }
            const hasResidencyAccess = this.hasResidencyAccess(user);
            const exams = yield this.examRepository.getExamsByModuleAndYear(moduleId, year, user.user_data.currentYear, hasResidencyAccess);
            // Canonical spec format: return array directly
            return exams.map(exam => {
                var _a, _b;
                return ({
                    id: exam.id,
                    title: exam.title,
                    university: exam.university ? {
                        id: exam.university.id || 0,
                        name: exam.university.name
                    } : null,
                    yearLevel: exam.yearLevel,
                    year: exam.year,
                    module: {
                        id: ((_a = exam.module) === null || _a === void 0 ? void 0 : _a.id) || 0,
                        name: ((_b = exam.module) === null || _b === void 0 ? void 0 : _b.name) || 'Unknown'
                    },
                    isActive: true, // Default value - field not in schema
                    questionCount: exam.questionCount,
                    duration: null // Field not in schema
                });
            });
        });
    }
    createExamSession(examId, user) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!user.has_active_subscription) {
                throw new QuizErrors_1.SubscriptionRequiredError("exam sessions");
            }
            const exam = yield this.examRepository.getExamById(examId);
            if (!exam) {
                throw new QuizErrors_1.ExamNotFoundError(examId);
            }
            // Check if user can access this exam
            const hasResidencyAccess = this.hasResidencyAccess(user);
            const canAccess = hasResidencyAccess ||
                exam.yearLevel === user.user_data.currentYear;
            if (!canAccess) {
                throw new QuizErrors_1.AccessDeniedError("this exam", "insufficient subscription level or year mismatch");
            }
            // Get exam questions
            const questions = yield this.examRepository.getExamQuestions(examId);
            if (questions.length === 0) {
                throw new QuizErrors_1.NoQuestionsFoundError({ examId });
            }
            // Create exam session
            const sessionId = yield this.examRepository.createExamSession(user.user_data.id, examId, exam.title, questions.map(q => q.id));
            return {
                success: true,
                data: {
                    sessionId,
                    message: `Exam session created successfully with ${questions.length} questions`
                }
            };
        });
    }
    createExamSessionFromModules(moduleIds, year, user) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!user.has_active_subscription) {
                throw new QuizErrors_1.SubscriptionRequiredError("exam sessions");
            }
            if (moduleIds.length === 0) {
                throw new AppError_1.BadRequestError("At least one module must be selected");
            }
            const hasResidencyAccess = this.hasResidencyAccess(user);
            // Get all exams from the selected modules and year
            const allExams = [];
            for (const moduleId of moduleIds) {
                const moduleExams = yield this.examRepository.getExamsByModuleAndYear(moduleId, year, user.user_data.currentYear, hasResidencyAccess);
                allExams.push(...moduleExams);
            }
            if (allExams.length === 0) {
                throw new QuizErrors_1.NoQuestionsFoundError({ moduleIds, year });
            }
            // Collect all questions from all exams
            const allQuestions = [];
            for (const exam of allExams) {
                const questions = yield this.examRepository.getExamQuestions(exam.id);
                allQuestions.push(...questions);
            }
            if (allQuestions.length === 0) {
                throw new QuizErrors_1.NoQuestionsFoundError({ moduleIds, year });
            }
            // Create a combined exam session
            const sessionTitle = `Mixed Practice - ${moduleIds.length} Module(s) - ${year}`;
            const sessionId = yield this.examRepository.createExamSession(user.user_data.id, allExams[0].id, // Use first exam as reference
            sessionTitle, allQuestions.map(q => q.id));
            return {
                success: true,
                data: {
                    sessionId,
                    message: `Exam session created successfully from ${allExams.length} exams`,
                    examCount: allExams.length,
                    questionCount: allQuestions.length
                }
            };
        });
    }
    hasResidencyAccess(user) {
        return user.subscriptions.some(sub => sub.pack_type === 'residency' || sub.pack_type === 'RESIDENCY');
    }
};
ExamService = __decorate([
    (0, tsyringe_1.injectable)(),
    __param(0, (0, tsyringe_1.inject)(exam_repository_1.default)),
    __metadata("design:paramtypes", [exam_repository_1.default])
], ExamService);
exports.default = ExamService;
