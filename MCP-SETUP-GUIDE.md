# KURA Notes MCP Service - Complete Setup Guide

## 📊 Current Implementation Status

### ✅ **Fully Implemented**

The KURA Notes MCP (Model Context Protocol) service is **fully implemented and integrated** into the project. Here's what's in place:

#### **1. MCP Server Implementation**
- ✅ **Location**: `mcp/` directory
- ✅ **TypeScript Implementation**: Complete MCP server using `@modelcontextprotocol/sdk`
- ✅ **SSE Transport**: Server-Sent Events transport for remote connections
- ✅ **Authentication**: Integrated with KOauth (OAuth 2.0 and API key support)
- ✅ **User Isolation**: Each authenticated user only accesses their own notes

#### **2. Available MCP Tools**
The server exposes 5 tools for interacting with your notes:

1. **`kura_search`** - Semantic search using natural language
2. **`kura_create`** - Create new text notes
3. **`kura_get`** - Retrieve specific note by ID
4. **`kura_list_recent`** - List recent notes (last 20)
5. **`kura_delete`** - Delete notes by ID

#### **3. Docker Integration**
- ✅ **Dockerfile**: `mcp/Dockerfile` - Multi-stage build
- ✅ **Docker Compose**: Integrated into `docker-compose.yml`
- ✅ **Health Checks**: Configured for monitoring
- ✅ **Resource Limits**: CPU and memory limits set
- ✅ **Network**: Connected to `kura-network` for API communication

#### **4. Authentication Module**
- ✅ **OAuth 2.0 Support**: JWT token verification via KOauth JWKS
- ✅ **API Key Support**: Both JWT-based and legacy opaque keys
- ✅ **User Context**: Per-connection user context storage
- ✅ **Error Handling**: Comprehensive error handling and logging

---

## 🚀 Setup Instructions

### Step 1: Environment Configuration

Create or update your `.env` file in the project root:

```bash
# Copy example if it doesn't exist
cp .env.example .env

# Edit .env file
nano .env  # or use your preferred editor
```

**Required Environment Variables for MCP:**

```bash
# KOauth Configuration (REQUIRED)
KOAUTH_URL=https://auth.tillmaessen.de
KOAUTH_TIMEOUT=5000

# KURA API URL (internal Docker network - don't change unless needed)
KURA_API_URL=http://api:3000

# MCP Server Port (optional, defaults to 3001)
MCP_PORT=3001

# Node Environment
NODE_ENV=production  # or 'development' for local dev
```

**Note**: The MCP server communicates with the KURA API internally via Docker network (`http://api:3000`). You don't need to expose the API port externally for MCP to work.

### Step 2: Build and Start Services

The MCP server is already included in `docker-compose.yml`. Simply start all services:

```bash
# Navigate to project directory
cd /Users/tillmaessen/Documents/GitHub/kura-notes

# Build and start all services (including MCP)
docker-compose up -d --build

# Check service status
docker-compose ps

# View MCP server logs
docker-compose logs -f mcp
```

**Expected Output:**
```
NAME                STATUS          PORTS
kura-notes-api     Up (healthy)    0.0.0.0:3000->3000/tcp
kura-notes-mcp     Up (healthy)    0.0.0.0:3001->3001/tcp
kura-notes-chromadb Up            0.0.0.0:8000->8000/tcp
```

### Step 3: Verify MCP Server

Test the MCP server health endpoint:

```bash
# Local health check
curl http://localhost:3001/health

# Expected response:
# {
#   "status": "ok",
#   "service": "kura-mcp-server",
#   "version": "0.1.0",
#   "timestamp": "2025-01-15T10:30:00.000Z"
# }
```

### Step 4: Configure Reverse Proxy (For Remote Access)

If you're deploying on a VPS and want remote access, configure Caddy (or your reverse proxy):

**Caddyfile Configuration** (`/etc/caddy/Caddyfile`):

```caddyfile
kura.tillmaessen.de {
    # Main API (proxies to Docker container on port 3000)
    reverse_proxy localhost:3000

    # MCP Server endpoint (proxies to Docker container on port 3001)
    handle /mcp* {
        reverse_proxy localhost:3001
    }
}
```

**Apply Configuration:**

```bash
# Validate Caddy configuration
caddy validate --config /etc/caddy/Caddyfile

# Restart Caddy
sudo systemctl restart caddy
sudo systemctl status caddy

# Test MCP endpoint via HTTPS
curl https://kura.tillmaessen.de/mcp/health
```

---

## 🔧 Claude Desktop Configuration

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

#### **Option 1: Remote Server (VPS Deployment)**

1. **Locate Claude Desktop Config File:**
   - **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
   - **Linux**: `~/.config/Claude/claude_desktop_config.json`

2. **Edit Configuration File:**

   Create or edit `claude_desktop_config.json`:

   ```json
   {
     "mcpServers": {
       "kura-notes": {
         "url": "https://kura.tillmaessen.de/mcp/sse",
         "transport": {
           "type": "sse"
         },
         "headers": {
           "Authorization": "Bearer YOUR_API_KEY_HERE"
         }
       }
     }
   }
   ```

   **Replace `YOUR_API_KEY_HERE`** with the API key you generated from KOauth.

3. **Restart Claude Desktop:**
   - Quit Claude Desktop completely
   - Reopen Claude Desktop
   - The MCP server should now be connected

#### **Option 2: Local Development**

If running locally (not on VPS):

```json
{
  "mcpServers": {
    "kura-notes": {
      "url": "http://localhost:3001/sse",
      "transport": {
        "type": "sse"
      },
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY_HERE"
      }
    }
  }
}
```

**Note**: For local development, you can also use test headers if the KURA API is running in non-production mode, but API keys are recommended for consistency.

