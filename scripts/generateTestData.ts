#!/usr/bin/env tsx
/**
 * KURA Notes - Test Data Generator
 *
 * Generates test content items for performance testing
 * Usage: npm run generate-test-data [count]
 */

import { config } from '../src/config/config.js';
import { DatabaseService } from '../src/services/database/database.service.js';
import { EmbeddingPipelineService } from '../src/services/embeddingPipeline.js';
import { EmbeddingService } from '../src/services/embeddingService.js';
import { VectorStoreService } from '../src/services/vectorStore.js';
import { logger } from '../src/utils/logger.js';
import { v4 as uuidv4 } from 'uuid';
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import type { ContentType, ContentSource } from '../src/models/content.js';

// =========================================================================
// Test Data Templates
// =========================================================================

const TOPICS = [
  'Machine Learning', 'Web Development', 'Data Science', 'DevOps',
  'Cloud Computing', 'Cybersecurity', 'Mobile Development', 'AI Research',
  'Database Design', 'System Architecture', 'Software Testing', 'Agile Methodology',
  'Product Management', 'UX Design', 'Frontend Frameworks', 'Backend Services',
  'Microservices', 'Kubernetes', 'Docker Containers', 'API Design',
  'GraphQL', 'REST APIs', 'TypeScript', 'Python Programming',
  'React Development', 'Node.js', 'PostgreSQL', 'MongoDB',
  'Redis Caching', 'Nginx Configuration', 'CI/CD Pipelines', 'Git Workflows',
  'Code Review', 'Performance Optimization', 'Security Best Practices', 'Testing Strategies'
];

const TAG_POOL = [
  'tutorial', 'reference', 'documentation', 'personal-note', 'research',
  'project-idea', 'code-snippet', 'bug-fix', 'feature-request', 'meeting-notes',
  'architecture', 'design-pattern', 'algorithm', 'data-structure', 'best-practice',
  'security', 'performance', 'scalability', 'testing', 'deployment',
  'frontend', 'backend', 'fullstack', 'devops', 'cloud',
  'important', 'urgent', 'review-later', 'todo', 'done'
];

const TEXT_TEMPLATES = [
  (topic: string) => `# ${topic} Overview\n\nThis is a comprehensive guide to ${topic}. It covers the fundamental concepts, best practices, and common pitfalls to avoid.\n\n## Key Concepts\n\n1. Understanding the basics\n2. Advanced techniques\n3. Real-world applications\n\n## Implementation Details\n\nWhen working with ${topic}, it's important to consider performance, scalability, and maintainability. Here are some tips:\n\n- Start with a solid foundation\n- Test thoroughly\n- Document your work\n- Review regularly\n\n## Common Mistakes\n\nAvoid these common pitfalls when dealing with ${topic}:\n- Overcomplicating solutions\n- Ignoring edge cases\n- Skipping documentation\n\n## Conclusion\n\n${topic} is an essential skill for modern development. Practice regularly and stay updated with the latest trends.`,

  (topic: string) => `Quick note on ${topic}:\n\nJust learned about an interesting approach to handling ${topic}. The key is to break down the problem into smaller, manageable pieces.\n\nMain takeaways:\n- Keep it simple\n- Focus on one thing at a time\n- Test incrementally\n\nNeed to research more about advanced ${topic} patterns.`,

  (topic: string) => `## ${topic} Meeting Notes\n\nDate: ${new Date().toISOString().split('T')[0]}\n\nDiscussed implementation strategy for ${topic}. Team agreed on the following approach:\n\n1. Research phase (1 week)\n2. Proof of concept (2 weeks)\n3. Implementation (4 weeks)\n4. Testing & review (1 week)\n\nAction items:\n- [ ] Review existing solutions\n- [ ] Create technical design doc\n- [ ] Set up development environment\n- [ ] Schedule follow-up meeting\n\nNext meeting: In 2 weeks`,

  (topic: string) => `# Research: ${topic}\n\n## Background\n\n${topic} has been gaining popularity in recent years. This research note explores its applications and potential impact.\n\n## Current State\n\nThe industry is moving towards better ${topic} practices. Key trends include:\n- Automation\n- Integration with existing tools\n- Focus on developer experience\n\n## Future Directions\n\nExpect to see more innovation in:\n1. Tool ecosystem\n2. Community resources\n3. Enterprise adoption\n\n## References\n\n- Article: "Advanced ${topic} Techniques"\n- Documentation: Official ${topic} Guide\n- Course: "Mastering ${topic}"`,

  (topic: string) => `Code snippet for ${topic}:\n\n\`\`\`typescript\nfunction process${topic.replace(/\s+/g, '')}(data: any) {\n  // Implementation goes here\n  const result = transform(data);\n  return validate(result);\n}\n\nfunction transform(data: any) {\n  return data.map(item => ({ ...item, processed: true }));\n}\n\nfunction validate(data: any) {\n  return data.filter(item => item.valid);\n}\n\nexport { process${topic.replace(/\s+/g, '')} };\n\`\`\`\n\nUsage notes:\n- Handles edge cases\n- Includes error handling\n- Fully typed for TypeScript`,
];

