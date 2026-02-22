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
let QuizRepository = class QuizRepository {
    constructor(prismaService) {
        this.prismaService = prismaService;
    }
    get prisma() {
        return this.prismaService.getClient();
    }
    getQuestionsWithFilters(filters, accessibleStudyPackIds, questionCount) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            const whereConditions = {};
            // Apply filters
            if (filters.yearLevels && filters.yearLevels.length > 0) {
                whereConditions.yearLevel = { in: filters.yearLevels };
            }
            if (filters.courseIds && filters.courseIds.length > 0) {
                whereConditions.courseId = { in: filters.courseIds };
            }
            else {
                // If no specific courses, filter by accessible study packs
                // Include both modules with a unite (study pack check) and independent modules (no unite)
                whereConditions.course = {
                    module: {
                        OR: [
                            { unite: { studyPackId: { in: accessibleStudyPackIds } } },
                            { uniteId: null }
                        ]
                    }
                };
            }
            // Additional filtering by module or unite if specified
            if (filters.moduleIds && filters.moduleIds.length > 0) {
                whereConditions.course = Object.assign(Object.assign({}, whereConditions.course), { moduleId: { in: filters.moduleIds } });
            }
            if (filters.uniteIds && filters.uniteIds.length > 0) {
                whereConditions.course = Object.assign(Object.assign({}, whereConditions.course), { module: {
                        uniteId: { in: filters.uniteIds }
                    } });
            }
            // Add quiz year filtering
            if (filters.quizYears && filters.quizYears.length > 0) {
                whereConditions.quizQuestions = Object.assign(Object.assign({}, whereConditions.quizQuestions), { some: Object.assign(Object.assign({}, (_a = whereConditions.quizQuestions) === null || _a === void 0 ? void 0 : _a.some), { quiz: Object.assign(Object.assign({}, (_c = (_b = whereConditions.quizQuestions) === null || _b === void 0 ? void 0 : _b.some) === null || _c === void 0 ? void 0 : _c.quiz), { quizYear: { in: filters.quizYears } }) }) });
            }
            // Add new filter support for questionTypes and examYears
            if (filters.questionTypes && filters.questionTypes.length > 0) {
                whereConditions.questionType = { in: filters.questionTypes };
            }
            if (filters.examYears && filters.examYears.length > 0) {
                whereConditions.examYear = { in: filters.examYears };
            }
            // Add question source filtering
            if (filters.questionSourceIds && filters.questionSourceIds.length > 0) {
                whereConditions.sourceId = { in: filters.questionSourceIds };
            }
            const questions = yield this.prisma.question.findMany({
                where: whereConditions,
                include: {
                    source: {
                        select: {
                            id: true,
                            name: true
                        }
                    },
                    questionAnswers: {
                        include: {
                            explanationImages: true
                        }
                    },
                    course: {
                        include: {
                            module: {
                                include: {
                                    unite: true
                                }
                            }
                        }
                    }
                },
                take: questionCount,
                orderBy: {
                    createdAt: 'desc'
                }
            });
            return questions;
        });
    }
    createQuizSession(userId, title, type, quizType) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.prisma.quizSession.create({
                data: {
                    userId,
                    title,
                    type,
                    quizType,
                    status: client_1.SessionStatus.NOT_STARTED
                }
            });
        });
    }
    addQuestionsToSession(sessionId, questionIds) {
        return __awaiter(this, void 0, void 0, function* () {
            const sessionQuestions = questionIds.map(questionId => ({
                sessionId,
                questionId
            }));
            yield this.prisma.quizSessionQuestion.createMany({
                data: sessionQuestions
            });
        });
    }
    getQuizSessionById(sessionId, userId) {
        return __awaiter(this, void 0, void 0, function* () {
            const whereCondition = { id: sessionId };
            // If userId is provided, filter by user ownership
            if (userId !== undefined) {
                whereCondition.userId = userId;
            }
            return yield this.prisma.quizSession.findFirst({
                where: whereCondition,
                include: {
                    sessionQuestions: {
                        orderBy: {
                            question: {
                                repetitionCount: 'desc'
                            }
                        },
                        include: {
                            question: {
                                include: {
                                    questionAnswers: {
                                        include: {
                                            explanationImages: true
                                        }
                                    },
                                    questionImages: true,
                                    questionExplanationImages: true,
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
                            }
                        }
                    },
                    quizAttempts: true,
                    multipleChoiceAttempts: true
                }
            });
        });
    }
    submitAnswers(sessionId, answers) {
        return __awaiter(this, void 0, void 0, function* () {
            for (const answer of answers) {
                if (answer.selectedAnswerId !== undefined) {
                    // Single choice question
                    yield this.submitSingleChoiceAnswer(sessionId, answer.questionId, answer.selectedAnswerId);
                }
                else if (answer.selectedAnswerIds !== undefined) {
                    // Multiple choice question
                    yield this.submitMultipleChoiceAnswer(sessionId, answer.questionId, answer.selectedAnswerIds);
                }
                else if (answer.textAnswer !== undefined) {
                    // QROC question
                    yield this.submitTextAnswerWithResult(sessionId, answer.questionId, answer.textAnswer, answer.isCorrect);
                }
            }
        });
    }
    /**
     * Submit answers and return results with isCorrect for each - Canonical spec
     */
    submitAnswersWithResults(sessionId, answers) {
        return __awaiter(this, void 0, void 0, function* () {
            const results = [];
            for (const answer of answers) {
                let isCorrect = false;
                if (answer.selectedAnswerId !== undefined) {
                    // Single choice question
                    isCorrect = yield this.submitSingleChoiceAnswerWithResult(sessionId, answer.questionId, answer.selectedAnswerId);
                }
                else if (answer.selectedAnswerIds !== undefined) {
                    // Multiple choice question
                    isCorrect = yield this.submitMultipleChoiceAnswerWithResult(sessionId, answer.questionId, answer.selectedAnswerIds);
                }
                else if (answer.textAnswer !== undefined) {
                    // QROC question
                    isCorrect = yield this.submitTextAnswerWithResult(sessionId, answer.questionId, answer.textAnswer, answer.isCorrect);
                }
                results.push({ questionId: answer.questionId, isCorrect });
            }
            return results;
        });
    }
    submitSingleChoiceAnswerWithResult(sessionId, questionId, selectedAnswerId) {
        return __awaiter(this, void 0, void 0, function* () {
            // Get correct answer for validation
            const correctAnswer = yield this.prisma.questionAnswer.findFirst({
                where: {
                    questionId,
                    isCorrect: true
                }
            });
            const isCorrect = (correctAnswer === null || correctAnswer === void 0 ? void 0 : correctAnswer.id) === selectedAnswerId;
            // Use upsert to handle duplicate submissions
            yield this.prisma.quizAttempt.upsert({
                where: {
                    sessionId_questionId: {
                        sessionId,
                        questionId
                    }
                },
                update: {
                    selectedAnswerId,
                    isCorrect,
                    answeredAt: new Date()
                },
                create: {
                    sessionId,
                    questionId,
                    selectedAnswerId,
                    isCorrect,
                    answeredAt: new Date()
                }
            });
            // Update session score after each submission
            yield this.updateSessionScore(sessionId);
            return isCorrect;
        });
    }
    submitMultipleChoiceAnswerWithResult(sessionId, questionId, selectedAnswerIds) {
        return __awaiter(this, void 0, void 0, function* () {
            // Get all correct answers for this question
            const correctAnswers = yield this.prisma.questionAnswer.findMany({
                where: {
                    questionId,
                    isCorrect: true
                }
            });
            const correctAnswerIds = correctAnswers.map(answer => answer.id);
            // Calculate if answer is correct (all correct answers selected, no incorrect ones)
            const selectedSet = new Set(selectedAnswerIds);
            const correctSet = new Set(correctAnswerIds);
            const isCorrect = selectedSet.size === correctSet.size &&
                [...selectedSet].every(id => correctSet.has(id));
            // Calculate partial score (percentage of correct selections)
            const correctSelections = selectedAnswerIds.filter(id => correctSet.has(id)).length;
            const incorrectSelections = selectedAnswerIds.filter(id => !correctSet.has(id)).length;
            const totalCorrectAnswers = correctAnswerIds.length;
            // Partial scoring: (correct selections - incorrect selections) / total correct answers
            // Minimum score is 0
            const partialScore = Math.max(0, (correctSelections - incorrectSelections) / totalCorrectAnswers);
            // Use upsert to handle duplicate submissions
            // Note: selectedAnswerIds is stored as JSON string in database
            yield this.prisma.multipleChoiceAttempt.upsert({
                where: {
                    sessionId_questionId: {
                        sessionId,
                        questionId
                    }
                },
                update: {
                    selectedAnswerIds: JSON.stringify(selectedAnswerIds),
                    isCorrect,
                    partialScore,
                    answeredAt: new Date()
                },
                create: {
                    sessionId,
                    questionId,
                    selectedAnswerIds: JSON.stringify(selectedAnswerIds),
                    isCorrect,
                    partialScore,
                    answeredAt: new Date()
                }
            });
            // Update session score after each submission
            yield this.updateSessionScore(sessionId);
            return isCorrect;
        });
    }
    submitTextAnswerWithResult(sessionId, questionId, textAnswer, isCorrectInput) {
        return __awaiter(this, void 0, void 0, function* () {
            // For QROC, we trust the self-grading input if provided, otherwise default to false (needs manual correction)
            // In future, we might add regex matching or keyword matching here
            const isCorrect = isCorrectInput === true;
            const userManualCorrection = isCorrectInput !== undefined;
            // Use upsert to handle duplicate submissions
            yield this.prisma.quizAttempt.upsert({
                where: {
                    sessionId_questionId: {
                        sessionId,
                        questionId
                    }
                },
                update: {
                    textAnswer,
                    isCorrect,
                    userManualCorrection,
                    answeredAt: new Date()
                },
                create: {
                    sessionId,
                    questionId,
                    textAnswer,
                    isCorrect,
                    userManualCorrection,
                    answeredAt: new Date()
                }
            });
            // Update session score
            yield this.updateSessionScore(sessionId);
            return isCorrect;
        });
    }
    submitSingleChoiceAnswer(sessionId, questionId, selectedAnswerId) {
        return __awaiter(this, void 0, void 0, function* () {
            // Get correct answer for validation
            const correctAnswer = yield this.prisma.questionAnswer.findFirst({
                where: {
                    questionId,
                    isCorrect: true
                }
            });
            const isCorrect = (correctAnswer === null || correctAnswer === void 0 ? void 0 : correctAnswer.id) === selectedAnswerId;
            // Use upsert to handle duplicate submissions
            yield this.prisma.quizAttempt.upsert({
                where: {
                    sessionId_questionId: {
                        sessionId,
                        questionId
                    }
                },
                update: {
                    selectedAnswerId,
                    isCorrect,
                    answeredAt: new Date()
                },
                create: {
                    sessionId,
                    questionId,
                    selectedAnswerId,
                    isCorrect,
                    answeredAt: new Date()
                }
            });
            // Update session score after each submission
            yield this.updateSessionScore(sessionId);
        });
    }
    submitMultipleChoiceAnswer(sessionId, questionId, selectedAnswerIds) {
        return __awaiter(this, void 0, void 0, function* () {
            // Get all correct answers for this question
            const correctAnswers = yield this.prisma.questionAnswer.findMany({
                where: {
                    questionId,
                    isCorrect: true
                }
            });
            const correctAnswerIds = correctAnswers.map(answer => answer.id);
            // Calculate if answer is correct (all correct answers selected, no incorrect ones)
            const selectedSet = new Set(selectedAnswerIds);
            const correctSet = new Set(correctAnswerIds);
            const isCorrect = selectedSet.size === correctSet.size &&
                [...selectedSet].every(id => correctSet.has(id));
            // Calculate partial score (percentage of correct selections)
            const correctSelections = selectedAnswerIds.filter(id => correctSet.has(id)).length;
            const incorrectSelections = selectedAnswerIds.filter(id => !correctSet.has(id)).length;
            const totalCorrectAnswers = correctAnswerIds.length;
            // Partial scoring: (correct selections - incorrect selections) / total correct answers
            // Minimum score is 0
            const partialScore = Math.max(0, (correctSelections - incorrectSelections) / totalCorrectAnswers);
            // Use upsert to handle duplicate submissions
            yield this.prisma.multipleChoiceAttempt.upsert({
                where: {
                    sessionId_questionId: {
                        sessionId,
                        questionId
                    }
                },
                update: {
                    selectedAnswerIds: JSON.stringify(selectedAnswerIds),
                    isCorrect,
                    partialScore,
                    answeredAt: new Date()
                },
                create: {
                    sessionId,
                    questionId,
                    selectedAnswerIds: JSON.stringify(selectedAnswerIds),
                    isCorrect,
                    partialScore,
                    answeredAt: new Date()
                }
            });
            // Update session score and status
            yield this.updateSessionScore(sessionId);
        });
    }
    updateSessionScore(sessionId) {
        return __awaiter(this, void 0, void 0, function* () {
            // Get total number of questions in the session
            const sessionQuestions = yield this.prisma.quizSessionQuestion.findMany({
                where: { sessionId },
                select: { questionId: true }
            });
            const totalQuestions = sessionQuestions.length;
            if (totalQuestions === 0) {
                return; // No questions in session, nothing to calculate
            }
            // Get all single choice attempts
            const singleChoiceAttempts = yield this.prisma.quizAttempt.findMany({
                where: { sessionId }
            });
            // Get all multiple choice attempts
            const multipleChoiceAttempts = yield this.prisma.multipleChoiceAttempt.findMany({
                where: { sessionId }
            });
            // Calculate score from single choice questions
            let totalScore = 0;
            let answeredQuestions = 0;
            // Process single choice attempts
            for (const attempt of singleChoiceAttempts) {
                if (attempt.selectedAnswerId !== null || attempt.textAnswer !== null) {
                    answeredQuestions++;
                    if (attempt.isCorrect) {
                        totalScore += 1; // Full point for correct single choice or QROC
                    }
                }
            }
            // Process multiple choice attempts
            for (const attempt of multipleChoiceAttempts) {
                if (attempt.selectedAnswerIds && attempt.selectedAnswerIds !== '[]') {
                    answeredQuestions++;
                    if (attempt.isCorrect) {
                        totalScore += 1; // Full point for completely correct multiple choice
                    }
                    else if (attempt.partialScore && attempt.partialScore > 0) {
                        totalScore += attempt.partialScore; // Partial credit for partially correct
                    }
                }
            }
            // Calculate percentage
            const percentage = totalQuestions > 0 ? (totalScore / totalQuestions) * 100 : 0;
            // Determine session status
            const allAnswered = answeredQuestions >= totalQuestions;
            const status = allAnswered ? client_1.SessionStatus.COMPLETED : client_1.SessionStatus.IN_PROGRESS;
            // Update session with calculated scores
            yield this.prisma.quizSession.update({
                where: { id: sessionId },
                data: Object.assign(Object.assign({ score: totalScore, percentage: Math.round(percentage * 100) / 100, // Round to 2 decimal places
                    status }, (status === client_1.SessionStatus.COMPLETED && { completedAt: new Date() })), (status === client_1.SessionStatus.IN_PROGRESS && !(yield this.isSessionStarted(sessionId))
                    ? { startedAt: new Date() } : {}))
            });
        });
    }
    isSessionStarted(sessionId) {
        return __awaiter(this, void 0, void 0, function* () {
            const session = yield this.prisma.quizSession.findUnique({
                where: { id: sessionId },
                select: { startedAt: true }
            });
            return (session === null || session === void 0 ? void 0 : session.startedAt) !== null;
        });
    }
    getAvailableFilters(accessibleStudyPackIds, accessibleYearLevels) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            // Get all available years from accessible content
            const yearLevels = yield this.prisma.question.findMany({
                where: {
                    course: {
                        module: {
                            OR: [
                                { unite: { studyPackId: { in: accessibleStudyPackIds } } },
                                { uniteId: null }
                            ]
                        }
                    }
                },
                select: { yearLevel: true },
                distinct: ['yearLevel']
            });
            const availableYears = yearLevels
                .map(q => q.yearLevel)
                .filter(year => year !== null);
            // Get question counts by type, filtered by accessible year levels
            const questionTypeCountsWhere = {
                course: {
                    module: {
                        OR: [
                            { unite: { studyPackId: { in: accessibleStudyPackIds } } },
                            { uniteId: null }
                        ]
                    }
                }
            };
            // Add year level filtering if provided
            if (accessibleYearLevels && accessibleYearLevels.length > 0) {
                questionTypeCountsWhere.yearLevel = { in: accessibleYearLevels };
            }
            const questionTypeCounts = yield this.prisma.question.groupBy({
                by: ['questionType'],
                where: questionTypeCountsWhere,
                _count: {
                    id: true
                }
            });
            // Format question type counts
            const singleChoiceCount = ((_a = questionTypeCounts.find(q => q.questionType === 'SINGLE_CHOICE')) === null || _a === void 0 ? void 0 : _a._count.id) || 0;
            const multipleChoiceCount = ((_b = questionTypeCounts.find(q => q.questionType === 'MULTIPLE_CHOICE')) === null || _b === void 0 ? void 0 : _b._count.id) || 0;
            // Get unites with modules and courses
            const unites = yield this.prisma.unite.findMany({
                where: {
                    studyPackId: { in: accessibleStudyPackIds }
                },
                include: {
                    studyPack: true,
                    modules: {
                        include: {
                            courses: {
                                include: {
                                    _count: {
                                        select: { questions: true }
                                    }
                                }
                            }
                        }
                    }
                }
            });
            // Get question type counts by course, filtered by accessible year levels
            const courseQuestionTypeCountsWhere = {
                course: {
                    module: {
                        OR: [
                            { unite: { studyPackId: { in: accessibleStudyPackIds } } },
                            { uniteId: null }
                        ]
                    }
                }
            };
            // Add year level filtering if provided
            if (accessibleYearLevels && accessibleYearLevels.length > 0) {
                courseQuestionTypeCountsWhere.yearLevel = { in: accessibleYearLevels };
            }
            const courseQuestionTypeCounts = yield this.prisma.question.groupBy({
                by: ['courseId', 'questionType'],
                where: courseQuestionTypeCountsWhere,
                _count: {
                    id: true
                }
            });
            // Get quiz sources with their available years using raw SQL
            // (Temporary solution until Prisma client is regenerated)
            // Get available quiz years
            let availableQuizYears = [];
            try {
                const allYearsRaw = yield this.prisma.$queryRaw `
        SELECT DISTINCT quiz_year
        FROM quizzes
        WHERE quiz_year IS NOT NULL
        ORDER BY quiz_year DESC
      `;
                availableQuizYears = allYearsRaw
                    .map((row) => row.quiz_year)
                    .filter((year) => year !== null);
            }
            catch (error) {
                console.log('Error fetching quiz years:', error);
                availableQuizYears = [];
            }
            // Get question sources with their question counts
            let questionSources = [];
            try {
                const questionSourcesRaw = yield this.prisma.$queryRaw `
        SELECT qs.id, qs.name, COUNT(q.id) as question_count
        FROM question_sources qs
        LEFT JOIN questions q ON q.source_id = qs.id
        LEFT JOIN courses c ON q.course_id = c.id
        LEFT JOIN modules m ON c.module_id = m.id
        LEFT JOIN unites u ON m.unite_id = u.id
        WHERE u.study_pack_id IN (${accessibleStudyPackIds.join(',')})
        GROUP BY qs.id, qs.name
        ORDER BY qs.name
      `;
                questionSources = questionSourcesRaw.map((row) => ({
                    id: row.id,
                    name: row.name,
                    questionCount: Number(row.question_count) || 0
                }));
            }
            catch (error) {
                console.log('Error fetching question sources:', error);
                questionSources = [];
            }
            return {
                availableYears,
                singleChoiceQuestionCount: singleChoiceCount,
                multipleChoiceQuestionCount: multipleChoiceCount,
                unites: unites.map(unite => ({
                    id: unite.id,
                    name: unite.name,
                    year: unite.studyPack.yearNumber || client_1.YearLevel.ONE,
                    modules: unite.modules.map(module => ({
                        id: module.id,
                        name: module.name,
                        courses: module.courses.map(course => {
                            var _a, _b;
                            // Get question type counts for this course
                            const courseSingleChoice = ((_a = courseQuestionTypeCounts.find(q => q.courseId === course.id && q.questionType === 'SINGLE_CHOICE')) === null || _a === void 0 ? void 0 : _a._count.id) || 0;
                            const courseMultipleChoice = ((_b = courseQuestionTypeCounts.find(q => q.courseId === course.id && q.questionType === 'MULTIPLE_CHOICE')) === null || _b === void 0 ? void 0 : _b._count.id) || 0;
                            return {
                                id: course.id,
                                name: course.name,
                                questionCount: courseSingleChoice + courseMultipleChoice,
                                singleChoiceQuestionCount: courseSingleChoice,
                                multipleChoiceQuestionCount: courseMultipleChoice
                            };
                        })
                    }))
                })),
                availableQuizYears,
                questionSources: questionSources
            };
        });
    }
    getResidencySessionFilters() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            // For residency users, get ALL study packs (same as regular quiz-filters)
            // Residency users have access to all questions in the system
            const allStudyPacks = yield this.prisma.studyPack.findMany({
                select: {
                    id: true
                }
            });
            const accessibleStudyPackIds = allStudyPacks.map(pack => pack.id);
            // Get unites for all accessible study packs (same structure as regular quiz-filters)
            const unites = yield this.prisma.unite.findMany({
                where: {
                    studyPackId: {
                        in: accessibleStudyPackIds
                    }
                },
                select: {
                    id: true,
                    name: true,
                    studyPack: {
                        select: {
                            yearNumber: true
                        }
                    },
                    modules: {
                        select: {
                            id: true,
                            name: true,
                            courses: {
                                select: {
                                    id: true,
                                    name: true,
                                    _count: {
                                        select: {
                                            questions: true
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            });
            // Get question type counts for courses (same as regular quiz-filters)
            const courseQuestionTypeCounts = yield this.prisma.question.groupBy({
                by: ['courseId', 'questionType'],
                where: {
                    course: {
                        module: {
                            unite: {
                                studyPackId: {
                                    in: accessibleStudyPackIds
                                }
                            }
                        }
                    }
                },
                _count: {
                    id: true
                }
            });
            // Get available years from all accessible questions
            const availableYearsResult = yield this.prisma.question.findMany({
                where: {
                    course: {
                        module: {
                            unite: {
                                studyPackId: {
                                    in: accessibleStudyPackIds
                                }
                            }
                        }
                    }
                },
                select: {
                    yearLevel: true
                },
                distinct: ['yearLevel']
            });
            const availableYears = availableYearsResult.map(q => q.yearLevel).filter((year) => year !== null);
            // Calculate total question counts
            const totalQuestionCounts = yield this.prisma.question.groupBy({
                by: ['questionType'],
                where: {
                    course: {
                        module: {
                            unite: {
                                studyPackId: {
                                    in: accessibleStudyPackIds
                                }
                            }
                        }
                    }
                },
                _count: {
                    id: true
                }
            });
            const singleChoiceCount = ((_a = totalQuestionCounts.find(q => q.questionType === 'SINGLE_CHOICE')) === null || _a === void 0 ? void 0 : _a._count.id) || 0;
            const multipleChoiceCount = ((_b = totalQuestionCounts.find(q => q.questionType === 'MULTIPLE_CHOICE')) === null || _b === void 0 ? void 0 : _b._count.id) || 0;
            // Get question sources with their question counts
            let questionSources = [];
            try {
                const questionSourcesRaw = yield this.prisma.$queryRaw `
        SELECT qs.id, qs.name, COUNT(q.id) as question_count
        FROM question_sources qs
        LEFT JOIN questions q ON q.source_id = qs.id
        GROUP BY qs.id, qs.name
        ORDER BY qs.name
      `;
                questionSources = questionSourcesRaw.map((row) => ({
                    id: row.id,
                    name: row.name,
                    questionCount: Number(row.question_count) || 0
                }));
            }
            catch (error) {
                console.log('Error fetching question sources for residency:', error);
                questionSources = [];
            }
            // Get available quiz years (same as regular quiz-filters)
            const availableQuizYears = [2024, 2023, 2022, 2021, 2020];
            // Get all specialties for residency-specific data
            const specialties = yield this.prisma.specialty.findMany({
                select: {
                    id: true,
                    name: true
                }
            });
            // For residency, all specialties have access to all questions in the system
            const processedSpecialties = specialties.map(specialty => ({
                id: specialty.id,
                name: specialty.name,
                questionCount: singleChoiceCount + multipleChoiceCount,
                availableYears: availableYears.filter((year) => year !== null)
            }));
            // Get universities with available exam years for residency
            const universitiesData = yield this.prisma.university.findMany({
                where: {
                    questions: {
                        some: {
                            examYear: { not: null }
                        }
                    }
                },
                select: {
                    id: true,
                    name: true,
                    questions: {
                        where: {
                            examYear: { not: null }
                        },
                        select: {
                            examYear: true
                        },
                        distinct: ['examYear']
                    }
                }
            });
            const universities = universitiesData.map(u => ({
                id: u.id,
                name: u.name,
                examYears: u.questions.map(q => q.examYear).sort((a, b) => b - a)
            }));
            return {
                availableYears,
                singleChoiceQuestionCount: singleChoiceCount,
                multipleChoiceQuestionCount: multipleChoiceCount,
                unites: unites.map(unite => ({
                    id: unite.id,
                    name: unite.name,
                    year: unite.studyPack.yearNumber || client_1.YearLevel.ONE,
                    modules: unite.modules.map(module => ({
                        id: module.id,
                        name: module.name,
                        courses: module.courses.map(course => {
                            var _a, _b;
                            // Get question type counts for this course
                            const courseSingleChoice = ((_a = courseQuestionTypeCounts.find(q => q.courseId === course.id && q.questionType === 'SINGLE_CHOICE')) === null || _a === void 0 ? void 0 : _a._count.id) || 0;
                            const courseMultipleChoice = ((_b = courseQuestionTypeCounts.find(q => q.courseId === course.id && q.questionType === 'MULTIPLE_CHOICE')) === null || _b === void 0 ? void 0 : _b._count.id) || 0;
                            return {
                                id: course.id,
                                name: course.name,
                                questionCount: course._count.questions,
                                singleChoiceQuestionCount: courseSingleChoice,
                                multipleChoiceQuestionCount: courseMultipleChoice
                            };
                        })
                    }))
                })),
                availableQuizYears,
                availableSpecialties: processedSpecialties,
                universities,
                totalQuestionCount: singleChoiceCount + multipleChoiceCount,
                questionSources: questionSources
            };
        });
    }
    getAllStudyPackIds() {
        return __awaiter(this, void 0, void 0, function* () {
            const allStudyPacks = yield this.prisma.studyPack.findMany({
                select: {
                    id: true
                }
            });
            return allStudyPacks.map(pack => pack.id);
        });
    }
    getExamSessionFilters(accessibleStudyPackIds) {
        return __awaiter(this, void 0, void 0, function* () {
            // Get all questions with their hierarchical relationships
            const questions = yield this.prisma.question.findMany({
                where: {
                    course: {
                        module: {
                            OR: [
                                { unite: { studyPackId: { in: accessibleStudyPackIds } } },
                                { uniteId: null }
                            ]
                        }
                    },
                    universityId: { not: null } // Only include questions with university
                    // Note: We now include questions without examYear and handle them with a default year
                },
                select: {
                    id: true,
                    questionType: true,
                    examYear: true,
                    universityId: true,
                    course: {
                        select: {
                            id: true,
                            name: true,
                            module: {
                                select: {
                                    id: true,
                                    name: true,
                                    unite: {
                                        select: {
                                            id: true,
                                            name: true
                                        }
                                    }
                                }
                            }
                        }
                    },
                    university: {
                        select: {
                            id: true,
                            name: true
                        }
                    }
                }
            });
            // Group questions hierarchically
            const uniteMap = new Map();
            questions.forEach(question => {
                var _a, _b, _c, _d;
                if (!question.course)
                    return; // Skip if course is null
                const uniteId = (_b = (_a = question.course.module.unite) === null || _a === void 0 ? void 0 : _a.id) !== null && _b !== void 0 ? _b : 0;
                const moduleId = question.course.module.id;
                const universityId = question.universityId;
                // Use examYear if available, otherwise use a default year (e.g., 9999 for "No Year Specified")
                const year = question.examYear || 9999;
                // Initialize unite if not exists
                if (!uniteMap.has(uniteId)) {
                    uniteMap.set(uniteId, {
                        id: uniteId,
                        title: (_d = (_c = question.course.module.unite) === null || _c === void 0 ? void 0 : _c.name) !== null && _d !== void 0 ? _d : 'Unknown',
                        modules: new Map()
                    });
                }
                const unite = uniteMap.get(uniteId);
                // Initialize module if not exists
                if (!unite.modules.has(moduleId)) {
                    unite.modules.set(moduleId, {
                        id: moduleId,
                        title: question.course.module.name,
                        universities: new Map()
                    });
                }
                const module = unite.modules.get(moduleId);
                // Initialize university if not exists
                if (!module.universities.has(universityId)) {
                    module.universities.set(universityId, {
                        id: universityId,
                        name: question.university.name,
                        years: new Map()
                    });
                }
                const university = module.universities.get(universityId);
                // Initialize year if not exists
                if (!university.years.has(year)) {
                    university.years.set(year, {
                        year,
                        questionSingleCount: 0,
                        questionMultipleCount: 0,
                        questionSingleChoiceIds: [],
                        questionMultipleChoiceIds: []
                    });
                }
                const yearData = university.years.get(year);
                // Add question to appropriate arrays and update counts
                if (question.questionType === 'SINGLE_CHOICE') {
                    yearData.questionSingleCount++;
                    yearData.questionSingleChoiceIds.push(question.id);
                }
                else if (question.questionType === 'MULTIPLE_CHOICE') {
                    yearData.questionMultipleCount++;
                    yearData.questionMultipleChoiceIds.push(question.id);
                }
            });
            // Convert maps to arrays and sort
            const unites = Array.from(uniteMap.values()).map(unite => ({
                id: unite.id,
                title: unite.title,
                modules: Array.from(unite.modules.values()).map(module => ({
                    id: module.id,
                    title: module.title,
                    universities: Array.from(module.universities.values()).map(university => ({
                        id: university.id,
                        name: university.name,
                        years: Array.from(university.years.values()).sort((a, b) => b.year - a.year) // Sort years descending
                    })).sort((a, b) => a.name.localeCompare(b.name)) // Sort universities alphabetically
                })).sort((a, b) => a.title.localeCompare(b.title)) // Sort modules alphabetically
            })).sort((a, b) => a.title.localeCompare(b.title)); // Sort unites alphabetically
            return { unites };
        });
    }
    getUserQuizSessions(userId_1) {
        return __awaiter(this, arguments, void 0, function* (userId, page = 1, limit = 10) {
            const skip = (page - 1) * limit;
            const [sessions, total] = yield Promise.all([
                this.prisma.quizSession.findMany({
                    where: { userId },
                    include: {
                        quiz: true,
                        exam: true,
                        _count: {
                            select: {
                                sessionQuestions: true,
                                quizAttempts: true
                            }
                        }
                    },
                    orderBy: { createdAt: 'desc' },
                    skip,
                    take: limit
                }),
                this.prisma.quizSession.count({
                    where: { userId }
                })
            ]);
            return { sessions, total };
        });
    }
    /**
     * Get user quiz sessions filtered by type
     */
    getUserQuizSessionsByType(userId_1, sessionType_1) {
        return __awaiter(this, arguments, void 0, function* (userId, sessionType, limit = 10, offset = 0) {
            const [sessions, total] = yield Promise.all([
                this.prisma.quizSession.findMany({
                    where: { userId, type: sessionType },
                    include: {
                        _count: {
                            select: {
                                sessionQuestions: true,
                                quizAttempts: true
                            }
                        }
                    },
                    orderBy: { createdAt: 'desc' },
                    skip: offset,
                    take: limit
                }),
                this.prisma.quizSession.count({
                    where: { userId, type: sessionType }
                })
            ]);
            return { sessions, total };
        });
    }
    // Additional validation methods for enhanced error handling
    getSessionQuestionIds(sessionId) {
        return __awaiter(this, void 0, void 0, function* () {
            const sessionQuestions = yield this.prisma.quizSessionQuestion.findMany({
                where: { sessionId },
                select: { questionId: true }
            });
            return sessionQuestions.map(sq => sq.questionId);
        });
    }
    validateAnswerBelongsToQuestion(answerId, questionId) {
        return __awaiter(this, void 0, void 0, function* () {
            const answer = yield this.prisma.questionAnswer.findFirst({
                where: {
                    id: answerId,
                    questionId: questionId
                }
            });
            return answer !== null;
        });
    }
    validateAnswersBelongToQuestion(answerIds, questionId) {
        return __awaiter(this, void 0, void 0, function* () {
            const answers = yield this.prisma.questionAnswer.findMany({
                where: {
                    id: { in: answerIds },
                    questionId: questionId
                }
            });
            return answers.length === answerIds.length;
        });
    }
    checkExistingAnswer(sessionId, questionId) {
        return __awaiter(this, void 0, void 0, function* () {
            const attempt = yield this.prisma.quizAttempt.findUnique({
                where: {
                    sessionId_questionId: {
                        sessionId,
                        questionId
                    }
                }
            });
            return attempt !== null;
        });
    }
    validateSessionAccess(sessionId, userId) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.prisma.quizSession.findFirst({
                where: {
                    id: sessionId,
                    userId: userId
                }
            });
        });
    }
    // ==========================================
    // RETAKE SESSION FUNCTIONALITY
    // ==========================================
    createRetakeSession(userId, title, type, originalSessionId, retakeType, quizType) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.prisma.quizSession.create({
                data: {
                    userId,
                    title,
                    type,
                    quizType,
                    status: client_1.SessionStatus.NOT_STARTED,
                    originalSessionId,
                    retakeType,
                    isRetake: true
                }
            });
        });
    }
    getIncorrectQuestionIds(sessionId) {
        return __awaiter(this, void 0, void 0, function* () {
            const incorrectAttempts = yield this.prisma.quizAttempt.findMany({
                where: {
                    sessionId,
                    isCorrect: false,
                    selectedAnswerId: { not: null } // Only answered questions
                },
                select: { questionId: true }
            });
            return incorrectAttempts.map(attempt => attempt.questionId);
        });
    }
    getCorrectQuestionIds(sessionId) {
        return __awaiter(this, void 0, void 0, function* () {
            const correctAttempts = yield this.prisma.quizAttempt.findMany({
                where: {
                    sessionId,
                    isCorrect: true
                },
                select: { questionId: true }
            });
            return correctAttempts.map(attempt => attempt.questionId);
        });
    }
    getNotRespondedQuestionIds(sessionId) {
        return __awaiter(this, void 0, void 0, function* () {
            const notRespondedAttempts = yield this.prisma.quizAttempt.findMany({
                where: {
                    sessionId,
                    selectedAnswerId: null // Questions that were not answered
                },
                select: { questionId: true }
            });
            return notRespondedAttempts.map(attempt => attempt.questionId);
        });
    }
    getRetakeSessionHistory(originalSessionId) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.prisma.quizSession.findMany({
                where: {
                    originalSessionId,
                    isRetake: true
                },
                include: {
                    _count: {
                        select: {
                            sessionQuestions: true,
                            quizAttempts: true
                        }
                    }
                },
                orderBy: { createdAt: 'desc' }
            });
        });
    }
    deleteQuizSession(sessionId) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.prisma.quizSession.delete({
                where: {
                    id: sessionId
                }
            });
        });
    }
    /**
     * Update session status with proper timestamp handling
     */
    updateSessionStatus(sessionId, status, userId) {
        return __awaiter(this, void 0, void 0, function* () {
            const updateData = {
                status,
                updatedAt: new Date()
            };
            // Set appropriate timestamps based on status
            if (status === client_1.SessionStatus.IN_PROGRESS) {
                // Only set startedAt if it's not already set
                const existingSession = yield this.prisma.quizSession.findUnique({
                    where: { id: sessionId },
                    select: { startedAt: true }
                });
                if (!(existingSession === null || existingSession === void 0 ? void 0 : existingSession.startedAt)) {
                    updateData.startedAt = new Date();
                }
            }
            else if (status === client_1.SessionStatus.COMPLETED) {
                updateData.completedAt = new Date();
                // Ensure startedAt is set if not already
                const existingSession = yield this.prisma.quizSession.findUnique({
                    where: { id: sessionId },
                    select: { startedAt: true }
                });
                if (!(existingSession === null || existingSession === void 0 ? void 0 : existingSession.startedAt)) {
                    updateData.startedAt = new Date();
                }
            }
            return yield this.prisma.quizSession.update({
                where: {
                    id: sessionId,
                    userId: userId // Ensure user owns the session
                },
                data: updateData
            });
        });
    }
    /**
     * Check if a status transition is valid
     */
    isValidStatusTransition(currentStatus, newStatus) {
        var _a;
        const validTransitions = {
            [client_1.SessionStatus.NOT_STARTED]: [client_1.SessionStatus.IN_PROGRESS, client_1.SessionStatus.COMPLETED],
            [client_1.SessionStatus.IN_PROGRESS]: [client_1.SessionStatus.COMPLETED, client_1.SessionStatus.NOT_STARTED], // Allow reset
            [client_1.SessionStatus.COMPLETED]: [client_1.SessionStatus.NOT_STARTED] // Allow reset for retakes
        };
        return ((_a = validTransitions[currentStatus]) === null || _a === void 0 ? void 0 : _a.includes(newStatus)) || currentStatus === newStatus;
    }
    /**
     * Validate that all question IDs exist and are accessible to the user
     */
    validateQuestionAccess(questionIds, accessibleStudyPackIds) {
        return __awaiter(this, void 0, void 0, function* () {
            // Get all questions with the provided IDs
            const existingQuestions = yield this.prisma.question.findMany({
                where: {
                    id: { in: questionIds }
                },
                include: {
                    course: {
                        include: {
                            module: {
                                include: {
                                    unite: {
                                        include: {
                                            studyPack: true
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            });
            const existingIds = existingQuestions.map(q => q.id);
            const invalidIds = questionIds.filter(id => !existingIds.includes(id));
            // Check which questions are not accessible (not in user's study packs)
            const inaccessibleIds = existingQuestions
                .filter(q => q.course && q.course.module.unite && !accessibleStudyPackIds.includes(q.course.module.unite.studyPackId))
                .map(q => q.id);
            return {
                existingQuestions,
                invalidIds,
                inaccessibleIds
            };
        });
    }
    /**
     * Get all question IDs associated with a specific label for a user
     */
    getQuestionIdsByLabelId(labelId, userId) {
        return __awaiter(this, void 0, void 0, function* () {
            const questionLabels = yield this.prisma.questionLabel.findMany({
                where: {
                    labelId,
                    userId
                },
                select: {
                    questionId: true
                }
            });
            return questionLabels.map(ql => ql.questionId);
        });
    }
    /**
     * Create a quiz session with specific questions
     */
    createSessionWithQuestions(userId, title, sessionType, questionIds) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.prisma.quizSession.create({
                data: {
                    userId,
                    title,
                    type: sessionType,
                    status: client_1.SessionStatus.NOT_STARTED,
                    score: 0,
                    percentage: 0,
                    // Create session questions for the questions relationship
                    sessionQuestions: {
                        create: questionIds.map((questionId) => ({
                            questionId
                        }))
                    },
                    // Create quiz attempts for each question
                    quizAttempts: {
                        create: questionIds.map((questionId) => ({
                            questionId,
                            isCorrect: null // Will be set when answered
                        }))
                    }
                },
                include: {
                    sessionQuestions: {
                        include: {
                            question: {
                                include: {
                                    source: {
                                        select: {
                                            id: true,
                                            name: true
                                        }
                                    },
                                    questionAnswers: {
                                        include: {
                                            explanationImages: true
                                        }
                                    }
                                }
                            }
                        }
                    },
                    quizAttempts: {
                        include: {
                            question: true
                        }
                    }
                }
            });
        });
    }
    getQuestionCount(accessibleStudyPackIds, filters) {
        return __awaiter(this, void 0, void 0, function* () {
            // Build the where clause based on filters
            // Handle both modules with a unite (study pack access) and independent modules (no unite)
            const whereClause = {
                course: {
                    module: {
                        OR: [
                            { unite: { studyPackId: { in: accessibleStudyPackIds } } },
                            { uniteId: null }
                        ]
                    }
                },
                universityId: { not: null } // Only include questions with university
            };
            // Apply filters if provided
            if (filters.unite) {
                // When filtering by unite, only match modules with that specific unite
                whereClause.course.module = {
                    unite: {
                        id: filters.unite,
                        studyPackId: { in: accessibleStudyPackIds }
                    }
                };
            }
            if (filters.module) {
                whereClause.course.module.id = filters.module;
            }
            if (filters.university) {
                whereClause.universityId = filters.university;
            }
            if (filters.year) {
                // Handle special case for year 9999 (questions without examYear)
                if (filters.year === 9999) {
                    whereClause.examYear = null;
                }
                else {
                    whereClause.examYear = filters.year;
                }
            }
            // Count questions matching the filters
            const count = yield this.prisma.question.count({
                where: whereClause
            });
            return count;
        });
    }
    // ==========================================
    // CANONICAL SPEC ENDPOINTS
    // ==========================================
    /**
     * GET /quizzes/session-filters - Canonical spec
     * Returns filter options with question counts
     * Optional filters: { uniteId, moduleId } for cascading filter behavior
     */
    getSessionFiltersCanonical(studyPackIds, filters) {
        return __awaiter(this, void 0, void 0, function* () {
            // Build baseWhere with optional uniteId/moduleId constraints for cascading filters
            const baseWhere = {
                course: {
                    module: {
                        OR: [
                            { unite: { studyPackId: { in: studyPackIds } } },
                            { uniteId: null }
                        ]
                    }
                }
            };
            // Apply uniteId filter if provided
            if (filters === null || filters === void 0 ? void 0 : filters.uniteId) {
                baseWhere.course.module.uniteId = filters.uniteId;
            }
            // Apply moduleId filter if provided
            if (filters === null || filters === void 0 ? void 0 : filters.moduleId) {
                baseWhere.course.moduleId = filters.moduleId;
            }
            // Get universities with question counts
            const universitiesData = yield this.prisma.university.findMany({
                where: {
                    questions: {
                        some: baseWhere
                    }
                },
                select: {
                    id: true,
                    name: true,
                    country: true,
                    _count: {
                        select: {
                            questions: {
                                where: baseWhere
                            }
                        }
                    }
                }
            });
            const universities = universitiesData.map(u => ({
                id: u.id,
                name: u.name,
                country: u.country,
                questionCount: u._count.questions
            }));
            // Get question sources with counts
            const sourcesData = yield this.prisma.questionSource.findMany({
                where: {
                    questions: {
                        some: baseWhere
                    }
                },
                select: {
                    id: true,
                    name: true,
                    _count: {
                        select: {
                            questions: {
                                where: baseWhere
                            }
                        }
                    }
                }
            });
            const questionSources = sourcesData.map(s => ({
                id: s.id,
                name: s.name,
                questionCount: s._count.questions
            }));
            // Get exam years with counts
            const examYearsData = yield this.prisma.question.groupBy({
                by: ['examYear'],
                where: Object.assign(Object.assign({}, baseWhere), { examYear: { not: null } }),
                _count: true
            });
            const examYears = examYearsData
                .filter(e => e.examYear !== null)
                .map(e => ({
                year: e.examYear,
                questionCount: e._count
            }))
                .sort((a, b) => b.year - a.year);
            // Get rotations (year levels R1-R4) with counts
            const rotationsData = yield this.prisma.question.groupBy({
                by: ['yearLevel'],
                where: Object.assign(Object.assign({}, baseWhere), { yearLevel: { not: null } }),
                _count: true
            });
            const rotations = rotationsData
                .filter(r => r.yearLevel !== null)
                .map(r => ({
                rotation: r.yearLevel,
                questionCount: r._count
            }));
            // Get unites with modules and question counts
            const unitesData = yield this.prisma.unite.findMany({
                where: {
                    studyPackId: { in: studyPackIds }
                },
                include: {
                    modules: {
                        include: {
                            courses: {
                                include: {
                                    _count: {
                                        select: { questions: true }
                                    }
                                }
                            }
                        }
                    }
                }
            });
            const unites = unitesData.map(unite => {
                const modules = unite.modules.map(module => {
                    const moduleQuestionCount = module.courses.reduce((sum, course) => sum + course._count.questions, 0);
                    return {
                        id: module.id,
                        name: module.name,
                        questionCount: moduleQuestionCount
                    };
                });
                return {
                    id: unite.id,
                    name: unite.name,
                    questionCount: modules.reduce((sum, m) => sum + m.questionCount, 0),
                    modules
                };
            });
            // Get individual modules (flat list)
            const individualModules = unites.flatMap(u => u.modules);
            // Get total question count
            const totalQuestionCount = yield this.prisma.question.count({
                where: baseWhere
            });
            return {
                universities,
                questionSources,
                examYears,
                rotations,
                unites,
                individualModules,
                totalQuestionCount
            };
        });
    }
    /**
     * POST /quizzes/question-count - Canonical spec
     * Returns totalQuestionCount and accessibleQuestionCount
     */
    getQuestionCountCanonical(studyPackIds, filters) {
        return __awaiter(this, void 0, void 0, function* () {
            const whereClause = {
                courseId: { in: filters.courseIds }
            };
            if (filters.questionTypes && filters.questionTypes.length > 0) {
                whereClause.questionType = { in: filters.questionTypes };
            }
            if (filters.years && filters.years.length > 0) {
                whereClause.examYear = { in: filters.years };
            }
            if (filters.rotations && filters.rotations.length > 0) {
                whereClause.yearLevel = { in: filters.rotations };
            }
            if (filters.universityIds && filters.universityIds.length > 0) {
                whereClause.universityId = { in: filters.universityIds };
            }
            if (filters.questionSourceIds && filters.questionSourceIds.length > 0) {
                whereClause.sourceId = { in: filters.questionSourceIds };
            }
            // Repetition count filter: questions with count >= provided value
            if (filters.repetitionCountMin !== undefined && filters.repetitionCountMin > 0) {
                whereClause.repetitionCount = { gte: filters.repetitionCountMin };
            }
            if (filters.repetitionYears && filters.repetitionYears.length > 0) {
                whereClause.OR = filters.repetitionYears.map(year => ({
                    repetitionYears: { contains: String(year) }
                }));
            }
            // === DIAGNOSTIC LOGGING ===
            // Raw sanity check: how many questions exist in DB at all?
            const rawTotal = yield this.prisma.question.count();
            // Count with just courseId filter (no universityId etc)
            const courseOnly = yield this.prisma.question.count({
                where: { courseId: { in: filters.courseIds } }
            });
            console.log("[DIAG question-count] whereClause:", JSON.stringify(whereClause));
            console.log("[DIAG question-count] rawTotal (all questions in DB):", rawTotal);
            console.log("[DIAG question-count] courseOnly (courseId IN filter only):", courseOnly);
            console.log("[DIAG question-count] studyPackIds:", JSON.stringify(studyPackIds));
            // === END DIAGNOSTIC ===
            // Total question count (all questions matching filters)
            const totalQuestionCount = yield this.prisma.question.count({
                where: whereClause
            });
            console.log("[DIAG question-count] totalQuestionCount:", totalQuestionCount);
            // Accessible question count (questions in accessible study packs)
            // Must handle both: modules linked to a unite (with studyPack), and independent modules (no unite)
            const accessibleQuestionCount = yield this.prisma.question.count({
                where: Object.assign(Object.assign({}, whereClause), { course: {
                        module: {
                            OR: [
                                // Modules that belong to a unite with an accessible study pack
                                { unite: { studyPackId: { in: studyPackIds } } },
                                // Independent modules (no unite) — no ACL path, so consider accessible
                                { uniteId: null }
                            ]
                        }
                    } })
            });
            return { totalQuestionCount, accessibleQuestionCount };
        });
    }
    /**
     * GET /quizzes/questions-by-unite-or-module - Canonical spec
     * Returns questions for a specific unite or module
     */
    getQuestionsByUniteOrModule(studyPackIds, uniteId, moduleId) {
        return __awaiter(this, void 0, void 0, function* () {
            const whereClause = {
                course: {
                    module: {
                        OR: [
                            { unite: { studyPackId: { in: studyPackIds } } },
                            { uniteId: null }
                        ]
                    }
                }
            };
            if (uniteId) {
                whereClause.course.module.uniteId = uniteId;
            }
            if (moduleId) {
                whereClause.course.moduleId = moduleId;
            }
            const questions = yield this.prisma.question.findMany({
                where: whereClause,
                include: {
                    questionAnswers: {
                        select: {
                            id: true,
                            answerText: true,
                            isCorrect: true,
                            explanation: true
                        }
                    },
                    questionImages: {
                        select: {
                            id: true,
                            imagePath: true,
                            altText: true
                        }
                    },
                    course: {
                        select: {
                            id: true,
                            name: true,
                            module: {
                                select: {
                                    id: true,
                                    name: true,
                                    unite: {
                                        select: {
                                            id: true,
                                            name: true
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            });
            return {
                questions: questions.map(q => ({
                    id: q.id,
                    questionText: q.questionText,
                    questionType: q.questionType,
                    explanation: q.explanation,
                    examYear: q.examYear,
                    answers: q.questionAnswers.map(a => ({
                        id: a.id,
                        answerText: a.answerText,
                        isCorrect: a.isCorrect,
                        explanation: a.explanation
                    })),
                    images: q.questionImages.map(i => ({
                        id: i.id,
                        imagePath: i.imagePath,
                        altText: i.altText
                    })),
                    course: q.course ? {
                        id: q.course.id,
                        name: q.course.name,
                        module: q.course.module ? {
                            id: q.course.module.id,
                            name: q.course.module.name,
                            unite: q.course.module.unite ? {
                                id: q.course.module.unite.id,
                                name: q.course.module.unite.name
                            } : null
                        } : null
                    } : null
                }))
            };
        });
    }
    /**
     * POST /quizzes/sessions - Canonical spec
     * Get questions for creating a canonical session
     * @param questionCount - Optional limit for number of questions. If provided, questions are randomly selected.
     */
    getQuestionsForCanonicalSession(studyPackIds, filters, questionCount) {
        return __awaiter(this, void 0, void 0, function* () {
            const whereClause = {
                courseId: { in: filters.courseIds },
                course: {
                    module: {
                        OR: [
                            { unite: { studyPackId: { in: studyPackIds } } },
                            { uniteId: null }
                        ]
                    }
                }
            };
            if (filters.questionTypes && filters.questionTypes.length > 0) {
                whereClause.questionType = { in: filters.questionTypes };
            }
            if (filters.years && filters.years.length > 0) {
                whereClause.examYear = { in: filters.years };
            }
            if (filters.universityIds && filters.universityIds.length > 0) {
                whereClause.universityId = { in: filters.universityIds };
            }
            if (filters.questionSourceIds && filters.questionSourceIds.length > 0) {
                whereClause.sourceId = { in: filters.questionSourceIds };
            }
            // Repetition count filter: questions with count >= provided value
            if (filters.repetitionCountMin !== undefined && filters.repetitionCountMin > 0) {
                whereClause.repetitionCount = { gte: filters.repetitionCountMin };
            }
            // Repetition years filter: questions that appeared in at least one of the provided years (hasSome)
            if (filters.repetitionYears && filters.repetitionYears.length > 0) {
                whereClause.OR = filters.repetitionYears.map(year => ({
                    repetitionYears: { contains: String(year) }
                }));
            }
            // If questionCount is specified, fetch all matching questions and randomly select
            if (questionCount && questionCount > 0) {
                const allQuestions = yield this.prisma.question.findMany({
                    where: whereClause,
                    select: { id: true }
                });
                // Shuffle questions using Fisher-Yates algorithm and take the requested count
                const shuffled = [...allQuestions];
                for (let i = shuffled.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
                }
                return shuffled.slice(0, questionCount);
            }
            // No limit specified - return all matching questions
            const questions = yield this.prisma.question.findMany({
                where: whereClause,
                select: { id: true }
            });
            return questions;
        });
    }
    // ==========================================
    // RESIDENCY SESSION ENDPOINTS (Canonical spec)
    // ==========================================
    /**
     * GET /quizzes/residency-sessions-only - Canonical spec
     * Returns array of residency sessions for the logged-in user
     */
    getResidencySessionsOnlyCanonical(userId) {
        return __awaiter(this, void 0, void 0, function* () {
            const sessions = yield this.prisma.quizSession.findMany({
                where: {
                    userId,
                    // Sessions that have questions with universityId and examYear (residency-type)
                    sessionQuestions: {
                        some: {
                            question: {
                                universityId: { not: null },
                                examYear: { not: null }
                            }
                        }
                    }
                },
                include: {
                    sessionQuestions: {
                        include: {
                            question: {
                                include: {
                                    university: {
                                        select: { id: true, name: true }
                                    }
                                }
                            }
                        }
                    },
                    quizAttempts: {
                        select: {
                            isCorrect: true
                        }
                    }
                },
                orderBy: {
                    createdAt: 'desc'
                }
            });
            // Transform to canonical format
            return sessions.map(session => {
                var _a, _b;
                // Get the first question's university and examYear as representative
                const firstQuestion = (_a = session.sessionQuestions[0]) === null || _a === void 0 ? void 0 : _a.question;
                const university = firstQuestion === null || firstQuestion === void 0 ? void 0 : firstQuestion.university;
                const examYear = firstQuestion === null || firstQuestion === void 0 ? void 0 : firstQuestion.examYear;
                // Calculate score
                const totalAttempts = session.quizAttempts.length;
                const correctAttempts = session.quizAttempts.filter(a => a.isCorrect === true).length;
                const score = totalAttempts > 0 ? Math.round((correctAttempts / totalAttempts) * 100) : 0;
                return {
                    id: session.id,
                    title: session.title,
                    status: session.status,
                    examYear: examYear || null,
                    university: university ? { id: university.id, name: university.name } : null,
                    parts: ["Sciences_fondamentales", "Pathologie_medico_chirurgical", "Dossier_clinique"], // Default parts
                    score: session.status === 'COMPLETED' ? score : null,
                    createdAt: session.createdAt.toISOString(),
                    completedAt: ((_b = session.completedAt) === null || _b === void 0 ? void 0 : _b.toISOString()) || null
                };
            });
        });
    }
    /**
     * Get questions for residency session by universityId and examYear
     */
    getQuestionsForResidencySession(universityId, examYear, parts) {
        return __awaiter(this, void 0, void 0, function* () {
            const questions = yield this.prisma.question.findMany({
                where: {
                    universityId,
                    examYear
                },
                select: { id: true, metadata: true }
            });
            // Filter locally by parsing metadata if parts are provided
            if (parts && parts.length > 0) {
                return questions.filter(q => {
                    if (!q.metadata)
                        return false;
                    try {
                        const meta = JSON.parse(q.metadata);
                        return meta.part && parts.includes(meta.part);
                    }
                    catch (_a) {
                        return false;
                    }
                }).map(q => ({ id: q.id }));
            }
            return questions.map(q => ({ id: q.id }));
        });
    }
};
QuizRepository = __decorate([
    (0, tsyringe_1.injectable)(),
    __param(0, (0, tsyringe_1.inject)("db")),
    __metadata("design:paramtypes", [db_1.default])
], QuizRepository);
exports.default = QuizRepository;
