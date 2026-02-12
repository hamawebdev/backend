## Residency Question Creation Endpoint Structure

**Endpoint:** `POST /api/v1/admin/residency-questions`

**Authentication:** Required (Admin or Employee role)

### Request Body Schema

```json
{
  "questionText": "string",
  "part": "PART_1 | PART_2",
  "explanation": "string (optional)",
  "examYear": "number (optional)",
  "universityId": "number (optional)",
  "metadata": "string (optional)",
  "questionAnswers": [
    {
      "answerText": "string",
      "isCorrect": "boolean"
    }
  ]
}
```

### Field Descriptions

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| `questionText` | string | Yes | Min 1 char | The question text |
| `part` | enum | Yes | PART_1 or PART_2 | Exam part |
| `explanation` | string | No | Markdown sanitized | Explanation of the correct answer |
| `examYear` | number | No | Positive integer | Year of the residency exam |
| `universityId` | number | No | Positive integer | ID of the university |
| `metadata` | string | No | - | Additional metadata |
| `questionAnswers` | array | Yes | Min 1 answer, at least 1 must be correct | Array of answer objects |

### Answer Object Schema

```json
{
  "answerText": "string",
  "isCorrect": "boolean"
}
```

### Validation Rules

1. At least one answer is required in `questionAnswers`
2. At least one answer must have `isCorrect: true`
3. `part` must be either `PART_1` or `PART_2`

### Bulk Creation Endpoint

There's also a **`POST /api/v1/admin/residency-questions/bulk`** endpoint for creating multiple residency questions in a single request.