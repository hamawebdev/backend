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

    const university = await prisma.university.create({
      data: {
        id: 1,
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

    // 8. Create Content for First Year (Units, Modules, Courses, Questions)
    console.log('📚 Creating content for First Year...');

    // Create Unite for First Year
    const unite1 = await prisma.unite.create({
      data: {
        name: 'Fundamental Sciences',
        studyPackId: firstYearPack.id,
        description: 'Basic sciences for medical students',
      }
    });

    // Create Modules
    console.log('   Creating modules...');
    const moduleAnatomy = await prisma.module.create({
      data: {
        name: 'Anatomy',
        uniteId: unite1.id,
        description: 'Human Anatomy',
      }
    });

    const moduleCytology = await prisma.module.create({
      data: {
        name: 'Cytology',
        uniteId: unite1.id,
        description: 'Study of cells',
      }
    });

    // Create Courses
    console.log('   Creating courses...');
    const courseGeneralAnatomy = await prisma.course.create({
      data: {
        name: 'General Anatomy',
        moduleId: moduleAnatomy.id,
        description: 'Introduction to human body structure (Bones, Muscles, etc.)',
      }
    });

    const courseCellStructure = await prisma.course.create({
      data: {
        name: 'Cell Structure',
        moduleId: moduleCytology.id,
        description: 'Introduction to cell biology and organelles',
      }
    });

    // Create Question Sources
    console.log('   Creating question sources...');
    const residencySource = await prisma.questionSource.create({
      data: { name: 'Residency Exam' }
    });
    const externshipSource = await prisma.questionSource.create({
      data: { name: 'Externship Exam' }
    });

    // Create Questions with Tags and Repetition
    console.log('❓ Creating questions with repetitions, tags, sources, and exam years...');

    const questionsData = [
      // Anatomy Questions
      {
        text: 'The humerus is located in which part of the body?',
        explanation: '### The Humerus\n\nThe **humerus** is the **long bone** in the **upper arm**.\n\n- It runs from the **shoulder** to the **elbow**.\n- It connects the **scapula** and the two bones of the lower arm, the **radius** and **ulna**.',
        tags: ['Bones', 'Upper Limb', 'Skeleton'],
        years: ['2019', '2021', '2023'],
        courseId: courseGeneralAnatomy.id,
        examYear: 2023,
        sourceId: residencySource.id,
        answers: [
          { text: 'Upper Arm', correct: true },
          { text: 'Lower Leg', correct: false },
          { text: 'Forearm', correct: false },
          { text: 'Thigh', correct: false }
        ]
      },
      {
        text: 'Which organ is primarily responsible for filtering blood?',
        explanation: '### The Kidneys\n\nThe **kidneys** are two bean-shaped organs found on the left and right sides of the body in vertebrates.\n\n**Functions:**\n- Filter waste products from the blood.\n- Remove urea, excess salts, and toxins.\n- Regulate blood pressure.',
        tags: ['Organs', 'Physiology', 'Excretion'],
        years: ['2020', '2022', '2024'],
        courseId: courseGeneralAnatomy.id,
        examYear: 2024,
        sourceId: externshipSource.id,
        answers: [
          { text: 'Kidney', correct: true },
          { text: 'Heart', correct: false },
          { text: 'Lung', correct: false },
          { text: 'Stomach', correct: false }
        ]
      },
      {
        text: 'How many thoracic vertebrae are there?',
        explanation: '### Thoracic Vertebrae\n\nThere are **12 thoracic vertebrae** (T1-T12) in the human vertebral column.\n\n- They are intermediate in size between the cervical and lumbar vertebrae.\n- They articulate with the ribs.\n- They form the posterior wall of the thorax.',
        tags: ['Bones', 'Spine', 'Anatomy'],
        years: ['2019', '2024'],
        courseId: courseGeneralAnatomy.id,
        examYear: 2019,
        sourceId: residencySource.id,
        answers: [
          { text: '12', correct: true },
          { text: '7', correct: false },
          { text: '5', correct: false },
          { text: '33', correct: false }
        ]
      },
      {
        text: 'Which type of tissue covers the body surface?',
        explanation: '### Epithelial Tissue\n\n**Epithelial tissue** is one of the four basic types of animal tissue.\n\n**Roles:**\n- Covers the body surface (epidermis).\n- Lines internal organs and cavities.\n- Forms the lining of blood vessels.',
        tags: ['Histology', 'Tissues'],
        years: ['2022'],
        courseId: courseGeneralAnatomy.id,
        examYear: 2022,
        sourceId: externshipSource.id,
        answers: [
          { text: 'Epithelial', correct: true },
          { text: 'Connective', correct: false },
          { text: 'Muscular', correct: false },
          { text: 'Nervous', correct: false }
        ]
      },
      // Cytology Questions
      {
        text: 'What is the "powerhouse" of the cell?',
        explanation: '### Mitochondria\n\n**Mitochondria** are membrane-bound cell organelles that generate most of the chemical energy needed to power the cell\'s biochemical reactions.\n\n- Commonly referred to as the **powerhouse of the cell**.\n- The energy is stored in a small molecule called **adenosine triphosphate (ATP)**.',
        tags: ['Cell Biology', 'Organelles', 'Energy'],
        years: ['2018', '2020', '2021', '2023'],
        courseId: courseCellStructure.id,
        examYear: 2023,
        sourceId: residencySource.id,
        answers: [
          { text: 'Mitochondria', correct: true },
          { text: 'Nucleus', correct: false },
          { text: 'Ribosome', correct: false },
          { text: 'Golgi Apparatus', correct: false }
        ]
      },
      {
        text: 'Which organelle is responsible for protein synthesis?',
        explanation: '### Ribosomes\n\n**Ribosomes** are macromolecular machines, found within all living cells, that perform biological **protein synthesis**.\n\n- They link amino acids together in the order specified by the codons of messenger RNA (mRNA) molecules.',
        tags: ['Cell Biology', 'Organelles', 'Proteins'],
        years: ['2019', '2022'],
        courseId: courseCellStructure.id,
        examYear: 2019,
        sourceId: residencySource.id,
        answers: [
          { text: 'Ribosome', correct: true },
          { text: 'Lysosome', correct: false },
          { text: 'Vacuole', correct: false },
          { text: 'Centriole', correct: false }
        ]
      },
      {
        text: 'What is the main component of the cell membrane?',
        explanation: '### Cell Membrane Structure\n\nThe cell membrane is primarily composed of a **phospholipid bilayer**.\n\n**Components:**\n- **Phospholipids**: Form the fundamental structure.\n- **Proteins**: Embedded within for transport and signaling.\n- **Carbohydrates**: Attached to proteins or lipids for cell recognition.',
        tags: ['Cell Biology', 'Membrane', 'Biochemistry'],
        years: ['2020', '2023', '2024'],
        courseId: courseCellStructure.id,
        examYear: 2024,
        sourceId: externshipSource.id,
        answers: [
          { text: 'Phospholipids', correct: true },
          { text: 'Carbohydrates', correct: false },
          { text: 'Nucleic Acids', correct: false },
          { text: 'Vitamins', correct: false }
        ]
      },
      // Non-repeated Questions (New)
      {
        text: 'What is the longest bone in the human body?',
        explanation: '### The Femur\n\nThe **femur** (thigh bone) is the most proximal bone of the leg in tetrapod vertebrates capable of walking or jumping.\n\n- It is the **longest**, **heaviest**, and **strongest** bone in the human body.\n- It extends from the **hip** to the **knee**.',
        tags: ['Bones', 'Skeleton', 'Anatomy'],
        years: [], // Never appeared in exams
        courseId: courseGeneralAnatomy.id,
        examYear: undefined,
        sourceId: residencySource.id,
        answers: [
          { text: 'Femur', correct: true },
          { text: 'Humerus', correct: false },
          { text: 'Tibia', correct: false },
          { text: 'Fibula', correct: false }
        ]
      },
      {
        text: 'Which blood cells responsible for carrying oxygen?',
        explanation: '### Red Blood Cells (Erythrocytes)\n\n**Red blood cells** are the most common type of blood cell and the vertebrate\'s principal means of delivering oxygen to the body tissues.\n\n- They contain **hemoglobin**, an iron-rich protein that binds oxygen.\n- They lack a nucleus in humans to maximize space for hemoglobin.',
        tags: ['Blood', 'Cells', 'Physiology'],
        years: [], // Never appeared in exams
        courseId: courseCellStructure.id,
        examYear: undefined,
        sourceId: externshipSource.id,
        answers: [
          { text: 'Red Blood Cells', correct: true },
          { text: 'White Blood Cells', correct: false },
          { text: 'Platelets', correct: false },
          { text: 'Plasma', correct: false }
        ]
      }
    ];

    for (const q of questionsData) {
      await prisma.question.create({
        data: {
          questionText: q.text,
          explanation: q.explanation,
          courseId: q.courseId,
          createdById: admin.id,
          questionType: QuestionType.SINGLE_CHOICE,
          tags: JSON.stringify(q.tags),
          repetitionYears: JSON.stringify(q.years),
          repetitionCount: q.years.length,
          examYear: q.examYear,
          sourceId: q.sourceId,
          questionAnswers: {
            create: q.answers.map(a => ({
              answerText: a.text,
              isCorrect: a.correct,
              explanation: a.correct ? 'Correct answer' : undefined
            }))
          },
          universityId: university.id,
        }
      });
    }

    console.log('✅ Database seeding completed successfully!');
    console.log('📊 Complete Summary:');
    console.log(`   🏛️  Universities: 1`);
    console.log(`   🩺  Specialties: 1`);
    console.log(`   📚  Study Packs: 7`);
    console.log(`   👥  Users: 1`);
    console.log(`   🔑  Refresh Tokens: 1`);
    console.log(`   💳  Subscriptions: 1`);
    console.log(`   📦  Units: 1`);
    console.log(`   📁  Modules: 2`);
    console.log(`   📘  Courses: 2`);
    console.log(`   ❓  Questions: ${questionsData.length}`);
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
