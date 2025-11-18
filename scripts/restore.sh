#!/bin/bash

# =============================================================================
# KURA Notes - Restore Script
# =============================================================================
# Restores KURA Notes from a backup archive
#
# Usage:
#   ./restore.sh [OPTIONS] BACKUP_FILE
#
# Options:
#   -d, --dir PATH          Backup directory (default: ./data/backups)
#   -l, --list              List available backups and exit
#   -f, --force             Skip confirmation prompt
#   -n, --no-backup         Don't create safety backup before restore
#   -v, --verbose           Enable verbose logging
#   -h, --help              Show this help message
#
# Examples:
#   ./restore.sh --list                              # List available backups
#   ./restore.sh backup-2025-11-18-120000.tar.gz     # Restore from backup
#   ./restore.sh -f backup-2025-11-18-120000.tar.gz  # Restore without prompt
#   ./restore.sh -n backup-2025-11-18-120000.tar.gz  # Restore without safety backup
# =============================================================================

set -euo pipefail

# -----------------------------------------------------------------------------
# Configuration
# -----------------------------------------------------------------------------

# Default values
BACKUP_DIR="${BACKUP_DIR:-./data/backups}"
LIST_ONLY=false
FORCE=false
CREATE_SAFETY_BACKUP=true
VERBOSE=false
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Data paths (relative to project root)
DATA_DIR="${PROJECT_ROOT}/data"
DB_PATH="${DATA_DIR}/metadata/knowledge.db"
CONTENT_DIR="${DATA_DIR}/content"
CHROMA_VOLUME="kura-notes_chroma-data"  # Docker volume name

# Timestamp for this restore
TIMESTAMP=$(date +%Y-%m-%d-%H%M%S)

# Log file for this restore
LOG_FILE="${PROJECT_ROOT}/data/logs/restore-${TIMESTAMP}.log"

# -----------------------------------------------------------------------------
# Helper Functions
# -----------------------------------------------------------------------------

# Print colored output
print_info() {
    echo -e "\033[0;34m[INFO]\033[0m $1" | tee -a "${LOG_FILE}" 2>/dev/null || echo -e "\033[0;34m[INFO]\033[0m $1"
}

print_success() {
    echo -e "\033[0;32m[SUCCESS]\033[0m $1" | tee -a "${LOG_FILE}" 2>/dev/null || echo -e "\033[0;32m[SUCCESS]\033[0m $1"
}

print_warning() {
    echo -e "\033[0;33m[WARNING]\033[0m $1" | tee -a "${LOG_FILE}" 2>/dev/null || echo -e "\033[0;33m[WARNING]\033[0m $1"
}

print_error() {
    echo -e "\033[0;31m[ERROR]\033[0m $1" | tee -a "${LOG_FILE}" 2>/dev/null || echo -e "\033[0;31m[ERROR]\033[0m $1"
}

print_verbose() {
    if [ "$VERBOSE" = true ]; then
        echo -e "\033[0;90m[DEBUG]\033[0m $1" | tee -a "${LOG_FILE}" 2>/dev/null || echo -e "\033[0;90m[DEBUG]\033[0m $1"
    fi
}

