-- =============================================================================
-- Migration 003: Add Thumbnail Support and Image Metadata
-- =============================================================================
-- Adds fields for storing thumbnail paths and image metadata
-- Created: 2025-11-17

-- Add thumbnail_path column to store path to generated thumbnail
ALTER TABLE content ADD COLUMN thumbnail_path TEXT;

-- Add image_metadata column to store JSON metadata (dimensions, size, format)
ALTER TABLE content ADD COLUMN image_metadata TEXT;

-- Create index for thumbnail lookups
CREATE INDEX IF NOT EXISTS idx_thumbnail_path ON content(thumbnail_path);

-- Update schema version
INSERT INTO schema_version (version, description)
VALUES (3, 'Add thumbnail support and image metadata fields');
