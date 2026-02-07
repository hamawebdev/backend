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
let ExamRepository = class ExamRepository {
    constructor(prismaService) {
        this.prismaService = prismaService;
    }
    get prisma() {
        return this.prismaService.getClient();
    }
    getAvailableExams(year, accessibleStudyPackIds, userCurrentYear, hasResidencyAccess, moduleId) {
        return __awaiter(this, void 0, void 0, function* () {
            let targetYear;
            if (year) {
                targetYear = parseInt(year);
            }
            else {
                // If no year is specified, find the most recent year with exams
                const mostRecentExam = yield this.prisma.exam.findFirst({
                    orderBy: { examYear: 'desc' },
                    select: { examYear: true }
                });
                if (mostRecentExam) {
                    targetYear = mostRecentExam.examYear.getFullYear();
                }
                else {
                    // Fallback to current year if no exams exist
                    targetYear = new Date().getFullYear();
                }
            }
            // Build where conditions for regular exams
            const whereConditions = {
                examYear: {
                    gte: new Date(`${targetYear}-01-01`),
                    lt: new Date(`${targetYear + 1}-01-01`)
                }
            };
            // Filter by module if specified
            if (moduleId) {
                whereConditions.moduleId = moduleId;
            }
            // Filter by user's accessible content if not residency subscriber
            if (!hasResidencyAccess && userCurrentYear) {
                whereConditions.yearLevel = userCurrentYear;
            }
            // Get regular exams
            const exams = yield this.prisma.exam.findMany({
                where: whereConditions,
                include: {
                    module: {
                        include: {
                            unite: {
                                include: {
                                    studyPack: {
                                        select: {
                                            name: true
                                        }
                                    }
                                }
                            }
                        }
                    },
                    university: {
                        select: {
                            name: true
                        }
                    }
                },
                orderBy: [
                    { year: 'desc' },
                    { examYear: 'desc' },
                    { yearLevel: 'asc' }
                ]
            });
            // Group exams by year
            const examsByYear = exams.reduce((acc, exam) => {
                const examYear = exam.examYear.getFullYear().toString();
                const existingYear = acc.find(item => item.year === examYear);
                const examData = {
                    id: exam.id,
                    title: exam.title,
                    university: exam.university.name,
                    yearLevel: exam.yearLevel,
                    module: {
                        id: exam.module.id,
                        name: exam.module.name,
                        unite: {
                            name: exam.module.unite.name,
                            studyPack: {
                                name: exam.module.unite.studyPack.name
                            }
                        }
                    },
                    year: exam.year
                };
                if (existingYear) {
                    existingYear.exams.push(examData);
                }
                else {
                    acc.push({
                        year: examYear,
                        exams: [examData]
                    });
                }
                return acc;
            }, []);
            // Get residency exams if user has access
            let residencyExams = {
                available: hasResidencyAccess || false,
                yearsAvailable: [],
                exams: []
            };
            if (hasResidencyAccess) {
                const residencyExamResults = yield this.prisma.exam.findMany({
                    where: {
                        yearLevel: client_1.YearLevel.SEVEN // Assuming residency is year 7
                    },
                    include: {
                        module: {
                            include: {
                                unite: {
                                    include: {
                                        studyPack: {
                                            select: {
                                                name: true
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    },
                    orderBy: [
                        { year: 'desc' },
                        { examYear: 'desc' }
                    ]
                });
                const availableYears = Array.from(new Set(residencyExamResults.map(exam => exam.examYear.getFullYear().toString()))).sort((a, b) => parseInt(b) - parseInt(a));
                residencyExams = {
                    available: true,
                    yearsAvailable: availableYears,
                    exams: residencyExamResults.map(exam => ({
                        id: exam.id,
                        title: exam.title,
                        university: "Residency Program", // Default university for residency exams
                        yearLevel: exam.yearLevel,
                        module: {
                            id: exam.module.id,
                            name: exam.module.name,
                            unite: {
                                name: exam.module.unite.name,
                                studyPack: {
                                    name: exam.module.unite.studyPack.name
                                }
                            }
                        },
                        year: exam.year
                    }))
                };
            }
            return {
                examsByYear,
                residencyExams
            };
        });
    }
    getExamById(examId) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.prisma.exam.findUnique({
                where: { id: examId },
                include: {
                    module: {
                        include: {
                            unite: {
                                include: {
                                    studyPack: true
                                }
                            }
                        }
                    },
                    university: true,
                    examQuestions: {
                        include: {
                            question: {
                                include: {
                                    questionAnswers: {
                                        include: {
                                            explanationImages: true
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            });
        });
    }
    getExamQuestions(examId) {
        return __awaiter(this, void 0, void 0, function* () {
            const examQuestions = yield this.prisma.examQuestion.findMany({
                where: { examId },
                include: {
                    question: {
                        include: {
                            questionAnswers: {
                                include: {
                                    explanationImages: true
                                }
                            },
                            questionImages: true // Include question images for canonical spec
                        }
                    }
                },
                orderBy: [
                    { orderInExam: 'asc' },
                    { createdAt: 'asc' } // Fallback for questions without manual order
                ]
            });
            return examQuestions.map(eq => eq.question);
        });
    }
    getExamsByModuleAndYear(moduleId, year, userCurrentYear, hasResidencyAccess) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d;
            // Build where conditions for questions
            const questionWhereConditions = {
                examYear: year,
                course: {
                    moduleId: moduleId
                }
            };
            // Filter by user's accessible content if not residency subscriber
            if (!hasResidencyAccess && userCurrentYear) {
                questionWhereConditions.yearLevel = userCurrentYear;
            }
            // First, get all questions that match the criteria
            const questions = yield this.prisma.question.findMany({
                where: questionWhereConditions,
                include: {
                    exam: {
                        include: {
                            module: {
                                include: {
                                    unite: {
                                        include: {
                                            studyPack: {
                                                select: {
                                                    name: true
                                                }
                                            }
                                        }
                                    }
                                }
                            },
                            university: {
                                select: {
                                    name: true
                                }
                            }
                        }
                    },
                    course: {
                        include: {
                            module: {
                                include: {
                                    unite: {
                                        include: {
                                            studyPack: {
                                                select: {
                                                    name: true
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            });
            // Group questions by exam and create exam objects
            const examMap = new Map();
            for (const question of questions) {
                let examKey;
                let examData;
                if (question.exam) {
                    // Question is linked to a specific exam
                    examKey = `exam_${question.exam.id}`;
                    examData = {
                        id: question.exam.id,
                        title: question.exam.title,
                        description: question.exam.description,
                        yearLevel: question.exam.yearLevel,
                        examYear: question.exam.examYear,
                        year: question.exam.year,
                        module: question.exam.module,
                        university: question.exam.university,
                        questionCount: 0,
                        isFromQuestions: false // This is a real exam
                    };
                }
                else {
                    // Question is not linked to a specific exam, group by course
                    examKey = `course_${((_a = question.course) === null || _a === void 0 ? void 0 : _a.id) || 'unknown'}`;
                    examData = {
                        id: null, // No specific exam ID
                        title: `${((_b = question.course) === null || _b === void 0 ? void 0 : _b.name) || 'Unknown Course'} - ${year}`,
                        description: `Questions from ${((_c = question.course) === null || _c === void 0 ? void 0 : _c.name) || 'Unknown Course'} for year ${year}`,
                        yearLevel: question.yearLevel,
                        examYear: new Date(year, 0, 1), // Convert year to Date
                        year: year,
                        module: (_d = question.course) === null || _d === void 0 ? void 0 : _d.module,
                        university: null, // Questions might not have university info
                        questionCount: 0,
                        isFromQuestions: true // This is a virtual exam created from questions
                    };
                }
                if (!examMap.has(examKey)) {
                    examMap.set(examKey, examData);
                }
                // Increment question count
                examMap.get(examKey).questionCount++;
            }
            // Convert map to array and filter out exams with no questions
            const exams = Array.from(examMap.values()).filter(exam => exam.questionCount > 0);
            // Sort by exam year (desc) and title (asc)
            exams.sort((a, b) => {
                const yearA = a.examYear instanceof Date ? a.examYear.getFullYear() : a.year;
                const yearB = b.examYear instanceof Date ? b.examYear.getFullYear() : b.year;
                if (yearB !== yearA) {
                    return yearB - yearA; // Descending by year
                }
                return a.title.localeCompare(b.title); // Ascending by title
            });
            return exams;
        });
    }
    createExamSession(userId, examId, examTitle, questionIds) {
        return __awaiter(this, void 0, void 0, function* () {
            const session = yield this.prisma.quizSession.create({
                data: {
                    userId,
                    examId,
                    title: `${examTitle} - Practice Session`,
                    type: client_1.SessionType.EXAM,
                    sessionQuestions: {
                        create: questionIds.map(questionId => ({
                            questionId
                        }))
                    },
                    quizAttempts: {
                        create: questionIds.map(questionId => ({
                            questionId
                        }))
                    }
                }
            });
            return session.id;
        });
    }
};
ExamRepository = __decorate([
    (0, tsyringe_1.injectable)(),
    __param(0, (0, tsyringe_1.inject)("db")),
    __metadata("design:paramtypes", [db_1.default])
], ExamRepository);
exports.default = ExamRepository;
