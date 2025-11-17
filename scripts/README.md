# KURA Notes - Performance Testing Scripts

This directory contains scripts for performance testing and test data generation.

## Scripts

### 1. `generateTestData.ts`

Generates realistic test content for performance testing.

**Usage:**
```bash
# Generate 500 items (default)
npm run generate-test-data

# Generate custom amount (1-1000)
npm run generate-test-data 250
```

**What it does:**
- Creates content items with realistic titles and text
- Generates files in `data/content/YYYY/MM/DD/` structure
- Creates database entries in SQLite
- Automatically generates embeddings for all items
- Provides progress updates every 50 items
- Verifies data in both SQLite and ChromaDB

**Content Generation:**
- **Text files (67%):** Various formats including guides, notes, meeting notes, research, code snippets
- **Images (17%):** SVG placeholders (OCR not implemented in MVP)
- **PDFs (16%):** Minimal PDF placeholders (extraction not implemented in MVP)
- **Topics:** 36 technical topics covering ML, web dev, DevOps, cloud, security, etc.
- **Tags:** Random selection from pool of 30 common tags
- **Dates:** Randomly distributed over last 180 days

**Prerequisites:**
- ChromaDB running: `docker-compose up -d chromadb`
- OpenAI API key configured in `.env`
- Sufficient disk space (500 items ≈ 10-20 MB)

**Output:**
```
🚀 KURA Notes - Test Data Generator

📊 Generating 500 test content items...

⚙️  Initializing services...
✅ Services initialized

✅ ChromaDB connection verified

📝 Generating content items...

Generated 50/500 content items
Generated 100/500 content items
...
Generated 500/500 content items

✅ Successfully generated 500 test content items in 127.45s
   Average: 0.255s per item

⏳ Waiting 5 seconds for embeddings to process...

📊 Verification:
   Total items in database: 500
   By type:
     - text: 335
     - image: 85
     - pdf: 80
   Embedding statuses:
     - Pending: 12
     - Completed: 488
     - Failed: 0

   ChromaDB documents: 488

⚠️  Note: Some embeddings are still processing. Wait a bit longer for all to complete.

✅ Test data generation complete!

💡 Next steps:
   1. Run performance tests: npm run measure-performance
   2. Check the web interface: http://localhost:3000
   3. Try searching for topics like "Machine Learning" or "API Design"
```

---

### 2. `measurePerformance.ts`

Measures search performance with various query types and generates detailed reports.

**Usage:**
```bash
npm run measure-performance
```

**What it does:**
- Runs 10 different test query scenarios
- Measures timing for each component:
  - Embedding generation time
  - Vector search time
  - Database query time
  - Total response time
- Identifies slow queries (>500ms)
- Calculates statistical metrics (average, median, P95, P99)
- Generates console report and markdown file
- Exits with code 0 if passing, 1 if needs optimization

**Test Queries:**
1. **Specific Query:** "machine learning algorithms and neural networks"
2. **Broad Query:** "development"
3. **Long Query:** Detailed microservices architecture question
4. **Filtered by Type:** Text files only
5. **Filtered by Tags:** Tutorial tag
6. **Date Range Filter:** Last 30 days
7. **Multiple Filters:** Type + Tags combined
8. **Limit 10:** Standard result set
9. **Limit 20:** Medium result set
10. **Limit 50:** Large result set

**Prerequisites:**
- At least 100 items in database (run `generateTestData.ts` first)
- ChromaDB running and healthy
- OpenAI API key configured
- < 10% embeddings pending (for accurate results)

**Output:**
```
🚀 KURA Notes - Performance Measurement

⚙️  Initializing services...
✅ Services initialized

📊 Current Data:
   Database: 500 items
   ChromaDB: 488 documents
   Embeddings: 488 completed, 12 pending

🔬 Running performance tests...

   [1/10] Testing: Specific Query... ⚡ 245.67ms
   [2/10] Testing: Broad Query... ⚡ 198.34ms
   [3/10] Testing: Long Query... ⚡ 312.45ms
   [4/10] Testing: Filtered by Type... ⚡ 267.89ms
   [5/10] Testing: Filtered by Tags... ⚡ 289.12ms
   [6/10] Testing: Date Range Filter... ⚡ 301.56ms
   [7/10] Testing: Multiple Filters... ⚡ 334.78ms
   [8/10] Testing: Limit 10... ⚡ 256.90ms
   [9/10] Testing: Limit 20... ⚡ 298.45ms
   [10/10] Testing: Limit 50... 🐢 524.67ms

================================================================================
📊 PERFORMANCE TEST RESULTS
================================================================================

📈 SUMMARY
--------------------------------------------------------------------------------
Total Queries:              10
Slow Queries (>500ms):      1 (10.0%)
Average Response Time:      302.98ms
Median Response Time:       295.17ms
P95 Response Time:          512.45ms
P99 Response Time:          524.67ms
Fastest Query:              198.34ms
Slowest Query:              524.67ms

⏱️  TIME BREAKDOWN (AVERAGE)
--------------------------------------------------------------------------------
Embedding Generation:       187.45ms
Vector Search:              98.67ms
Database Query:             0.00ms

📝 INDIVIDUAL QUERY RESULTS
--------------------------------------------------------------------------------
[detailed results for each query...]

================================================================================

💾 Full report saved to: ./PERFORMANCE.md

✅ All performance targets met!
```

