/**
 * KURA Notes - Authentication Routes
 *
 * Endpoints for user authentication and session management
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../../utils/logger.js';
import { ApiErrors } from '../types/errors.js';
import { getAuthenticatedUser } from '../middleware/auth.js';

/**
 * User profile response
 */
interface UserProfileResponse {
  id: string;
  email: string;
  sessionId?: string;
}

/**
 * Logout response
 */
interface LogoutResponse {
  success: true;
  message: string;
}

/**
 * Register authentication routes
 */
export async function registerAuthRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/me
   * Get current authenticated user's profile
   */
  fastify.get(
    '/api/me',
    {
      schema: {
        description: 'Get current user profile',
        tags: ['auth'],
        response: {
          200: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'User ID (UUID)' },
              email: { type: 'string', description: 'User email address' },
              sessionId: { type: 'string', description: 'Current session ID' },
            },
            required: ['id', 'email'],
          },
          401: {
            type: 'object',
            properties: {
              statusCode: { type: 'number' },
              error: { type: 'string' },
              message: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, _reply: FastifyReply): Promise<UserProfileResponse> => {
      logger.debug('GET /api/me request received');

      try {
        // Get authenticated user from request
        const user = getAuthenticatedUser(request);

        logger.info('User profile retrieved', {
          userId: user.id,
          email: user.email,
        });

        return {
          id: user.id,
          email: user.email,
          sessionId: user.sessionId,
        };
      } catch (error) {
        logger.error('Failed to get user profile', { error });

        // If it's already an API error, re-throw it
        if (error && typeof error === 'object' && 'statusCode' in error) {
          throw error;
        }

        throw ApiErrors.unauthorized('Authentication required');
      }
    }
  );

  /**
   * POST /api/logout
   * Logout current user (clears session on KOauth side)
   */
  fastify.post(
    '/api/logout',
    {
      schema: {
        description: 'Logout current user',
        tags: ['auth'],
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              message: { type: 'string' },
            },
            required: ['success', 'message'],
          },
          401: {
            type: 'object',
            properties: {
              statusCode: { type: 'number' },
              error: { type: 'string' },
              message: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, _reply: FastifyReply): Promise<LogoutResponse> => {
      logger.debug('POST /api/logout request received');

      try {
        // Verify user is authenticated
        const user = getAuthenticatedUser(request);

        logger.info('User logout requested', {
          userId: user.id,
          email: user.email,
          sessionId: user.sessionId,
        });

        // Note: Actual session invalidation happens on the KOauth server side
        // The client should clear cookies/tokens and redirect to KOauth logout endpoint
        // For now, we just acknowledge the logout request

        logger.info('User logged out successfully', {
          userId: user.id,
        });

        // Note: KOauth handles session invalidation on the auth server side
        // The client should redirect to KOauth logout endpoint to complete the logout flow
        // Example: https://auth.tillmaessen.de/logout

        return {
          success: true,
          message: 'Logged out successfully. Please redirect to KOauth logout endpoint to complete logout.',
        };
      } catch (error) {
        logger.error('Failed to logout user', { error });

        // If it's already an API error, re-throw it
        if (error && typeof error === 'object' && 'statusCode' in error) {
          throw error;
        }

        throw ApiErrors.unauthorized('Authentication required');
      }
    }
  );

  logger.info('Auth routes registered');
}
