-- =============================================================================
-- KURA Notes - Database Schema
-- =============================================================================
-- SQLite database schema for metadata and full-text search
-- Created: 2025-11-17
-- Version: 0.1.0

-- Enable Write-Ahead Logging for better concurrency
PRAGMA journal_mode = WAL;

-- Enable foreign key constraints
PRAGMA foreign_keys = ON;

-- =============================================================================
-- Main Content Table
-- =============================================================================
-- Stores metadata about all captured content (notes, images, PDFs, etc.)
CREATE TABLE IF NOT EXISTS content (
  id TEXT PRIMARY KEY,                  -- UUID v4
  user_id TEXT,                         -- KOauth user ID (UUID) - NULL for legacy content
  file_path TEXT NOT NULL,              -- Path to file in storage (relative)
  content_type TEXT NOT NULL,           -- 'text' | 'image' | 'pdf' | 'audio'
  title TEXT,                           -- User-provided or auto-generated title
  source TEXT,                          -- Origin: 'ios-shortcut' | 'web' | 'api'
  tags TEXT,                            -- JSON array of tags: '["tag1","tag2"]'
  annotation TEXT,                      -- User-provided context/notes
  extracted_text TEXT,                  -- Text content (for search/display)
  embedding_status TEXT DEFAULT 'pending', -- Embedding status: 'pending' | 'completed' | 'failed'
  thumbnail_path TEXT,                  -- Path to generated thumbnail (for images)
  image_metadata TEXT,                  -- JSON metadata for images: '{"width":1920,"height":1080,"format":"jpeg","size":123456}'
  pdf_metadata TEXT,                    -- JSON metadata for PDFs: '{"filename":"doc.pdf","size":123456,"pageCount":10}'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- Indexes for Performance
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_user_id ON content(user_id);
CREATE INDEX IF NOT EXISTS idx_content_type ON content(content_type);
CREATE INDEX IF NOT EXISTS idx_created_at ON content(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_updated_at ON content(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_source ON content(source);
CREATE INDEX IF NOT EXISTS idx_embedding_status ON content(embedding_status);
CREATE INDEX IF NOT EXISTS idx_thumbnail_path ON content(thumbnail_path);

-- =============================================================================
-- Full-Text Search (FTS5) Table
-- =============================================================================
-- Virtual table for fast full-text search
-- Uses content from the main content table
CREATE VIRTUAL TABLE IF NOT EXISTS content_fts USING fts5(
  title,
  annotation,
  extracted_text,
  content='content',         -- Link to content table
  content_rowid='rowid'      -- Use rowid for linking
);

-- =============================================================================
-- Triggers to Keep FTS Table in Sync
-- =============================================================================

-- Insert trigger: Add to FTS when new content is created
CREATE TRIGGER IF NOT EXISTS content_ai AFTER INSERT ON content BEGIN
  INSERT INTO content_fts(rowid, title, annotation, extracted_text)
  VALUES (new.rowid, new.title, new.annotation, new.extracted_text);
END;

-- Update trigger: Update FTS when content is modified
CREATE TRIGGER IF NOT EXISTS content_au AFTER UPDATE ON content BEGIN
  UPDATE content_fts
  SET title = new.title,
      annotation = new.annotation,
      extracted_text = new.extracted_text
  WHERE rowid = new.rowid;
END;

-- Delete trigger: Remove from FTS when content is deleted
CREATE TRIGGER IF NOT EXISTS content_ad AFTER DELETE ON content BEGIN
  DELETE FROM content_fts WHERE rowid = old.rowid;
END;

-- =============================================================================
-- Optional: Search History Table
-- =============================================================================
-- Track user searches for analytics and suggestions
CREATE TABLE IF NOT EXISTS search_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  query TEXT NOT NULL,
  results_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_search_created_at ON search_history(created_at DESC);

-- =============================================================================
-- Schema Version Table
-- =============================================================================
-- Track database migrations
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  description TEXT
);

-- Insert schema versions
INSERT OR IGNORE INTO schema_version (version, description)
VALUES (1, 'Initial schema with content, FTS, and search history tables');

INSERT OR IGNORE INTO schema_version (version, description)
VALUES (2, 'Add embedding_status field to content table');

INSERT OR IGNORE INTO schema_version (version, description)
VALUES (3, 'Add thumbnail support and image metadata fields');

INSERT OR IGNORE INTO schema_version (version, description)
VALUES (4, 'Add pdf_metadata field for PDF file information');

INSERT OR IGNORE INTO schema_version (version, description)
VALUES (5, 'Add user_id column for multi-user support');
