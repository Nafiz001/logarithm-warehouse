# 🗄️ Backup Strategy: WAL-Based Point-in-Time Recovery

## Overview

This backup system provides **multiple restore points per day** while respecting the constraint of **only ONE backup API call per day**.

### How It Works

1. **Continuous WAL Archiving**: PostgreSQL's Write-Ahead Log (WAL) captures every database change. We archive these locally (no API call needed).

2. **Daily Base Backup**: Once per day, we take a full backup using `pg_basebackup` and upload it via the single allowed API call.

3. **Point-in-Time Recovery**: To restore, we combine the daily base backup with WAL files to reach any specific moment.

## Architecture

```
PostgreSQL → WAL Files → Local Archive (continuous)
     ↓
Base Backup → Compress → Upload (once/day)

Recovery = Base Backup + WAL replay → Any point in time
```

## Components

| File | Purpose |
|------|---------|
| `wal-archive.sh` | Archives WAL segments (called by PostgreSQL) |
| `daily-backup.sh` | Takes base backup + uploads (cron: 3 AM) |
| `hourly-bundle.sh` | Bundles WAL files into restore points |
| `restore.sh` | Restores to a specific point in time |
| `docker-compose.backup.yml` | Backup-enabled PostgreSQL config |

## Storage Layout

```
/backup/
├── base/                    # Daily base backups
│   ├── order-db/
│   │   └── 2026-01-29/
│   └── inventory-db/
│       └── 2026-01-29/
├── wal/                     # Continuous WAL archives
│   ├── order-db/
│   └── inventory-db/
├── bundles/                 # Hourly WAL bundles (restore points)
│   ├── order-db/
│   │   └── 2026-01-29-14.tar.gz
│   └── inventory-db/
└── manifests/               # Recovery metadata
    └── restore-points.json
```

## Usage

### Start with backup enabled
```bash
docker-compose -f docker-compose.yml -f infra/backup/docker-compose.backup.yml up -d
```

### Manual backup
```bash
./infra/backup/scripts/daily-backup.sh
```

### Restore to point in time
```bash
./infra/backup/scripts/restore.sh order-db "2026-01-29 14:30:00"
```

## Constraint Compliance

| Action | Frequency | Uses Backup API? |
|--------|-----------|------------------|
| WAL archiving | Continuous | ❌ No (internal) |
| Hourly bundling | Every hour | ❌ No (local) |
| Daily base backup | Once/day | ✅ Yes (1 call) |

**Total API calls per day: 1** ✓
