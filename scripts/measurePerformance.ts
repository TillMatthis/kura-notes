#!/usr/bin/env tsx
/**
 * KURA Notes - Performance Measurement Script
 *
 * Measures search performance with different query types and parameters
 * Usage: npm run measure-performance
 */

import { config } from '../src/config/config.js';
import { DatabaseService } from '../src/services/database/database.service.js';
import { EmbeddingService } from '../src/services/embeddingService.js';
import { VectorStoreService } from '../src/services/vectorStore.js';
import { SearchService } from '../src/services/searchService.js';
import { logger } from '../src/utils/logger.js';
import type { SearchFilters } from '../src/models/content.js';

// =========================================================================
// Performance Test Queries
// =========================================================================

interface TestQuery {
  name: string;
  query: string;
  filters?: SearchFilters;
  limit?: number;
  description: string;
}

const TEST_QUERIES: TestQuery[] = [
  {
    name: 'Specific Query',
    query: 'machine learning algorithms and neural networks',
    description: 'Specific technical query with multiple terms',
  },
  {
    name: 'Broad Query',
    query: 'development',
    description: 'Broad single-word query',
  },
  {
    name: 'Long Query',
    query: 'how to implement a production-ready microservices architecture with kubernetes and docker containers including ci/cd pipelines and monitoring',
    description: 'Long, detailed query',
  },
  {
    name: 'Filtered by Type',
    query: 'API design best practices',
    filters: { contentTypes: ['text'] },
    description: 'Query with content type filter',
  },
  {
    name: 'Filtered by Tags',
    query: 'testing',
    filters: { tags: ['tutorial'] },
    description: 'Query with tag filter',
  },
  {
    name: 'Date Range Filter',
    query: 'programming',
    filters: {
      dateFrom: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      dateTo: new Date().toISOString().split('T')[0],
    },
    description: 'Query with date range filter (last 30 days)',
  },
  {
    name: 'Multiple Filters',
    query: 'software development',
    filters: {
      contentTypes: ['text'],
      tags: ['tutorial'],
    },
    description: 'Query with multiple filters',
  },
  {
    name: 'Limit 10',
    query: 'database optimization',
    limit: 10,
    description: 'Query with limit 10 results',
  },
  {
    name: 'Limit 20',
    query: 'database optimization',
    limit: 20,
    description: 'Query with limit 20 results',
  },
  {
    name: 'Limit 50',
    query: 'database optimization',
    limit: 50,
    description: 'Query with limit 50 results',
  },
];

// =========================================================================
// Performance Measurement Types
// =========================================================================

interface PerformanceMetrics {
  queryName: string;
  totalTime: number;
  embeddingTime: number;
  vectorSearchTime: number;
  databaseTime: number;
  resultCount: number;
  searchMethod: 'vector' | 'fts' | 'combined';
  isSlow: boolean;
}

interface PerformanceSummary {
  totalQueries: number;
  slowQueries: number;
  averageResponseTime: number;
  medianResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  fastestQuery: number;
  slowestQuery: number;
  averageEmbeddingTime: number;
  averageVectorSearchTime: number;
  averageDatabaseTime: number;
}

// =========================================================================
// Performance Measurement Functions
// =========================================================================

async function measureQuery(
  searchService: SearchService,
  embeddingService: EmbeddingService,
  testQuery: TestQuery
): Promise<PerformanceMetrics> {
  const startTime = performance.now();

  // Measure embedding generation
  const embeddingStartTime = performance.now();
  const embedding = await embeddingService.generateEmbedding(testQuery.query);
  const embeddingTime = performance.now() - embeddingStartTime;

  // Measure vector search
  const vectorSearchStartTime = performance.now();
  const results = await searchService.search(
    testQuery.query,
    testQuery.limit || 10,
    testQuery.filters,
    true // enableFallback
  );
  const vectorSearchTime = performance.now() - vectorSearchStartTime;

  // Database time is part of vector search time, so we'll estimate it
  // In a real scenario, we'd instrument the search service to provide these metrics
  const databaseTime = 0; // Would need instrumentation to measure accurately

  const totalTime = performance.now() - startTime;

  return {
    queryName: testQuery.name,
    totalTime,
    embeddingTime,
    vectorSearchTime: vectorSearchTime - embeddingTime,
    databaseTime,
    resultCount: results.results.length,
    searchMethod: results.searchMethod,
    isSlow: totalTime > 500,
  };
}

