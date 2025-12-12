#!/usr/bin/env node

/**
 * KURA Notes - STDIO MCP Server
 *
 * Exposes KURA Notes API through Model Context Protocol (MCP) using STDIO transport.
 * This is the correct transport for Claude Desktop, which does NOT support SSE.
 *
 * Usage: Configure Claude Desktop to run this script with environment variables:
 * - API_KEY: Your KOauth API key
 * - KURA_API_URL: URL to KURA API (default: http://api:3000)
 * - KOAUTH_URL: KOauth base URL (default: https://auth.tillmaessen.de)
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import dotenv from 'dotenv';
import { initAuth, authenticate, type AuthenticatedUser } from './auth.js';

// Load environment variables
dotenv.config({ path: '../.env' });

// Configuration
const NODE_ENV = process.env.NODE_ENV || 'development';
const KURA_API_URL = process.env.KURA_API_URL || 'http://api:3000';
const KOAUTH_URL = process.env.KOAUTH_URL || 'https://auth.tillmaessen.de';
const KOAUTH_TIMEOUT = parseInt(process.env.KOAUTH_TIMEOUT || '5000', 10);
const API_KEY = process.env.API_KEY || '';

// Initialize authentication module
initAuth({
  baseUrl: KOAUTH_URL,
  timeout: KOAUTH_TIMEOUT,
});

// Log to stderr (stdout is used for MCP protocol messages)
console.error('KURA MCP Server (STDIO) Configuration:', {
  nodeEnv: NODE_ENV,
  kuraApiUrl: KURA_API_URL,
  koauthUrl: KOAUTH_URL,
  koauthTimeout: KOAUTH_TIMEOUT,
  hasApiKey: !!API_KEY,
});

// Type definitions for KURA API responses
interface KuraSearchResult {
  id: string;
  title: string | null;
  excerpt: string;
  contentType: string;
  relevanceScore: number;
  metadata: {
    tags: string[];
    createdAt: string;
    updatedAt: string;
    source: string | null;
    annotation: string | null;
  };
}

interface KuraSearchResponse {
  results: KuraSearchResult[];
  totalResults: number;
  searchMethod: string;
  query: string;
}

interface KuraCaptureResponse {
  success: boolean;
  id: string;
  message: string;
}

interface KuraContentMetadata {
  id: string;
  content_type: string;
  title: string | null;
  annotation: string | null;
  tags: string[];
  source: string | null;
  created_at: string;
  updated_at: string;
}

interface KuraContentResponse extends KuraContentMetadata {
  content: string;
}

interface KuraRecentResponse {
  success: boolean;
  items: KuraContentMetadata[];
  count: number;
}

interface KuraDeleteResponse {
  success: boolean;
  message: string;
}

interface KuraUpdateResponse {
  success: boolean;
  content: KuraContentMetadata;
  message: string;
  timestamp: string;
}

// Authenticated user (single user per STDIO process)
let authenticatedUser: AuthenticatedUser | null = null;

/**
 * Initialize authentication from API_KEY environment variable
 */
async function initializeAuth(): Promise<void> {
  if (!API_KEY) {
    console.error('ERROR: API_KEY environment variable is required');
    console.error('Please set API_KEY in your Claude Desktop configuration');
    process.exit(1);
  }

  // Authenticate using the API key
  authenticatedUser = await authenticate(`Bearer ${API_KEY}`);

  if (!authenticatedUser) {
    console.error('ERROR: Failed to authenticate with provided API_KEY');
    console.error('Please verify your API key is valid');
    process.exit(1);
  }

  console.error('Authenticated as:', {
    userId: authenticatedUser.id,
    email: authenticatedUser.email,
    tokenType: authenticatedUser.tokenType,
  });
}

/**
 * Make authenticated request to KURA API
 */
