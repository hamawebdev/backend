import { inject, injectable, container } from "tsyringe";
import { SessionType, PackType, SessionStatus, RetakeType, YearLevel, QuestionType } from "@prisma/client";
import QuizRepository, { MAX_SESSION_QUESTIONS, MAX_EXAM_SESSION_QUESTIONS, PreparedAnswer, SessionStats } from "./quiz.repository";
import { formatSessionStats } from "./session-stats";
import QuestionService from "../questions/question.service";
import { AccessControlService } from "../../services/access-control.service";
import {
  CreateQuizSessionDto,
  CreateRetakeSessionDto,
  QuizFiltersResponse,
  ResidencySessionFiltersResponse,
  ExamSessionFiltersResponse,
  CreateSessionByQuestionsRequest,
  CreateSessionByQuestionsResponse,
  QuestionCountQuery,
  QuestionCountResponse,
  QuizSessionResponse,
  SubmitAnswerDto,
  QuizSessionQuestion,
  QuizSessionAnswer,
  QuestionAnswerOption,
  RetakeSessionResponse,
  UpdateSessionStatusDto,
  UpdateSessionStatusResponse,
  SubmitAnswerResponse
} from "../../types/quiz.types";
import { TJwtPayload } from "../../types/types";
import {
  SessionNotFoundError,
  SessionCompletedError,
  SessionStatusError,
  InsufficientQuestionsError,
  InvalidAnswerError,
  QuestionNotInSessionError,
  SubscriptionRequiredError,
  NoQuestionsFoundError,
  QuizCreationFailedError,
  InvalidQuizConfigurationError
} from "../../core/errors/QuizErrors";
import { BadRequestError, ForbiddenError } from "../../core/errors/AppError";

@injectable()
export default class QuizService {
  constructor(
    @inject(QuizRepository) private quizRepository: QuizRepository,
    @inject(QuestionService) private questionService: QuestionService
  ) { }

  async createQuizSession(
    createQuizSessionDto: CreateQuizSessionDto,
    user: TJwtPayload
  ): Promise<{ success: true; data: { sessionId: number } }> {
    const { title, quizType, settings, filters, type } = createQuizSessionDto;

    // Validate user has subscription access
    if (!user.has_active_subscription) {
      throw new SubscriptionRequiredError("quiz sessions");
    }

    // Validate configuration
    if (settings.questionCount > MAX_SESSION_QUESTIONS) {
      throw new InvalidQuizConfigurationError(`Question count cannot exceed ${MAX_SESSION_QUESTIONS}`);
    }

    if (settings.questionCount < 1) {
      throw new InvalidQuizConfigurationError("Question count must be at least 1");
    }

    // Convert QuizSessionFilters to UnifiedQuestionFilters format
    const unifiedFilters = {
      yearLevels: filters.yearLevels,
      courseIds: filters.courseIds,
      moduleIds: filters.moduleIds,
      uniteIds: filters.uniteIds,
      questionTypes: filters.questionTypes,
      examYears: filters.examYears,
      // The request schema names this filter quizSourceIds
      questionSourceIds: filters.questionSourceIds ?? (filters as any).quizSourceIds,
      quizYears: (filters as any).quizYears // preserve optional quizYears if provided
    };

    // Get questions based on filters using unified question service (a residency
    // subscription opens every study pack)
    const accessControlService = new AccessControlService();
    const studyPackIds = accessControlService.hasResidencyAccess(user)
      ? await this.quizRepository.getAllStudyPackIds()
      : user.accessible_study_packs;
    const questions = await this.questionService.getQuestionsWithFilters(
      unifiedFilters,
      studyPackIds,
      settings.questionCount
    );

    if (questions.length === 0) {
      throw new NoQuestionsFoundError(filters);
    }

    if (questions.length < settings.questionCount) {
      throw new InsufficientQuestionsError(settings.questionCount, questions.length);
    }

    try {
      // Determine session type (default PRACTICE if not provided)
      const sessionType = type ?? SessionType.PRACTICE;

      // Create the quiz session and its questions together
      const session = await this.quizRepository.createSessionWithQuestionIds(
        user.user_data.id,
        title,
        sessionType,
        questions.map(q => q.id),
        quizType
      );

      return {
        success: true,
        data: {
          sessionId: session.id
        }
      };
    } catch (error) {
      throw new QuizCreationFailedError("Database operation failed");
    }
  }

  async getQuizFilters(user: TJwtPayload): Promise<QuizFiltersResponse> {
    if (!user.has_active_subscription) {
      throw new SubscriptionRequiredError("quiz filters");
    }

    // Check if user has residency access
    const accessControlService = new AccessControlService();
    let studyPackIds: number[];

    if (accessControlService.hasResidencyAccess(user)) {
      // Residency users get access to ALL study packs (same as residency session filters)
      const allStudyPacks = await this.quizRepository.getAllStudyPackIds();
      studyPackIds = allStudyPacks;
    } else {
      // Regular users use their accessible study packs from JWT
      studyPackIds = user.accessible_study_packs;
    }

    // Get user's accessible year levels based on subscription
    const accessibleYearLevels = accessControlService.getAccessibleYearLevels(user);

    // Get filters data with year level filtering for question counts
    const filtersData = await this.quizRepository.getAvailableFilters(studyPackIds, accessibleYearLevels);

    // For residency users, return all accessible year levels regardless of database content
    // For other users, filter based on what's available in the database
    let finalAvailableYears: YearLevel[];

    if (accessControlService.hasResidencyAccess(user)) {
      // Residency users get all their accessible year levels
      finalAvailableYears = accessibleYearLevels;
    } else {
      // Regular users get intersection of database content and their access
      finalAvailableYears = filtersData.availableYears.filter(year =>
        accessibleYearLevels.includes(year)
      );
    }

    const filteredData = {
      ...filtersData,
      availableYears: finalAvailableYears
    };

    return {
      success: true,
      data: filteredData
    };
  }

