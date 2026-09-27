import crypto from 'crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { TransactionClient } from '../../types/prisma.types';
import { inject, injectable } from 'tsyringe';
import PrismaService from '../../config/db';

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
    const studyPack = await this.prisma.studyPack.findUnique({
      where: { id: studyPackId }
    });

    if (!studyPack) {
      throw new Error('Study pack not found');
    }

    // Calculate amount based on payment duration
    let amountDzd: number;
    let months: number;

    if (paymentDuration.type === 'monthly') {
      months = paymentDuration.months;
      if (!studyPack.pricePerMonth) {
        throw new Error('Monthly price not set for this study pack');
      }
      amountDzd = parseFloat(studyPack.pricePerMonth.toString()) * months;
    } else {
      months = paymentDuration.years * 12;
      if (!studyPack.pricePerYear) {
        throw new Error('Yearly price not set for this study pack');
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
      throw new Error(`Chargily create checkout failed: ${err}`);
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

        if (event.type === 'checkout.paid') {
          const paymentDurationMonths = Number(metadata.paymentDurationMonths) || 1;
          const now = new Date();
          const endDate = new Date(now);
          endDate.setMonth(endDate.getMonth() + paymentDurationMonths);

          await tx.subscription.update({
            where: { id: subscriptionId },
            data: {
              status: 'ACTIVE',
              startDate: now,
              endDate,
              paymentReference: event.data?.id ?? null,
              paymentMethod: event.data?.payment_method ?? undefined,
              amountPaid: event.data?.amount ?? undefined,
            },
          });
          console.log('Activated subscription', subscriptionId, 'until', endDate.toISOString());
        }

        if (event.type === 'checkout.failed' && Number.isFinite(subscriptionId)) {
          await tx.subscription.update({
            where: { id: subscriptionId },
            data: { status: 'CANCELLED', endDate: new Date() },
          });
          console.log('Cancelled subscription', subscriptionId);
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