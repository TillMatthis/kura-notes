#!/bin/sh
#
# Rebuild Database Script
# Deletes the existing database and creates a fresh one with the latest schema
#

set -e  # Exit on error

DB_PATH="${DATABASE_URL:-/data/metadata/knowledge.db}"
BACKUP_PATH="${DB_PATH}.backup-$(date +%Y%m%d-%H%M%S)"

echo "🔄 Rebuilding Kura Notes Database"
echo "=================================="
echo ""
echo "Database path: $DB_PATH"
echo ""

# Check if database exists
if [ -f "$DB_PATH" ]; then
    echo "📦 Backing up existing database..."
    cp "$DB_PATH" "$BACKUP_PATH"
    echo "   ✓ Backup saved to: $BACKUP_PATH"
    echo ""

    echo "🗑️  Deleting old database..."
    rm -f "$DB_PATH"
    rm -f "${DB_PATH}-shm"
    rm -f "${DB_PATH}-wal"
    echo "   ✓ Old database deleted"
    echo ""
else
    echo "ℹ️  No existing database found"
    echo ""
fi

echo "✅ Database rebuild complete!"
echo ""
echo "⚠️  Note: The new database will be created automatically when the API server starts."
echo "         Restart the API container to initialize the fresh database:"
echo ""
echo "         docker-compose restart api"
echo ""
echo "📋 Backup location (if created): $BACKUP_PATH"
echo ""
