import {
  Prisma,
  Question,
  QuestionType,
  QuizSession,
  YearLevel,
  SessionType,
  SessionStatus,
  QuizType,
  RetakeType,
  PrismaClient
} from "@prisma/client";
import { inject, injectable } from "tsyringe";
import PrismaService from "../../config/db";
import { QuizSessionFilters } from "../../types/quiz.types";
import { ANSWER_ORDER, PUBLISHED_QUESTION } from "../questions/question-visibility";
import { RESIDENCY_PARTS } from "../admin/validations/admin.validation";

/** Upper bound on the questions one session can hold (matches the request schemas) */
export const MAX_SESSION_QUESTIONS = 1000;

/** Upper bound on the rows GET /quizzes/questions-by-unite-or-module returns per page */
export const MAX_QUESTIONS_PAGE_SIZE = 5000;

/**
 * Residency content: questions with a university and exam year that either sit
 * in a RESIDENCY study pack or have no course (created through the residency
 * admin flow; course-less questions of an admin-built exam are not residency).
 * Externat questions of the same university and year are excluded.
 */
export function residencyQuestionWhere(): Prisma.QuestionWhereInput {
  return {
    universityId: { not: null },
    examYear: { not: null },
    OR: [
      { courseId: null, examId: null, examQuestions: { none: {} } },
      { course: { module: { unite: { studyPack: { type: 'RESIDENCY' } } } } }
    ]
  };
}

/** Residency questions students can be served: residency content that is published */
export function publishedResidencyQuestionWhere(): Prisma.QuestionWhereInput {
  return { AND: [residencyQuestionWhere(), PUBLISHED_QUESTION] };
}

/** An answer that has been validated against its question and scored */
export type PreparedAnswer =
  | { kind: 'SINGLE'; questionId: number; selectedAnswerId: number; isCorrect: boolean }
  | { kind: 'TEXT'; questionId: number; textAnswer: string; isCorrect: boolean; userManualCorrection: boolean }
  | { kind: 'MULTIPLE'; questionId: number; selectedAnswerIds: number[]; isCorrect: boolean; partialScore: number };

export type SessionStats = {
  totalQuestions: number;
  answeredCount: number;
  correctCount: number;
  score: number;
  percentage: number;
};

function assertId(value: unknown, name: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
}

@injectable()
export default class QuizRepository {
  constructor(@inject("db") private prismaService: PrismaService) { }

  private get prisma(): PrismaClient {
    return this.prismaService.getClient();
  }

