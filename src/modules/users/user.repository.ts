import { User, UserRole, YearLevel } from "@prisma/client";
import { inject, injectable } from "tsyringe";
import IUserRepository from "./interfaces/IUserRepository";
import PrismaService from "../../config/db";

@injectable()
export default class UserRepository implements IUserRepository {
  constructor(@inject("db") private prismaService: PrismaService) { }

  private get prisma() {
    return this.prismaService.getClient();
  }

  async findById(id: number): Promise<User | null> {
    try {
      return this.prisma.user.findUnique({
        where: { id },
        include: {
          university: true,
          specialty: true,
        }
      });
    } catch (error) {
      throw error;
    }
  }

  async findByEmail(email: string): Promise<User | null> {
    try {
      return this.prisma.user.findUnique({
        where: { email },
        include: {
          university: true,
          specialty: true,
          subscriptions: {
            include: {
              studyPack: true
            }
          }
        }
      });
    } catch (error) {
      throw error;
    }
  }

  async createUser(userData: {
    email: string;
    passwordHash: string;
    fullName: string;
    role?: UserRole;
    universityId?: number;
    specialtyId?: number;
    currentYear?: YearLevel;
  }): Promise<User> {
    try {
      return this.prisma.user.create({
        data: {
          email: userData.email,
          passwordHash: userData.passwordHash,
          fullName: userData.fullName,
          role: userData.role || UserRole.STUDENT,
          universityId: userData.universityId,
          specialtyId: userData.specialtyId,
          currentYear: userData.currentYear || YearLevel.ONE,
        },
        include: {
          university: true,
          specialty: true,
        }
      });
    } catch (error) {
      throw error;
    }
  }

  async updateUser(id: number, data: Partial<Omit<User, "id" | "createdAt" | "updatedAt">>): Promise<User> {
    try {
      return this.prisma.user.update({
        where: { id },
        data,
        include: {
          university: true,
          specialty: true,
          subscriptions: {
            include: {
              studyPack: true
            }
          }
        }
      });
    } catch (error) {
      throw error;
    }
  }

  async deleteUser(id: number): Promise<User> {
    try {
      return this.prisma.user.delete({
        where: { id },
      });
    } catch (error) {
      throw error;
    }
  }

  async findByIdWithSubscriptions(id: number): Promise<User | null> {
    try {
      return this.prisma.user.findUnique({
        where: { id },
        include: {
          university: true,
          specialty: true,
          subscriptions: {
            include: {
              studyPack: true
            },
            where: {
              status: 'ACTIVE',
              endDate: {
                gte: new Date()
              }
            }
          }
        }
      });
    } catch (error) {
      throw error;
    }
  }

  async updateLastLogin(id: number): Promise<void> {
    try {
      await this.prisma.user.update({
        where: { id },
        data: {
          lastLogin: new Date()
        }
      });
    } catch (error) {
      throw error;
    }
  }

  async verifyEmail(id: number): Promise<User> {
    try {
      return this.prisma.user.update({
        where: { id },
        data: {
          emailVerified: true
        }
      });
    } catch (error) {
      throw error;
    }
  }

  async updatePassword(id: number, passwordHash: string): Promise<User> {
    try {
      return this.prisma.user.update({
        where: { id },
        data: {
          passwordHash
        }
      });
    } catch (error) {
      throw error;
    }
  }

  async getAllStudyPackIds(): Promise<number[]> {
    try {
      const studyPacks = await this.prisma.studyPack.findMany({
        where: { isActive: true },
        select: { id: true }
      });
      return studyPacks.map(pack => pack.id);
    } catch (error) {
      throw error;
    }
  }

  async setResetCode(id: number, code: string, expiresAt: Date): Promise<User> {
    try {
      return this.prisma.user.update({
        where: { id },
        data: {
          resetCode: code,
          resetCodeExpiresAt: expiresAt
        }
      });
    } catch (error) {
      throw error;
    }
  }

  async clearResetCode(id: number): Promise<User> {
    try {
      return this.prisma.user.update({
        where: { id },
        data: {
          resetCode: null,
          resetCodeExpiresAt: null
        }
      });
    } catch (error) {
      throw error;
    }
  }
}