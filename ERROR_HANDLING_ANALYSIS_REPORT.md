# Error Handling Analysis Report - KURA Notes API Routes

**Generated:** 2025-11-17
**Scope:** All API route files in `src/api/routes/`

---

## Executive Summary

The codebase demonstrates **good overall error handling practices** with consistent use of the `ApiError` class in most routes. However, there are **significant inconsistencies** in the `tags.ts` and `stats.ts` routes that don't follow the established patterns. Additionally, there are several missing error scenarios and minor security concerns around information leakage in logs and error messages.

---

## 1. Current Error Handling Patterns

### ✅ Good Patterns Identified

1. **Centralized ApiError Class** (`src/api/types/errors.ts`)
   - Well-structured custom error class with proper typing
   - Consistent error codes via `ErrorCode` enum
   - Helper functions in `ApiErrors` for common errors
   - Automatic serialization via `toResponse()` method

2. **Centralized Error Handler Middleware** (`src/api/middleware/errorHandler.ts`)
   - Global error handler catches all unhandled errors
   - Consistent error response format across all endpoints
   - Production vs development error message handling (line 71-73)
   - Proper handling of Fastify validation errors (line 38-49)

3. **Error Re-throwing Pattern**
   - Most routes check if error is already an ApiError before wrapping
   - Example from `content.ts` (lines 256-259, 340-342, 604-607):
   ```typescript
   if (error && typeof error === 'object' && 'statusCode' in error) {
     throw error;
   }
   ```

4. **Comprehensive Logging**
   - Most routes log errors with contextual information
   - Uses structured logging with Winston

5. **Input Validation**
   - Routes validate request parameters and throw appropriate validation errors
   - Good use of Fastify schemas for automatic validation

### ❌ Inconsistent Patterns