  async getQuestionsWithFilters(
    filters: QuizSessionFilters,
    accessibleStudyPackIds: number[],
    questionCount: number
  ): Promise<Question[]> {
    const whereConditions: any = { ...PUBLISHED_QUESTION };

    // Apply filters
    if (filters.yearLevels && filters.yearLevels.length > 0) {
      whereConditions.yearLevel = { in: filters.yearLevels };
    }

    if (filters.courseIds && filters.courseIds.length > 0) {
      whereConditions.courseId = { in: filters.courseIds };
    } else {
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
      whereConditions.course = {
        ...whereConditions.course,
        moduleId: { in: filters.moduleIds }
      };
    }

    if (filters.uniteIds && filters.uniteIds.length > 0) {
      whereConditions.course = {
        ...whereConditions.course,
        module: {
          uniteId: { in: filters.uniteIds }
        }
      };
    }

    // Add quiz year filtering
    if (filters.quizYears && filters.quizYears.length > 0) {
      whereConditions.quizQuestions = {
        ...whereConditions.quizQuestions,
        some: {
          ...whereConditions.quizQuestions?.some,
          quiz: {
            ...whereConditions.quizQuestions?.some?.quiz,
            quizYear: { in: filters.quizYears }
          }
        }
      };
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

    const questions = await this.prisma.question.findMany({
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
          },
          orderBy: ANSWER_ORDER
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
  }

  async createQuizSession(
    userId: number,
    title: string,
    type: SessionType,
    quizType?: QuizType
  ): Promise<QuizSession> {
    return await this.prisma.quizSession.create({
      data: {
        userId,
        title,
        type,
        quizType,
        status: SessionStatus.NOT_STARTED
      }
    });
  }

  async addQuestionsToSession(
    sessionId: number,
    questionIds: number[]
  ): Promise<void> {
    assertId(sessionId, 'sessionId');
    const sessionQuestions = Array.from(new Set(questionIds)).map(questionId => ({
      sessionId,
      questionId
    }));

    await this.prisma.quizSessionQuestion.createMany({
      data: sessionQuestions,
      skipDuplicates: true
    });
  }

  /**
   * Create a session together with its questions in one statement, so a
   * failure never leaves an empty session behind
   */
  async createSessionWithQuestionIds(
    userId: number,
    title: string,
    type: SessionType,
    questionIds: number[],
    quizType?: QuizType
  ): Promise<QuizSession> {
    return await this.prisma.quizSession.create({
      data: {
        userId,
        title,
        type,
        quizType,
        status: SessionStatus.NOT_STARTED,
        sessionQuestions: {
          create: Array.from(new Set(questionIds)).map(questionId => ({ questionId }))
        }
      }
    });
  }

  async getQuizSessionById(
    sessionId: number,
    userId?: number
  ): Promise<QuizSession | null> {
    // Prisma ignores undefined in filters, so a missing id would match any session
    assertId(sessionId, 'sessionId');
    const whereCondition: any = { id: sessionId };

    // If userId is provided, filter by user ownership
    if (userId !== undefined) {
      whereCondition.userId = userId;
    }

    return await this.prisma.quizSession.findFirst({
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
                  },
                  orderBy: ANSWER_ORDER
                },
                questionImages: { orderBy: { id: 'asc' } },
                questionExplanationImages: { orderBy: { id: 'asc' } },
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
  }

  /**
   * Light ownership check used before writing answers or reading results
   */
  async findOwnedSession(sessionId: number, userId: number): Promise<{
    id: number;
    userId: number;
    title: string;
    type: SessionType;
    quizType: QuizType | null;
    status: SessionStatus;
    completedAt: Date | null;
  } | null> {
    assertId(sessionId, 'sessionId');
    return await this.prisma.quizSession.findFirst({
      where: { id: sessionId, userId },
      select: { id: true, userId: true, title: true, type: true, quizType: true, status: true, completedAt: true }
    });
  }

  /**
   * Question types and answer options needed to score submitted answers
   */
  async getQuestionsForScoring(questionIds: number[]): Promise<Array<{
    id: number;
    questionType: QuestionType;
    questionAnswers: Array<{ id: number; isCorrect: boolean }>;
  }>> {
    if (questionIds.length === 0) {
      return [];
    }
    return await this.prisma.question.findMany({
      where: { id: { in: questionIds } },
      select: {
        id: true,
        questionType: true,
        questionAnswers: { select: { id: true, isCorrect: true } }
      }
    });
  }

  /**
   * Store already-scored answers in one transaction, then recompute the
   * session score once. Each question lives in exactly one attempt table:
   * multiple choice in multiple_choice_attempts, everything else in
   * quiz_attempts; a stale row in the other table is removed.
   */
  async saveAnswers(sessionId: number, answers: PreparedAnswer[]): Promise<SessionStats> {
    const now = new Date();
    const multipleIds = answers.filter(a => a.kind === 'MULTIPLE').map(a => a.questionId);
    const otherIds = answers.filter(a => a.kind !== 'MULTIPLE').map(a => a.questionId);

    const operations: Prisma.PrismaPromise<unknown>[] = [];
    if (multipleIds.length > 0) {
      operations.push(this.prisma.quizAttempt.deleteMany({ where: { sessionId, questionId: { in: multipleIds } } }));
    }
    if (otherIds.length > 0) {
      operations.push(this.prisma.multipleChoiceAttempt.deleteMany({ where: { sessionId, questionId: { in: otherIds } } }));
    }

    for (const answer of answers) {
      const key = { sessionId_questionId: { sessionId, questionId: answer.questionId } };
      if (answer.kind === 'MULTIPLE') {
        const data = {
          selectedAnswerIds: JSON.stringify(answer.selectedAnswerIds),
          isCorrect: answer.isCorrect,
          partialScore: answer.partialScore,
          answeredAt: now
        };
        operations.push(this.prisma.multipleChoiceAttempt.upsert({
          where: key,
          update: data,
          create: { sessionId, questionId: answer.questionId, ...data }
        }));
      } else if (answer.kind === 'SINGLE') {
        const data = {
          selectedAnswerId: answer.selectedAnswerId,
          textAnswer: null,
          isCorrect: answer.isCorrect,
          userManualCorrection: null,
          answeredAt: now
        };
        operations.push(this.prisma.quizAttempt.upsert({
          where: key,
          update: data,
          create: { sessionId, questionId: answer.questionId, ...data }
        }));
      } else {
        const data = {
          selectedAnswerId: null,
          textAnswer: answer.textAnswer,
          isCorrect: answer.isCorrect,
          userManualCorrection: answer.userManualCorrection,
          answeredAt: now
        };
        operations.push(this.prisma.quizAttempt.upsert({
          where: key,
          update: data,
          create: { sessionId, questionId: answer.questionId, ...data }
        }));
      }
    }

    await this.prisma.$transaction(operations);

    return await this.updateSessionScore(sessionId);
  }

  /**
   * Score a session from its stored attempts. A question counts at most once
   * (its best attempt), and rows without an answer are ignored.
   */
  async getSessionStats(sessionId: number): Promise<SessionStats> {
    const [totalQuestions, singleAttempts, multipleAttempts] = await Promise.all([
      this.prisma.quizSessionQuestion.count({ where: { sessionId } }),
      this.prisma.quizAttempt.findMany({
        where: {
          sessionId,
          OR: [{ selectedAnswerId: { not: null } }, { textAnswer: { not: null } }]
        },
        select: { questionId: true, isCorrect: true }
      }),
      this.prisma.multipleChoiceAttempt.findMany({
        where: { sessionId },
        select: { questionId: true, isCorrect: true, partialScore: true, selectedAnswerIds: true }
      })
    ]);

    const best = new Map<number, { points: number; correct: boolean }>();
    const record = (questionId: number, points: number, correct: boolean) => {
      const current = best.get(questionId);
      if (!current || points > current.points || (points === current.points && correct && !current.correct)) {
        best.set(questionId, { points, correct });
      }
    };

    for (const attempt of singleAttempts) {
      record(attempt.questionId, attempt.isCorrect ? 1 : 0, attempt.isCorrect === true);
    }
    for (const attempt of multipleAttempts) {
      if (!attempt.selectedAnswerIds || attempt.selectedAnswerIds === '[]') {
        continue;
      }
      const points = attempt.isCorrect
        ? 1
        : (attempt.partialScore && attempt.partialScore > 0 ? attempt.partialScore : 0);
      record(attempt.questionId, points, attempt.isCorrect === true);
    }

    let score = 0;
    let correctCount = 0;
    for (const entry of best.values()) {
      score += entry.points;
      if (entry.correct) correctCount++;
    }
    const answeredCount = Math.min(best.size, totalQuestions);
    const percentage = totalQuestions > 0 ? Math.round((score / totalQuestions) * 100 * 100) / 100 : 0;

    return { totalQuestions, answeredCount, correctCount, score, percentage };
  }

  private async updateSessionScore(sessionId: number): Promise<SessionStats> {
    const stats = await this.getSessionStats(sessionId);
    if (stats.totalQuestions === 0) {
      return stats; // No questions in session, nothing to calculate
    }

    const session = await this.prisma.quizSession.findUnique({
      where: { id: sessionId },
      select: { startedAt: true }
    });

    const now = new Date();
    const completed = stats.answeredCount >= stats.totalQuestions;

    await this.prisma.quizSession.update({
      where: { id: sessionId },
      data: {
        score: stats.score,
        percentage: stats.percentage,
        status: completed ? SessionStatus.COMPLETED : SessionStatus.IN_PROGRESS,
        ...(completed ? { completedAt: now } : {}),
        ...(!session?.startedAt ? { startedAt: now } : {})
      }
    });

    return stats;
  }

  async getAvailableFilters(
    accessibleStudyPackIds: number[],
    accessibleYearLevels?: YearLevel[]
  ): Promise<{
    availableYears: YearLevel[];
    singleChoiceQuestionCount: number;
    multipleChoiceQuestionCount: number;
    unites: Array<{
      id: number;
      name: string;
      year: YearLevel;
      modules: Array<{
        id: number;
        name: string;
        courses: Array<{
          id: number;
          name: string;
          questionCount: number;
          singleChoiceQuestionCount: number;
          multipleChoiceQuestionCount: number;
        }>;
      }>;
    }>;
    availableQuizYears: number[];
    questionSources: Array<{
      id: number;
      name: string;
      questionCount: number;
    }>;
  }> {
    // Get all available years from accessible content
    const yearLevels = await this.prisma.question.findMany({
      where: {
        ...PUBLISHED_QUESTION,
        course: {
          module: {
            OR: [
              { unite: { studyPackId: { in: accessibleStudyPackIds } } },
              { uniteId: null }
            ]
          } as any
        }
      },
      select: { yearLevel: true },
      distinct: ['yearLevel']
    });

    const availableYears = yearLevels
      .map(q => q.yearLevel)
      .filter(year => year !== null) as YearLevel[];

    // Get question counts by type, filtered by accessible year levels
    const questionTypeCountsWhere: any = {
      ...PUBLISHED_QUESTION,
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

    const questionTypeCounts = await this.prisma.question.groupBy({
      by: ['questionType'],
      where: questionTypeCountsWhere,
      _count: {
        id: true
      }
    });

    // Format question type counts
    const singleChoiceCount = questionTypeCounts.find(q => q.questionType === 'SINGLE_CHOICE')?._count.id || 0;
    const multipleChoiceCount = questionTypeCounts.find(q => q.questionType === 'MULTIPLE_CHOICE')?._count.id || 0;

    // Get unites with modules and courses
    const unites = await this.prisma.unite.findMany({
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
                  select: { questions: { where: PUBLISHED_QUESTION } }
                }
              }
            }
          }
        }
      }
    });

    // Get question type counts by course, filtered by accessible year levels
    const courseQuestionTypeCountsWhere: any = {
      ...PUBLISHED_QUESTION,
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

    const courseQuestionTypeCounts = await this.prisma.question.groupBy({
      by: ['courseId', 'questionType'],
      where: courseQuestionTypeCountsWhere,
      _count: {
        id: true
      }
    });

    // Get quiz sources with their available years using raw SQL
    // (Temporary solution until Prisma client is regenerated)
    // Get available quiz years
    let availableQuizYears: number[] = [];
    try {
      const allYearsRaw = await this.prisma.$queryRaw`
        SELECT DISTINCT quiz_year
        FROM quizzes
        WHERE quiz_year IS NOT NULL
        ORDER BY quiz_year DESC
      ` as any[];

      availableQuizYears = allYearsRaw
        .map((row: any) => row.quiz_year)
        .filter((year: any) => year !== null);

    } catch (error) {
      console.log('Error fetching quiz years:', error);
      availableQuizYears = [];
    }

    // Get question sources with their question counts
    let questionSources: any[] = [];
    try {
      // Prisma.join binds one integer parameter per pack id; an empty list matches nothing
      const questionSourcesRaw = accessibleStudyPackIds.length === 0 ? [] : await this.prisma.$queryRaw`
        SELECT qs.id, qs.name, COUNT(q.id) as question_count
        FROM question_sources qs
        JOIN questions q ON q.source_id = qs.id
        JOIN courses c ON q.course_id = c.id
        JOIN modules m ON c.module_id = m.id
        JOIN unites u ON m.unite_id = u.id
        WHERE u.study_pack_id IN (${Prisma.join(accessibleStudyPackIds)})
          AND q.is_published = true
        GROUP BY qs.id, qs.name
        ORDER BY qs.name
      ` as any[];

      questionSources = questionSourcesRaw.map((row: any) => ({
        id: row.id,
        name: row.name,
        questionCount: Number(row.question_count) || 0
      }));
    } catch (error) {
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
        year: (unite.studyPack.yearNumber as YearLevel) || YearLevel.ONE,
        modules: unite.modules.map(module => ({
          id: module.id,
          name: module.name,
          courses: module.courses.map(course => {
            // Get question type counts for this course
            const courseSingleChoice = courseQuestionTypeCounts.find(
              q => q.courseId === course.id && q.questionType === 'SINGLE_CHOICE'
            )?._count.id || 0;

            const courseMultipleChoice = courseQuestionTypeCounts.find(
              q => q.courseId === course.id && q.questionType === 'MULTIPLE_CHOICE'
            )?._count.id || 0;

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
  }

  /**
   * Get universities with their distinct exam years for residency session creation
   */
  async getResidencyUniversities(): Promise<Array<{ id: number; name: string; examYears: number[] }>> {
    const residencyQuestionFilter = publishedResidencyQuestionWhere();

    const universitiesData = await this.prisma.university.findMany({
      where: {
        questions: {
          some: residencyQuestionFilter as any
        }
      },
      select: {
        id: true,
        name: true,
        questions: {
          where: residencyQuestionFilter as any,
          select: {
            examYear: true
          },
          distinct: ['examYear']
        }
      }
    });

    return universitiesData.map(u => ({
      id: u.id,
      name: u.name,
      examYears: u.questions.map(q => q.examYear!).sort((a, b) => b - a)
    }));
  }

  /**
   * Get available parts for a given university and exam year
   * Reads the 'part' field from each question's metadata JSON
   */
  async getResidencyAvailableParts(
    universityId: number,
    examYear: number
  ): Promise<{ parts: string[]; questionCount: number }> {
    assertId(universityId, 'universityId');
    assertId(examYear, 'examYear');
    const questions = await this.prisma.question.findMany({
      where: {
        AND: [publishedResidencyQuestionWhere(), { universityId, examYear }]
      },
      select: { id: true, metadata: true }
    });

    // Extract distinct parts from question metadata
    const partsSet = new Set<string>();
    for (const q of questions) {
      if (!q.metadata) continue;
      try {
        const meta = JSON.parse(q.metadata);
        if (meta.part && typeof meta.part === 'string') {
          partsSet.add(meta.part);
        }
      } catch {
        // ignore malformed metadata
      }
    }

    // Define canonical order for parts
    const canonicalOrder: readonly string[] = RESIDENCY_PARTS;

    // Sort parts in canonical order, unknown parts go at the end
    const parts = Array.from(partsSet).sort((a, b) => {
      const ai = canonicalOrder.indexOf(a);
      const bi = canonicalOrder.indexOf(b);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });

    return {
      parts,
      questionCount: questions.length
    };
  }

  async getAllStudyPackIds(): Promise<number[]> {
    const allStudyPacks = await this.prisma.studyPack.findMany({
      select: {
        id: true
      }
    });
    return allStudyPacks.map(pack => pack.id);
  }

  async getExamSessionFilters(
    accessibleStudyPackIds: number[]
  ): Promise<{
    unites: Array<{
      id: number;
      title: string;
      modules: Array<{
        id: number;
        title: string;
        universities: Array<{
          id: number;
          name: string;
          years: Array<{
            year: number;
            questionSingleCount: number;
            questionMultipleCount: number;
          }>;
        }>;
      }>;
    }>;
  }> {
    // Count questions per course, university, exam year and type in the database
    // instead of loading every question
    const groups = await this.prisma.question.groupBy({
      by: ['courseId', 'universityId', 'examYear', 'questionType'],
      where: {
        ...PUBLISHED_QUESTION,
        course: {
          module: {
            OR: [
              { unite: { studyPackId: { in: accessibleStudyPackIds } } },
              { uniteId: null }
            ]
          }
        },
        universityId: { not: null } // Only include questions with university
        // Questions without examYear are reported under the placeholder year 9999
      },
      _count: { _all: true }
    });

    const courseIds = Array.from(new Set(groups.map(g => g.courseId).filter((id): id is number => id !== null)));
    const universityIds = Array.from(new Set(groups.map(g => g.universityId).filter((id): id is number => id !== null)));

    type CourseInfo = { id: number; module: { id: number; name: string; unite: { id: number; name: string } | null } };
    const [courses, universities]: [CourseInfo[], Array<{ id: number; name: string }>] = await Promise.all([
      this.prisma.course.findMany({
        where: { id: { in: courseIds } },
        select: {
          id: true,
          module: {
            select: {
              id: true,
              name: true,
              unite: { select: { id: true, name: true } }
            }
          }
        }
      }),
      this.prisma.university.findMany({
        where: { id: { in: universityIds } },
        select: { id: true, name: true }
      })
    ]);
    const courseById = new Map<number, CourseInfo>(courses.map(c => [c.id, c]));
    const universityNameById = new Map<number, string>(universities.map(u => [u.id, u.name]));

    // Group hierarchically: unite -> module -> university -> year
    const uniteMap = new Map<number, {
      id: number;
      title: string;
      modules: Map<number, {
        id: number;
        title: string;
        universities: Map<number, {
          id: number;
          name: string;
          years: Map<number, { year: number; questionSingleCount: number; questionMultipleCount: number }>;
        }>;
      }>;
    }>();

    for (const group of groups) {
      const course = group.courseId !== null ? courseById.get(group.courseId) : undefined;
      if (!course || group.universityId === null) continue;

      const uniteId = course.module.unite?.id ?? 0;
      const moduleId = course.module.id;
      const universityId = group.universityId;
      const year = group.examYear || 9999;

      if (!uniteMap.has(uniteId)) {
        uniteMap.set(uniteId, {
          id: uniteId,
          title: course.module.unite?.name ?? 'Unknown',
          modules: new Map()
        });
      }
      const unite = uniteMap.get(uniteId)!;

      if (!unite.modules.has(moduleId)) {
        unite.modules.set(moduleId, { id: moduleId, title: course.module.name, universities: new Map() });
      }
      const module = unite.modules.get(moduleId)!;

      if (!module.universities.has(universityId)) {
        module.universities.set(universityId, {
          id: universityId,
          name: universityNameById.get(universityId) ?? 'Unknown',
          years: new Map()
        });
      }
      const university = module.universities.get(universityId)!;

      if (!university.years.has(year)) {
        university.years.set(year, { year, questionSingleCount: 0, questionMultipleCount: 0 });
      }
      const yearData = university.years.get(year)!;

      if (group.questionType === 'SINGLE_CHOICE') {
        yearData.questionSingleCount += group._count._all;
      } else if (group.questionType === 'MULTIPLE_CHOICE') {
        yearData.questionMultipleCount += group._count._all;
      }
    }

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
  }



  async getUserQuizSessions(
    userId: number,
    page: number = 1,
    limit: number = 10
  ): Promise<{ sessions: any[]; total: number }> {
    const skip = (page - 1) * limit;

    const [sessions, total] = await Promise.all([
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
  }

  /**
   * Get user quiz sessions filtered by type
   */
  async getUserQuizSessionsByType(
    userId: number,
    sessionType: SessionType,
    limit: number = 10,
    offset: number = 0
  ): Promise<{ sessions: any[]; total: number }> {
    const [sessions, total] = await Promise.all([
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
  }

  // Additional validation methods for enhanced error handling
  async getSessionQuestionIds(sessionId: number): Promise<number[]> {
    assertId(sessionId, 'sessionId');
    const sessionQuestions = await this.prisma.quizSessionQuestion.findMany({
      where: { sessionId },
      select: { questionId: true },
      orderBy: { id: 'asc' }
    });

    return sessionQuestions.map(sq => sq.questionId);
  }

  async validateAnswerBelongsToQuestion(
    answerId: number,
    questionId: number
  ): Promise<boolean> {
    const answer = await this.prisma.questionAnswer.findFirst({
      where: {
        id: answerId,
        questionId: questionId
      }
    });

    return answer !== null;
  }

  async validateAnswersBelongToQuestion(
    answerIds: number[],
    questionId: number
  ): Promise<boolean> {
    const answers = await this.prisma.questionAnswer.findMany({
      where: {
        id: { in: answerIds },
        questionId: questionId
      }
    });

    return answers.length === answerIds.length;
  }

  async checkExistingAnswer(
    sessionId: number,
    questionId: number
  ): Promise<boolean> {
    const attempt = await this.prisma.quizAttempt.findUnique({
      where: {
        sessionId_questionId: {
          sessionId,
          questionId
        }
      }
    });

    return attempt !== null;
  }

  async validateSessionAccess(
    sessionId: number,
    userId: number
  ): Promise<QuizSession | null> {
    return await this.prisma.quizSession.findFirst({
      where: {
        id: sessionId,
        userId: userId
      }
    });
  }

  // ==========================================
  // RETAKE SESSION FUNCTIONALITY
  // ==========================================

  /**
   * Create a retake session and its questions atomically
   */
  async createRetakeSession(
    userId: number,
    title: string,
    type: SessionType,
    originalSessionId: number,
    retakeType: RetakeType,
    questionIds: number[],
    quizType?: QuizType
  ): Promise<QuizSession> {
    assertId(originalSessionId, 'originalSessionId');
    return await this.prisma.quizSession.create({
      data: {
        userId,
        title,
        type,
        quizType,
        status: SessionStatus.NOT_STARTED,
        originalSessionId,
        retakeType,
        isRetake: true,
        sessionQuestions: {
          create: Array.from(new Set(questionIds)).map(questionId => ({ questionId }))
        }
      }
    });
  }

  /**
   * Per-question outcome of a session, from both attempt tables. A question
   * with an answer in either table counts as answered; it counts as correct
   * when any of its answered attempts is correct.
   */
  private async getAnsweredOutcomes(sessionId: number): Promise<Map<number, boolean>> {
    assertId(sessionId, 'sessionId');
    const [singleAttempts, multipleAttempts] = await Promise.all([
      this.prisma.quizAttempt.findMany({
        where: {
          sessionId,
          OR: [{ selectedAnswerId: { not: null } }, { textAnswer: { not: null } }]
        },
        select: { questionId: true, isCorrect: true }
      }),
      this.prisma.multipleChoiceAttempt.findMany({
        where: { sessionId },
        select: { questionId: true, isCorrect: true, selectedAnswerIds: true }
      })
    ]);

    const outcomes = new Map<number, boolean>();
    const record = (questionId: number, isCorrect: boolean | null) => {
      outcomes.set(questionId, (outcomes.get(questionId) ?? false) || isCorrect === true);
    };
    singleAttempts.forEach(attempt => record(attempt.questionId, attempt.isCorrect));
    multipleAttempts
      .filter(attempt => attempt.selectedAnswerIds && attempt.selectedAnswerIds !== '[]')
      .forEach(attempt => record(attempt.questionId, attempt.isCorrect));
    return outcomes;
  }

  /** Session questions answered incorrectly (single choice, multiple choice and QROC) */
  async getIncorrectQuestionIds(sessionId: number): Promise<number[]> {
    const [questionIds, outcomes] = await Promise.all([
      this.getSessionQuestionIds(sessionId),
      this.getAnsweredOutcomes(sessionId)
    ]);
    return questionIds.filter(id => outcomes.get(id) === false);
  }

  /** Session questions answered correctly (single choice, multiple choice and QROC) */
  async getCorrectQuestionIds(sessionId: number): Promise<number[]> {
    const [questionIds, outcomes] = await Promise.all([
      this.getSessionQuestionIds(sessionId),
      this.getAnsweredOutcomes(sessionId)
    ]);
    return questionIds.filter(id => outcomes.get(id) === true);
  }

  /** Session questions with no answer in either attempt table */
  async getNotRespondedQuestionIds(sessionId: number): Promise<number[]> {
    const [questionIds, outcomes] = await Promise.all([
      this.getSessionQuestionIds(sessionId),
      this.getAnsweredOutcomes(sessionId)
    ]);
    return questionIds.filter(id => !outcomes.has(id));
  }

  async getRetakeSessionHistory(originalSessionId: number): Promise<QuizSession[]> {
    return await this.prisma.quizSession.findMany({
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
  }

  async deleteQuizSession(sessionId: number): Promise<void> {
    await this.prisma.quizSession.delete({
      where: {
        id: sessionId
      }
    });
  }

  /**
   * Update session status with proper timestamp handling
   */
  async updateSessionStatus(
    sessionId: number,
    status: SessionStatus,
    userId: number
  ): Promise<QuizSession> {
    const updateData: any = {
      status,
      updatedAt: new Date()
    };

    // Set appropriate timestamps based on status
    if (status === SessionStatus.IN_PROGRESS) {
      // Only set startedAt if it's not already set
      const existingSession = await this.prisma.quizSession.findUnique({
        where: { id: sessionId },
        select: { startedAt: true }
      });

      if (!existingSession?.startedAt) {
        updateData.startedAt = new Date();
      }
    } else if (status === SessionStatus.COMPLETED) {
      updateData.completedAt = new Date();

      // Ensure startedAt is set if not already
      const existingSession = await this.prisma.quizSession.findUnique({
        where: { id: sessionId },
        select: { startedAt: true }
      });

      if (!existingSession?.startedAt) {
        updateData.startedAt = new Date();
      }
    }

    return await this.prisma.quizSession.update({
      where: {
        id: sessionId,
        userId: userId // Ensure user owns the session
      },
      data: updateData
    });
  }

  /**
   * Check if a status transition is valid
   */
  isValidStatusTransition(currentStatus: SessionStatus, newStatus: SessionStatus): boolean {
    const validTransitions: Record<SessionStatus, SessionStatus[]> = {
      [SessionStatus.NOT_STARTED]: [SessionStatus.IN_PROGRESS, SessionStatus.COMPLETED],
      [SessionStatus.IN_PROGRESS]: [SessionStatus.COMPLETED, SessionStatus.NOT_STARTED], // Allow reset
      [SessionStatus.COMPLETED]: [SessionStatus.NOT_STARTED] // Allow reset for retakes
    };

    return validTransitions[currentStatus]?.includes(newStatus) || currentStatus === newStatus;
  }

  /**
   * Validate that all question IDs exist and are accessible to the user
   */
  async validateQuestionAccess(questionIds: number[], accessibleStudyPackIds: number[], allowCourseless: boolean): Promise<{
    existingQuestions: Question[];
    invalidIds: number[];
    inaccessibleIds: number[];
  }> {
    // Get all questions with the provided IDs; unpublished questions count as missing
    const existingQuestions = await this.prisma.question.findMany({
      where: {
        id: { in: questionIds },
        ...PUBLISHED_QUESTION
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

    // Check which questions are not accessible:
    // - questions in a unite must belong to one of the user's study packs
    // - questions in an independent module (no unite) are open to any subscriber (callers check the subscription)
    // - questions with no course (residency questions) need residency access
    const inaccessibleIds = existingQuestions
      .filter(q => {
        if (!q.course) {
          return !allowCourseless;
        }
        if (q.course.module?.unite) {
          return !accessibleStudyPackIds.includes(q.course.module.unite.studyPackId);
        }
        return false;
      })
      .map(q => q.id);

    return {
      existingQuestions,
      invalidIds,
      inaccessibleIds
    };
  }

  /** The given question ids that are published, in the given order */
  async filterPublishedQuestionIds(questionIds: number[]): Promise<number[]> {
    if (questionIds.length === 0) {
      return [];
    }
    const published = await this.prisma.question.findMany({
      where: { id: { in: questionIds }, ...PUBLISHED_QUESTION },
      select: { id: true }
    });
    const publishedIds = new Set(published.map(q => q.id));
    return questionIds.filter(id => publishedIds.has(id));
  }

  /**
   * Get all question IDs associated with a specific label for a user
   */
  async getQuestionIdsByLabelId(labelId: number, userId: number): Promise<number[]> {
    const questionLabels = await this.prisma.questionLabel.findMany({
      where: {
        labelId,
        userId
      },
      select: {
        questionId: true
      }
    });

    return questionLabels.map(ql => ql.questionId);
  }

  /**
   * Create a quiz session with specific questions. Attempt rows are only
   * written when the student answers, so unanswered questions have none.
   */
  async createSessionWithQuestions(
    userId: number,
    title: string,
    sessionType: SessionType,
    questionIds: number[]
  ): Promise<QuizSession> {
    return await this.prisma.quizSession.create({
      data: {
        userId,
        title,
        type: sessionType,
        status: SessionStatus.NOT_STARTED,
        score: 0,
        percentage: 0,
        sessionQuestions: {
          create: Array.from(new Set(questionIds)).map((questionId) => ({
            questionId
          }))
        }
      }
    });
  }

  async getQuestionCount(
    accessibleStudyPackIds: number[],
    filters: {
      unite?: number;
      module?: number;
      university?: number;
      year?: number;
    }
  ): Promise<number> {
    // Build the where clause based on filters
    // Handle both modules with a unite (study pack access) and independent modules (no unite)
    const whereClause: any = {
      ...PUBLISHED_QUESTION,
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
      } else {
        whereClause.examYear = filters.year;
      }
    }

    // Count questions matching the filters
    const count = await this.prisma.question.count({
      where: whereClause
    });

    return count;
  }

  // ==========================================
  // CANONICAL SPEC ENDPOINTS
  // ==========================================

  /**
   * GET /quizzes/session-filters - Canonical spec
   * Returns filter options with question counts
   * Optional filters: { uniteId, moduleId } for cascading filter behavior
   */
  async getSessionFiltersCanonical(
    studyPackIds: number[],
    filters?: { uniteId?: number; moduleId?: number }
  ): Promise<{
    universities: Array<{ id: number; name: string; country: string; questionCount: number }>;
    questionSources: Array<{ id: number; name: string; questionCount: number }>;
    examYears: Array<{ year: number; questionCount: number }>;
    rotations: Array<{ rotation: string; questionCount: number }>;
    unites: Array<{
      id: number;
      name: string;
      questionCount: number;
      modules: Array<{ id: number; name: string; questionCount: number }>;
    }>;
    individualModules: Array<{ id: number; name: string; questionCount: number }>;
    totalQuestionCount: number;
  }> {
    // Build baseWhere with optional uniteId/moduleId constraints for cascading filters
    const baseWhere: any = {
      ...PUBLISHED_QUESTION,
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
    if (filters?.uniteId) {
      baseWhere.course.module.uniteId = filters.uniteId;
    }

    // Apply moduleId filter if provided
    if (filters?.moduleId) {
      baseWhere.course.moduleId = filters.moduleId;
    }

    // Get universities with question counts
    const universitiesData = await this.prisma.university.findMany({
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
    const sourcesData = await this.prisma.questionSource.findMany({
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
    const examYearsData = await this.prisma.question.groupBy({
      by: ['examYear'],
      where: {
        ...baseWhere,
        examYear: { not: null }
      },
      _count: true
    });

    const examYears = examYearsData
      .filter(e => e.examYear !== null)
      .map(e => ({
        year: e.examYear!,
        questionCount: e._count
      }))
      .sort((a, b) => b.year - a.year);

    // Get rotations (year levels R1-R4) with counts
    const rotationsData = await this.prisma.question.groupBy({
      by: ['yearLevel'],
      where: {
        ...baseWhere,
        yearLevel: { not: null }
      },
      _count: true
    });

    const rotations = rotationsData
      .filter(r => r.yearLevel !== null)
      .map(r => ({
        rotation: r.yearLevel!,
        questionCount: r._count
      }));

    // Get unites with modules and question counts
    const unitesData = await this.prisma.unite.findMany({
      where: {
        studyPackId: { in: studyPackIds }
      },
      include: {
        modules: {
          include: {
            courses: {
              include: {
                _count: {
                  select: { questions: { where: PUBLISHED_QUESTION } }
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
    const totalQuestionCount = await this.prisma.question.count({
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
  }

  /**
   * POST /quizzes/question-count - Canonical spec
   * Returns totalQuestionCount and accessibleQuestionCount
   */
  async getQuestionCountCanonical(
    studyPackIds: number[],
    filters: {
      courseIds: number[];
      questionTypes?: string[];
      years?: number[];
      rotations?: string[];
      universityIds?: number[];
      questionSourceIds?: number[];
      repetitionCountMin?: number;
      repetitionYears?: number[];
    }
  ): Promise<{ totalQuestionCount: number; accessibleQuestionCount: number }> {
    const whereClause: any = {
      ...PUBLISHED_QUESTION,
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
    const rawTotal = await this.prisma.question.count();
    // Count with just courseId filter (no universityId etc)
    const courseOnly = await this.prisma.question.count({
      where: { courseId: { in: filters.courseIds }, ...PUBLISHED_QUESTION }
    });
    console.log("[DIAG question-count] whereClause:", JSON.stringify(whereClause));
    console.log("[DIAG question-count] rawTotal (all questions in DB):", rawTotal);
    console.log("[DIAG question-count] courseOnly (courseId IN filter only):", courseOnly);
    console.log("[DIAG question-count] studyPackIds:", JSON.stringify(studyPackIds));
    // === END DIAGNOSTIC ===

    // Total question count (all questions matching filters)
    const totalQuestionCount = await this.prisma.question.count({
      where: whereClause
    });

    console.log("[DIAG question-count] totalQuestionCount:", totalQuestionCount);

    // Accessible question count (questions in accessible study packs)
    // Must handle both: modules linked to a unite (with studyPack), and independent modules (no unite)
    const accessibleQuestionCount = await this.prisma.question.count({
      where: {
        ...whereClause,
        course: {
          module: {
            OR: [
              // Modules that belong to a unite with an accessible study pack
              { unite: { studyPackId: { in: studyPackIds } } },
              // Independent modules (no unite) — no ACL path, so consider accessible
              { uniteId: null }
            ]
          }
        }
      }
    });

    return { totalQuestionCount, accessibleQuestionCount };
  }

  /**
   * GET /quizzes/questions-by-unite-or-module - Canonical spec
   * Returns one page of the questions of a unite or module: only the fields the
   * question picker needs (no answers or explanations).
   */
  async getQuestionsByUniteOrModule(
    studyPackIds: number[],
    uniteId?: number,
    moduleId?: number,
    page: number = 1,
    limit: number = MAX_QUESTIONS_PAGE_SIZE
  ): Promise<{
    questions: any[];
    pagination: { page: number; limit: number; total: number; totalPages: number; hasMore: boolean };
  }> {
    const whereClause: any = {
      ...PUBLISHED_QUESTION,
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

    const take = Math.min(Math.max(1, Math.floor(limit)), MAX_QUESTIONS_PAGE_SIZE);
    const currentPage = Math.max(1, Math.floor(page));

    const [total, questions] = await Promise.all([
      this.prisma.question.count({ where: whereClause }),
      this.prisma.question.findMany({
        where: whereClause,
        select: {
          id: true,
          questionType: true,
          examYear: true,
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
        },
        orderBy: { id: 'asc' },
        skip: (currentPage - 1) * take,
        take
      })
    ]);

    return {
      questions: questions.map(q => ({
        id: q.id,
        questionType: q.questionType,
        examYear: q.examYear,
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
      })),
      pagination: {
        page: currentPage,
        limit: take,
        total,
        totalPages: Math.ceil(total / take),
        hasMore: currentPage * take < total
      }
    };
  }

  /**
   * POST /quizzes/sessions - Canonical spec
   * Get questions for creating a canonical session: a random selection of at
   * most questionCount (never more than MAX_SESSION_QUESTIONS) matching questions.
   */
  async getQuestionsForCanonicalSession(
    studyPackIds: number[],
    filters: {
      courseIds: number[];
      questionTypes?: string[];
      years?: number[];
      rotations?: string[];
      universityIds?: number[];
      questionSourceIds?: number[];
      repetitionCountMin?: number;
      repetitionYears?: number[];
    },
    questionCount: number = MAX_SESSION_QUESTIONS
  ): Promise<Array<{ id: number }>> {
    const whereClause: any = {
      ...PUBLISHED_QUESTION,
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

    // Rotations are the questions' year levels (same filter as POST /quizzes/question-count)
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

    // Repetition years filter: questions that appeared in at least one of the provided years (hasSome)
    if (filters.repetitionYears && filters.repetitionYears.length > 0) {
      whereClause.OR = filters.repetitionYears.map(year => ({
        repetitionYears: { contains: String(year) }
      }));
    }

    const limit = Math.min(Math.max(1, Math.floor(questionCount) || MAX_SESSION_QUESTIONS), MAX_SESSION_QUESTIONS);

    // Only ids are loaded; shuffle them (Fisher-Yates) and keep the first `limit`
    const allQuestions = await this.prisma.question.findMany({
      where: whereClause,
      select: { id: true }
    });

    const shuffled = [...allQuestions];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    return shuffled.slice(0, limit);
  }

  // ==========================================
  // RESIDENCY SESSION ENDPOINTS (Canonical spec)
  // ==========================================

  /**
   * GET /quizzes/residency-sessions-only - Canonical spec
   * Returns array of residency sessions for the logged-in user
   */
  async getResidencySessionsOnlyCanonical(userId: number): Promise<any[]> {
    const residencyQuestion = residencyQuestionWhere();
    const sessions = await this.prisma.quizSession.findMany({
      where: {
        userId,
        // Sessions built from residency questions (see residencyQuestionWhere)
        sessionQuestions: {
          some: { question: residencyQuestion }
        }
      },
      select: {
        id: true,
        title: true,
        status: true,
        percentage: true,
        createdAt: true,
        completedAt: true,
        // One representative residency question for the university and exam year
        sessionQuestions: {
          where: { question: residencyQuestion },
          orderBy: { id: 'asc' },
          take: 1,
          select: {
            question: {
              select: {
                examYear: true,
                university: { select: { id: true, name: true } }
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Transform to canonical format
    return sessions.map(session => {
      const firstQuestion = session.sessionQuestions[0]?.question;
      const university = firstQuestion?.university;
      const examYear = firstQuestion?.examYear;

      return {
        id: session.id,
        title: session.title,
        status: session.status,
        examYear: examYear || null,
        university: university ? { id: university.id, name: university.name } : null,
        parts: RESIDENCY_PARTS.slice(0, 3), // Default parts (the three national parts)
        // The stored percentage counts every answer type and partial credit
        score: session.status === 'COMPLETED' ? Math.round(session.percentage) : null,
        createdAt: session.createdAt.toISOString(),
        completedAt: session.completedAt?.toISOString() || null
      };
    });
  }

  /**
   * Get residency questions for a session by universityId and examYear.
   * Parts only filter when some are given; questions without a part are
   * included otherwise. At most MAX_SESSION_QUESTIONS are returned.
   */
  async getQuestionsForResidencySession(
    universityId: number,
    examYear: number,
    parts?: string[]
  ): Promise<Array<{ id: number }>> {
    assertId(universityId, 'universityId');
    assertId(examYear, 'examYear');
    const questions = await this.prisma.question.findMany({
      where: {
        AND: [publishedResidencyQuestionWhere(), { universityId, examYear }]
      },
      select: { id: true, metadata: true },
      orderBy: { id: 'asc' }
    });

    const selected = parts && parts.length > 0
      ? questions.filter(q => {
        if (!q.metadata) return false;
        try {
          const meta = JSON.parse(q.metadata);
          return typeof meta.part === 'string' && parts.includes(meta.part);
        } catch {
          return false;
        }
      })
      : questions;

    return selected.slice(0, MAX_SESSION_QUESTIONS).map(q => ({ id: q.id }));
  }
}
