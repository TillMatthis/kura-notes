#!/bin/bash

# =============================================================================
# KURA Notes - Backup Script
# =============================================================================
# Creates timestamped backups of SQLite database, content files, and ChromaDB data
#
# Usage:
#   ./backup.sh [OPTIONS]
#
# Options:
#   -r, --retention DAYS    Number of days to keep backups (default: 7)
#   -d, --dir PATH          Backup directory (default: ./data/backups)
#   -v, --verbose           Enable verbose logging
#   -h, --help              Show this help message
#
# Examples:
#   ./backup.sh                          # Create backup with defaults
#   ./backup.sh -r 14                    # Keep 14 days of backups
#   ./backup.sh -d /mnt/backups          # Custom backup location
#   ./backup.sh -r 30 -v                 # 30 days retention, verbose mode
# =============================================================================

set -euo pipefail

# -----------------------------------------------------------------------------
# Configuration
# -----------------------------------------------------------------------------

# Default values
RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-7}
BACKUP_DIR="${BACKUP_DIR:-./data/backups}"
VERBOSE=false
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Data paths (relative to project root)
DATA_DIR="${PROJECT_ROOT}/data"
DB_PATH="${DATA_DIR}/metadata/knowledge.db"
CONTENT_DIR="${DATA_DIR}/content"
CHROMA_VOLUME="kura-notes_chroma-data"  # Docker volume name

# Timestamp for this backup
TIMESTAMP=$(date +%Y-%m-%d-%H%M%S)
BACKUP_NAME="backup-${TIMESTAMP}"

# Log file for this backup
LOG_FILE="${PROJECT_ROOT}/data/logs/backup-${TIMESTAMP}.log"

# -----------------------------------------------------------------------------
# Helper Functions
# -----------------------------------------------------------------------------

# Print colored output
print_info() {
    echo -e "\033[0;34m[INFO]\033[0m $1" | tee -a "${LOG_FILE}"
}

print_success() {
    echo -e "\033[0;32m[SUCCESS]\033[0m $1" | tee -a "${LOG_FILE}"
}

print_warning() {
    echo -e "\033[0;33m[WARNING]\033[0m $1" | tee -a "${LOG_FILE}"
}

print_error() {
    echo -e "\033[0;31m[ERROR]\033[0m $1" | tee -a "${LOG_FILE}"
}

print_verbose() {
    if [ "$VERBOSE" = true ]; then
        echo -e "\033[0;90m[DEBUG]\033[0m $1" | tee -a "${LOG_FILE}"
    fi
}

# Print usage
print_usage() {
    cat << EOF
KURA Notes Backup Script

Usage: $0 [OPTIONS]

Options:
  -r, --retention DAYS    Number of days to keep backups (default: 7)
  -d, --dir PATH          Backup directory (default: ./data/backups)
  -v, --verbose           Enable verbose logging
  -h, --help              Show this help message

Examples:
  $0                          # Create backup with defaults
  $0 -r 14                    # Keep 14 days of backups
  $0 -d /mnt/backups          # Custom backup location
  $0 -r 30 -v                 # 30 days retention, verbose mode

EOF
}

# Calculate human-readable size
human_readable_size() {
    local size=$1
    if [ "$size" -lt 1024 ]; then
        echo "${size}B"
    elif [ "$size" -lt 1048576 ]; then
        echo "$(( size / 1024 ))KB"
    elif [ "$size" -lt 1073741824 ]; then
        echo "$(( size / 1048576 ))MB"
    else
        echo "$(( size / 1073741824 ))GB"
    fi
}

# Check if running in Docker
is_docker_running() {
    docker ps >/dev/null 2>&1
}

# -----------------------------------------------------------------------------
# Parse Arguments
# -----------------------------------------------------------------------------

while [[ $# -gt 0 ]]; do
    case $1 in
        -r|--retention)
            RETENTION_DAYS="$2"
            shift 2
            ;;
        -d|--dir)
            BACKUP_DIR="$2"
            shift 2
            ;;
        -v|--verbose)
            VERBOSE=true
            shift
            ;;
        -h|--help)
            print_usage
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            print_usage
            exit 1
            ;;
    esac
done

# -----------------------------------------------------------------------------
# Pre-flight Checks
# -----------------------------------------------------------------------------

print_info "========================================="
print_info "KURA Notes Backup - $(date)"
print_info "========================================="
print_info "Retention: ${RETENTION_DAYS} days"
print_info "Backup directory: ${BACKUP_DIR}"
print_info ""

