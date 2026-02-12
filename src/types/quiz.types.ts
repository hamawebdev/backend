import { SessionType, SessionStatus, YearLevel, QuizType, RetakeType, QuestionType } from "@prisma/client";

// Re-export QuestionType for use in other modules
export { QuestionType };

// Quiz Session Creation DTOs
export interface CreateQuizSessionDto {
  title: string;
  quizType?: QuizType; // QCM/QCS support
  type?: SessionType; // NEW: allow client to set session type (PRACTICE/EXAM/MOCK)
  settings: {
    questionCount: number;
  };
  filters: QuizSessionFilters;
}

// Retake Session Creation DTOs
export interface CreateRetakeSessionDto {
  originalSessionId: number;
  retakeType: RetakeType;
  title?: string; // Optional custom title
}

export interface QuizSessionFilters {
  yearLevels?: YearLevel[];
  uniteIds?: number[];
  moduleIds?: number[];
  courseIds?: number[];
  quizYears?: number[];
  questionTypes?: QuestionType[]; // New field for question type filtering
  examYears?: number[]; // New field for exam year filtering
  questionSourceIds?: number[]; // New field for question source filtering
  repetitionCountMin?: number; // Filter questions with repetitionCount >= value
  repetitionYears?: number[]; // Filter questions where repetitionYears contains any of these years
}

// New types for student session result filtering
export interface StudentSessionResultsFilters {
  // Filter by answer correctness
  answerType?: 'correct' | 'incorrect' | 'all';
  // Filter by specific session IDs
  sessionIds?: number[];
  // Filter by session type (exam/quiz)
  sessionType?: SessionType;
  // Filter by exam/quiz ID
  examId?: number;
  quizId?: number;
  // Date range filtering
  completedAfter?: Date;
  completedBefore?: Date;
}

export interface StudentQuestionResult {
  questionId: number;
  questionText: string;
  explanation?: string;
  selectedAnswerId?: number;
  correctAnswerId: number;
  isCorrect?: boolean;
  answeredAt?: Date;
  sessionId: number;
  sessionTitle: string;
  sessionType: SessionType;
  completedAt?: Date;
  // Include answer options for context
  answers: {
    id: number;
    answerText: string;
    isCorrect: boolean;
    explanation?: string;
  }[];
}

export interface StudentSessionResultsResponse {
  questions: StudentQuestionResult[];
  summary: {
    totalQuestions: number;
    correctAnswers: number;
    incorrectAnswers: number;
    unansweredQuestions: number;
    averageScore: number;
    sessionsIncluded: number;
  };
  pagination: {
    currentPage: number;
    totalPages: number;
    total: number;
    limit: number;
  };
}



