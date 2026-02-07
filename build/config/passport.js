"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const passport_1 = __importDefault(require("passport"));
const passport_google_oauth20_1 = require("passport-google-oauth20");
const tsyringe_1 = require("tsyringe");
const google_oauth_service_1 = require("../modules/auth/services/google-oauth.service");
const googleOAuthService = tsyringe_1.container.resolve(google_oauth_service_1.GoogleOAuthService);
// Serialize user for session (we don't use sessions, but passport requires this)
passport_1.default.serializeUser((user, done) => {
    done(null, user);
});
passport_1.default.deserializeUser((obj, done) => {
    done(null, obj);
});
// Configure Google Strategy
passport_1.default.use(new passport_google_oauth20_1.Strategy({
    clientID: process.env.GOOGLE_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    callbackURL: process.env.GOOGLE_CALLBACK_URL || "http://localhost:8080/api/v1/auth/google/callback",
    scope: ["profile", "email"],
}, (accessToken, refreshToken, profile, done) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const googleProfile = {
            id: profile.id,
            displayName: profile.displayName,
            name: {
                familyName: (_a = profile.name) === null || _a === void 0 ? void 0 : _a.familyName,
                givenName: (_b = profile.name) === null || _b === void 0 ? void 0 : _b.givenName,
            },
            emails: profile.emails || [],
            photos: profile.photos || [],
        };
        const result = yield googleOAuthService.authenticate(googleProfile);
        return done(null, {
            user: result.user,
            tokens: result.tokens,
            isNewUser: result.isNewUser,
        });
    }
    catch (error) {
        return done(error, false);
    }
})));
exports.default = passport_1.default;
