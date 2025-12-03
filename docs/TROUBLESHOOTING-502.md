# Troubleshooting 502 Bad Gateway Error for auth.tillmaessen.de

## Problem
Getting 502 Bad Gateway when accessing `https://auth.tillmaessen.de/oauth/authorize`

## Root Cause
The reverse proxy (Caddy/Nginx) cannot reach the KOauth backend service on port 3001.

---

## 🔥 MOST COMMON ISSUE: EACCES Permission Error

### Symptoms
KOauth container exits immediately with error:
```
EACCES: permission denied, mkdir '/app/keys'
koauth-app exited with code 1
```

### Root Cause
KOauth needs to create `/app/keys` directory to store RSA key pairs for JWT signing, but lacks write permissions.

### ✅ PERMANENT FIX

**1. Navigate to your KOauth directory:**
```bash
cd /path/to/koauth  # Where your docker-compose.yml is located
```

**2. Create keys directory:**
```bash
mkdir -p ./keys
chmod 777 ./keys  # Allow container to write
```

**3. Update `docker-compose.yml` to mount the directory:**

Add this volume mount to your KOauth service:

```yaml
services:
  koauth-app:  # or whatever your service is named
    # ... existing configuration ...
    volumes:
      - ./keys:/app/keys  # ← ADD THIS LINE
      # ... other volumes if any ...
```

**Full example:**
```yaml
services:
  koauth-app:
    image: koauth:latest
    container_name: koauth-app
    ports:
      - "3001:3000"
    volumes:
      - ./keys:/app/keys  # Mount keys directory
    environment:
      - DATABASE_URL=postgresql://koauth:${KOAUTH_DB_PASSWORD}@postgres:5432/koauth
      - SESSION_SECRET=${KOAUTH_SESSION_SECRET}
      - BASE_URL=${KOAUTH_BASE_URL}
      - ALLOWED_CALLBACKS=${KOAUTH_ALLOWED_CALLBACKS}
    restart: unless-stopped
    depends_on:
      - postgres
```

**4. Restart KOauth:**
```bash
docker compose down koauth-app
docker compose up -d koauth-app

# Watch logs to confirm it starts successfully
docker compose logs -f koauth-app
```

**5. Verify Success:**
```bash
# Should see "Server started successfully"
docker compose logs koauth-app | grep -i "started"

# Test health endpoint
curl http://localhost:3001/health
# Expected: {"status":"healthy"}

# Verify keys were created
ls -la ./keys/
# Should see: private.key and public.key files
```

---

## Step-by-Step Diagnostics

### 1. Check if KOauth is Running

```bash
# Check Docker containers
docker ps | grep koauth

# Expected output:
# <container-id>  koauth:latest  ... Up ... 0.0.0.0:3001->3000/tcp

# If not running, check all containers
docker compose ps
```

**If KOauth is NOT running:**
```bash
# Start it
docker compose up -d koauth

# Check logs for errors
docker compose logs -f koauth
```

---

### 2. Check if Port 3001 is Listening

```bash
# Check if anything is listening on port 3001
sudo netstat -tlnp | grep :3001
# OR
sudo ss -tlnp | grep :3001

# Expected output:
# tcp  0  0  0.0.0.0:3001  0.0.0.0:*  LISTEN  <pid>/docker-proxy
```

**If port 3001 is NOT listening:**
- KOauth service is not running
- Port mapping is wrong in docker-compose.yml

---

### 3. Test KOauth Directly (Bypass Reverse Proxy)

```bash
# Test from server
curl http://localhost:3001/health

# Expected response:
# {"status":"healthy"}

# If this works, the problem is with the reverse proxy
# If this fails, the problem is with KOauth
```

---

### 4. Check KOauth Logs

```bash
# View recent logs
docker compose logs --tail=100 koauth

# Follow logs in real-time
docker compose logs -f koauth

# Look for errors like:
# - Database connection errors
# - Port binding errors
# - Configuration errors
```

**Common log errors:**

