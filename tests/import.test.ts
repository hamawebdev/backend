import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import * as jwt from 'jsonwebtoken';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import app from '../src/app';
import { container } from '../src/config/container';
import { PrismaClient, YearLevel } from '@prisma/client';
import MediaHandler, { FileType } from '../src/core/utils/media.utils';

const prisma = new PrismaClient();
const tag = `imp${Date.now()}`;
const key = (name: string) => `${tag}:${name}`;
const tokenFor = (id: number) => `Bearer ${jwt.sign({ user_data: { id }, token_version: 0 }, process.env.JWT_SECRET as string, { expiresIn: '1h' })}`;
const api = () => request(app);

let admin: number, student: number, residentStudent: number;
let ids: Record<string, Record<string, number>>;

const hierarchy = () => ({
  universities: [
    { sourceKey: key('univ:setif'), name: `${tag} Sétif` },
    { sourceKey: key('univ:oran'), name: `${tag} Oran`, country: 'Algeria' }
  ],
  sources: [{ sourceKey: key('src:res-setif'), name: `${tag} Résidanat Sétif` }],
  studyPacks: [
    { sourceKey: key('pack:y1'), name: `${tag} 1ère année`, type: 'YEAR', yearNumber: 'ONE', pricePerMonth: 100, pricePerYear: 1200 },
    { sourceKey: key('pack:res'), name: `${tag} Résidanat`, type: 'RESIDENCY', pricePerMonth: 700, pricePerYear: 7500 }
  ],
  unites: [{ sourceKey: key('unite:y1'), studyPackKey: key('pack:y1'), name: 'Modules' }],
  modules: [{ sourceKey: key('mod:anat'), uniteKey: key('unite:y1'), name: 'Anatomie' }],
  courses: [
    { sourceKey: key('course:os'), moduleKey: key('mod:anat'), name: 'Ostéologie' },
    { sourceKey: key('course:myo'), moduleKey: key('mod:anat'), name: 'Myologie' }
  ]
});

const question = (name: string, overrides: Record<string, unknown> = {}) => ({
  sourceKey: key(`q:${name}`),
  contentHash: `h1-${name}`,
  courseKey: key('course:os'),
  universityKey: key('univ:setif'),
  questionSourceKey: key('src:res-setif'),
  examYear: 2021,
  yearLevel: 'ONE',
  questionType: 'SINGLE_CHOICE',
  isPublished: true,
  questionText: `Question ${name}`,
  explanation: `Explication ${name}`,
  metadata: { origin: 'test' },
  tags: ['anatomie'],
  answers: [
    { position: 0, answerText: 'A', isCorrect: true, explanation: 'car A' },
    { position: 1, answerText: 'B', isCorrect: false },
    { position: 2, answerText: 'C', isCorrect: false }
  ],
  ...overrides
});

const putQuestions = (questions: unknown[]) =>
  api().put('/api/v1/admin/import/questions').set('Authorization', tokenFor(admin)).send({ questions });

const answersOf = (questionId: number) =>
  prisma.questionAnswer.findMany({ where: { questionId }, orderBy: [{ position: 'asc' }, { id: 'asc' }] });

beforeAll(async () => {
  const mk = (email: string, role: 'ADMIN' | 'STUDENT') => prisma.user.create({ data: { email: `${tag}-${email}`, passwordHash: 'x', fullName: email, role, emailVerified: true, isActive: true, currentYear: YearLevel.ONE } });
  admin = (await mk('admin@x.io', 'ADMIN')).id;
  student = (await mk('stu@x.io', 'STUDENT')).id;
  residentStudent = (await mk('res@x.io', 'STUDENT')).id;
}, 60000);

afterAll(async () => { await prisma.$disconnect(); });

