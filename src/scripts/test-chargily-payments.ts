#!/usr/bin/env ts-node

/**
 * Test script for Chargily Payments Integration
 * This script creates a test checkout and verifies the integration
 */

import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function testCheckoutCreation() {
  try {
    console.log('Testing Chargily Checkout Creation...');
    
    // Test data - replace with actual user and study pack IDs from your database
    const testData = {
      userId: 1, // Replace with a valid user ID
      studyPackId: 1, // Replace with a valid study pack ID
      amountDzd: 2000, // 2000 DZD in minor units
      locale: 'en',
      paymentMethod: 'edahabia'
    };

    console.log('Sending request to create checkout...');
    
    const response = await fetch('http://localhost:3005/api/v1/payments/checkouts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testData)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Failed to create checkout:', response.status, errorText);
      return;
    }

    const result = await response.json();
    console.log('Checkout created successfully!');
    console.log('Checkout URL:', result.checkoutUrl);
    console.log('Checkout ID:', result.checkoutId);
    
    console.log('\nNext steps:');
    console.log('1. Open the checkout URL in your browser to test the payment flow');
    console.log('2. Complete a test payment using Chargily Pay test mode');
    console.log('3. Verify that the webhook is received and processed correctly');
    console.log('4. Check that the subscription status is updated to ACTIVE in the database');
    
  } catch (error) {
    console.error('Error during test:', error);
  }
}

// Run the test
testCheckoutCreation();