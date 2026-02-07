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
const client_1 = require("@prisma/client");
const quiz_repository_1 = __importDefault(require("./quiz.repository"));
const question_service_1 = __importDefault(require("../questions/question.service"));
const access_control_service_1 = require("../../services/access-control.service");
const QuizErrors_1 = require("../../core/errors/QuizErrors");
const AppError_1 = require("../../core/errors/AppError");
let QuizService = class QuizService {
    constructor(quizRepository, questionService) {
        this.quizRepository = quizRepository;
        this.questionService = questionService;
    }
    createQuizSession(createQuizSessionDto, user) {
        return __awaiter(this, void 0, void 0, function* () {
            const { title, quizType, settings, filters, type } = createQuizSessionDto;
            // Validate user has subscription access
            if (!user.has_active_subscription) {
                throw new QuizErrors_1.SubscriptionRequiredError("quiz sessions");
            }
            // Validate configuration
            if (settings.questionCount > 100) {
                throw new QuizErrors_1.InvalidQuizConfigurationError("Question count cannot exceed 100");
            }
            if (settings.questionCount < 1) {
                throw new QuizErrors_1.InvalidQuizConfigurationError("Question count must be at least 1");
            }
            // Convert QuizSessionFilters to UnifiedQuestionFilters format
            const unifiedFilters = {
                yearLevels: filters.yearLevels,
                courseIds: filters.courseIds,
                moduleIds: filters.moduleIds,
                uniteIds: filters.uniteIds,
                questionTypes: filters.questionTypes,
                examYears: filters.examYears,
                questionSourceIds: filters.questionSourceIds,
                quizYears: filters.quizYears // preserve optional quizYears if provided
            };
            // Get questions based on filters using unified question service
            const questions = yield this.questionService.getQuestionsWithFilters(unifiedFilters, user.accessible_study_packs, settings.questionCount);
            if (questions.length === 0) {
                throw new QuizErrors_1.NoQuestionsFoundError(filters);
            }
            if (questions.length < settings.questionCount) {
                throw new QuizErrors_1.InsufficientQuestionsError(settings.questionCount, questions.length);
            }
            try {
                // Determine session type (default PRACTICE if not provided)
                const sessionType = type !== null && type !== void 0 ? type : client_1.SessionType.PRACTICE;
                // Create quiz session with requested type
                const session = yield this.quizRepository.createQuizSession(user.user_data.id, title, sessionType, quizType);
                // Add questions to session
                const questionIds = questions.map(q => q.id);
                yield this.quizRepository.addQuestionsToSession(session.id, questionIds);
                return {
                    success: true,
                    data: {
                        sessionId: session.id
                    }
                };
            }
            catch (error) {
                throw new QuizErrors_1.QuizCreationFailedError("Database operation failed");
            }
        });
    }
    getQuizFilters(user) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!user.has_active_subscription) {
                throw new QuizErrors_1.SubscriptionRequiredError("quiz filters");
            }
            // Check if user has residency access
            const accessControlService = new access_control_service_1.AccessControlService();
            let studyPackIds;
            if (accessControlService.hasResidencyAccess(user)) {
                // Residency users get access to ALL study packs (same as residency session filters)
                const allStudyPacks = yield this.quizRepository.getAllStudyPackIds();
                studyPackIds = allStudyPacks;
            }
            else {
                // Regular users use their accessible study packs from JWT
                studyPackIds = user.accessible_study_packs;
            }
            // Get user's accessible year levels based on subscription
            const accessibleYearLevels = accessControlService.getAccessibleYearLevels(user);
            // Get filters data with year level filtering for question counts
            const filtersData = yield this.quizRepository.getAvailableFilters(studyPackIds, accessibleYearLevels);
            // For residency users, return all accessible year levels regardless of database content
            // For other users, filter based on what's available in the database
            let finalAvailableYears;
            if (accessControlService.hasResidencyAccess(user)) {
                // Residency users get all their accessible year levels
                finalAvailableYears = accessibleYearLevels;
            }
            else {
                // Regular users get intersection of database content and their access
                finalAvailableYears = filtersData.availableYears.filter(year => accessibleYearLevels.includes(year));
            }
            const filteredData = Object.assign(Object.assign({}, filtersData), { availableYears: finalAvailableYears });
            return {
                success: true,
                data: filteredData
            };
        });
    }
    getResidencySessionFilters(user) {
        return __awaiter(this, void 0, void 0, function* () {
            // Check if user has active subscription
            if (!user.has_active_subscription) {
                throw new QuizErrors_1.SubscriptionRequiredError("residency session filters");
            }
            // Check if user has residency access
            const accessControlService = new access_control_service_1.AccessControlService();
            if (!accessControlService.hasResidencyAccess(user)) {
                throw new Error("Access denied. This endpoint is only available for users with active residency subscriptions.");
            }
            // Get residency-specific filter data
            const filtersData = yield this.quizRepository.getResidencySessionFilters();
            // For residency users, ensure all year levels are available (same logic as regular quiz-filters)
            const availableYears = [
                client_1.YearLevel.ONE, client_1.YearLevel.TWO, client_1.YearLevel.THREE,
                client_1.YearLevel.FOUR, client_1.YearLevel.FIVE, client_1.YearLevel.SIX, client_1.YearLevel.SEVEN
            ];
            // Define session difficulty levels (additional residency-specific feature)
            const sessionDifficultyLevels = [
                {
                    level: 'EASY',
                    name: 'Easy',
                    description: 'Basic concepts and fundamental knowledge'
                },
                {
                    level: 'MEDIUM',
                    name: 'Medium',
                    description: 'Intermediate level with clinical applications'
                },
                {
                    level: 'HARD',
                    name: 'Hard',
                    description: 'Advanced concepts and complex scenarios'
                },
                {
                    level: 'EXPERT',
                    name: 'Expert',
                    description: 'Expert level for residency preparation'
                }
            ];
            return {
                success: true,
                data: {
                    // Same structure as regular quiz-filters
                    availableYears,
                    singleChoiceQuestionCount: filtersData.singleChoiceQuestionCount,
                    multipleChoiceQuestionCount: filtersData.multipleChoiceQuestionCount,
                    unites: filtersData.unites,
                    availableQuizYears: filtersData.availableQuizYears,
                    questionSources: filtersData.questionSources,
                    // Additional residency-specific fields
                    availableSpecialties: filtersData.availableSpecialties,
                    universities: filtersData.universities,
                    sessionDifficultyLevels,
                    parts: ["Sciences fondamentales", "Pathologie medico-chirurgical", "Dossier clinique"],
                    totalQuestionCount: filtersData.totalQuestionCount
                }
            };
        });
    }
    getQuizSession(sessionId, user) {
        return __awaiter(this, void 0, void 0, function* () {
            const session = yield this.quizRepository.getQuizSessionById(sessionId, user.user_data.id);
            if (!session) {
                throw new QuizErrors_1.SessionNotFoundError(sessionId);
            }
            // Transform session data to response format with comprehensive question data
            const sessionWithIncludes = session;
            const questions = sessionWithIncludes.sessionQuestions.map((sq) => ({
                id: sq.question.id,
                questionText: sq.question.questionText,
                questionType: sq.question.questionType || 'SINGLE_CHOICE',
                explanation: sq.question.explanation || undefined,
                yearLevel: sq.question.yearLevel,
                examYear: sq.question.examYear,
                metadata: sq.question.metadata,
                questionImages: sq.question.questionImages || [],
                questionExplanationImages: sq.question.questionExplanationImages || [],
                university: sq.question.university ? {
                    id: sq.question.university.id,
                    name: sq.question.university.name,
                    country: sq.question.university.country
                } : undefined,
                course: sq.question.course ? {
                    id: sq.question.course.id,
                    name: sq.question.course.name,
                    description: sq.question.course.description,
                    module: sq.question.course.module ? {
                        id: sq.question.course.module.id,
                        name: sq.question.course.module.name
                    } : undefined
                } : undefined,
                source: sq.question.source ? {
                    id: sq.question.source.id,
                    name: sq.question.source.name
                } : undefined,
                questionAnswers: sq.question.questionAnswers.map((qa) => ({
                    id: qa.id,
                    answerText: qa.answerText,
                    isCorrect: qa.isCorrect,
                    explanation: qa.explanation || undefined,
                    explanationImages: qa.explanationImages.map((img) => ({
                        id: img.id,
                        imagePath: img.imagePath,
                        altText: img.altText || undefined
                    }))
                })),
                createdAt: sq.question.createdAt,
                updatedAt: sq.question.updatedAt
            }));
            // Combine single choice and multiple choice attempts
            const singleChoiceAnswers = sessionWithIncludes.quizAttempts.map((attempt) => ({
                questionId: attempt.questionId,
                selectedAnswerId: attempt.selectedAnswerId || undefined,
                textAnswer: attempt.textAnswer || undefined,
                isCorrect: attempt.isCorrect || undefined,
                answeredAt: attempt.answeredAt || undefined
            }));
            const multipleChoiceAnswers = (sessionWithIncludes.multipleChoiceAttempts || []).map((attempt) => ({
                questionId: attempt.questionId,
                selectedAnswerIds: attempt.selectedAnswerIds ? JSON.parse(attempt.selectedAnswerIds) : undefined,
                isCorrect: attempt.isCorrect || undefined,
                partialScore: attempt.partialScore || undefined,
                answeredAt: attempt.answeredAt || undefined
            }));
            const answers = [...singleChoiceAnswers, ...multipleChoiceAnswers];
            return {
                id: session.id,
                title: session.title,
                type: session.type,
                status: session.status,
                startedAt: session.startedAt || undefined,
                completedAt: session.completedAt || undefined,
                score: session.score,
                percentage: session.percentage,
                questions,
                answers,
                createdAt: session.createdAt,
                updatedAt: session.updatedAt
            };
        });
    }
    submitAnswers(sessionId, submitAnswerDto, user) {
        return __awaiter(this, void 0, void 0, function* () {
            // Verify session belongs to user
            const session = yield this.quizRepository.getQuizSessionById(sessionId, user.user_data.id);
            if (!session) {
                throw new QuizErrors_1.SessionNotFoundError(sessionId);
            }
            if (session.status === client_1.SessionStatus.COMPLETED) {
                throw new QuizErrors_1.SessionCompletedError(sessionId);
            }
            // Validate answers belong to session questions
            const sessionQuestionIds = yield this.quizRepository.getSessionQuestionIds(sessionId);
            const invalidQuestions = submitAnswerDto.answers.filter(answer => !sessionQuestionIds.includes(answer.questionId));
            if (invalidQuestions.length > 0) {
                throw new QuizErrors_1.QuestionNotInSessionError(invalidQuestions[0].questionId, sessionId);
            }
            // Validate answers belong to questions
            for (const answer of submitAnswerDto.answers) {
                if (answer.selectedAnswerId !== undefined) {
                    // Single choice validation
                    const isValidAnswer = yield this.quizRepository.validateAnswerBelongsToQuestion(answer.selectedAnswerId, answer.questionId);
                    if (!isValidAnswer) {
                        throw new QuizErrors_1.InvalidAnswerError(answer.selectedAnswerId, answer.questionId);
                    }
                }
                else if (answer.selectedAnswerIds !== undefined) {
                    // Multiple choice validation
                    const areValidAnswers = yield this.quizRepository.validateAnswersBelongToQuestion(answer.selectedAnswerIds, answer.questionId);
                    if (!areValidAnswers) {
                        throw new QuizErrors_1.InvalidAnswerError(answer.selectedAnswerIds[0], answer.questionId);
                    }
                }
                else if (answer.textAnswer !== undefined) {
                    // QROC validation - implicit validity for text answers
                    // We can trust that if it has textAnswer, it's an attempt for QROC
                }
            }
            // Submit answers and get results - Canonical spec format
            const results = yield this.quizRepository.submitAnswersWithResults(sessionId, submitAnswerDto.answers);
            // Fetch refreshed session to get accurate cumulative stats (after upsert)
            const refreshedSession = yield this.quizRepository.getQuizSessionById(sessionId, user.user_data.id);
            if (!refreshedSession) {
                throw new QuizErrors_1.SessionNotFoundError(sessionId);
            }
            // Cast to any to access included relations
            const sessionWithIncludes = refreshedSession;
            // Count total unique questions in the session
            const totalQuestions = sessionWithIncludes.sessionQuestions.length;
            // Count attempts from both single and multiple choice tables
            // Note: getQuizSessionById generally includes quizAttempts (single) and multipleChoiceAttempts
            // We need to count unique questions answered
            const singleChoiceAttempts = sessionWithIncludes.quizAttempts || [];
            const multipleChoiceAttempts = sessionWithIncludes.multipleChoiceAttempts || [];
            // Calculate stats based on DB state
            const singleCorrect = singleChoiceAttempts.filter((a) => a.isCorrect).length;
            const multipleCorrect = multipleChoiceAttempts.filter((a) => a.isCorrect).length;
            const correctAnswersCount = singleCorrect + multipleCorrect;
            const totalAnsweredCount = singleChoiceAttempts.length + multipleChoiceAttempts.length;
            const incorrectAnswersCount = totalAnsweredCount - correctAnswersCount;
            const unansweredCount = totalQuestions - totalAnsweredCount;
            // Use the score calculated by the repository (which handles partials)
            const dbScore = refreshedSession.score; // This is the total points (including partials)
            // Calculate score out of 20
            const totalScore20 = totalQuestions > 0
                ? Number(((dbScore / totalQuestions) * 20).toFixed(2))
                : 0;
            // Percentage score from DB
            const score = refreshedSession.percentage;
            return {
                message: "Answers submitted successfully",
                results,
                score,
                totalScore20,
                correctAnswersCount,
                incorrectAnswersCount,
                unansweredCount,
                totalQuestions
            };
        });
    }
    /**
     * GET /quiz-sessions/:sessionId/results
     * Returns computed session results with statistics
     * This is similar to the response from submitAnswers but can be called at any time
     */
    getSessionResults(sessionId, user) {
        return __awaiter(this, void 0, void 0, function* () {
            // Verify session belongs to user
            const session = yield this.quizRepository.getQuizSessionById(sessionId, user.user_data.id);
            if (!session) {
                throw new QuizErrors_1.SessionNotFoundError(sessionId);
            }
            // Cast to any to access included relations
            const sessionWithIncludes = session;
            // Count total unique questions in the session
            const totalQuestions = sessionWithIncludes.sessionQuestions.length;
            // Count attempts from both single and multiple choice tables
            const singleChoiceAttempts = sessionWithIncludes.quizAttempts || [];
            const multipleChoiceAttempts = sessionWithIncludes.multipleChoiceAttempts || [];
            // Calculate stats based on DB state
            const singleCorrect = singleChoiceAttempts.filter((a) => a.isCorrect).length;
            const multipleCorrect = multipleChoiceAttempts.filter((a) => a.isCorrect).length;
            const correctAnswersCount = singleCorrect + multipleCorrect;
            const totalAnsweredCount = singleChoiceAttempts.length + multipleChoiceAttempts.length;
            const incorrectAnswersCount = totalAnsweredCount - correctAnswersCount;
            const unansweredCount = totalQuestions - totalAnsweredCount;
            // Use the score calculated by the repository (which handles partials)
            const dbScore = session.score; // This is the total points (including partials)
            // Calculate score out of 20
            const totalScore20 = totalQuestions > 0
                ? Number(((dbScore / totalQuestions) * 20).toFixed(2))
                : 0;
            // Percentage score from DB
            const score = session.percentage;
            return {
                sessionId: session.id,
                title: session.title,
                type: session.type,
                status: session.status,
                score,
                totalScore20,
                correctAnswersCount,
                incorrectAnswersCount,
                unansweredCount,
                totalQuestions,
                completedAt: session.completedAt || undefined
            };
        });
    }
    getUserQuizSessions(user_1) {
        return __awaiter(this, arguments, void 0, function* (user, page = 1, limit = 10) {
            const { sessions, total } = yield this.quizRepository.getUserQuizSessions(user.user_data.id, page, limit);
            const totalPages = Math.ceil(total / limit);
            const formattedSessions = sessions.map(session => {
                const sessionWithIncludes = session;
                return {
                    id: session.id,
                    title: session.title,
                    type: session.type,
                    status: session.status,
                    score: session.score,
                    percentage: session.percentage,
                    questionsCount: sessionWithIncludes._count.sessionQuestions,
                    answersCount: sessionWithIncludes._count.quizAttempts,
                    startedAt: session.startedAt,
                    completedAt: session.completedAt,
                    createdAt: session.createdAt,
                    quiz: sessionWithIncludes.quiz ? {
                        id: sessionWithIncludes.quiz.id,
                        title: sessionWithIncludes.quiz.title
                    } : null,
                    exam: sessionWithIncludes.exam ? {
                        id: sessionWithIncludes.exam.id,
                        title: sessionWithIncludes.exam.title
                    } : null
                };
            });
            return {
                success: true,
                data: {
                    sessions: formattedSessions,
                    pagination: {
                        currentPage: page,
                        totalPages,
                        total,
                        limit
                    }
                }
            };
        });
    }
    /**
     * GET /quiz-sessions/type/:sessionType - Canonical spec
     * Returns flat array (no pagination)
     */
    getQuizSessionsByTypeCanonical(user, sessionType) {
        return __awaiter(this, void 0, void 0, function* () {
            // Get all sessions without pagination for canonical spec
            const { sessions } = yield this.quizRepository.getUserQuizSessionsByType(user.user_data.id, sessionType, 1000, // Large limit to get all sessions
            0);
            return sessions.map((session) => {
                var _a;
                return ({
                    id: session.id,
                    title: session.title,
                    type: session.type,
                    status: session.status,
                    createdAt: session.createdAt.toISOString(),
                    completedAt: ((_a = session.completedAt) === null || _a === void 0 ? void 0 : _a.toISOString()) || null,
                    score: session.percentage || 0
                });
            });
        });
    }
    hasResidencyAccess(user) {
        return user.subscriptions.some(sub => sub.pack_type === client_1.PackType.RESIDENCY.toString());
    }
    validateQuizSessionAccess(user, filters) {
        // Year-specific subscribers can only access their subscribed years
        if (!this.hasResidencyAccess(user)) {
            const userYear = user.user_data.currentYear;
            if (filters.yearLevels && filters.yearLevels.length > 0) {
                return filters.yearLevels.includes(userYear);
            }
        }
        return true;
    }
    updateQuizAnswer(sessionId, questionId, selectedAnswerId, user) {
        return __awaiter(this, void 0, void 0, function* () {
            // Verify session belongs to user
            const session = yield this.quizRepository.getQuizSessionById(sessionId, user.user_data.id);
            if (!session) {
                throw new QuizErrors_1.SessionNotFoundError(sessionId);
            }
            if (session.status === client_1.SessionStatus.COMPLETED) {
                throw new QuizErrors_1.SessionCompletedError(sessionId);
            }
            // Validate question belongs to session
            const sessionQuestionIds = yield this.quizRepository.getSessionQuestionIds(sessionId);
            if (!sessionQuestionIds.includes(questionId)) {
                throw new QuizErrors_1.QuestionNotInSessionError(questionId, sessionId);
            }
            // Validate answer belongs to question
            const isValidAnswer = yield this.quizRepository.validateAnswerBelongsToQuestion(selectedAnswerId, questionId);
            if (!isValidAnswer) {
                throw new QuizErrors_1.InvalidAnswerError(selectedAnswerId, questionId);
            }
            // Update single answer
            yield this.quizRepository.submitAnswers(sessionId, [{
                    questionId,
                    selectedAnswerId
                }]);
            return {
                success: true,
                message: "Answer updated successfully"
            };
        });
    }
    // ==========================================
    // RETAKE SESSION FUNCTIONALITY
    // ==========================================
    /**
     * Create a retake session - Canonical spec format
     * Returns { sessionId, questionCount, title }
     */
    createRetakeSession(createRetakeSessionDto, user) {
        return __awaiter(this, void 0, void 0, function* () {
            const { originalSessionId, retakeType, title } = createRetakeSessionDto;
            // Validate user has subscription access
            if (!user.has_active_subscription) {
                throw new QuizErrors_1.SubscriptionRequiredError("retake sessions");
            }
            // Get original session and verify ownership
            const originalSession = yield this.quizRepository.getQuizSessionById(originalSessionId, user.user_data.id);
            if (!originalSession) {
                throw new QuizErrors_1.SessionNotFoundError(originalSessionId);
            }
            // Original session must be completed to create retake
            if (originalSession.status !== client_1.SessionStatus.COMPLETED) {
                throw new QuizErrors_1.SessionStatusError(originalSession.status, ["COMPLETED"]);
            }
            // Get questions based on retake type
            const questionIds = yield this.getRetakeQuestionIds(originalSessionId, retakeType);
            if (questionIds.length === 0) {
                throw new QuizErrors_1.NoQuestionsFoundError({ retakeType });
            }
            try {
                // Generate retake session title
                const retakeTitle = title || this.generateRetakeTitle(originalSession.title, retakeType);
                // Create retake session
                const retakeSession = yield this.quizRepository.createRetakeSession(user.user_data.id, retakeTitle, originalSession.type, originalSessionId, retakeType, originalSession.quizType || undefined);
                // Add questions to retake session
                yield this.quizRepository.addQuestionsToSession(retakeSession.id, questionIds);
                // Canonical spec format
                return {
                    sessionId: retakeSession.id,
                    questionCount: questionIds.length,
                    title: retakeTitle
                };
            }
            catch (error) {
                console.error("Error creating retake session:", error);
                throw new QuizErrors_1.QuizCreationFailedError("Failed to create retake session");
            }
        });
    }
    getRetakeQuestionIds(originalSessionId, retakeType) {
        return __awaiter(this, void 0, void 0, function* () {
            switch (retakeType) {
                case client_1.RetakeType.SAME:
                    return yield this.quizRepository.getSessionQuestionIds(originalSessionId);
                case client_1.RetakeType.INCORRECT_ONLY:
                    return yield this.quizRepository.getIncorrectQuestionIds(originalSessionId);
                case client_1.RetakeType.CORRECT_ONLY:
                    return yield this.quizRepository.getCorrectQuestionIds(originalSessionId);
                case client_1.RetakeType.NOT_RESPONDED:
                    return yield this.quizRepository.getNotRespondedQuestionIds(originalSessionId);
                default:
                    throw new QuizErrors_1.InvalidQuizConfigurationError(`Invalid retake type: ${retakeType}`);
            }
        });
    }
    generateRetakeTitle(originalTitle, retakeType) {
        const retakeTypeLabels = {
            [client_1.RetakeType.SAME]: "Retake",
            [client_1.RetakeType.INCORRECT_ONLY]: "Incorrect Only",
            [client_1.RetakeType.CORRECT_ONLY]: "Correct Only",
            [client_1.RetakeType.NOT_RESPONDED]: "Unanswered Only"
        };
        return `${originalTitle} - ${retakeTypeLabels[retakeType]}`;
    }
    deleteQuizSession(sessionId, user) {
        return __awaiter(this, void 0, void 0, function* () {
            // Verify session belongs to user
            const session = yield this.quizRepository.getQuizSessionById(sessionId, user.user_data.id);
            if (!session) {
                throw new QuizErrors_1.SessionNotFoundError(sessionId);
            }
            try {
                yield this.quizRepository.deleteQuizSession(sessionId);
                return {
                    success: true,
                    message: "Session deleted successfully"
                };
            }
            catch (error) {
                if (error.code === 'P2025') {
                    // Record to delete does not exist (already deleted)
                    throw new QuizErrors_1.SessionNotFoundError(sessionId);
                }
                throw error;
            }
        });
    }
    /**
     * Update session status with proper authorization and validation
     * Canonical spec: returns { message, sessionId, status }
     */
    updateSessionStatus(sessionId, updateStatusDto, user) {
        return __awaiter(this, void 0, void 0, function* () {
            const { status } = updateStatusDto;
            // Get session and verify ownership or admin/employee access
            const session = yield this.quizRepository.getQuizSessionById(sessionId, user.user_data.id);
            if (!session) {
                // If user is admin/employee, try to get session without user restriction
                if (user.user_data.role === 'ADMIN' || user.user_data.role === 'EMPLOYEE') {
                    const adminSession = yield this.quizRepository.getQuizSessionById(sessionId);
                    if (!adminSession) {
                        throw new QuizErrors_1.SessionNotFoundError(sessionId);
                    }
                    // Use admin session for further processing
                    const updatedSession = yield this.updateSessionStatusInternal(sessionId, status, adminSession.userId);
                    return this.formatSessionStatusResponse(updatedSession, "Session status updated successfully by admin");
                }
                else {
                    throw new QuizErrors_1.SessionNotFoundError(sessionId);
                }
            }
            // For regular users, validate status transition
            if (!this.quizRepository.isValidStatusTransition(session.status, status)) {
                throw new QuizErrors_1.SessionStatusError(session.status, this.getValidTransitions(session.status));
            }
            // Update session status
            const updatedSession = yield this.updateSessionStatusInternal(sessionId, status, session.userId);
            return this.formatSessionStatusResponse(updatedSession, "Session status updated successfully");
        });
    }
    /**
     * Internal method to update session status
     */
    updateSessionStatusInternal(sessionId, status, userId) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.quizRepository.updateSessionStatus(sessionId, status, userId);
        });
    }
    /**
     * Format session status response - Canonical spec format
     */
    formatSessionStatusResponse(session, message) {
        return {
            message,
            sessionId: session.id,
            status: session.status
        };
    }
    /**
     * Get valid status transitions for current status
     */
    getValidTransitions(currentStatus) {
        const validTransitions = {
            [client_1.SessionStatus.NOT_STARTED]: ["IN_PROGRESS", "COMPLETED"],
            [client_1.SessionStatus.IN_PROGRESS]: ["COMPLETED", "NOT_STARTED"],
            [client_1.SessionStatus.COMPLETED]: ["NOT_STARTED"]
        };
        return validTransitions[currentStatus] || [];
    }
    getExamSessionFilters(user) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!user.has_active_subscription) {
                throw new QuizErrors_1.SubscriptionRequiredError("exam session filters");
            }
            // Check if user has residency access
            const accessControlService = new access_control_service_1.AccessControlService();
            let studyPackIds;
            if (accessControlService.hasResidencyAccess(user)) {
                // Residency users get access to ALL study packs
                const allStudyPacks = yield this.quizRepository.getAllStudyPackIds();
                studyPackIds = allStudyPacks;
            }
            else {
                // Regular users use their accessible study packs from JWT
                studyPackIds = user.accessible_study_packs;
            }
            const filtersData = yield this.quizRepository.getExamSessionFilters(studyPackIds);
            return {
                success: true,
                data: filtersData
            };
        });
    }
    createPracticeSessionByLabel(user, labelId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!user.has_active_subscription) {
                throw new QuizErrors_1.SubscriptionRequiredError("create practice session");
            }
            // First, check if the label exists and belongs to the user
            const studentRepository = tsyringe_1.container.resolve('StudentRepository');
            const labelExists = yield studentRepository.labelExistsForUser(labelId, user.user_data.id);
            if (!labelExists) {
                throw new AppError_1.BadRequestError(`Label with ID ${labelId} not found or you do not have permission to access it`);
            }
            // Get the label details to use its name as the session title
            const label = yield studentRepository.getStudentLabelByIdWithQuestionIds(labelId, user.user_data.id);
            if (!label) {
                throw new AppError_1.BadRequestError(`Label with ID ${labelId} not found`);
            }
            // Get all question IDs associated with this label
            const questionIds = yield this.quizRepository.getQuestionIdsByLabelId(labelId, user.user_data.id);
            if (questionIds.length === 0) {
                throw new AppError_1.BadRequestError(`No questions found for label "${label.name}". Please add questions to this label first.`);
            }
            // Determine accessible study packs for validation
            const accessControlService = new access_control_service_1.AccessControlService();
            let studyPackIds;
            if (accessControlService.hasResidencyAccess(user)) {
                // Residency users get access to ALL study packs
                const allStudyPacks = yield this.quizRepository.getAllStudyPackIds();
                studyPackIds = allStudyPacks;
            }
            else {
                // Regular users use their accessible study packs from JWT
                studyPackIds = user.accessible_study_packs;
            }
            // Validate question access
            const validation = yield this.quizRepository.validateQuestionAccess(questionIds, studyPackIds);
            // Check for invalid question IDs
            if (validation.invalidIds.length > 0) {
                throw new AppError_1.BadRequestError(`Some questions in this label are no longer available: ${validation.invalidIds.join(', ')}`);
            }
            // Check for inaccessible question IDs
            if (validation.inaccessibleIds.length > 0) {
                throw new AppError_1.ForbiddenError(`You don't have access to some questions in this label: ${validation.inaccessibleIds.join(', ')}`);
            }
            // Create the session with the label name as title
            const sessionTitle = `Practice: ${label.name}`;
            const session = yield this.quizRepository.createSessionWithQuestions(user.user_data.id, sessionTitle, client_1.SessionType.PRACTICE, questionIds);
            return {
                success: true,
                data: {
                    sessionId: session.id,
                    questionCount: questionIds.length,
                    title: sessionTitle
                }
            };
        });
    }
    createSessionByQuestions(user, request) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!user.has_active_subscription) {
                throw new QuizErrors_1.SubscriptionRequiredError("create quiz session");
            }
            const { title, type, questionIds } = request;
            // Determine accessible study packs
            const accessControlService = new access_control_service_1.AccessControlService();
            let studyPackIds;
            if (accessControlService.hasResidencyAccess(user)) {
                // Residency users get access to ALL study packs
                const allStudyPacks = yield this.quizRepository.getAllStudyPackIds();
                studyPackIds = allStudyPacks;
            }
            else {
                // Regular users use their accessible study packs from JWT
                studyPackIds = user.accessible_study_packs;
            }
            // Validate question access
            const validation = yield this.quizRepository.validateQuestionAccess(questionIds, studyPackIds);
            // Check for invalid question IDs
            if (validation.invalidIds.length > 0) {
                throw new AppError_1.BadRequestError(`Question IDs not found: ${validation.invalidIds.join(', ')}`);
            }
            // Check for inaccessible question IDs
            if (validation.inaccessibleIds.length > 0) {
                throw new AppError_1.ForbiddenError(`You don't have access to questions: ${validation.inaccessibleIds.join(', ')}`);
            }
            // Create the session
            const sessionType = type === 'PRACTICE' ? client_1.SessionType.PRACTICE : client_1.SessionType.EXAM;
            const session = yield this.quizRepository.createSessionWithQuestions(user.user_data.id, title, sessionType, questionIds);
            return {
                success: true,
                data: {
                    sessionId: session.id,
                    type: type,
                    questionCount: questionIds.length,
                    status: session.status,
                    createdAt: session.createdAt.toISOString()
                }
            };
        });
    }
    getQuestionCount(user, filters) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!user.has_active_subscription) {
                throw new QuizErrors_1.SubscriptionRequiredError("question count");
            }
            // Determine accessible study packs
            const accessControlService = new access_control_service_1.AccessControlService();
            let studyPackIds;
            if (accessControlService.hasResidencyAccess(user)) {
                // Residency users get access to ALL study packs
                const allStudyPacks = yield this.quizRepository.getAllStudyPackIds();
                studyPackIds = allStudyPacks;
            }
            else {
                // Regular users use their accessible study packs from JWT
                studyPackIds = user.accessible_study_packs;
            }
            // Get question count with filters
            const totalQuestions = yield this.quizRepository.getQuestionCount(studyPackIds, filters);
            return {
                success: true,
                data: {
                    totalQuestions
                }
            };
        });
    }
    // ==========================================
    // CANONICAL SPEC ENDPOINTS
    // ==========================================
    /**
     * GET /quizzes/session-filters - Canonical spec
     * Returns filter options with question counts for session creation
     * Optional filters: { uniteId, moduleId } for cascading filter behavior
     */
    getSessionFilters(user, filters) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!user.has_active_subscription) {
                throw new QuizErrors_1.SubscriptionRequiredError("session filters");
            }
            const accessControlService = new access_control_service_1.AccessControlService();
            let studyPackIds;
            if (accessControlService.hasResidencyAccess(user)) {
                const allStudyPacks = yield this.quizRepository.getAllStudyPackIds();
                studyPackIds = allStudyPacks;
            }
            else {
                studyPackIds = user.accessible_study_packs;
            }
            return yield this.quizRepository.getSessionFiltersCanonical(studyPackIds, filters);
        });
    }
    /**
     * POST /quizzes/question-count - Canonical spec
     * Returns totalQuestionCount and accessibleQuestionCount based on filters
     */
    getQuestionCountCanonical(user, filters) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!user.has_active_subscription) {
                throw new QuizErrors_1.SubscriptionRequiredError("question count");
            }
            const accessControlService = new access_control_service_1.AccessControlService();
            let studyPackIds;
            if (accessControlService.hasResidencyAccess(user)) {
                const allStudyPacks = yield this.quizRepository.getAllStudyPackIds();
                studyPackIds = allStudyPacks;
            }
            else {
                studyPackIds = user.accessible_study_packs;
            }
            return yield this.quizRepository.getQuestionCountCanonical(studyPackIds, filters);
        });
    }
    /**
     * GET /quizzes/questions-by-unite-or-module - Canonical spec
     * Returns questions for a specific unite or module
     */
    getQuestionsByUniteOrModule(user, uniteId, moduleId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!user.has_active_subscription) {
                throw new QuizErrors_1.SubscriptionRequiredError("questions");
            }
            const accessControlService = new access_control_service_1.AccessControlService();
            let studyPackIds;
            if (accessControlService.hasResidencyAccess(user)) {
                const allStudyPacks = yield this.quizRepository.getAllStudyPackIds();
                studyPackIds = allStudyPacks;
            }
            else {
                studyPackIds = user.accessible_study_packs;
            }
            return yield this.quizRepository.getQuestionsByUniteOrModule(studyPackIds, uniteId, moduleId);
        });
    }
    /**
     * POST /quizzes/sessions - Canonical spec
     * Creates a quiz session and returns { sessionId }
     */
    createQuizSessionCanonical(dto, user) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!user.has_active_subscription) {
                throw new QuizErrors_1.SubscriptionRequiredError("quiz sessions");
            }
            const accessControlService = new access_control_service_1.AccessControlService();
            let studyPackIds;
            if (accessControlService.hasResidencyAccess(user)) {
                const allStudyPacks = yield this.quizRepository.getAllStudyPackIds();
                studyPackIds = allStudyPacks;
            }
            else {
                studyPackIds = user.accessible_study_packs;
            }
            // Map sessionType to Prisma enum
            const sessionType = dto.sessionType === 'PRACTISE' ? client_1.SessionType.PRACTICE : client_1.SessionType.EXAM;
            // Get questions matching the filters (with optional count limit)
            const questions = yield this.quizRepository.getQuestionsForCanonicalSession(studyPackIds, {
                courseIds: dto.courseIds,
                questionTypes: dto.questionTypes,
                years: dto.years,
                universityIds: dto.universityIds,
                questionSourceIds: dto.questionSourceIds
            }, dto.questionCount);
            if (questions.length === 0) {
                throw new QuizErrors_1.NoQuestionsFoundError({ courseIds: dto.courseIds });
            }
            // Create the session
            const session = yield this.quizRepository.createQuizSession(user.user_data.id, dto.title, sessionType);
            // Add questions to session
            yield this.quizRepository.addQuestionsToSession(session.id, questions.map(q => q.id));
            return { sessionId: session.id };
        });
    }
    // ==========================================
    // RESIDENCY SESSION ENDPOINTS (Canonical spec)
    // ==========================================
    /**
     * GET /quizzes/residency-sessions-only - Canonical spec
     * Returns array of residency sessions for the logged-in user
     */
    getResidencySessionsOnlyCanonical(user) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!user.has_active_subscription) {
                throw new QuizErrors_1.SubscriptionRequiredError("residency sessions");
            }
            // Check if user has residency access
            const accessControlService = new access_control_service_1.AccessControlService();
            if (!accessControlService.hasResidencyAccess(user)) {
                throw new AppError_1.ForbiddenError("Access denied. This endpoint is only available for users with active residency subscriptions.");
            }
            return yield this.quizRepository.getResidencySessionsOnlyCanonical(user.user_data.id);
        });
    }
    /**
     * POST /quizzes/residency-sessions - Canonical spec
     * Creates a residency session. Body: {title, examYear, universityId, parts?}
     * Returns 201: {sessionId, questionCount, title}
     */
    createResidencySessionCanonical(user, dto) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!user.has_active_subscription) {
                throw new QuizErrors_1.SubscriptionRequiredError("residency sessions");
            }
            // Check if user has residency access
            const accessControlService = new access_control_service_1.AccessControlService();
            if (!accessControlService.hasResidencyAccess(user)) {
                throw new AppError_1.ForbiddenError("Access denied. This endpoint is only available for users with active residency subscriptions.");
            }
            // Default parts to all if not specified
            const parts = dto.parts || ["Sciences fondamentales", "Pathologie medico-chirurgical", "Dossier clinique"];
            // Get questions matching the filters (universityId and examYear)
            const questions = yield this.quizRepository.getQuestionsForResidencySession(dto.universityId, dto.examYear, parts);
            if (questions.length === 0) {
                throw new QuizErrors_1.NoQuestionsFoundError({ universityId: dto.universityId, examYear: dto.examYear });
            }
            // Create the session
            const session = yield this.quizRepository.createSessionWithQuestions(user.user_data.id, dto.title, client_1.SessionType.PRACTICE, questions.map(q => q.id));
            return {
                sessionId: session.id,
                questionCount: questions.length,
                title: dto.title
            };
        });
    }
};
QuizService = __decorate([
    (0, tsyringe_1.injectable)(),
    __param(0, (0, tsyringe_1.inject)(quiz_repository_1.default)),
    __param(1, (0, tsyringe_1.inject)(question_service_1.default)),
    __metadata("design:paramtypes", [quiz_repository_1.default,
        question_service_1.default])
], QuizService);
exports.default = QuizService;