const ANNOTATION_TEMPLATES = [
  (topic: string) => `Personal notes on ${topic} from today's reading`,
  (topic: string) => `Important reference material for ${topic} project`,
  (topic: string) => `Shared by colleague - review before next sprint`,
  (topic: string) => `Conference talk notes: "${topic} in Production"`,
  (topic: string) => `Documentation for internal ${topic} implementation`,
  (topic: string) => `Quick reference guide for ${topic}`,
  (topic: string) => `Research findings on ${topic} performance`,
  (topic: string) => `Team discussion summary about ${topic}`,
];

// =========================================================================
// Helper Functions
// =========================================================================

function randomElement<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

function randomElements<T>(array: T[], count: number): T[] {
  const shuffled = [...array].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function randomDate(daysBack: number): Date {
  const now = new Date();
  const randomDays = Math.floor(Math.random() * daysBack);
  const date = new Date(now);
  date.setDate(date.getDate() - randomDays);
  return date;
}

function generateText(topic: string): string {
  const template = randomElement(TEXT_TEMPLATES);
  return template(topic);
}

function generateAnnotation(topic: string): string {
  const template = randomElement(ANNOTATION_TEMPLATES);
  return template(topic);
}

function generateTags(topic: string): string[] {
  const count = Math.floor(Math.random() * 5) + 1; // 1-5 tags
  const tags = randomElements(TAG_POOL, count);

  // Add topic as a tag sometimes
  if (Math.random() > 0.5) {
    tags.push(topic.toLowerCase().replace(/\s+/g, '-'));
  }

  return tags;
}

function generateTitle(topic: string, contentType: ContentType): string {
  const prefixes = ['Notes on', 'Guide to', 'Understanding', 'Introduction to', 'Deep Dive into', 'Quick Reference:'];
  const prefix = randomElement(prefixes);

  if (contentType === 'image') {
    return `${topic} Diagram`;
  } else if (contentType === 'pdf') {
    return `${topic} Documentation`;
  }

  return `${prefix} ${topic}`;
}

// =========================================================================
// Content Generation Functions
// =========================================================================

function createDummyImage(filePath: string): void {
  // Create a simple SVG image as placeholder
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">
    <rect width="800" height="600" fill="#f0f0f0"/>
    <text x="400" y="300" font-family="Arial" font-size="24" text-anchor="middle" fill="#333">
      Test Image
    </text>
  </svg>`;

  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(filePath, svg);
}

function createDummyPdf(filePath: string): void {
  // Create a minimal PDF structure (simplified)
  const pdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> /MediaBox [0 0 612 792] /Contents 4 0 R >>
endobj
4 0 obj
<< /Length 44 >>
stream
BT
/F1 24 Tf
100 700 Td
(Test PDF) Tj
ET
endstream
endobj
xref
0 5
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000314 00000 n
trailer
<< /Size 5 /Root 1 0 R >>
startxref
407
%%EOF`;

  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(filePath, pdf);
}

async function generateContentItem(
  db: DatabaseService,
  pipeline: EmbeddingPipelineService,
  index: number,
  total: number
): Promise<void> {
  const topic = randomElement(TOPICS);
  const contentTypes: ContentType[] = ['text', 'text', 'text', 'text', 'image', 'pdf']; // 4:1:1 ratio
  const contentType = randomElement(contentTypes);
  const sources: ContentSource[] = ['web', 'ios-shortcut', 'api'];
  const source = randomElement(sources);

  const id = uuidv4();
  const title = generateTitle(topic, contentType);
  const annotation = Math.random() > 0.3 ? generateAnnotation(topic) : null;
  const tags = generateTags(topic);
  const createdAt = randomDate(180); // Random date within last 180 days

  // Generate file path
  const year = createdAt.getFullYear();
  const month = String(createdAt.getMonth() + 1).padStart(2, '0');
  const day = String(createdAt.getDate()).padStart(2, '0');
  const ext = contentType === 'text' ? 'txt' : contentType === 'image' ? 'svg' : 'pdf';
  const filePath = join(config.storageBasePath, String(year), month, day, `${id}.${ext}`);

  // Generate content
  let content: string | Buffer;
  let extractedText: string | null = null;

  if (contentType === 'text') {
    content = generateText(topic);
    extractedText = content;

    // Ensure directory exists
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(filePath, content);
  } else if (contentType === 'image') {
    createDummyImage(filePath);
    content = Buffer.from('dummy-image-data');
    extractedText = null; // No OCR in MVP
  } else {
    createDummyPdf(filePath);
    content = Buffer.from('dummy-pdf-data');
    extractedText = null; // No PDF extraction in MVP
  }

  // Create database entry
  db.createContent({
    id,
    file_path: filePath,
    content_type: contentType,
    title,
    source,
    tags,
    annotation: annotation || undefined,
    extracted_text: extractedText || undefined,
  });

  // Generate embedding asynchronously
  await pipeline.processContentAsync({
    contentId: id,
    contentType,
    content,
    annotation,
    title,
    tags,
  });

  // Progress indicator
  if ((index + 1) % 50 === 0 || index + 1 === total) {
    logger.info(`Generated ${index + 1}/${total} content items`);
  }
}

// =========================================================================
// Main Function
// =========================================================================

async function main() {
  const count = parseInt(process.argv[2] || '500', 10);

  if (isNaN(count) || count < 1 || count > 1000) {
    console.error('❌ Invalid count. Must be between 1 and 1000');
    process.exit(1);
  }

  console.log('🚀 KURA Notes - Test Data Generator\n');
  console.log(`📊 Generating ${count} test content items...\n`);

  // Check if OpenAI API key is set
  if (!config.openaiApiKey) {
    console.error('❌ OPENAI_API_KEY is not set. Embeddings will not be generated.');
    console.error('   Set OPENAI_API_KEY in your .env file to enable embeddings.\n');
    process.exit(1);
  }

  try {
    // Initialize services
    console.log('⚙️  Initializing services...');
    const db = DatabaseService.getInstance(config.databaseUrl);
    const embeddingService = EmbeddingService.getInstance();
    const vectorStore = VectorStoreService.getInstance();
    const pipeline = new EmbeddingPipelineService(embeddingService, vectorStore, db);

    console.log('✅ Services initialized\n');

    // Check ChromaDB connection
    const isHealthy = await vectorStore.healthCheck();
    if (!isHealthy) {
      console.error('❌ ChromaDB is not healthy. Make sure it\'s running:');
      console.error('   docker-compose up -d chromadb\n');
      process.exit(1);
    }

    console.log('✅ ChromaDB connection verified\n');

    // Generate test data
    console.log('📝 Generating content items...\n');
    const startTime = Date.now();

    for (let i = 0; i < count; i++) {
      await generateContentItem(db, pipeline, i, count);
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(`\n✅ Successfully generated ${count} test content items in ${duration}s`);
    console.log(`   Average: ${(parseFloat(duration) / count).toFixed(3)}s per item`);

    // Wait a bit for embeddings to process
    console.log('\n⏳ Waiting 5 seconds for embeddings to process...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Verify data
    console.log('\n📊 Verification:');
    const stats = db.getStats();
    console.log(`   Total items in database: ${stats.totalItems}`);
    console.log(`   By type:`);
    stats.itemsByType.forEach((stat: any) => {
      console.log(`     - ${stat.content_type}: ${stat.count}`);
    });
    console.log(`   Embedding statuses:`);
    console.log(`     - Pending: ${stats.embeddingsPending}`);
    console.log(`     - Completed: ${stats.embeddingsCompleted}`);
    console.log(`     - Failed: ${stats.embeddingsFailed}`);

    // Check ChromaDB
    const chromaStats = await vectorStore.getStats();
    console.log(`\n   ChromaDB documents: ${chromaStats.count}`);

    if (chromaStats.count < count) {
      console.log(`\n⚠️  Note: Some embeddings are still processing. Wait a bit longer for all to complete.`);
    }

    console.log('\n✅ Test data generation complete!\n');
    console.log('💡 Next steps:');
    console.log('   1. Run performance tests: npm run measure-performance');
    console.log('   2. Check the web interface: http://localhost:3000');
    console.log('   3. Try searching for topics like "Machine Learning" or "API Design"\n');

  } catch (error) {
    console.error('\n❌ Error generating test data:', error);
    process.exit(1);
  }

  process.exit(0);
}

// Run main function
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
