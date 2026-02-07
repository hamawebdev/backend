require('reflect-metadata');
const { checkPayment } = require('./build/core/middlewares/paymentCheck.middleware');

// Mock request and response objects
const mockReq = {
  path: '/api/v1/payments/checkouts',
  originalUrl: '/api/v1/payments/checkouts',
  user: {
    has_active_subscription: false,
    payment_status: 'pending'
  }
};

const mockRes = {
  status: function(code) {
    this.statusCode = code;
    return this;
  },
  json: function(data) {
    this.body = data;
    return this;
  }
};

const mockNext = function() {
  console.log('Next middleware called - this means the request was allowed to proceed');
};

// Test the checkPayment middleware
console.log('Testing checkPayment middleware with /api/v1/payments/checkouts path...');

const middleware = checkPayment();
middleware(mockReq, mockRes, mockNext);

if (mockRes.statusCode) {
  console.log('Response status code:', mockRes.statusCode);
  console.log('Response body:', JSON.stringify(mockRes.body, null, 2));
} else {
  console.log('No response sent - request was allowed to proceed');
}