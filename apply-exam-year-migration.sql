-- Apply examYear field migration to questions table
-- Run this SQL script on your database

-- Add the examYear column to questions table
ALTER TABLE questions ADD COLUMN exam_year INTEGER;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_questions_exam_year ON questions(exam_year);
CREATE INDEX IF NOT EXISTS idx_questions_university_exam_year ON questions(university_id, exam_year);

-- Populate examYear from related exam records where examId exists
UPDATE questions 
SET exam_year = (
    SELECT year 
    FROM exams 
    WHERE exams.id = questions.exam_id
)
WHERE exam_id IS NOT NULL;
