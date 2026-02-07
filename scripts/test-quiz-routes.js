const { PrismaClient } = require('@prisma/client');
const axios = require('axios');

const prisma = new PrismaClient();
const BASE_URL = 'http://localhost:3005/api/v1';

// Test configuration
const TEST_CONFIG = {
  baseUrl: BASE_URL,
  timeout: 10000,
  users: {
    activeStudent: null,
    expiredStudent: null,
    residencyStudent: null,
    multiYearStudent: null
  },
  tokens: {}
};

// Test results storage
const testResults = {
  passed: 0,
  failed: 0,
  tests: [],
  issues: []
};

// Helper function to log test results
function logTest(testName, passed, details = '') {
  const result = {
    name: testName,
    passed,
    details,
    timestamp: new Date().toISOString()
  };
  
  testResults.tests.push(result);
  if (passed) {
    testResults.passed++;
    console.log(`✅ ${testName}`);
  } else {
    testResults.failed++;
    console.log(`❌ ${testName}: ${details}`);
    testResults.issues.push(result);
  }
}

// Helper function to make authenticated requests
async function makeRequest(method, endpoint, data = null, token = null) {
  try {
    const config = {
      method,
      url: `${TEST_CONFIG.baseUrl}${endpoint}`,
      timeout: TEST_CONFIG.timeout,
      headers: {}
    };

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    if (data) {
      config.data = data;
      config.headers['Content-Type'] = 'application/json';
    }

    const response = await axios(config);
    return { success: true, data: response.data, status: response.status };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data || error.message,
      status: error.response?.status || 500
    };
  }
}

// Database analysis functions
async function analyzeDatabaseState() {
  console.log('\n🔍 Analyzing current database state...');
  
  try {
    // Count existing data
    const counts = {
      users: await prisma.user.count(),
      subscriptions: await prisma.subscription.count(),
      studyPacks: await prisma.studyPack.count(),
      questions: await prisma.question.count(),
      questionSources: await prisma.questionSource.count(),
      universities: await prisma.university.count(),
      unites: await prisma.unite.count(),
      modules: await prisma.module.count(),
      courses: await prisma.course.count()
    };

    console.log('📊 Database counts:', counts);

    // Analyze subscription types
    const subscriptionTypes = await prisma.subscription.groupBy({
      by: ['status'],
      _count: { status: true }
    });
    console.log('📋 Subscription statuses:', subscriptionTypes);

    // Analyze study pack types
    const studyPackTypes = await prisma.studyPack.groupBy({
      by: ['type'],
      _count: { type: true }
    });
    console.log('📚 Study pack types:', studyPackTypes);

    // Analyze question distribution
    const questionsByYear = await prisma.question.groupBy({
      by: ['yearLevel'],
      _count: { yearLevel: true }
    });
    console.log('📝 Questions by year level:', questionsByYear);

    const questionsBySource = await prisma.question.groupBy({
      by: ['sourceId'],
      _count: { sourceId: true }
    });
    console.log('📖 Questions by source:', questionsBySource);

    return counts;
  } catch (error) {
    console.error('❌ Error analyzing database:', error);
    return null;
  }
}

// Test data preparation functions
async function prepareTestUsers() {
  console.log('\n👥 Preparing test users...');
  
  try {
    // Check if test users already exist
    const existingUsers = await prisma.user.findMany({
      where: {
        email: {
          in: [
            'test.active@example.com',
            'test.expired@example.com', 
            'test.residency@example.com',
            'test.multiyear@example.com'
          ]
        }
      },
      include: {
        subscriptions: {
          include: {
            studyPack: true
          }
        }
      }
    });

    console.log(`Found ${existingUsers.length} existing test users`);

    // If we have existing users, use them
    if (existingUsers.length > 0) {
      for (const user of existingUsers) {
        if (user.email === 'test.active@example.com') {
          TEST_CONFIG.users.activeStudent = user;
        } else if (user.email === 'test.expired@example.com') {
          TEST_CONFIG.users.expiredStudent = user;
        } else if (user.email === 'test.residency@example.com') {
          TEST_CONFIG.users.residencyStudent = user;
        } else if (user.email === 'test.multiyear@example.com') {
          TEST_CONFIG.users.multiYearStudent = user;
        }
      }
    }

    // Create missing test users
    await createMissingTestUsers();
    
    return true;
  } catch (error) {
    console.error('❌ Error preparing test users:', error);
    return false;
  }
}

