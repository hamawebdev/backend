import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import * as jwt from 'jsonwebtoken';
// The app loads reflect-metadata, which tsyringe needs first
import app from '../src/app';
import { container } from 'tsyringe';
import { PrismaClient, YearLevel, QuestionType, SessionStatus } from '@prisma/client';
import QuizRepository from '../src/modules/quizzes/quiz.repository';

/**
 * A session shows the same results everywhere: the submit-answer response, the
 * results screen (GET /quiz-sessions/:id/results), the review screen
 * (GET /quiz-sessions/:id answers), the session lists (practice/exam history,
 * residency history, GET /quiz-sessions) and analytics (GET /quiz-sessions/type/:type),
 * whatever the order answers were given, changed or resumed in.
 */

const prisma = new PrismaClient();
const tag = `res${Date.now()}`;
const tokenFor = (id: number) => `Bearer ${jwt.sign({ user_data: { id }, token_version: 0 }, process.env.JWT_SECRET as string, { expiresIn: '1h' })}`;
const api = () => request(app);

let student: number, resident: number;
let courseId: number, universityId: number;

type Q = { id: number; answers: number[]; correct: number[]; wrong: number[] };
// Single choice: A correct, B and C wrong
let single1: Q;
// Single choice: A correct, B wrong
let single2: Q;
// Multiple choice with three correct answers (A, B, C) and one wrong (D)
let multi3: Q;
// Multiple choice with two correct answers (A, B) and one wrong (C)
let multi2: Q;
// QROC (self-assessed)
let qroc: Q;
// Single choice nobody answers
let untouched: Q;
// Residency questions (no course)
let resSingle: Q, resMulti: Q;
// Questions with the same repetition count, for the order check
let sameRank: Q[] = [];

async function makeQuestion(data: any, answers: Array<{ text: string; ok: boolean; en?: string }>): Promise<Q> {
  const q = await prisma.question.create({
    data: {
      ...data,
      createdById: student,
      questionAnswers: {
        create: answers.map((a, position) => ({ answerText: a.text, answerTextEn: a.en ?? null, isCorrect: a.ok, position }))
      }
    },
    include: { questionAnswers: { orderBy: { position: 'asc' } } }
  });
  return {
    id: q.id,
    answers: q.questionAnswers.map(a => a.id),
    correct: q.questionAnswers.filter(a => a.isCorrect).map(a => a.id),
    wrong: q.questionAnswers.filter(a => !a.isCorrect).map(a => a.id)
  };
}

