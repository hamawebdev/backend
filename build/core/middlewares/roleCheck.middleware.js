"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.allRoles = exports.employeeOrStudent = exports.adminOrEmployee = exports.studentOnly = exports.employeeOnly = exports.adminOnly = exports.checkRole = void 0;
const client_1 = require("@prisma/client");
const tsyringe_1 = require("tsyringe");
const response_utils_1 = __importDefault(require("../utils/response.utils"));
const responseUtils = tsyringe_1.container.resolve(response_utils_1.default);
const checkRole = (allowedRoles) => {
    return (req, res, next) => {
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
        }
        catch (error) {
            responseUtils.sendInternalServerErrorResponse(res, 'Error checking user role');
        }
    };
};
exports.checkRole = checkRole;
// Predefined role middlewares for common use cases
exports.adminOnly = (0, exports.checkRole)([client_1.UserRole.ADMIN]);
exports.employeeOnly = (0, exports.checkRole)([client_1.UserRole.EMPLOYEE]);
exports.studentOnly = (0, exports.checkRole)([client_1.UserRole.STUDENT]);
exports.adminOrEmployee = (0, exports.checkRole)([client_1.UserRole.ADMIN, client_1.UserRole.EMPLOYEE]);
exports.employeeOrStudent = (0, exports.checkRole)([client_1.UserRole.EMPLOYEE, client_1.UserRole.STUDENT]);
exports.allRoles = (0, exports.checkRole)([client_1.UserRole.ADMIN, client_1.UserRole.EMPLOYEE, client_1.UserRole.STUDENT]);
