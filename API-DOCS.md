# KURA Notes - API Documentation

**Version:** 0.1.0 (MVP)
**Base URL:** `https://kura.tillmaessen.de`
**Authentication:** Bearer Token

---

## Authentication

All API requests require authentication using a Bearer token in the `Authorization` header.

**Header Format:**
```
Authorization: Bearer YOUR_API_KEY
```

**Get your API key:**
- Set during deployment in `.env` file as `API_KEY`
- For web UI: Set in browser console with `localStorage.setItem('apiKey', 'YOUR_API_KEY')`

---

## Endpoints

### Health Check

**GET** `/api/health`

Check if the API is running and healthy.

**Authentication:** Required

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-11-19T10:30:00.000Z",
  "services": {
    "database": "up",
    "vectorStore": "up",
    "embedding": "available"
  }
}
```

**Example:**
```bash
curl https://kura.tillmaessen.de/api/health \
  -H "Authorization: Bearer YOUR_API_KEY"
```

---

### Capture Content

**POST** `/api/capture`

Capture new content (text, images, PDFs).

**Authentication:** Required

**Request Body (JSON):**
```json
{
  "content": "Your content here",
  "type": "text",
  "title": "Optional title",
  "annotation": "Optional annotation",
  "tags": ["optional", "tags"]
}
```

**Parameters:**
- `content` (required): The content to capture
  - For text: The actual text content
  - For files: Base64-encoded file data
- `type` (required): Content type
  - `text` - Plain text
  - `image` - Image file (jpg, png, webp)
  - `pdf` - PDF document
- `title` (optional): Title for the content
- `annotation` (optional): Additional notes or context
- `tags` (optional): Array of tags for organization

**Response (Success):**
```json
{
  "success": true,
  "id": "3b397411-e0fc-4112-a38a-14706a37f4d8",
  "message": "Content captured successfully",
  "timestamp": "2025-11-19T10:30:00.000Z"
}
```

**Example (Text):**
```bash
curl -X POST https://kura.tillmaessen.de/api/capture \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Meeting notes: Discussed Q4 roadmap",
    "type": "text",
    "title": "Q4 Planning Meeting",
    "tags": ["meeting", "planning"]
  }'
```

---

### Search Content

**GET** `/api/search`

Search through captured content using semantic search.

**Authentication:** Required

**Query Parameters:**
- `q` (required): Search query
- `limit` (optional): Maximum results to return (default: 10, max: 50)

**Response:**
```json
{
  "results": [
    {
      "id": "3b397411-e0fc-4112-a38a-14706a37f4d8",
      "title": "Q4 Planning Meeting",
      "content": "Meeting notes: Discussed Q4 roadmap...",
      "type": "text",
      "tags": ["meeting", "planning"],
      "created_at": "2025-11-19T10:30:00.000Z",
      "score": 0.92
    }
  ],
  "total": 1,
  "query": "Q4 roadmap"
}
```

**Example:**
```bash
curl "https://kura.tillmaessen.de/api/search?q=meeting%20notes&limit=5" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

---

### List Content

**GET** `/api/content`

List all captured content with pagination.

**Authentication:** Required

**Query Parameters:**
- `limit` (optional): Items per page (default: 20, max: 100)
- `offset` (optional): Skip this many items (default: 0)
- `type` (optional): Filter by content type (text, image, pdf)
- `tags` (optional): Filter by tags (comma-separated)

**Response:**
```json
{
  "items": [
    {
      "id": "3b397411-e0fc-4112-a38a-14706a37f4d8",
      "title": "Q4 Planning Meeting",
      "type": "text",
      "tags": ["meeting", "planning"],
      "created_at": "2025-11-19T10:30:00.000Z",
      "updated_at": "2025-11-19T10:30:00.000Z"
    }
  ],
  "total": 42,
  "limit": 20,
  "offset": 0
}
```

**Example:**
```bash
curl "https://kura.tillmaessen.de/api/content?limit=10&type=text" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

---

### Get Content by ID

**GET** `/api/content/:id`

Retrieve a specific content item by ID.

**Authentication:** Required

**Response:**
```json
{
  "id": "3b397411-e0fc-4112-a38a-14706a37f4d8",
  "title": "Q4 Planning Meeting",
  "content": "Meeting notes: Discussed Q4 roadmap...",
  "type": "text",
  "annotation": "Follow-up required",
  "tags": ["meeting", "planning"],
  "file_path": "/data/content/3b397411-e0fc-4112-a38a-14706a37f4d8.txt",
  "created_at": "2025-11-19T10:30:00.000Z",
  "updated_at": "2025-11-19T10:30:00.000Z"
}
```

**Example:**
```bash
curl https://kura.tillmaessen.de/api/content/3b397411-e0fc-4112-a38a-14706a37f4d8 \
  -H "Authorization: Bearer YOUR_API_KEY"
