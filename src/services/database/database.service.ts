/**
 * KURA Notes - Database Service
 *
 * Manages SQLite database operations using better-sqlite3
 * Handles CRUD operations, migrations, and full-text search
 */

import Database from 'better-sqlite3';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../../utils/logger.js';
import type {
  Content,
  ContentRow,
  CreateContentInput,
  UpdateContentInput,
  SearchFilters,
  SearchHistory,
  SchemaVersion,
} from '../../models/content.js';

/**
 * Database service class
 * Singleton pattern - use getInstance() to get the instance
 */
export class DatabaseService {
  private static instance: DatabaseService | null = null;
  private db: Database.Database;
  private readonly dbPath: string;

  /**
   * Private constructor - use getInstance() instead
   */
  private constructor(dbPath: string) {
    this.dbPath = dbPath;

    logger.debug('Initializing database service', { dbPath });

    // Ensure database directory exists
    const dbDir = dirname(dbPath);
    if (!existsSync(dbDir)) {
      logger.info('Creating database directory', { dbDir });
      mkdirSync(dbDir, { recursive: true });
    }

    // Initialize database connection
    this.db = new Database(dbPath, {
      verbose: process.env.NODE_ENV === 'development' ? undefined : undefined,
    });

    logger.info('Database connection established', { dbPath });

    // Enable WAL mode for better concurrency
    this.db.pragma('journal_mode = WAL');
    logger.debug('WAL mode enabled for database');

    // Run migrations
    this.migrate();
  }

  /**
   * Get or create database instance (singleton)
   */
  public static getInstance(dbPath?: string): DatabaseService {
    if (!DatabaseService.instance) {
      if (!dbPath) {
        throw new Error('Database path required for first initialization');
      }
      DatabaseService.instance = new DatabaseService(dbPath);
    }
    return DatabaseService.instance;
  }

  /**
   * Reset the singleton instance (useful for testing)
   */
  public static resetInstance(): void {
    if (DatabaseService.instance) {
      logger.debug('Resetting database service instance');
      DatabaseService.instance.close();
      DatabaseService.instance = null;
    }
  }

  /**
   * Run database migrations
   */
  private migrate(): void {
    try {
      logger.info('Running database migrations...');

      // Get the directory of this file
      const __dirname = dirname(fileURLToPath(import.meta.url));
      const schemaPath = join(__dirname, 'schema.sql');

      logger.debug('Reading schema file', { schemaPath });

      // Read and execute schema
      const schema = readFileSync(schemaPath, 'utf-8');

      // Execute schema (better-sqlite3 supports multiple statements)
      this.db.exec(schema);

      // Run conditional migrations based on current schema version
      this.runConditionalMigrations();

      const version = this.getSchemaVersion();
      logger.info('Database migrations completed successfully', {
        version: version?.version,
        description: version?.description,
      });
    } catch (error) {
      logger.error('Database migration failed', { error });
      throw error;
    }
  }

  /**
   * Run conditional migrations for existing databases
   */
  private runConditionalMigrations(): void {
    const columns = this.db.pragma('table_info(content)') as Array<{ name: string }>;

    // Check if pdf_metadata column exists
    const hasPdfMetadata = columns.some((col) => col.name === 'pdf_metadata');
    if (!hasPdfMetadata) {
      logger.info('Adding pdf_metadata column to content table');
      try {
        this.db.exec('ALTER TABLE content ADD COLUMN pdf_metadata TEXT');
        logger.info('pdf_metadata column added successfully');
      } catch (error) {
        // Column might already exist, ignore error
        logger.debug('pdf_metadata column might already exist', { error });
      }
    }

    // Check if user_id column exists (Migration 005)
    const hasUserId = columns.some((col) => col.name === 'user_id');
    if (!hasUserId) {
      logger.info('Adding user_id column to content table');
      try {
        this.db.exec('ALTER TABLE content ADD COLUMN user_id TEXT');
        this.db.exec('CREATE INDEX IF NOT EXISTS idx_user_id ON content(user_id)');
        logger.info('user_id column and index added successfully');
      } catch (error) {
        // Column might already exist, ignore error
        logger.debug('user_id column might already exist', { error });
      }
    }
  }

