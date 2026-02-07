#!/usr/bin/env ts-node
"use strict";
/**
 * Test script for Chargily Payments Integration
 * This script creates a test checkout and verifies the integration
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
// Load environment variables
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '../../.env') });
function testCheckoutCreation() {
    return __awaiter(this, void 0, void 0, function* () {
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
            const response = yield fetch('http://localhost:3005/api/v1/payments/checkouts', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(testData)
            });
            if (!response.ok) {
                const errorText = yield response.text();
                console.error('Failed to create checkout:', response.status, errorText);
                return;
            }
            const result = yield response.json();
            console.log('Checkout created successfully!');
            console.log('Checkout URL:', result.checkoutUrl);
            console.log('Checkout ID:', result.checkoutId);
            console.log('\nNext steps:');
            console.log('1. Open the checkout URL in your browser to test the payment flow');
            console.log('2. Complete a test payment using Chargily Pay test mode');
            console.log('3. Verify that the webhook is received and processed correctly');
            console.log('4. Check that the subscription status is updated to ACTIVE in the database');
        }
        catch (error) {
            console.error('Error during test:', error);
        }
    });
}
// Run the test
testCheckoutCreation();
