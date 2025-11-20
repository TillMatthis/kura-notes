# KURA Notes MCP Server Setup Guide

This guide explains how to use the KURA Notes MCP (Model Context Protocol) server to connect Claude Desktop or other MCP-compatible clients to your KURA Notes instance.

## Overview

The KURA MCP server exposes your personal notes through the Model Context Protocol, allowing AI assistants to:
- Search your notes semantically
- Create new notes
- Retrieve specific notes
- List recent notes
- Delete notes

The server runs as a separate Docker service and communicates with the KURA API internally, exposing a public SSE (Server-Sent Events) endpoint for remote connections.

## Architecture

```
┌──────────────────┐
│ Claude Desktop   │
│   (MCP Client)   │
└────────┬─────────┘
         │ HTTPS/SSE
         ↓
┌──────────────────┐
│  System Caddy    │
│ (Reverse Proxy)  │
│  apt-installed   │
└────────┬─────────┘
         │
         ↓
┌──────────────────┐      ┌──────────────────┐
│   MCP Server     │─────→│   KURA API       │
│  (Port 3001)     │      │  (Port 3000)     │
│   Docker         │      │   Docker         │
└──────────────────┘      └──────────────────┘
```

**Note:** We use system-installed Caddy (apt) instead of Docker Caddy to support multiple services on the VPS.

## Deployment

### 1. Start the Services

The MCP server is included in the docker-compose.yml configuration:

```bash
# Build and start all services (including MCP server)
docker-compose up -d --build

# Check that all services are healthy
docker-compose ps

# View MCP server logs
docker-compose logs -f mcp
```

### 2. Verify the MCP Server

```bash
# Check MCP server health
curl http://localhost:3001/health

# Or via the public endpoint (requires system Caddy to be running)
curl https://kura.tillmaessen.de/mcp/health
```

Expected response:
```json
{
  "status": "ok",
  "service": "kura-mcp-server",
  "version": "0.1.0",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Claude Desktop Configuration

### Remote Server Setup (Recommended for VPS)

Configure Claude Desktop to connect to your remote KURA MCP server:

1. **Locate Claude Desktop Config**
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`
   - Linux: `~/.config/Claude/claude_desktop_config.json`

2. **Add KURA MCP Server Configuration**

Edit `claude_desktop_config.json` and add the MCP server:

```json
{
  "mcpServers": {
    "kura-notes": {
      "url": "https://kura.tillmaessen.de/mcp/sse",
      "transport": {
        "type": "sse"
      }
    }
  }
}
```

3. **Restart Claude Desktop**

After saving the configuration, restart Claude Desktop for the changes to take effect.

### Alternative: Local Development Setup

If you're running KURA locally (not on a VPS), use:

```json
{
  "mcpServers": {
    "kura-notes": {
      "url": "http://localhost:3001/sse",
      "transport": {
        "type": "sse"
      }
    }
  }
}
```

## Available Tools

The MCP server exposes 5 tools for interacting with your notes:

### 1. `kura_search`

Search notes semantically using natural language.

**Parameters:**
- `query` (required): Natural language search query
- `limit` (optional): Maximum number of results (default: 10, max: 50)
- `contentType` (optional): Filter by content type (comma-separated: text, image, pdf, audio)
- `tags` (optional): Filter by tags (comma-separated)

**Example:**
```
Search my notes for "machine learning concepts"
```

**Response:**
```json
{
  "results": [
    {
      "id": "abc123",
      "title": "Neural Networks Introduction",
      "excerpt": "Basic concepts of machine learning...",
      "contentType": "text",
      "relevanceScore": 0.95,
      "metadata": {
        "tags": ["ml", "ai", "learning"],
        "createdAt": "2024-01-01T10:00:00Z",
        "updatedAt": "2024-01-01T10:00:00Z",
        "source": null,
        "annotation": "Key concepts for ML basics"
      }
    }
  ],
  "totalResults": 1,
  "searchMethod": "vector"
}
```

### 2. `kura_create`

Create a new text note.

**Parameters:**
- `content` (required): The text content of the note
- `title` (optional): Title for the note
- `annotation` (optional): Annotation/comment about the note
- `tags` (optional): Array of tags (alphanumeric with dashes/underscores)

**Example:**
```
Create a note about TypeScript best practices
```

**Response:**
```json
{
  "success": true,
  "id": "xyz789",
  "message": "Content captured successfully"
}
```

### 3. `kura_get`

Get a specific note by ID.

**Parameters:**
- `id` (required): The unique ID of the note

**Example:**
```
Get note with ID abc123
```

