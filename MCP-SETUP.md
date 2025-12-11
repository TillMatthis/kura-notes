# KURA Notes MCP Server Setup Guide

This guide explains how to use the KURA Notes MCP (Model Context Protocol) server to connect Claude Desktop or other MCP-compatible clients to your KURA Notes instance.

## Overview

The KURA MCP server exposes your personal notes through the Model Context Protocol, allowing AI assistants to:
- Search your notes semantically
- Create new notes
- Retrieve specific notes
- List recent notes
- Delete notes

The server provides two transport options:
- **STDIO transport** (`server-stdio.ts`): Required for Claude Desktop (Claude Desktop does NOT support SSE)
- **SSE transport** (`server.ts`): Available for other MCP clients that support Server-Sent Events

**Key Features:**
- ✅ **Secure Authentication:** OAuth 2.0 and API key support via KOauth
- ✅ **User Isolation:** Each authenticated user only accesses their own notes
- ✅ **STDIO Support:** Native support for Claude Desktop via STDIO transport
- ✅ **SSE Support:** Optional SSE transport for other MCP clients
- ✅ **Integrated Deployment:** Part of kura-notes docker-compose stack

## Architecture

### For Claude Desktop (STDIO):

```
┌──────────────────┐
│ Claude Desktop   │
│   (MCP Client)   │
└────────┬─────────┘
         │ STDIO (stdin/stdout)
         ↓
┌──────────────────┐      ┌──────────────────┐
│ STDIO MCP Server │─────→│   KURA API       │
│ (server-stdio.js)│      │  (Port 3000)     │
│   Local/Remote   │      │   Docker         │
└──────────────────┘      └──────────────────┘
```

### For Other MCP Clients (SSE):

```
┌──────────────────┐
│  MCP Client      │
│  (SSE Support)  │
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
│   SSE MCP Server │─────→│   KURA API       │
│  (Port 3001)     │      │  (Port 3000)     │
│   Docker         │      │   Docker         │
└──────────────────┘      └──────────────────┘
```

**Note:** We use system-installed Caddy (apt) instead of Docker Caddy to support multiple services on the VPS.

## Deployment

### 1. Configure Environment Variables

The MCP server requires KOauth configuration. Add to your `.env` file:

```bash
# KOauth Configuration (required)
KOAUTH_URL=https://auth.tillmaessen.de
KOAUTH_TIMEOUT=5000

# KURA API URL (internal Docker network)
KURA_API_URL=http://api:3000

# MCP Server Port
MCP_PORT=3001
```

**Note:** The MCP server no longer uses a shared `API_KEY`. Each user authenticates with their own OAuth token or API key.

### 2. Start the Services

The MCP server is included in the docker-compose.yml configuration:

```bash
# Build and start all services (including MCP server)
docker-compose up -d --build

# Check that all services are healthy
docker-compose ps

# View MCP server logs
docker-compose logs -f mcp
```

### 3. Verify the MCP Server

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

### ⚠️ Important: Claude Desktop Does NOT Support SSE

**Claude Desktop only supports STDIO transport**, not SSE (Server-Sent Events). The SSE server (`server.ts`) is available for other MCP clients that support it, but **Claude Desktop requires the STDIO version** (`server-stdio.ts`).

### Prerequisites

Before configuring Claude Desktop, you need an **API Key** from KOauth:

1. **Log in to KOauth Dashboard:**
   - URL: `https://auth.tillmaessen.de/dashboard`
   - Sign in with your Google/GitHub account

