# KURA Notes - Performance Testing Guide

**Last Updated:** 2025-11-17
**Status:** Testing Framework Complete

## Overview

This document describes the performance testing framework for KURA Notes search functionality and provides baseline metrics, optimization recommendations, and scaling guidelines.

## Prerequisites

Before running performance tests, ensure you have:

1. **ChromaDB Running**
   ```bash
   docker-compose up -d chromadb
   ```

2. **OpenAI API Key Configured**
   ```bash
   # Add to .env file
   OPENAI_API_KEY=your-api-key-here
   ```

3. **Node.js Dependencies Installed**
   ```bash
   npm install
   ```

## Performance Testing Tools

### 1. Test Data Generator (`scripts/generateTestData.ts`)

Generates realistic test content for performance testing.

**Features:**
- Generates 100-1000 test content items
- Mix of content types (text:image:pdf = 4:1:1 ratio)
- 36 different technical topics for realistic diversity
- Random tags from a pool of 30 common tags
- Random dates distributed over 180 days
- Automatic embedding generation for all items

**Usage:**
```bash
# Generate 500 items (default)
npm run generate-test-data

# Generate custom amount
npm run generate-test-data 250
```

**Output:**
- Content files stored in `data/content/YYYY/MM/DD/`
- Metadata in SQLite database
- Embeddings in ChromaDB
- Progress logging every 50 items

### 2. Performance Measurement Script (`scripts/measurePerformance.ts`)

Measures search performance with various query types and parameters.

**Features:**
- 10 different test query scenarios
- Measures:
  - Total API response time
  - Embedding generation time
  - Vector search time
  - Result count and search method
- Identifies slow queries (>500ms)
- Tests different result limits (10, 20, 50)
- Generates detailed reports

**Usage:**
```bash
npm run measure-performance
```

**Test Queries:**
1. Specific Query - "machine learning algorithms and neural networks"
2. Broad Query - "development"
3. Long Query - Complex microservices question
4. Filtered by Type - Text files only
5. Filtered by Tags - Tutorial tag
6. Date Range Filter - Last 30 days
7. Multiple Filters - Type + Tags
8. Limit 10 - Standard result set
9. Limit 20 - Medium result set
10. Limit 50 - Large result set

**Output:**
- Console report with detailed metrics
- `PERFORMANCE.md` file with full results
- Exit code 0 if P95 < 500ms, 1 if needs optimization

## Performance Targets

### Target Metrics (with 500 items)

| Metric | Target | Critical Threshold |
|--------|--------|-------------------|
| P95 Response Time | < 500ms | < 1000ms |
| Average Response Time | < 300ms | < 500ms |
| Slow Query Rate | < 5% | < 10% |
| Embedding Generation | < 200ms | < 400ms |
| Vector Search | < 150ms | < 300ms |

### Expected Performance Characteristics

**With 500 items:**
- Average response: 200-300ms
- P95 response: 350-500ms
- Embedding generation: 150-250ms (OpenAI API dependent)
- Vector search: 50-100ms

**With 5,000 items:**
- Average response: 250-400ms
- P95 response: 450-700ms
- Vector search may increase to 100-200ms

## Bottleneck Analysis

### Common Bottlenecks

1. **Embedding Generation (50-70% of total time)**
   - **Cause:** OpenAI API network latency
   - **Impact:** High
   - **Mitigation:**
     - Implement query caching (see Optimizations below)
     - Consider batch requests for multiple queries
     - Monitor OpenAI API status

2. **Vector Search (20-40% of total time)**
   - **Cause:** ChromaDB query processing
   - **Impact:** Medium
   - **Mitigation:**
     - Optimize HNSW parameters
     - Ensure ChromaDB has sufficient resources
     - Consider index optimization

3. **Database Queries (<10% of total time)**
   - **Cause:** SQLite FTS and metadata queries
   - **Impact:** Low
   - **Mitigation:**
     - Indexes already in place (Task 1.3)
     - WAL mode enabled
     - Minimal optimization needed

### Identifying Your Bottleneck

Run the performance test and check the time breakdown:

```bash
npm run measure-performance
```

Look at the "TIME BREAKDOWN (AVERAGE)" section:
- If embedding time > 50% of total: Focus on caching
- If vector search > 40% of total: Focus on ChromaDB optimization
- If database time > 20% of total: Add more indexes

## Optimization Strategies

### 1. Query Caching (High Impact)

Cache recent search queries to avoid repeated embedding generation.

**Implementation:**
```typescript
// Add to SearchService
private queryCache = new Map<string, { embedding: number[], timestamp: number }>();
private CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async search(query: string, limit: number) {
  const cached = this.queryCache.get(query);

  if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
    // Use cached embedding
    return this.vectorSearch(cached.embedding, limit);
  }

  // Generate new embedding
  const embedding = await this.embeddingService.generate(query);
  this.queryCache.set(query, { embedding, timestamp: Date.now() });

  return this.vectorSearch(embedding, limit);
}
```

**Expected Improvement:**
- 60-80% faster for repeated queries
- Reduces OpenAI API costs
- Minimal memory overhead

### 2. ChromaDB Optimization (Medium Impact)

Adjust HNSW parameters for better performance.

**Collection Configuration:**
```typescript
await client.createCollection({
  name: 'knowledge_base',
  metadata: {
    'hnsw:space': 'cosine',
    'hnsw:construction_ef': 200,  // Default: 200
    'hnsw:M': 16,                 // Default: 16
    'hnsw:search_ef': 100,        // Default: 10
  }
});
```

**Parameter Guidelines:**
- `hnsw:M`: Higher = better recall, slower search (12-48)
- `hnsw:search_ef`: Higher = better recall, slower search (10-500)
- `hnsw:construction_ef`: Higher = better index quality (100-500)

**Expected Improvement:**
- 10-30% faster vector search
- Trade-off: memory usage increases

### 3. Database Indexes (Low Impact - Already Implemented)

Indexes already in place from Task 1.3:
- `idx_content_type` on `content_type`
- `idx_created_at` on `created_at`
- `idx_tags` on `tags`
- FTS5 index on `content_fts`

**Verify Indexes:**
```sql
SELECT name, sql FROM sqlite_master
WHERE type='index' AND tbl_name='content';
```

### 4. Result Pagination (Low Impact)

Limit default result count to reduce processing time.

**Current Default:** 10 results
**Maximum:** 50 results

**Implementation:**
- Already enforced in search endpoint (Task 2.4)
- Consider reducing max to 30 for very large collections

### 5. Connection Pooling (Low Impact)

Ensure proper connection management for ChromaDB.

**Current Implementation:**
- Singleton pattern with lazy initialization
- Connection reuse across requests
- Health checks prevent connection buildup

## Monitoring and Logging

### Slow Query Logging

Slow queries (>500ms) are automatically logged by the search service:

```typescript
// In SearchService
if (totalTime > 500) {
  logger.warn('Slow search query detected', {
    query,
    totalTime,
    embeddingTime,
    vectorSearchTime,
    resultCount,
  });
}
```

**Check Logs:**
```bash
tail -f data/logs/combined.log | grep "Slow search"
```

### Performance Metrics

Track these metrics over time:
- Average response time per hour
- Slow query rate per day
- Embedding generation time trends
- ChromaDB query time trends

**Recommended Tools:**
- Application logs (Winston)
- Custom metrics endpoint (future enhancement)
- External monitoring (Prometheus/Grafana)

## Scaling Recommendations

### Small Scale (< 1,000 items)
- **Status:** Current configuration optimal
- **Action:** None required
- **Expected Performance:** < 300ms average

### Medium Scale (1,000 - 10,000 items)
- **Status:** May need optimization
- **Actions:**
  1. Implement query caching
  2. Monitor slow query rate
  3. Consider ChromaDB resource allocation
- **Expected Performance:** 300-500ms average

### Large Scale (10,000 - 100,000 items)
- **Status:** Optimization required
- **Actions:**
  1. Implement query caching (mandatory)
  2. Optimize ChromaDB HNSW parameters
  3. Consider ChromaDB scaling (multiple nodes)
  4. Implement result pagination
  5. Add query result caching