beforeAll(async () => {
  const mk = (email: string) => prisma.user.create({
    data: { email: `${tag}-${email}`, passwordHash: 'x', fullName: email, role: 'STUDENT', emailVerified: true, isActive: true, currentYear: YearLevel.ONE }
  });
  student = (await mk('student@x.io')).id;
  resident = (await mk('resident@x.io')).id;

  const future = new Date(Date.now() + 30 * 86400000);
  const pack = (await prisma.studyPack.create({ data: { name: `${tag} Y1`, type: 'YEAR', yearNumber: 'ONE', pricePerMonth: 1 } })).id;
  const residencyPack = (await prisma.studyPack.create({ data: { name: `${tag} R`, type: 'RESIDENCY', pricePerMonth: 1 } })).id;
  await prisma.subscription.create({ data: { userId: student, studyPackId: pack, status: 'ACTIVE', startDate: new Date(), endDate: future, amountPaid: 1 } });
  await prisma.subscription.create({ data: { userId: resident, studyPackId: residencyPack, status: 'ACTIVE', startDate: new Date(), endDate: future, amountPaid: 1 } });

  const uniteId = (await prisma.unite.create({ data: { studyPackId: pack, name: `${tag} U` } })).id;
  const moduleId = (await prisma.module.create({ data: { uniteId, name: `${tag} M` } })).id;
  courseId = (await prisma.course.create({ data: { moduleId, name: `${tag} C` } })).id;
  universityId = (await prisma.university.create({ data: { name: `${tag} Uni` } })).id;

  const base = { courseId, yearLevel: 'ONE' as YearLevel };
  single1 = await makeQuestion(
    { ...base, questionText: 'single 1', questionTextEn: 'single 1 (en)' },
    [{ text: 'A', ok: true, en: 'A en' }, { text: 'B', ok: false, en: 'B en' }, { text: 'C', ok: false, en: 'C en' }]
  );
  single2 = await makeQuestion({ ...base, questionText: 'single 2' }, [{ text: 'A', ok: true }, { text: 'B', ok: false }]);
  multi3 = await makeQuestion(
    { ...base, questionText: 'multi 3', questionTextEn: 'multi 3 (en)', questionType: QuestionType.MULTIPLE_CHOICE },
    [{ text: 'A', ok: true, en: 'A en' }, { text: 'B', ok: true, en: 'B en' }, { text: 'C', ok: true, en: 'C en' }, { text: 'D', ok: false, en: 'D en' }]
  );
  multi2 = await makeQuestion(
    { ...base, questionText: 'multi 2', questionType: QuestionType.MULTIPLE_CHOICE },
    [{ text: 'A', ok: true }, { text: 'B', ok: true }, { text: 'C', ok: false }]
  );
  qroc = await makeQuestion({ ...base, questionText: 'qroc', questionType: QuestionType.QROC }, [{ text: 'expected', ok: true }]);
  untouched = await makeQuestion({ ...base, questionText: 'untouched' }, [{ text: 'A', ok: true }, { text: 'B', ok: false }]);

  const residency = { universityId, examYear: 2031 };
  resSingle = await makeQuestion({ ...residency, questionText: 'res single' }, [{ text: 'A', ok: true }, { text: 'B', ok: false }]);
  resMulti = await makeQuestion(
    { ...residency, questionText: 'res multi', questionType: QuestionType.MULTIPLE_CHOICE },
    [{ text: 'A', ok: true }, { text: 'B', ok: true }, { text: 'C', ok: false }]
  );

  for (let i = 0; i < 6; i++) {
    sameRank.push(await makeQuestion({ ...base, questionText: `same rank ${i}`, repetitionCount: 2 }, [{ text: 'A', ok: true }, { text: 'B', ok: false }]));
  }
}, 120000);

afterAll(async () => {
  await prisma.$disconnect();
});

async function createSession(userId: number, type: 'PRACTICE' | 'EXAM', questionIds: number[]): Promise<number> {
  const res = await api().post('/api/v1/quizzes/create-session-by-questions').set('Authorization', tokenFor(userId))
    .send({ title: `${tag} ${type}`, type, questionIds });
  expect(res.status).toBe(201);
  return res.body.data.sessionId;
}

async function submit(userId: number, sessionId: number, answers: any[]) {
  const res = await api().post(`/api/v1/students/quiz-sessions/${sessionId}/submit-answer`).set('Authorization', tokenFor(userId))
    .send({ answers });
  expect(res.status).toBe(200);
  return res.body.data;
}

async function finish(userId: number, sessionId: number) {
  const res = await api().patch(`/api/v1/students/quiz-sessions/${sessionId}/status`).set('Authorization', tokenFor(userId))
    .send({ status: 'COMPLETED' });
  expect(res.status).toBe(200);
}

async function results(userId: number, sessionId: number) {
  const res = await api().get(`/api/v1/quiz-sessions/${sessionId}/results`).set('Authorization', tokenFor(userId));
  expect(res.status).toBe(200);
  return res.body.data;
}

async function sessionView(userId: number, sessionId: number) {
  const res = await api().get(`/api/v1/quiz-sessions/${sessionId}`).set('Authorization', tokenFor(userId));
  expect(res.status).toBe(200);
  return res.body.data;
}

