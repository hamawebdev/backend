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
const student_repository_1 = __importDefault(require("./student.repository"));
const AppError_1 = require("../../core/errors/AppError");
const db_1 = __importDefault(require("../../config/db"));
let StudentService = class StudentService {
    constructor(studentRepository, prismaService) {
        this.studentRepository = studentRepository;
        this.prismaService = prismaService;
    }
    get prisma() {
        return this.prismaService.getClient();
    }
    getProgressOverview(user) {
        return __awaiter(this, void 0, void 0, function* () {
            const progressData = yield this.studentRepository.getStudentProgressOverview(user.user_data.id);
            return {
                success: true,
                data: progressData
            };
        });
    }
    updateCourseProgress(courseId, layer, completed, user) {
        return __awaiter(this, void 0, void 0, function* () {
            // Validate that the course exists before attempting to update progress
            const courseExists = yield this.studentRepository.courseExists(courseId);
            if (!courseExists) {
                throw new AppError_1.NotFoundError("Course", courseId.toString());
            }
            yield this.studentRepository.updateCourseProgress(user.user_data.id, courseId, layer, completed);
            return {
                success: true,
                message: `Course layer ${layer} progress updated successfully`
            };
        });
    }
    getQuizHistory(user_1, type_1) {
        return __awaiter(this, arguments, void 0, function* (user, type, page = 1, limit = 20) {
            const offset = (page - 1) * limit;
            // Get sessions and analytics in parallel
            const [sessionData, analytics] = yield Promise.all([
                this.studentRepository.getStudentQuizHistory(user.user_data.id, type, limit, offset),
                this.studentRepository.getStudentQuizAnalytics(user.user_data.id, type)
            ]);
            const { sessions, totalCount } = sessionData;
            const totalPages = Math.ceil(totalCount / limit);
            const hasMore = page < totalPages;
            return {
                success: true,
                data: {
                    sessions,
                    analytics,
                    pagination: {
                        currentPage: page,
                        totalItems: totalCount,
                        totalPages,
                        hasMore
                    }
                }
            };
        });
    }
    getCourseAnalytics(user_1, sessionId_1, sessionType_1) {
        return __awaiter(this, arguments, void 0, function* (user, sessionId, sessionType, page = 1, limit = 20) {
            const offset = (page - 1) * limit;
            const result = yield this.studentRepository.getCourseAnalytics(user.user_data.id, sessionId, sessionType, limit, offset);
            const totalPages = Math.ceil(result.totalCount / limit);
            const hasMore = page < totalPages;
            return {
                success: true,
                data: {
                    session: result.session,
                    pagination: {
                        currentPage: page,
                        totalItems: result.totalCount,
                        totalPages,
                        hasMore
                    }
                }
            };
        });
    }
    getPerformanceAnalytics(user) {
        return __awaiter(this, void 0, void 0, function* () {
            const analyticsData = yield this.studentRepository.getStudentPerformanceAnalytics(user.user_data.id);
            return {
                success: true,
                data: analyticsData
            };
        });
    }
    getStudentDashboard(user) {
        return __awaiter(this, void 0, void 0, function* () {
            // Get overview data
            const overview = yield this.studentRepository.getStudentProgressOverview(user.user_data.id);
            // Get recent sessions
            const recentSessionsData = yield this.studentRepository.getStudentQuizHistory(user.user_data.id, undefined, 5, // Last 5 sessions
            0);
            const recentSessions = recentSessionsData.sessions;
            // Get performance analytics for weekly progress
            const analytics = yield this.studentRepository.getStudentPerformanceAnalytics(user.user_data.id);
            // Format dashboard data
            const dashboardData = {
                overview: {
                    totalQuizzesTaken: overview.overallStats.totalQuizzesTaken,
                    averageScore: overview.overallStats.averageQuizScore,
                    coursesInProgress: overview.overallStats.coursesInProgress,
                    coursesCompleted: overview.overallStats.coursesCompleted,
                    streak: this.calculateStudyStreak(recentSessions),
                    level: this.calculateStudentLevel(overview.overallStats)
                },
                recentSessions: recentSessions.slice(0, 5).map(session => ({
                    id: session.id,
                    title: session.title,
                    type: session.type,
                    percentage: session.percentage,
                    completedAt: session.completedAt
                })),
                weeklyProgress: analytics.weeklyProgress.slice(-4), // Last 4 weeks
                upcomingGoals: this.generateUpcomingGoals(overview)
            };
            return {
                success: true,
                data: dashboardData
            };
        });
    }
    calculateStudyStreak(sessions) {
        if (sessions.length === 0)
            return 0;
        let streak = 0;
        let currentDate = new Date();
        currentDate.setHours(0, 0, 0, 0);
        for (const session of sessions.sort((a, b) => new Date(b.completedAt || b.updatedAt).getTime() -
            new Date(a.completedAt || a.updatedAt).getTime())) {
            const sessionDate = new Date(session.completedAt || session.updatedAt);
            sessionDate.setHours(0, 0, 0, 0);
            const daysDiff = Math.floor((currentDate.getTime() - sessionDate.getTime()) / (1000 * 60 * 60 * 24));
            if (daysDiff === streak) {
                streak++;
                currentDate.setDate(currentDate.getDate() - 1);
            }
            else if (daysDiff > streak + 1) {
                break;
            }
        }
        return streak;
    }
    calculateStudentLevel(stats) {
        const totalXP = stats.totalQuizzesTaken * 10 + stats.coursesCompleted * 50;
        const level = Math.floor(totalXP / 100) + 1;
        const currentLevelXP = totalXP % 100;
        const progress = (currentLevelXP / 100) * 100;
        const titles = [
            "Beginner", "Novice", "Apprentice", "Student", "Scholar",
            "Expert", "Master", "Genius", "Legend", "Champion"
        ];
        const titleIndex = Math.min(Math.floor(level / 2), titles.length - 1);
        return {
            level,
            title: titles[titleIndex],
            progress: Math.round(progress)
        };
    }
    generateUpcomingGoals(overview) {
        const goals = [];
        // Quiz completion goal
        const nextQuizMilestone = Math.ceil((overview.overallStats.totalQuizzesTaken + 1) / 10) * 10;
        goals.push({
            id: 'quiz-milestone',
            title: `Complete ${nextQuizMilestone} Quizzes`,
            description: 'Keep practicing to reach your next milestone',
            target: nextQuizMilestone,
            current: overview.overallStats.totalQuizzesTaken,
            type: 'quiz'
        });
        // Average score improvement
        if (overview.overallStats.averageQuizScore < 80) {
            goals.push({
                id: 'score-improvement',
                title: 'Achieve 80% Average Score',
                description: 'Improve your overall quiz performance',
                target: 80,
                current: Math.round(overview.overallStats.averageQuizScore),
                type: 'score'
            });
        }
        // Course completion goal
        if (overview.overallStats.coursesInProgress > 0) {
            goals.push({
                id: 'course-completion',
                title: 'Complete Current Courses',
                description: 'Finish all courses you have in progress',
                target: overview.overallStats.coursesInProgress,
                current: 0,
                type: 'course'
            });
        }
        return goals.slice(0, 3); // Return top 3 goals
    }
    // ==========================================
    // STUDY CONTENT ACCESS & NAVIGATION
    // ==========================================
    /**
     * GET /students/content/filters - Hierarchical navigation structure
     * Canonical spec: { unites: [...], independentModules: [...] }
     */
    getContentFilters(user, yearLevel) {
        return __awaiter(this, void 0, void 0, function* () {
            const data = yield this.studentRepository.getContentFilters(yearLevel);
            return data;
        });
    }
    /**
     * GET /study-packs - Paginated list
     * Canonical spec: { items, total, page, limit, totalPages }
     */
    getStudyPacks(user, options) {
        return __awaiter(this, void 0, void 0, function* () {
            const { page, limit, search } = options;
            const { studyPacks, total } = yield this.studentRepository.getStudyPacksPaginated(page, limit, search);
            // Format for canonical spec
            const items = studyPacks.map(pack => ({
                id: pack.id,
                name: pack.name,
                description: pack.description,
                type: pack.type,
                yearNumber: pack.yearNumber,
                pricePerMonth: pack.pricePerMonth,
                pricePerYear: pack.pricePerYear,
                isActive: pack.isActive
            }));
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
     * GET /study-packs/:studyPackId - Study pack details
     * Canonical spec: { id, name, description, type, yearNumber, pricePerMonth, pricePerYear, isActive, modules: [...] }
     */
    getStudyPackById(packId, user) {
        return __awaiter(this, void 0, void 0, function* () {
            const studyPack = yield this.studentRepository.getStudyPackById(packId);
            if (!studyPack) {
                throw new AppError_1.NotFoundError('Study pack', packId.toString());
            }
            // Flatten unites -> modules for canonical spec (expects modules directly)
            const modules = [];
            studyPack.unites.forEach((unite) => {
                unite.modules.forEach((module) => {
                    modules.push({
                        id: module.id,
                        name: module.name,
                        courses: module.courses.map((course) => ({
                            id: course.id,
                            name: course.name
                        }))
                    });
                });
            });
            return {
                id: studyPack.id,
                name: studyPack.name,
                description: studyPack.description,
                type: studyPack.type,
                yearNumber: studyPack.yearNumber,
                pricePerMonth: studyPack.pricePerMonth,
                pricePerYear: studyPack.pricePerYear,
                isActive: studyPack.isActive,
                modules
            };
        });
    }
    /**
     * GET /student/study-pack/:studyPackId - Study pack in student context
     * Canonical spec: { id, name, description, type, yearNumber, modules: [...] }
     */
    getStudentStudyPack(packId, user) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const studyPack = yield this.studentRepository.getStudyPackById(packId);
            if (!studyPack) {
                throw new AppError_1.NotFoundError('Study pack', packId.toString());
            }
            // Check access (403 if no access)
            const hasAccess = ((_a = user.accessible_study_packs) === null || _a === void 0 ? void 0 : _a.includes(packId)) || false;
            if (!hasAccess && !user.has_active_subscription) {
                throw new Error('No access to this study pack');
            }
            // Flatten unites -> modules for canonical spec
            const modules = [];
            studyPack.unites.forEach((unite) => {
                unite.modules.forEach((module) => {
                    modules.push({
                        id: module.id,
                        name: module.name,
                        courses: module.courses.map((course) => ({
                            id: course.id,
                            name: course.name,
                            description: course.description
                        }))
                    });
                });
            });
            return {
                id: studyPack.id,
                name: studyPack.name,
                description: studyPack.description,
                type: studyPack.type,
                yearNumber: studyPack.yearNumber,
                modules
            };
        });
    }
    /**
     * GET /courses/:courseId/resources - Paginated resources
     * Canonical spec: { items, total, page, limit, totalPages }
     */
    getCourseResources(courseId, user, options) {
        return __awaiter(this, void 0, void 0, function* () {
            const { page, limit, type } = options;
            const { resources, total } = yield this.studentRepository.getCourseResourcesPaginated(courseId, page, limit, type);
            const items = resources.map(resource => ({
                id: resource.id,
                courseId: resource.courseId,
                type: resource.type,
                title: resource.title,
                description: resource.description,
                filePath: resource.filePath,
                externalUrl: resource.externalUrl,
                youtubeVideoId: resource.youtubeVideoId,
                createdAt: resource.createdAt
            }));
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
     * GET /students/courses/by-module - Courses by moduleId or uniteId
     * Canonical spec: { courses: [...] }
     */
    getCoursesByModule(user, options) {
        return __awaiter(this, void 0, void 0, function* () {
            const courses = yield this.studentRepository.getCoursesByModuleOrUnite(options.moduleId, options.uniteId);
            return {
                courses: courses.map(course => ({
                    id: course.id,
                    name: course.name,
                    description: course.description,
                    module: course.module ? {
                        id: course.module.id,
                        name: course.module.name
                    } : null
                }))
            };
        });
    }
    /**
     * GET /students/modules/:moduleId/books
     * Get all books for a module
     */
    getModuleBooksCanonical(user, moduleId) {
        return __awaiter(this, void 0, void 0, function* () {
            const books = yield this.prisma.moduleBook.findMany({
                where: { moduleId },
                orderBy: { createdAt: 'desc' }
            });
            return {
                books: books.map(book => ({
                    id: book.id,
                    name: book.name,
                    cover_path: book.coverPath,
                    view: book.viewUrl
                }))
            };
        });
    }
    // ==========================================
    // SUBSCRIPTION MANAGEMENT
    // ==========================================
    /**
     * GET /students/subscriptions
     * Canonical spec: Returns array directly [{ id, studyPackId, status, startDate, endDate, studyPack }]
     */
    getUserSubscriptions(user) {
        return __awaiter(this, void 0, void 0, function* () {
            const subscriptions = yield this.studentRepository.getUserSubscriptions(user.user_data.id);
            // Format for canonical spec: simple array with minimal studyPack info
            return subscriptions.map(subscription => ({
                id: subscription.id,
                studyPackId: subscription.studyPackId,
                status: subscription.status,
                startDate: subscription.startDate,
                endDate: subscription.endDate,
                studyPack: {
                    id: subscription.studyPack.id,
                    name: subscription.studyPack.name,
                    type: subscription.studyPack.type,
                    yearNumber: subscription.studyPack.yearNumber
                }
            }));
        });
    }
    /**
     * GET /subscriptions/check-access
     * Canonical spec: { hasAccess, subscriptionRequired, subscriptionType?, trialAvailable? }
     */
    checkSubscriptionAccess(user, contentId, contentType) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            const userId = user.user_data.id;
            // Get active subscriptions for user
            const subscriptions = yield this.prisma.subscription.findMany({
                where: {
                    userId,
                    status: 'ACTIVE',
                    endDate: { gte: new Date() }
                },
                include: {
                    studyPack: true
                }
            });
            let hasAccess = false;
            let subscriptionType;
            if (contentType === 'study-pack') {
                // Check if user has subscription to this study pack
                const matchingSubscription = subscriptions.find(s => s.studyPackId === contentId);
                if (matchingSubscription) {
                    hasAccess = true;
                    subscriptionType = matchingSubscription.studyPack.type;
                }
            }
            else if (contentType === 'course') {
                // Find the course and check if user has access to its study pack
                const course = yield this.prisma.course.findUnique({
                    where: { id: contentId },
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
                });
                if ((_b = (_a = course === null || course === void 0 ? void 0 : course.module) === null || _a === void 0 ? void 0 : _a.unite) === null || _b === void 0 ? void 0 : _b.studyPack) {
                    const studyPackId = course.module.unite.studyPack.id;
                    const matchingSubscription = subscriptions.find(s => s.studyPackId === studyPackId);
                    if (matchingSubscription) {
                        hasAccess = true;
                        subscriptionType = course.module.unite.studyPack.type;
                    }
                }
            }
            return {
                hasAccess,
                subscriptionRequired: !hasAccess,
                subscriptionType,
                trialAvailable: false // TODO: implement trial logic if needed
            };
        });
    }
    /**
     * POST /subscriptions/:subscriptionId/cancel
     * Canonical spec: { success, message, cancellationDate }
     */
    cancelSubscription(subscriptionId, user) {
        return __awaiter(this, void 0, void 0, function* () {
            const userId = user.user_data.id;
            // Get the subscription and verify ownership
            const subscription = yield this.prisma.subscription.findUnique({
                where: { id: subscriptionId }
            });
            if (!subscription) {
                throw new AppError_1.NotFoundError('Subscription', subscriptionId.toString());
            }
            if (subscription.userId !== userId) {
                throw new Error('You do not have permission to cancel this subscription');
            }
            if (subscription.status !== 'ACTIVE') {
                throw new Error('Subscription is not active and cannot be cancelled');
            }
            // Cancel the subscription - access ends at current endDate
            const cancellationDate = subscription.endDate;
            yield this.prisma.subscription.update({
                where: { id: subscriptionId },
                data: {
                    status: 'CANCELLED'
                }
            });
            return {
                success: true,
                message: 'Subscription cancelled successfully',
                cancellationDate: cancellationDate.toISOString()
            };
        });
    }
    // ==========================================
    // STUDENT NOTES SYSTEM
    // ==========================================
    getStudentNotes(user, questionId, quizId) {
        return __awaiter(this, void 0, void 0, function* () {
            const notes = yield this.studentRepository.getStudentNotes(user.user_data.id, questionId, quizId);
            // Group notes by module
            const moduleGroups = {};
            const ungroupedNotes = [];
            notes.forEach(note => {
                var _a, _b, _c, _d;
                const formattedNote = {
                    id: note.id,
                    noteText: note.noteText,
                    questionId: note.questionId,
                    quizId: note.quizId,
                    question: note.question ? {
                        id: note.question.id,
                        questionText: note.question.questionText.substring(0, 100) + '...',
                        course: note.question.course
                    } : null,
                    quiz: note.quiz ? {
                        id: note.quiz.id,
                        title: note.quiz.title,
                        course: note.quiz.course
                    } : null,
                    createdAt: note.createdAt,
                    updatedAt: note.updatedAt
                };
                // Determine module from question or quiz
                let module = null;
                if ((_b = (_a = note.question) === null || _a === void 0 ? void 0 : _a.course) === null || _b === void 0 ? void 0 : _b.module) {
                    module = note.question.course.module;
                }
                else if ((_d = (_c = note.quiz) === null || _c === void 0 ? void 0 : _c.course) === null || _d === void 0 ? void 0 : _d.module) {
                    module = note.quiz.course.module;
                }
                if (module) {
                    const moduleKey = `module_${module.id}`;
                    if (!moduleGroups[moduleKey]) {
                        moduleGroups[moduleKey] = {
                            module: {
                                id: module.id,
                                name: module.name,
                                description: module.description
                            },
                            notes: []
                        };
                    }
                    moduleGroups[moduleKey].notes.push(formattedNote);
                }
                else {
                    // Notes without module association
                    ungroupedNotes.push(formattedNote);
                }
            });
            // Convert to array format
            const groupedData = Object.values(moduleGroups);
            // Add ungrouped notes if any
            if (ungroupedNotes.length > 0) {
                groupedData.push({
                    module: {
                        id: null,
                        name: 'Ungrouped',
                        description: 'Notes not associated with any module'
                    },
                    notes: ungroupedNotes
                });
            }
            return {
                success: true,
                data: {
                    groupedByModule: groupedData,
                    totalNotes: notes.length,
                    totalModules: Object.keys(moduleGroups).length + (ungroupedNotes.length > 0 ? 1 : 0)
                }
            };
        });
    }
    createStudentNote(user, noteText, questionId, quizId) {
        return __awaiter(this, void 0, void 0, function* () {
            // Validate that questionId exists if provided
            if (questionId) {
                const questionExists = yield this.studentRepository.questionExists(questionId);
                if (!questionExists) {
                    throw new Error(`Question with ID ${questionId} not found`);
                }
            }
            // Validate that quizId exists if provided
            if (quizId) {
                const quizExists = yield this.studentRepository.quizExists(quizId);
                if (!quizExists) {
                    throw new Error(`Quiz with ID ${quizId} not found`);
                }
            }
            const note = yield this.studentRepository.createStudentNote(user.user_data.id, noteText, questionId, quizId);
            return {
                success: true,
                data: {
                    id: note.id,
                    noteText: note.noteText,
                    questionId: note.questionId,
                    quizId: note.quizId,
                    question: note.question,
                    quiz: note.quiz,
                    createdAt: note.createdAt,
                    updatedAt: note.updatedAt
                },
                message: 'Note created successfully'
            };
        });
    }
    updateStudentNote(noteId, user, noteText) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const note = yield this.studentRepository.updateStudentNote(noteId, user.user_data.id, noteText);
                return {
                    success: true,
                    data: {
                        id: note.id,
                        noteText: note.noteText,
                        questionId: note.questionId,
                        quizId: note.quizId,
                        question: note.question,
                        quiz: note.quiz,
                        createdAt: note.createdAt,
                        updatedAt: note.updatedAt
                    },
                    message: 'Note updated successfully'
                };
            }
            catch (error) {
                if (error.code === 'P2025') {
                    throw new Error('Note not found or you do not have permission to update it');
                }
                throw error;
            }
        });
    }
    deleteStudentNote(noteId, user) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield this.studentRepository.deleteStudentNote(noteId, user.user_data.id);
                return {
                    success: true,
                    message: 'Note deleted successfully'
                };
            }
            catch (error) {
                if (error.code === 'P2025') {
                    throw new Error('Note not found or you do not have permission to delete it');
                }
                throw error;
            }
        });
    }
    getQuestionNotes(questionId, user) {
        return __awaiter(this, void 0, void 0, function* () {
            const notes = yield this.studentRepository.getQuestionNotes(questionId, user.user_data.id);
            return {
                success: true,
                data: notes.map(note => ({
                    id: note.id,
                    noteText: note.noteText,
                    createdAt: note.createdAt,
                    updatedAt: note.updatedAt
                }))
            };
        });
    }
    // ==========================================
    // STUDENT NOTES - CANONICAL API
    // ==========================================
    // GET /students/notes - Canonical: returns flat array with labels
    getStudentNotesCanonical(user, options) {
        return __awaiter(this, void 0, void 0, function* () {
            const notes = yield this.studentRepository.getStudentNotesCanonical(user.user_data.id, options);
            return notes.map(note => {
                var _a;
                return ({
                    id: note.id,
                    noteText: note.noteText,
                    questionId: note.questionId,
                    quizId: note.quizId,
                    labels: ((_a = note.noteLabels) === null || _a === void 0 ? void 0 : _a.map((nl) => ({
                        id: nl.label.id,
                        name: nl.label.name
                    }))) || [],
                    question: note.question,
                    createdAt: note.createdAt,
                    updatedAt: note.updatedAt
                });
            });
        });
    }
    // GET /students/notes/by-module - Canonical: returns grouped notes
    getNotesByModuleCanonical(user, moduleId, uniteId) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.studentRepository.getNotesByModuleCanonical(user.user_data.id, moduleId, uniteId);
            return result;
        });
    }
    // GET /students/questions/:questionId/notes - Canonical: returns array with labels
    getQuestionNotesCanonical(questionId, user) {
        return __awaiter(this, void 0, void 0, function* () {
            const notes = yield this.studentRepository.getQuestionNotesCanonical(questionId, user.user_data.id);
            return notes.map(note => {
                var _a;
                return ({
                    id: note.id,
                    noteText: note.noteText,
                    questionId: note.questionId,
                    quizId: note.quizId,
                    labels: ((_a = note.noteLabels) === null || _a === void 0 ? void 0 : _a.map((nl) => ({
                        id: nl.label.id,
                        name: nl.label.name
                    }))) || [],
                    createdAt: note.createdAt,
                    updatedAt: note.updatedAt
                });
            });
        });
    }
    // POST /students/notes - Canonical: returns note object with labels
    createStudentNoteCanonical(user, noteText, questionId, quizId, labelIds) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            // Validate that questionId exists if provided
            if (questionId) {
                const questionExists = yield this.studentRepository.questionExists(questionId);
                if (!questionExists) {
                    throw new Error(`Question with ID ${questionId} not found`);
                }
            }
            // Validate that quizId exists if provided
            if (quizId) {
                const quizExists = yield this.studentRepository.quizExists(quizId);
                if (!quizExists) {
                    throw new Error(`Quiz with ID ${quizId} not found`);
                }
            }
            const note = yield this.studentRepository.createStudentNoteCanonical(user.user_data.id, noteText, questionId, quizId, labelIds);
            return {
                id: note.id,
                noteText: note.noteText,
                questionId: note.questionId,
                quizId: note.quizId,
                labels: ((_a = note.noteLabels) === null || _a === void 0 ? void 0 : _a.map((nl) => ({
                    id: nl.label.id,
                    name: nl.label.name
                }))) || [],
                createdAt: note.createdAt,
                updatedAt: note.updatedAt
            };
        });
    }
    // PUT /students/notes/:noteId - Canonical: returns note object with labels
    updateStudentNoteCanonical(noteId, user, noteText, labelIds) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                const note = yield this.studentRepository.updateStudentNoteCanonical(noteId, user.user_data.id, noteText, labelIds);
                return {
                    id: note.id,
                    noteText: note.noteText,
                    questionId: note.questionId,
                    quizId: note.quizId,
                    labels: ((_a = note.noteLabels) === null || _a === void 0 ? void 0 : _a.map((nl) => ({
                        id: nl.label.id,
                        name: nl.label.name
                    }))) || [],
                    createdAt: note.createdAt,
                    updatedAt: note.updatedAt
                };
            }
            catch (error) {
                if (error.code === 'P2025') {
                    throw new Error('Note not found or you do not have permission to update it');
                }
                throw error;
            }
        });
    }
    // DELETE /students/notes/:noteId - Canonical: just deletes
    deleteStudentNoteCanonical(noteId, user) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield this.studentRepository.deleteStudentNote(noteId, user.user_data.id);
            }
            catch (error) {
                if (error.code === 'P2025') {
                    throw new Error('Note not found or you do not have permission to delete it');
                }
                throw error;
            }
        });
    }
    // ==========================================
    // LABELING SYSTEM
    // ==========================================
    getStudentLabels(user) {
        return __awaiter(this, void 0, void 0, function* () {
            const labels = yield this.studentRepository.getStudentLabelsWithQuestionIds(user.user_data.id);
            const formattedLabels = labels.map(label => ({
                id: label.id,
                name: label.name,
                statistics: {
                    quizzesCount: label._count.quizLabels,
                    questionsCount: label._count.questionLabels,
                    quizSessionsCount: label._count.quizSessionLabels,
                    totalItems: label._count.quizLabels + label._count.questionLabels + label._count.quizSessionLabels
                },
                questionIds: label.questionLabels.map((questionLabel) => questionLabel.questionId),
                questions: label.questionLabels.map((questionLabel) => ({
                    id: questionLabel.question.id,
                    questionText: questionLabel.question.questionText.substring(0, 100) + '...',
                    course: questionLabel.question.course ? {
                        id: questionLabel.question.course.id,
                        name: questionLabel.question.course.name,
                        module: questionLabel.question.course.module
                    } : null,
                    createdAt: questionLabel.createdAt
                })),
                createdAt: label.createdAt
            }));
            return {
                success: true,
                data: formattedLabels
            };
        });
    }
    getStudentLabelById(labelId, user) {
        return __awaiter(this, void 0, void 0, function* () {
            const label = yield this.studentRepository.getStudentLabelByIdWithQuestionIds(labelId, user.user_data.id);
            if (!label) {
                throw new Error('Label not found or you do not have permission to access it');
            }
            const formattedLabel = {
                id: label.id,
                name: label.name,
                statistics: {
                    quizzesCount: label._count.quizLabels,
                    questionsCount: label._count.questionLabels,
                    quizSessionsCount: label._count.quizSessionLabels,
                    totalItems: label._count.quizLabels + label._count.questionLabels + label._count.quizSessionLabels
                },
                questionIds: label.questionLabels.map((questionLabel) => questionLabel.questionId),
                questions: label.questionLabels.map((questionLabel) => ({
                    id: questionLabel.question.id,
                    questionText: questionLabel.question.questionText.substring(0, 100) + '...',
                    course: questionLabel.question.course ? {
                        id: questionLabel.question.course.id,
                        name: questionLabel.question.course.name,
                        module: questionLabel.question.course.module
                    } : null,
                    createdAt: questionLabel.createdAt
                })),
                createdAt: label.createdAt
            };
            return {
                success: true,
                data: formattedLabel
            };
        });
    }
    createStudentLabel(user, name) {
        return __awaiter(this, void 0, void 0, function* () {
            const label = yield this.studentRepository.createStudentLabel(user.user_data.id, name);
            return {
                success: true,
                data: {
                    id: label.id,
                    name: label.name,
                    createdAt: label.createdAt
                },
                message: 'Label created successfully'
            };
        });
    }
    updateStudentLabel(labelId, user, name) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const label = yield this.studentRepository.updateStudentLabel(labelId, user.user_data.id, name);
                return {
                    success: true,
                    data: {
                        id: label.id,
                        name: label.name,
                        createdAt: label.createdAt
                    },
                    message: 'Label updated successfully'
                };
            }
            catch (error) {
                if (error.code === 'P2025') {
                    throw new Error('Label not found or you do not have permission to update it');
                }
                throw error;
            }
        });
    }
    deleteStudentLabel(labelId, user) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield this.studentRepository.deleteStudentLabel(labelId, user.user_data.id);
                return {
                    success: true,
                    message: 'Label deleted successfully'
                };
            }
            catch (error) {
                if (error.code === 'P2025') {
                    throw new Error('Label not found or you do not have permission to delete it');
                }
                throw error;
            }
        });
    }
    // ==========================================
    // CANONICAL LABELING SYSTEM METHODS
    // ==========================================
    // Canonical: GET /students/labels - returns { data: [...] }
    getStudentLabelsCanonical(user) {
        return __awaiter(this, void 0, void 0, function* () {
            const labels = yield this.studentRepository.getStudentLabelsWithQuestionIds(user.user_data.id);
            const formattedLabels = labels.map(label => ({
                id: label.id,
                name: label.name,
                statistics: {
                    quizzesCount: label._count.quizLabels,
                    questionsCount: label._count.questionLabels,
                    quizSessionsCount: label._count.quizSessionLabels,
                    totalItems: label._count.quizLabels + label._count.questionLabels + label._count.quizSessionLabels
                },
                questionIds: label.questionLabels.map((questionLabel) => questionLabel.questionId),
                questions: label.questionLabels.map((questionLabel) => ({
                    id: questionLabel.question.id,
                    questionText: questionLabel.question.questionText,
                    course: questionLabel.question.course ? {
                        id: questionLabel.question.course.id,
                        name: questionLabel.question.course.name
                    } : null
                })),
                createdAt: label.createdAt
            }));
            return { data: formattedLabels };
        });
    }
    // Canonical: GET /students/labels/:labelId - returns object directly
    getStudentLabelByIdCanonical(labelId, user) {
        return __awaiter(this, void 0, void 0, function* () {
            const label = yield this.studentRepository.getStudentLabelByIdWithQuestionIds(labelId, user.user_data.id);
            if (!label) {
                throw new Error('Label not found or you do not have permission to access it');
            }
            return {
                id: label.id,
                name: label.name,
                statistics: {
                    quizzesCount: label._count.quizLabels,
                    questionsCount: label._count.questionLabels,
                    quizSessionsCount: label._count.quizSessionLabels,
                    totalItems: label._count.quizLabels + label._count.questionLabels + label._count.quizSessionLabels
                },
                questionIds: label.questionLabels.map((questionLabel) => questionLabel.questionId),
                questions: label.questionLabels.map((questionLabel) => ({
                    id: questionLabel.question.id,
                    questionText: questionLabel.question.questionText,
                    course: questionLabel.question.course ? {
                        id: questionLabel.question.course.id,
                        name: questionLabel.question.course.name
                    } : null
                })),
                createdAt: label.createdAt
            };
        });
    }
    // Canonical: POST /students/labels - returns object with statistics
    createStudentLabelCanonical(user, name) {
        return __awaiter(this, void 0, void 0, function* () {
            const label = yield this.studentRepository.createStudentLabel(user.user_data.id, name);
            return {
                id: label.id,
                name: label.name,
                statistics: {
                    quizzesCount: 0,
                    questionsCount: 0,
                    quizSessionsCount: 0,
                    totalItems: 0
                },
                questionIds: [],
                questions: [],
                createdAt: label.createdAt
            };
        });
    }
    // Canonical: PUT /students/labels/:labelId - returns object with statistics
    updateStudentLabelCanonical(labelId, user, name) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const label = yield this.studentRepository.updateStudentLabel(labelId, user.user_data.id, name);
                // Fetch the updated label with statistics
                const fullLabel = yield this.studentRepository.getStudentLabelByIdWithQuestionIds(labelId, user.user_data.id);
                if (!fullLabel) {
                    return {
                        id: label.id,
                        name: label.name,
                        statistics: {
                            quizzesCount: 0,
                            questionsCount: 0,
                            quizSessionsCount: 0,
                            totalItems: 0
                        },
                        questionIds: [],
                        questions: [],
                        createdAt: label.createdAt
                    };
                }
                return {
                    id: fullLabel.id,
                    name: fullLabel.name,
                    statistics: {
                        quizzesCount: fullLabel._count.quizLabels,
                        questionsCount: fullLabel._count.questionLabels,
                        quizSessionsCount: fullLabel._count.quizSessionLabels,
                        totalItems: fullLabel._count.quizLabels + fullLabel._count.questionLabels + fullLabel._count.quizSessionLabels
                    },
                    questionIds: fullLabel.questionLabels.map((ql) => ql.questionId),
                    questions: [],
                    createdAt: fullLabel.createdAt
                };
            }
            catch (error) {
                if (error.code === 'P2025') {
                    throw new Error('Label not found or you do not have permission to update it');
                }
                throw error;
            }
        });
    }
    // Canonical: GET /students/labels/by-module - returns { labels: [...] }
    getLabelsByModuleCanonical(user, moduleId, uniteId) {
        return __awaiter(this, void 0, void 0, function* () {
            const labels = yield this.studentRepository.getLabelsByModuleCanonical(user.user_data.id, moduleId, uniteId);
            return { labels };
        });
    }
    // Canonical: POST /students/questions/:questionId/labels/:labelId
    addQuestionToLabelCanonical(user, questionId, labelId) {
        return __awaiter(this, void 0, void 0, function* () {
            // Validate question exists
            const questionExists = yield this.studentRepository.questionExists(questionId);
            if (!questionExists) {
                throw new Error(`Question with ID ${questionId} not found`);
            }
            // Validate label exists and belongs to user
            const labelExists = yield this.studentRepository.labelExistsForUser(labelId, user.user_data.id);
            if (!labelExists) {
                throw new Error(`Label with ID ${labelId} not found or you do not have permission to use it`);
            }
            try {
                yield this.studentRepository.addQuestionToLabel(user.user_data.id, questionId, labelId);
            }
            catch (error) {
                if (error.code === 'P2002') {
                    throw new Error('Question already in label');
                }
                throw error;
            }
        });
    }
    // Canonical: DELETE /students/questions/:questionId/labels/:labelId
    removeQuestionFromLabelCanonical(user, questionId, labelId) {
        return __awaiter(this, void 0, void 0, function* () {
            // Validate label exists and belongs to user
            const labelExists = yield this.studentRepository.labelExistsForUser(labelId, user.user_data.id);
            if (!labelExists) {
                throw new Error(`Label with ID ${labelId} not found or you do not have permission to use it`);
            }
            try {
                yield this.studentRepository.removeQuestionFromLabel(user.user_data.id, questionId, labelId);
            }
            catch (error) {
                if (error.code === 'P2025') {
                    throw new Error('Question, Label, or association not found');
                }
                throw error;
            }
        });
    }
    addQuizToLabel(userId, quizId, labelId, user) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Validate that quiz exists
                const quizExists = yield this.studentRepository.quizExists(quizId);
                if (!quizExists) {
                    throw new Error(`Quiz with ID ${quizId} not found`);
                }
                // Validate that label exists and belongs to the user
                const labelExists = yield this.studentRepository.labelExistsForUser(labelId, user.user_data.id);
                if (!labelExists) {
                    throw new Error(`Label with ID ${labelId} not found or you do not have permission to use it`);
                }
                const quizLabel = yield this.studentRepository.addQuizToLabel(user.user_data.id, quizId, labelId);
                return {
                    success: true,
                    data: {
                        id: quizLabel.id,
                        quiz: quizLabel.quiz,
                        label: quizLabel.label,
                        createdAt: quizLabel.createdAt
                    },
                    message: 'Quiz added to label successfully'
                };
            }
            catch (error) {
                if (error.code === 'P2002') {
                    // Unique constraint violation - quiz is already in this label
                    // Get the existing relationship to return consistent data
                    const existingQuizLabel = yield this.studentRepository.getQuizLabel(user.user_data.id, quizId, labelId);
                    if (existingQuizLabel) {
                        return {
                            success: true,
                            data: {
                                id: existingQuizLabel.id,
                                quiz: existingQuizLabel.quiz,
                                label: existingQuizLabel.label,
                                createdAt: existingQuizLabel.createdAt
                            },
                            message: 'Quiz is already in this label'
                        };
                    }
                    throw new Error('Quiz is already added to this label');
                }
                if (error.code === 'P2003') {
                    throw new Error('Quiz or label not found, or you do not have permission to perform this action');
                }
                throw error;
            }
        });
    }
    addQuestionToLabel(userId, questionId, labelId, user) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Validate that questionId exists
                const questionExists = yield this.studentRepository.questionExists(questionId);
                if (!questionExists) {
                    throw new Error(`Question with ID ${questionId} not found`);
                }
                // Validate that labelId exists and belongs to user
                const labelExists = yield this.studentRepository.labelExistsForUser(labelId, user.user_data.id);
                if (!labelExists) {
                    throw new Error(`Label with ID ${labelId} not found or you do not have permission to use it`);
                }
                const questionLabel = yield this.studentRepository.addQuestionToLabel(user.user_data.id, questionId, labelId);
                return {
                    success: true,
                    data: {
                        id: questionLabel.id,
                        question: questionLabel.question,
                        label: questionLabel.label,
                        createdAt: questionLabel.createdAt
                    },
                    message: 'Question added to label successfully'
                };
            }
            catch (error) {
                if (error.code === 'P2002') {
                    // Get the existing relationship to return consistent data
                    const existingQuestionLabel = yield this.studentRepository.getQuestionLabel(user.user_data.id, questionId, labelId);
                    if (existingQuestionLabel) {
                        return {
                            success: true,
                            data: {
                                id: existingQuestionLabel.id,
                                question: existingQuestionLabel.question,
                                label: existingQuestionLabel.label,
                                createdAt: existingQuestionLabel.createdAt
                            },
                            message: 'Question is already in this label'
                        };
                    }
                    throw new Error('Question is already added to this label');
                }
                if (error.code === 'P2003') {
                    throw new Error('Question or label not found, or you do not have permission to perform this action');
                }
                throw error;
            }
        });
    }
    removeQuestionFromLabel(userId, questionId, labelId, user) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield this.studentRepository.removeQuestionFromLabel(user.user_data.id, questionId, labelId);
                return {
                    success: true,
                    message: 'Question removed from label successfully'
                };
            }
            catch (error) {
                if (error.code === 'P2003') {
                    throw new Error('Question or label not found, or you do not have permission to perform this action');
                }
                throw error;
            }
        });
    }
    // ==========================================
    // TODO & TASK MANAGEMENT
    // ==========================================
    getTodos(user_1, status_1, type_1, priority_1) {
        return __awaiter(this, arguments, void 0, function* (user, status, type, priority, page = 1, limit = 20, includeCompleted = false) {
            const offset = (page - 1) * limit;
            const todos = yield this.studentRepository.getTodos(user.user_data.id, status, type, priority, limit + 1, offset, includeCompleted);
            const hasMore = todos.length > limit;
            const actualTodos = hasMore ? todos.slice(0, limit) : todos;
            const formattedTodos = actualTodos.map(todo => ({
                id: todo.id,
                title: todo.title,
                description: todo.description,
                type: todo.type,
                priority: todo.priority,
                status: todo.status,
                dueDate: todo.dueDate,
                completedAt: todo.completedAt,
                course: todo.course,
                quiz: todo.quiz,
                exam: todo.exam,
                quizSession: todo.quizSession,
                isOverdue: todo.dueDate && new Date(todo.dueDate) < new Date() && todo.status !== 'COMPLETED',
                createdAt: todo.createdAt,
                updatedAt: todo.updatedAt
            }));
            return {
                success: true,
                data: {
                    todos: formattedTodos,
                    pagination: {
                        currentPage: page,
                        totalItems: actualTodos.length,
                        hasMore
                    }
                }
            };
        });
    }
    createTodo(user, title, description, type, priority, dueDate, courseId, quizId) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Validate courseId if provided
                if (courseId) {
                    const courseExists = yield this.studentRepository.courseExists(courseId);
                    if (!courseExists) {
                        throw new Error(`Course with ID ${courseId} not found`);
                    }
                }
                // Validate quizId if provided
                if (quizId) {
                    const quizExists = yield this.studentRepository.quizExists(quizId);
                    if (!quizExists) {
                        throw new Error(`Quiz with ID ${quizId} not found`);
                    }
                }
                const todo = yield this.studentRepository.createTodo(user.user_data.id, title, description, type, priority, dueDate, courseId, quizId);
                return {
                    success: true,
                    data: {
                        id: todo.id,
                        title: todo.title,
                        description: todo.description,
                        type: todo.type,
                        priority: todo.priority,
                        status: todo.status,
                        dueDate: todo.dueDate,
                        course: todo.course,
                        quiz: todo.quiz,
                        createdAt: todo.createdAt
                    },
                    message: 'Todo created successfully'
                };
            }
            catch (error) {
                if (error.code === 'P2003') {
                    throw new Error('Course or quiz not found. Please check the provided IDs and try again.');
                }
                throw error;
            }
        });
    }
    updateTodo(todoId, user, updateData) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const todo = yield this.studentRepository.updateTodo(todoId, user.user_data.id, updateData);
                return {
                    success: true,
                    data: {
                        id: todo.id,
                        title: todo.title,
                        description: todo.description,
                        type: todo.type,
                        priority: todo.priority,
                        status: todo.status,
                        dueDate: todo.dueDate,
                        course: todo.course,
                        quiz: todo.quiz,
                        updatedAt: todo.updatedAt
                    },
                    message: 'Todo updated successfully'
                };
            }
            catch (error) {
                if (error.code === 'P2025') {
                    throw new Error('Todo not found or you do not have permission to update it');
                }
                throw error;
            }
        });
    }
    deleteTodo(todoId, user) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield this.studentRepository.deleteTodo(todoId, user.user_data.id);
                return {
                    success: true,
                    message: 'Todo deleted successfully'
                };
            }
            catch (error) {
                if (error.code === 'P2025') {
                    throw new Error('Todo not found or you do not have permission to delete it');
                }
                throw error;
            }
        });
    }
    completeTodo(todoId, user) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const todo = yield this.studentRepository.completeTodo(todoId, user.user_data.id);
                return {
                    success: true,
                    data: {
                        id: todo.id,
                        status: todo.status,
                        completedAt: todo.completedAt,
                        updatedAt: todo.updatedAt
                    },
                    message: 'Todo marked as completed'
                };
            }
            catch (error) {
                if (error.code === 'P2025') {
                    throw new Error('Todo not found or you do not have permission to complete it');
                }
                throw error;
            }
        });
    }
    // ==========================================
    // QUESTION REPORTING SYSTEM
    // ==========================================
    createQuestionReportCanonical(user, questionId, reportType, description) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Validate that question exists
                const questionExists = yield this.studentRepository.questionExists(questionId);
                if (!questionExists) {
                    throw new Error(`Question with ID ${questionId} not found`);
                }
                const report = yield this.studentRepository.createQuestionReport(user.user_data.id, questionId, reportType, description);
                return {
                    id: report.id,
                    questionId: report.questionId,
                    reportType: report.reportType,
                    description: report.description,
                    status: report.status,
                    createdAt: report.createdAt
                };
            }
            catch (error) {
                if (error.code === 'P2003') {
                    throw new Error('Question not found. Please check the question ID and try again.');
                }
                throw error;
            }
        });
    }
    createQuestionReport(user, questionId, reportType, description) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Validate that question exists
                const questionExists = yield this.studentRepository.questionExists(questionId);
                if (!questionExists) {
                    throw new Error(`Question with ID ${questionId} not found`);
                }
                const report = yield this.studentRepository.createQuestionReport(user.user_data.id, questionId, reportType, description);
                return {
                    id: report.id,
                    questionId: report.questionId,
                    reportType: report.reportType,
                    description: report.description,
                    status: report.status,
                    createdAt: report.createdAt
                };
            }
            catch (error) {
                if (error.code === 'P2003') {
                    throw new Error('Question not found. Please check the question ID and try again.');
                }
                throw error;
            }
        });
    }
    getUserReports(user) {
        return __awaiter(this, void 0, void 0, function* () {
            const reports = yield this.studentRepository.getUserReports(user.user_data.id);
            const formattedReports = reports.map(report => ({
                id: report.id,
                reportType: report.reportType,
                description: report.description,
                status: report.status,
                adminResponse: report.adminResponse,
                question: {
                    id: report.question.id,
                    questionText: report.question.questionText.substring(0, 100) + '...'
                },
                reviewedBy: report.reviewedBy,
                createdAt: report.createdAt,
                updatedAt: report.updatedAt
            }));
            return {
                success: true,
                data: formattedReports
            };
        });
    }
    getReportById(reportId, user) {
        return __awaiter(this, void 0, void 0, function* () {
            const report = yield this.studentRepository.getReportById(reportId, user.user_data.id);
            if (!report) {
                throw new Error('Report not found');
            }
            return {
                id: report.id,
                questionId: report.questionId,
                reportType: report.reportType,
                description: report.description,
                status: report.status,
                adminNotes: report.adminResponse || null,
                createdAt: report.createdAt,
                updatedAt: report.updatedAt
            };
        });
    }
    getReportByIdCanonical(reportId, user) {
        return __awaiter(this, void 0, void 0, function* () {
            const report = yield this.studentRepository.getReportById(reportId, user.user_data.id);
            if (!report) {
                throw new Error('Report not found');
            }
            // Check ownership (security)
            if (report.userId !== user.user_data.id) {
                throw new Error('Not owner of report');
            }
            return {
                id: report.id,
                questionId: report.questionId,
                reportType: report.reportType,
                description: report.description,
                status: report.status, // Canonical statuses: PENDING, REVIEWED, RESOLVED, REJECTED
                adminNotes: report.adminResponse || null, // Map adminResponse to adminNotes
                createdAt: report.createdAt,
                updatedAt: report.updatedAt
            };
        });
    }
    // ==========================================
    // SUBSCRIPTION VALIDATION
    // ==========================================
    /**
     * Validate user subscriptions in real-time based on endDate
     * This is the source of truth for subscription access control
     */
    validateUserSubscriptions(userId) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Get all user subscriptions from database
                const subscriptions = yield this.prisma.subscription.findMany({
                    where: { userId },
                    include: {
                        studyPack: true
                    }
                });
                if (subscriptions.length === 0) {
                    return {
                        hasActiveSubscription: false,
                        activeSubscriptions: [],
                        reason: "No subscriptions found for this user"
                    };
                }
                // Filter subscriptions based on endDate (source of truth)
                const now = new Date();
                const activeSubscriptions = subscriptions.filter(sub => new Date(sub.endDate) > now);
                if (activeSubscriptions.length === 0) {
                    return {
                        hasActiveSubscription: false,
                        activeSubscriptions: [],
                        reason: "All subscriptions have expired"
                    };
                }
                return {
                    hasActiveSubscription: true,
                    activeSubscriptions
                };
            }
            catch (error) {
                console.error('Error validating user subscriptions:', error);
                return {
                    hasActiveSubscription: false,
                    activeSubscriptions: [],
                    reason: "Error validating subscriptions"
                };
            }
        });
    }
    /**
     * IMPROVED: Enhanced subscription validation with detailed reporting
     * Provides comprehensive subscription status information for testing and debugging
     */
    validateUserSubscriptionsImproved(userId) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Get all user subscriptions from database
                const subscriptions = yield this.prisma.subscription.findMany({
                    where: { userId },
                    include: {
                        studyPack: true
                    }
                });
                const now = new Date();
                const validationTimestamp = now.toISOString();
                if (subscriptions.length === 0) {
                    return {
                        hasActiveSubscription: false,
                        activeSubscriptions: [],
                        totalSubscriptions: 0,
                        activeByEndDate: 0,
                        expiredByEndDate: 0,
                        validationTimestamp,
                        reason: "No subscriptions found for this user"
                    };
                }
                // IMPROVED: Filter subscriptions based on endDate only (ignore status field)
                // This ensures we use endDate as the single source of truth
                const activeSubscriptions = subscriptions.filter(sub => new Date(sub.endDate) > now);
                const expiredSubscriptions = subscriptions.filter(sub => new Date(sub.endDate) <= now);
                if (activeSubscriptions.length === 0) {
                    return {
                        hasActiveSubscription: false,
                        activeSubscriptions: [],
                        totalSubscriptions: subscriptions.length,
                        activeByEndDate: 0,
                        expiredByEndDate: expiredSubscriptions.length,
                        validationTimestamp,
                        reason: `All ${subscriptions.length} subscriptions have expired based on endDate`
                    };
                }
                return {
                    hasActiveSubscription: true,
                    activeSubscriptions,
                    totalSubscriptions: subscriptions.length,
                    activeByEndDate: activeSubscriptions.length,
                    expiredByEndDate: expiredSubscriptions.length,
                    validationTimestamp
                };
            }
            catch (error) {
                console.error('Error validating user subscriptions:', error);
                return {
                    hasActiveSubscription: false,
                    activeSubscriptions: [],
                    totalSubscriptions: 0,
                    activeByEndDate: 0,
                    expiredByEndDate: 0,
                    validationTimestamp: new Date().toISOString(),
                    reason: "Error validating subscriptions: " + error.message
                };
            }
        });
    }
    /**
     * Check if user has residency access based on active subscriptions
     */
    hasResidencyAccessFromSubscriptions(activeSubscriptions) {
        return activeSubscriptions.some(sub => sub.studyPack.type === 'RESIDENCY' || sub.studyPack.type === 'residency');
    }
    /**
     * Get accessible year levels from active subscriptions
     */
    getAccessibleYearLevelsFromSubscriptions(activeSubscriptions) {
        const yearLevels = new Set();
        for (const sub of activeSubscriptions) {
            if (sub.studyPack.type === 'RESIDENCY' || sub.studyPack.type === 'residency') {
                // Residency subscriptions give access to all year levels
                return ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN'];
            }
            else {
                // Regular subscriptions give access to their specific year level
                if (sub.studyPack.yearNumber) {
                    yearLevels.add(sub.studyPack.yearNumber);
                }
            }
        }
        return Array.from(yearLevels);
    }
    // ==========================================
    // SUBSCRIPTION-BASED QUESTION RETRIEVAL
    // ==========================================
    getQuestionsBasedOnSubscription(user, filters) {
        return __awaiter(this, void 0, void 0, function* () {
            // IMPROVED: Real-time subscription validation based on endDate (source of truth)
            const subscriptionValidation = yield this.validateUserSubscriptionsImproved(user.user_data.id);
            if (!subscriptionValidation.hasActiveSubscription) {
                throw new Error(`Access denied: ${subscriptionValidation.reason}`);
            }
            // Determine accessible study packs based on real-time subscription validation
            let accessibleStudyPackIds;
            const hasResidencyAccess = this.hasResidencyAccessFromSubscriptions(subscriptionValidation.activeSubscriptions);
            if (hasResidencyAccess) {
                // Residency users get access to ALL study packs
                const allStudyPacks = yield this.prisma.studyPack.findMany({
                    select: { id: true }
                });
                accessibleStudyPackIds = allStudyPacks.map((sp) => sp.id);
            }
            else {
                // Regular users get access to study packs from their active subscriptions
                accessibleStudyPackIds = subscriptionValidation.activeSubscriptions.map(sub => sub.studyPackId);
            }
            // Get user's accessible year levels from real-time subscription data
            const accessibleYearLevels = this.getAccessibleYearLevelsFromSubscriptions(subscriptionValidation.activeSubscriptions);
            // IMPROVED: Validate year level access with detailed error messages
            let filteredYearLevels = filters.yearLevels;
            if (filteredYearLevels && filteredYearLevels.length > 0) {
                // Validate that user has access to requested year levels
                const requestedYearLevels = filteredYearLevels;
                const inaccessibleLevels = requestedYearLevels.filter(level => !accessibleYearLevels.includes(level));
                if (inaccessibleLevels.length > 0) {
                    throw new Error(`Access denied to year levels: ${inaccessibleLevels.join(', ')}. Your active subscriptions provide access to: ${accessibleYearLevels.join(', ')}`);
                }
            }
            else if (!hasResidencyAccess) {
                // For non-residency users, default to their accessible year levels
                filteredYearLevels = accessibleYearLevels;
            }
            // Build unified question filters
            const unifiedFilters = {
                courseIds: filters.courseIds,
                moduleIds: filters.moduleIds,
                uniteIds: filters.uniteIds,
                universityIds: filters.universityIds,
                yearLevels: filteredYearLevels,
                examYears: filters.examYears,
                questionTypes: filters.questionTypes,
                examIds: filters.examIds,
                quizSourceIds: filters.quizSourceIds,
                questionSourceIds: filters.questionSourceIds
            };
            // Get questions using the existing question service
            const questionService = tsyringe_1.container.resolve('QuestionService');
            const questions = yield questionService.getQuestionsWithFilters(unifiedFilters, accessibleStudyPackIds, filters.count);
            // Randomize if requested
            let finalQuestions = questions;
            if (filters.randomize && questions.length > 0) {
                finalQuestions = [...questions].sort(() => Math.random() - 0.5);
            }
            // Format questions based on include options with comprehensive data
            const formattedQuestions = finalQuestions.map((question) => {
                const baseQuestion = {
                    id: question.id,
                    questionText: question.questionText,
                    questionType: question.questionType,
                    universityId: question.universityId,
                    yearLevel: question.yearLevel,
                    examYear: question.examYear,
                    metadata: question.metadata,
                    sourceId: question.sourceId,
                    createdAt: question.createdAt,
                    updatedAt: question.updatedAt,
                    // Always include comprehensive related data
                    university: question.university ? {
                        id: question.university.id,
                        name: question.university.name,
                        country: question.university.country
                    } : null,
                    course: question.course ? {
                        id: question.course.id,
                        name: question.course.name,
                        description: question.course.description,
                        module: question.course.module ? {
                            id: question.course.module.id,
                            name: question.course.module.name
                        } : null
                    } : null,
                    source: question.source ? {
                        id: question.source.id,
                        name: question.source.name
                    } : null,
                    questionImages: question.questionImages || [],
                    questionExplanationImages: question.questionExplanationImages || []
                };
                // Add answers if requested
                if (filters.includeAnswers && question.questionAnswers) {
                    baseQuestion.questionAnswers = question.questionAnswers.map((answer) => (Object.assign(Object.assign({ id: answer.id, answerText: answer.answerText, isCorrect: answer.isCorrect }, (filters.includeExplanations && { explanation: answer.explanation })), { explanationImages: (filters.includeImages && answer.explanationImages) ? answer.explanationImages : [] })));
                }
                // Add explanation if requested
                if (filters.includeExplanations) {
                    baseQuestion.explanation = question.explanation;
                }
                return baseQuestion;
            });
            // Get total count for metadata
            const totalQuestionsCount = yield this.prisma.question.count({
                where: {
                    course: {
                        module: {
                            unite: {
                                studyPackId: { in: accessibleStudyPackIds }
                            }
                        }
                    }
                }
            });
            return {
                success: true,
                data: {
                    questions: formattedQuestions,
                    metadata: {
                        totalCount: totalQuestionsCount,
                        filteredCount: questions.length,
                        subscriptionInfo: {
                            hasActiveSubscription: subscriptionValidation.hasActiveSubscription,
                            subscriptionTypes: subscriptionValidation.activeSubscriptions.map(sub => sub.studyPack.type),
                            accessibleYearLevels: accessibleYearLevels,
                            hasResidencyAccess,
                            activeSubscriptions: subscriptionValidation.activeSubscriptions.map(sub => ({
                                id: sub.id,
                                studyPackId: sub.studyPackId,
                                studyPackName: sub.studyPack.name,
                                studyPackType: sub.studyPack.type,
                                yearNumber: sub.studyPack.yearNumber,
                                endDate: sub.endDate,
                                status: sub.status
                            })),
                            validationDetails: {
                                totalSubscriptions: subscriptionValidation.totalSubscriptions,
                                activeByEndDate: subscriptionValidation.activeByEndDate,
                                expiredByEndDate: subscriptionValidation.expiredByEndDate,
                                validationTimestamp: subscriptionValidation.validationTimestamp
                            }
                        },
                        appliedFilters: Object.assign(Object.assign({}, unifiedFilters), { count: filters.count, randomize: filters.randomize, includeAnswers: filters.includeAnswers, includeExplanations: filters.includeExplanations, includeImages: filters.includeImages })
                    }
                }
            };
        });
    }
    // ==========================================
    // ENHANCED DASHBOARD FEATURES
    // ==========================================
    getDetailedPerformanceAnalytics(user) {
        return __awaiter(this, void 0, void 0, function* () {
            const analytics = yield this.studentRepository.getDetailedPerformanceAnalytics(user.user_data.id);
            return {
                success: true,
                data: {
                    improvementTrend: analytics.improvementTrend,
                    studyStreak: analytics.studyStreak,
                    weeklyStats: analytics.weeklyStats,
                    recentActivity: analytics.recentSessions.slice(0, 10).map((session) => {
                        var _a, _b;
                        return ({
                            date: session.completedAt,
                            activity: `Completed ${session.title}`,
                            score: session.percentage,
                            type: session.type,
                            subject: ((_b = (_a = session.quiz) === null || _a === void 0 ? void 0 : _a.course) === null || _b === void 0 ? void 0 : _b.name) || 'General'
                        });
                    }),
                    subjectPerformance: this.calculateSubjectPerformance(analytics.recentSessions),
                    timeDistribution: this.calculateTimeDistribution(analytics.recentSessions)
                }
            };
        });
    }
    calculateSubjectPerformance(sessions) {
        const subjectStats = new Map();
        sessions.forEach(session => {
            var _a, _b;
            const subject = ((_b = (_a = session.quiz) === null || _a === void 0 ? void 0 : _a.course) === null || _b === void 0 ? void 0 : _b.name) || 'General';
            const existing = subjectStats.get(subject) || {
                totalSessions: 0,
                totalScore: 0,
                bestScore: 0,
                worstScore: 100
            };
            existing.totalSessions += 1;
            existing.totalScore += session.percentage;
            existing.bestScore = Math.max(existing.bestScore, session.percentage);
            existing.worstScore = Math.min(existing.worstScore, session.percentage);
            subjectStats.set(subject, existing);
        });
        return Array.from(subjectStats.entries()).map(([subject, stats]) => ({
            subject,
            averageScore: Math.round((stats.totalScore / stats.totalSessions) * 100) / 100,
            totalSessions: stats.totalSessions,
            bestScore: stats.bestScore,
            worstScore: stats.worstScore
        }));
    }
    calculateTimeDistribution(sessions) {
        const today = new Date();
        const timeSlots = {
            morning: 0, // 6-12
            afternoon: 0, // 12-18
            evening: 0 // 18-24
        };
        sessions.forEach(session => {
            if (session.completedAt) {
                const hour = new Date(session.completedAt).getHours();
                if (hour >= 6 && hour < 12) {
                    timeSlots.morning += 1;
                }
                else if (hour >= 12 && hour < 18) {
                    timeSlots.afternoon += 1;
                }
                else {
                    timeSlots.evening += 1;
                }
            }
        });
        return timeSlots;
    }
    /**
     * Get filtered student question results
     */
    getStudentSessionResults(user_1, filters_1) {
        return __awaiter(this, arguments, void 0, function* (user, filters, page = 1, limit = 20) {
            const userId = user.user_data.id;
            // Get filtered questions and summary in parallel
            const [{ questions: rawQuestions, total }, summary] = yield Promise.all([
                this.studentRepository.getStudentQuestionResults(userId, filters, page, limit),
                this.studentRepository.getStudentSessionResultsSummary(userId, filters)
            ]);
            // Transform raw question data to response format
            const questions = rawQuestions.map((attempt) => {
                // Find the correct answer
                const correctAnswer = attempt.question.questionAnswers.find((qa) => qa.isCorrect);
                return {
                    questionId: attempt.questionId,
                    questionText: attempt.question.questionText,
                    explanation: attempt.question.explanation || undefined,
                    selectedAnswerId: attempt.selectedAnswerId || undefined,
                    correctAnswerId: (correctAnswer === null || correctAnswer === void 0 ? void 0 : correctAnswer.id) || 0,
                    isCorrect: attempt.isCorrect || false,
                    answeredAt: attempt.answeredAt || undefined,
                    sessionId: attempt.sessionId,
                    sessionTitle: attempt.session.title,
                    sessionType: attempt.session.type,
                    completedAt: attempt.session.completedAt || undefined,
                    answers: attempt.question.questionAnswers.map((qa) => ({
                        id: qa.id,
                        answerText: qa.answerText,
                        isCorrect: qa.isCorrect,
                        explanation: qa.explanation || undefined
                    }))
                };
            });
            // Calculate pagination info
            const totalPages = Math.ceil(total / limit);
            const averageScore = summary.totalQuestions > 0
                ? (summary.correctAnswers / summary.totalQuestions) * 100
                : 0;
            const response = {
                questions,
                summary: Object.assign(Object.assign({}, summary), { averageScore: Math.round(averageScore * 100) / 100 }),
                pagination: {
                    currentPage: page,
                    totalPages,
                    total,
                    limit
                }
            };
            return {
                success: true,
                data: response
            };
        });
    }
    /**
     * Get available sessions for filtering dropdown
     */
    getAvailableSessionsForFiltering(user, sessionType) {
        return __awaiter(this, void 0, void 0, function* () {
            const sessions = yield this.studentRepository.getStudentAvailableSessions(user.user_data.id, sessionType);
            return {
                success: true,
                data: sessions
            };
        });
    }
    /**
     * Get comprehensive session statistics for the user
     * Extracts and analyzes statistical data similar to the session statistics interface
     */
    getSessionStatistics(user) {
        return __awaiter(this, void 0, void 0, function* () {
            const sessionStats = yield this.studentRepository.getSessionStatistics(user.user_data.id);
            return {
                success: true,
                data: sessionStats
            };
        });
    }
    // ==========================================
    // CANONICAL SPEC ENDPOINTS - Practice Sessions
    // ==========================================
    /**
     * GET /students/sessions/filters - Canonical spec
     * Returns filter options for sessions by type (PRACTICE/EXAM)
     */
    getSessionsFilters(user, sessionType) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.studentRepository.getSessionsFiltersCanonical(user.user_data.id, sessionType);
        });
    }
    /**
     * GET /students/practise-sessions - Canonical spec
     * Returns practice sessions with pagination and optional filtering
     */
    getPractiseSessions(user, sessionType, options) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.studentRepository.getPractiseSessionsCanonical(user.user_data.id, sessionType, options);
        });
    }
    /**
     * GET /students/sessions/residency-filters - Canonical spec
     * Returns: { universities: [{id, name, examYears}], parts: ['PART_1', 'PART_2'], totalQuestions }
     */
    getResidencyFiltersCanonical(user) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.studentRepository.getResidencyFiltersCanonical(user.user_data.id);
        });
    }
    // ==========================================
    // CANONICAL SPEC ENDPOINTS - Course Layers & Cards
    // ==========================================
    /**
     * POST /students/course-layers - Canonical spec
     * Upsert course layer completion status
     */
    upsertCourseLayerCanonical(user, courseId, layerNumber, completed) {
        return __awaiter(this, void 0, void 0, function* () {
            // Validate course exists
            const courseExists = yield this.studentRepository.courseExistsByCourseId(courseId);
            if (!courseExists) {
                throw new AppError_1.NotFoundError("Course", courseId.toString());
            }
            return yield this.studentRepository.upsertCourseLayerCanonical(user.user_data.id, courseId, layerNumber, completed);
        });
    }
    /**
     * GET /students/courses/:courseId/layers - Canonical spec
     * Get all layer completion statuses for a course
     */
    getCourseLayersCanonical(user, courseId) {
        return __awaiter(this, void 0, void 0, function* () {
            // Validate course exists
            const courseExists = yield this.studentRepository.courseExistsByCourseId(courseId);
            if (!courseExists) {
                throw new AppError_1.NotFoundError("Course", courseId.toString());
            }
            return yield this.studentRepository.getCourseLayersCanonical(user.user_data.id, courseId);
        });
    }
    /**
     * POST /students/cards - Canonical spec
     * Create a study card with optional courses
     */
    createCardCanonical(user, title, description, courseIds) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.studentRepository.createCardCanonical(user.user_data.id, title, description, courseIds);
        });
    }
    /**
     * GET /students/cards - Canonical spec
     * Get all cards for the authenticated user
     */
    getAllCardsCanonical(user) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.studentRepository.getAllCardsCanonical(user.user_data.id);
        });
    }
    /**
     * GET /students/cards/filter-by-unit-module - Canonical spec
     * Get cards filtered by uniteId or moduleId
     */
    getCardsByUnitModuleCanonical(user, uniteId, moduleId) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.studentRepository.getCardsByUnitModuleCanonical(user.user_data.id, uniteId, moduleId);
        });
    }
    /**
     * GET /students/cards/:cardId - Canonical spec
     * Get card by ID with full course details
     */
    getCardByIdCanonical(user, cardId) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.studentRepository.getCardByIdCanonical(user.user_data.id, cardId);
        });
    }
    /**
     * PUT /students/cards/:cardId - Canonical spec
     * Update card title and/or description
     */
    updateCardCanonical(user, cardId, data) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.studentRepository.updateCardCanonical(user.user_data.id, cardId, data);
        });
    }
    /**
     * DELETE /students/cards/:cardId - Canonical spec
     * Delete a card (ownership checked)
     */
    deleteCardCanonical(user, cardId) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.studentRepository.deleteCardCanonical(user.user_data.id, cardId);
        });
    }
    /**
     * POST /students/cards/:cardId/courses/:courseId - Canonical spec
     * Add a course to a card
     */
    addCourseToCardCanonical(user, cardId, courseId) {
        return __awaiter(this, void 0, void 0, function* () {
            // Validate course exists
            const courseExists = yield this.studentRepository.courseExistsByCourseId(courseId);
            if (!courseExists) {
                throw new AppError_1.NotFoundError("Course", courseId.toString());
            }
            return yield this.studentRepository.addCourseToCardCanonical(user.user_data.id, cardId, courseId);
        });
    }
    /**
     * DELETE /students/cards/:cardId/courses/:courseId - Canonical spec
     * Remove a course from a card
     */
    removeCourseFromCardCanonical(user, cardId, courseId) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.studentRepository.removeCourseFromCardCanonical(user.user_data.id, cardId, courseId);
        });
    }
    /**
     * GET /students/cards/:cardId/progress - Canonical spec
     * Get progress for all courses in a card based on layer completion
     */
    getCardProgressCanonical(user, cardId) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.studentRepository.getCardProgressCanonical(user.user_data.id, cardId);
        });
    }
    // ==========================================
    // STUDENT ANALYTICS CANONICAL METHODS
    // ==========================================
    /**
     * GET /students/dashboard/performance - Canonical spec
     * Returns flat object without {success, data} wrapper
     */
    getDashboardPerformanceCanonical(user) {
        return __awaiter(this, void 0, void 0, function* () {
            const analytics = yield this.studentRepository.getDetailedPerformanceAnalytics(user.user_data.id);
            const subjectPerformance = this.calculateSubjectPerformance(analytics.recentSessions);
            // Calculate overall metrics
            let totalQuestions = 0;
            let correctAnswers = 0;
            let totalTime = 0;
            analytics.recentSessions.forEach((session) => {
                var _a, _b;
                totalQuestions += ((_a = session._count) === null || _a === void 0 ? void 0 : _a.quizAttempts) || 0;
                correctAnswers += ((_b = session.quizAttempts) === null || _b === void 0 ? void 0 : _b.filter((a) => a.isCorrect).length) || 0;
                if (session.startedAt && session.completedAt) {
                    totalTime += new Date(session.completedAt).getTime() - new Date(session.startedAt).getTime();
                }
            });
            // Identify strong and weak topics
            const sortedSubjects = subjectPerformance.sort((a, b) => b.averageScore - a.averageScore);
            const strongTopics = sortedSubjects.filter((s) => s.averageScore >= 70).map((s) => s.subject).slice(0, 3);
            const weakTopics = sortedSubjects.filter((s) => s.averageScore < 70).map((s) => s.subject).slice(0, 3);
            const incorrectAnswers = totalQuestions - correctAnswers;
            const overallScore = totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0;
            const avgTimePerQuestion = totalQuestions > 0 ? Math.round((totalTime / 1000) / totalQuestions) : 0;
            return {
                overallScore,
                totalSessions: analytics.recentSessions.length,
                totalQuestionsAnswered: totalQuestions,
                correctAnswers,
                incorrectAnswers,
                averageTimePerQuestion: avgTimePerQuestion,
                strongTopics,
                weakTopics
            };
        });
    }
    /**
     * GET /students/dashboard/stats - Canonical spec
     * New endpoint for dashboard statistics
     */
    getDashboardStatsCanonical(user) {
        return __awaiter(this, void 0, void 0, function* () {
            const userId = user.user_data.id;
            // Date range: last 7 days (start of day 7 days ago to now)
            const now = new Date();
            const sevenDaysAgo = new Date(now);
            sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 6);
            sevenDaysAgo.setUTCHours(0, 0, 0, 0);
            // Get session counts + recent sessions + last 7 days attempts
            const [activeSessions, completedSessions, completedTodos, pendingTodos, recentSessions, singleChoiceAttempts, multipleChoiceAttempts] = yield Promise.all([
                this.prisma.quizSession.count({
                    where: { userId, status: 'IN_PROGRESS' }
                }),
                this.prisma.quizSession.count({
                    where: { userId, status: 'COMPLETED' }
                }),
                this.prisma.todoItem.count({
                    where: { userId, status: 'COMPLETED' }
                }),
                this.prisma.todoItem.count({
                    where: { userId, status: { in: ['PENDING', 'IN_PROGRESS'] } }
                }),
                this.prisma.quizSession.findMany({
                    where: { userId, status: 'COMPLETED' },
                    orderBy: { completedAt: 'desc' },
                    take: 30,
                    select: { completedAt: true, startedAt: true }
                }),
                // Single-choice attempts in last 7 days
                this.prisma.quizAttempt.findMany({
                    where: {
                        session: { userId },
                        answeredAt: { gte: sevenDaysAgo, lte: now }
                    },
                    select: { answeredAt: true, isCorrect: true }
                }),
                // Multiple-choice attempts in last 7 days
                this.prisma.multipleChoiceAttempt.findMany({
                    where: {
                        session: { userId },
                        answeredAt: { gte: sevenDaysAgo, lte: now }
                    },
                    select: { answeredAt: true, isCorrect: true }
                })
            ]);
            // Calculate total study time in minutes
            let totalStudyTime = 0;
            recentSessions.forEach((session) => {
                if (session.startedAt && session.completedAt) {
                    totalStudyTime += Math.round((new Date(session.completedAt).getTime() - new Date(session.startedAt).getTime()) / (1000 * 60));
                }
            });
            // Calculate streak
            const currentStreak = this.calculateStudyStreak(recentSessions);
            // Build answersLast7Days: group all attempts by date
            const dayMap = new Map();
            // Initialize all 7 days so every day appears even if no activity
            for (let i = 0; i < 7; i++) {
                const d = new Date(sevenDaysAgo);
                d.setUTCDate(d.getUTCDate() + i);
                const key = d.toISOString().split('T')[0];
                dayMap.set(key, { correct: 0, incorrect: 0, total: 0 });
            }
            // Aggregate single-choice attempts
            for (const attempt of singleChoiceAttempts) {
                if (!attempt.answeredAt)
                    continue;
                const key = new Date(attempt.answeredAt).toISOString().split('T')[0];
                const entry = dayMap.get(key);
                if (entry) {
                    entry.total += 1;
                    if (attempt.isCorrect === true)
                        entry.correct += 1;
                    else if (attempt.isCorrect === false)
                        entry.incorrect += 1;
                }
            }
            // Aggregate multiple-choice attempts
            for (const attempt of multipleChoiceAttempts) {
                if (!attempt.answeredAt)
                    continue;
                const key = new Date(attempt.answeredAt).toISOString().split('T')[0];
                const entry = dayMap.get(key);
                if (entry) {
                    entry.total += 1;
                    if (attempt.isCorrect === true)
                        entry.correct += 1;
                    else if (attempt.isCorrect === false)
                        entry.incorrect += 1;
                }
            }
            const answersLast7Days = Array.from(dayMap.entries())
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([date, stats]) => (Object.assign({ date }, stats)));
            return {
                activeSessions,
                completedSessions,
                totalStudyTime,
                currentStreak,
                todosCompleted: completedTodos,
                todosPending: pendingTodos,
                answersLast7Days
            };
        });
    }
    /**
     * GET /students/progress/overview - Canonical spec
     * Returns flat object: {overallProgress, moduleProgress[]}
     */
    getProgressOverviewCanonical(user) {
        return __awaiter(this, void 0, void 0, function* () {
            const progressData = yield this.studentRepository.getStudentProgressOverview(user.user_data.id);
            // Calculate overall progress as percentage of courses completed
            const totalCourses = progressData.completedCourses.length;
            const completedCount = progressData.completedCourses.filter((c) => c.layer1Completed && c.layer2Completed && c.layer3Completed).length;
            const overallProgress = totalCourses > 0 ? Math.round((completedCount / totalCourses) * 100) : 0;
            // Group progress by module
            const moduleMap = new Map();
            progressData.completedCourses.forEach((course) => {
                const moduleId = course.moduleId || 0;
                const moduleName = course.moduleName || 'Unknown';
                const isCompleted = course.layer1Completed &&
                    course.layer2Completed &&
                    course.layer3Completed;
                const existing = moduleMap.get(moduleId) || { moduleName, completed: 0, total: 0 };
                existing.total += 1;
                if (isCompleted)
                    existing.completed += 1;
                moduleMap.set(moduleId, existing);
            });
            const moduleProgress = Array.from(moduleMap.entries()).map(([moduleId, data]) => ({
                moduleId,
                moduleName: data.moduleName,
                progress: data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0,
                completedCourses: data.completed,
                totalCourses: data.total
            }));
            return { overallProgress, moduleProgress };
        });
    }
    /**
     * GET /students/session-results - Canonical spec
     * Returns { items, total, page, limit, totalPages }
     */
    getSessionResultsCanonical(user_1, filters_1) {
        return __awaiter(this, arguments, void 0, function* (user, filters, page = 1, limit = 10) {
            var _a;
            const userId = user.user_data.id;
            const offset = (page - 1) * limit;
            // Build where clause
            const where = { userId, status: 'COMPLETED' };
            if (filters.sessionType)
                where.type = filters.sessionType;
            if (filters.completedAfter)
                where.completedAt = Object.assign(Object.assign({}, where.completedAt), { gte: new Date(filters.completedAfter) });
            if (filters.completedBefore)
                where.completedAt = Object.assign(Object.assign({}, where.completedAt), { lte: new Date(filters.completedBefore) });
            if ((_a = filters.sessionIds) === null || _a === void 0 ? void 0 : _a.length)
                where.id = { in: filters.sessionIds };
            const [sessions, total] = yield Promise.all([
                this.prisma.quizSession.findMany({
                    where,
                    skip: offset,
                    take: limit,
                    orderBy: { completedAt: 'desc' },
                    include: {
                        _count: { select: { quizAttempts: true } },
                        quizAttempts: { select: { isCorrect: true } }
                    }
                }),
                this.prisma.quizSession.count({ where })
            ]);
            const items = sessions.map(session => {
                var _a;
                const totalQuestions = session._count.quizAttempts;
                const correctAnswers = session.quizAttempts.filter(a => a.isCorrect).length;
                const timeSpent = session.startedAt && session.completedAt
                    ? Math.round((new Date(session.completedAt).getTime() - new Date(session.startedAt).getTime()) / 1000)
                    : 0;
                return {
                    sessionId: session.id,
                    sessionTitle: session.title,
                    sessionType: session.type,
                    completedAt: ((_a = session.completedAt) === null || _a === void 0 ? void 0 : _a.toISOString()) || null,
                    score: totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0,
                    correctAnswers,
                    totalQuestions,
                    timeSpent
                };
            });
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
     * GET /students/quiz-history - Canonical spec
     * Returns { items, total, page, limit, totalPages }
     */
    getQuizHistoryCanonical(user_1, type_1, status_1) {
        return __awaiter(this, arguments, void 0, function* (user, type, status, page = 1, limit = 10, sortBy, sortOrder) {
            const userId = user.user_data.id;
            const offset = (page - 1) * limit;
            // Build where clause
            const where = { userId };
            if (type)
                where.type = type;
            if (status)
                where.status = status;
            // Build orderBy
            const orderBy = {};
            if (sortBy === 'score') {
                orderBy.percentage = sortOrder || 'desc';
            }
            else if (sortBy === 'createdAt') {
                orderBy.createdAt = sortOrder || 'desc';
            }
            else {
                orderBy.createdAt = 'desc';
            }
            const [sessions, total] = yield Promise.all([
                this.prisma.quizSession.findMany({
                    where,
                    skip: offset,
                    take: limit,
                    orderBy,
                    select: {
                        id: true,
                        title: true,
                        type: true,
                        status: true,
                        percentage: true,
                        createdAt: true,
                        completedAt: true
                    }
                }),
                this.prisma.quizSession.count({ where })
            ]);
            const items = sessions.map(session => {
                var _a;
                return ({
                    id: session.id,
                    title: session.title,
                    type: session.type,
                    status: session.status,
                    score: session.percentage || 0,
                    createdAt: session.createdAt.toISOString(),
                    completedAt: ((_a = session.completedAt) === null || _a === void 0 ? void 0 : _a.toISOString()) || null
                });
            });
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
     * GET /students/available-sessions - Canonical spec
     * Returns flat array (no wrapper)
     */
    getAvailableSessionsCanonical(user, sessionType) {
        return __awaiter(this, void 0, void 0, function* () {
            const userId = user.user_data.id;
            const sessions = yield this.prisma.quizSession.findMany({
                where: {
                    userId,
                    type: sessionType,
                    status: { in: ['NOT_STARTED', 'IN_PROGRESS'] }
                },
                include: {
                    _count: { select: { sessionQuestions: true } }
                },
                orderBy: { createdAt: 'desc' }
            });
            return sessions.map(session => ({
                id: session.id,
                title: session.title,
                type: session.type,
                status: session.status,
                questionCount: session._count.sessionQuestions,
                createdAt: session.createdAt.toISOString()
            }));
        });
    }
    /**
     * GET /students/analytics/time-based - Canonical spec
     * Returns time-based analytics grouped by period
     */
    getTimeBasedAnalyticsCanonical(user, period, startDate, endDate) {
        return __awaiter(this, void 0, void 0, function* () {
            const userId = user.user_data.id;
            // Default date range: last 30 days
            const end = endDate ? new Date(endDate) : new Date();
            const start = startDate ? new Date(startDate) : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
            const sessions = yield this.prisma.quizSession.findMany({
                where: {
                    userId,
                    status: 'COMPLETED',
                    completedAt: { gte: start, lte: end }
                },
                include: {
                    quizAttempts: { select: { isCorrect: true } }
                },
                orderBy: { completedAt: 'asc' }
            });
            // Group by date/period
            const dataMap = new Map();
            sessions.forEach(session => {
                if (!session.completedAt)
                    return;
                let dateKey;
                const date = new Date(session.completedAt);
                if (period === 'daily') {
                    dateKey = date.toISOString().split('T')[0];
                }
                else if (period === 'weekly') {
                    const weekStart = new Date(date);
                    weekStart.setDate(date.getDate() - date.getDay());
                    dateKey = weekStart.toISOString().split('T')[0];
                }
                else {
                    dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                }
                const existing = dataMap.get(dateKey) || {
                    sessionsCompleted: 0,
                    questionsAnswered: 0,
                    correctAnswers: 0,
                    studyTimeMinutes: 0
                };
                existing.sessionsCompleted += 1;
                existing.questionsAnswered += session.quizAttempts.length;
                existing.correctAnswers += session.quizAttempts.filter(a => a.isCorrect).length;
                if (session.startedAt && session.completedAt) {
                    existing.studyTimeMinutes += Math.round((new Date(session.completedAt).getTime() - new Date(session.startedAt).getTime()) / (1000 * 60));
                }
                dataMap.set(dateKey, existing);
            });
            const data = Array.from(dataMap.entries()).map(([date, stats]) => (Object.assign({ date }, stats)));
            return { period, data };
        });
    }
    /**
     * GET /students/course-analytics - Canonical spec
     * Returns { items, total, page, limit, totalPages }
     */
    getCourseAnalyticsCanonical(user_1, sessionId_1, sessionType_1) {
        return __awaiter(this, arguments, void 0, function* (user, sessionId, sessionType, page = 1, limit = 10) {
            const userId = user.user_data.id;
            // Get quiz attempts with course info
            const where = { session: { userId, status: 'COMPLETED' } };
            if (sessionId)
                where.sessionId = sessionId;
            if (sessionType)
                where.session.type = sessionType;
            const attempts = yield this.prisma.quizAttempt.findMany({
                where,
                include: {
                    question: {
                        include: { course: { select: { id: true, name: true } } }
                    }
                }
            });
            // Group by course
            const courseMap = new Map();
            attempts.forEach(attempt => {
                var _a;
                const courseId = attempt.question.courseId || 0;
                const courseName = ((_a = attempt.question.course) === null || _a === void 0 ? void 0 : _a.name) || 'Unknown';
                const existing = courseMap.get(courseId) || {
                    courseName,
                    questionsAnswered: 0,
                    correctAnswers: 0,
                    timeSpent: 0
                };
                existing.questionsAnswered += 1;
                if (attempt.isCorrect)
                    existing.correctAnswers += 1;
                courseMap.set(courseId, existing);
            });
            const allItems = Array.from(courseMap.entries()).map(([courseId, stats]) => ({
                courseId,
                courseName: stats.courseName,
                questionsAnswered: stats.questionsAnswered,
                correctAnswers: stats.correctAnswers,
                averageScore: stats.questionsAnswered > 0
                    ? Math.round((stats.correctAnswers / stats.questionsAnswered) * 100)
                    : 0,
                timeSpent: stats.timeSpent
            }));
            // Paginate
            const total = allItems.length;
            const offset = (page - 1) * limit;
            const items = allItems.slice(offset, offset + limit);
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
     * PUT /students/courses/:courseId/progress - Canonical spec
     * Returns { courseId, progress, updatedAt }
     */
    updateCourseProgressCanonical(courseId, progress, user) {
        return __awaiter(this, void 0, void 0, function* () {
            const userId = user.user_data.id;
            // Validate course exists
            const courseExists = yield this.studentRepository.courseExists(courseId);
            if (!courseExists) {
                throw new AppError_1.NotFoundError("Course", courseId.toString());
            }
            // Map progress percentage to layer completion
            // 0-33% = layer1, 34-66% = layer2, 67-100% = layer3
            const layer1Completed = progress >= 33;
            const layer2Completed = progress >= 66;
            const layer3Completed = progress >= 100;
            yield this.prisma.courseProgress.upsert({
                where: {
                    userId_courseId: { userId, courseId }
                },
                update: {
                    layer1Completed,
                    layer2Completed,
                    layer3Completed,
                    updatedAt: new Date()
                },
                create: {
                    userId,
                    courseId,
                    layer1Completed,
                    layer2Completed,
                    layer3Completed
                }
            });
            return {
                courseId,
                progress,
                updatedAt: new Date().toISOString()
            };
        });
    }
    /**
     * GET /students/courses/:courseId/progress - Canonical spec
     * Returns { courseId, courseName, progress, lastAccessedAt }
     */
    getCourseProgressCanonical(courseId, user) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const userId = user.user_data.id;
            const course = yield this.prisma.course.findUnique({
                where: { id: courseId },
                select: { id: true, name: true }
            });
            if (!course) {
                throw new AppError_1.NotFoundError("Course", courseId.toString());
            }
            const progress = yield this.prisma.courseProgress.findUnique({
                where: {
                    userId_courseId: { userId, courseId }
                }
            });
            // Calculate progress percentage from layers
            let progressPercent = 0;
            if (progress) {
                if (progress.layer1Completed)
                    progressPercent += 33;
                if (progress.layer2Completed)
                    progressPercent += 33;
                if (progress.layer3Completed)
                    progressPercent += 34;
            }
            return {
                courseId: course.id,
                courseName: course.name,
                progress: progressPercent,
                lastAccessedAt: ((_a = progress === null || progress === void 0 ? void 0 : progress.updatedAt) === null || _a === void 0 ? void 0 : _a.toISOString()) || null
            };
        });
    }
};
StudentService = __decorate([
    (0, tsyringe_1.injectable)(),
    __param(0, (0, tsyringe_1.inject)(student_repository_1.default)),
    __param(1, (0, tsyringe_1.inject)("db")),
    __metadata("design:paramtypes", [student_repository_1.default,
        db_1.default])
], StudentService);
exports.default = StudentService;
