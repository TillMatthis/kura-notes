#!/bin/bash

# =============================================================================
# KURA Notes - Automated Backup Setup Script
# =============================================================================
# Sets up automated daily backups using cron
#
# Usage:
#   ./setup-backup-cron.sh [OPTIONS]
#
# Options:
#   -t, --time TIME         Backup time in HH:MM format (default: 02:00)
#   -r, --retention DAYS    Retention period in days (default: 7)
#   -d, --dir PATH          Backup directory (default: ./data/backups)
#   -e, --email EMAIL       Email for failure notifications (optional)
#   -u, --uninstall         Remove cron job
#   -h, --help              Show this help message
#
# Examples:
#   ./setup-backup-cron.sh                    # Set up daily backup at 2:00 AM
#   ./setup-backup-cron.sh -t 03:30           # Set up daily backup at 3:30 AM
#   ./setup-backup-cron.sh -r 14 -t 01:00     # 14 days retention, 1:00 AM
#   ./setup-backup-cron.sh --uninstall        # Remove cron job
# =============================================================================

set -euo pipefail

# -----------------------------------------------------------------------------
# Configuration
# -----------------------------------------------------------------------------

# Default values
BACKUP_TIME="02:00"
RETENTION_DAYS=7
BACKUP_DIR="./data/backups"
EMAIL=""
UNINSTALL=false
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Cron job identifier
CRON_MARKER="# KURA Notes automated backup"

# -----------------------------------------------------------------------------
# Helper Functions
# -----------------------------------------------------------------------------

# Print colored output
print_info() {
    echo -e "\033[0;34m[INFO]\033[0m $1"
}

print_success() {
    echo -e "\033[0;32m[SUCCESS]\033[0m $1"
}

print_warning() {
    echo -e "\033[0;33m[WARNING]\033[0m $1"
}

print_error() {
    echo -e "\033[0;31m[ERROR]\033[0m $1"
}

# Print usage
print_usage() {
    cat << EOF
KURA Notes Automated Backup Setup

Usage: $0 [OPTIONS]

Options:
  -t, --time TIME         Backup time in HH:MM format (default: 02:00)
  -r, --retention DAYS    Retention period in days (default: 7)
  -d, --dir PATH          Backup directory (default: ./data/backups)
  -e, --email EMAIL       Email for failure notifications (optional)
  -u, --uninstall         Remove cron job
  -h, --help              Show this help message

Examples:
  $0                    # Set up daily backup at 2:00 AM
  $0 -t 03:30           # Set up daily backup at 3:30 AM
  $0 -r 14 -t 01:00     # 14 days retention, 1:00 AM
  $0 --uninstall        # Remove cron job

EOF
}

# Validate time format
validate_time() {
    local time=$1
    if [[ ! $time =~ ^([0-1][0-9]|2[0-3]):[0-5][0-9]$ ]]; then
        print_error "Invalid time format: $time (expected HH:MM)"
        return 1
    fi
    return 0
}