/** Verdict of each question the way the review screen reads it from GET /quiz-sessions/:id */
function reviewVerdicts(view: any): Record<number, 'correct' | 'incorrect' | 'unanswered'> {
  const verdicts: Record<number, 'correct' | 'incorrect' | 'unanswered'> = {};
  for (const question of view.questions) {
    const answer = view.answers.find((a: any) => a.questionId === question.id);
    const answered = !!answer && (
      !!answer.selectedAnswerId || (answer.selectedAnswerIds?.length ?? 0) > 0 || !!answer.textAnswer
    );
    verdicts[question.id] = !answered ? 'unanswered' : answer.isCorrect === true ? 'correct' : 'incorrect';
  }
  return verdicts;
}

function countVerdicts(verdicts: Record<number, string>) {
  const values = Object.values(verdicts);
  return {
    correctAnswersCount: values.filter(v => v === 'correct').length,
    incorrectAnswersCount: values.filter(v => v === 'incorrect').length,
    unansweredCount: values.filter(v => v === 'unanswered').length,
    totalQuestions: values.length
  };
}

/** The results-screen numbers as every other place reports them for the same session */
async function everywhere(userId: number, sessionId: number, type: 'PRACTICE' | 'EXAM') {
  const [shown, view, byType, list] = await Promise.all([
    results(userId, sessionId),
    sessionView(userId, sessionId),
    api().get(`/api/v1/quiz-sessions/type/${type}`).set('Authorization', tokenFor(userId)),
    api().get('/api/v1/quiz-sessions?page=1&limit=50').set('Authorization', tokenFor(userId))
  ]);
  const fields = {
    score: shown.score,
    totalScore20: shown.totalScore20,
    correctAnswersCount: shown.correctAnswersCount,
    incorrectAnswersCount: shown.incorrectAnswersCount,
    unansweredCount: shown.unansweredCount,
    totalQuestions: shown.totalQuestions
  };

  // Review screen: per-question verdicts add up to the results counts
  expect(countVerdicts(reviewVerdicts(view))).toEqual({
    correctAnswersCount: fields.correctAnswersCount,
    incorrectAnswersCount: fields.incorrectAnswersCount,
    unansweredCount: fields.unansweredCount,
    totalQuestions: fields.totalQuestions
  });

  // Analytics
  expect(byType.status).toBe(200);
  const analytics = byType.body.find((s: any) => s.id === sessionId);
  expect(analytics).toMatchObject(fields);

  // GET /quiz-sessions list
  expect(list.status).toBe(200);
  const listed = list.body.data.data.sessions.find((s: any) => s.id === sessionId);
  expect(listed.percentage).toBe(fields.score);
  expect(listed.questionsCount).toBe(fields.totalQuestions);
  expect(listed.answersCount).toBe(fields.totalQuestions - fields.unansweredCount);

  // Practice and exam history: the same score, once something is answered or the session is finished
  const history = await api().get(`/api/v1/students/practise-sessions?sessionType=${type}&page=1&limit=50`).set('Authorization', tokenFor(userId));
  expect(history.status).toBe(200);
  const historyItems = history.body.data?.items ?? history.body.items;
  const hasScore = fields.unansweredCount < fields.totalQuestions || view.status === 'COMPLETED';
  expect(historyItems.find((s: any) => s.id === sessionId).score).toBe(hasScore ? fields.score : null);

  return { fields, verdicts: reviewVerdicts(view), view };
}

const round2 = (value: number) => Math.round(value * 100) / 100;

