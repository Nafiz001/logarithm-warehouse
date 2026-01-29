#!/bin/bash
# ============================================================
# Daily Base Backup Script
# 
# THIS IS THE ONLY SCRIPT THAT USES THE BACKUP API
# It runs ONCE PER DAY at 3:00 AM
# ============================================================

set -e

# Configuration
BACKUP_BASE_DIR="/backup/base"
DATE=$(date '+%Y-%m-%d')
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
LOG_FILE="/backup/logs/daily-backup.log"
MANIFEST_FILE="/backup/manifests/restore-points.json"

# Database configurations
declare -A DATABASES=(
    ["order-db"]="postgres://orderuser:orderpass@order-db:5432/orders"
    ["inventory-db"]="postgres://inventoryuser:inventorypass@inventory-db:5432/inventory"
)

# Legacy backup API endpoint (simulated)
BACKUP_API_URL="${BACKUP_API_URL:-http://localhost:9999/backup}"
BACKUP_API_CALLED=false

log() {
    echo "[${TIMESTAMP}] $1" | tee -a "${LOG_FILE}"
}

# Ensure directories exist
mkdir -p "${BACKUP_BASE_DIR}"
mkdir -p "$(dirname ${LOG_FILE})"
mkdir -p "$(dirname ${MANIFEST_FILE})"

log "=========================================="
log "Starting Daily Backup Process"
log "=========================================="

# Create combined backup tarball
COMBINED_BACKUP="/tmp/daily-backup-${DATE}.tar.gz"

for DB_NAME in "${!DATABASES[@]}"; do
    DB_URL="${DATABASES[$DB_NAME]}"
    BACKUP_DIR="${BACKUP_BASE_DIR}/${DB_NAME}/${DATE}"
    
    log "Backing up ${DB_NAME}..."
    mkdir -p "${BACKUP_DIR}"
    
    # Extract connection details
    DB_HOST=$(echo "$DB_URL" | sed -n 's/.*@\([^:]*\):.*/\1/p')
    DB_PORT=$(echo "$DB_URL" | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
    DB_USER=$(echo "$DB_URL" | sed -n 's/.*:\/\/\([^:]*\):.*/\1/p')
    DB_PASS=$(echo "$DB_URL" | sed -n 's/.*:\/\/[^:]*:\([^@]*\)@.*/\1/p')
    DB_DATABASE=$(echo "$DB_URL" | sed -n 's/.*\/\([^/]*\)$/\1/p')
    
    # Take base backup using pg_basebackup
    export PGPASSWORD="${DB_PASS}"
    
    pg_basebackup \
        -h "${DB_HOST}" \
        -p "${DB_PORT}" \
        -U "${DB_USER}" \
        -D "${BACKUP_DIR}" \
        -Ft \
        -z \
        -Xs \
        -P \
        2>&1 | tee -a "${LOG_FILE}"
    
    log "Base backup completed for ${DB_NAME}"
    
    # Record the current WAL position
    WAL_POSITION=$(psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_DATABASE}" -tAc "SELECT pg_current_wal_lsn();" 2>/dev/null || echo "unknown")
    
    # Update manifest
    if [ -f "${MANIFEST_FILE}" ]; then
        MANIFEST=$(cat "${MANIFEST_FILE}")
    else
        MANIFEST='{"restore_points":[]}'
    fi
    
    # Add restore point to manifest
    NEW_POINT=$(cat <<EOF
{
    "type": "base_backup",
    "database": "${DB_NAME}",
    "date": "${DATE}",
    "timestamp": "${TIMESTAMP}",
    "path": "${BACKUP_DIR}",
    "wal_position": "${WAL_POSITION}"
}
EOF
)
    
    echo "${MANIFEST}" | jq ".restore_points += [${NEW_POINT}]" > "${MANIFEST_FILE}"
    
done

log "Creating combined backup archive..."
tar -czf "${COMBINED_BACKUP}" -C "${BACKUP_BASE_DIR}" .

# ============================================================
# THIS IS THE SINGLE DAILY API CALL
# ============================================================
log "=========================================="
log "UPLOADING TO LEGACY BACKUP SERVICE"
log "THIS IS THE ONE ALLOWED API CALL PER DAY"
log "=========================================="

# Simulate the backup API call
# In production, this would be: curl -X POST -F "file=@${COMBINED_BACKUP}" "${BACKUP_API_URL}"

if [ -n "${BACKUP_API_URL}" ] && [ "${BACKUP_API_URL}" != "http://localhost:9999/backup" ]; then
    # Real API call
    curl -X POST \
        -H "Content-Type: multipart/form-data" \
        -F "backup=@${COMBINED_BACKUP}" \
        -F "date=${DATE}" \
        -F "type=daily_full" \
        "${BACKUP_API_URL}" \
        2>&1 | tee -a "${LOG_FILE}"
    
    BACKUP_API_CALLED=true
else
    # Simulated - copy to "remote" location
    REMOTE_BACKUP_DIR="/backup/remote"
    mkdir -p "${REMOTE_BACKUP_DIR}"
    cp "${COMBINED_BACKUP}" "${REMOTE_BACKUP_DIR}/"
    log "SIMULATED: Backup uploaded to ${REMOTE_BACKUP_DIR}/daily-backup-${DATE}.tar.gz"
    BACKUP_API_CALLED=true
fi

# Cleanup temp file
rm -f "${COMBINED_BACKUP}"

# Record API call in manifest
echo $(cat "${MANIFEST_FILE}") | jq ".last_api_call = \"${TIMESTAMP}\"" > "${MANIFEST_FILE}"

log "=========================================="
log "Daily Backup Complete"
log "API calls used today: 1 of 1"
log "Next restore point: via WAL archiving (no API needed)"
log "=========================================="

# Cleanup old backups (keep last 7 days)
find "${BACKUP_BASE_DIR}" -type d -mtime +7 -exec rm -rf {} + 2>/dev/null || true

log "Cleanup complete. Backup process finished."
