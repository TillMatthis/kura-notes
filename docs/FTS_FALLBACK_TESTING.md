# Full-Text Search (FTS) Fallback - Testing Guide

## Overview

Task 2.5 implements full-text search as a fallback to vector search, ensuring search always works even if ChromaDB or the embedding service has issues.

## Implementation Summary

### 1. SearchService (`src/services/searchService.ts`)

**Features:**
- **FTS Query Function**: `performFTSSearch()` queries the `content_fts` table
- **Vector Search**: `performVectorSearch()` queries ChromaDB with embeddings
- **Unified Search**: `search()` combines both methods with automatic fallback
- **Snippet Generation**: `generateSnippet()` extracts context around search terms
- **Score Normalization**: Normalizes scores to 0-1 range for both methods
- **Result Deduplication**: Combines and deduplicates results when using both methods
- **Search Logging**: Logs all queries to `search_history` table

**Search Methods:**
- `vector`: Vector search succeeded and returned results
- `fts`: FTS used as fallback (vector failed or returned no results)
- `combined`: Both methods used and results combined

### 2. Updated Search Endpoint (`src/api/routes/search.ts`)

**Changes:**
- Imports `SearchService`
- Creates `SearchService` instance with required dependencies
- Uses `searchService.search()` with automatic fallback enabled
- Returns `searchMethod` in response to indicate which method was used

**Response Format:**
```json
{
  "results": [...],
  "totalResults": 10,
  "query": "search query",
  "searchMethod": "vector" | "fts" | "combined",
  "timestamp": "2025-11-17T10:30:00.000Z"
}
```

## Testing Scenarios

### Scenario 1: Normal Vector Search
**Condition:** ChromaDB and embedding service working, content exists
**Expected:** Vector search succeeds, `searchMethod: "vector"`

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
  "http://localhost:3000/api/search?query=machine+learning&limit=5"
```

### Scenario 2: FTS Fallback (No Vector Results)
**Condition:** Vector search returns no results (semantic mismatch)
**Expected:** Falls back to FTS, `searchMethod: "fts"`

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
  "http://localhost:3000/api/search?query=specific+keyword&limit=5"
```

### Scenario 3: FTS Fallback (ChromaDB Down)
**Condition:** ChromaDB unavailable
**Expected:** Falls back to FTS, `searchMethod: "fts"`

```bash
# Stop ChromaDB first
docker-compose stop chromadb

# Run search
curl -H "Authorization: Bearer YOUR_API_KEY" \
  "http://localhost:3000/api/search?query=test&limit=5"

# Restart ChromaDB
docker-compose start chromadb
```

### Scenario 4: FTS Fallback (Embedding Service Down)
**Condition:** OpenAI API key missing or invalid
**Expected:** Falls back to FTS, `searchMethod: "fts"`

```bash
# Temporarily remove OPENAI_API_KEY from .env
# Restart API
npm run dev

# Run search
curl -H "Authorization: Bearer YOUR_API_KEY" \
  "http://localhost:3000/api/search?query=test&limit=5"
```

### Scenario 5: FTS Query Syntax
**Condition:** Using SQLite FTS5 syntax
**Expected:** FTS query works with advanced syntax

```bash
# Phrase search
curl -H "Authorization: Bearer YOUR_API_KEY" \
  "http://localhost:3000/api/search?query=\"machine+learning\""

# AND operator
curl -H "Authorization: Bearer YOUR_API_KEY" \
  "http://localhost:3000/api/search?query=machine+AND+learning"

# OR operator
curl -H "Authorization: Bearer YOUR_API_KEY" \
  "http://localhost:3000/api/search?query=python+OR+javascript"

# NOT operator
curl -H "Authorization: Bearer YOUR_API_KEY" \
  "http://localhost:3000/api/search?query=programming+NOT+java"
```

### Scenario 6: Search History Logging
**Condition:** Queries are logged to database
**Expected:** `search_history` table contains logged queries

```bash
# Run several searches
curl -H "Authorization: Bearer YOUR_API_KEY" \
  "http://localhost:3000/api/search?query=test+1"

curl -H "Authorization: Bearer YOUR_API_KEY" \
  "http://localhost:3000/api/search?query=test+2"

# Check search history in database
sqlite3 data/metadata/knowledge.db \
  "SELECT * FROM search_history ORDER BY created_at DESC LIMIT 10;"
```

## Verification Steps

### 1. Check Database Schema
```bash
sqlite3 data/metadata/knowledge.db <<EOF
-- Check content_fts table exists
SELECT name FROM sqlite_master WHERE type='table' AND name='content_fts';

-- Check search_history table exists
SELECT name FROM sqlite_master WHERE type='table' AND name='search_history';

-- Check FTS triggers exist
SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'content_a%';
EOF
```

