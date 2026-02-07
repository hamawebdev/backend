const axios = require('axios');

// Test script for the new questions endpoint
async function testQuestionsEndpoint() {
  const baseURL = 'http://localhost:3001/api/v1';
  
  try {
    console.log('🧪 Testing Questions Endpoint...\n');
    
    // First, let's try to get a test token (you'll need to replace this with a real token)
    console.log('⚠️  Note: You need to provide a valid JWT token to test this endpoint');
    console.log('   You can get one by logging in through the frontend or using the generate-test-token.js script\n');
    
    const testToken = process.env.TEST_TOKEN || 'your-jwt-token-here';
    
    if (testToken === 'your-jwt-token-here') {
      console.log('❌ Please set TEST_TOKEN environment variable or update the script with a valid token');
      return;
    }
    
    const headers = {
      'Authorization': `Bearer ${testToken}`,
      'Content-Type': 'application/json'
    };
    
    // Test 1: Basic request with default parameters
    console.log('📋 Test 1: Basic request with default parameters');
    try {
      const response1 = await axios.get(`${baseURL}/students/questions`, { headers });
      console.log('✅ Success:', {
        status: response1.status,
        questionsCount: response1.data.questions?.length || 0,
        hasMetadata: !!response1.data.metadata,
        subscriptionInfo: response1.data.metadata?.subscriptionInfo
      });
    } catch (error) {
      console.log('❌ Error:', error.response?.data || error.message);
    }
    
    console.log('\n');
    
    // Test 2: Request with specific filters
    console.log('📋 Test 2: Request with specific filters');
    try {
      const params = new URLSearchParams({
        count: '10',
        yearLevels: 'THREE,FOUR',
        includeAnswers: 'true',
        includeExplanations: 'true',
        randomize: 'false'
      });
      
      const response2 = await axios.get(`${baseURL}/students/questions?${params}`, { headers });
      console.log('✅ Success:', {
        status: response2.status,
        questionsCount: response2.data.questions?.length || 0,
        hasAnswers: response2.data.questions?.[0]?.answers ? 'Yes' : 'No',
        hasExplanations: response2.data.questions?.[0]?.explanation ? 'Yes' : 'No',
        appliedFilters: response2.data.metadata?.appliedFilters
      });
    } catch (error) {
      console.log('❌ Error:', error.response?.data || error.message);
    }
    
    console.log('\n');
    
    // Test 3: Request with university filter
    console.log('📋 Test 3: Request with university filter');
    try {
      const params = new URLSearchParams({
        count: '5',
        universityIds: '1,2',
        includeAnswers: 'false',
        randomize: 'true'
      });
      
      const response3 = await axios.get(`${baseURL}/students/questions?${params}`, { headers });
      console.log('✅ Success:', {
        status: response3.status,
        questionsCount: response3.data.questions?.length || 0,
        metadata: response3.data.metadata
      });
    } catch (error) {
      console.log('❌ Error:', error.response?.data || error.message);
    }
    
    console.log('\n');
    
    // Test 4: Request without authentication (should fail)
    console.log('📋 Test 4: Request without authentication (should fail)');
    try {
      const response4 = await axios.get(`${baseURL}/students/questions`);
      console.log('❌ Unexpected success:', response4.status);
    } catch (error) {
      if (error.response?.status === 401) {
        console.log('✅ Correctly rejected unauthorized request:', error.response.status);
      } else {
        console.log('❌ Unexpected error:', error.response?.data || error.message);
      }
    }
    
    console.log('\n🎉 Testing completed!');
    
  } catch (error) {
    console.error('💥 Test script error:', error.message);
  }
}

// Run the test
testQuestionsEndpoint();
