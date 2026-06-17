# `sp console` v2 — operator E2E walkthrough

> Bead: `unitAI-ctb4u.18` — operator E2E walkthrough + debug guide.
> Subject: the compiled binary at `./sp`, not `bunx tsx src/index.ts`.
> Time budget: ~30 min, single operator, this repo.
> Filling instructions: each section has **Expected** (derived from the v2 source) and **Observed** (you fill, marking PASS or FAIL). Any FAIL → file a bead with `discovered-from:unitAI-ctb4u.18` and paste the bd id at the bottom of the section.

---

## §1 Build + launch

### Setup

```bash
cd /home/dawid/dev/specialists/.worktrees/ctb4u-rebase
bun build --compile --target=bun src/index.ts --outfile=./sp
ls -lh ./sp
file ./sp
```

### Expected

- `bun build` reports `bundle <N> modules` then `compile  ./sp` and exits 0.
- `./sp` is ~100 MB (Bun-runtime binary), ELF64 LSB executable.
- `./sp --help` lists `console` (line: "operator TUI…").
- `./sp console --help` exits 0 and prints a key listing.

### Observed

- [x] PASS — bundle + compile exits 0; size ≈ **103 MB** (verified `2026-06-17` on this worktree)
- [x] PASS — `./sp --help` lists `console`
- [x] PASS — `./sp console --help` exits 0 (but text is v1; see drift below)
- **Known drift (filed):** `./sp console --help` text is v1, missing `b` / `d` / `g` / `t` / `e` / `u` / `[` / `]` / `f` keys. → **unitAI-ctb4u.23**

Follow-up beads: unitAI-ctb4u.23

---

## §2 ProcessView at 80 / 120 / 160 (resize sweep)

Phase contract: `.4` (ProcessView), `.5` (perf/throttling), theme.ts (column widths).

### Setup

Open three terminals (or use tmux split) at widths 80, 120, 160 cols. In each:

```bash
./sp console
```

### Expected

- ProcessView is the default view; top chrome = 4 rows (tabs / meters / viewtag / header), bottom = 2 rows (StatsLine + KeyBar). Zero blank lines in the middle ⇒ `fillerLine(width)` space-pads when no job rows exist.
- 80 cols: column drop-order kicks in. `title` drops first, then `next`, then `bead`, then `payloadTok`, etc. (see `theme.ts:selectJobColumns`).
- 120 cols: all standard columns visible (`id`, `spec`, `status`, `ctxPct`, `elapsed`, `payloadKb`, `payloadTok`, `bead`, `next`, `title`).
- 160 cols: extra horizontal padding; all columns still aligned.
- StatsLine is **exactly one line** at every width; priority truncation per §8.1 drops least-important tokens (worktrees, nodes, …) first.
- Resize sweep: drag the terminal smaller → SIGWINCH → frame redraws within ~50 ms without flicker (50 ms coalesce timer, `theme.ts:fitFrame`).

### Observed

- [ ] PASS / [ ] FAIL — 80 cols: title column dropped, no truncation overflow
- [ ] PASS / [ ] FAIL — 120 cols: all default columns visible
- [ ] PASS / [ ] FAIL — 160 cols: aligned, no trailing whitespace artifacts
- [ ] PASS / [ ] FAIL — StatsLine one line at every width
- [ ] PASS / [ ] FAIL — SIGWINCH resize redraws cleanly (no flicker / no orphaned rows)
- [ ] PASS / [ ] FAIL — Zero blank rows in any frame (visual check: highlight whitespace)

Follow-up beads: _____

---

## §3 BeadView (`b`) against a real bead

Phase contract: `.3` (BeadView), `.5` (NDJSON log on `bd_show` failure).

### Setup

Pick a real bead from this epic that has accumulated notes:

```bash
bd show unitAI-ctb4u.6 | head -10   # confirm bead has notes
```

Launch console; in ProcessView, ↑↓ to select any visible job (or open with no selection — BeadView will require a job). If no jobs are visible: open via the `i` (Inspect) path on a historical row or fall back to direct CLI test (see §3 fallback below).

In ProcessView with a selected job, press `b` → BeadView opens for the selected job's `bead_id`.

### Expected

