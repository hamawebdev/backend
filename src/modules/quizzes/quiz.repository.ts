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
import { getQuestionCatalog, QuestionFilters, YEAR_LEVELS } from "./question-catalog";
import { addServerTiming, timed } from "../../core/middlewares/server-timing";
import { SessionStats, loadQuestionOutcomes, loadSessionStats } from "./session-stats";

export type { SessionStats } from "./session-stats";

/** Upper bound on the questions one session can hold (matches the request schemas) */
export const MAX_SESSION_QUESTIONS = 1000;

/**
 * Upper bound for an exam session: an exam holds every question of its module,
 * source and year (or every year), so it is not cut to MAX_SESSION_QUESTIONS
 */
export const MAX_EXAM_SESSION_QUESTIONS = 5000;

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

function assertId(value: unknown, name: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
}

function groupBy<T, K>(items: T[], keyOf: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const list = map.get(key);
    if (list) list.push(item); else map.set(key, [item]);
  }
  return map;
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
   * Create a session and its questions in one transaction, so a failure never
   * leaves an empty session behind. The questions are stored in the given order
   * (duplicates dropped) with one INSERT; ids that no longer exist or are no
   * longer published are skipped. Returns the session and how many questions it got.
   */
  private async insertSession(
    data: Prisma.QuizSessionUncheckedCreateInput,
    questionIds: number[]
  ): Promise<QuizSession & { questionCount: number }> {
    const ids = Array.from(new Set(questionIds));
    return await this.prisma.$transaction(async tx => {
      const session = await tx.quizSession.create({ data });
      const questionCount = ids.length === 0 ? 0 : await tx.$executeRaw`
        INSERT INTO quiz_session_questions (session_id, question_id, created_at)
        SELECT ${session.id}, x.question_id, now()
          FROM unnest(${ids}::int[]) WITH ORDINALITY AS x(question_id, ord)
          JOIN questions q ON q.id = x.question_id AND q.is_published
         ORDER BY x.ord`;
      return { ...session, questionCount };
      // Under load every pooled connection can be busy for a few seconds: wait for one
      // instead of failing after Prisma's default 2 s
    }, { maxWait: 15000, timeout: 30000 });
  }

  /**
   * Create a session together with its questions, in the given order
   */
  async createSessionWithQuestionIds(
    userId: number,
    title: string,
    type: SessionType,
    questionIds: number[],
    quizType?: QuizType
  ): Promise<QuizSession & { questionCount: number }> {
    return await this.insertSession(
      { userId, title, type, quizType, status: SessionStatus.NOT_STARTED },
      questionIds
    );
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

    // One round of queries: every part is selected by "belongs to this session", so
    // nothing waits for another query (each database round trip is slow on the
    // production host). The parts are only used when the session is the caller's.
    const inSession = { sessionQuestions: { some: { sessionId } } };
    const loadStart = performance.now();
    const [session, links, quizAttempts, multipleChoiceAttempts, questions, answers, explanationImages, questionImages, questionExplanationImages, catalog] = await Promise.all([
      this.prisma.quizSession.findFirst({ where: whereCondition }),
      this.prisma.quizSessionQuestion.findMany({ where: { sessionId }, select: { questionId: true }, orderBy: { id: 'asc' } }),
      this.prisma.quizAttempt.findMany({ where: { sessionId } }),
      this.prisma.multipleChoiceAttempt.findMany({ where: { sessionId } }),
      timed('questions', this.prisma.question.findMany({ where: inSession })),
      timed('answers', this.prisma.questionAnswer.findMany({ where: { question: inSession }, orderBy: ANSWER_ORDER })),
      this.prisma.explanationImage.findMany({ where: { answer: { question: inSession } }, orderBy: { id: 'asc' } }),
      this.prisma.questionImage.findMany({ where: { question: inSession }, orderBy: { id: 'asc' } }),
      this.prisma.questionExplanationImage.findMany({ where: { question: inSession }, orderBy: { id: 'asc' } }),
      getQuestionCatalog(this.prisma)
    ]);
    addServerTiming('load', performance.now() - loadStart);
    const buildStart = performance.now();
    if (!session) {
      return null;
    }
    const ids = links.map(link => link.questionId);

    // Courses, modules, universities and sources come from the catalog; anything it
    // does not know yet (created since it was loaded) is read from the database
    const missingCourseIds = Array.from(new Set(questions.map(q => q.courseId).filter((id): id is number => id !== null && !catalog.courseById.has(id))));
    const missingUniversityIds = Array.from(new Set(questions.map(q => q.universityId).filter((id): id is number => id !== null && !catalog.universityById.has(id))));
    const missingSourceIds = Array.from(new Set(questions.map(q => q.sourceId).filter((id): id is number => id !== null && !catalog.sourceById.has(id))));
    const [extraCourses, extraUniversities, extraSources] = await Promise.all([
      missingCourseIds.length ? this.prisma.course.findMany({ where: { id: { in: missingCourseIds } }, include: { module: { select: { id: true, name: true } } } }) : [],
      missingUniversityIds.length ? this.prisma.university.findMany({ where: { id: { in: missingUniversityIds } }, select: { id: true, name: true, country: true } }) : [],
      missingSourceIds.length ? this.prisma.questionSource.findMany({ where: { id: { in: missingSourceIds } }, select: { id: true, name: true } }) : []
    ]);
    const extraCourseById = new Map<number, any>(extraCourses.map((c: any) => [c.id, c] as [number, any]));

    const courseOf = (courseId: number | null) => {
      if (courseId === null) return null;
      const extra = extraCourseById.get(courseId);
      if (extra) return extra;
      const course = catalog.courseById.get(courseId);
      if (!course) return null;
      const module = catalog.moduleById.get(course.moduleId);
      return { ...course, module: module ? { id: module.id, name: module.name } : null };
    };
    const universityOf = (id: number | null) => {
      if (id === null) return null;
      const u = catalog.universityById.get(id) ?? extraUniversities.find(x => x.id === id);
      return u ? { id: u.id, name: u.name, country: u.country ?? 'Algeria' } : null;
    };
    const sourceOf = (id: number | null) => {
      if (id === null) return null;
      const s = catalog.sourceById.get(id) ?? extraSources.find(x => x.id === id);
      return s ? { id: s.id, name: s.name } : null;
    };

    const imagesByAnswer = groupBy(explanationImages, image => image.answerId);
    const answersByQuestion = groupBy(answers, answer => answer.questionId);
    const imagesByQuestion = groupBy(questionImages, image => image.questionId);
    const explanationImagesByQuestion = groupBy(questionExplanationImages, image => image.questionId);
    const questionById = new Map(questions.map(q => [q.id, q]));

    // Most repeated questions first (as before), then the order the session was built in
    const position = new Map(ids.map((id, index) => [id, index]));
    const sessionQuestions = ids
      .filter(id => questionById.has(id))
      .sort((a, b) => (questionById.get(b)!.repetitionCount - questionById.get(a)!.repetitionCount) || (position.get(a)! - position.get(b)!))
      .map(id => {
        const question = questionById.get(id)!;
        return {
          questionId: id,
          question: {
            ...question,
            questionAnswers: (answersByQuestion.get(id) || []).map(answer => ({
              ...answer,
              explanationImages: imagesByAnswer.get(answer.id) || []
            })),
            questionImages: imagesByQuestion.get(id) || [],
            questionExplanationImages: explanationImagesByQuestion.get(id) || [],
            university: universityOf(question.universityId),
            course: courseOf(question.courseId),
            source: sourceOf(question.sourceId)
          }
        };
      });

    addServerTiming('build', performance.now() - buildStart);
    return { ...session, sessionQuestions, quizAttempts, multipleChoiceAttempts } as any;
  }

  /** Status and owner of a session, without its questions */
  async getSessionHeader(sessionId: number, userId?: number): Promise<{ id: number; userId: number; status: SessionStatus } | null> {
    assertId(sessionId, 'sessionId');
    return await this.prisma.quizSession.findFirst({
      where: userId !== undefined ? { id: sessionId, userId } : { id: sessionId },
      select: { id: true, userId: true, status: true }
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
    const questionIds = answers.map(a => a.questionId);

    // Replace the stored attempts of these questions: remove them from both tables,
    // then insert each answer in its table (a few statements whatever the count)
    const singles = answers.filter(a => a.kind !== 'MULTIPLE').map(answer => answer.kind === 'SINGLE'
      ? {
        sessionId, questionId: answer.questionId, selectedAnswerId: answer.selectedAnswerId, textAnswer: null,
        isCorrect: answer.isCorrect, userManualCorrection: null, answeredAt: now
      }
      : {
        sessionId, questionId: answer.questionId, selectedAnswerId: null, textAnswer: (answer as any).textAnswer,
        isCorrect: answer.isCorrect, userManualCorrection: (answer as any).userManualCorrection, answeredAt: now
      });
    const multiples = answers.filter(a => a.kind === 'MULTIPLE').map(answer => ({
      sessionId,
      questionId: answer.questionId,
      selectedAnswerIds: JSON.stringify((answer as any).selectedAnswerIds),
      isCorrect: answer.isCorrect,
      partialScore: (answer as any).partialScore,
      answeredAt: now
    }));

    const operations = (): Prisma.PrismaPromise<unknown>[] => [
      this.prisma.quizAttempt.deleteMany({ where: { sessionId, questionId: { in: questionIds } } }),
      this.prisma.multipleChoiceAttempt.deleteMany({ where: { sessionId, questionId: { in: questionIds } } }),
      ...(singles.length > 0 ? [this.prisma.quizAttempt.createMany({ data: singles })] : []),
      ...(multiples.length > 0 ? [this.prisma.multipleChoiceAttempt.createMany({ data: multiples })] : [])
    ];

    // One transaction, so a failure never loses the stored answers. Two saves of the
    // same question at the same moment (two tabs, a retry) make the later insert hit
    // the (session, question) unique key: run it again, so the later answer wins.
    for (let attempt = 1; ; attempt++) {
      try {
        await this.prisma.$transaction(operations());
        break;
      } catch (error: any) {
        if (error?.code !== 'P2002' || attempt >= 3) throw error;
      }
    }

    return await this.updateSessionScore(sessionId);
  }

  /**
   * Score a session from its stored attempts (see computeSessionStats): a
   * question counts at most once (its best attempt), and rows without an answer
   * are ignored.
   */
  async getSessionStats(sessionId: number): Promise<SessionStats> {
    assertId(sessionId, 'sessionId');
    return (await loadSessionStats(this.prisma, [sessionId])).get(sessionId)!;
  }

  /** Stats of several sessions at once, keyed by session id */
  async getSessionStatsMany(sessionIds: number[]): Promise<Map<number, SessionStats>> {
    return await loadSessionStats(this.prisma, sessionIds);
  }

  /**
   * Store a session's score after its answers changed. Answering never completes
   * a session: it stays in progress until the student finishes it (status update
   * to COMPLETED), so answers can still be given after every question has one.
   * A session that is already completed keeps its status.
   */
  private async updateSessionScore(sessionId: number): Promise<SessionStats> {
    const stats = await this.getSessionStats(sessionId);
    if (stats.totalQuestions === 0) {
      return stats; // No questions in session, nothing to calculate
    }

    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.quizSession.update({
        where: { id: sessionId },
        data: { score: stats.score, percentage: stats.percentage }
      }),
      this.prisma.quizSession.updateMany({
        where: { id: sessionId, startedAt: null },
        data: { startedAt: now }
      }),
      this.prisma.quizSession.updateMany({
        where: { id: sessionId, status: SessionStatus.NOT_STARTED },
        data: { status: SessionStatus.IN_PROGRESS }
      })
    ]);

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
    // Published résidanat questions (publishedResidencyQuestionWhere), from the catalog
    const catalog = await getQuestionCatalog(this.prisma);
    const yearsByUniversity = new Map<number, Set<number>>();
    for (let i = 0; i < catalog.size; i++) {
      if (!catalog.residency[i]) continue;
      const universityId = catalog.universityId[i];
      let years = yearsByUniversity.get(universityId);
      if (!years) yearsByUniversity.set(universityId, (years = new Set()));
      years.add(catalog.examYear[i]);
    }

    return catalog.universities
      .filter(u => yearsByUniversity.has(u.id))
      .map(u => ({
        id: u.id,
        name: u.name,
        examYears: Array.from(yearsByUniversity.get(u.id)!).sort((a, b) => b - a)
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
    const catalog = await getQuestionCatalog(this.prisma);
    const slots = catalog.residencySlots(universityId, examYear);

    // Distinct parts from the questions' metadata
    const partsSet = new Set<string>();
    for (const slot of slots) {
      const part = catalog.part.get(slot);
      if (part) partsSet.add(part);
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
      questionCount: slots.length
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
  ): Promise<QuizSession & { questionCount: number }> {
    assertId(originalSessionId, 'originalSessionId');
    return await this.insertSession(
      { userId, title, type, quizType, status: SessionStatus.NOT_STARTED, originalSessionId, retakeType, isRetake: true },
      questionIds
    );
  }

  /**
   * Per-question outcome of a session, from both attempt tables, with the same
   * rules as the session's results: a question with an answer in either table
   * counts as answered; it counts as correct when its best answer is correct.
   */
  private async getAnsweredOutcomes(sessionId: number): Promise<Map<number, boolean>> {
    assertId(sessionId, 'sessionId');
    const outcomes = await loadQuestionOutcomes(this.prisma, sessionId);
    return new Map(Array.from(outcomes, ([questionId, outcome]) => [questionId, outcome.correct]));
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

      // Store the final score with the completion, from the answers stored now
      const stats = await this.getSessionStats(sessionId);
      updateData.score = stats.score;
      updateData.percentage = stats.percentage;
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
  ): Promise<QuizSession & { questionCount: number }> {
    return await this.insertSession(
      { userId, title, type: sessionType, status: SessionStatus.NOT_STARTED, score: 0, percentage: 0 },
      questionIds
    );
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
    questionSources: Array<{ id: number; name: string; questionCount: number; examYears: Array<{ year: number; questionCount: number }> }>;
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
    const catalog = await getQuestionCatalog(this.prisma);
    const packs = new Set(studyPackIds);

    // Published questions of every course the packs open (plus independent modules),
    // optionally within one unite or module
    const courseIds = catalog.accessibleCourseIds(packs, { uniteId: filters?.uniteId, moduleId: filters?.moduleId });

    const byUniversity = new Map<number, number>();
    const bySource = new Map<number, number>();
    const bySourceYear = new Map<number, Map<number, number>>();
    const byYear = new Map<number, number>();
    const byYearLevel = new Map<number, number>();
    let totalQuestionCount = 0;
    const add = (map: Map<number, number>, key: number) => map.set(key, (map.get(key) || 0) + 1);

    for (const courseId of courseIds) {
      for (const i of catalog.slotsByCourse.get(courseId) || []) {
        totalQuestionCount++;
        if (catalog.universityId[i]) add(byUniversity, catalog.universityId[i]);
        const year = catalog.examYear[i];
        if (year) add(byYear, year);
        if (catalog.yearLevel[i]) add(byYearLevel, catalog.yearLevel[i]);
        const sourceId = catalog.sourceId[i];
        if (sourceId) {
          add(bySource, sourceId);
          if (year) {
            let years = bySourceYear.get(sourceId);
            if (!years) bySourceYear.set(sourceId, (years = new Map()));
            add(years, year);
          }
        }
      }
    }

    const yearList = (map: Map<number, number> | undefined) => Array.from(map ? map.entries() : [])
      .map(([year, questionCount]) => ({ year, questionCount }))
      .sort((a, b) => b.year - a.year);

    const universities = catalog.universities
      .filter(u => byUniversity.has(u.id))
      .map(u => ({ id: u.id, name: u.name, country: u.country ?? 'Algeria', questionCount: byUniversity.get(u.id)! }));

    // Each source also lists the exam years it has within this scope (exam setup)
    const questionSources = catalog.sources
      .filter(s => bySource.has(s.id))
      .map(s => ({ id: s.id, name: s.name, questionCount: bySource.get(s.id)!, examYears: yearList(bySourceYear.get(s.id)) }));

    const examYears = yearList(byYear);

    const rotations = YEAR_LEVELS
      .map((level, index) => ({ rotation: level as string, questionCount: byYearLevel.get(index + 1) || 0 }))
      .filter(r => r.questionCount > 0);

    // Every unite of the packs with its modules; a module counts every published
    // question of its courses
    const unites = catalog.unites
      .filter(u => packs.has(u.studyPackId))
      .map(unite => {
        const modules = (catalog.modulesByUnite.get(unite.id) || []).map(module => ({
          id: module.id,
          name: module.name,
          questionCount: (catalog.coursesByModule.get(module.id) || [])
            .reduce((sum, course) => sum + (catalog.slotsByCourse.get(course.id)?.length || 0), 0)
        }));
        return {
          id: unite.id,
          name: unite.name,
          questionCount: modules.reduce((sum, m) => sum + m.questionCount, 0),
          modules
        };
      });

    return {
      universities,
      questionSources,
      examYears,
      rotations,
      unites,
      individualModules: unites.flatMap(u => u.modules),
      totalQuestionCount
    };
  }

  /**
   * POST /quizzes/question-count - Canonical spec
   * Returns totalQuestionCount and accessibleQuestionCount
   */
  async getQuestionCountCanonical(
    studyPackIds: number[],
    filters: QuestionFilters
  ): Promise<{ totalQuestionCount: number; accessibleQuestionCount: number }> {
    const catalog = await getQuestionCatalog(this.prisma);
    const packs = new Set(studyPackIds);

    // Total: published questions of the given courses that match the filters;
    // accessible: those whose course the packs open (or in an independent module)
    const totalQuestionCount = catalog.matchingSlots(filters).length;
    const accessibleQuestionCount = catalog.matchingSlots(filters, courseId => catalog.courseAccessible(courseId, packs)).length;

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
    filters: QuestionFilters,
    questionCount: number = MAX_SESSION_QUESTIONS,
    options: { shuffle?: boolean; maxQuestions?: number } = {}
  ): Promise<Array<{ id: number }>> {
    const catalog = await getQuestionCatalog(this.prisma);
    const packs = new Set(studyPackIds);
    const maxQuestions = options.maxQuestions ?? MAX_SESSION_QUESTIONS;
    const limit = Math.min(Math.max(1, Math.floor(questionCount) || maxQuestions), maxQuestions);

    const ids = catalog
      .matchingSlots(filters, courseId => catalog.courseAccessible(courseId, packs))
      .map(slot => catalog.id[slot]);

    if (options.shuffle === false) {
      // In question order (exams)
      ids.sort((a, b) => a - b);
    } else {
      // Random selection (Fisher-Yates)
      for (let i = ids.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [ids[i], ids[j]] = [ids[j], ids[i]];
      }
    }

    return ids.slice(0, limit).map(id => ({ id }));
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

    // Same score as the session's results screen, computed from its answers
    const stats = await this.getSessionStatsMany(sessions.map(session => session.id));

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
        score: session.status === 'COMPLETED' ? stats.get(session.id)!.percentage : null,
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
    const catalog = await getQuestionCatalog(this.prisma);
    const slots = catalog.residencySlots(universityId, examYear);

    const selected = parts && parts.length > 0
      ? slots.filter(slot => {
        const part = catalog.part.get(slot);
        return part !== undefined && parts.includes(part);
      })
      : slots;

    return selected.slice(0, MAX_SESSION_QUESTIONS).map(slot => ({ id: catalog.id[slot] }));
  }
}
