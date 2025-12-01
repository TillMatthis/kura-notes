# KURA Notes

**Personal Knowledge Management System with Semantic Search**

KURA Notes is a lightweight, self-hosted knowledge management system that helps you capture, store, and retrieve information using semantic search powered by vector embeddings.

## Features

- 📝 **Multi-format Content Capture**: Text notes, images, and PDFs
- 🔍 **Semantic Search**: Natural language queries with vector similarity search
- 🏷️ **Tagging System**: Organize content with flexible tags
- 👥 **Multi-User Support**: User isolation with KOauth authentication
- 📱 **iOS Integration**: Quick capture via iOS Shortcuts
- 🌐 **Web Interface**: Simple, functional web UI for browsing and searching
- 🔒 **Self-Hosted**: Your data stays on your infrastructure
- 🐳 **Docker Ready**: Easy deployment with Docker Compose

## Tech Stack

- **Runtime**: Node.js 20+ with TypeScript
- **API Framework**: Fastify
- **Database**: SQLite (metadata)
- **Vector Store**: ChromaDB
- **Embeddings**: OpenAI text-embedding-3-small
- **Deployment**: Docker + Docker Compose

## Project Structure

```
kura-notes/
├── src/
│   ├── api/           # API routes and handlers
│   │   └── routes/    # Route definitions
│   ├── services/      # Business logic
│   ├── models/        # TypeScript types/interfaces
│   ├── utils/         # Helper functions
│   ├── config/        # Configuration management
│   └── index.ts       # Application entry point
├── tests/             # Test files
├── docker/            # Docker configuration
├── scripts/           # Utility scripts
├── data/              # Runtime data (gitignored)
│   ├── content/       # Uploaded files
│   ├── metadata/      # SQLite database
│   └── logs/          # Application logs
└── docs/              # Documentation

```

## Prerequisites

- **Node.js** 20.x or higher
- **npm** 10.x or higher
- **Docker** & **Docker Compose** (for ChromaDB)
- **OpenAI API Key** (for embeddings)

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/TillMatthis/kura-notes.git
cd kura-notes
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment

Copy the example environment file and configure it:

```bash
cp .env.example .env
```

Edit `.env` and set the required values:

```bash
# KOauth Authentication Service URL (required for multi-user support)
KOAUTH_URL=https://auth.tillmaessen.de

# Add your OpenAI API key
OPENAI_API_KEY=sk-your-actual-api-key-here

# Note: For development without KOauth, the stub will provide a default dev user
```

### 4. Start ChromaDB (Vector Store)

```bash
docker run -d \
  --name chromadb \
  -p 8000:8000 \
  -v $(pwd)/data/vectors:/chroma/data \
  chromadb/chroma:latest
```

### 5. Run the Application

**Development Mode (with hot reload):**

```bash
npm run dev
```

**Production Mode:**

```bash
npm run build
npm start
```

The API will be available at `http://localhost:3000`

### 6. Verify Installation

Check the health endpoint:

```bash
curl http://localhost:3000/api/health
```

Expected response:

```json
{
  "status": "healthy",
  "timestamp": "2025-01-15T10:30:00Z",
  "services": {
    "api": "up",
    "database": "up",
    "vectorStore": "up"
  }
}
```

## Beta Testing & Access Control

KURA Notes supports **multi-user environments** with full data isolation between users. During development and testing, you can control who can sign up using an **email whitelist**.

### Multi-User Support Status

✅ **ENABLED** - Multi-user support is fully implemented:
- Each user has isolated data storage
- Authentication via KOauth (OAuth 2.0)
- User ownership verified on all operations
- Search results filtered by user
- Safe for beta testing with friends

### Controlling Access During Testing

By default, anyone with a valid KOauth account can sign up. To **restrict access** during beta testing:

#### 1. Set Email Whitelist

Add the `ALLOWED_EMAILS` environment variable to your `.env`:

```bash
# Allow specific users to sign up (comma-separated)
ALLOWED_EMAILS=you@example.com,friend@example.com,tester@example.com
```