  /**
   * Get current schema version
   */
  public getSchemaVersion(): SchemaVersion | null {
    const stmt = this.db.prepare(
      'SELECT version, applied_at, description FROM schema_version ORDER BY version DESC LIMIT 1'
    );
    return stmt.get() as SchemaVersion | null;
  }

  // =========================================================================
  // CRUD Operations - Content
  // =========================================================================

  /**
   * Create new content entry
   */
  public createContent(input: CreateContentInput): Content {
    logger.debug('Creating content', {
      id: input.id,
      userId: input.user_id,
      contentType: input.content_type,
      title: input.title,
    });

    const stmt = this.db.prepare(`
      INSERT INTO content (
        id, user_id, file_path, content_type, title, source, tags, annotation, extracted_text, embedding_status
      ) VALUES (
        @id, @user_id, @file_path, @content_type, @title, @source, @tags, @annotation, @extracted_text, 'pending'
      )
    `);

    const tagsJson = input.tags ? JSON.stringify(input.tags) : null;

    try {
      stmt.run({
        id: input.id,
        user_id: input.user_id,
        file_path: input.file_path,
        content_type: input.content_type,
        title: input.title || null,
        source: input.source || null,
        tags: tagsJson,
        annotation: input.annotation || null,
        extracted_text: input.extracted_text || null,
      });

      logger.info('Content created successfully', {
        id: input.id,
        userId: input.user_id,
        contentType: input.content_type,
      });
    } catch (error) {
      logger.error('Failed to create content', {
        error,
        id: input.id,
        userId: input.user_id,
        contentType: input.content_type,
      });
      throw error;
    }

    // Return the created content
    const created = this.getContentById(input.id, input.user_id);
    if (!created) {
      const error = new Error('Failed to retrieve created content');
      logger.error('Content creation verification failed', { id: input.id });
      throw error;
    }

    return created;
  }

  /**
   * Get content by ID with optional user ownership verification
   * @param id - Content ID
   * @param userId - Optional user ID for ownership verification
   * @returns Content if found and owned by user, null otherwise
   */
  public getContentById(id: string, userId?: string): Content | null {
    let stmt;
    let row;

    if (userId) {
      // With user ownership check
      stmt = this.db.prepare('SELECT * FROM content WHERE id = ? AND (user_id = ? OR user_id IS NULL)');
      row = stmt.get(id, userId) as ContentRow | undefined;
    } else {
      // Without user check (for backward compatibility / migration)
      stmt = this.db.prepare('SELECT * FROM content WHERE id = ?');
      row = stmt.get(id) as ContentRow | undefined;
    }

    return row ? this.mapRowToContent(row) : null;
  }

  /**
   * Get all content for a user (with optional pagination)
   * @param userId - User ID to filter content (required for multi-user, optional for migration)
   * @param limit - Maximum number of results
   * @param offset - Number of results to skip
   */
  public getAllContent(userId: string | null, limit = 100, offset = 0): Content[] {
    let stmt;
    let rows;

    if (userId) {
      stmt = this.db.prepare(
        'SELECT * FROM content WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
      );
      rows = stmt.all(userId, limit, offset) as ContentRow[];
    } else {
      // For backward compatibility during migration - returns all content
      stmt = this.db.prepare(
        'SELECT * FROM content ORDER BY created_at DESC LIMIT ? OFFSET ?'
      );
      rows = stmt.all(limit, offset) as ContentRow[];
    }

    return rows.map((row) => this.mapRowToContent(row));
  }

  /**
   * Get recent content for a user (last N items)
   * @param userId - User ID to filter content (required for multi-user)
   * @param limit - Maximum number of results
   */
  public getRecentContent(userId: string | null, limit = 20): Content[] {
    let stmt;
    let rows;

    if (userId) {
      stmt = this.db.prepare(
        'SELECT * FROM content WHERE user_id = ? ORDER BY created_at DESC LIMIT ?'
      );
      rows = stmt.all(userId, limit) as ContentRow[];
    } else {
      // For backward compatibility during migration - returns all content
      stmt = this.db.prepare(
        'SELECT * FROM content ORDER BY created_at DESC LIMIT ?'
      );
      rows = stmt.all(limit) as ContentRow[];
    }

    return rows.map((row) => this.mapRowToContent(row));
  }