# Create log directory if it doesn't exist
mkdir -p "${DATA_DIR}/logs"

# Create backup directory if it doesn't exist
mkdir -p "${BACKUP_DIR}"
print_verbose "Created backup directory: ${BACKUP_DIR}"

# Create temporary directory for staging
TEMP_BACKUP_DIR=$(mktemp -d)
print_verbose "Created temporary directory: ${TEMP_BACKUP_DIR}"

# Cleanup function
cleanup() {
    print_verbose "Cleaning up temporary directory..."
    rm -rf "${TEMP_BACKUP_DIR}"
}
trap cleanup EXIT

# -----------------------------------------------------------------------------
# Backup SQLite Database
# -----------------------------------------------------------------------------

print_info "Backing up SQLite database..."

if [ -f "${DB_PATH}" ]; then
    DB_SIZE=$(stat -c%s "${DB_PATH}" 2>/dev/null || stat -f%z "${DB_PATH}" 2>/dev/null)
    print_verbose "Database size: $(human_readable_size ${DB_SIZE})"

    # Create metadata directory in temp backup
    mkdir -p "${TEMP_BACKUP_DIR}/metadata"

    # Copy database file
    cp "${DB_PATH}" "${TEMP_BACKUP_DIR}/metadata/knowledge.db"

    # Also copy WAL and SHM files if they exist (SQLite write-ahead log)
    if [ -f "${DB_PATH}-wal" ]; then
        cp "${DB_PATH}-wal" "${TEMP_BACKUP_DIR}/metadata/knowledge.db-wal"
        print_verbose "Copied WAL file"
    fi
    if [ -f "${DB_PATH}-shm" ]; then
        cp "${DB_PATH}-shm" "${TEMP_BACKUP_DIR}/metadata/knowledge.db-shm"
        print_verbose "Copied SHM file"
    fi

    print_success "✓ Database backed up"
else
    print_warning "Database not found at ${DB_PATH}"
fi

# -----------------------------------------------------------------------------
# Backup Content Files
# -----------------------------------------------------------------------------

print_info "Backing up content files..."

if [ -d "${CONTENT_DIR}" ]; then
    # Count files
    FILE_COUNT=$(find "${CONTENT_DIR}" -type f 2>/dev/null | wc -l || echo 0)
    print_verbose "Found ${FILE_COUNT} content files"

    # Calculate total size
    CONTENT_SIZE=$(du -sb "${CONTENT_DIR}" 2>/dev/null | cut -f1 || echo 0)
    print_verbose "Content size: $(human_readable_size ${CONTENT_SIZE})"

    # Copy content directory
    cp -r "${CONTENT_DIR}" "${TEMP_BACKUP_DIR}/content"

    print_success "✓ Content files backed up (${FILE_COUNT} files, $(human_readable_size ${CONTENT_SIZE}))"
else
    print_warning "Content directory not found at ${CONTENT_DIR}"
    mkdir -p "${TEMP_BACKUP_DIR}/content"
fi

# -----------------------------------------------------------------------------
# Backup ChromaDB Data
# -----------------------------------------------------------------------------

print_info "Backing up ChromaDB data..."

if is_docker_running; then
    # Check if ChromaDB volume exists
    if docker volume inspect "${CHROMA_VOLUME}" >/dev/null 2>&1; then
        print_verbose "Found ChromaDB volume: ${CHROMA_VOLUME}"

        # Create temporary container to export ChromaDB data
        mkdir -p "${TEMP_BACKUP_DIR}/chromadb"

        # Use a temporary container to copy data from the volume
        docker run --rm \
            -v "${CHROMA_VOLUME}:/source:ro" \
            -v "${TEMP_BACKUP_DIR}/chromadb:/backup" \
            alpine:latest \
            sh -c 'cp -r /source/* /backup/ 2>/dev/null || true'

        # Calculate ChromaDB size
        CHROMA_SIZE=$(du -sb "${TEMP_BACKUP_DIR}/chromadb" 2>/dev/null | cut -f1 || echo 0)
        print_verbose "ChromaDB size: $(human_readable_size ${CHROMA_SIZE})"

        print_success "✓ ChromaDB data backed up ($(human_readable_size ${CHROMA_SIZE}))"
    else
        print_warning "ChromaDB volume '${CHROMA_VOLUME}' not found"
        mkdir -p "${TEMP_BACKUP_DIR}/chromadb"
    fi
