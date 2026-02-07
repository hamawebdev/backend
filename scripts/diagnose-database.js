#!/usr/bin/env node

/**
 * Database Diagnostic Script
 * Helps understand what data is available for testing
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

async function diagnoseDatabase() {
  log('🔍 Starting Database Diagnosis...', 'info');
  
  try {
    // Test server connectivity
    await api.get('/quizzes/quiz-filters');
    log('✅ Server is accessible', 'success');
  } catch (error) {
    log('❌ Server is not accessible. Please ensure the server is running on port 3005', 'error');
    return;
  }
  
  // Get available filters
  try {
    log('\n📊 Fetching Available Filters...', 'info');
    const response = await api.get('/quizzes/quiz-filters');
    
    if (response.data.success && response.data.data) {
      const filters = response.data.data;
      
      log('Available Filters:', 'success');
      console.log(JSON.stringify(filters, null, 2));
      
      // Analyze what's available
      if (filters.yearLevels && filters.yearLevels.length > 0) {
        log(`✅ Year Levels Available: ${filters.yearLevels.join(', ')}`, 'success');
      } else {
        log('❌ No year levels available', 'error');
      }
      
      if (filters.questionTypes && filters.questionTypes.length > 0) {
        log(`✅ Question Types Available: ${filters.questionTypes.join(', ')}`, 'success');
      } else {
        log('❌ No question types available', 'error');
      }
      
      if (filters.examYears && filters.examYears.length > 0) {
        log(`✅ Exam Years Available: ${filters.examYears.join(', ')}`, 'success');
      } else {
        log('❌ No exam years available', 'error');
      }
      
      if (filters.moduleIds && filters.moduleIds.length > 0) {
        log(`✅ Module IDs Available: ${filters.moduleIds.length} modules`, 'success');
      } else {
        log('❌ No modules available', 'error');
      }
      
      if (filters.courseIds && filters.courseIds.length > 0) {
        log(`✅ Course IDs Available: ${filters.courseIds.length} courses`, 'success');
      } else {
        log('❌ No courses available', 'error');
      }
      
    } else {
      log('❌ Invalid response from filters endpoint', 'error');
    }
    
  } catch (error) {
    log(`❌ Error fetching filters: ${error.message}`, 'error');
  }
  
  // Test basic quiz session creation with minimal filters
  log('\n🧪 Testing Basic Quiz Session Creation...', 'info');
  
  const testCases = [
    {
      name: 'Year ONE only',
      filters: { yearLevels: ['ONE'] }
    },
    {
      name: 'Year TWO only',
      filters: { yearLevels: ['TWO'] }
    },
    {
      name: 'Year THREE only',
      filters: { yearLevels: ['THREE'] }
    },
    {
      name: 'No year levels (auto-detect)',
      filters: {}
    }
  ];
  
  for (const testCase of testCases) {
    try {
      const request = {
        title: `Diagnostic Test - ${testCase.name}`,
        settings: { questionCount: 1 },
        filters: testCase.filters
      };
      
      const response = await api.post('/quizzes/quiz-sessions', request);
      
      if (response.status === 201) {
        log(`✅ ${testCase.name}: SUCCESS - Session created with ID ${response.data.data.sessionId}`, 'success');
      }
      
    } catch (error) {
      if (error.response?.status === 404 && error.response?.data?.message?.includes('NoQuestionsFoundError')) {
        log(`⚠️  ${testCase.name}: No questions available`, 'warning');
      } else if (error.response?.status === 400) {
        log(`⚠️  ${testCase.name}: Validation error - ${error.response.data.message}`, 'warning');
      } else {
        log(`❌ ${testCase.name}: Error - ${error.response?.data?.message || error.message}`, 'error');
      }
    }
  }
  
  // Test with specific question types if available
  log('\n🎯 Testing Question Type Filtering...', 'info');
  
  const questionTypeTests = [
    { type: 'SINGLE_CHOICE', name: 'Single Choice' },
    { type: 'MULTIPLE_CHOICE', name: 'Multiple Choice' }
  ];
  
  for (const test of questionTypeTests) {
    try {
      const request = {
        title: `Diagnostic - ${test.name} Questions`,
        settings: { questionCount: 1 },
        filters: {
          yearLevels: ['ONE'],
          questionTypes: [test.type]
        }
      };
      
      const response = await api.post('/quizzes/quiz-sessions', request);
      
      if (response.status === 201) {
        log(`✅ ${test.name} questions: Available`, 'success');
      }
      
    } catch (error) {
      if (error.response?.status === 404) {
        log(`⚠️  ${test.name} questions: Not available for year ONE`, 'warning');
      } else {
        log(`❌ ${test.name} questions: Error - ${error.response?.data?.message || error.message}`, 'error');
      }
    }
  }
  
  // Test with exam years
  log('\n📅 Testing Exam Year Filtering...', 'info');
  
  const examYearTests = [2020, 2021, 2022, 2023, 2024];
  
  for (const year of examYearTests) {
    try {
      const request = {
        title: `Diagnostic - ${year} Exam Questions`,
        settings: { questionCount: 1 },
        filters: {
          yearLevels: ['ONE'],
          examYears: [year]
        }
      };
      
      const response = await api.post('/quizzes/quiz-sessions', request);
      
      if (response.status === 201) {
        log(`✅ Exam year ${year}: Questions available`, 'success');
      }
      
    } catch (error) {
      if (error.response?.status === 404) {
        log(`⚠️  Exam year ${year}: No questions available`, 'warning');
      } else {
        log(`❌ Exam year ${year}: Error - ${error.response?.data?.message || error.message}`, 'error');
      }
    }
  }
  
  log('\n📋 Diagnosis Summary:', 'info');
  log('1. Check the "Available Filters" section to see what data exists in your database', 'info');
  log('2. Green ✅ items indicate successful operations', 'info');
  log('3. Yellow ⚠️  items indicate missing data (expected for test databases)', 'info');
  log('4. Red ❌ items indicate actual errors that need investigation', 'info');
  log('\n💡 Recommendations:', 'info');
  log('- If no questions are available for year ONE, try other year levels', 'info');
  log('- If no question types are available, check your database seeding', 'info');
  log('- If no exam years are available, questions might not have examYear field populated', 'info');
  
  log('\n🎉 Diagnosis completed!', 'info');
}

// Execute diagnosis
if (require.main === module) {
  diagnoseDatabase().catch(error => {
    log(`Fatal error: ${error.message}`, 'error');
    process.exit(1);
  });
}

module.exports = { diagnoseDatabase };