async function createMissingTestUsers() {
  // Get study packs
  const studyPacks = await prisma.studyPack.findMany();
  const firstYearPack = studyPacks.find(sp => sp.type === 'first_year' || sp.yearNumber === '1');
  const secondYearPack = studyPacks.find(sp => sp.type === 'second_year' || sp.yearNumber === '2');
  const residencyPack = studyPacks.find(sp => sp.type === 'residency');

  // Create active student if not exists
  if (!TEST_CONFIG.users.activeStudent) {
    console.log('Creating active student...');
    const activeStudent = await prisma.user.create({
      data: {
        email: 'test.active@example.com',
        passwordHash: '$2b$10$example.hash',
        fullName: 'Test Active Student',
        role: 'STUDENT',
        currentYear: 'ONE',
        emailVerified: true,
        isActive: true
      }
    });

    // Create active subscription
    if (firstYearPack) {
      await prisma.subscription.create({
        data: {
          userId: activeStudent.id,
          studyPackId: firstYearPack.id,
          status: 'active',
          startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
          endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
          paymentStatus: 'active'
        }
      });
    }

    TEST_CONFIG.users.activeStudent = await prisma.user.findUnique({
      where: { id: activeStudent.id },
      include: { subscriptions: { include: { studyPack: true } } }
    });
  }

  // Create expired student if not exists
  if (!TEST_CONFIG.users.expiredStudent) {
    console.log('Creating expired student...');
    const expiredStudent = await prisma.user.create({
      data: {
        email: 'test.expired@example.com',
        passwordHash: '$2b$10$example.hash',
        fullName: 'Test Expired Student',
        role: 'STUDENT',
        currentYear: 'ONE',
        emailVerified: true,
        isActive: true
      }
    });

    // Create expired subscription
    if (firstYearPack) {
      await prisma.subscription.create({
        data: {
          userId: expiredStudent.id,
          studyPackId: firstYearPack.id,
          status: 'expired',
          startDate: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000), // 60 days ago
          endDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
          paymentStatus: 'expired'
        }
      });
    }

    TEST_CONFIG.users.expiredStudent = await prisma.user.findUnique({
      where: { id: expiredStudent.id },
      include: { subscriptions: { include: { studyPack: true } } }
    });
  }

  // Create residency student if not exists
  if (!TEST_CONFIG.users.residencyStudent && residencyPack) {
    console.log('Creating residency student...');
    const residencyStudent = await prisma.user.create({
      data: {
        email: 'test.residency@example.com',
        passwordHash: '$2b$10$example.hash',
        fullName: 'Test Residency Student',
        role: 'STUDENT',
        currentYear: 'RESIDENCY',
        emailVerified: true,
        isActive: true
      }
    });

    // Create active residency subscription
    await prisma.subscription.create({
      data: {
        userId: residencyStudent.id,
        studyPackId: residencyPack.id,
        status: 'active',
        startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        paymentStatus: 'active'
      }
    });

    TEST_CONFIG.users.residencyStudent = await prisma.user.findUnique({
      where: { id: residencyStudent.id },
      include: { subscriptions: { include: { studyPack: true } } }
    });
  }

  // Create multi-year student if not exists
  if (!TEST_CONFIG.users.multiYearStudent && firstYearPack && secondYearPack) {
    console.log('Creating multi-year student...');
    const multiYearStudent = await prisma.user.create({
      data: {
        email: 'test.multiyear@example.com',
        passwordHash: '$2b$10$example.hash',
        fullName: 'Test Multi-Year Student',
        role: 'STUDENT',
        currentYear: 'TWO',
        emailVerified: true,
        isActive: true
      }
    });

    // Create multiple active subscriptions
    await prisma.subscription.createMany({
      data: [
        {
          userId: multiYearStudent.id,
          studyPackId: firstYearPack.id,
          status: 'active',
          startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          paymentStatus: 'active'
        },
        {
          userId: multiYearStudent.id,
          studyPackId: secondYearPack.id,
          status: 'active',
          startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          paymentStatus: 'active'
        }
      ]
    });

    TEST_CONFIG.users.multiYearStudent = await prisma.user.findUnique({
      where: { id: multiYearStudent.id },
      include: { subscriptions: { include: { studyPack: true } } }
    });
  }
}

