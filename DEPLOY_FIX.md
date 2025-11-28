# 🚀 Deploy KOAuth Authentication Fix

The API key validation fix has been committed locally but needs to be deployed to your VPS.

## Quick Deployment Steps

### 1️⃣ SSH into Your VPS

```bash
ssh user@kura.tillmaessen.de
```

### 2️⃣ Navigate to KURA Notes Directory

```bash
cd /path/to/kura-notes  # Adjust path as needed
```

### 3️⃣ Pull the Latest Changes

```bash
git fetch origin
git checkout claude/fix-koauth-kura-auth-012z9cvB69jLwaee3PsuAZYs
git pull origin claude/fix-koauth-kura-auth-012z9cvB69jLwaee3PsuAZYs
```

**Verify the fix is present:**
```bash
git log --oneline -1
# Should show: fc08e46 fix: Handle KOAuth API key validation response format correctly
```

### 4️⃣ Deploy Using Docker (Recommended)

```bash
# Stop current containers
docker-compose down

# Rebuild the API service with the fix
docker-compose build api

# Start services
docker-compose up -d

# Check logs to verify it's working
docker-compose logs -f api
```

**Look for these log messages:**
- `✓` "KOauth client initialized"
- `✓` "KOauth service is accessible and healthy"

### 5️⃣ Alternative: Direct Node.js Deployment

If not using Docker:

```bash
# Install dependencies (if needed)
npm install

# Build the project
npm run build

# Restart your Node.js process
# For pm2:
pm2 restart kura-notes

# For systemd:
sudo systemctl restart kura-notes

# For manual process:
# Stop the current process, then:
npm start
```

---

## 🧪 Test the Fix

### Test 1: Debug Script (On VPS)

```bash
# On your VPS, run:
node debug-koauth.js koa_zXo2l2_xxxx
```

**Expected Output:**
```
✅ API Key is VALID
   User ID: ...
   Email: ...

🎉 Authentication should work with this key!
```

### Test 2: Direct API Test

```bash
curl -X POST https://auth.tillmaessen.de/api/validate-key \
  -H "Content-Type: application/json" \
  -d '{"apiKey":"koa_zXo2l2_xxxx"}'
```

**Expected Response:**
```json
{
  "valid": true,
  "userId": "...",
  "email": "..."
}
```

### Test 3: KURA Notes API

```bash
curl -H "Authorization: Bearer koa_zXo2l2_xxxx" \
     -H "Content-Type: application/json" \
     -d '{"content":"test note","contentType":"text"}' \
     https://kura.tillmaessen.de/api/capture
```

**Expected:** HTTP 200 with note details ✅

---

## 🔍 Troubleshooting

### Issue: Still Getting 401 Errors

**1. Verify the fix is deployed:**
```bash
# On VPS:
cd /path/to/kura-notes
git show HEAD:src/lib/koauth-client.ts | grep -A 5 "data.valid"
```

You should see:
```typescript
// Check if the API key is valid
if (!data.valid) {
  logger.warn('API key validation failed', { error: data.error });
  return null;
}
```

**2. Check Docker container is using new code:**
```bash
docker-compose ps  # Verify containers are running
docker-compose logs api | tail -50  # Check recent logs
```

**3. Verify API key is valid:**
```bash
node debug-koauth.js koa_zXo2l2_xxxx
```

If this shows "INVALID", create a new API key:
- Go to https://auth.tillmaessen.de
- Login
- Navigate to API Keys section
- Create new key

**4. Check KURA Notes logs:**
```bash
# Docker:
docker-compose logs -f api | grep -i "api key"

# PM2:
pm2 logs kura-notes | grep -i "api key"

# Systemd:
journalctl -u kura-notes -f | grep -i "api key"
```

**Look for:**
- ✅ `"API key validated successfully"`
- ❌ `"API key validation failed"`
- ❌ `"Error validating API key with KOauth"`

---

### Issue: KOAuth Not Accessible

**Error:** `"Failed to connect to KOauth service"`

**Fixes:**
1. Verify KOAuth is running:
   ```bash
   curl https://auth.tillmaessen.de/health
   ```

2. Check environment variable:
   ```bash
   # In your .env file:
   KOAUTH_URL=https://auth.tillmaessen.de
   ```

3. Test from VPS:
   ```bash
   curl -X POST https://auth.tillmaessen.de/api/validate-key \
     -H "Content-Type: application/json" \
     -d '{"apiKey":"test"}'
   ```
   Should return JSON (even if invalid key)

---

### Issue: Wrong API Key Format

**Valid Format:** `koa_PREFIX_SECRET`
- PREFIX: 6 characters (e.g., `zXo2l2`)
- SECRET: 32 random characters
- Example: `koa_abc123_a1b2c3d4e5f67890a1b2c3d4e5f67890`

**Invalid Formats:**
- ❌ Missing `koa_` prefix
- ❌ Wrong separator
- ❌ Too short

---

## 📊 Monitoring

After deployment, monitor for successful authentications:

```bash
# Docker:
docker-compose logs -f api | grep "API key validated successfully"

# You should see:
# [info]: API key validated successfully { userId: '...', email: '...' }
```

---

## 🎯 Quick Checklist

Before testing:
- [ ] Code pulled from git (`fc08e46` commit)
- [ ] Docker containers rebuilt OR Node.js process restarted
- [ ] Environment variables set (KOAUTH_URL)
- [ ] KOAuth service is running and accessible
- [ ] API key format is correct (`koa_xxx...`)
- [ ] API key is not revoked in KOAuth

If all checked and still failing:
1. Run `node debug-koauth.js <your-key>` on VPS
2. Check the actual logs from KURA Notes API
3. Verify KOAuth endpoint responds correctly

---

## 💡 Need Help?

**Check these files for more info:**
- `src/lib/koauth-client.ts:204-251` - Validation function
- `src/api/middleware/auth.ts:191-218` - Auth middleware
- `.env.example` - Environment variable reference

**Common mistakes:**
1. Not rebuilding Docker containers after code change
2. Using old/revoked API key
3. KOAuth service not accessible from VPS
4. Missing KOAUTH_URL environment variable
