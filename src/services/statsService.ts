/**
 * KURA Notes - Stats Service
 *
 * Calculates and caches system statistics for the dashboard
 * Includes content counts, storage usage, and most used tags
 */

import { readdirSync, statSync } from 'fs';
import { join } from 'path';
import { logger } from '../utils/logger.js';
import { getDatabaseService } from './database/database.service.js';
import { getTagService } from './tagService.js';

/**
 * Statistics data structure
 */
export interface Stats {
  totalItems: number;
  byContentType: Record<string, number>;
  byMonth: Array<{ month: string; count: number }>;
  storageUsed: {
    bytes: number;
    formatted: string;
  };
  mostUsedTags: Array<{ tag: string; count: number }>;
  lastUpdated: string;
}

/**
 * Cache entry structure
 */
interface CacheEntry {
  data: Stats;
  timestamp: number;
}

/**
 * Stats service class
 * Singleton pattern with built-in caching
 */
export class StatsService {
  private static instance: StatsService | null = null;
  private cache: CacheEntry | null = null;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds
  private readonly contentBasePath: string;

  /**
   * Private constructor - use getInstance() instead
   */
  private constructor(contentBasePath: string) {
    this.contentBasePath = contentBasePath;
    logger.debug('StatsService initialized', { contentBasePath });
  }

  /**
   * Get or create stats service instance (singleton)
   */
  public static getInstance(contentBasePath?: string): StatsService {
    if (!StatsService.instance) {
      if (!contentBasePath) {
        throw new Error('Content base path required for first initialization');
      }
      StatsService.instance = new StatsService(contentBasePath);
    }
    return StatsService.instance;
  }

  /**
   * Reset the singleton instance (useful for testing)
   */
  public static resetInstance(): void {
    if (StatsService.instance) {
      logger.debug('Resetting stats service instance');
      StatsService.instance.cache = null;
      StatsService.instance = null;
    }
  }

  /**
   * Get statistics with caching
   * Returns cached data if fresh, otherwise calculates new stats
   * @param userId - Optional user ID to scope statistics to user's content (null for legacy content)
   */
  public getStats(userId: string | null = null): Stats {
    // Check if cache is valid
    if (this.cache && this.isCacheValid()) {
      logger.debug('Returning cached stats', { userId });
      return this.cache.data;
    }

    // Calculate new stats
    logger.debug('Cache miss or expired, calculating fresh stats', { userId });
    const stats = this.calculateStats(userId);

    // Update cache
    this.cache = {
      data: stats,
      timestamp: Date.now(),
    };

    return stats;
  }

  /**
   * Invalidate cache (call when content changes)
   */
  public invalidateCache(): void {
    logger.debug('Invalidating stats cache');
    this.cache = null;
  }

  /**
   * Check if cache is still valid
   */
  private isCacheValid(): boolean {
    if (!this.cache) {
      return false;
    }

    const age = Date.now() - this.cache.timestamp;
    return age < this.CACHE_TTL;
  }

  /**
   * Calculate all statistics
   * @param userId - Optional user ID to scope statistics to user's content (null for legacy content)
   */
  private calculateStats(userId: string | null = null): Stats {
    logger.debug('Calculating statistics...', { userId });

    const db = getDatabaseService();
    const tagService = getTagService();

    // Get content counts (filtered by user)
    const totalItems = db.getTotalContentCount(userId);
    const byContentType = db.getContentCountByType(userId);

    // Get monthly counts (filtered by user)
    const byMonth = this.calculateMonthlyStats(userId);

    // Calculate storage usage (not filtered - shows total storage)
    const storageUsed = this.calculateStorageUsage();

    // Get most used tags (top 10, filtered by user)
    const allTags = tagService.getAllTags(userId);
    const mostUsedTags = allTags
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map((tagObj) => ({ tag: tagObj.tag, count: tagObj.count }));

    const stats: Stats = {
      totalItems,
      byContentType,
      byMonth,
      storageUsed,
      mostUsedTags,
      lastUpdated: new Date().toISOString(),
    };

    logger.info('Statistics calculated successfully', {
      totalItems,
      storageBytes: storageUsed.bytes,
      tagCount: mostUsedTags.length,
    });

    return stats;
  }

  /**
   * Calculate content count by month (last 12 months)
   * @param userId - Optional user ID to scope statistics to user's content (null for legacy content)
   */
  private calculateMonthlyStats(userId: string | null = null): Array<{ month: string; count: number }> {
    const db = getDatabaseService();

    // Query for monthly counts (filtered by user if provided)
    let sql = `
      SELECT
        strftime('%Y-%m', created_at) as month,
        COUNT(*) as count
      FROM content
      WHERE created_at >= date('now', '-12 months')
    `;

    const params: any[] = [];
    if (userId) {
      sql += ' AND user_id = ?';
      params.push(userId);
    }

    sql += `
      GROUP BY month
      ORDER BY month DESC
    `;

    try {
      const results = db.raw(sql, params) as Array<{ month: string; count: number }>;
      return results;
    } catch (error) {
      logger.error('Failed to calculate monthly stats', { error });
      return [];
    }
  }

  /**
   * Calculate total storage usage
   * Recursively scans the content directory
   */
  private calculateStorageUsage(): { bytes: number; formatted: string } {
    let totalBytes = 0;

    try {
      totalBytes = this.getDirectorySize(this.contentBasePath);
    } catch (error) {
      logger.error('Failed to calculate storage usage', { error });
    }

    return {
      bytes: totalBytes,
      formatted: this.formatBytes(totalBytes),
    };
  }

  /**
   * Recursively calculate directory size
   */
  private getDirectorySize(dirPath: string): number {
    let size = 0;

    try {
      const files = readdirSync(dirPath);

      for (const file of files) {
        const filePath = join(dirPath, file);
        try {
          const stats = statSync(filePath);

          if (stats.isDirectory()) {
            size += this.getDirectorySize(filePath);
          } else {
            size += stats.size;
          }
        } catch (error) {
          // Skip files we can't access
          logger.debug('Could not access file', { filePath, error });
        }
      }
    } catch (error) {
      // Directory doesn't exist or can't be accessed
      logger.debug('Could not access directory', { dirPath, error });
    }

    return size;
  }

  /**
   * Format bytes to human-readable string
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }
}

/**
 * Export singleton instance getter
 */
export const getStatsService = (contentBasePath?: string): StatsService => {
  return StatsService.getInstance(contentBasePath);
};
