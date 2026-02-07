const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function verifyPerformanceData() {
  console.log('📊 Verifying Performance Data...\n');

  try {
    // Count all entities
    const userCount = await prisma.user.count();
    const questionCount = await prisma.question.count();
    const answerCount = await prisma.questionAnswer.count();
    const sessionCount = await prisma.quizSession.count();
    const universityCount = await prisma.university.count();
    const specialtyCount = await prisma.specialty.count();

    // User role distribution
    const studentCount = await prisma.user.count({ where: { role: 'STUDENT' } });
    const employeeCount = await prisma.user.count({ where: { role: 'EMPLOYEE' } });
    const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } });

    // Question distribution by year level
    const yearDistribution = await prisma.question.groupBy({
      by: ['yearLevel'],
      _count: { id: true },
    });

    // Session status distribution
    const sessionStatusDistribution = await prisma.quizSession.groupBy({
      by: ['status'],
      _count: { id: true },
    });

    console.log('🎯 Database Statistics:');
    console.log('========================');
    console.log(`👥 Total Users: ${userCount}`);
    console.log(`   - Students: ${studentCount} (${((studentCount/userCount)*100).toFixed(1)}%)`);
    console.log(`   - Employees: ${employeeCount} (${((employeeCount/userCount)*100).toFixed(1)}%)`);
    console.log(`   - Admins: ${adminCount} (${((adminCount/userCount)*100).toFixed(1)}%)`);
    
    console.log(`\n❓ Total Questions: ${questionCount}`);
    console.log(`📝 Total Answers: ${answerCount}`);
    console.log(`🎯 Total Quiz Sessions: ${sessionCount}`);
    console.log(`🏛️ Universities: ${universityCount}`);
    console.log(`🩺 Specialties: ${specialtyCount}`);

    console.log('\n📚 Questions by Year Level:');
    yearDistribution.forEach(item => {
      console.log(`   - Year ${item.yearLevel}: ${item._count.id} questions`);
    });

    console.log('\n🎮 Quiz Sessions by Status:');
    sessionStatusDistribution.forEach(item => {
      console.log(`   - ${item.status}: ${item._count.id} sessions`);
    });

    // Performance metrics
    const avgAnswersPerQuestion = (answerCount / questionCount).toFixed(1);
    console.log('\n⚡ Performance Metrics:');
    console.log(`   - Average answers per question: ${avgAnswersPerQuestion}`);
    console.log(`   - Database ready for performance testing ✅`);

  } catch (error) {
    console.error('❌ Error verifying data:', error);
  } finally {
    await prisma.$disconnect();
  }
}

verifyPerformanceData(); 