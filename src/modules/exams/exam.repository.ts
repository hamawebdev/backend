import {
  Exam,
  YearLevel,
  PackType,
  SessionType,
  PrismaClient
} from "@prisma/client";
import { inject, injectable } from "tsyringe";
import PrismaService from "../../config/db";
import { ANSWER_ORDER, PUBLISHED_QUESTION } from "../questions/question-visibility";

@injectable()
export default class ExamRepository {
  constructor(@inject("db") private prismaService: PrismaService) { }

  private get prisma(): PrismaClient {
    return this.prismaService.getClient();
  }

  async getAvailableExams(
    year?: string,
    accessibleStudyPackIds?: number[],
    userYearLevels?: YearLevel[],
    hasResidencyAccess?: boolean,
    moduleId?: number
  ): Promise<{
    examsByYear: Array<{
      year: string;
      exams: Array<{
        id: number;
        title: string;
        university: string;
        yearLevel: YearLevel;
        module: {
          id: number;
          name: string;
          unite: {
            name: string;
            studyPack: {
              name: string;
            };
          };
        };
        year: number;
      }>;
    }>;
    residencyExams: {
      available: boolean;
      yearsAvailable: string[];
      exams: Array<{
        id: number;
        title: string;
        university: string;
        yearLevel: YearLevel;
        module: {
          id: number;
          name: string;
          unite: {
            name: string;
            studyPack: {
              name: string;
            };
          };
        };
        year: number;
      }>;
    };
  }> {
    let targetYear: number;

    if (year) {
      targetYear = parseInt(year);
    } else {
      // If no year is specified, find the most recent year with exams
      const mostRecentExam = await this.prisma.exam.findFirst({
        orderBy: { examYear: 'desc' },
        select: { examYear: true }
      });

      if (mostRecentExam) {
        targetYear = mostRecentExam.examYear.getFullYear();
      } else {
        // Fallback to current year if no exams exist
        targetYear = new Date().getFullYear();
      }
    }

    // Build where conditions for regular exams
    const whereConditions: any = {
      examYear: {
        gte: new Date(`${targetYear}-01-01`),
        lt: new Date(`${targetYear + 1}-01-01`)
      }
    };

    // Filter by module if specified
    if (moduleId) {
      whereConditions.moduleId = moduleId;
    }

    // Filter by the year levels the user's subscriptions grant, if not residency subscriber
    if (!hasResidencyAccess && userYearLevels) {
      whereConditions.yearLevel = { in: userYearLevels };
    }

    // Get regular exams
    const exams = await this.prisma.exam.findMany({
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
            name: exam.module.unite?.name ?? 'Unknown',
            studyPack: {
              name: exam.module.unite?.studyPack?.name ?? 'Unknown'
            }
          }
        },
        year: exam.year
      };

      if (existingYear) {
        existingYear.exams.push(examData);
      } else {
        acc.push({
          year: examYear,
          exams: [examData]
        });
      }

