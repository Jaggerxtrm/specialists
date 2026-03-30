# SSOT Metadata Schema

This reference defines the required and optional YAML frontmatter fields for Serena memories.

## Schema Overview

Every markdown file in the memories directory **MUST** start with a YAML frontmatter block enclosed in `---`.

```yaml
---
title: Human Readable Title
version: 1.0.0
updated: 2026-01-20T10:00:00Z
scope: identifier-slug
category: ssot
subcategory: component
domain: [tag1, tag2]
---
```

## Field Definitions

### Required Fields (All Categories)

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `title` | string | Clear, descriptive title of the document | "Analytics Volatility SSOT" |
| `scope` | string | Unique slug identifying the document's scope | "analytics-volatility" |
| `category` | enum | One of the standard categories | "ssot" |

### Category-Specific Requirements

#### SSOT (`ssot_`)
| Field | Type | Requirement | Description |
|-------|------|-------------|-------------|
| `version` | semver | **Required** | Semantic version (x.y.z) |
| `updated` | timestamp | **Required** | ISO8601 timestamp of last update |
| `subcategory` | string | **Required** | Specific component name |
| `domain` | array | **Required** | List of relevant domain tags |
| `changelog` | array | **Required** | List of version history entries |
| `tracks` | array | Optional | Glob patterns (fnmatch) for files this memory documents. Used by drift_detector.py to detect documentation drift. |

#### Pattern (`pattern_`)
| Field | Type | Requirement | Description |
|-------|------|-------------|-------------|
| `version` | semver | **Required** | Pattern version |
| `updated` | timestamp | **Required** | ISO8601 timestamp |
| `domain` | array | **Required** | Tags for applicability |
| `tracks` | array | Optional | Glob patterns for files this memory documents. Used by drift_detector.py. |

#### Plan (`plan_`)
| Field | Type | Requirement | Description |
|-------|------|-------------|-------------|
| `status` | enum | **Required** | draft, in-progress, completed, abandoned |
| `plan_ref` | string | Optional | ID of related ticket/issue |
| `tracks` | array | Optional | Glob patterns for files this memory documents. Used by drift_detector.py. |

#### Reference (`reference_`)

No required category-specific fields beyond the common required fields. The `tracks` field is also available as an optional field (glob patterns for files this memory documents, used by drift_detector.py).

#### Archive (`archive_`)
| Field | Type | Requirement | Description |
|-------|------|-------------|-------------|
| `archived_date` | date | **Required** | When it was archived (YYYY-MM-DD) |
| `replacement` | string | Optional | Link to replacement SSOT |

## Valid Values

### Categories
- `ssot`
- `pattern`
- `plan`
- `reference`
- `archive`
- `troubleshoot`

### Status (for Plans)
- `draft`
- `review`
- `approved`
- `in-progress`
- `completed`
- `on-hold`
- `cancelled`

## Example Frontmatter

### Complete SSOT Example
```yaml
---
title: Volatility Surface Analytics SSOT
version: 2.1.0
updated: 2026-01-14T15:30:00+00:00
scope: analytics-volatility
category: ssot
subcategory: volatility
domain: [analytics, math, options]
applicability: core-pricing-engine
tracks:
  - "src/analytics/**/*.py"
  - "src/analytics/config.yaml"
changelog:
  - 2.1.0 (2026-01-14): Added SABR model details.
  - 2.0.0 (2025-12-20): Major refactor of surface construction.
  - 1.0.0 (2025-11-01): Initial baseline.
---
```

### Plan Example
```yaml
---
title: Migration to FastAPI
version: 0.5.0
updated: 2025-12-28T10:00:00Z
scope: infra-api-migration
category: plan
subcategory: api
status: in-progress
domain: [infra, backend]
---
```

### Archive Example
```yaml
---
title: Legacy Flask API Documentation
version: 1.2.0
updated: 2025-10-15T00:00:00Z
scope: legacy-api
category: archive
subcategory: api
archived_date: 2025-12-28
replacement: ssot_infra_api_architecture_2025-12-28.md
---
```