async function callKuraAPI(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  const url = `${KURA_API_URL}${endpoint}`;

  // Build headers
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (authenticatedUser) {
    // Use authenticated user's token
    headers['Authorization'] = `Bearer ${authenticatedUser.token}`;
  } else if (NODE_ENV !== 'production') {
    // Development fallback: Use test headers
    // NOTE: This only works if the KURA API is running in non-production mode
    headers['x-test-user-id'] = 'mcp-test-user';
    headers['x-test-user-email'] = 'mcp@test.local';
  } else {
    // Production without authentication - this should not happen
    console.error('Attempting to call KURA API without authentication in production');
    throw new Error('Authentication required');
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  return response;
}

/**
 * Initialize MCP Server
 */
function createMCPServer(): Server {
  const server = new Server(
    {
      name: 'kura-notes',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Register available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'kura_search',
          description:
            'Search notes semantically using natural language. Returns relevant notes with their content, metadata, and relevance scores.',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Natural language search query',
              },
              limit: {
                type: 'number',
                description: 'Maximum number of results (default: 10, max: 50)',
                default: 10,
              },
              contentType: {
                type: 'string',
                description:
                  'Filter by content type (comma-separated): text, image, pdf, audio',
              },
              tags: {
                type: 'string',
                description: 'Filter by tags (comma-separated)',
              },
              dateFrom: {
                type: 'string',
                description: 'Filter by created date >= this ISO 8601 date (e.g., 2024-01-01 or 2024-01-01T00:00:00Z)',
              },
              dateTo: {
                type: 'string',
                description: 'Filter by created date <= this ISO 8601 date (e.g., 2024-12-31 or 2024-12-31T23:59:59Z)',
              },
            },
            required: ['query'],
          },
        },
        {
          name: 'kura_create',
          description:
            'Create a new text note in KURA. Returns the ID of the created note.',
          inputSchema: {
            type: 'object',
            properties: {
              content: {
                type: 'string',
                description: 'The text content of the note',
              },
              title: {
                type: 'string',
                description: 'Optional title for the note',
              },
              annotation: {
                type: 'string',
                description: 'Optional annotation/comment about the note',
              },
              tags: {
                type: 'array',
                items: { type: 'string' },
                description:
                  'Optional tags (alphanumeric with dashes/underscores, max 50 chars each)',
              },
            },
            required: ['content'],
          },
        },
        {
          name: 'kura_get',
          description:
            'Get a specific note by ID. Returns full note content and metadata.',
          inputSchema: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                description: 'The unique ID of the note',
              },
            },
            required: ['id'],
          },
        },
        {
          name: 'kura_list_recent',
          description:
            'List recent notes (last 20). Returns metadata only, not full content.',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'kura_delete',
          description:
            'Delete a note by ID. This action is permanent and cannot be undone.',
          inputSchema: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                description: 'The ID of the note to delete',
              },
            },
            required: ['id'],
          },
        },
        {
          name: 'kura_update',
          description:
            'Update a note\'s metadata (title, annotation, tags). Cannot update content itself.',
          inputSchema: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                description: 'The unique ID of the note to update',
              },
              title: {
                type: 'string',
                description: 'New title for the note (max 200 characters)',
              },
              annotation: {
                type: 'string',
                description: 'New annotation/comment for the note (max 5000 characters)',
              },
              tags: {
                type: 'array',
                items: { type: 'string' },
                description: 'New tags array (replaces existing tags, max 20 tags)',
              },
            },
            required: ['id'],
          },
        },
        {
          name: 'kura_list',
          description:
            'List notes with flexible pagination. Returns metadata only, not full content.',
          inputSchema: {
            type: 'object',
            properties: {
              limit: {
                type: 'number',
                description: 'Maximum number of results (default: 20, max: 100)',
                default: 20,
              },
              offset: {
                type: 'number',
                description: 'Number of results to skip for pagination (default: 0)',
                default: 0,
              },
            },
          },
        },
      ],
    };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (!authenticatedUser) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                error: 'Authentication required. Please set API_KEY environment variable.',
              },
              null,
              2
            ),
          },
        ],
        isError: true,
      };
    }

    try {
      switch (name) {
        case 'kura_search': {
          const { query, limit = 10, contentType, tags, dateFrom, dateTo } = args as {
            query: string;
            limit?: number;
            contentType?: string;
            tags?: string;
            dateFrom?: string;
            dateTo?: string;
          };

          // Build query parameters
          const params = new URLSearchParams({
            query,
            limit: String(limit),
          });

          if (contentType) params.append('contentType', contentType);
          if (tags) params.append('tags', tags);
          if (dateFrom) params.append('dateFrom', dateFrom);
          if (dateTo) params.append('dateTo', dateTo);

          const response = await callKuraAPI(`/api/search?${params}`);

          if (!response.ok) {
            const error = await response.text();
            throw new Error(`Search failed: ${response.status} - ${error}`);
          }

          const data = (await response.json()) as KuraSearchResponse;

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    results: data.results,
                    totalResults: data.totalResults,
                    searchMethod: data.searchMethod,
                    query: data.query,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        case 'kura_create': {
          const { content, title, annotation, tags } = args as {
            content: string;
            title?: string;
            annotation?: string;
            tags?: string[];
          };

          const response = await callKuraAPI('/api/capture', {
            method: 'POST',
            body: JSON.stringify({
              content,
              title,
              annotation,
              tags,
              contentType: 'text',
            }),
          });

          if (!response.ok) {
            const error = await response.text();
            throw new Error(`Create failed: ${response.status} - ${error}`);
          }

          const data = (await response.json()) as KuraCaptureResponse;

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    success: true,
                    id: data.id,
                    message: data.message,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        case 'kura_get': {
          const { id } = args as { id: string };

          if (!id) {
            throw new Error('Note ID is required');
          }

          const response = await callKuraAPI(`/api/content/${id}`);

          if (!response.ok) {
            if (response.status === 404) {
              throw new Error(`Note not found: ${id}`);
            }
            const error = await response.text();
            throw new Error(`Get failed: ${response.status} - ${error}`);
          }

          const data = (await response.json()) as KuraContentResponse;

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    id: data.id,
                    content_type: data.content_type,
                    title: data.title,
                    annotation: data.annotation,
                    tags: data.tags,
                    source: data.source,
                    created_at: data.created_at,
                    updated_at: data.updated_at,
                    content: data.content,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        case 'kura_list_recent': {
          const response = await callKuraAPI('/api/content/recent');

          if (!response.ok) {
            const error = await response.text();
            throw new Error(
              `List recent failed: ${response.status} - ${error}`
            );
          }

          const data = (await response.json()) as KuraRecentResponse;

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    success: true,
                    items: data.items,
                    count: data.count,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        case 'kura_delete': {
          const { id } = args as { id: string };

          if (!id) {
            throw new Error('Note ID is required');
          }

          const response = await callKuraAPI(`/api/content/${id}`, {
            method: 'DELETE',
          });

          if (!response.ok) {
            if (response.status === 404) {
              throw new Error(`Note not found: ${id}`);
            }
            const error = await response.text();
            throw new Error(`Delete failed: ${response.status} - ${error}`);
          }

          const data = (await response.json()) as KuraDeleteResponse;

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    success: true,
                    message: data.message,
                    id,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        case 'kura_update': {
          const { id, title, annotation, tags } = args as {
            id: string;
            title?: string;
            annotation?: string;
            tags?: string[];
          };

          if (!id) {
            throw new Error('Note ID is required');
          }

          // Build update payload with only provided fields
          const updatePayload: {
            title?: string;
            annotation?: string;
            tags?: string[];
          } = {};

          if (title !== undefined) updatePayload.title = title;
          if (annotation !== undefined) updatePayload.annotation = annotation;
          if (tags !== undefined) updatePayload.tags = tags;

          const response = await callKuraAPI(`/api/content/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(updatePayload),
          });

          if (!response.ok) {
            if (response.status === 404) {
              throw new Error(`Note not found: ${id}`);
            }
            const error = await response.text();
            throw new Error(`Update failed: ${response.status} - ${error}`);
          }

          const data = (await response.json()) as KuraUpdateResponse;

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    success: true,
                    content: data.content,
                    message: data.message,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        case 'kura_list': {
          const { limit = 20, offset = 0 } = args as {
            limit?: number;
            offset?: number;
          };

          // Build query parameters
          const params = new URLSearchParams({
            limit: String(limit),
            offset: String(offset),
          });

          const response = await callKuraAPI(`/api/content/list?${params}`);

          if (!response.ok) {
            const error = await response.text();
            throw new Error(`List failed: ${response.status} - ${error}`);
          }

          const data = (await response.json()) as KuraRecentResponse;

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    success: true,
                    items: data.items,
                    count: data.count,
                    limit,
                    offset,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      
      // Log error to stderr (but don't log tokens)
      console.error(`Tool call error for ${name}:`, {
        error: errorMessage,
        userId: authenticatedUser?.id,
        hasUser: !!authenticatedUser,
      });

      // Return user-friendly error message
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                error: errorMessage,
                tool: name,
              },
              null,
              2
            ),
          },
        ],
        isError: true,
      };
    }
  });

  return server;
}

/**
 * Main function - Start STDIO MCP server
 */
async function main() {
  try {
    // Initialize authentication
    await initializeAuth();

    // Create MCP server
    const server = createMCPServer();

    // Set up STDIO transport
    const transport = new StdioServerTransport();
    await server.connect(transport);

    // Log to stderr that we're ready
    console.error('✅ KURA MCP Server (STDIO) ready');
  } catch (error) {
    console.error('Failed to start MCP server:', error);
    process.exit(1);
  }
}

// Start the server
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
