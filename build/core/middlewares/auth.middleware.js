"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const tsyringe_1 = require("tsyringe");
const jwt_utils_1 = __importDefault(require("../utils/jwt.utils"));
const response_utils_1 = __importDefault(require("../utils/response.utils"));
const jwtUtils = tsyringe_1.container.resolve(jwt_utils_1.default);
const responseUtils = tsyringe_1.container.resolve(response_utils_1.default);
const authMiddleware = (req, res, next) => {
    try {
        if (req.path === '/api/v1/payments/webhook' || req.originalUrl === '/api/v1/payments/webhook') {
            return next();
        }
        ;
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
    }
    catch (error) {
        console.error('Auth middleware error:', error);
        if (error.message && error.message.includes('expired')) {
            responseUtils.sendUnauthorizedResponse(res, 'Your session has expired. Please log in again.');
        }
        else if (error.message && error.message.includes('Invalid')) {
            responseUtils.sendUnauthorizedResponse(res, error.message);
        }
        else {
            responseUtils.sendUnauthorizedResponse(res, 'Authentication failed. Please log in again.');
        }
    }
};
exports.default = authMiddleware;
