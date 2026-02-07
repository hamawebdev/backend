import { inject, injectable } from "tsyringe";
import { PackType, SessionType } from "@prisma/client";
import ExamRepository from "./exam.repository";
import { AvailableExamsResponse } from "../../types/quiz.types";
import { TJwtPayload } from "../../types/types";
import {
  ExamNotFoundError,
  ExamNotAvailableError,
  SubscriptionRequiredError,
  AccessDeniedError,
  NoQuestionsFoundError
} from "../../core/errors/QuizErrors";
import { BadRequestError } from "../../core/errors/AppError";

@injectable()
export default class ExamService {
  constructor(
    @inject(ExamRepository) private examRepository: ExamRepository
  ) {}

  /**
   * Get available exams - Canonical spec format
   * Without moduleId: returns { items: [...] }
   * With moduleId: returns { examsByYear: [...], residencyExams: {...} }
   */
  async getAvailableExams(
    year: string | undefined,
    user: TJwtPayload,
    moduleId?: number
  ): Promise<any> {
    if (!user.has_active_subscription) {
      throw new SubscriptionRequiredError("exams");
    }

    const hasResidencyAccess = this.hasResidencyAccess(user);

    const examData = await this.examRepository.getAvailableExams(
      year,
      user.accessible_study_packs,
      user.user_data.currentYear,
      hasResidencyAccess,
      moduleId
    );

    // Canonical spec: different response format based on moduleId
    if (moduleId) {
      // With moduleId: return examsByYear and residencyExams
      return {
        examsByYear: examData.examsByYear.map(yearGroup => ({
          year: yearGroup.year,
          exams: yearGroup.exams.map(exam => ({
            id: exam.id,
            title: exam.title,
            university: {
              id: (exam as any).universityId || 0,
              name: exam.university
            },
            yearLevel: exam.yearLevel,
            year: exam.year,
            module: {
              id: exam.module.id,
              name: exam.module.name
            }
          }))
        })),
        residencyExams: {
          available: examData.residencyExams.available,
          yearsAvailable: examData.residencyExams.yearsAvailable,
          exams: examData.residencyExams.exams.map(exam => ({
            id: exam.id,
            title: exam.title,
            university: {
              id: (exam as any).universityId || 0,
              name: exam.university
            },
            yearLevel: exam.yearLevel,
            year: exam.year,
            module: {
              id: exam.module.id,
              name: exam.module.name
            }
          }))
        }
      };
    } else {
      // Without moduleId: return items array
      const allExams = examData.examsByYear.flatMap(yearGroup => yearGroup.exams);
      return {
        items: allExams.map(exam => ({
          id: exam.id,
          title: exam.title,
          university: {
            id: (exam as any).universityId || 0,
            name: exam.university
          },
          yearLevel: exam.yearLevel,
          year: exam.year,
          module: {
            id: exam.module.id,
            name: exam.module.name
          },
          isActive: true, // Default value - field not in schema
          startDate: null, // Field not in schema
          endDate: null // Field not in schema
        }))
      };
    }
  }

  /**
   * Get exam details - Canonical spec format
   * Returns flat exam object with all fields
   */
  async getExamDetails(
    examId: number,
    user: TJwtPayload
  ): Promise<{
    id: number;
    title: string;
    university: { id: number; name: string };
    yearLevel: string;
    year: number;
    module: { id: number; name: string };
    isActive: boolean;
    startDate: string | null;
    endDate: string | null;
    duration: number | null;
    questionCount: number;
    passingScore: number | null;
  }> {
    if (!user.has_active_subscription) {
      throw new SubscriptionRequiredError("exam details");
    }

    const exam = await this.examRepository.getExamById(examId);

    if (!exam) {
      throw new ExamNotFoundError(examId);
    }

    // Check if user can access this exam
    const hasResidencyAccess = this.hasResidencyAccess(user);
    const canAccess = hasResidencyAccess ||
      exam.yearLevel === user.user_data.currentYear;

    if (!canAccess) {
      throw new AccessDeniedError("this exam", "insufficient subscription level or year mismatch");
    }

    // Canonical spec format: flat exam object
    return {
      id: exam.id,
      title: exam.title,
      university: {
        id: (exam as any).university.id,
        name: (exam as any).university.name
      },
      yearLevel: exam.yearLevel,
      year: exam.year,
      module: {
        id: (exam as any).module.id,
        name: (exam as any).module.name
      },
      isActive: true, // Default value - field not in schema
      startDate: null, // Field not in schema
      endDate: null, // Field not in schema
      duration: null, // Field not in schema
      questionCount: (exam as any).examQuestions.length,
      passingScore: null // Field not in schema
    };
  }

