#!/usr/bin/env tsx
/**
 * Debug script to check tags storage and FTS index
 */

import { DatabaseService } from '../src/services/database/database.service.js';
import Database from 'better-sqlite3';

const DB_PATH = process.env.DATABASE_URL || '/data/metadata/knowledge.db';

console.log('🔍 Debugging Tags Storage');
console.log('Database path:', DB_PATH);
console.log('');

try {
  // Direct SQLite connection to inspect database
  const db = new Database(DB_PATH);

  // Check schema version
  console.log('📋 Schema Version:');
  const version = db.prepare('SELECT * FROM schema_version ORDER BY version DESC LIMIT 1').get();
  console.log(JSON.stringify(version, null, 2));
  console.log('');

  // Check FTS table structure
  console.log('🔧 FTS Table Structure:');
  const ftsColumns = db.pragma('table_info(content_fts)');
  console.log(JSON.stringify(ftsColumns, null, 2));
  console.log('');

  // Check specific note
  const noteId = '0177f2bc-9739-449b-bf58-6128e19f9614';
  console.log(`📝 Note ${noteId}:`);
  const note = db.prepare('SELECT id, tags, created_at, updated_at FROM content WHERE id = ?').get(noteId);
  console.log(JSON.stringify(note, null, 2));
  console.log('');

  // Check FTS data for the same note
  console.log(`🔎 FTS Data for ${noteId}:`);
  const ftsData = db.prepare(`
    SELECT fts.tags, fts.title, fts.annotation
    FROM content_fts fts
    JOIN content c ON c.rowid = fts.rowid
    WHERE c.id = ?
  `).get(noteId);
  console.log(JSON.stringify(ftsData, null, 2));
  console.log('');

  // List all notes with tags
  console.log('📚 All notes with tags:');
  const notesWithTags = db.prepare(`
    SELECT id, tags, created_at, updated_at
    FROM content
    WHERE tags IS NOT NULL AND tags != '[]'
    ORDER BY created_at DESC
    LIMIT 10
  `).all();
  console.log(JSON.stringify(notesWithTags, null, 2));
  console.log('');

  // Check triggers
  console.log('⚙️  Active Triggers:');
  const triggers = db.prepare(`
    SELECT name, sql
    FROM sqlite_master
    WHERE type = 'trigger' AND name LIKE 'content_%'
  `).all();
  console.log(JSON.stringify(triggers, null, 2));

  db.close();

} catch (error) {
  console.error('❌ Error:', error);
  process.exit(1);
}
