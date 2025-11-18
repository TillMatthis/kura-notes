# KURA Notes - Phase 2 Plan

**Status:** Planning (MVP must be complete first)  
**Prerequisites:** Phase 1-4 (MVP) complete and validated  
**Timeline:** TBD after MVP validation

---

## Phase 2A: Enhanced Features (Immediate Next)

### Priority 1: Migrate to EmbeddingGemma (Privacy + Cost)

**Task 2.2B: Replace OpenAI with EmbeddingGemma**

**Why:**
- Privacy-first (data never leaves server)
- Zero API costs (free forever)
- Better product positioning for SaaS
- Supports "self-hosted" tier
- Works offline

**What to build:**
1. Python embedding service container
   - Dockerfile with sentence-transformers
   - Flask/FastAPI HTTP server
   - Load google/embeddinggemma-300m model
   - Endpoints: POST /embed (query/document)
   
2. Update docker-compose.yml
   - Add embeddings service (port 5000)
   - Configure model cache volume
   - Set service dependencies

3. Replace OpenAI embedding service
   - Update src/services/embeddingService.ts
   - Call Python service via HTTP instead of OpenAI
   - Keep same interface (minimal changes)
   - Update tests

4. Re-generate all embeddings
   - Migration script to regenerate existing content
   - Batch process with progress logging
   - Validate search quality

**Estimated effort:** 1-2 days  
**Breaking change:** Yes (requires data migration)  
**Risk:** Medium (search quality might differ slightly)

---

### Priority 2: OCR for Images (Tesseract.js)

**What:** Extract text from images automatically

**Implementation:**
- Add Tesseract.js to Node.js service
- Process images on upload
- Store extracted text in database
- Index extracted text for search

**Estimated effort:** 2-3 days

---

### Priority 3: PDF Text Extraction (pdf-parse)

**What:** Extract text from PDFs automatically

**Implementation:**
- Add pdf-parse library
- Extract text on upload
- Store in database
- Generate embeddings from extracted text

**Estimated effort:** 1-2 days

---

### Priority 4: Edit Content Metadata

**What:** Modify title, annotation, tags after creation

**Implementation:**
- PATCH /api/content/:id endpoint
- Update web interface with edit mode
- Preserve file, update metadata only

**Estimated effort:** 1 day

---

### Priority 5: Content Thumbnails

**What:** Generate and display thumbnails for images

**Implementation:**
- Sharp library for image processing
- Generate on upload
- Serve via API endpoint
- Display in lists

**Estimated effort:** 1 day

---

## Phase 2B: Intelligence Features

### Priority 1: Audio Transcription (Whisper API)

**What:** Support audio file uploads with transcription

**Implementation:**
- Accept audio files (.mp3, .m4a, .wav)
- OpenAI Whisper API for transcription
- Store audio + transcript
- Search on transcript text

**Estimated effort:** 2-3 days  
**Cost:** ~$0.006 per minute of audio

---

### Priority 2: Automatic Tagging (LLM-based)

**What:** AI suggests tags based on content

**Implementation:**
- LLM analyzes content on upload
- Suggests 3-5 relevant tags
- User can accept/reject/modify
- Learn from user preferences

**Estimated effort:** 2-3 days  
**Cost:** Minimal (small prompts)

---

### Priority 3: Related Content Suggestions

**What:** "You might also be interested in..."

**Implementation:**
- Vector similarity search
- Show related items on content view
- Filter by recency and relevance

**Estimated effort:** 1-2 days

---

### Priority 4: Smart Collections

**What:** Auto-generated collections based on topics

**Implementation:**
- Clustering algorithm on embeddings
- Detect natural groupings
- User can name/customize collections

**Estimated effort:** 3-4 days

---

### Priority 5: Better Web Interface

**What:** Design pass, better UX

**Implementation:**
- Proper design system
- Improved layouts
- Better mobile experience
- Animations and polish

**Estimated effort:** 1 week  
**Consider:** Hiring designer

---

## Phase 2C: Production Ready (Pre-Commercial)

### Priority 1: Zero-Knowledge Encryption

**What:** Client-side encryption, server can't read data

