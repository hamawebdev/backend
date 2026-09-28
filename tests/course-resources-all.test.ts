import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import * as jwt from 'jsonwebtoken';
import app from '../src/app';
import { PrismaClient, YearLevel, ResourceType } from '@prisma/client';

const prisma = new PrismaClient();
const tag = `res${Date.now()}`;
const tokenFor = (id: number) => `Bearer ${jwt.sign({ user_data: { id }, token_version: 0 }, process.env.JWT_SECRET as string, { expiresIn: '1h' })}`;
const TYPES: ResourceType[] = ['OFFICIAL_SUPPORT', 'CHOICE_OF_TEAM', 'VIDEO', 'AUDIO', 'OTHER'];

let year3Student: number, year1Student: number, residencyStudent: number;
let bigCourse: number, keyTwinResidency: number, nameTwinResidency: number, nameTwinYear: number;
let lonelyResidency: number, ambiguousResidency: number, bookModule: number;
let uniteTwinYear: number, uniteTwinResidency: number;
let bigCourseIds: number[] = [];

beforeAll(async () => {
  const mkUser = (email: string) => prisma.user.create({ data: { email: `${tag}-${email}`, passwordHash: 'x', fullName: email, role: 'STUDENT', emailVerified: true, isActive: true, currentYear: YearLevel.THREE } });
  year3Student = (await mkUser('y3@x.io')).id;
  year1Student = (await mkUser('y1@x.io')).id;
  residencyStudent = (await mkUser('r@x.io')).id;

  const pack1 = (await prisma.studyPack.create({ data: { name: `${tag} 1`, type: 'YEAR', yearNumber: 'ONE', pricePerMonth: 1 } })).id;
  const pack3 = (await prisma.studyPack.create({ data: { name: `${tag} 3ème année`, type: 'YEAR', yearNumber: 'THREE', pricePerMonth: 1 } })).id;
  const packR = (await prisma.studyPack.create({ data: { name: `${tag} Résidanat`, type: 'RESIDENCY', pricePerMonth: 1 } })).id;
  const future = new Date(Date.now() + 30 * 86400000);
  for (const [userId, studyPackId] of [[year3Student, pack3], [year1Student, pack1], [residencyStudent, packR]]) {
    await prisma.subscription.create({ data: { userId, studyPackId, status: 'ACTIVE', startDate: new Date(), endDate: future, amountPaid: 1 } });
  }

  const unite3 = (await prisma.unite.create({ data: { studyPackId: pack3, name: 'Modules' } })).id;
  const uniteR3 = (await prisma.unite.create({ data: { studyPackId: packR, name: '3ème année', sourceKey: `unite:residanat:year-3:${tag}` } })).id;
  const cardio = (await prisma.module.create({ data: { uniteId: unite3, name: `${tag} Cardiologie` } })).id;
  const cardioR = (await prisma.module.create({ data: { uniteId: uniteR3, name: `${tag} Cardiologie` } })).id;
  bookModule = cardio;

  // A year course with more resources than any page, and its résidanat copy (importer keys)
  bigCourse = (await prisma.course.create({ data: { moduleId: cardio, name: 'Insuffisance cardiaque', sourceKey: `course:module:year-3:${tag}-cardio:ic` } })).id;
  keyTwinResidency = (await prisma.course.create({ data: { moduleId: cardioR, name: 'Insuffisance cardiaque (résidanat spelling)', sourceKey: `course:module:residanat:year-3:${tag}-cardio:ic` } })).id;
  await prisma.courseResource.createMany({
    data: Array.from({ length: 130 }, (_, i) => ({ courseId: bigCourse, type: TYPES[i % TYPES.length], title: `big ${i}`, externalUrl: `https://drive.google.com/file/d/${tag}-${i}/view` }))
  });
  bigCourseIds = (await prisma.courseResource.findMany({ where: { courseId: bigCourse }, orderBy: { id: 'asc' }, select: { id: true } })).map(r => r.id);
  await prisma.courseResource.create({ data: { courseId: keyTwinResidency, type: 'OTHER', title: 'own résumé', externalUrl: 'https://drive.google.com/file/d/own/view' } });

  // Résidanat course whose year twin exists only under the same names (no importer key)
  nameTwinYear = (await prisma.course.create({ data: { moduleId: cardio, name: 'Toxicologie générale' } })).id;
  nameTwinResidency = (await prisma.course.create({ data: { moduleId: cardioR, name: 'TOXICOLOGIE générale', sourceKey: `course:module:residanat:year-3:${tag}-cardio:toxicologie-generale` } })).id;
  await prisma.courseResource.create({ data: { courseId: nameTwinYear, type: 'VIDEO', title: 'toxico video', externalUrl: 'https://youtu.be/x' } });

  // Résidanat course without a key (added by an admin): the study year comes from its unite
  const pack5 = (await prisma.studyPack.create({ data: { name: `${tag} 5`, type: 'YEAR', yearNumber: 'FIVE', pricePerMonth: 1 } })).id;
  const unite5 = (await prisma.unite.create({ data: { studyPackId: pack5, name: 'Modules' } })).id;
  const uniteR5 = (await prisma.unite.upsert({ where: { sourceKey: 'unite:residanat:year-5' }, update: {}, create: { studyPackId: packR, name: '5ème année', sourceKey: 'unite:residanat:year-5' } })).id;
  const pedia = (await prisma.module.create({ data: { uniteId: unite5, name: `${tag} Pédiatrie` } })).id;
  const pediaR = (await prisma.module.create({ data: { uniteId: uniteR5, name: `${tag} Pédiatrie` } })).id;
  uniteTwinYear = (await prisma.course.create({ data: { moduleId: pedia, name: 'Autres' } })).id;
  uniteTwinResidency = (await prisma.course.create({ data: { moduleId: pediaR, name: 'Autres' } })).id;
  await prisma.courseResource.create({ data: { courseId: uniteTwinYear, type: 'OFFICIAL_SUPPORT', title: 'pedia support', externalUrl: 'https://drive.google.com/file/d/pedia/view' } });

  // No twin at all, and two same-named year courses (ambiguous: no twin)
  lonelyResidency = (await prisma.course.create({ data: { moduleId: cardioR, name: 'Only in résidanat', sourceKey: `course:module:residanat:year-3:${tag}-cardio:only` } })).id;
  await prisma.course.create({ data: { moduleId: cardio, name: 'Twice' } });
  await prisma.course.create({ data: { moduleId: cardio, name: 'Twice' } });
  ambiguousResidency = (await prisma.course.create({ data: { moduleId: cardioR, name: 'Twice', sourceKey: `course:module:residanat:year-3:${tag}-cardio:twice` } })).id;

  // Module books are not course resources
  await prisma.moduleBook.create({ data: { moduleId: bookModule, name: 'Book', viewUrl: 'https://drive.google.com/file/d/book/view' } });
}, 120000);

