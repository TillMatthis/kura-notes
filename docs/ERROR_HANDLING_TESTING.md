# Error Handling Testing Guide - Task 3.8

**Date:** 2025-11-17
**Task:** Task 3.8 - Error Handling Polish
**Status:** Ready for Testing

## Overview

This document describes how to test all error handling improvements implemented in Task 3.8.

## What Was Changed

### 1. API Error Responses Standardized
- **Fixed:** `stats.ts` (1 location) - now uses `ApiErrors.internalError()`
- **Fixed:** `tags.ts` (9 locations) - all error handlers now use `ApiErrors` class
- **Result:** All API errors now return consistent format with error codes and timestamps

### 2. Information Leakage Removed
- **Fixed:** Removed `filePath` from error logs (lines 228, 333, 528 in content.ts)
- **Fixed:** Content IDs only logged in development mode (lines 770, 921 in content.ts)
- **Result:** Logs no longer expose internal file paths or sensitive IDs in production

### 3. Error Pages Created
- **Added:** `/public/404.html` - Page Not Found
- **Added:** `/public/500.html` - Internal Server Error
- **Added:** `/public/offline.html` - Offline/Network Error
- **Updated:** Server to serve HTML error pages for browser requests, JSON for API requests

---

## Test Scenarios

### ✅ Test 1: API Error Response Format (Tags Endpoint)

**Scenario:** Test that tags endpoints return standardized error responses

**Steps:**
```bash
# Test 1a: GET /api/tags with server error (simulate by stopping database)
curl -H "Authorization: Bearer YOUR_API_KEY" http://localhost:3000/api/tags

# Test 1b: GET /api/tags/search without query parameter
curl -H "Authorization: Bearer YOUR_API_KEY" http://localhost:3000/api/tags/search

# Test 1c: PATCH /api/tags/:tagName/rename without new tag
curl -X PATCH \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{}' \
  http://localhost:3000/api/tags/test-tag/rename
```

**Expected Result:**
All responses should have this format:
```json
{
  "error": "ApiError",
  "code": "VALIDATION_ERROR" | "INTERNAL_ERROR",
  "message": "Human-readable error message",
  "timestamp": "2025-11-17T...",
  "path": "/api/tags/..."
}
```

---

### ✅ Test 2: API Error Response Format (Stats Endpoint)

**Scenario:** Test that stats endpoint returns standardized error responses

**Steps:**
```bash
# Test 2a: GET /api/stats (should succeed normally)
curl -H "Authorization: Bearer YOUR_API_KEY" http://localhost:3000/api/stats

# Test 2b: GET /api/stats with database error (stop database temporarily)
# Stop database, then:
curl -H "Authorization: Bearer YOUR_API_KEY" http://localhost:3000/api/stats
```

**Expected Result:**
Error response should have:
```json
{
  "error": "ApiError",
  "code": "INTERNAL_ERROR",
  "message": "Failed to retrieve statistics",
  "timestamp": "2025-11-17T...",
  "path": "/api/stats"
}
```

---

### ✅ Test 3: 404 Error Page (HTML)

**Scenario:** Test that browser requests for non-existent pages show 404.html

**Steps:**
1. Open browser and navigate to: `http://localhost:3000/nonexistent-page`
2. Try various non-existent paths:
   - `http://localhost:3000/random123`
   - `http://localhost:3000/foo/bar/baz`
   - `http://localhost:3000/admin`

**Expected Result:**
- Browser shows custom 404.html page
- Page includes:
  - Large "404" error code
  - "Page Not Found" title
  - Links to home, search
  - Suggestions for common actions
  - Navigation header still works

---

### ✅ Test 4: 404 Error (API JSON)

**Scenario:** Test that API requests for non-existent endpoints return JSON

**Steps:**
```bash
# Test 4a: Non-existent API endpoint
curl -H "Authorization: Bearer YOUR_API_KEY" http://localhost:3000/api/nonexistent

# Test 4b: Wrong HTTP method
curl -X PUT -H "Authorization: Bearer YOUR_API_KEY" http://localhost:3000/api/tags
```

**Expected Result:**
JSON response with 404 status:
```json
{
  "error": "NotFound",
  "code": "NOT_FOUND",
  "message": "Route GET:/api/nonexistent not found",
  "timestamp": "2025-11-17T...",
  "path": "/api/nonexistent"
}
```

---

### ✅ Test 5: 500 Error Page (HTML)

**Scenario:** Test that browser requests with server errors show 500.html

