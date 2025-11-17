# KURA Notes

**Personal Knowledge Management System with Semantic Search**

KURA Notes is a lightweight, self-hosted knowledge management system that helps you capture, store, and retrieve information using semantic search powered by vector embeddings.

## Features

- 📝 **Multi-format Content Capture**: Text notes, images, and PDFs
- 🔍 **Semantic Search**: Natural language queries with vector similarity search
- 🏷️ **Tagging System**: Organize content with flexible tags
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
# Generate a secure API key
API_KEY=$(openssl rand -hex 32)

# Add your OpenAI API key
OPENAI_API_KEY=sk-your-actual-api-key-here
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

### Using Docker Compose

Full deployment instructions will be available after Task 1.2 (Docker Configuration) is complete.

### On Proxmox

Full Proxmox deployment guide will be available after Task 4.4 (Proxmox Deployment) is complete.

## API Documentation

API documentation will be generated as endpoints are implemented. See the planning documents in the root directory:

- `technical-architecture.md` - System architecture details
- `BUILD-CHECKLIST.md` - Development roadmap

## Configuration

All configuration is managed through environment variables. See `.env.example` for a complete list of available options.

### Required Variables

- `API_KEY` - API authentication key
- `OPENAI_API_KEY` - OpenAI API key for embeddings
- `DATABASE_URL` - SQLite database path
- `VECTOR_STORE_URL` - ChromaDB endpoint URL

### Optional Variables

- `NODE_ENV` - Environment (development/production)
- `API_PORT` - API server port (default: 3000)
- `LOG_LEVEL` - Logging level (error/warn/info/debug)
- `MAX_FILE_SIZE` - Maximum upload size in bytes (default: 50MB)

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

- ✅ Project structure and dependencies setup

### In Progress

- 🔄 Docker configuration
- 🔄 Database schema setup
- 🔄 File storage service

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
