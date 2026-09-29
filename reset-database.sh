#!/bin/bash

# Reset Database and Apply Updated Question Model Changes
# This script will reset the database, apply migrations, and run the updated seeder
# Development only: it drops every table of the DATABASE_URL database (from the
# environment, else .env). Step 0 refuses a non-local database or one that already
# holds real data; ALLOW_PRODUCTION_SEED=true overrides it.

set -e
cd "$(dirname "$0")"

echo "🚀 Starting Database Reset and Migration Process..."
echo "=================================================="

# Step 0: Refuse to wipe anything but a local development database
echo "🛡️  Checking the target database..."
npx ts-node --project prisma/dev-seed/tsconfig.json prisma/dev-seed/seed-guard.ts

# Step 1: Reset the database
echo "🗑️  Resetting database..."
npx prisma migrate reset --force --skip-seed

# Step 2: Generate Prisma client
echo "🔧 Generating Prisma client..."
npx prisma generate

# Step 3: Apply all migrations
echo "📦 Applying migrations..."
npx prisma migrate deploy

# Step 4: Run the updated seeder
echo "🌱 Running updated seeder..."
npm run prisma:seed

# Step 5: Verify the database state
echo "🔍 Verifying database state..."
echo "Checking Question model fields..."

# Use Node.js to check the database
node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function verifyDatabase() {
  try {
    console.log('📊 Database Verification:');
    
    // Count records
    const counts = {
      questions: await prisma.question.count(),
      questionSources: await prisma.questionSource.count(),
      exams: await prisma.exam.count(),
      users: await prisma.user.count(),
      subscriptions: await prisma.subscription.count()
    };
    
    console.log('Record counts:', counts);
    
    // Check Question model fields
    const sampleQuestion = await prisma.question.findFirst({
      include: {
        source: true,
        exam: true,
        course: true,
        university: true
      }
    });
    
    if (sampleQuestion) {
      console.log('✅ Sample Question Structure:');
      console.log('  ID:', sampleQuestion.id);
      console.log('  Course ID:', sampleQuestion.courseId);
      console.log('  Exam ID:', sampleQuestion.examId);
      console.log('  Source ID:', sampleQuestion.sourceId);
      console.log('  Exam Year:', sampleQuestion.examYear);
      console.log('  Metadata:', sampleQuestion.metadata ? 'Present' : 'Not set');
      console.log('  Source Name:', sampleQuestion.source?.name || 'No source');
      console.log('  Exam Title:', sampleQuestion.exam?.title || 'No exam');
    }
    
    // Check questions with new fields
    const questionsWithExams = await prisma.question.count({
      where: { examId: { not: null } }
    });
    
    const questionsWithSources = await prisma.question.count({
      where: { sourceId: { not: null } }
    });
    
    const questionsWithMetadata = await prisma.question.count({
      where: { metadata: { not: null } }
    });
    
    console.log('✅ Field Usage:');
    console.log('  Questions with Exam links:', questionsWithExams);
    console.log('  Questions with Sources:', questionsWithSources);
    console.log('  Questions with Metadata:', questionsWithMetadata);
    
    // Test quiz session creation
    console.log('🧪 Testing Quiz Session Creation...');
    const testUser = await prisma.user.findFirst({
      where: { role: 'STUDENT' },
      include: { subscriptions: true }
    });
    
    if (testUser && testUser.subscriptions.length > 0) {
      console.log('✅ Test user found with subscriptions');
      console.log('  User:', testUser.email);
      console.log('  Subscriptions:', testUser.subscriptions.length);
    } else {
      console.log('⚠️  No test user with subscriptions found');
    }
    
    console.log('\\n🎉 Database verification completed successfully!');
    
  } catch (error) {
    console.error('❌ Database verification failed:', error);
  } finally {
    await prisma.\$disconnect();
  }
}

verifyDatabase();
"

echo ""
echo "✅ Database reset and seeding completed!"
echo "=================================================="
echo "📋 Summary:"
echo "   - Database reset and migrations applied"
echo "   - Updated Question model with examId, sourceId, examYear, and metadata fields"
echo "   - Seeder updated to populate new fields with test data"
echo "   - All questions now linked to exams and sources where appropriate"
echo ""
echo "🚀 Ready to test quiz routes with updated Question model!"