# Print usage
print_usage() {
    cat << EOF
KURA Notes Restore Script

Usage: $0 [OPTIONS] BACKUP_FILE

Options:
  -d, --dir PATH          Backup directory (default: ./data/backups)
  -l, --list              List available backups and exit
  -f, --force             Skip confirmation prompt
  -n, --no-backup         Don't create safety backup before restore
  -v, --verbose           Enable verbose logging
  -h, --help              Show this help message

Examples:
  $0 --list                              # List available backups
  $0 backup-2025-11-18-120000.tar.gz     # Restore from backup
  $0 -f backup-2025-11-18-120000.tar.gz  # Restore without prompt
  $0 -n backup-2025-11-18-120000.tar.gz  # Restore without safety backup

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

# List available backups
list_backups() {
    print_info "Available backups in ${BACKUP_DIR}:"
    print_info ""

    if [ ! -d "${BACKUP_DIR}" ]; then
        print_error "Backup directory not found: ${BACKUP_DIR}"
        exit 1
    fi

    local backup_count=0
    while IFS= read -r backup_file; do
        backup_count=$((backup_count + 1))
        local filename=$(basename "${backup_file}")
        local size=$(stat -c%s "${backup_file}" 2>/dev/null || stat -f%z "${backup_file}" 2>/dev/null)
        local date=$(stat -c%y "${backup_file}" 2>/dev/null || stat -f%Sm "${backup_file}" 2>/dev/null)

        printf "  %-40s  %10s  %s\n" "${filename}" "$(human_readable_size ${size})" "${date}"
    done < <(find "${BACKUP_DIR}" -name "backup-*.tar.gz" -type f | sort -r)

    if [ ${backup_count} -eq 0 ]; then
        print_warning "No backups found"
    else
        print_info ""
        print_info "Total: ${backup_count} backup(s)"
    fi
}

# Verify backup integrity
verify_backup() {
    local backup_file=$1

    print_info "Verifying backup integrity..."

    # Check if file exists
    if [ ! -f "${backup_file}" ]; then
        print_error "Backup file not found: ${backup_file}"
        return 1
    fi

    # Check if file is a valid tar.gz
    if ! tar -tzf "${backup_file}" >/dev/null 2>&1; then
        print_error "Backup file is corrupted or not a valid tar.gz archive"
        return 1
    fi

    # Check if backup contains expected files
    local has_metadata=false
    local has_content=false

    if tar -tzf "${backup_file}" | grep -q "metadata/knowledge.db$"; then
        has_metadata=true
    fi

    if tar -tzf "${backup_file}" | grep -q "content/"; then
        has_content=true
    fi

    if [ "$has_metadata" = false ] && [ "$has_content" = false ]; then
        print_error "Backup appears to be empty or invalid"
        return 1
    fi

    print_success "✓ Backup integrity verified"
    return 0
}

# Create safety backup
create_safety_backup() {
    print_info "Creating safety backup of current data..."

    # Call the backup script
    if [ -x "${PROJECT_ROOT}/scripts/backup.sh" ]; then
        "${PROJECT_ROOT}/scripts/backup.sh" -d "${BACKUP_DIR}" > /dev/null 2>&1
        print_success "✓ Safety backup created"
    else
        print_warning "Backup script not found, skipping safety backup"
    fi
}

# -----------------------------------------------------------------------------
# Parse Arguments
# -----------------------------------------------------------------------------

BACKUP_FILE=""

while [[ $# -gt 0 ]]; do
    case $1 in
        -d|--dir)
            BACKUP_DIR="$2"
            shift 2
            ;;
        -l|--list)
            LIST_ONLY=true
            shift
            ;;
        -f|--force)
            FORCE=true
            shift
            ;;
        -n|--no-backup)
            CREATE_SAFETY_BACKUP=false
            shift
            ;;
        -v|--verbose)
            VERBOSE=true
            shift
            ;;
        -h|--help)
            print_usage
            exit 0
            ;;
        -*)
            print_error "Unknown option: $1"
            print_usage
            exit 1
            ;;
        *)
            BACKUP_FILE="$1"
            shift
            ;;
    esac
done

# -----------------------------------------------------------------------------
# List Mode
# -----------------------------------------------------------------------------

if [ "$LIST_ONLY" = true ]; then
    list_backups
    exit 0
fi

# -----------------------------------------------------------------------------
# Pre-flight Checks
# -----------------------------------------------------------------------------

if [ -z "${BACKUP_FILE}" ]; then
    print_error "No backup file specified"
    print_usage
    exit 1
fi

# Create log directory if it doesn't exist
mkdir -p "${DATA_DIR}/logs" 2>/dev/null || true

print_info "========================================="
print_info "KURA Notes Restore - $(date)"
print_info "========================================="
print_info "Backup file: ${BACKUP_FILE}"
print_info ""

