# KURA Notes MCP - Quick Start Guide

## 🎯 Current Status: ✅ **FULLY IMPLEMENTED**

The KURA Notes MCP service is **complete and ready to use**. All components are implemented:

- ✅ MCP Server (`mcp/` directory)
- ✅ Docker integration (`docker-compose.yml`)
- ✅ Authentication (KOauth integration)
- ✅ 5 MCP tools (search, create, get, list, delete)
- ✅ SSE transport for remote connections

---

## ⚡ Quick Setup (5 Steps)

### 1. Configure Environment

```bash
cd /Users/tillmaessen/Documents/GitHub/kura-notes

# Create .env file if it doesn't exist
cp .env.example .env

# Edit .env and ensure these are set:
# KOAUTH_URL=https://auth.tillmaessen.de
# KOAUTH_TIMEOUT=5000
# MCP_PORT=3001 (optional, defaults to 3001)
```

### 2. Start Services

```bash
docker-compose up -d --build

# Verify all services are running
docker-compose ps
```

Expected output:
```
kura-notes-api      Up (healthy)
kura-notes-mcp      Up (healthy)
kura-notes-chromadb Up
```

### 3. Verify MCP Server

```bash
curl http://localhost:3001/health
```

Should return: `{"status":"ok","service":"kura-mcp-server",...}`

### 4. Get API Key

1. Go to: https://auth.tillmaessen.de/dashboard
2. Navigate to "API Keys"
3. Click "New Key"
4. Copy the key (you won't see it again!)

### 5. Configure Claude Desktop

**macOS**: Edit `~/Library/Application Support/Claude/claude_desktop_config.json`

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

**Replace `YOUR_API_KEY_HERE`** with your API key from step 4.

**Restart Claude Desktop** and you're ready to go!

---

## 🧪 Test It

In Claude Desktop, try:

```
Search my KURA notes for "machine learning"
```

```
Create a note in KURA with title "Test" and content "This is a test note"
```

---

## 📖 Full Documentation

For detailed setup instructions, troubleshooting, and advanced configuration, see:

- **`MCP-SETUP-GUIDE.md`** - Complete setup guide with troubleshooting
- **`MCP-SETUP.md`** - Technical documentation

---

## 🔧 Troubleshooting

**MCP server not starting?**
```bash
docker-compose logs mcp
docker-compose restart mcp
```

**Claude Desktop can't connect?**
- Verify: `curl https://kura.tillmaessen.de/mcp/health`
- Check API key is correct
- Ensure Claude Desktop config JSON is valid
- Restart Claude Desktop completely

**Authentication errors?**
- Verify API key: `curl -X POST https://auth.tillmaessen.de/api/validate-key -H "Content-Type: application/json" -d '{"apiKey":"YOUR_KEY"}'`
- Check MCP logs: `docker-compose logs mcp | grep -i auth`

---

**Status**: ✅ Ready to use | **Last Updated**: 2025-01-15
