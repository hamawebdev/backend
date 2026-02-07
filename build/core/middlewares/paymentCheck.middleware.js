"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkStudyPackAccessFromParams = exports.checkStudyPackAccess = exports.checkPayment = void 0;
const tsyringe_1 = require("tsyringe");
const response_utils_1 = __importDefault(require("../utils/response.utils"));
const responseUtils = tsyringe_1.container.resolve(response_utils_1.default);
const checkPayment = () => {
    return (req, res, next) => {
        try {
            // Skip subscription check for payment checkout endpoint
            if (req.path === '/api/v1/payments/checkouts' || req.originalUrl === '/api/v1/payments/checkouts') {
                return next();
            }
            ;
            if (req.path === '/api/v1/payments/webhook' || req.originalUrl === '/api/v1/payments/webhook') {
                return next();
            }
            ;
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
        }
        catch (error) {
            responseUtils.sendInternalServerErrorResponse(res, 'Error checking payment status');
        }
    };
};
exports.checkPayment = checkPayment;
const checkStudyPackAccess = (studyPackId) => {
    return (req, res, next) => {
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
        }
        catch (error) {
            responseUtils.sendInternalServerErrorResponse(res, 'Error checking study pack access');
        }
    };
};
exports.checkStudyPackAccess = checkStudyPackAccess;
const checkStudyPackAccessFromParams = () => {
    return (req, res, next) => {
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
        }
        catch (error) {
            responseUtils.sendInternalServerErrorResponse(res, 'Error checking study pack access');
        }
    };
};
exports.checkStudyPackAccessFromParams = checkStudyPackAccessFromParams;
