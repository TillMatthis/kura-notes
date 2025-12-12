# ============================================
# Stage 1: Build Stage
# ============================================
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install build dependencies for native modules (better-sqlite3, sharp)
RUN apk add --no-cache python3 make g++ sqlite-dev

# Install dependencies (including dev dependencies for build)
RUN npm install

# Copy source code
COPY src ./src

# Build TypeScript
RUN npm run build

# ============================================
# Stage 2: Runtime Stage
# ============================================
FROM node:20-alpine AS runtime

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Set working directory
WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S kura && \
    adduser -S kura -u 1001

# Copy package files
COPY package*.json ./

# Install build dependencies, production packages, then cleanup to minimize image size
RUN apk add --no-cache --virtual .build-deps python3 make g++ sqlite-dev && \
    npm install --omit=dev && \
    npm cache clean --force && \
    apk del .build-deps && \
    apk add --no-cache sqlite-libs

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist
COPY src/services/database/schema.sql ./dist/services/database/

# Copy public folder (web UI assets)
COPY public ./public

# Create data directory and set permissions
RUN mkdir -p /data/content /data/metadata /data/vectors /data/logs && \
    chown -R kura:kura /data /app

# Switch to non-root user
USER kura

# Expose API port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "dist/index.js"]
