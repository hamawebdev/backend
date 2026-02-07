const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function verifySchema() {
  try {
    console.log('🔍 Verifying Question Source System Schema...\n');

    // Test 1: Verify QuestionSource table exists and has data
    console.log('1️⃣ Testing QuestionSource table...');
    const questionSources = await prisma.questionSource.findMany();
    console.log('✅ QuestionSource table exists');
    console.log(`✅ Found ${questionSources.length} question sources:`);
    questionSources.forEach(source => {
      console.log(`   - ${source.name} (ID: ${source.id})`);
    });

    // Test 2: Verify Question table has sourceId field
    console.log('\n2️⃣ Testing Question table with sourceId...');
    const questions = await prisma.question.findMany({
      include: {
        source: true
      },
      take: 5
    });
    console.log('✅ Question table includes sourceId field');
    console.log(`✅ Found ${questions.length} questions:`);
    questions.forEach(question => {
      console.log(`   - "${question.questionText.substring(0, 50)}..." (Source: ${question.source?.name || 'None'})`);
    });

    // Test 3: Create a new question with source
    console.log('\n3️⃣ Testing question creation with source...');
    const newQuestion = await prisma.question.create({
      data: {
        questionText: 'Test question for source verification',
        questionType: 'SINGLE_CHOICE',
        sourceId: questionSources[0]?.id,
        createdById: 1, // Assuming user ID 1 exists
        questionAnswers: {
          create: [
            { answerText: 'Option A', isCorrect: true },
            { answerText: 'Option B', isCorrect: false }
          ]
        }
      },
      include: {
        source: true,
        questionAnswers: true
      }
    });
    console.log('✅ Question created with source successfully');
    console.log(`   - Question ID: ${newQuestion.id}`);
    console.log(`   - Source: ${newQuestion.source?.name || 'None'}`);
    console.log(`   - Answers: ${newQuestion.questionAnswers.length}`);

    // Test 4: Test filtering by source
    console.log('\n4️⃣ Testing question filtering by source...');
    const questionsFromSource = await prisma.question.findMany({
      where: {
        sourceId: questionSources[0]?.id
      },
      include: {
        source: true
      }
    });
    console.log(`✅ Found ${questionsFromSource.length} questions from source "${questionSources[0]?.name}"`);

    // Test 5: Test questions without source (backward compatibility)
    console.log('\n5️⃣ Testing questions without source...');
    const questionsWithoutSource = await prisma.question.findMany({
      where: {
        sourceId: null
      }
    });
    console.log(`✅ Found ${questionsWithoutSource.length} questions without source (backward compatibility)`);

    // Test 6: Verify indexes exist
    console.log('\n6️⃣ Testing database indexes...');
    const indexInfo = await prisma.$queryRaw`
      SELECT name FROM sqlite_master 
      WHERE type='index' AND name LIKE '%source%'
    `;
    console.log('✅ Source-related indexes:');
    indexInfo.forEach(index => {
      console.log(`   - ${index.name}`);
    });

    console.log('\n🎉 Schema verification completed successfully!');
    console.log('\n📊 Summary:');
    console.log(`   - Question sources: ${questionSources.length}`);
    console.log(`   - Total questions: ${questions.length}`);
    console.log(`   - Questions with sources: ${questions.filter(q => q.source).length}`);
    console.log(`   - Questions without sources: ${questionsWithoutSource.length}`);

  } catch (error) {
    console.error('❌ Schema verification failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

verifySchema();
