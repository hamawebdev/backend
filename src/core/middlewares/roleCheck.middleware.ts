import { Response, NextFunction } from "express";
import { UserRole } from "@prisma/client";
import { RequestWithUser } from "../../types/types";
import { container } from "tsyringe";
import ResponseUtils from "../utils/response.utils";

const responseUtils = container.resolve(ResponseUtils);

export const checkRole = (allowedRoles: UserRole[]) => {
  return (req: RequestWithUser, res: Response, next: NextFunction): void => {
    try {
      if (!req.user) {
        responseUtils.sendUnauthorizedResponse(res, 'Authentication required');
        return;
      }

      const userRole = req.user.user_data.role;
      
      if (!allowedRoles.includes(userRole)) {
        responseUtils.sendForbiddenResponse(res, 'Insufficient permissions');
        return;
      }

      next();
    } catch (error) {
      responseUtils.sendInternalServerErrorResponse(res, 'Error checking user role');
    }
  };
};

// Predefined role middlewares for common use cases
export const adminOnly = checkRole([UserRole.ADMIN]);
export const employeeOnly = checkRole([UserRole.EMPLOYEE]);
export const studentOnly = checkRole([UserRole.STUDENT]);
export const adminOrEmployee = checkRole([UserRole.ADMIN, UserRole.EMPLOYEE]);
export const employeeOrStudent = checkRole([UserRole.EMPLOYEE, UserRole.STUDENT]);
export const allRoles = checkRole([UserRole.ADMIN, UserRole.EMPLOYEE, UserRole.STUDENT]); 