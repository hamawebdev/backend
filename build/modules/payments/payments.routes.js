"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const tsyringe_1 = require("tsyringe");
const payments_controller_1 = require("./payments.controller");
const auth_middleware_1 = __importDefault(require("../../core/middlewares/auth.middleware"));
const router = (0, express_1.Router)();
const paymentsController = tsyringe_1.container.resolve(payments_controller_1.PaymentsController);
// Create checkout endpoint - requires authentication
router.post('/checkouts', auth_middleware_1.default, paymentsController.createCheckout);
// Webhook endpoint - no auth needed as it's called by external service
router.post('/webhook', paymentsController.handleWebhook);
exports.default = router;