**Features:**
- Emails are case-insensitive (`User@Example.com` = `user@example.com`)
- Comma-separated list for multiple users
- Leave empty or unset to allow all users (open signup)

#### 2. What Happens When Blocked

Users not on the whitelist will see an error after attempting to sign up via KOauth:

```
Access denied
Your email is not authorized to access this application.
Please contact the administrator if you believe this is an error.
```

Their OAuth authentication will succeed with KOauth, but they won't be able to access your KURA Notes instance.

### Inviting Beta Testers

**To invite someone for beta testing:**

1. Add their email to `ALLOWED_EMAILS` in your `.env`
2. Restart the application (if running)
3. Share your KURA Notes URL with them
4. They sign up via KOauth (Google/GitHub)
5. Their data is fully isolated from yours

**Each user will:**
- ✅ Only see their own notes and files
- ✅ Only search their own content
- ✅ Cannot access other users' data
- ✅ Have their own storage space

### Removing the Whitelist (Going Public)

When you're ready to allow public signups, simply:

```bash
# Remove or leave empty
ALLOWED_EMAILS=
```

Or remove the line entirely from your `.env`.

### Security Notes

- **Authentication:** All endpoints require KOauth authentication
- **Authorization:** Ownership verified on every content access/modification
- **Isolation:** Database queries filtered by `user_id` automatically
- **Search:** Vector and FTS searches scoped to authenticated user
- **Files:** File access verified against content ownership

See `docs/OAUTH_IMPLEMENTATION.md` for authentication details.

## Development

### Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build TypeScript to JavaScript
- `npm start` - Start production server
- `npm test` - Run tests
- `npm run lint` - Lint code
- `npm run format` - Format code with Prettier

### Project Structure Guidelines

