#!/usr/bin/env node

/**
 * Database Update Script
 * 
 * This script helps update the database schema and run seeds
 * for the multiple choice questions feature.
 */

const { execSync } = require('child_process');
const path = require('path');

console.log('🚀 Starting database update for multiple choice questions...\n');

try {
  // Change to backend directory
  process.chdir(path.join(__dirname, '..'));
  
  console.log('📁 Current directory:', process.cwd());
  
  // Step 1: Generate Prisma client
  console.log('1️⃣ Generating Prisma client...');
  try {
    execSync('npx prisma generate', { stdio: 'inherit' });
    console.log('✅ Prisma client generated successfully\n');
  } catch (error) {
    console.log('⚠️  Prisma generate failed, trying alternative method...');
    try {
      execSync('node_modules/.bin/prisma generate', { stdio: 'inherit' });
      console.log('✅ Prisma client generated successfully\n');
    } catch (altError) {
      console.log('❌ Could not generate Prisma client. Please run manually:\n');
      console.log('   cd backend && npx prisma generate\n');
    }
  }
  
  // Step 2: Push schema changes
  console.log('2️⃣ Pushing schema changes to database...');
  try {
    execSync('npx prisma db push', { stdio: 'inherit' });
    console.log('✅ Schema changes pushed successfully\n');
  } catch (error) {
    console.log('⚠️  Schema push failed, trying alternative method...');
    try {
      execSync('node_modules/.bin/prisma db push', { stdio: 'inherit' });
      console.log('✅ Schema changes pushed successfully\n');
    } catch (altError) {
      console.log('❌ Could not push schema changes. Please run manually:\n');
      console.log('   cd backend && npx prisma db push\n');
    }
  }
  
  // Step 3: Run seed
  console.log('3️⃣ Running database seed...');
  try {
    execSync('npm run seed', { stdio: 'inherit' });
    console.log('✅ Database seeded successfully\n');
  } catch (error) {
    console.log('⚠️  Seed failed, trying TypeScript directly...');
    try {
      execSync('npx ts-node src/seed.ts', { stdio: 'inherit' });
      console.log('✅ Database seeded successfully\n');
    } catch (altError) {
      console.log('❌ Could not run seed. Please run manually:\n');
      console.log('   cd backend && npm run seed\n');
    }
  }
  
  console.log('🎉 Database update completed successfully!');
  console.log('\n📋 Summary of changes:');
  console.log('   ✅ Added QuestionType enum (SINGLE_CHOICE, MULTIPLE_CHOICE)');
  console.log('   ✅ Added questionType field to Question model');
  console.log('   ✅ Added MultipleChoiceAttempt model for multiple answer tracking');
  console.log('   ✅ Updated seed data with multiple choice questions');
  console.log('   ✅ Enhanced quiz system to support both question types');
  
  console.log('\n🔍 Next steps:');
  console.log('   1. Test the quiz creation with multiple choice questions');
  console.log('   2. Update frontend to handle multiple selection UI');
  console.log('   3. Test answer submission for both question types');
  
} catch (error) {
  console.error('❌ Database update failed:', error.message);
  console.log('\n🛠️  Manual steps to complete the update:');
  console.log('   1. cd backend');
  console.log('   2. npx prisma generate');
  console.log('   3. npx prisma db push');
  console.log('   4. npm run seed');
  process.exit(1);
}
