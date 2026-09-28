import { BadRequestError, ConflictError } from "../../core/errors/AppError";
import { TransactionClient } from "../../types/prisma.types";

export type SubmittedAnswer = {
  id?: number;
  answerText?: string;
  isCorrect?: boolean;
  explanation?: string | null;
};

/**
 * Bring a question's answers in line with a submitted list, inside the caller's
 * transaction:
 * - an answer with an id updates that answer (the id must belong to the question)
 * - an answer without an id is created
 * - an existing answer missing from the list is deleted, unless students have
 *   chosen it in a session; then the whole update is refused with 409 so their
 *   recorded answers keep pointing at it.
 * - every listed answer takes its index in the list as its position, so the
 *   answers are displayed in the submitted order
 *
 * Answer ids therefore stay stable across edits, which keeps past attempts,
 * multiple-choice selections and per-answer explanation images intact.
 */
export async function syncQuestionAnswers(
  tx: TransactionClient,
  questionId: number,
  submitted: SubmittedAnswer[]
): Promise<void> {
  const existing = await tx.questionAnswer.findMany({
    where: { questionId },
    select: { id: true }
  });
  const existingIds = new Set(existing.map(answer => answer.id));

  const keptIds = new Set<number>();
  for (const answer of submitted) {
    if (answer.id === undefined || answer.id === null) continue;
    if (!existingIds.has(answer.id)) {
      throw new BadRequestError(`Answer ${answer.id} does not belong to question ${questionId}`);
    }
    if (keptIds.has(answer.id)) {
      throw new BadRequestError(`Answer ${answer.id} is listed more than once`);
    }
    keptIds.add(answer.id);
  }

  const removedIds = [...existingIds].filter(id => !keptIds.has(id));
  if (removedIds.length > 0) {
    const usedIds = await findAnswersUsedInAttempts(tx, questionId, removedIds);
    if (usedIds.length > 0) {
      throw new ConflictError(
        `Answer(s) ${usedIds.join(', ')} of question ${questionId} were chosen by students and cannot be removed. ` +
        `Keep them in the list (with their id) and edit their text instead.`
      );
    }
    await tx.questionAnswer.deleteMany({ where: { id: { in: removedIds }, questionId } });
  }

  for (const [position, answer] of submitted.entries()) {
    if (answer.id !== undefined && answer.id !== null) {
      await tx.questionAnswer.update({
        where: { id: answer.id },
        data: {
          ...(answer.answerText !== undefined ? { answerText: answer.answerText } : {}),
          ...(answer.isCorrect !== undefined ? { isCorrect: answer.isCorrect } : {}),
          ...(answer.explanation !== undefined ? { explanation: answer.explanation } : {}),
          position
        }
      });
    } else {
      await tx.questionAnswer.create({
        data: {
          questionId,
          answerText: answer.answerText || '',
          isCorrect: answer.isCorrect || false,
          explanation: answer.explanation || null,
          position
        }
      });
    }
  }
}

/** Ids among answerIds that a student selected (single choice or multiple choice) */
export async function findAnswersUsedInAttempts(
  tx: TransactionClient,
  questionId: number,
  answerIds: number[]
): Promise<number[]> {
  const used = new Set<number>();

  const singleChoice = await tx.quizAttempt.findMany({
    where: { questionId, selectedAnswerId: { in: answerIds } },
    select: { selectedAnswerId: true },
    distinct: ['selectedAnswerId']
  });
  singleChoice.forEach(attempt => {
    if (attempt.selectedAnswerId !== null) used.add(attempt.selectedAnswerId);
  });

  const multipleChoice = await tx.multipleChoiceAttempt.findMany({
    where: { questionId },
    select: { selectedAnswerIds: true }
  });
  const candidates = new Set(answerIds);
  for (const attempt of multipleChoice) {
    let selected: unknown;
    try {
      selected = JSON.parse(attempt.selectedAnswerIds);
    } catch {
      continue;
    }
    if (Array.isArray(selected)) {
      selected.forEach(id => {
        const numericId = Number(id);
        if (candidates.has(numericId)) used.add(numericId);
      });
    }
  }

  return [...used].sort((a, b) => a - b);
}
