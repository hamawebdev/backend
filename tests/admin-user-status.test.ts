import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import * as jwt from 'jsonwebtoken';
import app from '../src/app';
import { PrismaClient, SubscriptionStatus, UserRole, YearLevel } from '@prisma/client';

const prisma = new PrismaClient();
const tag = `ust${Date.now()}`;
const DAY = 86400000;
const tokenFor = (id: number, v = 0) => `Bearer ${jwt.sign({ user_data: { id }, token_version: v }, process.env.JWT_SECRET as string, { expiresIn: '1h' })}`;
const api = () => request(app);

let admin: number, pack: number, course: number;
const users: Record<string, number> = {};
const subs: Record<string, number> = {};

beforeAll(async () => {
  const mkUser = async (name: string, role: UserRole = 'STUDENT', isActive = true) => (await prisma.user.create({ data: {
    email: `${tag}-${name}@x.io`, passwordHash: 'x', fullName: `${tag} ${name}`, role, emailVerified: true, isActive, currentYear: YearLevel.ONE } })).id;
  const mkSub = async (userId: number, status: SubscriptionStatus, endInDays: number) => (await prisma.subscription.create({ data: {
    userId, studyPackId: pack, status, startDate: new Date(Date.now() - 400 * DAY), endDate: new Date(Date.now() + endInDays * DAY), amountPaid: 1000 } })).id;

  pack = (await prisma.studyPack.create({ data: { name: `${tag} pack`, type: 'YEAR', yearNumber: 'ONE', pricePerMonth: 1 } })).id;
  const unite = await prisma.unite.create({ data: { studyPackId: pack, name: `${tag} U` } });
  const mod = await prisma.module.create({ data: { uniteId: unite.id, name: `${tag} M` } });
  course = (await prisma.course.create({ data: { moduleId: mod.id, name: `${tag} C` } })).id;

  admin = users.admin = await mkUser('admin', 'ADMIN');
  users.active = await mkUser('active'); subs.active = await mkSub(users.active, 'ACTIVE', 30);
  users.lapsed = await mkUser('lapsed'); subs.lapsed = await mkSub(users.lapsed, 'ACTIVE', -1);
  users.expired = await mkUser('expired'); subs.expired = await mkSub(users.expired, 'EXPIRED', -10);
  users.cancelled = await mkUser('cancelled'); subs.cancelled = await mkSub(users.cancelled, 'CANCELLED', 100);
  users.pending = await mkUser('pending'); subs.pending = await mkSub(users.pending, 'PENDING', 365);
  users.none = await mkUser('none');
  users.deactivated = await mkUser('deactivated', 'STUDENT', false); subs.deactivated = await mkSub(users.deactivated, 'ACTIVE', 30);
  users.mixed = await mkUser('mixed'); await mkSub(users.mixed, 'EXPIRED', -5); await mkSub(users.mixed, 'ACTIVE', 5);
}, 60000);

afterAll(async () => { await prisma.$disconnect(); });

// Counted in SQL, independently of the API's Prisma filters
async function directCounts() {
  const [row] = await prisma.$queryRaw<{ total: bigint; active: bigint; non_active: bigint; deactivated: bigint }[]>`
    SELECT count(*) AS total,
      count(*) FILTER (WHERE u.is_active AND EXISTS (
        SELECT 1 FROM subscriptions s WHERE s.user_id = u.id AND s.status = 'ACTIVE' AND s.end_date > now())) AS active,
      count(*) FILTER (WHERE NOT u.is_active OR NOT EXISTS (
        SELECT 1 FROM subscriptions s WHERE s.user_id = u.id AND s.status = 'ACTIVE' AND s.end_date > now())) AS non_active,
      count(*) FILTER (WHERE NOT u.is_active) AS deactivated
    FROM users u`;
  return { totalUsers: Number(row.total), activeUsers: Number(row.active), nonActiveUsers: Number(row.non_active), deactivatedUsers: Number(row.deactivated) };
}

const listUsers = async (query = '') => {
  const res = await api().get(`/api/v1/admin/users?limit=100${query}`).set('Authorization', tokenFor(admin));
  expect(res.status).toBe(200);
  return res.body.data;
};
const statusByName = (items: any[]) => Object.fromEntries(items.map(u => [u.fullName.replace(`${tag} `, ''), u.status]));
const packContent = (userId: number) => api().get(`/api/v1/student/study-pack/${pack}`).set('Authorization', tokenFor(userId));
const activate = (subscriptionId: number, body: object) =>
  api().post(`/api/v1/admin/subscriptions/${subscriptionId}/activate`).set('Authorization', tokenFor(admin)).send(body);

