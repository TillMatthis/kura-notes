# Docker Configuration for KURA Notes

This directory contains Docker-related documentation and configurations for KURA Notes.

## Overview

KURA Notes uses Docker and Docker Compose to provide a consistent deployment environment across development and production.

## Architecture

```
┌─────────────────────────────────────┐
│     Docker Compose Network          │
│                                     │
│  ┌──────────────┐  ┌─────────────┐ │
│  │  API Service │  │  ChromaDB   │ │
│  │  (Fastify)   │──│  (Vector DB)│ │
│  │  Port: 3000  │  │  Port: 8000 │ │
│  └──────────────┘  └─────────────┘ │
│         │                           │
└─────────┼───────────────────────────┘
          │
    ┌─────▼─────┐
    │   Data    │
    │  Volumes  │
    └───────────┘
```

## Files

### Dockerfiles

- **`../Dockerfile`**: Production multi-stage build
  - Stage 1: Build TypeScript
  - Stage 2: Runtime with minimal dependencies
  - Non-root user for security
  - Health checks included

- **`../Dockerfile.dev`**: Development build
  - Includes all dev dependencies
  - Hot reload support
  - Debug port exposed (9229)

### Docker Compose Files

- **`../docker-compose.yml`**: Production deployment
  - API service (Fastify)
  - ChromaDB service
  - Named volumes for data persistence
  - Health checks and restart policies
  - Proper networking

- **`../docker-compose.dev.yml`**: Development environment
  - Source code mounted as volumes
  - Hot reload enabled
  - Debug port exposed
  - Development logging

### Other Files

- **`../.dockerignore`**: Excludes unnecessary files from Docker builds
- **`../scripts/validate-docker.sh`**: Validates Docker configuration

## Services

### API Service (api)

- **Image**: `kura-notes-api:latest` (production) or `kura-notes-api:dev` (development)
- **Port**: 3000 (configurable via API_PORT env var)
- **Health Check**: `/api/health` endpoint
- **Data**: Mounted at `/data` (content, metadata, logs)

### Vector Database (vectordb)

- **Image**: `chromadb/chroma:latest`
- **Port**: 8000 (configurable via VECTOR_DB_PORT env var)
- **Health Check**: `/api/v1/heartbeat` endpoint
- **Data**: Named volume `kura-chroma-data` or `kura-chroma-data-dev`

## Volumes

### Production

- **`./data`**: Bind mount for API data (files, SQLite database, logs)
- **`kura-chroma-data`**: Named volume for ChromaDB persistence

### Development

- **`./src`**: Bind mount for source code (hot reload)
- **`./data`**: Bind mount for API data
- **`kura-chroma-data-dev`**: Named volume for ChromaDB persistence
- **`kura-node-modules-dev`**: Named volume for node_modules (platform compatibility)

## Network

- **Name**: `kura-network` (production) or `kura-network-dev` (development)
- **Driver**: bridge
- **Purpose**: Allows services to communicate using service names as hostnames

## Environment Variables

See `.env.example` for all available environment variables. Key variables:

### Required

- `API_KEY`: API authentication key
- `OPENAI_API_KEY`: OpenAI API key for embeddings
- `CHROMA_SERVER_AUTH_CREDENTIALS`: ChromaDB authentication token

### Optional

- `NODE_ENV`: Environment (development/production)
- `API_PORT`: API server port (default: 3000)
- `VECTOR_DB_PORT`: ChromaDB port (default: 8000)
- `LOG_LEVEL`: Logging level (default: info)

## Usage

### First-Time Setup

```bash
# 1. Validate Docker configuration
./scripts/validate-docker.sh

# 2. Copy environment file
cp .env.example .env

# 3. Edit .env with your values
nano .env  # or your preferred editor

# 4. Build images
docker-compose build
```

### Production Deployment

```bash
# Start services
docker-compose up -d

# View logs
docker-compose logs -f

# Check status
docker-compose ps

# Stop services
docker-compose down
```

### Development Workflow

```bash
# Start development environment
docker-compose -f docker-compose.dev.yml up

# Run in background
docker-compose -f docker-compose.dev.yml up -d

# View API logs
docker-compose -f docker-compose.dev.yml logs -f api

# Restart API after config changes
docker-compose -f docker-compose.dev.yml restart api

# Stop development environment
docker-compose -f docker-compose.dev.yml down
```

### Debugging

