import { Prisma } from "@prisma/client";

/**
 * Order in which a question's answers are listed everywhere (students and
 * admins): by position, then by id. Answers without a position (created before
 * positions existed) sort after positioned ones, in creation order.
 */
export const ANSWER_ORDER: Prisma.QuestionAnswerOrderByWithRelationInput[] = [
  { position: 'asc' },
  { id: 'asc' }
];

/**
 * Students only ever see published questions: unpublished ones (for example
 * imported questions without a usable answer key) are left out of every
 * student pool and count, and stay visible to admins.
 */
export const PUBLISHED_QUESTION = { isPublished: true } as const;
