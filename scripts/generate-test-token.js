const { PrismaClient, YearLevel, UserRole, SubscriptionStatus } = require('@prisma/client');
const jwt = require('jsonwebtoken');

const prisma = new PrismaClient();

async function generateTestToken() {
  try {
    console.log('🔑 Generating test JWT token...');
    
    // Find an existing user with subscription
    const user = await prisma.user.findFirst({
      include: {
        subscriptions: {
          where: {
            status: SubscriptionStatus.ACTIVE
          },
          include: {
            studyPack: true
          }
        }
      }
    });

    if (!user) {
      console.log('❌ No user found. Creating a test user...');
      
      // Create a test user with subscription
      const testUser = await prisma.user.create({
        data: {
          email: 'test@example.com',
          fullName: 'Test User',
          password: 'hashedpassword',
          role: UserRole.STUDENT,
          universityId: 1,
          specialtyId: 1,
          currentYear: YearLevel.TWO,
          emailVerified: true,
          isActive: true
        }
      });

      // Create subscription
      const studyPack = await prisma.studyPack.findFirst();
      if (studyPack) {
        await prisma.subscription.create({
          data: {
            userId: testUser.id,
            studyPackId: studyPack.id,
            status: SubscriptionStatus.ACTIVE,
            startDate: new Date(),
            endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
          }
        });
      }

      console.log('✅ Test user created with ID:', testUser.id);
    }

    // Get user with subscriptions
    const userWithSubs = await prisma.user.findFirst({
      include: {
        subscriptions: {
          where: {
            status: SubscriptionStatus.ACTIVE
          },
          include: {
            studyPack: true
          }
        }
      }
    });

    if (!userWithSubs) {
      throw new Error('Could not find or create user with subscription');
    }

    // Build JWT payload similar to AuthService.buildJwtPayload
    const jwtPayload = {
      user_data: {
        id: userWithSubs.id,
        email: userWithSubs.email,
        fullName: userWithSubs.fullName,
        role: userWithSubs.role,
        currentYear: userWithSubs.currentYear,
        universityId: userWithSubs.universityId,
        specialtyId: userWithSubs.specialtyId,
        emailVerified: userWithSubs.emailVerified,
        isActive: userWithSubs.isActive
      },
      has_active_subscription: userWithSubs.subscriptions.length > 0,
      payment_status: userWithSubs.subscriptions.length > 0 ? 'active' : 'inactive',
      accessible_study_packs: userWithSubs.subscriptions.map(sub => sub.studyPackId),
      subscriptions: userWithSubs.subscriptions.map(sub => {
        const endDate = new Date(sub.endDate);
        const now = new Date();
        const daysRemaining = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        return {
          id: sub.id,
          study_pack_id: sub.studyPackId,
          pack_name: sub.studyPack.name,
          pack_type: sub.studyPack.type.toLowerCase(), // This is the key field for residency detection
          year_number: sub.studyPack.yearNumber,
          end_date: sub.endDate.toISOString(),
          days_remaining: Math.max(0, daysRemaining),
          accessible_year_levels: sub.studyPack.yearNumber === 'SEVEN' ?
            ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN'] :
            [sub.studyPack.yearNumber]
        };
      })
    };

    // Generate JWT token
    const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";
    const token = jwt.sign(jwtPayload, JWT_SECRET, { expiresIn: '15d' });

    console.log('✅ JWT Token generated successfully!');
    console.log('📋 User Info:');
    console.log('   - ID:', userWithSubs.id);
    console.log('   - Email:', userWithSubs.email);
    console.log('   - Role:', userWithSubs.role);
    console.log('   - Current Year:', userWithSubs.currentYear);
    console.log('   - Has Subscription:', jwtPayload.has_active_subscription);
    console.log('   - Accessible Study Packs:', jwtPayload.accessible_study_packs);
    console.log('');
    console.log('🔑 JWT Token:');
    console.log(token);
    console.log('');
    console.log('🧪 Test the API with:');
    console.log(`curl -X GET "http://localhost:3005/api/v1/exams/by-module/308/2024" -H "Authorization: Bearer ${token}" -H "Content-Type: application/json"`);

    return token;
  } catch (error) {
    console.error('❌ Error generating token:', error);
  } finally {
    await prisma.$disconnect();
  }
}

generateTestToken();