**Implementation:**
- User's encryption key never sent to server
- Encrypt files client-side before upload
- Decrypt client-side after retrieval
- Key derivation from password
- Complex: affects search, sharing, recovery

**Estimated effort:** 2-3 weeks  
**Risk:** High (breaking change, complex crypto)

---

### Priority 2: Multi-User Support

**What:** Multiple users, isolated data

**Implementation:**
- User accounts and authentication
- Tenant isolation in database
- Per-user vector collections
- Access control

**Estimated effort:** 1-2 weeks

---

### Priority 3: Better Mobile Interface

**What:** Progressive Web App or native app

**Implementation:**
- PWA with offline support
- Or React Native app
- Optimized for mobile capture
- Native sharing integration

**Estimated effort:** 2-4 weeks

---

### Priority 4: Backup & Sync

**What:** Automatic backups, optional cloud sync

**Implementation:**
- Scheduled backup to external storage
- Optional S3/cloud sync
- Restore functionality
- Backup verification

**Estimated effort:** 1 week

---

### Priority 5: Export Functionality

**What:** Export all data in portable format

**Implementation:**
- Export to ZIP (files + JSON metadata)
- Export to Markdown
- Export to JSON
- Scheduled exports

**Estimated effort:** 3-5 days

---

## Phase 2D: Advanced Features (Post-Commercial)

### MCP Server Integration

**What:** Claude Desktop can query your knowledge base

**Implementation:**
- Build MCP server wrapper
- Expose search tools
- Handle authentication
- Documentation

**Estimated effort:** 1 week

---

### Browser Extension

**What:** Capture from any webpage

**Implementation:**
- Chrome/Firefox extension
- Right-click to capture
- Highlight to capture
- Auto-save tabs

**Estimated effort:** 1-2 weeks

---

### API Documentation

**What:** Public API docs with examples

**Implementation:**
- OpenAPI/Swagger spec
- Interactive documentation
- Client libraries (optional)
- Rate limiting

**Estimated effort:** 3-5 days

---

### Analytics & Monitoring

**What:** Usage stats, health monitoring

**Implementation:**
- Capture usage metrics
- Search analytics
- Performance monitoring
- Error tracking
- Uptime monitoring

**Estimated effort:** 1 week

---

## Migration Strategy (MVP → Phase 2)

### Step 1: Validate MVP (2 weeks minimum)
- Use daily for personal needs
- Identify pain points
- Measure success metrics
- Document learnings

### Step 2: Prioritize Phase 2A
- Pick 1-2 tasks based on biggest pain points
- Start with EmbeddingGemma migration (strategic)
- Add most-requested features

### Step 3: Iterate
- One task at a time
- Test thoroughly
- Get feedback (if multi-user by then)
- Maintain stability

### Step 4: Plan Phase 2B/2C
- Re-evaluate based on Phase 2A learnings
- Decide: stay personal or go commercial?
- Adjust roadmap accordingly

---

## Decision Points

After MVP completion, decide:

### Go Commercial?
- **Yes:** Prioritize Phase 2C (zero-knowledge, multi-user, polish)
- **No:** Stay on Phase 2A/2B (features for personal use)

### Self-Hosted Tier?
- **Yes:** Keep EmbeddingGemma, emphasize privacy
- **No:** Can keep OpenAI for simplicity

### Open Source?
- **Yes:** Clean up code, add documentation, choose license
- **No:** Keep private, focus on product

---

## Resources Needed

### Phase 2A
- Your time: 1-2 weeks
- Costs: Minimal (maybe Whisper API)

### Phase 2B
- Your time: 2-4 weeks
- Costs: LLM API calls (~$10-50/month)

### Phase 2C
- Your time: 4-8 weeks
- Costs: Production hosting ($20-100/month)
- Consider: Part-time designer, help with crypto implementation

---

## Success Metrics

### Phase 2A Success
- Features working reliably
- Personal use improved significantly
- Ready to consider multi-user

### Phase 2B Success
- AI features feel "magical"
- Save significant time vs. manual organization
- Friends/colleagues want to use it

### Phase 2C Success
- Production-ready code quality
- Zero-knowledge encryption working
- Can onboard first beta users
- Revenue potential validated

---

**Next Step:** Complete MVP (Tasks 4.4, 4.5, 4.6), then revisit this plan.
