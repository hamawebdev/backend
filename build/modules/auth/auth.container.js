"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.container = void 0;
const tsyringe_1 = require("tsyringe");
Object.defineProperty(exports, "container", { enumerable: true, get: function () { return tsyringe_1.container; } });
const refreshToken_repository_1 = __importDefault(require("./refreshToken.repository"));
const auth_service_1 = __importDefault(require("./auth.service"));
const auth_controller_1 = __importDefault(require("./auth.controller"));
const google_oauth_service_1 = require("./services/google-oauth.service");
// Register refresh token repository
tsyringe_1.container.register('IRefreshTokenRepository', {
    useClass: refreshToken_repository_1.default
});
// Register auth service
tsyringe_1.container.register('IAuthService', {
    useClass: auth_service_1.default
});
// Register Google OAuth service
tsyringe_1.container.register(google_oauth_service_1.GoogleOAuthService, {
    useClass: google_oauth_service_1.GoogleOAuthService
});
// Register auth controller
tsyringe_1.container.register(auth_controller_1.default, {
    useClass: auth_controller_1.default
});
