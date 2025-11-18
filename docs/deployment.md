# KURA Notes - Production Deployment Guide

**Last Updated:** 2025-11-18
**Version:** 1.0
**Target:** Proxmox VE / Docker-based deployments

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Quick Start](#quick-start)
4. [Detailed Setup](#detailed-setup)
5. [Configuration](#configuration)
6. [Health Checks](#health-checks)
7. [Troubleshooting](#troubleshooting)
8. [Maintenance](#maintenance)
9. [Security Considerations](#security-considerations)
10. [Backup and Restore](#backup-and-restore)

---

## Overview

KURA Notes is deployed as a containerized application using Docker Compose. The production setup includes:

- **API Service:** Node.js/Fastify backend running on port 3000
- **ChromaDB Service:** Vector database running on port 8000
- **Data Persistence:** SQLite database, file storage, and vector data
- **Health Monitoring:** Built-in health checks for both services
- **Resource Management:** CPU and memory limits configured

**Architecture:**
```
┌─────────────────────────────────────────┐
│          Reverse Proxy (Optional)       │
│          (Nginx/Caddy/Traefik)          │
└───────────────┬─────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────┐
│         KURA Notes API Service          │
│         (Node.js + Fastify)             │
│         Port: 3000                      │
│         Resources: 1 CPU, 1GB RAM       │
└───────────────┬─────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────┐
│         ChromaDB Vector Store           │
│         Port: 8000                      │
│         Resources: 2 CPU, 2GB RAM       │
└─────────────────────────────────────────┘
```

---

## Prerequisites

### System Requirements

**Minimum:**
- CPU: 2 cores
- RAM: 4GB
- Disk: 20GB free space
- OS: Linux (Ubuntu 20.04+, Debian 11+, or similar)

**Recommended:**
- CPU: 4 cores
- RAM: 8GB
- Disk: 50GB+ free space (for data storage)
- OS: Ubuntu 22.04 LTS or Debian 12

### Software Requirements

1. **Docker** (version 20.10+)
2. **Docker Compose** (version 2.0+)
3. **Git** (for cloning the repository)
4. **OpenSSL** (for generating keys)

### Installation of Prerequisites

**Ubuntu/Debian:**
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Install Docker Compose
sudo apt install docker-compose-plugin -y

# Install Git and OpenSSL
sudo apt install git openssl -y

# Log out and back in for group changes to take effect
```

**Verify Installation:**
```bash
docker --version
docker compose version
git --version
openssl version
```

---

## Quick Start

### 1. Clone Repository

```bash
# Clone the repository
git clone https://github.com/TillMatthis/kura-notes.git
cd kura-notes

# Or if you already have it, pull latest changes
git pull origin main
```

### 2. Configure Environment

```bash
# Copy environment template
cp .env.example .env

# Generate API key
openssl rand -hex 32

# Edit .env file
nano .env
```

**Minimum required changes in `.env`:**
```bash
# Set to production
NODE_ENV=production

# Set generated API key (from openssl command above)
API_KEY=<your-generated-key>

# Set OpenAI API key (get from https://platform.openai.com/api-keys)
OPENAI_API_KEY=sk-...

# For Docker, use service name
VECTOR_STORE_URL=http://vectordb:8000

# Disable ChromaDB auth for simplicity (or configure if needed)
CHROMA_SERVER_AUTH_CREDENTIALS=
```

### 3. Build and Start Services

```bash
# Build the Docker image
docker compose build

# Start all services in detached mode
docker compose up -d

# View logs
docker compose logs -f

# Check service status
docker compose ps
```

### 4. Verify Deployment

```bash
# Check API health
curl http://localhost:3000/api/health

# Expected response:
# {
#   "status": "healthy",
#   "timestamp": "2025-11-18T...",
#   "uptime": 123.45,
#   "services": {
#     "database": {"status": "up", "responseTime": 5},
#     "vectorStore": {"status": "up", "message": "Connected (0 documents)", "responseTime": 10}
#   }
# }

# Access web interface
# Open browser: http://your-server-ip:3000
```

---

## Detailed Setup

### Directory Structure

After deployment, your data will be organized as:

```
kura-notes/
├── data/                      # Persistent data (bind mount)
│   ├── content/              # Uploaded files (images, PDFs, text)
│   │   ├── YYYY/MM/DD/       # Date-based organization
│   │   └── thumbnails/       # Generated thumbnails
│   ├── metadata/             # SQLite database
│   │   └── knowledge.db
│   └── logs/                 # Application logs
│       ├── app.log
│       └── error.log
├── chroma-data/              # ChromaDB vector data (named volume)
└── docker-compose.yml
```

### Resource Limits

**API Service:**
- CPU Limit: 1.0 cores
- CPU Reservation: 0.25 cores
- Memory Limit: 1GB
- Memory Reservation: 256MB

**ChromaDB Service:**
- CPU Limit: 2.0 cores
- CPU Reservation: 0.5 cores
- Memory Limit: 2GB
- Memory Reservation: 512MB

**To adjust limits**, edit `docker-compose.yml`:
```yaml
deploy:
  resources:
    limits:
      cpus: '2.0'        # Maximum CPU cores
      memory: 2G         # Maximum memory
    reservations:
      cpus: '0.5'        # Reserved CPU cores
      memory: 512M       # Reserved memory
```

### Network Configuration

The services run on a custom bridge network `kura-network`:

- **API Service:** Accessible on port 3000
- **ChromaDB Service:** Accessible on port 8000 (internal communication)
- **Inter-service communication:** Uses Docker DNS (vectordb:8000)

**To change ports**, edit `.env`:
```bash
API_PORT=3000          # External API port
VECTOR_DB_PORT=8000    # External ChromaDB port (if needed)
```

---

## Configuration

### Environment Variables

See [setup.md](./setup.md) for complete environment variable reference.

**Production-specific settings:**

```bash
# Environment
NODE_ENV=production

# Security
API_KEY=<strong-random-key>           # Required for API access
CORS_ORIGIN=https://your-domain.com   # Restrict CORS

# Logging
LOG_LEVEL=info                        # or 'warn' for less verbose
LOG_DIR=/data/logs

# Storage
STORAGE_BASE_PATH=/data/content
MAX_FILE_SIZE=52428800                # 50MB

# OpenAI
OPENAI_API_KEY=sk-...                 # Required for embeddings
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
```

### Docker Compose Customization

**Custom docker-compose.yml changes:**

1. **Add reverse proxy integration:**
```yaml
services:
  api:
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.kura.rule=Host(`notes.example.com`)"
```

2. **Enable external access to ChromaDB (not recommended):**
```yaml
services:
  vectordb:
    ports:
      - "8000:8000"    # Expose to host
```

3. **Add backup volume:**
```yaml
volumes:
  backup-data:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: /path/to/backup/location
```

---

## Health Checks

### Built-in Health Checks

**API Service:**
- **Endpoint:** `/api/health`
- **Interval:** Every 30 seconds
- **Timeout:** 10 seconds
- **Retries:** 3 attempts
- **Start Period:** 40 seconds

**ChromaDB Service:**
- **Endpoint:** `/api/v1/heartbeat`
- **Interval:** Every 30 seconds
- **Timeout:** 10 seconds
- **Retries:** 5 attempts
- **Start Period:** 30 seconds

### Monitoring Health

**Check container health:**
```bash
# View health status
docker compose ps

# View health check logs
docker inspect kura-notes-api | jq '.[0].State.Health'
docker inspect kura-notes-chromadb | jq '.[0].State.Health'
```

**Manual health check:**
```bash
# API health
curl http://localhost:3000/api/health | jq

# ChromaDB health
curl http://localhost:8000/api/v1/heartbeat
```

### Health Status Interpretation

**API `/api/health` response:**
- `"status": "healthy"` - All services operational
- `"status": "degraded"` - Database up, but vector store issues
- `"status": "unhealthy"` - Database down, critical failure

**Service status codes:**
- `"up"` - Service is operational
- `"down"` - Service is not responding
- `"unknown"` - Service status cannot be determined

---

## Troubleshooting

### Services Won't Start

**1. Check Docker daemon:**
```bash
sudo systemctl status docker
sudo systemctl start docker
```

**2. Check logs:**
```bash
docker compose logs api
docker compose logs vectordb
```

**3. Verify environment:**
```bash
# Validate .env file
cat .env | grep -E "API_KEY|OPENAI_API_KEY|VECTOR_STORE_URL"

# Check for required variables
docker compose config
```

### Container Exits Immediately

**Common causes:**

1. **Missing environment variables:**
   - Check `.env` file exists
   - Verify required variables are set
   - Run: `docker compose logs api` to see startup errors

2. **Port conflicts:**
   ```bash
   # Check if ports are in use
   sudo netstat -tulpn | grep :3000
   sudo netstat -tulpn | grep :8000

   # Kill conflicting processes or change ports in .env
   ```

3. **Permission issues:**
   ```bash
   # Ensure data directory is writable
   sudo chown -R 1001:1001 ./data
   ```

### ChromaDB Connection Fails

**Symptoms:**
- API health shows `"vectorStore": {"status": "down"}`
- Errors in API logs: "Failed to connect to ChromaDB"

**Solutions:**

1. **Check ChromaDB is running:**
   ```bash
   docker compose ps vectordb
   docker compose logs vectordb
   ```

2. **Verify network connectivity:**
   ```bash
   # From inside API container
   docker compose exec api ping vectordb
   docker compose exec api curl http://vectordb:8000/api/v1/heartbeat
   ```

3. **Check VECTOR_STORE_URL:**
   ```bash
   # Should be http://vectordb:8000 for Docker
   docker compose exec api printenv VECTOR_STORE_URL
   ```

### API Returns 401 Unauthorized

**Cause:** Missing or incorrect API key

**Solution:**
```bash
# Check API key in .env
grep API_KEY .env

# Test with correct key
curl -H "Authorization: Bearer YOUR_API_KEY" http://localhost:3000/api/health
```

### High Memory Usage

**Symptoms:**
- Containers being killed (OOM)
- Slow performance

**Solutions:**

1. **Increase memory limits:**
   ```yaml
   # In docker-compose.yml
   deploy:
     resources:
       limits:
         memory: 2G  # Increase as needed
   ```

2. **Monitor resource usage:**
   ```bash
   docker stats
   ```

3. **Check for memory leaks:**
   ```bash
   # View detailed container stats
   docker stats --no-stream

   # Restart if needed
   docker compose restart api
   ```

### Data Not Persisting

**Symptoms:**
- Uploaded files disappear after restart
- Search results lost

**Solutions:**

1. **Verify volume mounts:**
   ```bash
   docker compose config | grep volumes -A 5
   ```

2. **Check data directory:**
   ```bash
   ls -la ./data
   docker volume ls | grep chroma
   ```

3. **Recreate volumes if corrupted:**
   ```bash
   docker compose down
   docker volume rm kura-chroma-data
   docker compose up -d
   ```

### Slow Performance

**Optimizations:**

1. **Increase resource limits** (see above)

2. **Enable query caching** (future feature)

3. **Optimize ChromaDB:**
   ```yaml
   # In docker-compose.yml, add environment variables
   vectordb:
     environment:
       - CHROMA_HNSW_M=16
       - CHROMA_HNSW_EF_CONSTRUCTION=100
   ```

4. **Monitor disk I/O:**
   ```bash
   iotop -o
   ```

---

## Maintenance

### Starting and Stopping

```bash
# Start services
docker compose up -d

# Stop services (preserves data)
docker compose down

# Stop and remove volumes (DELETES DATA!)
docker compose down -v

# Restart services
docker compose restart

# Restart individual service
docker compose restart api
```

### Viewing Logs

```bash
# View all logs
docker compose logs

# Follow logs (real-time)
docker compose logs -f

# View logs for specific service
docker compose logs -f api

# View last 100 lines
docker compose logs --tail=100 api

# Save logs to file
docker compose logs > deployment.log
```

### Updating KURA Notes

```bash
# Pull latest code
git pull origin main

# Rebuild images
docker compose build

# Restart with new images (zero downtime with rolling update)
docker compose up -d --no-deps --build api

# Or full restart
docker compose down
docker compose up -d
```

### Log Rotation

Logs are automatically rotated:
- **Docker logs:** Max 10MB per file, 3 files retained
- **Application logs:** Daily rotation, 7-day retention (general), 30-day (errors)

**Manual log cleanup:**
```bash
# Clear Docker logs
docker compose down
sudo sh -c 'truncate -s 0 /var/lib/docker/containers/*/*-json.log'

# Clear application logs
rm -rf ./data/logs/*
docker compose restart api
```

### Database Maintenance

**Compact SQLite database:**
```bash
docker compose exec api sh -c 'sqlite3 /data/metadata/knowledge.db "VACUUM;"'
```

**Check database integrity:**
```bash
docker compose exec api sh -c 'sqlite3 /data/metadata/knowledge.db "PRAGMA integrity_check;"'
```

---

## Security Considerations

### Production Security Checklist

- [ ] **Strong API Key:** Use 32+ character random key
- [ ] **HTTPS/TLS:** Configure reverse proxy with SSL certificates
- [ ] **CORS Restriction:** Set `CORS_ORIGIN` to your domain only
- [ ] **Firewall:** Block direct access to ports 3000/8000, expose via reverse proxy
- [ ] **Regular Updates:** Keep Docker images and dependencies updated
- [ ] **Secure `.env`:** Ensure `.env` file permissions are `600` (not world-readable)
- [ ] **Backup Encryption:** Encrypt backups containing sensitive data
- [ ] **Network Isolation:** Use Docker networks to isolate services
- [ ] **Log Monitoring:** Monitor logs for unauthorized access attempts

### Securing with Reverse Proxy

**Example Nginx configuration:**
```nginx
server {
    listen 443 ssl http2;
    server_name notes.example.com;

    ssl_certificate /etc/ssl/certs/notes.example.com.pem;
    ssl_certificate_key /etc/ssl/private/notes.example.com.key;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### File Permissions

```bash
# Recommended permissions
chmod 600 .env                    # Only owner can read/write
chmod 700 ./data                  # Only owner can access
chmod 644 docker-compose.yml      # World-readable, owner-writable
```

---

## Backup and Restore

### What to Backup

1. **SQLite Database:** `./data/metadata/knowledge.db`
2. **File Storage:** `./data/content/`
3. **ChromaDB Data:** `chroma-data` volume
4. **Configuration:** `.env` file (store securely!)

### Backup Script

**Create `scripts/backup.sh`:**
```bash
#!/bin/bash
# KURA Notes Backup Script

BACKUP_DIR="/path/to/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="kura-notes-backup-${TIMESTAMP}"

# Create backup directory
mkdir -p "${BACKUP_DIR}/${BACKUP_NAME}"

# Backup SQLite database
cp ./data/metadata/knowledge.db "${BACKUP_DIR}/${BACKUP_NAME}/"

# Backup file storage
cp -r ./data/content "${BACKUP_DIR}/${BACKUP_NAME}/"

# Backup ChromaDB data (requires stopping container)
docker compose stop vectordb
docker run --rm -v kura-chroma-data:/data -v "${BACKUP_DIR}/${BACKUP_NAME}":/backup alpine tar czf /backup/chroma-data.tar.gz -C /data .
docker compose start vectordb

# Backup configuration (encrypt recommended!)
cp .env "${BACKUP_DIR}/${BACKUP_NAME}/env.backup"

# Create archive
cd "${BACKUP_DIR}"
tar czf "${BACKUP_NAME}.tar.gz" "${BACKUP_NAME}"
rm -rf "${BACKUP_NAME}"

echo "Backup created: ${BACKUP_DIR}/${BACKUP_NAME}.tar.gz"
```

**Make executable:**
```bash
chmod +x scripts/backup.sh
```

### Restore Process

```bash
# Extract backup
cd /path/to/backups
tar xzf kura-notes-backup-YYYYMMDD_HHMMSS.tar.gz

# Stop services
docker compose down

# Restore SQLite database
cp kura-notes-backup-*/knowledge.db ./data/metadata/

# Restore file storage
cp -r kura-notes-backup-*/content ./data/

# Restore ChromaDB data
docker run --rm -v kura-chroma-data:/data -v "$(pwd)/kura-notes-backup-*":/backup alpine tar xzf /backup/chroma-data.tar.gz -C /data

# Restore configuration
cp kura-notes-backup-*/env.backup .env

# Start services
docker compose up -d

# Verify restoration
docker compose logs -f
curl http://localhost:3000/api/health
```

### Automated Backups

**Using cron:**
```bash
# Edit crontab
crontab -e

# Add daily backup at 2 AM
0 2 * * * /path/to/kura-notes/scripts/backup.sh >> /var/log/kura-backup.log 2>&1
```

**Backup retention:**
```bash
# Keep last 7 days
find /path/to/backups -name "kura-notes-backup-*.tar.gz" -mtime +7 -delete
```

---

## Advanced Topics

### Running Behind Traefik

**docker-compose.yml additions:**
```yaml
services:
  api:
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.kura.rule=Host(`notes.example.com`)"
      - "traefik.http.routers.kura.entrypoints=websecure"
      - "traefik.http.routers.kura.tls.certresolver=letsencrypt"
      - "traefik.http.services.kura.loadbalancer.server.port=3000"
    networks:
      - traefik-public
      - kura-network

networks:
  traefik-public:
    external: true
```

### Scaling for Higher Load

**Horizontal scaling (multiple API instances):**
```yaml
services:
  api:
    deploy:
      replicas: 3
    # ... rest of config
```

**Load balancing with Nginx:**
```nginx
upstream kura_api {
    server localhost:3000;
    server localhost:3001;
    server localhost:3002;
}
```

### Monitoring with Prometheus

**Add metrics endpoint** (future enhancement):
```yaml
services:
  prometheus:
    image: prom/prometheus
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
    ports:
      - "9090:9090"
```

---

## Getting Help

### Resources

- **Documentation:** [docs/](../docs/)
- **GitHub Issues:** https://github.com/TillMatthis/kura-notes/issues
- **Health Check:** http://your-server:3000/api/health

### Support Checklist

When reporting issues, include:

1. Docker version: `docker --version`
2. Docker Compose version: `docker compose version`
3. Service status: `docker compose ps`
4. Logs: `docker compose logs --tail=100`
5. Health check output: `curl http://localhost:3000/api/health | jq`
6. Environment (redact sensitive values): `docker compose config`

---

**Deployment Guide Version:** 1.0
**Last Updated:** 2025-11-18
**Next Review:** After production testing
