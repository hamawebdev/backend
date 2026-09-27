import passport from "passport";
import { Strategy as GoogleStrategy, VerifyCallback } from "passport-google-oauth20";
import { container } from "tsyringe";
import { GoogleOAuthService, GoogleProfile } from "../modules/auth/services/google-oauth.service";

const googleOAuthService = container.resolve(GoogleOAuthService);

// Serialize user for session (we don't use sessions, but passport requires this)
passport.serializeUser((user: any, done) => {
  done(null, user);
});

passport.deserializeUser((obj: any, done) => {
  done(null, obj);
});

// Google login is optional: without credentials the strategy is not registered and the
// API still starts (passport-oauth2 throws at construction when clientID is empty).
export const googleOAuthEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

if (googleOAuthEnabled) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        callbackURL: process.env.GOOGLE_CALLBACK_URL || "http://localhost:8080/api/v1/auth/google/callback",
        scope: ["profile", "email"],
      },
      async (
        accessToken: string,
        refreshToken: string,
        profile: any,
        done: VerifyCallback
      ) => {
        try {
          const googleProfile: GoogleProfile = {
            id: profile.id,
            displayName: profile.displayName,
            name: {
              familyName: profile.name?.familyName,
              givenName: profile.name?.givenName,
            },
            emails: profile.emails || [],
            photos: profile.photos || [],
          };

          const result = await googleOAuthService.authenticate(googleProfile);
        
          return done(null, {
            user: result.user,
            tokens: result.tokens,
            isNewUser: result.isNewUser,
          });
        } catch (error: any) {
          return done(error, false);
        }
      }
    )
  );
} else {
  console.warn("Google OAuth disabled: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are not set");
}

export default passport;
