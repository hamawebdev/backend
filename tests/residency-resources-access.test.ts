import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import * as jwt from 'jsonwebtoken';
import app from '../src/app';
import { PrismaClient, YearLevel, ResourceType, SubscriptionStatus } from '@prisma/client';
import { AccessControlService } from '../src/services/access-control.service';

// The student resources page (/student/course-resources) loads the content filters of the
// picked year, then for a module its books and courses, then each resource tab of a course.
// A residency student (active Résidanat pack) may open all of it in every year; anyone else
// only in the years of their own packs.
const prisma = new PrismaClient();
const tag = `rra${Date.now()}`;
const tokenFor = (id: number) => `Bearer ${jwt.sign({ user_data: { id }, token_version: 0 }, process.env.JWT_SECRET as string, { expiresIn: '1h' })}`;
const TYPES: ResourceType[] = ['OFFICIAL_SUPPORT', 'CHOICE_OF_TEAM', 'VIDEO', 'AUDIO', 'OTHER'];
const YEARS: YearLevel[] = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX'];
const DAY = 86400000;

type Content = { uniteId: number; moduleId: number; courseId: number };
const packs: Record<string, number> = {};
const content: Record<string, Content> = {};
const users: Record<string, number> = {};
let residencyCopyUnite: number;

// One resource of each type and two books, like the Drive upload gives every module
async function fill(label: string, moduleId: number, courseId: number) {
  await prisma.courseResource.createMany({
    data: TYPES.map(type => ({ courseId, type, title: `${label} ${type}`, externalUrl: `https://drive.google.com/file/d/${tag}-${label}-${type}/view` }))
  });
  await prisma.moduleBook.createMany({
    data: [1, 2].map(n => ({ moduleId, name: `${label} book ${n}`, viewUrl: `https://drive.google.com/file/d/${tag}-${label}-book-${n}/view` }))
  });
}

async function yearPack(year: YearLevel): Promise<Content> {
  packs[year] = (await prisma.studyPack.create({ data: { name: `${tag} ${year}`, type: 'YEAR', yearNumber: year, pricePerMonth: 1 } })).id;
  const unite = await prisma.unite.create({ data: { studyPackId: packs[year], name: 'Modules' } });
  const module = await prisma.module.create({ data: { uniteId: unite.id, name: `${tag} module ${year}` } });
  const course = await prisma.course.create({ data: { moduleId: module.id, name: `${tag} course ${year}` } });
  await fill(year, module.id, course.id);
  return { uniteId: unite.id, moduleId: module.id, courseId: course.id };
}

async function student(key: string, subscriptions: Array<{ pack: string; status?: SubscriptionStatus; endDate?: Date }>, isActive = true) {
  const user = await prisma.user.create({
    data: { email: `${tag}-${key}@x.io`, passwordHash: 'x', fullName: key, role: 'STUDENT', emailVerified: true, isActive, currentYear: 'ONE' }
  });
  for (const sub of subscriptions) {
    await prisma.subscription.create({
      data: {
        userId: user.id,
        studyPackId: packs[sub.pack],
        status: sub.status ?? 'ACTIVE',
        startDate: new Date(Date.now() - 300 * DAY),
        endDate: sub.endDate ?? new Date(Date.now() + 30 * DAY),
        amountPaid: 1
      }
    });
  }
  users[key] = user.id;
}

beforeAll(async () => {
  // Years 1-6, a year-7 pack, and the Résidanat pack (no year, as the importer creates it)
  for (const year of [...YEARS, 'SEVEN' as YearLevel]) {
    content[year] = await yearPack(year);
  }
  packs.RESIDENCY = (await prisma.studyPack.create({ data: { name: `${tag} Résidanat`, type: 'RESIDENCY', pricePerMonth: 1 } })).id;
  // The Résidanat pack holds copies of year courses, without resources or books
  residencyCopyUnite = (await prisma.unite.create({ data: { studyPackId: packs.RESIDENCY, name: '3ème année' } })).id;
  const copy = await prisma.module.create({ data: { uniteId: residencyCopyUnite, name: `${tag} module THREE` } });
  await prisma.course.create({ data: { moduleId: copy.id, name: `${tag} course THREE` } });

  // An independent module (no unite) belongs to the years of its published questions
  const admin = await prisma.user.create({ data: { email: `${tag}-admin@x.io`, passwordHash: 'x', fullName: 'admin', role: 'ADMIN', emailVerified: true, isActive: true } });
  const independent = await prisma.module.create({ data: { name: `${tag} independent` } });
  const independentCourse = await prisma.course.create({ data: { moduleId: independent.id, name: `${tag} independent course` } });
  await prisma.question.create({ data: { courseId: independentCourse.id, questionText: `${tag} q`, yearLevel: 'THREE', createdById: admin.id } });
  await fill('independent', independent.id, independentCourse.id);
  content.INDEPENDENT = { uniteId: 0, moduleId: independent.id, courseId: independentCourse.id };

  const lapsed = new Date(Date.now() - DAY);
  await student('residency', [{ pack: 'RESIDENCY' }]);
  await student('residencyAndYear1', [{ pack: 'ONE' }, { pack: 'RESIDENCY' }]);
  await student('year3', [{ pack: 'THREE' }]);
  await student('year7', [{ pack: 'SEVEN' }]);
  await student('lapsedResidency', [{ pack: 'RESIDENCY', endDate: lapsed }]);
  await student('expiredResidency', [{ pack: 'RESIDENCY', status: 'EXPIRED' }]);
  await student('cancelledResidency', [{ pack: 'RESIDENCY', status: 'CANCELLED' }]);
  await student('pendingResidency', [{ pack: 'RESIDENCY', status: 'PENDING' }]);
  await student('deactivatedResidency', [{ pack: 'RESIDENCY' }], false);
  await student('lapsedResidencyWithYear3', [{ pack: 'RESIDENCY', endDate: lapsed }, { pack: 'THREE' }]);
}, 120000);

