import { inject, injectable } from "tsyringe";
import {
  User,
  StudyPack,
  Quiz,
  Question,
  Exam,
  Subscription,
  University,
  Specialty,
  Unite,
  Module,
  Course,
  CourseResource,
  QuestionSource,
  UserRole,
  YearLevel,
  PackType,
  QuizType,
  SubscriptionStatus
} from "@prisma/client";
import { TransactionClient } from "../../types/prisma.types";
import PrismaService from "../../config/db";
import bcrypt from "bcrypt";
import { InternalServerError, NotFoundError, BadRequestError } from "../../core/errors/AppError";
import { QuestionType } from "../../types/quiz.types";

interface UserFilters {
  page: number;
  limit: number;
  role?: UserRole;
  universityId?: number;
  specialtyId?: number;
  currentYear?: YearLevel;
  isActive?: boolean;
  search?: string;
}

interface SubscriptionFilters {
  page: number;
  limit: number;
  status?: SubscriptionStatus;
  userId?: number;
  studyPackId?: number;
}

interface DashboardStats {
  totalUsers: number;
  activeUsers: number;
  totalStudents: number;
  totalSubscriptions: number;
  activeSubscriptions: number;
  totalRevenue: number;
  monthlyRevenue: number;
  totalQuizzes: number;
  totalQuestions: number;
  totalExams: number;
  recentActivity: any[];
}

interface CreateUserData {
  email: string;
  password: string;
  fullName: string;
  role: UserRole;
  universityId?: number;
  specialtyId?: number;
  currentYear?: YearLevel;
}

interface CreateQuizData {
  title: string;
  description?: string;
  type: QuizType;
  courseId?: number;
  universityId?: number;
  yearLevel?: YearLevel;

  quizYear?: number;
  questions: {
    questionText: string;
    explanation?: string;
    questionType?: QuestionType;
    answers: {
      answerText: string;
      isCorrect: boolean;
      explanation?: string;
      images?: {
        imagePath: string;
        altText?: string;
      }[];
    }[];
  }[];
}

interface CreateExamData {
  title: string;
  description?: string;
  moduleId: number;
  universityId: number;
  yearLevel: YearLevel;
  examYear: string;
  year: number;
  questions: {
    questionText: string;
    explanation?: string;
    answers: {
      answerText: string;
      isCorrect: boolean;
      explanation?: string;
      images?: {
        imagePath: string;
        altText?: string;
      }[];
    }[];
  }[];
}

// Residency Question interfaces (Canonical spec)
interface ResidencyQuestionFilters {
  page: number;
  limit: number;
  part?: string;
  examYear?: number;
  universityId?: number;
  search?: string;
}

interface CreateResidencyQuestionData {
  questionText: string;
  part?: string;
  explanation?: string;
  examYear?: number;
  universityId?: number;
  metadata?: string;
  tags?: string[];
  repetitionCount?: number;
  repetitionYears?: number[];
  questionAnswers: {
    answerText: string;
    isCorrect: boolean;
  }[];
}

interface UpdateResidencyQuestionData {
  questionText?: string;
  part?: string;
  explanation?: string;
  examYear?: number;
  universityId?: number;
  metadata?: string;
  tags?: string[];
  repetitionCount?: number;
  repetitionYears?: number[];
  questionAnswers?: {
    answerText: string;
    isCorrect: boolean;
  }[];
}

interface BulkCreateResidencyQuestionsData {
  universityId: number;
  examYear: number;
  part: string;
  questions: {
    questionText: string;
    explanation?: string;
    metadata?: string;
    questionAnswers: {
      answerText: string;
      isCorrect: boolean;
      explanation?: string;
    }[];
  }[];
}

@injectable()
export default class AdminService {
  constructor(@inject("db") private prismaService: PrismaService) { }

  private get prisma() {
    return this.prismaService.getClient();
  }

  // ==========================================
  // DASHBOARD & ANALYTICS
  // ==========================================

  async getDashboardStats() {
    try {
      const [
        totalUsers,
        activeSubscriptions,
        totalQuestions,
        totalQuizSessions,
        recentActivity
      ] = await Promise.all([
        this.prisma.user.count(),
        this.prisma.subscription.count({ where: { status: 'ACTIVE' } }),
        this.prisma.question.count(),
        this.prisma.quizSession.count(),
        this.prisma.employeeActivity.findMany({
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: {
            employee: {
              select: { fullName: true, email: true }
            }
          }
        })
      ]);

      // Transform recentActivity to canonical format
      const formattedActivity = recentActivity.map(activity => ({
        type: activity.activityType,
        description: activity.description,
        timestamp: activity.createdAt
      }));

      // Canonical format: only 5 key fields
      return {
        totalUsers,
        activeSubscriptions,
        totalQuestions,
        totalQuizSessions,
        recentActivity: formattedActivity
      };
    } catch (error) {
      throw new InternalServerError("Failed to fetch dashboard stats");
    }
  }

  async getUserAnalytics(timeframe: string = 'month') {
    try {
      const now = new Date();
      let startDate: Date;

      switch (timeframe) {
        case 'day':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case 'week':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'year':
          startDate = new Date(now.getFullYear(), 0, 1);
          break;
        default: // month
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      }

      const [userGrowth, usersByRole, usersByUniversity] = await Promise.all([
        this.prisma.user.groupBy({
          by: ['createdAt'],
          where: { createdAt: { gte: startDate } },
          _count: true,
        }),
        this.prisma.user.groupBy({
          by: ['role'],
          _count: true,
        }),
        this.prisma.user.groupBy({
          by: ['universityId'],
          _count: true
        })
      ]);

      return {
        userGrowth,
        usersByRole,
        usersByUniversity
      };
    } catch (error) {
      throw new InternalServerError("Failed to fetch user analytics");
    }
  }

  // ==========================================
  // USER MANAGEMENT
  // ==========================================

  async getAllUsers(filters: UserFilters) {
    try {
      const { page, limit, role, universityId, specialtyId, currentYear, isActive, search } = filters;
      const skip = (page - 1) * limit;

      const where: any = {};

      if (role) where.role = role;
      if (universityId) where.universityId = universityId;
      if (specialtyId) where.specialtyId = specialtyId;
      if (currentYear) where.currentYear = currentYear;
      if (isActive !== undefined) where.isActive = isActive;
      if (search) {
        where.OR = [
          { fullName: { contains: search } },
          { email: { contains: search } }
        ];
      }

      const now = new Date();

      const [users, total] = await Promise.all([
        this.prisma.user.findMany({
          where,
          skip,
          take: limit,
          select: {
            id: true,
            email: true,
            fullName: true,
            role: true,
            universityId: true,
            specialtyId: true,
            currentYear: true,
            isActive: true,
            createdAt: true,
            subscriptions: {
              select: {
                id: true,
                status: true,
                startDate: true,
                endDate: true,
                studyPack: {
                  select: {
                    id: true,
                    name: true
                  }
                }
              },
              orderBy: { endDate: 'desc' }
            }
          },
          orderBy: { createdAt: 'desc' }
        }),
        this.prisma.user.count({ where })
      ]);

      // Map users to include subscription status
      const usersWithSubscriptionStatus = users.map(user => {
        const activeSubscription = user.subscriptions.find(
          sub => sub.status === 'ACTIVE' && new Date(sub.endDate) > now
        );

        return {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          role: user.role,
          universityId: user.universityId,
          specialtyId: user.specialtyId,
          currentYear: user.currentYear,
          isActive: user.isActive,
          createdAt: user.createdAt,
          hasActiveSubscription: !!activeSubscription,
          activeSubscription: activeSubscription
            ? {
              id: activeSubscription.id,
              studyPackId: activeSubscription.studyPack.id,
              studyPackName: activeSubscription.studyPack.name,
              status: activeSubscription.status,
              startDate: activeSubscription.startDate,
              endDate: activeSubscription.endDate
            }
            : null
        };
      });

      // Canonical format: items array
      return {
        items: usersWithSubscriptionStatus,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      };
    } catch (error) {
      throw new InternalServerError("Failed to fetch users");
    }
  }

