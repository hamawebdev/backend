import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import * as jwt from 'jsonwebtoken';
import app from '../src/app';
import { PrismaClient, YearLevel, QuestionType } from '@prisma/client';

const prisma = new PrismaClient();
const tag = `chk${Date.now()}`;
const tokenFor = (id: number) => `Bearer ${jwt.sign({ user_data: { id }, token_version: 0 }, process.env.JWT_SECRET as string, { expiresIn: '1h' })}`;

let A: number, B: number, R: number;
let packA: number, packB: number, packR: number;
let uniteA: number, moduleA: number, courseA: number, courseA2: number, courseB: number, uniteB: number;
let U1: number, U2: number;
let qA1: number, qA2: number, qA3: number, qB1: number;
let qA1Correct: number, qA1Wrong: number, qA2Correct: number[], qA3Correct: number;
let qB1Correct: number;
let examE: number, qE: number, qV: number;
let qR1: number, qR2: number, qX: number, qR2Correct: number[];
let sourceId: number;

async function makeQuestion(data: any, answers: Array<{ text: string; ok: boolean }>) {
  const q = await prisma.question.create({
    data: { ...data, createdById: A, questionAnswers: { create: answers.map(a => ({ answerText: a.text, isCorrect: a.ok })) } },
    include: { questionAnswers: true }
  });
  return q;
}

beforeAll(async () => {
  const mk = (email: string) => prisma.user.create({ data: { email: `${tag}-${email}`, passwordHash: 'x', fullName: email, role: 'STUDENT', emailVerified: true, isActive: true, currentYear: YearLevel.ONE } });
  A = (await mk('a@x.io')).id; B = (await mk('b@x.io')).id; R = (await mk('r@x.io')).id;
  packA = (await prisma.studyPack.create({ data: { name: `${tag} A`, type: 'YEAR', yearNumber: 'ONE', pricePerMonth: 1 } })).id;
  packB = (await prisma.studyPack.create({ data: { name: `${tag} B`, type: 'YEAR', yearNumber: 'TWO', pricePerMonth: 1 } })).id;
  packR = (await prisma.studyPack.create({ data: { name: `${tag} R`, type: 'RESIDENCY', pricePerMonth: 1 } })).id;
  const future = new Date(Date.now() + 30 * 86400000);
  for (const [userId, studyPackId] of [[A, packA], [B, packB], [R, packR]]) {
    await prisma.subscription.create({ data: { userId, studyPackId, status: 'ACTIVE', startDate: new Date(), endDate: future, amountPaid: 1 } });
  }
  uniteA = (await prisma.unite.create({ data: { studyPackId: packA, name: `${tag} UA` } })).id;
  uniteB = (await prisma.unite.create({ data: { studyPackId: packB, name: `${tag} UB` } })).id;
  moduleA = (await prisma.module.create({ data: { uniteId: uniteA, name: `${tag} MA` } })).id;
  const moduleB = (await prisma.module.create({ data: { uniteId: uniteB, name: `${tag} MB` } })).id;
  courseA = (await prisma.course.create({ data: { moduleId: moduleA, name: `${tag} CA` } })).id;
  courseA2 = (await prisma.course.create({ data: { moduleId: moduleA, name: `${tag} CA2` } })).id;
  courseB = (await prisma.course.create({ data: { moduleId: moduleB, name: `${tag} CB` } })).id;
  U1 = (await prisma.university.create({ data: { name: `${tag} U1` } })).id;
  U2 = (await prisma.university.create({ data: { name: `${tag} U2` } })).id;
  sourceId = (await prisma.questionSource.create({ data: { name: `${tag} src` } })).id;

  let q = await makeQuestion({ courseId: courseA, questionText: 'qA1', yearLevel: 'ONE', sourceId, universityId: U1 }, [{ text: 'ok', ok: true }, { text: 'no', ok: false }]);
  qA1 = q.id; qA1Correct = q.questionAnswers.find(a => a.isCorrect)!.id; qA1Wrong = q.questionAnswers.find(a => !a.isCorrect)!.id;
  q = await makeQuestion({ courseId: courseA, questionText: 'qA2', questionType: QuestionType.MULTIPLE_CHOICE, yearLevel: 'ONE' }, [{ text: 'a', ok: true }, { text: 'b', ok: true }, { text: 'c', ok: false }]);
  qA2 = q.id; qA2Correct = q.questionAnswers.filter(a => a.isCorrect).map(a => a.id);
  q = await makeQuestion({ courseId: courseA, questionText: 'qA3', yearLevel: 'ONE' }, [{ text: 'ok', ok: true }, { text: 'no', ok: false }]);
  qA3 = q.id; qA3Correct = q.questionAnswers.find(a => a.isCorrect)!.id;
  q = await makeQuestion({ courseId: courseB, questionText: 'qB1', yearLevel: 'TWO' }, [{ text: 'ok', ok: true }, { text: 'no', ok: false }]);
  qB1 = q.id; qB1Correct = q.questionAnswers.find(a => a.isCorrect)!.id;

  examE = (await prisma.exam.create({ data: { title: `${tag} E`, moduleId: moduleA, universityId: U1, yearLevel: 'ONE', examYear: new Date('2024-01-01'), year: 2024, createdById: A } })).id;
  qE = (await makeQuestion({ courseId: courseA, examId: examE, examYear: 2024, yearLevel: 'ONE', questionText: 'qE' }, [{ text: 'ok', ok: true }, { text: 'no', ok: false }])).id;
  qV = (await makeQuestion({ courseId: courseA, examYear: 2024, yearLevel: 'ONE', questionText: 'qV' }, [{ text: 'ok', ok: true }, { text: 'no', ok: false }])).id;

  qR1 = (await makeQuestion({ questionText: 'qR1', universityId: U2, examYear: 2019, metadata: JSON.stringify({ source: 'import' }) }, [{ text: 'ok', ok: true }, { text: 'no', ok: false }])).id;
  q = await makeQuestion({ questionText: 'qR2', questionType: QuestionType.MULTIPLE_CHOICE, universityId: U2, examYear: 2019, metadata: JSON.stringify({ part: 'Dossier_clinique' }) }, [{ text: 'a', ok: true }, { text: 'b', ok: true }, { text: 'c', ok: false }]);
  qR2 = q.id; qR2Correct = q.questionAnswers.filter(a => a.isCorrect).map(a => a.id);
  qX = (await makeQuestion({ courseId: courseA, questionText: 'qX externat', universityId: U2, examYear: 2019, yearLevel: 'ONE' }, [{ text: 'ok', ok: true }, { text: 'no', ok: false }])).id;

  // 1005 questions for the cap and bulk-submit checks
  const many = await prisma.question.createManyAndReturn({
    data: Array.from({ length: 1005 }, (_, i) => ({ courseId: courseA2, questionText: `bulk ${i}`, yearLevel: 'ONE' as YearLevel, createdById: A })),
    select: { id: true }
  });
  await prisma.questionAnswer.createMany({
    data: many.flatMap(m => [{ questionId: m.id, answerText: 'ok', isCorrect: true }, { questionId: m.id, answerText: 'no', isCorrect: false }])
  });
}, 120000);