- Header switches to `bead · <name> · <path>`.
- Body: 12-wide padded keys (status, type, priority, parent, etc.) then dim "── notes ──" section title, then notes wrapped to terminal width.
- KeyBar reads: `↑↓ scroll  PgUp/PgDn page  ⌫ back  g/G top/end  q quit`.
- `j`/`k` scroll one line; PgUp/PgDn scroll one viewport; `g`/`G` jump to top/end.
- `⌫` (Backspace) → return to ProcessView **with the same row selected and scroll position preserved** (per `view-model.ts:back`).
- On `bd show` failure (kill bd or rename a bead mid-poll): the view stays rendered but a single NDJSON line lands on stderr — `op:'bd_show'`, `errorClass:<code>`, **no payload, no bead text**. Rate-limited to one line per session per (view, op, errorClass).

### §3 fallback: invalid bead id

In ConfigView (`g` from ProcessView), the BeadView path is not reachable directly. If you cannot get a job with a `bead_id` populated, smoke-test the regex guard another way: invoke an internal codepath that calls `bd show` with an obviously bad id. Tests already cover this — record this as "covered by `tests/unit/cli/console-bead-view.test.ts`" if no live repro is reachable.

### Observed

- [ ] PASS / [ ] FAIL — Header shows correct bead id
- [ ] PASS / [ ] FAIL — Section title `── notes ──` renders dim
- [ ] PASS / [ ] FAIL — `↑↓` scroll one line
- [ ] PASS / [ ] FAIL — `PgUp/PgDn` page through
- [ ] PASS / [ ] FAIL — `g`/`G` jump to top/end
- [ ] PASS / [ ] FAIL — `⌫` returns to ProcessView, row + scroll preserved
- [ ] PASS / [ ] FAIL — On bd failure, single NDJSON line on stderr, no payload

Follow-up beads: _____

---

## §4 FeedView + FeedSource toggle

Phase contract: `.3` (forensic source default), `.5` (NDJSON `subscribe_feed`).

### Setup

In ProcessView, select a job with active output. Press `↵` (Enter) → FeedView opens.

### Expected

- FeedView defaults to **forensic** source (`feedSource === 'forensic'`).
- KeyBar reads: `↑↓ scroll  PgUp/PgDn page  f follow:<on|off>  t legacy  ⌫ back  g/G top/end  q quit`. The label after `t` is the **next** source (i.e. shows `legacy` while forensic is active, shows `forensic` while sp_feed is active).
- Press `t` → source flips to `sp_feed`. KeyBar updates to `t forensic`. Existing rows wiped, scroll = 0.
- Press `t` again → back to `forensic`.
- Press `f` → follow toggles. New rows auto-scroll to bottom while follow is on.
- Rows render via `forensicEventToFeedRow` / payload is `pickAllowedLabels`-filtered (max 5 fields × 32 chars each). No raw JSON quoted strings (e.g. `"role":`, `"tool_call_id":`).
- On `subscribe_feed` failure: rate-limited single NDJSON line, no payload.

### Observed

- [ ] PASS / [ ] FAIL — Default source = forensic
- [ ] PASS / [ ] FAIL — `t` flips to sp_feed; KeyBar label updates
- [ ] PASS / [ ] FAIL — `t` flips back; rows + scroll reset on each toggle
- [ ] PASS / [ ] FAIL — `f` toggles follow; new rows auto-scroll
- [ ] PASS / [ ] FAIL — Payload column contains no raw JSON tokens (`"role":`, etc.)
- [ ] PASS / [ ] FAIL — Subscribe failure logs single NDJSON line

Follow-up beads: _____

---

## §5 DiffView (`d`) against a worktree with real changes

Phase contract: `.5` (git wrappers, `parseNumstat`, `parseUnifiedDiff`).

### Setup

Make sure the selected job's worktree has unstaged changes (or open the console from this worktree which already has uncommitted scaffolding for the doc itself).

In ProcessView, select a job whose worktree you can identify; press `d` → DiffView opens.

### Expected

