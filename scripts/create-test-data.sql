-- Course Analytics Test Data Creation Script
-- This script creates comprehensive test data for user ID 5053 to validate the course analytics endpoint

-- First, let's check if user 5053 exists, if not create it
INSERT OR IGNORE INTO users (
  id, email, password_hash, full_name, role, university_id, specialty_id, 
  current_year, email_verified, is_active, created_at, updated_at
) VALUES (
  5053, 'test-analytics-5053@example.com', 'hashed_password_123', 
  'Test Analytics User 5053', 'STUDENT', NULL, NULL, 
  'THREE', 1, 1, datetime('now'), datetime('now')
);

-- Create Study Pack
INSERT OR IGNORE INTO study_packs (
  id, name, description, type, year_number, price_per_month, price_per_year, 
  is_active, created_at, updated_at
) VALUES (
  1001, 'Medical Analytics Pack', 'Test pack for course analytics', 'MEDICAL', 
  '3', 50.00, 500.00, 1, datetime('now'), datetime('now')
);

-- Create Unite
INSERT OR IGNORE INTO unites (
  id, study_pack_id, name, description, logo_url, created_at, updated_at
) VALUES (
  2001, 1001, 'Clinical Sciences Unite', 'Advanced clinical sciences for year 3', 
  NULL, datetime('now'), datetime('now')
);

-- Create Module
INSERT OR IGNORE INTO modules (
  id, unite_id, name, description, created_at, updated_at
) VALUES (
  3001, 2001, 'Internal Medicine Module', 'Core internal medicine concepts', 
  datetime('now'), datetime('now')
);

-- Create Courses
INSERT OR IGNORE INTO courses (id, module_id, name, description, created_at, updated_at) VALUES
(4001, 3001, 'Cardiology', 'Study of heart and cardiovascular system', datetime('now'), datetime('now')),
(4002, 3001, 'Pulmonology', 'Study of respiratory system and lung diseases', datetime('now'), datetime('now')),
(4003, 3001, 'Gastroenterology', 'Study of digestive system disorders', datetime('now'), datetime('now'));

-- Create Questions for Cardiology
INSERT OR IGNORE INTO questions (
  id, course_id, question_text, explanation, question_type, 
  university_id, year_level, exam_year, created_by, created_at, updated_at
) VALUES
(5001, 4001, 'What is the normal resting heart rate for adults?', 'Normal resting heart rate is 60-100 bpm', 'SINGLE_CHOICE', NULL, 'THREE', 2024, 5053, datetime('now'), datetime('now')),
(5002, 4001, 'Which chamber of the heart pumps blood to the lungs?', 'Right ventricle pumps deoxygenated blood to lungs', 'SINGLE_CHOICE', NULL, 'THREE', 2024, 5053, datetime('now'), datetime('now')),
(5003, 4001, 'What does ECG stand for?', 'Electrocardiogram records electrical activity of heart', 'SINGLE_CHOICE', NULL, 'THREE', 2024, 5053, datetime('now'), datetime('now'));

-- Create Questions for Pulmonology  
INSERT OR IGNORE INTO questions (
  id, course_id, question_text, explanation, question_type, 
  university_id, year_level, exam_year, created_by, created_at, updated_at
) VALUES
(5004, 4002, 'What is the primary function of alveoli?', 'Alveoli are responsible for gas exchange', 'SINGLE_CHOICE', NULL, 'THREE', 2024, 5053, datetime('now'), datetime('now')),
(5005, 4002, 'Which muscle is primarily responsible for breathing?', 'Diaphragm is the main breathing muscle', 'SINGLE_CHOICE', NULL, 'THREE', 2024, 5053, datetime('now'), datetime('now'));

-- Create Questions for Gastroenterology
INSERT OR IGNORE INTO questions (
  id, course_id, question_text, explanation, question_type, 
  university_id, year_level, exam_year, created_by, created_at, updated_at
) VALUES
(5006, 4003, 'Where does most nutrient absorption occur?', 'Small intestine is primary site of absorption', 'SINGLE_CHOICE', NULL, 'THREE', 2024, 5053, datetime('now'), datetime('now')),
(5007, 4003, 'What enzyme breaks down proteins in the stomach?', 'Pepsin breaks down proteins in acidic environment', 'SINGLE_CHOICE', NULL, 'THREE', 2024, 5053, datetime('now'), datetime('now'));

