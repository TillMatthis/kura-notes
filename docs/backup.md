# KURA Notes - Backup & Restore Guide

Complete guide for backing up and restoring your KURA Notes data.

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Manual Backup](#manual-backup)
- [Restore from Backup](#restore-from-backup)
- [Automated Backups](#automated-backups)
- [Backup Storage](#backup-storage)
- [Best Practices](#best-practices)
- [Disaster Recovery](#disaster-recovery)
- [Troubleshooting](#troubleshooting)

---

## Overview

The KURA Notes backup system provides comprehensive data protection for:

- **SQLite Database** (`data/metadata/knowledge.db`) - All content metadata, tags, and search indexes
- **Content Files** (`data/content/`) - All uploaded files (text, images, PDFs)
- **ChromaDB Data** (Docker volume) - Vector embeddings for semantic search

### What's Included

Each backup contains:
- ✅ Complete database with all metadata
- ✅ All content files in original format
- ✅ Vector embeddings from ChromaDB
- ✅ Backup metadata and timestamps
- ✅ System information for verification

### Backup Format

- **Archive Format**: tar.gz (compressed)
- **Naming Convention**: `backup-YYYY-MM-DD-HHMMSS.tar.gz`
- **Default Location**: `./data/backups/`
- **Typical Size**: 10-80% of original data (depends on content)

---

## Quick Start

### Create Your First Backup

```bash
# From project root
./scripts/backup.sh
```

### Restore from Backup

```bash
# List available backups
./scripts/restore.sh --list

# Restore from specific backup
./scripts/restore.sh backup-2025-11-18-120000.tar.gz
```

### Set Up Daily Automated Backups

```bash
# Daily backup at 2:00 AM, keep 7 days
./scripts/setup-backup-cron.sh

# Custom schedule: 3:30 AM, keep 14 days
./scripts/setup-backup-cron.sh -t 03:30 -r 14
```

---

## Manual Backup

### Basic Usage

```bash
./scripts/backup.sh
```

This creates a timestamped backup with default settings:
- Retention: 7 days
- Location: `./data/backups/`
- Includes: Database, content files, ChromaDB data

### Advanced Options

```bash
# Custom retention (keep 30 days)
./scripts/backup.sh --retention 30

# Custom backup directory
./scripts/backup.sh --dir /mnt/external/backups

# Verbose mode (detailed logging)
./scripts/backup.sh --verbose

# Combined options
./scripts/backup.sh -r 14 -d /mnt/backups -v
```

### Understanding the Output

```
[INFO] =========================================
[INFO] KURA Notes Backup - 2025-11-18 12:00:00
[INFO] =========================================
[INFO] Retention: 7 days
[INFO] Backup directory: ./data/backups
[INFO]
[INFO] Backing up SQLite database...
[SUCCESS] ✓ Database backed up
[INFO] Backing up content files...
[SUCCESS] ✓ Content files backed up (150 files, 25MB)
[INFO] Backing up ChromaDB data...
[SUCCESS] ✓ ChromaDB data backed up (10MB)
[INFO] Creating backup metadata...
[INFO] Compressing backup archive...
[SUCCESS] ✓ Backup compressed
[INFO]   Archive: ./data/backups/backup-2025-11-18-120000.tar.gz
[INFO]   Size: 12MB
[INFO]   Compression: 34.3%
[INFO] Applying retention policy (7 days)...
[SUCCESS] ✓ Deleted 2 old backup(s)
[INFO] Current backups: 7
[INFO] Total backup size: 85MB
[INFO]
[SUCCESS] =========================================
[SUCCESS] Backup completed successfully!
[SUCCESS] =========================================
```

### What Gets Backed Up

#### 1. SQLite Database
- Main database file: `knowledge.db`
- WAL file: `knowledge.db-wal` (if exists)
- Shared memory: `knowledge.db-shm` (if exists)

#### 2. Content Files
- All uploaded files in `data/content/`
- Organized by date: `YYYY/MM/DD/`
- Includes: text files, images, PDFs
- Includes: thumbnails (if generated)

#### 3. ChromaDB Data
- Vector embeddings
- Collection metadata
- Index files

**Note**: ChromaDB backup requires Docker to be running. If Docker is not running, a warning is shown and the backup continues without ChromaDB data.

### Retention Policy

Old backups are automatically deleted based on the retention period:

- **Default**: 7 days
- **How it works**: Any backup older than the retention period is deleted
- **When it runs**: After each successful backup
- **Safety**: Retention check only deletes files matching `backup-*.tar.gz` pattern

Example:
```bash
# Keep last 14 days
./scripts/backup.sh --retention 14

# Keep last 30 days (monthly backups)
./scripts/backup.sh --retention 30

# Keep last 90 days (quarterly backups)
./scripts/backup.sh --retention 90
```

---

## Restore from Backup

### List Available Backups

```bash
./scripts/restore.sh --list
```

Output:
```
Available backups in ./data/backups:

  backup-2025-11-18-120000.tar.gz          12MB  2025-11-18 12:00:00
  backup-2025-11-17-020000.tar.gz          11MB  2025-11-17 02:00:00
  backup-2025-11-16-020000.tar.gz          10MB  2025-11-16 02:00:00

Total: 3 backup(s)
```

### Basic Restore

```bash
# Restore from specific backup
./scripts/restore.sh backup-2025-11-18-120000.tar.gz
```

The script will:
1. ✅ Verify backup integrity
2. ✅ Show backup information
3. ✅ Ask for confirmation
4. ✅ Create a safety backup of current data
5. ✅ Stop running services (if using Docker)
6. ✅ Restore database
7. ✅ Restore content files
8. ✅ Restore ChromaDB data
9. ✅ Verify restore completed successfully
10. ✅ Restart services (if they were stopped)

### Advanced Restore Options

```bash
# Skip confirmation prompt
./scripts/restore.sh --force backup-2025-11-18-120000.tar.gz

# Skip safety backup (not recommended!)
./scripts/restore.sh --no-backup backup-2025-11-18-120000.tar.gz

# Verbose mode
./scripts/restore.sh --verbose backup-2025-11-18-120000.tar.gz

# Custom backup directory
./scripts/restore.sh --dir /mnt/backups backup-2025-11-18-120000.tar.gz
```

### Understanding the Restore Process

```
[INFO] =========================================
[INFO] KURA Notes Restore - 2025-11-18 14:30:00
[INFO] =========================================
[INFO] Backup file: backup-2025-11-18-120000.tar.gz
[INFO]
[INFO] Verifying backup integrity...
[SUCCESS] ✓ Backup integrity verified
[INFO] Backup Information:
[INFO] -------------------
[INFO] Backup Name: backup-2025-11-18-120000
[INFO] Timestamp: 2025-11-18T12:00:00
[INFO] Contents: Database, 150 files, ChromaDB
[INFO]
[WARNING] ⚠️  WARNING: This will replace all current data!
[WARNING]
[WARNING] The following will be REPLACED:
[WARNING]   - Database: ./data/metadata/knowledge.db
[WARNING]   - Content files: ./data/content
[WARNING]   - ChromaDB data (if Docker is running)
[WARNING]
Are you sure you want to continue? (yes/no): yes

[INFO] Creating safety backup of current data...
[SUCCESS] ✓ Safety backup created
[INFO] Checking for running services...
[WARNING] Stopping Docker services...
[SUCCESS] ✓ Services stopped
[INFO] Extracting backup archive...
[SUCCESS] ✓ Backup extracted
[INFO] Restoring SQLite database...
[SUCCESS] ✓ Database restored and verified
[INFO] Restoring content files...
[SUCCESS] ✓ Content files restored (150 files, 25MB)
[INFO] Restoring ChromaDB data...
[SUCCESS] ✓ ChromaDB data restored
[INFO] Verifying restore...
[SUCCESS] ✓ Restore verified
[INFO] Restarting Docker services...
[SUCCESS] ✓ Services restarted
[INFO]
[SUCCESS] =========================================
[SUCCESS] Restore completed successfully!
[SUCCESS] =========================================
```

### Safety Features

#### 1. Automatic Safety Backup
Before restoring, a backup of your current data is created automatically:
- Saved to the same backup directory
- Named with current timestamp
- Can be disabled with `--no-backup` (not recommended)

#### 2. Integrity Verification
The restore script verifies:
- Backup file exists and is readable
- Archive is a valid tar.gz file
- Archive contains expected data structure
- Restored database passes integrity check (if sqlite3 is available)

#### 3. Confirmation Prompt
You must type "yes" to confirm the restore operation (unless using `--force`).

---

## Automated Backups

### Set Up Daily Backups

The easiest way to ensure your data is backed up regularly:

```bash
./scripts/setup-backup-cron.sh
```

This sets up:
- Daily backup at 2:00 AM
- 7-day retention
- Automatic cleanup of old backups
- Logging of all backup operations

### Custom Schedule

```bash
# Backup at 3:30 AM
./scripts/setup-backup-cron.sh --time 03:30

# Keep 14 days of backups
./scripts/setup-backup-cron.sh --retention 14

# Custom directory
./scripts/setup-backup-cron.sh --dir /mnt/backups

# With email notifications on failure
./scripts/setup-backup-cron.sh --email admin@example.com

# Combined options
./scripts/setup-backup-cron.sh -t 01:00 -r 30 -e admin@example.com
```

### View Scheduled Backups

```bash
crontab -l | grep "KURA Notes"
```

### Check Backup Logs

Automated backups log to:
```bash
./data/logs/backup-cron-YYYY-MM-DD.log
```

View recent logs:
```bash
# Today's log
cat data/logs/backup-cron-$(date +%Y-%m-%d).log

# All backup logs
ls -lh data/logs/backup-cron-*.log
```

### Email Notifications

To receive email notifications when backups fail:

1. Install mail utility:
   ```bash
   # Ubuntu/Debian
   sudo apt-get install mailutils

   # CentOS/RHEL
   sudo yum install mailx
   ```

2. Set up email in cron setup:
   ```bash
   ./scripts/setup-backup-cron.sh --email your@email.com
   ```

### Uninstall Automated Backups

```bash
./scripts/setup-backup-cron.sh --uninstall
```

---

## Backup Storage

### Default Location

```
./data/backups/
├── backup-2025-11-18-120000.tar.gz
├── backup-2025-11-17-020000.tar.gz
├── backup-2025-11-16-020000.tar.gz
└── ...
```

### External Storage

For better data protection, store backups on external storage:

#### NFS Mount
```bash
# Mount NFS share
sudo mount -t nfs server:/backups /mnt/backups

# Run backup to external storage
./scripts/backup.sh --dir /mnt/backups
```

#### Cloud Storage (rsync)
```bash
# After creating backup, sync to cloud
./scripts/backup.sh
rsync -avz ./data/backups/ user@cloud-server:/backups/kura-notes/
```

#### Cloud Storage (rclone)
```bash
# Install rclone and configure remote
rclone config

# After creating backup, sync to cloud
./scripts/backup.sh
rclone sync ./data/backups/ remote:kura-notes-backups
```

### Backup Size Estimates

Typical backup sizes (compressed):

| Content      | Files | Size (Uncompressed) | Size (Compressed) | Ratio |
|--------------|-------|---------------------|-------------------|-------|
| Database     | 1     | 5 MB                | 1-2 MB            | 20-40% |
| Text Files   | 100   | 10 MB               | 2-3 MB            | 20-30% |
| Images       | 50    | 50 MB               | 40-45 MB          | 80-90% |
| PDFs         | 20    | 30 MB               | 25-28 MB          | 83-93% |
| ChromaDB     | -     | 10 MB               | 3-5 MB            | 30-50% |

**Note**: Images and PDFs are already compressed, so they don't compress much further. Text and database files compress very well.

---

## Best Practices

### 1. Regular Backups

✅ **Do**: Set up automated daily backups
```bash
./scripts/setup-backup-cron.sh
```

✅ **Do**: Verify backups are running
```bash
# Check cron is set up
crontab -l | grep "KURA Notes"

# Check recent backup logs
ls -lh data/logs/backup-cron-*.log
```

❌ **Don't**: Rely only on manual backups (easy to forget!)

### 2. Test Your Backups

✅ **Do**: Test restore process regularly (at least monthly)
```bash
# Test restore in a test environment
./scripts/restore.sh --list
./scripts/restore.sh backup-latest.tar.gz
```

✅ **Do**: Verify backup contents
```bash
# List contents of backup
tar -tzf data/backups/backup-2025-11-18-120000.tar.gz | head -20
```

❌ **Don't**: Assume backups work without testing!

### 3. Off-Site Storage

✅ **Do**: Store backups in a different location than your data
```bash
# Copy to external drive
cp data/backups/*.tar.gz /mnt/external-drive/kura-backups/

# Or sync to cloud
rclone sync ./data/backups/ remote:kura-backups
```

✅ **Do**: Use the 3-2-1 rule:
- **3** copies of your data
- **2** different storage types
- **1** off-site copy

❌ **Don't**: Store backups only on the same disk as your data!

### 4. Retention Strategy

✅ **Do**: Use a tiered retention strategy:
- Daily backups: Keep 7 days
- Weekly backups: Keep 4 weeks
- Monthly backups: Keep 12 months

Example setup:
```bash
# Daily backups (keep 7 days) - automated
./scripts/setup-backup-cron.sh -t 02:00 -r 7

# Weekly backups (manual, keep elsewhere)
# Run every Sunday, copy to long-term storage

# Monthly backups (manual, archive)
# Run on 1st of month, copy to archive storage
```

❌ **Don't**: Keep all daily backups forever (storage waste!)

### 5. Monitor Backup Health

✅ **Do**: Check backup logs regularly
```bash
# Check last backup
tail -50 data/logs/backup-cron-$(date +%Y-%m-%d).log
```

✅ **Do**: Monitor backup size trends
```bash
# List backups with sizes
ls -lh data/backups/backup-*.tar.gz
```

✅ **Do**: Set up alerts for failed backups
```bash
# Email notifications
./scripts/setup-backup-cron.sh --email admin@example.com
```

❌ **Don't**: Set up backups and never check them!

### 6. Secure Your Backups

✅ **Do**: Restrict backup file permissions
```bash
chmod 600 data/backups/*.tar.gz
```

✅ **Do**: Encrypt backups if storing in cloud
```bash
# Encrypt backup before uploading
gpg --encrypt --recipient your@email.com backup-2025-11-18-120000.tar.gz
```

❌ **Don't**: Leave backups world-readable!

---

## Disaster Recovery

### Scenario 1: Accidental Deletion

**Problem**: You accidentally deleted some content.

**Solution**:
1. Identify what was deleted
2. Find the most recent backup that contains the data
3. Restore from that backup

```bash
# List recent backups
./scripts/restore.sh --list

# Restore from yesterday's backup
./scripts/restore.sh backup-2025-11-17-020000.tar.gz
```

### Scenario 2: Database Corruption

**Problem**: Database is corrupted and won't open.

**Solution**:
1. Stop the application
2. Restore from the most recent backup
3. Verify data integrity
4. Restart the application

```bash
# Stop services
docker compose down

# Restore from backup
./scripts/restore.sh --force backup-2025-11-18-120000.tar.gz

# Services will be restarted automatically
```

### Scenario 3: Disk Failure

**Problem**: Server disk failed, all data lost.

**Solution**:
1. Set up new server
2. Install KURA Notes
3. Copy backups from off-site storage
4. Restore from latest backup

```bash
# On new server
git clone <repo>
cd kura-notes

# Copy backups from off-site storage
scp backup-server:/backups/*.tar.gz ./data/backups/

# Restore latest backup
./scripts/restore.sh backup-2025-11-18-120000.tar.gz

# Start services
docker compose up -d
```

### Scenario 4: Ransomware/Malware

**Problem**: Server infected with ransomware, files encrypted.

**Solution**:
1. Disconnect from network immediately
2. Wipe and reinstall OS
3. Restore from clean off-site backup (before infection)
4. Update and secure system

```bash
# After clean OS install
# Install KURA Notes and dependencies

# Copy CLEAN backup (from before infection)
scp backup-server:/backups/backup-2025-11-15-020000.tar.gz ./data/backups/

# Restore
./scripts/restore.sh backup-2025-11-15-020000.tar.gz

# Update and secure
sudo apt update && sudo apt upgrade -y
# Configure firewall, change passwords, etc.
```

### Scenario 5: Moving to New Server

**Problem**: Need to migrate to a new server.

**Solution**:
1. Create fresh backup on old server
2. Copy backup to new server
3. Restore on new server

```bash
# On old server
./scripts/backup.sh
scp data/backups/backup-2025-11-18-140000.tar.gz new-server:/tmp/

# On new server
cd /path/to/kura-notes
mv /tmp/backup-2025-11-18-140000.tar.gz ./data/backups/
./scripts/restore.sh backup-2025-11-18-140000.tar.gz
```

### Recovery Time Objectives (RTO)

Expected recovery times:

| Scenario | RTO | Notes |
|----------|-----|-------|
| Accidental deletion | 5-10 min | Simple restore |
| Database corruption | 10-15 min | Includes verification |
| Disk failure | 30-60 min | Includes server setup |
| Server migration | 30-60 min | Includes transfer time |
| Complete disaster | 2-4 hours | Includes OS reinstall |

---

## Troubleshooting

### Backup Issues

#### Problem: "Docker is not running"

**Cause**: Docker daemon is not running, can't backup ChromaDB.

**Solution**:
```bash
# Start Docker
sudo systemctl start docker

# Run backup again
./scripts/backup.sh
```

**Note**: The backup will continue without ChromaDB data if Docker is not running. This is by design to allow backups even when services are down.

#### Problem: "Disk space full"

**Cause**: Not enough disk space for backup.

**Solution**:
```bash
# Check disk space
df -h

# Clean old backups manually
rm data/backups/backup-2025-10-*.tar.gz

# Or reduce retention period
./scripts/backup.sh --retention 3
```

#### Problem: "Permission denied"

**Cause**: No write permission to backup directory.

**Solution**:
```bash
# Fix permissions
sudo chown -R $USER:$USER data/backups
chmod 755 data/backups
```

### Restore Issues

#### Problem: "Backup file is corrupted"

**Cause**: Backup archive is damaged.

**Solution**:
```bash
# Test backup integrity
tar -tzf backup-2025-11-18-120000.tar.gz

# If corrupted, use a different backup
./scripts/restore.sh --list
./scripts/restore.sh backup-2025-11-17-020000.tar.gz
```

#### Problem: "Database integrity check failed"

**Cause**: Restored database is corrupted.

**Solution**:
```bash
# Try a different backup
./scripts/restore.sh backup-2025-11-17-020000.tar.gz

# Or try to repair database
sqlite3 data/metadata/knowledge.db ".recover" | sqlite3 repaired.db
```

#### Problem: "ChromaDB restore failed"

**Cause**: Docker is not running or volume permissions.

**Solution**:
```bash
# Ensure Docker is running
sudo systemctl start docker

# Remove old volume
docker volume rm kura-notes_chroma-data

# Run restore again
./scripts/restore.sh backup-2025-11-18-120000.tar.gz
```

### Cron Issues

#### Problem: "Cron job not running"

**Cause**: Cron service not running or job not set up correctly.

**Solution**:
```bash
# Check cron service
sudo systemctl status cron

# View crontab
crontab -l

# Reinstall cron job
./scripts/setup-backup-cron.sh
```

#### Problem: "Email notifications not working"

**Cause**: Mail utility not installed or configured.

**Solution**:
```bash
# Install mailutils
sudo apt-get install mailutils

# Test email
echo "Test" | mail -s "Test" your@email.com

# Reconfigure cron with email
./scripts/setup-backup-cron.sh --email your@email.com
```

---

## Summary

### Essential Commands

```bash
# Create manual backup
./scripts/backup.sh

# List backups
./scripts/restore.sh --list

# Restore from backup
./scripts/restore.sh backup-YYYY-MM-DD-HHMMSS.tar.gz

# Set up automated backups
./scripts/setup-backup-cron.sh

# Remove automated backups
./scripts/setup-backup-cron.sh --uninstall
```

### Quick Reference

| Task | Command |
|------|---------|
| Manual backup | `./scripts/backup.sh` |
| Backup with 30-day retention | `./scripts/backup.sh -r 30` |
| Backup to external drive | `./scripts/backup.sh -d /mnt/backups` |
| List backups | `./scripts/restore.sh --list` |
| Restore (with confirmation) | `./scripts/restore.sh backup.tar.gz` |
| Restore (no confirmation) | `./scripts/restore.sh -f backup.tar.gz` |
| Daily backup at 2 AM | `./scripts/setup-backup-cron.sh` |
| Daily backup at 3:30 AM | `./scripts/setup-backup-cron.sh -t 03:30` |
| Remove automated backups | `./scripts/setup-backup-cron.sh -u` |
| View cron jobs | `crontab -l` |
| View backup logs | `cat data/logs/backup-cron-*.log` |

### Remember

1. ✅ **Set up automated backups** - Don't rely on manual backups
2. ✅ **Test your backups** - Verify they can be restored
3. ✅ **Store off-site** - Don't keep backups only on the same server
4. ✅ **Monitor regularly** - Check logs and backup health
5. ✅ **Follow 3-2-1 rule** - 3 copies, 2 storage types, 1 off-site

---

For more information, see:
- [Deployment Guide](deployment.md)
- [Setup Guide](setup.md)
- [Troubleshooting Guide](../README.md#troubleshooting)
