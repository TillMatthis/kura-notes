-- =============================================================================
-- Migration 002: Add embedding_status field
-- =============================================================================
-- Adds embedding_status column to track embedding generation state
-- Created: 2025-11-17

-- Add embedding_status column if it doesn't exist
-- SQLite doesn't support "ADD COLUMN IF NOT EXISTS", so we check first
-- Using a safe approach: try to add column, ignore error if exists

-- Add the column with default value
ALTER TABLE content ADD COLUMN embedding_status TEXT DEFAULT 'pending';

-- Create index for embedding_status
CREATE INDEX IF NOT EXISTS idx_embedding_status ON content(embedding_status);

-- Update schema version
INSERT INTO schema_version (version, description)
VALUES (2, 'Add embedding_status field to content table');
