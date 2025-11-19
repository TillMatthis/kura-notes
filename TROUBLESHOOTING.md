# KURA Notes - Troubleshooting Guide

Quick solutions to common problems with KURA Notes.

---

## Web Interface Issues

### Problem: "API Key Required" Error

**Symptoms:**
- Web interface shows "API Key Required" message
- Can't create or view content

**Solution:**
1. Open browser console (F12 or Cmd+Option+I)
2. Set your API key:
   ```javascript
   localStorage.setItem('apiKey', 'YOUR_ACTUAL_API_KEY')
   ```
3. Refresh the page (Cmd+R or F5)

**To verify API key is set:**
```javascript
localStorage.getItem('apiKey')
// Should return your API key
```

**To get your API key from server:**
```bash
# SSH into server
ssh root@167.86.121.109

# View API key
grep API_KEY /opt/kura-notes/.env
```

---

### Problem: Web Interface Won't Load

**Symptoms:**
- Blank page
- Infinite loading
- Connection error

**Check 1: Is the server running?**
```bash
# SSH into server
ssh root@167.86.121.109

# Check containers
docker ps

# Should see:
# - kura-notes-api (Up)
# - kura-notes-chromadb (Up)
```

**If containers are down:**
```bash
cd /opt/kura-notes
docker-compose up -d
```

**Check 2: Is Caddy running?**
```bash
systemctl status caddy

# If not running:
systemctl start caddy
```

**Check 3: Can you reach the domain?**
```bash
# From your computer
ping kura.tillmaessen.de

# Should respond with 167.86.121.109
```

**Check 4: DNS issues?**
```bash
# Wait 5-10 minutes after DNS changes
# Clear your DNS cache:

# Mac:
sudo dscacheutil -flushcache

# Windows:
ipconfig /flushdns

# Linux:
sudo systemd-resolve --flush-caches
```

---

### Problem: Content Not Appearing

**Symptoms:**
- Created content but don't see it
- Search returns no results
- List is empty

**Solution 1: Check API key is correct**
```javascript
// In browser console
localStorage.getItem('apiKey')
// Compare with server's API_KEY
```

**Solution 2: Check if content was actually saved**
```bash
# SSH into server
cd /opt/kura-notes

# Check database
docker-compose exec api ls -la /data/content/

# Should show files if content exists
```

**Solution 3: View API logs**
```bash
cd /opt/kura-notes
docker-compose logs api | tail -50

# Look for errors during content creation
```

**Solution 4: Force refresh**
- Hard refresh: Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)
- Clear cache and reload

---

## iOS Shortcut Issues

### Problem: Shortcut Does Nothing

**Symptoms:**
- Run shortcut, nothing happens
- No error message
- Content doesn't appear in KURA

**Check 1: Authorization header**

Must be exactly:
- **Key:** `Authorization`
- **Value:** `Bearer YOUR_API_KEY` (note the space after "Bearer")

**NOT:**
- ❌ `X-API-Key`
- ❌ `Api-Key`
- ❌ `Bearer YOUR_API_KEY` (no space)

**Check 2: URL is correct**
```
https://kura.tillmaessen.de/api/capture
```

**NOT:**
- ❌ `http://` (must be https)
- ❌ Missing `/api/capture`
- ❌ Wrong domain

**Check 3: Body format**

Must be JSON with:
```json
{
  "content": "[Shortcut Input]",
  "type": "text"
}
```

**Check 4: Test with curl**
```bash
curl -X POST https://kura.tillmaessen.de/api/capture \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"content":"test from curl","type":"text"}'

# Should return:
# {"success":true,"id":"..."}
```

---

### Problem: Shortcut Shows Error

**Common Errors:**

**"MISSING_API_KEY"**
- Authorization header is wrong or missing
- Check header key is `Authorization`
- Check value starts with `Bearer ` (with space)

**"INVALID_API_KEY"**
- API key is incorrect
- Get correct key from server: `grep API_KEY /opt/kura-notes/.env`

**"Invalid JSON"**
- Body format is wrong
- Make sure it's valid JSON
- Check quotes are correct

**"Network error" / "Could not connect"**
- Server might be down
- Check: https://kura.tillmaessen.de in browser
- SSH to server and check containers: `docker ps`

---

### Problem: Notes Titled "Untitled"

**Symptoms:**
- All iOS-captured notes have title "Untitled"

**This is expected MVP behavior!**

