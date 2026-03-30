# Service Skill System: Architecture & Operations Guide

> Distilled from real-world Docker microservices projects.
> This guide is project-agnostic — adapt all examples to your stack.

---

## Table of Contents

- [1. System Overview](#1-system-overview)
- [2. System Architecture](#2-system-architecture)
- [3. Mandatory Two-Phase Workflow](#3-mandatory-two-phase-workflow)
- [4. Service Type Classification](#4-service-type-classification)
- [5. Directory Structure](#5-directory-structure)
- [6. Skill Lifecycle](#6-skill-lifecycle)
- [7. Quality Gates](#7-quality-gates)
- [8. Best Practices](#8-best-practices)
- [9. Anti-Patterns](#9-anti-patterns)

---

## 1. System Overview

The **Service Skill System** transforms an AI agent from a generic assistant into a service-aware operator. Each Docker service in your project gets a dedicated **skill package**: a structured combination of operational documentation and executable diagnostic scripts.

### What a Skill Provides

| Layer | Contents | Purpose |
|-------|----------|---------|
| `SKILL.md` | Operational manual | How the service works, how to debug it |
| `scripts/health_probe.py` | Container + data freshness checks | Is the service healthy right now? |
| `scripts/log_hunter.py` | Pattern-based log analysis | What is the service logging and why? |
| `scripts/<specialist>.py` | Service-specific inspector | What state does this service hold? |

Without scripts, a skill is documentation only. Without documentation, scripts have no context. Both are required.

---

## 2. System Architecture

### Three Components

**A. The Builder (`service-skill-builder`)**
The meta-skill that generates other skills.
- **Input**: `docker-compose*.yml`, Dockerfiles, entry-point source code
- **Engine**: `scripts/main.py` (Phase 1 skeleton generator)
- **Output**: `SKILL.md`, `REFINEMENT_BRIEF.md`, stub scripts → then replaced in Phase 2

**B. The Health Checker (`scripts/skill_health_check.py`)**
Detects drift between skills and the live codebase.
- Compares service modification timestamps vs. skill generation timestamps
- Identifies services with no skill (coverage gaps)
- Reports stale skills needing a re-dive

**C. The Generated Skills**
Individual packages per service (e.g., `.claude/skills/my-service/`).

---

## 3. Mandatory Two-Phase Workflow

**Phase 1 and Phase 2 are both required. The skeleton alone is never sufficient.**

### Phase 1: Automated Skeleton

Run the generator against your project root:

```bash
# Discover all Docker services
python3 .claude/skills/service-skill-builder/scripts/main.py --scan

# Generate skeleton for one service
python3 .claude/skills/service-skill-builder/scripts/main.py <service-name>
```

The skeleton provides:
- Structural facts: port mappings, env var names, image names, volumes
- `REFINEMENT_BRIEF.md` listing every open question
- Generic stub scripts (placeholder only — **must be replaced**)

**The skeleton cannot tell you:**
- What the service actually writes to the database (column names, stale thresholds)
- What real error messages look like in the logs
- What "healthy" vs. "degraded" vs. "failed" looks like
- What exact commands fix common failures

### Phase 2: Agentic Deep Dive

Read the source code. Answer every question in `REFINEMENT_BRIEF.md` using `Grep`, `Glob`, `Read`, and Serena LSP tools. Do not guess. Do not leave placeholders.

**Mandatory investigation areas:**

#### Container & Runtime
- What is the exact entry point? (Dockerfile CMD + docker-compose `command:`)
- Is this a long-running daemon, a cron job, or a one-shot? → determines health strategy
- Which env vars cause a crash if missing? Which are optional?
- What volumes does it read from? Write to?
- What is the restart policy and why?

#### Data Layer
- Which tables does it write? Which does it only read?
- What is the timestamp column for each output table (`created_at`, `snapshot_ts`, `asof_ts`, etc.)?
- What is a realistic "stale" threshold in minutes per table? (Rule of thumb: update_interval × 3)
- Does it use Redis, S3, local files, or other external state?
- Are queries parameterized? (Check `%s`, `%(name)s`, `?` patterns — never f-strings in SQL)

#### Failure Modes
Build this table with ≥5 rows from code comments, exception handlers, and READMEs:

| Symptom | Likely Cause | Resolution |
|---------|-------------|------------|
| (what you see in logs or alerts) | (root cause) | (exact docker/shell command to fix) |

#### Log Patterns
Search for `logger.error`, `logger.warning`, `raise`, `except`, and `panic!` in the source:
- What appears in logs during normal healthy operation? (→ `info` patterns)
- What appears during recoverable errors? (→ `warning` / `error` patterns)
- What appears during critical failures requiring restart? (→ `critical` patterns)
- For Rust services: what does a panic look like? (`thread '.*' panicked`)

---

## 4. Service Type Classification

Classify before writing scripts. The service type determines which scripts to write beyond the baseline `health_probe.py` and `log_hunter.py`.

| Service Type | Health Probe Strategy | Specialist Script |
|---|---|---|
| **Continuous DB writer** | Table freshness (age of most recent row per table) | `data_explorer.py` |
| **HTTP API server** | HTTP probe against real routes (not just port scan) | `endpoint_tester.py` |
| **One-shot / migration** | Container exit code + expected tables/schemas present | `coverage_checker.py` |
| **File watcher** | Mount path accessible + state file present + DB recency | `state_inspector.py` |
| **Email / API poller** | Container running + auth token file present | service-specific |
| **Scheduled backup** | Recent backup files in staging dir + daemon running | service-specific |
| **MCP stdio server** | Data source freshness in DB (no HTTP to probe) | service-specific |

---

## 5. Directory Structure

```
.claude/skills/
├── service-skill-builder/          # Meta-skill (system core)
│   ├── SKILL.md
│   ├── references/
│   │   ├── service_skill_system_guide.md   # This file
│   │   └── script_quality_standards.md     # Script design rules
│   └── scripts/
│       ├── main.py                 # Phase 1 skeleton generator
│       ├── skill_health_check.py   # Drift detection
│       ├── discovery.py            # Docker Compose parser
│       ├── analysis.py             # AST/regex code analyzer
│       ├── devops_audit.py         # CI/CD/observability audit
│       └── generator.py            # Skill file generation logic
│
├── my-service-a/                   # Generated skill (long-running daemon)
│   ├── SKILL.md
│   └── scripts/
│       ├── health_probe.py         # Container + DB freshness checks
│       ├── log_hunter.py           # Pattern-matched log analysis
│       └── data_explorer.py        # Query output tables interactively
│
├── my-service-b/                   # Generated skill (HTTP API)
│   ├── SKILL.md
│   └── scripts/
│       ├── health_probe.py
│       ├── log_hunter.py
│       └── endpoint_tester.py      # Probe all real API routes
│
└── my-service-c/                   # Generated skill (file watcher)
    ├── SKILL.md
    └── scripts/
        ├── health_probe.py
        ├── log_hunter.py
        └── state_inspector.py      # Read state file, compute lag
```

Agent mirrors — always sync after creating or updating skills:

```bash
for d in .claude/skills/my-*/; do
  svc=$(basename "$d")
  cp -r "$d" ".agent/skills/$svc/"
  cp -r "$d" ".gemini/skills/$svc/"
done
```

---

## 6. Skill Lifecycle

### When to Generate a Skill
- A new Docker service is added to the project
- An existing service is significantly refactored

### When to Update a Skill
- The service's database schema changes
- New error conditions are added to the code
- The entry point or restart policy changes
- The health check script's stale thresholds no longer reflect reality

### Detecting Drift

```bash
# Check all skills for staleness
python3 .claude/skills/service-skill-builder/scripts/skill_health_check.py --all
```

Output example:
```
my-service-a: HEALTHY
my-service-b: STALE (service code modified 2026-01-15, skill generated 2025-11-01)
my-service-c: MISSING (no skill exists)
```

A skill is **STALE** when the service's source code or docker-compose definition has been modified more recently than the skill was generated. This is a signal to re-run Phase 2 for the affected service.

---

## 7. Quality Gates

A skill is **complete** (not draft) when all of the following are true:

- [ ] No `[PENDING RESEARCH]` markers remain in SKILL.md
- [ ] All stub scripts have been replaced with service-specific implementations
- [ ] `health_probe.py` queries actual output tables with correct stale thresholds
- [ ] `log_hunter.py` patterns are sourced from the real codebase (not invented)
- [ ] At least one specialist script exists if the service has unique inspectable state
- [ ] The Troubleshooting table has ≥5 rows based on real failure modes
- [ ] All CLI commands in SKILL.md are verified against the actual docker-compose config
- [ ] Scripts have been synced to `.agent/skills/` and `.gemini/skills/` mirrors

---

## 8. Best Practices

### One Service, One Skill
Keep skills granular. A skill for `my-api` should not also document `my-worker`. Tightly coupled services (e.g., Redis master/replica) may share a skill if they are always operated together.

### Read Source, Not Docs
Internal README files go stale. The entry point script, exception handlers, and log statements are the ground truth. Always grep the source code for actual error messages before writing log patterns.

### Port Awareness
Scripts in `skills/` run on the **host machine**, not inside Docker. Always use the external mapped port:

```python
# ✅ Host script (external mapped port)
DB_PORT = int(os.getenv("DB_PORT", "5433"))

# ❌ Wrong for a host script (container-internal port)
DB_PORT = int(os.getenv("DB_PORT", "5432"))
```

### Executable Knowledge
Prefer putting logic into `scripts/` (executed without reading into context) over text-only descriptions in SKILL.md. An agent that can run `health_probe.py` learns the truth about service health in one step. An agent reading stale prose may act on incorrect assumptions.

### Actionable Remediation
Every critical failure detected by a script must print the exact command to fix it — not "check the logs." For example:

```python
if not token_present:
    print(f"  Fix: docker exec -it {CONTAINER} python scripts/auth.py --refresh")
```

---

## 9. Anti-Patterns

| Anti-pattern | Why It Fails |
|---|---|
| Skip Phase 2 because Phase 1 looks complete | Skeleton has correct port numbers but wrong table names, wrong log patterns, wrong stale thresholds |
| Copy log patterns from another service's skill | Different services emit different errors; shared patterns produce false positives and miss real failures |
| Use port 5432 in host scripts | Container-internal port is unreachable from host; scripts silently hang |
| Write `health_probe.py` without fix commands | Agent sees a failure but has no recovery path |
| Leave `[PENDING RESEARCH]` markers | The skill is unusable — an agent acting on incomplete info may apply wrong fixes |
| Forget to sync to `.agent/` and `.gemini/` | Other agent runtimes use stale or missing skills |
| Use `r"ERROR"` as a log pattern | Matches variable names, comments, thousands of false positives |
| Hardcode table names without verifying | `SELECT tablename FROM pg_tables WHERE schemaname='public'` first |