| Error Message | Cause | Solution |
|---------------|-------|----------|
| `ECONNREFUSED` to PostgreSQL | Database not running | `docker compose up -d postgres` |
| `Port 3000 already in use` | Port conflict | Check other services, change port |
| `KOAUTH_SESSION_SECRET` not set | Missing env var | Add to `.env` file |
| `Database does not exist` | Database not initialized | Recreate database |

---

### 5. Check Reverse Proxy Configuration

#### If Using Caddy:

```bash
# Check Caddy status
sudo systemctl status caddy

# Check Caddy configuration
cat /etc/caddy/Caddyfile

# Expected config for auth subdomain:
# auth.tillmaessen.de {
#     reverse_proxy localhost:3001
# }

# Test Caddy configuration
sudo caddy validate --config /etc/caddy/Caddyfile

# Check Caddy logs
sudo journalctl -u caddy -n 100 -f

# Reload Caddy
sudo systemctl reload caddy
```

#### If Using Nginx:

```bash
# Check Nginx status
sudo systemctl status nginx

# Find Nginx config
ls -la /etc/nginx/sites-enabled/auth.tillmaessen.de*

# Check configuration
cat /etc/nginx/sites-enabled/auth.tillmaessen.de

# Expected proxy config:
# location / {
#     proxy_pass http://localhost:3001;
#     ...
# }

# Test Nginx configuration
sudo nginx -t

# Check Nginx error logs
sudo tail -100 /var/log/nginx/error.log

# Reload Nginx
sudo systemctl reload nginx
```

---

### 6. Check Docker Network

```bash
# Check if services are on the same network
docker network ls
docker network inspect kura-network

# Verify koauth container is in the network
docker compose ps koauth
```

---

### 7. Check Firewall Rules

```bash
# Check if firewall is blocking port 3001
sudo ufw status

# If 3001 is blocked, allow it (only if needed for debugging)
# NOTE: Usually not needed if using reverse proxy
sudo ufw allow 3001/tcp
```

---

## Common Issues and Fixes

### Issue 0: EACCES Permission Error on /app/keys (MOST COMMON)

**Symptoms:**
- KOauth exits immediately with code 1
- Logs show: `EACCES: permission denied, mkdir '/app/keys'`
- Container restarts repeatedly

**Fix:**