afterAll(async () => {
  await prisma.$disconnect();
});

const get = (path: string, userId: number) => request(app).get(`/api/v1${path}`).set('Authorization', tokenFor(userId));
const filters = (userId: number, yearLevel?: string) => get(`/students/content/filters${yearLevel ? `?yearLevel=${yearLevel}` : ''}`, userId);

// This file's unites among those the content filters list
const testUnites = (res: any): number[] => {
  const ours = new Set([...Object.values(content).map(c => c.uniteId), residencyCopyUnite]);
  return res.body.data.unites.map((u: any) => u.id).filter((id: number) => ours.has(id)).sort((a: number, b: number) => a - b);
};

// What the page loads for a module: its books, its courses, then each resource tab of its course
async function openModule(userId: number, c: Content): Promise<number[]> {
  const statuses = [
    (await get(`/students/modules/${c.moduleId}/books`, userId)).status,
    (await get(`/students/courses/by-module?moduleId=${c.moduleId}`, userId)).status
  ];
  for (const type of TYPES) {
    statuses.push((await get(`/courses/${c.courseId}/resources?page=1&limit=100&type=${type}`, userId)).status);
  }
  return statuses;
}
const all = (status: number) => Array(2 + TYPES.length).fill(status);

async function expectWholeModule(userId: number, label: string, c: Content) {
  const books = await get(`/students/modules/${c.moduleId}/books`, userId);
  expect(books.status).toBe(200);
  expect(books.body.data.books.map((b: any) => b.name).sort()).toEqual([`${label} book 1`, `${label} book 2`]);
  expect(books.body.data.books.every((b: any) => b.view.startsWith('https://drive.google.com/'))).toBe(true);

  const courses = await get(`/students/courses/by-module?moduleId=${c.moduleId}`, userId);
  expect(courses.status).toBe(200);
  expect(courses.body.data.courses.map((course: any) => course.id)).toEqual([c.courseId]);

  for (const type of TYPES) {
    const res = await get(`/courses/${c.courseId}/resources?page=1&limit=100&type=${type}`, userId);
    expect(res.status).toBe(200);
    expect(res.body.data.items).toEqual([
      expect.objectContaining({ courseId: c.courseId, type, title: `${label} ${type}`, externalUrl: expect.stringContaining('drive.google.com') })
    ]);
  }
}

describe('Resources page: residency students', () => {
  it('open every module, course, resource tab and book of every year they pick', async () => {
    for (const year of [...YEARS, 'SEVEN' as YearLevel]) {
      const res = await filters(users.residency, year);
      expect(res.status).toBe(200);
      const unite = res.body.data.unites.find((u: any) => u.id === content[year].uniteId);
      expect(unite).toMatchObject({
        modules: [{ id: content[year].moduleId, name: `${tag} module ${year}`, courses: [expect.objectContaining({ id: content[year].courseId })] }]
      });
      await expectWholeModule(users.residency, year, content[year]);
    }
  });

  it('see the picked year only, never another year or the empty Résidanat copies', async () => {
    const res = await filters(users.residency, 'THREE');
    expect(testUnites(res)).toEqual([content.THREE.uniteId]);
    expect(testUnites(res)).not.toContain(residencyCopyUnite);
  });

  it('see and open the independent modules of the picked year', async () => {
    const three = await filters(users.residency, 'THREE');
    expect(three.body.data.independentModules.map((m: any) => m.id)).toContain(content.INDEPENDENT.moduleId);
    const one = await filters(users.residency, 'ONE');
    expect(one.body.data.independentModules.map((m: any) => m.id)).not.toContain(content.INDEPENDENT.moduleId);
    await expectWholeModule(users.residency, 'independent', content.INDEPENDENT);
  });

  it('still open every year with a year pack next to the Résidanat pack', async () => {
    for (const year of YEARS) {
      expect(testUnites(await filters(users.residencyAndYear1, year))).toEqual([content[year].uniteId]);
      expect(await openModule(users.residencyAndYear1, content[year])).toEqual(all(200));
    }
  });

  it('get the subscription type and end date the page decides residency from', async () => {
    const res = await get('/students/subscriptions', users.residency);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      expect.objectContaining({ status: 'ACTIVE', endDate: expect.any(String), studyPack: expect.objectContaining({ type: 'RESIDENCY', yearNumber: null }) })
    ]);
  });

  it('find a year pack for each year on the public pack list, and none for the Résidanat pack', async () => {
    const res = await request(app).get('/api/v1/study-packs?page=1&limit=100');
    expect(res.status).toBe(200);
    const listed = res.body.data.items.filter((p: any) => Object.values(packs).includes(p.id));
    expect(listed.map((p: any) => [p.type, p.yearNumber]).sort()).toEqual(
      [...[...YEARS, 'SEVEN'].map(year => ['YEAR', year]), ['RESIDENCY', null]].sort()
    );
  });
});