function calculateSummary(metrics: PerformanceMetrics[]): PerformanceSummary {
  const responseTimes = metrics.map((m) => m.totalTime).sort((a, b) => a - b);
  const slowQueries = metrics.filter((m) => m.isSlow).length;

  const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
  const avg = (arr: number[]) => sum(arr) / arr.length;
  const percentile = (arr: number[], p: number) => {
    const index = Math.ceil((p / 100) * arr.length) - 1;
    return arr[index] || 0;
  };

  return {
    totalQueries: metrics.length,
    slowQueries,
    averageResponseTime: avg(responseTimes),
    medianResponseTime: percentile(responseTimes, 50),
    p95ResponseTime: percentile(responseTimes, 95),
    p99ResponseTime: percentile(responseTimes, 99),
    fastestQuery: responseTimes[0] || 0,
    slowestQuery: responseTimes[responseTimes.length - 1] || 0,
    averageEmbeddingTime: avg(metrics.map((m) => m.embeddingTime)),
    averageVectorSearchTime: avg(metrics.map((m) => m.vectorSearchTime)),
    averageDatabaseTime: avg(metrics.map((m) => m.databaseTime)),
  };
}

function formatTime(ms: number): string {
  return `${ms.toFixed(2)}ms`;
}

function formatPercentage(value: number, total: number): string {
  return `${((value / total) * 100).toFixed(1)}%`;
}

// =========================================================================
// Report Generation
// =========================================================================

function generateConsoleReport(metrics: PerformanceMetrics[], summary: PerformanceSummary): void {
  console.log('\n' + '='.repeat(80));
  console.log('📊 PERFORMANCE TEST RESULTS');
  console.log('='.repeat(80) + '\n');

  // Summary
  console.log('📈 SUMMARY');
  console.log('-'.repeat(80));
  console.log(`Total Queries:              ${summary.totalQueries}`);
  console.log(`Slow Queries (>500ms):      ${summary.slowQueries} (${formatPercentage(summary.slowQueries, summary.totalQueries)})`);
  console.log(`Average Response Time:      ${formatTime(summary.averageResponseTime)}`);
  console.log(`Median Response Time:       ${formatTime(summary.medianResponseTime)}`);
  console.log(`P95 Response Time:          ${formatTime(summary.p95ResponseTime)}`);
  console.log(`P99 Response Time:          ${formatTime(summary.p99ResponseTime)}`);
  console.log(`Fastest Query:              ${formatTime(summary.fastestQuery)}`);
  console.log(`Slowest Query:              ${formatTime(summary.slowestQuery)}`);
  console.log('');

  // Breakdown
  console.log('⏱️  TIME BREAKDOWN (AVERAGE)');
  console.log('-'.repeat(80));
  console.log(`Embedding Generation:       ${formatTime(summary.averageEmbeddingTime)}`);
  console.log(`Vector Search:              ${formatTime(summary.averageVectorSearchTime)}`);
  console.log(`Database Query:             ${formatTime(summary.averageDatabaseTime)}`);
  console.log('');

  // Individual queries
  console.log('📝 INDIVIDUAL QUERY RESULTS');
  console.log('-'.repeat(80));

  metrics.forEach((metric, index) => {
    const slowIndicator = metric.isSlow ? '🐢' : '⚡';
    console.log(`\n${index + 1}. ${slowIndicator} ${metric.queryName}`);
    console.log(`   Total Time:        ${formatTime(metric.totalTime)}`);
    console.log(`   Embedding Time:    ${formatTime(metric.embeddingTime)}`);
    console.log(`   Vector Search:     ${formatTime(metric.vectorSearchTime)}`);
    console.log(`   Results:           ${metric.resultCount}`);
    console.log(`   Search Method:     ${metric.searchMethod}`);
  });

  console.log('\n' + '='.repeat(80));
}

