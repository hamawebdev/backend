import { Router, Request, Response, NextFunction } from 'express';
import { container } from 'tsyringe';
import { PaymentsController } from './payments.controller';
import authMiddleware from '../../core/middlewares/auth.middleware';
import { AppError } from '../../core/errors/AppError';

const router = Router();
const paymentsController = container.resolve(PaymentsController);

/**
 * Online payment through Chargily is switched off: students pay by BaridiMob and
 * redeem the activation code they get back. CHARGILY_SECRET_KEY has been exposed in
 * this public repository's history, so a webhook signed with it proves nothing; with
 * these routes on, anyone could forge a checkout.paid event and activate any
 * subscription. Set CHARGILY_PAYMENTS_ENABLED=true only after rotating the key in the
 * Chargily dashboard.
 */
export function chargilyPaymentsEnabled(): boolean {
  return process.env.CHARGILY_PAYMENTS_ENABLED === 'true';
}

function onlyWhenEnabled(_req: Request, _res: Response, next: NextFunction): void {
  if (chargilyPaymentsEnabled()) {
    next();
    return;
  }
  next(new AppError(
    'Online payment is not available. Pay by BaridiMob and redeem the activation code you receive.',
    410,
    undefined,
    'PAYMENTS_DISABLED'
  ));
}

// Create checkout endpoint - requires authentication
router.post('/checkouts', onlyWhenEnabled, authMiddleware, paymentsController.createCheckout);

// Webhook endpoint - no auth needed as it's called by external service
router.post('/webhook', onlyWhenEnabled, paymentsController.handleWebhook);

export default router;