# Convert time to cron format
time_to_cron() {
    local time=$1
    local hour=$(echo $time | cut -d: -f1)
    local minute=$(echo $time | cut -d: -f2)

    # Remove leading zeros
    hour=$((10#$hour))
    minute=$((10#$minute))

    echo "$minute $hour"
}

# -----------------------------------------------------------------------------
# Parse Arguments
# -----------------------------------------------------------------------------

while [[ $# -gt 0 ]]; do
    case $1 in
        -t|--time)
            BACKUP_TIME="$2"
            shift 2
            ;;
        -r|--retention)
            RETENTION_DAYS="$2"
            shift 2
            ;;
        -d|--dir)
            BACKUP_DIR="$2"
            shift 2
            ;;
        -e|--email)
            EMAIL="$2"
            shift 2
            ;;
        -u|--uninstall)
            UNINSTALL=true
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
# Uninstall Mode
# -----------------------------------------------------------------------------

if [ "$UNINSTALL" = true ]; then
    print_info "Removing KURA Notes backup cron job..."

    # Get current crontab
    if crontab -l >/dev/null 2>&1; then
        # Remove lines with our marker
        crontab -l | grep -v "${CRON_MARKER}" | crontab -

        print_success "✓ Cron job removed"
        print_info "Automated backups are now disabled"
    else
        print_warning "No crontab found"
    fi

    exit 0
fi

# -----------------------------------------------------------------------------
# Validate Configuration
# -----------------------------------------------------------------------------

print_info "========================================="
print_info "KURA Notes Automated Backup Setup"
print_info "========================================="
print_info ""

# Validate time
validate_time "${BACKUP_TIME}" || exit 1

# Check if backup script exists
if [ ! -f "${PROJECT_ROOT}/scripts/backup.sh" ]; then
    print_error "Backup script not found: ${PROJECT_ROOT}/scripts/backup.sh"
    exit 1
fi

# Check if backup script is executable
if [ ! -x "${PROJECT_ROOT}/scripts/backup.sh" ]; then
    print_error "Backup script is not executable"
    print_info "Run: chmod +x ${PROJECT_ROOT}/scripts/backup.sh"
    exit 1
fi

# -----------------------------------------------------------------------------
# Create Backup Directory
# -----------------------------------------------------------------------------

# Resolve backup directory path
if [[ "${BACKUP_DIR}" != /* ]]; then
    BACKUP_DIR="${PROJECT_ROOT}/${BACKUP_DIR}"
fi

mkdir -p "${BACKUP_DIR}"
print_info "Backup directory: ${BACKUP_DIR}"

# -----------------------------------------------------------------------------
# Create Wrapper Script
# -----------------------------------------------------------------------------

# Create a wrapper script that logs output and handles errors
WRAPPER_SCRIPT="${PROJECT_ROOT}/scripts/.backup-cron-wrapper.sh"

cat > "${WRAPPER_SCRIPT}" << 'EOF'
#!/bin/bash

# Wrapper script for cron backup
# This script is auto-generated by setup-backup-cron.sh

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_FILE="${PROJECT_ROOT}/data/logs/backup-cron-$(date +%Y-%m-%d).log"

# Ensure log directory exists
mkdir -p "$(dirname ${LOG_FILE})"

# Run backup and log output
{
    echo "========================================="
    echo "Automated Backup Started: $(date)"
    echo "========================================="

    if "${PROJECT_ROOT}/scripts/backup.sh" -r RETENTION_DAYS -d "BACKUP_DIR" 2>&1; then
        echo ""
        echo "✓ Automated backup completed successfully"
        exit 0
    else
        echo ""
        echo "✗ Automated backup failed!"
        exit 1
    fi
} >> "${LOG_FILE}" 2>&1

EXIT_CODE=$?

# Send email notification on failure (if email is configured)
if [ ${EXIT_CODE} -ne 0 ] && [ -n "EMAIL_ADDRESS" ]; then
    if command -v mail >/dev/null 2>&1; then
        echo "KURA Notes automated backup failed. See log: ${LOG_FILE}" | \
            mail -s "KURA Notes Backup Failed" "EMAIL_ADDRESS"
    fi
fi

exit ${EXIT_CODE}
EOF

# Replace placeholders in wrapper script
sed -i "s|RETENTION_DAYS|${RETENTION_DAYS}|g" "${WRAPPER_SCRIPT}"
sed -i "s|BACKUP_DIR|${BACKUP_DIR}|g" "${WRAPPER_SCRIPT}"
sed -i "s|EMAIL_ADDRESS|${EMAIL}|g" "${WRAPPER_SCRIPT}"

chmod +x "${WRAPPER_SCRIPT}"

print_info "Created wrapper script: ${WRAPPER_SCRIPT}"

# -----------------------------------------------------------------------------
# Set Up Cron Job
# -----------------------------------------------------------------------------

print_info "Setting up cron job..."

# Convert time to cron format
CRON_TIME=$(time_to_cron "${BACKUP_TIME}")

# Create cron job
CRON_JOB="${CRON_TIME} * * * ${WRAPPER_SCRIPT} ${CRON_MARKER}"

# Get current crontab, remove old KURA Notes backup jobs, add new one
(crontab -l 2>/dev/null | grep -v "${CRON_MARKER}" || true; echo "${CRON_JOB}") | crontab -

print_success "✓ Cron job installed"

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------

print_info ""
print_success "========================================="
print_success "Automated Backup Setup Complete!"
print_success "========================================="
print_info "Schedule: Daily at ${BACKUP_TIME}"
print_info "Retention: ${RETENTION_DAYS} days"
print_info "Backup directory: ${BACKUP_DIR}"
if [ -n "${EMAIL}" ]; then
    print_info "Email notifications: ${EMAIL}"
else
    print_info "Email notifications: Disabled"
fi
print_info ""
print_info "The backup will run automatically every day at ${BACKUP_TIME}"
print_info "Logs will be saved to: ${PROJECT_ROOT}/data/logs/backup-cron-YYYY-MM-DD.log"
print_info ""
print_info "To view your cron jobs:"
print_info "  crontab -l"
print_info ""
print_info "To uninstall automated backups:"
print_info "  ${PROJECT_ROOT}/scripts/setup-backup-cron.sh --uninstall"
print_info ""
print_info "To test the backup manually:"
print_info "  ${PROJECT_ROOT}/scripts/backup.sh"
print_info ""

exit 0