function generateMarkdownReport(
  metrics: PerformanceMetrics[],
  summary: PerformanceSummary,
  contentCount: number
): string {
  const date = new Date().toISOString().split('T')[0];

  let md = `# KURA Notes - Performance Test Results\n\n`;
  md += `**Date:** ${date}\n`;
  md += `**Content Items:** ${contentCount}\n`;
  md += `**Test Queries:** ${summary.totalQueries}\n\n`;

  md += `## Summary\n\n`;
  md += `| Metric | Value |\n`;
  md += `|--------|-------|\n`;
  md += `| Total Queries | ${summary.totalQueries} |\n`;
  md += `| Slow Queries (>500ms) | ${summary.slowQueries} (${formatPercentage(summary.slowQueries, summary.totalQueries)}) |\n`;
  md += `| Average Response Time | ${formatTime(summary.averageResponseTime)} |\n`;
  md += `| Median Response Time | ${formatTime(summary.medianResponseTime)} |\n`;
  md += `| P95 Response Time | ${formatTime(summary.p95ResponseTime)} |\n`;
  md += `| P99 Response Time | ${formatTime(summary.p99ResponseTime)} |\n`;
  md += `| Fastest Query | ${formatTime(summary.fastestQuery)} |\n`;
  md += `| Slowest Query | ${formatTime(summary.slowestQuery)} |\n\n`;

  md += `## Performance Assessment\n\n`;
  if (summary.p95ResponseTime < 500) {
    md += `✅ **PASS**: 95th percentile response time is under 500ms (${formatTime(summary.p95ResponseTime)})\n\n`;
  } else {
    md += `⚠️ **NEEDS OPTIMIZATION**: 95th percentile response time exceeds 500ms (${formatTime(summary.p95ResponseTime)})\n\n`;
  }

  md += `## Time Breakdown (Average)\n\n`;
  md += `| Component | Time |\n`;
  md += `|-----------|------|\n`;
  md += `| Embedding Generation | ${formatTime(summary.averageEmbeddingTime)} |\n`;
  md += `| Vector Search | ${formatTime(summary.averageVectorSearchTime)} |\n`;
  md += `| Database Query | ${formatTime(summary.averageDatabaseTime)} |\n\n`;

  md += `## Individual Query Results\n\n`;
  md += `| # | Query | Total Time | Embedding | Vector Search | Results | Method | Status |\n`;
  md += `|---|-------|------------|-----------|---------------|---------|--------|--------|\n`;

  metrics.forEach((metric, index) => {
    const status = metric.isSlow ? '🐢 Slow' : '⚡ Fast';
    md += `| ${index + 1} | ${metric.queryName} | ${formatTime(metric.totalTime)} | ${formatTime(metric.embeddingTime)} | ${formatTime(metric.vectorSearchTime)} | ${metric.resultCount} | ${metric.searchMethod} | ${status} |\n`;
  });

  md += `\n## Bottleneck Analysis\n\n`;

  const avgTotal = summary.averageResponseTime;
  const embeddingPercent = (summary.averageEmbeddingTime / avgTotal) * 100;
  const vectorPercent = (summary.averageVectorSearchTime / avgTotal) * 100;

  if (embeddingPercent > 50) {
    md += `- **Embedding Generation** is the primary bottleneck (${embeddingPercent.toFixed(1)}% of total time)\n`;
    md += `  - Consider caching frequent queries\n`;
    md += `  - Monitor OpenAI API latency\n\n`;
  }

  if (vectorPercent > 40) {
    md += `- **Vector Search** takes significant time (${vectorPercent.toFixed(1)}% of total time)\n`;
    md += `  - Consider ChromaDB optimization settings\n`;
    md += `  - Review collection size and index configuration\n\n`;
  }

  if (summary.slowQueries > 0) {
    md += `- **${summary.slowQueries} queries exceeded 500ms threshold**\n`;
    md += `  - Review slow queries for optimization opportunities\n`;
    md += `  - Consider adding database indexes\n\n`;
  }

  md += `## Recommendations\n\n`;

  if (summary.p95ResponseTime < 500) {
    md += `✅ Performance is within acceptable limits. Consider:\n`;
    md += `- Monitoring performance as data grows\n`;
    md += `- Setting up alerting for slow queries\n`;
    md += `- Regular performance testing\n\n`;
  } else {
    md += `⚠️ Performance needs optimization:\n`;
    if (embeddingPercent > 50) {
      md += `- Implement query caching for frequent searches\n`;
    }
    if (vectorPercent > 40) {
      md += `- Optimize ChromaDB settings (HNSW parameters)\n`;
    }
    md += `- Add database indexes on frequently filtered fields\n`;
    md += `- Consider result pagination to reduce load\n\n`;
  }

  md += `## Test Queries\n\n`;
  TEST_QUERIES.forEach((q, i) => {
    md += `${i + 1}. **${q.name}**: ${q.description}\n`;
  });

  return md;
}

