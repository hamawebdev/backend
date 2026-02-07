#!/usr/bin/env node

/**
 * Real Data Analysis Script
 * Analyzes the actual database content and creates tests with real IDs
 */

const axios = require('axios');

// Configuration
const BASE_URL = 'http://localhost:3005/api/v1';
const JWT_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2RhdGEiOnsiaWQiOjYsImVtYWlsIjoidGVzdEBleGFtcGxlLmNvbSIsImZ1bGxOYW1lIjoiVGVzdCBTdHVkZW50Iiwicm9sZSI6IlNUVURFTlQiLCJ1bml2ZXJzaXR5SWQiOjUsInNwZWNpYWx0eUlkIjo2LCJjdXJyZW50WWVhciI6Ik9ORSIsImVtYWlsVmVyaWZpZWQiOnRydWUsImlzQWN0aXZlIjp0cnVlfSwic3Vic2NyaXB0aW9ucyI6W3siaWQiOjUsInN0dWR5X3BhY2tfaWQiOjUsInBhY2tfbmFtZSI6IkZpcnN0IFllYXIgTWVkaWNpbmUiLCJwYWNrX3R5cGUiOiJ5ZWFyIiwieWVhcl9udW1iZXIiOiJPTkUiLCJlbmRfZGF0ZSI6IjIwMjYtMDctMDdUMTE6NTM6MjAuMjY5WiIsImRheXNfcmVtYWluaW5nIjozMzV9XSwicGF5bWVudF9zdGF0dXMiOiJhY3RpdmUiLCJoYXNfYWN0aXZlX3N1YnNjcmlwdGlvbiI6dHJ1ZSwiYWNjZXNzaWJsZV9zdHVkeV9wYWNrcyI6WzVdLCJpYXQiOjE3NTQ0ODYyNjEsImV4cCI6MTc1NTc4MjI2MX0.DcmXy8EiDlZdNIFGVV4adb_cFCvDlrSHOtFLICWKgfQ';

// HTTP client setup
const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Authorization': `Bearer ${JWT_TOKEN}`,
    'Content-Type': 'application/json'
  },
  timeout: 10000
});

function log(message, type = 'info') {
  const timestamp = new Date().toISOString();
  const colors = {
    info: '\x1b[36m',    // Cyan
    success: '\x1b[32m', // Green
    error: '\x1b[31m',   // Red
    warning: '\x1b[33m', // Yellow
    reset: '\x1b[0m'     // Reset
  };
  
  console.log(`${colors[type]}[${timestamp}] ${message}${colors.reset}`);
}

