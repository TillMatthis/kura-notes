# Second Brain - Solution Overview

## High-Level Approach

We're building a unified knowledge capture and retrieval system that accepts any input type, stores it centrally, and makes it queryable through conversational AI. The system acts as a "big funnel" - users dump content in without organization, and AI handles contextual retrieval.

## Core Components

### 1. Capture Layer (API Endpoint)
**Purpose:** Accept content from anywhere with minimal friction

**Implementation:**
- REST API endpoint accepting POST requests
- Handles multiple content types: text, images, PDFs, audio files
- iOS shortcuts can hit the endpoint via share sheet
- Later: web form, desktop shortcuts, browser extensions

**Key Feature:** No complex organization required at input time - just dump and go.

### 2. Storage Layer
**Purpose:** Persistent, queryable storage of all content

**Implementation:**
- Docker container deployment (runs on Proxmox homeserver)
- File-based storage with metadata database (SQLite for MVP)
- Each piece of content stored as individual file with metadata
- Open file/folder structure (not locked in proprietary format)

**Security Approach:**
- MVP: Standard encryption (at rest + in transit)
- Pre-commercial: Architect for zero-knowledge encryption migration
- Commercial: Zero-knowledge encryption (client-side keys, operator cannot access)

### 3. Processing & Indexing Layer
**Purpose:** Make content semantically searchable

**Implementation:**
- Vector embeddings for semantic search
- Local vector database (ChromaDB or similar)
- Automatic metadata extraction (date, source, content type)
- Manual categorization option (user can add tags/context)
- Future: AI auto-categorization

**Why Vectors:** Enables semantic search ("project timeline" finds "schedule") vs. just keyword matching.

### 4. Retrieval Layer
**Purpose:** Query knowledge through natural language

**Implementation:**
- **Primary:** MCP server for Claude Desktop integration
  - Expose search functions to Claude
  - Claude can query user's knowledge base naturally
- **Secondary:** REST API for universal access
  - Any LLM can access via API
  - Future integrations, apps, tools

**User Experience:**
- Ask Claude: "What do I know about Project X?"
- Claude searches the knowledge base using MCP
- Returns contextualized answer with sources

### 5. Interface Layer (Minimal for MVP)
**Purpose:** Backup access and basic management

**Implementation:**
- Lean web interface for emergency access
- View/search without Claude if needed
- Not the primary interaction method

## User Flow

### Capture Flow
1. User encounters something worth remembering (note, photo, article, audio)
2. Uses iOS share sheet → triggers shortcut
3. Shortcut sends content to API endpoint via POST
4. System stores file + creates metadata + generates embeddings
5. Content immediately searchable

### Retrieval Flow
1. User asks Claude a question via Claude Desktop
2. Claude uses MCP to call search function on knowledge base
3. Vector search finds semantically relevant content
4. Claude synthesizes answer from user's own knowledge
5. User gets contextualized response with source references

## Key Differentiators

### vs. Existing Solutions

**vs. Obsidian/Joplin:**
- No third-party dependency
- True AI-native retrieval (not just search)
- Platform-agnostic capture

**vs. Notion/Apple Notes:**
- Conversational AI access as primary interface
- Open, portable data format
- Self-hosted option

**vs. Mem.ai/Reflect:**
- LLM-agnostic (not locked to one AI provider)
- Self-hostable
- Future: zero-knowledge encryption

**vs. Limitless/Rewind:**
- Intentional capture (not surveillance)
- No hardware dependency
- Platform-independent

**vs. Nothing Essential Space:**
- Works on ANY device (not hardware-locked)
- More powerful AI integration
- Portable across platforms

## Technical Philosophy

### Design Principles

1. **Friction-free capture** - One tap/click to save anything
2. **Own your data** - Open formats, self-hostable, exportable
3. **AI-native** - Designed for conversational retrieval, not manual search
4. **Platform-agnostic** - Works everywhere, not locked to ecosystem
5. **Privacy-first** - Path to zero-knowledge encryption for commercial use

### Architecture Decisions

**Why API endpoint over watched folder:**
- Works from mobile (share sheet)
- Works from web
- Works from any platform
- Extensible to any source

**Why Docker:**
- Portable (homelab → commercial hosting)
- Isolated dependencies
- Easy updates and deployment
- Standard packaging for users

**Why local vector store:**
- No external dependencies
- Privacy (data never leaves server)
- Lower cost
- Sufficient performance for personal use

**Why MCP + API (both):**
- MCP: Best Claude Desktop integration
- API: Universal access, future-proof
- Flexibility for different use cases

## Success Criteria

### MVP Success (Personal Use)
- Can capture from iOS in <5 seconds
- Can query knowledge via Claude Desktop
- Semantic search works (finds related content, not just keywords)
- Handles text, images, PDFs reliably

### Commercial Success
- Zero-knowledge encryption implemented
- Multi-user support
- <2 second query response time
- 99.9% uptime
- Users report it as "indispensable"

## What This Enables

### Immediate (MVP)
- Stop losing important information
- Find anything you've captured through conversation
- Leverage accumulated knowledge effectively

### Near-term (Year 1-2)
- Proactive suggestions (AI surfaces relevant knowledge automatically)
- Cross-reference discoveries (AI finds connections you didn't see)
- Team/collaboration features

### Long-term (Vision)
- Ambient context layer (every AI interaction draws from your knowledge)
- Personal AI substrate (your knowledge becomes part of AI's understanding of you)
- Infrastructure (not an "app" but a foundational layer)

## Next Steps

With this solution approach defined, we need:
1. Technical Architecture (detailed system design)
2. MVP Scope & Requirements (what specifically gets built first)
3. Build Phases & Checklist (ordered development plan)