-- Create Answer Options for all questions
INSERT OR IGNORE INTO question_answers (id, question_id, answer_text, is_correct, explanation, created_at) VALUES
-- Cardiology Q1 answers
(6001, 5001, '60-100 bpm', 1, 'This is the normal range for adults', datetime('now')),
(6002, 5001, '40-60 bpm', 0, 'This is bradycardia', datetime('now')),
(6003, 5001, '100-120 bpm', 0, 'This is tachycardia', datetime('now')),
(6004, 5001, '120-140 bpm', 0, 'This is severe tachycardia', datetime('now')),

-- Cardiology Q2 answers
(6005, 5002, 'Right ventricle', 1, 'Correct - pumps to pulmonary circulation', datetime('now')),
(6006, 5002, 'Left ventricle', 0, 'Pumps to systemic circulation', datetime('now')),
(6007, 5002, 'Right atrium', 0, 'Receives blood from body', datetime('now')),
(6008, 5002, 'Left atrium', 0, 'Receives blood from lungs', datetime('now')),

-- Cardiology Q3 answers
(6009, 5003, 'Electrocardiogram', 1, 'Records electrical activity of heart', datetime('now')),
(6010, 5003, 'Echocardiogram', 0, 'Uses ultrasound to image heart', datetime('now')),
(6011, 5003, 'Electromyogram', 0, 'Records muscle electrical activity', datetime('now')),
(6012, 5003, 'Electroencephalogram', 0, 'Records brain electrical activity', datetime('now')),

-- Pulmonology Q1 answers
(6013, 5004, 'Gas exchange', 1, 'Primary function is O2/CO2 exchange', datetime('now')),
(6014, 5004, 'Air filtration', 0, 'This occurs in upper respiratory tract', datetime('now')),
(6015, 5004, 'Sound production', 0, 'This occurs in larynx', datetime('now')),
(6016, 5004, 'Temperature regulation', 0, 'Not primary function of alveoli', datetime('now')),

-- Pulmonology Q2 answers
(6017, 5005, 'Diaphragm', 1, 'Main muscle of respiration', datetime('now')),
(6018, 5005, 'Intercostal muscles', 0, 'Accessory breathing muscles', datetime('now')),
(6019, 5005, 'Abdominal muscles', 0, 'Used in forced expiration', datetime('now')),
(6020, 5005, 'Scalene muscles', 0, 'Accessory inspiratory muscles', datetime('now')),

-- Gastroenterology Q1 answers
(6021, 5006, 'Small intestine', 1, 'Primary site of nutrient absorption', datetime('now')),
(6022, 5006, 'Large intestine', 0, 'Mainly absorbs water and electrolytes', datetime('now')),
(6023, 5006, 'Stomach', 0, 'Mainly for digestion, limited absorption', datetime('now')),
(6024, 5006, 'Esophagus', 0, 'Transport tube, no absorption', datetime('now')),

-- Gastroenterology Q2 answers
(6025, 5007, 'Pepsin', 1, 'Main protein-digesting enzyme in stomach', datetime('now')),
(6026, 5007, 'Trypsin', 0, 'Pancreatic enzyme', datetime('now')),
(6027, 5007, 'Amylase', 0, 'Breaks down carbohydrates', datetime('now')),
(6028, 5007, 'Lipase', 0, 'Breaks down fats', datetime('now'));

-- Create Quiz Sessions
INSERT OR IGNORE INTO quiz_sessions (
  id, user_id, quiz_id, exam_id, title, type, quiz_type, status, 
  started_at, completed_at, score, percentage, created_at, updated_at
) VALUES
-- Session 1: Mixed topics practice session (high performance)
(7001, 5053, NULL, NULL, 'Internal Medicine Practice Quiz', 'PRACTICE', 'QCM', 'COMPLETED',
 '2025-08-20 14:00:00', '2025-08-20 14:35:00', 6, 85.71, datetime('now'), datetime('now')),

-- Session 2: Cardiology focused exam (moderate performance)  
(7002, 5053, NULL, NULL, 'Cardiology Comprehensive Exam', 'EXAM', 'QCM', 'COMPLETED',
 '2025-08-21 09:00:00', '2025-08-21 10:15:00', 2, 66.67, datetime('now'), datetime('now')),

