import crypto from 'crypto';
import { z } from 'zod';
import { Prisma, PrismaClient } from '@prisma/client';
import { TransactionClient } from '../../types/prisma.types';
import { inject, injectable } from 'tsyringe';
import PrismaService from '../../config/db';
import { AppError, BadRequestError, NotFoundError } from '../../core/errors/AppError';

// Body of POST /payments/checkouts
const createCheckoutSchema = z.object({
  studyPackId: z.coerce.number().int().positive(),
  paymentDuration: z.discriminatedUnion('type', [
    z.object({ type: z.literal('monthly'), months: z.coerce.number().int().min(1).max(12) }),
    z.object({ type: z.literal('yearly'), years: z.coerce.number().int().min(1).max(5) }),
  ]),
  locale: z.enum(['ar', 'en', 'fr']).optional(),
  paymentMethod: z.enum(['edahabia', 'cib', 'chargily_app']).optional(),
});

@injectable()
export class PaymentsService {
  constructor(
    @inject("db") private prismaService: PrismaService
  ) { }

  private get prisma(): PrismaClient {
    return this.prismaService.getClient();
  }
  /**
   * Create a new checkout session with Chargily
   */
  public async createCheckout(input: any, userId: number) {
    console.log('Creating checkout for user:', userId);

    if (!userId) {
      throw new BadRequestError('Missing required field: userId');
    }

    // Validate the body (4xx with a clear message instead of a generic 500)
    const parsed = createCheckoutSchema.safeParse(input ?? {});
    if (!parsed.success) {
      const details = parsed.error.issues.map(issue => `${issue.path.join('.') || 'body'}: ${issue.message}`).join('; ');
      throw new BadRequestError(`Invalid checkout request: ${details}`);
    }
    const { studyPackId, paymentDuration, locale = 'ar', paymentMethod = 'edahabia' } = parsed.data;

    // Get study pack to calculate amount
    const studyPack = await this.prisma.studyPack.findUnique({
      where: { id: studyPackId }
    });

    if (!studyPack) {
      throw new NotFoundError('Study pack');
    }

    // Packs that are no longer offered cannot be bought
    if (!studyPack.isActive) {
      throw new BadRequestError('This study pack is not available for purchase');
    }

    // Calculate amount based on payment duration
    let amountDzd: number;
    let months: number;

    if (paymentDuration.type === 'monthly') {
      months = paymentDuration.months;
      if (!studyPack.pricePerMonth) {
        throw new BadRequestError('Monthly price not set for this study pack');
      }
      amountDzd = parseFloat(studyPack.pricePerMonth.toString()) * months;
    } else {
      months = paymentDuration.years * 12;
      if (!studyPack.pricePerYear) {
        throw new BadRequestError('Yearly price not set for this study pack');
      }
      amountDzd = parseFloat(studyPack.pricePerYear.toString()) * paymentDuration.years;
    }



    // Create subscription with PENDING status
    // Note: End date will be calculated and set when payment webhook is received
    const now = new Date();

    const subscription = await this.prisma.subscription.create({
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

    // Helper function to join URL parts without double slashes
    const joinUrl = (baseUrl: string, path: string): string => {
      const trimmedBase = baseUrl.replace(/\/+$/, ''); // Remove trailing slashes
      const trimmedPath = path.replace(/^\/+/, ''); // Remove leading slashes
      return trimmedPath ? `${trimmedBase}/${trimmedPath}` : trimmedBase;
    };

    // Trim environment variables to remove hidden spaces/newlines
    const appBaseUrl = (process.env.APP_BASE_URL || 'https://med-adn.com').trim();
    const webhookUrl = (process.env.WEBHOOK_PUBLIC_URL || '').trim();
    const successPath = (process.env.PAYMENTS_SUCCESS_PATH || '').trim();
    const failurePath = (process.env.PAYMENTS_FAILURE_PATH || '').trim();

    // Construct valid absolute URLs
    const successUrl = joinUrl(appBaseUrl, successPath);
    const failureUrl = joinUrl(appBaseUrl, failurePath);
    const webhookEndpoint = webhookUrl || 'https://api.med-adn.com/api/v1/payments/webhook';

    // Debug logging for URL values and character lengths
    console.log('=== Chargily URL Debug Info ===');
    console.log('APP_BASE_URL raw:', JSON.stringify(process.env.APP_BASE_URL));
    console.log('APP_BASE_URL trimmed:', appBaseUrl, '| Length:', appBaseUrl.length);
    console.log('WEBHOOK_PUBLIC_URL raw:', JSON.stringify(process.env.WEBHOOK_PUBLIC_URL));
    console.log('WEBHOOK_PUBLIC_URL trimmed:', webhookUrl, '| Length:', webhookUrl.length);
    console.log('success_url:', successUrl, '| Length:', successUrl.length);
    console.log('failure_url:', failureUrl, '| Length:', failureUrl.length);
    console.log('webhook_endpoint:', webhookEndpoint, '| Length:', webhookEndpoint.length);
    console.log('===============================');

    // Build checkout payload
    const payload = {
      amount: amountDzd,
      currency: 'dzd',
      payment_method: paymentMethod,
      success_url: successUrl,
      failure_url: failureUrl,
      webhook_endpoint: webhookEndpoint,
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
    const resp = await fetch(`${base}/checkouts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.CHARGILY_SECRET_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!resp.ok) {
      const err = await resp.text();
      console.error('Chargily create checkout failed:', err);
      // The pending subscription was never paid for; close it
      await this.prisma.subscription.updateMany({
        where: { id: subscription.id, status: 'PENDING' },
        data: { status: 'CANCELLED' }
      }).catch(updateError => console.error('Failed to cancel pending subscription', subscription.id, updateError));
      throw new AppError('The payment provider could not create the checkout. Please try again later.', 502);
    }

    const data = await resp.json();
    console.log('Checkout created successfully:', data);
    return { checkoutUrl: data.checkout_url, checkoutId: data.id };
  }

  /**
   * Handle Chargily webhook events
   */
  public async handleWebhook(rawBody: Buffer, signature: string | undefined) {
    if (!signature || !rawBody || rawBody.length === 0) {
      throw new Error('Missing signature or body');
    }

    const computedSignature = crypto
      .createHmac('sha256', process.env.CHARGILY_SECRET_KEY!)
      .update(rawBody)
      .digest('hex');

    // Constant-time comparison; timingSafeEqual throws on length mismatch, so check first
    const provided = Buffer.from(signature);
    const expected = Buffer.from(computedSignature);
    if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
      throw new Error('Invalid signature');
    }

    const event = JSON.parse(rawBody.toString());
    console.log('Webhook event received:', event.type, event.id);

    try {
      // Record the event and apply its effect atomically: a failed update rolls back the
      // idempotency record too, so Chargily's retry is processed instead of skipped.
      await this.prisma.$transaction(async (tx: TransactionClient) => {
        await tx.paymentEvent.create({
          data: { id: event.id, type: event.type, checkoutId: event.data?.id || null },
        });

        const metadata = event.data?.metadata || {};
        const subscriptionId = Number(metadata.subscriptionId);
        // Events for checkouts this app did not create (no or bad metadata), or whose
        // subscription is gone, are recorded and acknowledged (200) instead of failing
        // forever and being redelivered; they are logged for manual reconciliation.
        const hasSubscriptionId = Number.isInteger(subscriptionId) && subscriptionId > 0;

        if (event.type === 'checkout.paid') {
          if (!hasSubscriptionId) {
            console.warn('checkout.paid without a valid subscriptionId, needs manual reconciliation:', event.id, event.data?.id);
            return;
          }

          const paid = await tx.subscription.findUnique({
            where: { id: subscriptionId },
            select: { id: true, userId: true, studyPackId: true, status: true },
          });
          if (!paid) {
            console.warn('checkout.paid for missing subscription', subscriptionId, 'needs manual reconciliation:', event.id);
            return;
          }
          if (paid.status === 'ACTIVE') {
            console.warn('checkout.paid for already active subscription', subscriptionId, event.id);
            return;
          }
          if (paid.status !== 'PENDING') {
            console.warn('checkout.paid for', paid.status, 'subscription', subscriptionId, '- activating it', event.id);
          }

          const parsedMonths = Number(metadata.paymentDurationMonths);
          const paymentDurationMonths = Number.isInteger(parsedMonths) && parsedMonths > 0 ? parsedMonths : 1;
          const now = new Date();

          // A renewal starts when the user's current subscription for the pack ends,
          // so the days already paid for are kept
          const current = await tx.subscription.findFirst({
            where: {
              userId: paid.userId,
              studyPackId: paid.studyPackId,
              status: 'ACTIVE',
              endDate: { gt: now },
              id: { not: paid.id },
            },
            orderBy: { endDate: 'desc' },
            select: { endDate: true },
          });
          const startDate = current ? new Date(current.endDate) : now;
          const endDate = new Date(startDate);
          endDate.setMonth(endDate.getMonth() + paymentDurationMonths);

          // Conditional on the status read above, so a concurrent duplicate cannot apply twice
          const activated = await tx.subscription.updateMany({
            where: { id: paid.id, status: paid.status },
            data: {
              status: 'ACTIVE',
              startDate,
              endDate,
              paymentReference: event.data?.id ?? null,
              paymentMethod: event.data?.payment_method ?? undefined,
              amountPaid: event.data?.amount ?? undefined,
            },
          });
          if (activated.count === 0) {
            console.warn('checkout.paid: subscription', subscriptionId, 'changed concurrently, needs manual reconciliation:', event.id);
            return;
          }
          console.log('Activated subscription', subscriptionId, 'until', endDate.toISOString());
        }

        if (event.type === 'checkout.failed' && hasSubscriptionId) {
          // Only a checkout that is still pending can fail; never cancel an active subscription
          const cancelled = await tx.subscription.updateMany({
            where: { id: subscriptionId, status: 'PENDING' },
            data: { status: 'CANCELLED', endDate: new Date() },
          });
          if (cancelled.count > 0) {
            console.log('Cancelled subscription', subscriptionId);
          } else {
            console.warn('checkout.failed for subscription', subscriptionId, 'that is not pending; ignored', event.id);
          }
        }
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        console.log('Webhook event already processed:', event.id);
        return;
      }
      throw error;
    }
  }
}