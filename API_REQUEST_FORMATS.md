# API Request Format Documentation

This document provides the request format specifications for the key API endpoints in the backend application.

API_URL=https://med-adn.com/api/v1/


## Table of Contents
1. [Login Endpoint](#login-endpoint)
2. [Questions Bulk Endpoint](#questions-bulk-endpoint)
3. [Question Images Upload Endpoint](#question-images-upload-endpoint)
4. [Question Explanation Images Upload Endpoint](#question-explanation-images-upload-endpoint)
5. [Unit Creation Endpoint](#unit-creation-endpoint)
6. [Module Creation Endpoint](#module-creation-endpoint)
7. [Course Creation Endpoint](#course-creation-endpoint)
8. [Unit and Module Image Upload Endpoint](#unit-and-module-image-upload-endpoint)
9. [Residency Questions Endpoint](#residency-questions-endpoint)

---

## Login Endpoint

Authenticate a user and receive access and refresh tokens.

**Endpoint:** `POST /api/v1/auth/login`

**Authentication:** None (Public endpoint)

### Request Headers
| Header | Value |
|--------|-------|
| Content-Type | application/json |

### Request Body

```json
{
  "email": "user@example.com",
  "password": "userpassword123",
  "deviceFingerprint": "optional-device-fingerprint"
}
```

### Field Descriptions

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| `email` | string | Yes | Valid email format | User's email address |
| `password` | string | Yes | Min 1 character | User's password |
| `deviceFingerprint` | string | No | Max 255 characters | Optional device identifier for security tracking |

### Example Response

```json
{
  "success": true,
  "data": {
    "tokens": {
      "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    }
  }
}
```

### Field Descriptions

| Field | Type | Description |
|-------|------|-------------|
| `accessToken` | string | JWT token for authenticating subsequent API requests (expires in 1 hour) |
| `refreshToken` | string | JWT token for obtaining new access tokens when expired |

### JWT Token Payload Structure

The access token contains the following claims:

```json
{
  "user_data": {
    "id": 1,
    "email": "user@example.com",
    "fullName": "John Doe",
    "role": "STUDENT",
    "universityId": 1,
    "specialtyId": 1,
    "currentYear": "ONE",
    "emailVerified": true,
    "isActive": true
  },
  "subscriptions": [
    {
      "id": 1,
      "study_pack_id": 1,
      "pack_name": "Med Year 1",
      "pack_type": "YEARLY",
      "year_number": "ONE",
      "end_date": "2025-12-31T23:59:59Z",
      "days_remaining": 180,
      "accessible_year_levels": ["ONE", "TWO"]
    }
  ],
  "payment_status": "active",
  "has_active_subscription": true,
  "accessible_study_packs": [1, 2]
}
```

### Error Responses

**400 Bad Request (Validation):**
```json
{
  "success": false,
  "message": "Request validation failed",
  "errors": [
    {
      "field": "email",
      "message": "A valid email is required"
    }
  ]
}
```

**401 Unauthorized:**
```json
{
  "success": false,
  "message": "Invalid email or password"
}
```

**403 Forbidden:**
```json
{
  "success": false,
  "message": "Account is deactivated. Please contact support."
}
```

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

Create a new module within a Unit.

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
| `uniteId` | number | No | Positive integer | ID of the parent unit (optional) |
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
  "message": "Request validation failed: name: Min 2 characters"
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

## Unit and Module Image Upload Endpoint

Upload images for units (logos) and modules (content images).

### Unit Logo Upload

Upload the logo image for a unit. The returned URL should be used in the Unit Creation/Update request.

**Endpoint:** `POST /api/v1/admin/upload/logo`

**Authentication:** Required (Admin or Employee role)

#### Request Headers
| Header | Value |
|--------|-------|
| Content-Type | multipart/form-data |
| Authorization | Bearer {token} |

#### Request Body (form-data)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `logo` | File | Yes | Logo image file (max 5MB) |

#### File Requirements

| Requirement | Value |
|-------------|-------|
| Max file size | 5MB |
| Allowed types | JPEG, PNG, GIF, WebP, SVG |

#### Example Response

```json
{
  "uploadedFiles": [
    {
      "filename": "logos_1707768291234.png",
      "path": "/uploads/logos/logos_1707768291234.png",
      "size": 10240,
      "url": "/api/media/logos/logos_1707768291234.png"
    }
  ]
}
```

### General Image Upload (Modules)

Upload generic images to be used in module descriptions or other content areas where an image URL is needed.

**Endpoint:** `POST /api/v1/admin/upload/image`

**Authentication:** Required (Admin or Employee role)

#### Request Headers
| Header | Value |
|--------|-------|
| Content-Type | multipart/form-data |
| Authorization | Bearer {token} |

#### Request Body (form-data)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `images` | File[] | Yes | Array of image files (max 10) |

#### File Requirements

| Requirement | Value |
|-------------|-------|
| Max files | 10 |
| Max file size | 10MB per file |
| Allowed types | JPEG, PNG, GIF, BMP, TIFF, WebP, SVG |

#### Example Response

```json
{
  "uploadedFiles": [
    {
      "filename": "images_1707768291234.jpg",
      "path": "/uploads/images/images_1707768291234.jpg",
      "size": 54321,
      "url": "/api/media/images/images_1707768291234.jpg"
    }
  ]
}
```

### Error Responses

**400 Bad Request:**
```json
{
  "success": false,
  "message": "No logo file uploaded"
}
```

**400 Bad Request (Validation):**
```json
{
  "success": false,
  "message": "File exceeds maximum size of 5MB"
}
```



---

## Unit and Module Update Endpoints (Images)

**Important:** Updating the image (logo) of a unit is a **two-step process**:
1. **Upload** the image file using the **POST** endpoint (multipart/form-data).
2. **Update** the Unit record with the returned image URL using the **PUT** endpoint (application/json).

There is **no direct PUT endpoint** for uploading unit/module images as files. You must use the upload endpoint first.

### Step 1: Upload Image (Form-Data)
Use the [Unit Logo Upload Endpoint](#unit-logo-upload) (`POST /api/v1/admin/upload/logo`) defined above.

### Step 2: Link Image to Unit (JSON)

After uploading, you will receive a URL (e.g., `/api/media/logos/logo_123.png`). Use this URL to update the Unit.

**Endpoint:** `PUT /api/v1/admin/content/unites/:unitId`

**Authentication:** Required (Admin only)

#### Request Headers
| Header | Value |
|--------|-------|
| Content-Type | application/json |
| Authorization | Bearer {token} |

#### Request Body
```json
{
  "name": "Cell Biology",
  "logoUrl": "/api/media/logos/logos_1707768291234.png"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | No | Name of the unit (optional if only updating logo) |
| `logoUrl` | string | No | URL of the logo image (obtained from Step 1) |

#### Example Response
```json
{
  "id": 5,
  "name": "Cell Biology",
  "logoUrl": "/api/media/logos/logos_1707768291234.png",
  "createdAt": "2024-01-15T10:30:00.000Z",
  "updatedAt": "2024-02-13T16:20:00.000Z"
}
```

### Module Update

Update module details. While modules do not have a dedicated logo field in the database, you can update the description which may contain image URLs.

**Endpoint:** `PUT /api/v1/admin/content/modules/:moduleId`

**Authentication:** Required (Admin only)

#### Request Headers
| Header | Value |
|--------|-------|
| Content-Type | application/json |
| Authorization | Bearer {token} |

#### Request Body
```json
{
  "name": "New Module Name",
  "description": "Updated description with ![Image](/api/media/images/img.jpg)"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | No | Name of the module |
| `description` | string | No | Description of the module |

#### Example Response
```json
{
  "id": 10,
  "name": "New Module Name",
  "uniteId": 1,
  "createdAt": "2024-01-15T10:35:00.000Z",
  "updatedAt": "2024-02-13T16:25:00.000Z"
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

---

## Residency Questions Endpoint

Create a new residency question with support for tags and repetition tracking.

**Endpoint:** `POST /api/v1/admin/residency-questions`

**Authentication:** Required (Admin or Employee role)

### Request Headers

| Header | Value |
|--------|-------|
| Content-Type | application/json |
| Authorization | Bearer {token} |

### Request Body

```json
{
  "questionText": "What is the primary treatment for...?",
  "part": "PART_1",
  "explanation": "The primary treatment is...",
  "examYear": 2024,
  "universityId": 1,
  "tags": ["cardiology", "treatment", "urgent"],
  "repetitionCount": 5,
  "repetitionYears": [2020, 2021, 2022],
  "questionAnswers": [
    {
      "answerText": "Option A",
      "isCorrect": true
    },
    {
      "answerText": "Option B",
      "isCorrect": false
    }
  ]
}
```

### Field Descriptions

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| `questionText` | string | Yes | Min 1 character | The question text |
| `part` | string | Yes | "PART_1" or "PART_2" | Part of the residency exam |
| `explanation` | string | No | - | Explanation of the correct answer |
| `examYear` | number | No | Positive integer | Year of the exam |
| `universityId` | number | No | Positive integer | ID of the university |
| `tags` | string[] | No | Array of strings | Tags for categorization |
| `repetitionCount` | number | No | Min 0 | Number of times question appeared |
| `repetitionYears` | number[] | No | Array of integers | Years question appeared |
| `questionAnswers` | array | Yes | Min 1 answer | Array of answer objects |

#### Answer Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `answerText` | string | Yes | Text of the answer |
| `isCorrect` | boolean | Yes | Whether this is a correct answer |

### Example Response

```json
{
  "id": 47,
  "questionText": "What is the primary treatment for...?",
  "part": "PART_1",
  "explanation": "The primary treatment is...",
  "examYear": 2024,
  "universityId": 1,
  "tags": ["cardiology", "treatment", "urgent"],
  "repetitionCount": 5,
  "repetitionYears": [2020, 2021, 2022],
  "questionAnswers": [
    {
      "id": 101,
      "answerText": "Option A",
      "isCorrect": true
    },
    {
      "id": 102,
      "answerText": "Option B",
      "isCorrect": false
    }
  ],
  "questionImages": [],
  "questionExplanationImages": [],
  "createdAt": "2026-02-12T20:19:06.785Z"
}
```

### Error Responses

**400 Bad Request (Validation):**
```json
{
  "success": false,
  "message": "Request validation failed",
  "errors": [
    {
      "field": "part",
      "message": "Part must be PART_1 or PART_2"
    }
  ]
}
```

**404 Not Found:**
```json
{
  "success": false,
  "message": "University not found"
}
```