afterAll(async () => {
  await prisma.$disconnect();
});

const api = () => request(app);

describe('Quiz access, scoring and integrity regressions', () => {
  let sessionA: number;

  it('placeholder-free sessions: stats count only real answers, one per question', async () => {
    const created = await api().post('/api/v1/quizzes/create-session-by-questions').set('Authorization', tokenFor(A))
      .send({ title: 'Check session', type: 'PRACTICE', questionIds: [qA1, qA2, qA3] });
    expect(created.status).toBe(201);
    sessionA = created.body.data.sessionId;
    expect(await prisma.quizAttempt.count({ where: { sessionId: sessionA } })).toBe(0);

    const submitted = await api().post(`/api/v1/students/quiz-sessions/${sessionA}/submit-answer`).set('Authorization', tokenFor(A))
      .send({ answers: [{ questionId: qA1, selectedAnswerId: qA1Wrong }, { questionId: qA2, selectedAnswerIds: qA2Correct }] });
    expect(submitted.status).toBe(200);
    expect(submitted.body.data).toMatchObject({ correctAnswersCount: 1, incorrectAnswersCount: 1, unansweredCount: 1, totalQuestions: 3 });

    const session = await api().get(`/api/v1/quiz-sessions/${sessionA}`).set('Authorization', tokenFor(A));
    expect(session.status).toBe(200);
    expect(session.body.data.answers).toHaveLength(2);

    const results = await api().get(`/api/v1/quiz-sessions/${sessionA}/results`).set('Authorization', tokenFor(A));
    expect(results.body.data).toMatchObject({ correctAnswersCount: 1, incorrectAnswersCount: 1, unansweredCount: 1, totalQuestions: 3 });
  });

  it('retake requires originalSessionId and only uses the caller\'s session', async () => {
    const other = await api().post('/api/v1/quizzes/create-session-by-questions').set('Authorization', tokenFor(B))
      .send({ title: 'Other', type: 'PRACTICE', questionIds: [qB1] });
    expect(other.status).toBe(201);

    const done = await api().patch(`/api/v1/students/quiz-sessions/${sessionA}/status`).set('Authorization', tokenFor(A)).send({ status: 'COMPLETED' });
    expect(done.status).toBe(200);

    const bad = await api().post('/api/v1/quiz-sessions/retake').set('Authorization', tokenFor(A)).send({ retakeType: 'SAME' });
    expect(bad.status).toBe(400);

    const foreign = await api().post('/api/v1/quiz-sessions/retake').set('Authorization', tokenFor(B)).send({ originalSessionId: sessionA, retakeType: 'SAME' });
    expect(foreign.status).toBe(404);

    const expectations: Array<[string, number[]]> = [['SAME', [qA1, qA2, qA3]], ['INCORRECT_ONLY', [qA1]], ['CORRECT_ONLY', [qA2]], ['NOT_RESPONDED', [qA3]]];
    for (const [retakeType, ids] of expectations) {
      const res = await api().post('/api/v1/quiz-sessions/retake').set('Authorization', tokenFor(A)).send({ originalSessionId: sessionA, retakeType });
      expect(res.status).toBe(201);
      const rows = await prisma.quizSessionQuestion.findMany({ where: { sessionId: res.body.data.sessionId }, select: { questionId: true } });
      expect(rows.map(r => r.questionId).sort()).toEqual([...ids].sort());
    }
  });

  it('an answer is stored in one table per question type; percentage never exceeds 100', async () => {
    const created = await api().post('/api/v1/quizzes/create-session-by-questions').set('Authorization', tokenFor(A))
      .send({ title: 'Mixed', type: 'PRACTICE', questionIds: [qA1, qA2, qA3] });
    const id = created.body.data.sessionId;

    let res = await api().post(`/api/v1/quiz-sessions/${id}/submit-answer`).set('Authorization', tokenFor(A))
      .send({ answers: [{ questionId: qA1, selectedAnswerIds: [qA1Correct] }] });
    expect(res.status).toBe(200);
    res = await api().post(`/api/v1/quiz-sessions/${id}/submit-answer`).set('Authorization', tokenFor(A))
      .send({ answers: [{ questionId: qA1, selectedAnswerId: qA1Correct }, { questionId: qA2, selectedAnswerId: qA2Correct[0] }] });
    expect(res.status).toBe(200);
    expect(await prisma.multipleChoiceAttempt.count({ where: { sessionId: id, questionId: qA1 } })).toBe(0);
    expect(await prisma.quizAttempt.count({ where: { sessionId: id, questionId: qA2 } })).toBe(0);
    expect(res.body.data.correctAnswersCount).toBe(1);
    expect(res.body.data.unansweredCount).toBe(1);
    const s = await prisma.quizSession.findUnique({ where: { id } });
    expect(s!.percentage).toBeLessThanOrEqual(100);
    expect(s!.status).toBe('IN_PROGRESS');

    const dup = await api().post(`/api/v1/quiz-sessions/${id}/submit-answer`).set('Authorization', tokenFor(A))
      .send({ answers: [{ questionId: qA3, selectedAnswerId: qA3Correct }, { questionId: qA3, selectedAnswerIds: [qA3Correct] }] });
    expect(dup.status).toBe(400);
    const wrongShape = await api().post(`/api/v1/quiz-sessions/${id}/submit-answer`).set('Authorization', tokenFor(A))
      .send({ answers: [{ questionId: qA3, textAnswer: 'x' }] });
    expect(wrongShape.status).toBe(400);
    const noBody = await api().post(`/api/v1/quiz-sessions/${id}/submit-answer`).set('Authorization', tokenFor(A)).send({});
    expect(noBody.status).toBe(400);
  });

  it('legacy quiz-sessions uniteIds filter keeps the study-pack restriction', async () => {
    const res = await api().post('/api/v1/quizzes/quiz-sessions').set('Authorization', tokenFor(B))
      .send({ title: 'Leak test', settings: { questionCount: 1 }, filters: { uniteIds: [uniteA] } });
    expect(res.status).toBe(404);
  });

  it('exam questions linked by Question.examId are listed, served and usable', async () => {
    const list = await api().get(`/api/v1/exams/by-module/${moduleA}/2024`).set('Authorization', tokenFor(A));
    expect(list.status).toBe(200);
    const exam = list.body.data.find((e: any) => e.id === examE);
    expect(exam.questionCount).toBe(1);
    const qs = await api().get(`/api/v1/exams/${examE}/questions`).set('Authorization', tokenFor(A));
    expect(qs.body.data.questions.map((x: any) => x.id)).toEqual([qE]);
    const details = await api().get(`/api/v1/exams/${examE}`).set('Authorization', tokenFor(A));
    expect(details.body.data.questionCount).toBe(1);
    const session = await api().post('/api/v1/exams/exam-sessions').set('Authorization', tokenFor(A)).send({ examId: examE });
    expect(session.status).toBe(200);
    expect(await prisma.quizAttempt.count({ where: { sessionId: session.body.data.data.sessionId } })).toBe(0);
  });

  it('from-modules: virtual exams, duplicate modules and string years do not 500', async () => {
    const res = await api().post('/api/v1/exams/exam-sessions/from-modules').set('Authorization', tokenFor(A)).send({ moduleIds: [moduleA, moduleA], year: '2024' });
    expect(res.status).toBe(200);
    expect(res.body.data.data.questionCount).toBe(2);
    const bad = await api().post('/api/v1/exams/exam-sessions/from-modules').set('Authorization', tokenFor(A)).send({ moduleIds: ['x'], year: 2024 });
    expect(bad.status).toBe(400);
  });

  it('POST /quizzes/sessions without questionCount is capped; rotations use year levels', async () => {
    const res = await api().post('/api/v1/quizzes/sessions').set('Authorization', tokenFor(A)).send({ title: 'Big exam', courseIds: [courseA2], sessionType: 'EXAM' });
    expect(res.status).toBe(201);
    expect(await prisma.quizSessionQuestion.count({ where: { sessionId: res.body.data.sessionId } })).toBe(1000);

    const r1 = await api().post('/api/v1/quizzes/question-count').set('Authorization', tokenFor(A)).send({ courseIds: [courseA2], rotations: ['R1'] });
    expect(r1.status).toBe(400);
    const one = await api().post('/api/v1/quizzes/question-count').set('Authorization', tokenFor(A)).send({ courseIds: [courseA2], rotations: ['ONE'] });
    expect(one.status).toBe(200);
    expect(one.body.data.totalQuestionCount).toBe(1005);
    const two = await api().post('/api/v1/quizzes/sessions').set('Authorization', tokenFor(A)).send({ title: 'Rot', courseIds: [courseA2], sessionType: 'PRACTISE', questionCount: 5, rotations: ['TWO'] });
    expect(two.status).toBe(404);
  });

  it('bulk submit of 1000 answers is fast and scores once', async () => {
    const created = await api().post('/api/v1/quizzes/sessions').set('Authorization', tokenFor(A)).send({ title: 'Bulk', courseIds: [courseA2], sessionType: 'PRACTISE', questionCount: 1000 });
    const id = created.body.data.sessionId;
    const qids = (await prisma.quizSessionQuestion.findMany({ where: { sessionId: id }, select: { questionId: true } })).map(r => r.questionId);
    const correct = await prisma.questionAnswer.findMany({ where: { questionId: { in: qids }, isCorrect: true }, select: { id: true, questionId: true } });
    const byQ = new Map(correct.map(c => [c.questionId, c.id]));
    const t0 = Date.now();
    const res = await api().post(`/api/v1/students/quiz-sessions/${id}/submit-answer`).set('Authorization', tokenFor(A))
      .send({ answers: qids.map(q => ({ questionId: q, selectedAnswerId: byQ.get(q) })) });
    const ms = Date.now() - t0;
    console.log(`bulk submit of ${qids.length} answers took ${ms} ms`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ correctAnswersCount: 1000, unansweredCount: 0, score: 100 });
    expect(ms).toBeLessThan(15000);
    expect((await prisma.quizSession.findUnique({ where: { id } }))!.status).toBe('COMPLETED');
  }, 60000);

  it('residency sessions are scoped to residency content and keep part-less questions', async () => {
    const parts = await api().get(`/api/v1/quizzes/residency-available-parts?universityId=${U2}&examYear=2019`).set('Authorization', tokenFor(R));
    expect(parts.status).toBe(200);
    expect(parts.body.data).toEqual({ parts: ['Dossier_clinique'], questionCount: 2 });

    const filters = await api().get('/api/v1/quizzes/session-residency-filters').set('Authorization', tokenFor(R));
    expect(filters.body.data.universities.find((u: any) => u.id === U2)?.examYears).toEqual([2019]);

    const all = await api().post('/api/v1/quizzes/residency-sessions').set('Authorization', tokenFor(R)).send({ title: 'Res all', examYear: 2019, universityId: U2 });
    expect(all.status).toBe(201);
    expect(all.body.data.questionCount).toBe(2);
    const empty = await api().post('/api/v1/quizzes/residency-sessions').set('Authorization', tokenFor(R)).send({ title: 'Res empty', examYear: 2019, universityId: U2, parts: [] });
    expect(empty.body.data.questionCount).toBe(2);
    const dossier = await api().post('/api/v1/quizzes/residency-sessions').set('Authorization', tokenFor(R)).send({ title: 'Res dossier', examYear: 2019, universityId: U2, parts: ['Dossier_clinique'] });
    expect(dossier.body.data.questionCount).toBe(1);

    // Answer the dossier session fully correctly (multiple choice)
    const sub = await api().post(`/api/v1/quiz-sessions/${dossier.body.data.sessionId}/submit-answer`).set('Authorization', tokenFor(R))
      .send({ answers: [{ questionId: qR2, selectedAnswerIds: qR2Correct }] });
    expect(sub.status).toBe(200);

    // An ordinary session with an externat question (university + exam year) is not a residency session
    const ordinary = await api().post('/api/v1/quizzes/create-session-by-questions').set('Authorization', tokenFor(R))
      .send({ title: 'Ordinary', type: 'PRACTICE', questionIds: [qX] });
    expect(ordinary.status).toBe(201);

    const listed = await api().get('/api/v1/quizzes/residency-sessions-only').set('Authorization', tokenFor(R));
    expect(listed.status).toBe(200);
    const ids = listed.body.data.map((s: any) => s.id);
    expect(ids).not.toContain(ordinary.body.data.sessionId);
    expect(ids).toContain(all.body.data.sessionId);
    expect(listed.body.data.find((s: any) => s.id === dossier.body.data.sessionId).score).toBe(100);
  });

  it('questions-by-unite-or-module is paginated and has no answers', async () => {
    const res = await api().get(`/api/v1/quizzes/questions-by-unite-or-module?uniteId=${uniteA}&limit=2`).set('Authorization', tokenFor(A));
    expect(res.status).toBe(200);
    expect(res.body.data.questions).toHaveLength(2);
    expect(res.body.data.questions[0].answers).toBeUndefined();
    expect(res.body.data.questions[0].course.id).toBeDefined();
    expect(res.body.data.pagination.hasMore).toBe(true);
    const bad = await api().get(`/api/v1/quizzes/questions-by-unite-or-module?uniteId=${uniteA}&limit=0`).set('Authorization', tokenFor(A));
    expect(bad.status).toBe(400);
  });

  it('exam-session-filters aggregates counts without id arrays', async () => {
    const res = await api().get('/api/v1/quizzes/exam-session-filters').set('Authorization', tokenFor(A));
    expect(res.status).toBe(200);
    const unite = res.body.data.unites.find((u: any) => u.id === uniteA);
    const module = unite.modules.find((m: any) => m.id === moduleA);
    const u1 = module.universities.find((u: any) => u.id === U1);
    expect(u1.years).toEqual([{ year: 9999, questionSingleCount: 1, questionMultipleCount: 0 }]);
    expect(JSON.stringify(res.body)).not.toContain('questionSingleChoiceIds');
  });

  it('GET /quiz-sessions paginates; quiz-filters returns question sources', async () => {
    const res = await api().get('/api/v1/quiz-sessions?page=1&limit=10').set('Authorization', tokenFor(A));
    expect(res.status).toBe(200);
    expect(res.body.data.data.pagination.limit).toBe(10);
    const filters = await api().get('/api/v1/quizzes/quiz-filters').set('Authorization', tokenFor(A));
    expect(filters.status).toBe(200);
    expect(filters.body.data.questionSources.find((s: any) => s.id === sourceId)?.questionCount).toBe(1);
  });
});
