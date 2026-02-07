import { inject, injectable, container } from "tsyringe";
import { SessionType, PackType, SessionStatus, RetakeType, YearLevel } from "@prisma/client";
import QuizRepository from "./quiz.repository";
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
    if (settings.questionCount > 100) {
      throw new InvalidQuizConfigurationError("Question count cannot exceed 100");
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
      questionSourceIds: filters.questionSourceIds,
      quizYears: (filters as any).quizYears // preserve optional quizYears if provided
    };

    // Get questions based on filters using unified question service
    const questions = await this.questionService.getQuestionsWithFilters(
      unifiedFilters,
      user.accessible_study_packs,
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

      // Create quiz session with requested type
      const session = await this.quizRepository.createQuizSession(
        user.user_data.id,
        title,
        sessionType,
        quizType
      );

      // Add questions to session
      const questionIds = questions.map(q => q.id);
      await this.quizRepository.addQuestionsToSession(session.id, questionIds);

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

    // Get residency-specific filter data
    const filtersData = await this.quizRepository.getResidencySessionFilters();

    // For residency users, ensure all year levels are available (same logic as regular quiz-filters)
    const availableYears: YearLevel[] = [
      YearLevel.ONE, YearLevel.TWO, YearLevel.THREE,
      YearLevel.FOUR, YearLevel.FIVE, YearLevel.SIX, YearLevel.SEVEN
    ];

    // Define session difficulty levels (additional residency-specific feature)
    const sessionDifficultyLevels = [
      {
        level: 'EASY' as const,
        name: 'Easy',
        description: 'Basic concepts and fundamental knowledge'
      },
      {
        level: 'MEDIUM' as const,
        name: 'Medium',
        description: 'Intermediate level with clinical applications'
      },
      {
        level: 'HARD' as const,
        name: 'Hard',
        description: 'Advanced concepts and complex scenarios'
      },
      {
        level: 'EXPERT' as const,
        name: 'Expert',
        description: 'Expert level for residency preparation'
      }
    ];

    return {
      success: true,
      data: {
        // Same structure as regular quiz-filters
        availableYears,
        singleChoiceQuestionCount: filtersData.singleChoiceQuestionCount,
        multipleChoiceQuestionCount: filtersData.multipleChoiceQuestionCount,
        unites: filtersData.unites,
        availableQuizYears: filtersData.availableQuizYears,
        questionSources: filtersData.questionSources,
        // Additional residency-specific fields
        availableSpecialties: filtersData.availableSpecialties,
        universities: filtersData.universities,
        sessionDifficultyLevels,
        parts: ["Sciences fondamentales", "Pathologie medico-chirurgical", "Dossier clinique"],
        totalQuestionCount: filtersData.totalQuestionCount
      }
    };
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
      questionType: sq.question.questionType || 'SINGLE_CHOICE',
      explanation: sq.question.explanation || undefined,
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
        isCorrect: qa.isCorrect,
        explanation: qa.explanation || undefined,
        explanationImages: qa.explanationImages.map((img: any) => ({
          id: img.id,
          imagePath: img.imagePath,
          altText: img.altText || undefined
        }))
      })),
      createdAt: sq.question.createdAt,
      updatedAt: sq.question.updatedAt
    }));

    // Combine single choice and multiple choice attempts
    const singleChoiceAnswers: QuizSessionAnswer[] = sessionWithIncludes.quizAttempts.map((attempt: any) => ({
      questionId: attempt.questionId,
      selectedAnswerId: attempt.selectedAnswerId || undefined,
      textAnswer: attempt.textAnswer || undefined,
      isCorrect: attempt.isCorrect || undefined,
      answeredAt: attempt.answeredAt || undefined
    }));

    const multipleChoiceAnswers: QuizSessionAnswer[] = (sessionWithIncludes.multipleChoiceAttempts || []).map((attempt: any) => ({
      questionId: attempt.questionId,
      selectedAnswerIds: attempt.selectedAnswerIds ? JSON.parse(attempt.selectedAnswerIds) : undefined,
      isCorrect: attempt.isCorrect || undefined,
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
    const session = await this.quizRepository.getQuizSessionById(
      sessionId,
      user.user_data.id
    );

    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }

    if (session.status === SessionStatus.COMPLETED) {
      throw new SessionCompletedError(sessionId);
    }

    // Validate answers belong to session questions
    const sessionQuestionIds = await this.quizRepository.getSessionQuestionIds(sessionId);
    const invalidQuestions = submitAnswerDto.answers.filter(
      answer => !sessionQuestionIds.includes(answer.questionId)
    );

    if (invalidQuestions.length > 0) {
      throw new QuestionNotInSessionError(
        invalidQuestions[0].questionId,
        sessionId
      );
    }

    // Validate answers belong to questions
    for (const answer of submitAnswerDto.answers) {
      if (answer.selectedAnswerId !== undefined) {
        // Single choice validation
        const isValidAnswer = await this.quizRepository.validateAnswerBelongsToQuestion(
          answer.selectedAnswerId,
          answer.questionId
        );

        if (!isValidAnswer) {
          throw new InvalidAnswerError(answer.selectedAnswerId, answer.questionId);
        }
      } else if (answer.selectedAnswerIds !== undefined) {
        // Multiple choice validation
        const areValidAnswers = await this.quizRepository.validateAnswersBelongToQuestion(
          answer.selectedAnswerIds,
          answer.questionId
        );

        if (!areValidAnswers) {
          throw new InvalidAnswerError(answer.selectedAnswerIds[0], answer.questionId);
        }
      } else if (answer.textAnswer !== undefined) {
        // QROC validation - implicit validity for text answers
        // We can trust that if it has textAnswer, it's an attempt for QROC
      }
    }

    // Submit answers and get results - Canonical spec format
    const results = await this.quizRepository.submitAnswersWithResults(sessionId, submitAnswerDto.answers);

    // Fetch refreshed session to get accurate cumulative stats (after upsert)
    const refreshedSession = await this.quizRepository.getQuizSessionById(sessionId, user.user_data.id);
    if (!refreshedSession) {
      throw new SessionNotFoundError(sessionId);
    }

    // Cast to any to access included relations
    const sessionWithIncludes = refreshedSession as any;

    // Count total unique questions in the session
    const totalQuestions = sessionWithIncludes.sessionQuestions.length;

    // Count attempts from both single and multiple choice tables
    // Note: getQuizSessionById generally includes quizAttempts (single) and multipleChoiceAttempts
    // We need to count unique questions answered
    const singleChoiceAttempts = sessionWithIncludes.quizAttempts || [];
    const multipleChoiceAttempts = sessionWithIncludes.multipleChoiceAttempts || [];

    // Calculate stats based on DB state
    const singleCorrect = singleChoiceAttempts.filter((a: any) => a.isCorrect).length;
    const multipleCorrect = multipleChoiceAttempts.filter((a: any) => a.isCorrect).length;

    const correctAnswersCount = singleCorrect + multipleCorrect;
    const totalAnsweredCount = singleChoiceAttempts.length + multipleChoiceAttempts.length;

    const incorrectAnswersCount = totalAnsweredCount - correctAnswersCount;
    const unansweredCount = totalQuestions - totalAnsweredCount;

    // Use the score calculated by the repository (which handles partials)
    const dbScore = refreshedSession.score; // This is the total points (including partials)

    // Calculate score out of 20
    const totalScore20 = totalQuestions > 0
      ? Number(((dbScore / totalQuestions) * 20).toFixed(2))
      : 0;

    // Percentage score from DB
    const score = refreshedSession.percentage;

    return {
      message: "Answers submitted successfully",
      results,
      score,
      totalScore20,
      correctAnswersCount,
      incorrectAnswersCount,
      unansweredCount,
      totalQuestions

    };
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
    // Verify session belongs to user
    const session = await this.quizRepository.getQuizSessionById(
      sessionId,
      user.user_data.id
    );

    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }

    // Cast to any to access included relations
    const sessionWithIncludes = session as any;

    // Count total unique questions in the session
    const totalQuestions = sessionWithIncludes.sessionQuestions.length;

    // Count attempts from both single and multiple choice tables
    const singleChoiceAttempts = sessionWithIncludes.quizAttempts || [];
    const multipleChoiceAttempts = sessionWithIncludes.multipleChoiceAttempts || [];

    // Calculate stats based on DB state
    const singleCorrect = singleChoiceAttempts.filter((a: any) => a.isCorrect).length;
    const multipleCorrect = multipleChoiceAttempts.filter((a: any) => a.isCorrect).length;

    const correctAnswersCount = singleCorrect + multipleCorrect;
    const totalAnsweredCount = singleChoiceAttempts.length + multipleChoiceAttempts.length;

    const incorrectAnswersCount = totalAnsweredCount - correctAnswersCount;
    const unansweredCount = totalQuestions - totalAnsweredCount;

    // Use the score calculated by the repository (which handles partials)
    const dbScore = session.score; // This is the total points (including partials)

    // Calculate score out of 20
    const totalScore20 = totalQuestions > 0
      ? Number(((dbScore / totalQuestions) * 20).toFixed(2))
      : 0;

    // Percentage score from DB
    const score = session.percentage;

    return {
      sessionId: session.id,
      title: session.title,
      type: session.type,
      status: session.status,
      score,
      totalScore20,
      correctAnswersCount,
      incorrectAnswersCount,
      unansweredCount,
      totalQuestions,
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

    const formattedSessions = sessions.map(session => {
      const sessionWithIncludes = session as any;
      return {
        id: session.id,
        title: session.title,
        type: session.type,
        status: session.status,
        score: session.score,
        percentage: session.percentage,
        questionsCount: sessionWithIncludes._count.sessionQuestions,
        answersCount: sessionWithIncludes._count.quizAttempts,
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
   * Returns flat array (no pagination)
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
  }>> {
    // Get all sessions without pagination for canonical spec
    const { sessions } = await this.quizRepository.getUserQuizSessionsByType(
      user.user_data.id,
      sessionType,
      1000, // Large limit to get all sessions
      0
    );

    return sessions.map((session: any) => ({
      id: session.id,
      title: session.title,
      type: session.type,
      status: session.status,
      createdAt: session.createdAt.toISOString(),
      completedAt: session.completedAt?.toISOString() || null,
      score: session.percentage || 0
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
    const session = await this.quizRepository.getQuizSessionById(
      sessionId,
      user.user_data.id
    );

    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }

    if (session.status === SessionStatus.COMPLETED) {
      throw new SessionCompletedError(sessionId);
    }

    // Validate question belongs to session
    const sessionQuestionIds = await this.quizRepository.getSessionQuestionIds(sessionId);
    if (!sessionQuestionIds.includes(questionId)) {
      throw new QuestionNotInSessionError(questionId, sessionId);
    }

    // Validate answer belongs to question
    const isValidAnswer = await this.quizRepository.validateAnswerBelongsToQuestion(
      selectedAnswerId,
      questionId
    );

    if (!isValidAnswer) {
      throw new InvalidAnswerError(selectedAnswerId, questionId);
    }

    // Update single answer
    await this.quizRepository.submitAnswers(sessionId, [{
      questionId,
      selectedAnswerId
    }]);

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

    // Get original session and verify ownership
    const originalSession = await this.quizRepository.getQuizSessionById(
      originalSessionId,
      user.user_data.id
    );

    if (!originalSession) {
      throw new SessionNotFoundError(originalSessionId);
    }

    // Original session must be completed to create retake
    if (originalSession.status !== SessionStatus.COMPLETED) {
      throw new SessionStatusError(originalSession.status, ["COMPLETED"]);
    }

    // Get questions based on retake type
    const questionIds = await this.getRetakeQuestionIds(originalSessionId, retakeType);

    if (questionIds.length === 0) {
      throw new NoQuestionsFoundError({ retakeType });
    }

    try {
      // Generate retake session title
      const retakeTitle = title || this.generateRetakeTitle(originalSession.title, retakeType);

      // Create retake session
      const retakeSession = await this.quizRepository.createRetakeSession(
        user.user_data.id,
        retakeTitle,
        originalSession.type,
        originalSessionId,
        retakeType,
        originalSession.quizType || undefined
      );

      // Add questions to retake session
      await this.quizRepository.addQuestionsToSession(retakeSession.id, questionIds);

      // Canonical spec format
      return {
        sessionId: retakeSession.id,
        questionCount: questionIds.length,
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
    const session = await this.quizRepository.getQuizSessionById(
      sessionId,
      user.user_data.id
    );

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
    const session = await this.quizRepository.getQuizSessionById(sessionId, user.user_data.id);

    if (!session) {
      // If user is admin/employee, try to get session without user restriction
      if (user.user_data.role === 'ADMIN' || user.user_data.role === 'EMPLOYEE') {
        const adminSession = await this.quizRepository.getQuizSessionById(sessionId);
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

    // Get all question IDs associated with this label
    const questionIds = await this.quizRepository.getQuestionIdsByLabelId(labelId, user.user_data.id);

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

    // Validate question access
    const validation = await this.quizRepository.validateQuestionAccess(questionIds, studyPackIds);

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
        questionCount: questionIds.length,
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

    // Validate question access
    const validation = await this.quizRepository.validateQuestionAccess(questionIds, studyPackIds);

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
        questionCount: questionIds.length,
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
    moduleId?: number
  ): Promise<{ questions: any[] }> {
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

    return await this.quizRepository.getQuestionsByUniteOrModule(studyPackIds, uniteId, moduleId);
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
    },
    user: TJwtPayload
  ): Promise<{ sessionId: number }> {
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

    // Get questions matching the filters (with optional count limit)
    const questions = await this.quizRepository.getQuestionsForCanonicalSession(studyPackIds, {
      courseIds: dto.courseIds,
      questionTypes: dto.questionTypes,
      years: dto.years,
      universityIds: dto.universityIds,
      questionSourceIds: dto.questionSourceIds
    }, dto.questionCount);

    if (questions.length === 0) {
      throw new NoQuestionsFoundError({ courseIds: dto.courseIds });
    }

    // Create the session
    const session = await this.quizRepository.createQuizSession(
      user.user_data.id,
      dto.title,
      sessionType
    );

    // Add questions to session
    await this.quizRepository.addQuestionsToSession(session.id, questions.map(q => q.id));

    return { sessionId: session.id };
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

    // Default parts to all if not specified
    const parts = dto.parts || ["Sciences fondamentales", "Pathologie medico-chirurgical", "Dossier clinique"];

    // Get questions matching the filters (universityId and examYear)
    const questions = await this.quizRepository.getQuestionsForResidencySession(
      dto.universityId,
      dto.examYear,
      parts
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
      questionCount: questions.length,
      title: dto.title
    };
  }

}