const axios = require('axios');

const BASE_URL = 'http://localhost:3005/api/v1';

async function testQuestionSourceEndpoints() {
  console.log('🧪 Testing Question Source System API Endpoints...\n');

  let adminToken = null;
  let studentToken = null;

  try {
    // Step 1: Login as admin to get token
    console.log('1️⃣ Logging in as admin...');
    try {
      const adminLogin = await axios.post(`${BASE_URL}/auth/login`, {
        email: 'admin@medcin.dz',
        password: 'password123'
      });
      adminToken = adminLogin.data.data.accessToken;
      console.log('✅ Admin login successful');
    } catch (error) {
      console.log('❌ Admin login failed:', error.response?.data?.message || error.message);
      return;
    }

    // Step 2: Login as student to get token
    console.log('\n2️⃣ Logging in as student...');
    try {
      const studentLogin = await axios.post(`${BASE_URL}/auth/login`, {
        email: 'test@example.com',
        password: 'password123'
      });
      studentToken = studentLogin.data.data.accessToken;
      console.log('✅ Student login successful');
    } catch (error) {
      console.log('❌ Student login failed:', error.response?.data?.message || error.message);
      return;
    }

    // Step 3: Test quiz filters endpoint (should include questionSources)
    console.log('\n3️⃣ Testing GET /quizzes/quiz-filters...');
    try {
      const filtersResponse = await axios.get(`${BASE_URL}/quizzes/quiz-filters`, {
        headers: { Authorization: `Bearer ${studentToken}` }
      });
      
      console.log('✅ Quiz filters response received');
      console.log('- Available years:', filtersResponse.data.data.availableYears?.length || 0);
      console.log('- Quiz sources:', filtersResponse.data.data.quizSources?.length || 0);
      console.log('- Question sources:', filtersResponse.data.data.questionSources?.length || 0);
      
      if (filtersResponse.data.data.questionSources) {
        console.log('- Question sources found:');
        filtersResponse.data.data.questionSources.forEach(qs => {
          console.log(`  * ${qs.name} (${qs.questionCount} questions)`);
        });
      }
    } catch (error) {
      console.log('❌ Quiz filters test failed:', error.response?.data?.message || error.message);
    }

    // Step 4: Test question creation with source
    console.log('\n4️⃣ Testing POST /admin/questions (with sourceId)...');
    try {
      const questionData = {
        questionText: 'What is the primary function of the cardiovascular system?',
        explanation: 'The cardiovascular system circulates blood throughout the body.',
        questionType: 'SINGLE_CHOICE',
        sourceId: 2, // Medical Textbook A
        answers: [
          { answerText: 'Circulation of blood', isCorrect: true },
          { answerText: 'Digestion of food', isCorrect: false },
          { answerText: 'Breathing', isCorrect: false },
          { answerText: 'Thinking', isCorrect: false }
        ]
      };

      const createResponse = await axios.post(`${BASE_URL}/admin/questions`, questionData, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      
      console.log('✅ Question created with source');
      console.log('- Question ID:', createResponse.data.data.question.id);
      console.log('- Question text:', createResponse.data.data.question.questionText);
    } catch (error) {
      console.log('❌ Question creation test failed:', error.response?.data?.message || error.message);
    }

    // Step 5: Test question creation without source (backward compatibility)
    console.log('\n5️⃣ Testing POST /admin/questions (without sourceId)...');
    try {
      const questionData = {
        questionText: 'What is the largest organ in the human body?',
        explanation: 'The skin is the largest organ by surface area.',
        questionType: 'SINGLE_CHOICE',
        answers: [
          { answerText: 'Skin', isCorrect: true },
          { answerText: 'Liver', isCorrect: false },
          { answerText: 'Brain', isCorrect: false },
          { answerText: 'Heart', isCorrect: false }
        ]
      };

      const createResponse = await axios.post(`${BASE_URL}/admin/questions`, questionData, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      
      console.log('✅ Question created without source (backward compatibility)');
      console.log('- Question ID:', createResponse.data.data.question.id);
    } catch (error) {
      console.log('❌ Question creation without source test failed:', error.response?.data?.message || error.message);
    }

    // Step 6: Test student questions endpoint with source filtering
    console.log('\n6️⃣ Testing GET /students/questions (with questionSourceIds)...');
    try {
      const questionsResponse = await axios.get(`${BASE_URL}/students/questions`, {
        params: {
          questionSourceIds: '2,3',
          count: 5,
          includeAnswers: true
        },
        headers: { Authorization: `Bearer ${studentToken}` }
      });
      
      console.log('✅ Student questions with source filtering');
      console.log('- Total questions:', questionsResponse.data.data.questions.length);
      
      questionsResponse.data.data.questions.forEach((q, index) => {
        console.log(`- Question ${index + 1}: ${q.questionText.substring(0, 50)}...`);
        console.log(`  Source: ${q.source?.name || 'No source'}`);
      });
    } catch (error) {
      console.log('❌ Student questions test failed:', error.response?.data?.message || error.message);
    }

    // Step 7: Test quiz session creation with question source filtering
    console.log('\n7️⃣ Testing POST /quizzes/quiz-sessions (with questionSourceIds)...');
    try {
      const sessionData = {
        title: 'Test Session with Question Sources',
        settings: { questionCount: 3 },
        filters: {
          questionSourceIds: [2],
          questionTypes: ['SINGLE_CHOICE']
        }
      };

      const sessionResponse = await axios.post(`${BASE_URL}/quizzes/quiz-sessions`, sessionData, {
        headers: { Authorization: `Bearer ${studentToken}` }
      });
      
      console.log('✅ Quiz session created with question source filtering');
      console.log('- Session ID:', sessionResponse.data.data.sessionId);
      
      // Get the session details to verify source information is included
      const sessionDetails = await axios.get(`${BASE_URL}/students/quiz-sessions/${sessionResponse.data.data.sessionId}`, {
        headers: { Authorization: `Bearer ${studentToken}` }
      });
      
      console.log('✅ Session details retrieved');
      console.log('- Questions in session:', sessionDetails.data.sessionQuestions?.length || 0);
      
      if (sessionDetails.data.sessionQuestions) {
        sessionDetails.data.sessionQuestions.forEach((sq, index) => {
          console.log(`- Question ${index + 1}: ${sq.question.questionText.substring(0, 40)}...`);
          console.log(`  Source: ${sq.question.source?.name || 'No source'}`);
        });
      }
    } catch (error) {
      console.log('❌ Quiz session test failed:', error.response?.data?.message || error.message);
    }

    console.log('\n🎉 Question Source System API testing completed successfully!');

  } catch (error) {
    console.error('❌ Test suite failed:', error.message);
  }
}

testQuestionSourceEndpoints();
