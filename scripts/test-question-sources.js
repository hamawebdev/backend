const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function createTestQuestionSources() {
  try {
    console.log('Creating test question sources...');

    // Create test question sources
    const sources = await Promise.all([
      prisma.questionSource.create({
        data: {
          name: 'Medical Textbook A'
        }
      }),
      prisma.questionSource.create({
        data: {
          name: 'Research Papers Collection'
        }
      }),
      prisma.questionSource.create({
        data: {
          name: 'Clinical Guidelines'
        }
      })
    ]);

    console.log('Created question sources:', sources);

    // Get existing questions and update some with sources
    const existingQuestions = await prisma.question.findMany({
      take: 5
    });

    if (existingQuestions.length > 0) {
      console.log('Updating existing questions with sources...');
      
      // Update first few questions with different sources
      for (let i = 0; i < Math.min(existingQuestions.length, 3); i++) {
        await prisma.question.update({
          where: { id: existingQuestions[i].id },
          data: { sourceId: sources[i % sources.length].id }
        });
      }
      
      console.log('Updated questions with sources');
    }

    console.log('Test data creation completed successfully!');
  } catch (error) {
    console.error('Error creating test data:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createTestQuestionSources();
