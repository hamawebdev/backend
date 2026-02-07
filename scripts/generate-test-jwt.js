const jwt = require('jsonwebtoken');

// JWT secret from environment or default
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production';

// Create JWT payload for user 5053
const payload = {
  user_data: {
    id: 5053,
    email: 'test-analytics-5053@example.com',
    fullName: 'Test Analytics User 5053',
    role: 'STUDENT',
    universityId: null,
    specialtyId: null,
    currentYear: 'THREE',
    emailVerified: true,
    isActive: true
  },
  subscriptions: [
    {
      id: 1,
      study_pack_id: 1001,
      pack_name: 'Medical Analytics Pack',
      pack_type: 'MEDICAL',
      year_number: '3',
      end_date: '2025-12-31T23:59:59.000Z',
      days_remaining: 127,
      accessible_year_levels: ['ONE', 'TWO', 'THREE'],
      activeSubscriptions: [
        {
          id: 1,
          studyPackId: 1001,
          status: 'ACTIVE',
          startDate: '2025-01-01T00:00:00.000Z',
          endDate: '2025-12-31T23:59:59.000Z'
        }
      ]
    }
  ],
  payment_status: 'active',
  has_active_subscription: true,
  accessible_study_packs: [1001]
};

// Generate JWT token
const token = jwt.sign(payload, JWT_SECRET, { 
  expiresIn: '24h',
  issuer: 'medcin-platform',
  audience: 'medcin-users'
});

console.log('JWT Token for User 5053:');
console.log(token);
console.log('\nUse this token in the Authorization header as:');
console.log(`Authorization: Bearer ${token}`);
console.log('\nToken expires in 24 hours');