**Report Contents:**
- Summary metrics table
- Performance assessment (pass/fail)
- Time breakdown by component
- Individual query results
- Bottleneck analysis
- Optimization recommendations
- Test query descriptions

---

## Performance Targets

With 500 items in the database:

| Metric | Target | Status |
|--------|--------|--------|
| P95 Response Time | < 500ms | 🎯 Target |
| Average Response Time | < 300ms | 🎯 Target |
| Slow Query Rate | < 5% | 🎯 Target |

## Workflow

1. **Generate Test Data:**
   ```bash
   npm run generate-test-data 500
   ```

2. **Wait for Embeddings:**
   Check that embeddings are processing (automatic, runs in background)
   ```bash
   # Check logs
   tail -f data/logs/combined.log | grep "Embedding"
   ```

3. **Run Performance Tests:**
   ```bash
   npm run measure-performance
   ```

4. **Review Results:**
   ```bash
   cat PERFORMANCE.md
   ```

5. **Apply Optimizations** (if needed):
   - See `PERFORMANCE.md` for recommendations
   - Implement caching, adjust ChromaDB settings, etc.

6. **Re-test:**
   ```bash
   npm run measure-performance
   ```

## Troubleshooting

### "ChromaDB is not healthy"
```bash
# Start ChromaDB
docker-compose up -d chromadb

# Wait for initialization
sleep 5

# Verify
curl http://localhost:8000/api/v1/heartbeat
```

### "OPENAI_API_KEY is not set"
```bash
# Add to .env file
echo "OPENAI_API_KEY=sk-your-key-here" >> .env
```

### "Not enough test data"
```bash
# Generate more data
npm run generate-test-data 500
```

### Slow embedding generation
- Check OpenAI API status: https://status.openai.com/
- Verify your rate limits
- Consider query caching (see PERFORMANCE.md)

### Inconsistent results
- Run tests multiple times and average
- Ensure no other heavy processes running
- Wait for all embeddings to complete (check pending count)

## Advanced Usage

### Custom Test Data Generation

Edit `generateTestData.ts` to customize:
- Content type ratios
- Topic distribution
- Tag pools
- Date ranges
- Text templates

### Custom Performance Tests

Edit `measurePerformance.ts` to add:
- Additional test queries
- Different filter combinations
- Custom metrics
- Alternative reporting formats

### Automated Testing

Integrate into CI/CD:
```bash
# In your CI pipeline
npm run generate-test-data 100
npm run measure-performance
# Exit code 0 = pass, 1 = fail
```

## File Locations

- **Test Data:** `data/content/YYYY/MM/DD/*.{txt,svg,pdf}`
- **Database:** `data/metadata/knowledge.db`
- **Logs:** `data/logs/combined.log`, `data/logs/error.log`
- **Report:** `PERFORMANCE.md` (root directory)

## Notes

- Test data is **not cleaned up automatically** - delete manually if needed
- Embeddings process asynchronously - allow 5-10 seconds after generation
- ChromaDB data persists in Docker volume `chroma-data`
- Performance results vary based on:
  - OpenAI API latency (varies by region/time)
  - Available system resources
  - ChromaDB warm-up state
  - Network conditions

## Related Documentation

- Main performance guide: `../PERFORMANCE.md`
- Database schema: `../src/services/database/schema.sql`
- Search service: `../src/services/searchService.ts`
- Embedding pipeline: `../src/services/embeddingPipeline.ts`

## Support

For issues or questions:
1. Check `PERFORMANCE.md` troubleshooting section
2. Review application logs in `data/logs/`
3. Open an issue on GitHub