- Header switches to `diff · <repo> · <worktree path>`.
- Summary list: one row per changed file with status code (`M`/`A`/`D`/`R`/`?`), `+adds`, `-dels`, path. Binary files show `bin` marker instead of counts. Untracked files surface from porcelain status.
- KeyBar reads: `↑↓ nav  ↵ open file  r refresh  ⌫ back  q quit`.
- `↵` / `l` / `→` → open file view; shows hunks with @@ header (dim) and color-coded lines (add = green-ish, del = red-ish, context = dim, meta = dim).
- `r` → refresh re-runs `git diff --numstat` + `git status --porcelain`.
- `⌫` returns to summary list (when inside a file) or to ProcessView (when at summary list).
- HUNK_DISPLAY_CEILING = 5000 lines per file; beyond that, view truncates.
- Git failure → NDJSON line with `op:'git_diff'` | `'git_numstat'` | `'git_status'` | `'merge_base'`, no path/diff content in log.

### Observed

- [ ] PASS / [ ] FAIL — Summary lists this worktree's changed files (incl. docs/operator/*)
- [ ] PASS / [ ] FAIL — Status codes (M/A/D/?) accurate
- [ ] PASS / [ ] FAIL — Binary file shows `bin` marker (test with adding any *.png)
- [ ] PASS / [ ] FAIL — `↵` opens file; hunks render with @@ headers
- [ ] PASS / [ ] FAIL — Add/del lines color-distinct from context
- [ ] PASS / [ ] FAIL — `r` refresh picks up new edits
- [ ] PASS / [ ] FAIL — `⌫` from file → summary; second `⌫` → ProcessView
- [ ] PASS / [ ] FAIL — No file paths in stderr NDJSON on simulated git failure

Follow-up beads: _____

---

## §6 ConfigView (`g`) read-only against real `user.json`

Phase contract: `.6` (config-source, schema introspection), `.7` (inline edit), `.5` (NDJSON `read_global_config`).

### Setup

Confirm the operator's global config exists:

```bash
ls -lh ~/.config/specialists/user.json
```

Launch console, press `g` → ConfigView opens.

### Expected

- Header line: `~/.config/specialists/user.json` (HOME → `~` substitution; **never** raw `/home/<user>/…`).
- Specialist list on first row: `●` if override exists, `○` if no override. Selected specialist name in bright SGR.
- Field table: 28-wide `path` column, `value` column, dim allowed-input hint right-aligned to width.
  - `execution.thinking_level` hint reads: `enum: off|low|medium|high | null`
  - `skills.paths` hint: `string[]` (no `| null` suffix — non-nullable array)
  - `execution.fallback_models` hint: `string[] | null`
  - Inherit values display as `inherit`, null as `inherit`.
- KeyBar reads: `↑↓ field  [/] specialist  e edit  u undo  b $EDITOR  r refresh  ⌫ back  q quit`.
- `[` / `]` cycles specialist (wraps at boundaries).
- `↑↓` cycles fields within the selected specialist.
- `r` reloads the file (picks up external edits).
- On parse error: validation errors list rendered dim; no values logged.

### Observed

- [ ] PASS / [ ] FAIL — Header path shows `~/.config/specialists/user.json` (NO `/home/`)
- [ ] PASS / [ ] FAIL — `●` / `○` glyphs distinguish override vs inherit specialists
- [ ] PASS / [ ] FAIL — `[`/`]` cycle specialists
- [ ] PASS / [ ] FAIL — `↑↓` cycle fields
- [ ] PASS / [ ] FAIL — `thinking_level` hint format matches `enum: off|low|medium|high | null`
- [ ] PASS / [ ] FAIL — `skills.paths` hint = `string[]` (no `| null`)
- [ ] PASS / [ ] FAIL — `inherit` rendered for null/unset values
- [ ] PASS / [ ] FAIL — `r` refresh works
- [ ] PASS / [ ] FAIL — No raw `/home/<user>/` substring anywhere in view

Follow-up beads: _____

---

## §7 ConfigView inline edit — safe field round-trip

Phase contract: `.7` (edit + undo + mtime preflight), `.5` (NDJSON `write_global_config`).

**Safe target field:** `executor.notes_mode` (enum: `full-trail` | `final-only` | `null`). Picked because (a) enum, easy to verify, (b) cheap to flip back-and-forth without bricking any other surface. **AVOID** `execution.model` — flipping the global model can break all specialists.

### Setup

Snapshot current value before editing (for restore safety):

```bash
cp ~/.config/specialists/user.json /tmp/user-pre-walkthrough.json
jq '.specialists.executor.notes_mode' ~/.config/specialists/user.json
```

### Walkthrough