```bash
# Access API container shell
docker-compose exec api sh

# View ChromaDB logs
docker-compose logs vectordb

# Check network connectivity
docker-compose exec api ping vectordb

# Inspect volumes
docker volume ls
docker volume inspect kura-chroma-data
```

## Testing

### Build Test

```bash
# Test production build
docker-compose build

# Test development build
docker-compose -f docker-compose.dev.yml build
```

### Integration Test

```bash
# Start services
docker-compose up -d

# Wait for services to be healthy
sleep 10

# Test API health endpoint
curl http://localhost:3000/api/health

# Test ChromaDB health endpoint
curl http://localhost:8000/api/v1/heartbeat

# Clean up
docker-compose down
```

## Security Considerations

### Production Hardening

1. **Non-root user**: Both services run as non-root users
2. **API authentication**: API key required for all endpoints
3. **ChromaDB authentication**: Token-based authentication enabled
4. **Network isolation**: Services communicate via private Docker network
5. **Resource limits**: Consider adding CPU/memory limits in production
6. **TLS/SSL**: Use reverse proxy (Nginx/Caddy) for HTTPS in production

### Secrets Management

- Never commit `.env` to version control
- Use strong random keys (generate with `openssl rand -hex 32`)
- Rotate keys regularly
- Consider using Docker secrets or vault for production

## Troubleshooting

### Common Issues

**Port conflicts:**
```bash
# Check if ports are in use
lsof -i :3000
lsof -i :8000

# Change ports in .env
API_PORT=3001
VECTOR_DB_PORT=8001
```

**Permission errors:**
```bash
# Ensure data directory is writable
chmod -R 755 data/
```

**Services fail to start:**
```bash
# Check logs
docker-compose logs

# Rebuild from scratch
docker-compose down -v
docker-compose build --no-cache
docker-compose up
```

**ChromaDB connection issues:**
```bash
# Verify ChromaDB is running
docker-compose ps vectordb

# Check ChromaDB health
docker-compose exec vectordb curl http://localhost:8000/api/v1/heartbeat

# Check network
docker network inspect kura-network
```

## Performance Optimization

### Production Recommendations

1. **Use named volumes** for better performance
2. **Enable logging limits** to prevent disk space issues
3. **Set restart policies** to `unless-stopped`
4. **Configure health checks** for automatic recovery
5. **Use multi-stage builds** to minimize image size

### Development Recommendations

1. **Use bind mounts** for source code (hot reload)
2. **Use named volumes** for node_modules (platform compatibility)
3. **Increase logging verbosity** for debugging
4. **Expose debug ports** for IDE integration

## Backup and Recovery

### Backup Data

```bash
# Backup API data
tar -czf backup-api-$(date +%Y%m%d).tar.gz data/

# Backup ChromaDB volume
docker run --rm \
  -v kura-chroma-data:/data \
  -v $(pwd):/backup \
  alpine tar -czf /backup/backup-chroma-$(date +%Y%m%d).tar.gz /data
```

### Restore Data

```bash
# Restore API data
tar -xzf backup-api-20250117.tar.gz

# Restore ChromaDB volume
docker run --rm \
  -v kura-chroma-data:/data \
  -v $(pwd):/backup \
  alpine tar -xzf /backup/backup-chroma-20250117.tar.gz -C /
```

## Monitoring

### Health Checks

Both services have built-in health checks:

- **API**: `GET /api/health` (30s interval)
- **ChromaDB**: `GET /api/v1/heartbeat` (30s interval)

### Logging

Logs are configured with rotation:

- **Max size**: 10MB (production), 5MB (development)
- **Max files**: 3 (production), 2 (development)
- **Format**: JSON

### Resource Usage

```bash
# Monitor resource usage
docker stats

# Check disk usage
docker system df

# Clean up unused resources
docker system prune
```

## Deployment Checklist

- [ ] Copy `.env.example` to `.env`
- [ ] Set all required environment variables
- [ ] Generate secure random keys
- [ ] Test build: `docker-compose build`
- [ ] Test startup: `docker-compose up`
- [ ] Verify health endpoints
- [ ] Configure backup strategy
- [ ] Set up monitoring (optional)
- [ ] Configure reverse proxy for HTTPS (production)
- [ ] Document deployment-specific notes

## Further Reading

- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [ChromaDB Documentation](https://docs.trychroma.com/)
- [Node.js Docker Best Practices](https://github.com/nodejs/docker-node/blob/main/docs/BestPractices.md)

---

**Last Updated**: 2025-11-17
**Maintained By**: KURA Notes Team
