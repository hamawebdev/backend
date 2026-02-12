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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcrypt_1 = __importDefault(require("bcrypt"));
const prisma = new client_1.PrismaClient();
// Helper function to safely delete from tables that might not exist
function safeDeleteMany(tableName, deleteFunction) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            yield deleteFunction();
            console.log(`✅ Cleared ${tableName}`);
        }
        catch (error) {
            if (error.code === 'P2021') {
                console.log(`⚠️  Table ${tableName} does not exist, skipping...`);
            }
            else {
                console.error(`❌ Error clearing ${tableName}:`, error.message);
                throw error;
            }
        }
    });
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('🌱 Starting comprehensive database seeding...');
        try {
            // Clear existing data in reverse dependency order (safely)
            console.log('🧹 Clearing existing data...');
            yield safeDeleteMany('employee_activities', () => prisma.employeeActivity.deleteMany());
            yield safeDeleteMany('todo_items', () => prisma.todoItem.deleteMany());
            yield safeDeleteMany('question_reports', () => prisma.questionReport.deleteMany());
            yield safeDeleteMany('student_notes', () => prisma.studentNote.deleteMany());
            yield safeDeleteMany('question_labels', () => prisma.questionLabel.deleteMany());
            yield safeDeleteMany('quiz_labels', () => prisma.quizLabel.deleteMany());
            yield safeDeleteMany('student_labels', () => prisma.studentLabel.deleteMany());
            yield safeDeleteMany('quiz_session_labels', () => prisma.quizSessionLabel.deleteMany());
            yield safeDeleteMany('course_progress', () => prisma.courseProgress.deleteMany());
            yield safeDeleteMany('multiple_choice_attempts', () => prisma.multipleChoiceAttempt.deleteMany());
            yield safeDeleteMany('quiz_attempts', () => prisma.quizAttempt.deleteMany());
            yield safeDeleteMany('quiz_session_questions', () => prisma.quizSessionQuestion.deleteMany());
            yield safeDeleteMany('quiz_sessions', () => prisma.quizSession.deleteMany());
            yield safeDeleteMany('exam_quizzes', () => prisma.examQuiz.deleteMany());
            yield safeDeleteMany('exams', () => prisma.exam.deleteMany());
            yield safeDeleteMany('explanation_images', () => prisma.explanationImage.deleteMany());
            yield safeDeleteMany('question_answers', () => prisma.questionAnswer.deleteMany());
            yield safeDeleteMany('quiz_questions', () => prisma.quizQuestion.deleteMany());
            yield safeDeleteMany('questions', () => prisma.question.deleteMany());
            yield safeDeleteMany('quizzes', () => prisma.quiz.deleteMany());
            yield safeDeleteMany('question_sources', () => prisma.questionSource.deleteMany());
            yield safeDeleteMany('course_resources', () => prisma.courseResource.deleteMany());
            yield safeDeleteMany('course_layers', () => prisma.courseLayer.deleteMany());
            yield safeDeleteMany('courses', () => prisma.course.deleteMany());
            yield safeDeleteMany('modules', () => prisma.module.deleteMany());
            yield safeDeleteMany('unites', () => prisma.unite.deleteMany());
            yield safeDeleteMany('subscriptions', () => prisma.subscription.deleteMany());
            yield safeDeleteMany('study_packs', () => prisma.studyPack.deleteMany());
            yield safeDeleteMany('refresh_tokens', () => prisma.refreshToken.deleteMany());
            yield safeDeleteMany('users', () => prisma.user.deleteMany());
            yield safeDeleteMany('specialties', () => prisma.specialty.deleteMany());
            yield safeDeleteMany('universities', () => prisma.university.deleteMany());
            // 1. Create Universities
            console.log('🏛️ Creating universities...');
            // Reset auto-increment for universities to ensure ID 1
            try {
                yield prisma.$executeRawUnsafe("DELETE FROM sqlite_sequence WHERE name='universities'");
            }
            catch (error) {
                console.log('⚠️ Could not reset sqlite_sequence (this is fine if not using SQLite)');
            }
            const university = yield prisma.university.create({
                data: {
                    id: 1,
                    name: 'University of Algeria',
                    country: 'Algeria',
                },
            });
            // 2. Create Specialties
            console.log('🩺 Creating specialties...');
            const medicine = yield prisma.specialty.create({
                data: {
                    name: 'Medicine',
                },
            });
            // 3. Create Study Packs
            console.log('📚 Creating study packs...');
            const firstYearPack = yield prisma.studyPack.create({
                data: {
                    name: 'First Year Medicine',
                    description: 'Complete first year medical curriculum',
                    type: client_1.PackType.YEAR,
                    yearNumber: client_1.YearLevel.ONE,
                    pricePerMonth: 100.0,
                    pricePerYear: 1000.0,
                    isActive: true,
                },
            });
            const secondYearPack = yield prisma.studyPack.create({
                data: {
                    name: 'Second Year Medicine',
                    description: 'Second year medical curriculum',
                    type: client_1.PackType.YEAR,
                    yearNumber: client_1.YearLevel.TWO,
                    pricePerMonth: 120.0,
                    pricePerYear: 1200.0,
                    isActive: true,
                },
            });
            const thirdYearPack = yield prisma.studyPack.create({
                data: {
                    name: 'Third Year Medicine',
                    description: 'Third year medical curriculum',
                    type: client_1.PackType.YEAR,
                    yearNumber: client_1.YearLevel.THREE,
                    pricePerMonth: 140.0,
                    pricePerYear: 1400.0,
                    isActive: true,
                },
            });
            const fourthYearPack = yield prisma.studyPack.create({
                data: {
                    name: 'Fourth Year Medicine',
                    description: 'Fourth year medical curriculum',
                    type: client_1.PackType.YEAR,
                    yearNumber: client_1.YearLevel.FOUR,
                    pricePerMonth: 160.0,
                    pricePerYear: 1600.0,
                    isActive: true,
                },
            });
            const fifthYearPack = yield prisma.studyPack.create({
                data: {
                    name: 'Fifth Year Medicine',
                    description: 'Fifth year medical curriculum',
                    type: client_1.PackType.YEAR,
                    yearNumber: client_1.YearLevel.FIVE,
                    pricePerMonth: 180.0,
                    pricePerYear: 1800.0,
                    isActive: true,
                },
            });
            const sixthYearPack = yield prisma.studyPack.create({
                data: {
                    name: 'Sixth Year Medicine',
                    description: 'Sixth year medical curriculum',
                    type: client_1.PackType.YEAR,
                    yearNumber: client_1.YearLevel.SIX,
                    pricePerMonth: 200.0,
                    pricePerYear: 2000.0,
                    isActive: true,
                },
            });
            const seventhYearPack = yield prisma.studyPack.create({
                data: {
                    name: 'Residency Medicine',
                    description: 'Seventh year medical curriculum',
                    type: client_1.PackType.YEAR,
                    yearNumber: client_1.YearLevel.SEVEN,
                    pricePerMonth: 220.0,
                    pricePerYear: 2200.0,
                    isActive: true,
                },
            });
            console.log('👥 Creating users...');
            const hashedPassword = yield bcrypt_1.default.hash('ayoubwassim/M8', 10);
            // Admin User
            const admin = yield prisma.user.create({
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
            yield prisma.refreshToken.create({
                data: {
                    userId: admin.id,
                    token: 'admin-refresh-token-1234567890',
                    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
                },
            });
            // 7. Create Subscriptions
            console.log('💳 Creating subscriptions...');
            // Admin Active Subscription
            yield prisma.subscription.create({
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
            const unite1 = yield prisma.unite.create({
                data: {
                    name: 'Fundamental Sciences',
                    studyPackId: firstYearPack.id,
                    description: 'Basic sciences for medical students',
                }
            });
            // Create Modules
            console.log('   Creating modules...');
            const moduleAnatomy = yield prisma.module.create({
                data: {
                    name: 'Anatomy',
                    uniteId: unite1.id,
                    description: 'Human Anatomy',
                }
            });
            const moduleCytology = yield prisma.module.create({
                data: {
                    name: 'Cytology',
                    uniteId: unite1.id,
                    description: 'Study of cells',
                }
            });
            // Create Courses
            console.log('   Creating courses...');
            const courseGeneralAnatomy = yield prisma.course.create({
                data: {
                    name: 'General Anatomy',
                    moduleId: moduleAnatomy.id,
                    description: 'Introduction to human body structure (Bones, Muscles, etc.)',
                }
            });
            const courseCellStructure = yield prisma.course.create({
                data: {
                    name: 'Cell Structure',
                    moduleId: moduleCytology.id,
                    description: 'Introduction to cell biology and organelles',
                }
            });
            // Create Question Sources
            console.log('   Creating question sources...');
            const residencySource = yield prisma.questionSource.create({
                data: { name: 'Residency Exam' }
            });
            const externshipSource = yield prisma.questionSource.create({
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
                yield prisma.question.create({
                    data: {
                        questionText: q.text,
                        explanation: q.explanation,
                        courseId: q.courseId,
                        createdById: admin.id,
                        questionType: client_1.QuestionType.SINGLE_CHOICE,
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
        }
        catch (error) {
            console.error('❌ Error during comprehensive seeding:', error);
            throw error;
        }
    });
}
main()
    .catch((e) => {
    console.error(e);
    process.exit(1);
})
    .finally(() => __awaiter(void 0, void 0, void 0, function* () {
    yield prisma.$disconnect();
}));
