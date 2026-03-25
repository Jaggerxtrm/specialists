# Code Review: src/specialist/runner.ts

## Approach

I read the following files to build full context before reviewing:

- `/home/dawid/projects/specialists/src/specialist/runner.ts` — the target file (303 lines)
- `/home/dawid/projects/specialists/src/specialist/beads.ts` — BeadsClient interface
- `/home/dawid/projects/specialists/src/specialist/jobRegistry.ts` — async job state management
- `/home/dawid/projects/specialists/src/specialist/hooks.ts` — HookEmitter
- `/home/dawid/projects/specialists/src/specialist/loader.ts` — SpecialistLoader
- `/home/dawid/projects/specialists/src/specialist/schema.ts` — Zod schema / types
- `/home/dawid/projects/specialists/src/specialist/templateEngine.ts` — renderTemplate
- `/home/dawid/projects/specialists/src/pi/session.ts` — PiAgentSession, SessionKilledError
- `/home/dawid/projects/specialists/src/utils/circuitBreaker.ts` — CircuitBreaker
- `/home/dawid/projects/specialists/tests/unit/specialist/runner.test.ts`
- `/home/dawid/projects/specialists/tests/unit/specialist/runner-scripts.test.ts`

---

## Findings

### Bug: Duplicate `sessionBackend` assignment (lines 208 and 210)

```typescript
sessionBackend = session.meta.backend;
output = await session.getLastOutput();
sessionBackend = session.meta.backend; // capture before finally calls kill()
```

`sessionBackend` is assigned on line 208, then again identically on line 210. The comment on line 210 says "capture before finally calls kill()" — but that is what line 208 does. The second assignment is dead code. The problem is that `getLastOutput()` (line 209) is async and could theoretically throw before line 210 is reached, which is exactly why the first capture on line 208 matters. However the second assignment is still redundant and misleading. If `getLastOutput()` throws, control jumps to the catch block before either assignment after it is reached — so the defensive intent of line 210 is already served by line 208.

This is not a functional bug in practice (the value is the same both times), but it creates misleading intent and maintenance risk.

### Bug: `runScript` does not sanitise or validate the script path

```typescript
function runScript(scriptPath: string): ScriptResult {
  try {
    const output = execSync(scriptPath, { encoding: 'utf8', timeout: 30_000 });
```

`execSync` is called with a raw string from the specialist YAML (`s.path`). This passes the string directly to a shell. If a specialist YAML is written with a path containing shell metacharacters or if it is loaded from an untrusted source, this enables shell injection. A safer approach is to use `spawnSync` with an args array (the same pattern already used in `beads.ts`), or at minimum validate that the path refers to an actual file before executing. The same risk applies to path values that start with `~/` or `./` that are interpolated without being resolved first.

### Edge case: Pre-script filter logic is subtle and fragile (lines 119–121)

```typescript
const preResults = preScripts
  .map(s => runScript(s.path))
  .filter((_, i) => preScripts[i].inject_output);
```

All pre-scripts run unconditionally (`.map`), but only the ones with `inject_output: true` are collected in `preResults`. This means all scripts execute as side effects, while only some contribute output to the prompt. This behaviour is intentional per the test in `runner-scripts.test.ts` ("Script still runs (for side effects)"), but it is not documented at the call site. The coupling between the mapped index and `preScripts[i]` is fragile: if a future refactor introduces a flatMap or reorders the chain, the index-based correlation silently breaks. Extracting this into a named function or a `reduce` would make it safer.

### Edge case: `post_execute` hook is emitted twice on success — once implicitly never on failure path

On success, `post_execute` is emitted at line 250 with `status: 'COMPLETE'`. On failure, it is emitted at line 233 inside the catch block with `status: 'ERROR'` or `'CANCELLED'`. This is correct.

However, there is no `post_execute` emission in the `finally` block. This means if the `finally` block itself somehow throws (unlikely since `session?.kill()` is a no-op after `close()`), no hook is emitted. This is a very low risk edge case but worth noting for observability completeness.

### Edge case: Circuit breaker records success against `model`, not `sessionBackend`

```typescript
circuitBreaker.recordSuccess(model);
```

