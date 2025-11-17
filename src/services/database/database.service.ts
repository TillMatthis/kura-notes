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
      contentType: input.content_type,
      title: input.title,
    });

    const stmt = this.db.prepare(`
      INSERT INTO content (
        id, file_path, content_type, title, source, tags, annotation, extracted_text, embedding_status
      ) VALUES (
        @id, @file_path, @content_type, @title, @source, @tags, @annotation, @extracted_text, 'pending'
      )
    `);

    const tagsJson = input.tags ? JSON.stringify(input.tags) : null;

    try {
      stmt.run({
        id: input.id,
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
        contentType: input.content_type,
      });
    } catch (error) {
      logger.error('Failed to create content', {
        error,
        id: input.id,
        contentType: input.content_type,
      });
      throw error;
    }

    // Return the created content
    const created = this.getContentById(input.id);
    if (!created) {
      const error = new Error('Failed to retrieve created content');
      logger.error('Content creation verification failed', { id: input.id });
      throw error;
    }

    return created;
  }

  /**
   * Get content by ID
   */
  public getContentById(id: string): Content | null {
    const stmt = this.db.prepare('SELECT * FROM content WHERE id = ?');
    const row = stmt.get(id) as ContentRow | undefined;

    return row ? this.mapRowToContent(row) : null;
  }

  /**
   * Get all content (with optional pagination)
   */
  public getAllContent(limit = 100, offset = 0): Content[] {
    const stmt = this.db.prepare(
      'SELECT * FROM content ORDER BY created_at DESC LIMIT ? OFFSET ?'
    );
    const rows = stmt.all(limit, offset) as ContentRow[];

    return rows.map((row) => this.mapRowToContent(row));
  }

  /**
   * Get recent content (last N items)
   */
  public getRecentContent(limit = 20): Content[] {
    const stmt = this.db.prepare(
      'SELECT * FROM content ORDER BY created_at DESC LIMIT ?'
    );
    const rows = stmt.all(limit) as ContentRow[];

    return rows.map((row) => this.mapRowToContent(row));
  }

  /**
   * Update content metadata
   */
  public updateContent(id: string, input: UpdateContentInput): Content | null {
    const updates: string[] = [];
    const params: Record<string, unknown> = { id };

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

    // Always update the updated_at timestamp
    updates.push('updated_at = CURRENT_TIMESTAMP');

    if (updates.length === 1) {
      // Only updated_at changed, nothing to update
      return this.getContentById(id);
    }

    const sql = `UPDATE content SET ${updates.join(', ')} WHERE id = @id`;
    const stmt = this.db.prepare(sql);
    stmt.run(params);

    return this.getContentById(id);
  }

  /**
   * Delete content by ID
   */
  public deleteContent(id: string): boolean {
    logger.debug('Deleting content', { id });

    const stmt = this.db.prepare('DELETE FROM content WHERE id = ?');
    const result = stmt.run(id);

    const deleted = result.changes > 0;

    if (deleted) {
      logger.info('Content deleted successfully', { id });
    } else {
      logger.warn('Content not found for deletion', { id });
    }

    return deleted;
  }

  /**
   * Get content count by type
   */
  public getContentCountByType(): Record<string, number> {
    const stmt = this.db.prepare(
      'SELECT content_type, COUNT(*) as count FROM content GROUP BY content_type'
    );
    const rows = stmt.all() as Array<{ content_type: string; count: number }>;

    return rows.reduce(
      (acc, row) => {
        acc[row.content_type] = row.count;
        return acc;
      },
      {} as Record<string, number>
    );
  }

  /**
   * Get total content count
   */
  public getTotalContentCount(): number {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM content');
    const result = stmt.get() as { count: number };

    return result.count;
  }

  // =========================================================================
  // Full-Text Search
  // =========================================================================

  /**
   * Search content using FTS5
   */
  public searchContent(query: string, limit = 10): Content[] {
    logger.debug('Searching content with FTS', { query, limit });

    const stmt = this.db.prepare(`
      SELECT c.*
      FROM content_fts fts
      JOIN content c ON c.rowid = fts.rowid
      WHERE content_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `);

    const rows = stmt.all(query, limit) as ContentRow[];

    logger.debug('Search completed', {
      query,
      resultsCount: rows.length,
    });

    return rows.map((row) => this.mapRowToContent(row));
  }

  /**
   * Search content with filters
   */
  public searchWithFilters(
    query: string,
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
   * Handles JSON parsing for tags
   */
  private mapRowToContent(row: ContentRow): Content {
    return {
      ...row,
      tags: row.tags ? JSON.parse(row.tags) : [],
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
