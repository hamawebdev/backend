import {
  QuizSession,
  SessionType,
  PrismaClient
} from "@prisma/client";
import { inject, injectable } from "tsyringe";
import PrismaService from "../../config/db";
import { NotFoundError } from "../../core/errors/AppError";
import {
  CourseProgress,
  QuizScore,
  ExamResult,
  OverallStats,
  StudentSessionResultsFilters
} from "../../types/quiz.types";

@injectable()
export default class StudentRepository {
  constructor(@inject("db") private prismaService: PrismaService) { }

  private get prisma(): PrismaClient {
    return this.prismaService.getClient();
  }

  async getStudentProgressOverview(userId: number): Promise<{
    completedCourses: CourseProgress[];
    quizScores: QuizScore[];
    examResults: ExamResult[];
    overallStats: OverallStats;
  }> {
    // Get course progress
    const courseProgressData = await this.prisma.courseProgress.findMany({
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

    const completedCourses: CourseProgress[] = courseProgressData.map(progress => {
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
        uniteName: progress.course.module.unite?.name ?? 'Unknown',
        layer1Completed: progress.layer1Completed,
        layer2Completed: progress.layer2Completed,
        layer3Completed: progress.layer3Completed,
        progressPercentage
      };
    });

    // Get quiz scores (practice sessions)
    const quizSessions = await this.prisma.quizSession.findMany({
      where: {
        userId,
        type: SessionType.PRACTICE,
        completedAt: { not: null }
      },
      orderBy: { completedAt: 'desc' },
      take: 20 // Last 20 quiz sessions
    });

    const quizScores: QuizScore[] = quizSessions.map(session => ({
      sessionId: session.id,
      title: session.title,
      type: session.type,
      score: session.score,
      percentage: session.percentage,
      completedAt: session.completedAt!
    }));

    // Get exam results
    const examSessions = await this.prisma.quizSession.findMany({
      where: {
        userId,
        type: SessionType.EXAM,
        completedAt: { not: null }
      },
      include: {
        exam: true
      },
      orderBy: { completedAt: 'desc' }
    });

    const examResults: ExamResult[] = examSessions.map(session => ({
      sessionId: session.id,
      examTitle: session.exam?.title || session.title,
      examYear: session.exam?.examYear.getFullYear().toString() || new Date().getFullYear().toString(),
      score: session.score,
      percentage: session.percentage,
      completedAt: session.completedAt!
    }));

    // Calculate overall stats
    const totalQuizzesTaken = quizScores.length;
    const averageQuizScore = totalQuizzesTaken > 0
      ? quizScores.reduce((sum, quiz) => sum + quiz.percentage, 0) / totalQuizzesTaken
      : 0;

    const totalExamsTaken = examResults.length;
    const averageExamScore = totalExamsTaken > 0
      ? examResults.reduce((sum, exam) => sum + exam.percentage, 0) / totalExamsTaken
      : 0;

    const coursesCompleted = completedCourses.filter(
      course => course.layer1Completed && course.layer2Completed && course.layer3Completed
    ).length;

    const coursesInProgress = completedCourses.filter(
      course => !course.layer1Completed || !course.layer2Completed || !course.layer3Completed
    ).length;

    const overallStats: OverallStats = {
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
  }

  async updateCourseProgress(
    userId: number,
    courseId: number,
    layer: 1 | 2 | 3,
    completed: boolean
  ): Promise<void> {
    const progressData: any = {};

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

    await this.prisma.courseProgress.upsert({
      where: {
        userId_courseId: {
          userId,
          courseId
        }
      },
      update: progressData,
      create: {
        userId,
        courseId,
        ...progressData
      }
    });
  }

  async getStudentQuizHistory(
    userId: number,
    type?: SessionType,
    limit: number = 10,
    offset: number = 0
  ): Promise<{
    sessions: any[];
    totalCount: number;
  }> {
    const whereConditions: any = {
      userId,
      completedAt: { not: null }
    };

    if (type) {
      whereConditions.type = type;
    }

    // Get total count for pagination
    const totalCount = await this.prisma.quizSession.count({
      where: whereConditions
    });

    // Get sessions with detailed information
    const sessions = await this.prisma.quizSession.findMany({
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
        startedAt: session.startedAt?.toISOString() || null,
        completedAt: session.completedAt?.toISOString() || null
      };
    });

    return {
      sessions: detailedSessions,
      totalCount
    };
  }

  async getStudentQuizAnalytics(
    userId: number,
    type?: SessionType
  ): Promise<{
    totalSessions: number;
    averageScore: number;
    bestScore: number;
    worstScore: number;
    averageTimePerSession: number;
  }> {
    const whereConditions: any = {
      userId,
      completedAt: { not: null }
    };

    if (type) {
      whereConditions.type = type;
    }

    const sessions = await this.prisma.quizSession.findMany({
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
      .map(s => Math.round((new Date(s.completedAt!).getTime() - new Date(s.startedAt!).getTime()) / (1000 * 60)));

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
  }

  /**
   * Get detailed question results for student with filtering options
   */
  async getStudentQuestionResults(
    userId: number,
    filters: StudentSessionResultsFilters,
    page: number = 1,
    limit: number = 20
  ): Promise<{ questions: any[], total: number }> {
    const offset = (page - 1) * limit;

    // Build session where conditions
    const sessionWhereConditions: any = {
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
    let attemptWhereConditions: any = {};
    if (filters.answerType === 'correct') {
      attemptWhereConditions.isCorrect = true;
    } else if (filters.answerType === 'incorrect') {
      attemptWhereConditions.isCorrect = false;
    }
    // For 'all', we don't add any isCorrect filter

    // First, get all matching quiz attempts with related data
    const attempts = await this.prisma.quizAttempt.findMany({
      where: {
        ...attemptWhereConditions,
        session: sessionWhereConditions
      },
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
    const total = await this.prisma.quizAttempt.count({
      where: {
        ...attemptWhereConditions,
        session: sessionWhereConditions
      }
    });

    return { questions: attempts, total };
  }

  /**
   * Get student session results summary
   */
  async getStudentSessionResultsSummary(
    userId: number,
    filters: StudentSessionResultsFilters
  ): Promise<{
    totalQuestions: number;
    correctAnswers: number;
    incorrectAnswers: number;
    unansweredQuestions: number;
    sessionsIncluded: number;
  }> {
    // Build session where conditions (same as above)
    const sessionWhereConditions: any = {
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
    const [totalQuestions, correctAnswers, incorrectAnswers, unansweredQuestions, sessionsIncluded] = await Promise.all([
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
  }

  /**
   * Get list of available sessions for filtering dropdown
   */
  async getStudentAvailableSessions(
    userId: number,
    sessionType?: SessionType
  ): Promise<{
    id: number;
    title: string;
    type: SessionType;
    completedAt: Date | null;
    score: number;
    percentage: number;
    questionsCount: number;
  }[]> {
    const whereConditions: any = {
      userId,
      completedAt: { not: null }
    };

    if (sessionType) {
      whereConditions.type = sessionType;
    }

    const sessions = await this.prisma.quizSession.findMany({
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
      questionsCount: (session as any)._count.sessionQuestions
    }));
  }

  async getStudentPerformanceAnalytics(userId: number): Promise<{
    weeklyProgress: Array<{
      week: string;
      quizzesCompleted: number;
      averageScore: number;
    }>;
    subjectPerformance: Array<{
      subject: string;
      totalQuestions: number;
      correctAnswers: number;
      accuracy: number;
    }>;
    recentActivity: Array<{
      date: Date;
      activity: string;
      score?: number;
    }>;
  }> {
    // Get weekly progress for the last 8 weeks
    const eightWeeksAgo = new Date();
    eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56);

    const recentSessions = await this.prisma.quizSession.findMany({
      where: {
        userId,
        completedAt: {
          gte: eightWeeksAgo
        }
      },
      orderBy: { completedAt: 'desc' }
    });

    // Group by week
    const weeklyData = new Map<string, { count: number; totalScore: number }>();

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
    const subjectPerformance: Array<{
      subject: string;
      totalQuestions: number;
      correctAnswers: number;
      accuracy: number;
    }> = [];

    // Get recent activity
    const recentActivitySessions = await this.prisma.quizSession.findMany({
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
  }

  // ==========================================
  // STUDY CONTENT ACCESS & NAVIGATION
  // ==========================================

  /**
   * Get content filters with hierarchical structure (unites and independent modules)
   * For GET /students/content/filters
   */
  async getContentFilters(studyPackIds: number[], yearLevel?: string): Promise<{
    unites: any[];
    independentModules: any[];
  }> {
    // Build where clause: always filter by accessible study packs,
    // and optionally narrow down by yearLevel (maps to studyPack.yearNumber)
    const uniteWhere: any = {
      studyPackId: { in: studyPackIds }
    };
    if (yearLevel) {
      uniteWhere.studyPack = { yearNumber: yearLevel };
    }

    // Get unites filtered by accessible study packs (and optionally yearLevel)
    const unites = await this.prisma.unite.findMany({
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
    const independentModulesWhere: any = { uniteId: null };

    // Determine which yearNumbers to filter by
    let effectiveYearNumbers: string[] = [];
    if (yearLevel) {
      effectiveYearNumbers = [yearLevel];
    } else if (studyPackIds.length > 0) {
      const packs = await this.prisma.studyPack.findMany({
        where: { id: { in: studyPackIds } },
        select: { yearNumber: true }
      });
      effectiveYearNumbers = packs.map((p: any) => p.yearNumber).filter(Boolean);
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

    const independentModulesRaw = await this.prisma.module.findMany({
      where: independentModulesWhere as any,
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
      independentModules: independentModulesRaw.map((module: any) => ({
        id: module.id,
        name: module.name,
        imagePath: module.imagePath,
        courses: module.courses
      }))
    };
  }

  /**
   * Get independent resources with hierarchical structure
   * For GET /students/content/independent-resources
   */
  async getIndependentResources(studyPackIds: number[], yearLevel?: string): Promise<{
    independentModules: any[];
  }> {
    const independentModulesWhere: any = { uniteId: null };

    // Determine which yearNumbers to filter by
    let effectiveYearNumbers: string[] = [];
    if (yearLevel) {
      effectiveYearNumbers = [yearLevel];
    } else if (studyPackIds.length > 0) {
      const packs = await this.prisma.studyPack.findMany({
        where: { id: { in: studyPackIds } },
        select: { yearNumber: true }
      });
      effectiveYearNumbers = packs.map((p: any) => p.yearNumber).filter(Boolean);
    }

    if (effectiveYearNumbers.length > 0) {
      independentModulesWhere.exams = {
        some: {
          yearLevel: { in: effectiveYearNumbers }
        }
      };
    }

    const independentModulesRaw = await this.prisma.module.findMany({
      where: independentModulesWhere as any,
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
      independentModules: independentModulesRaw.map((module: any) => ({
        id: module.id,
        name: module.name,
        imagePath: module.imagePath,
        subModules: module.subModules.map((sm: any) => ({
          id: sm.id,
          name: sm.name,
          courses: sm.courses,
          books: sm.books.map((b: any) => ({
            id: b.id,
            name: b.name,
            coverPath: b.coverPath,
            viewUrl: b.viewUrl
          }))
        })),
        books: module.books.map((b: any) => ({
          id: b.id,
          name: b.name,
          coverPath: b.coverPath,
          viewUrl: b.viewUrl
        })),
        courses: module.courses
      }))
    };
  }

  /**
   * Get study packs with pagination
   * For GET /study-packs
   */
  async getStudyPacksPaginated(page: number, limit: number, search?: string): Promise<{
    studyPacks: any[];
    total: number;
  }> {
    const whereConditions: any = {
      isActive: true
    };

    if (search) {
      whereConditions.OR = [
        { name: { contains: search } },
        { description: { contains: search } }
      ];
    }

    const [studyPacks, total] = await Promise.all([
      this.prisma.studyPack.findMany({
        where: whereConditions,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' }
      }),
      this.prisma.studyPack.count({ where: whereConditions })
    ]);

    return { studyPacks, total };
  }

  // Legacy method kept for backward compatibility
  async getStudyPacks(yearLevel?: number): Promise<any[]> {
    const whereConditions: any = {
      isActive: true
    };

    if (yearLevel) {
      whereConditions.yearNumber = yearLevel;
    }

    return await this.prisma.studyPack.findMany({
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
  }

  async getStudyPackById(packId: number): Promise<any> {
    return await this.prisma.studyPack.findUnique({
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
  }

  /**
   * Get course resources with pagination
   * For GET /courses/:courseId/resources
   */
  async getCourseResourcesPaginated(courseId: number, page: number, limit: number, type?: string): Promise<{
    resources: any[];
    total: number;
  }> {
    const whereConditions: any = { courseId };
    if (type) {
      whereConditions.type = type;
    }

    const [resources, total] = await Promise.all([
      this.prisma.courseResource.findMany({
        where: whereConditions,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'asc' }
      }),
      this.prisma.courseResource.count({ where: whereConditions })
    ]);

    return { resources, total };
  }

  // Legacy method kept for backward compatibility
  async getCourseResources(courseId: number): Promise<any[]> {
    return await this.prisma.courseResource.findMany({
      where: { courseId },
      orderBy: {
        createdAt: 'asc'
      }
    });
  }

  /**
   * Get courses by moduleId or uniteId
   * For GET /students/courses/by-module
   */
  async getCoursesByModuleOrUnite(moduleId?: number, uniteId?: number): Promise<any[]> {
    const whereConditions: any = {};

    if (moduleId) {
      whereConditions.moduleId = moduleId;
    } else if (uniteId) {
      whereConditions.module = {
        uniteId: uniteId
      };
    }

    return await this.prisma.course.findMany({
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
  }

  // ==========================================
  // SUBSCRIPTION MANAGEMENT
  // ==========================================

  async getUserSubscriptions(userId: number): Promise<any[]> {
    return await this.prisma.subscription.findMany({
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
  }

  // ==========================================
  // STUDENT NOTES SYSTEM
  // ==========================================

  // Canonical: GET /students/notes - flat array with labels, search, and labelIds filtering
  async getStudentNotesCanonical(
    userId: number,
    options?: {
      search?: string;
      questionId?: number;
      quizId?: number;
      labelIds?: number[];
    }
  ): Promise<any[]> {
    const whereConditions: any = { userId };

    if (options?.questionId) {
      whereConditions.questionId = options.questionId;
    }
    if (options?.quizId) {
      whereConditions.quizId = options.quizId;
    }
    if (options?.search) {
      whereConditions.noteText = {
        contains: options.search
      };
    }
    if (options?.labelIds && options.labelIds.length > 0) {
      whereConditions.noteLabels = {
        some: {
          labelId: { in: options.labelIds }
        }
      };
    }

    return await this.prisma.studentNote.findMany({
      where: whereConditions,
      include: {
        noteLabels: {
          // Only the caller's own labels
          where: { userId },
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
  }

  // Legacy method - kept for backward compatibility
  async getStudentNotes(userId: number, questionId?: number, quizId?: number): Promise<any[]> {
    const whereConditions: any = { userId };

    if (questionId) {
      whereConditions.questionId = questionId;
    }
    if (quizId) {
      whereConditions.quizId = quizId;
    }

    return await this.prisma.studentNote.findMany({
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
  }

  async questionExists(questionId: number): Promise<boolean> {
    const question = await this.prisma.question.findUnique({
      where: { id: questionId },
      select: { id: true }
    });
    return question !== null;
  }

  /**
   * Where a question sits in the content tree, for access checks.
   * Returns null when the question does not exist.
   */
  async getQuestionLocation(questionId: number): Promise<{ hasCourse: boolean; studyPackId: number | null } | null> {
    const question = await this.prisma.question.findUnique({
      where: { id: questionId },
      select: {
        courseId: true,
        course: { select: { module: { select: { unite: { select: { studyPackId: true } } } } } }
      }
    });
    if (!question) {
      return null;
    }
    return {
      hasCourse: question.courseId !== null,
      studyPackId: question.course?.module?.unite?.studyPackId ?? null
    };
  }

  /**
   * Study pack that a course / module / unite belongs to, for access checks.
   * Returns null when the entity does not exist, and { studyPackId: null } for
   * independent modules (no unite).
   */
  async getCourseStudyPack(courseId: number): Promise<{ studyPackId: number | null } | null> {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { module: { select: { unite: { select: { studyPackId: true } } } } }
    });
    if (!course) {
      return null;
    }
    return { studyPackId: course.module?.unite?.studyPackId ?? null };
  }

  async getModuleStudyPack(moduleId: number): Promise<{ studyPackId: number | null } | null> {
    const module = await this.prisma.module.findUnique({
      where: { id: moduleId },
      select: { unite: { select: { studyPackId: true } } }
    });
    if (!module) {
      return null;
    }
    return { studyPackId: module.unite?.studyPackId ?? null };
  }

  async getUniteStudyPack(uniteId: number): Promise<{ studyPackId: number | null } | null> {
    const unite = await this.prisma.unite.findUnique({
      where: { id: uniteId },
      select: { studyPackId: true }
    });
    if (!unite) {
      return null;
    }
    return { studyPackId: unite.studyPackId };
  }

  async countLabelsOwnedByUser(labelIds: number[], userId: number): Promise<number> {
    return await this.prisma.studentLabel.count({
      where: { id: { in: labelIds }, userId }
    });
  }

  async quizExists(quizId: number): Promise<boolean> {
    const quiz = await this.prisma.quiz.findUnique({
      where: { id: quizId },
      select: { id: true }
    });
    return quiz !== null;
  }

  async labelExistsForUser(labelId: number, userId: number): Promise<boolean> {
    const label = await this.prisma.studentLabel.findUnique({
      where: {
        id: labelId,
        userId: userId
      },
      select: { id: true }
    });
    return label !== null;
  }

  async courseExists(courseId: number): Promise<boolean> {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true }
    });
    return course !== null;
  }

  async quizSessionExists(quizSessionId: number): Promise<boolean> {
    const quizSession = await this.prisma.quizSession.findUnique({
      where: { id: quizSessionId },
      select: { id: true }
    });
    return quizSession !== null;
  }

  async createStudentNote(userId: number, noteText: string, questionId?: number, quizId?: number): Promise<any> {
    return await this.prisma.studentNote.create({
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
  }

  async updateStudentNote(noteId: number, userId: number, noteText: string): Promise<any> {
    return await this.prisma.studentNote.update({
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
  }

  async deleteStudentNote(noteId: number, userId: number): Promise<void> {
    await this.prisma.studentNote.delete({
      where: {
        id: noteId,
        userId: userId
      }
    });
  }

  async getQuestionNotes(questionId: number, userId: number): Promise<any[]> {
    return await this.prisma.studentNote.findMany({
      where: {
        questionId,
        userId
      },
      orderBy: {
        updatedAt: 'desc'
      }
    });
  }

  // ==========================================
  // STUDENT NOTES - CANONICAL API
  // ==========================================

  // GET /students/questions/:questionId/notes - Canonical: returns with labels
  async getQuestionNotesCanonical(questionId: number, userId: number): Promise<any[]> {
    return await this.prisma.studentNote.findMany({
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
  }

  // GET /students/notes/by-module - Canonical: grouped notes
  async getNotesByModuleCanonical(
    userId: number,
    moduleId?: number,
    uniteId?: number
  ): Promise<any> {
    // Get filter info first
    let filterInfo: any = {
      uniteId: uniteId || null,
      moduleId: moduleId || null,
      uniteName: null,
      moduleName: null
    };

    if (uniteId) {
      const unite = await this.prisma.unite.findUnique({
        where: { id: uniteId },
        select: { id: true, name: true }
      });
      if (!unite) {
        throw new Error(`Unite with ID ${uniteId} not found`);
      }
      filterInfo.uniteName = unite.name;
    }

    if (moduleId) {
      const module = await this.prisma.module.findUnique({
        where: { id: moduleId },
        select: { id: true, name: true }
      });
      if (!module) {
        throw new Error(`Module with ID ${moduleId} not found`);
      }
      filterInfo.moduleName = module.name;
    }

    // Get notes - filter by module or unite through question->course->module->unite chain
    let courseIds: number[] = [];

    if (moduleId) {
      const courses = await this.prisma.course.findMany({
        where: { moduleId },
        select: { id: true }
      });
      courseIds = courses.map(c => c.id);
    } else if (uniteId) {
      const courses = await this.prisma.course.findMany({
        where: {
          module: { uniteId }
        },
        select: { id: true }
      });
      courseIds = courses.map(c => c.id);
    }

    // Get notes for questions in these courses
    const notes = await this.prisma.studentNote.findMany({
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
    const courseGroupsMap: Map<number, any> = new Map();
    const ungroupedNotes: any[] = [];

    for (const note of notes) {
      const formattedNote = {
        id: note.id,
        noteText: note.noteText,
        questionId: note.questionId,
        labels: note.noteLabels.map((nl: any) => ({
          id: nl.label.id,
          name: nl.label.name
        })),
        createdAt: note.createdAt
      };

      if (note.question?.course) {
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
      } else {
        ungroupedNotes.push(formattedNote);
      }
    }

    return {
      filterInfo,
      courseGroups: Array.from(courseGroupsMap.values()),
      ungroupedNotes,
      totalNotes: notes.length
    };
  }

  // POST /students/notes - Canonical: create with labels
  async createStudentNoteCanonical(
    userId: number,
    noteText: string,
    questionId?: number,
    quizId?: number,
    labelIds?: number[]
  ): Promise<any> {
    // Create the note
    const note = await this.prisma.studentNote.create({
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
        await this.prisma.noteLabel.upsert({
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
    return await this.prisma.studentNote.findUnique({
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
  }

  // PUT /students/notes/:noteId - Canonical: update with labels
  async updateStudentNoteCanonical(
    noteId: number,
    userId: number,
    noteText?: string,
    labelIds?: number[]
  ): Promise<any> {
    // The note must belong to the caller before anything is read or changed
    const owned = await this.prisma.studentNote.findFirst({
      where: { id: noteId, userId },
      select: { id: true }
    });
    if (!owned) {
      throw new NotFoundError('Note');
    }

    // Update note text if provided
    if (noteText !== undefined) {
      await this.prisma.studentNote.update({
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
      await this.prisma.noteLabel.deleteMany({
        where: {
          noteId,
          userId
        }
      });

      // Add new labels
      if (labelIds.length > 0) {
        for (const labelId of labelIds) {
          await this.prisma.noteLabel.upsert({
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
    return await this.prisma.studentNote.findFirst({
      where: { id: noteId, userId },
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
  }

  // ==========================================
  // LABELING SYSTEM
  // ==========================================

  async getStudentLabels(userId: number): Promise<any[]> {
    return await this.prisma.studentLabel.findMany({
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
  }

  async getStudentLabelsWithSessionIds(userId: number): Promise<any[]> {
    return await this.prisma.studentLabel.findMany({
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
  }

  async getStudentLabelsWithQuestionIds(userId: number): Promise<any[]> {
    return await this.prisma.studentLabel.findMany({
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
  }

  async getStudentLabelByIdWithSessionIds(labelId: number, userId: number): Promise<any | null> {
    return await this.prisma.studentLabel.findUnique({
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
  }

  async getStudentLabelByIdWithQuestionIds(labelId: number, userId: number): Promise<any | null> {
    return await this.prisma.studentLabel.findUnique({
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
  }

  async createStudentLabel(userId: number, name: string): Promise<any> {
    return await this.prisma.studentLabel.create({
      data: {
        userId,
        name
      }
    });
  }

  async updateStudentLabel(labelId: number, userId: number, name: string): Promise<any> {
    return await this.prisma.studentLabel.update({
      where: {
        id: labelId,
        userId: userId
      },
      data: {
        name
      }
    });
  }

  async deleteStudentLabel(labelId: number, userId: number): Promise<void> {
    await this.prisma.studentLabel.delete({
      where: {
        id: labelId,
        userId: userId
      }
    });
  }

  // Canonical: GET /students/labels/by-module - returns labels with questions from specific module/unite
  async getLabelsByModuleCanonical(
    userId: number,
    moduleId?: number,
    uniteId?: number
  ): Promise<any[]> {
    // Get all labels for the user that have questions from the specified module/unite
    const labels = await this.prisma.studentLabel.findMany({
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
      questionIds: label.questionLabels.map((ql: any) => ql.questionId),
      questions: label.questionLabels.map((ql: any) => ({
        id: ql.question.id,
        questionText: ql.question.questionText,
        course: ql.question.course ? {
          id: ql.question.course.id,
          name: ql.question.course.name
        } : null
      }))
    }));
  }

  async addQuizToLabel(userId: number, quizId: number, labelId: number): Promise<any> {
    return await this.prisma.quizLabel.create({
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
  }

  async getQuizLabel(userId: number, quizId: number, labelId: number): Promise<any> {
    return await this.prisma.quizLabel.findFirst({
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
  }

  async removeQuizFromLabel(userId: number, quizId: number, labelId: number): Promise<void> {
    await this.prisma.quizLabel.deleteMany({
      where: {
        AND: [
          { userId },
          { quizId },
          { labelId }
        ]
      }
    });
  }

  async addQuestionToLabel(userId: number, questionId: number, labelId: number): Promise<any> {
    return await this.prisma.questionLabel.create({
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
  }

  async removeQuestionFromLabel(userId: number, questionId: number, labelId: number): Promise<void> {
    await this.prisma.questionLabel.deleteMany({
      where: {
        AND: [
          { userId },
          { questionId },
          { labelId }
        ]
      }
    });
  }

  async getQuestionLabel(userId: number, questionId: number, labelId: number): Promise<any> {
    return await this.prisma.questionLabel.findFirst({
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
  }

  async addQuizSessionToLabel(userId: number, quizSessionId: number, labelId: number): Promise<any> {
    return await this.prisma.quizSessionLabel.create({
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
  }

  async getQuizSessionLabel(userId: number, quizSessionId: number, labelId: number): Promise<any> {
    return await this.prisma.quizSessionLabel.findFirst({
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
  }

  async removeQuizSessionFromLabel(userId: number, quizSessionId: number, labelId: number): Promise<void> {
    await this.prisma.quizSessionLabel.deleteMany({
      where: {
        AND: [
          { userId },
          { quizSessionId },
          { labelId }
        ]
      }
    });
  }

  // ==========================================
  // TODO MANAGEMENT SYSTEM
  // ==========================================

  async getTodos(
    userId: number,
    status?: string,
    type?: string,
    priority?: string,
    limit: number = 20,
    offset: number = 0,
    includeCompleted: boolean = false
  ): Promise<any[]> {
    const whereConditions: any = { userId };

    if (status) {
      whereConditions.status = status;
    } else if (!includeCompleted) {
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

    return await this.prisma.todoItem.findMany({
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
  }

  async createTodo(
    userId: number,
    title: string,
    description?: string,
    type?: string,
    priority?: string,
    dueDate?: Date,
    courseId?: number,
    quizId?: number
  ): Promise<any> {
    return await this.prisma.todoItem.create({
      data: {
        userId,
        title,
        description,
        type: (type || 'OTHER') as any,
        priority: (priority || 'MEDIUM') as any,
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
  }

  async updateTodo(
    todoId: number,
    userId: number,
    updateData: {
      title?: string;
      description?: string;
      priority?: string;
      dueDate?: Date;
      status?: string;
    }
  ): Promise<any> {
    const data: any = {};

    if (updateData.title !== undefined) data.title = updateData.title;
    if (updateData.description !== undefined) data.description = updateData.description;
    if (updateData.priority !== undefined) data.priority = updateData.priority;
    if (updateData.dueDate !== undefined) data.dueDate = updateData.dueDate;
    if (updateData.status !== undefined) data.status = updateData.status;

    return await this.prisma.todoItem.update({
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
  }

  async deleteTodo(todoId: number, userId: number): Promise<void> {
    await this.prisma.todoItem.delete({
      where: {
        id: todoId,
        userId: userId
      }
    });
  }

  async completeTodo(todoId: number, userId: number): Promise<any> {
    return await this.prisma.todoItem.update({
      where: {
        id: todoId,
        userId: userId
      },
      data: {
        status: 'COMPLETED',
        completedAt: new Date()
      }
    });
  }

  // ==========================================
  // QUESTION REPORTING SYSTEM
  // ==========================================

  async createQuestionReport(
    userId: number,
    questionId: number,
    reportType: string,
    description?: string
  ): Promise<any> {
    return await this.prisma.questionReport.create({
      data: {
        userId,
        questionId,
        reportType: reportType as any,
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
  }

  async getUserReports(userId: number): Promise<any[]> {
    return await this.prisma.questionReport.findMany({
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
  }

  async getReportById(reportId: number, userId: number): Promise<any> {
    return await this.prisma.questionReport.findFirst({
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
  }

  // ==========================================
  // PERFORMANCE ANALYTICS
  // ==========================================

  async getDetailedPerformanceAnalytics(userId: number): Promise<any> {
    // Get quiz sessions for performance tracking
    const quizSessions = await this.prisma.quizSession.findMany({
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
    const examSessions = await this.prisma.quizSession.findMany({
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
    const studyStreak = await this.calculateStudyStreak(userId);

    // Get weekly study stats
    const weeklyStats = await this.getWeeklyStudyStats(userId);

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
  }

  private calculateImprovementTrend(sessions: any[]): number {
    if (sessions.length < 2) return 0;

    const recent = sessions.slice(0, 5);
    const previous = sessions.slice(5, 10);

    if (previous.length === 0) return 0;

    const recentAvg = recent.reduce((sum, s) => sum + s.percentage, 0) / recent.length;
    const previousAvg = previous.reduce((sum, s) => sum + s.percentage, 0) / previous.length;

    return recentAvg - previousAvg;
  }

  private async calculateStudyStreak(userId: number): Promise<number> {
    const sessions = await this.prisma.quizSession.findMany({
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

    if (sessions.length === 0) return 0;

    let streak = 0;
    let currentDate = new Date();
    currentDate.setHours(0, 0, 0, 0);

    for (const session of sessions) {
      const sessionDate = new Date(session.completedAt!);
      sessionDate.setHours(0, 0, 0, 0);

      const dayDiff = Math.floor((currentDate.getTime() - sessionDate.getTime()) / (1000 * 60 * 60 * 24));

      if (dayDiff === streak) {
        streak++;
      } else if (dayDiff === streak + 1) {
        // Allow for one day gap
        streak++;
        currentDate = sessionDate;
      } else {
        break;
      }
    }

    return streak;
  }

  private async getWeeklyStudyStats(userId: number): Promise<any[]> {
    const fourWeeksAgo = new Date();
    fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);

    const sessions = await this.prisma.quizSession.findMany({
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
    const weeklyStats: any[] = [];
    const weeks = ['Week 1', 'Week 2', 'Week 3', 'Week 4'];

    for (let i = 0; i < 4; i++) {
      const weekStart = new Date(fourWeeksAgo);
      weekStart.setDate(weekStart.getDate() + (i * 7));
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);

      const weekSessions = sessions.filter(session => {
        const sessionDate = new Date(session.completedAt!);
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
  }

  /**
   * Get comprehensive session statistics for the user
   * Extracts and analyzes statistical data similar to the session statistics interface
   */
  async getSessionStatistics(userId: number): Promise<{
    sessions: Array<{
      id: number;
      sessionTitle: string;
      sessionType: string;
      sessionDuration: string;
      averageTimePerQuestion: string;
      totalQuestions: number;
      correctAnswers: number;
      wrongAnswers: number;
      consultedQuestions: number;
      accuracy: number;
      completedAt: Date | null;
      course?: string;
    }>;
    summary: {
      totalSessions: number;
      totalQuestions: number;
      totalCorrectAnswers: number;
      totalWrongAnswers: number;
      overallAccuracy: number;
      averageSessionDuration: string;
      averageTimePerQuestion: string;
    };
  }> {
    // Get all completed sessions with detailed information
    const sessions = await this.prisma.quizSession.findMany({
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
        course: session.quiz?.course?.name
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
  }

  /**
   * Get course analytics for student quiz sessions
   */
  async getCourseAnalytics(
    userId: number,
    sessionId?: number,
    sessionType?: SessionType,
    limit: number = 20,
    offset: number = 0
  ): Promise<{
    session: {
      id: number;
      title: string;
      type: SessionType;
      status: string;
      completedAt: string | null;
      totalQuestions: number;
      correctAnswers: number;
      incorrectAnswers: number;
      percentage: number;
      timeSpent: number;
      averageTimePerQuestion: number;
      courses: Array<{
        id: number;
        name: string;
        description: string | null;
        moduleId: number;
        moduleName: string;
        courseAnalytics: {
          totalQuestions: number;
          totalCorrectAnswers: number;
          totalIncorrectAnswers: number;
          overallAccuracy: number;
        };
      }>;
    };
    totalCount: number;
  }> {
    // Build where conditions
    const whereConditions: any = {
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
    const totalCount = await this.prisma.quizSession.count({
      where: whereConditions
    });



    // Get the session with detailed information
    const sessions = await this.prisma.quizSession.findMany({
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
      const question = sessionQuestion.question;
      const course = question.course;

      if (course) {
        if (!courseMap.has(course.id)) {
          courseMap.set(course.id, {
            id: course.id,
            name: course.name,
            description: course.description,
            moduleId: course.moduleId,
            moduleName: course.module?.name || 'Unknown Module',
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
      const totalCorrectAnswers = courseData.attempts.filter((attempt: any) => attempt.isCorrect === true).length;
      const totalIncorrectAnswers = courseData.attempts.filter((attempt: any) => attempt.isCorrect === false).length;
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
        completedAt: session.completedAt?.toISOString() || null,
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
  }

  /**
   * Format duration in seconds to HH:MM:SS format
   */
  private formatDuration(seconds: number): string {
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
  async getSessionsFiltersCanonical(
    userId: number,
    sessionType: 'PRACTICE' | 'EXAM',
    studyPackIds?: number[],
    yearLevel?: string
  ): Promise<{
    unites: Array<{
      id: number;
      name: string;
      sessionsCount: number;
      modules: Array<{
        id: number;
        name: string;
        sessionsCount: number;
        courses: Array<{ id: number; name: string; description: string | null }>;
      }>;
    }>;
    independentModules: Array<{
      id: number;
      name: string;
      sessionsCount: number;
      courses: Array<{ id: number; name: string; description: string | null }>;
    }>;
  }> {
    // Build where clause for unites: filter by studyPackIds if provided
    const uniteWhere: any = {};
    if (studyPackIds && studyPackIds.length > 0) {
      uniteWhere.studyPackId = { in: studyPackIds };
    }
    if (yearLevel) {
      uniteWhere.studyPack = { yearNumber: yearLevel };
    }

    // Get unites filtered by accessible study packs (and optionally yearLevel)
    const unites = await this.prisma.unite.findMany({
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
    const independentModulesWhere: any = { uniteId: null };

    // Determine which yearNumbers to filter by
    let effectiveYearNumbers: string[] = [];
    if (yearLevel) {
      effectiveYearNumbers = [yearLevel];
    } else if (studyPackIds && studyPackIds.length > 0) {
      const packs = await this.prisma.studyPack.findMany({
        where: { id: { in: studyPackIds } },
        select: { yearNumber: true }
      });
      effectiveYearNumbers = packs.map((p: any) => p.yearNumber).filter(Boolean);
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

    const independentModulesRaw = await this.prisma.module.findMany({
      where: independentModulesWhere as any,
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
    const sessionsWithModules = await this.prisma.quizSession.findMany({
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
    const moduleSessionCounts: Record<number, number> = {};
    for (const session of sessionsWithModules) {
      const moduleIds = new Set<number>();
      for (const sq of session.sessionQuestions) {
        if (sq.question?.course?.moduleId) {
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
      independentModules: independentModulesRaw.map((module: any) => ({
        id: module.id,
        name: module.name,
        sessionsCount: moduleSessionCounts[module.id] || 0,
        courses: module.courses.map((course: any) => ({
          id: course.id,
          name: course.name,
          description: course.description
        }))
      }))
    };
  }

  /**
   * GET /students/practise-sessions - Canonical spec
   * Returns practice sessions with pagination
   */
  async getPractiseSessionsCanonical(
    userId: number,
    sessionType: 'PRACTICE' | 'EXAM',
    options: {
      moduleId?: number;
      uniteId?: number;
      page: number;
      limit: number;
    }
  ): Promise<{
    items: Array<{
      id: number;
      title: string;
      status: string;
      type: string;
      createdAt: string;
      completedAt: string | null;
      score: number | null;
    }>;
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const { moduleId, uniteId, page, limit } = options;

    // Build where clause
    const whereClause: any = {
      userId,
      type: sessionType === 'PRACTICE' ? 'PRACTICE' : 'EXAM'
    };

    // If moduleId or uniteId is provided, filter sessions
    let sessionIds: number[] | undefined;

    if (moduleId || uniteId) {
      const sessionsWithFilters = await this.prisma.quizSession.findMany({
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
            const course = sq.question?.course;
            if (!course) return false;
            if (moduleId) return course.moduleId === moduleId;
            if (uniteId) return course.module?.uniteId === uniteId;
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
    const total = await this.prisma.quizSession.count({ where: whereClause });

    // Get paginated sessions
    const sessions = await this.prisma.quizSession.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit
    });

    // Calculate scores for each session
    const items = await Promise.all(sessions.map(async (session) => {
      // Get attempts for this session to calculate score
      const attempts = await this.prisma.quizAttempt.findMany({
        where: { sessionId: session.id }
      });

      let score: number | null = null;
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
        completedAt: session.completedAt?.toISOString() || null,
        score
      };
    }));

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  /**
   * GET /students/sessions/residency-filters - Canonical spec
   * Returns: { universities: [{id, name, examYears, parts}], parts: ['PART_1', 'PART_2', ...], totalQuestions }
   */
  async getResidencyFiltersCanonical(userId: number): Promise<{
    universities: Array<{
      id: number;
      name: string;
      examYears: number[];
      parts: string[];
    }>;
    parts: string[];
    totalQuestions: number;
  }> {
    // Get all universities with their questions and exam years
    const universities = await this.prisma.university.findMany({
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

    const allParts = new Set<string>();

    // Process universities with unique exam years
    const universitiesWithYears = universities
      .map(uni => {
        const examYears = [...new Set(uni.questions.map(q => q.examYear).filter((y): y is number => y !== null))];
        const uniParts = new Set<string>();

        uni.questions.forEach(q => {
          if (q.metadata) {
            try {
              const meta = JSON.parse(q.metadata);
              if (meta.part) {
                uniParts.add(meta.part);
                allParts.add(meta.part);
              }
            } catch (e) {
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
    const totalQuestions = await this.prisma.question.count({
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
  }

  // ==========================================
  // CANONICAL SPEC ENDPOINTS - Course Layers & Cards
  // ==========================================

  /**
   * POST /students/course-layers - Canonical spec
   * Upsert course layer completion status
   */
  async upsertCourseLayerCanonical(
    userId: number,
    courseId: number,
    layerNumber: number,
    completed: boolean
  ): Promise<{
    courseId: number;
    layerNumber: number;
    completed: boolean;
    updatedAt: string;
  }> {
    const layer = await this.prisma.courseLayer.upsert({
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
  }

  /**
   * GET /students/courses/:courseId/layers - Canonical spec
   * Get all layer completion statuses for a course
   */
  async getCourseLayersCanonical(
    userId: number,
    courseId: number
  ): Promise<{
    courseId: number;
    layers: Array<{ layerNumber: number; completed: boolean }>;
  }> {
    const layers = await this.prisma.courseLayer.findMany({
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
  }

  /**
   * Check if course exists
   */
  async courseExistsByCourseId(courseId: number): Promise<boolean> {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId }
    });
    return !!course;
  }

  /**
   * POST /students/cards - Canonical spec
   * Create a study card with optional courses
   */
  async createCardCanonical(
    userId: number,
    title: string,
    description?: string,
    courseIds?: number[]
  ): Promise<{
    id: number;
    title: string;
    description: string | null;
    courseIds: number[];
    createdAt: string;
  }> {
    const card = await this.prisma.studentCard.create({
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
  }

  /**
   * GET /students/cards - Canonical spec
   * Get all cards for the authenticated user
   */
  async getAllCardsCanonical(userId: number): Promise<Array<{
    id: number;
    title: string;
    description: string | null;
    courseIds: number[];
    createdAt: string;
  }>> {
    const cards = await this.prisma.studentCard.findMany({
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
  }

  /**
   * GET /students/cards/filter-by-unit-module - Canonical spec
   * Get cards filtered by uniteId or moduleId
   */
  async getCardsByUnitModuleCanonical(
    userId: number,
    uniteId?: number,
    moduleId?: number
  ): Promise<Array<{
    id: number;
    title: string;
    description: string | null;
    courseIds: number[];
    createdAt: string;
  }>> {
    // Build course filter based on uniteId or moduleId
    let courseFilter: { module?: { uniteId: number } | { id: number } } = {};

    if (moduleId) {
      courseFilter = { module: { id: moduleId } };
    } else if (uniteId) {
      courseFilter = { module: { uniteId } };
    }

    // Get cards that have courses matching the filter
    const cards = await this.prisma.studentCard.findMany({
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
  }

  /**
   * GET /students/cards/:cardId - Canonical spec
   * Get card by ID with full course details
   */
  async getCardByIdCanonical(
    userId: number,
    cardId: number
  ): Promise<{
    id: number;
    title: string;
    description: string | null;
    courses: Array<{ id: number; name: string; description: string | null }>;
    createdAt: string;
  } | null> {
    const card = await this.prisma.studentCard.findFirst({
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

    if (!card) return null;

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
  }

  /**
   * PUT /students/cards/:cardId - Canonical spec
   * Update card title and/or description
   */
  async updateCardCanonical(
    userId: number,
    cardId: number,
    data: { title?: string; description?: string }
  ): Promise<{
    id: number;
    title: string;
    description: string | null;
    courseIds: number[];
    createdAt: string;
    updatedAt: string;
  } | null> {
    // First check ownership
    const existing = await this.prisma.studentCard.findFirst({
      where: { id: cardId, userId }
    });

    if (!existing) return null;

    const updated = await this.prisma.studentCard.update({
      where: { id: cardId },
      data: {
        title: data.title ?? existing.title,
        description: data.description ?? existing.description
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
  }

  /**
   * DELETE /students/cards/:cardId - Canonical spec
   * Delete a card (ownership checked)
   */
  async deleteCardCanonical(userId: number, cardId: number): Promise<boolean> {
    // Check ownership first
    const card = await this.prisma.studentCard.findFirst({
      where: { id: cardId, userId }
    });

    if (!card) return false;

    await this.prisma.studentCard.delete({
      where: { id: cardId }
    });

    return true;
  }

  /**
   * POST /students/cards/:cardId/courses/:courseId - Canonical spec
   * Add a course to a card
   */
  async addCourseToCardCanonical(
    userId: number,
    cardId: number,
    courseId: number
  ): Promise<{ success: boolean; alreadyExists?: boolean }> {
    // Check card ownership
    const card = await this.prisma.studentCard.findFirst({
      where: { id: cardId, userId }
    });

    if (!card) return { success: false };

    // Check if course already in card
    const existing = await this.prisma.studentCardCourse.findUnique({
      where: {
        cardId_courseId: { cardId, courseId }
      }
    });

    if (existing) return { success: false, alreadyExists: true };

    await this.prisma.studentCardCourse.create({
      data: { cardId, courseId }
    });

    return { success: true };
  }

  /**
   * DELETE /students/cards/:cardId/courses/:courseId - Canonical spec
   * Remove a course from a card
   */
  async removeCourseFromCardCanonical(
    userId: number,
    cardId: number,
    courseId: number
  ): Promise<boolean> {
    // Check card ownership
    const card = await this.prisma.studentCard.findFirst({
      where: { id: cardId, userId }
    });

    if (!card) return false;

    // Check if association exists
    const existing = await this.prisma.studentCardCourse.findUnique({
      where: {
        cardId_courseId: { cardId, courseId }
      }
    });

    if (!existing) return false;

    await this.prisma.studentCardCourse.delete({
      where: {
        cardId_courseId: { cardId, courseId }
      }
    });

    return true;
  }

  /**
   * GET /students/cards/:cardId/progress - Canonical spec
   * Get progress for all courses in a card based on layer completion
   */
  async getCardProgressCanonical(
    userId: number,
    cardId: number
  ): Promise<{
    cardProgressPercentage: number;
    totalCourses: number;
    courseProgress: Array<{
      courseId: number;
      courseName: string;
      layersCompleted: number;
      totalLayers: number;
      percentage: number;
    }>;
  } | null> {
    // Get card with courses
    const card = await this.prisma.studentCard.findFirst({
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

    if (!card) return null;

    const totalLayers = 3; // Each course has 3 layers

    // Get layer completions for all courses in the card
    const courseIds = card.courses.map(c => c.courseId);

    const layers = await this.prisma.courseLayer.findMany({
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
  }
}