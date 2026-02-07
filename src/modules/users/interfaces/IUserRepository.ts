import { User, UserRole, YearLevel } from "@prisma/client";

export default interface IUserRepository {
  findById(id: number): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  createUser(userData: {
    email: string;
    passwordHash: string;
    fullName: string;
    role?: UserRole;
    universityId?: number;
    specialtyId?: number;
    currentYear?: YearLevel;
  }): Promise<User>;
  updateUser(id: number, data: Partial<Omit<User, "id" | "createdAt" | "updatedAt">>): Promise<User>;
  deleteUser(id: number): Promise<User>;
  findByIdWithSubscriptions(id: number): Promise<User | null>;
  updateLastLogin(id: number): Promise<void>;
  verifyEmail(id: number): Promise<User>;
  updatePassword(id: number, passwordHash: string): Promise<User>;
  getAllStudyPackIds(): Promise<number[]>;
  setResetCode(id: number, code: string, expiresAt: Date): Promise<User>;
  clearResetCode(id: number): Promise<User>;
}