Shortcut currently sends:
```json
{
  "content": "Your note text",
  "type": "text"
}
```

No `title` field included.

**Workarounds:**

**Option 1: Add title in web UI later**
1. Open https://kura.tillmaessen.de
2. Find the "Untitled" note
3. (Phase 2: Edit in place)
4. (MVP: Delete and recreate with title)

**Option 2: Modify shortcut to ask for title**
1. Edit shortcut
2. Add "Ask for Input" action before URL call
3. Include title in JSON:
   ```json
   {
     "content": "[Content Input]",
     "type": "text",
     "title": "[Title Input]"
   }
   ```

**Phase 2 will improve this!**

---

## Server / Docker Issues

### Problem: Container Won't Start

**Symptoms:**
- `docker ps` shows container missing
- Container exits immediately
- Restart loop

**Check logs:**
```bash
cd /opt/kura-notes

# View API logs
docker-compose logs api

# View ChromaDB logs
docker-compose logs vectordb

# View all logs
docker-compose logs
```

**Common Causes:**

**Missing environment variables:**
```bash
# Check .env file exists and is complete
cat /opt/kura-notes/.env

# Required variables:
# - API_KEY
# - OPENAI_API_KEY
# - DATABASE_URL
# - VECTOR_STORE_URL
```

**Permission issues:**
```bash
# Fix data directory permissions
chmod -R 777 /opt/kura-notes/data

# Or more secure:
chown -R 1001:1001 /opt/kura-notes/data
```

**Port conflicts:**
```bash
# Check if port 3000 is already in use
ss -tulpn | grep 3000

# If something else is using it, stop it
```

**Restart containers:**
```bash
cd /opt/kura-notes
docker-compose down
docker-compose up -d
```

---

### Problem: Can't Connect to API

**Symptoms:**
- curl fails
- Browser can't reach site
- Connection timeout

**Check 1: Firewall**
```bash
# Check UFW status
ufw status verbose

# Required ports should be open:
# 22, 80, 443

# If not:
ufw allow 80/tcp
ufw allow 443/tcp
```

**Check 2: Caddy**
```bash
# Is Caddy running?
systemctl status caddy

# Check Caddy logs
journalctl -u caddy -n 50

# Restart Caddy
systemctl restart caddy
```

**Check 3: Is anything blocking port 80/443?**
```bash
# Check what's listening
ss -tulpn | grep ':80\|:443'

# Should show Caddy
```

**Check 4: Test locally first**
```bash
# SSH into server
curl http://localhost:3000/api/health

# Should work even if external access doesn't
```

---

### Problem: Search Not Working

**Symptoms:**
- Search returns no results
- Search errors out
- Slow search performance

**Check 1: Is ChromaDB running?**
```bash
docker ps | grep chroma

# Should show container running
```

**Check 2: Can API reach ChromaDB?**
```bash
# From API container
docker-compose exec api ping vectordb

# Should respond
```

**Check 3: Are embeddings being generated?**
```bash
# Check API logs for embedding errors
docker-compose logs api | grep -i embed

# Look for:
# - "Embedding service initialized (available)"
# - NOT "OPENAI_API_KEY not set"
```

**Check 4: OpenAI API key valid?**
```bash
# Verify key is set
grep OPENAI_API_KEY /opt/kura-notes/.env

# Test manually (optional)
curl https://api.openai.com/v1/embeddings \
  -H "Authorization: Bearer YOUR_OPENAI_KEY" \
  -H "Content-Type: application/json" \
  -d '{"input":"test","model":"text-embedding-3-small"}'
```

---

### Problem: Out of Disk Space

**Symptoms:**
- Database errors
- Can't save content
- Container crashes

**Check disk usage:**
```bash
df -h

# Check /opt/kura-notes specifically
du -sh /opt/kura-notes/data/*
```

**Clean up:**
```bash
# Remove old Docker images
docker system prune -a

# Remove old logs
cd /opt/kura-notes/data/logs
rm *.log.old

# Back up and remove old content
cd /opt/kura-notes
tar -czf backup-$(date +%Y%m%d).tar.gz data/
# Move backup off server
# Delete old content via web UI
```

---

## Performance Issues

### Problem: Slow Search

**Possible causes:**
- Too much content
- ChromaDB container under-resourced
- Network latency

**Check ChromaDB health:**
```bash
curl http://localhost:8000/api/v2/heartbeat

# Should respond quickly
```

