import {
  Exam,
  YearLevel,
  PackType,
  SessionType,
  PrismaClient
} from "@prisma/client";
import { inject, injectable } from "tsyringe";
import PrismaService from "../../config/db";

@injectable()
export default class ExamRepository {
  constructor(@inject("db") private prismaService: PrismaService) { }

  private get prisma(): PrismaClient {
    return this.prismaService.getClient();
  }

  async getAvailableExams(
    year?: string,
    accessibleStudyPackIds?: number[],
    userCurrentYear?: YearLevel,
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

    // Filter by user's accessible content if not residency subscriber
    if (!hasResidencyAccess && userCurrentYear) {
      whereConditions.yearLevel = userCurrentYear;
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
  }

  async getExamQuestions(examId: number): Promise<any[]> {
    const examQuestions = await this.prisma.examQuestion.findMany({
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
  }

  async getExamsByModuleAndYear(
    moduleId: number,
    year: number,
    userCurrentYear?: YearLevel,
    hasResidencyAccess?: boolean
  ): Promise<any[]> {
    // Build where conditions for questions
    const questionWhereConditions: any = {
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
    const questions = await this.prisma.question.findMany({
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
      let examKey: string;
      let examData: any;

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
    examId: number,
    examTitle: string,
    questionIds: number[]
  ): Promise<number> {
    const session = await this.prisma.quizSession.create({
      data: {
        userId,
        examId,
        title: `${examTitle} - Practice Session`,
        type: SessionType.EXAM,
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
  }
}