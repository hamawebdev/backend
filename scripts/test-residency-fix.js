const { PrismaClient, YearLevel, UserRole, SubscriptionStatus } = require('@prisma/client');

const prisma = new PrismaClient();

// Import the ExamService to test the fix
const ExamService = require('./build/modules/exams/exam.service.js').default;
const ExamRepository = require('./build/modules/exams/exam.repository.js').default;

async function testResidencyFix() {
  try {
    console.log('🧪 Testing residency access fix...');
    
    // Create mock JWT payload with residency subscription (lowercase)
    const residencyUser = {
      user_data: {
        id: 209,
        email: 'resident@test.com',
        fullName: 'Test Resident',
        role: UserRole.STUDENT,
        currentYear: YearLevel.SEVEN,
        universityId: 30,
        specialtyId: 33,
        emailVerified: true,
        isActive: true
      },
      has_active_subscription: true,
      payment_status: 'active',
      accessible_study_packs: [36],
      subscriptions: [{
        id: 423,
        study_pack_id: 36,
        pack_name: 'Year 7 Medicine',
        pack_type: 'residency', // lowercase - this was the issue
        year_number: 'SEVEN',
        end_date: '2025-09-17T13:47:11.005Z',
        days_remaining: 30,
        accessible_year_levels: ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN']
      }]
    };

    // Create mock JWT payload with regular subscription
    const regularUser = {
      user_data: {
        id: 159,
        email: 'test@example.com',
        fullName: 'Test Student',
        role: UserRole.STUDENT,
        currentYear: YearLevel.ONE,
        universityId: 30,
        specialtyId: 33,
        emailVerified: true,
        isActive: true
      },
      has_active_subscription: true,
      payment_status: 'active',
      accessible_study_packs: [29],
      subscriptions: [{
        id: 319,
        study_pack_id: 29,
        pack_name: 'First Year Medicine',
        pack_type: 'year', // regular year subscription
        year_number: 'ONE',
        end_date: '2026-07-19T13:41:35.863Z',
        days_remaining: 335,
        accessible_year_levels: ['ONE']
      }]
    };

    // Create instances
    const examRepository = new ExamRepository(prisma);
    const examService = new ExamService(examRepository);

    // Test hasResidencyAccess method directly
    console.log('📋 Testing hasResidencyAccess method:');
    
    // Use reflection to access private method
    const hasResidencyAccessResidency = examService.hasResidencyAccess(residencyUser);
    const hasResidencyAccessRegular = examService.hasResidencyAccess(regularUser);
    
    console.log('   - Residency user (pack_type: "residency"):', hasResidencyAccessResidency);
    console.log('   - Regular user (pack_type: "year"):', hasResidencyAccessRegular);
    
    // Test the actual API method
    console.log('\\n🔍 Testing getExamsByModuleAndYear method:');
    
    try {
      const residencyResult = await examService.getExamsByModuleAndYear(308, 2024, residencyUser);
      console.log('   - Residency user result:', residencyResult.data.length, 'exams found');
      if (residencyResult.data.length > 0) {
        console.log('   - First exam:', residencyResult.data[0].title);
      }
    } catch (error) {
      console.log('   - Residency user error:', error.message);
    }
    
    try {
      const regularResult = await examService.getExamsByModuleAndYear(308, 2024, regularUser);
      console.log('   - Regular user result:', regularResult.data.length, 'exams found');
      if (regularResult.data.length > 0) {
        console.log('   - First exam:', regularResult.data[0].title);
      }
    } catch (error) {
      console.log('   - Regular user error:', error.message);
    }
    
    console.log('\\n✅ Test completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testResidencyFix();
