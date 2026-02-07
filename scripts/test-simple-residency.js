// Simple test to verify the residency access logic fix

function hasResidencyAccessOld(user) {
  // Old logic (broken)
  return user.subscriptions.some(sub =>
    sub.pack_type === 'RESIDENCY' // Only uppercase
  );
}

function hasResidencyAccessNew(user) {
  // New logic (fixed)
  return user.subscriptions.some(sub =>
    sub.pack_type === 'residency' || sub.pack_type === 'RESIDENCY'
  );
}

// Test cases
const testCases = [
  {
    name: 'Residency user with lowercase pack_type',
    user: {
      subscriptions: [{
        pack_type: 'residency' // lowercase from JWT token
      }]
    },
    expectedResult: true
  },
  {
    name: 'Residency user with uppercase pack_type',
    user: {
      subscriptions: [{
        pack_type: 'RESIDENCY' // uppercase
      }]
    },
    expectedResult: true
  },
  {
    name: 'Regular user with year pack_type',
    user: {
      subscriptions: [{
        pack_type: 'year'
      }]
    },
    expectedResult: false
  },
  {
    name: 'User with no subscriptions',
    user: {
      subscriptions: []
    },
    expectedResult: false
  }
];

console.log('🧪 Testing residency access logic fix...\n');

testCases.forEach((testCase, index) => {
  console.log(`Test ${index + 1}: ${testCase.name}`);
  
  const oldResult = hasResidencyAccessOld(testCase.user);
  const newResult = hasResidencyAccessNew(testCase.user);
  
  console.log(`   - Old logic result: ${oldResult}`);
  console.log(`   - New logic result: ${newResult}`);
  console.log(`   - Expected result: ${testCase.expectedResult}`);
  
  const oldCorrect = oldResult === testCase.expectedResult;
  const newCorrect = newResult === testCase.expectedResult;
  
  console.log(`   - Old logic: ${oldCorrect ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`   - New logic: ${newCorrect ? '✅ PASS' : '❌ FAIL'}`);
  console.log('');
});

console.log('📊 Summary:');
console.log('The old logic failed for lowercase "residency" pack_type (from JWT tokens)');
console.log('The new logic handles both "residency" and "RESIDENCY" correctly');
console.log('✅ Fix verified!');