  /**
   * Update content metadata with ownership verification
   * @param id - Content ID
   * @param userId - User ID for ownership verification
   * @param input - Fields to update
   * @returns Updated content if found and owned by user, null otherwise
   */
  public updateContent(id: string, userId: string | null, input: UpdateContentInput): Content | null {
    // First verify ownership
    const existing = this.getContentById(id, userId || undefined);
    if (!existing) {
      logger.warn('Content not found or not owned by user', { id, userId });
      return null;
    }

    const updates: string[] = [];
    const params: Record<string, unknown> = { id };

    // Add user_id to WHERE clause if provided
    if (userId) {
      params.user_id = userId;
    }

    if (input.title !== undefined) {
      updates.push('title = @title');
      params.title = input.title;
    }

    if (input.tags !== undefined) {
      updates.push('tags = @tags');
      params.tags = JSON.stringify(input.tags);
    }

    if (input.annotation !== undefined) {
      updates.push('annotation = @annotation');
      params.annotation = input.annotation;
    }

    if (input.extracted_text !== undefined) {
      updates.push('extracted_text = @extracted_text');
      params.extracted_text = input.extracted_text;
    }

    if (input.embedding_status !== undefined) {
      updates.push('embedding_status = @embedding_status');
      params.embedding_status = input.embedding_status;
    }

    if (input.thumbnail_path !== undefined) {
      updates.push('thumbnail_path = @thumbnail_path');
      params.thumbnail_path = input.thumbnail_path;
    }

    if (input.image_metadata !== undefined) {
      updates.push('image_metadata = @image_metadata');
      params.image_metadata = JSON.stringify(input.image_metadata);
    }

    if (input.pdf_metadata !== undefined) {
      updates.push('pdf_metadata = @pdf_metadata');
      params.pdf_metadata = JSON.stringify(input.pdf_metadata);
    }

    // Always update the updated_at timestamp
    updates.push('updated_at = CURRENT_TIMESTAMP');

    if (updates.length === 1) {
      // Only updated_at changed, nothing to update
      return this.getContentById(id, userId || undefined);
    }

    // Build WHERE clause with ownership check
    const whereClause = userId
      ? 'WHERE id = @id AND user_id = @user_id'
      : 'WHERE id = @id';

    const sql = `UPDATE content SET ${updates.join(', ')} ${whereClause}`;
    const stmt = this.db.prepare(sql);
    const result = stmt.run(params);

    if (result.changes === 0) {
      logger.warn('Update failed - content not found or not owned by user', { id, userId });
      return null;
    }

    return this.getContentById(id, userId || undefined);
  }

  /**
   * Update content tags only
   * Convenience method for bulk tag operations
   * @param id - Content ID
   * @param userId - User ID for ownership verification
   * @param tags - New tags array
   */
  public updateContentTags(id: string, userId: string | null, tags: string[]): Content | null {
    logger.debug('Updating content tags', { id, userId, tags });

    // Verify ownership first
    const existing = this.getContentById(id, userId || undefined);
    if (!existing) {
      logger.warn('Content not found or not owned by user for tag update', { id, userId });
      return null;
    }

    const whereClause = userId
      ? 'WHERE id = @id AND user_id = @user_id'
      : 'WHERE id = @id';

    const sql = `UPDATE content SET tags = @tags, updated_at = CURRENT_TIMESTAMP ${whereClause}`;
    const stmt = this.db.prepare(sql);
    const params: Record<string, unknown> = { id, tags: JSON.stringify(tags) };

    if (userId) {
      params.user_id = userId;
    }

    const result = stmt.run(params);

    if (result.changes === 0) {
      logger.warn('Tag update failed - content not found or not owned by user', { id, userId });
      return null;
    }

    return this.getContentById(id, userId || undefined);
  }

