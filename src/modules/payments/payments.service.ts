import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
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
    console.log('Received webhook event');
    console.log('Raw body length:', rawBody?.length || 0);
    console.log('Signature provided:', !!signature);

    // TEMPORARILY DISABLED FOR TESTING - RE-ENABLE AFTER TESTING IS COMPLETE
    // Verify signature
    if (!signature || !rawBody) {
      throw new Error('Missing signature or body');
    }

    const computedSignature = crypto
      .createHmac('sha256', process.env.CHARGILY_SECRET_KEY!)
      .update(rawBody)
      .digest('hex');

    // Constant-time comparison
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(computedSignature))) {
      console.error('Invalid signature');
      throw new Error('Invalid signature');
    }

    // Parse event
    const event = JSON.parse(rawBody.toString());
    console.log('Parsed webhook event:', event);

    // Idempotency check
    try {
      await (this.prisma as any).paymentEvent.create({
        data: {
          id: event.id,
          type: event.type,
          checkoutId: event.data?.id || null
        }
      });
    } catch (error) {
      // Event already processed
      console.log('Event already processed:', event.id);
      return;
    }

    // Process events
    if (event.type === 'checkout.paid') {
      console.log('Processing checkout.paid event');
      const metadata = event.data?.metadata || {};
      const subscriptionId = Number(metadata.subscriptionId);
      const paymentDurationMonths = Number(metadata.paymentDurationMonths) || 1;

      await this.prisma.$transaction(async (tx: TransactionClient) => {
        // Calculate the actual end date based on payment duration from metadata
        const now = new Date();
        const endDate = new Date(now);
        endDate.setMonth(endDate.getMonth() + paymentDurationMonths);

        console.log('Calculating subscription end date:');
        console.log('- Start date:', now.toISOString());
        console.log('- Duration months:', paymentDurationMonths);
        console.log('- Calculated end date:', endDate.toISOString());

        // Activate subscription and set calculated end date
        await tx.subscription.update({
          where: { id: subscriptionId },
          data: {
            status: 'ACTIVE',
            startDate: now, // Update start date to actual payment time
            endDate: endDate,
            paymentReference: event.data?.id ?? null,
            paymentMethod: event.data?.payment_method ?? undefined,
            amountPaid: event.data?.amount ?? undefined,
          }
        });

        console.log('Successfully activated subscription:', subscriptionId);
        console.log('Subscription updated with:');
        console.log('- Status: ACTIVE');
        console.log('- Start Date:', now.toISOString());
        console.log('- End Date:', endDate.toISOString());
        console.log('- Payment Reference:', event.data?.id);
        console.log('- Amount Paid:', event.data?.amount);
      });
    }

    if (event.type === 'checkout.failed') {
      console.log('Processing checkout.failed event');
      const metadata = event.data?.metadata || {};
      const subscriptionId = Number(metadata.subscriptionId);

      if (Number.isFinite(subscriptionId)) {
        await this.prisma.subscription.update({
          where: { id: subscriptionId },
          data: {
            status: 'CANCELLED',
            endDate: new Date(),
          }
        });
        console.log('Successfully cancelled subscription:', subscriptionId);
      }
    }
  }
}