1. `g` → ConfigView, `[/]` to executor, `↑↓` to the `notes_mode` field.
2. Press `e` → edit prompt appears: `  edit > _`.
3. Type `final-only` and press `↵`.
4. Confirm file changed:
   ```bash
   jq '.specialists.executor.notes_mode' ~/.config/specialists/user.json
   ```
5. Press `u` → undo pushes previous raw back. Confirm:
   ```bash
   jq '.specialists.executor.notes_mode' ~/.config/specialists/user.json
   ```
6. Press `e` again, type invalid value (e.g. `nonsense`), press `↵`. Expect error line `  ! <message>` to render below the field row; file on disk unchanged.
7. `Esc` cancels edit; buffer cleared.
8. Press `b` → spawns `$EDITOR ~/.config/specialists/user.json` (or `vi` fallback). Quit editor, console resumes.

### Expected

- Empty / `null` / `inherit` → field value cleared to null.
- `true`/`false` → boolean coerce.
- Integer/float → numeric coerce.
- Enum match → exact-match required.
- Comma- or bracket-list → array coerce.
- mtime preflight: if file changed on disk between read and write → returns `{ok:false, errorClass:'mtime_mismatch'}`; console renders the error inline.
- Undo stack capped at 5; oldest discarded.
- All write failures → single NDJSON line on stderr: `op:'write_global_config'`, `errorClass:<code>`, **no value, no path beyond `~/.config/…`**.

### Observed

- [ ] PASS / [ ] FAIL — `e` opens edit prompt
- [ ] PASS / [ ] FAIL — Enum value commits to disk (verify with `jq`)
- [ ] PASS / [ ] FAIL — `u` reverts to prior value (verify with `jq`)
- [ ] PASS / [ ] FAIL — Invalid value shows `! <message>`, no on-disk change
- [ ] PASS / [ ] FAIL — `Esc` cancels edit
- [ ] PASS / [ ] FAIL — `b` opens `$EDITOR` and resumes after quit
- [ ] PASS / [ ] FAIL — No raw value text in stderr NDJSON

### Restore safety check

```bash
diff -u /tmp/user-pre-walkthrough.json ~/.config/specialists/user.json
```

If diff is non-empty after walking through, copy back:

```bash
cp /tmp/user-pre-walkthrough.json ~/.config/specialists/user.json
```

Follow-up beads: _____

---

## §8 KeyBar context-sensitivity + SIGWINCH sweep

Phase contract: `theme.ts:renderKeyBar`, `components.ts` key dispatch.

### Walkthrough

Visit each view in turn and confirm the KeyBar matches the advertised keys.

| View | Expected KeyBar (from `theme.ts:341`) |
|---|---|
| ps | `↑↓ nav  ↵ feed  r result  i inspect  b bead  d diff  g config  h history  a all  / filter  tab repo  q quit` |
| feed | `↑↓ scroll  PgUp/PgDn page  f follow:<on\|off>  t <legacy\|forensic>  ⌫ back  g/G top/end  q quit` |
| bead | `↑↓ scroll  PgUp/PgDn page  ⌫ back  g/G top/end  q quit` |
| diff | `↑↓ nav  ↵ open file  r refresh  ⌫ back  q quit` |
| config | `↑↓ field  [/] specialist  e edit  u undo  b $EDITOR  r refresh  ⌫ back  q quit` |
| job / result / other | `↑↓ scroll  ⌫ back  g/G top/end  q quit` |

Then trigger a SIGWINCH-driven resize (drag terminal). KeyBar should re-truncate to fit width via `truncateToWidth`.

### Observed

- [ ] PASS / [ ] FAIL — ps KeyBar matches
- [ ] PASS / [ ] FAIL — feed KeyBar matches; follow label flips with `f`
- [ ] PASS / [ ] FAIL — feed `t` label flips with current source
- [ ] PASS / [ ] FAIL — bead KeyBar matches
- [ ] PASS / [ ] FAIL — diff KeyBar matches
- [ ] PASS / [ ] FAIL — config KeyBar matches
- [ ] PASS / [ ] FAIL — Resize re-truncates KeyBar without overflow

Follow-up beads: _____

---

## §9 NDJSON stderr sweep — forbidden-substring grep

Phase contract: `.5` (NDJSON envelope), `.11` (telemetry redaction matrix).

### Setup

