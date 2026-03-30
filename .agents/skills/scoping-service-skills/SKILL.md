---
name: scoping-service-skills
description: >-
  Task intake and service routing for any task type. Reads service-registry.json
  directly, detects intent, maps to the right expert skill(s), and emits a
  structured XML scope plan before any files are touched. Invoke via
  /scope "task description" before starting any investigation, feature,
  refactor, config-change, or exploration task.
allowed-tools: Bash(python3 *), Read
---

# Scoping Service Skills ( /scope )

Ground every task in the right expert context **before any files are touched**.

## Trigger

User types `/scope "task description"` — or `/scope` with task context already
in the conversation.

---

## Execution Flow

### Step 1 — Read the Registry

Run this at the start, before deep task reasoning:

```bash
python3 "$CLAUDE_PROJECT_DIR/.claude/skills/scoping-service-skills/scripts/scope.py"
```

This outputs every registered service: ID, container, territory paths, skill path,
and description. If the registry is missing, report:

> "No service-registry.json found at this project. Run /creating-service-skills first."

---

### Step 2 — Detect Intent

Scan the task description for keywords:

| Intent | Signal keywords |
|---|---|
| `investigation` | broken, error, failing, problem, not working, issue, crash, down, missing, slow, 502, 404, 429, timeout |
| `feature` | add, implement, create, new, build, introduce, support |
| `refactor` | refactor, restructure, clean, reorganize, simplify, rename, extract |
| `config-change` | update, change, modify, set, configure, adjust, tune |
| `exploration` | how, explain, understand, what is, show me, why, walk me through |

**Default when ambiguous → `investigation`** (safer: check first, act second).

---

### Step 3 — Map to Services

Using the registry output, reason about which service(s) the task involves. Match on:

- Explicit service name in task description (`traefik`, `grafana`, `loki` …)
- Symptom-to-service knowledge:
  - `502 / route not found` → traefik
  - `logs not appearing` → loki / promtail
  - `alert not firing` → alertmanager / prometheus
  - `dashboard broken` → grafana
  - `API key rejected` → api-gateway
  - `disk full` → node-exporter / loki (chunks)
  - `container memory` → cadvisor
- Config file or directory mentioned (`routes.yml` → traefik, `prometheus.yml` → prometheus)
- Container name mentioned (`infra-*`)

---

### Step 4 — Output XML Scope Block

Emit this block before moving into implementation:

```xml
<scope>
  <task>"user's original description"</task>
  <intent>investigation</intent>
  <confidence>high|medium|low</confidence>
  <services>
    <service id="traefik" confidence="high">
      <reason>user mentioned 502 on dashboard route</reason>
      <skill>.claude/skills/traefik/SKILL.md</skill>
      <load>now</load>
    </service>
  </services>
  <workflow>
    <phase order="1" name="diagnose">
      Consult traefik SKILL.md failure modes table.
      Run health_probe.py and log_hunter.py before any ad-hoc docker commands.
    </phase>
    <phase order="2" name="fix">
      Apply targeted fix based on diagnosis.
    </phase>
    <phase order="3" name="regression-test">
      <decision>
        Code behavior bug → write test in repo test suite (pytest/unit).
        Operational/infra issue → extend health_probe.py OR add script to
          .claude/skills/traefik/scripts/.
      </decision>
      Name the function after the failure mode it catches.
      Commit the test alongside the fix — never separately.
    </phase>
  </workflow>
</scope>
```

Adapt the phases to the detected intent (see Intent Workflows below).

---

### Step 5 — Load Skills

For each `<service>` with `<load>now</load>`, immediately read the skill file:

```
Read: .claude/skills/<service-id>/SKILL.md
```

Load all matched skills before proceeding with the task.
Adopt the expert persona, constraints, and diagnostic approach from each loaded skill.

---

### Step 6 — Execute

Follow the workflow phases in order. For `investigation` tasks, include the
regression-test phase — it keeps fixes durable.

---

## Intent Workflows

### `investigation` — Problem / Error / Broken

```
diagnose → fix → regression-test
```

- Start with the skill's **failure modes table** — not ad-hoc docker commands.
- Use the skill's **diagnostic scripts** (`health_probe.py`, `log_hunter.py`) first.
- After the fix is applied and verified: write a regression test (see below).

### `feature` — New Capability

```
design → skill-check → implement → test
```

- Read the skill's **architecture section** before designing anything.
- Check integration points (what calls this service, what does it call).
- Write tests alongside implementation, not as a follow-up.

### `refactor` — Structural Change

```
scope → skill-check → change → verify
```

- Read the skill's **integration diagram** to understand what depends on this.
- Use `find_referencing_symbols` before renaming or restructuring.
- Verify no external callers break after the change.

### `config-change` — Setting / Parameter

```
read-current → validate → modify → confirm
```

- Read the current config state before touching anything.
- Validate the intended change against the skill's known constraints and limits.
- After applying: confirm the service is healthy (`health_probe.py`).

### `exploration` — Understanding / Analysis

```
load-skill → answer
```

- Load the skill and answer from its documented knowledge.
- No file modification. No action needed unless user explicitly asks.

---

## Regression Test Binding

When `intent = investigation` and a fix has been applied, write a regression
test. Use this decision tree:

```
Is the bug in application code logic?
  YES → write pytest/unit test in repo's test suite

  NO  (operational / infra / config issue) →
        Does the skill's health_probe.py already check this condition?
          YES → extend the existing check function
          NO  → add a new check function to health_probe.py
                OR create a dedicated script in .claude/skills/<service>/scripts/
```

**Naming convention** — name after the failure mode, not the fix:

```python
def check_route_not_returning_502():    # ✅ descriptive
def check_cert_not_expiring_soon():     # ✅ descriptive
def test_fix():                         # ❌ meaningless
def test_issue_123():                   # ❌ meaningless
```

Commit the test in the same commit as the fix.

---

## No Match Handling

If no registered service matches the task:

1. Report: `"No registered skill covers this area."`
2. Offer: `"I can create one — use /creating-service-skills."`
3. Fall back to general expert mode (no skill enforcement).

---

## Related Skills

- `/using-service-skills` — Passive catalog at session start
- `/creating-service-skills` — Scaffold new expert skill packages
- `/updating-service-skills` — Sync skills after implementation drift
