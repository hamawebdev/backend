import { User } from "@prisma/client";
import { 
  TAuthToken, 
  RegisterDto, 
  LoginDto, 
  ChangePasswordDto, 
  ForgotPasswordDto, 
  ResetPasswordDto,
  UpdateProfileDto,
  VerifyEmailDto
} from "../../../types/types";

export default interface IAuthService {
  register(userData: RegisterDto): Promise<TAuthToken>;
  login(loginData: LoginDto): Promise<TAuthToken>;
  refreshTokens(refreshToken: string): Promise<TAuthToken>;
  logout(token: string): Promise<void>;
  verifyEmail(data: VerifyEmailDto): Promise<void>;
  forgotPassword(data: ForgotPasswordDto): Promise<void>;
  resetPassword(data: ResetPasswordDto): Promise<void>;
  changePassword(userId: number, data: ChangePasswordDto): Promise<void>;
  updateProfile(userId: number, data: UpdateProfileDto): Promise<User>;
  getProfile(userId: number): Promise<User>;
}
