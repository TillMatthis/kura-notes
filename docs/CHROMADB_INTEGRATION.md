# ChromaDB Integration Guide

## Overview

KURA Notes uses ChromaDB as a vector store for semantic search functionality. This document describes the integration and how to use it.

## Architecture

### Vector Store Service

The `VectorStoreService` (`src/services/vectorStore.ts`) provides a singleton interface to ChromaDB with the following capabilities:

- **Connection Management**: Automatic connection and collection creation
- **CRUD Operations**: Add, query, delete, and get documents with embeddings
- **Health Checks**: Monitor ChromaDB availability
- **Error Handling**: Graceful degradation when ChromaDB is unavailable

### Collection Configuration

- **Collection Name**: `knowledge_base`
- **Distance Metric**: Cosine similarity (`cosine`)
- **Metadata**: Stores content metadata alongside embeddings

## Setup

### 1. Start ChromaDB

Using Docker (recommended):

```bash
docker run -d --name chromadb -p 8000:8000 -v chroma-data:/chroma/chroma chromadb/chroma:latest
```

Using docker-compose:

```bash
docker-compose up -d vectordb
```

### 2. Configure Environment

Set the ChromaDB URL in `.env`:

```env
VECTOR_STORE_URL=http://localhost:8000
```

For Docker networking:

```env
VECTOR_STORE_URL=http://vectordb:8000
```

### 3. Initialize Service

The service automatically initializes on first use:

```typescript
import { getVectorStoreService } from './services/vectorStore.js';

const vectorStore = getVectorStoreService();
await vectorStore.initialize();
```

## Usage

### Add Document with Embedding

```typescript
await vectorStore.addDocument(
  'document-id',
  embedding,  // number[] - embedding vector
  {
    title: 'Document Title',
    contentType: 'text',
    tags: ['tag1', 'tag2'],
  },
  'Document text content'
);
```

### Query by Embedding

```typescript
const results = await vectorStore.queryByEmbedding(
  queryEmbedding,  // number[] - query vector
  10               // limit
);

// Results format:
// [
//   {
//     id: string,
//     score: number,      // 0-1, higher is more similar
//     metadata: object,
//     text: string
//   }
// ]
```

### Delete Document

```typescript
await vectorStore.deleteDocument('document-id');
```

### Get Document by ID

```typescript
const doc = await vectorStore.getDocument('document-id');
if (doc) {
  console.log(doc.id, doc.embedding, doc.metadata, doc.text);
}
```

### Health Check

```typescript
const isHealthy = await vectorStore.healthCheck();
console.log('ChromaDB is', isHealthy ? 'up' : 'down');
```

### Get Statistics

```typescript
const stats = await vectorStore.getStats();
console.log(`Documents: ${stats.count}, Connected: ${stats.isConnected}`);
```

## Health Check Endpoint

The `/api/health` endpoint includes ChromaDB status:

```bash
curl http://localhost:3000/api/health
```

Response:

```json
{
  "status": "healthy",
  "timestamp": "2025-11-17T...",
  "uptime": 123.45,
  "services": {
    "database": {
      "status": "up",
      "responseTime": 2
    },
    "vectorStore": {
      "status": "up",
      "message": "Connected (42 documents)",
      "responseTime": 15
    }
  }
}
```

Status meanings:
- `up`: ChromaDB is available and responding
- `down`: ChromaDB connection failed
- `unknown`: ChromaDB URL not configured

## Error Handling

The service handles errors gracefully:

1. **Connection Failures**: Logged and reported via health check
2. **Operation Failures**: Throw descriptive errors with context
3. **Graceful Degradation**: Application continues without vector search

Example:

```typescript
try {
  await vectorStore.addDocument(id, embedding, metadata, text);
} catch (error) {
  logger.error('Failed to add to vector store', { error });
  // Application continues - semantic search unavailable for this doc
}
```

## Testing

Tests are located in `tests/services/vectorStore.test.ts`.

Run tests:

```bash
npm test -- tests/services/vectorStore.test.ts
```

Tests are designed to handle ChromaDB being unavailable (for CI/CD environments).

## Similarity Scoring

ChromaDB returns cosine distance (0-2), which we convert to similarity (0-1):

- **Distance 0** → Similarity 1.0 (identical)
- **Distance 1** → Similarity 0.5 (orthogonal)
- **Distance 2** → Similarity 0.0 (opposite)

Formula: `similarity = 1 - (distance / 2)`

## Performance Considerations

1. **Batch Operations**: Add documents in batches when possible
2. **Query Limits**: Default limit is 10, adjust based on needs
3. **Connection Pooling**: Singleton pattern reuses connection
4. **Async Operations**: All operations are async, use appropriately

## Troubleshooting

### ChromaDB Not Connecting

Check:
1. Is ChromaDB running? `docker ps | grep chroma`
2. Is port 8000 available? `curl http://localhost:8000/api/v1/heartbeat`
3. Is VECTOR_STORE_URL correct in .env?
4. Check logs: `docker logs chromadb`

### Initialization Errors

```
Failed to initialize ChromaDB
```

Solutions:
- Ensure ChromaDB is started before the API
- Check network connectivity
- Verify CORS settings if using browser clients

### Collection Not Found

The service automatically creates the collection on first use. If you get "collection not found" errors:

```bash
# Restart the API to trigger initialization
docker-compose restart api
```

## Future Enhancements

Planned for later phases:

1. **Batch Operations**: Bulk add/delete operations
2. **Metadata Filtering**: Filter queries by metadata
3. **Multiple Collections**: Support for different content types
4. **Embedding Caching**: Cache embeddings to reduce API calls
5. **Backup/Restore**: Export and import vector data

## References

- [ChromaDB Documentation](https://docs.trychroma.com/)
- [ChromaDB Client API](https://docs.trychroma.com/reference/Client)
- [Cosine Similarity Explained](https://en.wikipedia.org/wiki/Cosine_similarity)