1. **Manual Error Responses** (tags.ts and stats.ts don't use ApiError)
2. **Mixed Logging Approaches** (some log full objects, others just messages)
3. **Inconsistent Validation** (some routes validate manually, others rely on schemas)

---

## 2. Critical Issues Found

### Issue #1: Stats Route Doesn't Use ApiError Class

**File:** `/home/user/kura-notes/src/api/routes/stats.ts`
**Lines:** 36-42
**Severity:** HIGH

**Description:**
The stats endpoint returns raw error objects instead of using the `ApiError` class, making error responses inconsistent with other API endpoints.

**Current Code:**
```typescript
return reply.status(500).send({
  success: false,
  error: 'Failed to retrieve statistics',
  message: error instanceof Error ? error.message : 'Unknown error',
});
```

**Issue:**
- Missing `code` field (ErrorCode enum)
- Missing `timestamp` field
- Inconsistent response format (uses `success` field)
- Doesn't use centralized error handler

**Recommended Fix:**
```typescript
try {
  const statsService = getStatsService();
  const stats = statsService.getStats();

  logger.debug('Stats retrieved successfully', {
    totalItems: stats.totalItems,
    lastUpdated: stats.lastUpdated,
  });

  return reply.status(200).send({
    success: true,
    data: stats,
  });
} catch (error) {
  logger.error('Failed to retrieve stats', { error });

  // Let the centralized error handler deal with it
  throw ApiErrors.internalError(
    error instanceof Error ? error.message : 'Failed to retrieve statistics'
  );
}
```

---

### Issue #2: Tags Route Doesn't Use ApiError Class

**File:** `/home/user/kura-notes/src/api/routes/tags.ts`
**Lines:** 86-89, 155-159, 171-174, 232-237, 251-254, 312-324, 338-341, 396-399
**Severity:** HIGH

**Description:**
All error responses in the tags route bypass the `ApiError` class and return raw error objects directly.

**Examples:**

**Lines 86-89:**
```typescript
reply.code(500).send({
  error: 'Failed to get tags',
  message: error instanceof Error ? error.message : 'Unknown error',
});
```

**Lines 155-159:**
```typescript
reply.code(400).send({
  error: 'Query parameter required',
  message: 'Please provide a search query (q parameter)',
});
```

**Issues:**
- No `code` field (ErrorCode enum)
- No `timestamp` field
- Bypasses centralized error handler
- Inconsistent with other routes

**Recommended Fix (for line 86-89):**
```typescript
try {
  logger.debug('GET /api/tags request received', {
    limit: request.query.limit,
  });

  const limit = request.query.limit || 100;
  const allTags = tagService.getAllTags();
  const limitedTags = allTags.slice(0, limit);

  reply.code(200).send({
    tags: limitedTags,
    total: allTags.length,
  });
} catch (error) {
  logger.error('Failed to get tags', { error });
  throw ApiErrors.internalError(
    error instanceof Error ? error.message : 'Failed to get tags'
  );
}
```

**Recommended Fix (for validation errors like line 155-159):**
```typescript
if (!query || query.trim().length === 0) {
  logger.warn('Missing search query parameter');
  throw ApiErrors.validationError('Search query parameter (q) is required');
}
```

---

### Issue #3: Potential Information Leakage in Logs

**File:** `/home/user/kura-notes/src/api/routes/content.ts`
**Lines:** 228, 299, 773, 924
**Severity:** MEDIUM

**Description:**
Error logs expose internal system information that could be leveraged by attackers.

**Line 228:**
```typescript
logger.error('Failed to read file content', {
  id,
  filePath: metadata.file_path,  // ⚠️ Exposes internal storage paths
  error: fileContent.error,
});
```

**Line 773:**
```typescript
logger.info('Bulk delete request received', {
  count: ids.length,
  ids: ids.slice(0, 10), // ⚠️ Could expose sensitive content IDs
});
```

**Recommended Fix:**
```typescript
// Line 228 - Remove filePath from logs
logger.error('Failed to read file content', {
  id,
  error: fileContent.error,
});

// Line 773 - Don't log actual IDs in production
logger.info('Bulk delete request received', {
  count: ids.length,
  ...(process.env.NODE_ENV !== 'production' && { ids: ids.slice(0, 10) }),
});
```

---

### Issue #4: Database Methods Called with Await Unnecessarily

**File:** `/home/user/kura-notes/src/api/routes/content.ts`
**Lines:** 785, 936
**Severity:** LOW

**Description:**
`db.getContentById()` is synchronous but called with `await`, which doesn't cause errors but is semantically incorrect.

**Current Code (Line 785):**
```typescript
const content = await db.getContentById(id);
```

**Recommended Fix:**
```typescript
const content = db.getContentById(id);
```

---

### Issue #5: Manual Validation Instead of Using ApiErrors

**File:** `/home/user/kura-notes/src/api/routes/tags.ts`
**Lines:** 232-237, 312-324
**Severity:** MEDIUM

**Description:**
The tags route performs manual validation and sends error responses directly instead of throwing validation errors.

**Current Code (Lines 232-237):**
```typescript
if (!newTag || newTag.trim().length === 0) {
  reply.code(400).send({
    error: 'New tag required',
    message: 'Please provide a new tag name',
  });
  return;
}
```

**Recommended Fix:**
```typescript
if (!newTag || newTag.trim().length === 0) {
  throw ApiErrors.validationError('New tag name is required');
}
```

---

### Issue #6: Inconsistent Error Handling in Bulk Operations

**File:** `/home/user/kura-notes/src/api/routes/content.ts`
**Lines:** 792-801
**Severity:** LOW

**Description:**
Bulk delete operations directly call `fileStorage.deleteFile()` without proper error wrapping, though errors are caught and logged.

**Current Code (Lines 792-794):**
```typescript
try {
  await fileStorage.deleteFile(content.file_path);
} catch (error) {
```

**Issue:**
The `fileStorage.deleteFile()` returns a result object with `success` and `error` properties, but here it's being treated as if it throws errors directly.

**Recommended Fix:**
```typescript
const deleteResult = await fileStorage.deleteFile(id);
if (!deleteResult.success) {
  logger.warn('Failed to delete file from filesystem', {
    id,
    error: deleteResult.error,
  });
  // Continue with deletion even if file doesn't exist
}
```

---

## 3. Missing Error Scenarios

### Scenario #1: File Size Validation Before Buffering

**File:** `/home/user/kura-notes/src/api/routes/capture.ts`
**Line:** 237
**Severity:** MEDIUM

**Description:**
File is buffered into memory before checking size limits. For large files, this could cause memory issues.

**Current Flow:**
```typescript
const fileBuffer = await file.toBuffer();  // Line 237 - Buffers entire file
logger.debug('File buffered', { size: fileBuffer.length });
// Size check happens at Fastify level, but file is already in memory
```

**Recommended Fix:**
Add streaming with size checks or rely on Fastify's multipart limits (already configured in server.ts line 102-105). Document that Fastify handles this.

**Action Required:**
Add a comment to clarify that file size validation happens at the Fastify level:
```typescript
// Note: File size is validated by Fastify multipart plugin before buffering
// See server.ts multipart limits configuration
const fileBuffer = await file.toBuffer();
```

---

### Scenario #2: Invalid UTF-8 Encoding Handling

**File:** `/home/user/kura-notes/src/api/routes/content.ts`
**Line:** 240
**Severity:** LOW

**Description:**
The code assumes file content can always be decoded as UTF-8, which may fail for binary files or corrupted text files.

**Current Code:**
```typescript
const content = fileContent.content!.toString('utf-8');
```

**Recommended Fix:**
```typescript
try {
  const content = fileContent.content!.toString('utf-8');
  // ... rest of response
} catch (decodeError) {
  logger.error('Failed to decode file content as UTF-8', { id });
  throw ApiErrors.storageError('File content is not valid UTF-8 text');
}
```

---

### Scenario #3: Network Timeout Handling

**Files:** All routes that call vector store or embedding service
**Severity:** MEDIUM

**Description:**
No explicit timeout handling for external service calls (ChromaDB, OpenAI).

**Affected Routes:**
- `search.ts` - Lines 284-290 (search service calls)
- `content.ts` - Lines 582-590 (vector store deletion)
- `capture.ts` - Lines 144-151, 268-276 (embedding pipeline)

**Current Pattern:**
```typescript
await vectorStore.deleteDocument(id);  // No timeout handling
```

**Recommended Fix:**
Add timeout configuration at the service level or wrap calls with timeout promises:
```typescript
const VECTOR_STORE_TIMEOUT = 5000; // 5 seconds

try {
  await Promise.race([
    vectorStore.deleteDocument(id),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Vector store timeout')), VECTOR_STORE_TIMEOUT)
    )
  ]);
} catch (vectorError) {
  if (vectorError.message.includes('timeout')) {
    logger.warn('Vector store operation timed out (non-critical)', { id });
  } else {
    logger.warn('Failed to delete embedding from ChromaDB (non-critical)', { id, error: vectorError });
  }
}
```

---

### Scenario #4: Disk Space Exhaustion

**File:** `/home/user/kura-notes/src/api/routes/capture.ts`
**Lines:** 124-136, 245-258
**Severity:** MEDIUM

**Description:**
No handling for disk space exhaustion errors during file save operations.

**Recommended Fix:**
Add specific error detection for ENOSPC (no space left on device):
```typescript
try {
  const result = await fileStorage.saveFile({...});
  if (!result.success) {
    logger.error('Failed to save content', { error: result.error });

    // Check for specific error types
    if (result.error?.includes('ENOSPC') || result.error?.includes('no space')) {
      throw ApiErrors.serviceUnavailable('Storage');
    }

    throw ApiErrors.storageError(result.error || 'Failed to save content');
  }
} catch (error) {
  // ... existing error handling
}
```

---

### Scenario #5: Concurrent Modification Conflicts

**File:** `/home/user/kura-notes/src/api/routes/content.ts`
**Lines:** 638-643
**Severity:** LOW

**Description:**
The PATCH endpoint doesn't handle concurrent modifications. Two users could modify the same content simultaneously.

**Current Code:**
```typescript
const existingContent = db.getContentById(id);
if (!existingContent) {
  throw ApiErrors.notFound('Content not found');
}
// ... validation ...
const updatedContent = db.updateContent(id, {...});
```

**Recommended Fix:**
Add optimistic locking with version/timestamp checking:
```typescript
const existingContent = db.getContentById(id);
if (!existingContent) {
  throw ApiErrors.notFound('Content not found');
}

// Optional: Add version check if implementing optimistic locking
if (request.body.expectedVersion &&
    existingContent.updated_at !== request.body.expectedVersion) {
  throw ApiErrors.validationError(
    'Content has been modified by another request. Please refresh and try again.',
    { currentVersion: existingContent.updated_at }
  );
}

const updatedContent = db.updateContent(id, {...});
```

---

### Scenario #6: Malformed Multipart Metadata

**File:** `/home/user/kura-notes/src/api/routes/capture.ts`
**Lines:** 194-201
**Severity:** LOW

**Description:**
Metadata parsing failures are logged but silently ignored. Users won't know if their metadata was rejected.

**Current Code:**
```typescript
if (fieldName === 'metadata') {
  try {
    const parsed = JSON.parse(value);
    Object.assign(metadata, parsed);
  } catch (e) {
    logger.warn('Failed to parse metadata field', { value });
  }
}
```

**Recommended Fix:**
```typescript
if (fieldName === 'metadata') {
  try {
    const parsed = JSON.parse(value);
    Object.assign(metadata, parsed);
  } catch (e) {
    logger.warn('Failed to parse metadata field', { value, error: e });
    throw ApiErrors.validationError(
      'Invalid metadata format. Must be valid JSON.',
      { providedValue: value }
    );
  }
}
```

---

## 4. Routes That Don't Properly Use ApiError

### Summary Table

| Route File | Lines | Severity | Issue |
|-----------|-------|----------|-------|
| `stats.ts` | 36-42 | HIGH | Returns raw error object instead of throwing ApiError |
| `tags.ts` | 86-89 | HIGH | Returns raw error object for internal errors |
| `tags.ts` | 155-159 | HIGH | Returns raw error object for validation errors |
| `tags.ts` | 171-174 | HIGH | Returns raw error object for internal errors |
| `tags.ts` | 232-237 | HIGH | Returns raw error object for validation errors |
| `tags.ts` | 251-254 | HIGH | Returns raw error object for internal errors |
| `tags.ts` | 312-324 | HIGH | Returns raw error object for validation errors |
| `tags.ts` | 338-341 | HIGH | Returns raw error object for internal errors |
| `tags.ts` | 396-399 | HIGH | Returns raw error object for internal errors |

### Comprehensive Fix Template

For all error handlers in `tags.ts` and `stats.ts`:

**Instead of:**
```typescript
catch (error) {
  logger.error('Operation failed', { error });
  reply.code(500).send({
    error: 'Operation failed',
    message: error instanceof Error ? error.message : 'Unknown error',
  });
}
```

**Use:**
```typescript
catch (error) {
  logger.error('Operation failed', { error });
  throw ApiErrors.internalError(
    error instanceof Error ? error.message : 'Operation failed'
  );
}
```

---

## 5. Inconsistent Logging Patterns

### Issue #1: Mixed Logging Verbosity

**Files:** All route files
**Description:** Some routes log full error objects, others log just messages.

**Examples:**

**Inconsistent:**
```typescript
// Some routes (content.ts, line 190)
logger.error('Failed to retrieve recent content', { error });

// Others (search.ts, line 345)
logger.error('Unexpected error during search', {
  error: error instanceof Error ? error.message : 'Unknown error',
  query: trimmedQuery,
});
```

**Recommended Standard:**
```typescript
logger.error('Operation failed', {
  error: error instanceof Error ? error.message : 'Unknown error',
  stack: error instanceof Error ? error.stack : undefined,
  ...contextData,
});
```

### Issue #2: Different Log Levels for Similar Errors

**Files:** Various
**Description:** Similar error conditions use different log levels.

**Examples:**
- `content.ts` line 217: `logger.warn('Content not found')` - Uses warn
- `content.ts` line 289: `logger.warn('Content not found')` - Uses warn
- `capture.ts` line 113: `logger.warn('Empty content in capture request')` - Uses warn

**Recommended Standard:**
- `logger.error()` - For unexpected errors that prevent operation completion
- `logger.warn()` - For expected errors (validation, not found) that are client mistakes
- `logger.debug()` - For normal operation flow

---

## 6. Sensitive Information in Errors

### Issue #1: Internal File Paths in Logs

**File:** `/home/user/kura-notes/src/api/routes/content.ts`
**Lines:** 228, 299
**Severity:** MEDIUM

**Current:**
```typescript
logger.error('Failed to read file content', {
  id,
  filePath: metadata.file_path,  // ⚠️ Exposes: "uploads/images/2024/01/abc123.jpg"
  error: fileContent.error,
});
```

**Risk:** Exposes internal directory structure to logs which might be accessible to operators or monitoring tools.

**Fix:** Remove file paths from logs, or sanitize them:
```typescript
logger.error('Failed to read file content', {
  id,
  error: fileContent.error,
});
```

---

### Issue #2: Content IDs in Bulk Operation Logs

**File:** `/home/user/kura-notes/src/api/routes/content.ts`
**Lines:** 773, 924
**Severity:** LOW

**Current:**
```typescript
logger.info('Bulk delete request received', {
  count: ids.length,
  ids: ids.slice(0, 10), // ⚠️ Logs actual content IDs
});
```

**Risk:** Content IDs might be considered sensitive depending on the application's security model.

**Fix:** Only log IDs in development:
```typescript
logger.info('Bulk delete request received', {
  count: ids.length,
  ...(process.env.NODE_ENV === 'development' && {
    sampleIds: ids.slice(0, 5)
  }),
});
```

---

### Issue #3: Stack Traces in Production

**File:** `/home/user/kura-notes/src/api/middleware/errorHandler.ts`
**Line:** 25
**Severity:** MEDIUM

**Current:**
```typescript
logger.error('API error', {
  error: error.message,
  stack: error.stack,  // ⚠️ Always logs stack traces
  path,
  method: request.method,
  statusCode: 'statusCode' in error ? error.statusCode : 500,
});
```

**Current Mitigation:** Error messages are sanitized in production (lines 71-73), but stack traces are always logged.

**Risk:** Stack traces can reveal internal code structure and library versions.

**Status:** ✅ **ACCEPTABLE** - Stack traces in logs are fine for debugging. They're not sent to clients. The existing mitigation at lines 71-73 already prevents stack traces from being sent to clients in production.

**Optional Enhancement:** If logs are shared with third parties, consider:
```typescript
logger.error('API error', {
  error: error.message,
  ...(process.env.NODE_ENV !== 'production' && { stack: error.stack }),
  path,
  method: request.method,
  statusCode: 'statusCode' in error ? error.statusCode : 500,
});
```

---

### Issue #4: Error Details Exposed to Clients

**File:** `/home/user/kura-notes/src/api/middleware/errorHandler.ts`
**Lines:** 71-73
**Severity:** LOW

**Current:**
```typescript
message:
  process.env.NODE_ENV === 'production'
    ? 'An internal error occurred'
    : error.message,
```

**Status:** ✅ **GOOD** - Already handles this correctly by sanitizing messages in production.

---

## 7. Implementation Priority

### 🔴 Critical Priority (Implement First)

1. **Fix tags.ts to use ApiError** (Issue #2)
   - Lines: 86-89, 155-159, 171-174, 232-237, 251-254, 312-324, 338-341, 396-399
   - Impact: High - Inconsistent API responses

2. **Fix stats.ts to use ApiError** (Issue #1)
   - Lines: 36-42
   - Impact: High - Inconsistent API responses

3. **Remove sensitive information from logs** (Issue #3)
   - Files: content.ts lines 228, 299, 773, 924
   - Impact: Medium - Security risk

### 🟡 High Priority (Implement Soon)

4. **Add disk space error handling** (Scenario #4)
   - File: capture.ts
   - Impact: Medium - Better user experience

5. **Add timeout handling for external services** (Scenario #3)
   - Files: search.ts, content.ts, capture.ts
   - Impact: Medium - Prevents hanging requests

6. **Fix malformed metadata handling** (Scenario #6)
   - File: capture.ts lines 194-201
   - Impact: Medium - Better error reporting

### 🟢 Medium Priority (Nice to Have)

7. **Fix unnecessary await on sync methods** (Issue #4)
   - File: content.ts lines 785, 936
   - Impact: Low - Code correctness

8. **Add UTF-8 decoding error handling** (Scenario #2)
   - File: content.ts line 240
   - Impact: Low - Edge case

9. **Standardize logging patterns** (Issue #5)
   - Files: All routes
   - Impact: Low - Consistency

10. **Add optimistic locking** (Scenario #5)
    - File: content.ts PATCH endpoint
    - Impact: Low - Rare race condition

---

## 8. Recommended Global Improvements

### 1. Create Error Handling Guidelines Document

Create `docs/ERROR_HANDLING.md` with:
- When to use each ErrorCode
- How to log errors consistently
- What information is safe to expose
- Examples of good error handling patterns

### 2. Add Error Handling Tests

Create test files to verify:
- All routes return consistent error formats
- Sensitive information is not exposed
- Error codes match status codes correctly
- Error logging works correctly

Example test:
```typescript
describe('Error Response Format', () => {
  it('should return consistent error format from all endpoints', async () => {
    const response = await request(app)
      .get('/api/content/invalid-id')
      .expect(404);

    expect(response.body).toHaveProperty('error');
    expect(response.body).toHaveProperty('code');
    expect(response.body).toHaveProperty('message');
    expect(response.body).toHaveProperty('timestamp');
    expect(response.body).not.toHaveProperty('stack');
  });
});
```

### 3. Add ESLint Rule for Error Handling

Create a custom ESLint rule or use existing plugins to enforce:
- Always throw ApiError instances in route handlers
- Never call `reply.send()` with error objects directly
- Always log errors before throwing

### 4. Implement Error Monitoring

Integrate with error tracking services (Sentry, Rollbar, etc.) to:
- Track error frequency and patterns
- Alert on new error types
- Monitor error rates

---

## 9. Summary Statistics

| Metric | Count |
|--------|-------|
| Total Route Files Analyzed | 6 |
| Total Issues Found | 15 |
| Critical Severity | 2 |
| High Severity | 0 |
| Medium Severity | 7 |
| Low Severity | 6 |
| Routes Using ApiError Correctly | 4/6 (67%) |
| Routes With Inconsistent Logging | 6/6 (100%) |
| Routes With Security Concerns | 1/6 (17%) |
| Missing Error Scenarios | 6 |

---

## 10. Quick Win Checklist

Use this checklist to quickly improve error handling:

- [ ] Replace all `reply.code().send({error: ...})` with `throw ApiErrors.*()` in tags.ts
- [ ] Replace error response in stats.ts with `throw ApiErrors.internalError()`
- [ ] Remove `filePath` from error logs in content.ts line 228, 299
- [ ] Conditionally log IDs in bulk operations (content.ts lines 773, 924)
- [ ] Add timeout handling wrapper for vector store operations
- [ ] Add disk space error detection in capture.ts
- [ ] Fix malformed metadata to throw validation error instead of silent fail
- [ ] Remove unnecessary `await` on `db.getContentById()` calls
- [ ] Add UTF-8 decoding try-catch in content.ts line 240
- [ ] Document file size validation in capture.ts

---

## Appendix A: Error Code Usage Matrix

| ErrorCode | Used In Routes | Appropriate For |
|-----------|---------------|-----------------|
| UNAUTHORIZED | ❌ Not used | Authentication failures |
| FORBIDDEN | ❌ Not used | Authorization failures |
| VALIDATION_ERROR | ✅ capture.ts, content.ts, search.ts | Input validation failures |
| NOT_FOUND | ✅ content.ts | Resource not found |
| STORAGE_ERROR | ✅ capture.ts, content.ts | File operation failures |
| INTERNAL_ERROR | ✅ search.ts | Generic server errors |
| SERVICE_UNAVAILABLE | ✅ search.ts | External service failures |
| DATABASE_ERROR | ✅ search.ts | Database operation failures |

**Recommendation:** The UNAUTHORIZED and FORBIDDEN codes are defined but never used. Consider using them in the auth middleware or remove them if not needed.

---

## Appendix B: Routes Ranked by Error Handling Quality

| Rank | Route | Quality Score | Notes |
|------|-------|---------------|-------|
| 1 | search.ts | 9/10 | Excellent error handling with specific error type detection |
| 2 | capture.ts | 8/10 | Good overall, minor issues with metadata parsing |
| 3 | content.ts | 7/10 | Good patterns but has security concerns with logging |
| 4 | health.ts | 7/10 | Simple and effective, appropriate for health checks |
| 5 | tags.ts | 3/10 | Does not use ApiError class at all |
| 6 | stats.ts | 3/10 | Does not use ApiError class at all |

---

**End of Report**
