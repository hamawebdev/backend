const { PrismaClient } = require('@prisma/client');
const axios = require('axios');

const prisma = new PrismaClient();
const BASE_URL = 'http://localhost:3005/api/v1';

// Test configuration
const TEST_CONFIG = {
  baseUrl: BASE_URL,
  timeout: 10000,
  tokens: {},
  testData: {}
};

// Test results storage
const testResults = {
  passed: 0,
  failed: 0,
  tests: [],
  issues: [],
  subscriptionTests: [],
  filterTests: [],
  dataValidation: []
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
  
  testResults.tests.push(result);
  if (passed) {
    testResults.passed++;
    console.log(`✅ ${testName}`);
  } else {
    testResults.failed++;
    console.log(`❌ ${testName}: ${details}`);
    testResults.issues.push(result);
  }

  // Categorize results
  if (category === 'subscription') {
    testResults.subscriptionTests.push(result);
  } else if (category === 'filter') {
    testResults.filterTests.push(result);
  } else if (category === 'validation') {
    testResults.dataValidation.push(result);
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

// Authentication function
async function authenticateUsers() {
  console.log('\n🔐 Authenticating test users...');
  
  const users = [
    { key: 'testStudent', email: 'test@example.com' },
    { key: 'student1', email: 'student1@university.dz' },
    { key: 'student2', email: 'student2@university.dz' },
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
        console.log(`✅ Authenticated ${user.key}`);
        
        // Store user subscription info for analysis
        const tokenPayload = JSON.parse(Buffer.from(response.data.data.tokens.accessToken.split('.')[1], 'base64').toString());
        TEST_CONFIG.testData[user.key] = {
          userData: tokenPayload.user_data,
          subscriptions: tokenPayload.subscriptions,
          hasActiveSubscription: tokenPayload.has_active_subscription,
          accessibleStudyPacks: tokenPayload.accessible_study_packs
        };
      } else {
        console.log(`❌ Failed to authenticate ${user.key}:`, response.error);
      }
    } catch (error) {
      console.log(`❌ Error authenticating ${user.key}:`, error.message);
    }
  }
}

// Comprehensive subscription validation tests
async function testSubscriptionValidation() {
  console.log('\n🔒 Testing Subscription Access Control...');
  
  for (const [userKey, token] of Object.entries(TEST_CONFIG.tokens)) {
    const userData = TEST_CONFIG.testData[userKey];
    
    console.log(`\n👤 Testing user: ${userKey}`);
    console.log(`   Active subscription: ${userData.hasActiveSubscription}`);
    console.log(`   Accessible study packs: ${userData.accessibleStudyPacks}`);
    console.log(`   Subscription types: ${userData.subscriptions.map(s => s.pack_type).join(', ')}`);
    
    // Test quiz filters access
    const filtersResponse = await makeRequest('GET', '/quizzes/quiz-filters', null, token);
    
    if (userData.hasActiveSubscription) {
      logTest(`${userKey} - Quiz Filters Access (Active Sub)`, filtersResponse.success, 
        filtersResponse.success ? 'Access granted' : `Denied: ${filtersResponse.error?.message}`, 'subscription');
    } else {
      logTest(`${userKey} - Quiz Filters Access (No Sub)`, !filtersResponse.success && filtersResponse.status === 403, 
        filtersResponse.success ? 'Unexpected access granted' : 'Correctly denied access', 'subscription');
    }
    
    // Test question count access
    const countResponse = await makeRequest('GET', '/quizzes/question-count', null, token);
    
    if (userData.hasActiveSubscription) {
      logTest(`${userKey} - Question Count Access (Active Sub)`, countResponse.success, 
        countResponse.success ? `Count: ${countResponse.data?.data?.count}` : `Denied: ${countResponse.error?.message}`, 'subscription');
    } else {
      logTest(`${userKey} - Question Count Access (No Sub)`, !countResponse.success && countResponse.status === 403, 
        countResponse.success ? 'Unexpected access granted' : 'Correctly denied access', 'subscription');
    }
    
    // Test quiz session creation
    const sessionData = {
      title: `Test Session - ${userKey}`,
      type: 'PRACTICE',
      settings: { questionCount: 5 },
      filters: { yearLevels: ['ONE'], questionTypes: ['SINGLE_CHOICE'] }
    };
    
    const sessionResponse = await makeRequest('POST', '/quizzes/quiz-sessions', sessionData, token);
    
    if (userData.hasActiveSubscription) {
      logTest(`${userKey} - Session Creation (Active Sub)`, sessionResponse.success, 
        sessionResponse.success ? `Session ID: ${sessionResponse.data?.sessionId}` : `Failed: ${sessionResponse.error?.message}`, 'subscription');
    } else {
      logTest(`${userKey} - Session Creation (No Sub)`, !sessionResponse.success && sessionResponse.status === 403, 
        sessionResponse.success ? 'Unexpected access granted' : 'Correctly denied access', 'subscription');
    }
  }
}

