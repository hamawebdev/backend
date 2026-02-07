import { Response, NextFunction } from "express";
import { RequestWithUser } from "../../types/types";
import { container } from "tsyringe";
import ResponseUtils from "../utils/response.utils";

const responseUtils = container.resolve(ResponseUtils);

export const checkPayment = () => {
  return (req: RequestWithUser, res: Response, next: NextFunction): void => {
    try {
      // Skip subscription check for payment checkout endpoint
      if (req.path === '/api/v1/payments/checkouts' || req.originalUrl === '/api/v1/payments/checkouts') {
        return next();
      };
      if (req.path === '/api/v1/payments/webhook' || req.originalUrl === '/api/v1/payments/webhook') {
        return next();
      };

      if (!req.user) {
        responseUtils.sendUnauthorizedResponse(res, 'Authentication required');
        return;
      }

      const { has_active_subscription, payment_status } = req.user;
      
      if (!has_active_subscription || payment_status !== 'active') {
        responseUtils.sendForbiddenResponse(res, 'Active subscription required to access this resource');
        return;
      }

      next();
    } catch (error) {
      responseUtils.sendInternalServerErrorResponse(res, 'Error checking payment status');
    }
  };
};

export const checkStudyPackAccess = (studyPackId: number) => {
  return (req: RequestWithUser, res: Response, next: NextFunction): void => {
    try {
      if (!req.user) {
        responseUtils.sendUnauthorizedResponse(res, 'Authentication required');
        return;
      }

      const { accessible_study_packs } = req.user;
      
      if (!accessible_study_packs.includes(studyPackId)) {
        responseUtils.sendForbiddenResponse(res, 'You do not have access to this study pack');
        return;
      }

      next();
    } catch (error) {
      responseUtils.sendInternalServerErrorResponse(res, 'Error checking study pack access');
    }
  };
};

export const checkStudyPackAccessFromParams = () => {
  return (req: RequestWithUser, res: Response, next: NextFunction): void => {
    try {
      if (!req.user) {
        responseUtils.sendUnauthorizedResponse(res, 'Authentication required');
        return;
      }

      const studyPackId = parseInt(req.params.studyPackId || req.body.studyPackId);
      
      if (!studyPackId || isNaN(studyPackId)) {
        responseUtils.sendBadRequestResponse(res, 'Valid study pack ID is required');
        return;
      }

      const { accessible_study_packs } = req.user;
      
      if (!accessible_study_packs.includes(studyPackId)) {
        responseUtils.sendForbiddenResponse(res, 'You do not have access to this study pack');
        return;
      }

      next();
    } catch (error) {
      responseUtils.sendInternalServerErrorResponse(res, 'Error checking study pack access');
    }
  };
}; 