# iOS Agent Access Guide

## 🎯 Goal: Access KURA Notes with AI Agents from iPhone/iPad

You want to use AI agents (like Claude, ChatGPT, etc.) to search and interact with your KURA Notes from iOS devices.

---

## 📋 Current Setup

**What you have:**
- ✅ KURA Notes API running at `https://kura.tillmaessen.de`
- ✅ MCP server for Claude Desktop (running on MacBook Pro)
- ✅ KOauth with API key management
- ✅ Multi-user authentication working

**What you want:**
- Access KURA Notes via AI agents from iPhone/iPad
- Full semantic search capabilities
- Same experience as Claude Desktop on Mac

---

## 🔍 Options for iOS Agent Access

### Option 1: Remote MCP Server (Recommended) ⭐

**What it is:**
Your MCP server (`mcp/src/server.ts`) is already designed for remote access! You just need to expose it securely.

**How it works:**
```
iPhone/iPad → Claude Mobile App → https://mcp.your-domain.com/sse
                                        ↓
                                   MCP Server (your server)
                                        ↓
                                   KURA API
                                        ↓
                                   Your notes
```

**Setup:**

#### Step 1: Check if Claude Mobile Supports Remote MCP

As of my knowledge cutoff (January 2025), Claude Desktop supports MCP, but **Claude mobile app may not yet support custom MCP servers**.

**To check:**
1. Open Claude mobile app on iOS
2. Look for Settings → Integrations or MCP Servers
3. See if you can add a custom MCP server URL

**If supported:** Skip to Step 2
**If not supported:** Use Option 2 or 3 below

#### Step 2: Expose MCP Server Over HTTPS

