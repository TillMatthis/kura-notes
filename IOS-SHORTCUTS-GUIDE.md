# iOS Shortcuts Integration Guide

## 🔄 Authentication Changes

### ⚠️ Important: Old API Key Approach No Longer Works

**What changed:**
- Previously: Single `API_KEY` from `.env` file (deprecated)
- Now: **User-specific API keys** from KOauth authentication system

**Why it changed:**
- Multi-user support added via KOauth
- Better security with per-user API keys
- User isolation for all content

---

## ✅ Current Status: Bearer Token Authentication Still Supported!

**Good news:** Bearer token authentication works! The auth middleware supports:

```
Priority 1: OAuth session (browser cookies)
Priority 2: Legacy session (backward compatibility)
Priority 3: API key with Bearer token ✅ (for iOS Shortcuts)
```

See: `src/api/middleware/auth.ts:192-218`

---

## 🔑 How to Get Your API Key

### Option 1: Via KOauth Service (Recommended)

KOauth needs to provide an API key management interface. The API key validation flow is:

```
iOS Shortcut → KURA API (with Bearer token)
            ↓
KURA API → validates with KOauth: POST /api/validate-key
            ↓
KOauth → returns user info {userId, email}
            ↓
KURA API → allows access to user's content
```

**Steps:**
1. Log in to your KOauth dashboard: `https://auth.tillmaessen.de`
2. Navigate to API Keys section (if available)
3. Generate a new API key
4. Copy the key (format: `koauth_ak_xxxxxxxxxxxxx`)
5. Use it in your iOS Shortcut

**Status:** ⚠️ Need to verify if KOauth has API key generation UI implemented

### Option 2: Development/Testing Only

For development or testing without KOauth API keys, you can use test headers:

```bash
# Only works when NODE_ENV !== 'production'
X-Test-User-ID: your-user-id
X-Test-User-Email: your-email@example.com
```

**Note:** This won't work in production! Only for local development.

---

## 📱 iOS Shortcut Configuration

### Current Setup (If You Have an API Key)

**Shortcut actions:**

1. **Get Contents of URL**
   - URL: `https://kura.tillmaessen.de/api/capture`
   - Method: `POST`

2. **Headers:**
   ```
   Content-Type: application/json
   Authorization: Bearer YOUR_KOAUTH_API_KEY
   ```

3. **Request Body (JSON):**
   ```json
   {
     "content": "[Shortcut Input]",
     "contentType": "text",
     "title": "Note from iOS",
     "annotation": "Captured via iPhone",
     "tags": ["ios", "mobile"]
   }
   ```

### Example: Quick Capture from Share Sheet

**Shortcut Name:** "Save to KURA"

**Actions:**
1. Receive "Text" from Share Sheet
2. Set Variable: `noteContent` = Shortcut Input
3. Get Contents of URL:
   - URL: `https://kura.tillmaessen.de/api/capture`
   - Method: POST
   - Headers:
     - `Content-Type`: `application/json`
     - `Authorization`: `Bearer koauth_ak_your_key_here`
   - Body: JSON
     ```json
     {
       "content": "[noteContent]",
       "contentType": "text",
       "tags": ["ios-capture"]
     }
     ```
4. Show Alert: "Saved to KURA!" (optional)

### Example: Capture with Title Prompt

**Actions:**
1. Receive "Text" from Share Sheet
2. Ask for Input: "Title for this note?"
3. Set Variable: `noteTitle` = Provided Input
4. Set Variable: `noteContent` = Shortcut Input
5. Get Contents of URL:
   - Body:
     ```json
     {
       "content": "[noteContent]",
       "contentType": "text",
       "title": "[noteTitle]",
       "tags": ["ios-capture"]
     }
     ```

---

## 🔍 Troubleshooting

### Problem: "Authentication required" Error

**Symptoms:**
- Shortcut shows 401 error
- Response: "Authentication required"

**Causes:**
1. API key not set or invalid
2. API key format incorrect
3. KOauth service down

**Solution:**
1. Verify API key is correct
2. Check Authorization header format: `Bearer YOUR_KEY` (with space after "Bearer")
3. Test API key manually:
   ```bash
   curl https://kura.tillmaessen.de/api/me \
     -H "Authorization: Bearer YOUR_KEY"
   ```

### Problem: "403 Forbidden" or "Invalid API key"

**Symptoms:**
- API key validation fails
- KOauth rejects the key

**Solutions:**
1. Regenerate API key from KOauth dashboard
2. Ensure API key hasn't been revoked
3. Check KOauth service is running:
   ```bash
   curl https://auth.tillmaessen.de/health
   ```

### Problem: Old API_KEY from .env Doesn't Work

**Expected!** The old approach is deprecated.

**Migration:**
1. Remove `API_KEY` from iOS Shortcut
2. Get user-specific API key from KOauth
3. Update Shortcut with new `Authorization: Bearer` header

---

## 🚀 Advanced: Image and PDF Capture

### Capture Images from Photos

**Actions:**
1. Receive "Images" from Share Sheet
2. Get Contents of URL:
   - URL: `https://kura.tillmaessen.de/api/capture`
   - Method: POST
   - Headers:
     - `Authorization`: `Bearer YOUR_KEY`
   - Request Body: File
   - Choose Variable: Select Image

