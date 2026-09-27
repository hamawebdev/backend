import { Router } from "express";
import { container } from "tsyringe";
import PrismaService from "./config/db";
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

// Health check endpoint for Docker: healthy only when the database answers
router.get('/health', async (req, res) => {
  const prisma = container.resolve(PrismaService).getClient();
  let database = 'up';
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), 3000);
      }),
    ]);
  } catch {
    database = 'down';
  } finally {
    clearTimeout(timer);
  }
  res.set('Cache-Control', 'no-store');
  res.status(database === 'up' ? 200 : 503).json({
    status: database === 'up' ? 'healthy' : 'unhealthy',
    database,
    commit: process.env.GIT_SHA || 'unknown',
    timestamp: new Date().toISOString(),
    service: 'medadn-backend'
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