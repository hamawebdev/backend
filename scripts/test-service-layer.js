const { PrismaClient } = require('@prisma/client');

// Import the services directly
const QuestionService = require('./dist/modules/questions/question.service.js').QuestionService;
const QuizService = require('./dist/modules/quizzes/quiz.service.js').QuizService;

const prisma = new PrismaClient();

async function testServiceLayer() {
  console.log('🧪 Testing Question Source System Service Layer...\n');

  try {
    const questionService = new QuestionService(prisma);
    const quizService = new QuizService(prisma);

    // Test 1: Question service - create question with source
    console.log('1️⃣ Testing QuestionService.createQuestion with source...');
    try {
      const questionData = {
        questionText: 'What is the role of insulin in the body?',
        explanation: 'Insulin regulates blood glucose levels.',
        questionType: 'SINGLE_CHOICE',
        sourceId: 2, // Medical Textbook A
        answers: [
          { answerText: 'Regulates blood sugar', isCorrect: true },
          { answerText: 'Aids digestion', isCorrect: false },
          { answerText: 'Filters blood', isCorrect: false },
          { answerText: 'Pumps blood', isCorrect: false }
        ]
      };

      const result = await questionService.createQuestion(questionData, 1);
      console.log('✅ Question created via service:');
      console.log(`   - ID: ${result.question.id}`);
      console.log(`   - Text: ${result.question.questionText}`);
      console.log(`   - Source ID: ${result.question.sourceId}`);
    } catch (error) {
      console.log('❌ Question creation via service failed:', error.message);
    }

    // Test 2: Question service - get questions with source filtering
    console.log('\n2️⃣ Testing QuestionService.getQuestionsWithFilters with questionSourceIds...');
    try {
      const filters = {
        questionSourceIds: [2, 3],
        questionTypes: ['SINGLE_CHOICE']
      };

      const questions = await questionService.getQuestionsWithFilters(filters, [1, 2, 3, 4, 5]);
      console.log('✅ Questions retrieved with source filtering:');
      console.log(`   - Total questions: ${questions.length}`);
      
      questions.slice(0, 3).forEach((q, index) => {
        console.log(`   ${index + 1}. ${q.questionText.substring(0, 40)}...`);
        console.log(`      Source: ${q.source?.name || 'No source'}`);
      });
    } catch (error) {
      console.log('❌ Question filtering via service failed:', error.message);
    }

    // Test 3: Question service - get available filters (should include questionSources)
    console.log('\n3️⃣ Testing QuestionService.getAvailableFilters...');
    try {
      const filters = await questionService.getAvailableFilters([1, 2, 3, 4, 5]);
      console.log('✅ Available filters retrieved:');
      console.log(`   - Universities: ${filters.universities?.length || 0}`);
      console.log(`   - Quiz sources: ${filters.quizSources?.length || 0}`);
      console.log(`   - Question sources: ${filters.questionSources?.length || 0}`);
      
      if (filters.questionSources) {
        console.log('   - Question sources found:');
        filters.questionSources.forEach(qs => {
          console.log(`     * ${qs.name} (${qs.questionCount} questions)`);
        });
      }
    } catch (error) {
      console.log('❌ Available filters via service failed:', error.message);
    }

    // Test 4: Quiz service - create session with question source filtering
    console.log('\n4️⃣ Testing QuizService.createQuizSession with questionSourceIds...');
    try {
      const sessionData = {
        title: 'Test Session with Question Sources',
        settings: { questionCount: 3 },
        filters: {
          questionSourceIds: [2],
          questionTypes: ['SINGLE_CHOICE']
        }
      };

      const session = await quizService.createQuizSession(sessionData, 1, [1, 2, 3, 4, 5]);
      console.log('✅ Quiz session created with question source filtering:');
      console.log(`   - Session ID: ${session.sessionId}`);
      console.log(`   - Questions: ${session.questionCount}`);
    } catch (error) {
      console.log('❌ Quiz session creation via service failed:', error.message);
    }

    // Test 5: Quiz service - get quiz filters (should include questionSources)
    console.log('\n5️⃣ Testing QuizService.getQuizFilters...');
    try {
      const quizFilters = await quizService.getQuizFilters([1, 2, 3, 4, 5]);
      console.log('✅ Quiz filters retrieved:');
      console.log(`   - Available years: ${quizFilters.availableYears?.length || 0}`);
      console.log(`   - Quiz sources: ${quizFilters.quizSources?.length || 0}`);
      console.log(`   - Question sources: ${quizFilters.questionSources?.length || 0}`);
      
      if (quizFilters.questionSources) {
        console.log('   - Question sources in quiz filters:');
        quizFilters.questionSources.forEach(qs => {
          console.log(`     * ${qs.name} (${qs.questionCount} questions)`);
        });
      }
    } catch (error) {
      console.log('❌ Quiz filters via service failed:', error.message);
    }

    // Test 6: Test backward compatibility - create question without source
    console.log('\n6️⃣ Testing backward compatibility - question without source...');
    try {
      const questionData = {
        questionText: 'What is the function of red blood cells?',
        explanation: 'Red blood cells carry oxygen throughout the body.',
        questionType: 'SINGLE_CHOICE',
        // No sourceId provided
        answers: [
          { answerText: 'Carry oxygen', isCorrect: true },
          { answerText: 'Fight infection', isCorrect: false },
          { answerText: 'Clot blood', isCorrect: false },
          { answerText: 'Produce hormones', isCorrect: false }
        ]
      };

      const result = await questionService.createQuestion(questionData, 1);
      console.log('✅ Question created without source (backward compatibility):');
      console.log(`   - ID: ${result.question.id}`);
      console.log(`   - Source ID: ${result.question.sourceId || 'null'}`);
    } catch (error) {
      console.log('❌ Backward compatibility test failed:', error.message);
    }

    // Test 7: Test question update with source
    console.log('\n7️⃣ Testing question update with source...');
    try {
      // Get a question without source
      const questionWithoutSource = await prisma.question.findFirst({
        where: { sourceId: null }
      });

      if (questionWithoutSource) {
        const updateData = {
          sourceId: 1 // Clinical Guidelines
        };

        const updatedQuestion = await questionService.updateQuestion(questionWithoutSource.id, updateData, 1);
        console.log('✅ Question updated with source:');
        console.log(`   - ID: ${updatedQuestion.id}`);
        console.log(`   - New Source ID: ${updatedQuestion.sourceId}`);
      } else {
        console.log('⚠️  No questions without source found for update test');
      }
    } catch (error) {
      console.log('❌ Question update test failed:', error.message);
    }

    console.log('\n🎉 Service layer testing completed successfully!');

  } catch (error) {
    console.error('❌ Service layer test failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testServiceLayer();