async function analyzeRealData() {
  log('🔍 Analyzing Real Database Content...', 'info');
  
  let realData = {
    availableFilters: null,
    workingConfigurations: [],
    failingConfigurations: []
  };
  
  try {
    // Get available filters
    log('📊 Fetching available filters...', 'info');
    const filtersResponse = await api.get('/quizzes/quiz-filters');
    
    if (filtersResponse.data.success) {
      realData.availableFilters = filtersResponse.data.data;
      
      log('✅ Available Filters Retrieved:', 'success');
      console.log(JSON.stringify(realData.availableFilters, null, 2));
      
      // Extract real IDs and values
      const { yearLevels, moduleIds, courseIds, uniteIds, questionTypes, examYears } = realData.availableFilters;
      
      log('\n📋 Summary of Available Data:', 'info');
      log(`Year Levels: ${yearLevels ? yearLevels.join(', ') : 'None'}`, yearLevels?.length ? 'success' : 'warning');
      log(`Question Types: ${questionTypes ? questionTypes.join(', ') : 'None'}`, questionTypes?.length ? 'success' : 'warning');
      log(`Exam Years: ${examYears ? examYears.join(', ') : 'None'}`, examYears?.length ? 'success' : 'warning');
      log(`Module IDs: ${moduleIds ? moduleIds.length + ' available' : 'None'}`, moduleIds?.length ? 'success' : 'warning');
      log(`Course IDs: ${courseIds ? courseIds.length + ' available' : 'None'}`, courseIds?.length ? 'success' : 'warning');
      log(`Unite IDs: ${uniteIds ? uniteIds.length + ' available' : 'None'}`, uniteIds?.length ? 'success' : 'warning');
      
    } else {
      log('❌ Failed to get filters', 'error');
      return;
    }
    
  } catch (error) {
    log(`❌ Error fetching filters: ${error.message}`, 'error');
    return;
  }
  
  // Test different configurations to find what works
  log('\n🧪 Testing Different Configurations...', 'info');
  
  const { yearLevels, moduleIds, courseIds, uniteIds, questionTypes, examYears } = realData.availableFilters;
  
  // Test configurations with real data
  const testConfigurations = [
    // Basic year level tests
    ...(yearLevels || []).map(year => ({
      name: `Year ${year} only`,
      filters: { yearLevels: [year] }
    })),
    
    // Module ID tests (use first few if available)
    ...(moduleIds || []).slice(0, 3).map(moduleId => ({
      name: `Module ${moduleId}`,
      filters: { moduleIds: [moduleId] }
    })),
    
    // Course ID tests (use first few if available)
    ...(courseIds || []).slice(0, 3).map(courseId => ({
      name: `Course ${courseId}`,
      filters: { courseIds: [courseId] }
    })),
    
    // Unite ID tests (use first few if available)
    ...(uniteIds || []).slice(0, 3).map(uniteId => ({
      name: `Unite ${uniteId}`,
      filters: { uniteIds: [uniteId] }
    })),
    
    // Question type tests
    ...(questionTypes || []).map(questionType => ({
      name: `${questionType} questions`,
      filters: { 
        yearLevels: yearLevels ? [yearLevels[0]] : undefined,
        questionTypes: [questionType] 
      }
    })),
    
    // Exam year tests
    ...(examYears || []).slice(0, 3).map(examYear => ({
      name: `Exam year ${examYear}`,
      filters: { 
        yearLevels: yearLevels ? [yearLevels[0]] : undefined,
        examYears: [examYear] 
      }
    })),
    
    // Combined tests
    ...(yearLevels && moduleIds ? [{
      name: `Combined: Year ${yearLevels[0]} + Module ${moduleIds[0]}`,
      filters: { 
        yearLevels: [yearLevels[0]], 
        moduleIds: [moduleIds[0]] 
      }
    }] : []),
    
    ...(yearLevels && courseIds ? [{
      name: `Combined: Year ${yearLevels[0]} + Course ${courseIds[0]}`,
      filters: { 
        yearLevels: [yearLevels[0]], 
        courseIds: [courseIds[0]] 
      }
    }] : [])
  ];
  
  // Test each configuration
  for (const config of testConfigurations) {
    try {
      const request = {
        title: `Test: ${config.name}`,
        settings: { questionCount: 1 },
        filters: config.filters
      };
      
      const response = await api.post('/quizzes/quiz-sessions', request);
      
      if (response.status === 201) {
        log(`✅ ${config.name}: SUCCESS`, 'success');
        realData.workingConfigurations.push({
          ...config,
          sessionId: response.data.data.sessionId
        });
      }
      
    } catch (error) {
      if (error.response?.status === 404 && error.response?.data?.message?.includes('NoQuestionsFoundError')) {
        log(`⚠️  ${config.name}: No questions found`, 'warning');
        realData.failingConfigurations.push({
          ...config,
          reason: 'No questions found'
        });
      } else {
        log(`❌ ${config.name}: Error - ${error.response?.data?.message || error.message}`, 'error');
        realData.failingConfigurations.push({
          ...config,
          reason: error.response?.data?.message || error.message
        });
      }
    }
  }
  
  // Generate test script with real data
  log('\n📝 Generating Test Script with Real Data...', 'info');
  
  const testScriptContent = generateTestScript(realData);
  
  // Write the test script
  require('fs').writeFileSync('test-with-real-data.js', testScriptContent);
  
  log('✅ Generated test-with-real-data.js', 'success');
  
  // Summary
  log('\n📊 Analysis Summary:', 'info');
  log(`Working Configurations: ${realData.workingConfigurations.length}`, 'success');
  log(`Failing Configurations: ${realData.failingConfigurations.length}`, 'warning');
  
  if (realData.workingConfigurations.length > 0) {
    log('\n✅ Working Configurations:', 'success');
    realData.workingConfigurations.forEach(config => {
      log(`  • ${config.name}`, 'success');
    });
  }
  
  if (realData.failingConfigurations.length > 0) {
    log('\n⚠️  Failing Configurations:', 'warning');
    realData.failingConfigurations.forEach(config => {
      log(`  • ${config.name}: ${config.reason}`, 'warning');
    });
  }
  
  log('\n🎉 Analysis completed! Run "node test-with-real-data.js" to test with real data.', 'info');
}

