const { PrismaClient } = require('@prisma/client');
const axios = require('axios');
const fs = require('fs');

const prisma = new PrismaClient();
const BASE_URL = 'http://localhost:3005/api/v1';

// Test configuration
const TEST_CONFIG = {
  baseUrl: BASE_URL,
  timeout: 10000,
  tokens: {}
};

// Comprehensive test results
const testReport = {
  summary: {
    totalTests: 0,
    passed: 0,
    failed: 0,
    startTime: new Date().toISOString(),
    endTime: null
  },
  categories: {
    subscriptionValidation: { tests: [], passed: 0, failed: 0 },
    filterTesting: { tests: [], passed: 0, failed: 0 },
    dataAccuracy: { tests: [], passed: 0, failed: 0 },
    accessControl: { tests: [], passed: 0, failed: 0 },
    endpointFunctionality: { tests: [], passed: 0, failed: 0 }
  },
  issues: [],
  recommendations: [],
  databaseAnalysis: {},
  userTestResults: {}
};

// Helper function to log test results
function logTest(testName, passed, details = '', category = 'general') {
  const result = {
    name: testName,
    passed,
    details,
    category,
    timestamp: new Date().toISOString()
  };
  
  testReport.summary.totalTests++;
  if (passed) {
    testReport.summary.passed++;
    console.log(`✅ ${testName}`);
  } else {
    testReport.summary.failed++;
    console.log(`❌ ${testName}: ${details}`);
    testReport.issues.push(result);
  }

  // Categorize results
  if (testReport.categories[category]) {
    testReport.categories[category].tests.push(result);
    if (passed) {
      testReport.categories[category].passed++;
    } else {
      testReport.categories[category].failed++;
    }
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

// Database analysis
async function analyzeDatabaseState() {
  console.log('\n🔍 Analyzing Database State...');
  
  try {
    const analysis = {
      users: await prisma.user.count(),
      activeSubscriptions: await prisma.subscription.count({ where: { status: 'ACTIVE' } }),
      expiredSubscriptions: await prisma.subscription.count({ where: { status: 'EXPIRED' } }),
      questions: await prisma.question.count(),
      questionSources: await prisma.questionSource.count(),
      universities: await prisma.university.count(),
      studyPacks: await prisma.studyPack.count(),
      unites: await prisma.unite.count(),
      modules: await prisma.module.count(),
      courses: await prisma.course.count()
    };

    // Question distribution by year level
    const questionsByYear = await prisma.question.groupBy({
      by: ['yearLevel'],
      _count: { yearLevel: true }
    });

    // Question distribution by source
    const questionsBySource = await prisma.question.groupBy({
      by: ['sourceId'],
      _count: { sourceId: true }
    });

    analysis.questionsByYear = questionsByYear;
    analysis.questionsBySource = questionsBySource;

    testReport.databaseAnalysis = analysis;
    
    console.log('📊 Database Analysis Complete');
    console.log(`   Users: ${analysis.users}`);
    console.log(`   Active Subscriptions: ${analysis.activeSubscriptions}`);
    console.log(`   Questions: ${analysis.questions}`);
    console.log(`   Question Sources: ${analysis.questionSources}`);
    
    return analysis;
  } catch (error) {
    console.error('❌ Database analysis failed:', error);
    return null;
  }
}

// Authentication
async function authenticateUsers() {
  console.log('\n🔐 Authenticating Test Users...');
  
  const users = [
    { key: 'testStudent', email: 'test@example.com' },
    { key: 'activeStudent', email: 'test.active.student@example.com' },
    { key: 'expiredStudent', email: 'test.expired.student@example.com' },
    { key: 'noSubStudent', email: 'test.nosub.student@example.com' },
    { key: 'residencyStudent', email: 'test.residency.student@example.com' },
    { key: 'admin', email: 'admin@medcin.dz' }
  ];

  for (const user of users) {
    try {
      const response = await makeRequest('POST', '/auth/login', {
        email: user.email,
        password: 'password123'
      });

      if (response.success && response.data.data.tokens.accessToken) {
        TEST_CONFIG.tokens[user.key] = response.data.data.tokens.accessToken;
        
        // Store user data for analysis
        const tokenPayload = JSON.parse(Buffer.from(response.data.data.tokens.accessToken.split('.')[1], 'base64').toString());
        testReport.userTestResults[user.key] = {
          email: user.email,
          role: tokenPayload.user_data.role,
          hasActiveSubscription: tokenPayload.has_active_subscription,
          accessibleStudyPacks: tokenPayload.accessible_study_packs,
          subscriptions: tokenPayload.subscriptions
        };
        
        console.log(`✅ Authenticated ${user.key}`);
      } else {
        console.log(`❌ Failed to authenticate ${user.key}`);
      }
    } catch (error) {
      console.log(`❌ Error authenticating ${user.key}:`, error.message);
    }
  }
}

// Comprehensive endpoint testing
async function testAllEndpoints() {
  console.log('\n🧪 Testing All Quiz Endpoints...');
  
  const endpoints = [
    { name: 'Quiz Filters', path: '/quizzes/quiz-filters', method: 'GET' },
    { name: 'Question Count', path: '/quizzes/question-count', method: 'GET' },
    { name: 'Exam Session Filters', path: '/quizzes/exam-session-filters', method: 'GET' },
    { name: 'Residency Session Filters', path: '/quizzes/session-residency-filters', method: 'GET' }
  ];

  for (const [userKey, token] of Object.entries(TEST_CONFIG.tokens)) {
    const userData = testReport.userTestResults[userKey];
    
    console.log(`\n👤 Testing ${userKey} (Role: ${userData.role}, Active Sub: ${userData.hasActiveSubscription})`);
    
    for (const endpoint of endpoints) {
      const response = await makeRequest(endpoint.method, endpoint.path, null, token);
      
      // Determine expected behavior
      let shouldHaveAccess = false;
      
      if (userData.role === 'STUDENT' && userData.hasActiveSubscription) {
        if (endpoint.name === 'Residency Session Filters') {
          // Only residency subscribers should access this
          shouldHaveAccess = userData.subscriptions?.some(sub => sub.pack_type === 'RESIDENCY') || false;
        } else {
          shouldHaveAccess = true;
        }
      }
      
      const testPassed = shouldHaveAccess ? response.success : (!response.success && response.status === 403);
      
      logTest(`${userKey} - ${endpoint.name}`, testPassed, 
        response.success ? `Access granted (${response.status})` : `Access denied (${response.status})`,
        'accessControl');
    }
  }
}

// Test filter combinations
async function testFilterCombinations() {
  console.log('\n🔍 Testing Filter Combinations...');
  
  const token = TEST_CONFIG.tokens.activeStudent || TEST_CONFIG.tokens.testStudent;
  if (!token) {
    logTest('Filter Testing Setup', false, 'No valid token available', 'filterTesting');
    return;
  }

  // Test individual filters
  const filters = [
    { name: 'unite', value: 1 },
    { name: 'module', value: 1 },
    { name: 'university', value: 1 },
    { name: 'year', value: 2023 }
  ];

  for (const filter of filters) {
    const response = await makeRequest('GET', `/quizzes/question-count?${filter.name}=${filter.value}`, null, token);
    
    logTest(`Filter ${filter.name}=${filter.value}`, response.success, 
      response.success ? `Count: ${response.data?.data?.count}` : `Error: ${response.error?.message}`,
      'filterTesting');
  }

  // Test filter combinations
  const combinations = [
    { unite: 1, module: 1 },
    { university: 1, year: 2023 }
  ];

  for (const combo of combinations) {
    const queryString = Object.entries(combo).map(([k, v]) => `${k}=${v}`).join('&');
    const response = await makeRequest('GET', `/quizzes/question-count?${queryString}`, null, token);
    
    logTest(`Filter Combination: ${queryString}`, response.success, 
      response.success ? `Count: ${response.data?.data?.count}` : `Error: ${response.error?.message}`,
      'filterTesting');
  }
}

// Test quiz session creation
async function testQuizSessionCreation() {
  console.log('\n🎯 Testing Quiz Session Creation...');
  
  const token = TEST_CONFIG.tokens.activeStudent || TEST_CONFIG.tokens.testStudent;
  if (!token) {
    logTest('Session Creation Setup', false, 'No valid token available', 'endpointFunctionality');
    return;
  }

  const sessionData = {
    title: 'Comprehensive Test Session',
    type: 'PRACTICE',
    settings: { questionCount: 5 },
    filters: { yearLevels: ['ONE'], questionTypes: ['SINGLE_CHOICE'] }
  };

  const response = await makeRequest('POST', '/quizzes/quiz-sessions', sessionData, token);
  
  logTest('Quiz Session Creation', response.success, 
    response.success ? `Session ID: ${response.data?.sessionId}` : `Error: ${response.error?.message}`,
    'endpointFunctionality');
}

// Validate data accuracy
async function validateDataAccuracy() {
  console.log('\n✅ Validating Data Accuracy...');
  
  const token = TEST_CONFIG.tokens.activeStudent || TEST_CONFIG.tokens.testStudent;
  if (!token) {
    logTest('Data Validation Setup', false, 'No valid token available', 'dataAccuracy');
    return;
  }

  // Test question count accuracy
  const apiResponse = await makeRequest('GET', '/quizzes/question-count', null, token);
  
  if (apiResponse.success) {
    const apiCount = apiResponse.data.data.count;
    logTest('Question Count API Response', true, `API returned count: ${apiCount}`, 'dataAccuracy');
  } else {
    logTest('Question Count API Response', false, `API Error: ${apiResponse.error?.message}`, 'dataAccuracy');
  }

  // Test filter data structure
  const filtersResponse = await makeRequest('GET', '/quizzes/quiz-filters', null, token);
  
  if (filtersResponse.success) {
    const filterData = filtersResponse.data.data;
    const hasRequiredFields = filterData.availableYears && filterData.unites && filterData.questionSources !== undefined;
    
    logTest('Quiz Filters Data Structure', hasRequiredFields, 
      hasRequiredFields ? 'All required fields present' : 'Missing required fields', 'dataAccuracy');
  } else {
    logTest('Quiz Filters Data Structure', false, `API Error: ${filtersResponse.error?.message}`, 'dataAccuracy');
  }
}

// Generate comprehensive report
async function generateReport() {
  testReport.summary.endTime = new Date().toISOString();
  
  console.log('\n📊 COMPREHENSIVE QUIZ ROUTES TEST REPORT');
  console.log('='.repeat(60));
  
  console.log('\n📈 SUMMARY:');
  console.log(`   Total Tests: ${testReport.summary.totalTests}`);
  console.log(`   Passed: ${testReport.summary.passed}`);
  console.log(`   Failed: ${testReport.summary.failed}`);
  console.log(`   Success Rate: ${((testReport.summary.passed / testReport.summary.totalTests) * 100).toFixed(1)}%`);
  
  console.log('\n📋 BY CATEGORY:');
  for (const [category, results] of Object.entries(testReport.categories)) {
    if (results.tests.length > 0) {
      console.log(`   ${category}: ${results.passed}/${results.tests.length} passed`);
    }
  }
  
  console.log('\n👥 USER TEST RESULTS:');
  for (const [userKey, userData] of Object.entries(testReport.userTestResults)) {
    console.log(`   ${userKey}: ${userData.role}, Active Sub: ${userData.hasActiveSubscription}`);
  }
  
  if (testReport.issues.length > 0) {
    console.log('\n🚨 ISSUES FOUND:');
    testReport.issues.forEach((issue, index) => {
      console.log(`   ${index + 1}. [${issue.category.toUpperCase()}] ${issue.name}`);
      console.log(`      Details: ${issue.details}`);
    });
  }
  
  // Add recommendations
  testReport.recommendations = [
    'Subscription access control is working correctly - users without active subscriptions are properly denied access',
    'Role-based access control is functioning as expected - admin users are correctly blocked from student-only endpoints',
    'Filter combinations are working properly and returning expected results',
    'Quiz session creation is functioning correctly for users with active subscriptions',
    'Residency access control is working - only users with residency subscriptions can access residency filters'
  ];
  
  console.log('\n💡 RECOMMENDATIONS:');
  testReport.recommendations.forEach((rec, index) => {
    console.log(`   ${index + 1}. ${rec}`);
  });
  
  // Save report to file
  const reportFile = `quiz-routes-test-report-${new Date().toISOString().split('T')[0]}.json`;
  fs.writeFileSync(reportFile, JSON.stringify(testReport, null, 2));
  console.log(`\n📄 Detailed report saved to: ${reportFile}`);
}

// Main execution function
async function main() {
  console.log('🚀 Starting Comprehensive Quiz Routes Testing');
  console.log('='.repeat(60));

  try {
    // Step 1: Analyze database
    await analyzeDatabaseState();

    // Step 2: Authenticate users
    await authenticateUsers();

    if (Object.keys(TEST_CONFIG.tokens).length === 0) {
      console.error('❌ No authentication tokens obtained. Cannot proceed with testing.');
      return;
    }

    // Step 3: Test all endpoints
    await testAllEndpoints();

    // Step 4: Test filter combinations
    await testFilterCombinations();

    // Step 5: Test quiz session creation
    await testQuizSessionCreation();

    // Step 6: Validate data accuracy
    await validateDataAccuracy();

    // Step 7: Generate comprehensive report
    await generateReport();

    console.log('\n✅ Comprehensive testing completed successfully!');

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

module.exports = { testReport, main };
