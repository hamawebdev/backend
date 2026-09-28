import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import * as jwt from 'jsonwebtoken';
import app from '../src/app';
import { PrismaClient, YearLevel } from '@prisma/client';

const prisma = new PrismaClient();
const tag = `act${Date.now()}`;
const tokenFor = (id: number) => `Bearer ${jwt.sign({ user_data: { id }, token_version: 0 }, process.env.JWT_SECRET as string, { expiresIn: '1h' })}`;
const api = () => request(app);

let admin: number;
let pack: number, pack2: number, inactivePack: number;
let studentSeq = 0;

const newStudent = async () => (await prisma.user.create({ data: {
  email: `${tag}-s${++studentSeq}@x.io`, passwordHash: 'x', fullName: `Student ${studentSeq}`,
  role: 'STUDENT', emailVerified: true, isActive: true, currentYear: YearLevel.TWO
} })).id;
const newStudents = (n: number) => Promise.all(Array.from({ length: n }, newStudent));

const createCode = (body: Record<string, unknown>) =>
  api().post('/api/v1/admin/activation-codes').set('Authorization', tokenFor(admin))
    .send({ studyPackIds: [pack], durationType: 'MONTHS', durationMonths: 12, ...body });
const updateCode = (id: number, body: Record<string, unknown>) =>
  api().put(`/api/v1/admin/activation-codes/${id}`).set('Authorization', tokenFor(admin)).send(body);
// Durations are added in local calendar days, so a DST change may shift them by an hour
const expectDays = (ms: number, days: number) => expect(Math.abs(ms - days * 86400000)).toBeLessThanOrEqual(3600000);
const redeem = (student: number, code: string) =>
  api().post('/api/v1/students/codes/redeem').set('Authorization', tokenFor(student)).send({ code });
const validate = (student: number, code: string) =>
  api().post('/api/v1/students/codes/validate').set('Authorization', tokenFor(student)).send({ code });

// Everything a redemption can change, for one code and some students
const snapshot = async (codeId: number, students: number[]) => ({
  code: await prisma.activationCode.findUnique({ where: { id: codeId }, select: { currentUses: true, updatedAt: true } }),
  redemptions: await prisma.codeRedemption.findMany({ where: { activationCodeId: codeId }, orderBy: { id: 'asc' } }),
  subscriptions: await prisma.subscription.findMany({ where: { userId: { in: students } }, orderBy: { id: 'asc' } }),
});

beforeAll(async () => {
  admin = (await prisma.user.create({ data: { email: `${tag}-admin@x.io`, passwordHash: 'x', fullName: 'Admin', role: 'ADMIN', emailVerified: true, isActive: true } })).id;
  pack = (await prisma.studyPack.create({ data: { name: `${tag} Y2`, type: 'YEAR', yearNumber: 'TWO', pricePerMonth: 0, pricePerYear: 1000 } })).id;
  pack2 = (await prisma.studyPack.create({ data: { name: `${tag} Y3`, type: 'YEAR', yearNumber: 'THREE', pricePerMonth: 0, pricePerYear: 1000 } })).id;
  inactivePack = (await prisma.studyPack.create({ data: { name: `${tag} off`, type: 'YEAR', yearNumber: 'FOUR', pricePerMonth: 0, isActive: false } })).id;
}, 60000);

afterAll(async () => { await prisma.$disconnect(); });

