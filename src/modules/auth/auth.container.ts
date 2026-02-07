import { container } from 'tsyringe';
import RefreshTokenRepository from './refreshToken.repository';
import AuthService from './auth.service';
import AuthController from './auth.controller';
import IRefreshTokenRepository from './interfaces/IRefreshTokenRepository';
import IAuthService from './interfaces/IAuthService';
import { GoogleOAuthService } from './services/google-oauth.service';

// Register refresh token repository
container.register<IRefreshTokenRepository>('IRefreshTokenRepository', {
  useClass: RefreshTokenRepository
});

// Register auth service
container.register<IAuthService>('IAuthService', {
  useClass: AuthService
});

// Register Google OAuth service
container.register(GoogleOAuthService, {
  useClass: GoogleOAuthService
});

// Register auth controller
container.register(AuthController, {
  useClass: AuthController
});

export { container }; 