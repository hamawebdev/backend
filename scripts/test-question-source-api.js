const axios = require('axios');

const BASE_URL = 'http://localhost:3005/api/v1';

// Test configuration
const TEST_CONFIG = {
  // You'll need to replace these with actual valid tokens from your system
  adminToken: 'your-admin-token-here',
  studentToken: 'your-student-token-here'
};

async function testQuestionSourceAPI() {
  console.log('🧪 Testing Question Source System API...\n');

  try {
    // Test 1: Get quiz filters (should include questionSources)
    console.log('1️⃣ Testing GET /quizzes/quiz-filters...');
    try {
      const filtersResponse = await axios.get(`${BASE_URL}/quizzes/quiz-filters`, {
        headers: { Authorization: `Bearer ${TEST_CONFIG.studentToken}` }
      });
      
      console.log('✅ Quiz filters response structure:');
      console.log('- availableYears:', filtersResponse.data.data.availableYears?.length || 0);
      console.log('- questionSources:', filtersResponse.data.data.questionSources?.length || 0);
      
      if (filtersResponse.data.data.questionSources) {
        console.log('- Question sources found:', filtersResponse.data.data.questionSources.map(qs => qs.name));
      }
    } catch (error) {
      console.log('❌ Quiz filters test failed:', error.response?.data?.message || error.message);
    }

    // Test 2: Create question with source
    console.log('\n2️⃣ Testing POST /admin/questions (with sourceId)...');
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
        headers: { Authorization: `Bearer ${TEST_CONFIG.adminToken}` }
      });
      
      console.log('✅ Question created with source:', createResponse.data.data.question.id);
    } catch (error) {
      console.log('❌ Question creation test failed:', error.response?.data?.message || error.message);
    }

    // Test 3: Create question without source (backward compatibility)
    console.log('\n3️⃣ Testing POST /admin/questions (without sourceId)...');
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
        headers: { Authorization: `Bearer ${TEST_CONFIG.adminToken}` }
      });
      
      console.log('✅ Question created without source:', createResponse.data.data.question.id);
    } catch (error) {
      console.log('❌ Question creation without source test failed:', error.response?.data?.message || error.message);
    }

    // Test 4: Get student questions with source filtering
    console.log('\n4️⃣ Testing GET /students/questions (with questionSourceIds)...');
    try {
      const questionsResponse = await axios.get(`${BASE_URL}/students/questions`, {
        params: {
          questionSourceIds: '2,3',
          count: 5,
          includeAnswers: true
        },
        headers: { Authorization: `Bearer ${TEST_CONFIG.studentToken}` }
      });
      
      console.log('✅ Student questions with source filtering:');
      console.log('- Total questions:', questionsResponse.data.data.questions.length);
      
      questionsResponse.data.data.questions.forEach((q, index) => {
        console.log(`- Question ${index + 1}: ${q.questionText.substring(0, 50)}...`);
        console.log(`  Source: ${q.source?.name || 'No source'}`);
      });
    } catch (error) {
      console.log('❌ Student questions test failed:', error.response?.data?.message || error.message);
    }

    // Test 5: Create quiz session with question source filtering
    console.log('\n5️⃣ Testing POST /quizzes/quiz-sessions (with questionSourceIds)...');
    try {
      const sessionData = {
        title: 'Test Session with Question Sources',
        settings: { questionCount: 3 },
        filters: {
          questionSourceIds: [2, 3],
          questionTypes: ['SINGLE_CHOICE']
        }
      };

      const sessionResponse = await axios.post(`${BASE_URL}/quizzes/quiz-sessions`, sessionData, {
        headers: { Authorization: `Bearer ${TEST_CONFIG.studentToken}` }
      });
      
      console.log('✅ Quiz session created with question source filtering:', sessionResponse.data.data.sessionId);
      
      // Get the session details to verify source information is included
      const sessionDetails = await axios.get(`${BASE_URL}/students/quiz-sessions/${sessionResponse.data.data.sessionId}`, {
        headers: { Authorization: `Bearer ${TEST_CONFIG.studentToken}` }
      });
      
      console.log('✅ Session details retrieved:');
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

    console.log('\n🎉 Question Source System API testing completed!');

  } catch (error) {
    console.error('❌ Test suite failed:', error.message);
  }
}

// Note: You need to update the tokens above with actual valid tokens
console.log('⚠️  Please update TEST_CONFIG with valid admin and student tokens before running tests');
console.log('⚠️  You can get tokens by logging in through the API or using existing test tokens\n');

testQuestionSourceAPI();
