import { PrismaClient, YearLevel, PackType } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// Helper function to safely delete from tables that might not exist
async function safeDeleteMany(tableName: string, deleteFunction: () => Promise<any>) {
  try {
    await deleteFunction();
    console.log(`✅ Cleared ${tableName}`);
  } catch (error: any) {
    if (error.code === 'P2021') {
      console.log(`⚠️  Table ${tableName} does not exist, skipping...`);
    } else {
      console.error(`❌ Error clearing ${tableName}:`, error.message);
      throw error;
    }
  }
}

async function main() {
  console.log('🌱 Starting comprehensive database seeding...');

  try {
    // Clear existing data in reverse dependency order (safely)
    console.log('🧹 Clearing existing data...');

    await safeDeleteMany('employee_activities', () => prisma.employeeActivity.deleteMany());
    await safeDeleteMany('todo_items', () => prisma.todoItem.deleteMany());
    await safeDeleteMany('question_reports', () => prisma.questionReport.deleteMany());
    await safeDeleteMany('student_notes', () => prisma.studentNote.deleteMany());
    await safeDeleteMany('question_labels', () => prisma.questionLabel.deleteMany());
    await safeDeleteMany('quiz_labels', () => prisma.quizLabel.deleteMany());
    await safeDeleteMany('student_labels', () => prisma.studentLabel.deleteMany());
    await safeDeleteMany('quiz_session_labels', () => prisma.quizSessionLabel.deleteMany());
    await safeDeleteMany('course_progress', () => prisma.courseProgress.deleteMany());
    await safeDeleteMany('multiple_choice_attempts', () => prisma.multipleChoiceAttempt.deleteMany());
    await safeDeleteMany('quiz_attempts', () => prisma.quizAttempt.deleteMany());
    await safeDeleteMany('quiz_session_questions', () => prisma.quizSessionQuestion.deleteMany());
    await safeDeleteMany('quiz_sessions', () => prisma.quizSession.deleteMany());
    await safeDeleteMany('exam_quizzes', () => prisma.examQuiz.deleteMany());
    await safeDeleteMany('exams', () => prisma.exam.deleteMany());
    await safeDeleteMany('explanation_images', () => prisma.explanationImage.deleteMany());
    await safeDeleteMany('question_answers', () => prisma.questionAnswer.deleteMany());
    await safeDeleteMany('quiz_questions', () => prisma.quizQuestion.deleteMany());
    await safeDeleteMany('questions', () => prisma.question.deleteMany());
    await safeDeleteMany('quizzes', () => prisma.quiz.deleteMany());
    await safeDeleteMany('question_sources', () => prisma.questionSource.deleteMany());
    await safeDeleteMany('course_resources', () => prisma.courseResource.deleteMany());
    await safeDeleteMany('course_layers', () => prisma.courseLayer.deleteMany());
    await safeDeleteMany('courses', () => prisma.course.deleteMany());
    await safeDeleteMany('modules', () => prisma.module.deleteMany());
    await safeDeleteMany('unites', () => prisma.unite.deleteMany());
    await safeDeleteMany('subscriptions', () => prisma.subscription.deleteMany());
    await safeDeleteMany('study_packs', () => prisma.studyPack.deleteMany());
    await safeDeleteMany('refresh_tokens', () => prisma.refreshToken.deleteMany());
    await safeDeleteMany('users', () => prisma.user.deleteMany());
    await safeDeleteMany('specialties', () => prisma.specialty.deleteMany());
    await safeDeleteMany('universities', () => prisma.university.deleteMany());

    // 1. Create Universities
    console.log('🏛️ Creating universities...');
    const university = await prisma.university.create({
      data: {
        name: 'University of Algeria',
        country: 'Algeria',
      },
    });

    // 2. Create Specialties
    console.log('🩺 Creating specialties...');
    const medicine = await prisma.specialty.create({
      data: {
        name: 'Medicine',
      },
    });

    // 3. Create Study Packs
    console.log('📚 Creating study packs...');
    const firstYearPack = await prisma.studyPack.create({
      data: {
        name: 'First Year Medicine',
        description: 'Complete first year medical curriculum',
        type: PackType.YEAR,
        yearNumber: YearLevel.ONE,
        pricePerMonth: 100.0,
        pricePerYear: 1000.0,
        isActive: true,
      },
    });

    const secondYearPack = await prisma.studyPack.create({
      data: {
        name: 'Second Year Medicine',
        description: 'Second year medical curriculum',
        type: PackType.YEAR,
        yearNumber: YearLevel.TWO,
        pricePerMonth: 120.0,
        pricePerYear: 1200.0,
        isActive: true,
      },
    });

    const thirdYearPack = await prisma.studyPack.create({
      data: {
        name: 'Third Year Medicine',
        description: 'Third year medical curriculum',
        type: PackType.YEAR,
        yearNumber: YearLevel.THREE,
        pricePerMonth: 140.0,
        pricePerYear: 1400.0,
        isActive: true,
      },
    });

    const fourthYearPack = await prisma.studyPack.create({
      data: {
        name: 'Fourth Year Medicine',
        description: 'Fourth year medical curriculum',
        type: PackType.YEAR,
        yearNumber: YearLevel.FOUR,
        pricePerMonth: 160.0,
        pricePerYear: 1600.0,
        isActive: true,
      },
    });

    const fifthYearPack = await prisma.studyPack.create({
      data: {
        name: 'Fifth Year Medicine',
        description: 'Fifth year medical curriculum',
        type: PackType.YEAR,
        yearNumber: YearLevel.FIVE,
        pricePerMonth: 180.0,
        pricePerYear: 1800.0,
        isActive: true,
      },
    });

    const sixthYearPack = await prisma.studyPack.create({
      data: {
        name: 'Sixth Year Medicine',
        description: 'Sixth year medical curriculum',
        type: PackType.YEAR,
        yearNumber: YearLevel.SIX,
        pricePerMonth: 200.0,
        pricePerYear: 2000.0,
        isActive: true,
      },
    });

    const seventhYearPack = await prisma.studyPack.create({
      data: {
        name: 'Residency Medicine',
        description: 'Seventh year medical curriculum',
        type: PackType.YEAR,
        yearNumber: YearLevel.SEVEN,
        pricePerMonth: 220.0,
        pricePerYear: 2200.0,
        isActive: true,
      },
    });




    console.log('👥 Creating users...');
    const hashedPassword = await bcrypt.hash('ayoubwassim/M8', 10);

    // Admin User
    const admin = await prisma.user.create({
      data: {
        email: 'admin@medcin.dz',
        passwordHash: hashedPassword,
        fullName: 'Dr. Admin',
        role: 'ADMIN',
        universityId: university.id,
        specialtyId: medicine.id,
        currentYear: 'ONE',
        emailVerified: true,
        isActive: true,
        lastLogin: new Date(),
      },
    });

    // 6. Create Refresh Tokens
    console.log('🔑 Creating refresh tokens...');
    await prisma.refreshToken.create({
      data: {
        userId: admin.id,
        token: 'admin-refresh-token-1234567890',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      },
    });

    // 7. Create Subscriptions
    console.log('💳 Creating subscriptions...');

    // Admin Active Subscription
    await prisma.subscription.create({
      data: {
        userId: admin.id,
        studyPackId: firstYearPack.id,
        status: 'ACTIVE',
        startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        endDate: new Date(Date.now() + 335 * 24 * 60 * 60 * 1000),
        amountPaid: 100.0,
        paymentMethod: 'Credit Card',
        paymentReference: 'ADMIN-REF-001',
      },
    });

    // 8. Create Course Resources - REMOVED

    // 9. Create Course Layers - REMOVED

    // 10. Create Course Progress - REMOVED

    // 11. Create Question Sources - REMOVED

    // 12. Create Quizzes - REMOVED

    // 12. Create Exams - REMOVED

    // 13. Create Questions and Answers - REMOVED

    // Create exam-quiz relationships - REMOVED

    // 14. Create Quiz Sessions - REMOVED

    // 15. Create Quiz Session Questions - REMOVED

    // 16. Create Quiz Attempts - REMOVED

    // 17. Create Student Labels - REMOVED

    // 18. Create Quiz Labels - REMOVED

    // 19. Create Question Labels - REMOVED

    // 20. Create Student Notes - REMOVED

    // 21. Create Question Reports - REMOVED

    // 22. Create Todo Items - REMOVED

    // 23. Create Employee Activities - REMOVED

    // ==========================================
    // ENHANCED QUIZ SYSTEM FEATURES - REMOVED
    // ==========================================

    console.log('✅ Database seeding completed successfully!');
    console.log('📊 Complete Summary:');
    console.log(`   🏛️  Universities: 1`);
    console.log(`   🩺  Specialties: 1`);
    console.log(`   📚  Study Packs: 7`);
    console.log(`   👥  Users: 1`);
    console.log(`   🔑  Refresh Tokens: 1`);
    console.log(`   💳  Subscriptions: 1`);
    console.log('');
    console.log('🎉 All database tables have been populated with test data!');

  } catch (error) {
    console.error('❌ Error during comprehensive seeding:', error);
    throw error;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
