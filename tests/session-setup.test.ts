import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import * as jwt from 'jsonwebtoken';
import app from '../src/app';
import { PrismaClient, YearLevel } from '@prisma/client';

// Session setup as a year-pack student (Y) and a résidanat student (R): content and
// session filters, question counts, exam and practice sessions, question order.
const prisma = new PrismaClient();
const tag = `setup${Date.now()}`;
const tokenFor = (id: number) => `Bearer ${jwt.sign({ user_data: { id }, token_version: 0 }, process.env.JWT_SECRET as string, { expiresIn: '1h' })}`;
const api = () => request(app);

let Y: number, R: number;
let unite1: number, unite2: number, uniteR: number;
let module1: number, module2: number, moduleR: number;
let course1a: number, course1b: number, course2: number, courseR: number;
let S1: number, S2: number, SR: number, UA: number;
let repeated: number;
const q1a2020: number[] = [];

async function question(data: Record<string, unknown>) {
  const q = await prisma.question.create({
    data: {
      questionText: `${tag} q`, createdById: Y, ...data,
      questionAnswers: { create: [{ answerText: 'ok', isCorrect: true, position: 0 }, { answerText: 'no', isCorrect: false, position: 1 }] }
    }
  });
  return q.id;
}

beforeAll(async () => {
  const user = (email: string, year: YearLevel) => prisma.user.create({ data: { email: `${tag}-${email}`, passwordHash: 'x', fullName: email, role: 'STUDENT', emailVerified: true, isActive: true, currentYear: year } });
  Y = (await user('year@x.io', 'ONE')).id;
  R = (await user('res@x.io', 'SEVEN')).id;
  const pack1 = (await prisma.studyPack.create({ data: { name: `${tag} 1ère`, type: 'YEAR', yearNumber: 'ONE', pricePerMonth: 1 } })).id;
  const pack2 = (await prisma.studyPack.create({ data: { name: `${tag} 2ème`, type: 'YEAR', yearNumber: 'TWO', pricePerMonth: 1 } })).id;
  // The imported Résidanat pack has no yearNumber
  const packR = (await prisma.studyPack.create({ data: { name: `${tag} Résidanat`, type: 'RESIDENCY', pricePerMonth: 1 } })).id;
  const future = new Date(Date.now() + 30 * 86400000);
  await prisma.subscription.create({ data: { userId: Y, studyPackId: pack1, status: 'ACTIVE', startDate: new Date(), endDate: future, amountPaid: 1 } });
  await prisma.subscription.create({ data: { userId: R, studyPackId: packR, status: 'ACTIVE', startDate: new Date(), endDate: future, amountPaid: 1 } });

  unite1 = (await prisma.unite.create({ data: { studyPackId: pack1, name: 'Modules' } })).id;
  unite2 = (await prisma.unite.create({ data: { studyPackId: pack2, name: 'Modules' } })).id;
  uniteR = (await prisma.unite.create({ data: { studyPackId: packR, name: '1ère année' } })).id;
  module1 = (await prisma.module.create({ data: { uniteId: unite1, name: `${tag} Anatomie` } })).id;
  module2 = (await prisma.module.create({ data: { uniteId: unite2, name: `${tag} Cardio` } })).id;
  moduleR = (await prisma.module.create({ data: { uniteId: uniteR, name: `${tag} Anatomie résidanat` } })).id;
  course1a = (await prisma.course.create({ data: { moduleId: module1, name: `${tag} Os` } })).id;
  course1b = (await prisma.course.create({ data: { moduleId: module1, name: `${tag} Muscles` } })).id;
  course2 = (await prisma.course.create({ data: { moduleId: module2, name: `${tag} Coeur` } })).id;
  courseR = (await prisma.course.create({ data: { moduleId: moduleR, name: `${tag} Os résidanat` } })).id;
  S1 = (await prisma.questionSource.create({ data: { name: `${tag} Externat X` } })).id;
  S2 = (await prisma.questionSource.create({ data: { name: `${tag} Externat Y` } })).id;
  SR = (await prisma.questionSource.create({ data: { name: `${tag} Résidanat X` } })).id;
  UA = (await prisma.university.create({ data: { name: `${tag} Univ` } })).id;

  const base = { yearLevel: 'ONE' as YearLevel, universityId: UA };
  for (let i = 0; i < 3; i++) q1a2020.push(await question({ ...base, courseId: course1a, sourceId: S1, examYear: 2020 }));
  for (let i = 0; i < 2; i++) await question({ ...base, courseId: course1a, sourceId: S1, examYear: 2021 });
  for (let i = 0; i < 2; i++) await question({ ...base, courseId: course1a, sourceId: S2, examYear: 2021 });
  await question({ ...base, courseId: course1a, sourceId: S2 }); // no exam year
  repeated = await question({ ...base, courseId: course1b, sourceId: S1, examYear: 2020, repetitionCount: 3 });
  await question({ ...base, courseId: course1b, sourceId: S1, examYear: 2020, isPublished: false });
  for (let i = 0; i < 2; i++) await question({ yearLevel: 'TWO', universityId: UA, courseId: course2, sourceId: S1, examYear: 2022 });
  for (let i = 0; i < 2; i++) await question({ yearLevel: 'ONE', universityId: UA, courseId: courseR, sourceId: SR, examYear: 2019 });
}, 120000);