else
    print_warning "Docker is not running, skipping ChromaDB backup"
    print_warning "If you're using ChromaDB with Docker, start Docker and run backup again"
    mkdir -p "${TEMP_BACKUP_DIR}/chromadb"
fi

# -----------------------------------------------------------------------------
# Create Backup Metadata
# -----------------------------------------------------------------------------

print_info "Creating backup metadata..."

cat > "${TEMP_BACKUP_DIR}/backup-info.txt" << EOF
KURA Notes Backup
=================

Backup Name: ${BACKUP_NAME}
Timestamp: $(date -Iseconds)
Hostname: $(hostname)
User: $(whoami)

Contents:
---------
Database: $([ -f "${DB_PATH}" ] && echo "Yes" || echo "No")
Content Files: ${FILE_COUNT:-0} files
ChromaDB: $([ -d "${TEMP_BACKUP_DIR}/chromadb" ] && [ "$(ls -A ${TEMP_BACKUP_DIR}/chromadb)" ] && echo "Yes" || echo "No")

Sizes:
------
Database: $(human_readable_size ${DB_SIZE:-0})
Content: $(human_readable_size ${CONTENT_SIZE:-0})
ChromaDB: $(human_readable_size ${CHROMA_SIZE:-0})
Total (uncompressed): $(human_readable_size $((${DB_SIZE:-0} + ${CONTENT_SIZE:-0} + ${CHROMA_SIZE:-0})))

System Information:
-------------------
OS: $(uname -s)
Kernel: $(uname -r)
Architecture: $(uname -m)

EOF

print_verbose "Created backup metadata file"

# -----------------------------------------------------------------------------
# Compress Backup
# -----------------------------------------------------------------------------

print_info "Compressing backup archive..."

ARCHIVE_PATH="${BACKUP_DIR}/${BACKUP_NAME}.tar.gz"
print_verbose "Archive path: ${ARCHIVE_PATH}"

# Create tar.gz archive with compression
tar -czf "${ARCHIVE_PATH}" -C "${TEMP_BACKUP_DIR}" .

# Calculate archive size
ARCHIVE_SIZE=$(stat -c%s "${ARCHIVE_PATH}" 2>/dev/null || stat -f%z "${ARCHIVE_PATH}" 2>/dev/null)
COMPRESSION_RATIO=$(echo "scale=1; ${ARCHIVE_SIZE} * 100 / $((${DB_SIZE:-1} + ${CONTENT_SIZE:-1} + ${CHROMA_SIZE:-1}))" | bc 2>/dev/null || echo "N/A")

print_success "✓ Backup compressed"
print_info "  Archive: ${ARCHIVE_PATH}"
print_info "  Size: $(human_readable_size ${ARCHIVE_SIZE})"
print_info "  Compression: ${COMPRESSION_RATIO}%"

# -----------------------------------------------------------------------------
# Apply Retention Policy
# -----------------------------------------------------------------------------

print_info "Applying retention policy (${RETENTION_DAYS} days)..."

# Find and delete old backups
DELETED_COUNT=0
while IFS= read -r old_backup; do
    rm -f "${old_backup}"
    DELETED_COUNT=$((DELETED_COUNT + 1))
    print_verbose "Deleted old backup: $(basename ${old_backup})"
done < <(find "${BACKUP_DIR}" -name "backup-*.tar.gz" -type f -mtime "+${RETENTION_DAYS}" 2>/dev/null || true)

if [ ${DELETED_COUNT} -gt 0 ]; then
    print_success "✓ Deleted ${DELETED_COUNT} old backup(s)"
else
    print_verbose "No old backups to delete"
fi

# List current backups
CURRENT_BACKUPS=$(find "${BACKUP_DIR}" -name "backup-*.tar.gz" -type f 2>/dev/null | wc -l || echo 0)
TOTAL_BACKUP_SIZE=$(du -sb "${BACKUP_DIR}" 2>/dev/null | cut -f1 || echo 0)

print_info "Current backups: ${CURRENT_BACKUPS}"
print_info "Total backup size: $(human_readable_size ${TOTAL_BACKUP_SIZE})"

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------

print_info ""
print_success "========================================="
print_success "Backup completed successfully!"
print_success "========================================="
print_info "Backup file: ${ARCHIVE_PATH}"
print_info "Backup size: $(human_readable_size ${ARCHIVE_SIZE})"
print_info "Log file: ${LOG_FILE}"
print_info ""
print_info "To restore from this backup, run:"
print_info "  ./scripts/restore.sh ${BACKUP_NAME}.tar.gz"
print_info ""

exit 0
