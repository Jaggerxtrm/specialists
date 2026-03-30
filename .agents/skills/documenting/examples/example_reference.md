---
title: Database Query Patterns Reference
scope: reference-db-queries
category: reference
subcategory: database
domain: [data, sql, performance]
---

## Purpose
Reference guide for standard SQL query patterns used in the Mercury project to ensure performance and maintainability.

## Naming Conventions

| Object Type | Convention | Example |
|-------------|------------|---------|
| Table | `snake_case`, plural | `market_orders` |
| Column | `snake_case` | `created_at` |
| Primary Key | `id` | `id` |
| Foreign Key | `[table_singular]_id` | `user_id` |
| Index | `idx_[table]_[columns]` | `idx_orders_user_id` |

## Standard Queries

### Time-Series Selection
Efficiently selecting time-series data using the timescaleDB hypertables.

```sql
-- GOOD: Uses partition key (time)
SELECT * FROM ticks
WHERE symbol = 'ES'
  AND time >= NOW() - INTERVAL '1 hour'
ORDER BY time DESC;

-- BAD: Missing time constraint (scans all partitions)
SELECT * FROM ticks
WHERE symbol = 'ES'
ORDER BY time DESC;
```

### Pagination
Keyset pagination is preferred over OFFSET/LIMIT for large datasets.

```sql
-- GOOD: Keyset pagination
SELECT * FROM orders
WHERE id < :last_seen_id
ORDER BY id DESC
LIMIT 50;

-- BAD: Offset pagination
SELECT * FROM orders
ORDER BY id DESC
LIMIT 50 OFFSET 10000;
```

### Upsert Pattern
Standard pattern for inserting or updating records.

```sql
INSERT INTO volatility_surfaces (expiry, strike, vol, updated_at)
VALUES (:expiry, :strike, :vol, NOW())
ON CONFLICT (expiry, strike)
DO UPDATE SET
    vol = EXCLUDED.vol,
    updated_at = NOW();
```

## Additional Resources
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [TimescaleDB Best Practices](https://docs.timescale.com/)