      return acc;
    }, [] as Array<{ year: string; exams: any[] }>);

    // Get residency exams if user has access
    let residencyExams = {
      available: hasResidencyAccess || false,
      yearsAvailable: [] as string[],
      exams: [] as Array<{
        id: number;
        title: string;
        university: string;
        yearLevel: YearLevel;
        module: {
          id: number;
          name: string;
          unite: {
            name: string;
            studyPack: {
              name: string;
            };
          };
        };
        year: number;
      }>
    };

    if (hasResidencyAccess) {
      const residencyExamResults = await this.prisma.exam.findMany({
        where: {
          yearLevel: YearLevel.SEVEN // Assuming residency is year 7
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

      const availableYears = Array.from(
        new Set(residencyExamResults.map(exam => exam.examYear.getFullYear().toString()))
      ).sort((a, b) => parseInt(b) - parseInt(a));

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
              name: exam.module.unite?.name ?? 'Unknown',
              studyPack: {
                name: exam.module.unite?.studyPack?.name ?? 'Unknown'
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
  }

  async getExamById(examId: number): Promise<Exam | null> {
    return await this.prisma.exam.findUnique({
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
        university: true
      }
    });
  }

  /**
   * An exam's questions are linked either through the exam_questions join
   * table (admin-built exams, dataset import) or through Question.examId
   * (question create and bulk import). Both count. Students only get
   * published questions.
   */
  private examQuestionsWhere(examId: number) {
    return {
      ...PUBLISHED_QUESTION,
      OR: [
        { examId },
        { examQuestions: { some: { examId } } }
      ]
    };
  }

  async countExamQuestions(examId: number): Promise<number> {
    return await this.prisma.question.count({ where: this.examQuestionsWhere(examId) });
  }

  async getExamQuestions(examId: number): Promise<any[]> {
    if (!Number.isInteger(examId) || examId <= 0) {
      throw new Error('examId must be a positive integer');
    }

    const questions = await this.prisma.question.findMany({
      where: this.examQuestionsWhere(examId),
      include: {
        questionAnswers: {
          include: {
            explanationImages: true
          },
          orderBy: ANSWER_ORDER
        },
        questionImages: { orderBy: { id: 'asc' } }, // Include question images for canonical spec
        examQuestions: {
          where: { examId },
          select: { orderInExam: true, createdAt: true }
        }
      }
    });

    // Join-table questions keep their manual order (then insertion order); questions
    // linked only through Question.examId follow, by id
    const rank = (q: typeof questions[number]) => {
      const link = q.examQuestions[0];
      return link
        ? [0, link.orderInExam ?? Number.MAX_SAFE_INTEGER, link.createdAt.getTime(), q.id]
        : [1, 0, 0, q.id];
    };
    questions.sort((a, b) => {
      const ra = rank(a);
      const rb = rank(b);
      for (let i = 0; i < ra.length; i++) {
        if (ra[i] !== rb[i]) return ra[i] - rb[i];
      }
      return 0;
    });

    return questions.map(({ examQuestions, ...question }) => question);
  }

  /**
   * Questions of a module for one exam year that are not linked to an Exam,
   * grouped under a course ("virtual" exams in getExamsByModuleAndYear)
   */
  async getUnlinkedCourseQuestionIds(
    courseId: number,
    year: number,
    userYearLevels?: YearLevel[],
    hasResidencyAccess?: boolean
  ): Promise<number[]> {
    const where: any = {
      ...PUBLISHED_QUESTION,
      courseId,
      examYear: year,
      examId: null
    };
    if (!hasResidencyAccess && userYearLevels) {
      where.yearLevel = { in: userYearLevels };
    }
    const questions = await this.prisma.question.findMany({
      where,
      select: { id: true },
      orderBy: { id: 'asc' }
    });
    return questions.map(q => q.id);
  }

  async getExamsByModuleAndYear(
    moduleId: number,
    year: number,
    userYearLevels?: YearLevel[],
    hasResidencyAccess?: boolean
  ): Promise<any[]> {
    const yearLevelFilter = !hasResidencyAccess && userYearLevels ? { in: userYearLevels } : undefined;

    // Exams of the module and year whose questions are linked through the
    // exam_questions join table (dataset import, admin-built exams)
    const linkedExamWhere: any = { moduleId, year };
    if (yearLevelFilter) {
      linkedExamWhere.yearLevel = yearLevelFilter;
    }

    // Build where conditions for questions: in a course of the module, or
    // linked to an exam of the module (Question.examId or the join table).
    // Students only get published questions.
    const courseOrExamQuestion: any = {
      examYear: year,
      OR: [
        { course: { moduleId: moduleId } },
        { exam: { moduleId: moduleId } }
      ]
    };

    // Filter by the year levels the user's subscriptions grant, if not residency subscriber
    if (yearLevelFilter) {
      courseOrExamQuestion.yearLevel = yearLevelFilter;
    }

    const questionWhereConditions: any = {
      ...PUBLISHED_QUESTION,
      OR: [
        courseOrExamQuestion,
        { examQuestions: { some: { exam: linkedExamWhere } } }
      ]
    };

    const examInclude = {
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
    };

    // First, get all questions that match the criteria
    const questions = await this.prisma.question.findMany({
      where: questionWhereConditions,
      include: {
        examQuestions: {
          where: { exam: linkedExamWhere },
          include: { exam: { include: examInclude } }
        },
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
    const realExamData = (exam: any) => ({
      id: exam.id,
      title: exam.title,
      description: exam.description,
      yearLevel: exam.yearLevel,
      examYear: exam.examYear,
      year: exam.year,
      module: exam.module,
      university: exam.university,
      questionCount: 0,
      isFromQuestions: false // This is a real exam
    });

    for (const question of questions) {
      let examKey: string;
      let examData: any;

      // Questions linked through the join table count in each of their exams
      if (question.examQuestions.length > 0) {
        for (const link of question.examQuestions) {
          const key = `exam_${link.exam.id}`;
          if (!examMap.has(key)) {
            examMap.set(key, realExamData(link.exam));
          }
          examMap.get(key).questionCount++;
        }
        continue;
      }

      // Otherwise the question matched on its own exam year and module
      if (question.examYear !== year) continue;

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
      } else {
        // Question is not linked to a specific exam, group by course
        examKey = `course_${question.course?.id || 'unknown'}`;
        examData = {
          id: null, // No specific exam ID
          courseId: question.course?.id ?? null, // Used to load the questions of this virtual exam
          title: `${question.course?.name || 'Unknown Course'} - ${year}`,
          description: `Questions from ${question.course?.name || 'Unknown Course'} for year ${year}`,
          yearLevel: question.yearLevel,
          examYear: new Date(year, 0, 1), // Convert year to Date
          year: year,
          module: question.course?.module,
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
  }

  async createExamSession(
    userId: number,
    examId: number | null,
    examTitle: string,
    questionIds: number[]
  ): Promise<number> {
    // Attempt rows are only written when the student answers
    const session = await this.prisma.quizSession.create({
      data: {
        userId,
        examId,
        title: `${examTitle} - Practice Session`,
        type: SessionType.EXAM,
        sessionQuestions: {
          create: Array.from(new Set(questionIds)).map(questionId => ({
            questionId
          }))
        }
      }
    });

    return session.id;
  }
}