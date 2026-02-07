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
exports.PaymentsController = void 0;
const tsyringe_1 = require("tsyringe");
const payments_service_1 = require("./payments.service");
const response_utils_1 = __importDefault(require("../../core/utils/response.utils"));
class PaymentsController {
    constructor() {
        /**
         * Create a new checkout session
         */
        this.createCheckout = (req, res) => __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                // Extract user ID from authenticated user
                const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.user_data.id;
                if (!userId) {
                    this.responseUtils.sendUnauthorizedResponse(res, 'User authentication required');
                    return;
                }
                const result = yield this.paymentsService.createCheckout(req.body, userId);
                this.responseUtils.sendSuccessResponse(res, result);
            }
            catch (error) {
                this.responseUtils.sendErrorResponse(res, error);
            }
        });
        /**
         * Handle Chargily webhook events
         */
        this.handleWebhook = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const rawBody = req.rawBody || Buffer.from('');
                const signature = req.header('signature');
                yield this.paymentsService.handleWebhook(rawBody, signature);
                res.status(200).send('OK');
            }
            catch (error) {
                console.error('Webhook error:', error.message);
                if (error.message === 'Invalid signature') {
                    res.status(403).send('Forbidden');
                }
                else if (error.message === 'Missing signature or body' || error.message === 'Missing request body') {
                    res.status(400).send('Bad Request');
                }
                else {
                    res.status(500).send('Internal Server Error');
                }
            }
        });
        this.paymentsService = tsyringe_1.container.resolve(payments_service_1.PaymentsService);
        this.responseUtils = tsyringe_1.container.resolve(response_utils_1.default);
    }
}
exports.PaymentsController = PaymentsController;
