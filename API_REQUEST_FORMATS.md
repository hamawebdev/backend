# API Request Format Documentation

This document provides the request format specifications for the key API endpoints in the backend application.

API_URL=https://med-adn.com/api/v1/


## Table of Contents
1. [Questions Bulk Endpoint](#questions-bulk-endpoint)
2. [Question Images Upload Endpoint](#question-images-upload-endpoint)
3. [Question Explanation Images Upload Endpoint](#question-explanation-images-upload-endpoint)
4. [Unit Creation Endpoint](#unit-creation-endpoint)
5. [Module Creation Endpoint](#module-creation-endpoint)
6. [Course Creation Endpoint](#course-creation-endpoint)
7. [Logo Upload Endpoint](#logo-upload-endpoint)
8. [QROC Question Creation Endpoint](#qroc-question-creation-endpoint)

---

## Questions Bulk Endpoint

Create multiple questions in a single request with shared metadata.

**Endpoint:** `POST /api/v1/admin/questions/bulk`

**Authentication:** Required (Admin or Employee role)

### Request Headers
| Header | Value |
|--------|-------|
| Content-Type | application/json |
| Authorization | Bearer {token} |

### Request Body

```json
{
  "metadata": {
    "courseId": 1,
    "examId": 1,
    "sourceId": 1,
    "universityId": 1,
    "yearLevel": "FIRST_YEAR",
    "examYear": 2024
  },
  "questions": [
    {
      "questionText": "What is the primary function of the mitochondria?",
      "explanation": "The mitochondria is known as the powerhouse of the cell...",
      "questionType": "SINGLE_CHOICE",
      "questionTags": ["cell-biology", "energy", "mitochondria"],
      "questionImages": [
        {
          "imagePath": "/uploads/questions/img1.jpg",
          "altText": "Mitochondria diagram"
        }
      ],
      "explanationImages": [
        {
          "imagePath": "/uploads/explanations/exp1.jpg",
          "altText": "Cell energy production"
        }
      ],
      "answers": [
        {
          "answerText": "To produce ATP through cellular respiration",
          "isCorrect": true,
          "explanation": "ATP is the energy currency of the cell"
        },
        {
          "answerText": "To synthesize proteins",
          "isCorrect": false,
          "explanation": "Protein synthesis occurs in ribosomes"
        },
        {
          "answerText": "To store genetic information",
          "isCorrect": false,
          "explanation": "DNA is stored in the nucleus"
        },
        {
          "answerText": "To provide structural support",
          "isCorrect": false
        }
      ]
    }
  ]
}
```

### Field Descriptions

#### Metadata Object (Optional)
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `courseId` | number | No | ID of the associated course |
| `examId` | number | No | ID of the associated exam |
| `sourceId` | number | No | ID of the question source |
| `universityId` | number | No | ID of the university |
| `yearLevel` | string | No | Year level (FIRST_YEAR, SECOND_YEAR, etc.) |
| `examYear` | number | No | Year of the exam (2000-2100) |

#### Questions Array
| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| `questionText` | string | Yes | Min 5 characters | The question text |
| `explanation` | string | No | Max 5000 characters | Explanation of the correct answer |
| `questionType` | string | No | SINGLE_CHOICE, MULTIPLE_CHOICE, QROC | Type of question |
| `questionImages` | array | No | Max 10 images | Images associated with the question |
| `explanationImages` | array | No | Max 10 images | Images for the explanation |
| `answers` | array | Yes | Min 0 for QROC | Array of answer objects |

#### Answer Object
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `answerText` | string | Yes | Text of the answer |
| `isCorrect` | boolean | Yes | Whether this is a correct answer |
| `explanation` | string | No | Explanation for this specific answer |
| `images` | array | No | Images for this answer |

### Question Type Validation Rules

| Question Type | Correct Answers Required |
|---------------|-------------------------|
| `SINGLE_CHOICE` | Exactly 1 |
| `MULTIPLE_CHOICE` | At least 2 |
| `QROC` | 0 (open-ended) |

### Example Response

```json
{
  "success": true,
  "data": {
    "created": 10,
    "failed": 0,
    "questionIds": [101, 102, 103, 104, 105, 106, 107, 108, 109, 110],
    "errors": []
  },
  "message": "Created 10 questions, 0 failed"
}
```

### Field Descriptions

| Field | Type | Description |
|-------|------|-------------|
| `created` | number | Count of successfully created questions |
| `failed` | number | Count of failed questions |
| `questionIds` | array | Array of created question IDs in the same order as the request `questions` array. Contains `null` for failed entries to maintain index alignment |
| `errors` | array | Array of errors for failed questions |

### Partial Failure Example

When some questions fail to create, the `questionIds` array uses `null` to maintain index correspondence:

```json
{
  "success": true,
  "data": {
    "created": 8,
    "failed": 2,
    "questionIds": [101, 102, null, 104, null, 106, 107, 108, 109, 110],
    "errors": [
      { "index": 2, "error": "Single choice questions must have exactly one correct answer" },
      { "index": 4, "error": "Multiple choice questions must have at least two correct answers" }
    ]
  },
  "message": "Created 8 questions, 2 failed"
}
```

#### Error Object
| Field | Type | Description |
|-------|------|-------------|
| `index` | number | Index of the question that failed (0-based) |
| `error` | string | Error message describing why the question failed |

### Error Responses (400)

**Validation Error:**
```json
{
  "success": false,
  "message": "Request validation failed",
  "errors": [
    {
      "field": "questions[0].answers",
      "message": "Single choice questions must have exactly 1 correct answer"
    }
  ]
}
```

**401 Unauthorized:**
```json
{
  "success": false,
  "message": "Authentication required"
}
```

**403 Forbidden:**
```json
{
  "success": false,
  "message": "Admin or Employee access required"
}
```

---

## QROC Question Creation Endpoint

Create a QROC (Question with Open Response) question. QROC questions are open-ended questions where students provide a text answer instead of selecting from multiple choices.

**Endpoint:** `POST /api/v1/admin/questions`

**Authentication:** Required (Admin or Employee role)

### Request Headers
| Header | Value |
|--------|-------|
| Content-Type | application/json |
| Authorization | Bearer {token} |

### Request Body

```json
{
  "questionText": "Describe the process of cellular respiration.",
  "explanation": "Cellular respiration is a series of metabolic reactions...",
  "questionType": "QROC",
  "courseId": 1,
  "examId": 1,
  "sourceId": 1,
  "universityId": 1,
  "yearLevel": "FIRST_YEAR",
  "examYear": 2024,
  "questionImages": [
    {
      "imagePath": "/uploads/questions/cell-diagram.jpg",
      "altText": "Cell diagram showing mitochondria"
    }
  ],
  "explanationImages": [
    {
      "imagePath": "/uploads/explanations/respiration-flowchart.jpg",
      "altText": "Flowchart of cellular respiration steps"
    }
  ],
  "answers": []
}
```

### Field Descriptions

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| `questionText` | string | Yes | Min 5 characters | The question text |
| `explanation` | string | No | Max 5000 characters | Explanation of the expected answer |
| `questionType` | string | Yes | Must be "QROC" | Type of question (case-sensitive) |
| `courseId` | number | No | Positive integer | ID of the associated course |
| `examId` | number | No | Positive integer | ID of the associated exam |
| `sourceId` | number | No | Positive integer | ID of the question source |
| `universityId` | number | No | Positive integer | ID of the university |
| `yearLevel` | string | No | FIRST_YEAR, SECOND_YEAR, etc. | Year level |
| `examYear` | number | No | 2000-2100 | Year of the exam |
| `questionImages` | array | No | Max 10 images | Images associated with the question stem |
| `explanationImages` | array | No | Max 10 images | Images for the explanation |
| `answers` | array | Yes | Empty array required | QROC questions must have no answer choices |

### QROC Validation Rules

| Rule | Description |
|------|-------------|
| `questionType` | Must be "QROC" (case-sensitive) |
| `answers` | Must be an empty array `[]` |
| `questionText` | Minimum 5 characters required |

### Example Response

```json
{
  "success": true,
  "data": {
    "id": 201,
    "questionText": "Describe the process of cellular respiration.",
    "questionType": "QROC",
    "courseId": 1,
    "explanation": "Cellular respiration is a series of metabolic reactions...",
    "answers": [],
    "questionImages": [
      {
        "id": 101,
        "imagePath": "/uploads/questions/cell-diagram.jpg",
        "altText": "Cell diagram showing mitochondria"
      }
    ],
    "explanationImages": [
      {
        "id": 201,
        "imagePath": "/uploads/explanations/respiration-flowchart.jpg",
        "altText": "Flowchart of cellular respiration steps"
      }
    ],
    "createdAt": "2024-01-15T10:30:00Z"
  },
  "message": "Question created successfully"
}
```

### Response Field Descriptions

| Field | Type | Description |
|-------|------|-------------|
| `id` | number | ID of the created question |
| `questionText` | string | The question text |
| `questionType` | string | Type of question (QROC) |
| `courseId` | number | ID of the associated course (if provided) |
| `explanation` | string | Explanation of the expected answer (if provided) |
| `answers` | array | Empty array for QROC questions |
| `questionImages` | array | Array of question image objects |
| `explanationImages` | array | Array of explanation image objects |
| `createdAt` | string | ISO 8601 timestamp of creation |

### Error Responses

**400 Bad Request (Invalid question type):**
```json
{
  "success": false,
  "message": "Request validation failed",
  "errors": [
    {
      "field": "questionType",
      "message": "Invalid enum value. Expected 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'QROC'"
    }
  ]
}
```

**400 Bad Request (Non-empty answers):**
```json
{
  "success": false,
  "message": "Request validation failed",
  "errors": [
    {
      "field": "answers",
      "message": "At least 2 answers are required"
    }
  ]
}
```

**401 Unauthorized:**
```json
{
  "success": false,
  "message": "Authentication required"
}
```

**403 Forbidden:**
```json
{
  "success": false,
  "message": "Admin or Employee access required"
}
```

---

## Question Images Upload Endpoint

Upload images for questions. This endpoint is used to replace all images for a specific question.

**Endpoint:** `PUT /api/v1/admin/image/:questionId/question-images`

**Authentication:** Required (Admin or Employee role)

### Request Headers
| Header | Value |
|--------|-------|
| Content-Type | multipart/form-data |
| Authorization | Bearer {token} |

### Request Body (form-data)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `questionImages` | File[] | Yes | Image files (max 10) |

### File Requirements

| Requirement | Value |
|-------------|-------|
| Max files | 10 |
| Allowed types | JPEG, PNG, GIF, BMP, TIFF, WebP, SVG |
| Max file size | 15MB per file |

### Example Request (cURL)
```bash
curl -X PUT "https://api.example.com/api/v1/admin/image/123/question-images" \
  -H "Authorization: Bearer {token}" \
  -F "questionImages=@image1.jpg" \
  -F "questionImages=@image2.png"
```

### Example Response

```json
{
  "success": true,
  "message": "Question images replaced successfully",
  "data": {
    "questionId": 123,
    "imageCount": 2,
    "images": [
      {
        "id": 101,
        "imagePath": "/uploads/images/img1.jpg",
        "altText": null
      },
      {
        "id": 102,
        "imagePath": "/uploads/images/img2.png",
        "altText": null
      }
    ]
  }
}
```

### Error Responses

**400 Bad Request:**
```json
{
  "success": false,
  "message": "No image files uploaded"
}
```

**400 Bad Request (Validation):**
```json
{
  "success": false,
  "message": "File {filename} exceeds maximum size of 15MB"
}
```

**401 Unauthorized:**
```json
{
  "success": false,
  "message": "Authentication required"
}
```

---

## Question Explanation Images Upload Endpoint

Upload explanation images for questions. This endpoint is used to replace all explanation images for a specific question.

**Endpoint:** `PUT /api/v1/admin/image/:questionId/explanation-images`

**Authentication:** Required (Admin or Employee role)

### Request Headers
| Header | Value |
|--------|-------|
| Content-Type | multipart/form-data |
| Authorization | Bearer {token} |

### Request Body (form-data)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `explanationImages` | File[] | Yes | Explanation image files (max 10) |

### File Requirements

| Requirement | Value |
|-------------|-------|
| Max files | 10 |
| Allowed types | JPEG, PNG, GIF, BMP, TIFF, WebP, SVG |
| Max file size | 15MB per file |

### Example Request (cURL)
```bash
curl -X PUT "https://api.example.com/api/v1/admin/image/123/explanation-images" \
  -H "Authorization: Bearer {token}" \
  -F "explanationImages=@explanation1.jpg" \
  -F "explanationImages=@explanation2.png"
```

### Example Response

```json
{
  "success": true,
  "message": "Explanation images replaced successfully",
  "data": {
    "questionId": 123,
    "explanationImageCount": 2,
    "explanationImages": [
      {
        "id": 201,
        "imagePath": "/uploads/explanations/exp1.jpg",
        "altText": null
      },
      {
        "id": 202,
        "imagePath": "/uploads/explanations/exp2.png",
        "altText": null
      }
    ]
  }
}
```

### Error Responses

**400 Bad Request:**
```json
{
  "success": false,
  "message": "No explanation files uploaded"
}
```

**400 Bad Request (Validation):**
```json
{
  "success": false,
  "message": "File {filename} has invalid format. Only image files are allowed."
}
```

**401 Unauthorized:**
```json
{
  "success": false,
  "message": "Authentication required"
}
```

---

## Unit Creation Endpoint

Create a new unit (Unite) within a study pack.

**Endpoint:** `POST /api/v1/admin/content/unites`

**Authentication:** Required (Admin role only)

### Request Headers
| Header | Value |
|--------|-------|
| Content-Type | application/json |
| Authorization | Bearer {token} |

### Request Body

```json
{
  "studyPackId": 1,
  "name": "Cell Biology",
  "description": "Study of cell structure and function",
  "logoUrl": "https://example.com/logos/cell-biology.png"
}
```

### Field Descriptions

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| `studyPackId` | number | Yes | Positive integer | ID of the parent study pack |
| `name` | string | Yes | Min 2 characters | Name of the unit |
| `description` | string | No | Max 5000 characters | Description of the unit |
| `logoUrl` | string | No | Valid URL | URL of the unit logo |

### Example Response

```json
{
  "success": true,
  "message": "Unit created successfully",
  "data": {
    "id": 5,
    "name": "Cell Biology",
    "description": "Study of cell structure and function",
    "logoUrl": "https://example.com/logos/cell-biology.png",
    "studyPackId": 1,
    "createdAt": "2024-01-15T10:30:00Z"
  }
}
```

### Error Responses

**400 Bad Request:**
```json
{
  "success": false,
  "message": "Request validation failed: studyPackId: Required, name: Min 2 characters"
}
```

**404 Not Found:**
```json
{
  "success": false,
 message": "Study pack not found"
}
```

---

## Module Creation Endpoint

Create a new module within a unit.

**Endpoint:** `POST /api/v1/admin/content/modules`

**Authentication:** Required (Admin role only)

### Request Headers
| Header | Value |
|--------|-------|
| Content-Type | application/json |
| Authorization | Bearer {token} |

### Request Body

```json
{
  "uniteId": 1,
  "name": "Cell Structure",
  "description": "Study of cell components and their functions"
}
```

### Field Descriptions

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| `uniteId` | number | Yes | Positive integer | ID of the parent unit |
| `name` | string | Yes | Min 2 characters | Name of the module |
| `description` | string | No | Max 5000 characters | Description of the module |

### Example Response

```json
{
  "success": true,
  "message": "Module created successfully",
  "data": {
    "id": 10,
    "name": "Cell Structure",
    "description": "Study of cell components and their functions",
    "uniteId": 1,
    "createdAt": "2024-01-15T10:35:00Z"
  }
}
```

### Error Responses

**400 Bad Request:**
```json
{
  "success": false,
  "message": "Request validation failed: uniteId: Required, name: Min 2 characters"
}
```

**404 Not Found:**
```json
{
  "success": false,
  "message": "Unit not found"
}
```

---

## Course Creation Endpoint

Create a new course within a module.

**Endpoint:** `POST /api/v1/admin/content/courses`

**Authentication:** Required (Admin or Employee role)

### Request Headers
| Header | Value |
|--------|-------|
| Content-Type | application/json |
| Authorization | Bearer {token} |

### Request Body

```json
{
  "moduleId": 10,
  "name": "The Cell Membrane",
  "description": "Comprehensive study of cell membrane structure and function"
}
```

### Field Descriptions

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| `moduleId` | number | Yes | Positive integer | ID of the parent module |
| `name` | string | Yes | 3-150 characters | Name of the course |
| `description` | string | No | Max 2000 characters | Description of the course |

### Example Response

```json
{
  "success": true,
  "message": "Course created successfully",
  "data": {
    "id": 50,
    "name": "The Cell Membrane",
    "description": "Comprehensive study of cell membrane structure and function",
    "moduleId": 10,
    "createdAt": "2024-01-15T10:40:00Z"
  }
}
```

### Error Responses

**400 Bad Request:**
```json
{
  "success": false,
  "message": "Request validation failed: moduleId: Required, name: Min 3 characters"
}
```

**404 Not Found:**
```json
{
  "success": false,
  "message": "Module not found"
}
```

---

## Enums Reference

### YearLevel
| Value | Description |
|-------|-------------|
| `FIRST_YEAR` | First year of study |
| `SECOND_YEAR` | Second year of study |
| `THIRD_YEAR` | Third year of study |
| `FOURTH_YEAR` | Fourth year of study |
| `FIFTH_YEAR` | Fifth year of study |
| `RESIDENCY` | Medical residency |
| `SPECIALTY` | Specialty program |

### QuestionType
| Value | Description |
|-------|-------------|
| `SINGLE_CHOICE` | Single correct answer multiple choice |
| `MULTIPLE_CHOICE` | Multiple correct answers |
| `QROC` | Open-ended question (Question Removed from Correct) |

### ResourceType
| Value | Description |
|-------|-------------|
| `PDF` | PDF document |
| `VIDEO` | Video resource |
| `LINK` | External link |
| `BOOK` | Book reference |
| `IMAGE` | Image resource |
| `AUDIO` | Audio resource |

---

## Error Codes Reference

| Code | Description |
|------|-------------|
| `400` | Bad Request - Validation failed |
| `401` | Unauthorized - Authentication required |
| `403` | Forbidden - Insufficient permissions |
| `404` | Not Found - Resource does not exist |
| `500` | Internal Server Error |

---

## Testing Examples

### cURL Examples

**Create Unit:**
```bash
curl -X POST "https://api.example.com/api/v1/admin/content/unites" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {token}" \
  -d '{
    "studyPackId": 1,
    "name": "Cell Biology",
    "description": "Study of cell structure"
  }'
```

**Create Module:**
```bash
curl -X POST "https://api.example.com/api/v1/admin/content/modules" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {token}" \
  -d '{
    "uniteId": 1,
    "name": "Cell Structure"
  }'
```

**Create Course:**
```bash
curl -X POST "https://api.example.com/api/v1/admin/content/courses" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {token}" \
  -d '{
    "moduleId": 10,
    "name": "The Cell Membrane"
  }'
```

**Bulk Create Questions:**
```bash
curl -X POST "https://api.example.com/api/v1/admin/questions/bulk" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {token}" \
  -d '{
    "metadata": {
      "courseId": 50,
      "yearLevel": "FIRST_YEAR"
    },
    "questions": [
      {
        "questionText": "What is the main component of cell membranes?",
        "questionType": "SINGLE_CHOICE",
        "answers": [
          {"answerText": "Phospholipid bilayer", "isCorrect": true},
          {"answerText": "Protein monolayer", "isCorrect": false},
          {"answerText": "Carbohydrate chain", "isCorrect": false},
          {"answerText": "Nucleic acid", "isCorrect": false}
        ]
      }
    ]
  }'
```

**Upload Question Images:**
```bash
curl -X PUT "https://api.example.com/api/v1/admin/image/123/question-images" \
  -H "Authorization: Bearer {token}" \
  -F "questionImages=@diagram1.jpg" \
  -F "questionImages=@diagram2.png"
```

**Upload Question Explanation Images:**
```bash
curl -X PUT "https://api.example.com/api/v1/admin/image/123/explanation-images" \
  -H "Authorization: Bearer {token}" \
  -F "explanationImages=@explanation1.jpg" \
  -F "explanationImages=@explanation2.png"
```