describe('Dataset import API', () => {
  it('is admin only', async () => {
    const res = await api().get('/api/v1/admin/import/stats').set('Authorization', tokenFor(student));
    expect(res.status).toBe(403);
  });

  it('hierarchy upsert is idempotent and leaves existing records alone unless updateExisting', async () => {
    const first = await api().put('/api/v1/admin/import/hierarchy').set('Authorization', tokenFor(admin)).send(hierarchy());
    expect(first.status).toBe(200);
    ids = first.body;
    expect(Object.keys(ids.courses)).toHaveLength(2);
    const course = await prisma.course.findUnique({ where: { id: ids.courses[key('course:os')] }, include: { module: { include: { unite: true } } } });
    expect(course!.module.unite!.studyPackId).toBe(ids.studyPacks[key('pack:y1')]);

    const renamed = hierarchy();
    renamed.courses[0].name = 'Ostéologie (renamed)';
    const second = await api().put('/api/v1/admin/import/hierarchy').set('Authorization', tokenFor(admin)).send(renamed);
    expect(second.status).toBe(200);
    expect(second.body).toEqual(ids);
    expect((await prisma.course.findUnique({ where: { id: ids.courses[key('course:os')] } }))!.name).toBe('Ostéologie');
    expect(await prisma.course.count({ where: { sourceKey: { startsWith: `${tag}:` } } })).toBe(2);

    const updated = await api().put('/api/v1/admin/import/hierarchy').set('Authorization', tokenFor(admin)).send({ ...renamed, updateExisting: true });
    expect(updated.body).toEqual(ids);
    expect((await prisma.course.findUnique({ where: { id: ids.courses[key('course:os')] } }))!.name).toBe('Ostéologie (renamed)');

    // Children may reference parents imported by an earlier call
    const child = await api().put('/api/v1/admin/import/hierarchy').set('Authorization', tokenFor(admin))
      .send({ courses: [{ sourceKey: key('course:arthro'), moduleKey: key('mod:anat'), name: 'Arthrologie' }] });
    expect(child.status).toBe(200);
    const unknownParent = await api().put('/api/v1/admin/import/hierarchy').set('Authorization', tokenFor(admin))
      .send({ courses: [{ sourceKey: key('course:x'), moduleKey: key('mod:missing'), name: 'X' }] });
    expect(unknownParent.status).toBe(400);
    expect(await prisma.course.count({ where: { sourceKey: key('course:x') } })).toBe(0);

    // Students of the imported packs
    const future = new Date(Date.now() + 30 * 86400000);
    await prisma.subscription.create({ data: { userId: student, studyPackId: ids.studyPacks[key('pack:y1')], status: 'ACTIVE', startDate: new Date(), endDate: future, amountPaid: 1 } });
    await prisma.subscription.create({ data: { userId: residentStudent, studyPackId: ids.studyPacks[key('pack:res')], status: 'ACTIVE', startDate: new Date(), endDate: future, amountPaid: 1 } });
  });

  let qId: number;
  let answerIds: number[];
  it('question create, unchanged re-run, then English added updates in place', async () => {
    const created = await putQuestions([question('one')]);
    expect(created.status).toBe(200);
    expect(created.body.results).toEqual([{ sourceKey: key('q:one'), id: expect.any(Number), action: 'created' }]);
    qId = created.body.results[0].id;
    const stored = await prisma.question.findUnique({ where: { id: qId } });
    expect(stored).toMatchObject({ courseId: ids.courses[key('course:os')], universityId: ids.universities[key('univ:setif')], isPublished: true, contentHash: 'h1-one' });
    expect(JSON.parse(stored!.metadata!)).toEqual({ origin: 'test' });
    answerIds = (await answersOf(qId)).map(a => a.id);
    expect(answerIds).toHaveLength(3);

    const again = await putQuestions([question('one')]);
    expect(again.body.results[0]).toMatchObject({ id: qId, action: 'unchanged' });

    const english = question('one', {
      contentHash: 'h2-one',
      questionTextEn: 'Question one in English',
      explanationEn: 'Explanation one',
      answers: [
        { position: 0, answerText: 'A', answerTextEn: 'A (en)', isCorrect: true, explanation: 'car A', explanationEn: 'because A' },
        { position: 1, answerText: 'B', answerTextEn: 'B (en)', isCorrect: false },
        { position: 2, answerText: 'C', answerTextEn: 'C (en)', isCorrect: false }
      ]
    });
    const updated = await putQuestions([english]);
    expect(updated.body.results[0]).toMatchObject({ id: qId, action: 'updated' });
    const answers = await answersOf(qId);
    expect(answers.map(a => a.id)).toEqual(answerIds);
    expect(answers.map(a => a.answerTextEn)).toEqual(['A (en)', 'B (en)', 'C (en)']);
    expect(answers[0].explanationEn).toBe('because A');
    expect((await prisma.question.findUnique({ where: { id: qId } }))!.questionTextEn).toBe('Question one in English');

    const state = await api().post('/api/v1/admin/import/questions/state').set('Authorization', tokenFor(admin))
      .send({ sourceKeys: [key('q:one'), key('q:none')] });
    expect(state.body).toEqual({ items: [{ sourceKey: key('q:one'), id: qId, contentHash: 'h2-one' }] });
  });

  it('an answer text change keeps the answer ids; a bad question fails alone', async () => {
    const res = await putQuestions([
      question('one', {
        contentHash: 'h3-one',
        answers: [
          { position: 0, answerText: 'A corrected', isCorrect: true },
          { position: 1, answerText: 'B', isCorrect: false },
          { position: 2, answerText: 'C', isCorrect: false }
        ]
      }),
      { sourceKey: key('q:bad'), questionText: 'no hash' },
      question('orphan', { courseKey: key('course:missing') })
    ]);
    expect(res.status).toBe(200);
    expect(res.body.results[0]).toMatchObject({ id: qId, action: 'updated' });
    expect(res.body.results[1]).toMatchObject({ sourceKey: key('q:bad'), id: null, action: 'failed' });
    expect(res.body.results[2]).toMatchObject({ action: 'failed', error: expect.stringContaining('courseKey') });
    const answers = await answersOf(qId);
    expect(answers.map(a => a.id)).toEqual(answerIds);
    expect(answers[0].answerText).toBe('A corrected');
    expect(answers[0].answerTextEn).toBeNull();
  });

  it('removing an answer a student chose fails cleanly; an unchosen one is removed', async () => {
    const session = await prisma.quizSession.create({ data: { userId: student, title: 'chosen', sessionQuestions: { create: [{ questionId: qId }] } } });
    await prisma.quizAttempt.create({ data: { sessionId: session.id, questionId: qId, selectedAnswerId: answerIds[2], isCorrect: false } });

    const twoAnswers = question('one', {
      contentHash: 'h4-one',
      questionText: 'Changed text',
      answers: [
        { position: 0, answerText: 'A', isCorrect: true },
        { position: 1, answerText: 'B', isCorrect: false }
      ]
    });
    const refused = await putQuestions([twoAnswers]);
    expect(refused.body.results[0]).toMatchObject({ id: qId, action: 'failed', error: expect.stringContaining(String(answerIds[2])) });
    const unchanged = await prisma.question.findUnique({ where: { id: qId } });
    expect(unchanged!.questionText).toBe('Question one');
    expect(unchanged!.contentHash).toBe('h3-one');
    expect((await answersOf(qId)).map(a => a.id)).toEqual(answerIds);

    // Reordering so the chosen answer stays: the last stored answer (B) goes instead
    await prisma.quizAttempt.updateMany({ where: { sessionId: session.id }, data: { selectedAnswerId: answerIds[1] } });
    const ok = await putQuestions([twoAnswers]);
    expect(ok.body.results[0]).toMatchObject({ id: qId, action: 'updated' });
    const answers = await answersOf(qId);
    expect(answers.map(a => a.id)).toEqual(answerIds.slice(0, 2));
    await prisma.quizSession.delete({ where: { id: session.id } });
  });

  it('image lists are replaced by path, in order', async () => {
    const withImages = (hash: string, images: string[]) => question('img', { contentHash: hash, questionImages: images, explanationImages: ['/api/v1/media/images/e.png'] });
    const created = await putQuestions([withImages('i1', ['/api/v1/media/images/a.png', '/api/v1/media/images/b.png'])]);
    const id = created.body.results[0].id;
    const paths = async () => (await prisma.questionImage.findMany({ where: { questionId: id }, orderBy: { id: 'asc' } })).map(i => i.imagePath);
    expect(await paths()).toEqual(['/api/v1/media/images/a.png', '/api/v1/media/images/b.png']);
    const explanationBefore = await prisma.questionExplanationImage.findMany({ where: { questionId: id } });

    await putQuestions([withImages('i2', ['/api/v1/media/images/c.png', '/api/v1/media/images/a.png'])]);
    expect(await paths()).toEqual(['/api/v1/media/images/c.png', '/api/v1/media/images/a.png']);
    // Unchanged explanation images are kept as they are
    expect(await prisma.questionExplanationImage.findMany({ where: { questionId: id } })).toEqual(explanationBefore);

    const bad = await putQuestions([withImages('i3', ['javascript:alert(1)'])]);
    expect(bad.body.results[0].action).toBe('failed');
  });

  let hiddenId: number;
  it('unpublished questions are left out of student sessions and counts but visible to admins', async () => {
    const res = await putQuestions([
      question('pub', { courseKey: key('course:myo') }),
      question('hidden', { courseKey: key('course:myo'), isPublished: false, answers: [] })
    ]);
    expect(res.body.results.map((r: any) => r.action)).toEqual(['created', 'created']);
    hiddenId = res.body.results[1].id;
    const courseId = ids.courses[key('course:myo')];

    const count = await api().post('/api/v1/quizzes/question-count').set('Authorization', tokenFor(student)).send({ courseIds: [courseId] });
    expect(count.status).toBe(200);
    expect(count.body.data).toMatchObject({ totalQuestionCount: 1, accessibleQuestionCount: 1 });

    const session = await api().post('/api/v1/quizzes/sessions').set('Authorization', tokenFor(student))
      .send({ title: 'Myologie', courseIds: [courseId], sessionType: 'PRACTISE' });
    expect(session.status).toBe(201);
    const rows = await prisma.quizSessionQuestion.findMany({ where: { sessionId: session.body.data.sessionId } });
    expect(rows.map(r => r.questionId)).toEqual([res.body.results[0].id]);

    const byIds = await api().post('/api/v1/quizzes/create-session-by-questions').set('Authorization', tokenFor(student))
      .send({ title: 'Hidden', type: 'PRACTICE', questionIds: [hiddenId] });
    expect(byIds.status).toBe(400);

    const listing = await api().get(`/api/v1/quizzes/questions-by-unite-or-module?moduleId=${ids.modules[key('mod:anat')]}`).set('Authorization', tokenFor(student));
    expect(listing.body.data.questions.map((q: any) => q.id)).not.toContain(hiddenId);

    const filters = await api().get('/api/v1/quizzes/session-filters').set('Authorization', tokenFor(student));
    const module = filters.body.data.unites.flatMap((u: any) => u.modules).find((m: any) => m.id === ids.modules[key('mod:anat')]);
    expect(module.questionCount).toBe(await prisma.question.count({ where: { course: { moduleId: ids.modules[key('mod:anat')] }, isPublished: true } }));

    const adminList = await api().get(`/api/v1/admin/questions?courseId=${courseId}&isPublished=false`).set('Authorization', tokenFor(admin));
    expect(adminList.status).toBe(200);
    expect(adminList.body.data.items).toEqual([expect.objectContaining({ id: hiddenId, isPublished: false })]);
    const adminOne = await api().get(`/api/v1/admin/questions/${hiddenId}`).set('Authorization', tokenFor(admin));
    expect(adminOne.body.data.isPublished).toBe(false);

    const publish = await api().put(`/api/v1/admin/questions/${hiddenId}`).set('Authorization', tokenFor(admin)).send({ isPublished: true });
    expect(publish.status).toBe(200);
    expect((await prisma.question.findUnique({ where: { id: hiddenId } }))!.isPublished).toBe(true);
    await prisma.question.update({ where: { id: hiddenId }, data: { isPublished: false } });
  });

  it('GET /quiz-sessions/:id serves the English fields, answers by position then id', async () => {
    await putQuestions([question('en', {
      questionTextEn: 'English text',
      explanationEn: 'English explanation',
      answers: [
        { position: 2, answerText: 'third', answerTextEn: 'third (en)', isCorrect: false },
        { position: 0, answerText: 'first', answerTextEn: 'first (en)', isCorrect: true, explanation: 'fr', explanationEn: 'en' },
        { position: 1, answerText: 'second', isCorrect: false }
      ]
    })]);
    const q = await prisma.question.findUnique({ where: { sourceKey: key('q:en') }, include: { questionAnswers: { orderBy: { position: 'asc' } } } });
    // Move the first answer last and the last first
    const [a0, a1, a2] = q!.questionAnswers;
    expect([a0.answerText, a1.answerText, a2.answerText]).toEqual(['first', 'second', 'third']);
    await prisma.questionAnswer.update({ where: { id: a0.id }, data: { position: 5 } });
    await prisma.questionAnswer.update({ where: { id: a2.id }, data: { position: 0 } });

    const created = await api().post('/api/v1/quizzes/create-session-by-questions').set('Authorization', tokenFor(student))
      .send({ title: 'English', type: 'PRACTICE', questionIds: [q!.id] });
    expect(created.status).toBe(201);
    const session = await api().get(`/api/v1/quiz-sessions/${created.body.data.sessionId}`).set('Authorization', tokenFor(student));
    expect(session.status).toBe(200);
    const served = session.body.data.questions[0];
    expect(served).toMatchObject({ questionTextEn: 'English text', explanationEn: 'English explanation' });
    expect(served.questionAnswers.map((a: any) => a.id)).toEqual([a2.id, a1.id, a0.id]);
    expect(served.questionAnswers.map((a: any) => a.answerTextEn)).toEqual(['third (en)', null, 'first (en)']);
    expect(served.questionAnswers[2]).toMatchObject({ explanation: 'fr', explanationEn: 'en' });

    const students = await api().get(`/api/v1/students/questions?courseIds=${ids.courses[key('course:os')]}&includeAnswers=true&includeExplanations=true`).set('Authorization', tokenFor(student));
    expect(students.status).toBe(200);
    const listed = students.body.data.questions.find((x: any) => x.id === q!.id);
    expect(listed).toMatchObject({ questionTextEn: 'English text', explanationEn: 'English explanation' });
    expect(listed.questionAnswers.map((a: any) => a.id)).toEqual([a2.id, a1.id, a0.id]);
    expect(listed.questionAnswers[2]).toMatchObject({ answerTextEn: 'first (en)', explanationEn: 'en' });
  });

  it('exam upsert keeps the paper order and reports missing questions', async () => {
    await putQuestions([question('p1'), question('p2'), question('p3')]);
    const paper = {
      sourceKey: key('exam:2021'),
      title: `${tag} Anatomie 2021`,
      moduleKey: key('mod:anat'),
      universityKey: key('univ:setif'),
      yearLevel: 'ONE',
      year: 2021,
      questionKeys: [key('q:p3'), key('q:p1'), key('q:nowhere'), key('q:p2'), key('q:p1')]
    };
    const first = await api().put('/api/v1/admin/import/exams').set('Authorization', tokenFor(admin)).send({ exams: [paper] });
    expect(first.status).toBe(200);
    expect(first.body.results[0]).toMatchObject({ sourceKey: key('exam:2021'), action: 'created', missingQuestions: [key('q:nowhere')] });
    const examId = first.body.results[0].id;
    const qid = async (name: string) => (await prisma.question.findUnique({ where: { sourceKey: key(`q:${name}`) } }))!.id;
    const [p1, p2, p3] = [await qid('p1'), await qid('p2'), await qid('p3')];

    const links = await prisma.examQuestion.findMany({ where: { examId }, orderBy: { orderInExam: 'asc' } });
    expect(links.map(l => [l.questionId, l.orderInExam])).toEqual([[p3, 1], [p1, 2], [p2, 3]]);
    const served = await api().get(`/api/v1/exams/${examId}/questions`).set('Authorization', tokenFor(student));
    expect(served.status).toBe(200);
    expect(served.body.data.questions.map((q: any) => q.id)).toEqual([p3, p1, p2]);
    expect(served.body.data.questions[0]).toHaveProperty('questionTextEn');

    const listed = await api().get(`/api/v1/exams/by-module/${ids.modules[key('mod:anat')]}/2021`).set('Authorization', tokenFor(student));
    expect(listed.body.data.find((e: any) => e.id === examId)?.questionCount).toBe(3);

    const again = await api().put('/api/v1/admin/import/exams').set('Authorization', tokenFor(admin)).send({ exams: [paper] });
    expect(again.body.results[0]).toMatchObject({ id: examId, action: 'unchanged' });

    const reordered = await api().put('/api/v1/admin/import/exams').set('Authorization', tokenFor(admin))
      .send({ exams: [{ ...paper, questionKeys: [key('q:p1'), key('q:p2')] }] });
    expect(reordered.body.results[0]).toMatchObject({ id: examId, action: 'updated', missingQuestions: [] });
    const relinked = await prisma.examQuestion.findMany({ where: { examId }, orderBy: { orderInExam: 'asc' } });
    expect(relinked.map(l => [l.questionId, l.orderInExam])).toEqual([[p1, 1], [p2, 2]]);
  });

  it('media upload checks the sha1, stores once and serves with a restrictive policy', async () => {
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a3a40000000049454e44ae426082', 'hex');
    const sha1 = crypto.createHash('sha1').update(png).digest('hex');
    const upload = () => api().post('/api/v1/admin/import/media').set('Authorization', tokenFor(admin))
      .field('sha1', sha1).attach('file', png, { filename: `${sha1}.png`, contentType: 'image/png' });

    const mismatch = await api().post('/api/v1/admin/import/media').set('Authorization', tokenFor(admin))
      .field('sha1', 'a'.repeat(40)).attach('file', png, { filename: 'x.png', contentType: 'image/png' });
    expect(mismatch.status).toBe(400);
    expect(mismatch.body.error.message).toContain('sha1 mismatch');
    const badExt = await api().post('/api/v1/admin/import/media').set('Authorization', tokenFor(admin))
      .field('sha1', sha1).attach('file', png, { filename: 'x.html', contentType: 'text/html' });
    expect(badExt.status).toBe(400);

    const first = await upload();
    expect([200, 201]).toContain(first.status);
    expect(first.body).toEqual({ sha1, url: `/api/v1/media/images/${sha1}.png`, size: png.length, existed: expect.any(Boolean) });
    const second = await upload();
    expect(second.status).toBe(200);
    expect(second.body.existed).toBe(true);

    const check = await api().post('/api/v1/admin/import/media/check').set('Authorization', tokenFor(admin))
      .send({ files: [`${sha1}.png`, `${'b'.repeat(40)}.jpg`] });
    expect(check.body).toEqual({ existing: [`${sha1}.png`] });

    const served = await api().get(`/api/v1/media/images/${sha1}.png`);
    expect(served.status).toBe(200);
    expect(served.headers['content-security-policy']).toBe("default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
    expect(served.headers['x-content-type-options']).toBe('nosniff');
  });

  it('residency: Sétif parts are accepted and listed, part-less (Oran) questions too', async () => {
    const res = await putQuestions([
      question('res-med', { courseKey: null, examYear: 2019, yearLevel: null, metadata: { part: 'Médicale', paper: 'Sétif 2019' } }),
      question('res-bio', { courseKey: null, examYear: 2019, yearLevel: null, metadata: { part: 'Biologie' } }),
      question('res-oran', { courseKey: null, universityKey: key('univ:oran'), examYear: 2018, yearLevel: null, metadata: null })
    ]);
    expect(res.body.results.map((r: any) => r.action)).toEqual(['created', 'created', 'created']);
    const med = await prisma.question.findUnique({ where: { sourceKey: key('q:res-med') } });
    expect(med!.metadata).toBe('{"part":"Medicale","paper":"Sétif 2019"}');

    const setif = ids.universities[key('univ:setif')];
    const parts = await api().get(`/api/v1/quizzes/residency-available-parts?universityId=${setif}&examYear=2019`).set('Authorization', tokenFor(residentStudent));
    expect(parts.status).toBe(200);
    expect(parts.body.data).toEqual({ parts: ['Biologie', 'Medicale'], questionCount: 2 });
    const session = await api().post('/api/v1/quizzes/residency-sessions').set('Authorization', tokenFor(residentStudent))
      .send({ title: 'Sétif 2019', examYear: 2019, universityId: setif, parts: ['Médicale'] });
    expect(session.status).toBe(201);
    expect(session.body.data.questionCount).toBe(1);

    const byPart = await api().get(`/api/v1/admin/residency-questions?universityId=${setif}&part=${encodeURIComponent('Médicale')}`).set('Authorization', tokenFor(admin));
    expect(byPart.status).toBe(200);
    expect(byPart.body.questions.map((q: any) => q.id)).toEqual([med!.id]);
    const oran = await api().get(`/api/v1/admin/residency-questions?universityId=${ids.universities[key('univ:oran')]}`).set('Authorization', tokenFor(admin));
    expect(oran.body.questions).toEqual([expect.objectContaining({ part: null, examYear: 2018 })]);
    const one = await api().get(`/api/v1/admin/residency-questions/${oran.body.questions[0].id}`).set('Authorization', tokenFor(admin));
    expect(one.status).toBe(200);

    const created = await api().post('/api/v1/admin/residency-questions').set('Authorization', tokenFor(admin))
      .send({ questionText: 'Bio', part: 'Biologie', universityId: setif, examYear: 2020, questionAnswers: [{ answerText: 'a', isCorrect: true }] });
    expect(created.status).toBe(201);
    expect(created.body.part).toBe('Biologie');
  });

  it('/students/notes serves English, without the answer key for inaccessible questions', async () => {
    const accessible = await prisma.question.findUnique({ where: { sourceKey: key('q:en') } });
    // A residency question the year-pack student cannot access, with English content
    const residency = await prisma.question.findUnique({ where: { sourceKey: key('q:res-bio') }, include: { questionAnswers: true } });
    await prisma.question.update({ where: { id: residency!.id }, data: { questionTextEn: 'Biology', explanationEn: 'Why (en)' } });
    await prisma.questionAnswer.updateMany({ where: { questionId: residency!.id }, data: { answerTextEn: 'answer (en)', explanationEn: 'secret (en)' } });
    await prisma.studentNote.createMany({ data: [
      { userId: student, questionId: accessible!.id, noteText: 'accessible' },
      { userId: student, questionId: residency!.id, noteText: 'not accessible' }
    ] });

    const res = await api().get('/api/v1/students/notes').set('Authorization', tokenFor(student));
    expect(res.status).toBe(200);
    const open = res.body.find((n: any) => n.questionId === accessible!.id).question;
    expect(open).toMatchObject({ questionTextEn: 'English text', explanationEn: 'English explanation' });
    expect(open.questionAnswers.map((a: any) => a.position)).toEqual([0, 1, 5]);
    expect(open.questionAnswers[2]).toMatchObject({ isCorrect: true, explanationEn: 'en' });

    const closed = res.body.find((n: any) => n.questionId === residency!.id).question;
    expect(closed.questionTextEn).toBe('Biology');
    expect(closed).not.toHaveProperty('explanation');
    expect(closed).not.toHaveProperty('explanationEn');
    expect(closed.questionAnswers[0]).toMatchObject({ answerTextEn: 'answer (en)' });
    for (const answer of closed.questionAnswers) {
      expect(answer).not.toHaveProperty('isCorrect');
      expect(answer).not.toHaveProperty('explanation');
      expect(answer).not.toHaveProperty('explanationEn');
    }
  });

  it('stats count the imported content', async () => {
    const res = await api().get('/api/v1/admin/import/stats').set('Authorization', tokenFor(admin));
    expect(res.status).toBe(200);
    const imported = await prisma.question.count({ where: { sourceKey: { not: null } } });
    expect(res.body.questions.total).toBe(imported);
    expect(res.body.questions.unpublished).toBe(await prisma.question.count({ where: { sourceKey: { not: null }, isPublished: false } }));
    // Question 'one' lost its English on the later full-state updates; 'en' keeps it
    expect(res.body.questions.withEnglish).toBe(await prisma.question.count({ where: { sourceKey: { not: null }, questionTextEn: { not: null } } }));
    expect(res.body.questions.withEnglish).toBeGreaterThanOrEqual(1);
    const setif = res.body.byUniversity.find((u: any) => u.sourceKey === key('univ:setif'));
    expect(setif.total).toBe(await prisma.question.count({ where: { universityId: ids.universities[key('univ:setif')], sourceKey: { not: null } } }));
    expect(res.body.residency).toEqual(expect.arrayContaining([
      expect.objectContaining({ universityId: ids.universities[key('univ:setif')], part: 'Medicale', total: 1 }),
      expect.objectContaining({ universityId: ids.universities[key('univ:oran')], part: null, total: 1 })
    ]));
    expect(res.body.exams.examQuestions).toBeGreaterThanOrEqual(2);
    expect(res.body.images.files).toBeGreaterThanOrEqual(1);
  });
});

describe('Admin endpoints the UI calls', () => {
  it('university create accepts a city; question sources accept accented names', async () => {
    const uni = await api().post('/api/v1/admin/universities').set('Authorization', tokenFor(admin))
      .send({ name: `${tag} Université de Batna`, country: 'Algeria', city: 'Batna' });
    expect(uni.status).toBe(201);
    const updated = await api().put(`/api/v1/admin/universities/${uni.body.id}`).set('Authorization', tokenFor(admin))
      .send({ name: `${tag} Université Batna 2`, city: 'Batna' });
    expect(updated.status).toBe(200);

    const source = await api().post('/api/v1/admin/question-sources').set('Authorization', tokenFor(admin))
      .send({ name: `Résidanat d'Alger ${tag.slice(-6)}.` });
    expect(source.status).toBe(201);
    const bad = await api().post('/api/v1/admin/question-sources').set('Authorization', tokenFor(admin)).send({ name: 'Bad <script>' });
    expect(bad.status).toBe(400);
  });

  it('public university and specialty lists accept up to 100 per page', async () => {
    const res = await api().get('/api/v1/universities?limit=100');
    expect(res.status).toBe(200);
    expect(res.body.limit).toBe(100);
    const capped = await api().get('/api/v1/specialties?limit=5000');
    expect(capped.body.limit).toBe(100);
  });

  it('bulk question create stores metadata and the rotation year level, and reports totalCreated', async () => {
    const res = await api().post('/api/v1/admin/questions/bulk').set('Authorization', tokenFor(admin)).send({
      metadata: { courseId: ids.courses[key('course:os')], examYear: 2022, rotation: 'R2', metadata: { batch: 'x' } },
      questions: [{ questionText: 'Bulk rotation', questionType: 'SINGLE_CHOICE', answers: [{ answerText: 'a', isCorrect: true }, { answerText: 'b', isCorrect: false }] }]
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ created: 1, totalCreated: 1 });
    const q = await prisma.question.findUnique({ where: { id: res.body.data.questionIds[0] } });
    expect(q!.yearLevel).toBe('TWO');
    expect(JSON.parse(q!.metadata!)).toEqual({ batch: 'x' });
  });

  it('unite and module create/update keep the description', async () => {
    const unite = await api().post('/api/v1/admin/content/unites').set('Authorization', tokenFor(admin))
      .send({ studyPackId: ids.studyPacks[key('pack:y1')], name: 'Unite described', description: 'About the unite' });
    expect(unite.status).toBe(201);
    expect((await prisma.unite.findUnique({ where: { id: unite.body.id } }))!.description).toBe('About the unite');
    const moduleRes = await api().post('/api/v1/admin/content/modules').set('Authorization', tokenFor(admin))
      .send({ uniteId: unite.body.id, name: 'Module described', description: 'About the module' });
    expect(moduleRes.status).toBe(201);
    const edit = await api().put(`/api/v1/admin/content/modules/${moduleRes.body.id}`).set('Authorization', tokenFor(admin))
      .send({ name: 'Module described', description: 'New description' });
    expect(edit.status).toBe(200);
    expect((await prisma.module.findUnique({ where: { id: moduleRes.body.id } }))!.description).toBe('New description');
  });
});

describe('Bulk question import (the set-based path of PUT /questions)', () => {
  const sha = (salt: string, i: number) => crypto.createHash('sha1').update(`${tag}:${salt}:${i}`).digest('hex');
  // A realistic imported question: 5 answers sent out of position order, English on
  // even numbers, question images on every third, explanation images on every fifth
  const bulkQuestion = (name: string, i: number, overrides: Record<string, unknown> = {}) => {
    const english = i % 2 === 0;
    return {
      sourceKey: key(`bulk:${name}`),
      contentHash: `b1-${name}`,
      courseKey: key(i % 2 ? 'course:os' : 'course:myo'),
      universityKey: key('univ:setif'),
      questionSourceKey: key('src:res-setif'),
      examYear: 2000 + (i % 20),
      yearLevel: 'ONE',
      questionType: i % 4 === 0 ? 'MULTIPLE_CHOICE' : 'SINGLE_CHOICE',
      isPublished: i % 7 !== 0,
      questionText: `<p>Bulk ${name}</p>`,
      ...(english ? { questionTextEn: `<p>Bulk ${name} (en)</p>`, explanationEn: `Explanation ${name}` } : {}),
      explanation: `Explication ${name}`,
      metadata: { origin: 'bulk', n: i },
      tags: ['bulk', `t${i % 3}`],
      repetitionCount: i % 4,
      repetitionYears: [2015, 2019],
      questionImages: i % 3 === 0 ? [`/api/v1/media/images/${sha('q', i)}.png`, `/api/v1/media/images/${sha('q2', i)}.jpg`] : [],
      ...(i % 5 === 0 ? { explanationImages: [`/api/v1/media/images/${sha('e', i)}.png`] } : {}),
      answers: [4, 2, 0, 3, 1].map(p => ({
        position: p,
        answerText: `${name}-${p}`,
        ...(english ? { answerTextEn: `${name}-${p} (en)` } : {}),
        isCorrect: p === i % 5,
        ...(p === i % 5 ? { explanation: `why ${name}`, ...(english ? { explanationEn: `why ${name} (en)` } : {}) } : {})
      })),
      ...overrides
    };
  };
  const stored = (keys: string[]) => prisma.question.findMany({
    where: { sourceKey: { in: keys } },
    include: {
      questionAnswers: { orderBy: [{ position: 'asc' }, { id: 'asc' }] },
      questionImages: { orderBy: { id: 'asc' } },
      questionExplanationImages: { orderBy: { id: 'asc' } }
    }
  });

  const batch = Array.from({ length: 200 }, (_, i) => bulkQuestion(String(i), i));
  let batchIds: number[];

  it('creates a batch of 200 new questions with their answers, positions, English and images, ids in request order', async () => {
    const res = await putQuestions(batch);
    expect(res.status).toBe(200);
    expect(res.body.results).toEqual(batch.map(q => ({ sourceKey: q.sourceKey, id: expect.any(Number), action: 'created' })));
    batchIds = res.body.results.map((r: any) => r.id);
    expect(batchIds.every((id, i) => i === 0 || id > batchIds[i - 1])).toBe(true);

    const rows = new Map((await stored(batch.map(q => q.sourceKey))).map(row => [row.sourceKey, row]));
    expect(rows.size).toBe(200);
    batch.forEach((q, i) => {
      const row = rows.get(q.sourceKey)!;
      const english = i % 2 === 0;
      expect(row.id).toBe(batchIds[i]);
      expect(row).toMatchObject({
        contentHash: q.contentHash,
        questionText: q.questionText,
        questionTextEn: english ? `<p>Bulk ${i} (en)</p>` : null,
        explanation: `Explication ${i}`,
        explanationEn: english ? `Explanation ${i}` : null,
        questionType: q.questionType,
        isPublished: q.isPublished,
        courseId: ids.courses[q.courseKey],
        universityId: ids.universities[key('univ:setif')],
        sourceId: ids.sources[key('src:res-setif')],
        examYear: q.examYear,
        yearLevel: 'ONE',
        createdById: admin,
        repetitionCount: i % 4,
        tags: JSON.stringify(['bulk', `t${i % 3}`]),
        repetitionYears: '[2015,2019]'
      });
      expect(JSON.parse(row.metadata!)).toEqual({ origin: 'bulk', n: i });
      expect(row.updatedAt).toBeInstanceOf(Date);

      const answers = row.questionAnswers;
      expect(answers.map(a => a.position)).toEqual([0, 1, 2, 3, 4]);
      expect(answers.map(a => a.answerText)).toEqual([0, 1, 2, 3, 4].map(p => `${i}-${p}`));
      expect(answers.map(a => a.answerTextEn)).toEqual([0, 1, 2, 3, 4].map(p => (english ? `${i}-${p} (en)` : null)));
      expect(answers.map(a => a.isCorrect)).toEqual([0, 1, 2, 3, 4].map(p => p === i % 5));
      const correct = answers[i % 5];
      expect(correct.explanation).toBe(`why ${i}`);
      expect(correct.explanationEn).toBe(english ? `why ${i} (en)` : null);
      expect(answers.filter(a => a !== correct).every(a => a.explanation === null && a.explanationEn === null)).toBe(true);
      // Stored in position order, as one by one: ids ascend with the position
      expect(answers.every((a, p) => p === 0 || a.id > answers[p - 1].id)).toBe(true);

      expect(row.questionImages.map(image => image.imagePath)).toEqual(q.questionImages);
      expect(row.questionExplanationImages.map(image => image.imagePath)).toEqual((q as any).explanationImages ?? []);
    });
  });

  it('re-sending the same batch is all unchanged and writes nothing', async () => {
    const answersBefore = await prisma.questionAnswer.count({ where: { questionId: { in: batchIds } } });
    const updatedBefore = (await prisma.question.findMany({ where: { id: { in: batchIds } }, select: { id: true, updatedAt: true }, orderBy: { id: 'asc' } }));
    const res = await putQuestions(batch);
    expect(res.status).toBe(200);
    expect(res.body.results).toEqual(batch.map((q, i) => ({ sourceKey: q.sourceKey, id: batchIds[i], action: 'unchanged' })));
    expect(await prisma.questionAnswer.count({ where: { questionId: { in: batchIds } } })).toBe(answersBefore);
    expect(await prisma.question.findMany({ where: { id: { in: batchIds } }, select: { id: true, updatedAt: true }, orderBy: { id: 'asc' } })).toEqual(updatedBefore);
    expect(await prisma.question.count({ where: { sourceKey: { in: batch.map(q => q.sourceKey) } } })).toBe(200);
  });

  it('a mixed batch (new, unchanged, changed, invalid) gets the right action at each index', async () => {
    const answerIdsBefore = (await stored([batch[1].sourceKey]))[0].questionAnswers.map(a => a.id);
    const changed = bulkQuestion('1', 1, {
      contentHash: 'b2-1',
      questionText: '<p>Bulk 1 changed</p>',
      questionTextEn: '<p>Bulk 1 changed (en)</p>',
      answers: [0, 1, 2, 3, 4].map(p => ({ position: p, answerText: `1-${p} v2`, answerTextEn: `1-${p} v2 (en)`, isCorrect: p === 0 }))
    });
    const questions = [
      bulkQuestion('mix-new', 1),
      batch[0],
      changed,
      { sourceKey: key('bulk:mix-invalid'), questionText: 'no hash' },
      bulkQuestion('mix-orphan', 2, { courseKey: key('course:missing') }),
      bulkQuestion('mix-new', 1),
      bulkQuestion('mix-big', 3, { metadata: { pad: 'x'.repeat(50001) } }),
      bulkQuestion('mix-new2', 4)
    ];
    const res = await putQuestions(questions);
    expect(res.status).toBe(200);
    const results = res.body.results;
    expect(results.map((r: any) => r.action)).toEqual(['created', 'unchanged', 'updated', 'failed', 'failed', 'failed', 'failed', 'created']);
    expect(results.map((r: any) => r.sourceKey)).toEqual(questions.map(q => q.sourceKey));
    expect(results[1].id).toBe(batchIds[0]);
    expect(results[2].id).toBe(batchIds[1]);
    expect(results[3]).toMatchObject({ id: null, error: expect.stringContaining('contentHash') });
    expect(results[4]).toMatchObject({ id: null, error: expect.stringContaining('courseKey') });
    expect(results[5]).toMatchObject({ id: null, error: expect.stringContaining('more than once') });
    expect(results[6]).toMatchObject({ id: null, error: expect.stringContaining('metadata') });
    expect(results[7].id).toBeGreaterThan(results[0].id);

    const [updated] = await stored([batch[1].sourceKey]);
    expect(updated).toMatchObject({ contentHash: 'b2-1', questionText: '<p>Bulk 1 changed</p>', questionTextEn: '<p>Bulk 1 changed (en)</p>', explanationEn: null });
    expect(updated.questionAnswers.map(a => a.id)).toEqual(answerIdsBefore);
    expect(updated.questionAnswers.map(a => a.answerTextEn)).toEqual([0, 1, 2, 3, 4].map(p => `1-${p} v2 (en)`));
    const created = await stored([key('bulk:mix-new'), key('bulk:mix-new2')]);
    expect(created.map(q => q.questionAnswers.length)).toEqual([5, 5]);
    expect(await prisma.question.count({ where: { sourceKey: { in: [key('bulk:mix-orphan'), key('bulk:mix-big'), key('bulk:mix-invalid')] } } })).toBe(0);
  });

  it('a new question the database refuses fails alone: the others of the batch are created one by one', async () => {
    const questions = [0, 1, 2, 3].map(i => bulkQuestion(`nul:${i}`, i));
    // PostgreSQL text cannot hold NUL: the bulk insert fails, then only this question does
    questions[2] = bulkQuestion('nul:2', 2, { questionText: 'bad \u0000 text' });
    const res = await putQuestions(questions);
    expect(res.status).toBe(200);
    expect(res.body.results.map((r: any) => r.action)).toEqual(['created', 'created', 'failed', 'created']);
    expect(res.body.results[2]).toMatchObject({ sourceKey: key('bulk:nul:2'), id: null, error: expect.any(String) });
    const rows = await stored(questions.map(q => q.sourceKey));
    expect(rows.map(q => q.sourceKey).sort()).toEqual([0, 1, 3].map(i => key(`bulk:nul:${i}`)).sort());
    // Nothing of the rolled-back bulk insert is left: exactly the answers and images of one import
    expect(rows.map(q => q.questionAnswers.length)).toEqual([5, 5, 5]);
    expect(rows.find(q => q.sourceKey === key('bulk:nul:0'))!.questionImages).toHaveLength(2);
  });

  it('a question a concurrent import is creating is waited for, then compared and updated like a stored one', async () => {
    const same = bulkQuestion('race:same', 1);
    const other = bulkQuestion('race:other', 2);
    const free = bulkQuestion('race:free', 3);
    let pending: Promise<any> | undefined;
    let waited = false;
    const heldIds = await prisma.$transaction(async tx => {
      // Created by "another import", not committed yet
      const a = await tx.question.create({ data: { sourceKey: same.sourceKey, contentHash: same.contentHash, questionText: 'held', createdById: admin } });
      const b = await tx.question.create({ data: { sourceKey: other.sourceKey, contentHash: 'older', questionText: 'held', createdById: admin } });
      pending = putQuestions([free, same, other]).then(res => res);
      // The request's insert must now wait on this transaction's rows
      for (let i = 0; i < 100 && !waited; i++) {
        await new Promise(resolve => setTimeout(resolve, 100));
        const [row] = await prisma.$queryRaw<Array<{ n: bigint }>>`
          SELECT count(*) AS n FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'`;
        waited = Number(row.n) > 0;
      }
      return [a.id, b.id];
    }, { maxWait: 10000, timeout: 20000 });
    expect(waited).toBe(true);

    const res = await pending!;
    expect(res.status).toBe(200);
    expect(res.body.results).toEqual([
      { sourceKey: free.sourceKey, id: expect.any(Number), action: 'created' },
      { sourceKey: same.sourceKey, id: heldIds[0], action: 'unchanged' },
      { sourceKey: other.sourceKey, id: heldIds[1], action: 'updated' }
    ]);
    const rows = new Map((await stored([free.sourceKey, same.sourceKey, other.sourceKey])).map(q => [q.sourceKey, q]));
    expect(rows.get(free.sourceKey)!.questionAnswers).toHaveLength(5);
    expect(rows.get(same.sourceKey)!.questionAnswers).toHaveLength(0);
    expect(rows.get(other.sourceKey)).toMatchObject({ contentHash: other.contentHash, questionText: other.questionText });
    expect(rows.get(other.sourceKey)!.questionAnswers.map(a => a.answerText)).toEqual([0, 1, 2, 3, 4].map(p => `race:other-${p}`));
  });

  it('two requests creating the same questions at once store each question once, and every item gets its result', async () => {
    const questions = Array.from({ length: 40 }, (_, i) => bulkQuestion(`dup:${i}`, i));
    const [first, second] = await Promise.all([putQuestions(questions), putQuestions(questions)]);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    questions.forEach((q, i) => {
      const pair = [first.body.results[i], second.body.results[i]];
      expect(pair.map(r => r.sourceKey)).toEqual([q.sourceKey, q.sourceKey]);
      expect(pair.map(r => r.action).sort()).toEqual(['created', 'unchanged']);
      expect(pair[0].id).toBe(pair[1].id);
    });
    const rows = await stored(questions.map(q => q.sourceKey));
    expect(rows).toHaveLength(40);
    expect(rows.every(q => q.questionAnswers.length === 5)).toBe(true);
    expect(rows.reduce((n, q) => n + q.questionImages.length, 0)).toBe(questions.reduce((n, q) => n + q.questionImages.length, 0));
  });

  it('media: parallel uploads of one new image store it once; a stored file with other bytes of the same size is replaced', async () => {
    const directory = container.resolve<MediaHandler>('mediaHandler').getDirectory(FileType.IMAGE);
    const content = crypto.randomBytes(300 * 1024);
    const sha1 = crypto.createHash('sha1').update(content).digest('hex');
    const file = path.join(directory, `${sha1}.png`);
    const upload = () => api().post('/api/v1/admin/import/media').set('Authorization', tokenFor(admin))
      .field('sha1', sha1).attach('file', content, { filename: `${sha1}.png`, contentType: 'image/png' });

    const parallel = await Promise.all(Array.from({ length: 6 }, () => upload()));
    for (const res of parallel) {
      expect([200, 201]).toContain(res.status);
      expect(res.body).toMatchObject({ sha1, size: content.length, existed: res.status === 200 });
    }
    expect(parallel.some(res => res.status === 201)).toBe(true);
    expect(fs.readFileSync(file).equals(content)).toBe(true);
    expect(fs.readdirSync(directory).filter(name => name.startsWith(`.${sha1}.png.`))).toEqual([]);
    expect((await upload()).body.existed).toBe(true);

    // Damaged in place (same size, other bytes): detected and rewritten
    fs.writeFileSync(file, crypto.randomBytes(content.length));
    const repaired = await upload();
    expect(repaired.status).toBe(201);
    expect(repaired.body.existed).toBe(false);
    expect(fs.readFileSync(file).equals(content)).toBe(true);
    // Another size: rewritten without reading it
    fs.writeFileSync(file, content.subarray(0, 1000));
    expect((await upload()).status).toBe(201);
    expect(fs.readFileSync(file).equals(content)).toBe(true);
    const again = await upload();
    expect(again.status).toBe(200);
    expect(again.body.existed).toBe(true);
    fs.unlinkSync(file);
  });
});
