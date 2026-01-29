#!/bin/bash
# ============================================================
# Show Current Backup Status
# Displays available restore points and backup health
# ============================================================

set -e

BACKUP_BASE_DIR="/backup/base"
WAL_DIR="/backup/wal"
BUNDLE_DIR="/backup/bundles"
MANIFEST_FILE="/backup/manifests/restore-points.json"
REMOTE_DIR="/backup/remote"

echo "=========================================="
echo "📦 BACKUP STATUS REPORT"
echo "=========================================="
echo ""

# Last API call
if [ -f "${MANIFEST_FILE}" ]; then
    LAST_API=$(cat "${MANIFEST_FILE}" | jq -r '.last_api_call // "Never"')
    echo "🔄 Last Backup API Call: ${LAST_API}"
else
    echo "🔄 Last Backup API Call: Never"
fi
echo ""

# Base backups
echo "📁 BASE BACKUPS (Daily - uses 1 API call):"
echo "-------------------------------------------"
for DB_DIR in "${BACKUP_BASE_DIR}"/*; do
    if [ -d "${DB_DIR}" ]; then
        DB_NAME=$(basename "${DB_DIR}")
        echo "  ${DB_NAME}:"
        for BACKUP in "${DB_DIR}"/*; do
            if [ -d "${BACKUP}" ]; then
                BACKUP_DATE=$(basename "${BACKUP}")
                SIZE=$(du -sh "${BACKUP}" 2>/dev/null | cut -f1)
                echo "    ✅ ${BACKUP_DATE} (${SIZE})"
            fi
        done
    fi
done
echo ""

# WAL bundles
echo "📦 WAL BUNDLES (Hourly - no API calls):"
echo "-------------------------------------------"
for DB_DIR in "${BUNDLE_DIR}"/*; do
    if [ -d "${DB_DIR}" ]; then
        DB_NAME=$(basename "${DB_DIR}")
        BUNDLE_COUNT=$(ls -1 "${DB_DIR}"/*.tar.gz 2>/dev/null | wc -l)
        LATEST=$(ls -t "${DB_DIR}"/*.tar.gz 2>/dev/null | head -1 | xargs basename 2>/dev/null || echo "none")
        echo "  ${DB_NAME}: ${BUNDLE_COUNT} bundles (latest: ${LATEST})"
    fi
done
echo ""

# Current WAL files
echo "📝 CURRENT WAL FILES (Continuous - no API calls):"
echo "-------------------------------------------"
for DB_DIR in "${WAL_DIR}"/*; do
    if [ -d "${DB_DIR}" ]; then
        DB_NAME=$(basename "${DB_DIR}")
        WAL_COUNT=$(ls -1 "${DB_DIR}" 2>/dev/null | wc -l)
        WAL_SIZE=$(du -sh "${DB_DIR}" 2>/dev/null | cut -f1)
        echo "  ${DB_NAME}: ${WAL_COUNT} files (${WAL_SIZE})"
    fi
done
echo ""

# Remote backups
echo "☁️  REMOTE BACKUPS (Uploaded via API):"
echo "-------------------------------------------"
if [ -d "${REMOTE_DIR}" ]; then
    for BACKUP in "${REMOTE_DIR}"/*.tar.gz; do
        if [ -f "${BACKUP}" ]; then
            BACKUP_NAME=$(basename "${BACKUP}")
            SIZE=$(du -h "${BACKUP}" | cut -f1)
            echo "  ✅ ${BACKUP_NAME} (${SIZE})"
        fi
    done
else
    echo "  No remote backups yet"
fi
echo ""

# Summary
echo "=========================================="
echo "📊 SUMMARY"
echo "=========================================="
echo "Strategy: Daily Base Backup + Continuous WAL Archiving"
echo "API Calls Today: 1 of 1 allowed"
echo "Restore Granularity: Any point in time"
echo ""
echo "To restore: ./restore.sh <database> \"YYYY-MM-DD HH:MM:SS\""
echo "=========================================="
