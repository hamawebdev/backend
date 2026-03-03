import {
  Question,
  QuizSession,
  QuizAttempt,
  YearLevel,
  SessionType,
  SessionStatus,
  QuestionAnswer,

  QuizType,
  RetakeType,
  PrismaClient
} from "@prisma/client";
import { inject, injectable } from "tsyringe";
import PrismaService from "../../config/db";
import { QuizSessionFilters } from "../../types/quiz.types";

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
    const whereConditions: any = {};

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
    const sessionQuestions = questionIds.map(questionId => ({
      sessionId,
      questionId
    }));

    await this.prisma.quizSessionQuestion.createMany({
      data: sessionQuestions
    });
  }

  async getQuizSessionById(
    sessionId: number,
    userId?: number
  ): Promise<QuizSession | null> {
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
  }

  async submitAnswers(
    sessionId: number,
    answers: Array<{ questionId: number; selectedAnswerId?: number; selectedAnswerIds?: number[]; textAnswer?: string; isCorrect?: boolean }>
  ): Promise<void> {
    for (const answer of answers) {
      if (answer.selectedAnswerId !== undefined) {
        // Single choice question
        await this.submitSingleChoiceAnswer(sessionId, answer.questionId, answer.selectedAnswerId);
      } else if (answer.selectedAnswerIds !== undefined) {
        // Multiple choice question
        await this.submitMultipleChoiceAnswer(sessionId, answer.questionId, answer.selectedAnswerIds);
      } else if (answer.textAnswer !== undefined) {
        // QROC question
        await this.submitTextAnswerWithResult(sessionId, answer.questionId, answer.textAnswer, answer.isCorrect);
      }
    }
  }

  /**
   * Submit answers and return results with isCorrect for each - Canonical spec
   */
  async submitAnswersWithResults(
    sessionId: number,
    answers: Array<{ questionId: number; selectedAnswerId?: number; selectedAnswerIds?: number[]; textAnswer?: string; isCorrect?: boolean }>
  ): Promise<Array<{ questionId: number; isCorrect: boolean }>> {
    const results: Array<{ questionId: number; isCorrect: boolean }> = [];

    for (const answer of answers) {
      let isCorrect = false;

      if (answer.selectedAnswerId !== undefined) {
        // Single choice question
        isCorrect = await this.submitSingleChoiceAnswerWithResult(sessionId, answer.questionId, answer.selectedAnswerId);
      } else if (answer.selectedAnswerIds !== undefined) {
        // Multiple choice question
        isCorrect = await this.submitMultipleChoiceAnswerWithResult(sessionId, answer.questionId, answer.selectedAnswerIds);
      } else if (answer.textAnswer !== undefined) {
        // QROC question
        isCorrect = await this.submitTextAnswerWithResult(sessionId, answer.questionId, answer.textAnswer, answer.isCorrect);
      }

      results.push({ questionId: answer.questionId, isCorrect });
    }

    return results;
  }

  async submitSingleChoiceAnswerWithResult(
    sessionId: number,
    questionId: number,
    selectedAnswerId: number
  ): Promise<boolean> {
    // Get correct answer for validation
    const correctAnswer = await this.prisma.questionAnswer.findFirst({
      where: {
        questionId,
        isCorrect: true
      }
    });

    const isCorrect = correctAnswer?.id === selectedAnswerId;

    // Use upsert to handle duplicate submissions
    await this.prisma.quizAttempt.upsert({
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
    await this.updateSessionScore(sessionId);

    return isCorrect;
  }

  async submitMultipleChoiceAnswerWithResult(
    sessionId: number,
    questionId: number,
    selectedAnswerIds: number[]
  ): Promise<boolean> {
    // Get all correct answers for this question
    const correctAnswers = await this.prisma.questionAnswer.findMany({
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
    await this.prisma.multipleChoiceAttempt.upsert({
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
    await this.updateSessionScore(sessionId);

    return isCorrect;
  }

  async submitTextAnswerWithResult(
    sessionId: number,
    questionId: number,
    textAnswer: string,
    isCorrectInput?: boolean
  ): Promise<boolean> {
    // For QROC, we trust the self-grading input if provided, otherwise default to false (needs manual correction)
    // In future, we might add regex matching or keyword matching here
    const isCorrect = isCorrectInput === true;
    const userManualCorrection = isCorrectInput !== undefined;

    // Use upsert to handle duplicate submissions
    await this.prisma.quizAttempt.upsert({
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
    await this.updateSessionScore(sessionId);

    return isCorrect;
  }

  async submitSingleChoiceAnswer(
    sessionId: number,
    questionId: number,
    selectedAnswerId: number
  ): Promise<void> {
    // Get correct answer for validation
    const correctAnswer = await this.prisma.questionAnswer.findFirst({
      where: {
        questionId,
        isCorrect: true
      }
    });

    const isCorrect = correctAnswer?.id === selectedAnswerId;

    // Use upsert to handle duplicate submissions
    await this.prisma.quizAttempt.upsert({
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
    await this.updateSessionScore(sessionId);
  }

  async submitMultipleChoiceAnswer(
    sessionId: number,
    questionId: number,
    selectedAnswerIds: number[]
  ): Promise<void> {
    // Get all correct answers for this question
    const correctAnswers = await this.prisma.questionAnswer.findMany({
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
    await this.prisma.multipleChoiceAttempt.upsert({
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
    await this.updateSessionScore(sessionId);
  }

  private async updateSessionScore(sessionId: number): Promise<void> {
    // Get total number of questions in the session
    const sessionQuestions = await this.prisma.quizSessionQuestion.findMany({
      where: { sessionId },
      select: { questionId: true }
    });

    const totalQuestions = sessionQuestions.length;

    if (totalQuestions === 0) {
      return; // No questions in session, nothing to calculate
    }

    // Get all single choice attempts
    const singleChoiceAttempts = await this.prisma.quizAttempt.findMany({
      where: { sessionId }
    });

    // Get all multiple choice attempts
    const multipleChoiceAttempts = await this.prisma.multipleChoiceAttempt.findMany({
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
        } else if (attempt.partialScore && attempt.partialScore > 0) {
          totalScore += attempt.partialScore; // Partial credit for partially correct
        }
      }
    }

    // Calculate percentage
    const percentage = totalQuestions > 0 ? (totalScore / totalQuestions) * 100 : 0;

    // Determine session status
    const allAnswered = answeredQuestions >= totalQuestions;
    const status = allAnswered ? SessionStatus.COMPLETED : SessionStatus.IN_PROGRESS;

    // Update session with calculated scores
    await this.prisma.quizSession.update({
      where: { id: sessionId },
      data: {
        score: totalScore,
        percentage: Math.round(percentage * 100) / 100, // Round to 2 decimal places
        status,
        ...(status === SessionStatus.COMPLETED && { completedAt: new Date() }),
        ...(status === SessionStatus.IN_PROGRESS && !await this.isSessionStarted(sessionId)
          ? { startedAt: new Date() } : {})
      }
    });
  }

  private async isSessionStarted(sessionId: number): Promise<boolean> {
    const session = await this.prisma.quizSession.findUnique({
      where: { id: sessionId },
      select: { startedAt: true }
    });
    return session?.startedAt !== null;
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
                  select: { questions: true }
                }
              }
            }
          }
        }
      }
    });

    // Get question type counts by course, filtered by accessible year levels
    const courseQuestionTypeCountsWhere: any = {
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
      const questionSourcesRaw = await this.prisma.$queryRaw`
        SELECT qs.id, qs.name, COUNT(q.id) as question_count
        FROM question_sources qs
        LEFT JOIN questions q ON q.source_id = qs.id
        LEFT JOIN courses c ON q.course_id = c.id
        LEFT JOIN modules m ON c.module_id = m.id
        LEFT JOIN unites u ON m.unite_id = u.id
        WHERE u.study_pack_id IN (${accessibleStudyPackIds.join(',')})
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
    const universitiesData = await this.prisma.university.findMany({
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
    const questions = await this.prisma.question.findMany({
      where: {
        universityId,
        examYear
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
    const canonicalOrder = [
      "Sciences_fondamentales",
      "Pathologie_medico_chirurgical",
      "Dossier_clinique"
    ];

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
            questionSingleChoiceIds: number[];
            questionMultipleChoiceIds: number[];
          }>;
        }>;
      }>;
    }>;
  }> {
    // Get all questions with their hierarchical relationships
    const questions = await this.prisma.question.findMany({
      where: {
        course: {
          module: {
            OR: [
              { unite: { studyPackId: { in: accessibleStudyPackIds } } },
              { uniteId: null }
            ]
          } as any
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
    const uniteMap = new Map<number, {
      id: number;
      title: string;
      modules: Map<number, {
        id: number;
        title: string;
        universities: Map<number, {
          id: number;
          name: string;
          years: Map<number, {
            year: number;
            questionSingleCount: number;
            questionMultipleCount: number;
            questionSingleChoiceIds: number[];
            questionMultipleChoiceIds: number[];
          }>;
        }>;
      }>;
    }>();

    questions.forEach(question => {
      if (!question.course) return; // Skip if course is null

      const uniteId = question.course.module.unite?.id ?? 0;
      const moduleId = question.course.module.id;
      const universityId = question.universityId!;
      // Use examYear if available, otherwise use a default year (e.g., 9999 for "No Year Specified")
      const year = question.examYear || 9999;

      // Initialize unite if not exists
      if (!uniteMap.has(uniteId)) {
        uniteMap.set(uniteId, {
          id: uniteId,
          title: question.course.module.unite?.name ?? 'Unknown',
          modules: new Map()
        });
      }

      const unite = uniteMap.get(uniteId)!;

      // Initialize module if not exists
      if (!unite.modules.has(moduleId)) {
        unite.modules.set(moduleId, {
          id: moduleId,
          title: question.course.module.name,
          universities: new Map()
        });
      }

      const module = unite.modules.get(moduleId)!;

      // Initialize university if not exists
      if (!module.universities.has(universityId)) {
        module.universities.set(universityId, {
          id: universityId,
          name: question.university!.name,
          years: new Map()
        });
      }

      const university = module.universities.get(universityId)!;

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

      const yearData = university.years.get(year)!;

      // Add question to appropriate arrays and update counts
      if (question.questionType === 'SINGLE_CHOICE') {
        yearData.questionSingleCount++;
        yearData.questionSingleChoiceIds.push(question.id);
      } else if (question.questionType === 'MULTIPLE_CHOICE') {
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
    const sessionQuestions = await this.prisma.quizSessionQuestion.findMany({
      where: { sessionId },
      select: { questionId: true }
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

  async createRetakeSession(
    userId: number,
    title: string,
    type: SessionType,
    originalSessionId: number,
    retakeType: RetakeType,
    quizType?: QuizType
  ): Promise<QuizSession> {
    return await this.prisma.quizSession.create({
      data: {
        userId,
        title,
        type,
        quizType,
        status: SessionStatus.NOT_STARTED,
        originalSessionId,
        retakeType,
        isRetake: true
      }
    });
  }

  async getIncorrectQuestionIds(sessionId: number): Promise<number[]> {
    const incorrectAttempts = await this.prisma.quizAttempt.findMany({
      where: {
        sessionId,
        isCorrect: false,
        selectedAnswerId: { not: null } // Only answered questions
      },
      select: { questionId: true }
    });

    return incorrectAttempts.map(attempt => attempt.questionId);
  }

  async getCorrectQuestionIds(sessionId: number): Promise<number[]> {
    const correctAttempts = await this.prisma.quizAttempt.findMany({
      where: {
        sessionId,
        isCorrect: true
      },
      select: { questionId: true }
    });

    return correctAttempts.map(attempt => attempt.questionId);
  }

  async getNotRespondedQuestionIds(sessionId: number): Promise<number[]> {
    const notRespondedAttempts = await this.prisma.quizAttempt.findMany({
      where: {
        sessionId,
        selectedAnswerId: null // Questions that were not answered
      },
      select: { questionId: true }
    });

    return notRespondedAttempts.map(attempt => attempt.questionId);
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
  async validateQuestionAccess(questionIds: number[], accessibleStudyPackIds: number[]): Promise<{
    existingQuestions: Question[];
    invalidIds: number[];
    inaccessibleIds: number[];
  }> {
    // Get all questions with the provided IDs
    const existingQuestions = await this.prisma.question.findMany({
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
   * Create a quiz session with specific questions
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
      where: { courseId: { in: filters.courseIds } }
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
   * Returns questions for a specific unite or module
   */
  async getQuestionsByUniteOrModule(
    studyPackIds: number[],
    uniteId?: number,
    moduleId?: number
  ): Promise<{ questions: any[] }> {
    const whereClause: any = {
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

    const questions = await this.prisma.question.findMany({
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
  }

  /**
   * POST /quizzes/sessions - Canonical spec
   * Get questions for creating a canonical session
   * @param questionCount - Optional limit for number of questions. If provided, questions are randomly selected.
   */
  async getQuestionsForCanonicalSession(
    studyPackIds: number[],
    filters: {
      courseIds: number[];
      questionTypes?: string[];
      years?: number[];
      universityIds?: number[];
      questionSourceIds?: number[];
      repetitionCountMin?: number;
      repetitionYears?: number[];
    },
    questionCount?: number
  ): Promise<Array<{ id: number }>> {
    const whereClause: any = {
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
      const allQuestions = await this.prisma.question.findMany({
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
    const questions = await this.prisma.question.findMany({
      where: whereClause,
      select: { id: true }
    });

    return questions;
  }

  // ==========================================
  // RESIDENCY SESSION ENDPOINTS (Canonical spec)
  // ==========================================

  /**
   * GET /quizzes/residency-sessions-only - Canonical spec
   * Returns array of residency sessions for the logged-in user
   */
  async getResidencySessionsOnlyCanonical(userId: number): Promise<any[]> {
    const sessions = await this.prisma.quizSession.findMany({
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
      // Get the first question's university and examYear as representative
      const firstQuestion = session.sessionQuestions[0]?.question;
      const university = firstQuestion?.university;
      const examYear = firstQuestion?.examYear;

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
        completedAt: session.completedAt?.toISOString() || null
      };
    });
  }

  /**
   * Get questions for residency session by universityId and examYear
   */
  async getQuestionsForResidencySession(
    universityId: number,
    examYear: number,
    parts: string[]
  ): Promise<Array<{ id: number }>> {
    const questions = await this.prisma.question.findMany({
      where: {
        universityId,
        examYear
      },
      select: { id: true, metadata: true }
    });

    // Filter locally by parsing metadata if parts are provided
    if (parts && parts.length > 0) {
      return questions.filter(q => {
        if (!q.metadata) return false;
        try {
          const meta = JSON.parse(q.metadata);
          return meta.part && parts.includes(meta.part);
        } catch {
          return false;
        }
      }).map(q => ({ id: q.id }));
    }

    return questions.map(q => ({ id: q.id }));
  }
}