**Note:** For multipart/form-data uploads, the API expects:
- Field name: `file`
- Content-Type: Automatically detected

### Capture from Nebo Notes Export

**Actions:**
1. Receive "PDFs" or "Text" from Share Sheet
2. Determine Type: If PDF → contentType: "pdf", else → contentType: "text"
3. Get Contents of URL with appropriate body

---

## 🔐 Security Best Practices

### Protecting Your API Key

1. **Don't share Shortcuts with API keys embedded**
   - Remove API key before sharing
   - Use "Ask for Input" to prompt for API key

2. **Revoke compromised keys immediately**
   - Generate new key from KOauth
   - Update all Shortcuts

3. **Use different keys for different devices**
   - iPhone: `koauth_ak_iphone_xxx`
   - iPad: `koauth_ak_ipad_xxx`
   - Easier to track and revoke

### Example: Secure Shortcut Setup

**Actions:**
1. Text: "kura_api_key" → Set Variable: `keyName`
2. Get from Keychain: `keyName`
3. If "No Value":
   - Ask for Input: "Enter your KURA API key"
   - Save to Keychain: `keyName` = Provided Input
4. Use Keychain value in Authorization header

---

## 📊 Verification

### Test Your Setup

1. **Test API key:**
   ```bash
   curl https://kura.tillmaessen.de/api/me \
     -H "Authorization: Bearer YOUR_KEY"
   ```

   Expected response:
   ```json
   {
     "id": "user-uuid",
     "email": "you@example.com"
   }
   ```

2. **Test capture:**
   ```bash
   curl https://kura.tillmaessen.de/api/capture \
     -H "Authorization: Bearer YOUR_KEY" \
     -H "Content-Type: application/json" \
     -d '{
       "content": "Test from iOS",
       "contentType": "text",
       "tags": ["test"]
     }'
   ```

   Expected response:
   ```json
   {
     "success": true,
     "id": "content-uuid",
     "message": "Content captured successfully"
   }
   ```

3. **Verify in web interface:**
   - Visit https://kura.tillmaessen.de
   - Check "Recent" or "Search"
   - Find your test note

---

## ❓ FAQ

### Q: Can I still use the old API_KEY from .env?
**A:** No. The old `API_KEY` is deprecated. You need a user-specific API key from KOauth.

### Q: Where do I get a KOauth API key?
**A:** Log in to KOauth dashboard (https://auth.tillmaessen.de) and navigate to API Keys section. If this UI doesn't exist yet, contact the system administrator.

### Q: How do I update my existing iOS Shortcut?
**A:**
1. Open Shortcuts app
2. Find your KURA shortcut
3. Edit it
4. Update the Authorization header: `Bearer YOUR_NEW_KEY`
5. Remove any old `X-Api-Key` headers

### Q: Can multiple Shortcuts share the same API key?
**A:** Yes! All Shortcuts on your devices can use the same API key since they're all tied to your user account.

### Q: Will my old notes still be accessible?
**A:** Yes! All your existing notes are tied to your KOauth user ID and will be accessible after you set up the new authentication.

---

## 📝 Next Steps

### If KOauth API Key Management Doesn't Exist Yet

**Option A: Implement KOauth API Key Feature**
1. Add API key generation to KOauth service
2. Create UI for users to manage keys
3. Implement key validation endpoint: `POST /api/validate-key`

**Option B: Temporary Workaround (Development Only)**
You can manually create an API key for testing by:
1. SSH to KOauth server
2. Use KOauth CLI or database to generate a key
3. Manually associate it with your user ID

**Option C: Alternative Authentication**
Consider implementing alternative auth methods:
- Personal Access Tokens (PAT) generated via KURA web UI
- OAuth device flow for mobile devices
- Short-lived JWT tokens

---

## 🛠️ Technical Details

### Authentication Flow

```
┌─────────────┐
│ iOS Shortcut│
└──────┬──────┘
       │ POST /api/capture
       │ Authorization: Bearer koauth_ak_xxx
       ↓
┌──────────────────────┐
│ KURA API             │
│ (auth.ts:192-218)    │
└──────┬───────────────┘
       │ Validate API key
       │ POST /api/validate-key
       │ Body: { apiKey: "koauth_ak_xxx" }
       ↓
┌──────────────────────┐
│ KOauth Service       │
│ (koauth-client.ts)   │
└──────┬───────────────┘
       │ Returns user info
       │ { userId, email }
       ↓
┌──────────────────────┐
│ KURA API             │
│ Allows access to     │
│ user's content       │
└──────────────────────┘
```

### Code References

- **Auth Middleware:** `src/api/middleware/auth.ts`
- **API Key Validation:** `src/lib/koauth-client.ts:204-251`
- **Capture Endpoint:** `src/api/routes/capture.ts`
- **Settings UI:** `public/js/settings.js` (for web interface)

---

## 📞 Support

**Questions or issues?**
1. Check KURA Notes documentation: `/home/user/kura-notes/API-DOCS.md`
2. Review troubleshooting guide: `/home/user/kura-notes/TROUBLESHOOTING.md`
3. Create an issue: `https://github.com/TillMatthis/kura-notes/issues`

**Related Guides:**
- Vector Search Architecture: `VECTOR-SEARCH-GUIDE.md`
- API Documentation: `API-DOCS.md`
- Deployment Guide: `DEPLOYMENT.md`