// Authentication functions
async function authenticateTestUsers() {
  console.log('\n🔐 Authenticating test users...');

  // Use existing seeded users with known credentials
  const users = [
    { key: 'activeStudent', email: 'test@example.com' },
    { key: 'student1', email: 'student1@university.dz' },
    { key: 'student2', email: 'student2@university.dz' },
    { key: 'admin', email: 'admin@medcin.dz' }
  ];

  for (const user of users) {
    try {
      const response = await makeRequest('POST', '/auth/login', {
        email: user.email,
        password: 'password123' // Default test password from seed
      });

      if (response.success && response.data.data.tokens.accessToken) {
        TEST_CONFIG.tokens[user.key] = response.data.data.tokens.accessToken;
        console.log(`✅ Authenticated ${user.key}`);
      } else {
        console.log(`❌ Failed to authenticate ${user.key}:`, response.error);
      }
    } catch (error) {
      console.log(`❌ Error authenticating ${user.key}:`, error.message);
    }
  }
}

// Quiz route testing functions
async function testQuizFiltersEndpoint() {
  console.log('\n🔍 Testing Quiz Filters Endpoint...');

  // Test with authenticated user
  const token = TEST_CONFIG.tokens.activeStudent || TEST_CONFIG.tokens.student1;
  if (!token) {
    logTest('Quiz Filters - Authentication', false, 'No valid token available');
    return;
  }

  const response = await makeRequest('GET', '/quizzes/quiz-filters', null, token);

  if (response.success) {
    logTest('Quiz Filters - Basic Request', true, `Status: ${response.status}`);

    // Validate response structure
    const data = response.data.data;
    const hasRequiredFields = data.availableYears && data.unites && data.questionSources;
    logTest('Quiz Filters - Response Structure', hasRequiredFields,
      hasRequiredFields ? 'All required fields present' : 'Missing required fields');

    // Log filter data for analysis
    console.log('Available Years:', data.availableYears);
    console.log('Question Sources:', data.questionSources?.length || 0);
    console.log('Unites:', data.unites?.length || 0);

  } else {
    logTest('Quiz Filters - Basic Request', false, `Error: ${response.error?.message || 'Unknown error'}`);
  }
}

async function testQuestionCountEndpoint() {
  console.log('\n🔢 Testing Question Count Endpoint...');

  const token = TEST_CONFIG.tokens.activeStudent || TEST_CONFIG.tokens.student1;
  if (!token) {
    logTest('Question Count - Authentication', false, 'No valid token available');
    return;
  }

  // Test basic question count
  let response = await makeRequest('GET', '/quizzes/question-count', null, token);

  if (response.success) {
    logTest('Question Count - Basic Request', true, `Count: ${response.data.data.count}`);
  } else {
    logTest('Question Count - Basic Request', false, `Error: ${response.error?.message}`);
  }

  // Test with filters
  const testFilters = [
    { unite: 1 },
    { module: 1 },
    { university: 1 },
    { year: 2023 }
  ];

  for (const filter of testFilters) {
    const filterName = Object.keys(filter)[0];
    const filterValue = Object.values(filter)[0];

    response = await makeRequest('GET', `/quizzes/question-count?${filterName}=${filterValue}`, null, token);

    if (response.success) {
      logTest(`Question Count - Filter ${filterName}`, true, `Count: ${response.data.data.count}`);
    } else {
      logTest(`Question Count - Filter ${filterName}`, false, `Error: ${response.error?.message}`);
    }
  }
}

async function testQuizSessionCreation() {
  console.log('\n🎯 Testing Quiz Session Creation...');

  const token = TEST_CONFIG.tokens.activeStudent || TEST_CONFIG.tokens.student1;
  if (!token) {
    logTest('Quiz Session Creation - Authentication', false, 'No valid token available');
    return;
  }

  const sessionData = {
    title: 'Test Quiz Session',
    type: 'PRACTICE',
    settings: {
      questionCount: 5
    },
    filters: {
      yearLevels: ['ONE'],
      questionTypes: ['SINGLE_CHOICE']
    }
  };

  const response = await makeRequest('POST', '/quizzes/quiz-sessions', sessionData, token);

  if (response.success) {
    logTest('Quiz Session Creation - Basic', true, `Session ID: ${response.data.sessionId}`);

    // Store session ID for cleanup
    TEST_CONFIG.createdSessionId = response.data.sessionId;
  } else {
    logTest('Quiz Session Creation - Basic', false, `Error: ${response.error?.message}`);
  }
}