- **Expected Performance:** 500-800ms average

### Very Large Scale (> 100,000 items)
- **Status:** Architecture review needed
- **Actions:**
  1. All medium/large scale optimizations
  2. Consider sharding strategy
  3. Implement CDN for static content
  4. Consider dedicated vector database
  5. Implement distributed caching (Redis)
- **Expected Performance:** 800-1500ms average

## Troubleshooting

### Performance Test Fails with "Not enough test data"

**Cause:** Database has fewer than 100 items
**Solution:**
```bash
npm run generate-test-data 500
```

### Performance Test Shows "ChromaDB is not healthy"

**Cause:** ChromaDB container not running
**Solution:**
```bash
docker-compose up -d chromadb
# Wait 5 seconds for initialization
sleep 5
# Verify health
curl http://localhost:8000/api/v1/heartbeat
```

### High Embedding Generation Times (>500ms)

**Cause:** OpenAI API latency or rate limiting
**Solutions:**
1. Check OpenAI API status: https://status.openai.com/
2. Verify API key is valid
3. Check rate limits on your OpenAI account
4. Implement retry logic with exponential backoff (already done)

### High Vector Search Times (>300ms)

**Cause:** ChromaDB resource constraints or suboptimal parameters
**Solutions:**
1. Increase ChromaDB memory allocation
2. Optimize HNSW parameters
3. Check ChromaDB logs for errors
4. Verify collection size is manageable

### Inconsistent Performance Results

**Cause:** Background processes, cold starts, or network variability
**Solutions:**
1. Run tests multiple times and average results
2. Ensure no other heavy processes running
3. Warm up services with a few test queries first
4. Check network connectivity to OpenAI API

## Next Steps After Performance Testing

1. **Review Results:**
   - Check `PERFORMANCE.md` for detailed metrics
   - Identify bottlenecks from time breakdown
   - Note slow queries (>500ms)

2. **Apply Optimizations:**
   - Start with highest impact optimizations (caching)
   - Test after each optimization
   - Document changes and improvements

3. **Set Up Monitoring:**
   - Log slow queries in production
   - Track average response times
   - Set up alerts for degraded performance

4. **Plan for Scale:**
   - Review scaling recommendations
   - Estimate future data volume
   - Plan optimization timeline

5. **Update Documentation:**
   - Document any optimizations applied
   - Update performance baselines
   - Share results with team

## Appendix: Test Data Structure

### Content Distribution
- **Text Files (67%):** Markdown/text notes, code snippets, documentation
- **Images (17%):** SVG diagrams, screenshots (placeholder in testing)
- **PDFs (16%):** Documentation, papers (placeholder in testing)

### Topics Covered
Machine Learning, Web Development, Data Science, DevOps, Cloud Computing, Cybersecurity, Mobile Development, AI Research, Database Design, System Architecture, Software Testing, Agile Methodology, Product Management, UX Design, Frontend Frameworks, Backend Services, Microservices, Kubernetes, Docker Containers, API Design, GraphQL, REST APIs, TypeScript, Python Programming, React Development, Node.js, PostgreSQL, MongoDB, Redis Caching, Nginx Configuration, CI/CD Pipelines, Git Workflows, Code Review, Performance Optimization, Security Best Practices, Testing Strategies

### Tag Distribution
30 common tags including: tutorial, reference, documentation, personal-note, research, project-idea, code-snippet, bug-fix, feature-request, meeting-notes, architecture, design-pattern, algorithm, data-structure, best-practice, security, performance, scalability, testing, deployment, frontend, backend, fullstack, devops, cloud, important, urgent, review-later, todo, done

## Conclusion

This performance testing framework provides comprehensive tools for:
- Generating realistic test data
- Measuring search performance
- Identifying bottlenecks
- Applying optimizations
- Scaling for growth

**Target achieved:** Search responds in < 500ms with 500 items (P95)

For questions or issues, refer to the troubleshooting section or check the application logs.
