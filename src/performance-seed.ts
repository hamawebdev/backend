import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

// Seeding clears and rewrites tables: never run it against production by accident
if (process.env.NODE_ENV === 'production' && process.env.ALLOW_PRODUCTION_SEED !== 'true') {
  console.error('Refusing to seed: NODE_ENV is production (set ALLOW_PRODUCTION_SEED=true to override)');
  process.exit(1);
}

const prisma = new PrismaClient();

// Sample data arrays for generating realistic content
const firstNames = [
  'Ahmed', 'Fatima', 'Mohamed', 'Aicha', 'Omar', 'Khadija', 'Ali', 'Amina', 'Youssef', 'Zahra',
  'Hassan', 'Nadia', 'Karim', 'Leila', 'Rachid', 'Samira', 'Mehdi', 'Salma', 'Tarek', 'Yasmine',
  'Abderrahim', 'Zineb', 'Hamza', 'Imane', 'Saad', 'Houda', 'Bilal', 'Meriem', 'Khalid', 'Rajae',
  'Amine', 'Siham', 'Othmane', 'Ghita', 'Ismail', 'Hanane', 'Adil', 'Karima', 'Mustapha', 'Latifa',
  'Abdelkader', 'Souad', 'Driss', 'Malika', 'Brahim', 'Nawal', 'Aziz', 'Widad', 'Noureddine', 'Jamila'
];

const lastNames = [
  'Benali', 'Alaoui', 'Bennani', 'Tazi', 'Fassi', 'Idrissi', 'Berrada', 'Chraibi', 'Lahlou', 'Benjelloun',
  'Kettani', 'Amrani', 'Filali', 'Sekkat', 'Lamrani', 'Benabdellah', 'Cherkaoui', 'Benkirane', 'Benomar', 'Benslimane',
  'Benaissa', 'Bentaleb', 'Benyahia', 'Benali', 'Benabbes', 'Bensaid', 'Benhamou', 'Benkiran', 'Bensouda', 'Bentahar',
  'Belkacem', 'Belarbi', 'Belghazi', 'Belhaj', 'Belkadi', 'Belmahi', 'Belmekki', 'Belmokhtar', 'Belnaceur', 'Belouali'
];

const medicalTopics = [
  'cardiovascular system', 'respiratory system', 'nervous system', 'digestive system', 'endocrine system',
  'musculoskeletal system', 'immune system', 'urinary system', 'reproductive system', 'integumentary system',
  'anatomy', 'physiology', 'pathology', 'pharmacology', 'microbiology', 'biochemistry', 'histology', 'embryology',
  'genetics', 'epidemiology', 'public health', 'clinical medicine', 'surgery', 'internal medicine', 'pediatrics',
  'obstetrics', 'gynecology', 'psychiatry', 'dermatology', 'ophthalmology', 'otolaryngology', 'orthopedics',
  'cardiology', 'pulmonology', 'gastroenterology', 'nephrology', 'endocrinology', 'hematology', 'oncology',
  'infectious diseases', 'radiology', 'anesthesiology', 'emergency medicine', 'family medicine', 'geriatrics'
];

const questionTemplates = [
  'What is the primary function of the {topic}?',
  'Which of the following best describes {topic}?',
  'What are the main characteristics of {topic}?',
  'How does {topic} affect the human body?',
  'What is the most common disorder related to {topic}?',
  'Which medication is commonly used to treat {topic} conditions?',
  'What diagnostic test is most appropriate for {topic} evaluation?',
  'What are the risk factors associated with {topic} diseases?',
  'Which anatomical structure is part of the {topic}?',
  'What is the pathophysiology of {topic} dysfunction?'
];

const answerOptions = [
  ['Correct primary function', 'Incorrect function A', 'Incorrect function B', 'Incorrect function C'],
  ['Accurate description', 'Misleading description A', 'Misleading description B', 'Misleading description C'],
  ['Main characteristic', 'Secondary characteristic', 'Unrelated characteristic A', 'Unrelated characteristic B'],
  ['Positive effect', 'Negative effect A', 'Negative effect B', 'No effect'],
  ['Common disorder', 'Rare disorder A', 'Rare disorder B', 'Unrelated disorder'],
  ['First-line medication', 'Second-line medication', 'Contraindicated medication', 'Unrelated medication'],
  ['Gold standard test', 'Alternative test A', 'Alternative test B', 'Inappropriate test'],
  ['Major risk factor', 'Minor risk factor A', 'Minor risk factor B', 'Protective factor'],
  ['Primary structure', 'Secondary structure', 'Unrelated structure A', 'Unrelated structure B'],
  ['Correct pathophysiology', 'Incorrect mechanism A', 'Incorrect mechanism B', 'Incorrect mechanism C']
];

