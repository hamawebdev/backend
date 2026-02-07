import { PrismaClient, YearLevel, PackType, QuizType, QuestionType, TodoType, Priority, TodoStatus } from '@prisma/client';
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



    // 4. Create Unites, Modules, and Courses
    console.log('📚 Creating content hierarchy...');
    const yearContent: { pack: any; course: any; suffix: string }[] = [];

    // Explicitly type the packs array to avoid implicit any errors if strict mode is on, though inference usually works.
    const packs = [
      { pack: firstYearPack, suffix: '1st Year' },
      { pack: secondYearPack, suffix: '2nd Year' },
      { pack: thirdYearPack, suffix: '3rd Year' },
      { pack: fourthYearPack, suffix: '4th Year' },
      { pack: fifthYearPack, suffix: '5th Year' },
      { pack: sixthYearPack, suffix: '6th Year' },
      { pack: seventhYearPack, suffix: 'Residency' },
    ];

    for (const { pack, suffix } of packs) {
      console.log(`   Creating content for ${suffix}...`);

      const unit = await prisma.unite.create({
        data: {
          studyPackId: pack.id,
          name: `Fundamental Sciences Unit - ${suffix}`,
          description: `Core unit for ${suffix}`,
        }
      });

      const module = await prisma.module.create({
        data: {
          uniteId: unit.id,
          name: `Anatomy Module - ${suffix}`,
          description: `Anatomy studies for ${suffix}`,
        }
      });

      const course = await prisma.course.create({
        data: {
          moduleId: module.id,
          name: `General Anatomy - ${suffix}`,
          description: `Introduction to anatomy for ${suffix}`,
        }
      });

      yearContent.push({ pack, course, suffix });
    }

    // 5. Create Users
    console.log('👥 Creating users...');
    const hashedPassword = await bcrypt.hash('password123', 10);

    // Test Student User
    const testStudent = await prisma.user.create({
      data: {
        email: 'test@example.com',
        passwordHash: hashedPassword,
        fullName: 'Test Student',
        role: 'STUDENT',
        universityId: university.id,
        specialtyId: medicine.id,
        currentYear: 'ONE',
        emailVerified: true,
        isActive: true,
        lastLogin: new Date(),
      },
    });

    // Student User 1
    const student1 = await prisma.user.create({
      data: {
        email: 'student1@university.dz',
        passwordHash: hashedPassword,
        fullName: 'Ahmed Ben Ali',
        role: 'STUDENT',
        universityId: university.id,
        specialtyId: medicine.id,
        currentYear: 'ONE',
        emailVerified: true,
        isActive: true,
        lastLogin: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
    });

    // Student User 2
    const student2 = await prisma.user.create({
      data: {
        email: 'student2@university.dz',
        passwordHash: hashedPassword,
        fullName: 'Fatima Zahra',
        role: 'STUDENT',
        universityId: university.id,
        specialtyId: medicine.id,
        currentYear: 'TWO',
        emailVerified: true,
        isActive: true,
        lastLogin: new Date(Date.now() - 12 * 60 * 60 * 1000),
      },
    });

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

    // Employee User
    const employee = await prisma.user.create({
      data: {
        email: 'employee@medcin.dz',
        passwordHash: hashedPassword,
        fullName: 'Dr. Employee',
        role: 'EMPLOYEE',
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
        userId: testStudent.id,
        token: 'test-refresh-token-1234567890',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      },
    });

    await prisma.refreshToken.create({
      data: {
        userId: student1.id,
        token: 'student1-refresh-token-0987654321',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    // 7. Create Subscriptions
    console.log('💳 Creating subscriptions...');

    // Test Student Active Subscription
    await prisma.subscription.create({
      data: {
        userId: testStudent.id,
        studyPackId: firstYearPack.id,
        status: 'ACTIVE',
        startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        endDate: new Date(Date.now() + 335 * 24 * 60 * 60 * 1000),
        amountPaid: 100.0,
        paymentMethod: 'Credit Card',
        paymentReference: 'TEST-REF-001',
      },
    });

    // Student 1 Active Subscription
    await prisma.subscription.create({
      data: {
        userId: student1.id,
        studyPackId: firstYearPack.id,
        status: 'ACTIVE',
        startDate: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
        endDate: new Date(Date.now() + 350 * 24 * 60 * 60 * 1000),
        amountPaid: 100.0,
        paymentMethod: 'Bank Transfer',
        paymentReference: 'REF-001',
      },
    });

    // Student 2 Multiple Subscriptions
    await prisma.subscription.create({
      data: {
        userId: student2.id,
        studyPackId: secondYearPack.id,
        status: 'ACTIVE',
        startDate: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
        endDate: new Date(Date.now() + 305 * 24 * 60 * 60 * 1000),
        amountPaid: 120.0,
        paymentMethod: 'Credit Card',
        paymentReference: 'REF-002',
      },
    });

    await prisma.subscription.create({
      data: {
        userId: student2.id,
        studyPackId: seventhYearPack.id,
        status: 'PENDING',
        startDate: new Date(),
        endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        amountPaid: 250.0,
        paymentMethod: 'Bank Transfer',
        paymentReference: 'REF-003',
      },
    });

    // 8. Create Course Resources - REMOVED

    // 9. Create Course Layers - REMOVED

    // 10. Create Course Progress - REMOVED

    // 11. Create Question Sources
    console.log('📚 Creating question sources...');
    const sources = [
      { id: 1, title: 'Externat AIger' },
      { id: 2, title: 'Residanat Alger' },
      { id: 3, title: 'Externat Tizi Ouzou' },
      { id: 4, title: 'Externat Constantine' },
      { id: 5, title: 'Externat Batna' },
      { id: 6, title: 'Externat Oran' },
      { id: 7, title: 'Externat Mostaganem' },
      { id: 8, title: 'Externat SBA' },
      { id: 9, title: 'Militaire Alger' },
    ];

    for (const source of sources) {
      await prisma.questionSource.create({
        data: {
          name: source.title,
        },
      });
    }

    // 12. Create Quizzes - REMOVED

    // 12. Create Exams - REMOVED

    // 13. Create Questions and Answers
    console.log('❓ Creating questions...');

    const questionTypes = [
      QuestionType.SINGLE_CHOICE,
      QuestionType.MULTIPLE_CHOICE,
      QuestionType.QROC
    ];

    for (const { pack, course, suffix } of yearContent) {
      console.log(`   Genering questions for ${suffix}...`);

      for (let i = 1; i <= 10; i++) {
        const typeIndex = (i - 1) % 3;
        const qType = questionTypes[typeIndex];
        const typeName = qType === QuestionType.SINGLE_CHOICE ? 'QCS' : (qType === QuestionType.MULTIPLE_CHOICE ? 'QCM' : 'QROC');

        const question = await prisma.question.create({
          data: {
            courseId: course.id,
            universityId: university.id,
            yearLevel: pack.yearNumber,
            examYear: 2024,
            questionText: `Question ${i} (${typeName}) for ${suffix}`,
            explanation: `Explanation for question ${i} (${suffix})`,
            questionType: qType,
            createdById: admin.id,
            metadata: JSON.stringify({ difficulty: 'medium', tags: ['anatomy', suffix] }),
          }
        });

        if (qType === QuestionType.QROC) {
          await prisma.questionAnswer.create({
            data: {
              questionId: question.id,
              answerText: `Correct Answer for QROC ${i}`,
              isCorrect: true,
              explanation: 'Detailed explanation for the correct answer'
            }
          });
        } else {
          // Create 4 options for multiple choice types
          for (let j = 1; j <= 4; j++) {
            // Logic for correctness:
            // QCS: Only option 1 is correct
            // QCM: Option 1 and 3 are correct
            let isCorrect = false;
            if (qType === QuestionType.SINGLE_CHOICE) {
              isCorrect = (j === 1);
            } else if (qType === QuestionType.MULTIPLE_CHOICE) {
              isCorrect = (j === 1 || j === 3);
            }

            await prisma.questionAnswer.create({
              data: {
                questionId: question.id,
                answerText: `Option ${j} for Question ${i}`,
                isCorrect: isCorrect,
              }
            });
          }
        }
      }
    }

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

    console.log('✅ Comprehensive database seeding completed successfully!');
    console.log('📊 Complete Summary:');
    console.log(`   🏛️  Universities: 1`);
    console.log(`   🩺  Specialties: 1`);
    console.log(`   📚  Study Packs: 8`);
    console.log(`   👥  Users: 5`);
    console.log(`   🔑  Refresh Tokens: 2`);
    console.log(`   💳  Subscriptions: 4`);
    console.log(`   📚  Question Sources: 9`);
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
