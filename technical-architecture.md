# Second Brain - Technical Architecture

## Technology Stack

### Core Technologies
- **Runtime:** Node.js (v20+)
- **Language:** TypeScript (type safety, better tooling)
- **API Framework:** Fastify (fast, modern, async-first)
- **Database:** SQLite (metadata, simple, portable)
- **Vector Store:** ChromaDB or Qdrant (via HTTP API)
- **File Storage:** Local filesystem
- **Container:** Docker + Docker Compose
- **Deployment:** Proxmox (Docker container)

### Why This Stack

**Node.js/TypeScript:**
- You're comfortable with JavaScript
- Async by nature (good for file processing)
- Strong ecosystem for APIs
- TypeScript adds reliability

**Fastify over Express:**
- Faster performance
- Better TypeScript support
- Modern async/await patterns
- Built-in validation

**SQLite:**
- Zero configuration
- Perfect for single-user MVP
- File-based (portable with Docker volume)
- Scales to moderate multi-user

**ChromaDB/Qdrant:**
- Both have HTTP APIs (language-agnostic)
- Easy to swap later if needed
- Run in separate Docker container
- Good performance for personal use

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                          │
│  iOS Shortcuts │ Web Form │ Scripts │ Future: Browser Ext   │
└─────────────────────────────┬───────────────────────────────┘
                              │ HTTPS (POST/GET)
┌─────────────────────────────▼───────────────────────────────┐
│                         API LAYER                            │
│                    (Fastify + TypeScript)                    │
│                                                               │
│  /api/capture  - Accept content (POST)                       │
│  /api/search   - Query knowledge (GET)                       │
│  /api/content  - Retrieve specific items (GET)               │
│  /api/health   - System status (GET)                         │
└───────────────┬─────────────────────┬───────────────────────┘
                │                     │
    ┌───────────▼──────────┐  ┌──────▼──────────┐
    │   STORAGE LAYER      │  │  PROCESSING     │
    │                      │  │                 │
    │  File System         │  │  Vector         │
    │  - Raw files         │  │  Embeddings     │
    │  - Organized by      │  │  Generator      │
    │    date/type         │  │                 │
    │                      │  └────────┬────────┘
    │  SQLite Database     │           │
    │  - Metadata          │  ┌────────▼────────┐
    │  - File paths        │  │  VECTOR STORE   │
    │  - User tags         │  │  (ChromaDB/     │
    │  - Timestamps        │  │   Qdrant)       │
    └──────────────────────┘  └─────────────────┘
```

## Component Details

### 1. API Layer (Fastify)

**Endpoints:**

#### POST /api/capture
Accept and store content from any source.

**Request:**
```typescript
{
  content: string | Buffer,        // Text or binary data
  contentType: 'text' | 'image' | 'pdf' | 'audio',
  metadata?: {
    title?: string,
    source?: string,               // 'ios-shortcut', 'web', etc.
    tags?: string[],
    context?: string               // User-provided context
  }
}
```

**Response:**
```typescript
{
  id: string,                      // Unique content ID
  status: 'success',
  message: 'Content captured successfully'
}
```

**Processing Flow:**
1. Validate request
2. Generate unique ID (UUID)
3. Store file to filesystem
4. Extract/OCR text if needed (images, PDFs)
5. Save metadata to SQLite
6. Generate vector embedding
7. Store embedding in vector DB
8. Return success response

#### GET /api/search
Query knowledge base with natural language.

**Request:**
```typescript
{
  query: string,                   // Natural language query
  limit?: number,                  // Max results (default: 10)
  filters?: {
    contentType?: string[],
    dateFrom?: string,
    dateTo?: string,
    tags?: string[]
  }
}
```

**Response:**
```typescript
{
  results: [
    {
      id: string,
      title: string,
      excerpt: string,             // Relevant snippet
      contentType: string,
      relevanceScore: number,      // 0-1
      metadata: object,
      createdAt: string
    }
  ],
  totalResults: number
}
```

**Processing Flow:**
1. Generate embedding for query
2. Vector similarity search
3. Apply filters (content type, date, tags)
4. Retrieve metadata from SQLite
5. Generate excerpts/summaries
6. Return ranked results

#### GET /api/content/:id
Retrieve specific content item.

**Response:**
```typescript
{
  id: string,
  content: string | URL,           // Text or file URL
  contentType: string,
  metadata: object,
  createdAt: string,
  updatedAt: string
}
```

### 2. Storage Layer

#### File System Structure
```
/data
  /content
    /2025
      /01
        /15
          /abc-123-def.txt
          /xyz-789-ghi.pdf
          /img-456-jkl.jpg
  /metadata
    knowledge.db (SQLite)
  /vectors
    (managed by ChromaDB/Qdrant)