afterAll(async () => {
  await prisma.$disconnect();
});

const uniteIds = (body: any) => (body.data.unites as any[]).map(u => u.id);

describe('Session setup for year-pack and résidanat students', () => {
  it('content filters: a résidanat student picks one year at a time, SEVEN is the Résidanat pack', async () => {
    const all = await api().get('/api/v1/students/content/filters').set('Authorization', tokenFor(R));
    expect(all.status).toBe(200);
    expect(uniteIds(all.body)).toEqual(expect.arrayContaining([unite1, unite2, uniteR]));

    const one = await api().get('/api/v1/students/content/filters?yearLevel=ONE').set('Authorization', tokenFor(R));
    expect(uniteIds(one.body)).toContain(unite1);
    expect(uniteIds(one.body)).not.toContain(unite2);
    expect(uniteIds(one.body)).not.toContain(uniteR);

    const two = await api().get('/api/v1/students/content/filters?yearLevel=TWO').set('Authorization', tokenFor(R));
    expect(uniteIds(two.body)).toContain(unite2);

    const seven = await api().get('/api/v1/students/content/filters?yearLevel=SEVEN').set('Authorization', tokenFor(R));
    expect(uniteIds(seven.body)).toContain(uniteR);
    expect(uniteIds(seven.body)).not.toContain(unite1);
    const residencyUnite = seven.body.data.unites.find((u: any) => u.id === uniteR);
    expect(residencyUnite.modules).toEqual([{ id: moduleR, name: `${tag} Anatomie résidanat`, courses: [{ id: courseR, name: `${tag} Os résidanat`, description: null }] }]);
  });

  it('content filters: a year-pack student still sees only their pack', async () => {
    const all = await api().get('/api/v1/students/content/filters').set('Authorization', tokenFor(Y));
    expect(uniteIds(all.body)).toContain(unite1);
    expect(uniteIds(all.body)).not.toContain(unite2);
    expect(uniteIds(all.body)).not.toContain(uniteR);
    for (const year of ['TWO', 'SEVEN']) {
      const other = await api().get(`/api/v1/students/content/filters?yearLevel=${year}`).set('Authorization', tokenFor(Y));
      expect(uniteIds(other.body)).not.toEqual(expect.arrayContaining([unite2]));
      expect(uniteIds(other.body)).not.toContain(uniteR);
    }
  });

  it('session filters list each source with its exam years (published questions only)', async () => {
    for (const user of [R, Y]) {
      const res = await api().get(`/api/v1/quizzes/session-filters?moduleId=${module1}`).set('Authorization', tokenFor(user));
      expect(res.status).toBe(200);
      const sources = res.body.data.questionSources;
      expect(sources).toEqual([
        { id: S1, name: `${tag} Externat X`, questionCount: 6, examYears: [{ year: 2021, questionCount: 2 }, { year: 2020, questionCount: 4 }] },
        { id: S2, name: `${tag} Externat Y`, questionCount: 3, examYears: [{ year: 2021, questionCount: 2 }] }
      ]);
      expect(res.body.data.examYears).toEqual([{ year: 2021, questionCount: 4 }, { year: 2020, questionCount: 4 }]);
      expect(res.body.data.totalQuestionCount).toBe(9);
    }
    // A module of another year: open to the résidanat student only
    const r2 = await api().get(`/api/v1/quizzes/session-filters?moduleId=${module2}`).set('Authorization', tokenFor(R));
    expect(r2.body.data.questionSources).toEqual([{ id: S1, name: `${tag} Externat X`, questionCount: 2, examYears: [{ year: 2022, questionCount: 2 }] }]);
    const y2 = await api().get(`/api/v1/quizzes/session-filters?moduleId=${module2}`).set('Authorization', tokenFor(Y));
    expect(y2.body.data.questionSources).toEqual([]);
    expect(y2.body.data.totalQuestionCount).toBe(0);
  });

  it('question counts leave out unpublished questions and other packs for year-pack students', async () => {
    const r = await api().post('/api/v1/quizzes/question-count').set('Authorization', tokenFor(R)).send({ courseIds: [course1a, course1b, course2], years: [2020, 2022] });
    expect(r.body.data).toEqual({ totalQuestionCount: 6, accessibleQuestionCount: 6 });
    const y = await api().post('/api/v1/quizzes/question-count').set('Authorization', tokenFor(Y)).send({ courseIds: [course1a, course1b, course2], years: [2020, 2022] });
    expect(y.body.data).toEqual({ totalQuestionCount: 6, accessibleQuestionCount: 4 });
  });

  it('an exam holds exactly the questions of its module, source and year', async () => {
    const exam = (user: number, courseIds: number[], sourceId: number, year?: number) => api().post('/api/v1/quizzes/sessions').set('Authorization', tokenFor(user)).send({
      title: 'Exam', courseIds, sessionType: 'EXAM', questionTypes: ['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'QROC'],
      questionSourceIds: [sourceId], ...(year ? { years: [year] } : {})
    });
    const s1 = await exam(R, [course1a, course1b], S1, 2020);
    expect(s1.status).toBe(201);
    expect(s1.body.data.questionCount).toBe(4);
    const s2 = await exam(R, [course1a, course1b], S2);
    expect(s2.body.data.questionCount).toBe(3);
    expect((await exam(R, [course1a, course1b], S1, 2022)).status).toBe(404);
    // Another year's module: every exam for the résidanat student, none for the year-pack student
    expect((await exam(R, [course2], S1, 2022)).body.data.questionCount).toBe(2);
    expect((await exam(Y, [course2], S1, 2022)).status).toBe(404);
    expect((await exam(Y, [course1a, course1b], S1, 2020)).body.data.questionCount).toBe(4);

    // Most repeated first, then question order; the same order on every read
    const first = await api().get(`/api/v1/quiz-sessions/${s1.body.data.sessionId}`).set('Authorization', tokenFor(R));
    expect(first.status).toBe(200);
    const order = first.body.data.questions.map((q: any) => q.id);
    expect(order).toEqual([repeated, ...q1a2020]);
    const again = await api().get(`/api/v1/quiz-sessions/${s1.body.data.sessionId}`).set('Authorization', tokenFor(R));
    expect(again.body.data.questions.map((q: any) => q.id)).toEqual(order);
    const q = first.body.data.questions[1];
    expect(q.course).toMatchObject({ id: course1a, module: { id: module1 } });
    expect(q.source).toEqual({ id: S1, name: `${tag} Externat X` });
    expect(q.university).toMatchObject({ id: UA });
    expect(q.questionAnswers.map((a: any) => a.answerText)).toEqual(['ok', 'no']);
  });

  it('a résidanat student starts practice sessions from any year and from résidanat modules', async () => {
    for (const courseIds of [[course2], [courseR], [course1a]]) {
      const res = await api().post('/api/v1/quizzes/sessions').set('Authorization', tokenFor(R)).send({ title: 'Practice', courseIds, sessionType: 'PRACTISE', questionCount: 2 });
      expect(res.status).toBe(201);
      expect(res.body.data.questionCount).toBe(2);
    }
    const blocked = await api().post('/api/v1/quizzes/sessions').set('Authorization', tokenFor(Y)).send({ title: 'Practice', courseIds: [course2], sessionType: 'PRACTISE', questionCount: 2 });
    expect(blocked.status).toBe(404);
  });

  it('résidanat course questions are listed for résidanat sessions', async () => {
    const filters = await api().get('/api/v1/quizzes/session-residency-filters').set('Authorization', tokenFor(R));
    expect(filters.body.data.universities.find((u: any) => u.id === UA)).toEqual({ id: UA, name: `${tag} Univ`, examYears: [2019] });
    const session = await api().post('/api/v1/quizzes/residency-sessions').set('Authorization', tokenFor(R)).send({ title: 'Rés', examYear: 2019, universityId: UA });
    expect(session.status).toBe(201);
    expect(session.body.data.questionCount).toBe(2);
  });

  it('answering again replaces the stored answer; results count each question once', async () => {
    const created = await api().post('/api/v1/quizzes/sessions').set('Authorization', tokenFor(Y)).send({ title: 'Answers', courseIds: [course1a], sessionType: 'PRACTISE', questionCount: 8, years: [2020] });
    const id = created.body.data.sessionId;
    const session = await api().get(`/api/v1/quiz-sessions/${id}`).set('Authorization', tokenFor(Y));
    const [a, b] = session.body.data.questions;
    const wrong = (q: any) => q.questionAnswers.find((x: any) => !x.isCorrect).id;
    const right = (q: any) => q.questionAnswers.find((x: any) => x.isCorrect).id;
    await api().post(`/api/v1/quiz-sessions/${id}/submit-answer`).set('Authorization', tokenFor(Y)).send({ answers: [{ questionId: a.id, selectedAnswerId: wrong(a) }] });
    const res = await api().post(`/api/v1/quiz-sessions/${id}/submit-answer`).set('Authorization', tokenFor(Y))
      .send({ answers: [{ questionId: a.id, selectedAnswerId: right(a) }, { questionId: b.id, selectedAnswerIds: [wrong(b)] }] });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ correctAnswersCount: 1, incorrectAnswersCount: 1, unansweredCount: 1, totalQuestions: 3 });
    expect(await prisma.quizAttempt.count({ where: { sessionId: id } })).toBe(2);
    const results = await api().get(`/api/v1/quiz-sessions/${id}/results`).set('Authorization', tokenFor(Y));
    expect(results.body.data).toMatchObject({ correctAnswersCount: 1, incorrectAnswersCount: 1, unansweredCount: 1, totalQuestions: 3, status: 'IN_PROGRESS' });
  });
});
