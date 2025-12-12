#!/usr/bin/env node

/**
 * KURA Notes - Remote MCP Server
 *
 * Exposes KURA Notes API through Model Context Protocol (MCP) using Streamable HTTP transport (SSE).
 * Supports both Claude Desktop (via STDIO) and Claude mobile Custom Connectors (via SSE with OAuth autodiscovery).
 *
 * Features:
 * - OAuth 2.1 Resource Server (validates bearer tokens)
 * - OAuth autodiscovery via /.well-known/oauth-protected-resource
 * - Streamable HTTP transport (SSE) for remote connections
 * - User isolation via KOauth authentication
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import express, { Request, Response as ExpressResponse } from 'express';
import dotenv from 'dotenv';
import { initAuth, authenticate, type AuthenticatedUser } from './auth.js';

// Load environment variables
dotenv.config({ path: '../.env' });

// Configuration
const PORT = parseInt(process.env.MCP_PORT || '3001', 10);
const NODE_ENV = process.env.NODE_ENV || 'development';
const KURA_API_URL = process.env.KURA_API_URL || 'http://api:3000';
const KOAUTH_URL = process.env.KOAUTH_URL || 'https://auth.tillmaessen.de';
const KOAUTH_TIMEOUT = parseInt(process.env.KOAUTH_TIMEOUT || '5000', 10);
const MCP_BASE_URL = process.env.MCP_BASE_URL || ''; 
// e.g., https://kura.tillmaessen.de/mcp
// If not set, will infer from request headers

// Initialize authentication module
initAuth({
  baseUrl: KOAUTH_URL,
  timeout: KOAUTH_TIMEOUT,
});

console.log('MCP Server Configuration:', {
  port: PORT,
  nodeEnv: NODE_ENV,
  kuraApiUrl: KURA_API_URL,
  koauthUrl: KOAUTH_URL,
  koauthTimeout: KOAUTH_TIMEOUT,
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

/**
 * User context storage per SSE connection
 * Maps connection ID to authenticated user
 */
const userContextMap = new Map<string, AuthenticatedUser>();

/**
 * Make authenticated request to KURA API
 */