**Response:**
```json
{
  "id": "abc123",
  "content_type": "text",
  "title": "Neural Networks Introduction",
  "annotation": "Key concepts for ML basics",
  "tags": ["ml", "ai", "learning"],
  "source": null,
  "created_at": "2024-01-01T10:00:00Z",
  "updated_at": "2024-01-01T10:00:00Z",
  "content": "Basic concepts of machine learning..."
}
```

### 4. `kura_list_recent`

List recent notes (last 20). Returns metadata only, not full content.

**Parameters:** None

**Example:**
```
List my recent notes
```

**Response:**
```json
{
  "success": true,
  "items": [
    {
      "id": "abc123",
      "content_type": "text",
      "title": "Neural Networks Introduction",
      "annotation": "Key concepts for ML basics",
      "tags": ["ml", "ai"],
      "source": null,
      "created_at": "2024-01-01T10:00:00Z",
      "updated_at": "2024-01-01T10:00:00Z"
    }
  ],
  "count": 1
}
```

### 5. `kura_delete`

Delete a note by ID. **This action is permanent and cannot be undone.**

**Parameters:**
- `id` (required): The unique ID of the note to delete

**Example:**
```
Delete note with ID abc123
```

**Response:**
```json
{
  "success": true,
  "message": "Content deleted successfully",
  "id": "abc123"
}
```

## Usage Examples in Claude Desktop

Once configured, you can use natural language to interact with your notes:

**Search:**
```
"Search my KURA notes for anything related to Python decorators"
```

**Create:**
```
"Create a note in KURA with the title 'Meeting Notes - Q1 Planning'
and content 'Discussed Q1 goals: improve API performance, add new features...'"
```

**List Recent:**
```
"Show me my recent notes from KURA"
```

**Get Specific Note:**
```
"Get the full content of note abc123 from KURA"
```

**Delete:**
```
"Delete note xyz789 from KURA"
```

## Security Considerations

1. **Authentication:** The MCP server uses the same `API_KEY` as the KURA API for authentication. Make sure this key is kept secret.

2. **HTTPS:** When deployed on a VPS, system Caddy automatically handles HTTPS with Let's Encrypt certificates.

3. **Firewall:** Ensure your VPS firewall allows connections on ports 80 and 443:
   ```bash
   # Example for UFW (Ubuntu/Debian)
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   sudo ufw enable
   ```

4. **Rate Limiting:** Consider adding rate limiting in system Caddy if you expose the MCP server publicly.

## Troubleshooting

### MCP Server Not Starting

```bash
# Check logs
docker-compose logs mcp

# Check if API is healthy
docker-compose ps api

# Restart MCP service
docker-compose restart mcp
```

### Claude Desktop Can't Connect

1. Check that the MCP server is accessible:
   ```bash
   curl https://kura.tillmaessen.de/mcp/health
   ```

2. Verify your `claude_desktop_config.json` is valid JSON

3. Check Claude Desktop logs:
   - macOS: `~/Library/Logs/Claude/`
   - Windows: `%APPDATA%\Claude\logs\`
   - Linux: `~/.config/Claude/logs/`

4. Restart Claude Desktop completely (not just reload)

### SSE Connection Issues

If SSE connections are timing out:

1. Check that system Caddy is properly configured for the MCP endpoint (see DEPLOYMENT.md for Caddyfile configuration)
2. Verify no intermediate proxies are buffering the connection
3. Check firewall rules allow long-lived connections

### Authentication Errors

If you get 401/403 errors:

1. Verify the `API_KEY` environment variable is set correctly in `.env`
2. Check that the MCP server can reach the API service:
   ```bash
   docker-compose exec mcp wget -O- http://api:3000/api/health
   ```

## Development

### Running MCP Server Locally

For local development without Docker:

```bash
cd mcp

# Install dependencies
npm install

# Set environment variables
export API_KEY="your-api-key"
export KURA_API_URL="http://localhost:3000"
export MCP_PORT="3001"

# Run in development mode
npm run dev
```

### Testing the MCP Server

You can test the MCP server endpoints directly:

```bash
# Health check
curl http://localhost:3001/health

# SSE endpoint (will keep connection open)
curl -N http://localhost:3001/sse
```

## Additional Resources

- [Model Context Protocol Specification](https://modelcontextprotocol.io/specification/draft)
- [MCP SDK Documentation](https://github.com/modelcontextprotocol/typescript-sdk)
- [Claude Desktop Documentation](https://claude.ai/docs)

## Support

If you encounter issues:

1. Check the troubleshooting section above
2. Review MCP server logs: `docker-compose logs mcp`
3. Review API logs: `docker-compose logs api`
4. Create an issue in the repository with logs and error messages
