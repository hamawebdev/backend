import { Request, Response, NextFunction } from "express";
import { container } from "tsyringe";
import JwtUtils from "../utils/jwt.utils";
import ResponseUtils from "../utils/response.utils";
import { RequestWithUser } from "../../types/types";

const jwtUtils = container.resolve(JwtUtils);
const responseUtils = container.resolve(ResponseUtils);

const authMiddleware = (req: RequestWithUser, res: Response, next: NextFunction): void => {
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
    
    if (!jwtUtils.verifyAccessToken(token)) {
      responseUtils.sendUnauthorizedResponse(res, 'Your session has expired or token is invalid. Please log in again.');
      return;
    }

    const userPayload = jwtUtils.getUserFromToken(token);
    req.user = userPayload;
    
    next();
  } catch (error: any) {
    console.error('Auth middleware error:', error);
    if (error.message && error.message.includes('expired')) {
      responseUtils.sendUnauthorizedResponse(res, 'Your session has expired. Please log in again.');
    } else if (error.message && error.message.includes('Invalid')) {
      responseUtils.sendUnauthorizedResponse(res, error.message);
    } else {
      responseUtils.sendUnauthorizedResponse(res, 'Authentication failed. Please log in again.');
    }
  }
};

export default authMiddleware;