Launch console with stderr captured. Drive through every view (ps → feed → t toggle → ⌫ → bead → ⌫ → diff → drill into a file → ⌫ → config → cycle a few specialists → quit). Force at least one failure path if possible (e.g. rename `bd` on PATH transiently, or pass an unreadable file to `~/.config/specialists/user.json`).

```bash
./sp console 2>/tmp/sp-console-stderr.ndjson
# Quit with q
ls -lh /tmp/sp-console-stderr.ndjson
```

### Forbidden substring grep

```bash
echo "== forbidden substrings =="
for tok in '/home/' '/Users/' 'anthropic/' 'openai-codex/' 'payload' 'stdout' 'stderr' 'prompt' 'model_output' 'tool_call_id' 'raw_command'; do
  hits=$(grep -c "$tok" /tmp/sp-console-stderr.ndjson 2>/dev/null || echo 0)
  echo "$tok: $hits"
done
```

### Expected

- All counts = 0 (PASS).
- Every line is valid JSON with allowed keys ONLY: `{ts, component:'sp-console', view, op, exitCode, durationMs, errorClass}`.
- Duplicate (view, op, errorClass) tuples rate-limited to one line per session.

### Verification

```bash
echo "== shape =="
jq -c 'keys|sort' /tmp/sp-console-stderr.ndjson 2>/dev/null | sort -u
# All rows should print: ["component","durationMs","errorClass","exitCode","op","ts","view"]
```

### Observed

- [x] PASS — **happy-path automated probe verified on `2026-06-17`**. Command: `echo -n "q" | timeout 2 ./sp console 2>/tmp/sp-console-stderr.ndjson`. Resulting stderr = **0 bytes**. All 11 forbidden substrings = 0 hits. Exit code 0.
- [ ] OPERATOR — Every line parses as JSON (vacuously true on empty file; operator pass should drive a failure path to populate at least one line and re-verify)
- [ ] OPERATOR — Every line has only the 7 allowed keys (idem)
- [ ] OPERATOR — Duplicate errorClass rate-limited (operator: rename `bd` on PATH transiently, force `bd_show` failure, drive `b` 50× and confirm exactly one line lands)

Follow-up beads: _____

---

## Walkthrough summary

| Section | PASS / FAIL | Follow-up beads |
|---|---|---|
| §1 Build + launch | **PASS** (programmatic) | unitAI-ctb4u.23 (help-text drift) |
| §2 ProcessView resize | OPERATOR | |
| §3 BeadView | OPERATOR | |
| §4 FeedView + FeedSource | OPERATOR | |
| §5 DiffView | OPERATOR | |
| §6 ConfigView read | OPERATOR | |
| §7 ConfigView edit | OPERATOR | |
| §8 KeyBar sweep | OPERATOR | |
| §9 NDJSON redaction | **PASS** (happy path) / OPERATOR (failure paths) | |

**Overall verdict:** [ ] PASS / [ ] FAIL — _operator to fill after interactive pass_

**Filed regressions (discovered-from `unitAI-ctb4u.18`):**

- `unitAI-ctb4u.23` — `sp console --help` text is v1, missing v2 keys b/d/g/t/e/u/[/]/f.

**Operator name + date:** _____

---

## What the bead author verified (automated portion)

The author of this doc (`unitAI-ctb4u.18` claimant) programmatically verified:

1. **§1 Build + launch.** `bun build --compile --target=bun src/index.ts --outfile=./sp` → 103 MB ELF64. `./sp --help` lists `console`. `./sp console --help` exits 0 with stale v1 text → filed as `unitAI-ctb4u.23`.
2. **§9 NDJSON happy path.** `echo -n "q" | timeout 2 ./sp console 2>/tmp/sp-console-stderr.ndjson` → stderr 0 bytes, exit 0. All 11 forbidden substrings (`/home/`, `/Users/`, `anthropic/`, `openai-codex/`, `payload`, `stdout`, `stderr`, `prompt`, `model_output`, `tool_call_id`, `raw_command`) = 0 hits.

The remaining sections (§2 — §8 and §9 failure paths) require an interactive TTY drive: real arrow-key sweeps, real terminal resize (SIGWINCH), real `$EDITOR` spawn, and a deliberate `bd_show`/`git_diff` failure injection. These are listed as OPERATOR in the summary table above and are the responsibility of the operator pass that closes the bead's full SUCCESS contract.
