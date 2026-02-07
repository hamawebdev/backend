"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcrypt_1 = __importDefault(require("bcrypt"));
const prisma = new client_1.PrismaClient();
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
function getRandomElement(array) {
    return array[Math.floor(Math.random() * array.length)];
}
function generateEmail(firstName, lastName, index) {
    return `${firstName.toLowerCase()}.${lastName.toLowerCase()}${index}@university.dz`;
}
function generateQuestionText(template, topic) {
    return template.replace('{topic}', topic);
}
function createPerformanceData() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('🚀 Starting performance database seeding...');
        console.log('⚠️  This will create 5,000 users and 10,000 questions for performance testing');
        try {
            // Get existing data we need to reference
            console.log('📋 Fetching existing reference data...');
            const existingUniversities = yield prisma.university.findMany();
            const existingSpecialties = yield prisma.specialty.findMany();
            const existingCourses = yield prisma.course.findMany();
            if (existingUniversities.length === 0 || existingSpecialties.length === 0 || existingCourses.length === 0) {
                console.log('❌ Please run the main seed first to create basic data structure');
                return;
            }
            // Create admin user for question creation if not exists
            const hashedPassword = yield bcrypt_1.default.hash('password123', 10);
            let adminUser = yield prisma.user.findFirst({ where: { role: 'ADMIN' } });
            if (!adminUser) {
                adminUser = yield prisma.user.create({
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
                const usersToCreate = [];
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
                        role: role,
                        universityId: university.id,
                        specialtyId: specialty.id,
                        currentYear: yearLevel,
                        emailVerified: Math.random() > 0.1, // 90% verified
                        isActive: Math.random() > 0.05, // 95% active
                        lastLogin: Math.random() > 0.3 ? new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000) : null,
                    });
                }
                yield prisma.user.createMany({
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
                const questionsToCreate = [];
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
                        yearLevel: yearLevel,
                        createdById: adminUser.id,
                    });
                }
                // Insert questions
                const createdQuestions = yield prisma.$transaction(questionsToCreate.map(question => prisma.question.create({ data: question })));
                // Create answers for each question
                const answersToCreate = [];
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
                yield prisma.questionAnswer.createMany({
                    data: answersToCreate,
                });
                console.log(`   ✅ Created batch ${batch + 1}/${Math.ceil(totalQuestions / questionBatchSize)} (${batchEnd} questions total)`);
            }
            // 3. Create some quiz sessions for performance testing
            console.log('🎯 Creating sample quiz sessions...');
            const users = yield prisma.user.findMany({
                where: { role: 'STUDENT' },
                take: 100 // Just first 100 users for sessions
            });
            const questions = yield prisma.question.findMany({ take: 1000 }); // First 1000 questions
            const sessionsToCreate = [];
            for (let i = 0; i < 200; i++) { // 200 sample sessions
                const user = getRandomElement(users);
                const sessionQuestions = [];
                // Select 20 random questions for each session
                const shuffledQuestions = [...questions].sort(() => 0.5 - Math.random()).slice(0, 20);
                sessionsToCreate.push({
                    userId: user.id,
                    title: `Performance Test Session ${i + 1}`,
                    type: 'PRACTICE',
                    status: getRandomElement(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED']),
                    startedAt: Math.random() > 0.5 ? new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000) : null,
                    completedAt: Math.random() > 0.7 ? new Date(Date.now() - Math.random() * 6 * 24 * 60 * 60 * 1000) : null,
                    score: Math.floor(Math.random() * 20),
                    percentage: Math.floor(Math.random() * 100),
                    questions: shuffledQuestions,
                });
            }
            // Create sessions and their questions
            for (const sessionData of sessionsToCreate) {
                const { questions: sessionQuestions } = sessionData, sessionInfo = __rest(sessionData, ["questions"]);
                const session = yield prisma.quizSession.create({
                    data: sessionInfo,
                });
                // Add questions to session
                const sessionQuestionsToCreate = sessionQuestions.map(question => ({
                    sessionId: session.id,
                    questionId: question.id,
                }));
                yield prisma.quizSessionQuestion.createMany({
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
            const userCount = yield prisma.user.count();
            const questionCount = yield prisma.question.count();
            const answerCount = yield prisma.questionAnswer.count();
            const sessionCount = yield prisma.quizSession.count();
            console.log('\n📈 Total database statistics:');
            console.log(`   👥 Total users: ${userCount}`);
            console.log(`   ❓ Total questions: ${questionCount}`);
            console.log(`   📝 Total answers: ${answerCount}`);
            console.log(`   🎯 Total quiz sessions: ${sessionCount}`);
        }
        catch (error) {
            console.error('❌ Error during performance seeding:', error);
            throw error;
        }
        finally {
            yield prisma.$disconnect();
        }
    });
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
exports.default = createPerformanceData;
