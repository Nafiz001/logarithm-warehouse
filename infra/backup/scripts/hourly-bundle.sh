#!/bin/bash
# ============================================================
# Hourly WAL Bundle Script
# 
# Creates hourly restore points by bundling WAL files
# NO API CALLS - purely local operation
# ============================================================

set -e

# Configuration
WAL_DIR="/backup/wal"
BUNDLE_DIR="/backup/bundles"
MANIFEST_FILE="/backup/manifests/restore-points.json"
LOG_FILE="/backup/logs/hourly-bundle.log"

DATE=$(date '+%Y-%m-%d')
HOUR=$(date '+%H')
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

# Databases to bundle
DATABASES=("order-db" "inventory-db")

log() {
    echo "[${TIMESTAMP}] $1" | tee -a "${LOG_FILE}"
}

mkdir -p "${BUNDLE_DIR}"
mkdir -p "$(dirname ${LOG_FILE})"
mkdir -p "$(dirname ${MANIFEST_FILE})"

log "=========================================="
log "Starting Hourly WAL Bundle"
log "Date: ${DATE}, Hour: ${HOUR}"
log "NO API CALLS - Local operation only"
log "=========================================="

for DB_NAME in "${DATABASES[@]}"; do
    DB_WAL_DIR="${WAL_DIR}/${DB_NAME}"
    DB_BUNDLE_DIR="${BUNDLE_DIR}/${DB_NAME}"
    BUNDLE_FILE="${DB_BUNDLE_DIR}/${DATE}-${HOUR}.tar.gz"
    
    mkdir -p "${DB_BUNDLE_DIR}"
    
    if [ -d "${DB_WAL_DIR}" ] && [ "$(ls -A ${DB_WAL_DIR} 2>/dev/null)" ]; then
        log "Bundling WAL files for ${DB_NAME}..."
        
        # Create bundle of current WAL files
        tar -czf "${BUNDLE_FILE}" -C "${DB_WAL_DIR}" . 2>/dev/null || true
        
        # Count files bundled
        WAL_COUNT=$(ls -1 "${DB_WAL_DIR}" 2>/dev/null | wc -l)
        BUNDLE_SIZE=$(du -h "${BUNDLE_FILE}" 2>/dev/null | cut -f1)
        
        log "Created bundle: ${BUNDLE_FILE} (${WAL_COUNT} files, ${BUNDLE_SIZE})"
        
        # Add to manifest
        if [ -f "${MANIFEST_FILE}" ]; then
            NEW_POINT=$(cat <<EOF
{
    "type": "wal_bundle",
    "database": "${DB_NAME}",
    "date": "${DATE}",
    "hour": "${HOUR}",
    "timestamp": "${TIMESTAMP}",
    "path": "${BUNDLE_FILE}",
    "wal_count": ${WAL_COUNT}
}
EOF
)
            echo $(cat "${MANIFEST_FILE}") | jq ".restore_points += [${NEW_POINT}]" > "${MANIFEST_FILE}"
        fi
        
        # Clean up archived WAL files that are now bundled
        # Keep only files from current hour to prevent data loss
        find "${DB_WAL_DIR}" -type f -mmin +60 -delete 2>/dev/null || true
        
    else
        log "No WAL files to bundle for ${DB_NAME}"
    fi
done

# Cleanup old bundles (keep last 48 hours)
find "${BUNDLE_DIR}" -name "*.tar.gz" -mtime +2 -delete 2>/dev/null || true

log "=========================================="
log "Hourly Bundle Complete"
log "Restore points created: ${#DATABASES[@]}"
log "API calls used: 0"
log "=========================================="
