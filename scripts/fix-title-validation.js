#!/usr/bin/env node

/**
 * Title Validation Fix Script
 * Analyzes and fixes title validation issues in test scripts
 */

const fs = require('fs');
const path = require('path');

// Current validation regex from the schema
const TITLE_REGEX = /^[a-zA-Z0-9\s\-_.,!?]+$/;

// Function to validate a title against the current regex
function validateTitle(title) {
  return TITLE_REGEX.test(title);
}

// Function to sanitize a title to make it compliant
function sanitizeTitle(title) {
  // Replace problematic characters with allowed alternatives
  return title
    .replace(/:/g, ' -')           // Replace colons with dash
    .replace(/\(/g, '')            // Remove opening parentheses
    .replace(/\)/g, '')            // Remove closing parentheses
    .replace(/\[/g, '')            // Remove opening brackets
    .replace(/\]/g, '')            // Remove closing brackets
    .replace(/\{/g, '')            // Remove opening braces
    .replace(/\}/g, '')            // Remove closing braces
    .replace(/"/g, '')             // Remove quotes
    .replace(/'/g, '')             // Remove apostrophes
    .replace(/&/g, 'and')          // Replace ampersand
    .replace(/@/g, 'at')           // Replace at symbol
    .replace(/#/g, 'number')       // Replace hash
    .replace(/\$/g, 'dollar')      // Replace dollar sign
    .replace(/%/g, 'percent')      // Replace percent
    .replace(/\^/g, '')            // Remove caret
    .replace(/\*/g, '')            // Remove asterisk
    .replace(/\+/g, 'plus')        // Replace plus
    .replace(/=/g, 'equals')       // Replace equals
    .replace(/\|/g, 'or')          // Replace pipe
    .replace(/\\/g, '')            // Remove backslash
    .replace(/\//g, 'or')          // Replace forward slash
    .replace(/</g, 'less than')    // Replace less than
    .replace(/>/g, 'greater than') // Replace greater than
    .replace(/~/g, '')             // Remove tilde
    .replace(/`/g, '')             // Remove backtick
    .replace(/\s+/g, ' ')          // Replace multiple spaces with single space
    .trim();                       // Remove leading/trailing whitespace
}

// Test titles from our scripts
const testTitles = [
  'Single Choice Test Quiz',
  'Multiple Choice Test Quiz',
  'Mixed Questions Test Quiz',
  '2023 Exam Questions Quiz',
  'Multi-Year Exam Questions Quiz',
  'Combined Filtering Quiz',
  'Auto Year Detection Quiz',
  'Explicit Year Level Quiz',
  'No Type Field Quiz',
  'With Type Field Quiz',
  'Zero Count Quiz',
  'Over Limit Quiz',
  'Negative Count Quiz',
  'Invalid Type Quiz',
  'Future Year Quiz',
  'Empty Filters Quiz',
  'QCS Test Quiz',
  'QCM Test Quiz',
  'Original Session for Retake Test',
  'Same Questions Retake',
  'Data Structure Test Quiz',
  'Real Data Test: Course 10 (Basic Anatomy)',
  'Expected Failure Test: Multiple Choice in Course 10',
  'New Feature: Single Choice Filtering',
  'New Feature: Mixed Question Types',
  'New Feature: Exam Year Filtering',
  'Type Field Removal Test',
  'Quiz Type Test: Single Choice Questions',
  'Auto Year Detection Test'
];

console.log('🔍 Title Validation Analysis\n');

console.log('📋 Current Validation Regex:');
console.log(`   ${TITLE_REGEX}\n`);

console.log('✅ Allowed Characters:');
console.log('   - Letters: a-z, A-Z');
console.log('   - Numbers: 0-9');
console.log('   - Whitespace: spaces');
console.log('   - Special: - _ . , ! ?\n');

console.log('❌ Problematic Characters Found:');
const problematicChars = new Set();
const problematicTitles = [];

testTitles.forEach(title => {
  if (!validateTitle(title)) {
    problematicTitles.push(title);
    
    // Find which characters are problematic
    for (let char of title) {
      if (!TITLE_REGEX.test(char) && char !== ' ') {
        problematicChars.add(char);
      }
    }
  }
});

console.log(`   Found: ${Array.from(problematicChars).join(', ')}\n`);

console.log('🚫 Problematic Titles:');
problematicTitles.forEach(title => {
  console.log(`   ❌ "${title}"`);
  console.log(`   ✅ "${sanitizeTitle(title)}"`);
  console.log('');
});

console.log('📊 Summary:');
console.log(`   Total titles tested: ${testTitles.length}`);
console.log(`   Problematic titles: ${problematicTitles.length}`);
console.log(`   Valid titles: ${testTitles.length - problematicTitles.length}`);

// Generate fixed titles mapping
console.log('\n🛠️  Recommended Title Fixes:');
console.log('```javascript');
console.log('// Replace problematic titles with these fixed versions:');
problematicTitles.forEach(title => {
  const fixed = sanitizeTitle(title);
  console.log(`"${title}" → "${fixed}"`);
});
console.log('```');

console.log('\n💡 Alternative: Update Validation Regex');
console.log('If you want to allow more characters, consider updating the regex to:');
console.log('/^[a-zA-Z0-9\\s\\-_.,!?():]+$/  // Allows parentheses and colons');
console.log('or');
console.log('/^[a-zA-Z0-9\\s\\-_.,!?():&@#$%^*+=|\\/<>~`"\'\\[\\]{}]+$/  // Allows most special characters');

console.log('\n🎯 Recommendation:');
console.log('For security and consistency, it\'s better to fix the test titles');
console.log('rather than loosening the validation regex.');
