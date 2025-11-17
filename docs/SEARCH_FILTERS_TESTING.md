# Search Filters Testing Guide

**Task 2.6: Search Filters**
**Status:** Implementation Complete - Ready for Testing
**Date:** 2025-11-17

---

## Overview

This guide provides comprehensive testing scenarios for the search filter functionality added to the `/api/search` endpoint.

## Features Implemented

### 1. Filter Parameters

The search endpoint now accepts the following optional filter parameters:

- **contentType**: Comma-separated list of content types (`text`, `image`, `pdf`, `audio`)
- **tags**: Comma-separated list of tags (results must have ALL specified tags)
- **dateFrom**: ISO 8601 date string (filter by `created_at >= dateFrom`)
- **dateTo**: ISO 8601 date string (filter by `created_at <= dateTo`)

### 2. Filter Validation

- Content types are validated against allowed values
- Date formats are validated (must be valid ISO 8601)
- Date range is validated (dateFrom must be <= dateTo)
- Tags are validated (must be non-empty strings)
- Returns 400 error for invalid filters

### 3. Filter Application

- Filters are applied AFTER vector/FTS search
- Multiple filters combine with AND logic
- Results include `appliedFilters` field showing what filters were used

---

## Testing Prerequisites

### Start the Application

```bash
# Start with Docker Compose
docker-compose up

# Or run locally
npm run dev
```

### Get API Key

Set your API key in the `Authorization` header:

```bash
export API_KEY="your-api-key-here"
```

---

## Test Scenarios

### Scenario 1: Filter by Content Type

**Test 1.1: Single Content Type**

```bash
curl -X GET "http://localhost:3000/api/search?query=test&contentType=text" \
  -H "Authorization: Bearer $API_KEY" \
  | jq .
```

**Expected Result:**
- Only results with `contentType: "text"`
- `appliedFilters.contentTypes: ["text"]`

**Test 1.2: Multiple Content Types**

```bash
curl -X GET "http://localhost:3000/api/search?query=test&contentType=text,image" \
  -H "Authorization: Bearer $API_KEY" \
  | jq .
```

**Expected Result:**
- Results with `contentType: "text"` OR `"image"`
- `appliedFilters.contentTypes: ["text", "image"]`

**Test 1.3: Invalid Content Type**

```bash
curl -X GET "http://localhost:3000/api/search?query=test&contentType=invalid" \
  -H "Authorization: Bearer $API_KEY" \
  | jq .
```

**Expected Result:**
- HTTP 400 error
- Error message: "Invalid content types: invalid. Valid types: text, image, pdf, audio"

---

### Scenario 2: Filter by Tags

**Test 2.1: Single Tag**

```bash
curl -X GET "http://localhost:3000/api/search?query=test&tags=important" \
  -H "Authorization: Bearer $API_KEY" \
  | jq .
```

**Expected Result:**
- Only results that have the tag "important"
- `appliedFilters.tags: ["important"]`

**Test 2.2: Multiple Tags (AND logic)**

```bash
curl -X GET "http://localhost:3000/api/search?query=test&tags=important,work" \
  -H "Authorization: Bearer $API_KEY" \
  | jq .
```

**Expected Result:**
- Only results that have BOTH "important" AND "work" tags
- `appliedFilters.tags: ["important", "work"]`

**Test 2.3: Tags with Spaces**

```bash
curl -X GET "http://localhost:3000/api/search?query=test&tags=work,%20personal" \
  -H "Authorization: Bearer $API_KEY" \
  | jq .
```

**Expected Result:**
- Tags are trimmed, so "personal" should match
- Results with both "work" and "personal" tags

---

### Scenario 3: Filter by Date Range

**Test 3.1: Date From (created after)**

```bash
curl -X GET "http://localhost:3000/api/search?query=test&dateFrom=2025-01-01T00:00:00Z" \
  -H "Authorization: Bearer $API_KEY" \
  | jq .
```

