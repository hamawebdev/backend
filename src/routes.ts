import { Router } from "express";
import authRoutes from './modules/auth/auth.routes';
import quizRoutes from './modules/quizzes/quiz.routes';
import quizSessionRoutes from './modules/quizzes/quiz-session.routes';
import examRoutes from './modules/exams/exam.routes';
import studentRoutes from './modules/students/student.routes';
import contentRoutes from './modules/students/content.routes';
import adminRoutes from './modules/admin/admin.routes';
import mediaRoutes from './modules/media/media.routes';
import paymentsRoutes from './modules/payments/payments.routes';

const router = Router();

// Health check endpoint for Docker
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'medcin-backend'
  });
});

// Mount routes
router.use('/auth', authRoutes);
router.use('/media', mediaRoutes); // Media file serving - MUST be before content routes to avoid auth middleware
router.use('/quizzes', quizRoutes);
router.use('/quiz-sessions', quizSessionRoutes);
router.use('/exams', examRoutes);
router.use('/students', studentRoutes);
router.use('/', contentRoutes); // Study packs and course resources at root level
router.use('/admin', adminRoutes);
router.use('/payments', paymentsRoutes); // Payments routes

export default router;