  /**
   * Delete content by ID with ownership verification
   * @param id - Content ID
   * @param userId - User ID for ownership verification
   * @returns true if deleted, false if not found or not owned by user
   */
  public deleteContent(id: string, userId: string | null): boolean {
    logger.debug('Deleting content', { id, userId });

    // Verify ownership first
    const existing = this.getContentById(id, userId || undefined);
    if (!existing) {
      logger.warn('Content not found or not owned by user for deletion', { id, userId });
      return false;
    }

    let stmt;
    let result;

    if (userId) {
      stmt = this.db.prepare('DELETE FROM content WHERE id = ? AND user_id = ?');
      result = stmt.run(id, userId);
    } else {
      // For backward compatibility during migration
      stmt = this.db.prepare('DELETE FROM content WHERE id = ?');
      result = stmt.run(id);
    }

    const deleted = result.changes > 0;

    if (deleted) {
      logger.info('Content deleted successfully', { id, userId });
    } else {
      logger.warn('Content deletion failed - not found or not owned by user', { id, userId });
    }

    return deleted;
  }

  /**
   * Get content count by type for a user
   * @param userId - User ID to filter content
   */
  public getContentCountByType(userId: string | null): Record<string, number> {
    let stmt;
    let rows;

    if (userId) {
      stmt = this.db.prepare(
        'SELECT content_type, COUNT(*) as count FROM content WHERE user_id = ? GROUP BY content_type'
      );
      rows = stmt.all(userId) as Array<{ content_type: string; count: number }>;
    } else {
      // For backward compatibility during migration
      stmt = this.db.prepare(
        'SELECT content_type, COUNT(*) as count FROM content GROUP BY content_type'
      );
      rows = stmt.all() as Array<{ content_type: string; count: number }>;
    }

    return rows.reduce(
      (acc, row) => {
        acc[row.content_type] = row.count;
        return acc;
      },
      {} as Record<string, number>
    );
  }

  /**
   * Get total content count for a user
   * @param userId - User ID to filter content
   */
  public getTotalContentCount(userId: string | null): number {
    let stmt;
    let result;

    if (userId) {
      stmt = this.db.prepare('SELECT COUNT(*) as count FROM content WHERE user_id = ?');
      result = stmt.get(userId) as { count: number };
    } else {
      // For backward compatibility during migration
      stmt = this.db.prepare('SELECT COUNT(*) as count FROM content');
      result = stmt.get() as { count: number };
    }

    return result.count;
  }

  // =========================================================================
  // Full-Text Search
  // =========================================================================

  /**
   * Search content using FTS5 with user isolation
   * @param query - Search query
   * @param userId - User ID to filter content
   * @param limit - Maximum number of results
   */
  public searchContent(query: string, userId: string | null, limit = 10): Content[] {
    logger.debug('Searching content with FTS', { query, userId, limit });

    let sql;
    let params;

    if (userId) {
      sql = `
        SELECT c.*
        FROM content_fts fts
        JOIN content c ON c.rowid = fts.rowid
        WHERE content_fts MATCH ? AND c.user_id = ?
        ORDER BY rank
        LIMIT ?
      `;
      params = [query, userId, limit];
    } else {
      // For backward compatibility during migration
      sql = `
        SELECT c.*
        FROM content_fts fts
        JOIN content c ON c.rowid = fts.rowid
        WHERE content_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `;
      params = [query, limit];
    }

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as ContentRow[];

    logger.debug('Search completed', {
      query,
      userId,
      resultsCount: rows.length,
    });

    return rows.map((row) => this.mapRowToContent(row));
  }