// =========================================================================
// Main Function
// =========================================================================

async function main() {
  console.log('🚀 KURA Notes - Performance Measurement\n');

  try {
    // Initialize services
    console.log('⚙️  Initializing services...');
    const db = DatabaseService.getInstance(config.databaseUrl);
    const embeddingService = EmbeddingService.getInstance();
    const vectorStore = VectorStoreService.getInstance();
    const searchService = new SearchService(db, embeddingService, vectorStore);

    console.log('✅ Services initialized\n');

    // Check preconditions
    const stats = db.getStats();
    const chromaStats = await vectorStore.getStats();

    console.log('📊 Current Data:');
    console.log(`   Database: ${stats.totalItems} items`);
    console.log(`   ChromaDB: ${chromaStats.count} documents`);
    console.log(`   Embeddings: ${stats.embeddingsCompleted} completed, ${stats.embeddingsPending} pending\n`);

    if (stats.totalItems < 100) {
      console.error('❌ Not enough test data. Generate at least 100 items first:');
      console.error('   npm run generate-test-data 500\n');
      process.exit(1);
    }

    if (stats.embeddingsPending > stats.totalItems * 0.1) {
      console.warn('⚠️  Warning: More than 10% of embeddings are still pending.');
      console.warn('   Results may not be representative. Consider waiting for embeddings to complete.\n');
    }

    // Run performance tests
    console.log('🔬 Running performance tests...\n');
    const metrics: PerformanceMetrics[] = [];

    for (let i = 0; i < TEST_QUERIES.length; i++) {
      const testQuery = TEST_QUERIES[i];
      process.stdout.write(`   [${i + 1}/${TEST_QUERIES.length}] Testing: ${testQuery.name}...`);

      try {
        const metric = await measureQuery(searchService, embeddingService, testQuery);
        metrics.push(metric);
        const indicator = metric.isSlow ? '🐢' : '⚡';
        console.log(` ${indicator} ${formatTime(metric.totalTime)}`);
      } catch (error) {
        console.log(` ❌ FAILED`);
        console.error(`      Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    // Calculate summary
    const summary = calculateSummary(metrics);

    // Generate reports
    generateConsoleReport(metrics, summary);

    const markdownReport = generateMarkdownReport(metrics, summary, stats.totalItems);

    // Write to file
    const reportPath = './PERFORMANCE.md';
    const fs = await import('fs');
    fs.writeFileSync(reportPath, markdownReport);

    console.log(`\n💾 Full report saved to: ${reportPath}\n`);

    // Exit with appropriate code
    if (summary.p95ResponseTime > 500) {
      console.log('⚠️  Performance targets not met. Review PERFORMANCE.md for optimization recommendations.\n');
      process.exit(1);
    } else {
      console.log('✅ All performance targets met!\n');
      process.exit(0);
    }

  } catch (error) {
    console.error('\n❌ Error during performance measurement:', error);
    process.exit(1);
  }
}

// Run main function
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
