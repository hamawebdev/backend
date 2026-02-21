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
let StudentRepository = class StudentRepository {
    constructor(prismaService) {
        this.prismaService = prismaService;
    }
    get prisma() {
        return this.prismaService.getClient();
    }
    getStudentProgressOverview(userId) {
        return __awaiter(this, void 0, void 0, function* () {
            // Get course progress
            const courseProgressData = yield this.prisma.courseProgress.findMany({
                where: { userId },
                include: {
                    course: {
                        include: {
                            module: {
                                include: {
                                    unite: true
                                }
                            }
                        }
                    }
                }
            });
            const completedCourses = courseProgressData.map(progress => {
                var _a, _b;
                const layersCompleted = [
                    progress.layer1Completed,
                    progress.layer2Completed,
                    progress.layer3Completed
                ].filter(Boolean).length;
                const progressPercentage = (layersCompleted / 3) * 100;
                return {
                    courseId: progress.courseId,
                    courseName: progress.course.name,
                    moduleId: progress.course.moduleId,
                    moduleName: progress.course.module.name,
                    uniteId: progress.course.module.uniteId,
                    uniteName: (_b = (_a = progress.course.module.unite) === null || _a === void 0 ? void 0 : _a.name) !== null && _b !== void 0 ? _b : 'Unknown',
                    layer1Completed: progress.layer1Completed,
                    layer2Completed: progress.layer2Completed,
                    layer3Completed: progress.layer3Completed,
                    progressPercentage
                };
            });
            // Get quiz scores (practice sessions)
            const quizSessions = yield this.prisma.quizSession.findMany({
                where: {
                    userId,
                    type: client_1.SessionType.PRACTICE,
                    completedAt: { not: null }
                },
                orderBy: { completedAt: 'desc' },
                take: 20 // Last 20 quiz sessions
            });
            const quizScores = quizSessions.map(session => ({
                sessionId: session.id,
                title: session.title,
                type: session.type,
                score: session.score,
                percentage: session.percentage,
                completedAt: session.completedAt
            }));
            // Get exam results
            const examSessions = yield this.prisma.quizSession.findMany({
                where: {
                    userId,
                    type: client_1.SessionType.EXAM,
                    completedAt: { not: null }
                },
                include: {
                    exam: true
                },
                orderBy: { completedAt: 'desc' }
            });
            const examResults = examSessions.map(session => {
                var _a, _b;
                return ({
                    sessionId: session.id,
                    examTitle: ((_a = session.exam) === null || _a === void 0 ? void 0 : _a.title) || session.title,
                    examYear: ((_b = session.exam) === null || _b === void 0 ? void 0 : _b.examYear.getFullYear().toString()) || new Date().getFullYear().toString(),
                    score: session.score,
                    percentage: session.percentage,
                    completedAt: session.completedAt
                });
            });
            // Calculate overall stats
            const totalQuizzesTaken = quizScores.length;
            const averageQuizScore = totalQuizzesTaken > 0
                ? quizScores.reduce((sum, quiz) => sum + quiz.percentage, 0) / totalQuizzesTaken
                : 0;
            const totalExamsTaken = examResults.length;
            const averageExamScore = totalExamsTaken > 0
                ? examResults.reduce((sum, exam) => sum + exam.percentage, 0) / totalExamsTaken
                : 0;
            const coursesCompleted = completedCourses.filter(course => course.layer1Completed && course.layer2Completed && course.layer3Completed).length;
            const coursesInProgress = completedCourses.filter(course => !course.layer1Completed || !course.layer2Completed || !course.layer3Completed).length;
            const overallStats = {
                totalQuizzesTaken,
                averageQuizScore: Math.round(averageQuizScore * 100) / 100,
                totalExamsTaken,
                averageExamScore: Math.round(averageExamScore * 100) / 100,
                coursesInProgress,
                coursesCompleted
            };
            return {
                completedCourses,
                quizScores,
                examResults,
                overallStats
            };
        });
    }
    updateCourseProgress(userId, courseId, layer, completed) {
        return __awaiter(this, void 0, void 0, function* () {
            const progressData = {};
            switch (layer) {
                case 1:
                    progressData.layer1Completed = completed;
                    break;
                case 2:
                    progressData.layer2Completed = completed;
                    break;
                case 3:
                    progressData.layer3Completed = completed;
                    break;
            }
            yield this.prisma.courseProgress.upsert({
                where: {
                    userId_courseId: {
                        userId,
                        courseId
                    }
                },
                update: progressData,
                create: Object.assign({ userId,
                    courseId }, progressData)
            });
        });
    }
    getStudentQuizHistory(userId_1, type_1) {
        return __awaiter(this, arguments, void 0, function* (userId, type, limit = 10, offset = 0) {
            const whereConditions = {
                userId,
                completedAt: { not: null }
            };
            if (type) {
                whereConditions.type = type;
            }
            // Get total count for pagination
            const totalCount = yield this.prisma.quizSession.count({
                where: whereConditions
            });
            // Get sessions with detailed information
            const sessions = yield this.prisma.quizSession.findMany({
                where: whereConditions,
                include: {
                    quiz: true,
                    exam: true,
                    quizAttempts: {
                        select: {
                            isCorrect: true,
                            answeredAt: true
                        }
                    },
                    _count: {
                        select: {
                            sessionQuestions: true,
                            quizAttempts: true
                        }
                    }
                },
                orderBy: { completedAt: 'desc' },
                take: limit,
                skip: offset
            });
            // Calculate detailed session information
            const detailedSessions = sessions.map(session => {
                var _a, _b;
                const attempts = session.quizAttempts;
                const totalQuestions = session._count.quizAttempts;
                const correctAnswers = attempts.filter(attempt => attempt.isCorrect === true).length;
                const incorrectAnswers = totalQuestions - correctAnswers;
                // Calculate time spent in minutes
                let timeSpent = 0;
                if (session.startedAt && session.completedAt) {
                    timeSpent = Math.round((new Date(session.completedAt).getTime() - new Date(session.startedAt).getTime()) / (1000 * 60));
                }
                // Calculate average time per question
                const averageTimePerQuestion = totalQuestions > 0 ? Number((timeSpent / totalQuestions).toFixed(1)) : 0;
                return {
                    id: session.id,
                    title: session.title,
                    type: session.type,
                    status: session.status,
                    score: session.score,
                    percentage: session.percentage,
                    totalQuestions,
                    correctAnswers,
                    incorrectAnswers,
                    timeSpent,
                    averageTimePerQuestion,
                    startedAt: ((_a = session.startedAt) === null || _a === void 0 ? void 0 : _a.toISOString()) || null,
                    completedAt: ((_b = session.completedAt) === null || _b === void 0 ? void 0 : _b.toISOString()) || null
                };
            });
            return {
                sessions: detailedSessions,
                totalCount
            };
        });
    }
    getStudentQuizAnalytics(userId, type) {
        return __awaiter(this, void 0, void 0, function* () {
            const whereConditions = {
                userId,
                completedAt: { not: null }
            };
            if (type) {
                whereConditions.type = type;
            }
            const sessions = yield this.prisma.quizSession.findMany({
                where: whereConditions,
                select: {
                    percentage: true,
                    startedAt: true,
                    completedAt: true
                }
            });
            if (sessions.length === 0) {
                return {
                    totalSessions: 0,
                    averageScore: 0,
                    bestScore: 0,
                    worstScore: 0,
                    averageTimePerSession: 0
                };
            }
            const scores = sessions.map(s => s.percentage);
            const totalSessions = sessions.length;
            const averageScore = Number((scores.reduce((sum, score) => sum + score, 0) / totalSessions).toFixed(1));
            const bestScore = Math.max(...scores);
            const worstScore = Math.min(...scores);
            // Calculate average time per session
            const sessionTimes = sessions
                .filter(s => s.startedAt && s.completedAt)
                .map(s => Math.round((new Date(s.completedAt).getTime() - new Date(s.startedAt).getTime()) / (1000 * 60)));
            const averageTimePerSession = sessionTimes.length > 0
                ? Math.round(sessionTimes.reduce((sum, time) => sum + time, 0) / sessionTimes.length)
                : 0;
            return {
                totalSessions,
                averageScore,
                bestScore,
                worstScore,
                averageTimePerSession
            };
        });
    }
    /**
     * Get detailed question results for student with filtering options
     */
    getStudentQuestionResults(userId_1, filters_1) {
        return __awaiter(this, arguments, void 0, function* (userId, filters, page = 1, limit = 20) {
            const offset = (page - 1) * limit;
            // Build session where conditions
            const sessionWhereConditions = {
                userId,
                completedAt: { not: null }
            };
            // Filter by session type
            if (filters.sessionType) {
                sessionWhereConditions.type = filters.sessionType;
            }
            // Filter by specific exam or quiz
            if (filters.examId) {
                sessionWhereConditions.examId = filters.examId;
            }
            if (filters.quizId) {
                sessionWhereConditions.quizId = filters.quizId;
            }
            // Filter by specific session IDs
            if (filters.sessionIds && filters.sessionIds.length > 0) {
                sessionWhereConditions.id = { in: filters.sessionIds };
            }
            // Filter by completion date range
            if (filters.completedAfter || filters.completedBefore) {
                sessionWhereConditions.completedAt = {};
                if (filters.completedAfter) {
                    sessionWhereConditions.completedAt.gte = filters.completedAfter;
                }
                if (filters.completedBefore) {
                    sessionWhereConditions.completedAt.lte = filters.completedBefore;
                }
            }
            // Build quiz attempt where conditions based on answer type
            let attemptWhereConditions = {};
            if (filters.answerType === 'correct') {
                attemptWhereConditions.isCorrect = true;
            }
            else if (filters.answerType === 'incorrect') {
                attemptWhereConditions.isCorrect = false;
            }
            // For 'all', we don't add any isCorrect filter
            // First, get all matching quiz attempts with related data
            const attempts = yield this.prisma.quizAttempt.findMany({
                where: Object.assign(Object.assign({}, attemptWhereConditions), { session: sessionWhereConditions }),
                include: {
                    session: {
                        include: {
                            quiz: true,
                            exam: true
                        }
                    },
                    question: {
                        include: {
                            questionAnswers: true
                        }
                    },
                    selectedAnswer: true
                },
                orderBy: [
                    { session: { completedAt: 'desc' } },
                    { questionId: 'asc' }
                ],
                skip: offset,
                take: limit
            });
            // Get total count for pagination
            const total = yield this.prisma.quizAttempt.count({
                where: Object.assign(Object.assign({}, attemptWhereConditions), { session: sessionWhereConditions })
            });
            return { questions: attempts, total };
        });
    }
    /**
     * Get student session results summary
     */
    getStudentSessionResultsSummary(userId, filters) {
        return __awaiter(this, void 0, void 0, function* () {
            // Build session where conditions (same as above)
            const sessionWhereConditions = {
                userId,
                completedAt: { not: null }
            };
            if (filters.sessionType) {
                sessionWhereConditions.type = filters.sessionType;
            }
            if (filters.examId) {
                sessionWhereConditions.examId = filters.examId;
            }
            if (filters.quizId) {
                sessionWhereConditions.quizId = filters.quizId;
            }
            if (filters.sessionIds && filters.sessionIds.length > 0) {
                sessionWhereConditions.id = { in: filters.sessionIds };
            }
            if (filters.completedAfter || filters.completedBefore) {
                sessionWhereConditions.completedAt = {};
                if (filters.completedAfter) {
                    sessionWhereConditions.completedAt.gte = filters.completedAfter;
                }
                if (filters.completedBefore) {
                    sessionWhereConditions.completedAt.lte = filters.completedBefore;
                }
            }
            // Get statistics
            const [totalQuestions, correctAnswers, incorrectAnswers, unansweredQuestions, sessionsIncluded] = yield Promise.all([
                this.prisma.quizAttempt.count({
                    where: {
                        session: sessionWhereConditions
                    }
                }),
                this.prisma.quizAttempt.count({
                    where: {
                        session: sessionWhereConditions,
                        isCorrect: true
                    }
                }),
                this.prisma.quizAttempt.count({
                    where: {
                        session: sessionWhereConditions,
                        isCorrect: false
                    }
                }),
                this.prisma.quizAttempt.count({
                    where: {
                        session: sessionWhereConditions,
                        selectedAnswerId: null
                    }
                }),
                this.prisma.quizSession.count({
                    where: sessionWhereConditions
                })
            ]);
            return {
                totalQuestions,
                correctAnswers,
                incorrectAnswers,
                unansweredQuestions,
                sessionsIncluded
            };
        });
    }
    /**
     * Get list of available sessions for filtering dropdown
     */
    getStudentAvailableSessions(userId, sessionType) {
        return __awaiter(this, void 0, void 0, function* () {
            const whereConditions = {
                userId,
                completedAt: { not: null }
            };
            if (sessionType) {
                whereConditions.type = sessionType;
            }
            const sessions = yield this.prisma.quizSession.findMany({
                where: whereConditions,
                include: {
                    _count: {
                        select: {
                            sessionQuestions: true
                        }
                    }
                },
                orderBy: { completedAt: 'desc' },
                take: 100 // Limit to recent 100 sessions for dropdown
            });
            return sessions.map(session => ({
                id: session.id,
                title: session.title,
                type: session.type,
                completedAt: session.completedAt,
                score: session.score,
                percentage: session.percentage,
                questionsCount: session._count.sessionQuestions
            }));
        });
    }
    getStudentPerformanceAnalytics(userId) {
        return __awaiter(this, void 0, void 0, function* () {
            // Get weekly progress for the last 8 weeks
            const eightWeeksAgo = new Date();
            eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56);
            const recentSessions = yield this.prisma.quizSession.findMany({
                where: {
                    userId,
                    completedAt: {
                        gte: eightWeeksAgo
                    }
                },
                orderBy: { completedAt: 'desc' }
            });
            // Group by week
            const weeklyData = new Map();
            recentSessions.forEach(session => {
                if (session.completedAt) {
                    const weekStart = new Date(session.completedAt);
                    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
                    const weekKey = weekStart.toISOString().split('T')[0];
                    const existing = weeklyData.get(weekKey) || { count: 0, totalScore: 0 };
                    existing.count += 1;
                    existing.totalScore += session.percentage;
                    weeklyData.set(weekKey, existing);
                }
            });
            const weeklyProgress = Array.from(weeklyData.entries()).map(([week, data]) => ({
                week,
                quizzesCompleted: data.count,
                averageScore: data.count > 0 ? Math.round((data.totalScore / data.count) * 100) / 100 : 0
            }));
            // Get subject performance (by course) - temporarily disabled due to SQL issue
            const subjectPerformance = [];
            // Get recent activity
            const recentActivitySessions = yield this.prisma.quizSession.findMany({
                where: { userId },
                orderBy: { updatedAt: 'desc' },
                take: 10,
                include: {
                    quiz: true,
                    exam: true
                }
            });
            const recentActivity = recentActivitySessions.map(session => ({
                date: session.updatedAt,
                activity: session.completedAt
                    ? `Completed ${session.title}`
                    : `Started ${session.title}`,
                score: session.completedAt ? session.percentage : undefined
            }));
            return {
                weeklyProgress: weeklyProgress.sort((a, b) => a.week.localeCompare(b.week)),
                subjectPerformance: subjectPerformance,
                recentActivity
            };
        });
    }
    // ==========================================
    // STUDY CONTENT ACCESS & NAVIGATION
    // ==========================================
    /**
     * Get content filters with hierarchical structure (unites and independent modules)
     * For GET /students/content/filters
     */
    getContentFilters(studyPackIds, yearLevel) {
        return __awaiter(this, void 0, void 0, function* () {
            // Build where clause: always filter by accessible study packs,
            // and optionally narrow down by yearLevel (maps to studyPack.yearNumber)
            const uniteWhere = {
                studyPackId: { in: studyPackIds }
            };
            if (yearLevel) {
                uniteWhere.studyPack = { yearNumber: yearLevel };
            }
            // Get unites filtered by accessible study packs (and optionally yearLevel)
            const unites = yield this.prisma.unite.findMany({
                where: uniteWhere,
                include: {
                    modules: {
                        include: {
                            courses: {
                                select: {
                                    id: true,
                                    name: true,
                                    description: true
                                }
                            }
                        }
                    }
                }
            });
            // Independent modules (uniteId: null) don't belong to any StudyPack directly.
            // Filter them by year level: StudyPack.yearNumber → Module.courses.questions.yearLevel
            const independentModulesWhere = { uniteId: null };
            // Determine which yearNumbers to filter by
            let effectiveYearNumbers = [];
            if (yearLevel) {
                effectiveYearNumbers = [yearLevel];
            }
            else if (studyPackIds.length > 0) {
                const packs = yield this.prisma.studyPack.findMany({
                    where: { id: { in: studyPackIds } },
                    select: { yearNumber: true }
                });
                effectiveYearNumbers = packs.map((p) => p.yearNumber).filter(Boolean);
            }
            if (effectiveYearNumbers.length > 0) {
                independentModulesWhere.courses = {
                    some: {
                        questions: {
                            some: {
                                yearLevel: { in: effectiveYearNumbers }
                            }
                        }
                    }
                };
            }
            const independentModulesRaw = yield this.prisma.module.findMany({
                where: independentModulesWhere,
                include: {
                    courses: {
                        select: {
                            id: true,
                            name: true,
                            description: true
                        }
                    }
                }
            });
            return {
                unites: unites.map(unite => ({
                    id: unite.id,
                    name: unite.name,
                    logoUrl: unite.logoUrl,
                    modules: unite.modules.map(module => ({
                        id: module.id,
                        name: module.name,
                        courses: module.courses
                    }))
                })),
                independentModules: independentModulesRaw.map((module) => ({
                    id: module.id,
                    name: module.name,
                    imagePath: module.imagePath,
                    courses: module.courses
                }))
            };
        });
    }
    /**
     * Get independent resources with hierarchical structure
     * For GET /students/content/independent-resources
     */
    getIndependentResources(studyPackIds, yearLevel) {
        return __awaiter(this, void 0, void 0, function* () {
            const independentModulesWhere = { uniteId: null };
            // Determine which yearNumbers to filter by
            let effectiveYearNumbers = [];
            if (yearLevel) {
                effectiveYearNumbers = [yearLevel];
            }
            else if (studyPackIds.length > 0) {
                const packs = yield this.prisma.studyPack.findMany({
                    where: { id: { in: studyPackIds } },
                    select: { yearNumber: true }
                });
                effectiveYearNumbers = packs.map((p) => p.yearNumber).filter(Boolean);
            }
            if (effectiveYearNumbers.length > 0) {
                independentModulesWhere.exams = {
                    some: {
                        yearLevel: { in: effectiveYearNumbers }
                    }
                };
            }
            const independentModulesRaw = yield this.prisma.module.findMany({
                where: independentModulesWhere,
                include: {
                    subModules: {
                        include: {
                            courses: {
                                select: {
                                    id: true,
                                    name: true,
                                    description: true
                                }
                            },
                            books: {
                                select: {
                                    id: true,
                                    name: true,
                                    coverPath: true,
                                    viewUrl: true
                                }
                            }
                        }
                    },
                    books: {
                        select: {
                            id: true,
                            name: true,
                            coverPath: true,
                            viewUrl: true
                        }
                    },
                    courses: {
                        where: { subModuleId: null },
                        select: {
                            id: true,
                            name: true,
                            description: true
                        }
                    }
                }
            });
            return {
                independentModules: independentModulesRaw.map((module) => ({
                    id: module.id,
                    name: module.name,
                    imagePath: module.imagePath,
                    subModules: module.subModules.map((sm) => ({
                        id: sm.id,
                        name: sm.name,
                        courses: sm.courses,
                        books: sm.books.map((b) => ({
                            id: b.id,
                            name: b.name,
                            coverPath: b.coverPath,
                            viewUrl: b.viewUrl
                        }))
                    })),
                    books: module.books.map((b) => ({
                        id: b.id,
                        name: b.name,
                        coverPath: b.coverPath,
                        viewUrl: b.viewUrl
                    })),
                    courses: module.courses
                }))
            };
        });
    }
    /**
     * Get study packs with pagination
     * For GET /study-packs
     */
    getStudyPacksPaginated(page, limit, search) {
        return __awaiter(this, void 0, void 0, function* () {
            const whereConditions = {
                isActive: true
            };
            if (search) {
                whereConditions.OR = [
                    { name: { contains: search } },
                    { description: { contains: search } }
                ];
            }
            const [studyPacks, total] = yield Promise.all([
                this.prisma.studyPack.findMany({
                    where: whereConditions,
                    skip: (page - 1) * limit,
                    take: limit,
                    orderBy: { createdAt: 'desc' }
                }),
                this.prisma.studyPack.count({ where: whereConditions })
            ]);
            return { studyPacks, total };
        });
    }
    // Legacy method kept for backward compatibility
    getStudyPacks(yearLevel) {
        return __awaiter(this, void 0, void 0, function* () {
            const whereConditions = {
                isActive: true
            };
            if (yearLevel) {
                whereConditions.yearNumber = yearLevel;
            }
            return yield this.prisma.studyPack.findMany({
                where: whereConditions,
                include: {
                    unites: {
                        include: {
                            modules: {
                                include: {
                                    courses: {
                                        include: {
                                            _count: {
                                                select: {
                                                    questions: true,
                                                    quizzes: true
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    },
                    _count: {
                        select: {
                            subscriptions: true
                        }
                    }
                },
                orderBy: {
                    createdAt: 'desc'
                }
            });
        });
    }
    getStudyPackById(packId) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.prisma.studyPack.findUnique({
                where: { id: packId },
                include: {
                    unites: {
                        include: {
                            modules: {
                                include: {
                                    courses: {
                                        include: {
                                            quizzes: {
                                                include: {
                                                    _count: {
                                                        select: {
                                                            quizQuestions: true
                                                        }
                                                    }
                                                }
                                            },
                                            _count: {
                                                select: {
                                                    questions: true,
                                                    quizzes: true
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    },
                    _count: {
                        select: {
                            subscriptions: true
                        }
                    }
                }
            });
        });
    }
    /**
     * Get course resources with pagination
     * For GET /courses/:courseId/resources
     */
    getCourseResourcesPaginated(courseId, page, limit, type) {
        return __awaiter(this, void 0, void 0, function* () {
            const whereConditions = { courseId };
            if (type) {
                whereConditions.type = type;
            }
            const [resources, total] = yield Promise.all([
                this.prisma.courseResource.findMany({
                    where: whereConditions,
                    skip: (page - 1) * limit,
                    take: limit,
                    orderBy: { createdAt: 'asc' }
                }),
                this.prisma.courseResource.count({ where: whereConditions })
            ]);
            return { resources, total };
        });
    }
    // Legacy method kept for backward compatibility
    getCourseResources(courseId) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.prisma.courseResource.findMany({
                where: { courseId },
                orderBy: {
                    createdAt: 'asc'
                }
            });
        });
    }
    /**
     * Get courses by moduleId or uniteId
     * For GET /students/courses/by-module
     */
    getCoursesByModuleOrUnite(moduleId, uniteId) {
        return __awaiter(this, void 0, void 0, function* () {
            const whereConditions = {};
            if (moduleId) {
                whereConditions.moduleId = moduleId;
            }
            else if (uniteId) {
                whereConditions.module = {
                    uniteId: uniteId
                };
            }
            return yield this.prisma.course.findMany({
                where: whereConditions,
                include: {
                    module: {
                        select: {
                            id: true,
                            name: true
                        }
                    }
                }
            });
        });
    }
    // ==========================================
    // SUBSCRIPTION MANAGEMENT
    // ==========================================
    getUserSubscriptions(userId) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.prisma.subscription.findMany({
                where: { userId },
                include: {
                    studyPack: {
                        include: {
                            unites: {
                                include: {
                                    modules: {
                                        include: {
                                            courses: true
                                        }
                                    }
                                }
                            }
                        }
                    }
                },
                orderBy: {
                    createdAt: 'desc'
                }
            });
        });
    }
    // ==========================================
    // STUDENT NOTES SYSTEM
    // ==========================================
    // Canonical: GET /students/notes - flat array with labels, search, and labelIds filtering
    getStudentNotesCanonical(userId, options) {
        return __awaiter(this, void 0, void 0, function* () {
            const whereConditions = { userId };
            if (options === null || options === void 0 ? void 0 : options.questionId) {
                whereConditions.questionId = options.questionId;
            }
            if (options === null || options === void 0 ? void 0 : options.quizId) {
                whereConditions.quizId = options.quizId;
            }
            if (options === null || options === void 0 ? void 0 : options.search) {
                whereConditions.noteText = {
                    contains: options.search
                };
            }
            if ((options === null || options === void 0 ? void 0 : options.labelIds) && options.labelIds.length > 0) {
                whereConditions.noteLabels = {
                    some: {
                        labelId: { in: options.labelIds }
                    }
                };
            }
            return yield this.prisma.studentNote.findMany({
                where: whereConditions,
                include: {
                    noteLabels: {
                        include: {
                            label: {
                                select: {
                                    id: true,
                                    name: true
                                }
                            }
                        }
                    },
                    question: {
                        include: {
                            questionImages: true,
                            questionExplanationImages: true,
                            questionAnswers: {
                                include: {
                                    explanationImages: true
                                }
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
                                        include: {
                                            unite: true
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
                },
                orderBy: {
                    updatedAt: 'desc'
                }
            });
        });
    }
    // Legacy method - kept for backward compatibility
    getStudentNotes(userId, questionId, quizId) {
        return __awaiter(this, void 0, void 0, function* () {
            const whereConditions = { userId };
            if (questionId) {
                whereConditions.questionId = questionId;
            }
            if (quizId) {
                whereConditions.quizId = quizId;
            }
            return yield this.prisma.studentNote.findMany({
                where: whereConditions,
                include: {
                    question: {
                        select: {
                            id: true,
                            questionText: true,
                            course: {
                                select: {
                                    id: true,
                                    name: true,
                                    module: {
                                        select: {
                                            id: true,
                                            name: true,
                                            description: true
                                        }
                                    }
                                }
                            }
                        }
                    },
                    quiz: {
                        select: {
                            id: true,
                            title: true,
                            course: {
                                select: {
                                    id: true,
                                    name: true,
                                    module: {
                                        select: {
                                            id: true,
                                            name: true,
                                            description: true
                                        }
                                    }
                                }
                            }
                        }
                    }
                },
                orderBy: {
                    updatedAt: 'desc'
                }
            });
        });
    }
    questionExists(questionId) {
        return __awaiter(this, void 0, void 0, function* () {
            const question = yield this.prisma.question.findUnique({
                where: { id: questionId },
                select: { id: true }
            });
            return question !== null;
        });
    }
    quizExists(quizId) {
        return __awaiter(this, void 0, void 0, function* () {
            const quiz = yield this.prisma.quiz.findUnique({
                where: { id: quizId },
                select: { id: true }
            });
            return quiz !== null;
        });
    }
    labelExistsForUser(labelId, userId) {
        return __awaiter(this, void 0, void 0, function* () {
            const label = yield this.prisma.studentLabel.findUnique({
                where: {
                    id: labelId,
                    userId: userId
                },
                select: { id: true }
            });
            return label !== null;
        });
    }
    courseExists(courseId) {
        return __awaiter(this, void 0, void 0, function* () {
            const course = yield this.prisma.course.findUnique({
                where: { id: courseId },
                select: { id: true }
            });
            return course !== null;
        });
    }
    quizSessionExists(quizSessionId) {
        return __awaiter(this, void 0, void 0, function* () {
            const quizSession = yield this.prisma.quizSession.findUnique({
                where: { id: quizSessionId },
                select: { id: true }
            });
            return quizSession !== null;
        });
    }
    createStudentNote(userId, noteText, questionId, quizId) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.prisma.studentNote.create({
                data: {
                    userId,
                    noteText,
                    questionId,
                    quizId
                },
                include: {
                    question: {
                        select: {
                            id: true,
                            questionText: true
                        }
                    },
                    quiz: {
                        select: {
                            id: true,
                            title: true
                        }
                    }
                }
            });
        });
    }
    updateStudentNote(noteId, userId, noteText) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.prisma.studentNote.update({
                where: {
                    id: noteId,
                    userId: userId
                },
                data: {
                    noteText,
                    updatedAt: new Date()
                },
                include: {
                    question: {
                        select: {
                            id: true,
                            questionText: true
                        }
                    },
                    quiz: {
                        select: {
                            id: true,
                            title: true
                        }
                    }
                }
            });
        });
    }
    deleteStudentNote(noteId, userId) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.prisma.studentNote.delete({
                where: {
                    id: noteId,
                    userId: userId
                }
            });
        });
    }
    getQuestionNotes(questionId, userId) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.prisma.studentNote.findMany({
                where: {
                    questionId,
                    userId
                },
                orderBy: {
                    updatedAt: 'desc'
                }
            });
        });
    }
    // ==========================================
    // STUDENT NOTES - CANONICAL API
    // ==========================================
    // GET /students/questions/:questionId/notes - Canonical: returns with labels
    getQuestionNotesCanonical(questionId, userId) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.prisma.studentNote.findMany({
                where: {
                    questionId,
                    userId
                },
                include: {
                    noteLabels: {
                        include: {
                            label: {
                                select: {
                                    id: true,
                                    name: true
                                }
                            }
                        }
                    }
                },
                orderBy: {
                    updatedAt: 'desc'
                }
            });
        });
    }
    // GET /students/notes/by-module - Canonical: grouped notes
    getNotesByModuleCanonical(userId, moduleId, uniteId) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            // Get filter info first
            let filterInfo = {
                uniteId: uniteId || null,
                moduleId: moduleId || null,
                uniteName: null,
                moduleName: null
            };
            if (uniteId) {
                const unite = yield this.prisma.unite.findUnique({
                    where: { id: uniteId },
                    select: { id: true, name: true }
                });
                if (!unite) {
                    throw new Error(`Unite with ID ${uniteId} not found`);
                }
                filterInfo.uniteName = unite.name;
            }
            if (moduleId) {
                const module = yield this.prisma.module.findUnique({
                    where: { id: moduleId },
                    select: { id: true, name: true }
                });
                if (!module) {
                    throw new Error(`Module with ID ${moduleId} not found`);
                }
                filterInfo.moduleName = module.name;
            }
            // Get notes - filter by module or unite through question->course->module->unite chain
            let courseIds = [];
            if (moduleId) {
                const courses = yield this.prisma.course.findMany({
                    where: { moduleId },
                    select: { id: true }
                });
                courseIds = courses.map(c => c.id);
            }
            else if (uniteId) {
                const courses = yield this.prisma.course.findMany({
                    where: {
                        module: { uniteId }
                    },
                    select: { id: true }
                });
                courseIds = courses.map(c => c.id);
            }
            // Get notes for questions in these courses
            const notes = yield this.prisma.studentNote.findMany({
                where: {
                    userId,
                    question: {
                        courseId: { in: courseIds }
                    }
                },
                include: {
                    noteLabels: {
                        include: {
                            label: {
                                select: {
                                    id: true,
                                    name: true
                                }
                            }
                        }
                    },
                    question: {
                        select: {
                            id: true,
                            courseId: true,
                            course: {
                                select: {
                                    id: true,
                                    name: true,
                                    module: {
                                        select: {
                                            id: true,
                                            name: true
                                        }
                                    }
                                }
                            }
                        }
                    }
                },
                orderBy: {
                    createdAt: 'desc'
                }
            });
            // Group notes by course
            const courseGroupsMap = new Map();
            const ungroupedNotes = [];
            for (const note of notes) {
                const formattedNote = {
                    id: note.id,
                    noteText: note.noteText,
                    questionId: note.questionId,
                    labels: note.noteLabels.map((nl) => ({
                        id: nl.label.id,
                        name: nl.label.name
                    })),
                    createdAt: note.createdAt
                };
                if ((_a = note.question) === null || _a === void 0 ? void 0 : _a.course) {
                    const course = note.question.course;
                    if (!courseGroupsMap.has(course.id)) {
                        courseGroupsMap.set(course.id, {
                            course: {
                                id: course.id,
                                name: course.name,
                                module: course.module ? {
                                    id: course.module.id,
                                    name: course.module.name
                                } : null
                            },
                            notes: []
                        });
                    }
                    courseGroupsMap.get(course.id).notes.push(formattedNote);
                }
                else {
                    ungroupedNotes.push(formattedNote);
                }
            }
            return {
                filterInfo,
                courseGroups: Array.from(courseGroupsMap.values()),
                ungroupedNotes,
                totalNotes: notes.length
            };
        });
    }
    // POST /students/notes - Canonical: create with labels
    createStudentNoteCanonical(userId, noteText, questionId, quizId, labelIds) {
        return __awaiter(this, void 0, void 0, function* () {
            // Create the note
            const note = yield this.prisma.studentNote.create({
                data: {
                    userId,
                    noteText,
                    questionId,
                    quizId
                }
            });
            // Add labels if provided
            if (labelIds && labelIds.length > 0) {
                for (const labelId of labelIds) {
                    yield this.prisma.noteLabel.upsert({
                        where: {
                            userId_noteId_labelId: {
                                userId,
                                noteId: note.id,
                                labelId
                            }
                        },
                        create: {
                            userId,
                            noteId: note.id,
                            labelId
                        },
                        update: {} // No update needed, just skip if exists
                    });
                }
            }
            // Return note with labels
            return yield this.prisma.studentNote.findUnique({
                where: { id: note.id },
                include: {
                    noteLabels: {
                        include: {
                            label: {
                                select: {
                                    id: true,
                                    name: true
                                }
                            }
                        }
                    }
                }
            });
        });
    }
    // PUT /students/notes/:noteId - Canonical: update with labels
    updateStudentNoteCanonical(noteId, userId, noteText, labelIds) {
        return __awaiter(this, void 0, void 0, function* () {
            // Update note text if provided
            if (noteText !== undefined) {
                yield this.prisma.studentNote.update({
                    where: {
                        id: noteId,
                        userId
                    },
                    data: {
                        noteText,
                        updatedAt: new Date()
                    }
                });
            }
            // Update labels if provided
            if (labelIds !== undefined) {
                // Remove existing labels
                yield this.prisma.noteLabel.deleteMany({
                    where: {
                        noteId,
                        userId
                    }
                });
                // Add new labels
                if (labelIds.length > 0) {
                    for (const labelId of labelIds) {
                        yield this.prisma.noteLabel.upsert({
                            where: {
                                userId_noteId_labelId: {
                                    userId,
                                    noteId,
                                    labelId
                                }
                            },
                            create: {
                                userId,
                                noteId,
                                labelId
                            },
                            update: {} // No update needed, just skip if exists
                        });
                    }
                }
            }
            // Return updated note with labels
            return yield this.prisma.studentNote.findUnique({
                where: { id: noteId },
                include: {
                    noteLabels: {
                        include: {
                            label: {
                                select: {
                                    id: true,
                                    name: true
                                }
                            }
                        }
                    }
                }
            });
        });
    }
    // ==========================================
    // LABELING SYSTEM
    // ==========================================
    getStudentLabels(userId) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.prisma.studentLabel.findMany({
                where: { userId },
                include: {
                    _count: {
                        select: {
                            quizLabels: true,
                            questionLabels: true,
                            quizSessionLabels: true
                        }
                    }
                },
                orderBy: {
                    createdAt: 'desc'
                }
            });
        });
    }
    getStudentLabelsWithSessionIds(userId) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.prisma.studentLabel.findMany({
                where: { userId },
                include: {
                    _count: {
                        select: {
                            quizLabels: true,
                            questionLabels: true,
                            quizSessionLabels: true
                        }
                    },
                    quizSessionLabels: {
                        select: {
                            quizSessionId: true,
                            quizSession: {
                                select: {
                                    id: true,
                                    title: true,
                                    type: true,
                                    status: true,
                                    score: true,
                                    percentage: true,
                                    createdAt: true
                                }
                            }
                        },
                        orderBy: {
                            createdAt: 'desc'
                        }
                    }
                },
                orderBy: {
                    createdAt: 'desc'
                }
            });
        });
    }
    getStudentLabelsWithQuestionIds(userId) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.prisma.studentLabel.findMany({
                where: { userId },
                include: {
                    _count: {
                        select: {
                            quizLabels: true,
                            questionLabels: true,
                            quizSessionLabels: true
                        }
                    },
                    questionLabels: {
                        select: {
                            questionId: true,
                            createdAt: true,
                            question: {
                                select: {
                                    id: true,
                                    questionText: true,
                                    course: {
                                        select: {
                                            id: true,
                                            name: true,
                                            module: {
                                                select: {
                                                    id: true,
                                                    name: true,
                                                    description: true
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        },
                        orderBy: {
                            createdAt: 'desc'
                        }
                    }
                },
                orderBy: {
                    createdAt: 'desc'
                }
            });
        });
    }
    getStudentLabelByIdWithSessionIds(labelId, userId) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.prisma.studentLabel.findUnique({
                where: {
                    id: labelId,
                    userId: userId
                },
                include: {
                    _count: {
                        select: {
                            quizLabels: true,
                            questionLabels: true,
                            quizSessionLabels: true
                        }
                    },
                    quizSessionLabels: {
                        select: {
                            quizSessionId: true,
                            quizSession: {
                                select: {
                                    id: true,
                                    title: true,
                                    type: true,
                                    status: true,
                                    score: true,
                                    percentage: true,
                                    createdAt: true
                                }
                            }
                        },
                        orderBy: {
                            createdAt: 'desc'
                        }
                    }
                }
            });
        });
    }
    getStudentLabelByIdWithQuestionIds(labelId, userId) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.prisma.studentLabel.findUnique({
                where: {
                    id: labelId,
                    userId: userId
                },
                include: {
                    _count: {
                        select: {
                            quizLabels: true,
                            questionLabels: true,
                            quizSessionLabels: true
                        }
                    },
                    questionLabels: {
                        select: {
                            questionId: true,
                            createdAt: true,
                            question: {
                                select: {
                                    id: true,
                                    questionText: true,
                                    course: {
                                        select: {
                                            id: true,
                                            name: true,
                                            module: {
                                                select: {
                                                    id: true,
                                                    name: true,
                                                    description: true
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        },
                        orderBy: {
                            createdAt: 'desc'
                        }
                    }
                }
            });
        });
    }
    createStudentLabel(userId, name) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.prisma.studentLabel.create({
                data: {
                    userId,
                    name
                }
            });
        });
    }
    updateStudentLabel(labelId, userId, name) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.prisma.studentLabel.update({
                where: {
                    id: labelId,
                    userId: userId
                },
                data: {
                    name
                }
            });
        });
    }
    deleteStudentLabel(labelId, userId) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.prisma.studentLabel.delete({
                where: {
                    id: labelId,
                    userId: userId
                }
            });
        });
    }
    // Canonical: GET /students/labels/by-module - returns labels with questions from specific module/unite
    getLabelsByModuleCanonical(userId, moduleId, uniteId) {
        return __awaiter(this, void 0, void 0, function* () {
            // Get all labels for the user that have questions from the specified module/unite
            const labels = yield this.prisma.studentLabel.findMany({
                where: {
                    userId,
                    questionLabels: {
                        some: {
                            question: {
                                course: moduleId
                                    ? { moduleId }
                                    : uniteId
                                        ? { module: { uniteId } }
                                        : undefined
                            }
                        }
                    }
                },
                include: {
                    questionLabels: {
                        where: {
                            question: {
                                course: moduleId
                                    ? { moduleId }
                                    : uniteId
                                        ? { module: { uniteId } }
                                        : undefined
                            }
                        },
                        include: {
                            question: {
                                select: {
                                    id: true,
                                    questionText: true,
                                    course: {
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
            return labels.map(label => ({
                id: label.id,
                name: label.name,
                questionIds: label.questionLabels.map((ql) => ql.questionId),
                questions: label.questionLabels.map((ql) => ({
                    id: ql.question.id,
                    questionText: ql.question.questionText,
                    course: ql.question.course ? {
                        id: ql.question.course.id,
                        name: ql.question.course.name
                    } : null
                }))
            }));
        });
    }
    addQuizToLabel(userId, quizId, labelId) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.prisma.quizLabel.create({
                data: {
                    userId,
                    quizId,
                    labelId
                },
                include: {
                    quiz: {
                        select: {
                            id: true,
                            title: true
                        }
                    },
                    label: {
                        select: {
                            id: true,
                            name: true
                        }
                    }
                }
            });
        });
    }
    getQuizLabel(userId, quizId, labelId) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.prisma.quizLabel.findFirst({
                where: {
                    userId,
                    quizId,
                    labelId
                },
                include: {
                    quiz: {
                        select: {
                            id: true,
                            title: true
                        }
                    },
                    label: {
                        select: {
                            id: true,
                            name: true
                        }
                    }
                }
            });
        });
    }
    removeQuizFromLabel(userId, quizId, labelId) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.prisma.quizLabel.deleteMany({
                where: {
                    AND: [
                        { userId },
                        { quizId },
                        { labelId }
                    ]
                }
            });
        });
    }
    addQuestionToLabel(userId, questionId, labelId) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.prisma.questionLabel.create({
                data: {
                    userId,
                    questionId,
                    labelId
                },
                include: {
                    question: {
                        select: {
                            id: true,
                            questionText: true,
                            course: {
                                select: {
                                    id: true,
                                    name: true,
                                    module: {
                                        select: {
                                            id: true,
                                            name: true,
                                            description: true
                                        }
                                    }
                                }
                            }
                        }
                    },
                    label: {
                        select: {
                            id: true,
                            name: true
                        }
                    }
                }
            });
        });
    }
    removeQuestionFromLabel(userId, questionId, labelId) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.prisma.questionLabel.deleteMany({
                where: {
                    AND: [
                        { userId },
                        { questionId },
                        { labelId }
                    ]
                }
            });
        });
    }
    getQuestionLabel(userId, questionId, labelId) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.prisma.questionLabel.findFirst({
                where: {
                    userId,
                    questionId,
                    labelId
                },
                include: {
                    question: {
                        select: {
                            id: true,
                            questionText: true,
                            course: {
                                select: {
                                    id: true,
                                    name: true,
                                    module: {
                                        select: {
                                            id: true,
                                            name: true,
                                            description: true
                                        }
                                    }
                                }
                            }
                        }
                    },
                    label: {
                        select: {
                            id: true,
                            name: true
                        }
                    }
                }
            });
        });
    }
    addQuizSessionToLabel(userId, quizSessionId, labelId) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.prisma.quizSessionLabel.create({
                data: {
                    userId,
                    quizSessionId,
                    labelId
                },
                include: {
                    quizSession: {
                        select: {
                            id: true,
                            title: true,
                            type: true,
                            status: true,
                            score: true,
                            percentage: true
                        }
                    },
                    label: {
                        select: {
                            id: true,
                            name: true
                        }
                    }
                }
            });
        });
    }
    getQuizSessionLabel(userId, quizSessionId, labelId) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.prisma.quizSessionLabel.findFirst({
                where: {
                    userId,
                    quizSessionId,
                    labelId
                },
                include: {
                    quizSession: {
                        select: {
                            id: true,
                            title: true,
                            type: true,
                            status: true,
                            score: true,
                            percentage: true
                        }
                    },
                    label: {
                        select: {
                            id: true,
                            name: true
                        }
                    }
                }
            });
        });
    }
    removeQuizSessionFromLabel(userId, quizSessionId, labelId) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.prisma.quizSessionLabel.deleteMany({
                where: {
                    AND: [
                        { userId },
                        { quizSessionId },
                        { labelId }
                    ]
                }
            });
        });
    }
    // ==========================================
    // TODO MANAGEMENT SYSTEM
    // ==========================================
    getTodos(userId_1, status_1, type_1, priority_1) {
        return __awaiter(this, arguments, void 0, function* (userId, status, type, priority, limit = 20, offset = 0, includeCompleted = false) {
            const whereConditions = { userId };
            if (status) {
                whereConditions.status = status;
            }
            else if (!includeCompleted) {
                // By default, exclude completed todos unless explicitly requested
                whereConditions.status = {
                    not: 'COMPLETED'
                };
            }
            if (type) {
                whereConditions.type = type;
            }
            if (priority) {
                whereConditions.priority = priority;
            }
            return yield this.prisma.todoItem.findMany({
                where: whereConditions,
                include: {
                    course: {
                        select: {
                            id: true,
                            name: true
                        }
                    },
                    quiz: {
                        select: {
                            id: true,
                            title: true
                        }
                    },
                    exam: {
                        select: {
                            id: true,
                            title: true
                        }
                    },
                    quizSession: {
                        select: {
                            id: true,
                            title: true
                        }
                    }
                },
                orderBy: [
                    { status: 'asc' },
                    { priority: 'desc' },
                    { dueDate: 'asc' },
                    { createdAt: 'desc' }
                ],
                take: limit,
                skip: offset
            });
        });
    }
    createTodo(userId, title, description, type, priority, dueDate, courseId, quizId) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.prisma.todoItem.create({
                data: {
                    userId,
                    title,
                    description,
                    type: (type || 'OTHER'),
                    priority: (priority || 'MEDIUM'),
                    dueDate,
                    courseId,
                    quizId
                },
                include: {
                    course: {
                        select: {
                            id: true,
                            name: true
                        }
                    },
                    quiz: {
                        select: {
                            id: true,
                            title: true
                        }
                    }
                }
            });
        });
    }
    updateTodo(todoId, userId, updateData) {
        return __awaiter(this, void 0, void 0, function* () {
            const data = {};
            if (updateData.title !== undefined)
                data.title = updateData.title;
            if (updateData.description !== undefined)
                data.description = updateData.description;
            if (updateData.priority !== undefined)
                data.priority = updateData.priority;
            if (updateData.dueDate !== undefined)
                data.dueDate = updateData.dueDate;
            if (updateData.status !== undefined)
                data.status = updateData.status;
            return yield this.prisma.todoItem.update({
                where: {
                    id: todoId,
                    userId: userId
                },
                data,
                include: {
                    course: {
                        select: {
                            id: true,
                            name: true
                        }
                    },
                    quiz: {
                        select: {
                            id: true,
                            title: true
                        }
                    }
                }
            });
        });
    }
    deleteTodo(todoId, userId) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.prisma.todoItem.delete({
                where: {
                    id: todoId,
                    userId: userId
                }
            });
        });
    }
    completeTodo(todoId, userId) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.prisma.todoItem.update({
                where: {
                    id: todoId,
                    userId: userId
                },
                data: {
                    status: 'COMPLETED',
                    completedAt: new Date()
                }
            });
        });
    }
    // ==========================================
    // QUESTION REPORTING SYSTEM
    // ==========================================
    createQuestionReport(userId, questionId, reportType, description) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.prisma.questionReport.create({
                data: {
                    userId,
                    questionId,
                    reportType: reportType,
                    description
                },
                include: {
                    question: {
                        select: {
                            id: true,
                            questionText: true
                        }
                    },
                    user: {
                        select: {
                            id: true,
                            fullName: true,
                            email: true
                        }
                    }
                }
            });
        });
    }
    getUserReports(userId) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.prisma.questionReport.findMany({
                where: { userId },
                include: {
                    question: {
                        select: {
                            id: true,
                            questionText: true
                        }
                    },
                    reviewedBy: {
                        select: {
                            id: true,
                            fullName: true
                        }
                    }
                },
                orderBy: {
                    createdAt: 'desc'
                }
            });
        });
    }
    getReportById(reportId, userId) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.prisma.questionReport.findFirst({
                where: {
                    id: reportId,
                    userId
                },
                include: {
                    question: {
                        select: {
                            id: true,
                            questionText: true,
                            explanation: true
                        }
                    },
                    user: {
                        select: {
                            id: true,
                            fullName: true,
                            email: true
                        }
                    },
                    reviewedBy: {
                        select: {
                            id: true,
                            fullName: true
                        }
                    }
                }
            });
        });
    }
    // ==========================================
    // PERFORMANCE ANALYTICS
    // ==========================================
    getDetailedPerformanceAnalytics(userId) {
        return __awaiter(this, void 0, void 0, function* () {
            // Get quiz sessions for performance tracking
            const quizSessions = yield this.prisma.quizSession.findMany({
                where: {
                    userId,
                    completedAt: { not: null }
                },
                include: {
                    quiz: {
                        select: {
                            id: true,
                            title: true,
                            course: {
                                select: {
                                    id: true,
                                    name: true
                                }
                            }
                        }
                    }
                },
                orderBy: {
                    completedAt: 'desc'
                },
                take: 100
            });
            // Get exam sessions
            const examSessions = yield this.prisma.quizSession.findMany({
                where: {
                    userId,
                    type: 'EXAM',
                    completedAt: { not: null }
                },
                include: {
                    exam: {
                        select: {
                            id: true,
                            title: true
                        }
                    }
                },
                orderBy: {
                    completedAt: 'desc'
                }
            });
            // Calculate improvement trend
            const improvementTrend = this.calculateImprovementTrend(quizSessions);
            // Get study streak
            const studyStreak = yield this.calculateStudyStreak(userId);
            // Get weekly study stats
            const weeklyStats = yield this.getWeeklyStudyStats(userId);
            return {
                totalSessions: quizSessions.length,
                totalExams: examSessions.length,
                averageScore: quizSessions.length > 0
                    ? quizSessions.reduce((sum, session) => sum + session.percentage, 0) / quizSessions.length
                    : 0,
                improvementTrend,
                studyStreak,
                weeklyStats,
                recentSessions: quizSessions.slice(0, 10),
                examResults: examSessions.slice(0, 5)
            };
        });
    }
    calculateImprovementTrend(sessions) {
        if (sessions.length < 2)
            return 0;
        const recent = sessions.slice(0, 5);
        const previous = sessions.slice(5, 10);
        if (previous.length === 0)
            return 0;
        const recentAvg = recent.reduce((sum, s) => sum + s.percentage, 0) / recent.length;
        const previousAvg = previous.reduce((sum, s) => sum + s.percentage, 0) / previous.length;
        return recentAvg - previousAvg;
    }
    calculateStudyStreak(userId) {
        return __awaiter(this, void 0, void 0, function* () {
            const sessions = yield this.prisma.quizSession.findMany({
                where: {
                    userId,
                    completedAt: { not: null }
                },
                select: {
                    completedAt: true
                },
                orderBy: {
                    completedAt: 'desc'
                }
            });
            if (sessions.length === 0)
                return 0;
            let streak = 0;
            let currentDate = new Date();
            currentDate.setHours(0, 0, 0, 0);
            for (const session of sessions) {
                const sessionDate = new Date(session.completedAt);
                sessionDate.setHours(0, 0, 0, 0);
                const dayDiff = Math.floor((currentDate.getTime() - sessionDate.getTime()) / (1000 * 60 * 60 * 24));
                if (dayDiff === streak) {
                    streak++;
                }
                else if (dayDiff === streak + 1) {
                    // Allow for one day gap
                    streak++;
                    currentDate = sessionDate;
                }
                else {
                    break;
                }
            }
            return streak;
        });
    }
    getWeeklyStudyStats(userId) {
        return __awaiter(this, void 0, void 0, function* () {
            const fourWeeksAgo = new Date();
            fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
            const sessions = yield this.prisma.quizSession.findMany({
                where: {
                    userId,
                    completedAt: {
                        gte: fourWeeksAgo
                    }
                },
                select: {
                    completedAt: true,
                    percentage: true
                },
                orderBy: {
                    completedAt: 'asc'
                }
            });
            // Group by week and calculate stats
            const weeklyStats = [];
            const weeks = ['Week 1', 'Week 2', 'Week 3', 'Week 4'];
            for (let i = 0; i < 4; i++) {
                const weekStart = new Date(fourWeeksAgo);
                weekStart.setDate(weekStart.getDate() + (i * 7));
                const weekEnd = new Date(weekStart);
                weekEnd.setDate(weekEnd.getDate() + 6);
                const weekSessions = sessions.filter(session => {
                    const sessionDate = new Date(session.completedAt);
                    return sessionDate >= weekStart && sessionDate <= weekEnd;
                });
                const averageScore = weekSessions.length > 0
                    ? weekSessions.reduce((sum, session) => sum + session.percentage, 0) / weekSessions.length
                    : 0;
                weeklyStats.push({
                    week: weeks[i],
                    sessionsCompleted: weekSessions.length,
                    averageScore: Math.round(averageScore * 100) / 100
                });
            }
            return weeklyStats;
        });
    }
    /**
     * Get comprehensive session statistics for the user
     * Extracts and analyzes statistical data similar to the session statistics interface
     */
    getSessionStatistics(userId) {
        return __awaiter(this, void 0, void 0, function* () {
            // Get all completed sessions with detailed information
            const sessions = yield this.prisma.quizSession.findMany({
                where: {
                    userId,
                    completedAt: { not: null }
                },
                include: {
                    quiz: {
                        select: {
                            id: true,
                            title: true,
                            course: {
                                select: {
                                    name: true
                                }
                            }
                        }
                    },
                    exam: {
                        select: {
                            id: true,
                            title: true
                        }
                    },
                    quizAttempts: {
                        select: {
                            isCorrect: true,
                            selectedAnswerId: true
                        }
                    },
                    sessionQuestions: {
                        select: {
                            id: true
                        }
                    }
                },
                orderBy: {
                    completedAt: 'desc'
                }
            });
            // Process each session to extract statistics
            const processedSessions = sessions.map(session => {
                var _a, _b;
                const totalQuestions = session.sessionQuestions.length;
                const correctAnswers = session.quizAttempts.filter(attempt => attempt.isCorrect).length;
                const wrongAnswers = session.quizAttempts.filter(attempt => !attempt.isCorrect && attempt.selectedAnswerId !== null).length;
                const consultedQuestions = session.quizAttempts.length; // All questions that were viewed/attempted
                const accuracy = totalQuestions > 0 ? (correctAnswers / totalQuestions) * 100 : 0;
                // Calculate session duration from startedAt and completedAt
                const durationInSeconds = session.startedAt && session.completedAt
                    ? Math.floor((new Date(session.completedAt).getTime() - new Date(session.startedAt).getTime()) / 1000)
                    : 0;
                const sessionDuration = this.formatDuration(durationInSeconds);
                const averageTimePerQuestion = totalQuestions > 0
                    ? this.formatDuration(Math.floor(durationInSeconds / totalQuestions))
                    : "00:00:00";
                return {
                    id: session.id,
                    sessionTitle: session.title,
                    sessionType: session.type === 'PRACTICE' ? 'Entraînement' : session.type,
                    sessionDuration,
                    averageTimePerQuestion,
                    totalQuestions,
                    correctAnswers,
                    wrongAnswers,
                    consultedQuestions,
                    accuracy: Math.round(accuracy * 100) / 100,
                    completedAt: session.completedAt,
                    course: (_b = (_a = session.quiz) === null || _a === void 0 ? void 0 : _a.course) === null || _b === void 0 ? void 0 : _b.name
                };
            });
            // Calculate summary statistics
            const totalSessions = processedSessions.length;
            const totalQuestions = processedSessions.reduce((sum, session) => sum + session.totalQuestions, 0);
            const totalCorrectAnswers = processedSessions.reduce((sum, session) => sum + session.correctAnswers, 0);
            const totalWrongAnswers = processedSessions.reduce((sum, session) => sum + session.wrongAnswers, 0);
            const overallAccuracy = totalQuestions > 0 ? (totalCorrectAnswers / totalQuestions) * 100 : 0;
            // Calculate average session duration
            const totalDuration = sessions.reduce((sum, session) => {
                const durationInSeconds = session.startedAt && session.completedAt
                    ? Math.floor((new Date(session.completedAt).getTime() - new Date(session.startedAt).getTime()) / 1000)
                    : 0;
                return sum + durationInSeconds;
            }, 0);
            const averageSessionDuration = totalSessions > 0
                ? this.formatDuration(Math.floor(totalDuration / totalSessions))
                : "00:00:00";
            // Calculate average time per question across all sessions
            const averageTimePerQuestion = totalQuestions > 0
                ? this.formatDuration(Math.floor(totalDuration / totalQuestions))
                : "00:00:00";
            return {
                sessions: processedSessions,
                summary: {
                    totalSessions,
                    totalQuestions,
                    totalCorrectAnswers,
                    totalWrongAnswers,
                    overallAccuracy: Math.round(overallAccuracy * 100) / 100,
                    averageSessionDuration,
                    averageTimePerQuestion
                }
            };
        });
    }
    /**
     * Get course analytics for student quiz sessions
     */
    getCourseAnalytics(userId_1, sessionId_1, sessionType_1) {
        return __awaiter(this, arguments, void 0, function* (userId, sessionId, sessionType, limit = 20, offset = 0) {
            var _a;
            // Build where conditions
            const whereConditions = {
                userId,
                completedAt: { not: null }
            };
            if (sessionId) {
                whereConditions.id = sessionId;
            }
            if (sessionType) {
                whereConditions.type = sessionType;
            }
            // Get total count for pagination
            const totalCount = yield this.prisma.quizSession.count({
                where: whereConditions
            });
            // Get the session with detailed information
            const sessions = yield this.prisma.quizSession.findMany({
                where: whereConditions,
                include: {
                    sessionQuestions: {
                        include: {
                            question: {
                                include: {
                                    course: {
                                        include: {
                                            module: true
                                        }
                                    }
                                }
                            }
                        }
                    },
                    quizAttempts: {
                        include: {
                            question: {
                                include: {
                                    course: {
                                        include: {
                                            module: true
                                        }
                                    }
                                }
                            }
                        }
                    }
                },
                orderBy: { completedAt: 'desc' },
                take: limit,
                skip: offset
            });
            if (sessions.length === 0) {
                throw new Error('No sessions found matching the criteria');
            }
            // For now, return the first session (most recent or specific session if sessionId provided)
            const session = sessions[0];
            // Calculate session metrics
            const totalQuestions = session.sessionQuestions.length;
            const correctAnswers = session.quizAttempts.filter(attempt => attempt.isCorrect === true).length;
            const incorrectAnswers = session.quizAttempts.filter(attempt => attempt.isCorrect === false).length;
            // Calculate time spent
            const timeSpentMs = session.startedAt && session.completedAt
                ? new Date(session.completedAt).getTime() - new Date(session.startedAt).getTime()
                : 0;
            const timeSpentMinutes = Math.round(timeSpentMs / (1000 * 60));
            const averageTimePerQuestion = totalQuestions > 0 ? timeSpentMinutes / totalQuestions : 0;
            // Group questions by course and calculate course analytics
            const courseMap = new Map();
            session.sessionQuestions.forEach(sessionQuestion => {
                var _a;
                const question = sessionQuestion.question;
                const course = question.course;
                if (course) {
                    if (!courseMap.has(course.id)) {
                        courseMap.set(course.id, {
                            id: course.id,
                            name: course.name,
                            description: course.description,
                            moduleId: course.moduleId,
                            moduleName: ((_a = course.module) === null || _a === void 0 ? void 0 : _a.name) || 'Unknown Module',
                            questions: [],
                            attempts: []
                        });
                    }
                    courseMap.get(course.id).questions.push(question);
                }
            });
            // Add attempts to courses
            session.quizAttempts.forEach(attempt => {
                const question = attempt.question;
                const course = question.course;
                if (course && courseMap.has(course.id)) {
                    courseMap.get(course.id).attempts.push(attempt);
                }
            });
            // Calculate analytics for each course
            const courses = Array.from(courseMap.values()).map(courseData => {
                const totalQuestions = courseData.questions.length;
                const totalCorrectAnswers = courseData.attempts.filter((attempt) => attempt.isCorrect === true).length;
                const totalIncorrectAnswers = courseData.attempts.filter((attempt) => attempt.isCorrect === false).length;
                const overallAccuracy = totalQuestions > 0 ? (totalCorrectAnswers / totalQuestions) * 100 : 0;
                return {
                    id: courseData.id,
                    name: courseData.name,
                    description: courseData.description,
                    moduleId: courseData.moduleId,
                    moduleName: courseData.moduleName,
                    courseAnalytics: {
                        totalQuestions,
                        totalCorrectAnswers,
                        totalIncorrectAnswers,
                        overallAccuracy: Math.round(overallAccuracy * 100) / 100
                    }
                };
            });
            return {
                session: {
                    id: session.id,
                    title: session.title,
                    type: session.type,
                    status: session.status,
                    completedAt: ((_a = session.completedAt) === null || _a === void 0 ? void 0 : _a.toISOString()) || null,
                    totalQuestions,
                    correctAnswers,
                    incorrectAnswers,
                    percentage: session.percentage,
                    timeSpent: timeSpentMinutes,
                    averageTimePerQuestion: Math.round(averageTimePerQuestion * 100) / 100,
                    courses
                },
                totalCount
            };
        });
    }
    /**
     * Format duration in seconds to HH:MM:SS format
     */
    formatDuration(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const remainingSeconds = seconds % 60;
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
    // ==========================================
    // CANONICAL SPEC ENDPOINTS - Practice Sessions
    // ==========================================
    /**
     * GET /students/sessions/filters - Canonical spec
     * Returns filter options for sessions by type
     */
    getSessionsFiltersCanonical(userId, sessionType, studyPackIds, yearLevel) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            // Build where clause for unites: filter by studyPackIds if provided
            const uniteWhere = {};
            if (studyPackIds && studyPackIds.length > 0) {
                uniteWhere.studyPackId = { in: studyPackIds };
            }
            if (yearLevel) {
                uniteWhere.studyPack = { yearNumber: yearLevel };
            }
            // Get unites filtered by accessible study packs (and optionally yearLevel)
            const unites = yield this.prisma.unite.findMany({
                where: Object.keys(uniteWhere).length > 0 ? uniteWhere : undefined,
                include: {
                    modules: {
                        include: {
                            courses: {
                                select: {
                                    id: true,
                                    name: true,
                                    description: true
                                }
                            }
                        }
                    }
                }
            });
            // Independent modules (uniteId: null) don't belong to any StudyPack directly.
            // Filter them by year level: StudyPack.yearNumber → Module.courses.questions.yearLevel
            const independentModulesWhere = { uniteId: null };
            // Determine which yearNumbers to filter by
            let effectiveYearNumbers = [];
            if (yearLevel) {
                effectiveYearNumbers = [yearLevel];
            }
            else if (studyPackIds && studyPackIds.length > 0) {
                const packs = yield this.prisma.studyPack.findMany({
                    where: { id: { in: studyPackIds } },
                    select: { yearNumber: true }
                });
                effectiveYearNumbers = packs.map((p) => p.yearNumber).filter(Boolean);
            }
            if (effectiveYearNumbers.length > 0) {
                independentModulesWhere.courses = {
                    some: {
                        questions: {
                            some: {
                                yearLevel: { in: effectiveYearNumbers }
                            }
                        }
                    }
                };
            }
            const independentModulesRaw = yield this.prisma.module.findMany({
                where: independentModulesWhere,
                include: {
                    courses: {
                        select: {
                            id: true,
                            name: true,
                            description: true
                        }
                    }
                }
            });
            // Get session-question mappings to determine modules
            const sessionsWithModules = yield this.prisma.quizSession.findMany({
                where: {
                    userId,
                    type: sessionType === 'PRACTICE' ? 'PRACTICE' : 'EXAM'
                },
                include: {
                    sessionQuestions: {
                        include: {
                            question: {
                                include: {
                                    course: {
                                        include: {
                                            module: true
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            });
            // Count sessions per module
            const moduleSessionCounts = {};
            for (const session of sessionsWithModules) {
                const moduleIds = new Set();
                for (const sq of session.sessionQuestions) {
                    if ((_b = (_a = sq.question) === null || _a === void 0 ? void 0 : _a.course) === null || _b === void 0 ? void 0 : _b.moduleId) {
                        moduleIds.add(sq.question.course.moduleId);
                    }
                }
                for (const moduleId of moduleIds) {
                    moduleSessionCounts[moduleId] = (moduleSessionCounts[moduleId] || 0) + 1;
                }
            }
            const unitesResult = unites.map(unite => ({
                id: unite.id,
                name: unite.name,
                sessionsCount: unite.modules.reduce((sum, m) => sum + (moduleSessionCounts[m.id] || 0), 0),
                modules: unite.modules.map(module => ({
                    id: module.id,
                    name: module.name,
                    sessionsCount: moduleSessionCounts[module.id] || 0,
                    courses: module.courses.map(course => ({
                        id: course.id,
                        name: course.name,
                        description: course.description
                    }))
                }))
            }));
            return {
                unites: unitesResult,
                independentModules: independentModulesRaw.map((module) => ({
                    id: module.id,
                    name: module.name,
                    sessionsCount: moduleSessionCounts[module.id] || 0,
                    courses: module.courses.map((course) => ({
                        id: course.id,
                        name: course.name,
                        description: course.description
                    }))
                }))
            };
        });
    }
    /**
     * GET /students/practise-sessions - Canonical spec
     * Returns practice sessions with pagination
     */
    getPractiseSessionsCanonical(userId, sessionType, options) {
        return __awaiter(this, void 0, void 0, function* () {
            const { moduleId, uniteId, page, limit } = options;
            // Build where clause
            const whereClause = {
                userId,
                type: sessionType === 'PRACTICE' ? 'PRACTICE' : 'EXAM'
            };
            // If moduleId or uniteId is provided, filter sessions
            let sessionIds;
            if (moduleId || uniteId) {
                const sessionsWithFilters = yield this.prisma.quizSession.findMany({
                    where: {
                        userId,
                        type: sessionType === 'PRACTICE' ? 'PRACTICE' : 'EXAM'
                    },
                    include: {
                        sessionQuestions: {
                            include: {
                                question: {
                                    include: {
                                        course: {
                                            include: {
                                                module: true
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                });
                sessionIds = sessionsWithFilters
                    .filter(session => {
                    return session.sessionQuestions.some(sq => {
                        var _a, _b;
                        const course = (_a = sq.question) === null || _a === void 0 ? void 0 : _a.course;
                        if (!course)
                            return false;
                        if (moduleId)
                            return course.moduleId === moduleId;
                        if (uniteId)
                            return ((_b = course.module) === null || _b === void 0 ? void 0 : _b.uniteId) === uniteId;
                        return false;
                    });
                })
                    .map(s => s.id);
                if (sessionIds.length === 0) {
                    return {
                        items: [],
                        total: 0,
                        page,
                        limit,
                        totalPages: 0
                    };
                }
                whereClause.id = { in: sessionIds };
            }
            // Get total count
            const total = yield this.prisma.quizSession.count({ where: whereClause });
            // Get paginated sessions
            const sessions = yield this.prisma.quizSession.findMany({
                where: whereClause,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit
            });
            // Calculate scores for each session
            const items = yield Promise.all(sessions.map((session) => __awaiter(this, void 0, void 0, function* () {
                var _a;
                // Get attempts for this session to calculate score
                const attempts = yield this.prisma.quizAttempt.findMany({
                    where: { sessionId: session.id }
                });
                let score = null;
                if (attempts.length > 0) {
                    const correctCount = attempts.filter(a => a.isCorrect).length;
                    score = Math.round((correctCount / attempts.length) * 100);
                }
                return {
                    id: session.id,
                    title: session.title,
                    status: session.status,
                    type: session.type,
                    createdAt: session.createdAt.toISOString(),
                    completedAt: ((_a = session.completedAt) === null || _a === void 0 ? void 0 : _a.toISOString()) || null,
                    score
                };
            })));
            return {
                items,
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            };
        });
    }
    /**
     * GET /students/sessions/residency-filters - Canonical spec
     * Returns: { universities: [{id, name, examYears, parts}], parts: ['PART_1', 'PART_2', ...], totalQuestions }
     */
    getResidencyFiltersCanonical(userId) {
        return __awaiter(this, void 0, void 0, function* () {
            // Get all universities with their questions and exam years
            const universities = yield this.prisma.university.findMany({
                select: {
                    id: true,
                    name: true,
                    questions: {
                        where: {
                            examYear: { not: null }
                        },
                        select: {
                            examYear: true,
                            metadata: true
                        }
                    }
                }
            });
            const allParts = new Set();
            // Process universities with unique exam years
            const universitiesWithYears = universities
                .map(uni => {
                const examYears = [...new Set(uni.questions.map(q => q.examYear).filter((y) => y !== null))];
                const uniParts = new Set();
                uni.questions.forEach(q => {
                    if (q.metadata) {
                        try {
                            const meta = JSON.parse(q.metadata);
                            if (meta.part) {
                                uniParts.add(meta.part);
                                allParts.add(meta.part);
                            }
                        }
                        catch (e) {
                            // Ignore parse errors safely
                        }
                    }
                });
                return {
                    id: uni.id,
                    name: uni.name,
                    examYears: examYears.sort((a, b) => b - a), // Sort descending
                    parts: Array.from(uniParts).sort()
                };
            })
                .filter(uni => uni.examYears.length > 0); // Only include universities with exam years
            // Get total question count
            const totalQuestions = yield this.prisma.question.count({
                where: {
                    universityId: { not: null },
                    examYear: { not: null }
                }
            });
            return {
                universities: universitiesWithYears,
                parts: Array.from(allParts).sort(),
                totalQuestions
            };
        });
    }
    // ==========================================
    // CANONICAL SPEC ENDPOINTS - Course Layers & Cards
    // ==========================================
    /**
     * POST /students/course-layers - Canonical spec
     * Upsert course layer completion status
     */
    upsertCourseLayerCanonical(userId, courseId, layerNumber, completed) {
        return __awaiter(this, void 0, void 0, function* () {
            const layer = yield this.prisma.courseLayer.upsert({
                where: {
                    courseId_studentId_layerNumber: {
                        courseId,
                        studentId: userId,
                        layerNumber
                    }
                },
                update: {
                    isCompleted: completed,
                    completedAt: completed ? new Date() : null
                },
                create: {
                    courseId,
                    studentId: userId,
                    layerNumber,
                    isCompleted: completed,
                    completedAt: completed ? new Date() : null
                }
            });
            return {
                courseId: layer.courseId,
                layerNumber: layer.layerNumber,
                completed: layer.isCompleted,
                updatedAt: layer.updatedAt.toISOString()
            };
        });
    }
    /**
     * GET /students/courses/:courseId/layers - Canonical spec
     * Get all layer completion statuses for a course
     */
    getCourseLayersCanonical(userId, courseId) {
        return __awaiter(this, void 0, void 0, function* () {
            const layers = yield this.prisma.courseLayer.findMany({
                where: {
                    courseId,
                    studentId: userId
                },
                orderBy: { layerNumber: 'asc' }
            });
            // Return layers 1-3 (default layers), merging with existing data
            const layerMap = new Map(layers.map(l => [l.layerNumber, l.isCompleted]));
            const defaultLayers = [1, 2, 3].map(num => ({
                layerNumber: num,
                completed: layerMap.get(num) || false
            }));
            return {
                courseId,
                layers: defaultLayers
            };
        });
    }
    /**
     * Check if course exists
     */
    courseExistsByCourseId(courseId) {
        return __awaiter(this, void 0, void 0, function* () {
            const course = yield this.prisma.course.findUnique({
                where: { id: courseId }
            });
            return !!course;
        });
    }
    /**
     * POST /students/cards - Canonical spec
     * Create a study card with optional courses
     */
    createCardCanonical(userId, title, description, courseIds) {
        return __awaiter(this, void 0, void 0, function* () {
            const card = yield this.prisma.studentCard.create({
                data: {
                    userId,
                    title,
                    description: description || null,
                    courses: courseIds && courseIds.length > 0 ? {
                        create: courseIds.map(courseId => ({ courseId }))
                    } : undefined
                },
                include: {
                    courses: {
                        select: { courseId: true }
                    }
                }
            });
            return {
                id: card.id,
                title: card.title,
                description: card.description,
                courseIds: card.courses.map(c => c.courseId),
                createdAt: card.createdAt.toISOString()
            };
        });
    }
    /**
     * GET /students/cards - Canonical spec
     * Get all cards for the authenticated user
     */
    getAllCardsCanonical(userId) {
        return __awaiter(this, void 0, void 0, function* () {
            const cards = yield this.prisma.studentCard.findMany({
                where: { userId },
                include: {
                    courses: {
                        select: { courseId: true }
                    }
                },
                orderBy: { createdAt: 'desc' }
            });
            return cards.map(card => ({
                id: card.id,
                title: card.title,
                description: card.description,
                courseIds: card.courses.map(c => c.courseId),
                createdAt: card.createdAt.toISOString()
            }));
        });
    }
    /**
     * GET /students/cards/filter-by-unit-module - Canonical spec
     * Get cards filtered by uniteId or moduleId
     */
    getCardsByUnitModuleCanonical(userId, uniteId, moduleId) {
        return __awaiter(this, void 0, void 0, function* () {
            // Build course filter based on uniteId or moduleId
            let courseFilter = {};
            if (moduleId) {
                courseFilter = { module: { id: moduleId } };
            }
            else if (uniteId) {
                courseFilter = { module: { uniteId } };
            }
            // Get cards that have courses matching the filter
            const cards = yield this.prisma.studentCard.findMany({
                where: {
                    userId,
                    courses: {
                        some: {
                            course: courseFilter
                        }
                    }
                },
                include: {
                    courses: {
                        select: { courseId: true }
                    }
                },
                orderBy: { createdAt: 'desc' }
            });
            return cards.map(card => ({
                id: card.id,
                title: card.title,
                description: card.description,
                courseIds: card.courses.map(c => c.courseId),
                createdAt: card.createdAt.toISOString()
            }));
        });
    }
    /**
     * GET /students/cards/:cardId - Canonical spec
     * Get card by ID with full course details
     */
    getCardByIdCanonical(userId, cardId) {
        return __awaiter(this, void 0, void 0, function* () {
            const card = yield this.prisma.studentCard.findFirst({
                where: {
                    id: cardId,
                    userId
                },
                include: {
                    courses: {
                        include: {
                            course: {
                                select: {
                                    id: true,
                                    name: true,
                                    description: true
                                }
                            }
                        }
                    }
                }
            });
            if (!card)
                return null;
            return {
                id: card.id,
                title: card.title,
                description: card.description,
                courses: card.courses.map(c => ({
                    id: c.course.id,
                    name: c.course.name,
                    description: c.course.description
                })),
                createdAt: card.createdAt.toISOString()
            };
        });
    }
    /**
     * PUT /students/cards/:cardId - Canonical spec
     * Update card title and/or description
     */
    updateCardCanonical(userId, cardId, data) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            // First check ownership
            const existing = yield this.prisma.studentCard.findFirst({
                where: { id: cardId, userId }
            });
            if (!existing)
                return null;
            const updated = yield this.prisma.studentCard.update({
                where: { id: cardId },
                data: {
                    title: (_a = data.title) !== null && _a !== void 0 ? _a : existing.title,
                    description: (_b = data.description) !== null && _b !== void 0 ? _b : existing.description
                },
                include: {
                    courses: {
                        select: { courseId: true }
                    }
                }
            });
            return {
                id: updated.id,
                title: updated.title,
                description: updated.description,
                courseIds: updated.courses.map(c => c.courseId),
                createdAt: updated.createdAt.toISOString(),
                updatedAt: updated.updatedAt.toISOString()
            };
        });
    }
    /**
     * DELETE /students/cards/:cardId - Canonical spec
     * Delete a card (ownership checked)
     */
    deleteCardCanonical(userId, cardId) {
        return __awaiter(this, void 0, void 0, function* () {
            // Check ownership first
            const card = yield this.prisma.studentCard.findFirst({
                where: { id: cardId, userId }
            });
            if (!card)
                return false;
            yield this.prisma.studentCard.delete({
                where: { id: cardId }
            });
            return true;
        });
    }
    /**
     * POST /students/cards/:cardId/courses/:courseId - Canonical spec
     * Add a course to a card
     */
    addCourseToCardCanonical(userId, cardId, courseId) {
        return __awaiter(this, void 0, void 0, function* () {
            // Check card ownership
            const card = yield this.prisma.studentCard.findFirst({
                where: { id: cardId, userId }
            });
            if (!card)
                return { success: false };
            // Check if course already in card
            const existing = yield this.prisma.studentCardCourse.findUnique({
                where: {
                    cardId_courseId: { cardId, courseId }
                }
            });
            if (existing)
                return { success: false, alreadyExists: true };
            yield this.prisma.studentCardCourse.create({
                data: { cardId, courseId }
            });
            return { success: true };
        });
    }
    /**
     * DELETE /students/cards/:cardId/courses/:courseId - Canonical spec
     * Remove a course from a card
     */
    removeCourseFromCardCanonical(userId, cardId, courseId) {
        return __awaiter(this, void 0, void 0, function* () {
            // Check card ownership
            const card = yield this.prisma.studentCard.findFirst({
                where: { id: cardId, userId }
            });
            if (!card)
                return false;
            // Check if association exists
            const existing = yield this.prisma.studentCardCourse.findUnique({
                where: {
                    cardId_courseId: { cardId, courseId }
                }
            });
            if (!existing)
                return false;
            yield this.prisma.studentCardCourse.delete({
                where: {
                    cardId_courseId: { cardId, courseId }
                }
            });
            return true;
        });
    }
    /**
     * GET /students/cards/:cardId/progress - Canonical spec
     * Get progress for all courses in a card based on layer completion
     */
    getCardProgressCanonical(userId, cardId) {
        return __awaiter(this, void 0, void 0, function* () {
            // Get card with courses
            const card = yield this.prisma.studentCard.findFirst({
                where: { id: cardId, userId },
                include: {
                    courses: {
                        include: {
                            course: {
                                select: {
                                    id: true,
                                    name: true
                                }
                            }
                        }
                    }
                }
            });
            if (!card)
                return null;
            const totalLayers = 3; // Each course has 3 layers
            // Get layer completions for all courses in the card
            const courseIds = card.courses.map(c => c.courseId);
            const layers = yield this.prisma.courseLayer.findMany({
                where: {
                    studentId: userId,
                    courseId: { in: courseIds }
                }
            });
            // Build progress per course
            const courseProgress = card.courses.map(cc => {
                const courseLayers = layers.filter(l => l.courseId === cc.courseId && l.isCompleted);
                const layersCompleted = courseLayers.length;
                const percentage = Math.round((layersCompleted / totalLayers) * 100);
                return {
                    courseId: cc.course.id,
                    courseName: cc.course.name,
                    layersCompleted,
                    totalLayers,
                    percentage
                };
            });
            // Calculate overall card progress
            const totalCourses = courseProgress.length;
            const cardProgressPercentage = totalCourses > 0
                ? Math.round(courseProgress.reduce((sum, cp) => sum + cp.percentage, 0) / totalCourses)
                : 0;
            return {
                cardProgressPercentage,
                totalCourses,
                courseProgress
            };
        });
    }
};
StudentRepository = __decorate([
    (0, tsyringe_1.injectable)(),
    __param(0, (0, tsyringe_1.inject)("db")),
    __metadata("design:paramtypes", [db_1.default])
], StudentRepository);
exports.default = StudentRepository;