**Prerequisites:**
- Domain name (e.g., `mcp.tillmaessen.de`)
- SSL certificate (Let's Encrypt)
- Server with public IP

**Method A: Deploy MCP Server to VPS**

Deploy the MCP server to the same VPS as KURA Notes:

```bash
# SSH to your server
ssh your-server

# Navigate to MCP directory
cd /opt/kura-notes/mcp

# Update docker-compose.yml to include MCP service
```

**Add to docker-compose.yml:**
```yaml
  mcp-server:
    build: ./mcp
    container_name: kura-mcp-server
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - MCP_PORT=3001
      - KURA_API_URL=http://api:3000
      # Use user-specific API key from KOauth
      - API_KEY=${KURA_API_KEY}
    ports:
      - "3001:3001"
    networks:
      - kura-network
    depends_on:
      - api
```

**Configure reverse proxy (Caddy):**
```
mcp.tillmaessen.de {
    reverse_proxy kura-mcp-server:3001

    # Optional: Basic auth for extra security
    basicauth {
        user $2a$14$hashed_password
    }
}
```

**Restart services:**
```bash
docker-compose up -d
caddy reload
```

**Test:**
```bash
curl https://mcp.tillmaessen.de/health
# Should return: {"status":"ok","service":"kura-mcp-server",...}
```

**Method B: Use Tailscale/VPN**

Connect your iPhone/iPad to your Mac's network:

1. Install Tailscale on Mac and iOS
2. Connect both devices
3. Access Mac's localhost via Tailscale IP
4. Configure Claude mobile to use: `http://100.x.x.x:3001/sse`

**Pros:** No public exposure, secure
**Cons:** Requires VPN connection

#### Step 3: Configure Claude Mobile App

**If Claude mobile supports MCP:**
1. Open Claude app on iOS
2. Settings → MCP Servers → Add Server
3. Enter:
   - Name: KURA Notes
   - URL: `https://mcp.tillmaessen.de/sse`
   - Auth: Bearer token (if required)

**If using Tailscale:**
- URL: `http://100.x.x.x:3001/sse` (your Mac's Tailscale IP)

---

### Option 2: iOS Shortcuts + ChatGPT/Claude API ⚡

**What it is:**
Use iOS Shortcuts to query KURA API, then send results to ChatGPT/Claude API for AI processing.

**How it works:**
```
iPhone → iOS Shortcut → KURA API (/api/search)
                             ↓
                        Search results
                             ↓
         iOS Shortcut → ChatGPT API with context
                             ↓
                        AI-generated response
```

**Setup:**

#### Step 1: Create Search Shortcut

**Actions:**
1. Ask for Input: "What do you want to search for?"
2. Set Variable: `searchQuery` = Provided Input
3. Get Contents of URL:
   - URL: `https://kura.tillmaessen.de/api/search?query=[searchQuery]&limit=5`
   - Method: GET
   - Headers:
     - `Authorization`: `Bearer YOUR_KOAUTH_API_KEY`
4. Get Dictionary Value: `results` from JSON response
5. Set Variable: `searchResults` = Dictionary Value

#### Step 2: Send to AI API

**For ChatGPT:**
```json
{
  "model": "gpt-4",
  "messages": [
    {
      "role": "system",
      "content": "You are a helpful assistant with access to the user's personal knowledge base."
    },
    {
      "role": "user",
      "content": "Based on these notes: [searchResults]\n\nAnswer this question: [searchQuery]"
    }
  ]
}
```

**Actions:**
6. Get Contents of URL:
   - URL: `https://api.openai.com/v1/chat/completions`
   - Method: POST
   - Headers:
     - `Authorization`: `Bearer YOUR_OPENAI_API_KEY`
     - `Content-Type`: `application/json`
   - Body: JSON (above)
7. Get Dictionary Value: `choices[0].message.content`
8. Show Result

**For Claude API:**
```json
{
  "model": "claude-3-5-sonnet-20241022",
  "max_tokens": 1024,
  "messages": [
    {
      "role": "user",
      "content": "Based on my notes:\n[searchResults]\n\nAnswer: [searchQuery]"
    }
  ]
}
```

**Pros:**
- Works today (no waiting for MCP mobile support)
- Uses latest Claude/GPT models
- Full control over prompts

**Cons:**
- Requires API keys for OpenAI/Anthropic
- Costs per API call
- More complex setup

---

### Option 3: Web Interface + Mobile Browser 📱

**What it is:**
Access KURA Notes web interface via Safari/Chrome on iOS, with AI assistance via bookmarklets or share extensions.

**Setup:**

#### Step 1: Access Web Interface

Simply visit `https://kura.tillmaessen.de` on mobile Safari.

**Features available:**
- ✅ Search notes
- ✅ View results
- ✅ Create new notes
- ✅ Tag management

**Make it app-like:**
1. Open Safari → `https://kura.tillmaessen.de`
2. Tap Share → Add to Home Screen
3. Access like a native app

#### Step 2: AI-Powered Search Bookmarklet

Create a bookmarklet that sends search results to AI:

**Bookmarklet code:**
```javascript
javascript:(function(){
  const query = prompt('Search your notes:');
  if (!query) return;

  fetch(`https://kura.tillmaessen.de/api/search?query=${encodeURIComponent(query)}`, {
    headers: {'Authorization': 'Bearer YOUR_KEY'}
  })
  .then(r => r.json())
  .then(data => {
    const results = data.results.map(r => r.excerpt).join('\n\n');
    const aiUrl = `https://claude.ai/new?q=${encodeURIComponent('Based on these notes:\n' + results + '\n\nAnswer: ' + query)}`;
    window.open(aiUrl);
  });
})();
```

**To use:**
1. Create bookmark in Safari
2. Edit URL to the JavaScript above
3. Tap bookmark to search and send to Claude

**Pros:**
- No setup required
- Works immediately
- Uses official Claude.ai

**Cons:**
- Manual process
- Less integrated

---

### Option 4: Siri Shortcuts with Voice Commands 🗣️

**What it is:**
Use Siri to search your notes and get AI-powered answers.

**Setup:**

**Shortcut: "Ask KURA"**

**Actions:**
1. Get text from: Ask Each Time
2. Set Variable: `question` = Shortcut Input
3. Get Contents of URL (KURA Search):
   - URL: `https://kura.tillmaessen.de/api/search?query=[question]`
   - Headers: `Authorization: Bearer YOUR_KEY`
4. Get Dictionary Value: `results`
5. Repeat with each item in `results`:
   - Get `excerpt` and `title`
   - Combine into text
6. Set Variable: `context` = Combined Text
7. Get Contents of URL (ChatGPT API):
   - URL: `https://api.openai.com/v1/chat/completions`
   - Body: Include `context` and `question`
8. Speak Text: AI response

**Usage:**
```
"Hey Siri, ask KURA about neural networks"
→ Searches your notes
→ Sends to ChatGPT
→ Speaks answer aloud
```

**Pros:**
- Fully hands-free
- Natural language interface
- Works offline (after initial setup)

**Cons:**
- Requires ChatGPT/Claude API key
- API costs

---

## 🔐 Security Considerations

### API Key Management

**For public MCP server:**
1. **Use user-specific API keys** (from KOauth)
2. **Enable HTTPS only**
3. **Consider rate limiting**
4. **Add IP whitelisting** (optional)

**For iOS Shortcuts:**
1. **Store API keys in iOS Keychain**
2. **Never share shortcuts with embedded keys**
3. **Revoke compromised keys immediately**

### Example: Secure Shortcut Setup

