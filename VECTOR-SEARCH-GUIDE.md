# KURA Notes - Vector Search Architecture Guide

## 📊 Data Flow Architecture

### Misconception vs Reality

❌ **WRONG:** ChromaDB calls OpenAI to generate embeddings
✅ **CORRECT:** Your application (kura-notes) calls OpenAI, then sends embeddings to ChromaDB

### Complete Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. CREATE NOTE (via MCP or Web UI)                             │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. API Server (Fastify)                                         │
│    - POST /api/capture                                          │
│    - Saves to SQLite                                            │
│    - Status: "pending"                                          │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3. Embedding Pipeline (Background Process)                      │
│                                                                  │
│    a) Extract text from content                                 │
│       - For text: use content directly                          │
│       - For PDFs: extract text from PDF                         │
│       - For images: use annotation/title                        │
│       - For audio: use transcription (if available)             │
│                                                                  │
│    b) Call OpenAI Embeddings API                                │
│       🔑 YOUR APP calls OpenAI (not ChromaDB!)                  │
│       Request: {                                                │
│         model: "text-embedding-3-small",                        │
│         input: "Your note text here...",                        │
│         organization: "org-XXX",  ← NOW REQUIRED                │
│         project: "proj_XXX"       ← NOW REQUIRED                │
│       }                                                          │
│       Response: [0.234, -0.891, ..., 0.123]  (1536 numbers)    │
│                                                                  │
│    c) Prepare metadata for ChromaDB                             │
│       metadata = {                                              │
│         user_id: "user123",                                     │
│         content_type: "text",                                   │
│         title: "My Note",                                       │
│         tags: JSON.stringify(["ai", "ml"])  ← SERIALIZED        │
│       }                                                          │
│                                                                  │
│    d) Store in ChromaDB                                         │
│       ChromaDB.add({                                            │
│         ids: ["note-uuid"],                                     │
│         embeddings: [[0.234, -0.891, ...]],                     │
│         metadatas: [metadata],                                  │
│         documents: ["Your note text"]                           │
│       })                                                         │
│                                                                  │
│    e) Update SQLite                                             │
│       Status: "completed"                                       │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ STORAGE LAYERS                                                  │
│                                                                  │
│ SQLite (metadata.db):                                           │
│   ├─ ID, title, tags, created_at, user_id                      │
│   ├─ embedding_status: "completed"                             │
│   └─ Full content stored in filesystem                         │
│                                                                  │
│ ChromaDB (vector.db):                                           │
│   ├─ ID: "note-uuid"                                           │
│   ├─ Embedding: [1536 numbers]                                 │
│   ├─ Metadata: {user_id, tags, title, ...}                     │
│   └─ Document: "searchable text"                               │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔍 Search Flow (When LLM Uses MCP)

```
┌─────────────────────────────────────────────────────────────────┐
│ LLM (Claude Desktop) via MCP                                    │
└─────────────────────────────────────────────────────────────────┘
                            ↓
                  kura_search("machine learning")
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ MCP Server (mcp/src/server.ts)                                  │
│   - Calls: GET /api/search?query=machine+learning              │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ API Server - Search Route (src/api/routes/search.ts)            │
│   - Uses SearchService with useFallback=true                    │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ Search Service (src/services/searchService.ts)                  │
│                                                                  │
│ Step 1: Try Vector Search                                       │
│   a) Generate embedding for "machine learning"                  │
│      → Call OpenAI API                                          │
│      → Get embedding: [0.221, -0.887, ...]                      │
│                                                                  │
│   b) Query ChromaDB                                             │
│      ChromaDB.query({                                           │
│        queryEmbeddings: [[0.221, -0.887, ...]],                │
│        nResults: 10,                                            │
│        where: { user_id: "user123" }  ← Multi-tenant filtering │
│      })                                                          │
│                                                                  │
│   c) ChromaDB returns similar vectors                           │
│      - Uses HNSW algorithm (O(log n) speed)                    │
│      - Cosine similarity scoring                                │
│      Results: [                                                 │
│        {id: "note1", distance: 0.12, score: 0.94},             │
│        {id: "note2", distance: 0.18, score: 0.91},             │
│        ...                                                       │
│      ]                                                           │
│                                                                  │
│   d) Fetch full metadata from SQLite                            │
│      - Get title, tags, content_type, etc.                     │
│                                                                  │
│ Step 2: Fallback to FTS (if vector search fails/no results)    │
│   - Uses SQLite FTS5 full-text search                          │
│   - Keyword matching with BM25 ranking                         │
│                                                                  │
│ Step 3: Return combined results                                 │
│   - Sort by relevance score                                     │
│   - Include searchMethod: "vector" | "fts" | "combined"        │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ Response to LLM                                                 │
│ {                                                                │
│   "results": [                                                   │
│     {                                                            │
│       "id": "note-uuid",                                        │
│       "title": "Neural Networks Fundamentals",                  │
│       "excerpt": "Neural networks are...",                      │
│       "relevanceScore": 0.94,                                   │
│       "metadata": { tags: ["ai", "ml"], ... }                  │
│     }                                                            │
│   ],                                                             │
│   "searchMethod": "vector",  ← Confirms semantic search used!   │
│   "totalResults": 5                                             │
│ }                                                                │
└─────────────────────────────────────────────────────────────────┘
```

