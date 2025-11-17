/**
 * KURA Notes - Tag Service
 *
 * Manages tag operations including:
 * - Getting all tags with usage counts
 * - Searching tags for autocomplete
 * - Renaming tags across all content
 * - Merging duplicate tags
 * - Deleting tags
 */

import { DatabaseService } from './database/database.service.js';
import { logger } from '../utils/logger.js';

/**
 * Tag with usage count
 */
export interface TagWithCount {
  tag: string;
  count: number;
}

/**
 * Tag service class
 * Singleton pattern - use getInstance() to get the instance
 */
export class TagService {
  private static instance: TagService | null = null;
  private db: DatabaseService;

  /**
   * Private constructor - use getInstance() instead
   */
  private constructor(db: DatabaseService) {
    this.db = db;
    logger.debug('TagService initialized');
  }

  /**
   * Get or create tag service instance (singleton)
   */
  public static getInstance(db?: DatabaseService): TagService {
    if (!TagService.instance) {
      if (!db) {
        throw new Error('DatabaseService required for first initialization');
      }
      TagService.instance = new TagService(db);
    }
    return TagService.instance;
  }

  /**
   * Reset the singleton instance (useful for testing)
   */
  public static resetInstance(): void {
    if (TagService.instance) {
      logger.debug('Resetting TagService instance');
      TagService.instance = null;
    }
  }