**Actions:**
1. Text: "kura_api_key" → Set Variable: `keyName`
2. Get from Keychain: `keyName`
3. If No Value:
   - Ask for Input: "Enter KURA API key"
   - Save to Keychain: `keyName` = Input
4. Use keychain value in requests

---

## 📊 Comparison Table

| Option | Setup | Cost | AI Quality | Offline | Voice |
|--------|-------|------|------------|---------|-------|
| **Remote MCP** | Hard | Free | Best | No | Via Claude |
| **Shortcuts + API** | Medium | $$$ | Best | No | Via Siri |
| **Web Interface** | Easy | Free | Good | No | No |
| **Siri Shortcuts** | Medium | $$$ | Best | No | Yes |

---

## 🚀 Recommended Approach

### Short-term: Shortcuts + ChatGPT API

**Why:**
- Works today
- No infrastructure changes
- Full AI capabilities
- Voice support via Siri

**Setup time:** ~30 minutes

**Cost:** ~$0.01-0.05 per query (ChatGPT API)

### Long-term: Remote MCP Server

**When:**
- Claude mobile adds MCP support
- OR you're willing to use Tailscale VPN

**Why:**
- Native integration
- No per-query costs
- Best user experience

---

## 📝 Example: Complete iOS Shortcut

**"Smart KURA Search"**

This shortcut:
1. Asks what you want to know
2. Searches KURA Notes
3. Sends results to ChatGPT
4. Shows AI-generated answer

**Download:** [Include link to .shortcut file]

**Setup:**
1. Download shortcut
2. Open in Shortcuts app
3. Edit and add your API keys:
   - KURA API key (from KOauth)
   - OpenAI API key
4. Save

**Usage:**
```
Run → "What are my notes about machine learning?"
    ↓
Searches KURA → Finds 5 relevant notes
    ↓
ChatGPT → Generates summary with citations
    ↓
Shows result
```

---

## ❓ FAQ

### Q: Does Claude mobile support MCP yet?
**A:** As of January 2025, check the Claude app settings. If you see "MCP Servers" or "Integrations", it's supported!

### Q: Which AI API should I use?
**A:**
- **ChatGPT (GPT-4):** Best for general questions, cheaper
- **Claude (Claude 3.5 Sonnet):** Best for long context, better reasoning
- **Both:** Use Claude for complex analysis, ChatGPT for quick lookups

### Q: How much do API calls cost?
**A:**
- ChatGPT: ~$0.01-0.03 per query
- Claude: ~$0.03-0.08 per query
- MCP (self-hosted): Free!

### Q: Can I use this offline?
**A:** No, all options require internet:
- KURA API is cloud-hosted
- AI APIs require connection
- MCP server requires network

### Q: What about privacy?
**A:**
- **Your notes:** Stay on your server
- **AI APIs:** Get excerpts only (not full notes)
- **MCP:** Direct connection (no third party)

---

## 🛠️ Technical Details

### MCP Server Configuration

**Current setup (localhost):**
```json
{
  "mcpServers": {
    "kura-notes": {
      "command": "node",
      "args": ["/path/to/mcp/dist/server.js"],
      "env": {
        "KURA_API_URL": "https://kura.tillmaessen.de",
        "API_KEY": "your-koauth-api-key"
      }
    }
  }
}
```

**Remote setup:**
```json
{
  "mcpServers": {
    "kura-notes": {
      "url": "https://mcp.tillmaessen.de/sse",
      "headers": {
        "Authorization": "Bearer your-auth-token"
      }
    }
  }
}
```

### Authentication Flow

```
┌──────────────┐
│ iOS Device   │
└──────┬───────┘
       │ Request with Bearer token
       ↓
┌──────────────────┐
│ MCP Server       │
│ (port 3001)      │
└──────┬───────────┘
       │ Forward request
       ↓
┌──────────────────┐
│ KURA API         │
│ (port 3000)      │
└──────┬───────────┘
       │ Validate with KOauth
       ↓
┌──────────────────┐
│ KOauth Service   │
└──────┬───────────┘
       │ Return user info
       ↓
   Access granted
```

---

## 📞 Next Steps

1. **Try Option 2 first** (Shortcuts + ChatGPT API)
   - Quick to set up
   - Works immediately
   - Test the experience

2. **Monitor Claude mobile updates**
   - Check for MCP support
   - When available, deploy remote MCP server

3. **Share your experience**
   - Let me know which approach works best
   - I can help optimize further

---

## 📚 Related Guides

- **iOS Shortcuts Setup:** `IOS-SHORTCUTS-GUIDE.md`
- **MCP Server Deployment:** `MCP-SETUP.md`
- **API Documentation:** `API-DOCS.md`
- **Vector Search:** `VECTOR-SEARCH-GUIDE.md`
