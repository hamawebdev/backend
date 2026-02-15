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
const client_1 = require("@prisma/client");
const db_1 = __importDefault(require("../../config/db"));
const bcrypt_1 = __importDefault(require("bcrypt"));
const AppError_1 = require("../../core/errors/AppError");
const quiz_types_1 = require("../../types/quiz.types");
let AdminService = class AdminService {
    constructor(prismaService) {
        this.prismaService = prismaService;
    }
    get prisma() {
        return this.prismaService.getClient();
    }
    // ==========================================
    // DASHBOARD & ANALYTICS
    // ==========================================
    getDashboardStats() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const [totalUsers, activeSubscriptions, totalQuestions, totalQuizSessions, recentActivity] = yield Promise.all([
                    this.prisma.user.count(),
                    this.prisma.subscription.count({ where: { status: 'ACTIVE' } }),
                    this.prisma.question.count(),
                    this.prisma.quizSession.count(),
                    this.prisma.employeeActivity.findMany({
                        take: 10,
                        orderBy: { createdAt: 'desc' },
                        include: {
                            employee: {
                                select: { fullName: true, email: true }
                            }
                        }
                    })
                ]);
                // Transform recentActivity to canonical format
                const formattedActivity = recentActivity.map(activity => ({
                    type: activity.activityType,
                    description: activity.description,
                    timestamp: activity.createdAt
                }));
                // Canonical format: only 5 key fields
                return {
                    totalUsers,
                    activeSubscriptions,
                    totalQuestions,
                    totalQuizSessions,
                    recentActivity: formattedActivity
                };
            }
            catch (error) {
                throw new AppError_1.InternalServerError("Failed to fetch dashboard stats");
            }
        });
    }
    getUserAnalytics() {
        return __awaiter(this, arguments, void 0, function* (timeframe = 'month') {
            try {
                const now = new Date();
                let startDate;
                switch (timeframe) {
                    case 'day':
                        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                        break;
                    case 'week':
                        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                        break;
                    case 'year':
                        startDate = new Date(now.getFullYear(), 0, 1);
                        break;
                    default: // month
                        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                }
                const [userGrowth, usersByRole, usersByUniversity] = yield Promise.all([
                    this.prisma.user.groupBy({
                        by: ['createdAt'],
                        where: { createdAt: { gte: startDate } },
                        _count: true,
                    }),
                    this.prisma.user.groupBy({
                        by: ['role'],
                        _count: true,
                    }),
                    this.prisma.user.groupBy({
                        by: ['universityId'],
                        _count: true
                    })
                ]);
                return {
                    userGrowth,
                    usersByRole,
                    usersByUniversity
                };
            }
            catch (error) {
                throw new AppError_1.InternalServerError("Failed to fetch user analytics");
            }
        });
    }
    // ==========================================
    // USER MANAGEMENT
    // ==========================================
    getAllUsers(filters) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { page, limit, role, universityId, specialtyId, currentYear, isActive, search } = filters;
                const skip = (page - 1) * limit;
                const where = {};
                if (role)
                    where.role = role;
                if (universityId)
                    where.universityId = universityId;
                if (specialtyId)
                    where.specialtyId = specialtyId;
                if (currentYear)
                    where.currentYear = currentYear;
                if (isActive !== undefined)
                    where.isActive = isActive;
                if (search) {
                    where.OR = [
                        { fullName: { contains: search } },
                        { email: { contains: search } }
                    ];
                }
                const [users, total] = yield Promise.all([
                    this.prisma.user.findMany({
                        where,
                        skip,
                        take: limit,
                        select: {
                            id: true,
                            email: true,
                            fullName: true,
                            role: true,
                            universityId: true,
                            specialtyId: true,
                            currentYear: true,
                            isActive: true,
                            createdAt: true
                        },
                        orderBy: { createdAt: 'desc' }
                    }),
                    this.prisma.user.count({ where })
                ]);
                // Canonical format: items array
                return {
                    items: users,
                    total,
                    page,
                    limit,
                    totalPages: Math.ceil(total / limit)
                };
            }
            catch (error) {
                throw new AppError_1.InternalServerError("Failed to fetch users");
            }
        });
    }
    getUserById(id) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const user = yield this.prisma.user.findUnique({
                    where: { id },
                    include: {
                        university: true,
                        specialty: true,
                        subscriptions: {
                            include: { studyPack: true }
                        },
                        quizSessions: {
                            include: { quiz: { select: { title: true } } },
                            orderBy: { createdAt: 'desc' },
                            take: 10
                        },
                        studentNotes: {
                            orderBy: { createdAt: 'desc' },
                            take: 5
                        },
                        questionReports: {
                            include: { question: { select: { questionText: true } } },
                            orderBy: { createdAt: 'desc' },
                            take: 5
                        },
                        _count: {
                            select: {
                                quizSessions: true,
                                studentNotes: true,
                                questionReports: true,
                                createdQuizzes: true,
                                createdExams: true
                            }
                        }
                    }
                });
                if (!user) {
                    throw new AppError_1.NotFoundError("User");
                }
                const { passwordHash } = user, userWithoutPassword = __rest(user, ["passwordHash"]);
                return userWithoutPassword;
            }
            catch (error) {
                if (error instanceof AppError_1.NotFoundError)
                    throw error;
                throw new AppError_1.InternalServerError("Failed to fetch user");
            }
        });
    }
    createUser(userData, createdById) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const existingUser = yield this.prisma.user.findUnique({
                    where: { email: userData.email }
                });
                if (existingUser) {
                    throw new AppError_1.BadRequestError("User with this email already exists");
                }
                const hashedPassword = yield bcrypt_1.default.hash(userData.password, 12);
                const user = yield this.prisma.user.create({
                    data: {
                        email: userData.email,
                        passwordHash: hashedPassword,
                        fullName: userData.fullName,
                        role: userData.role,
                        universityId: userData.universityId,
                        specialtyId: userData.specialtyId,
                        currentYear: userData.currentYear || client_1.YearLevel.ONE,
                        emailVerified: true, // Admin-created users are automatically verified
                        isActive: true
                    },
                    include: {
                        university: { select: { name: true } },
                        specialty: { select: { name: true } }
                    }
                });
                // Log admin activity
                yield this.prisma.employeeActivity.create({
                    data: {
                        employeeId: createdById,
                        activityType: 'QUESTION_ADDED', // We can extend this enum
                        description: `Created new ${userData.role.toLowerCase()} user: ${userData.email}`,
                        relatedId: user.id
                    }
                });
                return user;
            }
            catch (error) {
                if (error instanceof AppError_1.BadRequestError)
                    throw error;
                throw new AppError_1.InternalServerError("Failed to create user");
            }
        });
    }
    updateUser(id, updateData, updatedById) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const existingUser = yield this.prisma.user.findUnique({ where: { id } });
                if (!existingUser) {
                    throw new AppError_1.NotFoundError("User");
                }
                const user = yield this.prisma.user.update({
                    where: { id },
                    data: updateData,
                    include: {
                        university: { select: { name: true } },
                        specialty: { select: { name: true } }
                    }
                });
                // Log admin activity
                yield this.prisma.employeeActivity.create({
                    data: {
                        employeeId: updatedById,
                        activityType: 'QUESTION_EDITED',
                        description: `Updated user: ${user.email}`,
                        relatedId: user.id,
                        metadata: updateData
                    }
                });
                return user;
            }
            catch (error) {
                if (error instanceof AppError_1.NotFoundError)
                    throw error;
                throw new AppError_1.InternalServerError("Failed to update user");
            }
        });
    }
    deactivateUser(id, deactivatedById) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const user = yield this.prisma.user.findUnique({ where: { id } });
                if (!user) {
                    throw new AppError_1.NotFoundError("User");
                }
                yield this.prisma.user.update({
                    where: { id },
                    data: { isActive: false }
                });
                // Log admin activity
                yield this.prisma.employeeActivity.create({
                    data: {
                        employeeId: deactivatedById,
                        activityType: 'QUESTION_EDITED',
                        description: `Deactivated user: ${user.email}`,
                        relatedId: user.id
                    }
                });
            }
            catch (error) {
                if (error instanceof AppError_1.NotFoundError)
                    throw error;
                throw new AppError_1.InternalServerError("Failed to deactivate user");
            }
        });
    }
    resetUserPassword(id, newPassword, resetById) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const user = yield this.prisma.user.findUnique({ where: { id } });
                if (!user) {
                    throw new AppError_1.NotFoundError("User");
                }
                const hashedPassword = yield bcrypt_1.default.hash(newPassword, 12);
                yield this.prisma.user.update({
                    where: { id },
                    data: { passwordHash: hashedPassword }
                });
                // Log admin activity
                yield this.prisma.employeeActivity.create({
                    data: {
                        employeeId: resetById,
                        activityType: 'QUESTION_EDITED',
                        description: `Reset password for user: ${user.email}`,
                        relatedId: user.id
                    }
                });
            }
            catch (error) {
                if (error instanceof AppError_1.NotFoundError)
                    throw error;
                throw new AppError_1.InternalServerError("Failed to reset password");
            }
        });
    }
    // ==========================================
    // STUDY PACK MANAGEMENT
    // ==========================================
    getAllStudyPacks() {
        return __awaiter(this, arguments, void 0, function* (page = 1, limit = 10) {
            try {
                const skip = (page - 1) * limit;
                const [studyPacks, total] = yield Promise.all([
                    this.prisma.studyPack.findMany({
                        skip,
                        take: limit,
                        include: {
                            unites: {
                                include: {
                                    modules: {
                                        include: {
                                            courses: {
                                                include: {
                                                    _count: {
                                                        select: { questions: true, quizzes: true }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            },
                            subscriptions: {
                                where: { status: 'ACTIVE' },
                                select: { id: true }
                            },
                            _count: {
                                select: { subscriptions: true }
                            }
                        },
                        orderBy: { createdAt: 'desc' }
                    }),
                    this.prisma.studyPack.count()
                ]);
                return {
                    studyPacks,
                    total,
                    page,
                    limit,
                    totalPages: Math.ceil(total / limit)
                };
            }
            catch (error) {
                throw new AppError_1.InternalServerError("Failed to fetch study packs");
            }
        });
    }
    createStudyPack(data, createdById) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                console.log('Creating study pack with data:', JSON.stringify(data, null, 2));
                console.log('Created by user ID:', createdById);
                // First, create the study pack
                const studyPack = yield this.prisma.studyPack.create({
                    data,
                    include: {
                        _count: { select: { subscriptions: true } }
                    }
                });
                console.log('Study pack created successfully:', studyPack.id);
                // Then, try to log the employee activity
                try {
                    yield this.prisma.employeeActivity.create({
                        data: {
                            employeeId: createdById,
                            activityType: 'COURSE_UPLOADED',
                            description: `Created study pack: ${studyPack.name}`,
                            relatedId: studyPack.id
                        }
                    });
                    console.log('Employee activity logged successfully');
                }
                catch (activityError) {
                    console.error('Error logging employee activity:', activityError);
                    console.error('Activity error details:', {
                        message: activityError.message,
                        code: activityError.code,
                        meta: activityError.meta
                    });
                    // Don't throw here - the study pack was created successfully
                    // We can continue without the activity log
                }
                return studyPack;
            }
            catch (error) {
                console.error('Error creating study pack:', error);
                console.error('Error details:', {
                    message: error.message,
                    code: error.code,
                    meta: error.meta,
                    stack: error.stack
                });
                throw new AppError_1.InternalServerError("Failed to create study pack");
            }
        });
    }
    updateStudyPack(id, data, updatedById) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const studyPack = yield this.prisma.studyPack.update({
                    where: { id },
                    data,
                    include: {
                        _count: { select: { subscriptions: true } }
                    }
                });
                // Log admin activity
                yield this.prisma.employeeActivity.create({
                    data: {
                        employeeId: updatedById,
                        activityType: 'COURSE_UPLOADED',
                        description: `Updated study pack: ${studyPack.name}`,
                        relatedId: studyPack.id
                    }
                });
                return studyPack;
            }
            catch (error) {
                if (error.code === 'P2025') {
                    throw new AppError_1.NotFoundError("Study pack");
                }
                throw new AppError_1.InternalServerError("Failed to update study pack");
            }
        });
    }
    deleteStudyPack(id, deletedById) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const studyPack = yield this.prisma.studyPack.findUnique({ where: { id } });
                if (!studyPack) {
                    throw new AppError_1.NotFoundError("Study pack");
                }
                yield this.prisma.studyPack.delete({ where: { id } });
                // Log admin activity
                yield this.prisma.employeeActivity.create({
                    data: {
                        employeeId: deletedById,
                        activityType: 'COURSE_UPLOADED',
                        description: `Deleted study pack: ${studyPack.name}`,
                        relatedId: id
                    }
                });
            }
            catch (error) {
                if (error instanceof AppError_1.NotFoundError)
                    throw error;
                if (error.code === 'P2025') {
                    throw new AppError_1.NotFoundError("Study pack");
                }
                throw new AppError_1.InternalServerError("Failed to delete study pack");
            }
        });
    }
    // ==========================================
    // COURSE STRUCTURE MANAGEMENT
    // ==========================================
    createUnite(data, createdById) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Validate that the study pack exists
                const studyPack = yield this.prisma.studyPack.findUnique({
                    where: { id: data.studyPackId }
                });
                if (!studyPack) {
                    throw new AppError_1.NotFoundError("Study pack not found");
                }
                const unite = yield this.prisma.unite.create({
                    data,
                    include: {
                        studyPack: { select: { name: true } }
                    }
                });
                yield this.prisma.employeeActivity.create({
                    data: {
                        employeeId: createdById,
                        activityType: 'COURSE_UPLOADED',
                        description: `Created unite: ${unite.name}`,
                        relatedId: unite.id
                    }
                });
                return unite;
            }
            catch (error) {
                if (error instanceof AppError_1.NotFoundError)
                    throw error;
                // Log the actual error for debugging
                console.error('Error creating unite:', error);
                // Check for specific database errors
                if (error && typeof error === 'object' && 'code' in error) {
                    if (error.code === 'P2002') {
                        throw new AppError_1.BadRequestError("A unite with this name already exists in the study pack");
                    }
                    if (error.code === 'P2003') {
                        throw new AppError_1.BadRequestError("Invalid study pack ID provided");
                    }
                }
                throw new AppError_1.InternalServerError("Failed to create unite");
            }
        });
    }
    createModule(data, createdById) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Validate that the unite exists
                const unite = yield this.prisma.unite.findUnique({
                    where: { id: data.uniteId }
                });
                if (!unite) {
                    throw new AppError_1.NotFoundError("Unite not found");
                }
                const module = yield this.prisma.module.create({
                    data,
                    include: {
                        unite: { select: { name: true } }
                    }
                });
                yield this.prisma.employeeActivity.create({
                    data: {
                        employeeId: createdById,
                        activityType: 'COURSE_UPLOADED',
                        description: `Created module: ${module.name}`,
                        relatedId: module.id
                    }
                });
                return module;
            }
            catch (error) {
                if (error instanceof AppError_1.NotFoundError)
                    throw error;
                // Log the actual error for debugging
                console.error('Error creating module:', error);
                // Check for specific database errors
                if (error && typeof error === 'object' && 'code' in error) {
                    if (error.code === 'P2002') {
                        throw new AppError_1.BadRequestError("A module with this name already exists in the unite");
                    }
                    if (error.code === 'P2003') {
                        throw new AppError_1.BadRequestError("Invalid unite ID provided");
                    }
                }
                throw new AppError_1.InternalServerError("Failed to create module");
            }
        });
    }
    createCourse(data, createdById) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const course = yield this.prisma.course.create({
                    data,
                    include: {
                        module: { select: { name: true } }
                    }
                });
                yield this.prisma.employeeActivity.create({
                    data: {
                        employeeId: createdById,
                        activityType: 'COURSE_UPLOADED',
                        description: `Created course: ${course.name}`,
                        relatedId: course.id
                    }
                });
                return course;
            }
            catch (error) {
                throw new AppError_1.InternalServerError("Failed to create course");
            }
        });
    }
    createCourseResource(data, createdById) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const resource = yield this.prisma.courseResource.create({
                    data,
                    include: {
                        course: { select: { name: true } }
                    }
                });
                yield this.prisma.employeeActivity.create({
                    data: {
                        employeeId: createdById,
                        activityType: 'RESOURCE_ADDED',
                        description: `Added resource: ${resource.title} to course`,
                        relatedId: resource.id
                    }
                });
                return resource;
            }
            catch (error) {
                throw new AppError_1.InternalServerError("Failed to create course resource");
            }
        });
    }
    // ==========================================
    // UPDATE OPERATIONS
    // ==========================================
    updateUnite(id, data) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Check if unite exists
                const existingUnite = yield this.prisma.unite.findUnique({
                    where: { id }
                });
                if (!existingUnite) {
                    throw new AppError_1.NotFoundError(`Unite with ID ${id} not found`);
                }
                // If studyPackId is being updated, validate it exists
                if (data.studyPackId) {
                    const studyPack = yield this.prisma.studyPack.findUnique({
                        where: { id: data.studyPackId }
                    });
                    if (!studyPack) {
                        throw new AppError_1.BadRequestError(`Study pack with ID ${data.studyPackId} not found`);
                    }
                }
                const updatedUnite = yield this.prisma.unite.update({
                    where: { id },
                    data: Object.assign(Object.assign({}, data), { updatedAt: new Date() }),
                    include: {
                        studyPack: { select: { name: true } }
                    }
                });
                return updatedUnite;
            }
            catch (error) {
                if (error instanceof AppError_1.NotFoundError || error instanceof AppError_1.BadRequestError) {
                    throw error;
                }
                throw new AppError_1.InternalServerError("Failed to update unite");
            }
        });
    }
    updateModule(id, data) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Check if module exists
                const existingModule = yield this.prisma.module.findUnique({
                    where: { id }
                });
                if (!existingModule) {
                    throw new AppError_1.NotFoundError(`Module with ID ${id} not found`);
                }
                // If uniteId is being updated, validate it exists
                if (data.uniteId) {
                    const unite = yield this.prisma.unite.findUnique({
                        where: { id: data.uniteId }
                    });
                    if (!unite) {
                        throw new AppError_1.BadRequestError(`Unite with ID ${data.uniteId} not found`);
                    }
                }
                const updatedModule = yield this.prisma.module.update({
                    where: { id },
                    data: Object.assign(Object.assign({}, data), { updatedAt: new Date() }),
                    include: {
                        unite: { select: { name: true } }
                    }
                });
                return updatedModule;
            }
            catch (error) {
                if (error instanceof AppError_1.NotFoundError || error instanceof AppError_1.BadRequestError) {
                    throw error;
                }
                throw new AppError_1.InternalServerError("Failed to update module");
            }
        });
    }
    updateCourse(id, data) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Check if course exists
                const existingCourse = yield this.prisma.course.findUnique({
                    where: { id }
                });
                if (!existingCourse) {
                    throw new AppError_1.NotFoundError(`Course with ID ${id} not found`);
                }
                // If moduleId is being updated, validate it exists
                if (data.moduleId) {
                    const module = yield this.prisma.module.findUnique({
                        where: { id: data.moduleId }
                    });
                    if (!module) {
                        throw new AppError_1.BadRequestError(`Module with ID ${data.moduleId} not found`);
                    }
                }
                const updatedCourse = yield this.prisma.course.update({
                    where: { id },
                    data: Object.assign(Object.assign({}, data), { updatedAt: new Date() }),
                    include: {
                        module: { select: { name: true } }
                    }
                });
                return updatedCourse;
            }
            catch (error) {
                if (error instanceof AppError_1.NotFoundError || error instanceof AppError_1.BadRequestError) {
                    throw error;
                }
                throw new AppError_1.InternalServerError("Failed to update course");
            }
        });
    }
    updateCourseResource(id, data) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Check if course resource exists
                const existingResource = yield this.prisma.courseResource.findUnique({
                    where: { id }
                });
                if (!existingResource) {
                    throw new AppError_1.NotFoundError(`Course resource with ID ${id} not found`);
                }
                // If courseId is being updated, validate it exists
                if (data.courseId) {
                    const course = yield this.prisma.course.findUnique({
                        where: { id: data.courseId }
                    });
                    if (!course) {
                        throw new AppError_1.BadRequestError(`Course with ID ${data.courseId} not found`);
                    }
                }
                const updatedResource = yield this.prisma.courseResource.update({
                    where: { id },
                    data: Object.assign(Object.assign({}, data), { updatedAt: new Date() }),
                    include: {
                        course: { select: { name: true } }
                    }
                });
                return updatedResource;
            }
            catch (error) {
                if (error instanceof AppError_1.NotFoundError || error instanceof AppError_1.BadRequestError) {
                    throw error;
                }
                throw new AppError_1.InternalServerError("Failed to update course resource");
            }
        });
    }
    // ==========================================
    // DELETE OPERATIONS
    // ==========================================
    deleteUnite(id) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Check if unite exists
                const existingUnite = yield this.prisma.unite.findUnique({
                    where: { id },
                    include: {
                        modules: {
                            include: {
                                courses: true
                            }
                        }
                    }
                });
                if (!existingUnite) {
                    throw new AppError_1.NotFoundError(`Unite with ID ${id} not found`);
                }
                // Check if unite has modules
                if (existingUnite.modules.length > 0) {
                    throw new AppError_1.BadRequestError(`Cannot delete unite. It contains ${existingUnite.modules.length} modules. Please delete all modules first.`);
                }
                yield this.prisma.unite.delete({
                    where: { id }
                });
                return { message: "Unite deleted successfully" };
            }
            catch (error) {
                if (error instanceof AppError_1.NotFoundError || error instanceof AppError_1.BadRequestError) {
                    throw error;
                }
                throw new AppError_1.InternalServerError("Failed to delete unite");
            }
        });
    }
    deleteModule(id) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Check if module exists
                const existingModule = yield this.prisma.module.findUnique({
                    where: { id },
                    include: {
                        courses: true
                    }
                });
                if (!existingModule) {
                    throw new AppError_1.NotFoundError(`Module with ID ${id} not found`);
                }
                // Check if module has courses
                if (existingModule.courses.length > 0) {
                    throw new AppError_1.BadRequestError(`Cannot delete module. It contains ${existingModule.courses.length} courses. Please delete all courses first.`);
                }
                yield this.prisma.module.delete({
                    where: { id }
                });
                return { message: "Module deleted successfully" };
            }
            catch (error) {
                if (error instanceof AppError_1.NotFoundError || error instanceof AppError_1.BadRequestError) {
                    throw error;
                }
                throw new AppError_1.InternalServerError("Failed to delete module");
            }
        });
    }
    deleteCourse(id) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Check if course exists
                const existingCourse = yield this.prisma.course.findUnique({
                    where: { id },
                    include: {
                        courseResources: true,
                        questions: true
                    }
                });
                if (!existingCourse) {
                    throw new AppError_1.NotFoundError(`Course with ID ${id} not found`);
                }
                // Check if course has resources or questions
                if (existingCourse.courseResources.length > 0) {
                    throw new AppError_1.BadRequestError(`Cannot delete course. It contains ${existingCourse.courseResources.length} resources. Please delete all resources first.`);
                }
                if (existingCourse.questions.length > 0) {
                    throw new AppError_1.BadRequestError(`Cannot delete course. It contains ${existingCourse.questions.length} questions. Please delete all questions first.`);
                }
                yield this.prisma.course.delete({
                    where: { id }
                });
                return { message: "Course deleted successfully" };
            }
            catch (error) {
                if (error instanceof AppError_1.NotFoundError || error instanceof AppError_1.BadRequestError) {
                    throw error;
                }
                throw new AppError_1.InternalServerError("Failed to delete course");
            }
        });
    }
    deleteCourseResource(id) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Check if course resource exists
                const existingResource = yield this.prisma.courseResource.findUnique({
                    where: { id }
                });
                if (!existingResource) {
                    throw new AppError_1.NotFoundError(`Course resource with ID ${id} not found`);
                }
                yield this.prisma.courseResource.delete({
                    where: { id }
                });
                return { message: "Resource deleted successfully" };
            }
            catch (error) {
                if (error instanceof AppError_1.NotFoundError || error instanceof AppError_1.BadRequestError) {
                    throw error;
                }
                throw new AppError_1.InternalServerError("Failed to delete course resource");
            }
        });
    }
    // ==========================================
    // ADMIN CONTENT CANONICAL METHODS
    // ==========================================
    /**
     * GET /admin/study-packs - Canonical format
     * Returns {items, total, page, limit, totalPages}
     */
    getAllStudyPacksCanonical() {
        return __awaiter(this, arguments, void 0, function* (page = 1, limit = 10) {
            try {
                const skip = (page - 1) * limit;
                const [studyPacks, total] = yield Promise.all([
                    this.prisma.studyPack.findMany({
                        skip,
                        take: limit,
                        orderBy: { createdAt: 'desc' }
                    }),
                    this.prisma.studyPack.count()
                ]);
                // Transform to canonical format
                const items = studyPacks.map(sp => ({
                    id: sp.id,
                    name: sp.name,
                    description: sp.description,
                    type: sp.type,
                    yearNumber: sp.yearNumber,
                    pricePerMonth: sp.pricePerMonth,
                    pricePerYear: sp.pricePerYear,
                    isActive: sp.isActive,
                    createdAt: sp.createdAt
                }));
                return {
                    items,
                    total,
                    page,
                    limit,
                    totalPages: Math.ceil(total / limit)
                };
            }
            catch (error) {
                throw new AppError_1.InternalServerError("Failed to fetch study packs");
            }
        });
    }
    /**
     * POST /admin/study-packs - Canonical format
     * Returns flat object directly with createdAt
     */
    createStudyPackCanonical(data, createdById) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                const studyPack = yield this.prisma.studyPack.create({
                    data: {
                        name: data.name,
                        description: data.description,
                        type: data.type,
                        yearNumber: data.yearNumber,
                        pricePerMonth: data.pricePerMonth,
                        pricePerYear: data.pricePerYear,
                        isActive: (_a = data.isActive) !== null && _a !== void 0 ? _a : true
                    }
                });
                // Log activity
                try {
                    yield this.prisma.employeeActivity.create({
                        data: {
                            employeeId: createdById,
                            activityType: 'COURSE_UPLOADED',
                            description: `Created study pack: ${studyPack.name}`,
                            relatedId: studyPack.id
                        }
                    });
                }
                catch (e) { /* ignore activity log errors */ }
                return {
                    id: studyPack.id,
                    name: studyPack.name,
                    description: studyPack.description,
                    type: studyPack.type,
                    yearNumber: studyPack.yearNumber,
                    pricePerMonth: studyPack.pricePerMonth,
                    pricePerYear: studyPack.pricePerYear,
                    isActive: studyPack.isActive,
                    createdAt: studyPack.createdAt
                };
            }
            catch (error) {
                throw new AppError_1.InternalServerError("Failed to create study pack");
            }
        });
    }
    /**
     * PUT /admin/study-packs/:studyPackId - Canonical format
     * Returns flat object with updatedAt
     */
    updateStudyPackCanonical(id, data, updatedById) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const existing = yield this.prisma.studyPack.findUnique({ where: { id } });
                if (!existing) {
                    throw new AppError_1.NotFoundError("Study pack");
                }
                const studyPack = yield this.prisma.studyPack.update({
                    where: { id },
                    data: {
                        name: data.name,
                        description: data.description,
                        type: data.type,
                        yearNumber: data.yearNumber,
                        pricePerMonth: data.pricePerMonth,
                        pricePerYear: data.pricePerYear,
                        isActive: data.isActive,
                        updatedAt: new Date()
                    }
                });
                // Log activity
                try {
                    yield this.prisma.employeeActivity.create({
                        data: {
                            employeeId: updatedById,
                            activityType: 'COURSE_UPLOADED',
                            description: `Updated study pack: ${studyPack.name}`,
                            relatedId: studyPack.id
                        }
                    });
                }
                catch (e) { /* ignore activity log errors */ }
                return {
                    id: studyPack.id,
                    name: studyPack.name,
                    description: studyPack.description,
                    type: studyPack.type,
                    yearNumber: studyPack.yearNumber,
                    pricePerMonth: studyPack.pricePerMonth,
                    pricePerYear: studyPack.pricePerYear,
                    isActive: studyPack.isActive,
                    createdAt: studyPack.createdAt,
                    updatedAt: studyPack.updatedAt
                };
            }
            catch (error) {
                if (error instanceof AppError_1.NotFoundError)
                    throw error;
                throw new AppError_1.InternalServerError("Failed to update study pack");
            }
        });
    }
    /**
     * POST /admin/content/unites - Canonical format
     * Returns flat object directly with createdAt
     */
    createUniteCanonical(data, createdById) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const unite = yield this.prisma.unite.create({
                    data: {
                        name: data.name,
                        logoUrl: data.logoUrl || null,
                        studyPackId: data.studyPackId
                    }
                });
                // Log activity
                try {
                    yield this.prisma.employeeActivity.create({
                        data: {
                            employeeId: createdById,
                            activityType: 'COURSE_UPLOADED',
                            description: `Created unite: ${unite.name}`,
                            relatedId: unite.id
                        }
                    });
                }
                catch (e) { /* ignore activity log errors */ }
                return {
                    id: unite.id,
                    name: unite.name,
                    logoUrl: unite.logoUrl,
                    createdAt: unite.createdAt
                };
            }
            catch (error) {
                if (error && typeof error === 'object' && 'code' in error) {
                    if (error.code === 'P2003') {
                        throw new AppError_1.BadRequestError("Invalid study pack ID provided");
                    }
                }
                throw new AppError_1.InternalServerError("Failed to create unite");
            }
        });
    }
    /**
     * PUT /admin/content/unites/:unitId - Canonical format
     * Returns flat object with updatedAt
     */
    updateUniteCanonical(id, data) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const existing = yield this.prisma.unite.findUnique({ where: { id } });
                if (!existing) {
                    throw new AppError_1.NotFoundError("Unite");
                }
                const unite = yield this.prisma.unite.update({
                    where: { id },
                    data: {
                        name: data.name,
                        logoUrl: data.logoUrl,
                        updatedAt: new Date()
                    }
                });
                return {
                    id: unite.id,
                    name: unite.name,
                    logoUrl: unite.logoUrl,
                    createdAt: unite.createdAt,
                    updatedAt: unite.updatedAt
                };
            }
            catch (error) {
                if (error instanceof AppError_1.NotFoundError)
                    throw error;
                throw new AppError_1.InternalServerError("Failed to update unite");
            }
        });
    }
    /**
     * POST /admin/content/modules - Canonical format
     * Returns flat object directly with createdAt
     */
    createModuleCanonical(data, createdById) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Validate unite exists if provided
                if (data.uniteId) {
                    const unite = yield this.prisma.unite.findUnique({ where: { id: data.uniteId } });
                    if (!unite) {
                        throw new AppError_1.NotFoundError("Unite");
                    }
                }
                const module = yield this.prisma.module.create({
                    data: Object.assign({ name: data.name }, (data.uniteId && { uniteId: data.uniteId }))
                });
                // Log activity
                try {
                    yield this.prisma.employeeActivity.create({
                        data: {
                            employeeId: createdById,
                            activityType: 'COURSE_UPLOADED',
                            description: `Created module: ${module.name}`,
                            relatedId: module.id
                        }
                    });
                }
                catch (e) { /* ignore activity log errors */ }
                return {
                    id: module.id,
                    name: module.name,
                    uniteId: module.uniteId,
                    createdAt: module.createdAt
                };
            }
            catch (error) {
                if (error instanceof AppError_1.NotFoundError)
                    throw error;
                throw new AppError_1.InternalServerError("Failed to create module");
            }
        });
    }
    /**
     * PUT /admin/content/modules/:moduleId - Canonical format
     * Returns flat object with updatedAt
     */
    updateModuleCanonical(id, data) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const existing = yield this.prisma.module.findUnique({ where: { id } });
                if (!existing) {
                    throw new AppError_1.NotFoundError("Module");
                }
                const module = yield this.prisma.module.update({
                    where: { id },
                    data: {
                        name: data.name,
                        updatedAt: new Date()
                    }
                });
                return {
                    id: module.id,
                    name: module.name,
                    uniteId: module.uniteId,
                    createdAt: module.createdAt,
                    updatedAt: module.updatedAt
                };
            }
            catch (error) {
                if (error instanceof AppError_1.NotFoundError)
                    throw error;
                throw new AppError_1.InternalServerError("Failed to update module");
            }
        });
    }
    /**
     * POST /admin/content/courses - Canonical format
     * Returns flat object directly with createdAt
     */
    createCourseCanonical(data, createdById) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Validate module exists
                const module = yield this.prisma.module.findUnique({ where: { id: data.moduleId } });
                if (!module) {
                    throw new AppError_1.NotFoundError("Module");
                }
                const course = yield this.prisma.course.create({
                    data: {
                        name: data.name,
                        description: data.description || null,
                        moduleId: data.moduleId
                    }
                });
                // Log activity
                try {
                    yield this.prisma.employeeActivity.create({
                        data: {
                            employeeId: createdById,
                            activityType: 'COURSE_UPLOADED',
                            description: `Created course: ${course.name}`,
                            relatedId: course.id
                        }
                    });
                }
                catch (e) { /* ignore activity log errors */ }
                return {
                    id: course.id,
                    name: course.name,
                    description: course.description,
                    moduleId: course.moduleId,
                    createdAt: course.createdAt
                };
            }
            catch (error) {
                if (error instanceof AppError_1.NotFoundError)
                    throw error;
                throw new AppError_1.InternalServerError("Failed to create course");
            }
        });
    }
    /**
     * PUT /admin/content/courses/:courseId - Canonical format
     * Returns flat object with updatedAt
     */
    updateCourseCanonical(id, data) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const existing = yield this.prisma.course.findUnique({ where: { id } });
                if (!existing) {
                    throw new AppError_1.NotFoundError("Course");
                }
                const course = yield this.prisma.course.update({
                    where: { id },
                    data: {
                        name: data.name,
                        description: data.description,
                        updatedAt: new Date()
                    }
                });
                return {
                    id: course.id,
                    name: course.name,
                    description: course.description,
                    moduleId: course.moduleId,
                    createdAt: course.createdAt,
                    updatedAt: course.updatedAt
                };
            }
            catch (error) {
                if (error instanceof AppError_1.NotFoundError)
                    throw error;
                throw new AppError_1.InternalServerError("Failed to update course");
            }
        });
    }
    /**
     * GET /admin/content/filters - Canonical format
     * Returns hierarchical content structure: {unites: [{id, name, modules: [{id, name, courses}]}]}
     */
    getAdminContentFilters(filters) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Build where clause for study packs based on filters
                const studyPackWhere = {};
                if (filters.isResidency !== undefined) {
                    studyPackWhere.type = filters.isResidency ? 'RESIDENCY' : 'YEAR';
                }
                if (filters.yearLevel) {
                    studyPackWhere.yearNumber = filters.yearLevel;
                }
                // Get all unites with their modules and courses, filtered by study pack
                const unites = yield this.prisma.unite.findMany({
                    where: Object.keys(studyPackWhere).length > 0 ? {
                        studyPack: studyPackWhere
                    } : undefined,
                    select: {
                        id: true,
                        name: true,
                        modules: {
                            select: {
                                id: true,
                                name: true,
                                courses: {
                                    select: {
                                        id: true,
                                        name: true
                                    }
                                }
                            }
                        }
                    },
                    orderBy: { name: 'asc' }
                });
                // Transform to canonical format
                const result = {
                    unites: unites.map(u => ({
                        id: u.id,
                        name: u.name,
                        modules: u.modules.map(m => ({
                            id: m.id,
                            name: m.name,
                            courses: m.courses.map(c => ({
                                id: c.id,
                                name: c.name
                            }))
                        }))
                    }))
                };
                return result;
            }
            catch (error) {
                throw new AppError_1.InternalServerError("Failed to fetch content filters");
            }
        });
    }
    // ==========================================
    // QUIZ MANAGEMENT
    // ==========================================
    getAllQuizzes() {
        return __awaiter(this, arguments, void 0, function* (page = 1, limit = 10) {
            try {
                const skip = (page - 1) * limit;
                const [quizzes, total] = yield Promise.all([
                    this.prisma.quiz.findMany({
                        skip,
                        take: limit,
                        include: {
                            course: { select: { name: true } },
                            university: { select: { name: true } },
                            createdBy: { select: { fullName: true } },
                            quizQuestions: {
                                include: {
                                    question: {
                                        include: {
                                            questionAnswers: true
                                        }
                                    }
                                }
                            },
                            quizSessions: {
                                select: {
                                    id: true,
                                    status: true,
                                    score: true,
                                    percentage: true
                                }
                            },
                            _count: {
                                select: {
                                    quizQuestions: true,
                                    quizSessions: true
                                }
                            }
                        },
                        orderBy: { createdAt: 'desc' }
                    }),
                    this.prisma.quiz.count()
                ]);
                return {
                    quizzes,
                    total,
                    page,
                    limit,
                    totalPages: Math.ceil(total / limit)
                };
            }
            catch (error) {
                throw new AppError_1.InternalServerError("Failed to fetch quizzes");
            }
        });
    }
    validateQuizReferences(data, createdById) {
        return __awaiter(this, void 0, void 0, function* () {
            // Validate courseId if provided
            if (data.courseId) {
                const course = yield this.prisma.course.findUnique({ where: { id: data.courseId } });
                if (!course) {
                    throw new AppError_1.BadRequestError(`Course with ID ${data.courseId} does not exist`);
                }
            }
            // Validate universityId if provided  
            if (data.universityId) {
                const university = yield this.prisma.university.findUnique({ where: { id: data.universityId } });
                if (!university) {
                    throw new AppError_1.BadRequestError(`University with ID ${data.universityId} does not exist`);
                }
            }
            // Validate createdById
            const user = yield this.prisma.user.findUnique({ where: { id: createdById } });
            if (!user) {
                throw new AppError_1.BadRequestError(`User with ID ${createdById} does not exist`);
            }
        });
    }
    createQuizWithQuestions(data, createdById) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Validate references before attempting to create
                yield this.validateQuizReferences(data, createdById);
                const result = yield this.prisma.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
                    // Create the quiz
                    const quiz = yield tx.quiz.create({
                        data: {
                            title: data.title,
                            description: data.description,
                            type: data.type,
                            courseId: data.courseId,
                            universityId: data.universityId,
                            yearLevel: data.yearLevel,
                            quizYear: data.quizYear,
                            createdById
                        }
                    });
                    // Create questions and their answers
                    for (const questionData of data.questions) {
                        // Use provided question type or determine based on number of correct answers
                        const correctAnswersCount = questionData.answers.filter(a => a.isCorrect).length;
                        const questionType = questionData.questionType || quiz_types_1.QuestionType.SINGLE_CHOICE;
                        const question = yield tx.question.create({
                            data: {
                                courseId: data.courseId,
                                questionText: questionData.questionText,
                                explanation: questionData.explanation,
                                questionType: questionType,
                                universityId: data.universityId,
                                yearLevel: data.yearLevel,
                                createdById
                            }
                        });
                        // Link question to quiz
                        yield tx.quizQuestion.create({
                            data: {
                                quizId: quiz.id,
                                questionId: question.id
                            }
                        });
                        // Create answers
                        for (const answerData of questionData.answers) {
                            const answer = yield tx.questionAnswer.create({
                                data: {
                                    questionId: question.id,
                                    answerText: answerData.answerText,
                                    isCorrect: answerData.isCorrect,
                                    explanation: answerData.explanation
                                }
                            });
                            // Create explanation images if provided
                            if (answerData.images && answerData.images.length > 0) {
                                for (const imageData of answerData.images) {
                                    yield tx.explanationImage.create({
                                        data: {
                                            answerId: answer.id,
                                            imagePath: imageData.imagePath,
                                            altText: imageData.altText
                                        }
                                    });
                                }
                            }
                        }
                    }
                    return quiz;
                }));
                // Log admin activity
                yield this.prisma.employeeActivity.create({
                    data: {
                        employeeId: createdById,
                        activityType: 'QUIZ_CREATED',
                        description: `Created quiz: ${data.title} with ${data.questions.length} questions`,
                        relatedId: result.id
                    }
                });
                return result;
            }
            catch (error) {
                console.error("Error creating quiz with questions:", error);
                // Re-throw validation errors (BadRequestError) as-is
                if (error instanceof AppError_1.BadRequestError) {
                    throw error;
                }
                // Handle specific Prisma errors
                if (error instanceof Error && 'code' in error) {
                    const prismaError = error;
                    if (prismaError.code === 'P2003') {
                        // Foreign key constraint violation
                        console.error('Foreign key constraint violation:', prismaError.meta);
                        throw new AppError_1.BadRequestError("Invalid reference: Please check that the courseId, universityId, and createdById exist in the database");
                    }
                    if (prismaError.code === 'P2002') {
                        // Unique constraint violation
                        console.error('Unique constraint violation:', prismaError.meta);
                        throw new AppError_1.BadRequestError("Duplicate entry: A quiz with this combination already exists");
                    }
                    if (prismaError.code === 'P2025') {
                        // Record not found
                        console.error('Record not found:', prismaError.meta);
                        throw new AppError_1.BadRequestError("Referenced record not found");
                    }
                }
                const errorMessage = error instanceof Error ? error.message : String(error);
                throw new AppError_1.InternalServerError(`Failed to create quiz with questions: ${errorMessage}`);
            }
        });
    }
    updateQuiz(id, data, updatedById) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const quiz = yield this.prisma.quiz.update({
                    where: { id },
                    data,
                    include: {
                        course: { select: { name: true } },
                        university: { select: { name: true } },
                        _count: { select: { quizQuestions: true } }
                    }
                });
                yield this.prisma.employeeActivity.create({
                    data: {
                        employeeId: updatedById,
                        activityType: 'QUIZ_CREATED',
                        description: `Updated quiz: ${quiz.title}`,
                        relatedId: quiz.id
                    }
                });
                return quiz;
            }
            catch (error) {
                if (error.code === 'P2025') {
                    throw new AppError_1.NotFoundError("Quiz");
                }
                throw new AppError_1.InternalServerError("Failed to update quiz");
            }
        });
    }
    deleteQuiz(id, deletedById) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const quiz = yield this.prisma.quiz.findUnique({ where: { id } });
                if (!quiz) {
                    throw new AppError_1.NotFoundError("Quiz");
                }
                yield this.prisma.quiz.delete({ where: { id } });
                yield this.prisma.employeeActivity.create({
                    data: {
                        employeeId: deletedById,
                        activityType: 'QUIZ_CREATED',
                        description: `Deleted quiz: ${quiz.title}`,
                        relatedId: id
                    }
                });
            }
            catch (error) {
                if (error instanceof AppError_1.NotFoundError)
                    throw error;
                if (error.code === 'P2025') {
                    throw new AppError_1.NotFoundError("Quiz");
                }
                throw new AppError_1.InternalServerError("Failed to delete quiz");
            }
        });
    }
    // ==========================================
    // EXAM MANAGEMENT
    // ==========================================
    getAllExams() {
        return __awaiter(this, arguments, void 0, function* (page = 1, limit = 10) {
            try {
                const skip = (page - 1) * limit;
                const [exams, total] = yield Promise.all([
                    this.prisma.exam.findMany({
                        skip,
                        take: limit,
                        include: {
                            university: { select: { name: true } },
                            createdBy: { select: { fullName: true } },
                            examQuestions: {
                                include: {
                                    question: {
                                        include: {
                                            questionAnswers: true
                                        }
                                    }
                                }
                            },
                            _count: {
                                select: {
                                    examQuestions: true,
                                    quizSessions: true
                                }
                            }
                        },
                        orderBy: { createdAt: 'desc' }
                    }),
                    this.prisma.exam.count()
                ]);
                return {
                    exams,
                    total,
                    page,
                    limit,
                    totalPages: Math.ceil(total / limit)
                };
            }
            catch (error) {
                throw new AppError_1.InternalServerError("Failed to fetch exams");
            }
        });
    }
    validateExamReferences(data, createdById) {
        return __awaiter(this, void 0, void 0, function* () {
            // Validate universityId (required for exams)
            const university = yield this.prisma.university.findUnique({ where: { id: data.universityId } });
            if (!university) {
                throw new AppError_1.BadRequestError(`University with ID ${data.universityId} does not exist`);
            }
            // Validate createdById
            const user = yield this.prisma.user.findUnique({ where: { id: createdById } });
            if (!user) {
                throw new AppError_1.BadRequestError(`User with ID ${createdById} does not exist`);
            }
        });
    }
    createExamWithQuestions(data, createdById) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Validate references before attempting to create
                yield this.validateExamReferences(data, createdById);
                const result = yield this.prisma.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
                    // Create the exam
                    const exam = yield tx.exam.create({
                        data: {
                            title: data.title,
                            description: data.description,
                            moduleId: data.moduleId,
                            universityId: data.universityId,
                            yearLevel: data.yearLevel,
                            examYear: new Date(data.examYear),
                            year: data.year,
                            createdById
                        }
                    });
                    // Create questions and their answers
                    for (const questionData of data.questions) {
                        const question = yield tx.question.create({
                            data: {
                                questionText: questionData.questionText,
                                explanation: questionData.explanation,
                                universityId: data.universityId,
                                yearLevel: data.yearLevel,
                                createdById
                            }
                        });
                        // Link question to exam
                        yield tx.examQuestion.create({
                            data: {
                                examId: exam.id,
                                questionId: question.id
                            }
                        });
                        // Create answers
                        for (const answerData of questionData.answers) {
                            const answer = yield tx.questionAnswer.create({
                                data: {
                                    questionId: question.id,
                                    answerText: answerData.answerText,
                                    isCorrect: answerData.isCorrect,
                                    explanation: answerData.explanation
                                }
                            });
                            // Create explanation images if provided
                            if (answerData.images && answerData.images.length > 0) {
                                for (const imageData of answerData.images) {
                                    yield tx.explanationImage.create({
                                        data: {
                                            answerId: answer.id,
                                            imagePath: imageData.imagePath,
                                            altText: imageData.altText
                                        }
                                    });
                                }
                            }
                        }
                    }
                    return exam;
                }));
                // Log admin activity
                yield this.prisma.employeeActivity.create({
                    data: {
                        employeeId: createdById,
                        activityType: 'EXAM_CREATED',
                        description: `Created exam: ${data.title} with ${data.questions.length} questions`,
                        relatedId: result.id
                    }
                });
                return result;
            }
            catch (error) {
                console.error("Error creating exam with questions:", error);
                // Re-throw validation errors (BadRequestError) as-is
                if (error instanceof AppError_1.BadRequestError) {
                    throw error;
                }
                // Handle specific Prisma errors
                if (error instanceof Error && 'code' in error) {
                    const prismaError = error;
                    if (prismaError.code === 'P2003') {
                        // Foreign key constraint violation
                        throw new AppError_1.InternalServerError("Invalid reference: Please check that the universityId and createdById exist in the database");
                    }
                    if (prismaError.code === 'P2002') {
                        // Unique constraint violation
                        throw new AppError_1.InternalServerError("Duplicate entry: An exam with this combination already exists");
                    }
                }
                const errorMessage = error instanceof Error ? error.message : String(error);
                throw new AppError_1.InternalServerError(`Failed to create exam with questions: ${errorMessage}`);
            }
        });
    }
    // ==========================================
    // QUESTION MANAGEMENT
    // ==========================================
    getAllQuestions() {
        return __awaiter(this, arguments, void 0, function* (page = 1, limit = 10, filters = {}) {
            try {
                const skip = (page - 1) * limit;
                // Build where conditions based on filters
                const whereConditions = {};
                if (filters.courseId) {
                    whereConditions.courseId = filters.courseId;
                }
                if (filters.moduleId) {
                    whereConditions.course = {
                        moduleId: filters.moduleId
                    };
                }
                if (filters.questionType) {
                    whereConditions.questionType = filters.questionType;
                }
                if (filters.yearLevel) {
                    whereConditions.yearLevel = filters.yearLevel;
                }
                if (filters.examYear) {
                    whereConditions.examYear = filters.examYear;
                }
                if (filters.sourceId) {
                    whereConditions.sourceId = filters.sourceId;
                }
                if (filters.search) {
                    whereConditions.questionText = {
                        contains: filters.search,
                        mode: 'insensitive'
                    };
                }
                const [questions, total] = yield Promise.all([
                    this.prisma.question.findMany({
                        where: whereConditions,
                        skip,
                        take: limit,
                        select: {
                            id: true,
                            questionText: true,
                            questionType: true,
                            courseId: true,
                            universityId: true,
                            yearLevel: true,
                            examYear: true,
                            sourceId: true,
                            createdAt: true
                        },
                        orderBy: { createdAt: 'desc' }
                    }),
                    this.prisma.question.count({ where: whereConditions })
                ]);
                return {
                    items: questions,
                    total,
                    page,
                    limit,
                    totalPages: Math.ceil(total / limit)
                };
            }
            catch (error) {
                throw new AppError_1.InternalServerError("Failed to fetch questions");
            }
        });
    }
    getQuestionReportsCanonical() {
        return __awaiter(this, arguments, void 0, function* (page = 1, limit = 10, filters = {}) {
            try {
                const skip = (page - 1) * limit;
                // Build where clause with filters
                const where = {};
                if (filters.status)
                    where.status = filters.status;
                if (filters.reportType)
                    where.reportType = filters.reportType;
                if (filters.questionId)
                    where.questionId = filters.questionId;
                if (filters.userId)
                    where.userId = filters.userId;
                if (filters.search) {
                    where.description = { contains: filters.search };
                }
                // Get total count for pagination
                const total = yield this.prisma.questionReport.count({ where });
                // Get paginated results with includes
                const reports = yield this.prisma.questionReport.findMany({
                    where,
                    include: {
                        user: { select: { id: true, email: true, fullName: true } },
                        question: { select: { id: true, questionText: true } }
                    },
                    orderBy: { createdAt: 'desc' },
                    skip,
                    take: limit
                });
                // Transform to canonical format
                const items = reports.map(report => ({
                    id: report.id,
                    questionId: report.questionId,
                    question: {
                        id: report.question.id,
                        questionText: report.question.questionText
                    },
                    userId: report.userId,
                    user: {
                        id: report.user.id,
                        email: report.user.email,
                        fullName: report.user.fullName
                    },
                    reportType: report.reportType,
                    description: report.description,
                    status: report.status,
                    adminNotes: report.adminResponse,
                    createdAt: report.createdAt,
                    updatedAt: report.updatedAt
                }));
                // Canonical pagination format
                return {
                    items,
                    total,
                    page,
                    limit,
                    totalPages: Math.ceil(total / limit)
                };
            }
            catch (error) {
                throw new AppError_1.InternalServerError("Failed to fetch question reports");
            }
        });
    }
    reviewQuestionReportCanonical(reportId, reviewerId, data) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const reviewedAt = new Date();
                const report = yield this.prisma.questionReport.update({
                    where: { id: reportId },
                    data: {
                        status: data.status,
                        reviewedById: reviewerId,
                        adminResponse: data.adminNotes || null,
                        updatedAt: reviewedAt
                    },
                    include: {
                        question: { select: { questionText: true } }
                    }
                });
                yield this.prisma.employeeActivity.create({
                    data: {
                        employeeId: reviewerId,
                        activityType: 'QUESTION_VERIFIED',
                        description: `${data.status.toLowerCase()} question report for: ${report.question.questionText.substring(0, 50)}...`,
                        relatedId: reportId
                    }
                });
                // Canonical response format
                return {
                    id: report.id,
                    questionId: report.questionId,
                    userId: report.userId,
                    reportType: report.reportType,
                    description: report.description,
                    status: report.status,
                    adminNotes: report.adminResponse,
                    createdAt: report.createdAt,
                    updatedAt: report.updatedAt,
                    reviewedBy: reviewerId,
                    reviewedAt
                };
            }
            catch (error) {
                if (error.code === 'P2025') {
                    throw new AppError_1.NotFoundError("Question report");
                }
                console.error("Error reviewing question report:", error);
                throw new AppError_1.InternalServerError("Failed to review question report");
            }
        });
    }
    // ==========================================
    // SUBSCRIPTION MANAGEMENT
    // ==========================================
    getAllSubscriptions(filters) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { page, limit, status, userId, studyPackId } = filters;
                const skip = (page - 1) * limit;
                const where = {};
                if (status)
                    where.status = status;
                if (userId)
                    where.userId = userId;
                if (studyPackId)
                    where.studyPackId = studyPackId;
                const [subscriptions, total] = yield Promise.all([
                    this.prisma.subscription.findMany({
                        where,
                        skip,
                        take: limit,
                        include: {
                            user: {
                                select: {
                                    id: true,
                                    fullName: true,
                                    email: true
                                }
                            },
                            studyPack: { select: { id: true, name: true } }
                        },
                        orderBy: { createdAt: 'desc' }
                    }),
                    this.prisma.subscription.count({ where })
                ]);
                // Canonical format: items array with nested user and studyPack objects
                const items = subscriptions.map(sub => ({
                    id: sub.id,
                    userId: sub.userId,
                    user: {
                        id: sub.user.id,
                        email: sub.user.email,
                        fullName: sub.user.fullName
                    },
                    studyPackId: sub.studyPackId,
                    studyPack: {
                        id: sub.studyPack.id,
                        name: sub.studyPack.name
                    },
                    status: sub.status,
                    startDate: sub.startDate,
                    endDate: sub.endDate,
                    createdAt: sub.createdAt
                }));
                return {
                    items,
                    total,
                    page,
                    limit,
                    totalPages: Math.ceil(total / limit)
                };
            }
            catch (error) {
                throw new AppError_1.InternalServerError("Failed to fetch subscriptions");
            }
        });
    }
    updateSubscriptionCanonical(id, data, updatedById) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Build update data
                const updateData = {
                    updatedAt: new Date()
                };
                if (data.status)
                    updateData.status = data.status;
                if (data.endDate)
                    updateData.endDate = new Date(data.endDate);
                const subscription = yield this.prisma.subscription.update({
                    where: { id },
                    data: updateData,
                    include: {
                        user: { select: { fullName: true } }
                    }
                });
                yield this.prisma.employeeActivity.create({
                    data: {
                        employeeId: updatedById,
                        activityType: 'QUESTION_EDITED',
                        description: `Updated subscription for ${subscription.user.fullName}`,
                        relatedId: subscription.id
                    }
                });
                // Canonical format: flat subscription object
                return {
                    id: subscription.id,
                    userId: subscription.userId,
                    studyPackId: subscription.studyPackId,
                    status: subscription.status,
                    startDate: subscription.startDate,
                    endDate: subscription.endDate,
                    updatedAt: subscription.updatedAt
                };
            }
            catch (error) {
                if (error.code === 'P2025') {
                    throw new AppError_1.NotFoundError("Subscription");
                }
                throw new AppError_1.InternalServerError("Failed to update subscription");
            }
        });
    }
    getSubscriptionStats() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const [totalSubscriptions, activeSubscriptions, expiredSubscriptions, cancelledSubscriptions, revenueStats, subscriptionsByPack] = yield Promise.all([
                    this.prisma.subscription.count(),
                    this.prisma.subscription.count({ where: { status: 'ACTIVE' } }),
                    this.prisma.subscription.count({ where: { status: 'EXPIRED' } }),
                    this.prisma.subscription.count({ where: { status: 'CANCELLED' } }),
                    this.prisma.subscription.aggregate({
                        _sum: { amountPaid: true },
                        _avg: { amountPaid: true }
                    }),
                    this.prisma.subscription.groupBy({
                        by: ['studyPackId'],
                        _count: true
                    })
                ]);
                return {
                    totalSubscriptions,
                    activeSubscriptions,
                    expiredSubscriptions,
                    cancelledSubscriptions,
                    totalRevenue: revenueStats._sum.amountPaid || 0,
                    averageRevenue: revenueStats._avg.amountPaid || 0,
                    subscriptionsByPack
                };
            }
            catch (error) {
                throw new AppError_1.InternalServerError("Failed to fetch subscription stats");
            }
        });
    }
    // ==========================================
    // MONTHLY SUBSCRIPTION MANAGEMENT
    // ==========================================
    cancelSubscriptionCanonical(id, reason, cancelledById) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // First check if subscription exists and is not already cancelled
                const existingSubscription = yield this.prisma.subscription.findUnique({
                    where: { id },
                    include: {
                        user: { select: { fullName: true } },
                        studyPack: { select: { name: true } }
                    }
                });
                if (!existingSubscription) {
                    throw new AppError_1.NotFoundError("Subscription");
                }
                if (existingSubscription.status === 'CANCELLED') {
                    throw new AppError_1.BadRequestError("Subscription is already cancelled");
                }
                const cancellationDate = new Date();
                // Update subscription status to cancelled
                yield this.prisma.subscription.update({
                    where: { id },
                    data: {
                        status: 'CANCELLED',
                        updatedAt: cancellationDate
                    }
                });
                // Log the activity
                yield this.prisma.employeeActivity.create({
                    data: {
                        employeeId: cancelledById,
                        activityType: 'QUESTION_EDITED',
                        description: `Cancelled subscription for ${existingSubscription.user.fullName} - ${existingSubscription.studyPack.name}${reason ? ` (Reason: ${reason})` : ''}`,
                        relatedId: id
                    }
                });
                // Canonical format: {id, status, cancellationDate, cancellationReason}
                return {
                    id,
                    status: 'CANCELLED',
                    cancellationDate,
                    cancellationReason: reason || null
                };
            }
            catch (error) {
                if (error.code === 'P2025') {
                    throw new AppError_1.NotFoundError("Subscription");
                }
                if (error instanceof AppError_1.BadRequestError || error instanceof AppError_1.NotFoundError) {
                    throw error;
                }
                throw new AppError_1.InternalServerError("Failed to cancel subscription");
            }
        });
    }
    addMonthsToSubscriptionCanonical(id, months, reason, updatedById) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // First check if subscription exists
                const existingSubscription = yield this.prisma.subscription.findUnique({
                    where: { id },
                    include: {
                        user: { select: { fullName: true } },
                        studyPack: { select: { name: true } }
                    }
                });
                if (!existingSubscription) {
                    throw new AppError_1.NotFoundError("Subscription");
                }
                if (existingSubscription.status === 'CANCELLED') {
                    throw new AppError_1.BadRequestError("Cannot add months to a cancelled subscription");
                }
                // Calculate new end date
                const currentEndDate = new Date(existingSubscription.endDate);
                const newEndDate = new Date(currentEndDate);
                newEndDate.setMonth(newEndDate.getMonth() + months);
                // Update subscription with new end date and set status to ACTIVE if it was EXPIRED
                const newStatus = existingSubscription.status === 'EXPIRED' ? 'ACTIVE' : existingSubscription.status;
                const updatedAt = new Date();
                const subscription = yield this.prisma.subscription.update({
                    where: { id },
                    data: {
                        endDate: newEndDate,
                        status: newStatus,
                        updatedAt
                    }
                });
                // Log the activity
                yield this.prisma.employeeActivity.create({
                    data: {
                        employeeId: updatedById,
                        activityType: 'QUESTION_EDITED',
                        description: `Added ${months} month(s) to subscription for ${existingSubscription.user.fullName} - ${existingSubscription.studyPack.name}${reason ? ` (Reason: ${reason})` : ''}`,
                        relatedId: subscription.id
                    }
                });
                // Canonical format: flat subscription object with updatedAt
                return {
                    id: subscription.id,
                    userId: subscription.userId,
                    studyPackId: subscription.studyPackId,
                    status: subscription.status,
                    startDate: subscription.startDate,
                    endDate: subscription.endDate,
                    updatedAt: subscription.updatedAt
                };
            }
            catch (error) {
                if (error.code === 'P2025') {
                    throw new AppError_1.NotFoundError("Subscription");
                }
                if (error instanceof AppError_1.BadRequestError || error instanceof AppError_1.NotFoundError) {
                    throw error;
                }
                throw new AppError_1.InternalServerError("Failed to add months to subscription");
            }
        });
    }
    activateSubscription(id, startDate, endDate, reason, activatedById) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // First check if subscription exists
                const existingSubscription = yield this.prisma.subscription.findUnique({
                    where: { id },
                    include: {
                        user: { select: { fullName: true, email: true } },
                        studyPack: { select: { name: true } }
                    }
                });
                if (!existingSubscription) {
                    throw new AppError_1.NotFoundError("Subscription");
                }
                if (existingSubscription.status === 'ACTIVE') {
                    throw new AppError_1.BadRequestError("Subscription is already active");
                }
                // Prepare update data
                const updateData = {
                    status: 'ACTIVE',
                    updatedAt: new Date()
                };
                // Set start date (default to now if not provided)
                if (startDate) {
                    updateData.startDate = new Date(startDate);
                }
                else if (existingSubscription.status === 'PENDING') {
                    updateData.startDate = new Date();
                }
                // Set end date (default to 1 month from start date if not provided)
                if (endDate) {
                    updateData.endDate = new Date(endDate);
                }
                else if (existingSubscription.status === 'PENDING') {
                    const newEndDate = new Date(updateData.startDate || existingSubscription.startDate);
                    newEndDate.setMonth(newEndDate.getMonth() + 1);
                    updateData.endDate = newEndDate;
                }
                // Update subscription
                const subscription = yield this.prisma.subscription.update({
                    where: { id },
                    data: updateData,
                    include: {
                        user: { select: { fullName: true, email: true } },
                        studyPack: { select: { name: true } }
                    }
                });
                // Log the activity
                yield this.prisma.employeeActivity.create({
                    data: {
                        employeeId: activatedById,
                        activityType: 'QUESTION_EDITED', // We can add a new activity type later
                        description: `Activated subscription for ${subscription.user.fullName} - ${subscription.studyPack.name}${reason ? ` (Reason: ${reason})` : ''}`,
                        relatedId: subscription.id
                    }
                });
                return subscription;
            }
            catch (error) {
                if (error.code === 'P2025') {
                    throw new AppError_1.NotFoundError("Subscription");
                }
                if (error instanceof AppError_1.BadRequestError || error instanceof AppError_1.NotFoundError) {
                    throw error;
                }
                throw new AppError_1.InternalServerError("Failed to activate subscription");
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
    getAllUniversitiesCanonical(filters) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const page = filters.page || 1;
                const limit = filters.limit || 10;
                const skip = (page - 1) * limit;
                // Build where clause
                const whereClause = {};
                if (filters.search) {
                    whereClause.name = { contains: filters.search, mode: 'insensitive' };
                }
                if (filters.country) {
                    whereClause.country = { contains: filters.country, mode: 'insensitive' };
                }
                const [universities, total] = yield Promise.all([
                    this.prisma.university.findMany({
                        where: whereClause,
                        skip,
                        take: limit,
                        orderBy: { name: 'asc' }
                    }),
                    this.prisma.university.count({ where: whereClause })
                ]);
                // Transform to canonical format - note: city is not in schema, returning null
                const items = universities.map(u => ({
                    id: u.id,
                    name: u.name,
                    country: u.country,
                    city: null, // City field not in database schema
                    createdAt: u.createdAt
                }));
                return {
                    items,
                    total,
                    page,
                    limit,
                    totalPages: Math.ceil(total / limit)
                };
            }
            catch (error) {
                throw new AppError_1.InternalServerError("Failed to fetch universities");
            }
        });
    }
    /**
     * POST /admin/universities
     * Create university - returns flat object directly
     */
    createUniversityCanonical(data, createdById) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const university = yield this.prisma.university.create({
                    data: {
                        name: data.name,
                        country: data.country
                        // Note: city is not stored as it's not in the schema
                    }
                });
                yield this.prisma.employeeActivity.create({
                    data: {
                        employeeId: createdById,
                        activityType: 'COURSE_UPLOADED',
                        description: `Created university: ${university.name}`,
                        relatedId: university.id
                    }
                });
                // Return canonical flat object - city null as not stored
                return {
                    id: university.id,
                    name: university.name,
                    country: university.country,
                    city: null,
                    createdAt: university.createdAt
                };
            }
            catch (error) {
                if (error.code === 'P2002') {
                    throw new AppError_1.BadRequestError("University name already exists");
                }
                throw new AppError_1.InternalServerError("Failed to create university");
            }
        });
    }
    /**
     * PUT /admin/universities/:universityId
     * Update university - returns flat object with updatedAt
     */
    updateUniversity(id, data, updatedById) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Check if university exists
                const existing = yield this.prisma.university.findUnique({ where: { id } });
                if (!existing) {
                    throw new AppError_1.NotFoundError("University");
                }
                // Build update data
                const updateData = {};
                if (data.name !== undefined)
                    updateData.name = data.name;
                if (data.country !== undefined)
                    updateData.country = data.country;
                // Note: city is not stored as it's not in the schema
                const university = yield this.prisma.university.update({
                    where: { id },
                    data: updateData
                });
                yield this.prisma.employeeActivity.create({
                    data: {
                        employeeId: updatedById,
                        activityType: 'QUESTION_EDITED',
                        description: `Updated university: ${university.name}`,
                        relatedId: university.id
                    }
                });
                // Return canonical flat object
                return {
                    id: university.id,
                    name: university.name,
                    country: university.country,
                    city: null,
                    createdAt: university.createdAt,
                    updatedAt: university.updatedAt
                };
            }
            catch (error) {
                if (error instanceof AppError_1.NotFoundError)
                    throw error;
                if (error.code === 'P2025') {
                    throw new AppError_1.NotFoundError("University");
                }
                if (error.code === 'P2002') {
                    throw new AppError_1.BadRequestError("University name already exists");
                }
                throw new AppError_1.InternalServerError("Failed to update university");
            }
        });
    }
    /**
     * DELETE /admin/universities/:universityId
     * Delete university - returns {message}
     */
    deleteUniversity(id, deletedById) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Check if university exists
                const existing = yield this.prisma.university.findUnique({
                    where: { id },
                    include: {
                        _count: {
                            select: { users: true, questions: true }
                        }
                    }
                });
                if (!existing) {
                    throw new AppError_1.NotFoundError("University");
                }
                // Check for associated users/questions (optional safety check)
                if (existing._count.users > 0) {
                    throw new AppError_1.BadRequestError(`Cannot delete university with ${existing._count.users} associated users`);
                }
                yield this.prisma.university.delete({ where: { id } });
                yield this.prisma.employeeActivity.create({
                    data: {
                        employeeId: deletedById,
                        activityType: 'QUESTION_EDITED',
                        description: `Deleted university: ${existing.name}`,
                        relatedId: id
                    }
                });
                return { message: "University deleted successfully" };
            }
            catch (error) {
                if (error instanceof AppError_1.NotFoundError || error instanceof AppError_1.BadRequestError)
                    throw error;
                if (error.code === 'P2025') {
                    throw new AppError_1.NotFoundError("University");
                }
                throw new AppError_1.InternalServerError("Failed to delete university");
            }
        });
    }
    // Legacy method - kept for backward compatibility
    getAllUniversities() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                return yield this.prisma.university.findMany({
                    include: {
                        _count: {
                            select: {
                                users: true,
                                quizzes: true,
                                questions: true,
                                exams: true
                            }
                        }
                    },
                    orderBy: { name: 'asc' }
                });
            }
            catch (error) {
                throw new AppError_1.InternalServerError("Failed to fetch universities");
            }
        });
    }
    // Legacy method - kept for backward compatibility
    createUniversity(data, createdById) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const university = yield this.prisma.university.create({
                    data,
                    include: {
                        _count: { select: { users: true } }
                    }
                });
                yield this.prisma.employeeActivity.create({
                    data: {
                        employeeId: createdById,
                        activityType: 'COURSE_UPLOADED',
                        description: `Created university: ${university.name}`,
                        relatedId: university.id
                    }
                });
                return university;
            }
            catch (error) {
                throw new AppError_1.InternalServerError("Failed to create university");
            }
        });
    }
    /**
     * GET /admin/specialties
     * Paginated list with optional search filter
     * Returns: {items, total, page, limit, totalPages}
     */
    getAllSpecialtiesCanonical(filters) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const page = filters.page || 1;
                const limit = filters.limit || 10;
                const skip = (page - 1) * limit;
                // Build where clause
                const whereClause = {};
                if (filters.search) {
                    whereClause.name = { contains: filters.search, mode: 'insensitive' };
                }
                const [specialties, total] = yield Promise.all([
                    this.prisma.specialty.findMany({
                        where: whereClause,
                        skip,
                        take: limit,
                        orderBy: { name: 'asc' }
                    }),
                    this.prisma.specialty.count({ where: whereClause })
                ]);
                // Transform to canonical format
                const items = specialties.map(s => ({
                    id: s.id,
                    name: s.name,
                    createdAt: s.createdAt
                }));
                return {
                    items,
                    total,
                    page,
                    limit,
                    totalPages: Math.ceil(total / limit)
                };
            }
            catch (error) {
                throw new AppError_1.InternalServerError("Failed to fetch specialties");
            }
        });
    }
    /**
     * POST /admin/specialties
     * Create specialty - returns flat object directly
     */
    createSpecialtyCanonical(data, createdById) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const specialty = yield this.prisma.specialty.create({
                    data: { name: data.name }
                });
                yield this.prisma.employeeActivity.create({
                    data: {
                        employeeId: createdById,
                        activityType: 'COURSE_UPLOADED',
                        description: `Created specialty: ${specialty.name}`,
                        relatedId: specialty.id
                    }
                });
                // Return canonical flat object
                return {
                    id: specialty.id,
                    name: specialty.name,
                    createdAt: specialty.createdAt
                };
            }
            catch (error) {
                if (error.code === 'P2002') {
                    throw new AppError_1.BadRequestError("Specialty name already exists");
                }
                throw new AppError_1.InternalServerError("Failed to create specialty");
            }
        });
    }
    /**
     * PUT /admin/specialties/:specialtyId
     * Update specialty - returns flat object with updatedAt
     */
    updateSpecialty(id, data, updatedById) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Check if specialty exists
                const existing = yield this.prisma.specialty.findUnique({ where: { id } });
                if (!existing) {
                    throw new AppError_1.NotFoundError("Specialty");
                }
                const specialty = yield this.prisma.specialty.update({
                    where: { id },
                    data: { name: data.name }
                });
                yield this.prisma.employeeActivity.create({
                    data: {
                        employeeId: updatedById,
                        activityType: 'QUESTION_EDITED',
                        description: `Updated specialty: ${specialty.name}`,
                        relatedId: specialty.id
                    }
                });
                // Return canonical flat object
                return {
                    id: specialty.id,
                    name: specialty.name,
                    createdAt: specialty.createdAt,
                    updatedAt: specialty.updatedAt
                };
            }
            catch (error) {
                if (error instanceof AppError_1.NotFoundError)
                    throw error;
                if (error.code === 'P2025') {
                    throw new AppError_1.NotFoundError("Specialty");
                }
                if (error.code === 'P2002') {
                    throw new AppError_1.BadRequestError("Specialty name already exists");
                }
                throw new AppError_1.InternalServerError("Failed to update specialty");
            }
        });
    }
    /**
     * DELETE /admin/specialties/:specialtyId
     * Delete specialty - returns {message}
     */
    deleteSpecialty(id, deletedById) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Check if specialty exists
                const existing = yield this.prisma.specialty.findUnique({
                    where: { id },
                    include: {
                        _count: {
                            select: { users: true }
                        }
                    }
                });
                if (!existing) {
                    throw new AppError_1.NotFoundError("Specialty");
                }
                // Check for associated users (optional safety check)
                if (existing._count.users > 0) {
                    throw new AppError_1.BadRequestError(`Cannot delete specialty with ${existing._count.users} associated users`);
                }
                yield this.prisma.specialty.delete({ where: { id } });
                yield this.prisma.employeeActivity.create({
                    data: {
                        employeeId: deletedById,
                        activityType: 'QUESTION_EDITED',
                        description: `Deleted specialty: ${existing.name}`,
                        relatedId: id
                    }
                });
                return { message: "Specialty deleted successfully" };
            }
            catch (error) {
                if (error instanceof AppError_1.NotFoundError || error instanceof AppError_1.BadRequestError)
                    throw error;
                if (error.code === 'P2025') {
                    throw new AppError_1.NotFoundError("Specialty");
                }
                throw new AppError_1.InternalServerError("Failed to delete specialty");
            }
        });
    }
    // Legacy method - kept for backward compatibility
    getAllSpecialties() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                return yield this.prisma.specialty.findMany({
                    include: {
                        _count: {
                            select: { users: true }
                        }
                    },
                    orderBy: { name: 'asc' }
                });
            }
            catch (error) {
                throw new AppError_1.InternalServerError("Failed to fetch specialties");
            }
        });
    }
    // Legacy method - kept for backward compatibility
    createSpecialty(data, createdById) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const specialty = yield this.prisma.specialty.create({
                    data,
                    include: {
                        _count: { select: { users: true } }
                    }
                });
                yield this.prisma.employeeActivity.create({
                    data: {
                        employeeId: createdById,
                        activityType: 'COURSE_UPLOADED',
                        description: `Created specialty: ${specialty.name}`,
                        relatedId: specialty.id
                    }
                });
                return specialty;
            }
            catch (error) {
                throw new AppError_1.InternalServerError("Failed to create specialty");
            }
        });
    }
    // ==========================================
    // QUESTION SOURCE MANAGEMENT
    // ==========================================
    createQuestionSource(name, createdById) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const questionSource = yield this.prisma.questionSource.create({
                    data: { name }
                });
                // Log activity
                yield this.prisma.employeeActivity.create({
                    data: {
                        employeeId: createdById,
                        activityType: 'QUIZ_CREATED', // Using existing type temporarily
                        description: `Created question source: ${questionSource.name}`,
                        relatedId: questionSource.id
                    }
                });
                return questionSource;
            }
            catch (error) {
                if (error.code === 'P2002') {
                    throw new AppError_1.BadRequestError("Question source name already exists");
                }
                throw new AppError_1.InternalServerError("Failed to create question source");
            }
        });
    }
    getAllQuestionSources() {
        return __awaiter(this, arguments, void 0, function* (page = 1, limit = 10, search) {
            try {
                const skip = (page - 1) * limit;
                // Build where clause with optional search
                const whereClause = search ? {
                    name: {
                        contains: search,
                        mode: 'insensitive'
                    }
                } : {};
                const [questionSources, total] = yield Promise.all([
                    this.prisma.questionSource.findMany({
                        where: whereClause,
                        skip,
                        take: limit,
                        include: {
                            _count: {
                                select: { questions: true }
                            }
                        },
                        orderBy: { name: 'asc' }
                    }),
                    this.prisma.questionSource.count({ where: whereClause })
                ]);
                // Transform to canonical format with items key
                const items = questionSources.map(source => ({
                    id: source.id,
                    name: source.name,
                    createdAt: source.createdAt
                }));
                return {
                    items,
                    total,
                    page,
                    limit,
                    totalPages: Math.ceil(total / limit)
                };
            }
            catch (error) {
                throw new AppError_1.InternalServerError("Failed to retrieve question sources");
            }
        });
    }
    getQuestionSourceById(id) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const questionSource = yield this.prisma.questionSource.findUnique({
                    where: { id },
                    include: {
                        _count: {
                            select: { questions: true }
                        }
                    }
                });
                if (!questionSource) {
                    throw new AppError_1.NotFoundError("Question source");
                }
                // Return canonical format with questionCount
                return {
                    id: questionSource.id,
                    name: questionSource.name,
                    questionCount: questionSource._count.questions,
                    createdAt: questionSource.createdAt
                };
            }
            catch (error) {
                if (error instanceof AppError_1.NotFoundError) {
                    throw error;
                }
                if (error.code === 'P2025') {
                    throw new AppError_1.NotFoundError("Question source");
                }
                throw new AppError_1.InternalServerError("Failed to retrieve question source");
            }
        });
    }
    updateQuestionSource(id, name, updatedById) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const questionSource = yield this.prisma.questionSource.update({
                    where: { id },
                    data: { name }
                });
                // Log activity
                yield this.prisma.employeeActivity.create({
                    data: {
                        employeeId: updatedById,
                        activityType: 'QUIZ_CREATED', // Using existing type temporarily
                        description: `Updated question source: ${questionSource.name}`,
                        relatedId: questionSource.id
                    }
                });
                return questionSource;
            }
            catch (error) {
                if (error.code === 'P2025') {
                    throw new AppError_1.NotFoundError("Question source");
                }
                if (error.code === 'P2002') {
                    throw new AppError_1.BadRequestError("Question source name already exists");
                }
                throw new AppError_1.InternalServerError("Failed to update question source");
            }
        });
    }
    deleteQuestionSource(id, deletedById) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Check if question source has associated questions
                const questionCount = yield this.prisma.question.count({
                    where: { sourceId: id }
                });
                if (questionCount > 0) {
                    throw new AppError_1.BadRequestError(`Cannot delete question source. It has ${questionCount} associated questions. Please reassign or delete the questions first.`);
                }
                const questionSource = yield this.prisma.questionSource.findUnique({
                    where: { id },
                    select: { name: true }
                });
                if (!questionSource) {
                    throw new AppError_1.NotFoundError("Question source");
                }
                yield this.prisma.questionSource.delete({
                    where: { id }
                });
                // Log activity
                yield this.prisma.employeeActivity.create({
                    data: {
                        employeeId: deletedById,
                        activityType: 'QUIZ_CREATED', // Using existing type temporarily
                        description: `Deleted question source: ${questionSource.name}`,
                        relatedId: id
                    }
                });
            }
            catch (error) {
                if (error.code === 'P2025') {
                    throw new AppError_1.NotFoundError("Question source");
                }
                // Re-throw BadRequestError for question count validation
                if (error instanceof AppError_1.BadRequestError) {
                    throw error;
                }
                throw new AppError_1.InternalServerError("Failed to delete question source");
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
    getResidencyQuestions(filters) {
        return __awaiter(this, void 0, void 0, function* () {
            const { page, limit, part, examYear, universityId, search } = filters;
            const skip = (page - 1) * limit;
            // Build where clause - residency questions have universityId and examYear
            const whereClause = {
                universityId: { not: null },
                examYear: { not: null }
            };
            // Apply filters
            if (universityId) {
                whereClause.universityId = universityId;
            }
            if (examYear) {
                whereClause.examYear = examYear;
            }
            if (part) {
                // Store part in metadata as JSON
                whereClause.metadata = { contains: part };
            }
            if (search) {
                whereClause.questionText = { contains: search, mode: 'insensitive' };
            }
            const [questions, total] = yield Promise.all([
                this.prisma.question.findMany({
                    where: whereClause,
                    include: {
                        university: {
                            select: { id: true, name: true }
                        }
                    },
                    skip,
                    take: limit,
                    orderBy: { createdAt: 'desc' }
                }),
                this.prisma.question.count({ where: whereClause })
            ]);
            // Transform to match frontend expected format (ResidencyQuestionsResponse)
            const transformedQuestions = questions.map(q => ({
                id: q.id,
                questionId: q.id,
                part: this.extractPartFromMetadata(q.metadata),
                examYear: q.examYear,
                universityId: q.universityId,
                metadata: q.metadata,
                createdAt: q.createdAt.toISOString(),
                updatedAt: q.createdAt.toISOString(),
                question: {
                    id: q.id,
                    questionText: q.questionText,
                    explanation: q.explanation,
                    questionType: 'SINGLE_CHOICE',
                    questionImages: [],
                    questionExplanationImages: [],
                    questionAnswers: []
                },
                university: q.university
            }));
            return {
                questions: transformedQuestions,
                pagination: {
                    currentPage: page,
                    totalPages: Math.ceil(total / limit),
                    total,
                    limit
                }
            };
        });
    }
    /**
     * GET /admin/residency-questions/:id
     * Get single residency question with answers and images
     */
    getResidencyQuestionById(questionId) {
        return __awaiter(this, void 0, void 0, function* () {
            const question = yield this.prisma.question.findUnique({
                where: { id: questionId },
                include: {
                    university: {
                        select: { id: true, name: true }
                    },
                    questionAnswers: {
                        select: {
                            id: true,
                            answerText: true,
                            isCorrect: true
                        }
                    },
                    questionImages: {
                        select: {
                            id: true,
                            imagePath: true,
                            altText: true
                        }
                    },
                    questionExplanationImages: {
                        select: {
                            id: true,
                            imagePath: true,
                            altText: true
                        }
                    }
                }
            });
            if (!question) {
                throw new AppError_1.NotFoundError("Residency question");
            }
            // Verify it's a residency question
            if (!question.universityId || !question.examYear) {
                throw new AppError_1.NotFoundError("Residency question");
            }
            return {
                id: question.id,
                questionText: question.questionText,
                part: this.extractPartFromMetadata(question.metadata),
                explanation: question.explanation,
                examYear: question.examYear,
                universityId: question.universityId,
                university: question.university,
                metadata: question.metadata,
                questionAnswers: question.questionAnswers,
                questionImages: question.questionImages,
                questionExplanationImages: question.questionExplanationImages,
                createdAt: question.createdAt.toISOString()
            };
        });
    }
    /**
     * POST /admin/residency-questions
     * Create a new residency question
     */
    createResidencyQuestion(data, createdById) {
        return __awaiter(this, void 0, void 0, function* () {
            // Validate university exists if provided
            if (data.universityId) {
                const university = yield this.prisma.university.findUnique({
                    where: { id: data.universityId }
                });
                if (!university) {
                    throw new AppError_1.NotFoundError("University");
                }
            }
            // Store part in metadata
            const metadata = JSON.stringify(Object.assign({ part: data.part }, (data.metadata ? JSON.parse(data.metadata) : {})));
            const question = yield this.prisma.question.create({
                data: {
                    questionText: data.questionText,
                    explanation: data.explanation,
                    examYear: data.examYear,
                    universityId: data.universityId,
                    metadata,
                    tags: data.tags ? JSON.stringify(data.tags) : undefined,
                    repetitionCount: data.repetitionCount,
                    repetitionYears: data.repetitionYears ? JSON.stringify(data.repetitionYears) : undefined,
                    createdById,
                    questionAnswers: {
                        create: data.questionAnswers.map(answer => ({
                            answerText: answer.answerText,
                            isCorrect: answer.isCorrect
                        }))
                    }
                },
                include: {
                    questionAnswers: {
                        select: {
                            id: true,
                            answerText: true,
                            isCorrect: true
                        }
                    },
                    questionImages: {
                        select: {
                            id: true,
                            imagePath: true,
                            altText: true
                        }
                    },
                    questionExplanationImages: {
                        select: {
                            id: true,
                            imagePath: true,
                            altText: true
                        }
                    }
                }
            });
            return {
                id: question.id,
                questionText: question.questionText,
                part: data.part,
                explanation: question.explanation,
                examYear: question.examYear,
                universityId: question.universityId,
                tags: data.tags,
                repetitionCount: question.repetitionCount,
                repetitionYears: data.repetitionYears,
                questionAnswers: question.questionAnswers,
                questionImages: question.questionImages,
                questionExplanationImages: question.questionExplanationImages,
                createdAt: question.createdAt.toISOString()
            };
        });
    }
    /**
     * PUT /admin/residency-questions/:id
     * Update a residency question
     */
    updateResidencyQuestion(questionId, data) {
        return __awaiter(this, void 0, void 0, function* () {
            // Check question exists and is a residency question
            const existingQuestion = yield this.prisma.question.findUnique({
                where: { id: questionId }
            });
            if (!existingQuestion) {
                throw new AppError_1.NotFoundError("Residency question");
            }
            if (!existingQuestion.universityId || !existingQuestion.examYear) {
                throw new AppError_1.NotFoundError("Residency question");
            }
            // Validate university if being updated
            if (data.universityId) {
                const university = yield this.prisma.university.findUnique({
                    where: { id: data.universityId }
                });
                if (!university) {
                    throw new AppError_1.NotFoundError("University");
                }
            }
            // Build update data
            const updateData = {};
            if (data.questionText !== undefined)
                updateData.questionText = data.questionText;
            if (data.explanation !== undefined)
                updateData.explanation = data.explanation;
            if (data.examYear !== undefined)
                updateData.examYear = data.examYear;
            if (data.universityId !== undefined)
                updateData.universityId = data.universityId;
            if (data.tags !== undefined)
                updateData.tags = JSON.stringify(data.tags);
            if (data.repetitionCount !== undefined)
                updateData.repetitionCount = data.repetitionCount;
            if (data.repetitionYears !== undefined)
                updateData.repetitionYears = JSON.stringify(data.repetitionYears);
            // Handle part in metadata
            if (data.part !== undefined) {
                const existingMetadata = existingQuestion.metadata ? JSON.parse(existingQuestion.metadata) : {};
                updateData.metadata = JSON.stringify(Object.assign(Object.assign({}, existingMetadata), { part: data.part }));
            }
            else if (data.metadata !== undefined) {
                updateData.metadata = data.metadata;
            }
            // Update question and answers in a transaction
            const question = yield this.prisma.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
                // Update answers if provided
                if (data.questionAnswers) {
                    // Delete existing answers
                    yield tx.questionAnswer.deleteMany({
                        where: { questionId }
                    });
                    // Create new answers
                    yield tx.questionAnswer.createMany({
                        data: data.questionAnswers.map(answer => ({
                            questionId,
                            answerText: answer.answerText,
                            isCorrect: answer.isCorrect
                        }))
                    });
                }
                // Update question
                return tx.question.update({
                    where: { id: questionId },
                    data: updateData,
                    include: {
                        questionAnswers: {
                            select: {
                                id: true,
                                answerText: true,
                                isCorrect: true
                            }
                        },
                        questionImages: {
                            select: {
                                id: true,
                                imagePath: true,
                                altText: true
                            }
                        },
                        questionExplanationImages: {
                            select: {
                                id: true,
                                imagePath: true,
                                altText: true
                            }
                        }
                    }
                });
            }));
            return {
                id: question.id,
                questionText: question.questionText,
                part: this.extractPartFromMetadata(question.metadata),
                explanation: question.explanation,
                examYear: question.examYear,
                universityId: question.universityId,
                tags: question.tags ? JSON.parse(question.tags) : [],
                repetitionCount: question.repetitionCount,
                repetitionYears: question.repetitionYears ? JSON.parse(question.repetitionYears) : [],
                questionAnswers: question.questionAnswers,
                questionImages: question.questionImages,
                questionExplanationImages: question.questionExplanationImages,
                createdAt: question.createdAt.toISOString(),
                updatedAt: question.updatedAt.toISOString()
            };
        });
    }
    /**
     * DELETE /admin/residency-questions/:id
     * Delete a residency question
     */
    deleteResidencyQuestion(questionId) {
        return __awaiter(this, void 0, void 0, function* () {
            // Check question exists and is a residency question
            const question = yield this.prisma.question.findUnique({
                where: { id: questionId }
            });
            if (!question) {
                throw new AppError_1.NotFoundError("Residency question");
            }
            if (!question.universityId || !question.examYear) {
                throw new AppError_1.NotFoundError("Residency question");
            }
            // Delete question (cascade will handle answers, images, etc.)
            yield this.prisma.question.delete({
                where: { id: questionId }
            });
        });
    }
    /**
     * Helper to extract part from metadata JSON
     */
    extractPartFromMetadata(metadata) {
        if (!metadata)
            return null;
        try {
            const parsed = JSON.parse(metadata);
            return parsed.part || null;
        }
        catch (_a) {
            return null;
        }
    }
    /**
     * POST /admin/residency-questions/bulk
     * Bulk create residency questions
     */
    bulkCreateResidencyQuestions(data, createdById) {
        return __awaiter(this, void 0, void 0, function* () {
            const { universityId, examYear, part, questions } = data;
            // Validate university exists
            const university = yield this.prisma.university.findUnique({
                where: { id: universityId }
            });
            if (!university) {
                throw new AppError_1.NotFoundError("University");
            }
            // Create all questions in a transaction
            const createdQuestions = yield this.prisma.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
                const results = [];
                for (const q of questions) {
                    // Store part in metadata
                    const metadata = JSON.stringify(Object.assign({ part }, (q.metadata ? { original: q.metadata } : {})));
                    const question = yield tx.question.create({
                        data: {
                            questionText: q.questionText,
                            explanation: q.explanation,
                            examYear,
                            universityId,
                            metadata,
                            createdById,
                            questionAnswers: {
                                create: q.questionAnswers.map(answer => ({
                                    answerText: answer.answerText,
                                    isCorrect: answer.isCorrect,
                                    explanation: answer.explanation
                                }))
                            }
                        },
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
                            questionExplanationImages: {
                                select: {
                                    id: true,
                                    imagePath: true,
                                    altText: true
                                }
                            }
                        }
                    });
                    results.push({
                        id: question.id,
                        questionId: question.id,
                        part,
                        question: {
                            id: question.id,
                            questionText: question.questionText,
                            explanation: question.explanation,
                            questionType: 'SINGLE_CHOICE',
                            universityId: question.universityId,
                            yearLevel: 'SEVEN',
                            examYear: question.examYear,
                            metadata: question.metadata,
                            createdAt: question.createdAt.toISOString(),
                            updatedAt: question.updatedAt.toISOString(),
                            questionAnswers: question.questionAnswers,
                            questionImages: question.questionImages,
                            questionExplanationImages: question.questionExplanationImages
                        }
                    });
                }
                return results;
            }));
            return {
                questions: createdQuestions,
                totalCreated: createdQuestions.length,
                message: `Successfully created ${createdQuestions.length} residency questions`
            };
        });
    }
    // ==========================================
    // MODULE BOOKS MANAGEMENT
    // ==========================================
    /**
     * GET /admin/modules/:id/books
     * Get all books for a module
     */
    getModuleBooks(moduleId) {
        return __awaiter(this, void 0, void 0, function* () {
            // Check if module exists
            const module = yield this.prisma.module.findUnique({
                where: { id: moduleId }
            });
            if (!module) {
                throw new AppError_1.NotFoundError("Module");
            }
            const books = yield this.prisma.moduleBook.findMany({
                where: { moduleId },
                orderBy: { createdAt: 'desc' }
            });
            return {
                books: books.map(book => ({
                    name: book.name,
                    cover_path: book.coverPath,
                    view: book.viewUrl
                }))
            };
        });
    }
    /**
     * POST /admin/modules/:id/books
     * Bulk create books for a module
     */
    createModuleBooks(moduleId, books, createdById) {
        return __awaiter(this, void 0, void 0, function* () {
            // Check if module exists
            const module = yield this.prisma.module.findUnique({
                where: { id: moduleId }
            });
            if (!module) {
                throw new AppError_1.NotFoundError("Module");
            }
            // Create all books in a transaction
            const createdBooks = yield this.prisma.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
                const results = [];
                for (const book of books) {
                    const created = yield tx.moduleBook.create({
                        data: {
                            moduleId,
                            name: book.name,
                            coverPath: book.coverPath || null,
                            viewUrl: book.viewUrl
                        }
                    });
                    results.push(created);
                }
                return results;
            }));
            // Log activity
            yield this.prisma.employeeActivity.create({
                data: {
                    employeeId: createdById,
                    activityType: 'RESOURCE_ADDED',
                    description: `Added ${createdBooks.length} books to module: ${module.name}`,
                    relatedId: moduleId
                }
            });
            return {
                books: createdBooks.map(book => ({
                    name: book.name,
                    cover_path: book.coverPath,
                    view: book.viewUrl
                })),
                totalCreated: createdBooks.length,
                message: `Successfully created ${createdBooks.length} books`
            };
        });
    }
};
AdminService = __decorate([
    (0, tsyringe_1.injectable)(),
    __param(0, (0, tsyringe_1.inject)("db")),
    __metadata("design:paramtypes", [db_1.default])
], AdminService);
exports.default = AdminService;