const universities = ['University of Algiers', 'University of Blida', 'University of Constantine', 'University of Oran'];
const specialties = ['General Medicine', 'Dentistry', 'Pharmacy', 'Medicine'];
const yearLevels = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN'];
const userRoles = ['STUDENT', 'EMPLOYEE', 'ADMIN'];

function getRandomElement<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

function generateEmail(firstName: string, lastName: string, index: number): string {
  return `${firstName.toLowerCase()}.${lastName.toLowerCase()}${index}@university.dz`;
}

function generateQuestionText(template: string, topic: string): string {
  return template.replace('{topic}', topic);
}

async function createPerformanceData() {
  console.log('🚀 Starting performance database seeding...');
  console.log('⚠️  This will create 5,000 users and 10,000 questions for performance testing');

  try {
    // Get existing data we need to reference
    console.log('📋 Fetching existing reference data...');
    
    const existingUniversities = await prisma.university.findMany();
    const existingSpecialties = await prisma.specialty.findMany();
    const existingCourses = await prisma.course.findMany();
    
    if (existingUniversities.length === 0 || existingSpecialties.length === 0 || existingCourses.length === 0) {
      console.log('❌ Please run the main seed first to create basic data structure');
      return;
    }

    // Create admin user for question creation if not exists
    const hashedPassword = await bcrypt.hash('password123', 10);
    let adminUser = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
    
    if (!adminUser) {
      adminUser = await prisma.user.create({
        data: {
          email: 'performance.admin@medcin.dz',
          passwordHash: hashedPassword,
          fullName: 'Performance Admin',
          role: 'ADMIN',
          universityId: existingUniversities[0].id,
          specialtyId: existingSpecialties[0].id,
          currentYear: 'ONE',
          emailVerified: true,
          isActive: true,
        },
      });
    }

    // 1. Create 5,000 users in batches
    console.log('👥 Creating 5,000 users...');
    const batchSize = 100;
    const totalUsers = 5000;
    
    for (let batch = 0; batch < Math.ceil(totalUsers / batchSize); batch++) {
      const usersToCreate: any[] = [];
      const batchStart = batch * batchSize;
      const batchEnd = Math.min(batchStart + batchSize, totalUsers);
      
      for (let i = batchStart; i < batchEnd; i++) {
        const firstName = getRandomElement(firstNames);
        const lastName = getRandomElement(lastNames);
        const university = getRandomElement(existingUniversities);
        const specialty = getRandomElement(existingSpecialties);
        const yearLevel = getRandomElement(yearLevels);
        const role = i < 4800 ? 'STUDENT' : getRandomElement(userRoles); // 96% students, 4% others
        
        usersToCreate.push({
          email: generateEmail(firstName, lastName, i + 1),
          passwordHash: hashedPassword,
          fullName: `${firstName} ${lastName}`,
          role: role as 'STUDENT' | 'EMPLOYEE' | 'ADMIN',
          universityId: university.id,
          specialtyId: specialty.id,
          currentYear: yearLevel as 'ONE' | 'TWO' | 'THREE' | 'FOUR' | 'FIVE' | 'SIX' | 'SEVEN',
          emailVerified: Math.random() > 0.1, // 90% verified
          isActive: Math.random() > 0.05, // 95% active
          lastLogin: Math.random() > 0.3 ? new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000) : null,
        });
      }
      
      await prisma.user.createMany({
        data: usersToCreate,
      });
      
      console.log(`   ✅ Created batch ${batch + 1}/${Math.ceil(totalUsers / batchSize)} (${batchEnd} users total)`);
    }

    // 2. Create 10,000 questions in batches
    console.log('❓ Creating 10,000 questions with answers...');
    const totalQuestions = 10000;
    const questionBatchSize = 50; // Smaller batches for questions due to related data
    
    for (let batch = 0; batch < Math.ceil(totalQuestions / questionBatchSize); batch++) {
      const batchStart = batch * questionBatchSize;
      const batchEnd = Math.min(batchStart + questionBatchSize, totalQuestions);
      
      // Create questions first
      const questionsToCreate: any[] = [];
      for (let i = batchStart; i < batchEnd; i++) {
        const topic = getRandomElement(medicalTopics);
        const template = getRandomElement(questionTemplates);
        const course = getRandomElement(existingCourses);
        const university = getRandomElement(existingUniversities);
        const yearLevel = getRandomElement(yearLevels);
        
        questionsToCreate.push({
          courseId: Math.random() > 0.2 ? course.id : null, // 80% have course association
          questionText: generateQuestionText(template, topic),
          explanation: `This question tests knowledge about ${topic}. The correct answer demonstrates understanding of key concepts.`,
          universityId: Math.random() > 0.3 ? university.id : null, // 70% have university association
          yearLevel: yearLevel as 'ONE' | 'TWO' | 'THREE' | 'FOUR' | 'FIVE' | 'SIX' | 'SEVEN',
          createdById: adminUser.id,
        });
      }
      
      // Insert questions
      const createdQuestions = await prisma.$transaction(
        questionsToCreate.map(question => prisma.question.create({ data: question }))
      );
      
      // Create answers for each question
      const answersToCreate: any[] = [];
      for (let i = 0; i < createdQuestions.length; i++) {
        const question = createdQuestions[i];
        const templateIndex = Math.floor(Math.random() * answerOptions.length);
        const answers = answerOptions[templateIndex];
        
        for (let j = 0; j < answers.length; j++) {
          answersToCreate.push({
            questionId: question.id,
            answerText: answers[j],
            isCorrect: j === 0, // First answer is always correct
            explanation: j === 0 ? 'This is the correct answer.' : 'This answer is incorrect.',
          });
        }
      }
      
      // Insert answers in batches
      await prisma.questionAnswer.createMany({
        data: answersToCreate,
      });
      
      console.log(`   ✅ Created batch ${batch + 1}/${Math.ceil(totalQuestions / questionBatchSize)} (${batchEnd} questions total)`);
    }

    // 3. Create some quiz sessions for performance testing
    console.log('🎯 Creating sample quiz sessions...');
    const users = await prisma.user.findMany({ 
      where: { role: 'STUDENT' },
      take: 100 // Just first 100 users for sessions
    });
    
    const questions = await prisma.question.findMany({ take: 1000 }); // First 1000 questions
    
    const sessionsToCreate = [];
    for (let i = 0; i < 200; i++) { // 200 sample sessions
      const user = getRandomElement(users);
      const sessionQuestions = [];
      
      // Select 20 random questions for each session
      const shuffledQuestions = [...questions].sort(() => 0.5 - Math.random()).slice(0, 20);
      
      sessionsToCreate.push({
        userId: user.id,
        title: `Performance Test Session ${i + 1}`,
        type: 'PRACTICE' as 'PRACTICE' | 'EXAM',
        status: getRandomElement(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED']) as 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED',
        startedAt: Math.random() > 0.5 ? new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000) : null,
        completedAt: Math.random() > 0.7 ? new Date(Date.now() - Math.random() * 6 * 24 * 60 * 60 * 1000) : null,
        score: Math.floor(Math.random() * 20),
        percentage: Math.floor(Math.random() * 100),
        questions: shuffledQuestions,
      });
    }
    
    // Create sessions and their questions
    for (const sessionData of sessionsToCreate) {
      const { questions: sessionQuestions, ...sessionInfo } = sessionData;
      
      const session = await prisma.quizSession.create({
        data: sessionInfo,
      });
      
      // Add questions to session
      const sessionQuestionsToCreate = sessionQuestions.map(question => ({
        sessionId: session.id,
        questionId: question.id,
      }));
      
      await prisma.quizSessionQuestion.createMany({
        data: sessionQuestionsToCreate,
      });
    }

    console.log('✅ Performance seeding completed successfully!');
    console.log('📊 Summary:');
    console.log(`   👥 Users created: ${totalUsers}`);
    console.log(`   ❓ Questions created: ${totalQuestions}`);
    console.log(`   📝 Answers created: ${totalQuestions * 4}`);
    console.log(`   🎯 Quiz sessions created: 200`);
    
    // Display some statistics
    const userCount = await prisma.user.count();
    const questionCount = await prisma.question.count();
    const answerCount = await prisma.questionAnswer.count();
    const sessionCount = await prisma.quizSession.count();
    
    console.log('\n📈 Total database statistics:');
    console.log(`   👥 Total users: ${userCount}`);
    console.log(`   ❓ Total questions: ${questionCount}`);
    console.log(`   📝 Total answers: ${answerCount}`);
    console.log(`   🎯 Total quiz sessions: ${sessionCount}`);

  } catch (error) {
    console.error('❌ Error during performance seeding:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the performance seeding
if (require.main === module) {
  createPerformanceData()
    .then(() => {
      console.log('🎉 Performance seeding script completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Performance seeding failed:', error);
      process.exit(1);
    });
}

export default createPerformanceData; 