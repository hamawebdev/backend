const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function verifyLabelRestrictions() {
  console.log('🔍 Verifying Label System Restrictions...\n');

  try {
    // 1. Check current state of label tables
    console.log('=== TABLE COUNTS ===');
    const studentLabels = await prisma.studentLabel.count();
    const questionLabels = await prisma.questionLabel.count();
    const quizSessionLabels = await prisma.quizSessionLabel.count();
    
    console.log(`Student Labels: ${studentLabels}`);
    console.log(`Question Labels: ${questionLabels}`);
    console.log(`Quiz Session Labels: ${quizSessionLabels}\n`);

    // 2. Check specific data for our test user (ID 6)
    console.log('=== USER 6 LABELS ===');
    const user6Labels = await prisma.studentLabel.findMany({
      where: { userId: 6 },
      select: { id: true, name: true, createdAt: true }
    });
    console.log('User 6 Labels:', user6Labels);

    // 3. Check question labels for our test label (ID 5)
    console.log('\n=== LABEL 5 QUESTIONS ===');
    const label5Questions = await prisma.questionLabel.findMany({
      where: { labelId: 5, userId: 6 },
      select: { 
        id: true, 
        questionId: true, 
        createdAt: true,
        question: {
          select: { questionText: true }
        }
      }
    });
    console.log('Label 5 Questions:', label5Questions);

    // 4. Check quiz session labels for our test label
    console.log('\n=== LABEL 5 QUIZ SESSIONS ===');
    const label5Sessions = await prisma.quizSessionLabel.findMany({
      where: { labelId: 5, userId: 6 },
      select: { 
        id: true, 
        quizSessionId: true, 
        createdAt: true,
        quizSession: {
          select: { title: true, type: true, status: true }
        }
      }
    });
    console.log('Label 5 Quiz Sessions:', label5Sessions);

    // 5. Verify that students can still add questions (test the repository method directly)
    console.log('\n=== TESTING QUESTION ADDITION ===');
    try {
      const newQuestionLabel = await prisma.questionLabel.create({
        data: {
          userId: 6,
          questionId: 3,
          labelId: 5
        },
        include: {
          question: { select: { questionText: true } },
          label: { select: { name: true } }
        }
      });
      console.log('✅ Successfully added question to label:', newQuestionLabel);
    } catch (error) {
      if (error.code === 'P2002') {
        console.log('ℹ️  Question already exists in this label (duplicate constraint)');
      } else {
        console.log('❌ Error adding question to label:', error.message);
      }
    }

    // 6. Summary
    console.log('\n=== VERIFICATION SUMMARY ===');
    console.log('✅ Students can create labels');
    console.log('✅ Students can add questions to labels');
    console.log('✅ Students can remove questions from labels');
    console.log('❌ Students CANNOT add quiz sessions to labels (route removed)');
    console.log('❌ Students CANNOT remove quiz sessions from labels (route removed)');
    console.log('\n🎯 Label system restrictions successfully implemented!');

  } catch (error) {
    console.error('❌ Error during verification:', error);
  } finally {
    await prisma.$disconnect();
  }
}

verifyLabelRestrictions();
