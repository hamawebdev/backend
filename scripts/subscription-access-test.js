const { PrismaClient } = require('@prisma/client');
const axios = require('axios');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();
const BASE_URL = 'http://localhost:3005/api/v1';

// Test configuration
const TEST_CONFIG = {
  baseUrl: BASE_URL,
  timeout: 10000,
  tokens: {},
  testUsers: {}
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

// Create test users with different subscription statuses
async function createTestUsers() {
  console.log('\n👥 Creating test users with different subscription statuses...');
  
  const hashedPassword = await bcrypt.hash('password123', 10);
  
  // Get study packs
  const studyPacks = await prisma.studyPack.findMany();
  const firstYearPack = studyPacks.find(sp => sp.type === 'YEAR' && sp.yearNumber === 'ONE');
  const residencyPack = studyPacks.find(sp => sp.type === 'RESIDENCY');
  
  if (!firstYearPack) {
    console.error('❌ No first year study pack found');
    return false;
  }

  try {
    // 1. Student with active subscription
    const activeStudent = await prisma.user.upsert({
      where: { email: 'test.active.student@example.com' },
      update: {},
      create: {
        email: 'test.active.student@example.com',
        passwordHash: hashedPassword,
        fullName: 'Test Active Student',
        role: 'STUDENT',
        currentYear: 'ONE',
        emailVerified: true,
        isActive: true
      }
    });

    // Create active subscription
    const existingActiveSub = await prisma.subscription.findFirst({
      where: {
        userId: activeStudent.id,
        studyPackId: firstYearPack.id
      }
    });

    if (existingActiveSub) {
      await prisma.subscription.update({
        where: { id: existingActiveSub.id },
        data: {
          status: 'ACTIVE',
          startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          amountPaid: 100.0,
          paymentMethod: 'test'
        }
      });
    } else {
      await prisma.subscription.create({
        data: {
          userId: activeStudent.id,
          studyPackId: firstYearPack.id,
          status: 'ACTIVE',
          startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          amountPaid: 100.0,
          paymentMethod: 'test'
        }
      });
    }

    TEST_CONFIG.testUsers.activeStudent = activeStudent;
    console.log('✅ Created active student');

    // 2. Student with expired subscription
    const expiredStudent = await prisma.user.upsert({
      where: { email: 'test.expired.student@example.com' },
      update: {},
      create: {
        email: 'test.expired.student@example.com',
        passwordHash: hashedPassword,
        fullName: 'Test Expired Student',
        role: 'STUDENT',
        currentYear: 'ONE',
        emailVerified: true,
        isActive: true
      }
    });

    // Create expired subscription
    const existingExpiredSub = await prisma.subscription.findFirst({
      where: {
        userId: expiredStudent.id,
        studyPackId: firstYearPack.id
      }
    });

    if (existingExpiredSub) {
      await prisma.subscription.update({
        where: { id: existingExpiredSub.id },
        data: {
          status: 'EXPIRED',
          startDate: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
          endDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          amountPaid: 100.0,
          paymentMethod: 'test'
        }
      });
    } else {
      await prisma.subscription.create({
        data: {
          userId: expiredStudent.id,
          studyPackId: firstYearPack.id,
          status: 'EXPIRED',
          startDate: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
          endDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          amountPaid: 100.0,
          paymentMethod: 'test'
        }
      });
    }

    TEST_CONFIG.testUsers.expiredStudent = expiredStudent;
    console.log('✅ Created expired student');

    // 3. Student with no subscription
    const noSubStudent = await prisma.user.upsert({
      where: { email: 'test.nosub.student@example.com' },
      update: {},
      create: {
        email: 'test.nosub.student@example.com',
        passwordHash: hashedPassword,
        fullName: 'Test No Subscription Student',
        role: 'STUDENT',
        currentYear: 'ONE',
        emailVerified: true,
        isActive: true
      }
    });

    TEST_CONFIG.testUsers.noSubStudent = noSubStudent;
    console.log('✅ Created no subscription student');

    // 4. Student with residency subscription (if available)
    if (residencyPack) {
      const residencyStudent = await prisma.user.upsert({
        where: { email: 'test.residency.student@example.com' },
        update: {},
        create: {
          email: 'test.residency.student@example.com',
          passwordHash: hashedPassword,
          fullName: 'Test Residency Student',
          role: 'STUDENT',
          currentYear: 'SEVEN',
          emailVerified: true,
          isActive: true
        }
      });

      // Create active residency subscription
      const existingResidencySub = await prisma.subscription.findFirst({
        where: {
          userId: residencyStudent.id,
          studyPackId: residencyPack.id
        }
      });

      if (existingResidencySub) {
        await prisma.subscription.update({
          where: { id: existingResidencySub.id },
          data: {
            status: 'ACTIVE',
            startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
            endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            amountPaid: 200.0,
            paymentMethod: 'test'
          }
        });
      } else {
        await prisma.subscription.create({
          data: {
            userId: residencyStudent.id,
            studyPackId: residencyPack.id,
            status: 'ACTIVE',
            startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
            endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            amountPaid: 200.0,
            paymentMethod: 'test'
          }
        });
      }

      TEST_CONFIG.testUsers.residencyStudent = residencyStudent;
      console.log('✅ Created residency student');
    }

    return true;
  } catch (error) {
    console.error('❌ Error creating test users:', error);
    return false;
  }
}

// Authenticate test users
async function authenticateTestUsers() {
  console.log('\n🔐 Authenticating test users...');
  
  const userKeys = Object.keys(TEST_CONFIG.testUsers);
  
  for (const userKey of userKeys) {
    const user = TEST_CONFIG.testUsers[userKey];
    
    try {
      const response = await makeRequest('POST', '/auth/login', {
        email: user.email,
        password: 'password123'
      });

      if (response.success && response.data.data.tokens.accessToken) {
        TEST_CONFIG.tokens[userKey] = response.data.data.tokens.accessToken;
        console.log(`✅ Authenticated ${userKey}`);
        
        // Store user subscription info for analysis
        const tokenPayload = JSON.parse(Buffer.from(response.data.data.tokens.accessToken.split('.')[1], 'base64').toString());
        TEST_CONFIG.testUsers[userKey].tokenData = {
          hasActiveSubscription: tokenPayload.has_active_subscription,
          accessibleStudyPacks: tokenPayload.accessible_study_packs,
          subscriptions: tokenPayload.subscriptions
        };
      } else {
        console.log(`❌ Failed to authenticate ${userKey}:`, response.error);
      }
    } catch (error) {
      console.log(`❌ Error authenticating ${userKey}:`, error.message);
    }
  }
}

// Test subscription access control
async function testSubscriptionAccessControl() {
  console.log('\n🔒 Testing Subscription Access Control...');
  
  const endpoints = [
    { name: 'Quiz Filters', path: '/quizzes/quiz-filters', method: 'GET' },
    { name: 'Question Count', path: '/quizzes/question-count', method: 'GET' },
    { name: 'Exam Session Filters', path: '/quizzes/exam-session-filters', method: 'GET' }
  ];

  for (const [userKey, token] of Object.entries(TEST_CONFIG.tokens)) {
    const user = TEST_CONFIG.testUsers[userKey];
    const hasActiveSub = user.tokenData?.hasActiveSubscription || false;
    
    console.log(`\n👤 Testing ${userKey} (Active Sub: ${hasActiveSub})`);
    
    for (const endpoint of endpoints) {
      const response = await makeRequest(endpoint.method, endpoint.path, null, token);
      
      if (hasActiveSub) {
        // Should have access
        logTest(`${userKey} - ${endpoint.name} (Should Access)`, response.success, 
          response.success ? 'Access granted' : `Denied: ${response.error?.message || 'Unknown error'}`);
      } else {
        // Should be denied
        logTest(`${userKey} - ${endpoint.name} (Should Deny)`, !response.success && response.status === 403, 
          response.success ? 'Unexpected access granted' : 'Correctly denied access');
      }
    }
  }
}

// Test residency access
async function testResidencyAccess() {
  console.log('\n🏥 Testing Residency Access...');
  
  for (const [userKey, token] of Object.entries(TEST_CONFIG.tokens)) {
    const user = TEST_CONFIG.testUsers[userKey];
    const isResidency = user.tokenData?.subscriptions?.some(sub => sub.pack_type === 'RESIDENCY') || false;
    
    const response = await makeRequest('GET', '/quizzes/session-residency-filters', null, token);
    
    if (isResidency) {
      logTest(`${userKey} - Residency Filters (Should Access)`, response.success, 
        response.success ? 'Access granted' : `Denied: ${response.error?.message || 'Unknown error'}`);
    } else {
      logTest(`${userKey} - Residency Filters (Should Deny)`, !response.success, 
        response.success ? 'Unexpected access granted' : 'Correctly denied access');
    }
  }
}

// Main execution function
async function main() {
  console.log('🚀 Starting Subscription Access Control Testing');
  console.log('='.repeat(60));

  try {
    // Step 1: Create test users
    const usersCreated = await createTestUsers();
    if (!usersCreated) {
      console.error('❌ Failed to create test users');
      return;
    }

    // Step 2: Authenticate users
    await authenticateTestUsers();

    if (Object.keys(TEST_CONFIG.tokens).length === 0) {
      console.error('❌ No authentication tokens obtained. Cannot proceed with testing.');
      return;
    }

    // Step 3: Test subscription access control
    await testSubscriptionAccessControl();

    // Step 4: Test residency access
    await testResidencyAccess();

    // Step 5: Generate report
    console.log('\n📊 SUBSCRIPTION ACCESS TEST RESULTS');
    console.log('='.repeat(40));
    console.log(`✅ Total Passed: ${testResults.passed}`);
    console.log(`❌ Total Failed: ${testResults.failed}`);
    console.log(`📝 Total Tests: ${testResults.tests.length}`);

    if (testResults.issues.length > 0) {
      console.log('\n🚨 ISSUES FOUND:');
      testResults.issues.forEach((issue, index) => {
        console.log(`${index + 1}. ${issue.name}`);
        console.log(`   Details: ${issue.details}`);
        console.log(`   Time: ${issue.timestamp}`);
      });
    }

    console.log('\n✅ Subscription access control testing completed!');

  } catch (error) {
    console.error('❌ Error in main execution:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = {
  TEST_CONFIG,
  testResults,
  createTestUsers,
  authenticateTestUsers,
  testSubscriptionAccessControl,
  testResidencyAccess
};