describe('Resources page: year-pack students keep their own year', () => {
  it('a year-3 student opens year 3 and is refused in every other year', async () => {
    await expectWholeModule(users.year3, 'THREE', content.THREE);
    for (const year of [...YEARS.filter(y => y !== 'THREE'), 'SEVEN']) {
      expect(await openModule(users.year3, content[year])).toEqual(all(403));
    }
    expect(testUnites(await filters(users.year3))).toEqual([content.THREE.uniteId]);
    expect(testUnites(await filters(users.year3, 'ONE'))).not.toContain(content.ONE.uniteId);
  });

  it('a year-7 pack is an ordinary year pack: its student is refused in years 1 to 6', async () => {
    await expectWholeModule(users.year7, 'SEVEN', content.SEVEN);
    for (const year of YEARS) {
      expect(await openModule(users.year7, content[year])).toEqual(all(403));
    }
    expect(testUnites(await filters(users.year7))).toEqual([content.SEVEN.uniteId]);
    for (const year of YEARS) {
      expect(testUnites(await filters(users.year7, year))).not.toContain(content[year].uniteId);
    }
  });
});

describe('Resources page: subscriptions that grant nothing', () => {
  it('refuses a residency student whose subscription has lapsed', async () => {
    for (const year of YEARS) {
      expect((await filters(users.lapsedResidency, year)).status).toBe(403);
      expect(await openModule(users.lapsedResidency, content[year])).toEqual(all(403));
    }
    expect(await openModule(users.lapsedResidency, content.INDEPENDENT)).toEqual(all(403));
  });

  it('refuses expired, cancelled and pending residency subscriptions', async () => {
    for (const key of ['expiredResidency', 'cancelledResidency', 'pendingResidency']) {
      expect((await filters(users[key], 'THREE')).status).toBe(403);
      expect(await openModule(users[key], content.THREE)).toEqual(all(403));
    }
  });

  it('refuses a deactivated account even with an active residency subscription', async () => {
    expect((await filters(users.deactivatedResidency, 'THREE')).status).toBe(401);
    expect(await openModule(users.deactivatedResidency, content.THREE)).toEqual(all(401));
  });

  it('leaves only the year pack when the Résidanat pack beside it has lapsed', async () => {
    expect(await openModule(users.lapsedResidencyWithYear3, content.THREE)).toEqual(all(200));
    expect(await openModule(users.lapsedResidencyWithYear3, content.ONE)).toEqual(all(403));
    expect(testUnites(await filters(users.lapsedResidencyWithYear3, 'ONE'))).not.toContain(content.ONE.uniteId);
  });
});

describe('AccessControlService.hasResidencyAccess', () => {
  const payload = (subscriptions: any[]): any => ({
    user_data: { id: 1, role: 'STUDENT', currentYear: 'ONE' },
    subscriptions,
    has_active_subscription: subscriptions.length > 0,
    accessible_study_packs: subscriptions.map(sub => sub.study_pack_id)
  });
  const residencyPack = { study_pack_id: 7, pack_type: 'residency', year_number: null, accessible_year_levels: [...YEARS, 'SEVEN'] };
  const year7Pack = { study_pack_id: 8, pack_type: 'year', year_number: 'SEVEN', accessible_year_levels: ['SEVEN'] };

  it('comes from a RESIDENCY pack only, never from a year-7 pack', () => {
    const access = new AccessControlService();
    expect(access.hasResidencyAccess(payload([residencyPack]))).toBe(true);
    expect(access.hasResidencyAccess(payload([year7Pack]))).toBe(false);
    expect(access.hasResidencyAccess(payload([]))).toBe(false);
    expect(access.canAccessPackContent(payload([year7Pack]), 8)).toBe(true);
    expect(access.canAccessPackContent(payload([year7Pack]), 3)).toBe(false);
    expect(access.canAccessPackContent(payload([residencyPack]), 3)).toBe(true);
    expect(access.getAccessibleYearLevels(payload([year7Pack]))).toEqual(['SEVEN']);
  });
});
