# 🎯 Bonus Challenge Solution: One Backup Call Per Day

## For Judges - Quick Summary

> **Our solution uses PostgreSQL's Write-Ahead Log (WAL) to create unlimited restore points while respecting the one-API-call-per-day constraint. Every database change is captured locally in WAL files—this is an internal database mechanism, not an API call. Once per day, we take a full backup and upload it via the single allowed API call. To restore, we combine the daily backup with WAL files to reach ANY point in time. This gives us enterprise-grade Point-in-Time Recovery while fully complying with the backup service limitation.**

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         BACKUP ARCHITECTURE                                  │
│                                                                              │
│    ┌──────────────────────────────────────────────────────────────────┐     │
│    │                     PostgreSQL Databases                          │     │
│    │  ┌─────────────┐                    ┌─────────────┐              │     │
│    │  │  Order DB   │                    │ Inventory DB │              │     │
│    │  │  (orders)   │                    │ (inventory)  │              │     │
│    │  └──────┬──────┘                    └──────┬──────┘              │     │
│    └─────────┼──────────────────────────────────┼──────────────────────┘     │
│              │                                   │                           │
│              │  WAL ARCHIVE (continuous)         │                           │
│              │  Every transaction is logged      │                           │
│              │  NO API CALLS                     │                           │
│              ▼                                   ▼                           │
│    ┌─────────────────────────────────────────────────────────────────┐      │
│    │                    LOCAL BACKUP VOLUME                           │      │
│    │                                                                  │      │
│    │   /backup/                                                       │      │
│    │   ├── wal/                    ← Continuous WAL files            │      │
│    │   │   ├── order-db/              (every transaction)            │      │
│    │   │   └── inventory-db/                                         │      │
│    │   │                                                              │      │
│    │   ├── bundles/                ← Hourly WAL bundles              │      │
│    │   │   ├── order-db/              (compressed restore points)    │      │
│    │   │   │   ├── 2026-01-29-00.tar.gz                              │      │
│    │   │   │   ├── 2026-01-29-01.tar.gz                              │      │
│    │   │   │   └── ...                                               │      │
│    │   │   └── inventory-db/                                         │      │
│    │   │                                                              │      │
│    │   ├── base/                   ← Daily base backups              │      │
│    │   │   ├── order-db/              (full database snapshot)       │      │
│    │   │   │   └── 2026-01-29/                                       │      │
│    │   │   └── inventory-db/                                         │      │
│    │   │       └── 2026-01-29/                                       │      │
│    │   │                                                              │      │
│    │   └── remote/                 ← Simulated remote storage        │      │
│    │       └── daily-backup-2026-01-29.tar.gz                        │      │
│    │                                                                  │      │
│    └────────────────────────────────┬────────────────────────────────┘      │
│                                     │                                        │
│                                     │ DAILY UPLOAD (3:00 AM)                │
│                                     │ ═══════════════════════               │
│                                     │ THIS IS THE ONE API CALL              │
│                                     ▼                                        │
│    ┌─────────────────────────────────────────────────────────────────┐      │
│    │              LEGACY BACKUP SERVICE (External)                    │      │
│    │                                                                  │      │
│    │              Receives: compressed tarball of base backup         │      │
│    │              Frequency: Once per day                             │      │
│    │              Constraint: ✅ RESPECTED                            │      │
│    │                                                                  │      │
│    └─────────────────────────────────────────────────────────────────┘      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

RECOVERY FLOW:
═══════════════

  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
  │ Base Backup │ ──► │ WAL Replay  │ ──► │ Target Time │
  │ (Day Start) │     │ (Changes)   │     │ (Restored!) │
  └─────────────┘     └─────────────┘     └─────────────┘

  Example: Restore to 2026-01-29 14:30:00
  1. Load base backup from 2026-01-29 (03:00 AM)
  2. Replay WAL from bundles 00, 01, 02, ... 14
  3. Stop at 14:30:00 ──► Database restored!
```

---

## API Call Breakdown

| Operation | Frequency | Uses Backup API? | Purpose |
|-----------|-----------|------------------|---------|
| WAL Archive | Every transaction | ❌ NO | Capture all changes |
| WAL Bundle | Every hour | ❌ NO | Create restore points |
| Base Backup | Once per day | ✅ YES (1 call) | Full snapshot |
| Restore | On demand | ❌ NO | Recover data |

**Total API calls per day: 1** ✅

---

## Failure Scenarios & Recovery

### Scenario 1: Database Crash at 2:30 PM
```
Recovery Steps:
1. Get base backup from 3:00 AM (from remote or local)
2. Apply WAL bundles: 03, 04, 05, ... 14
3. Apply remaining WAL files from 14:00-14:30
4. Result: Data restored to 2:30 PM ✓
```

### Scenario 2: VM Crash (total disk loss)
```
Recovery Steps:
1. Download daily backup from legacy backup service
2. Start fresh PostgreSQL
3. Apply backup
4. Result: Data restored to 3:00 AM that day
   (Some data loss possible if VM crash after 3 AM)
```

### Scenario 3: Partial Corruption
```
Recovery Steps:
1. Identify corruption time from logs
2. Restore to point just before corruption
3. Use restore.sh with specific timestamp
4. Result: Clean database, corruption undone ✓
```

---

## Trade-offs Analysis

| Aspect | This Solution | Alternative (Multiple API Calls) |
|--------|---------------|----------------------------------|
| **Constraint Compliance** | ✅ 1 call/day | ❌ Would violate |
| **Restore Granularity** | Any second | Fixed points only |
| **Storage Cost** | Medium (WAL files) | Higher (full backups) |
| **Recovery Speed** | Moderate (replay WAL) | Fast (direct restore) |
| **Complexity** | Moderate | Low |
| **Data Loss Window** | Up to 24 hours (worst case) | Depends on frequency |

---

## Why This Works for a Hackathon

1. **Real Engineering**: This is exactly how production PostgreSQL backups work (pgBackRest, Barman, etc.)

2. **Constraint-Driven**: We found a creative solution within the rules, not around them

3. **Demonstrable**: Can show real WAL files, bundles, and restore process

4. **Explainable**: Clear separation between "internal" (WAL) and "external" (API) operations

5. **Practical**: Could actually deploy this on the Azure VM

---

## Quick Demo Commands

```bash
# Check backup status
docker exec backup-scheduler /scripts/status.sh

# Trigger manual backup (uses the 1 daily API call)
docker exec backup-scheduler /scripts/daily-backup.sh

# Create hourly restore point (no API call)
docker exec backup-scheduler /scripts/hourly-bundle.sh

# Restore to specific time
docker exec backup-scheduler /scripts/restore.sh order-db "2026-01-29 14:30:00"
```
