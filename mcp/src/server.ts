#!/usr/bin/env node

/**
 * KURA Notes - Remote MCP Server
 *
 * Exposes KURA Notes API through Model Context Protocol (MCP) using SSE transport.
 * This allows AI assistants like Claude Desktop to interact with your notes remotely.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import express, { Request, Response as ExpressResponse } from 'express';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '../.env' });

// Configuration
const PORT = parseInt(process.env.MCP_PORT || '3001', 10);
const NODE_ENV = process.env.NODE_ENV || 'development';
const API_KEY = process.env.API_KEY;
const KURA_API_URL = process.env.KURA_API_URL || 'http://api:3000';

// API_KEY validation and warnings
if (!API_KEY) {
  console.warn('⚠️  WARNING: API_KEY environment variable is not set');
  console.warn('');
  if (NODE_ENV === 'production') {
    console.warn('Running in PRODUCTION mode without API_KEY:');
    console.warn('  - API requests will likely fail with authentication errors');
    console.warn('  - API key authentication with KOauth is not yet fully implemented');
    console.warn('  - Consider setting up session-based auth or API key with KOauth');
    console.warn('');
    console.warn('MCP server will start but may not function properly.');
  } else {
    console.warn('Running in DEVELOPMENT mode without API_KEY:');
    console.warn('  - Using test user headers for authentication (x-test-user-id)');
    console.warn('  - This only works in non-production KURA API environments');
  }
  console.warn('');
}

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

/**
 * Make authenticated request to KURA API
 */
async function callKuraAPI(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  const url = `${KURA_API_URL}${endpoint}`;

  // Build headers based on authentication method
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (API_KEY) {
    // Use API key authentication (when KOauth API key validation is implemented)
    headers['Authorization'] = `Bearer ${API_KEY}`;
  } else {
    // No API_KEY set: Use test headers
    // NOTE: This only works if the KURA API is running in non-production mode
    // because koauth-client.ts only accepts test headers when NODE_ENV !== 'production'
    headers['x-test-user-id'] = 'mcp-test-user';
    headers['x-test-user-email'] = 'mcp@test.local';
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
                description: 'The unique ID of the note to delete',
              },
            },
            required: ['id'],
          },
        },
      ],
    };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'kura_search': {
          const { query, limit = 10, contentType, tags } = args as {
            query: string;
            limit?: number;
            contentType?: string;
            tags?: string;
          };

          // Build query parameters
          const params = new URLSearchParams({
            query,
            limit: String(limit),
          });

          if (contentType) params.append('contentType', contentType);
          if (tags) params.append('tags', tags);

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
          // DEBUG: Log what we receive from Claude
          console.log('[DEBUG] kura_create args from Claude:', JSON.stringify(args, null, 2));

          const { content, title, annotation, tags, metadata } = args as {
            content: string;
            title?: string;
            annotation?: string;
            tags?: string[];
            metadata?: {
              title?: string;
              tags?: string[];
              annotation?: string;
            };
          };

          // Handle both direct fields and metadata object (in case Claude wraps them)
          const finalTitle = title || metadata?.title;
          const finalAnnotation = annotation || metadata?.annotation;
          const finalTags = tags || metadata?.tags;

          const requestBody = {
            content,
            title: finalTitle,
            annotation: finalAnnotation,
            tags: finalTags,
            contentType: 'text' as const,
          };

          // DEBUG: Log what we're sending
          console.log('[DEBUG] kura_create request body:', JSON.stringify(requestBody, null, 2));

          const response = await callKuraAPI('/api/capture', {
            method: 'POST',
            body: JSON.stringify(requestBody),
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

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                error: errorMessage,
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
 * Start Express server with SSE transport
 */
async function main() {
  const app = express();
  const mcpServer = createMCPServer();

  // Health check endpoint
  app.get('/health', (_req: Request, res: ExpressResponse) => {
    res.json({
      status: 'ok',
      service: 'kura-mcp-server',
      version: '0.1.0',
      timestamp: new Date().toISOString(),
    });
  });

  // SSE endpoint for MCP
  app.get('/sse', async (req: Request, res: ExpressResponse) => {
    console.log('New SSE connection from:', req.ip);

    const transport = new SSEServerTransport('/message', res);
    await mcpServer.connect(transport);

    // Handle connection close
    req.on('close', () => {
      console.log('SSE connection closed:', req.ip);
    });
  });

  // POST endpoint for client messages
  app.post('/message', express.json(), async (_req: Request, res: ExpressResponse) => {
    // This endpoint is used by the SSE transport to receive messages from the client
    // The actual handling is done by the transport
    res.status(200).send();
  });

  // Start server
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`KURA MCP Server running on port ${PORT}`);
    console.log(`SSE endpoint: http://localhost:${PORT}/sse`);
    console.log(`Health check: http://localhost:${PORT}/health`);
    console.log(`KURA API URL: ${KURA_API_URL}`);
  });
}

// Start the server
main().catch((error) => {
  console.error('Failed to start MCP server:', error);
  process.exit(1);
});
