# Test Coverage Gap Analysis and Additions: loader.ts

## Files Read

- `/home/dawid/projects/specialists/src/specialist/loader.ts` — source under test
- `/home/dawid/projects/specialists/src/specialist/schema.ts` — Zod schema for Specialist type
- `/home/dawid/projects/specialists/tests/unit/specialist/loader.test.ts` — existing tests (read before and after edits)

## Existing Coverage (6 tests)

| Test | What it covers |
|------|----------------|
| discovers specialists in project specialists/ dir | `list()` finds `specialists/` dir, returns scope=project |
| returns empty list when no specialists | `list()` on empty dirs |
| loads and caches a specialist by name | `get()` basic load + cache hit (same reference) |
| throws when specialist not found | `get()` error path |
| warns to stderr and skips invalid YAML | `list()` error handling, stderr output |
| project-level overrides user-level (same name) | deduplication, first-wins logic |

## Coverage Gaps Identified

### 1. `checkStaleness()` — entirely untested (0 coverage)

This is an exported async function with 6 distinct return paths:
- Returns `'OK'` when `filestoWatch` is absent or empty
- Returns `'OK'` when `updated` is absent
- Returns `'OK'` when `updated` is an invalid date string (NaN guard)
- Returns `'OK'` when watched file does not exist on disk (`.catch(() => null)`)
- Returns `'OK'` when all watched files have mtimes older than `updated`
- Returns `'STALE'` when a watched file was modified after `updated`
- Returns `'AGED'` when stale AND `daysSinceUpdate > staleThresholdDays`
- Returns `'STALE'` (not `'AGED'`) when stale but within threshold, or no threshold set

### 2. Alternate project-scope discovery dirs — untested

`getScanDirs()` scans three project directories: `specialists/`, `.claude/specialists/`, `.agent-forge/specialists/`. Only the first was tested.

### 3. User-scope listing — untested

No test verified that a specialist found in `userDir` gets `scope: 'user'`.

### 4. `list()` category filter — untested

The `category` parameter to `list()` was never exercised, including the case where it matches nothing.

### 5. Non-.specialist.yaml files are ignored — untested

The `.filter(f => f.endsWith('.specialist.yaml'))` guard had no explicit test.

### 6. `get()` skills path resolution — untested (3 branches)

`get()` resolves `~/`, `./`, and absolute paths differently. None of the three branches were tested.

### 7. `invalidateCache()` — untested (2 branches)

- `invalidateCache(name)` — removes one entry, leaves others intact
- `invalidateCache()` — clears the entire cache

## Tests Added (21 new tests)

### SpecialistLoader describe block (new tests)

1. **discovers specialists in .claude/specialists/ dir with project scope** — covers second scan dir
2. **discovers specialists in .agent-forge/specialists/ dir with project scope** — covers third scan dir
3. **discovers specialists in user dir with user scope** — covers user scope
4. **filters list() by category** — category filter returns only matching specialists
5. **list() returns all specialists when category filter matches none** — empty result from filter
6. **ignores files that do not end with .specialist.yaml** — extension filter guard
7. **invalidateCache() by name removes only that entry** — partial cache invalidation
8. **invalidateCache() without name clears all cached entries** — full cache clear
9. **get() resolves ~/ prefixed skill paths to absolute home-relative paths** — tilde expansion
10. **get() resolves ./ prefixed skill paths relative to specialist file directory** — relative expansion
11. **get() leaves absolute skill paths unchanged** — absolute passthrough

### checkStaleness describe block (10 new tests)

1. **returns OK when filestoWatch is absent** — no watch config
2. **returns OK when filestoWatch is empty** — empty array guard
3. **returns OK when updated is absent** — missing updated field
4. **returns OK when updated is an invalid date string** — NaN guard
5. **returns OK when all watched files have not changed since updated** — files older than updated
6. **returns OK when watched file does not exist** — stat failure catch
7. **returns STALE when a watched file was modified after updated** — core STALE path
8. **returns AGED when file is stale and daysSinceUpdate exceeds staleThresholdDays** — AGED path
9. **returns STALE (not AGED) when stale but daysSinceUpdate is within staleThresholdDays** — threshold not exceeded
10. **returns STALE when stale and no staleThresholdDays is set** — stale without threshold

## Results

```
Tests: 27 passed (6 original + 21 new)
Test Files: 1 passed
Duration: ~67ms
```

All tests pass. No source files were modified.
