#!/bin/bash

# Question Explanation with Images API Test Script
# This script demonstrates how to test the question explanation endpoint

# Configuration
BASE_URL="http://localhost:3005"
API_PATH="/api/v1/admin/questions"

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
# 1. Create an admin user account
# 2. Login to get a JWT token
# 3. Create a question to get a question ID
# For this demo, we'll use placeholder values

ADMIN_TOKEN="your-admin-jwt-token-here"
QUESTION_ID="123"

echo
print_warning "IMPORTANT: This script requires valid JWT tokens and question IDs"
print_warning "Please replace the placeholder values with real tokens and question IDs"
echo

# Test 1: Update explanation text only
test_api "PUT" \
    "$BASE_URL$API_PATH/$QUESTION_ID/explanation" \
    '{
        "explanation": "This is an updated explanation without images."
    }' \
    "$ADMIN_TOKEN" \
    "Update explanation text only"

# Test 2: Update explanation with new images
test_api "PUT" \
    "$BASE_URL$API_PATH/$QUESTION_ID/explanation" \
    '{
        "explanation": "This explanation includes visual aids to help understand the concept.",
        "explanationImages": [
            {
                "imagePath": "explanations_1692345678901-123456789.jpg",
                "altText": "Main concept diagram"
            },
            {
                "imagePath": "explanations_1692345678901-987654321.png",
                "altText": "Supporting data chart"
            }
        ]
    }' \
    "$ADMIN_TOKEN" \
    "Update explanation with new images"

# Test 3: Update explanation with many images (test replacement)
test_api "PUT" \
    "$BASE_URL$API_PATH/$QUESTION_ID/explanation" \
    '{
        "explanation": "This explanation has many images that might trigger replacement.",
        "explanationImages": [
            {"imagePath": "image1.jpg", "altText": "Image 1"},
            {"imagePath": "image2.jpg", "altText": "Image 2"},
            {"imagePath": "image3.jpg", "altText": "Image 3"},
            {"imagePath": "image4.jpg", "altText": "Image 4"},
            {"imagePath": "image5.jpg", "altText": "Image 5"},
            {"imagePath": "image6.jpg", "altText": "Image 6"},
            {"imagePath": "image7.jpg", "altText": "Image 7"},
            {"imagePath": "image8.jpg", "altText": "Image 8"},
            {"imagePath": "image9.jpg", "altText": "Image 9"},
            {"imagePath": "image10.jpg", "altText": "Image 10"}
        ]
    }' \
    "$ADMIN_TOKEN" \
    "Update explanation with maximum images (10)"

# Test 4: Invalid explanation (empty)
test_api "PUT" \
    "$BASE_URL$API_PATH/$QUESTION_ID/explanation" \
    '{
        "explanation": ""
    }' \
    "$ADMIN_TOKEN" \
    "Invalid explanation (empty) - should fail"

# Test 5: Too many images
test_api "PUT" \
    "$BASE_URL$API_PATH/$QUESTION_ID/explanation" \
    '{
        "explanation": "This explanation has too many images.",
        "explanationImages": [
            {"imagePath": "image1.jpg", "altText": "Image 1"},
            {"imagePath": "image2.jpg", "altText": "Image 2"},
            {"imagePath": "image3.jpg", "altText": "Image 3"},
            {"imagePath": "image4.jpg", "altText": "Image 4"},
            {"imagePath": "image5.jpg", "altText": "Image 5"},
            {"imagePath": "image6.jpg", "altText": "Image 6"},
            {"imagePath": "image7.jpg", "altText": "Image 7"},
            {"imagePath": "image8.jpg", "altText": "Image 8"},
            {"imagePath": "image9.jpg", "altText": "Image 9"},
            {"imagePath": "image10.jpg", "altText": "Image 10"},
            {"imagePath": "image11.jpg", "altText": "Image 11"}
        ]
    }' \
    "$ADMIN_TOKEN" \
    "Too many images (11) - should fail"

# Test 6: Invalid image format
test_api "PUT" \
    "$BASE_URL$API_PATH/$QUESTION_ID/explanation" \
    '{
        "explanation": "This explanation has an invalid image format.",
        "explanationImages": [
            {
                "imagePath": "document.pdf",
                "altText": "Invalid file format"
            }
        ]
    }' \
    "$ADMIN_TOKEN" \
    "Invalid image format - should fail"

# Test 7: Missing authentication
test_api "PUT" \
    "$BASE_URL$API_PATH/$QUESTION_ID/explanation" \
    '{
        "explanation": "This should fail due to missing authentication."
    }' \
    "" \
    "Missing authentication - should fail"

# Test 8: Non-existent question
test_api "PUT" \
    "$BASE_URL$API_PATH/99999/explanation" \
    '{
        "explanation": "This should fail because the question does not exist."
    }' \
    "$ADMIN_TOKEN" \
    "Non-existent question - should fail"

# Test 9: Images without alt text (should work)
test_api "PUT" \
    "$BASE_URL$API_PATH/$QUESTION_ID/explanation" \
    '{
        "explanation": "This explanation has images without alt text.",
        "explanationImages": [
            {
                "imagePath": "image-no-alt.jpg"
            }
        ]
    }' \
    "$ADMIN_TOKEN" \
    "Images without alt text - should work"

# Test 10: Very long explanation (should fail)
test_api "PUT" \
    "$BASE_URL$API_PATH/$QUESTION_ID/explanation" \
    "{
        \"explanation\": \"$(printf 'a%.0s' {1..5001})\"
    }" \
    "$ADMIN_TOKEN" \
    "Very long explanation (5001 chars) - should fail"

echo
print_status "Test script completed!"
print_warning "Remember to replace placeholder tokens and question IDs with real values"

# Instructions for getting real tokens and question IDs
echo
echo "To get real tokens and question IDs:"
echo "1. Create an admin user account via the registration endpoint"
echo "2. Login to get a JWT token"
echo "3. Create a question to get a question ID"
echo "4. Replace the placeholder values in this script"
echo
echo "Example commands:"
echo "# Register an admin user"
echo "curl -X POST $BASE_URL/api/v1/auth/register \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"email\":\"admin@example.com\",\"password\":\"password123\",\"firstName\":\"Admin\",\"lastName\":\"User\",\"role\":\"ADMIN\"}'"
echo
echo "# Login to get token"
echo "curl -X POST $BASE_URL/api/v1/auth/login \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"email\":\"admin@example.com\",\"password\":\"password123\"}'"
echo
echo "# Create a question"
echo "curl -X POST $BASE_URL/api/v1/admin/questions \\"
echo "  -H 'Authorization: Bearer YOUR_TOKEN' \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"questionText\":\"Test question\",\"explanation\":\"Initial explanation\",\"answers\":[{\"answerText\":\"Answer 1\",\"isCorrect\":true},{\"answerText\":\"Answer 2\",\"isCorrect\":false}]}'"
echo
echo "# Upload images first (optional)"
echo "curl -X POST $BASE_URL/api/v1/admin/upload/question-explanation \\"
echo "  -H 'Authorization: Bearer YOUR_TOKEN' \\"
echo "  -F 'explanationImages=@image1.jpg' \\"
echo "  -F 'explanationImages=@image2.png'"