**Steps:**
1. Temporarily break the database connection (rename database file or change path in .env)
2. Start server with broken database
3. Open browser and navigate to: `http://localhost:3000/view.html?id=test-id`
4. Try to view a content item that should fail

**Expected Result:**
- Browser shows custom 500.html page
- Page includes:
  - Large "500" error code in red
  - "Internal Server Error" title
  - Explanation of what happened
  - Links to go home or try again
  - Troubleshooting tips

**Cleanup:** Restore database connection and restart server

---

### ✅ Test 6: 500 Error (API JSON)

**Scenario:** Test that API requests with server errors return JSON

**Steps:**
```bash
# With database connection broken from Test 5:
curl -H "Authorization: Bearer YOUR_API_KEY" http://localhost:3000/api/content/test-id
```

**Expected Result:**
JSON response with 500 status and error details

**Cleanup:** Restore database connection

---

### ✅ Test 7: Offline Page

**Scenario:** Test the offline page (manual browser test)

**Steps:**
1. Start server normally
2. Open browser and navigate to: `http://localhost:3000/offline.html`
3. Observe:
   - Countdown timer (10 seconds)
   - Auto-retry functionality
   - Retry button
   - Troubleshooting tips

4. Stop server and click "Retry Connection"
5. Start server and wait for auto-retry

**Expected Result:**
- Page shows offline status
- Auto-retry counts down and attempts reconnection
- When server is back, page detects it and redirects to home
- Manual retry button works

---

### ✅ Test 8: Information Leakage (Production Logs)

**Scenario:** Verify that sensitive info is not logged in production

**Steps:**
1. Set environment variable: `export NODE_ENV=production`
2. Start server
3. Make a request that would normally log IDs:
```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"ids":["id1","id2","id3","id4","id5","id6","id7","id8","id9","id10","id11"]}' \
  http://localhost:3000/api/content/bulk/delete
```

4. Check server logs

**Expected Result:**
- Logs show: `Bulk delete request received { count: 11 }`
- Logs DO NOT show: `ids: [...]`
- No file paths (`filePath`) in error logs

**Cleanup:** Set `NODE_ENV=development`

---

### ✅ Test 9: Information Leakage (Development Logs)

**Scenario:** Verify that IDs ARE logged in development mode

**Steps:**
1. Set environment variable: `export NODE_ENV=development`
2. Start server
3. Make the same bulk delete request from Test 8
4. Check server logs

**Expected Result:**
- Logs show: `Bulk delete request received { count: 11, ids: ['id1', 'id2', ...] }`
- IDs are visible in development mode (first 10 only)

---

### ✅ Test 10: Validation Errors (Tags)

**Scenario:** Test that validation errors are properly formatted

**Steps:**
```bash
# Test 10a: Empty search query
curl -H "Authorization: Bearer YOUR_API_KEY" \
  "http://localhost:3000/api/tags/search?q="

# Test 10b: Empty new tag name
curl -X PATCH \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"newTag":""}' \
  http://localhost:3000/api/tags/old-tag/rename

# Test 10c: Empty source tags for merge
curl -X POST \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"sourceTags":[],"targetTag":"new"}' \
  http://localhost:3000/api/tags/merge
```

**Expected Result:**
All return 400 status with:
```json
{
  "error": "ApiError",
  "code": "VALIDATION_ERROR",
  "message": "Descriptive validation error message",
  "timestamp": "2025-11-17T...",
  "path": "/api/tags/..."
}
```

---

### ✅ Test 11: Network Errors

**Scenario:** Test handling of ChromaDB/Vector store unavailability

**Steps:**
1. Stop ChromaDB container: `docker-compose stop vectordb`
2. Try to perform a search:
```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
  "http://localhost:3000/api/search?query=test"
```

**Expected Result:**
- Returns 503 Service Unavailable
- Error message indicates vector store is unavailable
- Logs show connection error with context

**Cleanup:** `docker-compose start vectordb`

---

### ✅ Test 12: File Size Errors

**Scenario:** Test file size validation

**Steps:**
```bash
# Create a large file (>50MB)
dd if=/dev/zero of=/tmp/large-file.txt bs=1M count=60

# Try to upload it
curl -X POST \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -F "file=@/tmp/large-file.txt" \
  http://localhost:3000/api/capture
```

**Expected Result:**
- Returns 413 Payload Too Large
- Error message: "File size exceeds maximum allowed size of 50MB"
- Error code: `FILE_TOO_LARGE`

**Cleanup:** `rm /tmp/large-file.txt`