describe('Activation code redemption', () => {
  it('a fresh code grants its pack; the same student again is told they already used it; another student is told it is used up', async () => {
    const [first, second] = await newStudents(2);
    const created = await createCode({});
    expect(created.status).toBe(201);
    expect(created.body.maxUses).toBe(1); // single-use unless the admin says otherwise
    const code = created.body.code;

    const ok = await redeem(first, code.toLowerCase());
    expect(ok.status).toBe(200);
    const granted = ok.body.data.subscriptions;
    expect(granted.map((s: any) => s.studyPackId)).toEqual([pack]);
    expect(ok.body.data.subscription.studyPackId).toBe(pack);
    const months = (new Date(granted[0].endDate).getTime() - new Date(granted[0].startDate).getTime()) / (30.4 * 86400000);
    expect(Math.round(months)).toBe(12);
    // Access is granted at once: the student's content endpoints now answer
    expect((await api().get('/api/v1/students/content/filters').set('Authorization', tokenFor(first))).status).toBe(200);

    const before = await snapshot(created.body.id, [first, second]);
    expect(before.code!.currentUses).toBe(1);
    expect(before.redemptions).toHaveLength(1);

    const again = await redeem(first, code);
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe('ACTIVATION_CODE_ALREADY_REDEEMED');

    const other = await redeem(second, code);
    expect(other.status).toBe(400);
    expect(other.body.error.code).toBe('ACTIVATION_CODE_USED_UP');

    // Failed attempts changed nothing
    expect(await snapshot(created.body.id, [first, second])).toEqual(before);

    // validate gives the same answers without redeeming
    expect((await validate(first, code)).body.error.code).toBe('ACTIVATION_CODE_ALREADY_REDEEMED');
    expect((await validate(second, code)).body.error.code).toBe('ACTIVATION_CODE_USED_UP');
  });

  it('expired, deactivated, unknown and pack-less codes each fail with their own code, changing nothing', async () => {
    const [student] = await newStudents(1);
    const expired = await prisma.activationCode.create({ data: {
      code: `${tag}EXP`.toUpperCase(), hashedCode: 'x', durationMonths: 1, maxUses: 5,
      expiresAt: new Date(Date.now() - 60000), createdById: admin, studyPacks: { create: [{ studyPackId: pack }] } } });
    const deactivated = (await createCode({ maxUses: 5 })).body;
    expect((await api().patch(`/api/v1/admin/activation-codes/${deactivated.id}/deactivate`).set('Authorization', tokenFor(admin))).status).toBe(200);
    const packless = (await createCode({ maxUses: 5, studyPackIds: [inactivePack] })).body;

    const before = await snapshot(deactivated.id, [student]);
    const cases: [string, string][] = [
      [expired.code, 'ACTIVATION_CODE_EXPIRED'],
      [deactivated.code, 'ACTIVATION_CODE_DEACTIVATED'],
      ['ZZZZ-ZZZZ-ZZZZ', 'ACTIVATION_CODE_NOT_FOUND'],
      [packless.code, 'ACTIVATION_CODE_NO_ACTIVE_PACKS'],
    ];
    for (const [code, reason] of cases) {
      const res = await redeem(student, code);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe(reason);
      expect((await validate(student, code)).body.error.code).toBe(reason);
    }
    expect(await snapshot(deactivated.id, [student])).toEqual(before);
    expect(await prisma.codeRedemption.count({ where: { userId: student } })).toBe(0);

    // A malformed code is a validation error with the field's message
    const malformed = await redeem(student, 'abc');
    expect(malformed.status).toBe(400);
    expect(malformed.body.error.details.errors[0].field).toBe('code');
  });

  it('students entering one code at the same moment never redeem it more times than it allows', async () => {
    const racers = await newStudents(8);
    const single = (await createCode({})).body;
    const results = await Promise.all(racers.map(s => redeem(s, single.code)));
    expect(results.filter(r => r.status === 200)).toHaveLength(1);
    expect(results.filter(r => r.status === 400).every(r => r.body.error.code === 'ACTIVATION_CODE_USED_UP')).toBe(true);
    expect(await prisma.codeRedemption.count({ where: { activationCodeId: single.id } })).toBe(1);
    expect(await prisma.subscription.count({ where: { userId: { in: racers } } })).toBe(1);
    expect((await prisma.activationCode.findUnique({ where: { id: single.id } }))!.currentUses).toBe(1);

    const three = (await createCode({ maxUses: 3 })).body;
    const more = await newStudents(8);
    const results3 = await Promise.all(more.map(s => redeem(s, three.code)));
    expect(results3.filter(r => r.status === 200)).toHaveLength(3);
    expect(await prisma.codeRedemption.count({ where: { activationCodeId: three.id } })).toBe(3);
    expect(await prisma.subscription.count({ where: { userId: { in: more } } })).toBe(3);
  });

  it('one student submitting a code several times at once redeems it once', async () => {
    const [student] = await newStudents(1);
    const multi = (await createCode({ maxUses: 10 })).body;
    const results = await Promise.all(Array.from({ length: 5 }, () => redeem(student, multi.code)));
    expect(results.filter(r => r.status === 200)).toHaveLength(1);
    expect(results.filter(r => r.status === 400).every(r => r.body.error.code === 'ACTIVATION_CODE_ALREADY_REDEEMED')).toBe(true);
    expect(await prisma.codeRedemption.count({ where: { activationCodeId: multi.id } })).toBe(1);
    expect(await prisma.subscription.count({ where: { userId: student } })).toBe(1);
  });

  it('a code for a pack the student already has extends that subscription', async () => {
    const [student] = await newStudents(1);
    const a = (await createCode({ durationMonths: 1 })).body;
    const b = (await createCode({ durationType: 'DAYS', durationDays: 10 })).body;
    const first = await redeem(student, a.code);
    const end1 = new Date(first.body.data.subscription.endDate).getTime();
    const second = await redeem(student, b.code);
    expect(second.status).toBe(200);
    expect(second.body.data.subscription.id).toBe(first.body.data.subscription.id);
    expectDays(new Date(second.body.data.subscription.endDate).getTime() - end1, 10);
    expect(await prisma.subscription.count({ where: { userId: student } })).toBe(1);
  });

  it('allows 10 attempts per hour per student, and another student is not affected', async () => {
    const [spammer, neighbour] = await newStudents(2);
    for (let i = 0; i < 10; i++) {
      expect((await redeem(spammer, `NOPE-NOPE-${String(i).padStart(4, '0')}`)).status).toBe(400);
    }
    const limited = await redeem(spammer, 'NOPE-NOPE-9999');
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
    expect(limited.body.error.details.retryAfterSeconds).toBeGreaterThan(0);
    // Same IP, other account: still has its own attempts
    const code = (await createCode({})).body.code;
    expect((await redeem(neighbour, code)).status).toBe(200);
  });
});