2. **Generate API Key:**
   - Navigate to "API Keys" section
   - Click "New Key"
   - Enter a descriptive name (e.g., "Claude Desktop MCP")
   - **Copy the generated key immediately** (you won't see it again!)

### Configuration Steps

1. **Locate Claude Desktop Config File:**
   - **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
   - **Linux**: `~/.config/Claude/claude_desktop_config.json`

2. **Build the STDIO Server:**

   First, ensure the STDIO server is built:

   ```bash
   cd mcp
   npm install
   npm run build
   ```

   This creates `mcp/dist/server-stdio.js` which Claude Desktop will run.

3. **Configure Claude Desktop:**

   Edit `claude_desktop_config.json` and add:

   ```json
   {
     "mcpServers": {
       "kura-notes": {
         "command": "node",
         "args": ["/absolute/path/to/kura-notes/mcp/dist/server-stdio.js"],
         "env": {
           "API_KEY": "YOUR_API_KEY_HERE",
           "KURA_API_URL": "https://kura.tillmaessen.de",
           "KOAUTH_URL": "https://auth.tillmaessen.de"
         }
       }
     }
   }
   ```

   **Important:**
   - Replace `/absolute/path/to/kura-notes` with the **absolute path** to your kura-notes directory
   - Replace `YOUR_API_KEY_HERE` with the API key you generated from KOauth
   - For local development, use `"KURA_API_URL": "http://localhost:3000"` instead

4. **Restart Claude Desktop:**

   - Quit Claude Desktop completely
   - Reopen Claude Desktop
   - The MCP server should now be connected

### Example Configuration (macOS)

If your project is at `/Users/tillmaessen/Documents/GitHub/kura-notes`:

```json
{
  "mcpServers": {
    "kura-notes": {
      "command": "node",
      "args": ["/Users/tillmaessen/Documents/GitHub/kura-notes/mcp/dist/server-stdio.js"],
      "env": {
        "API_KEY": "your-actual-api-key-here",
        "KURA_API_URL": "https://kura.tillmaessen.de",
        "KOAUTH_URL": "https://auth.tillmaessen.de"
      }
    }
  }
}
```

### Local Development Setup

If you're running KURA locally (not on VPS):

```json
{
  "mcpServers": {
    "kura-notes": {
      "command": "node",
      "args": ["/absolute/path/to/kura-notes/mcp/dist/server-stdio.js"],
      "env": {
        "API_KEY": "YOUR_API_KEY_HERE",
        "KURA_API_URL": "http://localhost:3000",
        "KOAUTH_URL": "https://auth.tillmaessen.de"
      }
    }
  }
}
```

**Note:** Even for local development, you still need a valid API key from KOauth. The API key authenticates you to access your notes.

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

1. **Authentication:** 
   - All connections require authentication via OAuth access tokens or API keys
   - Each user's requests are isolated - users can only access their own notes
   - API keys should be kept secret and never shared
   - Revoke compromised API keys immediately in KOauth dashboard

2. **HTTPS:** When deployed on a VPS, system Caddy automatically handles HTTPS with Let's Encrypt certificates.

3. **Firewall:** Ensure your VPS firewall allows connections on ports 80 and 443:
   ```bash
   # Example for UFW (Ubuntu/Debian)
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   sudo ufw enable
   ```

4. **Rate Limiting:** Consider adding rate limiting in system Caddy if you expose the MCP server publicly.

5. **Token Security:**
   - OAuth tokens expire automatically (check KOauth configuration)
   - API keys are long-lived - revoke if compromised
   - Never log tokens or API keys
   - Use HTTPS for all connections in production

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

1. **Verify the STDIO server is built:**
   ```bash
   cd mcp
   npm run build
   ls -la dist/server-stdio.js  # Should exist
   ```

2. **Check that the path in `claude_desktop_config.json` is absolute:**
   - Use absolute path, not relative path
   - Example: `/Users/username/path/to/kura-notes/mcp/dist/server-stdio.js`
   - Not: `./mcp/dist/server-stdio.js` or `~/path/to/...`

3. **Verify your `claude_desktop_config.json` is valid JSON:**
   - Use a JSON validator if needed
   - Ensure all strings are properly quoted

4. **Check that Node.js is in PATH:**
   ```bash
   which node  # Should return path to node executable
   ```

5. **Check Claude Desktop logs:**
   - macOS: `~/Library/Logs/Claude/`
   - Windows: `%APPDATA%\Claude\logs\`
   - Linux: `~/.config/Claude/logs/`
   - Look for errors related to the MCP server startup

6. **Test the STDIO server manually:**
   ```bash
   cd mcp
   API_KEY="your-api-key" KURA_API_URL="https://kura.tillmaessen.de" node dist/server-stdio.js
   ```
   - Should start without errors (will wait for input on stdin)
   - Press Ctrl+C to exit

7. **Restart Claude Desktop completely** (not just reload)

### Authentication Errors

If you get authentication errors:

1. **Verify API Key is Set:**
   - Check that `API_KEY` is set in the `env` section of `claude_desktop_config.json`
   - Ensure there are no extra spaces or quotes around the key

2. **Test Your API Key:**
   ```bash
   curl -X POST https://auth.tillmaessen.de/api/validate-key \
     -H "Content-Type: application/json" \
     -d '{"apiKey": "YOUR_API_KEY"}'
   ```
   - Should return `{"valid": true, "userId": "...", "email": "..."}`
   - If invalid, generate a new key from KOauth dashboard

3. **Check Environment Variables:**
   - Verify `KOAUTH_URL` is set correctly in Claude Desktop config
   - For local development, ensure `KURA_API_URL` points to your local API

4. **Check STDIO Server Logs:**
   - The STDIO server logs to stderr (not stdout)
   - Check Claude Desktop logs for stderr output from the MCP server
   - Look for authentication errors or warnings

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