### OAuth 2.0 Configuration (Alternative)

If you prefer OAuth 2.0 instead of API keys:

```json
{
  "mcpServers": {
    "kura-notes": {
      "url": "https://kura.tillmaessen.de/mcp/sse",
      "transport": {
        "type": "sse"
      },
      "oauth": {
        "clientId": "your-oauth-client-id",
        "clientSecret": "your-oauth-client-secret",
        "authorizationUrl": "https://auth.tillmaessen.de/oauth/authorize",
        "tokenUrl": "https://auth.tillmaessen.de/oauth/token"
      }
    }
  }
}
```

**Note**: OAuth requires setting up an OAuth client in KOauth. API keys are simpler for most use cases.

---

## 🧪 Testing the Integration

### 1. Verify Connection in Claude Desktop

After restarting Claude Desktop, check the MCP connection:

1. Open Claude Desktop
2. Look for connection status (usually in settings or status bar)
3. The MCP server should show as "connected"

### 2. Test MCP Tools

Try these commands in Claude Desktop:

**Search:**
```
Search my KURA notes for anything related to machine learning
```

**Create Note:**
```
Create a note in KURA with the title "Meeting Notes" and content "Discussed project goals..."
```

**List Recent:**
```
Show me my recent notes from KURA
```

**Get Note:**
```
Get the full content of note [note-id] from KURA
```

**Delete Note:**
```
Delete note [note-id] from KURA
```

### 3. Check Logs

If something doesn't work, check the logs:

```bash
# MCP server logs
docker-compose logs mcp

# API logs
docker-compose logs api

# Filter for errors
docker-compose logs mcp | grep -i error
docker-compose logs api | grep -i error
```

---

## 🔍 Troubleshooting

### MCP Server Not Starting

```bash
# Check logs
docker-compose logs mcp

# Check if API is healthy
docker-compose ps api

# Restart MCP service
docker-compose restart mcp

# Rebuild if needed
docker-compose up -d --build mcp
```

### Claude Desktop Can't Connect

1. **Verify MCP Server is Accessible:**
   ```bash
   # Local
   curl http://localhost:3001/health
   
   # Remote
   curl https://kura.tillmaessen.de/mcp/health
   ```

2. **Check Configuration File:**
   - Ensure `claude_desktop_config.json` is valid JSON
   - Verify no syntax errors
   - Check file permissions

3. **Check Claude Desktop Logs:**
   - **macOS**: `~/Library/Logs/Claude/`
   - **Windows**: `%APPDATA%\Claude\logs\`
   - **Linux**: `~/.config/Claude/logs/`

4. **Restart Claude Desktop:**
   - Quit completely (not just close window)
   - Reopen and check connection status

### Authentication Errors

If you get 401/403 errors:

1. **Verify API Key:**
   ```bash
   curl -X POST https://auth.tillmaessen.de/api/validate-key \
     -H "Content-Type: application/json" \
     -d '{"apiKey": "YOUR_API_KEY"}'
   ```
   
   Should return: `{"valid": true, "userId": "...", "email": "..."}`

2. **Check Authorization Header Format:**
   - Must be: `Authorization: Bearer YOUR_API_KEY`
   - No extra spaces or quotes

3. **Verify KOauth Configuration:**
   ```bash
   # Check environment variable
   docker-compose exec mcp env | grep KOAUTH_URL
   
   # Should show: KOAUTH_URL=https://auth.tillmaessen.de
   ```

4. **Check MCP Server Logs:**
   ```bash
   docker-compose logs mcp | grep -i auth
   ```

### SSE Connection Issues

If SSE connections timeout:

1. **Check Caddy Configuration:**
   - Verify `/mcp*` route is configured
   - Check Caddy logs: `journalctl -u caddy -f`

2. **Check Firewall:**
   - Ensure ports 80 and 443 are open
   - Check Docker network connectivity

3. **Verify No Proxy Buffering:**
   - Some proxies buffer SSE connections
   - Check reverse proxy settings

---

## 📚 Additional Resources

- **MCP Specification**: https://modelcontextprotocol.io/specification/draft
- **MCP SDK Documentation**: https://github.com/modelcontextprotocol/typescript-sdk
- **Claude Desktop Documentation**: https://claude.ai/docs
- **KURA Notes MCP Setup**: `MCP-SETUP.md` (detailed technical documentation)
- **KURA Notes Deployment**: `DEPLOYMENT.md` (VPS deployment guide)

---

## ✅ Quick Checklist

- [ ] `.env` file configured with `KOAUTH_URL` and other required variables
- [ ] Docker Compose services running (`docker-compose ps`)
- [ ] MCP server health check passes (`curl http://localhost:3001/health`)
- [ ] Reverse proxy configured (if remote access needed)
- [ ] API key generated from KOauth dashboard
- [ ] Claude Desktop config file created/updated
- [ ] Claude Desktop restarted
- [ ] MCP connection verified in Claude Desktop
- [ ] Test commands work in Claude Desktop

---

## 🎯 Summary

The KURA Notes MCP service is **fully implemented and ready to use**. The setup process involves:

1. ✅ **Configure environment variables** (`.env` file)
2. ✅ **Start Docker services** (`docker-compose up -d`)
3. ✅ **Generate API key** (KOauth dashboard)
4. ✅ **Configure Claude Desktop** (`claude_desktop_config.json`)
5. ✅ **Restart Claude Desktop** and start using!

The MCP server provides secure, user-isolated access to your KURA Notes through Claude Desktop, allowing you to search, create, retrieve, and manage your notes using natural language.

---

**Last Updated**: 2025-01-15  
**Status**: ✅ Production Ready