describe('Activation code administration', () => {
  it('each admin edit applies to the next redemption', async () => {
    const [a, b, c, d, e] = await newStudents(5);
    const created = (await createCode({})).body;
    const id = created.id;
    expect((await redeem(a, created.code)).status).toBe(200);
    expect((await redeem(b, created.code)).body.error.code).toBe('ACTIVATION_CODE_USED_UP');

    // More uses
    expect((await updateCode(id, { maxUses: 2 })).status).toBe(200);
    expect((await redeem(b, created.code)).status).toBe(200);
    expect((await redeem(c, created.code)).body.error.code).toBe('ACTIVATION_CODE_USED_UP');

    // Fewer uses than already redeemed is refused, with the count in the message
    const tooLow = await updateCode(id, { maxUses: 1 });
    expect(tooLow.status).toBe(400);
    expect(tooLow.body.error.message).toMatch(/already been redeemed 2 time/);
    expect((await prisma.activationCode.findUnique({ where: { id } }))!.maxUses).toBe(2);

    // Deactivate, then reactivate with room for one more
    await updateCode(id, { maxUses: 4 });
    await api().patch(`/api/v1/admin/activation-codes/${id}/deactivate`).set('Authorization', tokenFor(admin));
    expect((await redeem(c, created.code)).body.error.code).toBe('ACTIVATION_CODE_DEACTIVATED');
    expect((await updateCode(id, { isActive: true })).status).toBe(200);

    // Expiry moved to the past, then back
    await updateCode(id, { expiresAt: new Date(Date.now() - 60000).toISOString() });
    expect((await redeem(c, created.code)).body.error.code).toBe('ACTIVATION_CODE_EXPIRED');
    await updateCode(id, { expiresAt: new Date(Date.now() + 86400000 * 30).toISOString() });

    // New packs and a new duration apply to the next student
    expect((await updateCode(id, { studyPackIds: [pack2], durationType: 'DAYS', durationDays: 7 })).status).toBe(200);
    const res = await redeem(c, created.code);
    expect(res.status).toBe(200);
    expect(res.body.data.subscriptions.map((s: any) => s.studyPackId)).toEqual([pack2]);
    const sub = res.body.data.subscription;
    expectDays(new Date(sub.endDate).getTime() - new Date(sub.startDate).getTime(), 7);

    // Two packs at once
    await updateCode(id, { studyPackIds: [pack, pack2] });
    const both = await redeem(d, created.code);
    expect(both.body.data.subscriptions.map((s: any) => s.studyPackId).sort()).toEqual([pack, pack2].sort());
    expect((await redeem(e, created.code)).body.error.code).toBe('ACTIVATION_CODE_USED_UP');
  });

  it('usage shown to admins is the number of redemptions', async () => {
    const [a, b] = await newStudents(2);
    const created = (await createCode({ maxUses: 5 })).body;
    await redeem(a, created.code);
    await redeem(b, created.code);
    // Even when the stored counter is wrong, admins see the redemptions, and so do students
    await prisma.activationCode.update({ where: { id: created.id }, data: { currentUses: 5 } });

    const one = await api().get(`/api/v1/admin/activation-codes/${created.id}`).set('Authorization', tokenFor(admin));
    expect(one.body.currentUses).toBe(2);
    expect(one.body.usageHistory).toHaveLength(2);
    const list = await api().get(`/api/v1/admin/activation-codes?search=${created.code}`).set('Authorization', tokenFor(admin));
    expect(list.body.items[0].currentUses).toBe(2);
    expect(list.body.stats.totalRedemptions).toBe(await prisma.codeRedemption.count());
    expect(list.body.stats.totalCodes).toBe(await prisma.activationCode.count());

    const [c] = await newStudents(1);
    expect((await redeem(c, created.code)).status).toBe(200);
    expect((await prisma.activationCode.findUnique({ where: { id: created.id } }))!.currentUses).toBe(3);

    // A code expiring in 30 minutes is redeemable and expiring soon, whatever the
    // database session's time zone
    const stats = async () => (await api().get('/api/v1/admin/activation-codes').set('Authorization', tokenFor(admin))).body.stats;
    const before = await stats();
    await createCode({ expiresAt: new Date(Date.now() + 30 * 60000).toISOString() });
    const after = await stats();
    expect(after.redeemableCodes - before.redeemableCodes).toBe(1);
    expect(after.expiringSoon - before.expiringSoon).toBe(1);
  });

  it('admin errors say what went wrong', async () => {
    const created = (await createCode({ code: `${tag}-dup`.slice(-20) })).body;
    const dup = await createCode({ code: created.code });
    expect(dup.status).toBe(409);
    expect(dup.body.error.message).toContain(created.code);

    const past = await createCode({ expiresAt: new Date(Date.now() - 86400000).toISOString() });
    expect(past.status).toBe(400);
    expect(past.body.error.details.errors).toContainEqual(expect.objectContaining({ field: 'expiresAt', message: 'Expiry date must be in the future' }));

    const noDays = await createCode({ durationType: 'DAYS', durationMonths: undefined });
    expect(noDays.status).toBe(400);
    expect(noDays.body.error.details.errors[0].field).toBe('durationDays');

    const missingPack = await createCode({ studyPackIds: [999999] });
    expect(missingPack.status).toBe(404);
    expect(missingPack.body.error.message).toContain('999999');

    const other = (await createCode({})).body;
    const rename = await updateCode(other.id, { code: created.code });
    expect(rename.status).toBe(409);

    const again = await api().patch(`/api/v1/admin/activation-codes/${other.id}/deactivate`).set('Authorization', tokenFor(admin));
    expect(again.status).toBe(200);
    const twice = await api().patch(`/api/v1/admin/activation-codes/${other.id}/deactivate`).set('Authorization', tokenFor(admin));
    expect(twice.status).toBe(400);
    expect(twice.body.error.message).toBe('Activation code is already deactivated');
  });
});
