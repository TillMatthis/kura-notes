# KURA Notes - Setup Guide

Complete guide for setting up KURA Notes in production and development environments.

## Table of Contents

- [Quick Start](#quick-start)
- [Prerequisites](#prerequisites)
- [Environment Configuration](#environment-configuration)
- [Security Best Practices](#security-best-practices)
- [Production Deployment](#production-deployment)
- [Troubleshooting](#troubleshooting)

---

## Quick Start

### Automated Setup (Recommended)

The fastest way to get started:

```bash
# Clone the repository
git clone <repository-url>
cd kura-notes

# Install dependencies
npm install

# Run automated setup (generates keys, creates directories, initializes database)
npm run setup

# Or use the setup script directly
chmod +x scripts/setup.sh
./scripts/setup.sh
```

The setup script will:
1. Create `.env` from `.env.example`
2. Generate secure random API keys
3. Create necessary directories
4. Initialize the database
5. Validate configuration

### Manual Setup

If you prefer manual setup:

```bash
# 1. Copy .env.example to .env
cp .env.example .env

# 2. Edit .env and fill in your values
nano .env

# 3. Generate a secure API key
openssl rand -hex 32

# 4. Start the application (Docker)
docker-compose up -d

# Or start without Docker
npm run dev
```

---

## Prerequisites

### Required

- **Node.js**: v18 or higher
- **npm**: v9 or higher
- **ChromaDB**: Running instance (Docker or standalone)
- **OpenAI API Key**: For vector embeddings (get from https://platform.openai.com/api-keys)

### Optional

- **Docker**: For containerized deployment (recommended)
- **Docker Compose**: For multi-service orchestration
- **Reverse Proxy**: Nginx, Caddy, or Traefik for HTTPS in production

### System Requirements

- **RAM**: 2GB minimum, 4GB recommended
- **Storage**: 10GB minimum (grows with content)
- **OS**: Linux, macOS, or Windows (WSL2)

---

## Environment Configuration

### Required Variables

These variables **must** be configured:

#### `VECTOR_STORE_URL`
ChromaDB HTTP API endpoint.

```bash
# Local development
VECTOR_STORE_URL=http://localhost:8000

# Docker Compose
VECTOR_STORE_URL=http://vectordb:8000

# Production
VECTOR_STORE_URL=https://chromadb.yourdomain.com
```

**Format**: Must be a valid HTTP/HTTPS URL
**Validation**: Checked on startup

---

### Required in Production

These variables have defaults for development but **must** be set in production:

#### `API_KEY`
API key for securing endpoints.

```bash
# Generate with OpenSSL
openssl rand -hex 32

# Generate with Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Example output (DO NOT USE THIS):
API_KEY=a7f8e9c2b1d4567890abcdef12345678901234567890abcdef1234567890abcd
```

**Security Requirements**:
- Must be at least 32 characters long
- Must be changed from default in production
- Should be random and unpredictable
- Store securely (never commit to version control)

**Default**: `dev-api-key-change-in-production` (development only)

#### `OPENAI_API_KEY`
OpenAI API key for generating embeddings.

```bash
# Get your key from: https://platform.openai.com/api-keys
OPENAI_API_KEY=sk-proj-...
```

**Format**: Starts with `sk-` or `sk-proj-`
**Cost**: ~$0.00002 per 1K tokens (~$0.10 per 1M tokens)
**Note**: Application works without this, but search will be limited to full-text search only

**How to get an OpenAI API key**:
1. Go to https://platform.openai.com/signup
2. Create an account or sign in
3. Navigate to API keys section
4. Click "Create new secret key"
5. Copy the key (you won't be able to see it again!)
6. Add to your `.env` file

**Cost Management**:
- Set usage limits in your OpenAI account dashboard
- Monitor usage at https://platform.openai.com/usage
- Typical usage: 1,000 notes ≈ $0.50-$1.00 in embedding costs

---

### Optional Variables

#### Application Settings

##### `NODE_ENV`
Environment mode: `development`, `production`, or `test`

```bash
# Development (default)
NODE_ENV=development

# Production (enables stricter validation)
NODE_ENV=production
```

**Default**: `development`
**Production Effects**:
- Stricter configuration validation
- API key must be strong (32+ characters)
- Security warnings for insecure settings
- Production-optimized logging

##### `API_PORT`
Port for the API server.

```bash
API_PORT=3000
```

**Default**: `3000`
**Validation**: Must be 1-65535
**Note**: Change if port 3000 is already in use

---

#### Database Settings

##### `DATABASE_URL`
SQLite database file path (relative or absolute).

```bash
# Relative path (default)
DATABASE_URL=./data/metadata/knowledge.db

# Absolute path
DATABASE_URL=/var/lib/kura-notes/knowledge.db
```

**Default**: `./data/metadata/knowledge.db`
**Note**: Directory will be created automatically if it doesn't exist

---

#### Vector Store Settings

##### `VECTOR_DB_KEY`
ChromaDB authentication key (if ChromaDB has authentication enabled).

```bash
# Leave empty if ChromaDB doesn't have auth
VECTOR_DB_KEY=

# Set if using authenticated ChromaDB
VECTOR_DB_KEY=your-secure-token-here
```

**Default**: Empty (no authentication)
**Generate**: `openssl rand -hex 32`

---

#### OpenAI Settings

##### `OPENAI_EMBEDDING_MODEL`
Embedding model to use.

```bash
# Recommended (best cost/performance)
OPENAI_EMBEDDING_MODEL=text-embedding-3-small

# Higher quality (more expensive)
OPENAI_EMBEDDING_MODEL=text-embedding-3-large

# Legacy model
OPENAI_EMBEDDING_MODEL=text-embedding-ada-002
```

**Default**: `text-embedding-3-small`
**Options**:
- `text-embedding-3-small`: 1536 dimensions, $0.00002/1K tokens (recommended)
- `text-embedding-3-large`: 3072 dimensions, $0.00013/1K tokens
- `text-embedding-ada-002`: 1536 dimensions, $0.0001/1K tokens (legacy)

---

#### Storage Settings

##### `STORAGE_BASE_PATH`
Base directory for storing uploaded files.

```bash
# Relative path (default)
STORAGE_BASE_PATH=./data/content

# Absolute path
STORAGE_BASE_PATH=/var/lib/kura-notes/content
```

**Default**: `./data/content`
**Structure**: Files are organized as `YYYY/MM/DD/UUID.ext`
**Note**: Directory will be created automatically

##### `MAX_FILE_SIZE`
Maximum file size in bytes.

```bash
# 10MB
MAX_FILE_SIZE=10485760

# 50MB (default)
MAX_FILE_SIZE=52428800

# 100MB
MAX_FILE_SIZE=104857600
```

**Default**: `52428800` (50MB)
**Validation**: Must be a positive integer

---

#### Logging Settings

##### `LOG_LEVEL`
Log level: `error`, `warn`, `info`, `debug`

```bash
# Production recommendation
LOG_LEVEL=info

# Development recommendation
LOG_LEVEL=debug
```

**Default**: `info`
**Options**: `error`, `warn`, `info`, `debug`

##### `LOG_DIR`
Log directory.

```bash
LOG_DIR=./data/logs
```

**Default**: `./data/logs`
**Note**: Logs rotate daily
- General logs: 7-day retention
- Error logs: 30-day retention

---

#### CORS Settings

##### `CORS_ORIGIN`
Allowed origins (comma-separated for multiple).

```bash
# Development (allow all)
CORS_ORIGIN=*

# Production (single domain)
CORS_ORIGIN=https://your-domain.com

# Multiple domains
CORS_ORIGIN=https://app.example.com,https://admin.example.com

# Local + production
CORS_ORIGIN=http://localhost:3000,https://your-domain.com
```

**Default**: `*` (allow all)
**Security**: Restrict to specific domain(s) in production!

---

#### TLS/SSL Settings (Production)

##### `TLS_CERT_PATH` and `TLS_KEY_PATH`
Paths to TLS/SSL certificate and private key files.

```bash
# Certificate file
TLS_CERT_PATH=/etc/ssl/certs/your-domain.pem

# Private key file
TLS_KEY_PATH=/etc/ssl/private/your-domain-key.pem
```

**Requirements**:
- Both must be set or both must be empty
- Files must exist and be readable
- Private key should have restricted permissions (`chmod 600`)

**Note**: For production HTTPS, consider using a reverse proxy (Nginx, Caddy) instead of handling TLS in the application.

---

## Security Best Practices

### API Key Management

1. **Generate Strong Keys**
   ```bash
   # Always use cryptographically secure random generation
   openssl rand -hex 32
   ```

2. **Never Commit Secrets**
   - Keep `.env` in `.gitignore`
   - Never commit API keys to version control
   - Use environment-specific .env files

3. **Rotate Keys Regularly**
   - Change API keys every 90 days
   - Immediately rotate if compromised
   - Keep a backup during rotation

4. **Restrict Access**
   - Use different API keys for different environments
   - Consider IP whitelisting for production
   - Monitor API usage for anomalies

### OpenAI API Security

1. **Protect Your Key**
   - Never expose in client-side code
   - Never commit to version control
   - Store in environment variables only

2. **Set Usage Limits**
   - Configure monthly spending limits in OpenAI dashboard
   - Set up billing alerts
   - Monitor usage regularly

3. **Minimize Scope**
   - Only grant necessary permissions
   - Use project-specific API keys if available

### Network Security

1. **CORS Configuration**
   ```bash
   # ✅ Good (production)
   CORS_ORIGIN=https://your-domain.com

   # ❌ Bad (production)
   CORS_ORIGIN=*
   ```

2. **HTTPS**
   - Always use HTTPS in production
   - Use valid SSL/TLS certificates
   - Consider using Let's Encrypt for free certificates

3. **Firewall**
   - Only expose necessary ports
   - Use reverse proxy for external access
   - Consider VPN for internal services

### File Security

1. **File Permissions**
   ```bash
   # Database and logs
   chmod 600 data/metadata/knowledge.db
   chmod 700 data/logs

   # TLS private key
   chmod 600 /etc/ssl/private/your-domain-key.pem
   ```

2. **Validate Uploads**
   - Enforce file size limits
   - Validate file types
   - Scan for malware (optional)

3. **Backup Encryption**
   - Encrypt backups at rest
   - Use secure transfer protocols
   - Test restore procedures regularly

---

## Production Deployment

### Pre-Deployment Checklist

Use this checklist before deploying to production:

- [ ] `NODE_ENV=production`
- [ ] `API_KEY` is a strong random key (32+ characters)
- [ ] `OPENAI_API_KEY` is set (from https://platform.openai.com/api-keys)
- [ ] `VECTOR_STORE_URL` points to your ChromaDB server
- [ ] `CORS_ORIGIN` is restricted to your domain(s)
- [ ] `LOG_LEVEL` is set to `info` or `warn`
- [ ] All file paths are absolute or properly resolved
- [ ] TLS/SSL certificates configured if using HTTPS
- [ ] Database and storage directories have proper permissions
- [ ] Regular backups configured
- [ ] Monitoring and alerting set up
- [ ] Tested all critical features

### Deployment Steps

#### 1. Install Dependencies

```bash
npm ci --production
```

#### 2. Build Application

```bash
npm run build
```

#### 3. Set Environment Variables

```bash
# Copy and edit .env
cp .env.example .env
nano .env

# Or use setup script
./scripts/setup.sh
```

#### 4. Validate Configuration

```bash
# Run validation
npm run validate-config

# Check for issues
npm run doctor
```

#### 5. Start Application

```bash
# With Docker (recommended)
docker-compose -f docker-compose.yml up -d

# Without Docker
npm start
```

#### 6. Verify Deployment

```bash
# Health check
curl http://localhost:3000/api/health

# Expected response:
# {"status":"healthy","timestamp":"...","services":{"database":"up","vectorStore":"up"}}
```

### Docker Deployment

See [Docker README](../docker/README.md) for detailed Docker deployment instructions.

**Quick start:**

```bash
# Build and start
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

---

## Troubleshooting

### Configuration Errors

#### "VECTOR_STORE_URL is required"

**Cause**: `VECTOR_STORE_URL` environment variable is not set.

**Solution**:
```bash
# In .env file
VECTOR_STORE_URL=http://localhost:8000

# Or for Docker
VECTOR_STORE_URL=http://vectordb:8000
```

#### "API_KEY must be changed from default value in production"

**Cause**: Using default API key in production.

**Solution**:
```bash
# Generate a new key
openssl rand -hex 32

# Add to .env
API_KEY=<generated-key>
```

#### "OPENAI_API_KEY is not set"

**Cause**: OpenAI API key is missing.

**Impact**: Vector embeddings won't work, search limited to full-text only.

**Solution**:
1. Get key from https://platform.openai.com/api-keys
2. Add to .env: `OPENAI_API_KEY=sk-...`

### Connection Errors

#### Cannot connect to ChromaDB

**Symptoms**: "Failed to connect to ChromaDB"

**Solutions**:
1. **Check ChromaDB is running**:
   ```bash
   # Docker
   docker-compose ps

   # Standalone
   curl http://localhost:8000/api/v1
   ```

2. **Check URL is correct**:
   ```bash
   # Local
   VECTOR_STORE_URL=http://localhost:8000

   # Docker
   VECTOR_STORE_URL=http://vectordb:8000
   ```

3. **Check network**:
   ```bash
   # Test connection
   curl http://localhost:8000/api/v1/heartbeat
   ```

#### OpenAI API errors

**Symptoms**: "OpenAI API request failed"

**Solutions**:
1. **Check API key is valid**:
   - Verify key starts with `sk-`
   - Check key hasn't been revoked
   - Test at https://platform.openai.com/playground

2. **Check quota/billing**:
   - Visit https://platform.openai.com/usage
   - Ensure billing is set up
   - Check spending limits

3. **Check rate limits**:
   - Wait a few minutes and retry
   - Consider upgrading API tier

### Permission Errors

#### Cannot write to database

**Cause**: Insufficient permissions on data directory.

**Solution**:
```bash
# Fix permissions
chmod 755 data/metadata
chmod 600 data/metadata/knowledge.db

# Or recreate directory
rm -rf data/metadata
./scripts/setup.sh
```

#### Cannot create log files

**Cause**: Insufficient permissions on log directory.

**Solution**:
```bash
# Fix permissions
chmod 755 data/logs

# Or recreate directory
mkdir -p data/logs
chmod 755 data/logs
```

### Performance Issues

#### Slow search responses

**Causes**:
- Large number of documents (>10,000)
- ChromaDB not optimized
- Network latency to OpenAI

**Solutions**:
1. Enable query result caching
2. Tune ChromaDB HNSW parameters
3. Use local embedding model (future enhancement)

See [Performance Guide](./PERFORMANCE.md) for detailed optimization strategies.

---

## Getting Help

### Resources

- **Documentation**: See [docs/](../) folder
- **API Reference**: See [docs/api/](../api/) (if available)
- **Troubleshooting**: See above
- **Performance**: See [docs/PERFORMANCE.md](./PERFORMANCE.md)

### Common Issues

Check [GitHub Issues](https://github.com/your-repo/issues) for known issues and solutions.

### Support

For questions and support:
1. Check documentation first
2. Search existing GitHub issues
3. Create a new issue with:
   - Environment details (OS, Node version, Docker version)
   - Configuration (sanitized .env)
   - Error messages and logs
   - Steps to reproduce

---

## Next Steps

After setup is complete:

1. **Test basic functionality**:
   - Create a note via web interface
   - Upload an image or PDF
   - Search for content
   - Test iOS shortcut (if applicable)

2. **Configure backups**:
   - See Task 4.3 in BUILD-CHECKLIST.md
   - Set up automated backups
   - Test restore procedure

3. **Set up monitoring**:
   - Monitor disk usage
   - Monitor API usage (OpenAI costs)
   - Set up error alerting

4. **Customize**:
   - Adjust file size limits
   - Configure CORS for your domain
   - Set up reverse proxy for HTTPS

5. **iOS Shortcut**:
   - See [docs/ios-shortcut-quick-start.md](./ios-shortcut-quick-start.md)
   - Configure with your production URL and API key

---

**Last Updated**: 2025-01-18
**Version**: 1.0.0
