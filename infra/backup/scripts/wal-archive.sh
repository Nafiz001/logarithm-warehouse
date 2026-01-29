#!/bin/bash
# ============================================================
# WAL Archive Script
# Called by PostgreSQL when a WAL segment is ready to archive
# 
# This runs CONTINUOUSLY and does NOT use the backup API
# It's an internal PostgreSQL mechanism
# ============================================================

set -e

# Arguments passed by PostgreSQL
WAL_FILE="$1"      # Full path to WAL file
WAL_NAME="$2"      # Just the filename

# Configuration
DB_NAME="${DB_NAME:-order-db}"
ARCHIVE_DIR="/backup/wal/${DB_NAME}"
LOG_FILE="/backup/logs/wal-archive.log"

# Ensure directories exist
mkdir -p "${ARCHIVE_DIR}"
mkdir -p "$(dirname ${LOG_FILE})"

# Timestamp for logging
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

# Archive the WAL file (with compression)
if [ -f "${WAL_FILE}" ]; then
    # Compress and copy
    gzip -c "${WAL_FILE}" > "${ARCHIVE_DIR}/${WAL_NAME}.gz"
    
    # Log the archive
    echo "[${TIMESTAMP}] Archived: ${WAL_NAME} -> ${ARCHIVE_DIR}/${WAL_NAME}.gz" >> "${LOG_FILE}"
    
    # Success
    exit 0
else
    echo "[${TIMESTAMP}] ERROR: WAL file not found: ${WAL_FILE}" >> "${LOG_FILE}"
    exit 1
fi