  /**
   * Get exam questions - Canonical spec format
   * Returns { questions: [...] } with questionType and images
   */
  async getExamQuestions(
    examId: number,
    user: TJwtPayload
  ): Promise<{
    questions: Array<{
      id: number;
      questionText: string;
      questionType: string;
      answers: Array<{
        id: number;
        answerText: string;
        isCorrect: boolean;
      }>;
      explanation: string | null;
      images: Array<{
        imagePath: string;
        altText: string | null;
      }>;
    }>;
  }> {
    if (!user.has_active_subscription) {
      throw new SubscriptionRequiredError("exam questions");
    }

    const exam = await this.examRepository.getExamById(examId);

    if (!exam) {
      throw new ExamNotFoundError(examId);
    }

    // Check if user can access this exam
    const hasResidencyAccess = this.hasResidencyAccess(user);
    const canAccess = hasResidencyAccess ||
      exam.yearLevel === user.user_data.currentYear;

    if (!canAccess) {
      throw new AccessDeniedError("this exam", "insufficient subscription level or year mismatch");
    }

    const questions = await this.examRepository.getExamQuestions(examId);

    // Canonical spec format: questions with questionType and images
    const formattedQuestions = questions.map(question => ({
      id: question.id,
      questionText: question.questionText,
      questionType: question.questionType,
      answers: question.questionAnswers.map((answer: any) => ({
        id: answer.id,
        answerText: answer.answerText,
        isCorrect: answer.isCorrect
      })),
      explanation: question.explanation,
      images: question.questionImages?.map((img: any) => ({
        imagePath: img.imagePath,
        altText: img.altText
      })) || []
    }));

    return {
      questions: formattedQuestions
    };
  }

  /**
   * Get exams by module and year - Canonical spec format
   * Returns array directly with detailed exam info
   */
  async getExamsByModuleAndYear(
    moduleId: number,
    year: number,
    user: TJwtPayload
  ): Promise<Array<{
    id: number | null;
    title: string;
    university: { id: number; name: string } | null;
    yearLevel: string;
    year: number;
    module: { id: number; name: string };
    isActive: boolean;
    questionCount: number;
    duration: number | null;
  }>> {
    if (!user.has_active_subscription) {
      throw new SubscriptionRequiredError("exams");
    }

    const hasResidencyAccess = this.hasResidencyAccess(user);

    const exams = await this.examRepository.getExamsByModuleAndYear(
      moduleId,
      year,
      user.user_data.currentYear,
      hasResidencyAccess
    );

    // Canonical spec format: return array directly
    return exams.map(exam => ({
      id: exam.id,
      title: exam.title,
      university: exam.university ? {
        id: exam.university.id || 0,
        name: exam.university.name
      } : null,
      yearLevel: exam.yearLevel,
      year: exam.year,
      module: {
        id: exam.module?.id || 0,
        name: exam.module?.name || 'Unknown'
      },
      isActive: true, // Default value - field not in schema
      questionCount: exam.questionCount,
      duration: null // Field not in schema
    }));
  }

  async createExamSession(
    examId: number,
    user: TJwtPayload
  ): Promise<{
    success: true;
    data: {
      sessionId: number;
      message: string;
    };
  }> {
    if (!user.has_active_subscription) {
      throw new SubscriptionRequiredError("exam sessions");
    }

    const exam = await this.examRepository.getExamById(examId);

    if (!exam) {
      throw new ExamNotFoundError(examId);
    }

    // Check if user can access this exam
    const hasResidencyAccess = this.hasResidencyAccess(user);
    const canAccess = hasResidencyAccess ||
      exam.yearLevel === user.user_data.currentYear;

    if (!canAccess) {
      throw new AccessDeniedError("this exam", "insufficient subscription level or year mismatch");
    }

    // Get exam questions
    const questions = await this.examRepository.getExamQuestions(examId);

    if (questions.length === 0) {
      throw new NoQuestionsFoundError({ examId });
    }

    // Create exam session
    const sessionId = await this.examRepository.createExamSession(
      user.user_data.id,
      examId,
      exam.title,
      questions.map(q => q.id)
    );

    return {
      success: true,
      data: {
        sessionId,
        message: `Exam session created successfully with ${questions.length} questions`
      }
    };
  }

  async createExamSessionFromModules(
    moduleIds: number[],
    year: number,
    user: TJwtPayload
  ): Promise<{
    success: true;
    data: {
      sessionId: number;
      message: string;
      examCount: number;
      questionCount: number;
    };
  }> {
    if (!user.has_active_subscription) {
      throw new SubscriptionRequiredError("exam sessions");
    }

    if (moduleIds.length === 0) {
      throw new BadRequestError("At least one module must be selected");
    }

    const hasResidencyAccess = this.hasResidencyAccess(user);

    // Get all exams from the selected modules and year
    const allExams = [];
    for (const moduleId of moduleIds) {
      const moduleExams = await this.examRepository.getExamsByModuleAndYear(
        moduleId,
        year,
        user.user_data.currentYear,
        hasResidencyAccess
      );
      allExams.push(...moduleExams);
    }

    if (allExams.length === 0) {
      throw new NoQuestionsFoundError({ moduleIds, year });
    }

    // Collect all questions from all exams
    const allQuestions = [];
    for (const exam of allExams) {
      const questions = await this.examRepository.getExamQuestions(exam.id);
      allQuestions.push(...questions);
    }

    if (allQuestions.length === 0) {
      throw new NoQuestionsFoundError({ moduleIds, year });
    }

    // Create a combined exam session
    const sessionTitle = `Mixed Practice - ${moduleIds.length} Module(s) - ${year}`;
    const sessionId = await this.examRepository.createExamSession(
      user.user_data.id,
      allExams[0].id, // Use first exam as reference
      sessionTitle,
      allQuestions.map(q => q.id)
    );

    return {
      success: true,
      data: {
        sessionId,
        message: `Exam session created successfully from ${allExams.length} exams`,
        examCount: allExams.length,
        questionCount: allQuestions.length
      }
    };
  }

  private hasResidencyAccess(user: TJwtPayload): boolean {
    return user.subscriptions.some(sub =>
      sub.pack_type === 'residency' || sub.pack_type === 'RESIDENCY'
    );
  }
} 