`model` is the resolved model string (possibly a fallback). `sessionBackend` is the actual backend string returned from the pi session meta (e.g. `"google-gemini-cli"`). These may differ in format. The circuit breaker is keyed by whatever string is passed — so `recordSuccess("gemini")` and `recordFailure("gemini")` must use the same key. Currently both use `model`, which is consistent. But `onMeta` can update `sessionBackend` to a different string (`provider` from pi's message_start event). If a caller were ever to rely on `sessionBackend` as a circuit-breaker key, mismatches would occur silently. The inconsistency in semantics (model string vs. backend/provider string) is worth documenting.

### Edge case: `sessionPath` option is declared but never used

```typescript
export interface RunOptions {
  /** Path to an existing pi session file for continuation (Phase 2+) */
  sessionPath?: string;
}
```

`sessionPath` is accepted in `RunOptions` but never read or passed to the session factory. The comment says "Phase 2+" implying it is intentionally deferred, but there is no guard, warning, or error when it is provided. A caller passing `sessionPath` expecting continuation behaviour would get silent no-op behaviour instead.

### Edge case: `backendOverride` initialises registry `backend` field with `'starting'` string

```typescript
registry.register(jobId, {
  backend: options.backendOverride ?? 'starting',
  model: '?',
  specialistVersion,
});
```

When `backendOverride` is not set, the registry records `backend: 'starting'`. This is a sentinel, not an actual backend name. If a polling client reads the snapshot before `onMeta` fires, it sees `backend: 'starting'` — which is fine for display. However if the caller passes `backendOverride`, it is used as the initial `backend` value even though the actual backend used by the pi session may differ (since `backendOverride` goes through circuit breaker fallback logic). This means an async job snapshot may show an incorrect backend name until `onMeta` fires and `setMeta` is called.

### Code quality: Duplicated JSDoc comment (lines 274–277)

```typescript
/** Fire-and-forget: registers job in registry, returns job_id immediately. */
/** Fire-and-forget: registers job in registry, returns job_id immediately. */
/** Fire-and-forget: registers job in registry, returns job_id immediately. */
/** Fire-and-forget: registers job in registry, returns job_id immediately. */
async startAsync(...)
```

The same JSDoc comment is repeated four times. This is a copy-paste artifact with no functional impact, but it is noise that should be cleaned up.

### Code quality: Dynamic import inside hot path (line 145)

```typescript
const { readFile } = await import('node:fs/promises');
```

`readFile` is dynamically imported inside the `run()` method. The static import of `writeFile` from the same module already exists at line 3. This is redundant — `readFile` should be added to the existing static import at the top of the file. Dynamic imports inside hot-path async functions add minor per-call overhead (though Node.js caches them) and make the dependency surface less obvious at a glance.

### Code quality: `sessionFactory` type parameter bound is unnecessarily wide

```typescript
export type SessionFactory = (opts: PiSessionOptions) => Promise<Pick<PiAgentSession, 'start' | 'prompt' | 'waitForDone' | 'getLastOutput' | 'getState' | 'close' | 'kill' | 'meta'>>;
```

`getState` is listed in the `Pick` but is never called on the session inside `runner.ts`. The test mock includes it too. Removing unused methods from the `Pick` would tighten the contract and make mocking simpler, though this is a low-priority style concern.

### Code quality: `beadVariables` uses `options.prompt` for `bead_context` (line 125)

```typescript
const beadVariables = options.inputBeadId
  ? { bead_context: options.prompt, bead_id: options.inputBeadId }
  : {};
```

When `inputBeadId` is set, `bead_context` is set to `options.prompt`. The intention appears to be: if the task was sourced from a bead, expose the bead's content as `$bead_context`. But the caller already provides the bead content as `options.prompt` — so this is effectively duplicating the prompt. The test confirms this is deliberate ("Bead=# Task: Refactor auth" equals the prompt value). The variable naming is slightly misleading: `bead_context` sounds like extra context added to the prompt, but it is actually the same as `$prompt`. A comment clarifying this equivalence would help future readers.

---

## Summary Table

| Severity | Issue | Location |
|----------|-------|----------|
| Low (bug, cosmetic) | Duplicate `sessionBackend` assignment | Lines 208, 210 |
| Medium (security) | `execSync` with unsanitised shell string | Lines 59, `runScript` function |
| Low (fragility) | Index-coupled filter for pre-script inject logic | Lines 119–121 |
| Low (silent no-op) | `sessionPath` option accepted but never used | `RunOptions`, `run()` |
| Low (misleading state) | `backendOverride` used as initial registry backend before `onMeta` fires | `startAsync`, lines 287–290 |
| Trivial | Quadruplicated JSDoc comment on `startAsync` | Lines 274–277 |
| Low (style) | Dynamic import of `readFile` inside hot path | Line 145 |
| Low (style) | `getState` in `SessionFactory` Pick but never called | Line 32 |
| Informational | `bead_context` === `prompt` when `inputBeadId` set — naming could mislead | Lines 125–126 |

The most impactful issue is the shell injection risk in `runScript`. Everything else is low severity or cosmetic.
