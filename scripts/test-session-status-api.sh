#!/bin/bash

# Session Status Update API Test Script
# This script demonstrates how to test the session status update endpoint

# Configuration
BASE_URL="http://localhost:3005"
API_PATH="/api/v1/students/quiz-sessions"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Function to make API request and show response
test_api() {
    local method=$1
    local url=$2
    local data=$3
    local token=$4
    local description=$5
    
    echo
    print_status "Testing: $description"
    echo "Request: $method $url"
    echo "Data: $data"
    echo "Response:"
    
    if [ -n "$token" ]; then
        curl -s -X "$method" "$url" \
            -H "Authorization: Bearer $token" \
            -H "Content-Type: application/json" \
            -d "$data" | jq '.'
    else
        curl -s -X "$method" "$url" \
            -H "Content-Type: application/json" \
            -d "$data" | jq '.'
    fi
    
    echo "----------------------------------------"
}

# Check if jq is installed
if ! command -v jq &> /dev/null; then
    print_error "jq is required for JSON formatting. Please install it first."
    exit 1
fi

# Check if server is running
print_status "Checking if server is running..."
if ! curl -s "$BASE_URL/health" > /dev/null 2>&1; then
    print_error "Server is not running at $BASE_URL"
    print_warning "Please start the server first with: npm start"
    exit 1
fi

print_success "Server is running!"

# Note: In a real scenario, you would need to:
# 1. Create a user account
# 2. Login to get a JWT token
# 3. Create a quiz session
# For this demo, we'll use placeholder values

STUDENT_TOKEN="your-student-jwt-token-here"
ADMIN_TOKEN="your-admin-jwt-token-here"
SESSION_ID="123"

echo
print_warning "IMPORTANT: This script requires valid JWT tokens and session IDs"
print_warning "Please replace the placeholder values with real tokens and session IDs"
echo

# Test 1: Start a session (NOT_STARTED -> IN_PROGRESS)
test_api "PATCH" \
    "$BASE_URL$API_PATH/$SESSION_ID/status" \
    '{"status": "IN_PROGRESS"}' \
    "$STUDENT_TOKEN" \
    "Start a session (NOT_STARTED -> IN_PROGRESS)"

# Test 2: Complete a session (IN_PROGRESS -> COMPLETED)
test_api "PATCH" \
    "$BASE_URL$API_PATH/$SESSION_ID/status" \
    '{"status": "COMPLETED"}' \
    "$STUDENT_TOKEN" \
    "Complete a session (IN_PROGRESS -> COMPLETED)"

# Test 3: Reset session for retake (COMPLETED -> NOT_STARTED)
test_api "PATCH" \
    "$BASE_URL$API_PATH/$SESSION_ID/status" \
    '{"status": "NOT_STARTED"}' \
    "$STUDENT_TOKEN" \
    "Reset session for retake (COMPLETED -> NOT_STARTED)"

# Test 4: Admin updates any session
test_api "PATCH" \
    "$BASE_URL$API_PATH/$SESSION_ID/status" \
    '{"status": "COMPLETED"}' \
    "$ADMIN_TOKEN" \
    "Admin updates any session"

# Test 5: Invalid status value
test_api "PATCH" \
    "$BASE_URL$API_PATH/$SESSION_ID/status" \
    '{"status": "INVALID_STATUS"}' \
    "$STUDENT_TOKEN" \
    "Invalid status value (should fail)"

# Test 6: Missing authentication
test_api "PATCH" \
    "$BASE_URL$API_PATH/$SESSION_ID/status" \
    '{"status": "IN_PROGRESS"}' \
    "" \
    "Missing authentication (should fail)"

# Test 7: Non-existent session
test_api "PATCH" \
    "$BASE_URL$API_PATH/99999/status" \
    '{"status": "IN_PROGRESS"}' \
    "$STUDENT_TOKEN" \
    "Non-existent session (should fail)"

# Test 8: Invalid session ID
test_api "PATCH" \
    "$BASE_URL$API_PATH/invalid/status" \
    '{"status": "IN_PROGRESS"}' \
    "$STUDENT_TOKEN" \
    "Invalid session ID (should fail)"

# Test 9: Missing request body
test_api "PATCH" \
    "$BASE_URL$API_PATH/$SESSION_ID/status" \
    '{}' \
    "$STUDENT_TOKEN" \
    "Missing status field (should fail)"

echo
print_status "Test script completed!"
print_warning "Remember to replace placeholder tokens and session IDs with real values"

# Instructions for getting real tokens and session IDs
echo
echo "To get real tokens and session IDs:"
echo "1. Create a user account via the registration endpoint"
echo "2. Login to get a JWT token"
echo "3. Create a quiz session to get a session ID"
echo "4. Replace the placeholder values in this script"
echo
echo "Example commands:"
echo "# Register a user"
echo "curl -X POST $BASE_URL/api/v1/auth/register \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"email\":\"test@example.com\",\"password\":\"password123\",\"firstName\":\"Test\",\"lastName\":\"User\"}'"
echo
echo "# Login to get token"
echo "curl -X POST $BASE_URL/api/v1/auth/login \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"email\":\"test@example.com\",\"password\":\"password123\"}'"
echo
echo "# Create a quiz session"
echo "curl -X POST $BASE_URL/api/v1/students/quiz-sessions \\"
echo "  -H 'Authorization: Bearer YOUR_TOKEN' \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"sessionType\":\"PRACTICE\",\"questionsPerSession\":10}'"
