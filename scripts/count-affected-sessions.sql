-- Read-only: counts past quiz sessions affected by the session-results bugs fixed in
-- "Session results: one score everywhere; a session ends when the student finishes".
-- Nothing is written (read-only transaction, rolled back). Run with:
--   psql "$DATABASE_URL" -f scripts/count-affected-sessions.sql
--
-- Recomputed numbers use the rules of src/modules/quizzes/session-stats.ts: a question is
-- answered when it has a selected answer, selected answers or a text; it counts once (its best
-- attempt); a multiple-choice answer that is not exactly right earns its partial score.

BEGIN TRANSACTION READ ONLY;

WITH answered AS (
  SELECT a.session_id, a.question_id,
         CASE WHEN a."isCorrect" THEN 1.0 ELSE 0.0 END AS points,
         COALESCE(a."isCorrect", false) AS correct
  FROM quiz_attempts a
  WHERE a.selected_answer_id IS NOT NULL OR a.text_answer IS NOT NULL
  UNION ALL
  SELECT m.session_id, m.question_id,
         CASE WHEN m."isCorrect" THEN 1.0 ELSE GREATEST(COALESCE(m.partial_score, 0), 0) END,
         COALESCE(m."isCorrect", false)
  FROM multiple_choice_attempts m
  WHERE m.selected_answer_ids IS NOT NULL AND m.selected_answer_ids NOT IN ('', '[]')
),
best AS (
  SELECT x.session_id, x.question_id, MAX(x.points) AS points, BOOL_OR(x.correct) AS correct
  FROM answered x
  JOIN quiz_session_questions sq ON sq.session_id = x.session_id AND sq.question_id = x.question_id
  GROUP BY x.session_id, x.question_id
),
totals AS (
  SELECT session_id, COUNT(*) AS total FROM quiz_session_questions GROUP BY session_id
),
recomputed AS (
  SELECT s.id AS session_id, s.user_id, s.status, s.score AS stored_score, s.percentage AS stored_percentage,
         COALESCE(t.total, 0) AS total_questions,
         COUNT(b.question_id) AS answered,
         COALESCE(SUM(b.points), 0) AS score,
         CASE WHEN COALESCE(t.total, 0) > 0 THEN ROUND((COALESCE(SUM(b.points), 0) / t.total * 100)::numeric, 2) ELSE 0 END AS percentage
  FROM quiz_sessions s
  LEFT JOIN totals t ON t.session_id = s.id
  LEFT JOIN best b ON b.session_id = s.id
  GROUP BY s.id, s.user_id, s.status, s.score, s.percentage, t.total
),
-- Stored verdict of each multiple-choice attempt against today's answer key (exact set)
mc_selected AS (
  SELECT m.id, m.session_id, m.question_id, m."isCorrect" AS is_correct, e.value::int AS answer_id
  FROM multiple_choice_attempts m
  CROSS JOIN LATERAL jsonb_array_elements_text(
    CASE WHEN m.selected_answer_ids ~ '^\s*\[' THEN m.selected_answer_ids::jsonb ELSE '[]'::jsonb END
  ) e
),
mc_attempts AS (
  SELECT id, session_id, question_id, BOOL_OR(COALESCE(is_correct, false)) AS stored_correct,
         ARRAY_AGG(DISTINCT answer_id ORDER BY answer_id) AS selected_ids
  FROM mc_selected GROUP BY id, session_id, question_id
),
mc_keys AS (
  SELECT question_id, ARRAY_AGG(id ORDER BY id) AS correct_ids
  FROM question_answers WHERE is_correct GROUP BY question_id
),
mc_mismatch AS (
  SELECT p.session_id
  FROM mc_attempts p LEFT JOIN mc_keys k ON k.question_id = p.question_id
  WHERE p.stored_correct <> (k.correct_ids IS NOT NULL AND p.selected_ids = k.correct_ids)
),
sc_mismatch AS (
  SELECT a.session_id
  FROM quiz_attempts a
  JOIN questions qu ON qu.id = a.question_id AND qu.question_type = 'SINGLE_CHOICE'
  JOIN question_answers qa ON qa.id = a.selected_answer_id
  WHERE COALESCE(a."isCorrect", false) <> qa.is_correct
),
mc_as_single AS (
  SELECT a.session_id
  FROM quiz_attempts a
  JOIN questions qu ON qu.id = a.question_id AND qu.question_type = 'MULTIPLE_CHOICE'
  WHERE a.selected_answer_id IS NOT NULL
),
both_tables AS (
  SELECT a.session_id
  FROM quiz_attempts a
  JOIN multiple_choice_attempts m ON m.session_id = a.session_id AND m.question_id = a.question_id
  WHERE (a.selected_answer_id IS NOT NULL OR a.text_answer IS NOT NULL)
    AND m.selected_answer_ids NOT IN ('', '[]')
),
placeholders AS (
  SELECT session_id FROM quiz_attempts WHERE selected_answer_id IS NULL AND text_answer IS NULL
),
counted AS (
  SELECT 1 AS n, session_id FROM recomputed
  UNION ALL SELECT 2, session_id FROM recomputed WHERE status = 'COMPLETED' AND answered < total_questions
  UNION ALL SELECT 3, session_id FROM recomputed
    WHERE ABS(stored_percentage - percentage) >= 0.01 OR ABS(stored_score - score) >= 0.0001
  UNION ALL SELECT 4, session_id FROM sc_mismatch
  UNION ALL SELECT 5, session_id FROM mc_mismatch
  UNION ALL SELECT 6, session_id FROM mc_as_single
  UNION ALL SELECT 7, session_id FROM both_tables
  UNION ALL SELECT 8, session_id FROM placeholders
),
categories (n, what) AS (VALUES
  (1, 'All sessions: the analytics page showed 0 questions, 0 correct and 0 wrong for each'),
  (2, 'Completed sessions with unanswered questions: the review page showed those as Incorrect'),
  (3, 'Stored score differs from the score the stored answers give (analytics showed the stored one)'),
  (4, 'A single-choice verdict disagrees with the answer key (old first-correct-answer rule, or key edited since)'),
  (5, 'A multiple-choice verdict disagrees with the answer key (key edited since the answer)'),
  (6, 'A multiple-choice question stored as a single answer (graded with the single-choice rule)'),
  (7, 'A question answered in both answer tables (counted twice by the old scoring)'),
  (8, 'Empty placeholder answer rows (written at session creation by the old code)')
)
SELECT k.n, k.what, COUNT(DISTINCT c.session_id) AS sessions, COUNT(DISTINCT s.user_id) AS students
FROM categories k
LEFT JOIN counted c ON c.n = k.n
LEFT JOIN quiz_sessions s ON s.id = c.session_id
GROUP BY k.n, k.what
ORDER BY k.n;

-- Sessions per status and type, for context
SELECT status, type, COUNT(*) AS sessions FROM quiz_sessions GROUP BY status, type ORDER BY status, type;

ROLLBACK;