async function callKuraAPI(
  endpoint: string,
  user: AuthenticatedUser | null,
  options: RequestInit = {}
): Promise<Response> {
  const url = `${KURA_API_URL}${endpoint}`;

  // Build headers
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (user) {
    // Use authenticated user's token
    headers['Authorization'] = `Bearer ${user.token}`;
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
 * Get authenticated user from connection context
 */
function getUserFromContext(connectionId: string): AuthenticatedUser | null {
  return userContextMap.get(connectionId) || null;
}

/**
 * Initialize MCP Server
 */
function createMCPServer(connectionId: string): Server {
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

    // Get authenticated user from connection context
    const user = getUserFromContext(connectionId);

    if (!user) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                error: 'Authentication required. Please provide a valid OAuth token or API key in the Authorization header.',
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

          const response = await callKuraAPI(`/api/search?${params}`, user);

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

          const response = await callKuraAPI(
            '/api/capture',
            user,
            {
              method: 'POST',
              body: JSON.stringify({
                content,
                title,
                annotation,
                tags,
                contentType: 'text',
              }),
            }
          );

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

          const response = await callKuraAPI(`/api/content/${id}`, user);

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
          const response = await callKuraAPI('/api/content/recent', user);

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

          const response = await callKuraAPI(
            `/api/content/${id}`,
            user,
            {
              method: 'DELETE',
            }
          );

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
      
      // Log error for debugging (but don't log tokens)
      console.error(`Tool call error for ${name}:`, {
        error: errorMessage,
        userId: user?.id,
        hasUser: !!user,
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
 * Start Express server with SSE transport
 */
async function main() {
  const app = express();

  // Health check endpoint
  app.get('/health', (_req: Request, res: ExpressResponse) => {
    res.json({
      status: 'ok',
      service: 'kura-mcp-server',
      version: '0.1.0',
      timestamp: new Date().toISOString(),
    });
  });

  // Handle CORS preflight requests for discovery endpoint
  app.options('/.well-known/oauth-protected-resource', (_req: Request, res: ExpressResponse) => {
    setCORSHeaders(res);
    res.status(204).send();
  });

  // OAuth Protected Resource Discovery endpoint (RFC 9728)
  // This enables Claude Custom Connectors to automatically discover OAuth configuration
  // Handle both /mcp/.well-known/... (when behind reverse proxy) and /.well-known/... (direct access)
  app.get('/.well-known/oauth-protected-resource', (req: Request, res: ExpressResponse) => {
    console.log('OAuth discovery request:', {
      url: req.url,
      originalUrl: req.originalUrl,
      host: req.get('host'),
      protocol: req.protocol,
      headers: req.headers,
    });
    
    // Set CORS headers for cross-origin requests (e.g., from Claude web app)
    setCORSHeaders(res);
    
    // Determine base URL from request or environment variable
    // If MCP_BASE_URL is set, use it; otherwise infer from request
    let baseUrl = MCP_BASE_URL;
    
    if (!baseUrl) {
      const host = req.get('host');
      const protocol = req.protocol;
      // Check if the request path includes /mcp prefix (from reverse proxy)
      const originalPath = req.originalUrl || req.url;
      if (originalPath.startsWith('/mcp')) {
        // Behind reverse proxy with /mcp prefix
        baseUrl = `${protocol}://${host}/mcp`;
      } else {
        // Direct access or reverse proxy strips prefix
        baseUrl = `${protocol}://${host}`;
      }
    }
    
    // RFC 9728 Protected Resource Metadata
    // Required: resource
    // Optional: authorization_servers, scopes_supported, bearer_methods_supported, jwks_uri
    const discoveryResponse = {
      // REQUIRED: The protected resource's resource identifier (RFC 9728)
      resource: `${baseUrl}/sse`,
      
      // OPTIONAL: List of authorization server issuer identifiers
      authorization_servers: [KOAUTH_URL],
      
      // OPTIONAL: JWKS URI for token verification
      jwks_uri: `${KOAUTH_URL}/.well-known/jwks.json`,
      
      // OPTIONAL: List of OAuth 2.0 scopes supported by this protected resource
      scopes_supported: ['openid', 'profile', 'email'],
      
      // OPTIONAL: Methods for presenting bearer tokens to this protected resource
      bearer_methods_supported: ['header'],
      
      // OPTIONAL: URL pointing to human-readable documentation for this protected resource
      resource_documentation: `${baseUrl.replace(/\/mcp$/, '')}/api/docs`,
    };
    
    console.log('OAuth discovery response:', discoveryResponse);
    
    res.json(discoveryResponse);
  });
  
  // Handle CORS preflight requests for discovery endpoint (with /mcp prefix)
  app.options('/mcp/.well-known/oauth-protected-resource', (_req: Request, res: ExpressResponse) => {
    setCORSHeaders(res);
    res.status(204).send();
  });

  // Also handle /mcp/.well-known/... path for reverse proxy compatibility
  app.get('/mcp/.well-known/oauth-protected-resource', (req: Request, res: ExpressResponse) => {
    console.log('OAuth discovery request (with /mcp prefix):', {
      url: req.url,
      originalUrl: req.originalUrl,
      host: req.get('host'),
      protocol: req.protocol,
    });
    
    // Set CORS headers for cross-origin requests
    setCORSHeaders(res);
    
    // Determine base URL from request or environment variable
    const baseUrl = MCP_BASE_URL || `${req.protocol}://${req.get('host')}/mcp`;
    
    // RFC 9728 Protected Resource Metadata
    const discoveryResponse = {
      // REQUIRED: The protected resource's resource identifier (RFC 9728)
      resource: `${baseUrl}/sse`,
      
      // OPTIONAL: List of authorization server issuer identifiers
      authorization_servers: [KOAUTH_URL],
      
      // OPTIONAL: JWKS URI for token verification
      jwks_uri: `${KOAUTH_URL}/.well-known/jwks.json`,
      
      // OPTIONAL: List of OAuth 2.0 scopes supported by this protected resource
      scopes_supported: ['openid', 'profile', 'email'],
      
      // OPTIONAL: Methods for presenting bearer tokens to this protected resource
      bearer_methods_supported: ['header'],
      
      // OPTIONAL: URL pointing to human-readable documentation for this protected resource
      resource_documentation: `${baseUrl.replace(/\/mcp$/, '')}/api/docs`,
    };
    
    console.log('OAuth discovery response (with /mcp prefix):', discoveryResponse);
    
    res.json(discoveryResponse);
  });

  // Helper function to determine base URL for OAuth discovery
  function getBaseUrl(req: Request): string {
    if (MCP_BASE_URL) {
      return MCP_BASE_URL;
    }
    
    const host = req.get('host');
    const protocol = req.protocol;
    const originalPath = req.originalUrl || req.url;
    
    // Check if the request path includes /mcp prefix (from reverse proxy)
    if (originalPath.startsWith('/mcp')) {
      // Behind reverse proxy with /mcp prefix
      return `${protocol}://${host}/mcp`;
    } else {
      // Direct access or reverse proxy strips prefix
      return `${protocol}://${host}`;
    }
  }

  // Helper function to set CORS headers for discovery endpoint
  function setCORSHeaders(res: ExpressResponse): void {
    // Allow requests from Claude web app and other common origins
    const origin = res.req?.headers.origin;
    const allowedOrigins = [
      'https://claude.ai',
      'https://claude.com',
      'https://www.claude.ai',
      'https://www.claude.com',
    ];
    
    // If origin matches allowed list, use it; otherwise allow all (for discovery)
    if (origin && allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    } else {
      // For discovery endpoints, allow all origins (public metadata)
      res.setHeader('Access-Control-Allow-Origin', '*');
    }
    
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
  }

  // SSE endpoint for MCP with authentication
  // This endpoint supports OAuth autodiscovery via WWW-Authenticate header
  app.get('/sse', async (req: Request, res: ExpressResponse) => {
    // Extract Authorization header
    const authHeader = req.headers.authorization;

    // Authenticate the request
    const user = await authenticate(authHeader);

    if (!user) {
      console.warn('Unauthenticated SSE connection attempt from:', {
        ip: req.ip,
        url: req.url,
        originalUrl: req.originalUrl,
        host: req.get('host'),
        protocol: req.protocol,
        headers: req.headers,
      });
      
      // Determine base URL for discovery endpoint
      const baseUrl = getBaseUrl(req);
      const discoveryUrl = `${baseUrl}/.well-known/oauth-protected-resource`;
      
      console.log('Returning 401 with discovery URL:', discoveryUrl);
      
      // Return 401 with WWW-Authenticate header pointing to OAuth discovery
      // This enables Claude Custom Connectors to automatically discover OAuth configuration
      res.status(401)
         .set('WWW-Authenticate', `Bearer realm="${discoveryUrl}"`)
         .json({
           error: 'Authentication required',
           message: 'Please authenticate via OAuth or provide a valid bearer token.',
           oauth_discovery: discoveryUrl
         });
      return;
    }

    console.log('Authenticated SSE connection from:', req.ip, {
      userId: user.id,
      email: user.email,
      tokenType: user.tokenType,
    });

    // Generate unique connection ID
    const connectionId = `${user.id}-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // Store user context for this connection
    userContextMap.set(connectionId, user);

    // Create MCP server instance for this connection
    const mcpServer = createMCPServer(connectionId);

    // Set up SSE transport
    const transport = new SSEServerTransport('/message', res);
    await mcpServer.connect(transport);

    // Handle connection close
    req.on('close', () => {
      console.log('SSE connection closed:', req.ip, { userId: user.id });
      // Clean up user context
      userContextMap.delete(connectionId);
    });
  });

  // POST endpoint for client messages
  app.post('/message', express.json(), async (_req: Request, res: ExpressResponse) => {
    // This endpoint is used by the SSE transport to receive messages from the client
    // The actual handling is done by the transport
    res.status(200).send();
  });
  
  // Also handle /mcp/message path for reverse proxy compatibility
  app.post('/mcp/message', express.json(), async (_req: Request, res: ExpressResponse) => {
    // This endpoint is used by the SSE transport to receive messages from the client
    // The actual handling is done by the transport
    res.status(200).send();
  });
  
  // Also handle /mcp/sse path for reverse proxy compatibility
  app.get('/mcp/sse', async (req: Request, res: ExpressResponse) => {
    // Forward to the main /sse handler
    // Extract Authorization header
    const authHeader = req.headers.authorization;

    // Authenticate the request
    const user = await authenticate(authHeader);

    if (!user) {
      console.warn('Unauthenticated SSE connection attempt from:', req.ip);
      
      // Determine base URL for discovery endpoint
      const baseUrl = getBaseUrl(req);
      
      // Return 401 with WWW-Authenticate header pointing to OAuth discovery
      res.status(401)
         .set('WWW-Authenticate', `Bearer realm="${baseUrl}/.well-known/oauth-protected-resource"`)
         .json({
           error: 'Authentication required',
           message: 'Please authenticate via OAuth or provide a valid bearer token.',
           oauth_discovery: `${baseUrl}/.well-known/oauth-protected-resource`
         });
      return;
    }

    console.log('Authenticated SSE connection from:', req.ip, {
      userId: user.id,
      email: user.email,
      tokenType: user.tokenType,
    });

    // Generate unique connection ID
    const connectionId = `${user.id}-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // Store user context for this connection
    userContextMap.set(connectionId, user);

    // Create MCP server instance for this connection
    const mcpServer = createMCPServer(connectionId);

    // Set up SSE transport
    const transport = new SSEServerTransport('/message', res);
    await mcpServer.connect(transport);

    // Handle connection close
    req.on('close', () => {
      console.log('SSE connection closed:', req.ip, { userId: user.id });
      // Clean up user context
      userContextMap.delete(connectionId);
    });
  });

  // Start server
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ KURA MCP Server running on port ${PORT}`);
    console.log(`   SSE endpoint: http://localhost:${PORT}/sse`);
    console.log(`   Health check: http://localhost:${PORT}/health`);
    console.log(`   OAuth discovery: http://localhost:${PORT}/.well-known/oauth-protected-resource`);
    console.log(`   KURA API URL: ${KURA_API_URL}`);
    console.log(`   KOauth URL: ${KOAUTH_URL}`);
    console.log(`   Authentication: Required (OAuth token or API key)`);
    console.log(`   Transport: Streamable HTTP (SSE) - Compatible with Claude Custom Connectors`);
  });
}

// Start the server
main().catch((error) => {
  console.error('Failed to start MCP server:', error);
  process.exit(1);
});
