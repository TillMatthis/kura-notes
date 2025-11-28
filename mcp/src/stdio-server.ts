#!/usr/bin/env node

/**
 * KURA Notes - Local MCP Server (stdio transport)
 *
 * This runs as a local process and connects to your remote KURA API.
 * Use this with Claude Desktop for reliable MCP integration.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// Configuration from environment variables
const API_KEY = process.env.API_KEY;
const KURA_API_URL = process.env.KURA_API_URL || 'https://kura.tillmaessen.de';

// Log to stderr (stdout is used for MCP protocol)
function log(message: string, data?: any) {
  console.error(`[KURA MCP] ${message}`, data || '');
}

if (!API_KEY) {
  log('ERROR: API_KEY environment variable is required');
  process.exit(1);
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

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${API_KEY}`,
    ...(options.headers as Record<string, string> || {}),
  };

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

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      log('Tool call error:', errorMessage);
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
 * Start server with stdio transport
 */
async function main() {
  log('Starting KURA MCP Server (stdio)');
  log(`API URL: ${KURA_API_URL}`);

  const server = createMCPServer();
  const transport = new StdioServerTransport();

  await server.connect(transport);

  log('Server connected and ready');
}

// Start the server
main().catch((error) => {
  log('Failed to start MCP server:', error);
  process.exit(1);
});