// Question Source Types
export interface QuestionSource {
  id: number;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface QuestionSourceFilter {
  id: number;
  name: string;
  questionCount: number;
}

// Quiz Filter Response Types
export interface QuizFiltersResponse {
  success: true;
  data: {
    availableYears: YearLevel[];
    singleChoiceQuestionCount: number;
    multipleChoiceQuestionCount: number;
    unites: UniteFilter[];
    availableQuizYears: number[];
    questionSources: QuestionSourceFilter[];
  };
}

export interface UniteFilter {
  id: number;
  name: string;
  year: YearLevel;
  modules: ModuleFilter[];
}

export interface ModuleFilter {
  id: number;
  name: string;
  courses: CourseFilter[];
}

export interface CourseFilter {
  id: number;
  name: string;
  questionCount: number;
  singleChoiceQuestionCount: number;
  multipleChoiceQuestionCount: number;
}

// Residency Session Filter Types (same structure as QuizFiltersResponse with additional fields)
export interface ResidencySessionFiltersResponse {
  success: true;
  data: {
    availableYears: YearLevel[];
    singleChoiceQuestionCount: number;
    multipleChoiceQuestionCount: number;
    unites: UniteFilter[];
    availableQuizYears: number[];
    questionSources: QuestionSourceFilter[];
    // Additional residency-specific fields
    availableSpecialties: SpecialtyFilter[];
    sessionDifficultyLevels: DifficultyLevel[];
    parts: string[];
    universities: Array<{ id: number; name: string; examYears: number[] }>;
    totalQuestionCount: number;
  };
}

export interface SpecialtyFilter {
  id: number;
  name: string;
  questionCount: number;
  availableYears: YearLevel[];
}

export interface DifficultyLevel {
  level: 'EASY' | 'MEDIUM' | 'HARD' | 'EXPERT';
  name: string;
  description: string;
}

// Exam Response Types
export interface AvailableExamsResponse {
  success: true;
  data: {
    examsByYear: ExamsByYear[];
    residencyExams: {
      available: boolean;
      yearsAvailable: string[];
      exams: ExamInfo[];
    };
  };
}

export interface ExamsByYear {
  year: string;
  exams: ExamInfo[];
}

export interface ExamInfo {
  id: number;
  title: string;
  university: string;
  yearLevel: YearLevel;
}

// Quiz Session Management
export interface SubmitAnswerDto {
  answers: Array<{
    questionId: number;
    selectedAnswerId?: number; // For single choice questions
    selectedAnswerIds?: number[]; // For multiple choice questions
    textAnswer?: string; // For QROC questions
    isCorrect?: boolean; // For QROC self-grading
  }>;
}

export interface SubmitAnswerResponse {
  message: string;
  results: Array<{ questionId: number; isCorrect: boolean }>;
  score: number; // Percentage
  totalScore20: number;
  correctAnswersCount: number;
  incorrectAnswersCount: number;
  unansweredCount: number;
  totalQuestions: number;
}

export interface QuizSessionResponse {
  id: number;
  title: string;
  type: SessionType;
  status: SessionStatus;
  startedAt?: Date;
  completedAt?: Date;
  score: number;
  percentage: number;
  questions: QuizSessionQuestion[];
  answers: QuizSessionAnswer[];
  createdAt: Date;
  updatedAt: Date;
}

export interface QuizSessionQuestion {
  id: number;
  questionText: string;
  explanation?: string;
  answers: QuestionAnswerOption[];
}

export interface QuestionAnswerOption {
  id: number;
  answerText: string;
  isCorrect: boolean;
  explanation?: string;
  explanationImages: ExplanationImageInfo[];
}

export interface ExplanationImageInfo {
  id: number;
  imagePath: string;
  altText?: string;
}

export interface QuizSessionAnswer {
  questionId: number;
  selectedAnswerId?: number; // For single choice questions
  selectedAnswerIds?: number[]; // For multiple choice questions
  textAnswer?: string; // For QROC questions
  isCorrect?: boolean;
  partialScore?: number; // For partial credit in multiple choice
  answeredAt?: Date;
}

// Multiple Choice Specific Types
export interface MultipleChoiceSubmissionDto {
  questionId: number;
  selectedAnswerIds: number[];
}

export interface SingleChoiceSubmissionDto {
  questionId: number;
  selectedAnswerId: number;
}

// Updated Question Response with Type Information
export interface QuizSessionQuestion {
  id: number;
  questionText: string;
  questionType?: QuestionType;
  explanation?: string;
  tags?: string[];
  yearLevel?: YearLevel;
  examYear?: number;
  metadata?: string;
  questionImages: EnhancedQuestionImage[];
  questionExplanationImages: EnhancedQuestionImage[];
  university?: EnhancedUniversity;
  course?: EnhancedCourse;
  source?: EnhancedQuestionSource;
  questionAnswers: QuizSessionAnswer[];
  repetitionCount: number;
  repetitionYears: number[];
  createdAt: Date;
  updatedAt: Date;
}

// Student Progress Types
export interface StudentProgressOverview {
  success: true;
  data: {
    completedCourses: CourseProgress[];
    quizScores: QuizScore[];
    examResults: ExamResult[];
    overallStats: OverallStats;
  };
}

export interface CourseProgress {
  courseId: number;
  courseName: string;
  moduleId: number;
  moduleName: string;
  uniteId: number;
  uniteName: string;
  layer1Completed: boolean;
  layer2Completed: boolean;
  layer3Completed: boolean;
  progressPercentage: number;
}

export interface QuizScore {
  sessionId: number;
  title: string;
  type: SessionType;
  score: number;
  percentage: number;
  completedAt: Date;
}

export interface ExamResult {
  sessionId: number;
  examTitle: string;
  examYear: string;
  score: number;
  percentage: number;
  completedAt: Date;
}

export interface OverallStats {
  totalQuizzesTaken: number;
  averageQuizScore: number;
  totalExamsTaken: number;
  averageExamScore: number;
  coursesInProgress: number;
  coursesCompleted: number;
}



// Exam Session Filter Types
export interface ExamSessionFiltersResponse {
  success: true;
  data: {
    unites: UniteExamFilter[];
  };
}

export interface UniteExamFilter {
  id: number;
  title: string;
  modules: ModuleExamFilter[];
}

export interface ModuleExamFilter {
  id: number;
  title: string;
  universities: UniversityExamFilter[];
}

export interface UniversityExamFilter {
  id: number;
  name: string;
  years: YearExamFilter[];
}

export interface YearExamFilter {
  year: number;
  questionSingleCount: number;
  questionMultipleCount: number;
  questionSingleChoiceIds: number[];
  questionMultipleChoiceIds: number[];
}

// Create Session by Questions Types
export interface CreateSessionByQuestionsRequest {
  title: string;
  type: 'PRACTICE' | 'EXAM';
  questionIds: number[];
}

export interface CreateSessionByQuestionsResponse {
  success: true;
  data: {
    sessionId: number;
    type: 'PRACTICE' | 'EXAM';
    questionCount: number;
    status: string;
    createdAt: string;
  };
}

// Question Count Types
export interface QuestionCountQuery {
  unite?: number;
  module?: number;
  university?: number;
  year?: number;
}

export interface QuestionCountResponse {
  success: true;
  data: {
    totalQuestions: number;
  };
}



// Question Management Types
export interface CreateQuestionDto {
  questionText: string;
  explanation?: string;
  questionType?: QuestionType; // New field for question type
  courseId?: number; // New field for course association
  examId?: number;   // New field for exam association
  sourceId?: number; // New field for question source association
  universityId?: number;
  yearLevel?: YearLevel;
  examYear?: number; // NEW: Unified exam year field
  metadata?: string; // NEW: Optional metadata field for additional question information
  questionImages?: CreateQuestionImageDto[]; // NEW: images for question stem
  explanationImages?: CreateQuestionExplanationImageDto[]; // NEW: images for question explanation
  answers: CreateQuestionAnswerDto[];
}

export interface CreateQuestionImageDto {
  imagePath: string;
  altText?: string;
}

export interface CreateQuestionExplanationImageDto {
  imagePath: string;
  altText?: string;
}

export interface CreateQuestionAnswerDto {
  answerText: string;
  isCorrect: boolean;
  explanation?: string;
  images?: CreateExplanationImageDto[];
}

export interface CreateExplanationImageDto {
  imagePath: string;
  altText?: string;
}

// Unified Question Management Types
export interface UnifiedQuestionFilters {
  courseIds?: number[];
  moduleIds?: number[];
  uniteIds?: number[];
  universityIds?: number[];
  yearLevels?: YearLevel[];
  examYears?: number[];
  questionTypes?: QuestionType[];
  examIds?: number[];
  quizYears?: number[];
  questionSourceIds?: number[];
}

// Question Source Types
export interface QuestionSource {
  id: number;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateQuestionSourceDto {
  name: string;
}

export interface UpdateQuestionSourceDto {
  name?: string;
}

export interface QuestionSourceResponse {
  success: true;
  data: QuestionSource;
}

export interface QuestionSourceListResponse {
  success: true;
  data: {
    questionSources: (QuestionSource & { questionCount: number })[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// Enhanced Question Response Types with Comprehensive Data
export interface EnhancedQuestionImage {
  id: number;
  imagePath: string;
  altText?: string;
}

export interface EnhancedQuestionAnswer {
  id: number;
  answerText: string;
  isCorrect: boolean;
  explanation?: string;
  explanationImages: EnhancedQuestionImage[];
}

export interface EnhancedUniversity {
  id: number;
  name: string;
  country?: string;
}

export interface EnhancedModule {
  id: number;
  name: string;
}

export interface EnhancedCourse {
  id: number;
  name: string;
  description?: string;
  module?: EnhancedModule;
}

export interface EnhancedQuestionSource {
  id: number;
  name: string;
}

export interface EnhancedQuestion {
  id: number;
  questionText: string;
  explanation?: string;
  questionType: QuestionType;
  yearLevel?: YearLevel;
  examYear?: number;
  metadata?: string;
  questionImages: EnhancedQuestionImage[];
  questionExplanationImages: EnhancedQuestionImage[];
  university?: EnhancedUniversity;
  course?: EnhancedCourse;
  source?: EnhancedQuestionSource;
  questionAnswers: EnhancedQuestionAnswer[];
  createdAt: Date;
  updatedAt: Date;
}

export interface EnhancedQuestionsResponse {
  success: true;
  data: {
    questions: EnhancedQuestion[];
    metadata?: any;
  };
}

export interface BulkCreateQuestionsDto {
  metadata: {
    courseId?: number;
    universityId?: number;
    yearLevel?: YearLevel;
    examYear?: number;
    examId?: number;
    sourceId?: number;
    metadata?: string;
  };
  questions: {
    questionText: string;
    explanation?: string;
    questionType?: QuestionType;
    questionTags?: string[];
    questionImages?: CreateQuestionImageDto[];
    explanationImages?: CreateQuestionExplanationImageDto[];
    repetitionCount?: number;
    repetitionYears?: number[];
    answers: CreateQuestionAnswerDto[];
  }[];
}

export interface CreateQuestionResponse {
  success: true;
  data: {
    id: number;
    questionText: string;
    questionType: QuestionType;
    courseId?: number;
    universityId?: number;
    yearLevel?: YearLevel;
    examYear?: number;
    sourceId?: number;
    answers: { id: number; answerText: string; isCorrect: boolean }[];
    explanation?: string;
    createdAt: Date;
  };
  message: string;
}

export interface BulkCreateQuestionsResponse {
  success: true;
  data: {
    created: number;
    failed: number;
    questionIds: (number | null)[]; // ID at index n corresponds to request.questions[n], null if failed
    errors: { index: number; error: string }[];
  };
  message: string;
}

export interface UpdateQuestionDto {
  questionText?: string;
  explanation?: string;
  questionType?: QuestionType;
  courseId?: number;
  examId?: number;
  sourceId?: number;
  universityId?: number;
  yearLevel?: YearLevel;
  metadata?: string; // NEW: Optional metadata field for additional question information
  answers?: UpdateQuestionAnswerDto[];
}

// Update Question Explanation with Images
export interface UpdateQuestionExplanationDto {
  explanation: string;
  explanationImages?: CreateQuestionExplanationImageDto[];
}

export interface UpdateQuestionExplanationResponse {
  success: true;
  data: {
    id: number;
    explanation: string;
    explanationImages: {
      id: number;
      imagePath: string;
      altText: string | null;
    }[];
  };
  message: string;
}

// Question Explanation Image Management Types
export interface AddQuestionExplanationImagesDto {
  images: CreateQuestionExplanationImageDto[];
}

export interface UpdateQuestionExplanationImageDto {
  imagePath: string;
  altText?: string;
}

export interface QuestionExplanationImageResponse {
  id: number;
  questionId: number;
  imagePath: string;
  altText?: string;
  createdAt: string;
}

// Session Status Update Types
export interface UpdateSessionStatusDto {
  status: SessionStatus;
}

export interface UpdateSessionStatusResponse {
  success: true;
  data: {
    sessionId: number;
    status: SessionStatus;
    updatedAt: Date;
    startedAt?: Date;
    completedAt?: Date;
  };
  message: string;
}

export interface UpdateQuestionAnswerDto {
  id?: number; // For existing answers
  answerText?: string;
  isCorrect?: boolean;
  explanation?: string;
  images?: UpdateExplanationImageDto[];
}

export interface UpdateExplanationImageDto {
  id?: number; // For existing images
  imagePath?: string;
  altText?: string;
}

// Exam Question Ordering Types
export interface UpdateExamQuestionOrderDto {
  examId: number;
  questionOrders: ExamQuestionOrderDto[];
}

export interface ExamQuestionOrderDto {
  questionId: number;
  orderInExam: number;
}

// Retake Session Response Types
export interface RetakeSessionResponse {
  success: true;
  data: {
    sessionId: number;
    retakeType: RetakeType;
    originalSessionId: number;
    questionCount: number;
    message: string;
  };
}