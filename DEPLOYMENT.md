# KURA Notes - Deployment Documentation

**Deployed:** 2025-11-19  
**Environment:** Production VPS  
**Status:** ✅ Successfully deployed and operational

---

## Server Configuration

**Provider:** Contabo VPS  
**Operating System:** Debian Linux 12  
**Resources:**
- CPU: 2 cores (AMD EPYC)
- RAM: 3.82 GB
- Disk: 273 GB available

**Network:**
- IP Address: 167.86.121.109
- Domain: kura.tillmaessen.de
- SSL: Automatic via System Caddy (Let's Encrypt)

---

## Deployment Steps

### 1. Initial Server Setup

```bash
# Update system
apt update
apt upgrade -y

# Install Docker
apt install docker.io docker-compose -y
systemctl start docker
systemctl enable docker

# Verify installation
docker --version
docker-compose --version
```

### 2. Install Portainer (Optional)

```bash
# Create Portainer volume
docker volume create portainer_data

# Run Portainer
docker run -d \
  -p 9000:9000 \
  -p 9443:9443 \
  --name portainer \
  --restart=always \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v portainer_data:/data \
  portainer/portainer-ce:latest
```

**Note:** Portainer ports (9000, 9443) may be blocked by Contabo's external firewall and require manual configuration in Contabo control panel.

### 3. Clone Repository

```bash
# Create application directory
mkdir -p /opt/kura-notes
cd /opt/kura-notes

# Generate SSH deploy key
ssh-keygen -t ed25519 -f ~/.ssh/deploy_kura

# Add public key to GitHub (Settings → Deploy Keys)
cat ~/.ssh/deploy_kura.pub

# Clone repository (private repo)
git clone git@github.com:TillMatthis/kura-notes.git /opt/kura-notes \
  -c core.sshCommand="ssh -i ~/.ssh/deploy_kura"
```

### 4. Configure Environment

```bash
# Create .env file
nano /opt/kura-notes/.env
```

**Required environment variables:**

```bash
NODE_ENV=production
API_PORT=3000
API_KEY=<generate-secure-random-key>
DATABASE_URL=/data/metadata/knowledge.db
VECTOR_STORE_URL=http://vectordb:8000
OPENAI_API_KEY=<your-openai-api-key>
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
STORAGE_BASE_PATH=/data/content
MAX_FILE_SIZE=52428800
LOG_LEVEL=info
LOG_DIR=/data/logs
CORS_ORIGIN=*
TLS_ENABLED=false
CHROMA_SERVER_AUTH_CREDENTIALS=<generate-random-key>
```

**Generate secure keys:**
```bash
# API key
openssl rand -base64 48

# ChromaDB credentials
openssl rand -hex 32
```

### 5. Create Data Directories

```bash
mkdir -p /opt/kura-notes/data/content
mkdir -p /opt/kura-notes/data/metadata
mkdir -p /opt/kura-notes/data/vectors
mkdir -p /opt/kura-notes/data/logs

# Set permissions (container runs as UID 1001)
chmod -R 777 /opt/kura-notes/data
```

### 6. Configure Firewall (UFW)

**Note:** Initially attempted nftables but switched to UFW for simpler management.

```bash
# Install UFW
apt update && apt install ufw -y

# Allow required ports
ufw allow 22/tcp      # SSH (critical - don't lock yourself out!)
ufw allow 80/tcp      # HTTP (Caddy redirects to HTTPS)
ufw allow 443/tcp     # HTTPS (Caddy)
ufw allow 25/tcp      # SMTP (email)
ufw allow 465/tcp     # SMTPS (secure email)
ufw allow 587/tcp     # Submission (email)
ufw allow 993/tcp     # IMAPS (secure email)
ufw allow 10000/tcp   # Webmin
ufw allow 9000/tcp    # Portainer HTTP
ufw allow 9443/tcp    # Portainer HTTPS

# Enable firewall
ufw --force enable

# Disable nftables (to avoid conflicts)
systemctl stop nftables
systemctl disable nftables

# Check firewall status
ufw status verbose
```

**⚠️ Security Note - Anthropic MCP IP Restrictions:**

The configuration above allows **all IPs** to access port 443 (HTTPS). For better security, consider restricting MCP endpoint access to only Anthropic's IP addresses.

See **[ANTHROPIC-IP-UPDATE.md](ANTHROPIC-IP-UPDATE.md)** for:
- Anthropic's IP address ranges
- Implementation guide (Caddy-based restrictions recommended)
- Helper script: `scripts/update-anthropic-ips.sh`

**Action Required by January 15, 2026** to maintain MCP server connectivity with new Anthropic IPs.

### 7. Build and Start Containers

```bash
cd /opt/kura-notes

# Build images
docker-compose build

# Start containers
docker-compose up -d

# Check status
docker ps

# View logs
docker-compose logs -f
```

### 8. Install and Configure System Caddy

**Note:** We use system-installed Caddy (apt) instead of Docker Caddy to support multiple services on the VPS.

```bash
# Add Caddy repository
apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | \
  gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | \
  tee /etc/apt/sources.list.d/caddy-stable.list

# Install Caddy
apt update
apt install caddy

# Stop Apache if running (conflicts on port 80)
systemctl stop apache2
systemctl disable apache2

# Configure Caddy
nano /etc/caddy/Caddyfile
```

**Caddyfile content:**
```
kura.tillmaessen.de {
    # Main API (proxies to Docker container on port 3000)
    reverse_proxy localhost:3000

    # MCP Server endpoint (proxies to Docker container on port 3001)
    handle /mcp* {
        reverse_proxy localhost:3001
    }
}
```

**Key Configuration Notes:**
- Main API runs on `localhost:3000` (docker-compose exposes this port)
- MCP server runs on `localhost:3001` (docker-compose exposes this port)
- System Caddy handles SSL/TLS via Let's Encrypt automatically
- The `/mcp*` path is routed to the MCP server for remote MCP client access

```bash
# Test Caddy configuration
caddy validate --config /etc/caddy/Caddyfile

# Restart Caddy
systemctl restart caddy
systemctl status caddy

# View Caddy logs if issues occur
journalctl -u caddy -f
```

### 9. Configure DNS

**At Contabo Domain Management:**
- Type: A
- Name: kura
- Value: 167.86.121.109
- TTL: 300

**Wait 5-10 minutes for DNS propagation, then test:**
```bash
ping kura.tillmaessen.de
# Should resolve to 167.86.121.109
```

### 10. Verify Deployment

```bash
# Check containers are running
docker ps

# Test health endpoint (requires API key)
curl https://kura.tillmaessen.de/api/health \
  -H "Authorization: Bearer YOUR_API_KEY"

# Should return:
# {"status":"healthy",...}
```

**Access web interface:**
https://kura.tillmaessen.de

**Set API key in browser console (F12):**
```javascript
localStorage.setItem('apiKey', 'YOUR_API_KEY')
```

Refresh page and the interface should work.

---

## Critical Fixes Applied During Deployment

### 1. npm ci Failure

**Problem:** Docker build failed with `npm ci` error (package-lock.json not found/incompatible)

**Solution:** Modified Dockerfile to use `npm install` instead of `npm ci`

```dockerfile
# Changed from:
RUN npm ci

# To:
RUN npm install
```

### 2. Missing schema.sql

**Problem:** Container crashed on startup with error: `ENOENT: no such file or directory, open '/app/dist/services/database/schema.sql'`

**Solution:** Added COPY instruction to Dockerfile

```dockerfile
# Added after COPY dist
COPY src/services/database/schema.sql ./dist/services/database/
```

### 3. ChromaDB Healthcheck Failure

**Problem:** ChromaDB healthcheck failed because curl/wget not available in container

**Solution:** Removed healthcheck from docker-compose.yml

```yaml
# Removed this section from vectordb service:
# healthcheck:
#   test: ["CMD", "curl", "-f", "http://localhost:8000/api/v1/heartbeat"]
#   ...
```

### 4. Database Permission Error

**Problem:** SQLite couldn't create database file: `unable to open database file`

**Solution:** Fixed data directory permissions

```bash
chmod -R 777 /opt/kura-notes/data
# Or more securely:
chown -R 1001:1001 /opt/kura-notes/data
```

### 5. Silent Startup Crashes

**Problem:** Container exited without error messages

**Solution:** Added verbose logging to src/index.ts startup sequence

```typescript
try {
  console.log('🚀 Starting KURA Notes...');
  console.log('📊 Initializing database...');
  await initDatabase();
  console.log('✓ Database initialized');
  // ... etc
} catch (error) {
  console.error('❌ FATAL ERROR:', error);
  console.error('Stack:', error.stack);
  process.exit(1);
}
```

---

## iOS Shortcut Configuration

**URL:** `https://kura.tillmaessen.de/api/capture`  
**Method:** POST

**Headers:**
```
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json
```

**Important:** Use `Authorization` header with `Bearer ` prefix, NOT `X-API-Key`!

**Body (JSON):**
```json
{
  "content": "[Shortcut Input]",
  "type": "text"
}
```

**iOS Shortcuts Setup:**
1. Create new shortcut
2. Add "Get Contents of URL" action
3. Configure URL, method, headers as above
4. Set body to JSON with content/type fields
5. Test by sharing text to the shortcut

---

## Maintenance Commands

### View Logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f api
docker-compose logs -f vectordb
```

### Restart Services
```bash
# Restart all
docker-compose restart

# Restart specific service
docker-compose restart api
```

### Stop/Start
```bash
# Stop all containers
docker-compose down

# Start all containers
docker-compose up -d
```

### Update Deployment
```bash
# Pull latest code
cd /opt/kura-notes
git pull

# Rebuild and restart
docker-compose down
docker-compose build
docker-compose up -d
```

### Check Container Health
```bash
docker ps
docker stats
```

---

## Backup Strategy

### Manual Backup

**Backup application data:**
```bash
cd /opt/kura-notes
tar -czf kura-backup-$(date +%Y%m%d).tar.gz data/
```

**Backup ChromaDB volume:**
```bash
docker run --rm \
  -v kura-chroma-data:/data \
  -v $(pwd):/backup \
  alpine tar -czf /backup/chroma-backup-$(date +%Y%m%d).tar.gz /data
```

### Automated Backups (TODO - Phase 2)
- Set up cron job for daily backups
- Sync to external storage (S3, cloud backup)
- Test restore procedures

---

## Security Considerations

### Current Security Measures
✅ HTTPS via System Caddy (automatic Let's Encrypt certificates)
✅ API authentication required (Bearer token)
✅ Strong random API key (64+ characters)
✅ Firewall configured (UFW)
✅ Only necessary ports open (22, 80, 443)

### Known Security Gaps (Phase 2 Improvements)
⚠️ Web UI publicly accessible (no authentication)
⚠️ No rate limiting
⚠️ No IP whitelisting for MCP endpoint
⚠️ CORS set to "*" (allows all origins)

### Anthropic MCP IP Security (Action Required)
**Deadline:** January 15, 2026

⚠️ **Current:** MCP endpoint accessible from any IP address
✅ **Recommended:** Restrict MCP access to Anthropic IPs only

**Implementation:**
See [ANTHROPIC-IP-UPDATE.md](ANTHROPIC-IP-UPDATE.md) for detailed instructions:
- Option A: Caddy-based restrictions (recommended - allows main API from anywhere)
- Option B: UFW-based restrictions (more restrictive - locks down entire HTTPS port)
- Helper script: `scripts/update-anthropic-ips.sh`

**Anthropic IP Ranges:**
- New: `160.79.104.0/21` (add by Jan 15, 2026)
- Legacy: 5 individual IPs (remove after April 1, 2026)

### Recommended Phase 2 Security Enhancements
- **[Priority]** Implement IP restrictions for MCP endpoint (see above)
- Add basic authentication to System Caddy for web UI
- Implement rate limiting in Caddy or application layer
- Restrict CORS to specific domains
- Set up fail2ban for SSH protection
- Regular security updates via unattended-upgrades

---

## Troubleshooting

### Container Won't Start

**Check logs:**
```bash
docker-compose logs api
```

**Common causes:**
- Missing environment variables
- Permission issues on data directories
- Port conflicts

### Can't Connect to API

**Check if API is listening:**
```bash
ss -tulpn | grep 3000
```

**Check Caddy status:**
```bash
systemctl status caddy
```

**Test locally first:**
```bash
curl http://localhost:3000/api/health
```

### ChromaDB Connection Issues

**Verify ChromaDB is running:**
```bash
docker-compose exec vectordb curl http://localhost:8000/api/v2/heartbeat
```

**Check network connectivity:**
```bash
docker-compose exec api ping vectordb
```

### DNS Issues

**Verify DNS propagation:**
```bash
dig kura.tillmaessen.de
nslookup kura.tillmaessen.de
```

**Check Contabo DNS settings in control panel**

### SSL Certificate Issues

**Check Caddy logs:**
```bash
journalctl -u caddy -f
```

**Verify ports 80 and 443 are open (required for Let's Encrypt)**

---

## Performance Monitoring

### Resource Usage
```bash
# Container stats
docker stats

# Disk usage
df -h /opt/kura-notes/data

# System resources
htop
```

### Log Rotation (TODO)
Set up log rotation to prevent disk space issues:
```bash
# Add to /etc/logrotate.d/kura-notes
/opt/kura-notes/data/logs/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
}
```

---

## Known Issues

1. **iOS notes titled "Untitled"**
   - Notes captured via iOS shortcut don't include title
   - Acceptable for MVP, can be improved in Phase 2

2. **Web UI requires manual API key setup**
   - No built-in UI for API key configuration
   - Must set via browser console
   - Phase 2: Add settings page

3. **Portainer not accessible externally**
   - Blocked by Contabo's firewall
   - Requires manual port configuration in Contabo panel
   - Alternative: Access via SSH tunnel

4. **No healthchecks in docker-compose**
   - Removed due to missing curl/wget in containers
   - Phase 2: Implement proper healthchecks using node

---

## Rollback Procedure

If deployment fails or issues arise:

```bash
# Stop current deployment
docker-compose down

# Restore from backup
cd /opt/kura-notes
tar -xzf kura-backup-YYYYMMDD.tar.gz

# Checkout previous working commit
git log
git checkout <previous-commit-hash>

# Rebuild and restart
docker-compose build
docker-compose up -d
```

---

## Next Steps (Phase 2)

- [ ] Add basic authentication to web UI (System Caddy basicauth)
- [ ] Implement proper healthchecks
- [ ] Set up automated backups
- [ ] Add monitoring and alerting
- [ ] Implement rate limiting (Caddy or application layer)
- [ ] Security audit and hardening
- [ ] Add web UI settings page for API key
- [ ] Migrate to EmbeddingGemma (cost savings)

---

## Support & Documentation

**Primary Documentation:**
- README.md - Project overview and quick start
- BUILD-CHECKLIST.md - Development roadmap
- technical-architecture.md - System architecture
- PHASE-2-PLAN.md - Future enhancements

**Deployment Date:** 2025-11-19  
**Deployed By:** Till Maessen  
**Deployment Time:** ~4 hours (with troubleshooting)  
**Status:** ✅ Production ready for personal use