function generateTestScript(realData) {
  const { availableFilters, workingConfigurations } = realData;
  
  return `#!/usr/bin/env node

/**
 * Generated Test Script with Real Database Data
 * This script uses actual IDs and configurations from your database
 */

const axios = require('axios');

// Configuration
const BASE_URL = 'http://localhost:3005/api/v1';
const JWT_TOKEN = '${JWT_TOKEN}';

// Real data from your database
const REAL_DATA = ${JSON.stringify(availableFilters, null, 2)};

const WORKING_CONFIGURATIONS = ${JSON.stringify(workingConfigurations, null, 2)};

// Test results tracking
let testResults = { passed: 0, failed: 0, total: 0, details: [] };

// HTTP client setup
const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Authorization': \`Bearer \${JWT_TOKEN}\`,
    'Content-Type': 'application/json'
  },
  timeout: 10000
});

function log(message, type = 'info') {
  const colors = {
    info: '\\x1b[36m', success: '\\x1b[32m', error: '\\x1b[31m', warning: '\\x1b[33m', reset: '\\x1b[0m'
  };
  console.log(\`\${colors[type]}[\${new Date().toISOString()}] \${message}\${colors.reset}\`);
}

function assert(condition, testName, details = '') {
  testResults.total++;
  if (condition) {
    testResults.passed++;
    log(\`✅ PASS: \${testName}\`, 'success');
  } else {
    testResults.failed++;
    log(\`❌ FAIL: \${testName} - \${details}\`, 'error');
  }
}

async function testWithRealData() {
  log('🚀 Testing with Real Database Data', 'info');
  
  // Test working configurations
  for (const config of WORKING_CONFIGURATIONS) {
    try {
      const request = {
        title: \`Real Data Test: \${config.name}\`,
        settings: { questionCount: 5 },
        filters: config.filters
      };
      
      const response = await api.post('/quizzes/quiz-sessions', request);
      
      assert(response.status === 201, \`\${config.name} - Quiz creation\`);
      assert(response.data.success === true, \`\${config.name} - Success response\`);
      assert(typeof response.data.data.sessionId === 'number', \`\${config.name} - Session ID returned\`);
      
    } catch (error) {
      assert(false, \`\${config.name} - Quiz creation\`, error.response?.data?.message || error.message);
    }
  }
  
  // Test new filtering features with real data
  ${availableFilters?.questionTypes ? `
  // Test question type filtering with real data
  for (const questionType of REAL_DATA.questionTypes || []) {
    try {
      const request = {
        title: \`Real \${questionType} Test\`,
        settings: { questionCount: 3 },
        filters: {
          yearLevels: REAL_DATA.yearLevels ? [REAL_DATA.yearLevels[0]] : undefined,
          questionTypes: [questionType]
        }
      };
      
      const response = await api.post('/quizzes/quiz-sessions', request);
      assert(response.status === 201, \`\${questionType} filtering with real data\`);
      
    } catch (error) {
      if (error.response?.status === 404) {
        assert(true, \`\${questionType} filtering - no questions available (expected)\`);
      } else {
        assert(false, \`\${questionType} filtering\`, error.response?.data?.message || error.message);
      }
    }
  }
  ` : ''}
  
  ${availableFilters?.examYears ? `
  // Test exam year filtering with real data
  for (const examYear of (REAL_DATA.examYears || []).slice(0, 3)) {
    try {
      const request = {
        title: \`Real \${examYear} Exam Test\`,
        settings: { questionCount: 3 },
        filters: {
          yearLevels: REAL_DATA.yearLevels ? [REAL_DATA.yearLevels[0]] : undefined,
          examYears: [examYear]
        }
      };
      
      const response = await api.post('/quizzes/quiz-sessions', request);
      assert(response.status === 201, \`Exam year \${examYear} filtering with real data\`);
      
    } catch (error) {
      if (error.response?.status === 404) {
        assert(true, \`Exam year \${examYear} filtering - no questions available (expected)\`);
      } else {
        assert(false, \`Exam year \${examYear} filtering\`, error.response?.data?.message || error.message);
      }
    }
  }
  ` : ''}
  
  // Print results
  log(\`\\n📊 TEST RESULTS: \${testResults.passed}/\${testResults.total} passed (\${((testResults.passed/testResults.total)*100).toFixed(1)}%)\`, 
      testResults.failed === 0 ? 'success' : 'warning');
}

if (require.main === module) {
  testWithRealData().catch(console.error);
}
`;
}

// Execute analysis
if (require.main === module) {
  analyzeRealData().catch(error => {
    log(`Fatal error: ${error.message}`, 'error');
    process.exit(1);
  });
}

module.exports = { analyzeRealData };