```

**Why Date-Based Folders:**
- Natural organization
- Easy backup/archival
- Performance (avoid huge directories)

#### SQLite Schema

**Table: content**
```sql
CREATE TABLE content (
  id TEXT PRIMARY KEY,
  file_path TEXT NOT NULL,
  content_type TEXT NOT NULL,
  title TEXT,
  source TEXT,
  tags TEXT,                      -- JSON array
  context TEXT,                   -- User-provided context
  extracted_text TEXT,            -- For search/display
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_content_type ON content(content_type);
CREATE INDEX idx_created_at ON content(created_at);
CREATE INDEX idx_tags ON content(tags);
```

**Table: search_history** (Optional - for analytics)
```sql
CREATE TABLE search_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  query TEXT NOT NULL,
  results_count INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 3. Vector Store (ChromaDB or Qdrant)

**ChromaDB Approach:**
- Run as Docker container
- HTTP API for Node.js client
- Simple collection structure

**Collection Configuration:**
```typescript
{
  name: "knowledge_base",
  metadata: {
    description: "Personal knowledge embeddings"
  },
  embedding_function: "default"  // Or custom model
}
```

**Document Format:**
```typescript
{
  id: "content-uuid",
  embedding: [0.123, -0.456, ...],  // Generated vector
  metadata: {
    content_type: "text",
    created_at: "2025-01-15T10:30:00Z",
    tags: ["project-x", "meeting-notes"]
  },
  document: "extracted text content for reference"
}
```

### 4. Content Processing Pipeline

#### Text Content
1. Store as-is
2. Generate embedding directly
3. Store in vector DB

#### Images
1. Store original file
2. OCR text extraction (Tesseract.js)
3. Generate embedding from extracted text
4. Store both image and text

#### PDFs
1. Store original file
2. Extract text (pdf-parse library)
3. Generate embedding from text
4. Store both PDF and text

#### Audio (Future)
1. Store original file
2. Transcribe (Whisper API or local model)
3. Generate embedding from transcript
4. Store audio + transcript

### 5. Embedding Generation

**Approach:**
- Use OpenAI embedding API (simple, reliable)
- Or local model (sentence-transformers via Python sidecar)
- Model: text-embedding-3-small (cost-effective)

**Implementation:**
```typescript
async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text.substring(0, 8000)  // Token limit
  });
  return response.data[0].embedding;
}
```

**Alternative (Local):**
- Run Python sidecar container with sentence-transformers
- API endpoint for embedding generation
- No external API dependency

## Security Architecture

### MVP Phase (Standard Encryption)

**Data at Rest:**
- Docker volume encryption (LUKS)
- SQLite encrypted database (SQLCipher)
- File system encryption at OS level

**Data in Transit:**
- HTTPS only (TLS 1.3)
- Self-signed cert for homelab (Let's Encrypt for production)

**Authentication:**
- API key authentication
- Key stored in environment variable
- Request header: `Authorization: Bearer <api-key>`

**Implementation:**
```typescript
fastify.addHook('preHandler', async (request, reply) => {
  const apiKey = request.headers.authorization?.replace('Bearer ', '');
  if (!apiKey || apiKey !== process.env.API_KEY) {
    reply.code(401).send({ error: 'Unauthorized' });
  }
});
```

### Pre-Commercial Phase (Zero-Knowledge Architecture)

**Changes Required:**

1. **Client-Side Encryption:**
   - iOS shortcut encrypts before sending
   - Web interface encrypts in browser
   - Server receives already-encrypted data

2. **Key Management:**
   - User generates encryption key on device
   - Key derived from password (PBKDF2/Argon2)
   - Key never sent to server

3. **Encrypted Vector Embeddings:**
   - Generate embeddings from plaintext (client-side)
   - Encrypt embeddings before storage
   - Searchable encryption scheme (complex)

4. **Server Role:**
   - Stores encrypted blobs
   - Cannot decrypt content
   - Can still perform vector similarity (with encrypted vectors)

**Migration Path:**
1. Build client-side encryption module
2. Add key generation/management
3. Implement encrypted vector search
4. Migrate existing data (re-encrypt)
5. Deploy to production

## Deployment Architecture

### Docker Compose Setup

**Services:**
```yaml
version: '3.8'

services:
  api:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - API_KEY=${API_KEY}
      - DATABASE_URL=/data/metadata/knowledge.db
      - VECTOR_STORE_URL=http://vectordb:8000
    volumes:
      - ./data:/data
    depends_on:
      - vectordb

  vectordb:
    image: chromadb/chroma:latest
    ports:
      - "8000:8000"
    volumes:
      - ./data/vectors:/chroma/data
    environment:
      - CHROMA_SERVER_AUTH_CREDENTIALS=${VECTOR_DB_KEY}

  # Optional: Python sidecar for local embeddings
  embeddings:
    image: sentence-transformers
    ports:
      - "8001:8001"
```

**Volumes:**
- `./data` - Persistent storage (content, metadata, vectors)
- Backed up regularly
- Portable (can move to different server)

### Environment Configuration

**.env file:**
```bash
# API Configuration
NODE_ENV=production
API_PORT=3000
API_KEY=<secure-random-key>

# Database
DATABASE_URL=/data/metadata/knowledge.db

# Vector Store
VECTOR_STORE_URL=http://vectordb:8000
VECTOR_DB_KEY=<secure-random-key>

# Embeddings (if using OpenAI)
OPENAI_API_KEY=<your-key>

# Security
TLS_CERT_PATH=/certs/cert.pem
TLS_KEY_PATH=/certs/key.pem
```

## Performance Considerations

### Optimization Strategies

**API Response Time:**
- Target: <500ms for search queries
- Async processing for capture (return immediately)
- Background job queue for heavy tasks (transcription, OCR)

**Vector Search:**
- Index optimization in ChromaDB/Qdrant
- Limit embedding dimensions if needed (384 vs 1536)
- Cache frequent queries

**File Storage:**
- Lazy loading (don't load full files unless requested)
- Thumbnail generation for images
- Compressed storage for old content

**Database:**
- Indexes on frequently queried fields
- Regular VACUUM for SQLite
- Consider PostgreSQL if scaling beyond single-user

## Monitoring & Logging

**Metrics to Track:**
- API request count/latency
- Storage usage
- Vector DB performance
- Error rates

**Logging:**
- Structured JSON logs
- Log levels: ERROR, WARN, INFO, DEBUG
- Rotate logs daily
- Store in `/data/logs`

**Health Check Endpoint:**
```typescript
GET /api/health
Response: {
  status: 'healthy',
  timestamp: '2025-01-15T10:30:00Z',
  services: {
    api: 'up',
    database: 'up',
    vectorStore: 'up'
  },
  storage: {
    used: '2.3GB',
    available: '97.7GB'
  }
}
```

## Development Workflow

### Local Development
1. Clone repository
2. `npm install`
3. Copy `.env.example` to `.env`
4. `docker-compose up -d vectordb`
5. `npm run dev`

### Testing
- Unit tests (Jest)
- Integration tests (API endpoints)
- E2E tests (iOS shortcut → search)

### Deployment
1. Build Docker image
2. Push to registry (or build on server)
3. Deploy to Proxmox
4. Run migrations if needed
5. Verify health endpoint

## Next Steps

With architecture defined, we need:
1. **MVP Scope & Requirements** - What specifically gets built first
2. **Build Phases & Checklist** - Ordered development tasks