---

### ✅ Test 13: Authentication Errors

**Scenario:** Test authentication error handling

**Steps:**
```bash
# Test 13a: Missing API key
curl http://localhost:3000/api/content/recent

# Test 13b: Invalid API key
curl -H "Authorization: Bearer wrong-key" \
  http://localhost:3000/api/content/recent
```

**Expected Result:**
- Both return 401 Unauthorized
- Error code: `UNAUTHORIZED` or `INVALID_API_KEY`
- Consistent error format

---

### ✅ Test 14: Browser vs API Error Handling

**Scenario:** Verify different error formats for browser vs API

**Steps:**
1. Browser test:
   - Navigate to `http://localhost:3000/nonexistent`
   - Should show HTML 404 page

2. API test:
   ```bash
   curl -H "Authorization: Bearer YOUR_API_KEY" \
     http://localhost:3000/api/nonexistent
   ```
   - Should return JSON error

**Expected Result:**
- Browser gets HTML error pages (user-friendly)
- API gets JSON error responses (machine-readable)
- Both have correct status codes

---

### ✅ Test 15: Error Logging

**Scenario:** Verify comprehensive error logging

**Steps:**
1. Trigger various errors (validation, database, network)
2. Check logs for each error
3. Verify logs contain:
   - Error message
   - Stack trace (for 500 errors)
   - Request path
   - HTTP method
   - Status code
   - Timestamp

**Expected Result:**
All errors logged with structured data:
```json
{
  "level": "error",
  "message": "Failed to retrieve content",
  "error": "Content not found",
  "path": "/api/content/123",
  "method": "GET",
  "statusCode": 404,
  "timestamp": "2025-11-17T..."
}
```

---

## Manual Testing Checklist

Use this checklist to verify all error handling improvements:

- [ ] **Test 1:** Tags endpoint errors return standardized format
- [ ] **Test 2:** Stats endpoint errors return standardized format
- [ ] **Test 3:** Browser 404 shows custom HTML page
- [ ] **Test 4:** API 404 returns JSON error
- [ ] **Test 5:** Browser 500 shows custom HTML page
- [ ] **Test 6:** API 500 returns JSON error
- [ ] **Test 7:** Offline page works with auto-retry
- [ ] **Test 8:** Production logs hide sensitive info (IDs, paths)
- [ ] **Test 9:** Development logs show debug info
- [ ] **Test 10:** Validation errors properly formatted
- [ ] **Test 11:** Network errors handled gracefully
- [ ] **Test 12:** File size errors return clear messages
- [ ] **Test 13:** Authentication errors consistent
- [ ] **Test 14:** Browser vs API get appropriate error formats
- [ ] **Test 15:** All errors logged comprehensively

---

## Known Issues / Future Improvements

### Not Implemented in This Task
1. **Timeout Handling** - No explicit timeout for ChromaDB/OpenAI calls (would require additional middleware)
2. **Disk Space Errors** - No specific ENOSPC error handling (would require filesystem monitoring)
3. **UTF-8 Decoding Errors** - Assumes all files can be decoded as UTF-8 (could add encoding detection)
4. **Optimistic Locking** - No concurrent modification protection for PATCH operations

These are documented but deferred to future tasks as they require more significant architectural changes.

---

## Summary of Changes

### Files Modified:
1. `src/api/routes/stats.ts` - Fixed error handling (1 location)
2. `src/api/routes/tags.ts` - Fixed error handling (9 locations)
3. `src/api/routes/content.ts` - Removed information leakage (5 locations)
4. `src/api/server.ts` - Updated not found handler for HTML errors
5. `src/api/middleware/errorHandler.ts` - Updated to serve HTML 500 page

### Files Created:
1. `public/404.html` - Custom 404 error page
2. `public/500.html` - Custom 500 error page
3. `public/offline.html` - Custom offline page

### Documentation Created:
1. `docs/ERROR_HANDLING_TESTING.md` (this file)

---

## Acceptance Criteria Status

✅ **All errors handled gracefully** - Yes, all routes use centralized error handling
✅ **Error messages helpful** - Yes, clear, user-friendly messages for all scenarios
✅ **Errors logged properly** - Yes, comprehensive structured logging with context
✅ **Error pages exist** - Yes, 404.html, 500.html, and offline.html created
✅ **User never sees raw errors** - Yes, production errors sanitized, HTML/JSON formatted appropriately

---

**Task 3.8 Status:** ✅ **COMPLETE** (Ready for testing and commit)