See the [**PERMANENT FIX section**](#-permanent-fix) at the top of this document for detailed steps.

**Quick fix:**
```bash
cd /path/to/koauth
mkdir -p ./keys && chmod 777 ./keys

# Add to docker-compose.yml under koauth service:
#   volumes:
#     - ./keys:/app/keys

docker compose down koauth-app
docker compose up -d koauth-app
```

**Why this happens:**
KOauth generates RSA key pairs (private.key and public.key) on startup for JWT signing. Without a volume mount, the container lacks permission to create the `/app/keys` directory.

---

### Issue 1: KOauth Container Not Running

**Symptoms:**
- `docker ps` doesn't show koauth
- 502 Bad Gateway error

**Fix:**
```bash
# Start KOauth
docker compose up -d koauth

# If it fails to start, check environment variables
docker compose config | grep -A 20 koauth

# Check for missing environment variables in .env
cat .env | grep -E "(KOAUTH_DB_PASSWORD|KOAUTH_SESSION_SECRET|KOAUTH_BASE_URL)"
```

---

### Issue 2: PostgreSQL Database Not Running

**Symptoms:**
- KOauth logs show database connection errors
- `ECONNREFUSED` to PostgreSQL

**Fix:**
```bash
# Start PostgreSQL
docker compose up -d postgres

# Wait for PostgreSQL to initialize (first time only)
sleep 10

# Restart KOauth
docker compose restart koauth

# Check logs
docker compose logs -f koauth
```

---

### Issue 3: Port 3001 Already in Use

**Symptoms:**
- KOauth won't start
- Error: "port is already allocated"

**Fix:**
```bash
# Find what's using port 3001
sudo netstat -tlnp | grep :3001

# Option 1: Stop the conflicting service
# Option 2: Change KOauth port in docker-compose.yml
# Change: "3001:3000" to "3002:3000"
# Then update Caddyfile to proxy to localhost:3002
```

---

### Issue 4: Reverse Proxy Misconfiguration

**Symptoms:**
- `curl http://localhost:3001/health` works
- `curl https://auth.tillmaessen.de/health` returns 502

**Fix (Caddy):**

1. Edit `/etc/caddy/Caddyfile`:
```caddy
auth.tillmaessen.de {
    reverse_proxy localhost:3001
    encode gzip
}
```

2. Reload Caddy:
```bash
sudo systemctl reload caddy
# OR
sudo caddy reload --config /etc/caddy/Caddyfile
```

3. Check logs:
```bash
sudo journalctl -u caddy -n 50 -f
```

---

### Issue 5: Docker Compose Port Mapping Wrong

**Symptoms:**
- Nothing listening on port 3001
- KOauth container running but not accessible

**Fix:**

Check `docker-compose.yml`:
```yaml
services:
  koauth:
    ports:
      - "${KOAUTH_PORT:-3001}:3000"  # Maps host:container
    # KOAUTH_PORT should be 3001 in .env
```

Verify in `.env`:
```bash
KOAUTH_PORT=3001
```

Restart:
```bash
docker compose down koauth
docker compose up -d koauth
```

---

## Quick Fix Checklist

Run these commands in order:

```bash
# 1. Check if KOauth is running
docker compose ps koauth

# 2. If not running, start it
docker compose up -d koauth

# 3. Check logs for errors
docker compose logs --tail=50 koauth

# 4. Test KOauth directly
curl http://localhost:3001/health

# 5. Check reverse proxy logs
sudo journalctl -u caddy -n 50
# OR
sudo tail -50 /var/log/nginx/error.log

# 6. Reload reverse proxy
sudo systemctl reload caddy
# OR
sudo systemctl reload nginx

# 7. Test again
curl https://auth.tillmaessen.de/health
```

---

## Verify the Fix

After fixing, verify:

```bash
# 1. Health check works
curl https://auth.tillmaessen.de/health
# Expected: {"status":"healthy"}

# 2. OAuth authorize endpoint works
curl -I "https://auth.tillmaessen.de/oauth/authorize?response_type=code&client_id=kura-notes&redirect_uri=https://kura.tillmaessen.de/oauth/callback"
# Expected: 302 redirect (not 502)

# 3. Test in browser
# Visit: https://kura.tillmaessen.de
# Should redirect to login page, not 502 error
```

---

## Still Not Working?

If you've tried everything above and still getting 502:

### Collect Debug Information

```bash
# 1. Docker status
docker compose ps > debug-docker.txt

# 2. KOauth logs
docker compose logs --tail=200 koauth > debug-koauth.txt

# 3. Reverse proxy logs (Caddy)
sudo journalctl -u caddy -n 200 > debug-caddy.txt

# 4. Port status
sudo netstat -tlnp > debug-ports.txt

# 5. Environment check
docker compose config > debug-compose.txt

# Review these files for errors
```

### Emergency Workaround (Temporary)

If you need to get it working immediately:

```bash
# Bypass reverse proxy temporarily for testing
# Add port mapping to docker-compose.yml:
koauth:
  ports:
    - "3001:3000"

# Test directly: http://<SERVER_IP>:3001/health
# THIS IS INSECURE - FIX THE REVERSE PROXY ASAP
```

---

## Need More Help?

Share these files:
1. `docker compose ps` output
2. `docker compose logs koauth` (last 100 lines)
3. Reverse proxy logs (last 100 lines)
4. `/etc/caddy/Caddyfile` OR nginx config (sanitized)
5. DNS lookup results: `nslookup auth.tillmaessen.de`

---

**Last Updated:** 2025-12-03
**Issue:** 502 Bad Gateway for auth.tillmaessen.de
