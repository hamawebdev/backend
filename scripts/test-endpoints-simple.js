const axios = require('axios');

const BASE_URL = 'http://localhost:3005/api/v1';

async function testEndpointsSimple() {
  console.log('🧪 Testing Question Source System Endpoints (Simple)...\n');

  let adminToken = null;
  let studentToken = null;

  try {
    // Step 1: Login as admin
    console.log('1️⃣ Logging in as admin...');
    const adminLogin = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'admin@medcin.dz',
      password: 'password123'
    });
    adminToken = adminLogin.data.data.accessToken;
    console.log('✅ Admin login successful');

    // Step 2: Login as student
    console.log('\n2️⃣ Logging in as student...');
    const studentLogin = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'test@example.com',
      password: 'password123'
    });
    studentToken = studentLogin.data.data.accessToken;
    console.log('✅ Student login successful');

    // Step 3: Test a simple endpoint first to verify authentication
    console.log('\n3️⃣ Testing basic authenticated endpoint...');
    try {
      const profileResponse = await axios.get(`${BASE_URL}/auth/profile`, {
        headers: { Authorization: `Bearer ${studentToken}` }
      });
      console.log('✅ Authentication working, user:', profileResponse.data.data.email);
    } catch (error) {
      console.log('❌ Authentication test failed:', error.response?.status, error.response?.data?.message);
      return;
    }

    // Step 4: Test quiz filters endpoint (most likely to work)
    console.log('\n4️⃣ Testing GET /quizzes/quiz-filters...');
    try {
      const filtersResponse = await axios.get(`${BASE_URL}/quizzes/quiz-filters`, {
        headers: { Authorization: `Bearer ${studentToken}` }
      });
      
      console.log('✅ Quiz filters response received');
      console.log('Response structure:', Object.keys(filtersResponse.data.data));
      
      if (filtersResponse.data.data.questionSources) {
        console.log('✅ Question sources found in response:');
        filtersResponse.data.data.questionSources.forEach(qs => {
          console.log(`   - ${qs.name} (${qs.questionCount} questions)`);
        });
      } else {
        console.log('❌ Question sources not found in response');
        console.log('Available fields:', Object.keys(filtersResponse.data.data));
      }
    } catch (error) {
      console.log('❌ Quiz filters test failed:', error.response?.status, error.response?.data?.message);
    }

    // Step 5: Test question creation (admin endpoint)
    console.log('\n5️⃣ Testing POST /admin/questions...');
    try {
      const questionData = {
        questionText: 'What is the primary function of the pancreas?',
        explanation: 'The pancreas produces insulin and digestive enzymes.',
        questionType: 'SINGLE_CHOICE',
        sourceId: 2, // Medical Textbook A
        answers: [
          { answerText: 'Produces insulin and enzymes', isCorrect: true },
          { answerText: 'Filters blood', isCorrect: false },
          { answerText: 'Pumps blood', isCorrect: false },
          { answerText: 'Stores bile', isCorrect: false }
        ]
      };

      const createResponse = await axios.post(`${BASE_URL}/admin/questions`, questionData, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      
      console.log('✅ Question created successfully');
      console.log('- Question ID:', createResponse.data.data.question.id);
      console.log('- Source ID:', createResponse.data.data.question.sourceId);
    } catch (error) {
      console.log('❌ Question creation failed:', error.response?.status, error.response?.data?.message);
      if (error.response?.data?.details) {
        console.log('Error details:', error.response.data.details);
      }
    }

    // Step 6: Test question creation without source (backward compatibility)
    console.log('\n6️⃣ Testing POST /admin/questions (without source)...');
    try {
      const questionData = {
        questionText: 'What is the function of white blood cells?',
        explanation: 'White blood cells fight infections and diseases.',
        questionType: 'SINGLE_CHOICE',
        answers: [
          { answerText: 'Fight infections', isCorrect: true },
          { answerText: 'Carry oxygen', isCorrect: false },
          { answerText: 'Clot blood', isCorrect: false },
          { answerText: 'Digest food', isCorrect: false }
        ]
      };

      const createResponse = await axios.post(`${BASE_URL}/admin/questions`, questionData, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      
      console.log('✅ Question created without source (backward compatibility)');
      console.log('- Question ID:', createResponse.data.data.question.id);
      console.log('- Source ID:', createResponse.data.data.question.sourceId || 'null');
    } catch (error) {
      console.log('❌ Question creation without source failed:', error.response?.status, error.response?.data?.message);
    }

    // Step 7: Test getting questions (if available)
    console.log('\n7️⃣ Testing question retrieval endpoints...');
    try {
      // Try to get questions with source filtering
      const questionsResponse = await axios.get(`${BASE_URL}/students/questions`, {
        params: {
          questionSourceIds: '2',
          count: 3,
          includeAnswers: true
        },
        headers: { Authorization: `Bearer ${studentToken}` }
      });
      
      console.log('✅ Questions retrieved with source filtering');
      console.log('- Total questions:', questionsResponse.data.data.questions.length);
      
      questionsResponse.data.data.questions.forEach((q, index) => {
        console.log(`- Question ${index + 1}: ${q.questionText.substring(0, 40)}...`);
        console.log(`  Source: ${q.source?.name || 'No source'}`);
      });
    } catch (error) {
      console.log('❌ Question retrieval failed:', error.response?.status, error.response?.data?.message);
    }

    console.log('\n🎉 Endpoint testing completed!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testEndpointsSimple();