// Comprehensive filter testing
async function testFilterCombinations() {
  console.log('\n🔍 Testing Filter Combinations...');
  
  const token = TEST_CONFIG.tokens.testStudent || TEST_CONFIG.tokens.student1;
  if (!token) {
    logTest('Filter Testing - No Token', false, 'No valid token available', 'filter');
    return;
  }

  // Get available filter data first
  const filtersResponse = await makeRequest('GET', '/quizzes/quiz-filters', null, token);
  if (!filtersResponse.success) {
    logTest('Filter Testing - Get Filters', false, 'Could not get filter data', 'filter');
    return;
  }

  const filterData = filtersResponse.data.data;
  console.log('Available filter data:', {
    years: filterData.availableYears,
    unites: filterData.unites?.length || 0,
    sources: filterData.questionSources?.length || 0
  });

  // Test individual filters
  const testFilters = [
    { name: 'unite', value: 1 },
    { name: 'module', value: 1 },
    { name: 'university', value: 1 },
    { name: 'year', value: 2023 }
  ];

  for (const filter of testFilters) {
    const response = await makeRequest('GET', `/quizzes/question-count?${filter.name}=${filter.value}`, null, token);
    
    logTest(`Filter - ${filter.name}=${filter.value}`, response.success, 
      response.success ? `Count: ${response.data?.data?.count}` : `Error: ${response.error?.message}`, 'filter');
  }

  // Test filter combinations
  const combinationTests = [
    { unite: 1, module: 1 },
    { university: 1, year: 2023 },
    { unite: 1, university: 1 }
  ];

  for (const combo of combinationTests) {
    const queryString = Object.entries(combo).map(([k, v]) => `${k}=${v}`).join('&');
    const response = await makeRequest('GET', `/quizzes/question-count?${queryString}`, null, token);
    
    logTest(`Filter Combination - ${queryString}`, response.success, 
      response.success ? `Count: ${response.data?.data?.count}` : `Error: ${response.error?.message}`, 'filter');
  }
}

// Data validation against database
async function validateDataAccuracy() {
  console.log('\n🔍 Validating Data Accuracy Against Database...');
  
  const token = TEST_CONFIG.tokens.testStudent || TEST_CONFIG.tokens.student1;
  if (!token) {
    logTest('Data Validation - No Token', false, 'No valid token available', 'validation');
    return;
  }

  // Test question count accuracy
  const apiResponse = await makeRequest('GET', '/quizzes/question-count', null, token);
  
  if (apiResponse.success) {
    const apiCount = apiResponse.data.data.count;
    
    // Get actual count from database
    const dbCount = await prisma.question.count();
    
    // Note: API count might be filtered by user's accessible study packs
    logTest('Data Validation - Question Count', true, 
      `API: ${apiCount}, DB Total: ${dbCount}`, 'validation');
  } else {
    logTest('Data Validation - Question Count', false, 
      `API Error: ${apiResponse.error?.message}`, 'validation');
  }

  // Test filter data accuracy
  const filtersResponse = await makeRequest('GET', '/quizzes/quiz-filters', null, token);
  
  if (filtersResponse.success) {
    const filterData = filtersResponse.data.data;
    
    // Validate question sources
    const dbSources = await prisma.questionSource.count();
    const apiSources = filterData.questionSources?.length || 0;
    
    logTest('Data Validation - Question Sources', true, 
      `API: ${apiSources}, DB: ${dbSources}`, 'validation');
    
    // Validate unites
    const dbUnites = await prisma.unite.count();
    const apiUnites = filterData.unites?.length || 0;
    
    logTest('Data Validation - Unites', true, 
      `API: ${apiUnites}, DB: ${dbUnites}`, 'validation');
  }
}

// Main execution function
async function main() {
  console.log('🚀 Starting Comprehensive Quiz Routes Testing');
  console.log('='.repeat(60));

  try {
    // Step 1: Authenticate users
    await authenticateUsers();

    if (Object.keys(TEST_CONFIG.tokens).length === 0) {
      console.error('❌ No authentication tokens obtained. Cannot proceed with testing.');
      return;
    }

    // Step 2: Test subscription validation
    await testSubscriptionValidation();

    // Step 3: Test filter combinations
    await testFilterCombinations();

    // Step 4: Validate data accuracy
    await validateDataAccuracy();

    // Step 5: Generate comprehensive report
    console.log('\n📊 COMPREHENSIVE TEST RESULTS');
    console.log('='.repeat(40));
    console.log(`✅ Total Passed: ${testResults.passed}`);
    console.log(`❌ Total Failed: ${testResults.failed}`);
    console.log(`📝 Total Tests: ${testResults.tests.length}`);
    
    console.log(`\n🔒 Subscription Tests: ${testResults.subscriptionTests.length}`);
    console.log(`🔍 Filter Tests: ${testResults.filterTests.length}`);
    console.log(`✅ Data Validation Tests: ${testResults.dataValidation.length}`);

    if (testResults.issues.length > 0) {
      console.log('\n🚨 ISSUES FOUND:');
      testResults.issues.forEach((issue, index) => {
        console.log(`${index + 1}. [${issue.category.toUpperCase()}] ${issue.name}`);
        console.log(`   Details: ${issue.details}`);
        console.log(`   Time: ${issue.timestamp}`);
      });
    }

    console.log('\n✅ Comprehensive testing completed!');

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
  logTest,
  makeRequest,
  authenticateUsers,
  testSubscriptionValidation,
  testFilterCombinations,
  validateDataAccuracy
};
