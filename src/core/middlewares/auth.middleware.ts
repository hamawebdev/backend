import { Response, NextFunction } from "express";
import { container } from "tsyringe";
import JwtUtils from "../utils/jwt.utils";
import ResponseUtils from "../utils/response.utils";
import { AppError } from "../errors/AppError";
import PrismaService from "../../config/db";
import { RequestWithUser, TJwtPayload } from "../../types/types";
import { accessGrantingSubscriptionWhere, buildJwtPayload } from "../../modules/auth/jwt-payload.builder";

const jwtUtils = container.resolve(JwtUtils);
const responseUtils = container.resolve(ResponseUtils);

// Some routers are mounted at '/', so a request can pass through this middleware
// more than once; remember which token was already loaded for this request.
const LOADED_TOKEN = Symbol("authLoadedToken");

/**
 * Verify the access token, then load the user from the database and build
 * req.user from it. The token only identifies the user: role, isActive,
 * currentYear and subscriptions come from the database on every request, so
 * deactivation, role changes and expired or cancelled subscriptions apply
 * immediately. A token issued before the user's last logout or password
 * change (older token_version) is rejected.
 */
const authMiddleware = async (req: RequestWithUser, res: Response, next: NextFunction): Promise<void> => {
  let authenticated = false;
  try {
    if (req.path === '/api/v1/payments/webhook' || req.originalUrl === '/api/v1/payments/webhook') {
      return next();
    };

    const authHeader = req.headers.authorization;

    if (!authHeader) {
      responseUtils.sendUnauthorizedResponse(res, 'Authorization header is required. Please include your access token.');
      return;
    }

    if (!authHeader.startsWith('Bearer ')) {
      responseUtils.sendUnauthorizedResponse(res, 'Invalid authorization format. Use: Bearer <token>');
      return;
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    if (!token) {
      responseUtils.sendUnauthorizedResponse(res, 'Access token is missing. Please provide a valid token.');
      return;
    }

    if ((req as any)[LOADED_TOKEN] === token && req.user) {
      return next();
    }

    if (!jwtUtils.verifyAccessToken(token)) {
      responseUtils.sendUnauthorizedResponse(res, 'Your session has expired or token is invalid. Please log in again.');
      return;
    }

    const tokenPayload: TJwtPayload = jwtUtils.getUserFromToken(token);
    const userId = Number(tokenPayload?.user_data?.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      responseUtils.sendUnauthorizedResponse(res, 'Invalid authentication token. Please log in again.');
      return;
    }

    const prisma = container.resolve(PrismaService).getClient();
    let user;
    try {
      user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          universityId: true,
          specialtyId: true,
          currentYear: true,
          emailVerified: true,
          isActive: true,
          tokenVersion: true,
          subscriptions: {
            where: accessGrantingSubscriptionWhere(),
            select: {
              id: true,
              studyPackId: true,
              status: true,
              endDate: true,
              studyPack: { select: { name: true, type: true, yearNumber: true } }
            }
          }
        }
      });
    } catch (dbError) {
      console.error('Auth middleware: failed to load user:', dbError);
      responseUtils.sendErrorResponse(res, new AppError('Unable to verify your session right now. Please try again shortly.', 503));
      return;
    }

    if (!user) {
      responseUtils.sendUnauthorizedResponse(res, 'Your account no longer exists. Please log in again.');
      return;
    }

    if (!user.isActive) {
      responseUtils.sendUnauthorizedResponse(res, 'Your account has been deactivated. Please contact support for assistance.');
      return;
    }

    if ((tokenPayload.token_version ?? 0) !== user.tokenVersion) {
      responseUtils.sendUnauthorizedResponse(res, 'Your session has ended. Please log in again.');
      return;
    }

    try {
      req.user = await buildJwtPayload(user, async () => {
        const packs = await prisma.studyPack.findMany({ where: { isActive: true }, select: { id: true } });
        return packs.map(pack => pack.id);
      });
    } catch (dbError) {
      console.error('Auth middleware: failed to load study packs:', dbError);
      responseUtils.sendErrorResponse(res, new AppError('Unable to verify your session right now. Please try again shortly.', 503));
      return;
    }
    (req as any)[LOADED_TOKEN] = token;
    authenticated = true;
  } catch (error: any) {
    console.error('Auth middleware error:', error);
    if (error.message && error.message.includes('expired')) {
      responseUtils.sendUnauthorizedResponse(res, 'Your session has expired. Please log in again.');
    } else if (error.message && error.message.includes('Invalid')) {
      responseUtils.sendUnauthorizedResponse(res, error.message);
    } else {
      responseUtils.sendUnauthorizedResponse(res, 'Authentication failed. Please log in again.');
    }
    return;
  }

  if (authenticated) {
    next();
  }
};

export default authMiddleware;
