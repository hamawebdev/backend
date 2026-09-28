import { PrismaClient } from "@prisma/client";

/**
 * Score of one session, computed from its stored answers. Every screen that shows
 * a session's results (results, review, history, analytics) reads these numbers,
 * so they always agree.
 */
export type SessionStats = {
  totalQuestions: number;
  /** Questions with an answer: a selected option, selected options or a text */
  answeredCount: number;
  /** Answered questions whose answer is fully correct */
  correctCount: number;
  /** Points: 1 per correct answer plus the partial credit of multiple-choice answers */
  score: number;
  /** score / totalQuestions as a percentage, 2 decimals */
  percentage: number;
};

type SingleAttemptRow = {
  sessionId: number;
  questionId: number;
  isCorrect: boolean | null;
};

type MultipleAttemptRow = {
  sessionId: number;
  questionId: number;
  isCorrect: boolean | null;
  partialScore: number | null;
  selectedAnswerIds: string;
};

/**
 * Outcome of each answered question of a session, from its stored attempts.
 * - A question is answered when it has a single-choice or QROC attempt with a
 *   selected answer or a text, or a multiple-choice attempt with at least one
 *   selected answer. Questions without such an attempt are unanswered.
 * - A correct answer is worth 1 point. A multiple-choice answer that is not
 *   fully correct is worth its partial score: (correct selections - wrong
 *   selections) / correct answers, at least 0. It still counts as incorrect.
 * - A question counts once (its best attempt), and only when it belongs to the
 *   session.
 */
export function answeredQuestionOutcomes(
  questionIds: number[],
  singleAttempts: Array<Omit<SingleAttemptRow, 'sessionId'>>,
  multipleAttempts: Array<Omit<MultipleAttemptRow, 'sessionId'>>
): Map<number, { points: number; correct: boolean }> {
  const inSession = new Set(questionIds);
  const best = new Map<number, { points: number; correct: boolean }>();
  const record = (questionId: number, points: number, correct: boolean) => {
    if (!inSession.has(questionId)) return;
    const current = best.get(questionId);
    if (!current || points > current.points || (points === current.points && correct && !current.correct)) {
      best.set(questionId, { points, correct });
    }
  };

  for (const attempt of singleAttempts) {
    record(attempt.questionId, attempt.isCorrect ? 1 : 0, attempt.isCorrect === true);
  }
  for (const attempt of multipleAttempts) {
    if (!hasSelection(attempt.selectedAnswerIds)) continue;
    const points = attempt.isCorrect
      ? 1
      : (attempt.partialScore && attempt.partialScore > 0 ? attempt.partialScore : 0);
    record(attempt.questionId, points, attempt.isCorrect === true);
  }
  return best;
}

/** Score a session from its question ids and stored attempts (see answeredQuestionOutcomes) */
export function computeSessionStats(
  questionIds: number[],
  singleAttempts: Array<Omit<SingleAttemptRow, 'sessionId'>>,
  multipleAttempts: Array<Omit<MultipleAttemptRow, 'sessionId'>>
): SessionStats {
  const outcomes = answeredQuestionOutcomes(questionIds, singleAttempts, multipleAttempts);

  let score = 0;
  let correctCount = 0;
  for (const outcome of outcomes.values()) {
    score += outcome.points;
    if (outcome.correct) correctCount++;
  }
  const totalQuestions = new Set(questionIds).size;
  const percentage = totalQuestions > 0 ? Math.round((score / totalQuestions) * 100 * 100) / 100 : 0;

  return { totalQuestions, answeredCount: outcomes.size, correctCount, score, percentage };
}

/** True when a stored selected_answer_ids value holds at least one id */
function hasSelection(selectedAnswerIds: string | null): boolean {
  if (!selectedAnswerIds) return false;
  try {
    const ids = JSON.parse(selectedAnswerIds);
    return Array.isArray(ids) && ids.length > 0;
  } catch {
    return false;
  }
}

/** Question ids and stored attempts of several sessions, grouped by session */
async function loadSessionAnswers(prisma: PrismaClient, ids: number[]) {
  const [sessionQuestions, singleAttempts, multipleAttempts] = await Promise.all([
    prisma.quizSessionQuestion.findMany({
      where: { sessionId: { in: ids } },
      select: { sessionId: true, questionId: true }
    }),
    prisma.quizAttempt.findMany({
      where: {
        sessionId: { in: ids },
        OR: [{ selectedAnswerId: { not: null } }, { textAnswer: { not: null } }]
      },
      select: { sessionId: true, questionId: true, isCorrect: true }
    }),
    prisma.multipleChoiceAttempt.findMany({
      where: { sessionId: { in: ids } },
      select: { sessionId: true, questionId: true, isCorrect: true, partialScore: true, selectedAnswerIds: true }
    })
  ]);

  const bySession = <T extends { sessionId: number }>(rows: T[]) => {
    const grouped = new Map<number, T[]>();
    for (const row of rows) {
      const list = grouped.get(row.sessionId);
      if (list) list.push(row);
      else grouped.set(row.sessionId, [row]);
    }
    return grouped;
  };
  const questionsBySession = bySession(sessionQuestions);
  const singleBySession = bySession(singleAttempts);
  const multipleBySession = bySession(multipleAttempts);

  return (id: number) => ({
    questionIds: (questionsBySession.get(id) ?? []).map(row => row.questionId),
    singleAttempts: singleBySession.get(id) ?? [],
    multipleAttempts: multipleBySession.get(id) ?? []
  });
}

/** Stats of several sessions in three queries; sessions without questions get zeros */
export async function loadSessionStats(
  prisma: PrismaClient,
  sessionIds: number[]
): Promise<Map<number, SessionStats>> {
  const ids = Array.from(new Set(sessionIds));
  const stats = new Map<number, SessionStats>();
  if (ids.length === 0) {
    return stats;
  }

  const answersOf = await loadSessionAnswers(prisma, ids);
  for (const id of ids) {
    const { questionIds, singleAttempts, multipleAttempts } = answersOf(id);
    stats.set(id, computeSessionStats(questionIds, singleAttempts, multipleAttempts));
  }
  return stats;
}

/** Outcome of each answered question of one session (see answeredQuestionOutcomes) */
export async function loadQuestionOutcomes(
  prisma: PrismaClient,
  sessionId: number
): Promise<Map<number, { points: number; correct: boolean }>> {
  const { questionIds, singleAttempts, multipleAttempts } = (await loadSessionAnswers(prisma, [sessionId]))(sessionId);
  return answeredQuestionOutcomes(questionIds, singleAttempts, multipleAttempts);
}

/**
 * Results fields shared by submit-answer, results, history and analytics:
 * score is the percentage, totalScore20 the score out of 20
 */
export function formatSessionStats(stats: SessionStats) {
  const totalScore20 = stats.totalQuestions > 0
    ? Number(((stats.score / stats.totalQuestions) * 20).toFixed(2))
    : 0;

  return {
    score: stats.percentage,
    totalScore20,
    correctAnswersCount: stats.correctCount,
    incorrectAnswersCount: stats.answeredCount - stats.correctCount,
    unansweredCount: stats.totalQuestions - stats.answeredCount,
    totalQuestions: stats.totalQuestions
  };
}
