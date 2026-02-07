#!/bin/bash

# Test Script for Quiz Submit Answer Endpoint
# This script authenticates as a student and tests the submit-answer API

# Configuration
BASE_URL="${BASE_URL:-http://localhost:8080/api/v1}"
EMAIL="${TEST_EMAIL:-test@example.com}"
PASSWORD="${TEST_PASSWORD:-password123}"
OUTPUT_DIR="/home/Public/acad/backend/test-results"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Create output directory
mkdir -p "$OUTPUT_DIR"

log_info() {
    echo "[INFO] $1" >&2
}

log_success() {
    echo "[SUCCESS] $1" >&2
}

log_error() {
    echo "[ERROR] $1" >&2
}

log_warning() {
    echo "[WARNING] $1" >&2
}

# Function to make API requests and save responses
api_request() {
    local method="$1"
    local endpoint="$2"
    local data="$3"
    local token="$4"
    local output_file="$5"
    
    local response_file=$(mktemp)
    local http_code_file=$(mktemp)
    
    # Construct headers array
    local headers=("-H" "Content-Type: application/json")
    if [ -n "$token" ]; then
        headers+=("-H" "Authorization: Bearer $token")
    fi
    
    # Run curl
    if [ -n "$data" ]; then
        curl -s -w "%{http_code}" -o "$response_file" -X "$method" \
            "${headers[@]}" \
            -d "$data" \
            "$BASE_URL$endpoint" > "$http_code_file"
    else
        curl -s -w "%{http_code}" -o "$response_file" -X "$method" \
            "${headers[@]}" \
            "$BASE_URL$endpoint" > "$http_code_file"
    fi
    
    local curl_exit_code=$?
    
    if [ $curl_exit_code -ne 0 ]; then
        log_error "curl command failed with exit code $curl_exit_code"
        rm "$response_file" "$http_code_file"
        return 1
    fi
    
    local http_code=$(cat "$http_code_file")
    local body=$(cat "$response_file")
    
    # Clean up temp files
    rm "$response_file" "$http_code_file"
    
    log_info "$method $endpoint -> Status: $http_code"
    
    # Save to file if output file specified
    if [ -n "$output_file" ]; then
        if [ -n "$body" ]; then
             echo "$body" | jq '.' > "$output_file" 2>/dev/null || echo "$body" > "$output_file"
        else
             echo "{ \"error\": \"Empty response\", \"status\": $http_code }" > "$output_file"
        fi
    fi
    
    if [[ "$http_code" -ge 400 ]]; then
        log_error "Request failed with status $http_code"
        # Print body to stderr for debugging
        echo "$body" | jq '.' >&2 2>/dev/null || echo "$body" >&2
    fi
    
    echo "$body"
    return 0
}

# Extract JSON value using jq
get_json_value() {
    echo "$1" | jq -r "$2" 2>/dev/null
}

echo ""
echo "========================================"
echo "  Quiz Submit-Answer Endpoint Test"
echo "========================================"
echo ""
log_info "Base URL: $BASE_URL"
log_info "Email: $EMAIL"
log_info "Timestamp: $TIMESTAMP"
echo ""

# Step 1: Login
log_info "Step 1: Authenticating..."
LOGIN_RESPONSE=$(api_request "POST" "/auth/login" \
    "{\"email\": \"$EMAIL\", \"password\": \"$PASSWORD\"}" \
    "" \
    "$OUTPUT_DIR/${TIMESTAMP}_01_login.json")

# Extract token
ACCESS_TOKEN=$(get_json_value "$LOGIN_RESPONSE" '.data.tokens.accessToken // .data.accessToken // .accessToken // .token')

if [ -z "$ACCESS_TOKEN" ] || [ "$ACCESS_TOKEN" == "null" ]; then
    log_error "Login failed! Token extraction failed."
    echo "Response: $LOGIN_RESPONSE"
    exit 1
fi

log_success "Login successful!"

# Step 2: Get existing quiz sessions or create a new one
log_info "Step 2: Fetching existing quiz sessions..."
SESSIONS_RESPONSE=$(api_request "GET" "/students/quiz-sessions?page=1&limit=10" \
    "" \
    "$ACCESS_TOKEN" \
    "$OUTPUT_DIR/${TIMESTAMP}_02_sessions.json")

# Try to get valid session ID
SESSION_ID=$(get_json_value "$SESSIONS_RESPONSE" '.data.sessions[0].id // .sessions[0].id // .data[0].id')

