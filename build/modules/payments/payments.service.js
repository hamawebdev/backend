"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
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
exports.PaymentsService = void 0;
const crypto_1 = __importDefault(require("crypto"));
const tsyringe_1 = require("tsyringe");
const db_1 = __importDefault(require("../../config/db"));
let PaymentsService = class PaymentsService {
    constructor(prismaService) {
        this.prismaService = prismaService;
    }
    get prisma() {
        return this.prismaService.getClient();
    }
    /**
     * Create a new checkout session with Chargily
     */
    createCheckout(input, userId) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('Creating checkout for user:', userId);
            const { studyPackId, paymentDuration, locale = 'ar', paymentMethod = 'edahabia' } = input;
            console.log("imput", input);
            // Validate required fields
            if (!userId || !studyPackId || !paymentDuration) {
                throw new Error('Missing required fields: userId, studyPackId, paymentDuration');
            }
            // Validate payment duration
            if (!paymentDuration.type || (paymentDuration.type !== 'monthly' && paymentDuration.type !== 'yearly')) {
                throw new Error('Invalid payment duration type. Must be "monthly" or "yearly"');
            }
            if (paymentDuration.type === 'monthly' && (!paymentDuration.months || paymentDuration.months < 1)) {
                throw new Error('Invalid months count for monthly payment');
            }
            if (paymentDuration.type === 'yearly' && (!paymentDuration.years || paymentDuration.years < 1)) {
                throw new Error('Invalid years count for yearly payment');
            }
            // Get study pack to calculate amount
            const studyPack = yield this.prisma.studyPack.findUnique({
                where: { id: studyPackId }
            });
            if (!studyPack) {
                throw new Error('Study pack not found');
            }
            // Calculate amount based on payment duration
            let amountDzd;
            let months;
            if (paymentDuration.type === 'monthly') {
                months = paymentDuration.months;
                if (!studyPack.pricePerMonth) {
                    throw new Error('Monthly price not set for this study pack');
                }
                amountDzd = parseFloat(studyPack.pricePerMonth.toString()) * months;
            }
            else {
                months = paymentDuration.years * 12;
                if (!studyPack.pricePerYear) {
                    throw new Error('Yearly price not set for this study pack');
                }
                amountDzd = parseFloat(studyPack.pricePerYear.toString()) * paymentDuration.years;
            }
            // Create subscription with PENDING status
            // Note: End date will be calculated and set when payment webhook is received
            const now = new Date();
            const subscription = yield this.prisma.subscription.create({
                data: {
                    userId,
                    studyPackId,
                    status: 'PENDING',
                    startDate: now,
                    endDate: now, // Temporary end date, will be updated on successful payment
                    amountPaid: amountDzd,
                    paymentMethod,
                }
            });
            console.log('Created subscription with ID:', subscription.id);
            // Compute base URL based on mode
            const base = process.env.CHARGILY_MODE === 'live'
                ? 'https://pay.chargily.net/api/v2'
                : 'https://pay.chargily.net/test/api/v2';
            // Build checkout payload
            const payload = {
                amount: amountDzd,
                currency: 'dzd',
                payment_method: paymentMethod,
                success_url: `${process.env.APP_BASE_URL}`,
                failure_url: `${process.env.APP_BASE_URL}`,
                webhook_endpoint: 'https://srv953380.hstgr.cloud/api/v1/payments/webhook', // Using production domain
                locale,
                chargily_pay_fees_allocation: 'customer',
                metadata: {
                    subscriptionId: String(subscription.id),
                    userId: String(userId),
                    studyPackId: String(studyPackId),
                    paymentDurationMonths: String(months) // Store duration for end date calculation in webhook
                }
            };
            console.log('Sending checkout request to Chargily with payload:', JSON.stringify(payload, null, 2));
            // Create checkout with Chargily
            const resp = yield fetch(`${base}/checkouts`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${process.env.CHARGILY_SECRET_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });
            if (!resp.ok) {
                const err = yield resp.text();
                console.error('Chargily create checkout failed:', err);
                throw new Error(`Chargily create checkout failed: ${err}`);
            }
            const data = yield resp.json();
            console.log('Checkout created successfully:', data);
            return { checkoutUrl: data.checkout_url, checkoutId: data.id };
        });
    }
    /**
     * Handle Chargily webhook events
     */
    handleWebhook(rawBody, signature) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            console.log('Received webhook event');
            console.log('Raw body length:', (rawBody === null || rawBody === void 0 ? void 0 : rawBody.length) || 0);
            console.log('Signature provided:', !!signature);
            // TEMPORARILY DISABLED FOR TESTING - RE-ENABLE AFTER TESTING IS COMPLETE
            // Verify signature
            if (!signature || !rawBody) {
                throw new Error('Missing signature or body');
            }
            const computedSignature = crypto_1.default
                .createHmac('sha256', process.env.CHARGILY_SECRET_KEY)
                .update(rawBody)
                .digest('hex');
            // Constant-time comparison
            if (!crypto_1.default.timingSafeEqual(Buffer.from(signature), Buffer.from(computedSignature))) {
                console.error('Invalid signature');
                throw new Error('Invalid signature');
            }
            // Parse event
            const event = JSON.parse(rawBody.toString());
            console.log('Parsed webhook event:', event);
            // Idempotency check
            try {
                yield this.prisma.paymentEvent.create({
                    data: {
                        id: event.id,
                        type: event.type,
                        checkoutId: ((_a = event.data) === null || _a === void 0 ? void 0 : _a.id) || null
                    }
                });
            }
            catch (error) {
                // Event already processed
                console.log('Event already processed:', event.id);
                return;
            }
            // Process events
            if (event.type === 'checkout.paid') {
                console.log('Processing checkout.paid event');
                const metadata = ((_b = event.data) === null || _b === void 0 ? void 0 : _b.metadata) || {};
                const subscriptionId = Number(metadata.subscriptionId);
                const paymentDurationMonths = Number(metadata.paymentDurationMonths) || 1;
                yield this.prisma.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
                    var _a, _b, _c, _d, _e, _f, _g, _h;
                    // Calculate the actual end date based on payment duration from metadata
                    const now = new Date();
                    const endDate = new Date(now);
                    endDate.setMonth(endDate.getMonth() + paymentDurationMonths);
                    console.log('Calculating subscription end date:');
                    console.log('- Start date:', now.toISOString());
                    console.log('- Duration months:', paymentDurationMonths);
                    console.log('- Calculated end date:', endDate.toISOString());
                    // Activate subscription and set calculated end date
                    yield tx.subscription.update({
                        where: { id: subscriptionId },
                        data: {
                            status: 'ACTIVE',
                            startDate: now, // Update start date to actual payment time
                            endDate: endDate,
                            paymentReference: (_b = (_a = event.data) === null || _a === void 0 ? void 0 : _a.id) !== null && _b !== void 0 ? _b : null,
                            paymentMethod: (_d = (_c = event.data) === null || _c === void 0 ? void 0 : _c.payment_method) !== null && _d !== void 0 ? _d : undefined,
                            amountPaid: (_f = (_e = event.data) === null || _e === void 0 ? void 0 : _e.amount) !== null && _f !== void 0 ? _f : undefined,
                        }
                    });
                    console.log('Successfully activated subscription:', subscriptionId);
                    console.log('Subscription updated with:');
                    console.log('- Status: ACTIVE');
                    console.log('- Start Date:', now.toISOString());
                    console.log('- End Date:', endDate.toISOString());
                    console.log('- Payment Reference:', (_g = event.data) === null || _g === void 0 ? void 0 : _g.id);
                    console.log('- Amount Paid:', (_h = event.data) === null || _h === void 0 ? void 0 : _h.amount);
                }));
            }
            if (event.type === 'checkout.failed') {
                console.log('Processing checkout.failed event');
                const metadata = ((_c = event.data) === null || _c === void 0 ? void 0 : _c.metadata) || {};
                const subscriptionId = Number(metadata.subscriptionId);
                if (Number.isFinite(subscriptionId)) {
                    yield this.prisma.subscription.update({
                        where: { id: subscriptionId },
                        data: {
                            status: 'CANCELLED',
                            endDate: new Date(),
                        }
                    });
                    console.log('Successfully cancelled subscription:', subscriptionId);
                }
            }
        });
    }
};
exports.PaymentsService = PaymentsService;
exports.PaymentsService = PaymentsService = __decorate([
    (0, tsyringe_1.injectable)(),
    __param(0, (0, tsyringe_1.inject)("db")),
    __metadata("design:paramtypes", [db_1.default])
], PaymentsService);
