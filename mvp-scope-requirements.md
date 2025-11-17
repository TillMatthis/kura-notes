# Second Brain - MVP Scope & Requirements

## MVP Definition

**Goal:** Build a working personal knowledge system that solves the immediate problem - capturing content from iOS and retrieving it through intelligent search.

**Timeline:** 2-4 weeks of development (part-time with AI assistance)

**Success Criteria:**
1. Can capture 50+ notes/items from iOS without friction
2. Can find relevant information through natural language search
3. System is reliable enough for daily personal use

## In Scope for MVP

### 1. Content Capture

#### Supported Content Types
- ✅ **Text notes** - Plain text input
- ✅ **Images** - JPEG, PNG, with optional text annotation
- ✅ **PDFs** - Store file (no text extraction yet)

#### Capture Methods
- ✅ **iOS Shortcut** - Primary method via share sheet
  - POST to API endpoint
  - Include optional annotation/tags
- ✅ **Web interface** - Manual note creation
  - Simple textarea for text notes
  - File upload for images/PDFs
  - Tag input field

#### Capture Requirements
- Accept content via POST /api/capture
- Generate unique ID for each item
- Store file to filesystem
- Save metadata to database
- Must complete in <5 seconds for typical content
- Return success/error response

### 2. Storage

#### File Storage
- ✅ Date-based folder structure (/2025/01/15/)
- ✅ Original filenames preserved with UUID prefix
- ✅ Organized by content type

#### Database (SQLite)
- ✅ Content metadata table
  - ID, file path, content type
  - Title, tags (JSON array)
  - User annotation/context
  - Timestamps (created, updated)
- ✅ Indexes on: content_type, created_at, tags

#### What's Stored
- Original files (text, images, PDFs)
- Extracted text (for text files, user annotations)
- Tags
- Timestamps
- Content type

### 3. Search & Retrieval

#### Search Capabilities
- ✅ **Vector semantic search** (primary)
  - Natural language queries
  - Returns semantically similar content
  - Relevance scoring
- ✅ **Full-text search** (backup)
  - SQLite FTS for keyword matching
  - Fallback when vector search insufficient
- ✅ **Filters**
  - By content type (text, image, pdf)
  - By date range (from/to)
  - By tags
  - Combine filters with search

#### Search API
- ✅ GET /api/search
  - Query parameter (natural language)
  - Optional filters
  - Returns ranked results with excerpts
- ✅ Response includes:
  - Content ID
  - Title/excerpt
  - Relevance score
  - Metadata
  - Timestamps

#### Content Retrieval
- ✅ GET /api/content/:id
  - Returns full content
  - Metadata included
  - File URL for images/PDFs

### 4. Vector Search Implementation

#### Embedding Generation
- ✅ Use OpenAI text-embedding-3-small API
- ✅ Generate embeddings for:
  - Text content
  - Image annotations
  - PDF filenames (text extraction in Phase 2)
- ✅ Store in ChromaDB

#### Vector Database
- ✅ ChromaDB running in Docker container
- ✅ Single collection: "knowledge_base"
- ✅ Document metadata stored with vectors
- ✅ Similarity search with configurable limit

### 5. Web Interface (Basic)

#### Pages Required
- ✅ **Home/Dashboard**
  - Recent items list (last 20)
  - Quick stats (total items, by type)
  - Search bar
- ✅ **Search Page**
  - Query input
  - Filter controls (type, date, tags)
  - Results list with preview
  - Click to view full content
- ✅ **Create Note Page**
  - Text editor (simple textarea)
  - Tag input
  - Save button
- ✅ **Upload Page**
  - File upload (images, PDFs)
  - Optional annotation field
  - Tag input
  - Upload button
- ✅ **View Content Page**
  - Display full content
  - Show metadata
  - Delete button
  - Edit tags (stretch goal)

#### UI Requirements
- Functional, not pretty
- Mobile-responsive (works on phone browser)
- Fast loading (<2 seconds)
- Clear error messages

### 6. Content Management

#### User Actions
- ✅ **Create** - Manual text notes via web interface
- ✅ **Upload** - Images and PDFs via web interface
- ✅ **Capture** - From iOS shortcut
- ✅ **Search** - Find content
- ✅ **View** - Display content with metadata
- ✅ **Delete** - Remove content (file + metadata + vector)
- ✅ **Tag** - Add tags when creating/capturing

#### Tag System
- Simple string array
- User-defined (no auto-categorization yet)
- Can add multiple tags per item
- Tags filterable in search

### 7. Security (Standard Encryption)

#### Authentication
- ✅ API key authentication
- ✅ Single key stored in environment variable
- ✅ Required for all API endpoints

#### Data Protection
- ✅ HTTPS only (self-signed cert for homelab)
- ✅ Docker volume for data persistence
- ✅ No external access (local network only for MVP)

#### What's NOT Included
- ❌ User accounts/multi-user
- ❌ Zero-knowledge encryption (Phase 2)
- ❌ Password-protected notes
- ❌ Sharing/collaboration

### 8. Deployment

#### Docker Setup
- ✅ Docker Compose with 2 services:
  - API (Node.js/Fastify)
  - ChromaDB
- ✅ Persistent volumes for data
- ✅ Environment configuration via .env
- ✅ Health check endpoint
- ✅ Deployment to Proxmox homeserver

#### Configuration
- ✅ Environment variables for:
  - API key
  - OpenAI API key
  - Database path
  - Vector store URL