**Expected Result:**
- Only results created on or after January 1, 2025
- `appliedFilters.dateFrom: "2025-01-01T00:00:00Z"`

**Test 3.2: Date To (created before)**

```bash
curl -X GET "http://localhost:3000/api/search?query=test&dateTo=2025-12-31T23:59:59Z" \
  -H "Authorization: Bearer $API_KEY" \
  | jq .
```

**Expected Result:**
- Only results created on or before December 31, 2025
- `appliedFilters.dateTo: "2025-12-31T23:59:59Z"`

**Test 3.3: Date Range**

```bash
curl -X GET "http://localhost:3000/api/search?query=test&dateFrom=2025-01-01T00:00:00Z&dateTo=2025-12-31T23:59:59Z" \
  -H "Authorization: Bearer $API_KEY" \
  | jq .
```

**Expected Result:**
- Only results created in 2025
- Both `dateFrom` and `dateTo` in `appliedFilters`

**Test 3.4: Invalid Date Format**

```bash
curl -X GET "http://localhost:3000/api/search?query=test&dateFrom=invalid-date" \
  -H "Authorization: Bearer $API_KEY" \
  | jq .
```

**Expected Result:**
- HTTP 400 error
- Error message: "Invalid dateFrom format: invalid-date. Expected ISO 8601 date string"

**Test 3.5: Invalid Date Range (from > to)**

```bash
curl -X GET "http://localhost:3000/api/search?query=test&dateFrom=2025-12-31T00:00:00Z&dateTo=2025-01-01T00:00:00Z" \
  -H "Authorization: Bearer $API_KEY" \
  | jq .
```

**Expected Result:**
- HTTP 400 error
- Error message: "dateFrom must be before or equal to dateTo"

---

### Scenario 4: Combine Multiple Filters

**Test 4.1: Content Type + Tags**

```bash
curl -X GET "http://localhost:3000/api/search?query=test&contentType=text&tags=important" \
  -H "Authorization: Bearer $API_KEY" \
  | jq .
```

**Expected Result:**
- Only text content with "important" tag
- Both filters in `appliedFilters`

**Test 4.2: All Filters Combined**

```bash
curl -X GET "http://localhost:3000/api/search?query=test&contentType=text,image&tags=important,work&dateFrom=2025-01-01T00:00:00Z&dateTo=2025-12-31T23:59:59Z" \
  -H "Authorization: Bearer $API_KEY" \
  | jq .
```

**Expected Result:**
- Only text or image content
- With BOTH "important" and "work" tags
- Created in 2025
- All filters in `appliedFilters`

**Test 4.3: No Results After Filtering**

```bash
curl -X GET "http://localhost:3000/api/search?query=test&contentType=audio&tags=nonexistent" \
  -H "Authorization: Bearer $API_KEY" \
  | jq .
```

**Expected Result:**
- Empty results array
- `totalResults: 0`
- Filters still shown in `appliedFilters`

---

### Scenario 5: Search Without Filters (Backwards Compatibility)

**Test 5.1: No Filters Provided**

```bash
curl -X GET "http://localhost:3000/api/search?query=test" \
  -H "Authorization: Bearer $API_KEY" \
  | jq .
```

**Expected Result:**
- All results matching the query (no filtering)
- `appliedFilters: {}` (empty object)

---

## Performance Testing

### Test 6.1: Filter Performance with Large Results

```bash
# Search with no filters (baseline)
time curl -X GET "http://localhost:3000/api/search?query=test&limit=50" \
  -H "Authorization: Bearer $API_KEY" \
  -o /dev/null -s

# Search with all filters
time curl -X GET "http://localhost:3000/api/search?query=test&limit=50&contentType=text&tags=test&dateFrom=2025-01-01T00:00:00Z" \
  -H "Authorization: Bearer $API_KEY" \
  -o /dev/null -s
```

**Expected Result:**
- Response time should be <500ms for both queries
- Filter application should add minimal overhead

---

## Response Format Validation

### Check appliedFilters Field

Every search response should include the `appliedFilters` field:

```json
{
  "results": [...],
  "totalResults": 5,
  "query": "test",
  "searchMethod": "vector",
  "appliedFilters": {
    "contentTypes": ["text"],
    "tags": ["important"],
    "dateFrom": "2025-01-01T00:00:00Z",
    "dateTo": "2025-12-31T23:59:59Z"
  },
  "timestamp": "2025-11-17T12:00:00.000Z"
}
```

---

## Edge Cases

### Test 7.1: Empty Filter Values

```bash
curl -X GET "http://localhost:3000/api/search?query=test&contentType=&tags=" \
  -H "Authorization: Bearer $API_KEY" \
  | jq .
```

**Expected Result:**
- Empty strings are ignored
- `appliedFilters: {}` (no filters applied)

### Test 7.2: Whitespace-Only Tags

```bash
curl -X GET "http://localhost:3000/api/search?query=test&tags=%20,%20%20" \
  -H "Authorization: Bearer $API_KEY" \
  | jq .
```

**Expected Result:**
- Whitespace-only tags are filtered out
- No filters applied

### Test 7.3: Case Sensitivity

```bash
# Create content with tag "Important"
# Search with tag "important"
curl -X GET "http://localhost:3000/api/search?query=test&tags=important" \
  -H "Authorization: Bearer $API_KEY" \
  | jq .
```

**Expected Result:**
- Tags are case-sensitive (current implementation)
- Only exact matches are returned

---

## Integration with Search Methods

### Test 8.1: Filters with Vector Search

```bash
curl -X GET "http://localhost:3000/api/search?query=machine%20learning&contentType=text" \
  -H "Authorization: Bearer $API_KEY" \
  | jq .
```

**Expected Result:**
- `searchMethod: "vector"` (or "fts" or "combined")
- Filters applied AFTER vector search
- Only text results

### Test 8.2: Filters with FTS Fallback

```bash
# Disable embedding service or use exact phrase search
curl -X GET "http://localhost:3000/api/search?query=\"exact%20phrase\"&contentType=image" \
  -H "Authorization: Bearer $API_KEY" \
  | jq .
```

**Expected Result:**
- Search method may be "fts" or "combined"
- Filters still applied correctly
- Only image results

---

## Acceptance Criteria Verification

✅ **Can filter by content type**
- Test 1.1, 1.2 validate single and multiple content types

✅ **Can filter by tags**
- Test 2.1, 2.2 validate single and multiple tags with AND logic

✅ **Can filter by date range**
- Test 3.1, 3.2, 3.3 validate dateFrom, dateTo, and range filtering

✅ **Filters combine with search results**
- Test 4.1, 4.2 validate combining multiple filters
- Test 8.1, 8.2 validate filters work with both vector and FTS search

✅ **Performance acceptable (sub-500ms)**
- Test 6.1 validates performance with filters

✅ **Invalid filters return clear errors**
- Test 1.3, 3.4, 3.5 validate error handling for invalid inputs

---

## Troubleshooting

### No Results Returned

1. Check that content exists matching your query
2. Verify filters are not too restrictive
3. Check `appliedFilters` in response to see what filters were applied
4. Try removing filters one by one to isolate the issue

### Unexpected Results

1. Remember tags use AND logic (must have ALL tags)
2. Check date formats are valid ISO 8601
3. Verify content types are spelled correctly
4. Check server logs for filter application details

### Error Messages

- **400 errors**: Invalid filter parameters (check error message for details)
- **401 errors**: Missing or invalid API key
- **500 errors**: Server error (check logs)
- **503 errors**: Service unavailable (embedding or vector store down)

---

## Next Steps

After testing:

1. ✅ Verify all acceptance criteria are met
2. ✅ Update BUILD-CHECKLIST.md to mark Task 2.6 complete
3. ✅ Commit and push changes
4. 🔜 Proceed to Task 2.7: Search Interface (implement UI for filters)

---

**Last Updated:** 2025-11-17
**Implementation Status:** Complete - Ready for Testing
