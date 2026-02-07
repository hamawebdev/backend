-- Course Analytics Validation Query
-- This query replicates the logic used in the course analytics API endpoint
-- to validate that the API calculations are correct

-- Main query that shows session and course analytics
SELECT
  qs.id as session_id,
  qs.title as session_title,
  qs.type as session_type,
  qs.status as session_status,
  qs.completed_at,
  qs.percentage as session_percentage,
  -- Calculate time spent in minutes
  CASE
    WHEN qs.started_at IS NOT NULL AND qs.completed_at IS NOT NULL
    THEN ROUND((julianday(qs.completed_at) - julianday(qs.started_at)) * 24 * 60, 2)
    ELSE 0
  END as time_spent_minutes,
  -- Count total questions in session
  (SELECT COUNT(*) FROM quiz_session_questions qsq WHERE qsq.session_id = qs.id) as total_questions,
  -- Count correct answers
  (SELECT COUNT(*) FROM quiz_attempts qa WHERE qa.session_id = qs.id AND qa.isCorrect = 1) as correct_answers,
  -- Count incorrect answers
  (SELECT COUNT(*) FROM quiz_attempts qa WHERE qa.session_id = qs.id AND qa.isCorrect = 0) as incorrect_answers,
  -- Average time per question
  CASE
    WHEN (SELECT COUNT(*) FROM quiz_session_questions qsq WHERE qsq.session_id = qs.id) > 0
    THEN ROUND((CASE
      WHEN qs.started_at IS NOT NULL AND qs.completed_at IS NOT NULL
      THEN (julianday(qs.completed_at) - julianday(qs.started_at)) * 24 * 60
      ELSE 0
    END) / (SELECT COUNT(*) FROM quiz_session_questions qsq WHERE qsq.session_id = qs.id), 2)
    ELSE 0
  END as avg_time_per_question,
  -- Course information
  c.id as course_id,
  c.name as course_name,
  c.description as course_description,
  c.module_id,
  m.name as module_name,
  -- Course-specific analytics
  COUNT(DISTINCT qsq.question_id) as course_total_questions,
  COUNT(CASE WHEN qa.isCorrect = 1 THEN 1 END) as course_correct_answers,
  COUNT(CASE WHEN qa.isCorrect = 0 THEN 1 END) as course_incorrect_answers,
  CASE
    WHEN COUNT(DISTINCT qsq.question_id) > 0
    THEN ROUND((COUNT(CASE WHEN qa.isCorrect = 1 THEN 1 END) * 100.0) / COUNT(DISTINCT qsq.question_id), 2)
    ELSE 0
  END as course_accuracy
FROM quiz_sessions qs
JOIN quiz_session_questions qsq ON qs.id = qsq.session_id
JOIN questions q ON qsq.question_id = q.id
JOIN courses c ON q.course_id = c.id
JOIN modules m ON c.module_id = m.id
LEFT JOIN quiz_attempts qa ON qs.id = qa.session_id AND qa.question_id = q.id
WHERE qs.user_id = 5053
  AND qs.completed_at IS NOT NULL
GROUP BY qs.id, qs.title, qs.type, qs.status, qs.completed_at, qs.percentage,
         qs.started_at, c.id, c.name, c.description, c.module_id, m.name
ORDER BY qs.id DESC, c.id;

-- Additional validation queries

-- Session summaries
SELECT
  'SESSION_SUMMARY' as query_type,
  qs.id as session_id,
  qs.title,
  qs.type,
  COUNT(DISTINCT qsq.question_id) as total_questions,
  COUNT(CASE WHEN qa.isCorrect = 1 THEN 1 END) as correct_answers,
  COUNT(CASE WHEN qa.isCorrect = 0 THEN 1 END) as incorrect_answers,
  qs.percentage,
  ROUND((julianday(qs.completed_at) - julianday(qs.started_at)) * 24 * 60, 2) as time_spent_minutes,
  COUNT(DISTINCT c.id) as courses_involved
FROM quiz_sessions qs
JOIN quiz_session_questions qsq ON qs.id = qsq.session_id
JOIN questions q ON qsq.question_id = q.id
JOIN courses c ON q.course_id = c.id
LEFT JOIN quiz_attempts qa ON qs.id = qa.session_id AND qa.question_id = q.id
WHERE qs.user_id = 5053 AND qs.completed_at IS NOT NULL
GROUP BY qs.id, qs.title, qs.type, qs.percentage, qs.started_at, qs.completed_at
ORDER BY qs.id DESC;

-- Course performance across all sessions
SELECT
  'COURSE_SUMMARY' as query_type,
  c.id as course_id,
  c.name as course_name,
  m.name as module_name,
  COUNT(DISTINCT qsq.question_id) as total_questions,
  COUNT(CASE WHEN qa.isCorrect = 1 THEN 1 END) as total_correct,
  COUNT(CASE WHEN qa.isCorrect = 0 THEN 1 END) as total_incorrect,
  ROUND((COUNT(CASE WHEN qa.isCorrect = 1 THEN 1 END) * 100.0) / COUNT(DISTINCT qsq.question_id), 2) as overall_accuracy,
  COUNT(DISTINCT qs.id) as sessions_appeared_in
FROM quiz_sessions qs
JOIN quiz_session_questions qsq ON qs.id = qsq.session_id
JOIN questions q ON qsq.question_id = q.id
JOIN courses c ON q.course_id = c.id
JOIN modules m ON c.module_id = m.id
LEFT JOIN quiz_attempts qa ON qs.id = qa.session_id AND qa.question_id = q.id
WHERE qs.user_id = 5053 AND qs.completed_at IS NOT NULL
GROUP BY c.id, c.name, m.name
ORDER BY c.id;