- ✅ Easy to redeploy/update

### 9. iOS Shortcut Integration

#### Shortcut Requirements
- ✅ Accept input from share sheet:
  - Text (notes, URLs, copied text)
  - Images (photos, screenshots)
  - Files (PDFs)
- ✅ Optional: Prompt for annotation
- ✅ Optional: Prompt for tags
- ✅ POST to API endpoint
- ✅ Show success/error notification

#### API Endpoint Format
```
POST https://homeserver.local:3000/api/capture
Headers: Authorization: Bearer <api-key>
Body: {
  content: "text or base64",
  contentType: "text|image|pdf",
  metadata: {
    title: "optional",
    annotation: "optional",
    tags: ["tag1", "tag2"]
  }
}
```

## Explicitly Out of Scope for MVP

### Content Types
- ❌ Audio files (no transcription)
- ❌ Rich documents (Word, HTML with embedded media)
- ❌ Video files
- ❌ Links with automatic preview/archival

### Processing Features
- ❌ OCR for images
- ❌ PDF text extraction
- ❌ Audio transcription
- ❌ Automatic categorization/tagging
- ❌ Smart collections
- ❌ Duplicate detection

### Search Features
- ❌ Fuzzy search
- ❌ Search history/suggestions
- ❌ Related content recommendations
- ❌ Advanced query syntax

### Interface Features
- ❌ Rich text editor
- ❌ Markdown rendering
- ❌ Beautiful design/theming
- ❌ Bulk operations (select multiple, batch delete)
- ❌ Edit existing content (only delete + recreate)
- ❌ Content preview/thumbnails

### Advanced Features
- ❌ MCP integration (can add later as wrapper)
- ❌ LLM chat interface
- ❌ Automatic backup/sync
- ❌ Export functionality
- ❌ API documentation/Swagger
- ❌ Analytics/usage stats

### Security Features
- ❌ Zero-knowledge encryption
- ❌ Multi-user support
- ❌ User accounts/login
- ❌ Rate limiting
- ❌ Advanced access controls

### Integration
- ❌ Claude Desktop MCP server
- ❌ Browser extension
- ❌ Desktop app
- ❌ Native iOS app
- ❌ Email forwarding
- ❌ Zapier/IFTTT integration

## Success Metrics

### Functional Success
- [ ] Capture content from iOS in <5 seconds
- [ ] Search returns relevant results >80% of the time
- [ ] System handles 100+ items without performance issues
- [ ] No data loss (files + metadata persist across restarts)
- [ ] Can delete and re-capture content without issues

### Personal Success
- [ ] Actually use it daily for 2+ weeks
- [ ] Find information faster than current scattered approach
- [ ] Trust it enough to rely on it (not keeping backup copies)
- [ ] Feel confident extending it (code is maintainable)

### Technical Success
- [ ] Docker container deploys successfully to Proxmox
- [ ] API responds in <500ms for searches
- [ ] Vector search works better than keyword search
- [ ] No crashes/errors during normal use
- [ ] Can understand and modify code with AI assistance

## Phase 2 Scope (Future)

To be built after MVP validation:

### Immediate Next (Phase 2A)
1. OCR for images (Tesseract.js)
2. PDF text extraction (pdf-parse)
3. Basic MCP server for Claude Desktop
4. Edit content (not just delete)
5. Content thumbnails/previews

### Near-term (Phase 2B)
1. Audio transcription (Whisper API)
2. Automatic tagging (LLM-based)
3. Related content suggestions
4. Better web interface (design pass)
5. Export functionality

### Pre-Commercial (Phase 2C)
1. Zero-knowledge encryption architecture
2. Multi-user support
3. User accounts/authentication
4. Better mobile interface
5. Backup/sync features

## Technical Constraints

### Performance Requirements
- API response time: <500ms (search), <100ms (capture response)
- Storage: Support up to 10,000 items in MVP
- Concurrent users: 1 (single-user system)
- Uptime: Best effort (it's running on homeserver)

### Resource Limits
- Docker memory: <2GB combined (API + ChromaDB)
- Storage: ~10GB for MVP (estimate)
- CPU: Minimal (only during capture/search)

### Dependencies
- Node.js 20+
- Docker + Docker Compose
- OpenAI API (for embeddings)
- Internet connection (for embeddings API)

## Development Priorities

### Week 1: Foundation
1. Docker setup + basic API structure
2. SQLite schema + file storage
3. Content capture endpoint (text only)
4. Basic web interface (create note)

### Week 2: Search
1. ChromaDB integration
2. Embedding generation
3. Vector search endpoint
4. Search interface

### Week 3: Complete MVP
1. Image + PDF upload
2. iOS shortcut testing
3. Filters + full-text search
4. Delete functionality
5. Tag system

### Week 4: Polish & Deploy
1. Bug fixes
2. Deploy to Proxmox
3. iOS shortcut finalization
4. Documentation
5. Real-world testing

## Definition of Done

MVP is complete when:
1. ✅ All "In Scope" features implemented and tested
2. ✅ Can capture content from iOS successfully
3. ✅ Search returns relevant results consistently
4. ✅ System runs stably on Proxmox for 1 week
5. ✅ Code is clean enough to extend with AI assistance
6. ✅ Personal success metrics achieved (using it daily)

At this point, decide: continue to Phase 2, or pivot based on learnings.