  /**
   * Search content with filters and user isolation
   * @param query - Search query
   * @param userId - User ID to filter content
   * @param filters - Additional search filters
   * @param limit - Maximum number of results
   */
  public searchWithFilters(
    query: string,
    userId: string | null,
    filters: SearchFilters,
    limit = 10
  ): Content[] {
    let sql = `
      SELECT c.*
      FROM content_fts fts
      JOIN content c ON c.rowid = fts.rowid
      WHERE content_fts MATCH ?
    `;

    const params: unknown[] = [query];

    // Add user filter (CRITICAL for multi-user isolation)
    if (userId) {
      sql += ' AND c.user_id = ?';
      params.push(userId);
    }

    // Add content type filter
    if (filters.contentTypes && filters.contentTypes.length > 0) {
      const placeholders = filters.contentTypes.map(() => '?').join(',');
      sql += ` AND c.content_type IN (${placeholders})`;
      params.push(...filters.contentTypes);
    }

    // Add date range filters
    if (filters.dateFrom) {
      sql += ' AND c.created_at >= ?';
      params.push(filters.dateFrom);
    }

    if (filters.dateTo) {
      sql += ' AND c.created_at <= ?';
      params.push(filters.dateTo);
    }

    // Add source filter
    if (filters.source) {
      sql += ' AND c.source = ?';
      params.push(filters.source);
    }

    // Add tags filter (simple contains check)
    if (filters.tags && filters.tags.length > 0) {
      const tagConditions = filters.tags.map(() => 'c.tags LIKE ?').join(' OR ');
      sql += ` AND (${tagConditions})`;
      params.push(...filters.tags.map((tag) => `%"${tag}"%`));
    }

    sql += ' ORDER BY rank LIMIT ?';
    params.push(limit);

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as ContentRow[];

    return rows.map((row) => this.mapRowToContent(row));
  }

  // =========================================================================
  // Search History
  // =========================================================================

  /**
   * Save search query to history
   */
  public saveSearchHistory(query: string, resultsCount: number): void {
    const stmt = this.db.prepare(`
      INSERT INTO search_history (query, results_count)
      VALUES (?, ?)
    `);

    stmt.run(query, resultsCount);
  }

  /**
   * Get recent search history
   */
  public getSearchHistory(limit = 10): SearchHistory[] {
    const stmt = this.db.prepare(
      'SELECT * FROM search_history ORDER BY created_at DESC LIMIT ?'
    );

    return stmt.all(limit) as SearchHistory[];
  }

  // =========================================================================
  // Utility Methods
  // =========================================================================

  /**
   * Map database row to Content object
   * Handles JSON parsing for tags, image_metadata, and pdf_metadata
   */
  private mapRowToContent(row: ContentRow): Content {
    return {
      ...row,
      tags: row.tags ? JSON.parse(row.tags) : [],
      image_metadata: row.image_metadata ? JSON.parse(row.image_metadata) : null,
      pdf_metadata: row.pdf_metadata ? JSON.parse(row.pdf_metadata) : null,
    };
  }

  /**
   * Get database statistics
   */
  public getStats() {
    return {
      totalContent: this.getTotalContentCount(),
      byType: this.getContentCountByType(),
      schemaVersion: this.getSchemaVersion(),
      databasePath: this.dbPath,
    };
  }

  /**
   * Execute raw SQL (for testing/debugging)
   * Use with caution!
   */
  public raw(sql: string, params: unknown[] = []): unknown {
    const stmt = this.db.prepare(sql);
    return stmt.all(...params);
  }

  /**
   * Close database connection
   */
  public close(): void {
    logger.info('Closing database connection', { dbPath: this.dbPath });
    this.db.close();
    logger.debug('Database connection closed');
  }

  /**
   * Check if database is healthy
   */
  public healthCheck(): boolean {
    try {
      const stmt = this.db.prepare('SELECT 1 as health');
      const result = stmt.get() as { health: number };
      const isHealthy = result.health === 1;

      if (isHealthy) {
        logger.debug('Database health check passed');
      } else {
        logger.warn('Database health check returned unexpected value', { result });
      }

      return isHealthy;
    } catch (error) {
      logger.error('Database health check failed', { error });
      return false;
    }
  }
}

/**
 * Export singleton instance getter
 */
export const getDatabaseService = (dbPath?: string): DatabaseService => {
  return DatabaseService.getInstance(dbPath);
};
