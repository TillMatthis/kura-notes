# Search Endpoint Testing Guide

## Task 2.4: Vector Search Endpoint

This document describes the vector search endpoint implementation and how to test it.

## Endpoint Details

**URL:** `GET /api/search`

**Query Parameters:**
- `query` (required): Natural language search query string
- `limit` (optional): Maximum number of results (default: 10, max: 50)

**Authentication:** Requires `Authorization: Bearer <API_KEY>` header

## Response Format

```json
{
  "results": [
    {
      "id": "string",
      "title": "string | null",
      "excerpt": "string",
      "contentType": "text" | "image" | "pdf" | "audio",
      "relevanceScore": 0.0-1.0,
      "metadata": {
        "tags": ["string"],
        "createdAt": "ISO 8601 datetime",
        "updatedAt": "ISO 8601 datetime",
        "source": "string | null",
        "annotation": "string | null"
      }
    }
  ],
  "totalResults": 0,
  "query": "string",
  "timestamp": "ISO 8601 datetime"
}
```

## Implementation Details

### How It Works

1. **Query Validation**: Validates query parameter (non-empty string) and limit (1-50)
2. **Embedding Generation**: Generates embedding vector for the search query using OpenAI
3. **Vector Search**: Queries ChromaDB using cosine similarity to find relevant documents
4. **Metadata Enrichment**: Fetches full metadata from SQLite for each result
5. **Excerpt Generation**: Creates excerpt (first 200 chars or annotation)
6. **Result Sorting**: Results are already sorted by relevance score from ChromaDB

### Edge Cases Handled

- **Empty Query**: Returns validation error (400)
- **Invalid Limit**: Returns validation error (400)
- **No Results**: Returns empty results array with totalResults: 0
- **ChromaDB Errors**: Returns service unavailable error (503)
- **Embedding Service Unavailable**: Returns service unavailable error (503)
- **Database Errors**: Returns database error (500)
- **Content Not Found**: Skips results that exist in ChromaDB but not in SQLite (edge case: deleted after indexing)

### Excerpt Generation Logic

1. For images/PDFs: Prefer annotation over extracted text
2. Try annotation first (truncate to 200 chars if needed)
3. Fall back to extracted text (truncate to 200 chars if needed)
4. Default: `[{contentType} content - no excerpt available]`

## Manual Testing

### Prerequisites

1. Start the services:
   ```bash
   docker compose up -d
   ```

2. Ensure you have some content indexed:
   ```bash
   # Create test content
   curl -X POST http://localhost:3000/api/capture \
     -H "Authorization: Bearer your-api-key" \
     -H "Content-Type: application/json" \
     -d '{
       "content": "This is a test note about machine learning and artificial intelligence",
       "title": "ML Test Note",
       "tags": ["ml", "ai", "test"]
     }'
   ```

3. Wait a few seconds for embedding generation to complete

### Test Cases

#### 1. Basic Search
```bash
curl -X GET "http://localhost:3000/api/search?query=machine%20learning" \
  -H "Authorization: Bearer your-api-key"
```

**Expected:** Returns relevant results sorted by relevance score

#### 2. Search with Limit
```bash
curl -X GET "http://localhost:3000/api/search?query=artificial%20intelligence&limit=5" \
  -H "Authorization: Bearer your-api-key"
```

**Expected:** Returns max 5 results

#### 3. Empty Query (Error Case)
```bash
curl -X GET "http://localhost:3000/api/search?query=" \
  -H "Authorization: Bearer your-api-key"
```

**Expected:** 400 error - "Search query cannot be empty"

#### 4. Invalid Limit (Error Case)
```bash
curl -X GET "http://localhost:3000/api/search?query=test&limit=100" \
  -H "Authorization: Bearer your-api-key"
```

**Expected:** 400 error - "Limit must be a number between 1 and 50"

#### 5. No Results
```bash
curl -X GET "http://localhost:3000/api/search?query=xyzabc123nonexistent" \
  -H "Authorization: Bearer your-api-key"
```

**Expected:** Empty results array with totalResults: 0

#### 6. Semantic Search
```bash
# Create content about "python programming"
curl -X POST http://localhost:3000/api/capture \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"content": "Python is a popular programming language", "title": "Python"}'

# Wait for embedding generation (a few seconds)
sleep 5

# Search for semantically similar term
curl -X GET "http://localhost:3000/api/search?query=coding%20in%20python" \
  -H "Authorization: Bearer your-api-key"
```

**Expected:** Returns the Python note even though exact words don't match

## Automated Testing (Future)

Create integration tests in `tests/integration/search.test.ts`:

```typescript
describe('Search Endpoint', () => {
  it('should search with natural language query', async () => {
    // Test implementation
  });

  it('should handle empty queries', async () => {
    // Test implementation
  });

  it('should respect limit parameter', async () => {
    // Test implementation
  });

  it('should return results sorted by relevance', async () => {
    // Test implementation
  });
});
```

## Performance Expectations

- Search should respond in < 500ms with 500 documents
- ChromaDB query time: ~50-100ms
- Database metadata lookup: ~10-20ms per result
- Embedding generation: ~200-300ms (OpenAI API)

## Logging

The endpoint logs:
- Search requests with query and limit
- Embedding generation
- Vector search results count
- Errors with full context

Check logs:
```bash
docker compose logs -f api
```

## Known Limitations

1. No pagination support (stretch goal for future)
2. No filtering by content type, tags, or date (Task 2.6)
3. No full-text search fallback (Task 2.5)
4. Embedding generation for every search (could cache common queries)

## Next Steps

- Task 2.5: Add full-text search fallback
- Task 2.6: Add search filters (contentType, tags, dates)
- Task 2.7: Create search UI
- Task 2.8: Performance testing with large dataset