  async getResidencySessionFilters(user: TJwtPayload): Promise<ResidencySessionFiltersResponse> {
    // Check if user has active subscription
    if (!user.has_active_subscription) {
      throw new SubscriptionRequiredError("residency session filters");
    }

    // Check if user has residency access
    const accessControlService = new AccessControlService();
    if (!accessControlService.hasResidencyAccess(user)) {
      throw new Error("Access denied. This endpoint is only available for users with active residency subscriptions.");
    }

    // Get universities with their exam years
    const universities = await this.quizRepository.getResidencyUniversities();

    return {
      success: true,
      data: {
        universities
      }
    };
  }

  /**
   * GET /quizzes/residency-available-parts
   * Returns available parts for a given university and exam year
   */
  async getResidencyAvailableParts(
    user: TJwtPayload,
    universityId: number,
    examYear: number
  ): Promise<{ parts: string[]; questionCount: number }> {
    if (!user.has_active_subscription) {
      throw new SubscriptionRequiredError("residency available parts");
    }

    const accessControlService = new AccessControlService();
    if (!accessControlService.hasResidencyAccess(user)) {
      throw new Error("Access denied. This endpoint is only available for users with active residency subscriptions.");
    }

    return await this.quizRepository.getResidencyAvailableParts(universityId, examYear);
  }

  async getQuizSession(
    sessionId: number,
    user: TJwtPayload
  ): Promise<QuizSessionResponse> {
    const session = await this.quizRepository.getQuizSessionById(
      sessionId,
      user.user_data.id
    );

    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }

    // Transform session data to response format with comprehensive question data
    const sessionWithIncludes = session as any;
    const questions: QuizSessionQuestion[] = sessionWithIncludes.sessionQuestions.map((sq: any) => ({
      id: sq.question.id,
      questionText: sq.question.questionText,
      // English translation, null until translated (clients fall back to French)
      questionTextEn: sq.question.questionTextEn ?? null,
      questionType: sq.question.questionType || 'SINGLE_CHOICE',
      explanation: sq.question.explanation || undefined,
      explanationEn: sq.question.explanationEn ?? null,
      tags: typeof sq.question.tags === 'string' ? JSON.parse(sq.question.tags || '[]') : (sq.question.tags || []),
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
      questionAnswers: sq.question.questionAnswers.map((qa: any) => ({
        id: qa.id,
        answerText: qa.answerText,
        answerTextEn: qa.answerTextEn ?? null,
        isCorrect: qa.isCorrect,
        explanation: qa.explanation || undefined,
        explanationEn: qa.explanationEn ?? null,
        explanationImages: qa.explanationImages.map((img: any) => ({
          id: img.id,
          imagePath: img.imagePath,
          altText: img.altText || undefined
        }))
      })),
      repetitionCount: sq.question.repetitionCount ?? 0,
      repetitionYears: typeof sq.question.repetitionYears === 'string' ? JSON.parse(sq.question.repetitionYears || '[]') : (sq.question.repetitionYears || []),
      createdAt: sq.question.createdAt,
      updatedAt: sq.question.updatedAt
    }));

    // Combine single choice and multiple choice attempts. Rows without an
    // answer (placeholders written by older versions) are not answers.
    // isCorrect is always a boolean, the verdict the results count.
    const singleChoiceAnswers: QuizSessionAnswer[] = sessionWithIncludes.quizAttempts
      .filter((attempt: any) => attempt.selectedAnswerId !== null || attempt.textAnswer !== null)
      .map((attempt: any) => ({
      questionId: attempt.questionId,
      selectedAnswerId: attempt.selectedAnswerId || undefined,
      textAnswer: attempt.textAnswer || undefined,
      isCorrect: attempt.isCorrect === true,
      answeredAt: attempt.answeredAt || undefined
    }));

    const multipleChoiceAnswers: QuizSessionAnswer[] = (sessionWithIncludes.multipleChoiceAttempts || []).map((attempt: any) => ({
      questionId: attempt.questionId,
      selectedAnswerIds: attempt.selectedAnswerIds ? JSON.parse(attempt.selectedAnswerIds) : undefined,
      isCorrect: attempt.isCorrect === true,
      partialScore: attempt.partialScore || undefined,
      answeredAt: attempt.answeredAt || undefined
    }));