# Resolve backup file path
if [[ "${BACKUP_FILE}" != /* ]]; then
    # If not absolute path, check in backup directory first
    if [ -f "${BACKUP_DIR}/${BACKUP_FILE}" ]; then
        BACKUP_FILE="${BACKUP_DIR}/${BACKUP_FILE}"
    elif [ -f "${PROJECT_ROOT}/${BACKUP_FILE}" ]; then
        BACKUP_FILE="${PROJECT_ROOT}/${BACKUP_FILE}"
    fi
fi

# Verify backup file exists and is valid
verify_backup "${BACKUP_FILE}" || exit 1

# Show backup info if available
TEMP_EXTRACT_DIR=$(mktemp -d)
cleanup() {
    print_verbose "Cleaning up temporary directory..."
    rm -rf "${TEMP_EXTRACT_DIR}"
}
trap cleanup EXIT

tar -xzf "${BACKUP_FILE}" -C "${TEMP_EXTRACT_DIR}" backup-info.txt 2>/dev/null || true
if [ -f "${TEMP_EXTRACT_DIR}/backup-info.txt" ]; then
    print_info "Backup Information:"
    print_info "-------------------"
    cat "${TEMP_EXTRACT_DIR}/backup-info.txt" | while read line; do
        print_info "$line"
    done
    print_info ""
fi

# -----------------------------------------------------------------------------
# Confirmation
# -----------------------------------------------------------------------------

if [ "$FORCE" = false ]; then
    print_warning "⚠️  WARNING: This will replace all current data!"
    print_warning ""
    print_warning "The following will be REPLACED:"
    [ -f "${DB_PATH}" ] && print_warning "  - Database: ${DB_PATH}"
    [ -d "${CONTENT_DIR}" ] && print_warning "  - Content files: ${CONTENT_DIR}"
    print_warning "  - ChromaDB data (if Docker is running)"
    print_warning ""

    read -p "Are you sure you want to continue? (yes/no): " -r
    echo
    if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
        print_info "Restore cancelled"
        exit 0
    fi
fi

# -----------------------------------------------------------------------------
# Create Safety Backup
# -----------------------------------------------------------------------------

if [ "$CREATE_SAFETY_BACKUP" = true ]; then
    create_safety_backup
fi

# -----------------------------------------------------------------------------
# Stop Services (if running)
# -----------------------------------------------------------------------------

print_info "Checking for running services..."

SHOULD_RESTART=false
if is_docker_running; then
    if docker compose -f "${PROJECT_ROOT}/docker-compose.yml" ps | grep -q "Up"; then
        print_warning "Stopping Docker services..."
        docker compose -f "${PROJECT_ROOT}/docker-compose.yml" down
        SHOULD_RESTART=true
        print_success "✓ Services stopped"
    fi
fi

# -----------------------------------------------------------------------------
# Extract Backup
# -----------------------------------------------------------------------------

print_info "Extracting backup archive..."

rm -rf "${TEMP_EXTRACT_DIR}"
mkdir -p "${TEMP_EXTRACT_DIR}"
tar -xzf "${BACKUP_FILE}" -C "${TEMP_EXTRACT_DIR}"

print_success "✓ Backup extracted"

# -----------------------------------------------------------------------------
# Restore Database
# -----------------------------------------------------------------------------

print_info "Restoring SQLite database..."

if [ -f "${TEMP_EXTRACT_DIR}/metadata/knowledge.db" ]; then
    # Create metadata directory if it doesn't exist
    mkdir -p "$(dirname ${DB_PATH})"

    # Remove old database files
    rm -f "${DB_PATH}" "${DB_PATH}-wal" "${DB_PATH}-shm"

    # Copy database
    cp "${TEMP_EXTRACT_DIR}/metadata/knowledge.db" "${DB_PATH}"

    # Copy WAL and SHM files if they exist
    if [ -f "${TEMP_EXTRACT_DIR}/metadata/knowledge.db-wal" ]; then
        cp "${TEMP_EXTRACT_DIR}/metadata/knowledge.db-wal" "${DB_PATH}-wal"
    fi
    if [ -f "${TEMP_EXTRACT_DIR}/metadata/knowledge.db-shm" ]; then
        cp "${TEMP_EXTRACT_DIR}/metadata/knowledge.db-shm" "${DB_PATH}-shm"
    fi

    # Verify database
    if command -v sqlite3 >/dev/null 2>&1; then
        if sqlite3 "${DB_PATH}" "PRAGMA integrity_check;" | grep -q "ok"; then
            print_success "✓ Database restored and verified"
        else
            print_error "Database integrity check failed!"
            exit 1
        fi
    else
        print_success "✓ Database restored (integrity check skipped - sqlite3 not available)"
    fi
else
    print_warning "No database found in backup"
fi

# -----------------------------------------------------------------------------
# Restore Content Files
# -----------------------------------------------------------------------------

print_info "Restoring content files..."

if [ -d "${TEMP_EXTRACT_DIR}/content" ]; then
    # Remove old content directory
    rm -rf "${CONTENT_DIR}"

    # Copy content directory
    cp -r "${TEMP_EXTRACT_DIR}/content" "${CONTENT_DIR}"

    # Count restored files
    FILE_COUNT=$(find "${CONTENT_DIR}" -type f 2>/dev/null | wc -l || echo 0)
    CONTENT_SIZE=$(du -sb "${CONTENT_DIR}" 2>/dev/null | cut -f1 || echo 0)

    print_success "✓ Content files restored (${FILE_COUNT} files, $(human_readable_size ${CONTENT_SIZE}))"
else
    print_warning "No content files found in backup"
fi

# -----------------------------------------------------------------------------
# Restore ChromaDB Data
# -----------------------------------------------------------------------------

print_info "Restoring ChromaDB data..."

if [ -d "${TEMP_EXTRACT_DIR}/chromadb" ] && [ "$(ls -A ${TEMP_EXTRACT_DIR}/chromadb 2>/dev/null)" ]; then
    if is_docker_running; then
        # Check if ChromaDB volume exists
        if docker volume inspect "${CHROMA_VOLUME}" >/dev/null 2>&1; then
            print_verbose "Removing old ChromaDB volume..."
            docker volume rm "${CHROMA_VOLUME}" 2>/dev/null || true
        fi

        # Create new volume
        docker volume create "${CHROMA_VOLUME}"

        # Use a temporary container to restore data to the volume
        docker run --rm \
            -v "${TEMP_EXTRACT_DIR}/chromadb:/source:ro" \
            -v "${CHROMA_VOLUME}:/target" \
            alpine:latest \
            sh -c 'cp -r /source/* /target/'

        print_success "✓ ChromaDB data restored"
    else
        print_warning "Docker is not running, skipping ChromaDB restore"
        print_warning "Start Docker and run restore again to restore ChromaDB data"
    fi
else
    print_warning "No ChromaDB data found in backup"
fi

# -----------------------------------------------------------------------------
# Verify Restore
# -----------------------------------------------------------------------------

print_info "Verifying restore..."

VERIFY_FAILED=false

# Verify database exists
if [ ! -f "${DB_PATH}" ]; then
    print_error "Database file not found after restore!"
    VERIFY_FAILED=true
fi

# Verify content directory exists
if [ ! -d "${CONTENT_DIR}" ]; then
    print_error "Content directory not found after restore!"
    VERIFY_FAILED=true
fi

if [ "$VERIFY_FAILED" = true ]; then
    print_error "Restore verification failed!"
    exit 1
fi

print_success "✓ Restore verified"

# -----------------------------------------------------------------------------
# Restart Services
# -----------------------------------------------------------------------------

if [ "$SHOULD_RESTART" = true ]; then
    print_info "Restarting Docker services..."
    docker compose -f "${PROJECT_ROOT}/docker-compose.yml" up -d
    print_success "✓ Services restarted"
    print_info "Waiting for services to be ready..."
    sleep 5
fi

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------

print_info ""
print_success "========================================="
print_success "Restore completed successfully!"
print_success "========================================="
print_info "Restored from: ${BACKUP_FILE}"
print_info "Log file: ${LOG_FILE}"
print_info ""

if [ "$SHOULD_RESTART" = true ]; then
    print_info "Services have been restarted"
    print_info "Access the application at: http://localhost:3000"
else
    print_warning "Note: You may need to restart the application for changes to take effect"
fi

print_info ""

exit 0