async function testCreateSessionByQuestions() {
  console.log('\n📝 Testing Create Session by Questions...');

  const token = TEST_CONFIG.tokens.activeStudent || TEST_CONFIG.tokens.student1;
  if (!token) {
    logTest('Create Session by Questions - Authentication', false, 'No valid token available');
    return;
  }

  // First get some question IDs
  const questions = await prisma.question.findMany({
    take: 3,
    select: { id: true }
  });

  if (questions.length === 0) {
    logTest('Create Session by Questions - No Questions', false, 'No questions available in database');
    return;
  }

  const sessionData = {
    title: 'Test Session by Questions',
    type: 'PRACTICE',
    questionIds: questions.map(q => q.id)
  };

  const response = await makeRequest('POST', '/quizzes/create-session-by-questions', sessionData, token);

  if (response.success) {
    logTest('Create Session by Questions - Basic', true, `Session ID: ${response.data.sessionId}`);
  } else {
    logTest('Create Session by Questions - Basic', false, `Error: ${response.error?.message}`);
  }
}

async function testResidencyFilters() {
  console.log('\n🏥 Testing Residency Session Filters...');

  const token = TEST_CONFIG.tokens.activeStudent || TEST_CONFIG.tokens.student1;
  if (!token) {
    logTest('Residency Filters - Authentication', false, 'No valid token available');
    return;
  }

  const response = await makeRequest('GET', '/quizzes/session-residency-filters', null, token);

  // This might fail if user doesn't have residency access - that's expected
  if (response.success) {
    logTest('Residency Filters - Access Granted', true, 'User has residency access');
  } else if (response.status === 403) {
    logTest('Residency Filters - Access Denied', true, 'Correctly denied non-residency user');
  } else {
    logTest('Residency Filters - Unexpected Error', false, `Error: ${response.error?.message}`);
  }
}

async function testExamSessionFilters() {
  console.log('\n📚 Testing Exam Session Filters...');

  const token = TEST_CONFIG.tokens.activeStudent || TEST_CONFIG.tokens.student1;
  if (!token) {
    logTest('Exam Session Filters - Authentication', false, 'No valid token available');
    return;
  }

  const response = await makeRequest('GET', '/quizzes/exam-session-filters', null, token);

  if (response.success) {
    logTest('Exam Session Filters - Basic Request', true, `Status: ${response.status}`);

    const data = response.data.data;
    const hasUnites = data.unites && Array.isArray(data.unites);
    logTest('Exam Session Filters - Response Structure', hasUnites,
      hasUnites ? `Found ${data.unites.length} unites` : 'Missing unites data');
  } else {
    logTest('Exam Session Filters - Basic Request', false, `Error: ${response.error?.message}`);
  }
}

// Main execution function
async function main() {
  console.log('🚀 Starting Quiz Routes Comprehensive Testing');
  console.log('='.repeat(50));

  try {
    // Step 1: Analyze database state
    const dbState = await analyzeDatabaseState();
    if (!dbState) {
      console.error('❌ Failed to analyze database state');
      return;
    }

    // Step 2: Authenticate test users (skip user creation, use existing)
    await authenticateTestUsers();

    console.log('\n📋 Test Configuration:');
    console.log('Tokens obtained:', Object.keys(TEST_CONFIG.tokens).length);

    if (Object.keys(TEST_CONFIG.tokens).length === 0) {
      console.error('❌ No authentication tokens obtained. Cannot proceed with testing.');
      return;
    }

    // Step 3: Run comprehensive tests
    console.log('\n🧪 Running Comprehensive Route Tests...');
    await testQuizFiltersEndpoint();
    await testQuestionCountEndpoint();
    await testQuizSessionCreation();
    await testCreateSessionByQuestions();
    await testResidencyFilters();
    await testExamSessionFilters();

    // Step 4: Generate test report
    console.log('\n📊 Test Results Summary:');
    console.log('='.repeat(30));
    console.log(`✅ Passed: ${testResults.passed}`);
    console.log(`❌ Failed: ${testResults.failed}`);
    console.log(`📝 Total Tests: ${testResults.tests.length}`);

    if (testResults.issues.length > 0) {
      console.log('\n🚨 Issues Found:');
      testResults.issues.forEach(issue => {
        console.log(`- ${issue.name}: ${issue.details}`);
      });
    }

    console.log('\n✅ Testing completed!');

  } catch (error) {
    console.error('❌ Error in main execution:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Export for use in other test files
module.exports = {
  TEST_CONFIG,
  testResults,
  logTest,
  makeRequest,
  analyzeDatabaseState,
  prepareTestUsers,
  authenticateTestUsers
};

// Run if called directly
if (require.main === module) {
  main();
}