describe('Session results are the same everywhere', () => {
  it('mixed session with several-correct-answer and unanswered questions, answered one at a time', async () => {
    const all = [single1, single2, multi3, multi2, qroc, untouched];
    const id = await createSession(student, 'PRACTICE', all.map(q => q.id));

    // Answers are saved one question at a time, as the runner does
    await submit(student, id, [{ questionId: single1.id, selectedAnswerId: single1.correct[0] }]);
    await submit(student, id, [{ questionId: single2.id, selectedAnswerId: single2.wrong[0] }]);
    // Two of three correct answers, no wrong one: incorrect, worth 2/3
    await submit(student, id, [{ questionId: multi3.id, selectedAnswerIds: [multi3.correct[0], multi3.correct[1]] }]);
    // Exactly the correct answers
    await submit(student, id, [{ questionId: multi2.id, selectedAnswerIds: [...multi2.correct].reverse() }]);
    // Self-assessed as incorrect
    const last = await submit(student, id, [{ questionId: qroc.id, textAnswer: 'self-assessed-incorrect', isCorrect: false }]);

    const expected = {
      correctAnswersCount: 2,
      incorrectAnswersCount: 3,
      unansweredCount: 1,
      totalQuestions: 6,
      score: round2(((1 + 0 + 2 / 3 + 1 + 0) / 6) * 100),
      totalScore20: Number((((1 + 2 / 3 + 1) / 6) * 20).toFixed(2))
    };
    expect(last).toMatchObject(expected);

    // Every question but one is answered; the session stays open until the student finishes
    expect((await prisma.quizSession.findUnique({ where: { id } }))!.status).toBe(SessionStatus.IN_PROGRESS);

    const before = await everywhere(student, id, 'PRACTICE');
    expect(before.fields).toEqual(expected);
    expect(before.verdicts).toEqual({
      [single1.id]: 'correct',
      [single2.id]: 'incorrect',
      [multi3.id]: 'incorrect',
      [multi2.id]: 'correct',
      [qroc.id]: 'incorrect',
      [untouched.id]: 'unanswered'
    });
    // The review screen gets a boolean verdict for every answered question
    for (const answer of before.view.answers) {
      expect(typeof answer.isCorrect).toBe('boolean');
    }

    await finish(student, id);
    const after = await everywhere(student, id, 'PRACTICE');
    expect(after.fields).toEqual(expected);
    expect(after.verdicts).toEqual(before.verdicts);

    // The stored score is the one shown
    const stored = await prisma.quizSession.findUnique({ where: { id } });
    expect(stored!.status).toBe(SessionStatus.COMPLETED);
    expect(stored!.percentage).toBe(expected.score);

    // Retakes pick questions with the same verdicts
    const expectations: Array<[string, number[]]> = [
      ['INCORRECT_ONLY', [single2.id, multi3.id, qroc.id]],
      ['CORRECT_ONLY', [single1.id, multi2.id]],
      ['NOT_RESPONDED', [untouched.id]]
    ];
    for (const [retakeType, ids] of expectations) {
      const res = await api().post('/api/v1/quiz-sessions/retake').set('Authorization', tokenFor(student)).send({ originalSessionId: id, retakeType });
      expect(res.status).toBe(201);
      const rows = await prisma.quizSessionQuestion.findMany({ where: { sessionId: res.body.data.sessionId }, select: { questionId: true } });
      expect(rows.map(r => r.questionId).sort((a, b) => a - b)).toEqual([...ids].sort((a, b) => a - b));
    }
  });

  it('several correct answers: only the exact set is correct, other selections get partial credit', async () => {
    const [a, b, c] = multi3.correct;
    const [d] = multi3.wrong;
    const cases: Array<{ selected: number[]; correct: boolean; points: number }> = [
      { selected: [a, b, c], correct: true, points: 1 },
      { selected: [c, a, b, a], correct: true, points: 1 },
      { selected: [a, b, c, d], correct: false, points: 2 / 3 },
      { selected: [a], correct: false, points: 1 / 3 },
      { selected: [a, d], correct: false, points: 0 },
      { selected: [d], correct: false, points: 0 }
    ];

    // Each case in a fresh session with the question and one unanswered question
    for (const { selected, correct, points } of cases) {
      const id = await createSession(student, 'PRACTICE', [multi3.id, untouched.id]);
      const res = await submit(student, id, [{ questionId: multi3.id, selectedAnswerIds: selected }]);
      expect(res.results).toEqual([{ questionId: multi3.id, isCorrect: correct }]);
      const expected = {
        correctAnswersCount: correct ? 1 : 0,
        incorrectAnswersCount: correct ? 0 : 1,
        unansweredCount: 1,
        totalQuestions: 2,
        score: round2((points / 2) * 100),
        totalScore20: Number(((points / 2) * 20).toFixed(2))
      };
      await finish(student, id);
      const { fields, verdicts } = await everywhere(student, id, 'PRACTICE');
      expect(fields).toEqual(expected);
      expect(verdicts[multi3.id]).toBe(correct ? 'correct' : 'incorrect');
      expect(verdicts[untouched.id]).toBe('unanswered');
    }
  });

  it('changing an answer changes the results everywhere, never counting a question twice', async () => {
    const id = await createSession(student, 'EXAM', [single1.id, multi2.id, qroc.id]);

    const steps: Array<{ answers: any[]; expected: Record<string, number> }> = [
      {
        answers: [{ questionId: single1.id, selectedAnswerId: single1.wrong[0] }],
        expected: { correctAnswersCount: 0, incorrectAnswersCount: 1, unansweredCount: 2 }
      },
      {
        // Changed to the correct answer
        answers: [{ questionId: single1.id, selectedAnswerId: single1.correct[0] }],
        expected: { correctAnswersCount: 1, incorrectAnswersCount: 0, unansweredCount: 2 }
      },
      {
        answers: [{ questionId: multi2.id, selectedAnswerIds: [multi2.correct[0], multi2.wrong[0]] }],
        expected: { correctAnswersCount: 1, incorrectAnswersCount: 1, unansweredCount: 1 }
      },
      {
        // Changed to exactly the correct answers
        answers: [{ questionId: multi2.id, selectedAnswerIds: multi2.correct }],
        expected: { correctAnswersCount: 2, incorrectAnswersCount: 0, unansweredCount: 1 }
      },
      {
        answers: [{ questionId: qroc.id, textAnswer: 'self-assessed-correct', isCorrect: true }],
        expected: { correctAnswersCount: 3, incorrectAnswersCount: 0, unansweredCount: 0 }
      },
      {
        // Self-assessment changed, and a correct choice changed to a wrong one
        answers: [
          { questionId: qroc.id, textAnswer: 'self-assessed-incorrect', isCorrect: false },
          { questionId: multi2.id, selectedAnswerIds: [multi2.correct[1]] }
        ],
        expected: { correctAnswersCount: 1, incorrectAnswersCount: 2, unansweredCount: 0 }
      }
    ];

    for (const step of steps) {
      const response = await submit(student, id, step.answers);
      expect(response).toMatchObject(step.expected);
      const { fields } = await everywhere(student, id, 'EXAM');
      expect(fields).toMatchObject(step.expected);
      // Still open: every question has an answer after step 5, but the student has not finished
      expect((await prisma.quizSession.findUnique({ where: { id } }))!.status).toBe(SessionStatus.IN_PROGRESS);
    }

    // The single-answer update endpoint agrees too
    const put = await api().put(`/api/v1/quiz-sessions/${id}/questions/${single1.id}/answer`).set('Authorization', tokenFor(student))
      .send({ selectedAnswerId: single1.wrong[1] });
    expect(put.status).toBe(200);
    const { fields } = await everywhere(student, id, 'EXAM');
    expect(fields).toMatchObject({ correctAnswersCount: 0, incorrectAnswersCount: 3, unansweredCount: 0, score: round2(((0 + 0.5 + 0) / 3) * 100) });

    // One stored answer per question
    expect(await prisma.quizAttempt.count({ where: { sessionId: id } })).toBe(2);
    expect(await prisma.multipleChoiceAttempt.count({ where: { sessionId: id } })).toBe(1);
  });

  it('leaving and coming back: saved answers come back and count once; finishing freezes the results', async () => {
    const id = await createSession(student, 'PRACTICE', [single1.id, single2.id, multi3.id, untouched.id]);

    // First visit: two answers, then the student leaves
    await submit(student, id, [{ questionId: single1.id, selectedAnswerId: single1.correct[0] }]);
    await submit(student, id, [{ questionId: multi3.id, selectedAnswerIds: multi3.correct }]);

    // Coming back: the runner rebuilds its answers from GET /quiz-sessions/:id
    const resumed = await sessionView(student, id);
    expect(resumed.status).toBe('IN_PROGRESS');
    const byQuestion = new Map(resumed.answers.map((a: any) => [a.questionId, a]));
    expect(byQuestion.get(single1.id)).toMatchObject({ selectedAnswerId: single1.correct[0], isCorrect: true });
    expect(byQuestion.get(multi3.id)).toMatchObject({ isCorrect: true });
    expect([...(byQuestion.get(multi3.id) as any).selectedAnswerIds].sort()).toEqual([...multi3.correct].sort());

    // Second visit: the runner sends every answer it holds again at the end, with the new ones
    await submit(student, id, [
      { questionId: single1.id, selectedAnswerId: single1.correct[0] },
      { questionId: multi3.id, selectedAnswerIds: multi3.correct },
      { questionId: single2.id, selectedAnswerId: single2.wrong[0] }
    ]);
    // A translation added to answered questions in the meantime changes nothing
    await prisma.question.update({ where: { id: single2.id }, data: { questionTextEn: 'single 2 (en)' } });
    await prisma.questionAnswer.updateMany({ where: { questionId: single2.id }, data: { answerTextEn: 'translated' } });

    await finish(student, id);
    const expected = { correctAnswersCount: 2, incorrectAnswersCount: 1, unansweredCount: 1, totalQuestions: 4, score: 50, totalScore20: 10 };
    const { fields } = await everywhere(student, id, 'PRACTICE');
    expect(fields).toEqual(expected);

    // Answers sent after finishing are refused and change nothing
    const late = await api().post(`/api/v1/students/quiz-sessions/${id}/submit-answer`).set('Authorization', tokenFor(student))
      .send({ answers: [{ questionId: untouched.id, selectedAnswerId: untouched.correct[0] }] });
    expect(late.status).toBe(400);
    expect((await everywhere(student, id, 'PRACTICE')).fields).toEqual(expected);

    // A save that raced with the finish is stored but never reopens the session
    const repository = container.resolve(QuizRepository);
    await repository.saveAnswers(id, [{ kind: 'SINGLE', questionId: untouched.id, selectedAnswerId: untouched.correct[0], isCorrect: true }]);
    expect((await prisma.quizSession.findUnique({ where: { id } }))!.status).toBe(SessionStatus.COMPLETED);
  });

  it('answering every question does not finish the session; the student finishes it', async () => {
    const id = await createSession(student, 'PRACTICE', [single1.id, single2.id]);
    await submit(student, id, [
      { questionId: single1.id, selectedAnswerId: single1.correct[0] },
      { questionId: single2.id, selectedAnswerId: single2.correct[0] }
    ]);
    let session = await prisma.quizSession.findUnique({ where: { id } });
    expect(session!.status).toBe(SessionStatus.IN_PROGRESS);
    expect(session!.completedAt).toBeNull();
    expect(session!.startedAt).not.toBeNull();

    // After a pause the student can still change an answer, then finish
    await submit(student, id, [{ questionId: single2.id, selectedAnswerId: single2.wrong[0] }]);
    await finish(student, id);
    session = await prisma.quizSession.findUnique({ where: { id } });
    expect(session!.status).toBe(SessionStatus.COMPLETED);
    expect(session!.completedAt).not.toBeNull();
    expect((await results(student, id))).toMatchObject({ correctAnswersCount: 1, incorrectAnswersCount: 1, unansweredCount: 0, score: 50 });
  });

  it('finishing without answering: every question is unanswered and the score is 0', async () => {
    const id = await createSession(student, 'EXAM', [single1.id, multi2.id, qroc.id]);
    await finish(student, id);
    const { fields, verdicts } = await everywhere(student, id, 'EXAM');
    expect(fields).toEqual({ correctAnswersCount: 0, incorrectAnswersCount: 0, unansweredCount: 3, totalQuestions: 3, score: 0, totalScore20: 0 });
    expect(Object.values(verdicts)).toEqual(['unanswered', 'unanswered', 'unanswered']);
  });

  it('residency sessions: the residency history shows the results score', async () => {
    const created = await api().post('/api/v1/quizzes/residency-sessions').set('Authorization', tokenFor(resident))
      .send({ title: `${tag} residency`, examYear: 2031, universityId });
    expect(created.status).toBe(201);
    const id = created.body.data.sessionId;
    expect(created.body.data.questionCount).toBe(2);

    await submit(resident, id, [{ questionId: resSingle.id, selectedAnswerId: resSingle.correct[0] }]);
    await submit(resident, id, [{ questionId: resMulti.id, selectedAnswerIds: [resMulti.correct[0]] }]);

    const listed = async () => {
      const res = await api().get('/api/v1/quizzes/residency-sessions-only').set('Authorization', tokenFor(resident));
      expect(res.status).toBe(200);
      return res.body.data.find((s: any) => s.id === id);
    };
    // No score until the session is finished
    expect((await listed()).score).toBeNull();

    await finish(resident, id);
    const shown = await results(resident, id);
    expect(shown).toMatchObject({ correctAnswersCount: 1, incorrectAnswersCount: 1, unansweredCount: 0, score: 75, totalScore20: 15 });
    expect((await listed()).score).toBe(shown.score);

    const analytics = await api().get('/api/v1/quiz-sessions/type/PRACTICE').set('Authorization', tokenFor(resident));
    expect(analytics.body.find((s: any) => s.id === id)).toMatchObject({
      score: 75, totalScore20: 15, correctAnswersCount: 1, incorrectAnswersCount: 1, unansweredCount: 0, totalQuestions: 2
    });
  });

  it('questions keep the same order (and numbers) on every load', async () => {
    const ids = sameRank.map(q => q.id);
    const shuffled = [ids[3], ids[0], ids[5], ids[1], ids[4], ids[2]];
    const id = await createSession(student, 'PRACTICE', [single2.id, ...shuffled]);
    const orders = new Set<string>();
    for (let i = 0; i < 5; i++) {
      orders.add(JSON.stringify((await sessionView(student, id)).questions.map((q: any) => q.id)));
    }
    expect(orders.size).toBe(1);
    // Higher repetition count first, then the order the session was built in
    expect(JSON.parse([...orders][0])).toEqual([...shuffled, single2.id]);
  });

  it('English translations are served with the same answer ids, so either language grades the same', async () => {
    const id = await createSession(student, 'PRACTICE', [single1.id, multi3.id]);
    const view = await sessionView(student, id);
    const question = view.questions.find((q: any) => q.id === multi3.id);
    expect(question.questionTextEn).toBe('multi 3 (en)');
    expect(question.questionAnswers.map((a: any) => a.id)).toEqual(multi3.answers);
    expect(question.questionAnswers.map((a: any) => a.answerTextEn)).toEqual(['A en', 'B en', 'C en', 'D en']);

    await submit(student, id, [
      { questionId: single1.id, selectedAnswerId: single1.correct[0] },
      { questionId: multi3.id, selectedAnswerIds: multi3.correct }
    ]);
    await finish(student, id);
    expect((await everywhere(student, id, 'PRACTICE')).fields).toMatchObject({ correctAnswersCount: 2, score: 100 });
  });
});
