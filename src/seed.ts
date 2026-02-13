import { PrismaClient, YearLevel, PackType, QuestionType } from '@prisma/client';
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

    // Reset auto-increment for universities to ensure ID 1
    try {
      await prisma.$executeRawUnsafe("DELETE FROM sqlite_sequence WHERE name='universities'");
    } catch (error) {
      console.log('⚠️ Could not reset sqlite_sequence (this is fine if not using SQLite)');
    }

    const universities = await Promise.all([
      prisma.university.create({
        data: {
          id: 1,
          name: 'University of Algeria',
          country: 'Algeria',
        },
      }),
      prisma.university.create({
        data: {
          id: 2,
          name: 'University of Oran',
          country: 'Algeria',
        },
      }),
      prisma.university.create({
        data: {
          id: 3,
          name: 'University of Annaba',
          country: 'Algeria',
        },
      }),
    ]);

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
        pricePerMonth: 4500.0,
        pricePerYear: 4500.0,
        isActive: true,
      },
    });

    const secondYearPack = await prisma.studyPack.create({
      data: {
        name: 'Second Year Medicine',
        description: 'Second year medical curriculum',
        type: PackType.YEAR,
        yearNumber: YearLevel.TWO,
        pricePerMonth: 4500.0,
        pricePerYear: 4500.0,
        isActive: true,
      },
    });

    const thirdYearPack = await prisma.studyPack.create({
      data: {
        name: 'Third Year Medicine',
        description: 'Third year medical curriculum',
        type: PackType.YEAR,
        yearNumber: YearLevel.THREE,
        pricePerMonth: 4500.0,
        pricePerYear: 4500.0,
        isActive: true,
      },
    });

    const fourthYearPack = await prisma.studyPack.create({
      data: {
        name: 'Fourth Year Medicine',
        description: 'Fourth year medical curriculum',
        type: PackType.YEAR,
        yearNumber: YearLevel.FOUR,
        pricePerMonth: 4500.0,
        pricePerYear: 4500.0,
        isActive: true,
      },
    });

    const fifthYearPack = await prisma.studyPack.create({
      data: {
        name: 'Fifth Year Medicine',
        description: 'Fifth year medical curriculum',
        type: PackType.YEAR,
        yearNumber: YearLevel.FIVE,
        pricePerMonth: 4500.0,
        pricePerYear: 4500.0,
        isActive: true,
      },
    });

    const sixthYearPack = await prisma.studyPack.create({
      data: {
        name: 'Sixth Year Medicine',
        description: 'Sixth year medical curriculum',
        type: PackType.YEAR,
        yearNumber: YearLevel.SIX,
        pricePerMonth: 4500.0,
        pricePerYear: 4500.0,
        isActive: true,
      },
    });

    const seventhYearPack = await prisma.studyPack.create({
      data: {
        name: 'Residency Medicine',
        description: 'Seventh year medical curriculum',
        type: PackType.YEAR,
        yearNumber: YearLevel.SEVEN,
        pricePerMonth: 7500.0,
        pricePerYear: 7500.0,
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
        universityId: universities[0].id,
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

    // Create Question Sources
    console.log('   Creating question sources...');
    
    const questionSources = await Promise.all([
      prisma.questionSource.create({ data: { id: 1, name: 'Externat AIger' } }),
      prisma.questionSource.create({ data: { id: 2, name: 'Residanat Alger' } }),
      prisma.questionSource.create({ data: { id: 3, name: 'Externat Tizi Ouzou' } }),
      prisma.questionSource.create({ data: { id: 4, name: 'Externat Constantine' } }),
      prisma.questionSource.create({ data: { id: 5, name: 'Externat Batna' } }),
      prisma.questionSource.create({ data: { id: 6, name: 'Externat Oran' } }),
      prisma.questionSource.create({ data: { id: 7, name: 'Externat Mostaganem' } }),
      prisma.questionSource.create({ data: { id: 8, name: 'Externat SBA' } }),
      prisma.questionSource.create({ data: { id: 9, name: 'Militaire Alger' } }),
      prisma.questionSource.create({ data: { id: 10, name: 'Residanat Oran' } }),
    ]);


    console.log('✅ Database seeding completed successfully!');
    console.log('📊 Complete Summary:');
    console.log(`   🏛️  Universities: ${universities.length}`);
    console.log(`   🩺  Specialties: 1`);
    console.log(`   📚  Study Packs: 7`);
    console.log(`   👥  Users: 1`);
    console.log(`   🔑  Refresh Tokens: 1`);
    console.log(`   💳  Subscriptions: 1`);
    console.log(`   📦  Question Sources: ${questionSources.length}`);
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