  async getUserById(id: number) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id },
        include: {
          university: true,
          specialty: true,
          subscriptions: {
            include: { studyPack: true }
          },
          quizSessions: {
            include: { quiz: { select: { title: true } } },
            orderBy: { createdAt: 'desc' },
            take: 10
          },
          studentNotes: {
            orderBy: { createdAt: 'desc' },
            take: 5
          },
          questionReports: {
            include: { question: { select: { questionText: true } } },
            orderBy: { createdAt: 'desc' },
            take: 5
          },
          _count: {
            select: {
              quizSessions: true,
              studentNotes: true,
              questionReports: true,
              createdQuizzes: true,
              createdExams: true
            }
          }
        }
      });

      if (!user) {
        throw new NotFoundError("User");
      }

      const { passwordHash, ...userWithoutPassword } = user;
      return userWithoutPassword;
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      throw new InternalServerError("Failed to fetch user");
    }
  }

  async createUser(userData: CreateUserData, createdById: number): Promise<User> {
    try {
      const existingUser = await this.prisma.user.findUnique({
        where: { email: userData.email }
      });

      if (existingUser) {
        throw new BadRequestError("User with this email already exists");
      }

      const hashedPassword = await bcrypt.hash(userData.password, 12);

      const user = await this.prisma.user.create({
        data: {
          email: userData.email,
          passwordHash: hashedPassword,
          fullName: userData.fullName,
          role: userData.role,
          universityId: userData.universityId,
          specialtyId: userData.specialtyId,
          currentYear: userData.currentYear || YearLevel.ONE,
          emailVerified: true, // Admin-created users are automatically verified
          isActive: true
        },
        include: {
          university: { select: { name: true } },
          specialty: { select: { name: true } }
        }
      });

      // Log admin activity
      await this.prisma.employeeActivity.create({
        data: {
          employeeId: createdById,
          activityType: 'QUESTION_ADDED', // We can extend this enum
          description: `Created new ${userData.role.toLowerCase()} user: ${userData.email}`,
          relatedId: user.id
        }
      });

      return user;
    } catch (error) {
      if (error instanceof BadRequestError) throw error;
      throw new InternalServerError("Failed to create user");
    }
  }

  async updateUser(id: number, updateData: Partial<User>, updatedById: number): Promise<User> {
    try {
      const existingUser = await this.prisma.user.findUnique({ where: { id } });
      if (!existingUser) {
        throw new NotFoundError("User");
      }

      const user = await this.prisma.user.update({
        where: { id },
        data: updateData,
        include: {
          university: { select: { name: true } },
          specialty: { select: { name: true } }
        }
      });

      // Log admin activity
      await this.prisma.employeeActivity.create({
        data: {
          employeeId: updatedById,
          activityType: 'QUESTION_EDITED',
          description: `Updated user: ${user.email}`,
          relatedId: user.id,
          metadata: updateData
        }
      });

      return user;
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      throw new InternalServerError("Failed to update user");
    }
  }

  async deactivateUser(id: number, deactivatedById: number): Promise<void> {
    try {
      const user = await this.prisma.user.findUnique({ where: { id } });
      if (!user) {
        throw new NotFoundError("User");
      }

      await this.prisma.user.update({
        where: { id },
        data: { isActive: false }
      });

      // Log admin activity
      await this.prisma.employeeActivity.create({
        data: {
          employeeId: deactivatedById,
          activityType: 'QUESTION_EDITED',
          description: `Deactivated user: ${user.email}`,
          relatedId: user.id
        }
      });
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      throw new InternalServerError("Failed to deactivate user");
    }
  }

  async resetUserPassword(id: number, newPassword: string, resetById: number): Promise<void> {
    try {
      const user = await this.prisma.user.findUnique({ where: { id } });
      if (!user) {
        throw new NotFoundError("User");
      }

      const hashedPassword = await bcrypt.hash(newPassword, 12);

      await this.prisma.user.update({
        where: { id },
        data: { passwordHash: hashedPassword }
      });

      // Log admin activity
      await this.prisma.employeeActivity.create({
        data: {
          employeeId: resetById,
          activityType: 'QUESTION_EDITED',
          description: `Reset password for user: ${user.email}`,
          relatedId: user.id
        }
      });
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      throw new InternalServerError("Failed to reset password");
    }
  }

  // ==========================================
  // STUDY PACK MANAGEMENT
  // ==========================================

  async getAllStudyPacks(page: number = 1, limit: number = 10) {
    try {
      const skip = (page - 1) * limit;

      const [studyPacks, total] = await Promise.all([
        this.prisma.studyPack.findMany({
          skip,
          take: limit,
          include: {
            unites: {
              include: {
                modules: {
                  include: {
                    courses: {
                      include: {
                        _count: {
                          select: { questions: true, quizzes: true }
                        }
                      }
                    }
                  }
                }
              }
            },
            subscriptions: {
              where: { status: 'ACTIVE' },
              select: { id: true }
            },
            _count: {
              select: { subscriptions: true }
            }
          },
          orderBy: { createdAt: 'desc' }
        }),
        this.prisma.studyPack.count()
      ]);

      return {
        studyPacks,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      };
    } catch (error) {
      throw new InternalServerError("Failed to fetch study packs");
    }
  }

  async createStudyPack(data: any, createdById: number): Promise<StudyPack> {
    try {
      console.log('Creating study pack with data:', JSON.stringify(data, null, 2));
      console.log('Created by user ID:', createdById);

      // First, create the study pack
      const studyPack = await this.prisma.studyPack.create({
        data,
        include: {
          _count: { select: { subscriptions: true } }
        }
      });

      console.log('Study pack created successfully:', studyPack.id);

      // Then, try to log the employee activity
      try {
        await this.prisma.employeeActivity.create({
          data: {
            employeeId: createdById,
            activityType: 'COURSE_UPLOADED',
            description: `Created study pack: ${studyPack.name}`,
            relatedId: studyPack.id
          }
        });
        console.log('Employee activity logged successfully');
      } catch (activityError) {
        console.error('Error logging employee activity:', activityError);
        console.error('Activity error details:', {
          message: (activityError as any).message,
          code: (activityError as any).code,
          meta: (activityError as any).meta
        });
        // Don't throw here - the study pack was created successfully
        // We can continue without the activity log
      }

      return studyPack;
    } catch (error) {
      console.error('Error creating study pack:', error);
      console.error('Error details:', {
        message: (error as any).message,
        code: (error as any).code,
        meta: (error as any).meta,
        stack: (error as any).stack
      });
      throw new InternalServerError("Failed to create study pack");
    }
  }

  async updateStudyPack(id: number, data: any, updatedById: number): Promise<StudyPack> {
    try {
      const studyPack = await this.prisma.studyPack.update({
        where: { id },
        data,
        include: {
          _count: { select: { subscriptions: true } }
        }
      });

      // Log admin activity
      await this.prisma.employeeActivity.create({
        data: {
          employeeId: updatedById,
          activityType: 'COURSE_UPLOADED',
          description: `Updated study pack: ${studyPack.name}`,
          relatedId: studyPack.id
        }
      });

      return studyPack;
    } catch (error) {
      if ((error as any).code === 'P2025') {
        throw new NotFoundError("Study pack");
      }
      throw new InternalServerError("Failed to update study pack");
    }
  }

  async deleteStudyPack(id: number, deletedById: number): Promise<void> {
    try {
      const studyPack = await this.prisma.studyPack.findUnique({ where: { id } });
      if (!studyPack) {
        throw new NotFoundError("Study pack");
      }

      await this.prisma.studyPack.delete({ where: { id } });

      // Log admin activity
      await this.prisma.employeeActivity.create({
        data: {
          employeeId: deletedById,
          activityType: 'COURSE_UPLOADED',
          description: `Deleted study pack: ${studyPack.name}`,
          relatedId: id
        }
      });
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      if ((error as any).code === 'P2025') {
        throw new NotFoundError("Study pack");
      }
      throw new InternalServerError("Failed to delete study pack");
    }
  }

  // ==========================================
  // COURSE STRUCTURE MANAGEMENT
  // ==========================================

  async createUnite(data: any, createdById: number): Promise<Unite> {
    try {
      // Validate that the study pack exists
      const studyPack = await this.prisma.studyPack.findUnique({
        where: { id: data.studyPackId }
      });

      if (!studyPack) {
        throw new NotFoundError("Study pack not found");
      }

      const unite = await this.prisma.unite.create({
        data,
        include: {
          studyPack: { select: { name: true } }
        }
      });

      await this.prisma.employeeActivity.create({
        data: {
          employeeId: createdById,
          activityType: 'COURSE_UPLOADED',
          description: `Created unite: ${unite.name}`,
          relatedId: unite.id
        }
      });

      return unite;
    } catch (error) {
      if (error instanceof NotFoundError) throw error;

      // Log the actual error for debugging
      console.error('Error creating unite:', error);

      // Check for specific database errors
      if (error && typeof error === 'object' && 'code' in error) {
        if (error.code === 'P2002') {
          throw new BadRequestError("A unite with this name already exists in the study pack");
        }
        if (error.code === 'P2003') {
          throw new BadRequestError("Invalid study pack ID provided");
        }
      }

      throw new InternalServerError("Failed to create unite");
    }
  }

  async createModule(data: any, createdById: number): Promise<Module> {
    try {
      // Validate that the unite exists
      const unite = await this.prisma.unite.findUnique({
        where: { id: data.uniteId }
      });

      if (!unite) {
        throw new NotFoundError("Unite not found");
      }

      const module = await this.prisma.module.create({
        data,
        include: {
          unite: { select: { name: true } }
        }
      });

      await this.prisma.employeeActivity.create({
        data: {
          employeeId: createdById,
          activityType: 'COURSE_UPLOADED',
          description: `Created module: ${module.name}`,
          relatedId: module.id
        }
      });

      return module;
    } catch (error) {
      if (error instanceof NotFoundError) throw error;

      // Log the actual error for debugging
      console.error('Error creating module:', error);

      // Check for specific database errors
      if (error && typeof error === 'object' && 'code' in error) {
        if (error.code === 'P2002') {
          throw new BadRequestError("A module with this name already exists in the unite");
        }
        if (error.code === 'P2003') {
          throw new BadRequestError("Invalid unite ID provided");
        }
      }

      throw new InternalServerError("Failed to create module");
    }
  }

  async createCourse(data: any, createdById: number): Promise<Course> {
    try {
      const course = await this.prisma.course.create({
        data,
        include: {
          module: { select: { name: true } }
        }
      });

      await this.prisma.employeeActivity.create({
        data: {
          employeeId: createdById,
          activityType: 'COURSE_UPLOADED',
          description: `Created course: ${course.name}`,
          relatedId: course.id
        }
      });

      return course;
    } catch (error) {
      throw new InternalServerError("Failed to create course");
    }
  }

  async createCourseResource(data: any, createdById: number): Promise<CourseResource> {
    try {
      const resource = await this.prisma.courseResource.create({
        data,
        include: {
          course: { select: { name: true } }
        }
      });

      await this.prisma.employeeActivity.create({
        data: {
          employeeId: createdById,
          activityType: 'RESOURCE_ADDED',
          description: `Added resource: ${resource.title} to course`,
          relatedId: resource.id
        }
      });

      return resource;
    } catch (error) {
      throw new InternalServerError("Failed to create course resource");
    }
  }

  // ==========================================
  // UPDATE OPERATIONS
  // ==========================================

  async updateUnite(id: number, data: any): Promise<Unite> {
    try {
      // Check if unite exists
      const existingUnite = await this.prisma.unite.findUnique({
        where: { id }
      });

      if (!existingUnite) {
        throw new NotFoundError(`Unite with ID ${id} not found`);
      }

      // If studyPackId is being updated, validate it exists
      if (data.studyPackId) {
        const studyPack = await this.prisma.studyPack.findUnique({
          where: { id: data.studyPackId }
        });

        if (!studyPack) {
          throw new BadRequestError(`Study pack with ID ${data.studyPackId} not found`);
        }
      }

      const updatedUnite = await this.prisma.unite.update({
        where: { id },
        data: {
          ...data,
          updatedAt: new Date()
        },
        include: {
          studyPack: { select: { name: true } }
        }
      });

      return updatedUnite;
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof BadRequestError) {
        throw error;
      }
      throw new InternalServerError("Failed to update unite");
    }
  }

  async updateModule(id: number, data: any): Promise<Module> {
    try {
      // Check if module exists
      const existingModule = await this.prisma.module.findUnique({
        where: { id }
      });

      if (!existingModule) {
        throw new NotFoundError(`Module with ID ${id} not found`);
      }

      // If uniteId is being updated, validate it exists
      if (data.uniteId) {
        const unite = await this.prisma.unite.findUnique({
          where: { id: data.uniteId }
        });

        if (!unite) {
          throw new BadRequestError(`Unite with ID ${data.uniteId} not found`);
        }
      }

      const updatedModule = await this.prisma.module.update({
        where: { id },
        data: {
          ...data,
          updatedAt: new Date()
        },
        include: {
          unite: { select: { name: true } }
        }
      });

      return updatedModule;
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof BadRequestError) {
        throw error;
      }
      throw new InternalServerError("Failed to update module");
    }
  }

  async updateCourse(id: number, data: any): Promise<Course> {
    try {
      // Check if course exists
      const existingCourse = await this.prisma.course.findUnique({
        where: { id }
      });

      if (!existingCourse) {
        throw new NotFoundError(`Course with ID ${id} not found`);
      }

      // If moduleId is being updated, validate it exists
      if (data.moduleId) {
        const module = await this.prisma.module.findUnique({
          where: { id: data.moduleId }
        });

        if (!module) {
          throw new BadRequestError(`Module with ID ${data.moduleId} not found`);
        }
      }

      const updatedCourse = await this.prisma.course.update({
        where: { id },
        data: {
          ...data,
          updatedAt: new Date()
        },
        include: {
          module: { select: { name: true } }
        }
      });

      return updatedCourse;
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof BadRequestError) {
        throw error;
      }
      throw new InternalServerError("Failed to update course");
    }
  }

  async updateCourseResource(id: number, data: any): Promise<CourseResource> {
    try {
      // Check if course resource exists
      const existingResource = await this.prisma.courseResource.findUnique({
        where: { id }
      });

      if (!existingResource) {
        throw new NotFoundError(`Course resource with ID ${id} not found`);
      }

      // If courseId is being updated, validate it exists
      if (data.courseId) {
        const course = await this.prisma.course.findUnique({
          where: { id: data.courseId }
        });

        if (!course) {
          throw new BadRequestError(`Course with ID ${data.courseId} not found`);
        }
      }

      const updatedResource = await this.prisma.courseResource.update({
        where: { id },
        data: {
          ...data,
          updatedAt: new Date()
        },
        include: {
          course: { select: { name: true } }
        }
      });

      return updatedResource;
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof BadRequestError) {
        throw error;
      }
      throw new InternalServerError("Failed to update course resource");
    }
  }

  // ==========================================
  // DELETE OPERATIONS
  // ==========================================

  async deleteUnite(id: number): Promise<{ message: string }> {
    try {
      // Check if unite exists
      const existingUnite = await this.prisma.unite.findUnique({
        where: { id },
        include: {
          modules: {
            include: {
              courses: true
            }
          }
        }
      });

      if (!existingUnite) {
        throw new NotFoundError(`Unite with ID ${id} not found`);
      }

      // Check if unite has modules
      if (existingUnite.modules.length > 0) {
        throw new BadRequestError(`Cannot delete unite. It contains ${existingUnite.modules.length} modules. Please delete all modules first.`);
      }

      await this.prisma.unite.delete({
        where: { id }
      });

      return { message: "Unite deleted successfully" };
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof BadRequestError) {
        throw error;
      }
      throw new InternalServerError("Failed to delete unite");
    }
  }

  async deleteModule(id: number): Promise<{ message: string }> {
    try {
      // Check if module exists
      const existingModule = await this.prisma.module.findUnique({
        where: { id },
        include: {
          courses: true
        }
      });

      if (!existingModule) {
        throw new NotFoundError(`Module with ID ${id} not found`);
      }

      // Check if module has courses
      if (existingModule.courses.length > 0) {
        throw new BadRequestError(`Cannot delete module. It contains ${existingModule.courses.length} courses. Please delete all courses first.`);
      }

      await this.prisma.module.delete({
        where: { id }
      });

      return { message: "Module deleted successfully" };
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof BadRequestError) {
        throw error;
      }
      throw new InternalServerError("Failed to delete module");
    }
  }

  async deleteCourse(id: number): Promise<{ message: string }> {
    try {
      // Check if course exists
      const existingCourse = await this.prisma.course.findUnique({
        where: { id },
        include: {
          courseResources: true,
          questions: true
        }
      });

      if (!existingCourse) {
        throw new NotFoundError(`Course with ID ${id} not found`);
      }

      // Check if course has resources or questions
      if (existingCourse.courseResources.length > 0) {
        throw new BadRequestError(`Cannot delete course. It contains ${existingCourse.courseResources.length} resources. Please delete all resources first.`);
      }

      if (existingCourse.questions.length > 0) {
        throw new BadRequestError(`Cannot delete course. It contains ${existingCourse.questions.length} questions. Please delete all questions first.`);
      }

      await this.prisma.course.delete({
        where: { id }
      });

      return { message: "Course deleted successfully" };
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof BadRequestError) {
        throw error;
      }
      throw new InternalServerError("Failed to delete course");
    }
  }

  async deleteCourseResource(id: number): Promise<{ message: string }> {
    try {
      // Check if course resource exists
      const existingResource = await this.prisma.courseResource.findUnique({
        where: { id }
      });

      if (!existingResource) {
        throw new NotFoundError(`Course resource with ID ${id} not found`);
      }

      await this.prisma.courseResource.delete({
        where: { id }
      });

      return { message: "Resource deleted successfully" };
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof BadRequestError) {
        throw error;
      }
      throw new InternalServerError("Failed to delete course resource");
    }
  }

  // ==========================================
  // ADMIN CONTENT CANONICAL METHODS
  // ==========================================

  /**
   * GET /admin/study-packs - Canonical format
   * Returns {items, total, page, limit, totalPages}
   */
  async getAllStudyPacksCanonical(page: number = 1, limit: number = 10) {
    try {
      const skip = (page - 1) * limit;

      const [studyPacks, total] = await Promise.all([
        this.prisma.studyPack.findMany({
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' }
        }),
        this.prisma.studyPack.count()
      ]);

      // Transform to canonical format
      const items = studyPacks.map(sp => ({
        id: sp.id,
        name: sp.name,
        description: sp.description,
        type: sp.type,
        yearNumber: sp.yearNumber,
        pricePerMonth: sp.pricePerMonth,
        pricePerYear: sp.pricePerYear,
        isActive: sp.isActive,
        createdAt: sp.createdAt
      }));

      return {
        items,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      };
    } catch (error) {
      throw new InternalServerError("Failed to fetch study packs");
    }
  }

  /**
   * POST /admin/study-packs - Canonical format
   * Returns flat object directly with createdAt
   */
  async createStudyPackCanonical(data: any, createdById: number) {
    try {
      const studyPack = await this.prisma.studyPack.create({
        data: {
          name: data.name,
          description: data.description,
          type: data.type,
          yearNumber: data.yearNumber,
          pricePerMonth: data.pricePerMonth,
          pricePerYear: data.pricePerYear,
          isActive: data.isActive ?? true
        }
      });

      // Log activity
      try {
        await this.prisma.employeeActivity.create({
          data: {
            employeeId: createdById,
            activityType: 'COURSE_UPLOADED',
            description: `Created study pack: ${studyPack.name}`,
            relatedId: studyPack.id
          }
        });
      } catch (e) { /* ignore activity log errors */ }

      return {
        id: studyPack.id,
        name: studyPack.name,
        description: studyPack.description,
        type: studyPack.type,
        yearNumber: studyPack.yearNumber,
        pricePerMonth: studyPack.pricePerMonth,
        pricePerYear: studyPack.pricePerYear,
        isActive: studyPack.isActive,
        createdAt: studyPack.createdAt
      };
    } catch (error) {
      throw new InternalServerError("Failed to create study pack");
    }
  }

  /**
   * PUT /admin/study-packs/:studyPackId - Canonical format
   * Returns flat object with updatedAt
   */
  async updateStudyPackCanonical(id: number, data: any, updatedById: number) {
    try {
      const existing = await this.prisma.studyPack.findUnique({ where: { id } });
      if (!existing) {
        throw new NotFoundError("Study pack");
      }

      const studyPack = await this.prisma.studyPack.update({
        where: { id },
        data: {
          name: data.name,
          description: data.description,
          type: data.type,
          yearNumber: data.yearNumber,
          pricePerMonth: data.pricePerMonth,
          pricePerYear: data.pricePerYear,
          isActive: data.isActive,
          updatedAt: new Date()
        }
      });

      // Log activity
      try {
        await this.prisma.employeeActivity.create({
          data: {
            employeeId: updatedById,
            activityType: 'COURSE_UPLOADED',
            description: `Updated study pack: ${studyPack.name}`,
            relatedId: studyPack.id
          }
        });
      } catch (e) { /* ignore activity log errors */ }

      return {
        id: studyPack.id,
        name: studyPack.name,
        description: studyPack.description,
        type: studyPack.type,
        yearNumber: studyPack.yearNumber,
        pricePerMonth: studyPack.pricePerMonth,
        pricePerYear: studyPack.pricePerYear,
        isActive: studyPack.isActive,
        createdAt: studyPack.createdAt,
        updatedAt: studyPack.updatedAt
      };
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      throw new InternalServerError("Failed to update study pack");
    }
  }

  /**
   * POST /admin/content/unites - Canonical format
   * Returns flat object directly with createdAt
   */
  async createUniteCanonical(data: any, createdById: number) {
    try {
      const unite = await this.prisma.unite.create({
        data: {
          name: data.name,
          logoUrl: data.logoUrl || null,
          studyPackId: data.studyPackId
        }
      });

      // Log activity
      try {
        await this.prisma.employeeActivity.create({
          data: {
            employeeId: createdById,
            activityType: 'COURSE_UPLOADED',
            description: `Created unite: ${unite.name}`,
            relatedId: unite.id
          }
        });
      } catch (e) { /* ignore activity log errors */ }

      return {
        id: unite.id,
        name: unite.name,
        logoUrl: unite.logoUrl,
        createdAt: unite.createdAt
      };
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error) {
        if (error.code === 'P2003') {
          throw new BadRequestError("Invalid study pack ID provided");
        }
      }
      throw new InternalServerError("Failed to create unite");
    }
  }

  /**
   * PUT /admin/content/unites/:unitId - Canonical format
   * Returns flat object with updatedAt
   */
  async updateUniteCanonical(id: number, data: any) {
    try {
      const existing = await this.prisma.unite.findUnique({ where: { id } });
      if (!existing) {
        throw new NotFoundError("Unite");
      }

      const unite = await this.prisma.unite.update({
        where: { id },
        data: {
          name: data.name,
          logoUrl: data.logoUrl,
          updatedAt: new Date()
        }
      });

      return {
        id: unite.id,
        name: unite.name,
        logoUrl: unite.logoUrl,
        createdAt: unite.createdAt,
        updatedAt: unite.updatedAt
      };
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      throw new InternalServerError("Failed to update unite");
    }
  }

  /**
   * POST /admin/content/modules - Canonical format
   * Returns flat object directly with createdAt
   */
  async createModuleCanonical(data: any, createdById: number) {
    try {
      // Validate unite exists if provided
      if (data.uniteId) {
        const unite = await this.prisma.unite.findUnique({ where: { id: data.uniteId } });
        if (!unite) {
          throw new NotFoundError("Unite");
        }
      }

      const module = await this.prisma.module.create({
        data: {
          name: data.name,
          ...(data.uniteId && { uniteId: data.uniteId })
        }
      });

      // Log activity
      try {
        await this.prisma.employeeActivity.create({
          data: {
            employeeId: createdById,
            activityType: 'COURSE_UPLOADED',
            description: `Created module: ${module.name}`,
            relatedId: module.id
          }
        });
      } catch (e) { /* ignore activity log errors */ }

      return {
        id: module.id,
        name: module.name,
        uniteId: module.uniteId,
        createdAt: module.createdAt
      };
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      throw new InternalServerError("Failed to create module");
    }
  }

  /**
   * POST /admin/content/sub-modules - Canonical format
   * Returns flat object directly with createdAt
   */
  async createSubModuleCanonical(data: any, createdById: number) {
    try {
      // Validate module exists
      const module = await this.prisma.module.findUnique({ where: { id: data.moduleId } });
      if (!module) {
        throw new NotFoundError("Module");
      }

      const subModule = await this.prisma.subModule.create({
        data: {
          name: data.name,
          moduleId: data.moduleId,
          ...(data.courseIds && data.courseIds.length > 0 && {
            courses: {
              connect: data.courseIds.map((id: number) => ({ id }))
            }
          })
        },
        include: {
          courses: {
            select: { id: true }
          }
        }
      });

      // Log activity
      try {
        await this.prisma.employeeActivity.create({
          data: {
            employeeId: createdById,
            activityType: 'COURSE_UPLOADED',
            description: `Created sub-module: ${subModule.name}`,
            relatedId: subModule.id
          }
        });
      } catch (e) { /* ignore activity log errors */ }

      return {
        id: subModule.id,
        name: subModule.name,
        moduleId: subModule.moduleId,
        courseIds: subModule.courses.map((c: any) => c.id),
        createdAt: subModule.createdAt
      };
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      // Handle known prisma errors if needed
      throw new InternalServerError("Failed to create sub-module");
    }
  }

  /**
   * PUT /admin/content/modules/:moduleId - Canonical format
   * Returns flat object with updatedAt
   */
  async updateModuleCanonical(id: number, data: any) {
    try {
      const existing = await this.prisma.module.findUnique({ where: { id } });
      if (!existing) {
        throw new NotFoundError("Module");
      }

      const module = await this.prisma.module.update({
        where: { id },
        data: {
          name: data.name,
          updatedAt: new Date()
        }
      });

      return {
        id: module.id,
        name: module.name,
        uniteId: module.uniteId,
        createdAt: module.createdAt,
        updatedAt: module.updatedAt
      };
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      throw new InternalServerError("Failed to update module");
    }
  }

  /**
   * POST /admin/content/courses - Canonical format
   * Returns flat object directly with createdAt
   */
  async createCourseCanonical(data: any, createdById: number) {
    try {
      // Validate module exists
      const module = await this.prisma.module.findUnique({ where: { id: data.moduleId } });
      if (!module) {
        throw new NotFoundError("Module");
      }

      const course = await this.prisma.course.create({
        data: {
          name: data.name,
          description: data.description || null,
          moduleId: data.moduleId
        }
      });

      // Log activity
      try {
        await this.prisma.employeeActivity.create({
          data: {
            employeeId: createdById,
            activityType: 'COURSE_UPLOADED',
            description: `Created course: ${course.name}`,
            relatedId: course.id
          }
        });
      } catch (e) { /* ignore activity log errors */ }

      return {
        id: course.id,
        name: course.name,
        description: course.description,
        moduleId: course.moduleId,
        createdAt: course.createdAt
      };
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      throw new InternalServerError("Failed to create course");
    }
  }

  /**
   * PUT /admin/content/courses/:courseId - Canonical format
   * Returns flat object with updatedAt
   */
  async updateCourseCanonical(id: number, data: any) {
    try {
      const existing = await this.prisma.course.findUnique({ where: { id } });
      if (!existing) {
        throw new NotFoundError("Course");
      }

      const course = await this.prisma.course.update({
        where: { id },
        data: {
          name: data.name,
          description: data.description,
          updatedAt: new Date()
        }
      });

      return {
        id: course.id,
        name: course.name,
        description: course.description,
        moduleId: course.moduleId,
        createdAt: course.createdAt,
        updatedAt: course.updatedAt
      };
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      throw new InternalServerError("Failed to update course");
    }
  }

  /**
   * GET /admin/content/filters - Canonical format
   * Returns hierarchical content structure: {unites: [{id, name, modules: [{id, name, courses}]}]}
   */
  async getAdminContentFilters(filters: { isResidency?: boolean; yearLevel?: string }) {
    try {
      // Build where clause for study packs based on filters
      const studyPackWhere: any = {};
      if (filters.isResidency !== undefined) {
        studyPackWhere.type = filters.isResidency ? 'RESIDENCY' : 'YEAR';
      }
      if (filters.yearLevel) {
        studyPackWhere.yearNumber = filters.yearLevel;
      }

      // Get all unites with their modules and courses, filtered by study pack
      const unites = await this.prisma.unite.findMany({
        where: Object.keys(studyPackWhere).length > 0 ? {
          studyPack: studyPackWhere
        } : undefined,
        select: {
          id: true,
          name: true,
          modules: {
            select: {
              id: true,
              name: true,
              courses: {
                select: {
                  id: true,
                  name: true
                }
              }
            }
          }
        },
        orderBy: { name: 'asc' }
      });

      // Transform to canonical format
      const result = {
        unites: unites.map(u => ({
          id: u.id,
          name: u.name,
          modules: u.modules.map(m => ({
            id: m.id,
            name: m.name,
            courses: m.courses.map(c => ({
              id: c.id,
              name: c.name
            }))
          }))
        }))
      };

      return result;
    } catch (error) {
      throw new InternalServerError("Failed to fetch content filters");
    }
  }

  // ==========================================
  // QUIZ MANAGEMENT
  // ==========================================

  async getAllQuizzes(page: number = 1, limit: number = 10) {
    try {
      const skip = (page - 1) * limit;

      const [quizzes, total] = await Promise.all([
        this.prisma.quiz.findMany({
          skip,
          take: limit,
          include: {
            course: { select: { name: true } },
            university: { select: { name: true } },
            createdBy: { select: { fullName: true } },
            quizQuestions: {
              include: {
                question: {
                  include: {
                    questionAnswers: true
                  }
                }
              }
            },
            quizSessions: {
              select: {
                id: true,
                status: true,
                score: true,
                percentage: true
              }
            },
            _count: {
              select: {
                quizQuestions: true,
                quizSessions: true
              }
            }
          },
          orderBy: { createdAt: 'desc' }
        }),
        this.prisma.quiz.count()
      ]);

      return {
        quizzes,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      };
    } catch (error) {
      throw new InternalServerError("Failed to fetch quizzes");
    }
  }

  private async validateQuizReferences(data: CreateQuizData, createdById: number): Promise<void> {
    // Validate courseId if provided
    if (data.courseId) {
      const course = await this.prisma.course.findUnique({ where: { id: data.courseId } });
      if (!course) {
        throw new BadRequestError(`Course with ID ${data.courseId} does not exist`);
      }
    }

    // Validate universityId if provided  
    if (data.universityId) {
      const university = await this.prisma.university.findUnique({ where: { id: data.universityId } });
      if (!university) {
        throw new BadRequestError(`University with ID ${data.universityId} does not exist`);
      }
    }

    // Validate createdById
    const user = await this.prisma.user.findUnique({ where: { id: createdById } });
    if (!user) {
      throw new BadRequestError(`User with ID ${createdById} does not exist`);
    }
  }

  async createQuizWithQuestions(data: CreateQuizData, createdById: number): Promise<Quiz> {
    try {
      // Validate references before attempting to create
      await this.validateQuizReferences(data, createdById);

      const result = await this.prisma.$transaction(async (tx: TransactionClient) => {
        // Create the quiz
        const quiz = await tx.quiz.create({
          data: {
            title: data.title,
            description: data.description,
            type: data.type,
            courseId: data.courseId,
            universityId: data.universityId,
            yearLevel: data.yearLevel,

            quizYear: data.quizYear,
            createdById
          }
        });

        // Create questions and their answers
        for (const questionData of data.questions) {
          // Use provided question type or determine based on number of correct answers
          const correctAnswersCount = questionData.answers.filter(a => a.isCorrect).length;
          const questionType = questionData.questionType || QuestionType.SINGLE_CHOICE;

          const question = await tx.question.create({
            data: {
              courseId: data.courseId,
              questionText: questionData.questionText,
              explanation: questionData.explanation,
              questionType: questionType,
              universityId: data.universityId,
              yearLevel: data.yearLevel,
              createdById
            }
          });

          // Link question to quiz
          await tx.quizQuestion.create({
            data: {
              quizId: quiz.id,
              questionId: question.id
            }
          });

          // Create answers
          for (const answerData of questionData.answers) {
            const answer = await tx.questionAnswer.create({
              data: {
                questionId: question.id,
                answerText: answerData.answerText,
                isCorrect: answerData.isCorrect,
                explanation: answerData.explanation
              }
            });

            // Create explanation images if provided
            if (answerData.images && answerData.images.length > 0) {
              for (const imageData of answerData.images) {
                await tx.explanationImage.create({
                  data: {
                    answerId: answer.id,
                    imagePath: imageData.imagePath,
                    altText: imageData.altText
                  }
                });
              }
            }
          }
        }

        return quiz;
      });

      // Log admin activity
      await this.prisma.employeeActivity.create({
        data: {
          employeeId: createdById,
          activityType: 'QUIZ_CREATED',
          description: `Created quiz: ${data.title} with ${data.questions.length} questions`,
          relatedId: result.id
        }
      });

      return result;
    } catch (error) {
      console.error("Error creating quiz with questions:", error);

      // Re-throw validation errors (BadRequestError) as-is
      if (error instanceof BadRequestError) {
        throw error;
      }

      // Handle specific Prisma errors
      if (error instanceof Error && 'code' in error) {
        const prismaError = error as any;

        if (prismaError.code === 'P2003') {
          // Foreign key constraint violation
          console.error('Foreign key constraint violation:', prismaError.meta);
          throw new BadRequestError("Invalid reference: Please check that the courseId, universityId, and createdById exist in the database");
        }

        if (prismaError.code === 'P2002') {
          // Unique constraint violation
          console.error('Unique constraint violation:', prismaError.meta);
          throw new BadRequestError("Duplicate entry: A quiz with this combination already exists");
        }

        if (prismaError.code === 'P2025') {
          // Record not found
          console.error('Record not found:', prismaError.meta);
          throw new BadRequestError("Referenced record not found");
        }
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new InternalServerError(`Failed to create quiz with questions: ${errorMessage}`);
    }
  }

  async updateQuiz(id: number, data: any, updatedById: number): Promise<Quiz> {
    try {
      const quiz = await this.prisma.quiz.update({
        where: { id },
        data,
        include: {
          course: { select: { name: true } },
          university: { select: { name: true } },
          _count: { select: { quizQuestions: true } }
        }
      });

      await this.prisma.employeeActivity.create({
        data: {
          employeeId: updatedById,
          activityType: 'QUIZ_CREATED',
          description: `Updated quiz: ${quiz.title}`,
          relatedId: quiz.id
        }
      });

      return quiz;
    } catch (error) {
      if ((error as any).code === 'P2025') {
        throw new NotFoundError("Quiz");
      }
      throw new InternalServerError("Failed to update quiz");
    }
  }

  async deleteQuiz(id: number, deletedById: number): Promise<void> {
    try {
      const quiz = await this.prisma.quiz.findUnique({ where: { id } });
      if (!quiz) {
        throw new NotFoundError("Quiz");
      }

      await this.prisma.quiz.delete({ where: { id } });

      await this.prisma.employeeActivity.create({
        data: {
          employeeId: deletedById,
          activityType: 'QUIZ_CREATED',
          description: `Deleted quiz: ${quiz.title}`,
          relatedId: id
        }
      });
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      if ((error as any).code === 'P2025') {
        throw new NotFoundError("Quiz");
      }
      throw new InternalServerError("Failed to delete quiz");
    }
  }

  // ==========================================
  // EXAM MANAGEMENT
  // ==========================================

  async getAllExams(page: number = 1, limit: number = 10) {
    try {
      const skip = (page - 1) * limit;

      const [exams, total] = await Promise.all([
        this.prisma.exam.findMany({
          skip,
          take: limit,
          include: {
            university: { select: { name: true } },
            createdBy: { select: { fullName: true } },
            examQuestions: {
              include: {
                question: {
                  include: {
                    questionAnswers: true
                  }
                }
              }
            },
            _count: {
              select: {
                examQuestions: true,
                quizSessions: true
              }
            }
          },
          orderBy: { createdAt: 'desc' }
        }),
        this.prisma.exam.count()
      ]);

      return {
        exams,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      };
    } catch (error) {
      throw new InternalServerError("Failed to fetch exams");
    }
  }

  private async validateExamReferences(data: CreateExamData, createdById: number): Promise<void> {
    // Validate universityId (required for exams)
    const university = await this.prisma.university.findUnique({ where: { id: data.universityId } });
    if (!university) {
      throw new BadRequestError(`University with ID ${data.universityId} does not exist`);
    }

    // Validate createdById
    const user = await this.prisma.user.findUnique({ where: { id: createdById } });
    if (!user) {
      throw new BadRequestError(`User with ID ${createdById} does not exist`);
    }
  }

  async createExamWithQuestions(data: CreateExamData, createdById: number): Promise<Exam> {
    try {
      // Validate references before attempting to create
      await this.validateExamReferences(data, createdById);

      const result = await this.prisma.$transaction(async (tx: TransactionClient) => {
        // Create the exam
        const exam = await tx.exam.create({
          data: {
            title: data.title,
            description: data.description,
            moduleId: data.moduleId,
            universityId: data.universityId,
            yearLevel: data.yearLevel,
            examYear: new Date(data.examYear),
            year: data.year,
            createdById
          }
        });

        // Create questions and their answers
        for (const questionData of data.questions) {
          const question = await tx.question.create({
            data: {
              questionText: questionData.questionText,
              explanation: questionData.explanation,
              universityId: data.universityId,
              yearLevel: data.yearLevel,
              createdById
            }
          });

          // Link question to exam
          await tx.examQuestion.create({
            data: {
              examId: exam.id,
              questionId: question.id
            }
          });

          // Create answers
          for (const answerData of questionData.answers) {
            const answer = await tx.questionAnswer.create({
              data: {
                questionId: question.id,
                answerText: answerData.answerText,
                isCorrect: answerData.isCorrect,
                explanation: answerData.explanation
              }
            });

            // Create explanation images if provided
            if (answerData.images && answerData.images.length > 0) {
              for (const imageData of answerData.images) {
                await tx.explanationImage.create({
                  data: {
                    answerId: answer.id,
                    imagePath: imageData.imagePath,
                    altText: imageData.altText
                  }
                });
              }
            }
          }
        }

        return exam;
      });

      // Log admin activity
      await this.prisma.employeeActivity.create({
        data: {
          employeeId: createdById,
          activityType: 'EXAM_CREATED',
          description: `Created exam: ${data.title} with ${data.questions.length} questions`,
          relatedId: result.id
        }
      });

      return result;
    } catch (error) {
      console.error("Error creating exam with questions:", error);

      // Re-throw validation errors (BadRequestError) as-is
      if (error instanceof BadRequestError) {
        throw error;
      }

      // Handle specific Prisma errors
      if (error instanceof Error && 'code' in error) {
        const prismaError = error as any;

        if (prismaError.code === 'P2003') {
          // Foreign key constraint violation
          throw new InternalServerError("Invalid reference: Please check that the universityId and createdById exist in the database");
        }

        if (prismaError.code === 'P2002') {
          // Unique constraint violation
          throw new InternalServerError("Duplicate entry: An exam with this combination already exists");
        }
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new InternalServerError(`Failed to create exam with questions: ${errorMessage}`);
    }
  }

  // ==========================================
  // QUESTION MANAGEMENT
  // ==========================================

  async getAllQuestions(
    page: number = 1,
    limit: number = 10,
    filters: {
      courseId?: number;
      moduleId?: number;
      questionType?: string;
      yearLevel?: string;
      examYear?: number;
      sourceId?: number;
      search?: string;
    } = {}
  ) {
    try {
      const skip = (page - 1) * limit;

      // Build where conditions based on filters
      const whereConditions: any = {};

      if (filters.courseId) {
        whereConditions.courseId = filters.courseId;
      }

      if (filters.moduleId) {
        whereConditions.course = {
          moduleId: filters.moduleId
        };
      }

      if (filters.questionType) {
        whereConditions.questionType = filters.questionType;
      }

      if (filters.yearLevel) {
        whereConditions.yearLevel = filters.yearLevel;
      }

      if (filters.examYear) {
        whereConditions.examYear = filters.examYear;
      }

      if (filters.sourceId) {
        whereConditions.sourceId = filters.sourceId;
      }

      if (filters.search) {
        whereConditions.questionText = {
          contains: filters.search,
          mode: 'insensitive'
        };
      }

      const [questions, total] = await Promise.all([
        this.prisma.question.findMany({
          where: whereConditions,
          skip,
          take: limit,
          select: {
            id: true,
            questionText: true,
            questionType: true,
            courseId: true,
            universityId: true,
            yearLevel: true,
            examYear: true,
            sourceId: true,
            createdAt: true
          },
          orderBy: { createdAt: 'desc' }
        }),
        this.prisma.question.count({ where: whereConditions })
      ]);

      return {
        items: questions,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      };
    } catch (error) {
      throw new InternalServerError("Failed to fetch questions");
    }
  }

  async getQuestionReportsCanonical(
    page: number = 1,
    limit: number = 10,
    filters: {
      status?: string;
      reportType?: string;
      questionId?: number;
      userId?: number;
      search?: string;
    } = {}
  ) {
    try {
      const skip = (page - 1) * limit;

      // Build where clause with filters
      const where: any = {};
      if (filters.status) where.status = filters.status;
      if (filters.reportType) where.reportType = filters.reportType;
      if (filters.questionId) where.questionId = filters.questionId;
      if (filters.userId) where.userId = filters.userId;
      if (filters.search) {
        where.description = { contains: filters.search };
      }

      // Get total count for pagination
      const total = await this.prisma.questionReport.count({ where });

      // Get paginated results with includes
      const reports = await this.prisma.questionReport.findMany({
        where,
        include: {
          user: { select: { id: true, email: true, fullName: true } },
          question: { select: { id: true, questionText: true } }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      });

      // Transform to canonical format
      const items = reports.map(report => ({
        id: report.id,
        questionId: report.questionId,
        question: {
          id: report.question.id,
          questionText: report.question.questionText
        },
        userId: report.userId,
        user: {
          id: report.user.id,
          email: report.user.email,
          fullName: report.user.fullName
        },
        reportType: report.reportType,
        description: report.description,
        status: report.status,
        adminNotes: report.adminResponse,
        createdAt: report.createdAt,
        updatedAt: report.updatedAt
      }));

      // Canonical pagination format
      return {
        items,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      };
    } catch (error) {
      throw new InternalServerError("Failed to fetch question reports");
    }
  }

  async reviewQuestionReportCanonical(
    reportId: number,
    reviewerId: number,
    data: { status: string; adminNotes?: string }
  ) {
    try {
      const reviewedAt = new Date();

      const report = await this.prisma.questionReport.update({
        where: { id: reportId },
        data: {
          status: data.status as any,
          reviewedById: reviewerId,
          adminResponse: data.adminNotes || null,
          updatedAt: reviewedAt
        },
        include: {
          question: { select: { questionText: true } }
        }
      });

      await this.prisma.employeeActivity.create({
        data: {
          employeeId: reviewerId,
          activityType: 'QUESTION_VERIFIED',
          description: `${data.status.toLowerCase()} question report for: ${report.question.questionText.substring(0, 50)}...`,
          relatedId: reportId
        }
      });

      // Canonical response format
      return {
        id: report.id,
        questionId: report.questionId,
        userId: report.userId,
        reportType: report.reportType,
        description: report.description,
        status: report.status,
        adminNotes: report.adminResponse,
        createdAt: report.createdAt,
        updatedAt: report.updatedAt,
        reviewedBy: reviewerId,
        reviewedAt
      };
    } catch (error: any) {
      if (error.code === 'P2025') {
        throw new NotFoundError("Question report");
      }
      console.error("Error reviewing question report:", error);
      throw new InternalServerError("Failed to review question report");
    }
  }

  // ==========================================
  // SUBSCRIPTION MANAGEMENT
  // ==========================================

  async getAllSubscriptions(filters: SubscriptionFilters) {
    try {
      const { page, limit, status, userId, studyPackId } = filters;
      const skip = (page - 1) * limit;

      const where: any = {};
      if (status) where.status = status;
      if (userId) where.userId = userId;
      if (studyPackId) where.studyPackId = studyPackId;

      const [subscriptions, total] = await Promise.all([
        this.prisma.subscription.findMany({
          where,
          skip,
          take: limit,
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                email: true
              }
            },
            studyPack: { select: { id: true, name: true } }
          },
          orderBy: { createdAt: 'desc' }
        }),
        this.prisma.subscription.count({ where })
      ]);

      // Canonical format: items array with nested user and studyPack objects
      const items = subscriptions.map(sub => ({
        id: sub.id,
        userId: sub.userId,
        user: {
          id: sub.user.id,
          email: sub.user.email,
          fullName: sub.user.fullName
        },
        studyPackId: sub.studyPackId,
        studyPack: {
          id: sub.studyPack.id,
          name: sub.studyPack.name
        },
        status: sub.status,
        startDate: sub.startDate,
        endDate: sub.endDate,
        createdAt: sub.createdAt
      }));

      return {
        items,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      };
    } catch (error) {
      throw new InternalServerError("Failed to fetch subscriptions");
    }
  }

  async updateSubscriptionCanonical(id: number, data: { status?: string; endDate?: string }, updatedById: number) {
    try {
      // Build update data
      const updateData: any = {
        updatedAt: new Date()
      };
      if (data.status) updateData.status = data.status;
      if (data.endDate) updateData.endDate = new Date(data.endDate);

      const subscription = await this.prisma.subscription.update({
        where: { id },
        data: updateData,
        include: {
          user: { select: { fullName: true } }
        }
      });

      await this.prisma.employeeActivity.create({
        data: {
          employeeId: updatedById,
          activityType: 'QUESTION_EDITED',
          description: `Updated subscription for ${subscription.user.fullName}`,
          relatedId: subscription.id
        }
      });

      // Canonical format: flat subscription object
      return {
        id: subscription.id,
        userId: subscription.userId,
        studyPackId: subscription.studyPackId,
        status: subscription.status,
        startDate: subscription.startDate,
        endDate: subscription.endDate,
        updatedAt: subscription.updatedAt
      };
    } catch (error) {
      if ((error as any).code === 'P2025') {
        throw new NotFoundError("Subscription");
      }
      throw new InternalServerError("Failed to update subscription");
    }
  }

  async getSubscriptionStats() {
    try {
      const [
        totalSubscriptions,
        activeSubscriptions,
        expiredSubscriptions,
        cancelledSubscriptions,
        revenueStats,
        subscriptionsByPack
      ] = await Promise.all([
        this.prisma.subscription.count(),
        this.prisma.subscription.count({ where: { status: 'ACTIVE' } }),
        this.prisma.subscription.count({ where: { status: 'EXPIRED' } }),
        this.prisma.subscription.count({ where: { status: 'CANCELLED' } }),
        this.prisma.subscription.aggregate({
          _sum: { amountPaid: true },
          _avg: { amountPaid: true }
        }),
        this.prisma.subscription.groupBy({
          by: ['studyPackId'],
          _count: true
        })
      ]);

      return {
        totalSubscriptions,
        activeSubscriptions,
        expiredSubscriptions,
        cancelledSubscriptions,
        totalRevenue: revenueStats._sum.amountPaid || 0,
        averageRevenue: revenueStats._avg.amountPaid || 0,
        subscriptionsByPack
      };
    } catch (error) {
      throw new InternalServerError("Failed to fetch subscription stats");
    }
  }

  // ==========================================
  // MONTHLY SUBSCRIPTION MANAGEMENT
  // ==========================================

  async cancelSubscriptionCanonical(id: number, reason: string | undefined, cancelledById: number) {
    try {
      // First check if subscription exists and is not already cancelled
      const existingSubscription = await this.prisma.subscription.findUnique({
        where: { id },
        include: {
          user: { select: { fullName: true } },
          studyPack: { select: { name: true } }
        }
      });

      if (!existingSubscription) {
        throw new NotFoundError("Subscription");
      }

      if (existingSubscription.status === 'CANCELLED') {
        throw new BadRequestError("Subscription is already cancelled");
      }

      const cancellationDate = new Date();

      // Update subscription status to cancelled
      await this.prisma.subscription.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          updatedAt: cancellationDate
        }
      });

      // Log the activity
      await this.prisma.employeeActivity.create({
        data: {
          employeeId: cancelledById,
          activityType: 'QUESTION_EDITED',
          description: `Cancelled subscription for ${existingSubscription.user.fullName} - ${existingSubscription.studyPack.name}${reason ? ` (Reason: ${reason})` : ''}`,
          relatedId: id
        }
      });

      // Canonical format: {id, status, cancellationDate, cancellationReason}
      return {
        id,
        status: 'CANCELLED',
        cancellationDate,
        cancellationReason: reason || null
      };
    } catch (error) {
      if ((error as any).code === 'P2025') {
        throw new NotFoundError("Subscription");
      }
      if (error instanceof BadRequestError || error instanceof NotFoundError) {
        throw error;
      }
      throw new InternalServerError("Failed to cancel subscription");
    }
  }

  async addMonthsToSubscriptionCanonical(id: number, months: number, reason: string | undefined, updatedById: number) {
    try {
      // First check if subscription exists
      const existingSubscription = await this.prisma.subscription.findUnique({
        where: { id },
        include: {
          user: { select: { fullName: true } },
          studyPack: { select: { name: true } }
        }
      });

      if (!existingSubscription) {
        throw new NotFoundError("Subscription");
      }

      if (existingSubscription.status === 'CANCELLED') {
        throw new BadRequestError("Cannot add months to a cancelled subscription");
      }

      // Calculate new end date
      const currentEndDate = new Date(existingSubscription.endDate);
      const newEndDate = new Date(currentEndDate);
      newEndDate.setMonth(newEndDate.getMonth() + months);

      // Update subscription with new end date and set status to ACTIVE if it was EXPIRED
      const newStatus = existingSubscription.status === 'EXPIRED' ? 'ACTIVE' : existingSubscription.status;
      const updatedAt = new Date();

      const subscription = await this.prisma.subscription.update({
        where: { id },
        data: {
          endDate: newEndDate,
          status: newStatus,
          updatedAt
        }
      });

      // Log the activity
      await this.prisma.employeeActivity.create({
        data: {
          employeeId: updatedById,
          activityType: 'QUESTION_EDITED',
          description: `Added ${months} month(s) to subscription for ${existingSubscription.user.fullName} - ${existingSubscription.studyPack.name}${reason ? ` (Reason: ${reason})` : ''}`,
          relatedId: subscription.id
        }
      });

      // Canonical format: flat subscription object with updatedAt
      return {
        id: subscription.id,
        userId: subscription.userId,
        studyPackId: subscription.studyPackId,
        status: subscription.status,
        startDate: subscription.startDate,
        endDate: subscription.endDate,
        updatedAt: subscription.updatedAt
      };
    } catch (error) {
      if ((error as any).code === 'P2025') {
        throw new NotFoundError("Subscription");
      }
      if (error instanceof BadRequestError || error instanceof NotFoundError) {
        throw error;
      }
      throw new InternalServerError("Failed to add months to subscription");
    }
  }

  async activateSubscription(id: number, startDate: string | undefined, endDate: string | undefined, reason: string | undefined, activatedById: number): Promise<Subscription> {
    try {
      // First check if subscription exists
      const existingSubscription = await this.prisma.subscription.findUnique({
        where: { id },
        include: {
          user: { select: { fullName: true, email: true } },
          studyPack: { select: { name: true } }
        }
      });

      if (!existingSubscription) {
        throw new NotFoundError("Subscription");
      }

      if (existingSubscription.status === 'ACTIVE') {
        throw new BadRequestError("Subscription is already active");
      }

      // Prepare update data
      const updateData: any = {
        status: 'ACTIVE',
        updatedAt: new Date()
      };

      // Set start date (default to now if not provided)
      if (startDate) {
        updateData.startDate = new Date(startDate);
      } else if (existingSubscription.status === 'PENDING') {
        updateData.startDate = new Date();
      }

      // Set end date (default to 1 month from start date if not provided)
      if (endDate) {
        updateData.endDate = new Date(endDate);
      } else if (existingSubscription.status === 'PENDING') {
        const newEndDate = new Date(updateData.startDate || existingSubscription.startDate);
        newEndDate.setMonth(newEndDate.getMonth() + 1);
        updateData.endDate = newEndDate;
      }

      // Update subscription
      const subscription = await this.prisma.subscription.update({
        where: { id },
        data: updateData,
        include: {
          user: { select: { fullName: true, email: true } },
          studyPack: { select: { name: true } }
        }
      });

      // Log the activity
      await this.prisma.employeeActivity.create({
        data: {
          employeeId: activatedById,
          activityType: 'QUESTION_EDITED', // We can add a new activity type later
          description: `Activated subscription for ${subscription.user.fullName} - ${subscription.studyPack.name}${reason ? ` (Reason: ${reason})` : ''}`,
          relatedId: subscription.id
        }
      });

      return subscription;
    } catch (error) {
      if ((error as any).code === 'P2025') {
        throw new NotFoundError("Subscription");
      }
      if (error instanceof BadRequestError || error instanceof NotFoundError) {
        throw error;
      }
      throw new InternalServerError("Failed to activate subscription");
    }
  }

  // ==========================================
  // UNIVERSITY & SPECIALTY MANAGEMENT (Canonical spec)
  // ==========================================

  /**
   * GET /admin/universities
   * Paginated list with optional filters (search, country)
   * Returns: {items, total, page, limit, totalPages}
   */
  async getAllUniversitiesCanonical(filters: { page?: number; limit?: number; search?: string; country?: string }) {
    try {
      const page = filters.page || 1;
      const limit = filters.limit || 10;
      const skip = (page - 1) * limit;

      // Build where clause
      const whereClause: any = {};
      if (filters.search) {
        whereClause.name = { contains: filters.search, mode: 'insensitive' };
      }
      if (filters.country) {
        whereClause.country = { contains: filters.country, mode: 'insensitive' };
      }

      const [universities, total] = await Promise.all([
        this.prisma.university.findMany({
          where: whereClause,
          skip,
          take: limit,
          orderBy: { name: 'asc' }
        }),
        this.prisma.university.count({ where: whereClause })
      ]);

      // Transform to canonical format - note: city is not in schema, returning null
      const items = universities.map(u => ({
        id: u.id,
        name: u.name,
        country: u.country,
        city: null, // City field not in database schema
        createdAt: u.createdAt
      }));

      return {
        items,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      };
    } catch (error) {
      throw new InternalServerError("Failed to fetch universities");
    }
  }

  /**
   * POST /admin/universities
   * Create university - returns flat object directly
   */
  async createUniversityCanonical(data: { name: string; country: string; city?: string }, createdById: number) {
    try {
      const university = await this.prisma.university.create({
        data: {
          name: data.name,
          country: data.country
          // Note: city is not stored as it's not in the schema
        }
      });

      await this.prisma.employeeActivity.create({
        data: {
          employeeId: createdById,
          activityType: 'COURSE_UPLOADED',
          description: `Created university: ${university.name}`,
          relatedId: university.id
        }
      });

      // Return canonical flat object - city null as not stored
      return {
        id: university.id,
        name: university.name,
        country: university.country,
        city: null,
        createdAt: university.createdAt
      };
    } catch (error) {
      if ((error as any).code === 'P2002') {
        throw new BadRequestError("University name already exists");
      }
      throw new InternalServerError("Failed to create university");
    }
  }

  /**
   * PUT /admin/universities/:universityId
   * Update university - returns flat object with updatedAt
   */
  async updateUniversity(id: number, data: { name?: string; country?: string; city?: string }, updatedById: number) {
    try {
      // Check if university exists
      const existing = await this.prisma.university.findUnique({ where: { id } });
      if (!existing) {
        throw new NotFoundError("University");
      }

      // Build update data
      const updateData: any = {};
      if (data.name !== undefined) updateData.name = data.name;
      if (data.country !== undefined) updateData.country = data.country;
      // Note: city is not stored as it's not in the schema

      const university = await this.prisma.university.update({
        where: { id },
        data: updateData
      });

      await this.prisma.employeeActivity.create({
        data: {
          employeeId: updatedById,
          activityType: 'QUESTION_EDITED',
          description: `Updated university: ${university.name}`,
          relatedId: university.id
        }
      });

      // Return canonical flat object
      return {
        id: university.id,
        name: university.name,
        country: university.country,
        city: null,
        createdAt: university.createdAt,
        updatedAt: university.updatedAt
      };
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      if ((error as any).code === 'P2025') {
        throw new NotFoundError("University");
      }
      if ((error as any).code === 'P2002') {
        throw new BadRequestError("University name already exists");
      }
      throw new InternalServerError("Failed to update university");
    }
  }

  /**
   * DELETE /admin/universities/:universityId
   * Delete university - returns {message}
   */
  async deleteUniversity(id: number, deletedById: number): Promise<{ message: string }> {
    try {
      // Check if university exists
      const existing = await this.prisma.university.findUnique({
        where: { id },
        include: {
          _count: {
            select: { users: true, questions: true }
          }
        }
      });
      if (!existing) {
        throw new NotFoundError("University");
      }

      // Check for associated users/questions (optional safety check)
      if (existing._count.users > 0) {
        throw new BadRequestError(`Cannot delete university with ${existing._count.users} associated users`);
      }

      await this.prisma.university.delete({ where: { id } });

      await this.prisma.employeeActivity.create({
        data: {
          employeeId: deletedById,
          activityType: 'QUESTION_EDITED',
          description: `Deleted university: ${existing.name}`,
          relatedId: id
        }
      });

      return { message: "University deleted successfully" };
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof BadRequestError) throw error;
      if ((error as any).code === 'P2025') {
        throw new NotFoundError("University");
      }
      throw new InternalServerError("Failed to delete university");
    }
  }

  // Legacy method - kept for backward compatibility
  async getAllUniversities() {
    try {
      return await this.prisma.university.findMany({
        include: {
          _count: {
            select: {
              users: true,
              quizzes: true,
              questions: true,
              exams: true
            }
          }
        },
        orderBy: { name: 'asc' }
      });
    } catch (error) {
      throw new InternalServerError("Failed to fetch universities");
    }
  }

  // Legacy method - kept for backward compatibility
  async createUniversity(data: { name: string; country: string }, createdById: number): Promise<University> {
    try {
      const university = await this.prisma.university.create({
        data,
        include: {
          _count: { select: { users: true } }
        }
      });

      await this.prisma.employeeActivity.create({
        data: {
          employeeId: createdById,
          activityType: 'COURSE_UPLOADED',
          description: `Created university: ${university.name}`,
          relatedId: university.id
        }
      });
      return university;
    } catch (error) {
      throw new InternalServerError("Failed to create university");
    }
  }

  /**
   * GET /admin/specialties
   * Paginated list with optional search filter
   * Returns: {items, total, page, limit, totalPages}
   */
  async getAllSpecialtiesCanonical(filters: { page?: number; limit?: number; search?: string }) {
    try {
      const page = filters.page || 1;
      const limit = filters.limit || 10;
      const skip = (page - 1) * limit;

      // Build where clause
      const whereClause: any = {};
      if (filters.search) {
        whereClause.name = { contains: filters.search, mode: 'insensitive' };
      }

      const [specialties, total] = await Promise.all([
        this.prisma.specialty.findMany({
          where: whereClause,
          skip,
          take: limit,
          orderBy: { name: 'asc' }
        }),
        this.prisma.specialty.count({ where: whereClause })
      ]);

      // Transform to canonical format
      const items = specialties.map(s => ({
        id: s.id,
        name: s.name,
        createdAt: s.createdAt
      }));

      return {
        items,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      };
    } catch (error) {
      throw new InternalServerError("Failed to fetch specialties");
    }
  }

  /**
   * POST /admin/specialties
   * Create specialty - returns flat object directly
   */
  async createSpecialtyCanonical(data: { name: string }, createdById: number) {
    try {
      const specialty = await this.prisma.specialty.create({
        data: { name: data.name }
      });

      await this.prisma.employeeActivity.create({
        data: {
          employeeId: createdById,
          activityType: 'COURSE_UPLOADED',
          description: `Created specialty: ${specialty.name}`,
          relatedId: specialty.id
        }
      });

      // Return canonical flat object
      return {
        id: specialty.id,
        name: specialty.name,
        createdAt: specialty.createdAt
      };
    } catch (error) {
      if ((error as any).code === 'P2002') {
        throw new BadRequestError("Specialty name already exists");
      }
      throw new InternalServerError("Failed to create specialty");
    }
  }

  /**
   * PUT /admin/specialties/:specialtyId
   * Update specialty - returns flat object with updatedAt
   */
  async updateSpecialty(id: number, data: { name: string }, updatedById: number) {
    try {
      // Check if specialty exists
      const existing = await this.prisma.specialty.findUnique({ where: { id } });
      if (!existing) {
        throw new NotFoundError("Specialty");
      }

      const specialty = await this.prisma.specialty.update({
        where: { id },
        data: { name: data.name }
      });

      await this.prisma.employeeActivity.create({
        data: {
          employeeId: updatedById,
          activityType: 'QUESTION_EDITED',
          description: `Updated specialty: ${specialty.name}`,
          relatedId: specialty.id
        }
      });

      // Return canonical flat object
      return {
        id: specialty.id,
        name: specialty.name,
        createdAt: specialty.createdAt,
        updatedAt: specialty.updatedAt
      };
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      if ((error as any).code === 'P2025') {
        throw new NotFoundError("Specialty");
      }
      if ((error as any).code === 'P2002') {
        throw new BadRequestError("Specialty name already exists");
      }
      throw new InternalServerError("Failed to update specialty");
    }
  }

  /**
   * DELETE /admin/specialties/:specialtyId
   * Delete specialty - returns {message}
   */
  async deleteSpecialty(id: number, deletedById: number): Promise<{ message: string }> {
    try {
      // Check if specialty exists
      const existing = await this.prisma.specialty.findUnique({
        where: { id },
        include: {
          _count: {
            select: { users: true }
          }
        }
      });
      if (!existing) {
        throw new NotFoundError("Specialty");
      }

      // Check for associated users (optional safety check)
      if (existing._count.users > 0) {
        throw new BadRequestError(`Cannot delete specialty with ${existing._count.users} associated users`);
      }

      await this.prisma.specialty.delete({ where: { id } });

      await this.prisma.employeeActivity.create({
        data: {
          employeeId: deletedById,
          activityType: 'QUESTION_EDITED',
          description: `Deleted specialty: ${existing.name}`,
          relatedId: id
        }
      });

      return { message: "Specialty deleted successfully" };
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof BadRequestError) throw error;
      if ((error as any).code === 'P2025') {
        throw new NotFoundError("Specialty");
      }
      throw new InternalServerError("Failed to delete specialty");
    }
  }

  // Legacy method - kept for backward compatibility
  async getAllSpecialties() {
    try {
      return await this.prisma.specialty.findMany({
        include: {
          _count: {
            select: { users: true }
          }
        },
        orderBy: { name: 'asc' }
      });
    } catch (error) {
      throw new InternalServerError("Failed to fetch specialties");
    }
  }

  // Legacy method - kept for backward compatibility
  async createSpecialty(data: { name: string }, createdById: number): Promise<Specialty> {
    try {
      const specialty = await this.prisma.specialty.create({
        data,
        include: {
          _count: { select: { users: true } }
        }
      });

      await this.prisma.employeeActivity.create({
        data: {
          employeeId: createdById,
          activityType: 'COURSE_UPLOADED',
          description: `Created specialty: ${specialty.name}`,
          relatedId: specialty.id
        }
      });

      return specialty;
    } catch (error) {
      throw new InternalServerError("Failed to create specialty");
    }
  }

  // ==========================================
  // QUESTION SOURCE MANAGEMENT
  // ==========================================

  async createQuestionSource(name: string, createdById: number): Promise<QuestionSource> {
    try {
      const questionSource = await this.prisma.questionSource.create({
        data: { name }
      });

      // Log activity
      await this.prisma.employeeActivity.create({
        data: {
          employeeId: createdById,
          activityType: 'QUIZ_CREATED', // Using existing type temporarily
          description: `Created question source: ${questionSource.name}`,
          relatedId: questionSource.id
        }
      });

      return questionSource;
    } catch (error) {
      if ((error as any).code === 'P2002') {
        throw new BadRequestError("Question source name already exists");
      }
      throw new InternalServerError("Failed to create question source");
    }
  }

  async getAllQuestionSources(page: number = 1, limit: number = 10, search?: string) {
    try {
      const skip = (page - 1) * limit;

      // Build where clause with optional search
      const whereClause = search ? {
        name: {
          contains: search,
          mode: 'insensitive' as const
        }
      } : {};

      const [questionSources, total] = await Promise.all([
        this.prisma.questionSource.findMany({
          where: whereClause,
          skip,
          take: limit,
          include: {
            _count: {
              select: { questions: true }
            }
          },
          orderBy: { name: 'asc' }
        }),
        this.prisma.questionSource.count({ where: whereClause })
      ]);

      // Transform to canonical format with items key
      const items = questionSources.map(source => ({
        id: source.id,
        name: source.name,
        createdAt: source.createdAt
      }));

      return {
        items,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      };
    } catch (error) {
      throw new InternalServerError("Failed to retrieve question sources");
    }
  }

  async getQuestionSourceById(id: number) {
    try {
      const questionSource = await this.prisma.questionSource.findUnique({
        where: { id },
        include: {
          _count: {
            select: { questions: true }
          }
        }
      });

      if (!questionSource) {
        throw new NotFoundError("Question source");
      }

      // Return canonical format with questionCount
      return {
        id: questionSource.id,
        name: questionSource.name,
        questionCount: questionSource._count.questions,
        createdAt: questionSource.createdAt
      };
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      if ((error as any).code === 'P2025') {
        throw new NotFoundError("Question source");
      }
      throw new InternalServerError("Failed to retrieve question source");
    }
  }

  async updateQuestionSource(id: number, name: string, updatedById: number): Promise<QuestionSource> {
    try {
      const questionSource = await this.prisma.questionSource.update({
        where: { id },
        data: { name }
      });

      // Log activity
      await this.prisma.employeeActivity.create({
        data: {
          employeeId: updatedById,
          activityType: 'QUIZ_CREATED', // Using existing type temporarily
          description: `Updated question source: ${questionSource.name}`,
          relatedId: questionSource.id
        }
      });

      return questionSource;
    } catch (error) {
      if ((error as any).code === 'P2025') {
        throw new NotFoundError("Question source");
      }
      if ((error as any).code === 'P2002') {
        throw new BadRequestError("Question source name already exists");
      }
      throw new InternalServerError("Failed to update question source");
    }
  }

  async deleteQuestionSource(id: number, deletedById: number): Promise<void> {
    try {
      // Check if question source has associated questions
      const questionCount = await this.prisma.question.count({
        where: { sourceId: id }
      });

      if (questionCount > 0) {
        throw new BadRequestError(`Cannot delete question source. It has ${questionCount} associated questions. Please reassign or delete the questions first.`);
      }

      const questionSource = await this.prisma.questionSource.findUnique({
        where: { id },
        select: { name: true }
      });

      if (!questionSource) {
        throw new NotFoundError("Question source");
      }

      await this.prisma.questionSource.delete({
        where: { id }
      });

      // Log activity
      await this.prisma.employeeActivity.create({
        data: {
          employeeId: deletedById,
          activityType: 'QUIZ_CREATED', // Using existing type temporarily
          description: `Deleted question source: ${questionSource.name}`,
          relatedId: id
        }
      });
    } catch (error) {
      if ((error as any).code === 'P2025') {
        throw new NotFoundError("Question source");
      }
      // Re-throw BadRequestError for question count validation
      if (error instanceof BadRequestError) {
        throw error;
      }
      throw new InternalServerError("Failed to delete question source");
    }
  }

  // ==========================================
  // RESIDENCY QUESTION MANAGEMENT (Canonical spec)
  // ==========================================

  /**
   * GET /admin/residency-questions
   * List residency questions with pagination and filters
   */
  async getResidencyQuestions(filters: ResidencyQuestionFilters) {
    const { page, limit, part, examYear, universityId, search } = filters;
    const skip = (page - 1) * limit;

    // Build where clause - residency questions must have residency-specific metadata (`part`)
    const whereClause: any = {
      universityId: { not: null },
      examYear: { not: null },
      ...this.buildResidencyMetadataFilter(part)
    };

    // Apply filters
    if (universityId) {
      whereClause.universityId = universityId;
    }
    if (examYear) {
      whereClause.examYear = examYear;
    }
    if (search) {
      whereClause.questionText = { contains: search, mode: 'insensitive' };
    }

    const [questions, total] = await Promise.all([
      this.prisma.question.findMany({
        where: whereClause,
        include: {
          university: {
            select: { id: true, name: true }
          }
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' }
      }),
      this.prisma.question.count({ where: whereClause })
    ]);

    // Transform to match frontend expected format (ResidencyQuestionsResponse)
    const transformedQuestions = questions.map(q => ({
      id: q.id,
      questionId: q.id,
      part: this.extractPartFromMetadata(q.metadata),
      examYear: q.examYear,
      universityId: q.universityId,
      metadata: q.metadata,
      createdAt: q.createdAt.toISOString(),
      updatedAt: q.createdAt.toISOString(),
      question: {
        id: q.id,
        questionText: q.questionText,
        explanation: q.explanation,
        questionType: 'SINGLE_CHOICE' as const,
        questionImages: [],
        questionExplanationImages: [],
        questionAnswers: []
      },
      university: q.university
    }));

    return {
      questions: transformedQuestions,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        total,
        limit
      }
    };
  }

  /**
   * GET /admin/residency-questions/:id
   * Get single residency question with answers and images
   */
  async getResidencyQuestionById(questionId: number) {
    const question = await this.prisma.question.findUnique({
      where: { id: questionId },
      include: {
        university: {
          select: { id: true, name: true }
        },
        questionAnswers: {
          select: {
            id: true,
            answerText: true,
            isCorrect: true
          }
        },
        questionImages: {
          select: {
            id: true,
            imagePath: true,
            altText: true
          }
        },
        questionExplanationImages: {
          select: {
            id: true,
            imagePath: true,
            altText: true
          }
        }
      }
    });

    if (!question) {
      throw new NotFoundError("Residency question");
    }

    // Verify it's a residency question
    if (!this.isResidencyQuestion(question)) {
      throw new NotFoundError("Residency question");
    }

    return {
      id: question.id,
      questionText: question.questionText,
      part: this.extractPartFromMetadata(question.metadata),
      explanation: question.explanation,
      examYear: question.examYear,
      universityId: question.universityId,
      university: question.university,
      metadata: question.metadata,
      questionAnswers: question.questionAnswers,
      questionImages: question.questionImages,
      questionExplanationImages: question.questionExplanationImages,
      createdAt: question.createdAt.toISOString()
    };
  }

  /**
   * POST /admin/residency-questions
   * Create a new residency question
   */
  async createResidencyQuestion(data: CreateResidencyQuestionData, createdById: number) {
    // Validate university exists if provided
    if (data.universityId) {
      const university = await this.prisma.university.findUnique({
        where: { id: data.universityId }
      });
      if (!university) {
        throw new NotFoundError("University");
      }
    }

    // Store part in metadata
    const metadataObj: any = data.metadata ? JSON.parse(data.metadata) : {};
    if (data.part) {
      metadataObj.part = data.part;
    }
    const metadata = JSON.stringify(metadataObj);

    const question = await this.prisma.question.create({
      data: {
        questionText: data.questionText,
        explanation: data.explanation,
        examYear: data.examYear,
        universityId: data.universityId,
        metadata,
        tags: data.tags ? JSON.stringify(data.tags) : undefined,
        repetitionCount: data.repetitionCount,
        repetitionYears: data.repetitionYears ? JSON.stringify(data.repetitionYears) : undefined,
        createdById,
        questionAnswers: {
          create: data.questionAnswers.map(answer => ({
            answerText: answer.answerText,
            isCorrect: answer.isCorrect
          }))
        }
      },
      include: {
        questionAnswers: {
          select: {
            id: true,
            answerText: true,
            isCorrect: true
          }
        },
        questionImages: {
          select: {
            id: true,
            imagePath: true,
            altText: true
          }
        },
        questionExplanationImages: {
          select: {
            id: true,
            imagePath: true,
            altText: true
          }
        }
      }
    });

    return {
      id: question.id,
      questionText: question.questionText,
      part: data.part,
      explanation: question.explanation,
      examYear: question.examYear,
      universityId: question.universityId,
      tags: data.tags,
      repetitionCount: question.repetitionCount,
      repetitionYears: data.repetitionYears,
      questionAnswers: question.questionAnswers,
      questionImages: question.questionImages,
      questionExplanationImages: question.questionExplanationImages,
      createdAt: question.createdAt.toISOString()
    };
  }

  /**
   * PUT /admin/residency-questions/:id
   * Update a residency question
   */
  async updateResidencyQuestion(questionId: number, data: UpdateResidencyQuestionData) {
    // Check question exists and is a residency question
    const existingQuestion = await this.prisma.question.findUnique({
      where: { id: questionId }
    });

    if (!existingQuestion) {
      throw new NotFoundError("Residency question");
    }

    if (!this.isResidencyQuestion(existingQuestion)) {
      throw new NotFoundError("Residency question");
    }

    // Validate university if being updated
    if (data.universityId) {
      const university = await this.prisma.university.findUnique({
        where: { id: data.universityId }
      });
      if (!university) {
        throw new NotFoundError("University");
      }
    }

    // Build update data
    const updateData: any = {};
    if (data.questionText !== undefined) updateData.questionText = data.questionText;
    if (data.explanation !== undefined) updateData.explanation = data.explanation;
    if (data.examYear !== undefined) updateData.examYear = data.examYear;
    if (data.universityId !== undefined) updateData.universityId = data.universityId;
    if (data.tags !== undefined) updateData.tags = JSON.stringify(data.tags);
    if (data.repetitionCount !== undefined) updateData.repetitionCount = data.repetitionCount;
    if (data.repetitionYears !== undefined) updateData.repetitionYears = JSON.stringify(data.repetitionYears);

    // Handle part in metadata
    if (data.part !== undefined) {
      const existingMetadata = existingQuestion.metadata ? JSON.parse(existingQuestion.metadata) : {};
      updateData.metadata = JSON.stringify({ ...existingMetadata, part: data.part });
    } else if (data.metadata !== undefined) {
      updateData.metadata = data.metadata;
    }

    // Update question and answers in a transaction
    const question = await this.prisma.$transaction(async (tx: TransactionClient) => {
      // Update answers if provided
      if (data.questionAnswers) {
        // Delete existing answers
        await tx.questionAnswer.deleteMany({
          where: { questionId }
        });

        // Create new answers
        await tx.questionAnswer.createMany({
          data: data.questionAnswers.map(answer => ({
            questionId,
            answerText: answer.answerText,
            isCorrect: answer.isCorrect
          }))
        });
      }

      // Update question
      return tx.question.update({
        where: { id: questionId },
        data: updateData,
        include: {
          questionAnswers: {
            select: {
              id: true,
              answerText: true,
              isCorrect: true
            }
          },
          questionImages: {
            select: {
              id: true,
              imagePath: true,
              altText: true
            }
          },
          questionExplanationImages: {
            select: {
              id: true,
              imagePath: true,
              altText: true
            }
          }
        }
      });
    });

    return {
      id: question.id,
      questionText: question.questionText,
      part: this.extractPartFromMetadata(question.metadata),
      explanation: question.explanation,
      examYear: question.examYear,
      universityId: question.universityId,
      tags: question.tags ? JSON.parse(question.tags) : [],
      repetitionCount: question.repetitionCount,
      repetitionYears: question.repetitionYears ? JSON.parse(question.repetitionYears) : [],
      questionAnswers: question.questionAnswers,
      questionImages: question.questionImages,
      questionExplanationImages: question.questionExplanationImages,
      createdAt: question.createdAt.toISOString(),
      updatedAt: question.updatedAt.toISOString()
    };
  }

  /**
   * DELETE /admin/residency-questions/:id
   * Delete a residency question
   */
  async deleteResidencyQuestion(questionId: number) {
    // Check question exists and is a residency question
    const question = await this.prisma.question.findUnique({
      where: { id: questionId }
    });

    if (!question) {
      throw new NotFoundError("Residency question");
    }

    if (!this.isResidencyQuestion(question)) {
      throw new NotFoundError("Residency question");
    }

    // Delete question (cascade will handle answers, images, etc.)
    await this.prisma.question.delete({
      where: { id: questionId }
    });
  }

  /**
   * Residency questions are identified by dedicated residency metadata (`part`)
   * in addition to university and exam year context.
   */
  private isResidencyQuestion(question: { universityId: number | null; examYear: number | null; metadata: string | null }): boolean {
    if (question.universityId == null || question.examYear == null) {
      return false;
    }

    const part = this.extractPartFromMetadata(question.metadata);
    const validParts = ['Sciences_fondamentales', 'Pathologie_medico_chirurgical', 'Dossier_clinique'];
    return part !== null && validParts.includes(part);
  }

  /**
   * Build metadata filter to include only residency questions created through
   * residency flows (which set metadata.part).
   */
  private buildResidencyMetadataFilter(part?: string): any {
    const validParts = ['Sciences_fondamentales', 'Pathologie_medico_chirurgical', 'Dossier_clinique'];
    if (part && validParts.includes(part)) {
      return { metadata: { contains: `"part":"${part}"` } };
    }

    return {
      OR: validParts.map(p => ({ metadata: { contains: `"part":"${p}"` } }))
    };
  }

  /**
   * Helper to extract part from metadata JSON
   */
  private extractPartFromMetadata(metadata: string | null): string | null {
    if (!metadata) return null;
    try {
      const parsed = JSON.parse(metadata);
      return parsed.part || null;
    } catch {
      return null;
    }
  }

  /**
   * POST /admin/residency-questions/bulk
   * Bulk create residency questions
   */
  async bulkCreateResidencyQuestions(data: BulkCreateResidencyQuestionsData, createdById: number) {
    const { universityId, examYear, part, questions } = data;

    // Validate university exists
    const university = await this.prisma.university.findUnique({
      where: { id: universityId }
    });
    if (!university) {
      throw new NotFoundError("University");
    }

    // Create all questions in a transaction
    const createdQuestions = await this.prisma.$transaction(async (tx: TransactionClient) => {
      const results = [];

      for (const q of questions) {
        // Store part in metadata
        const metadataObj: any = q.metadata ? { original: q.metadata } : {};
        if (part) {
          metadataObj.part = part;
        }
        const metadata = JSON.stringify(metadataObj);

        const question = await tx.question.create({
          data: {
            questionText: q.questionText,
            explanation: q.explanation,
            examYear,
            universityId,
            metadata,
            createdById,
            questionAnswers: {
              create: q.questionAnswers.map(answer => ({
                answerText: answer.answerText,
                isCorrect: answer.isCorrect,
                explanation: answer.explanation
              }))
            }
          },
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
            questionExplanationImages: {
              select: {
                id: true,
                imagePath: true,
                altText: true
              }
            }
          }
        });

        results.push({
          id: question.id,
          questionId: question.id,
          part,
          question: {
            id: question.id,
            questionText: question.questionText,
            explanation: question.explanation,
            questionType: 'SINGLE_CHOICE' as const,
            universityId: question.universityId,
            yearLevel: 'SEVEN' as const,
            examYear: question.examYear,
            metadata: question.metadata,
            createdAt: question.createdAt.toISOString(),
            updatedAt: question.updatedAt.toISOString(),
            questionAnswers: question.questionAnswers,
            questionImages: question.questionImages,
            questionExplanationImages: question.questionExplanationImages
          }
        });
      }

      return results;
    });

    return {
      questions: createdQuestions,
      totalCreated: createdQuestions.length,
      message: `Successfully created ${createdQuestions.length} residency questions`
    };
  }

  // ==========================================
  // MODULE BOOKS MANAGEMENT
  // ==========================================

  /**
   * GET /admin/modules/:id/books
   * Get all books for a module
   */
  async getModuleBooks(moduleId: number) {
    // Check if module exists
    const module = await this.prisma.module.findUnique({
      where: { id: moduleId }
    });

    if (!module) {
      throw new NotFoundError("Module");
    }

    const books = await this.prisma.moduleBook.findMany({
      where: { moduleId },
      orderBy: { createdAt: 'desc' }
    });

    return {
      books: books.map(book => ({
        name: book.name,
        cover_path: book.coverPath,
        view: book.viewUrl,
        tag: book.tag
      }))
    };
  }

  /**
   * POST /admin/modules/:id/books
   * Bulk create books for a module
   */
  async createModuleBooks(
    moduleId: number,
    books: Array<{ name: string; coverPath?: string; viewUrl: string; tag?: string }>,
    createdById: number
  ) {
    // Check if module exists
    const module = await this.prisma.module.findUnique({
      where: { id: moduleId }
    });

    if (!module) {
      throw new NotFoundError("Module");
    }

    // Create all books in a transaction
    const createdBooks = await this.prisma.$transaction(async (tx: TransactionClient) => {
      const results = [];

      for (const book of books) {
        const created = await tx.moduleBook.create({
          data: {
            moduleId,
            name: book.name,
            coverPath: book.coverPath || null,
            viewUrl: book.viewUrl,
            tag: book.tag || null
          }
        });
        results.push(created);
      }

      return results;
    });

    // Log activity
    await this.prisma.employeeActivity.create({
      data: {
        employeeId: createdById,
        activityType: 'RESOURCE_ADDED',
        description: `Added ${createdBooks.length} books to module: ${module.name}`,
        relatedId: moduleId
      }
    });

    return {
      books: createdBooks.map(book => ({
        name: book.name,
        cover_path: book.coverPath,
        view: book.viewUrl,
        tag: book.tag
      })),
      totalCreated: createdBooks.length,
      message: `Successfully created ${createdBooks.length} books`
    };
  }

  /**
   * POST /admin/sub-modules/:id/books
   * Bulk create books for a sub-module
   */
  async createSubModuleBooks(
    subModuleId: number,
    books: Array<{ name: string; coverPath?: string; viewUrl: string; tag?: string }>,
    createdById: number
  ) {
    // Check if sub-module exists
    const subModule = await this.prisma.subModule.findUnique({
      where: { id: subModuleId }
    });

    if (!subModule) {
      throw new NotFoundError("Sub-Module");
    }

    // Create all books in a transaction
    const createdBooks = await this.prisma.$transaction(async (tx: TransactionClient) => {
      const results = [];

      for (const book of books) {
        const created = await tx.subModuleBook.create({
          data: {
            subModuleId,
            name: book.name,
            coverPath: book.coverPath || null,
            viewUrl: book.viewUrl,
            tag: book.tag || null
          }
        });
        results.push(created);
      }

      return results;
    });

    // Log activity
    await this.prisma.employeeActivity.create({
      data: {
        employeeId: createdById,
        activityType: 'RESOURCE_ADDED',
        description: `Added ${createdBooks.length} books to sub-module: ${subModule.name}`,
        relatedId: subModuleId
      }
    });

    return {
      books: createdBooks.map(book => ({
        name: book.name,
        cover_path: book.coverPath,
        view: book.viewUrl,
        tag: book.tag
      })),
      totalCreated: createdBooks.length,
      message: `Successfully created ${createdBooks.length} books`
    };
  }

}