afterAll(async () => {
  await prisma.$disconnect();
});

const all = (courseId: number, userId: number) =>
  request(app).get(`/api/v1/courses/${courseId}/resources/all`).set('Authorization', tokenFor(userId));

describe('GET /courses/:id/resources/all', () => {
  it('returns every resource of a course in the order they were added, however many there are', async () => {
    const res = await all(bigCourse, year3Student);
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(130);
    expect(res.body.data.items.map((r: any) => r.id)).toEqual(bigCourseIds);
    expect(res.body.data.course).toEqual({ id: bigCourse, name: 'Insuffisance cardiaque' });
    expect(res.body.data.yearCourse).toBeNull();
    const counts: Record<string, number> = {};
    for (const r of res.body.data.items) counts[r.type] = (counts[r.type] || 0) + 1;
    expect(counts).toEqual({ OFFICIAL_SUPPORT: 26, CHOICE_OF_TEAM: 26, VIDEO: 26, AUDIO: 26, OTHER: 26 });
    expect(res.body.data.items[0]).toMatchObject({ courseId: bigCourse, title: 'big 0', externalUrl: expect.stringContaining('drive.google.com') });
  });

  it('adds the year twin\'s resources to a résidanat course (importer key), after its own', async () => {
    const res = await all(keyTwinResidency, residencyStudent);
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(131);
    expect(res.body.data.items[0].title).toBe('own résumé');
    expect(res.body.data.items.slice(1).map((r: any) => r.id)).toEqual(bigCourseIds);
    expect(res.body.data.yearCourse).toMatchObject({ id: bigCourse, name: 'Insuffisance cardiaque', studyPack: { name: `${tag} 3ème année` } });
  });

  it('finds the year twin by module and course name when no importer key matches', async () => {
    const res = await all(nameTwinResidency, residencyStudent);
    expect(res.status).toBe(200);
    expect(res.body.data.yearCourse).toMatchObject({ id: nameTwinYear });
    expect(res.body.data.items.map((r: any) => r.title)).toEqual(['toxico video']);
  });

  it('takes the study year from the résidanat unite when the course has no key', async () => {
    const res = await all(uniteTwinResidency, residencyStudent);
    expect(res.status).toBe(200);
    expect(res.body.data.yearCourse).toMatchObject({ id: uniteTwinYear });
    expect(res.body.data.items.map((r: any) => r.title)).toEqual(['pedia support']);
  });

  it('has no twin when none or more than one year course matches', async () => {
    for (const courseId of [lonelyResidency, ambiguousResidency]) {
      const res = await all(courseId, residencyStudent);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ yearCourse: null, total: 0, items: [] });
    }
  });

  it('sees new resources at once', async () => {
    await prisma.courseResource.create({ data: { courseId: nameTwinYear, type: 'AUDIO', title: 'added later', externalUrl: 'https://drive.google.com/file/d/later/view' } });
    const res = await all(nameTwinResidency, residencyStudent);
    expect(res.body.data.items.map((r: any) => r.title)).toEqual(['toxico video', 'added later']);
  });

  it('keeps the pack access rules', async () => {
    expect((await all(bigCourse, year1Student)).status).toBe(403);
    expect((await all(keyTwinResidency, year3Student)).status).toBe(403);
    expect((await all(bigCourse, residencyStudent)).status).toBe(200);
    expect((await all(2147483000, residencyStudent)).status).toBe(404);
    expect((await request(app).get(`/api/v1/courses/${bigCourse}/resources/all`)).status).toBe(401);
  });

  it('leaves the paginated endpoint unchanged: a résidanat course lists only its own resources', async () => {
    const res = await request(app).get(`/api/v1/courses/${keyTwinResidency}/resources?limit=1000`).set('Authorization', tokenFor(residencyStudent));
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(1);
  });
});