### 2. Insert Test Content
```bash
# Create test content for FTS
curl -X POST http://localhost:3000/api/capture \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "This is a test document about machine learning and artificial intelligence",
    "contentType": "text",
    "title": "ML Test Document",
    "tags": ["machine-learning", "ai"],
    "annotation": "Test annotation for FTS search"
  }'
```

### 3. Test FTS Directly (Database Level)
```bash
sqlite3 data/metadata/knowledge.db <<EOF
-- Test FTS search
SELECT c.id, c.title, rank
FROM content_fts fts
JOIN content c ON c.rowid = fts.rowid
WHERE content_fts MATCH 'machine learning'
ORDER BY rank
LIMIT 10;
EOF
```

### 4. Monitor Logs
```bash
# Watch logs for search method used
npm run dev 2>&1 | grep -E "(Vector search|FTS search|falling back|Search completed)"
```

## Expected Behavior

### ✅ Success Criteria

1. **FTS Works**: Keyword searches return relevant results
2. **Fallback Works**: Search falls back to FTS when vector search fails
3. **No Duplicates**: Combined results don't contain duplicate IDs
4. **Snippets Included**: Results include excerpts with context
5. **Scores Normalized**: Relevance scores are in 0-1 range
6. **Logging Works**: Queries are saved to `search_history` table
7. **Search Method Indicated**: Response includes which method was used

### 🔍 Search Quality

- **Vector Search**: Best for semantic/conceptual queries
  - Example: "programming languages for data science" matches Python, R, Julia content

- **FTS Search**: Best for keyword/exact matches
  - Example: "getElementById" matches exact method names

- **Combined**: Best coverage but may need score tuning

## Performance Testing

### Test with Various Dataset Sizes

```bash
# Small dataset (10-50 items)
# Expected: <100ms for both methods

# Medium dataset (100-500 items)
# Expected: <200ms vector, <150ms FTS

# Large dataset (1000+ items)
# Expected: <500ms vector, <300ms FTS
```

### Measure Response Times
```bash
# Vector search timing
time curl -H "Authorization: Bearer YOUR_API_KEY" \
  "http://localhost:3000/api/search?query=test"

# FTS search timing (with ChromaDB down)
docker-compose stop chromadb
time curl -H "Authorization: Bearer YOUR_API_KEY" \
  "http://localhost:3000/api/search?query=test"
docker-compose start chromadb
```

## Troubleshooting

### Issue: FTS search returns no results
**Cause:** FTS table not synchronized with content table
**Fix:**
```sql
-- Rebuild FTS table
sqlite3 data/metadata/knowledge.db <<EOF
DELETE FROM content_fts;
INSERT INTO content_fts(rowid, title, annotation, extracted_text)
SELECT rowid, title, annotation, extracted_text FROM content;
EOF
```

### Issue: Search always uses FTS, never vector
**Cause:** Embedding service or ChromaDB not working
**Fix:**
1. Check `OPENAI_API_KEY` in `.env`
2. Verify ChromaDB is running: `docker-compose ps`
3. Check health endpoint: `curl http://localhost:3000/api/health`

### Issue: Duplicate results in combined mode
**Cause:** Deduplication logic not working
**Fix:** Check `combineAndDeduplicateResults()` method in `searchService.ts`

### Issue: Poor search relevance
**Cause:** Score normalization or ranking issues
**Fix:**
1. Check score normalization in `normalizeScores()`
2. Verify FTS rank values are reasonable
3. Consider adjusting combination strategy (average vs weighted)

## Next Steps

After verifying Task 2.5 works:

1. ✅ Update `BUILD-CHECKLIST.md` to mark Task 2.5 complete
2. ✅ Commit changes with detailed message
3. ✅ Push to branch: `claude/add-fts-fallback-search-01XeuXVBecUG9rCx3mVrYMXQ`
4. Consider future enhancements:
   - Make `combineResults` configurable via query parameter
   - Add more sophisticated snippet highlighting
   - Implement query suggestions based on search history
   - Add search analytics dashboard

## Related Files

- `src/services/searchService.ts` - Main search service
- `src/api/routes/search.ts` - Search endpoint
- `src/services/database/database.service.ts` - FTS queries
- `src/services/database/schema.sql` - FTS table definition
- `BUILD-CHECKLIST.md` - Task tracking

---

**Task 2.5 Complete** ✅
**Date:** 2025-11-17
**Branch:** `claude/add-fts-fallback-search-01XeuXVBecUG9rCx3mVrYMXQ`
