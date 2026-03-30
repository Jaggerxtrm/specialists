---
name: xt-debugging
description: Complete debugging workflow — error analysis, log interpretation, performance profiling, and GitNexus call-chain tracing. Use when investigating bugs, errors, crashes, or performance issues.
---

# xt-debugging

Systematic debugging using the GitNexus knowledge graph for call-chain tracing, combined with error analysis, log interpretation, and performance profiling.

## When to Use

- "Why is this function failing?"
- "Trace where this error comes from"
- "This endpoint returns 500"
- Investigating crashes, unexpected behavior, or regressions
- Performance issues
- Reading logs or stack traces

---

## Prerequisites

GitNexus must be indexed before starting. If you see "index is stale" or no results:

```bash
npx gitnexus analyze   # re-index the repo (run this, then retry)
npx gitnexus status    # verify freshness
```

---

## Phase 1 — Triage

Understand the symptom before touching any code.

1. Read the full error message and stack trace
2. Identify the suspect symbol (function, class, endpoint)
3. Check for regressions — what changed recently?
   ```
   gitnexus_detect_changes({scope: "compare", base_ref: "main"})
   ```

---

## Phase 2 — Knowledge Graph Investigation

```
1. gitnexus_query({query: "<error text or symptom>"})   → Related execution flows + symbols
2. gitnexus_context({name: "<suspect>"})                → Callers, callees, process participation
3. READ gitnexus://repo/{name}/process/{processName}    → Full step-by-step execution trace
4. gitnexus_cypher({...})                               → Custom call chain if needed
```

### Patterns by Symptom

| Symptom | Approach |
|---------|----------|
| Error message | `query` for error text → `context` on throw site |
| Wrong return value | `context` on function → trace callees for data flow |
| Intermittent failure | `context` → look for external calls, async deps, race conditions |
| Performance issue | `context` → find hot-path symbols with many callers |
| Recent regression | `detect_changes` to see what changed |

### Example — "Payment endpoint returns 500 intermittently"

```
1. gitnexus_query({query: "payment error handling"})
   → Processes: CheckoutFlow, ErrorHandling
   → Symbols: validatePayment, handlePaymentError

2. gitnexus_context({name: "validatePayment"})
   → Outgoing calls: verifyCard, fetchRates (external API!)

3. READ gitnexus://repo/my-app/process/CheckoutFlow
   → Step 3: validatePayment → calls fetchRates (external, no timeout)

4. Root cause: fetchRates has no timeout → intermittent failures under load
```

---

## Phase 3 — Root Cause Analysis

1. **Reproduce** — Identify minimal reproduction steps
2. **Trace data flow** — Follow the value/control flow from input to error
3. **Isolate** — Narrow to the smallest failing unit
4. **Hypothesize** — Form explicit hypothesis before reading more code
5. **Confirm** — Verify hypothesis against source, not just symptoms

Common root cause categories:
- **Null/undefined** — missing guard, wrong assumption about data shape
- **Race condition** — async ordering, missing await, shared mutable state
- **External dependency** — timeout, API contract change, env difference
- **Type mismatch** — serialization, casting, implicit coercion
- **Configuration** — env var missing, wrong default, deployment drift

---

## Phase 4 — Log Analysis

1. Read the full log output (not just the last line)
2. Identify: timestamps, error levels, request IDs, correlation tokens
3. Correlate events across log lines to build timeline
4. Look for: first occurrence, frequency, affected subset, preceding events
5. Summarize: what happened, when, why, and what was affected

---

## Phase 5 — Performance Profiling

1. **Measure baseline** — Never optimize blind
   ```bash
   time <command>
   ```
2. **Profile** — Language-appropriate tools:
   - Node.js: `--prof`, `clinic.js`, `0x`
   - Python: `cProfile`, `py-spy`, `line_profiler`
   - Go: `pprof`
3. **Identify hotspot** — Usually 1–2 functions account for >80% of time; use `gitnexus_context` to confirm call frequency
4. **Fix the bottleneck** — Minimal targeted change
5. **Verify** — Measure again, compare against baseline

---

## Phase 6 — Remediation

1. **Fix** — Minimal change that addresses the confirmed root cause
2. **Verify** — Run the failing case to confirm fix
3. **Regression test** — Add a test that would have caught this bug
4. **Check blast radius** — `gitnexus_impact({target: "fixedSymbol", direction: "upstream"})`
5. **Pre-commit scope check** — `gitnexus_detect_changes({scope: "staged"})`

---

## Checklist

```
- [ ] Read full error / stack trace
- [ ] Identify suspect symbol
- [ ] gitnexus_detect_changes to check for regressions
- [ ] gitnexus_query for error text or symptom
- [ ] gitnexus_context on suspect (callers, callees, processes)
- [ ] Trace execution flow via process resource
- [ ] Read source files to confirm root cause
- [ ] Form explicit hypothesis before fixing
- [ ] Verify fix against failing reproduction
- [ ] Add regression test
- [ ] gitnexus_detect_changes() before committing
```