if [ -z "$SESSION_ID" ] || [ "$SESSION_ID" == "null" ]; then
    log_info "No existing sessions found. Creating a new quiz session..."
    
    # Step 2b: Get quiz filters
    FILTERS_RESPONSE=$(api_request "GET" "/quizzes/quiz-filters" \
        "" \
        "$ACCESS_TOKEN" \
        "$OUTPUT_DIR/${TIMESTAMP}_02b_filters.json")
    
    # Use generic creation request
    CREATE_SESSION_RESPONSE=$(api_request "POST" "/quizzes/quiz-sessions" \
        '{
            "title": "Test Session - Stats Verification",
            "type": "PRACTICE",
            "settings": { "questionCount": 5 },
            "filters": {}
        }' \
        "$ACCESS_TOKEN" \
        "$OUTPUT_DIR/${TIMESTAMP}_02c_create_session.json")
    
    SESSION_ID=$(get_json_value "$CREATE_SESSION_RESPONSE" '.data.sessionId // .sessionId')
    
    if [ -z "$SESSION_ID" ] || [ "$SESSION_ID" == "null" ]; then
        log_error "Failed to create session!"
        echo "Response: $CREATE_SESSION_RESPONSE"
        exit 1
    fi
    log_success "Created new session: $SESSION_ID"
else
    log_success "Found existing session: $SESSION_ID"
fi

# Step 3: Get session details (questions)
log_info "Step 3: Fetching session details..."
SESSION_DETAILS=$(api_request "GET" "/students/quiz-sessions/$SESSION_ID" \
    "" \
    "$ACCESS_TOKEN" \
    "$OUTPUT_DIR/${TIMESTAMP}_03_session_details.json")

QUESTIONS=$(get_json_value "$SESSION_DETAILS" '.questions // .data.questions')
QUESTION_COUNT=$(echo "$QUESTIONS" | jq 'length' 2>/dev/null || echo "0")
log_info "Session has $QUESTION_COUNT questions"

# Step 4: Submit answers
log_info "Step 4: Submitting answers..."

ANSWERS_TO_SUBMIT=()
for i in $(seq 0 2); do
    if [ $i -ge $QUESTION_COUNT ]; then break; fi
    
    QUESTION=$(echo "$QUESTIONS" | jq ".[$i]")
    Q_ID=$(echo "$QUESTION" | jq -r '.id')
    Q_TYPE=$(echo "$QUESTION" | jq -r '.questionType // "SINGLE_CHOICE"')
    FIRST_ANSWER_ID=$(echo "$QUESTION" | jq -r '.questionAnswers[0].id // .answers[0].id' 2>/dev/null)
    
    if [ -z "$FIRST_ANSWER_ID" ] || [ "$FIRST_ANSWER_ID" == "null" ]; then continue; fi
    
    log_info "  Q$Q_ID ($Q_TYPE) -> A:$FIRST_ANSWER_ID"
    
    if [ "$Q_TYPE" == "MULTIPLE_CHOICE" ]; then
        ANSWERS_TO_SUBMIT+=("{\"questionId\": $Q_ID, \"selectedAnswerIds\": [$FIRST_ANSWER_ID]}")
    else
        ANSWERS_TO_SUBMIT+=("{\"questionId\": $Q_ID, \"selectedAnswerId\": $FIRST_ANSWER_ID}")
    fi
done

ANSWERS_JSON=$(IFS=,; echo "[${ANSWERS_TO_SUBMIT[*]}]")
SUBMIT_PAYLOAD="{\"answers\": $ANSWERS_JSON}"

SUBMIT_RESPONSE=$(api_request "POST" "/students/quiz-sessions/$SESSION_ID/submit-answer" \
    "$SUBMIT_PAYLOAD" \
    "$ACCESS_TOKEN" \
    "$OUTPUT_DIR/${TIMESTAMP}_04_submit_answer.json")

# Step 5: Validate
log_info "Step 5: Validating..."

SCORE=$(get_json_value "$SUBMIT_RESPONSE" '.score')
CORRECT=$(get_json_value "$SUBMIT_RESPONSE" '.correctAnswersCount')
INCORRECT=$(get_json_value "$SUBMIT_RESPONSE" '.incorrectAnswersCount')
UNANSWERED=$(get_json_value "$SUBMIT_RESPONSE" '.unansweredCount')
TOTAL=$(get_json_value "$SUBMIT_RESPONSE" '.totalQuestions')

echo ""
echo "Stats: Score=$SCORE%, Correct=$CORRECT, Incorrect=$INCORRECT, Unanswered=$UNANSWERED, Total=$TOTAL"

EXPECTED_ANSWERED=$((CORRECT + INCORRECT))
if [ "$EXPECTED_ANSWERED" -gt 0 ] 2>/dev/null; then
    CALCULATED_TOTAL=$((EXPECTED_ANSWERED + UNANSWERED))
    if [ "$CALCULATED_TOTAL" -eq "$TOTAL" ]; then
        log_success "Stats consistent ($CALCULATED_TOTAL == $TOTAL)"
    else
        log_error "Stats INCONSISTENT ($CALCULATED_TOTAL != $TOTAL)"
    fi
else
    log_error "No answers recorded in stats?"
fi

echo ""
log_info "Done."