-- Session 3: Recent practice session (excellent performance)
(7003, 5053, NULL, NULL, 'Quick Review Session', 'PRACTICE', 'QCM', 'COMPLETED',
 '2025-08-25 16:30:00', '2025-08-25 16:50:00', 3, 100.0, datetime('now'), datetime('now'));

-- Create Quiz Session Questions (linking sessions to questions)
INSERT OR IGNORE INTO quiz_session_questions (id, session_id, question_id, created_at) VALUES
-- Session 1: Mixed topics (7 questions total)
(8001, 7001, 5001, datetime('now')), -- Cardiology Q1
(8002, 7001, 5002, datetime('now')), -- Cardiology Q2
(8003, 7001, 5004, datetime('now')), -- Pulmonology Q1
(8004, 7001, 5005, datetime('now')), -- Pulmonology Q2
(8005, 7001, 5006, datetime('now')), -- Gastroenterology Q1
(8006, 7001, 5007, datetime('now')), -- Gastroenterology Q2
(8007, 7001, 5003, datetime('now')), -- Cardiology Q3

-- Session 2: Cardiology focused (3 questions)
(8008, 7002, 5001, datetime('now')), -- Cardiology Q1
(8009, 7002, 5002, datetime('now')), -- Cardiology Q2
(8010, 7002, 5003, datetime('now')), -- Cardiology Q3

-- Session 3: Quick review (3 questions)
(8011, 7003, 5004, datetime('now')), -- Pulmonology Q1
(8012, 7003, 5006, datetime('now')), -- Gastroenterology Q1
(8013, 7003, 5001, datetime('now')); -- Cardiology Q1

-- Create Quiz Attempts (student answers)
INSERT OR IGNORE INTO quiz_attempts (
  id, session_id, question_id, selected_answer_id, isCorrect, answered_at, created_at
) VALUES
-- Session 1 attempts (6 correct out of 7 = 85.71%)
(9001, 7001, 5001, 6001, 1, '2025-08-20 14:05:00', datetime('now')), -- Correct
(9002, 7001, 5002, 6005, 1, '2025-08-20 14:10:00', datetime('now')), -- Correct
(9003, 7001, 5004, 6013, 1, '2025-08-20 14:15:00', datetime('now')), -- Correct
(9004, 7001, 5005, 6017, 1, '2025-08-20 14:20:00', datetime('now')), -- Correct
(9005, 7001, 5006, 6021, 1, '2025-08-20 14:25:00', datetime('now')), -- Correct
(9006, 7001, 5007, 6026, 0, '2025-08-20 14:30:00', datetime('now')), -- Incorrect (chose Trypsin instead of Pepsin)
(9007, 7001, 5003, 6009, 1, '2025-08-20 14:33:00', datetime('now')), -- Correct

-- Session 2 attempts (2 correct out of 3 = 66.67%)
(9008, 7002, 5001, 6002, 0, '2025-08-21 09:15:00', datetime('now')), -- Incorrect (chose 40-60 bpm)
(9009, 7002, 5002, 6005, 1, '2025-08-21 09:45:00', datetime('now')), -- Correct
(9010, 7002, 5003, 6009, 1, '2025-08-21 10:10:00', datetime('now')), -- Correct

-- Session 3 attempts (3 correct out of 3 = 100%)
(9011, 7003, 5004, 6013, 1, '2025-08-25 16:35:00', datetime('now')), -- Correct
(9012, 7003, 5006, 6021, 1, '2025-08-25 16:42:00', datetime('now')), -- Correct
(9013, 7003, 5001, 6001, 1, '2025-08-25 16:48:00', datetime('now')); -- Correct

-- Summary of test data:
-- User 5053 has 3 completed quiz sessions
-- Session 1: 7 questions (3 Cardiology, 2 Pulmonology, 2 Gastroenterology) - 85.71% score
-- Session 2: 3 questions (3 Cardiology) - 66.67% score
-- Session 3: 3 questions (1 Cardiology, 1 Pulmonology, 1 Gastroenterology) - 100% score
--
-- Course performance across all sessions:
-- Cardiology: 5 questions total, 4 correct (80% accuracy)
-- Pulmonology: 3 questions total, 3 correct (100% accuracy)
-- Gastroenterology: 3 questions total, 2 correct (66.67% accuracy)