    const answers: QuizSessionAnswer[] = [...singleChoiceAnswers, ...multipleChoiceAnswers];

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
  }

  async submitAnswers(
    sessionId: number,
    submitAnswerDto: SubmitAnswerDto,
    user: TJwtPayload
  ): Promise<SubmitAnswerResponse> {
    // Verify session belongs to user
    const session = await this.quizRepository.findOwnedSession(sessionId, user.user_data.id);

    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }

    if (session.status === SessionStatus.COMPLETED) {
      throw new SessionCompletedError(sessionId);
    }

    // Validate, score and store every answer, then score the session once
    const { results, stats } = await this.applyAnswers(sessionId, submitAnswerDto.answers);

    return {
      message: "Answers submitted successfully",
      results,
      ...formatSessionStats(stats)
    };
  }

  /**
   * Validate submitted answers against the session and their questions, score
   * them and store them. The question's type decides where an answer is
   * stored: multiple choice needs selectedAnswerIds, single choice a
   * selectedAnswerId, QROC a textAnswer (a single id for a multiple-choice
   * question, or a one-element list for a single-choice one, is accepted and
   * converted). Each question may appear only once per request.
   */
  private async applyAnswers(
    sessionId: number,
    answers: SubmitAnswerDto['answers']
  ): Promise<{ results: Array<{ questionId: number; isCorrect: boolean }>; stats: SessionStats }> {
    const seen = new Set<number>();
    for (const answer of answers) {
      if (seen.has(answer.questionId)) {
        throw new BadRequestError(`Question '${answer.questionId}' is answered more than once in this request`);
      }
      seen.add(answer.questionId);
    }

    // The session's questions and every submitted question's type and options, read
    // side by side
    const [sessionQuestionIdList, questions] = await Promise.all([
      this.quizRepository.getSessionQuestionIds(sessionId),
      this.quizRepository.getQuestionsForScoring(Array.from(seen))
    ]);

    // Validate answers belong to session questions
    const sessionQuestionIds = new Set(sessionQuestionIdList);
    const invalidQuestion = answers.find(answer => !sessionQuestionIds.has(answer.questionId));
    if (invalidQuestion) {
      throw new QuestionNotInSessionError(invalidQuestion.questionId, sessionId);
    }

    const questionById = new Map(questions.map(question => [question.id, question]));

    const prepared = answers.map(answer => {
      const question = questionById.get(answer.questionId);
      if (!question) {
        throw new QuestionNotInSessionError(answer.questionId, sessionId);
      }
      return this.prepareAnswer(answer, question);
    });

    const stats = await this.quizRepository.saveAnswers(sessionId, prepared);

    return {
      results: prepared.map(answer => ({ questionId: answer.questionId, isCorrect: answer.isCorrect })),
      stats
    };
  }

  private prepareAnswer(
    answer: SubmitAnswerDto['answers'][number],
    question: { id: number; questionType: QuestionType; questionAnswers: Array<{ id: number; isCorrect: boolean }> }
  ): PreparedAnswer {
    const optionIds = new Set(question.questionAnswers.map(option => option.id));
    const correctIds = new Set(question.questionAnswers.filter(option => option.isCorrect).map(option => option.id));

    if (question.questionType === QuestionType.MULTIPLE_CHOICE) {
      const selected = answer.selectedAnswerIds
        ?? (answer.selectedAnswerId !== undefined ? [answer.selectedAnswerId] : undefined);
      if (!selected || selected.length === 0) {
        throw new BadRequestError(`Question '${question.id}' is multiple choice: send selectedAnswerIds`);
      }
      const selectedIds = Array.from(new Set(selected));
      const invalidId = selectedIds.find(id => !optionIds.has(id));
      if (invalidId !== undefined) {
        throw new InvalidAnswerError(invalidId, question.id);
      }

      // Correct only when exactly the correct answers are selected
      const correctSelections = selectedIds.filter(id => correctIds.has(id)).length;
      const incorrectSelections = selectedIds.length - correctSelections;
      const isCorrect = correctIds.size > 0 && correctSelections === correctIds.size && incorrectSelections === 0;
      // Partial scoring: (correct selections - incorrect selections) / total correct answers, minimum 0
      const partialScore = correctIds.size > 0
        ? Math.max(0, (correctSelections - incorrectSelections) / correctIds.size)
        : 0;

      return { kind: 'MULTIPLE', questionId: question.id, selectedAnswerIds: selectedIds, isCorrect, partialScore };
    }

    if (question.questionType === QuestionType.QROC && answer.textAnswer !== undefined) {
      // Self-graded when the student reports isCorrect; otherwise needs manual correction
      return {
        kind: 'TEXT',
        questionId: question.id,
        textAnswer: answer.textAnswer,
        isCorrect: answer.isCorrect === true,
        userManualCorrection: answer.isCorrect !== undefined
      };
    }

    // Single choice (or a QROC answered by picking an option)
    let selectedAnswerId = answer.selectedAnswerId;
    if (selectedAnswerId === undefined && answer.selectedAnswerIds?.length === 1) {
      selectedAnswerId = answer.selectedAnswerIds[0];
    }
    if (selectedAnswerId === undefined) {
      throw new BadRequestError(
        question.questionType === QuestionType.QROC
          ? `Question '${question.id}' is a QROC: send textAnswer`
          : `Question '${question.id}' is single choice: send one selectedAnswerId`
      );
    }
    if (!optionIds.has(selectedAnswerId)) {
      throw new InvalidAnswerError(selectedAnswerId, question.id);
    }

    return { kind: 'SINGLE', questionId: question.id, selectedAnswerId, isCorrect: correctIds.has(selectedAnswerId) };
  }

  /**
   * GET /quiz-sessions/:sessionId/results
   * Returns computed session results with statistics
   * This is similar to the response from submitAnswers but can be called at any time
   */
  async getSessionResults(
    sessionId: number,
    user: TJwtPayload
  ): Promise<{
    sessionId: number;
    title: string;
    type: string;
    status: string;
    score: number;
    totalScore20: number;
    correctAnswersCount: number;
    incorrectAnswersCount: number;
    unansweredCount: number;
    totalQuestions: number;
    completedAt?: Date;
  }> {
    // Verify session belongs to user; each question counts once and rows without an
    // answer are ignored (the stats are read alongside and only used for the owner)
    const [session, stats] = await Promise.all([
      this.quizRepository.findOwnedSession(sessionId, user.user_data.id),
      this.quizRepository.getSessionStats(sessionId)
    ]);

    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }

    return {
      sessionId: session.id,
      title: session.title,
      type: session.type,
      status: session.status,
      ...formatSessionStats(stats),
      completedAt: session.completedAt || undefined
    };
  }

  async getUserQuizSessions(
    user: TJwtPayload,
    page: number = 1,
    limit: number = 10
  ): Promise<{
    success: true;
    data: {
      sessions: any[];
      pagination: {
        currentPage: number;
        totalPages: number;
        total: number;
        limit: number;
      };
    };
  }> {
    const { sessions, total } = await this.quizRepository.getUserQuizSessions(
      user.user_data.id,
      page,
      limit
    );

    const totalPages = Math.ceil(total / limit);

    // Same numbers as each session's results screen, computed from its answers
    const statsBySession = await this.quizRepository.getSessionStatsMany(sessions.map(session => session.id));

    const formattedSessions = sessions.map(session => {
      const sessionWithIncludes = session as any;
      const stats = statsBySession.get(session.id)!;
      return {
        id: session.id,
        title: session.title,
        type: session.type,
        status: session.status,
        score: stats.score,
        percentage: stats.percentage,
        questionsCount: stats.totalQuestions,
        answersCount: stats.answeredCount,
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
  }

  /**
   * GET /quiz-sessions/type/:sessionType - Canonical spec
   * Returns flat array (no pagination). Each session carries the same results
   * fields as GET /quiz-sessions/:sessionId/results (score is the percentage).
   */
  async getQuizSessionsByTypeCanonical(
    user: TJwtPayload,
    sessionType: SessionType
  ): Promise<Array<{
    id: number;
    title: string;
    type: string;
    status: string;
    createdAt: string;
    completedAt: string | null;
    score: number;
    totalScore20: number;
    correctAnswersCount: number;
    incorrectAnswersCount: number;
    unansweredCount: number;
    totalQuestions: number;
  }>> {
    // Get all sessions without pagination for canonical spec
    const { sessions } = await this.quizRepository.getUserQuizSessionsByType(
      user.user_data.id,
      sessionType,
      1000, // Large limit to get all sessions
      0
    );

    const statsBySession = await this.quizRepository.getSessionStatsMany(sessions.map((session: any) => session.id));

    return sessions.map((session: any) => ({
      id: session.id,
      title: session.title,
      type: session.type,
      status: session.status,
      createdAt: session.createdAt.toISOString(),
      completedAt: session.completedAt?.toISOString() || null,
      ...formatSessionStats(statsBySession.get(session.id)!)
    }));
  }

  private hasResidencyAccess(user: TJwtPayload): boolean {
    return user.subscriptions.some(sub =>
      sub.pack_type === PackType.RESIDENCY.toString()
    );
  }

  private validateQuizSessionAccess(user: TJwtPayload, filters: any): boolean {
    // Year-specific subscribers can only access their subscribed years
    if (!this.hasResidencyAccess(user)) {
      const userYear = user.user_data.currentYear;

      if (filters.yearLevels && filters.yearLevels.length > 0) {
        return filters.yearLevels.includes(userYear);
      }
    }

    return true;
  }

  async updateQuizAnswer(
    sessionId: number,
    questionId: number,
    selectedAnswerId: number,
    user: TJwtPayload
  ): Promise<{ success: true; message: string }> {
    // Verify session belongs to user
    const session = await this.quizRepository.findOwnedSession(sessionId, user.user_data.id);

    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }

    if (session.status === SessionStatus.COMPLETED) {
      throw new SessionCompletedError(sessionId);
    }

    // Same validation, scoring and storage as submit-answer
    await this.applyAnswers(sessionId, [{ questionId, selectedAnswerId }]);

    return {
      success: true,
      message: "Answer updated successfully"
    };
  }

  // ==========================================
  // RETAKE SESSION FUNCTIONALITY
  // ==========================================

  /**
   * Create a retake session - Canonical spec format
   * Returns { sessionId, questionCount, title }
   */
  async createRetakeSession(
    createRetakeSessionDto: CreateRetakeSessionDto,
    user: TJwtPayload
  ): Promise<{ sessionId: number; questionCount: number; title: string }> {
    const { originalSessionId, retakeType, title } = createRetakeSessionDto;

    // Validate user has subscription access
    if (!user.has_active_subscription) {
      throw new SubscriptionRequiredError("retake sessions");
    }

    // The route validates the body; guard anyway, since a missing id would
    // otherwise match every session in the queries below
    if (!Number.isInteger(originalSessionId) || originalSessionId <= 0) {
      throw new BadRequestError("originalSessionId must be a positive integer");
    }
    if (!Object.values(RetakeType).includes(retakeType)) {
      throw new InvalidQuizConfigurationError(`Invalid retake type: ${retakeType}`);
    }

    // Get original session and verify ownership
    const originalSession = await this.quizRepository.findOwnedSession(originalSessionId, user.user_data.id);

    if (!originalSession) {
      throw new SessionNotFoundError(originalSessionId);
    }

    // Original session must be completed to create retake
    if (originalSession.status !== SessionStatus.COMPLETED) {
      throw new SessionStatusError(originalSession.status, ["COMPLETED"]);
    }

    // Get questions based on retake type, from the verified session only; questions
    // unpublished since then are left out
    const questionIds = await this.quizRepository.filterPublishedQuestionIds(
      await this.getRetakeQuestionIds(originalSession.id, retakeType)
    );

    if (questionIds.length === 0) {
      throw new NoQuestionsFoundError({ retakeType });
    }

    try {
      // Generate retake session title
      const retakeTitle = title || this.generateRetakeTitle(originalSession.title, retakeType);

      // Create the retake session and its questions atomically
      const retakeSession = await this.quizRepository.createRetakeSession(
        user.user_data.id,
        retakeTitle,
        originalSession.type,
        originalSession.id,
        retakeType,
        questionIds,
        originalSession.quizType || undefined
      );

      // Canonical spec format
      return {
        sessionId: retakeSession.id,
        questionCount: retakeSession.questionCount,
        title: retakeTitle
      };

    } catch (error) {
      console.error("Error creating retake session:", error);
      throw new QuizCreationFailedError("Failed to create retake session");
    }
  }

  private async getRetakeQuestionIds(originalSessionId: number, retakeType: RetakeType): Promise<number[]> {
    switch (retakeType) {
      case RetakeType.SAME:
        return await this.quizRepository.getSessionQuestionIds(originalSessionId);

      case RetakeType.INCORRECT_ONLY:
        return await this.quizRepository.getIncorrectQuestionIds(originalSessionId);

      case RetakeType.CORRECT_ONLY:
        return await this.quizRepository.getCorrectQuestionIds(originalSessionId);

      case RetakeType.NOT_RESPONDED:
        return await this.quizRepository.getNotRespondedQuestionIds(originalSessionId);

      default:
        throw new InvalidQuizConfigurationError(`Invalid retake type: ${retakeType}`);
    }
  }

  private generateRetakeTitle(originalTitle: string, retakeType: RetakeType): string {
    const retakeTypeLabels = {
      [RetakeType.SAME]: "Retake",
      [RetakeType.INCORRECT_ONLY]: "Incorrect Only",
      [RetakeType.CORRECT_ONLY]: "Correct Only",
      [RetakeType.NOT_RESPONDED]: "Unanswered Only"
    };

    return `${originalTitle} - ${retakeTypeLabels[retakeType]}`;
  }

  async deleteQuizSession(
    sessionId: number,
    user: TJwtPayload
  ): Promise<{ success: true; message: string }> {
    // Verify session belongs to user
    const session = await this.quizRepository.getSessionHeader(sessionId, user.user_data.id);

    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }

    try {
      await this.quizRepository.deleteQuizSession(sessionId);
      return {
        success: true,
        message: "Session deleted successfully"
      };
    } catch (error: any) {
      if (error.code === 'P2025') {
        // Record to delete does not exist (already deleted)
        throw new SessionNotFoundError(sessionId);
      }
      throw error;
    }
  }

  /**
   * Update session status with proper authorization and validation
   * Canonical spec: returns { message, sessionId, status }
   */
  async updateSessionStatus(
    sessionId: number,
    updateStatusDto: UpdateSessionStatusDto,
    user: TJwtPayload
  ): Promise<{ message: string; sessionId: number; status: string }> {
    const { status } = updateStatusDto;

    // Get session and verify ownership or admin/employee access
    const session = await this.quizRepository.getSessionHeader(sessionId, user.user_data.id);

    if (!session) {
      // If user is admin/employee, try to get session without user restriction
      if (user.user_data.role === 'ADMIN' || user.user_data.role === 'EMPLOYEE') {
        const adminSession = await this.quizRepository.getSessionHeader(sessionId);
        if (!adminSession) {
          throw new SessionNotFoundError(sessionId);
        }
        // Use admin session for further processing
        const updatedSession = await this.updateSessionStatusInternal(sessionId, status, adminSession.userId);
        return this.formatSessionStatusResponse(updatedSession, "Session status updated successfully by admin");
      } else {
        throw new SessionNotFoundError(sessionId);
      }
    }

    // For regular users, validate status transition
    if (!this.quizRepository.isValidStatusTransition(session.status, status)) {
      throw new SessionStatusError(session.status, this.getValidTransitions(session.status));
    }

    // Update session status
    const updatedSession = await this.updateSessionStatusInternal(sessionId, status, session.userId);

    return this.formatSessionStatusResponse(updatedSession, "Session status updated successfully");
  }

  /**
   * Internal method to update session status
   */
  private async updateSessionStatusInternal(
    sessionId: number,
    status: SessionStatus,
    userId: number
  ) {
    return await this.quizRepository.updateSessionStatus(sessionId, status, userId);
  }

  /**
   * Format session status response - Canonical spec format
   */
  private formatSessionStatusResponse(session: any, message: string): { message: string; sessionId: number; status: string } {
    return {
      message,
      sessionId: session.id,
      status: session.status
    };
  }

  /**
   * Get valid status transitions for current status
   */
  private getValidTransitions(currentStatus: SessionStatus): string[] {
    const validTransitions: Record<SessionStatus, string[]> = {
      [SessionStatus.NOT_STARTED]: ["IN_PROGRESS", "COMPLETED"],
      [SessionStatus.IN_PROGRESS]: ["COMPLETED", "NOT_STARTED"],
      [SessionStatus.COMPLETED]: ["NOT_STARTED"]
    };

    return validTransitions[currentStatus] || [];
  }

  async getExamSessionFilters(user: TJwtPayload): Promise<ExamSessionFiltersResponse> {
    if (!user.has_active_subscription) {
      throw new SubscriptionRequiredError("exam session filters");
    }

    // Check if user has residency access
    const accessControlService = new AccessControlService();
    let studyPackIds: number[];

    if (accessControlService.hasResidencyAccess(user)) {
      // Residency users get access to ALL study packs
      const allStudyPacks = await this.quizRepository.getAllStudyPackIds();
      studyPackIds = allStudyPacks;
    } else {
      // Regular users use their accessible study packs from JWT
      studyPackIds = user.accessible_study_packs;
    }

    const filtersData = await this.quizRepository.getExamSessionFilters(studyPackIds);

    return {
      success: true,
      data: filtersData
    };
  }

  async createPracticeSessionByLabel(
    user: TJwtPayload,
    labelId: number
  ): Promise<{ success: true; data: { sessionId: number; questionCount: number; title: string } }> {
    if (!user.has_active_subscription) {
      throw new SubscriptionRequiredError("create practice session");
    }

    // First, check if the label exists and belongs to the user
    const studentRepository = container.resolve('StudentRepository') as any;
    const labelExists = await studentRepository.labelExistsForUser(labelId, user.user_data.id);

    if (!labelExists) {
      throw new BadRequestError(`Label with ID ${labelId} not found or you do not have permission to access it`);
    }

    // Get the label details to use its name as the session title
    const label = await studentRepository.getStudentLabelByIdWithQuestionIds(labelId, user.user_data.id);

    if (!label) {
      throw new BadRequestError(`Label with ID ${labelId} not found`);
    }

    // Get all question IDs associated with this label (unpublished questions are left out)
    const questionIds = await this.quizRepository.filterPublishedQuestionIds(
      await this.quizRepository.getQuestionIdsByLabelId(labelId, user.user_data.id)
    );

    if (questionIds.length === 0) {
      throw new BadRequestError(`No questions found for label "${label.name}". Please add questions to this label first.`);
    }

    // Determine accessible study packs for validation
    const accessControlService = new AccessControlService();
    let studyPackIds: number[];

    if (accessControlService.hasResidencyAccess(user)) {
      // Residency users get access to ALL study packs
      const allStudyPacks = await this.quizRepository.getAllStudyPackIds();
      studyPackIds = allStudyPacks;
    } else {
      // Regular users use their accessible study packs from JWT
      studyPackIds = user.accessible_study_packs;
    }

    // Validate question access (course-less residency questions need residency access)
    const allowCourseless = accessControlService.hasResidencyAccess(user)
      || user.user_data.role === 'ADMIN' || user.user_data.role === 'EMPLOYEE';
    const validation = await this.quizRepository.validateQuestionAccess(questionIds, studyPackIds, allowCourseless);

    // Check for invalid question IDs
    if (validation.invalidIds.length > 0) {
      throw new BadRequestError(`Some questions in this label are no longer available: ${validation.invalidIds.join(', ')}`);
    }

    // Check for inaccessible question IDs
    if (validation.inaccessibleIds.length > 0) {
      throw new ForbiddenError(`You don't have access to some questions in this label: ${validation.inaccessibleIds.join(', ')}`);
    }

    // Create the session with the label name as title
    const sessionTitle = `Practice: ${label.name}`;
    const session = await this.quizRepository.createSessionWithQuestions(
      user.user_data.id,
      sessionTitle,
      SessionType.PRACTICE,
      questionIds
    );

    return {
      success: true,
      data: {
        sessionId: session.id,
        questionCount: session.questionCount,
        title: sessionTitle
      }
    };
  }

  async createSessionByQuestions(
    user: TJwtPayload,
    request: CreateSessionByQuestionsRequest
  ): Promise<CreateSessionByQuestionsResponse> {
    if (!user.has_active_subscription) {
      throw new SubscriptionRequiredError("create quiz session");
    }

    const { title, type, questionIds } = request;

    // Determine accessible study packs
    const accessControlService = new AccessControlService();
    let studyPackIds: number[];

    if (accessControlService.hasResidencyAccess(user)) {
      // Residency users get access to ALL study packs
      const allStudyPacks = await this.quizRepository.getAllStudyPackIds();
      studyPackIds = allStudyPacks;
    } else {
      // Regular users use their accessible study packs from JWT
      studyPackIds = user.accessible_study_packs;
    }

    // Validate question access (course-less residency questions need residency access)
    const allowCourseless = accessControlService.hasResidencyAccess(user)
      || user.user_data.role === 'ADMIN' || user.user_data.role === 'EMPLOYEE';
    const validation = await this.quizRepository.validateQuestionAccess(questionIds, studyPackIds, allowCourseless);

    // Check for invalid question IDs
    if (validation.invalidIds.length > 0) {
      throw new BadRequestError(`Question IDs not found: ${validation.invalidIds.join(', ')}`);
    }

    // Check for inaccessible question IDs
    if (validation.inaccessibleIds.length > 0) {
      throw new ForbiddenError(`You don't have access to questions: ${validation.inaccessibleIds.join(', ')}`);
    }

    // Create the session
    const sessionType = type === 'PRACTICE' ? SessionType.PRACTICE : SessionType.EXAM;
    const session = await this.quizRepository.createSessionWithQuestions(
      user.user_data.id,
      title,
      sessionType,
      questionIds
    );

    return {
      success: true,
      data: {
        sessionId: session.id,
        type: type,
        questionCount: session.questionCount,
        status: session.status,
        createdAt: session.createdAt.toISOString()
      }
    };
  }

  async getQuestionCount(
    user: TJwtPayload,
    filters: QuestionCountQuery
  ): Promise<QuestionCountResponse> {
    if (!user.has_active_subscription) {
      throw new SubscriptionRequiredError("question count");
    }

    // Determine accessible study packs
    const accessControlService = new AccessControlService();
    let studyPackIds: number[];

    if (accessControlService.hasResidencyAccess(user)) {
      // Residency users get access to ALL study packs
      const allStudyPacks = await this.quizRepository.getAllStudyPackIds();
      studyPackIds = allStudyPacks;
    } else {
      // Regular users use their accessible study packs from JWT
      studyPackIds = user.accessible_study_packs;
    }

    // Get question count with filters
    const totalQuestions = await this.quizRepository.getQuestionCount(studyPackIds, filters);

    return {
      success: true,
      data: {
        totalQuestions
      }
    };
  }

  // ==========================================
  // CANONICAL SPEC ENDPOINTS
  // ==========================================

  /**
   * GET /quizzes/session-filters - Canonical spec
   * Returns filter options with question counts for session creation
   * Optional filters: { uniteId, moduleId } for cascading filter behavior
   */
  async getSessionFilters(
    user: TJwtPayload,
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
    if (!user.has_active_subscription) {
      throw new SubscriptionRequiredError("session filters");
    }

    const accessControlService = new AccessControlService();
    let studyPackIds: number[];

    if (accessControlService.hasResidencyAccess(user)) {
      const allStudyPacks = await this.quizRepository.getAllStudyPackIds();
      studyPackIds = allStudyPacks;
    } else {
      studyPackIds = user.accessible_study_packs;
    }

    return await this.quizRepository.getSessionFiltersCanonical(studyPackIds, filters);
  }

  /**
   * POST /quizzes/question-count - Canonical spec
   * Returns totalQuestionCount and accessibleQuestionCount based on filters
   */
  async getQuestionCountCanonical(
    user: TJwtPayload,
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
    if (!user.has_active_subscription) {
      throw new SubscriptionRequiredError("question count");
    }

    const accessControlService = new AccessControlService();
    let studyPackIds: number[];

    if (accessControlService.hasResidencyAccess(user)) {
      const allStudyPacks = await this.quizRepository.getAllStudyPackIds();
      studyPackIds = allStudyPacks;
    } else {
      studyPackIds = user.accessible_study_packs;
    }

    return await this.quizRepository.getQuestionCountCanonical(studyPackIds, filters);
  }

  /**
   * GET /quizzes/questions-by-unite-or-module - Canonical spec
   * Returns questions for a specific unite or module
   */
  async getQuestionsByUniteOrModule(
    user: TJwtPayload,
    uniteId?: number,
    moduleId?: number,
    page?: number,
    limit?: number
  ): Promise<{ questions: any[]; pagination: { page: number; limit: number; total: number; totalPages: number; hasMore: boolean } }> {
    if (!user.has_active_subscription) {
      throw new SubscriptionRequiredError("questions");
    }

    const accessControlService = new AccessControlService();
    let studyPackIds: number[];

    if (accessControlService.hasResidencyAccess(user)) {
      const allStudyPacks = await this.quizRepository.getAllStudyPackIds();
      studyPackIds = allStudyPacks;
    } else {
      studyPackIds = user.accessible_study_packs;
    }

    return await this.quizRepository.getQuestionsByUniteOrModule(studyPackIds, uniteId, moduleId, page, limit);
  }

  /**
   * POST /quizzes/sessions - Canonical spec
   * Creates a quiz session and returns { sessionId }
   */
  async createQuizSessionCanonical(
    dto: {
      title: string;
      courseIds: number[];
      sessionType: string;
      questionCount?: number;
      questionTypes?: string[];
      years?: number[];
      rotations?: string[];
      universityIds?: number[];
      questionSourceIds?: number[];
      repetitionCountMin?: number;
      repetitionYears?: number[];
    },
    user: TJwtPayload,
    options?: { includeSession?: boolean }
  ): Promise<{ sessionId: number; questionCount: number; session?: QuizSessionResponse }> {
    if (!user.has_active_subscription) {
      throw new SubscriptionRequiredError("quiz sessions");
    }

    const accessControlService = new AccessControlService();
    let studyPackIds: number[];

    if (accessControlService.hasResidencyAccess(user)) {
      const allStudyPacks = await this.quizRepository.getAllStudyPackIds();
      studyPackIds = allStudyPacks;
    } else {
      studyPackIds = user.accessible_study_packs;
    }

    // Map sessionType to Prisma enum
    const sessionType = dto.sessionType === 'PRACTISE' ? SessionType.PRACTICE : SessionType.EXAM;

    // Practice: a random selection of matching questions (at most MAX_SESSION_QUESTIONS).
    // Exam: every matching question of the module, source and year(s), in question
    // order, so the exam is complete (the web sends no questionCount for exams).
    const isExam = sessionType === SessionType.EXAM;
    const maxQuestions = isExam ? MAX_EXAM_SESSION_QUESTIONS : MAX_SESSION_QUESTIONS;
    const questionCount = Math.min(dto.questionCount ?? maxQuestions, maxQuestions);
    const questions = await this.quizRepository.getQuestionsForCanonicalSession(studyPackIds, {
      courseIds: dto.courseIds,
      questionTypes: dto.questionTypes,
      years: dto.years,
      rotations: dto.rotations,
      universityIds: dto.universityIds,
      questionSourceIds: dto.questionSourceIds,
      repetitionCountMin: dto.repetitionCountMin,
      repetitionYears: dto.repetitionYears
    }, questionCount, { shuffle: !isExam, maxQuestions });

    if (questions.length === 0) {
      throw new NoQuestionsFoundError({ courseIds: dto.courseIds });
    }

    // Create the session and its questions together
    const session = await this.quizRepository.createSessionWithQuestionIds(
      user.user_data.id,
      dto.title,
      sessionType,
      questions.map(q => q.id)
    );

    // ?include=session: the session as GET /quiz-sessions/:id returns it, so the web
    // can open it without another request
    if (options?.includeSession) {
      return { sessionId: session.id, questionCount: session.questionCount, session: await this.getQuizSession(session.id, user) };
    }
    return { sessionId: session.id, questionCount: session.questionCount };
  }

  // ==========================================
  // RESIDENCY SESSION ENDPOINTS (Canonical spec)
  // ==========================================

  /**
   * GET /quizzes/residency-sessions-only - Canonical spec
   * Returns array of residency sessions for the logged-in user
   */
  async getResidencySessionsOnlyCanonical(user: TJwtPayload): Promise<any[]> {
    if (!user.has_active_subscription) {
      throw new SubscriptionRequiredError("residency sessions");
    }

    // Check if user has residency access
    const accessControlService = new AccessControlService();
    if (!accessControlService.hasResidencyAccess(user)) {
      throw new ForbiddenError("Access denied. This endpoint is only available for users with active residency subscriptions.");
    }

    return await this.quizRepository.getResidencySessionsOnlyCanonical(user.user_data.id);
  }

  /**
   * POST /quizzes/residency-sessions - Canonical spec
   * Creates a residency session. Body: {title, examYear, universityId, parts?}
   * Returns 201: {sessionId, questionCount, title}
   */
  async createResidencySessionCanonical(
    user: TJwtPayload,
    dto: {
      title: string;
      examYear: number;
      universityId: number;
      parts?: string[];
    }
  ): Promise<{ sessionId: number; questionCount: number; title: string }> {
    if (!user.has_active_subscription) {
      throw new SubscriptionRequiredError("residency sessions");
    }

    // Check if user has residency access
    const accessControlService = new AccessControlService();
    if (!accessControlService.hasResidencyAccess(user)) {
      throw new ForbiddenError("Access denied. This endpoint is only available for users with active residency subscriptions.");
    }

    // Residency questions of that university and exam year; parts only filter
    // when some are given, so questions without a part are included otherwise
    const questions = await this.quizRepository.getQuestionsForResidencySession(
      dto.universityId,
      dto.examYear,
      dto.parts && dto.parts.length > 0 ? dto.parts : undefined
    );

    if (questions.length === 0) {
      throw new NoQuestionsFoundError({ universityId: dto.universityId, examYear: dto.examYear });
    }

    // Create the session
    const session = await this.quizRepository.createSessionWithQuestions(
      user.user_data.id,
      dto.title,
      SessionType.PRACTICE,
      questions.map(q => q.id)
    );

    return {
      sessionId: session.id,
      questionCount: session.questionCount,
      title: dto.title
    };
  }

}
