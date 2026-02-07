import { Router } from 'express';
import { container } from 'tsyringe';
import { PaymentsController } from './payments.controller';
import authMiddleware from '../../core/middlewares/auth.middleware';

const router = Router();
const paymentsController = container.resolve(PaymentsController);

// Create checkout endpoint - requires authentication
router.post('/checkouts', authMiddleware, paymentsController.createCheckout);

// Webhook endpoint - no auth needed as it's called by external service
router.post('/webhook', paymentsController.handleWebhook);

export default router;