**Check resource usage:**
```bash
docker stats

# Look at CPU/Memory usage
# ChromaDB should have plenty of RAM
```

**Restart ChromaDB:**
```bash
docker-compose restart vectordb
```

---

### Problem: Slow Content Creation

**Check logs during save:**
```bash
docker-compose logs -f api

# Create content and watch logs
# Look for slowdowns
```

**Common causes:**
- Embedding generation (can take 1-2 seconds)
- Large files
- Network issues with OpenAI API

**This is normal for MVP - Phase 2 will optimize!**

---

## SSL / HTTPS Issues

### Problem: SSL Certificate Error

**Symptoms:**
- Browser shows "Not Secure"
- Certificate warnings
- HTTPS doesn't work

**Check 1: DNS is correct**
```bash
ping kura.tillmaessen.de
# Should return 167.86.121.109
```

**Check 2: Caddy has obtained certificate**
```bash
journalctl -u caddy | grep certificate

# Look for successful certificate issuance
```

**Check 3: Ports 80 and 443 are open**
```bash
ufw status | grep -E '80|443'

# Both should be allowed
```

**Force certificate renewal:**
```bash
systemctl stop caddy
systemctl start caddy

# Watch logs
journalctl -u caddy -f
```

---

## Database Issues

### Problem: Database Corruption

**Symptoms:**
- SQLite errors in logs
- Content disappears
- Can't query database

**Solution 1: Restart API container**
```bash
docker-compose restart api
```

**Solution 2: Check database file**
```bash
cd /opt/kura-notes/data/metadata
ls -lh knowledge.db

# Should exist and have reasonable size
```

**Solution 3: Restore from backup**
```bash
cd /opt/kura-notes
tar -xzf backup-YYYYMMDD.tar.gz
docker-compose restart
```

---

## Emergency Procedures

### Complete Reset (Nuclear Option)

**⚠️ WARNING: Deletes all data!**

```bash
# Stop everything
cd /opt/kura-notes
docker-compose down

# Remove all data
rm -rf data/*

# Recreate directories
mkdir -p data/{content,metadata,vectors,logs}
chmod -R 777 data/

# Restart
docker-compose up -d
```

---

### Restore from Backup

```bash
# Stop containers
cd /opt/kura-notes
docker-compose down

# Restore data
tar -xzf backup-YYYYMMDD.tar.gz

# Fix permissions
chmod -R 777 data/

# Restart
docker-compose up -d
```

---

## Getting Logs

### API Logs
```bash
docker-compose logs api

# Last 50 lines
docker-compose logs --tail=50 api

# Follow (live)
docker-compose logs -f api

# Save to file
docker-compose logs api > api-logs.txt
```

### ChromaDB Logs
```bash
docker-compose logs vectordb
```

### Caddy Logs
```bash
journalctl -u caddy -n 100

# Follow
journalctl -u caddy -f

# Save to file
journalctl -u caddy > caddy-logs.txt
```

### System Logs
```bash
# General system logs
journalctl -xe

# Docker daemon
journalctl -u docker
```

---

## Prevention & Monitoring

### Regular Health Checks

**Daily:**
```bash
# Quick status check
docker ps
systemctl status caddy
```

**Weekly:**
```bash
# Disk usage
df -h

# Container stats
docker stats --no-stream

# Check logs for errors
docker-compose logs --tail=100 | grep -i error
```

### Backup Schedule

**Automated backup (recommended):**
```bash
# Add to crontab
crontab -e

# Daily backup at 2 AM
0 2 * * * cd /opt/kura-notes && tar -czf ~/backups/kura-$(date +\%Y\%m\%d).tar.gz data/
```

---

## Still Having Issues?

1. **Check all logs** (API, ChromaDB, Caddy, system)
2. **Search similar issues** on GitHub
3. **Create detailed issue** with:
   - Problem description
   - Steps to reproduce
   - Error messages from logs
   - System info (OS, Docker version)
4. **Temporary workaround:** Restart everything
   ```bash
   docker-compose down
   systemctl restart caddy
   docker-compose up -d
   ```

---

## Additional Resources

- **API Documentation:** See API-DOCS.md
- **User Guide:** See USER-GUIDE.md  
- **Deployment Docs:** See DEPLOYMENT.md
- **GitHub Issues:** https://github.com/TillMatthis/kura-notes/issues

---

**Last Updated:** 2025-11-19
