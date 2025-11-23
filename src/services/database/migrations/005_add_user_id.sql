-- =============================================================================
-- Migration 005: Add User ID for Multi-User Support
-- =============================================================================
-- Adds user_id column to enable multi-user content isolation
-- Created: 2025-11-23
-- Part of: Task 4.7 - Multi-User Authentication Integration

-- Add user_id column to store the KOauth user ID
-- Initially nullable to allow for gradual migration of existing content
-- Format: UUID from KOauth user table
ALTER TABLE content ADD COLUMN user_id TEXT;

-- Create index for efficient user-scoped queries
-- This is critical for performance when filtering content by user
CREATE INDEX IF NOT EXISTS idx_user_id ON content(user_id);

-- Update schema version
INSERT INTO schema_version (version, description)
VALUES (5, 'Add user_id column for multi-user support');

-- =============================================================================
-- Migration Notes:
-- =============================================================================
-- 1. Existing content will have user_id = NULL after this migration
-- 2. Run the data migration script (scripts/migrate-to-multi-user.ts) to assign
--    existing content to a default user
-- 3. After data migration, consider adding NOT NULL constraint:
--    -- ALTER TABLE content ALTER COLUMN user_id SET NOT NULL; (SQLite doesn't support this)
--    -- Instead, we'll enforce this in application code
-- 4. All new content must have user_id set via application code
-- =============================================================================