---

## ✅ Verifying Vector Search is Working

### 1. Check Embedding Status After Creating Notes

```bash
# SSH to your server
ssh your-server

# Check the API logs for successful embedding
docker logs kura-notes-api 2>&1 | grep -i "embedding" | tail -20

# You should see:
# ✅ "Embedding generated successfully"
# ✅ "Embedding stored in ChromaDB"
# ✅ "Embedding pipeline completed successfully"
```

### 2. Check Database Embedding Status

```bash
# Enter the API container
docker exec -it kura-notes-api sh

# Query SQLite database
sqlite3 /app/data/metadata/knowledge.db

# Check embedding status
SELECT id, title, embedding_status, created_at
FROM content
ORDER BY created_at DESC
LIMIT 10;

# All should show: embedding_status = "completed"
```

### 3. Test Search via MCP and Check Method

When you search via Claude Desktop (MCP), the response includes `searchMethod`:

```json
{
  "results": [...],
  "searchMethod": "vector",  ← This confirms vector search was used!
  "totalResults": 5
}
```

If you see:
- `"searchMethod": "vector"` → ✅ Semantic search is working!
- `"searchMethod": "fts"` → ⚠️ Fell back to keyword search (check OpenAI config)
- `"searchMethod": "combined"` → Both methods used and results merged

### 4. Direct API Test

```bash
# Test search endpoint directly
curl "http://localhost:3000/api/search?query=artificial+intelligence" \
  -H "x-test-user-id: test-user" \
  -H "x-test-user-email: test@example.com"

# Check the response for searchMethod field
```

### 5. Check ChromaDB Collection

```bash
# SSH to server and check ChromaDB
docker exec kura-notes-api node -e "
const { ChromaClient } = require('chromadb');
const client = new ChromaClient({ path: 'http://vectordb:8000' });

(async () => {
  const collection = await client.getCollection({ name: 'knowledge_base' });
  const count = await collection.count();
  console.log('Total embeddings in ChromaDB:', count);

  // Get a sample
  const sample = await collection.peek({ limit: 1 });
  console.log('Sample:', JSON.stringify(sample, null, 2));
})();
"
```

---

## 🚀 How LLMs Benefit from Vector Search

### Example: Creating and Searching Notes

#### Scenario: You create these notes via Claude Chat

**Note 1:**
```
Title: "Deep Learning Basics"
Content: "Neural networks with multiple layers enable machines to learn
hierarchical representations of data. Backpropagation is the key algorithm."
Tags: ["ai", "deep-learning"]
```

**Note 2:**
```
Title: "Computer Vision Applications"
Content: "CNNs revolutionized image classification. Transfer learning allows
us to use pre-trained models like ResNet."
Tags: ["cv", "ai"]
```

**Note 3:**
```
Title: "NLP Transformers"
Content: "Attention mechanisms replaced RNNs. BERT and GPT are based on the
transformer architecture."
Tags: ["nlp", "transformers"]
```