```

---

### Delete Content

**DELETE** `/api/content/:id`

Delete a specific content item.

**Authentication:** Required

**Response:**
```json
{
  "success": true,
  "message": "Content deleted successfully",
  "id": "3b397411-e0fc-4112-a38a-14706a37f4d8"
}
```

**Example:**
```bash
curl -X DELETE https://kura.tillmaessen.de/api/content/3b397411-e0fc-4112-a38a-14706a37f4d8 \
  -H "Authorization: Bearer YOUR_API_KEY"
```

---

## Error Responses

All errors follow this format:

```json
{
  "error": "ApiError",
  "code": "ERROR_CODE",
  "message": "Human-readable error message",
  "timestamp": "2025-11-19T10:30:00.000Z",
  "path": "/api/endpoint"
}
```

### Common Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `MISSING_API_KEY` | 401 | Authorization header missing |
| `INVALID_API_KEY` | 401 | API key is incorrect |
| `INVALID_REQUEST` | 400 | Request body validation failed |
| `NOT_FOUND` | 404 | Resource not found |
| `INTERNAL_ERROR` | 500 | Server error occurred |
| `FILE_TOO_LARGE` | 413 | Uploaded file exceeds size limit |
| `UNSUPPORTED_TYPE` | 400 | Content type not supported |

**Example Error:**
```json
{
  "error": "ApiError",
  "code": "MISSING_API_KEY",
  "message": "API key is required",
  "timestamp": "2025-11-19T10:30:00.000Z",
  "path": "/api/capture"
}
```

---

## Rate Limits

**Current:** No rate limiting (MVP)
**Planned (Phase 2):** 100 requests per minute per API key

---

## Content Types & File Formats

### Supported Content Types

**Text:**
- Plain text (UTF-8)
- Maximum size: 50 MB

**Images:**
- JPEG (.jpg, .jpeg)
- PNG (.png)
- WebP (.webp)
- Maximum size: 50 MB

**Documents:**
- PDF (.pdf)
- Maximum size: 50 MB

---

## iOS Shortcut Integration

### Quick Setup

1. **Create Shortcut:**
   - Add "Get Contents of URL" action
   - Set Method: POST
   - Set URL: `https://kura.tillmaessen.de/api/capture`

2. **Add Headers:**
   - Key: `Authorization`
   - Value: `Bearer YOUR_API_KEY`

3. **Add Body (JSON):**
   ```json
   {
     "content": "[Shortcut Input]",
     "type": "text"
   }
   ```

4. **Enable in Share Sheet:**
   - Make shortcut available from Share menu
   - Share text, images, or files directly to KURA

**Note:** Currently, iOS shortcuts create notes with title "Untitled". This is expected MVP behavior.

---

## Web Interface

**URL:** `https://kura.tillmaessen.de`

**Setup:**
1. Open URL in browser
2. Open browser console (F12 or Cmd+Option+I)
3. Set API key:
   ```javascript
   localStorage.setItem('apiKey', 'YOUR_API_KEY')
   ```
4. Refresh page

**Features:**
- Browse all captured content
- Search semantically
- Create new notes
- Delete content
- View content details

**Note:** Web UI is currently publicly accessible. Add basic authentication in Phase 2 for security.

---

## Tips & Best Practices

### Tagging Strategy
- Use lowercase tags for consistency
- Be specific: `meeting-notes` vs `meeting`
- Reuse tags for better organization
- Common tag patterns:
  - Content type: `article`, `note`, `reference`
  - Project: `project-alpha`, `work`
  - Priority: `important`, `review-later`

### Search Tips
- Use natural language queries
- Be specific for better results
- Semantic search finds meaning, not just keywords
- Examples:
  - ❌ "docker error" (too vague)
  - ✅ "container won't start port conflict"

### Content Organization
- Add titles to everything (even iOS captures)
- Use annotations for context
- Tag consistently
- Regular cleanup of outdated content

---

## Future Enhancements (Phase 2)

- [ ] PATCH endpoint to edit content
- [ ] Batch operations
- [ ] Advanced filtering (date ranges, multiple tags)
- [ ] Export functionality
- [ ] Thumbnail generation for images
- [ ] PDF text extraction
- [ ] Audio transcription support
- [ ] Related content suggestions

---

## Support

**Issues:** https://github.com/TillMatthis/kura-notes/issues
**Documentation:** See repository docs/ folder
**Logs:** `docker-compose logs -f api`

---

**Last Updated:** 2025-11-19
**API Version:** 0.1.0 (MVP)