describe('Admin users: status from subscriptions, stats and re-activation', () => {
  it('each user is Active, Non-active or Deactivated from their subscriptions and account', async () => {
    const { items } = await listUsers(`&search=${tag}`);
    expect(statusByName(items)).toEqual({
      admin: 'NON_ACTIVE', active: 'ACTIVE', lapsed: 'NON_ACTIVE', expired: 'NON_ACTIVE', cancelled: 'NON_ACTIVE',
      pending: 'NON_ACTIVE', none: 'NON_ACTIVE', deactivated: 'DEACTIVATED', mixed: 'ACTIVE'
    });
    const mixed = items.find((u: any) => u.id === users.mixed);
    expect(mixed.activeSubscription.studyPackName).toBe(`${tag} pack`);
    expect(items.find((u: any) => u.id === users.lapsed).activeSubscription).toBeNull();
  });

  it('stats cover every user whatever the filters and match a direct count', async () => {
    const all = await listUsers();
    const filtered = await listUsers(`&search=${tag}&status=active&role=STUDENT`);
    const direct = await directCounts();
    expect(all.stats).toMatchObject(direct);
    expect(all.stats.activeUsers + all.stats.nonActiveUsers).toBe(all.stats.totalUsers);
    expect(all.stats).toMatchObject({
      students: await prisma.user.count({ where: { role: 'STUDENT' } }),
      employees: await prisma.user.count({ where: { role: 'EMPLOYEE' } }),
      admins: await prisma.user.count({ where: { role: 'ADMIN' } })
    });
    expect(filtered.stats).toEqual(all.stats);
    expect(all.total).toBe(all.stats.totalUsers);
  });

  it('the status filter returns exactly the users each stat counts', async () => {
    const { stats } = await listUsers();
    const counted = { active: stats.activeUsers, non_active: stats.nonActiveUsers, deactivated: stats.deactivatedUsers };
    const expected = { active: ['ACTIVE'], non_active: ['NON_ACTIVE', 'DEACTIVATED'], deactivated: ['DEACTIVATED'] };
    for (const status of ['active', 'non_active', 'deactivated'] as const) {
      const page = await listUsers(`&status=${status}`);
      expect(page.total).toBe(counted[status]);
      for (const user of page.items) expect(expected[status]).toContain(user.status);
    }
    expect(Object.keys(statusByName((await listUsers(`&search=${tag}&status=active`)).items)).sort()).toEqual(['active', 'mixed']);
    expect(Object.keys(statusByName((await listUsers(`&search=${tag}&status=deactivated`)).items))).toEqual(['deactivated']);
    expect((await listUsers(`&search=${tag}&status=non_active`)).total).toBe(7);

    const bad = await api().get('/api/v1/admin/users?status=inactive').set('Authorization', tokenFor(admin));
    expect(bad.status).toBe(400);
  });

  it('dashboard and subscription stats count only subscriptions that give access now', async () => {
    const [row] = await prisma.$queryRaw<{ granting: bigint; status_active: bigint; expired: bigint }[]>`
      SELECT count(*) FILTER (WHERE status = 'ACTIVE' AND end_date > now()) AS granting,
        count(*) FILTER (WHERE status = 'ACTIVE') AS status_active,
        count(*) FILTER (WHERE status = 'EXPIRED' OR (status = 'ACTIVE' AND end_date <= now())) AS expired
      FROM subscriptions`;
    const direct = await directCounts();

    const dashboard = await api().get('/api/v1/admin/dashboard/stats').set('Authorization', tokenFor(admin));
    expect(dashboard.status).toBe(200);
    expect(dashboard.body.data.activeSubscriptions).toBe(Number(row.granting));
    // The lapsed fixture is still stored ACTIVE, so a status-only count would be higher
    expect(dashboard.body.data.activeSubscriptions).toBeLessThan(Number(row.status_active));
    expect(dashboard.body.data).toMatchObject({
      activeUsers: direct.activeUsers,
      totalUsers: direct.totalUsers,
      totalStudents: await prisma.user.count({ where: { role: 'STUDENT' } }),
      totalEmployees: await prisma.user.count({ where: { role: 'EMPLOYEE' } }),
      totalAdmins: await prisma.user.count({ where: { role: 'ADMIN' } }),
      totalQuizzes: await prisma.quiz.count(),
      totalExams: await prisma.exam.count(),
      totalSessions: await prisma.quizSession.count()
    });
    // This file's users were all created just now, so they count as new this month
    expect(dashboard.body.data.newUsersThisMonth).toBeGreaterThanOrEqual(Object.keys(users).length);
    expect(dashboard.body.data.sessionsToday).toBeGreaterThanOrEqual(0);

    const stats = await api().get('/api/v1/admin/subscriptions/stats').set('Authorization', tokenFor(admin));
    expect(stats.status).toBe(200);
    expect(stats.body.data.activeSubscriptions).toBe(Number(row.granting));
    expect(stats.body.data.expiredSubscriptions).toBe(Number(row.expired));
  });

  it('activation refuses dates that give no access and subscriptions that still give access', async () => {
    const past = await activate(subs.expired, { startDate: new Date(Date.now() - 30 * DAY).toISOString(), endDate: new Date(Date.now() - DAY).toISOString() });
    expect(past.status).toBe(400);
    const reversed = await activate(subs.expired, { startDate: new Date(Date.now() + 20 * DAY).toISOString(), endDate: new Date(Date.now() + 10 * DAY).toISOString() });
    expect(reversed.status).toBe(400);
    // Without dates the old end date stays, and it is past
    expect((await activate(subs.expired, {})).status).toBe(400);
    expect((await activate(subs.active, { endDate: new Date(Date.now() + 365 * DAY).toISOString() })).status).toBe(400);
    expect((await prisma.subscription.findUnique({ where: { id: subs.expired } }))!.status).toBe('EXPIRED');
  });

  it('re-activating an expired, cancelled or lapsed subscription makes the user Active and opens the pack again', async () => {
    for (const key of ['lapsed', 'expired', 'cancelled']) {
      expect((await packContent(users[key])).status).toBe(403);
      const listed = await api().get(`/api/v1/admin/subscriptions?userId=${users[key]}`).set('Authorization', tokenFor(admin));
      expect(listed.body.data.items.map((s: any) => s.grantsAccess)).toEqual([false]);
      const before = (await listUsers()).stats;

      const startDate = new Date(Date.now() - DAY).toISOString();
      const endDate = new Date(Date.now() + 365 * DAY).toISOString();
      const res = await activate(subs[key], { startDate, endDate });
      expect(res.status).toBe(200);

      const stored = await prisma.subscription.findUnique({ where: { id: subs[key] } });
      expect(stored!.status).toBe('ACTIVE');
      expect(stored!.startDate.toISOString()).toBe(startDate);
      expect(stored!.endDate.toISOString()).toBe(endDate);

      const after = await listUsers(`&search=${tag}-${key}@`);
      expect(after.items.map((u: any) => u.status)).toEqual(['ACTIVE']);
      expect(after.stats.activeUsers).toBe(before.activeUsers + 1);
      expect(after.stats.nonActiveUsers).toBe(before.nonActiveUsers - 1);
      expect(after.stats).toMatchObject(await directCounts());

      expect((await packContent(users[key])).status).toBe(200);
      const resources = await api().get(`/api/v1/courses/${course}/resources`).set('Authorization', tokenFor(users[key]));
      expect(resources.status).toBe(200);
      const own = await api().get('/api/v1/students/subscriptions').set('Authorization', tokenFor(users[key]));
      expect(own.body.data.find((s: any) => s.id === subs[key])).toMatchObject({ status: 'ACTIVE', endDate });
    }
  });

  it('a pending subscription is still activated with default dates', async () => {
    const res = await activate(subs.pending, {});
    expect(res.status).toBe(200);
    const stored = await prisma.subscription.findUnique({ where: { id: subs.pending } });
    expect(stored!.status).toBe('ACTIVE');
    expect(stored!.endDate.getTime()).toBeGreaterThan(Date.now() + 27 * DAY);
    expect((await listUsers(`&search=${tag}-pending@`)).items[0].status).toBe('ACTIVE');
  });
});
