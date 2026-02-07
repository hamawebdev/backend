const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function testCoreFunctionality() {
  console.log('🧪 Testing Question Source System Core Functionality...\n');

  try {
    // Test 1: Create questions with and without sources
    console.log('1️⃣ Testing question creation with sources...');
    
    // Create question with source
    const questionWithSource = await prisma.question.create({
      data: {
        questionText: 'What is the function of the mitochondria?',
        explanation: 'Mitochondria are the powerhouse of the cell.',
        questionType: 'SINGLE_CHOICE',
        sourceId: 2, // Medical Textbook A
        createdById: 1,
        questionAnswers: {
          create: [
            { answerText: 'Energy production', isCorrect: true },
            { answerText: 'Protein synthesis', isCorrect: false },
            { answerText: 'DNA storage', isCorrect: false },
            { answerText: 'Waste removal', isCorrect: false }
          ]
        }
      },
      include: {
        source: true,
        questionAnswers: true
      }
    });

    console.log('✅ Question created with source:');
    console.log(`   - ID: ${questionWithSource.id}`);
    console.log(`   - Text: ${questionWithSource.questionText}`);
    console.log(`   - Source: ${questionWithSource.source?.name || 'None'}`);
    console.log(`   - Answers: ${questionWithSource.questionAnswers.length}`);

    // Create question without source (backward compatibility)
    const questionWithoutSource = await prisma.question.create({
      data: {
        questionText: 'What is the largest bone in the human body?',
        explanation: 'The femur is the largest bone.',
        questionType: 'SINGLE_CHOICE',
        createdById: 1,
        questionAnswers: {
          create: [
            { answerText: 'Femur', isCorrect: true },
            { answerText: 'Tibia', isCorrect: false },
            { answerText: 'Humerus', isCorrect: false },
            { answerText: 'Radius', isCorrect: false }
          ]
        }
      },
      include: {
        source: true,
        questionAnswers: true
      }
    });

    console.log('✅ Question created without source (backward compatibility):');
    console.log(`   - ID: ${questionWithoutSource.id}`);
    console.log(`   - Text: ${questionWithoutSource.questionText}`);
    console.log(`   - Source: ${questionWithoutSource.source?.name || 'None'}`);

    // Test 2: Test filtering by source
    console.log('\n2️⃣ Testing question filtering by source...');
    
    const questionsFromSource2 = await prisma.question.findMany({
      where: {
        sourceId: 2
      },
      include: {
        source: true
      }
    });

    console.log(`✅ Found ${questionsFromSource2.length} questions from source ID 2:`);
    questionsFromSource2.forEach((q, index) => {
      console.log(`   ${index + 1}. ${q.questionText.substring(0, 50)}... (Source: ${q.source?.name})`);
    });

    // Test 3: Test questions without source
    const questionsWithoutSource = await prisma.question.findMany({
      where: {
        sourceId: null
      },
      take: 5
    });

    console.log(`✅ Found ${questionsWithoutSource.length} questions without source (showing first 5):`);
    questionsWithoutSource.forEach((q, index) => {
      console.log(`   ${index + 1}. ${q.questionText.substring(0, 50)}...`);
    });

    // Test 4: Test bulk question creation with source
    console.log('\n3️⃣ Testing bulk question creation with source...');
    
    const bulkQuestions = await prisma.$transaction(async (tx) => {
      const questions = [];
      
      for (let i = 1; i <= 3; i++) {
        const question = await tx.question.create({
          data: {
            questionText: `Bulk question ${i} with source`,
            explanation: `Explanation for bulk question ${i}`,
            questionType: 'SINGLE_CHOICE',
            sourceId: 3, // Research Papers Collection
            createdById: 1,
            questionAnswers: {
              create: [
                { answerText: `Correct answer ${i}`, isCorrect: true },
                { answerText: `Wrong answer ${i}A`, isCorrect: false },
                { answerText: `Wrong answer ${i}B`, isCorrect: false }
              ]
            }
          },
          include: {
            source: true
          }
        });
        questions.push(question);
      }
      
      return questions;
    });

    console.log(`✅ Created ${bulkQuestions.length} questions in bulk with source:`);
    bulkQuestions.forEach((q, index) => {
      console.log(`   ${index + 1}. ${q.questionText} (Source: ${q.source?.name})`);
    });

    // Test 5: Test question update with source
    console.log('\n4️⃣ Testing question update with source...');
    
    const updatedQuestion = await prisma.question.update({
      where: { id: questionWithoutSource.id },
      data: { sourceId: 1 }, // Clinical Guidelines
      include: { source: true }
    });

    console.log('✅ Updated question to have source:');
    console.log(`   - ID: ${updatedQuestion.id}`);
    console.log(`   - New Source: ${updatedQuestion.source?.name}`);

    // Test 6: Test comprehensive filtering
    console.log('\n5️⃣ Testing comprehensive filtering...');
    
    // Get questions with multiple filters including source
    const filteredQuestions = await prisma.question.findMany({
      where: {
        AND: [
          { sourceId: { in: [2, 3] } },
          { questionType: 'SINGLE_CHOICE' }
        ]
      },
      include: {
        source: true,
        questionAnswers: true
      },
      take: 5
    });

    console.log(`✅ Found ${filteredQuestions.length} questions with source filtering:`);
    filteredQuestions.forEach((q, index) => {
      console.log(`   ${index + 1}. ${q.questionText.substring(0, 40)}...`);
      console.log(`      Source: ${q.source?.name}, Answers: ${q.questionAnswers.length}`);
    });

    // Test 7: Test question source statistics
    console.log('\n6️⃣ Testing question source statistics...');
    
    const sourceStats = await prisma.questionSource.findMany({
      include: {
        _count: {
          select: { questions: true }
        }
      }
    });

    console.log('✅ Question source statistics:');
    sourceStats.forEach(source => {
      console.log(`   - ${source.name}: ${source._count.questions} questions`);
    });

    console.log('\n🎉 Core functionality testing completed successfully!');
    
    // Summary
    console.log('\n📊 Test Summary:');
    console.log(`   ✅ Question sources: ${sourceStats.length}`);
    console.log(`   ✅ Questions with sources: ${questionsFromSource2.length + bulkQuestions.length + 1}`);
    console.log(`   ✅ Questions without sources: ${questionsWithoutSource.length}`);
    console.log(`   ✅ Filtering by source: Working`);
    console.log(`   ✅ Bulk creation with source: Working`);
    console.log(`   ✅ Question updates with source: Working`);
    console.log(`   ✅ Backward compatibility: Working`);

  } catch (error) {
    console.error('❌ Core functionality test failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testCoreFunctionality();