- **src/api/routes/**: Define HTTP endpoints
- **src/services/**: Implement business logic (file storage, database operations, vector search)
- **src/models/**: TypeScript interfaces and types
- **src/utils/**: Helper functions and utilities
- **src/config/**: Configuration management and environment variables

## Deployment

### Using Docker Compose (Recommended)

The easiest way to deploy KURA Notes is using Docker Compose, which automatically sets up both the API and ChromaDB services.

#### Production Deployment

1. **Clone and configure:**

```bash
git clone https://github.com/TillMatthis/kura-notes.git
cd kura-notes
cp .env.example .env
```

2. **Edit `.env` with your configuration:**

```bash
# Required: KOauth authentication service URL
KOAUTH_URL=https://auth.tillmaessen.de

# Required: Add your OpenAI API key
OPENAI_API_KEY=sk-your-actual-api-key-here

# Required: Set ChromaDB authentication
CHROMA_SERVER_AUTH_CREDENTIALS=$(openssl rand -hex 32)
```

3. **Build and start services:**

```bash
docker-compose build
docker-compose up -d
```

4. **Verify deployment:**

```bash
# Check if services are running
docker-compose ps

# Check health endpoint
curl http://localhost:3000/api/health
```

5. **View logs:**

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f api
docker-compose logs -f vectordb
```

#### Development Setup

For local development with hot reload:

1. **Start development environment:**

```bash
# Copy environment file
cp .env.example .env

# Edit .env with required values (KOAUTH_URL and OPENAI_API_KEY)

# Start development containers
docker-compose -f docker-compose.dev.yml up
```

2. **The development setup includes:**
   - Hot reload for code changes
   - Debug port exposed on 9229
   - Source code mounted as volumes
   - Development logging (debug level)

#### Docker Commands Reference

```bash
# Build images
docker-compose build

# Start services (production)
docker-compose up -d

# Start services (development)
docker-compose -f docker-compose.dev.yml up

# Stop services
docker-compose down

# Stop and remove volumes (⚠️ deletes all data)
docker-compose down -v

# View logs
docker-compose logs -f

# Restart a service
docker-compose restart api

# Execute commands in container
docker-compose exec api sh

# Check service health
docker-compose ps
```

#### Data Persistence

Data is persisted in the following locations:

- **Production:**
  - API data: `./data` directory (bind mount)
  - ChromaDB data: `kura-chroma-data` Docker volume

- **Development:**
  - API data: `./data` directory (bind mount)
  - ChromaDB data: `kura-chroma-data-dev` Docker volume

#### Backup

To backup your data:

```bash
# Backup API data (files and SQLite database)
tar -czf kura-backup-$(date +%Y%m%d).tar.gz data/

# Backup ChromaDB volume
docker run --rm -v kura-chroma-data:/data -v $(pwd):/backup \
  alpine tar -czf /backup/chroma-backup-$(date +%Y%m%d).tar.gz /data
```

#### Troubleshooting

**Services won't start:**
```bash
# Check logs
docker-compose logs

# Check if ports are already in use
lsof -i :3000
lsof -i :8000
```

**ChromaDB connection issues:**
```bash
# Verify ChromaDB is healthy
docker-compose exec vectordb curl http://localhost:8000/api/v1/heartbeat

# Check network connectivity
docker-compose exec api ping vectordb
```

**Reset everything:**
```bash
# Stop services and remove volumes (⚠️ deletes all data)
docker-compose down -v

# Remove images
docker-compose down --rmi all

# Start fresh
docker-compose up -d
```

### On Proxmox

Full Proxmox deployment guide will be available after Task 4.4 (Proxmox Deployment) is complete.

## API Documentation

API documentation will be generated as endpoints are implemented. See the planning documents in the root directory:

- `technical-architecture.md` - System architecture details
- `BUILD-CHECKLIST.md` - Development roadmap

## Configuration

All configuration is managed through environment variables. See `.env.example` for a complete list of available options.

### Required Variables

- `KOAUTH_URL` - KOauth authentication service URL (e.g., `https://auth.tillmaessen.de`)
- `OPENAI_API_KEY` - OpenAI API key for embeddings
- `DATABASE_URL` - SQLite database path
- `VECTOR_STORE_URL` - ChromaDB endpoint URL

### Optional Variables

- `NODE_ENV` - Environment (development/production)
- `API_PORT` - API server port (default: 3000)
- `LOG_LEVEL` - Logging level (error/warn/info/debug)
- `MAX_FILE_SIZE` - Maximum upload size in bytes (default: 50MB)
- `KOAUTH_TIMEOUT` - KOauth request timeout in milliseconds (default: 5000)

### Authentication

KURA Notes uses **KOauth** for multi-user authentication:

- **Web Access**: Users log in via browser (OAuth providers: Google, GitHub)
- **API Access**: JWT tokens in HTTP-only cookies
- **iOS Shortcuts**: API keys generated via KOauth dashboard
- **Development**: KOauth stub provides default dev user

**User Isolation:**
- All content is scoped to user_id
- Database queries filter by user
- Vector search includes user metadata filters
- Ownership verified on all mutations

For detailed authentication architecture, see `technical-architecture.md`.

## Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm test -- --coverage
```

## Contributing

This is a personal project, but suggestions and feedback are welcome! Please open an issue to discuss proposed changes.

## License

MIT License - See LICENSE file for details

## Roadmap

This project is under active development. See `BUILD-CHECKLIST.md` for the complete development roadmap.

**Current Status**: MVP Phase 1 - Foundation (In Progress)

### Completed

- ✅ Project structure and dependencies setup (Task 1.1)
- ✅ Docker configuration (Task 1.2)

### In Progress

- 🔄 Database schema setup
- 🔄 File storage service
- 🔄 API foundation

### Upcoming

- Vector search implementation
- Web interface
- iOS Shortcut integration

## Support

For issues, questions, or feedback:

- **GitHub Issues**: [github.com/TillMatthis/kura-notes/issues](https://github.com/TillMatthis/kura-notes/issues)
- **Documentation**: See `docs/` directory for detailed planning documents

## Acknowledgments

Built with:
- [Fastify](https://www.fastify.io/) - Fast web framework
- [ChromaDB](https://www.trychroma.com/) - Vector database
- [OpenAI](https://openai.com/) - Embedding generation
- [TypeScript](https://www.typescriptlang.org/) - Type safety

---

**Status**: Active Development | **Version**: 0.1.0 (MVP) | **Last Updated**: 2025-01-15
