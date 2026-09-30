import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import crypto from 'crypto';
import * as jwt from 'jsonwebtoken';
import app from '../src/app';
import { PrismaClient, YearLevel } from '@prisma/client';

// The Chargily secret key is public (repository history), so a correctly signed
// webhook must not activate anything while online payment is switched off.
const prisma = new PrismaClient();
const tag = `pay${Date.now()}`;
const KEY = 'leaked-chargily-key-for-tests';
const tokenFor = (id: number) => `Bearer ${jwt.sign({ user_data: { id }, token_version: 0 }, process.env.JWT_SECRET as string, { expiresIn: '1h' })}`;
const api = () => request(app);

let student: number, pack: number, pending: number;

function signedPaidEvent(subscriptionId: number, eventId: string) {
  const body = JSON.stringify({
    id: eventId,
    type: 'checkout.paid',
    data: { id: `chk_${eventId}`, metadata: { subscriptionId: String(subscriptionId), paymentDurationMonths: '600' } },
  });
  return { body, signature: crypto.createHmac('sha256', KEY).update(body).digest('hex') };
}

const postWebhook = ({ body, signature }: { body: string; signature: string }) =>
  api().post('/api/v1/payments/webhook').set('Content-Type', 'application/json').set('signature', signature).send(body);

beforeAll(async () => {
  process.env.CHARGILY_SECRET_KEY = KEY;
  student = (await prisma.user.create({ data: { email: `${tag}-stu@x.io`, passwordHash: 'x', fullName: 'stu', role: 'STUDENT', emailVerified: true, isActive: true, currentYear: YearLevel.ONE } })).id;
  pack = (await prisma.studyPack.create({ data: { name: `${tag} P`, type: 'RESIDENCY', pricePerMonth: 500, pricePerYear: 5000, isActive: true } })).id;
  pending = (await prisma.subscription.create({ data: { userId: student, studyPackId: pack, status: 'PENDING', startDate: new Date(), endDate: new Date(), amountPaid: 5000 } })).id;
}, 60000);

afterEach(() => { delete process.env.CHARGILY_PAYMENTS_ENABLED; });

afterAll(async () => {
  await prisma.paymentEvent.deleteMany({ where: { id: { startsWith: tag } } });
  await prisma.$disconnect();
});

describe('Chargily payments are switched off', () => {
  it('a correctly signed checkout.paid webhook is refused and changes nothing', async () => {
    const res = await postWebhook(signedPaidEvent(pending, `${tag}-evt1`));
    expect(res.status).toBe(410);
    const sub = await prisma.subscription.findUnique({ where: { id: pending } });
    expect(sub!.status).toBe('PENDING');
    expect(await prisma.paymentEvent.count({ where: { id: `${tag}-evt1` } })).toBe(0);
  });

  it('creating a checkout is refused with PAYMENTS_DISABLED', async () => {
    const res = await api().post('/api/v1/payments/checkouts').set('Authorization', tokenFor(student))
      .send({ studyPackId: pack, paymentDuration: { type: 'yearly', years: 1 } });
    expect(res.status).toBe(410);
    expect(res.body.error.code).toBe('PAYMENTS_DISABLED');
    expect(await prisma.subscription.count({ where: { userId: student } })).toBe(1);
  });

  it('CHARGILY_PAYMENTS_ENABLED=true (after a key rotation) turns the webhook back on', async () => {
    process.env.CHARGILY_PAYMENTS_ENABLED = 'true';
    const res = await postWebhook(signedPaidEvent(pending, `${tag}-evt2`));
    expect(res.status).toBe(200);
    expect((await prisma.subscription.findUnique({ where: { id: pending } }))!.status).toBe('ACTIVE');
  });
});
