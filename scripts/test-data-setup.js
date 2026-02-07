const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function setupTestData() {
  try {
    console.log('Setting up test data...');

    // Update admin user role
    await prisma.user.update({
      where: { email: 'admin@test.com' },
      data: { role: 'ADMIN' }
    });
    console.log('✅ Updated admin user role');

    // Create study packs
    const studyPack1 = await prisma.studyPack.create({
      data: {
        name: 'Test Study Pack 1',
        description: 'First test study pack for activation codes',
        type: 'YEAR',
        yearNumber: 'THREE',
        price: 99.99,
        isActive: true
      }
    });

    const studyPack2 = await prisma.studyPack.create({
      data: {
        name: 'Test Study Pack 2', 
        description: 'Second test study pack for activation codes',
        type: 'SPECIALTY',
        price: 149.99,
        isActive: true
      }
    });
    console.log('✅ Created study packs');

    // Create a test activation code
    const activationCode = await prisma.activationCode.create({
      data: {
        code: 'TESTCODE2024',
        hashedCode: 'TESTCODE2024',
        description: 'Test activation code for API testing',
        durationMonths: 6,
        maxUses: 100,
        currentUses: 0,
        isActive: true,
        expiresAt: new Date('2024-12-31T23:59:59Z'),
        createdById: 16, // Admin user ID
        studyPacks: {
          create: [
            { studyPackId: studyPack1.id },
            { studyPackId: studyPack2.id }
          ]
        }
      },
      include: {
        studyPacks: {
          include: {
            studyPack: true
          }
        }
      }
    });
    console.log('✅ Created activation code:', activationCode.code);

    console.log('\n🎉 Test data setup complete!');
    console.log('📋 Test Details:');
    console.log(`   Admin Email: admin@test.com`);
    console.log(`   Student Email: student@test.com`);
    console.log(`   Test Code: ${activationCode.code}`);
    console.log(`   Study Packs: ${studyPack1.name}, ${studyPack2.name}`);

  } catch (error) {
    console.error('❌ Error setting up test data:', error);
  } finally {
    await prisma.$disconnect();
  }
}

setupTestData();