  /**
   * Get all tags with their usage counts
   * @returns Array of tags sorted by count (most used first)
   */
  public getAllTags(): TagWithCount[] {
    logger.debug('Getting all tags with counts');

    try {
      // Get all content with tags
      const stmt = this.db.raw(
        'SELECT tags FROM content WHERE tags IS NOT NULL AND tags != "[]"'
      ) as Array<{ tags: string }>;

      // Parse all tags and count occurrences
      const tagCounts = new Map<string, number>();

      for (const row of stmt) {
        try {
          const tags = JSON.parse(row.tags) as string[];
          for (const tag of tags) {
            const normalizedTag = tag.trim();
            if (normalizedTag) {
              tagCounts.set(normalizedTag, (tagCounts.get(normalizedTag) || 0) + 1);
            }
          }
        } catch (error) {
          logger.warn('Failed to parse tags from row', { error, tags: row.tags });
        }
      }

      // Convert to array and sort by count (descending)
      const result = Array.from(tagCounts.entries())
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count);

      logger.debug('Retrieved all tags', { tagCount: result.length });

      return result;
    } catch (error) {
      logger.error('Failed to get all tags', { error });
      throw error;
    }
  }

  /**
   * Search tags by query (case-insensitive)
   * Used for autocomplete functionality
   * @param query - Search query
   * @param limit - Maximum number of results (default: 20)
   * @returns Array of matching tags sorted by count
   */
  public searchTags(query: string, limit = 20): TagWithCount[] {
    logger.debug('Searching tags', { query, limit });

    if (!query || query.trim().length === 0) {
      // Return all tags if no query provided
      return this.getAllTags().slice(0, limit);
    }

    try {
      const allTags = this.getAllTags();
      const normalizedQuery = query.toLowerCase().trim();

      // Filter tags that match the query (case-insensitive)
      const matchingTags = allTags.filter((tagWithCount) =>
        tagWithCount.tag.toLowerCase().includes(normalizedQuery)
      );

      // Prioritize exact matches and prefix matches
      const sortedTags = matchingTags.sort((a, b) => {
        const aLower = a.tag.toLowerCase();
        const bLower = b.tag.toLowerCase();

        // Exact match first
        if (aLower === normalizedQuery) return -1;
        if (bLower === normalizedQuery) return 1;

        // Prefix match second
        const aStartsWith = aLower.startsWith(normalizedQuery);
        const bStartsWith = bLower.startsWith(normalizedQuery);
        if (aStartsWith && !bStartsWith) return -1;
        if (!aStartsWith && bStartsWith) return 1;

        // Then by count (already sorted by count from getAllTags)
        return b.count - a.count;
      });

      const result = sortedTags.slice(0, limit);

      logger.debug('Tag search completed', {
        query,
        resultsCount: result.length,
      });

      return result;
    } catch (error) {
      logger.error('Failed to search tags', { error, query });
      throw error;
    }
  }

  /**
   * Rename a tag across all content
   * @param oldTag - Tag name to rename
   * @param newTag - New tag name
   * @returns Number of content items updated
   */
  public renameTag(oldTag: string, newTag: string): number {
    logger.info('Renaming tag', { oldTag, newTag });

    if (!oldTag || !newTag) {
      throw new Error('Old tag and new tag are required');
    }

    if (oldTag.trim() === newTag.trim()) {
      throw new Error('Old tag and new tag must be different');
    }

    try {
      // Get all content with the old tag
      const allContent = this.db.getAllContent(10000); // Get enough content
      let updateCount = 0;

      for (const content of allContent) {
        if (content.tags && content.tags.includes(oldTag)) {
          // Replace old tag with new tag
          const updatedTags = content.tags.map((tag) =>
            tag === oldTag ? newTag : tag
          );

          // Remove duplicates (in case new tag already exists)
          const uniqueTags = Array.from(new Set(updatedTags));

          // Update content
          this.db.updateContent(content.id, { tags: uniqueTags });
          updateCount++;
        }
      }

      logger.info('Tag renamed successfully', {
        oldTag,
        newTag,
        updateCount,
      });

      return updateCount;
    } catch (error) {
      logger.error('Failed to rename tag', { error, oldTag, newTag });
      throw error;
    }
  }

  /**
   * Merge two tags into one
   * Replaces all occurrences of sourceTags with targetTag
   * @param sourceTags - Array of tag names to merge from
   * @param targetTag - Tag name to merge into
   * @returns Number of content items updated
   */
  public mergeTags(sourceTags: string[], targetTag: string): number {
    logger.info('Merging tags', { sourceTags, targetTag });

    if (!sourceTags || sourceTags.length === 0) {
      throw new Error('Source tags are required');
    }

    if (!targetTag) {
      throw new Error('Target tag is required');
    }

    try {
      const allContent = this.db.getAllContent(10000); // Get enough content
      let updateCount = 0;

      for (const content of allContent) {
        if (content.tags && content.tags.some((tag) => sourceTags.includes(tag))) {
          // Replace source tags with target tag
          const updatedTags = content.tags.map((tag) =>
            sourceTags.includes(tag) ? targetTag : tag
          );

          // Remove duplicates
          const uniqueTags = Array.from(new Set(updatedTags));

          // Update content
          this.db.updateContent(content.id, { tags: uniqueTags });
          updateCount++;
        }
      }

      logger.info('Tags merged successfully', {
        sourceTags,
        targetTag,
        updateCount,
      });

      return updateCount;
    } catch (error) {
      logger.error('Failed to merge tags', { error, sourceTags, targetTag });
      throw error;
    }
  }

  /**
   * Delete a tag from all content
   * @param tag - Tag name to delete
   * @returns Number of content items updated
   */
  public deleteTag(tag: string): number {
    logger.info('Deleting tag', { tag });

    if (!tag) {
      throw new Error('Tag is required');
    }

    try {
      const allContent = this.db.getAllContent(10000); // Get enough content
      let updateCount = 0;

      for (const content of allContent) {
        if (content.tags && content.tags.includes(tag)) {
          // Remove the tag
          const updatedTags = content.tags.filter((t) => t !== tag);

          // Update content
          this.db.updateContent(content.id, { tags: updatedTags });
          updateCount++;
        }
      }

      logger.info('Tag deleted successfully', {
        tag,
        updateCount,
      });

      return updateCount;
    } catch (error) {
      logger.error('Failed to delete tag', { error, tag });
      throw error;
    }
  }

  /**
   * Get tag statistics
   * @returns Statistics about tags
   */
  public getTagStats() {
    const allTags = this.getAllTags();

    return {
      totalTags: allTags.length,
      totalUsages: allTags.reduce((sum, tag) => sum + tag.count, 0),
      mostUsedTag: allTags[0] || null,
      leastUsedTags: allTags.filter((tag) => tag.count === 1),
    };
  }
}

/**
 * Export singleton instance getter
 */
export const getTagService = (db?: DatabaseService): TagService => {
  return TagService.getInstance(db);
};