#### Vector Search in Action

**Query 1:** "machine learning algorithms"

Traditional keyword search would find: **0 results** (no note mentions "machine learning" exactly)

Vector search finds:
1. Note 1: "Deep Learning Basics" (score: 0.92) ← Semantically related!
2. Note 3: "NLP Transformers" (score: 0.88)  ← Related concepts!
3. Note 2: "Computer Vision" (score: 0.85)   ← Also ML-related!

**Query 2:** "image recognition"

Traditional keyword search: **0 results** (no exact phrase match)

Vector search finds:
1. Note 2: "Computer Vision Applications" (score: 0.91) ← Perfect match!
2. Note 1: "Deep Learning Basics" (score: 0.78)        ← Related foundation!

### Why This Makes LLMs More Powerful

1. **Better Context Retrieval**
   - LLM searches your knowledge base
   - Gets semantically relevant notes, not just keyword matches
   - Generates more accurate, contextual answers

2. **Cross-Domain Understanding**
   - Notes about "neural networks" retrieved for "AI" queries
   - Notes about "transformers" found for "language models" queries
   - Conceptual relationships automatically discovered

3. **Multi-Language Support**
   - Search in English, find German notes on same topic
   - Embeddings capture meaning, not just words

4. **Fast at Scale**
   - ChromaDB's HNSW index: sub-millisecond searches
   - Works efficiently with millions of notes

---

## 🔧 Deployment Checklist

After deploying the fixes, verify everything is working:

### Step 1: Rebuild and Deploy

```bash
cd /opt/kura-notes

# Pull latest changes
git pull origin claude/fix-openai-embedding-permissions-01HYKt9qh4t1ionrHZ9m7Yqz

# Rebuild Docker image
docker-compose build api

# Restart services
docker-compose down
docker-compose up -d
```

### Step 2: Verify Configuration

```bash
# Check that OpenAI credentials are set
docker exec kura-notes-api node -e "
const config = require('./dist/config/index.js').config;
console.log('OpenAI API Key:', config.openaiApiKey ? '✅ Set' : '❌ Missing');
console.log('OpenAI Org ID:', config.openaiOrganization ? '✅ Set' : '⚠️ Not set');
console.log('OpenAI Project ID:', config.openaiProject ? '✅ Set' : '⚠️ Not set');
"
```

### Step 3: Create Test Note

Via Claude Desktop with MCP:
```
User: Create a note about "quantum computing fundamentals"
Claude: [Uses kura_create tool]
```

### Step 4: Check Logs

```bash
docker logs -f kura-notes-api

# Watch for:
# ✅ "EmbeddingService initialized" with hasOrganization: true, hasProject: true
# ✅ "Embedding generated successfully"
# ✅ "Embedding stored in ChromaDB"
# ✅ "Embedding pipeline completed successfully"
```

### Step 5: Test Semantic Search

Via Claude Desktop:
```
User: Search for notes about "quantum mechanics"
Claude: [Uses kura_search tool]
       [Should find the "quantum computing" note even though exact phrase differs!]
```

Check the response includes:
```json
{
  "searchMethod": "vector",  ← Confirms vector search worked!
  "results": [...]
}
```

---

## 🎯 Summary

**Your Architecture:**
1. ✅ Application generates embeddings via OpenAI (not ChromaDB)
2. ✅ Application stores embeddings + text in ChromaDB
3. ✅ MCP server uses `/api/search` endpoint
4. ✅ Search service tries vector search first, falls back to FTS
5. ✅ LLMs get semantically relevant results

**Fixed Issues:**
1. ✅ OpenAI permissions (org/project IDs now included)
2. ✅ ChromaDB metadata (tags serialized as JSON string)

**What You Get:**
- **Semantic search** - Find notes by meaning, not just keywords
- **Fast retrieval** - Sub-millisecond vector similarity search
- **Smart fallback** - FTS if vector search fails
- **Multi-tenant** - User filtering in ChromaDB queries
- **LLM-ready** - Perfect for Claude Desktop and other AI assistants

The vector search **IS** being used when LLMs search via MCP! 🎉
