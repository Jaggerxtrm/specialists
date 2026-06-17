# `sp console` — grounded TUI design

> Design target for a future `sp console` command in this repo.
>
> This is **not** a substrate mock. Bind the UI to the runtime that exists today: `sp ps`, `sp feed`, `sp result`, `sp resume/steer/stop`, `sp epic`, `sp node`, and beads (`bd`). The companion HTML is only a visual mock for density, rail, palette, and key feel.

## 0. Reality anchors

Read these before implementation and keep the design in sync with them:

| Surface | Source of truth | What `sp console` must mirror |
|---|---|---|
| Process dashboard | `src/cli/ps.ts` | visibility rules, grouping, status icons, columns, next-action hints |
| Event stream | `src/cli/feed.ts`, `src/specialist/timeline-events.ts`, `src/specialist/timeline-query.ts` | DB-backed timeline, cursor/follow behavior, event filtering |
| Job state | `src/specialist/supervisor.ts`, `src/specialist/status-load.ts` | `SupervisorStatus`, metrics, context health, worktree/chain/epic fields |
| Runtime DB | `src/specialist/observability-sqlite.ts`, `src/specialist/observability-db.ts` | `.specialists/db/observability.db` as normal runtime store |
| Beads | `src/specialist/beads.ts`, `bd list --json` / `bd show --json` (post-v1 browser) | v1 displays linked `bead_id`/title from job status; full bead browsing is post-v1 |
| Existing TUI stack | `src/cli/chat.ts`, `src/cli/attach-tui.ts`, `src/cli/chat/feed.ts`, `src/cli/chat/status.ts` | `@earendil-works/pi-tui` lifecycle and component patterns |

Non-negotiable corrections from older mockups:

- Use **TypeScript + Bun + `@earendil-works/pi-tui`**, not Ink.
- Do **not** invent substrate containers, steps, contracts, tethers, mailboxes, or waves.
- Current `sp` does have `epic_id`, derived epic readiness, node runs, worktree reuse chains, and bead-linked jobs. Render those real entities only.
- **V1 traceability includes terminal jobs**: history toggles, completed feed replay, and result inspection.
- `bd show` / bead browser navigation is **post-v1**. V1 shows linked bead id/title in job rows but does not open bead detail.
- The performance/status strip stays one line at the bottom, immediately above shortcuts.

## 1. Product shape

`sp console` is a full-viewport, read-mostly operator TUI for one or more specialists repos. It is a navigable version of:

```bash
sp ps --follow
sp feed <job-id> --follow
sp ps <job-id>
sp result <job-id>
```

One view is visible at a time. No sidebar, no split panes.

Views:

1. **ProcessView** — default dashboard, shaped by `sp ps`.
2. **FeedView** — compact job timeline, shaped by `sp feed`.
3. **JobView** — focused job inspect, shaped by `sp ps <id>`.
4. **ResultView** — final/latest assistant output, shaped by `sp result <id>`.

## 2. Runtime architecture

Use one seam between UI and runtime. Views never shell out directly and never open SQLite directly.

```
App/pi-tui components
  ↓ dispatch actions
Store/reducer
  ↓ calls
RuntimeClient
  ↓ uses existing repo modules / safe bd subprocess args
specialists runtime + bd
```

### 2.1 `RuntimeClient`

```ts
interface RuntimeClient {
  listRepos(): Promise<RepoRef[]>;

  // ProcessView = sp ps parity.
  listProcessSnapshot(repo: RepoId, opts: ProcessFilter): Promise<ProcessSnapshot>;
  subscribeProcessSnapshot(repo: RepoId, cb: () => void): Unsubscribe;

  // FeedView = sp feed parity.
  readFeed(args: { repo: RepoId; jobId: string; fromSeq?: number; limit?: number }): Promise<FeedEvent[]>;
  subscribeFeed(args: { repo: RepoId; jobId?: string; nodeId?: string }, cb: (event: FeedEvent) => void): Unsubscribe;

  // JobView = sp ps <id> parity.
  inspectJob(repo: RepoId, jobIdPrefix: string): Promise<JobInspect>;

  // ResultView = sp result parity.
  readResult(repo: RepoId, jobIdPrefix: string): Promise<JobResult>;

  // Post-v1 bead browser; not required for traceability v1.
  listBeads?(repo: RepoId, opts: BeadListFilter): Promise<BeadListSnapshot>;
  showBead?(repo: RepoId, beadId: string): Promise<BeadDetail>;

  // Bottom StatsLine.
  readHealth(repo: RepoId): Promise<ProcessHealthSnapshot>;
}
```

Implementation guidance:

- Prefer importing repo modules (`loadStatuses`, `collectProcessHealth`, `queryTimeline`, `createObservabilitySqliteClient`) over spawning `sp` and parsing text.
- `bd` access can shell out with `spawnSync`/`spawn` **argument arrays only**, matching `BeadsClient`; never interpolate shell strings.
- Keep the CLI outputs as parity references. If `sp ps` semantics change, update `RuntimeClient` and this doc together.

### 2.2 Store

A single reducer owns navigation state and buffered feed rows.

```ts
type View = 'ps' | 'feed' | 'job' | 'result';

interface State {
  repo: RepoId;
  view: View;
  selectedRow: number;
  filter: string;
  filtering: boolean;
  selectedJobId?: string;
  feed: Record<string, FeedEvent[]>;
  historyMode: 'default' | 'history' | 'all';
  follow: boolean;
  health?: ProcessHealthSnapshot;
}
```

Components are pure renderers over state. Async subscriptions dispatch actions and call `tui.requestRender()`.

## 3. Process model to render

Render the same hierarchy `sp ps` builds today:

1. **System health** — source: `collectProcessHealth()`; in console this becomes the bottom StatsLine, not a top block.
2. **Epic groups** — jobs with `epic_id`, grouped into prep jobs and chains; readiness comes from `loadEpicReadinessSummary()` and is derived, not hand-entered.
3. **Node groups** — jobs with `node_id`, using node run names/statuses from the observability DB.
4. **Worktree trees** — jobs sharing `worktree_owner_job_id`; reused jobs appear as children via `reused_from_job_id`.
5. **Standalone jobs** — no node/epic/worktree grouping.

Job row columns must stay aligned with `sp ps` fields:

```text
st id       specialist     status     ctx  elapsed+metrics    payload   bead          next  title
```

Use these real fields from `SupervisorStatus`:

- identity: `id`, `specialist`, `bead_id`, `bead_title`, `node_id`
- lifecycle: `status`, `pid`, liveness/dead flag
- workspace: `worktree_path`, `branch`, `worktree_owner_job_id`, `reused_from_job_id`
- chain/epic: `chain_kind`, `chain_id`, `chain_root_job_id`, `chain_root_bead_id`, `epic_id`
- observability: `elapsed_s`, `context_pct`, `context_health`, `metrics`, `startup_payload_json`

Do not render a row as an "issue step" unless the runtime exposes that as a job row. The selectable unit is a **job**.

## 4. Feed model to render

FeedView is a navigable `sp feed`:

- Source events from `observability.db`; file reads are fallback/legacy only.
- Preserve cursor semantics (`jobId:seq` / `--from`) and follow semantics.
- Human mode should use the same suppression principle as `sp feed`: hide high-noise turn/message rows by default, show actionable lifecycle/tool/error/status rows.
- JSON/raw mode can be a future toggle; default is compact human progress.

Important real event families:

```text
run_start, status_change, meta, payload_breakdown, tool, text, thinking,
token_usage, finish_reason, turn_summary, compaction, retry, error,
extension_error, model_change, run_complete
```

Waiting jobs should show the real next action:

```text
WAIT reviewer/gpt-5.4-mini (49adda) is waiting for input. Use: sp resume 49adda "..."
```

## 5. V1 traceability

Traceability is part of v1 and is grounded in current CLI behavior. It is **not** a post-v1 nice-to-have.

### 5.1 History visibility

ProcessView must expose the same visibility modes as `sp ps`:

- default: active jobs plus unresolved terminal problems
- history: active plus uncleaned terminal history (`--include-terminal`)
- all: full audit view (`--all`, including cleaned/dead/history)
- optional cleaned toggle: rows hidden by `sp clean --ps` (`--include-cleaned`)

Use `h` / `a` or an equivalent compact cycle:

```text
active/default → history → all
```

### 5.2 Feed replay after completion

`sp feed <job>` is DB-backed in normal runtime and can replay events after a job is done. FeedView must therefore work for running, waiting, done, error, and cancelled jobs. Follow mode only follows live jobs; terminal jobs open as replay.

### 5.3 Result inspection

ResultView is v1. It mirrors `sp result <job>` semantics:

- `done` → show final result plus metrics/footer
- `waiting` → show latest completed output when available plus the real resume footer
- `running` / `starting` → show latest completed output if available, otherwise guide to feed
- `error` / `cancelled` → show terminal reason and log/feed hints where available

### 5.4 Next-action mapping

The row's `next` action should drive the default affordance:

| Job state | Primary action | Secondary action |
|---|---|---|
| `starting` / `running` | feed | result if previous output exists |
| `waiting` | result | resume hint / feed replay |
| `done` | result | feed replay |
| `error` | result/error detail | feed/log replay |
| `cancelled` / dead | log/feed replay | result if persisted |

### 5.5 Beads in v1 vs post-v1

V1 keeps bead traceability in job rows (`bead_id`, bead title, chain root bead) but does **not** open `bd show`. Full bead navigation is post-v1:

- `bd list --json` / `bd query --json` for a navigable bead list
- `bd show <id> --json` for expanded detail
- dependency rows selectable from detail
- breadcrumb/back stack
- repo-aware `bd` execution in selected repo cwd

## 6. `@earendil-works/pi-tui` implementation rules

Use the runtime's existing TUI stack:

```ts
import { TUI, ProcessTerminal, Container, Input, matchesKey, Key, truncateToWidth, wrapTextWithAnsi } from '@earendil-works/pi-tui';
```

Patterns to follow from existing code:

- Instantiate `const terminal = new ProcessTerminal(); const tui = new TUI(terminal);`.
- Mount children with `tui.addChild(root)`; do **not** assign `tui.root`.
- `Container` is vertical composition; add custom components with `addChild()`.
- Components implement `render(width): string[]`, optional `handleInput(data)`, and `invalidate()`.
- Every rendered line must be `<= width`; use `truncateToWidth()` and `wrapTextWithAnsi()`.
- After state changes, call `tui.requestRender()`.
- Use `matchesKey(data, Key.up)` / `Key.down` / `Key.enter` / `Key.shift('enter')` patterns instead of raw escape matching where possible.
- Cache rendered rows by width and invalidate on data/theme changes.

Do not use Ink concepts like `<Static>`. For append-only feed performance, implement the same idea with a cached line buffer like `ChatFeed`: append new wrapped rows, trim to a max, and request render.

## 7. Layout

```text
ps · specialists · /home/dawid/dev/specialists
<main view fills available rows>
health OK rss=512MB cpu=3.1% · jobs 6 visible/42 total · running 2 waiting 1 · history default · ctx max 61% · tokens 184k
↑↓ nav  ↵ feed  r result  i inspect  h history  a all  / filter  tab repo  q quit
```

Rules:

- One top context line: view, repo name, repo path.
- Main area fills the viewport.
- One bottom StatsLine. It must use metrics the runtime already computes: process health, visible/total jobs, running/waiting counts, max context%, token/cost totals when available, node/worktree/epic counts.
- One bottom KeyBar, contextual to the current view.
- No empty rows.

## 8. Style contract

This style is intentionally terminal-native.

- No panels, boxes, bordered cards, sidebars, or decorative separators.
- Monospace rows with fixed-width padded columns.
- Continuous vertical rail for nesting. The current `sp ps` text uses `├─/└─`; console may use a subtler `│` rail, but it must represent the same grouping.
- One desaturated status color; all metadata stays gray.
- Selection is a muted background bar, not saturated color.
- KeyBar is plain text; key glyph brighter than descriptions.

Palette single source (`theme.ts`):

```ts
export const colors = {
  bg: '#181818', bright: '#e4e4e4', txt: '#c8c8c8', dim: '#7d7d7d',
  rail: '#3a3a3a', selected: '#262626',
  running: '#c39a5e', done: '#8caa6a', reviewing: '#9f88bf',
  waiting: '#8095a8', idle: '#4a4a4a', blocked: '#c4806f', error: '#c4806f',
};
```

Status glyphs should map from actual `SupervisorStatus.status`:

```text
running ●   waiting ◐   starting ◐   done ○   error ✕   cancelled ○   dead ✕
```

## 9. Keybindings

| Key | ProcessView | FeedView | JobView | ResultView |
|---|---|---|---|---|
| `↑↓` / `j k` | move selection | scroll | scroll | scroll |
| `Enter` | open feed replay/follow for selected job | - | - | - |
| `r` | open result for selected job | - | - | - |
| `i` | inspect selected job (`sp ps <id>` parity) | - | - | - |
| `h` | cycle default/history | - | - | - |
| `a` | toggle all audit rows | - | - | - |
| `Esc` / `←` / `Backspace` | - | back to ps | back to ps | back to ps |
| `f` | toggle dashboard follow | toggle feed follow for live jobs | - | - |
| `/` | filter visible jobs | - | - | - |
| `g` / `G` | top/end | top/end | top/end | top/end |
| `Tab` / `1-9` | switch repo | switch repo → ps | switch repo → ps | switch repo → ps |
| `q` | quit | quit | quit | quit |

## 10. Module sketch

```text
src/cli/console.ts          # command entry; creates TUI and RuntimeClient
src/cli/console/App.ts      # root component/router
src/cli/console/theme.ts    # colors, glyphs, widths, ANSI helpers
src/cli/console/store.ts    # reducer and actions
src/cli/console/client.ts   # RuntimeClient interface
src/cli/console/local.ts    # implementation via existing runtime modules + bd
src/cli/console/views/
  ProcessView.ts
  FeedView.ts
  JobView.ts
  ResultView.ts
  # post-v1: BeadsView.ts / BeadDetailView.ts
src/cli/console/components/
  Row.ts
  StatsLine.ts
  KeyBar.ts
```

## 11. Definition of done

- [ ] `sp console` uses `@earendil-works/pi-tui`, not Ink.
- [ ] ProcessView matches `sp ps` grouping, visibility rules, columns, and next actions.
- [ ] FeedView reads the DB-backed timeline and matches `sp feed` follow/cursor behavior.
- [ ] JobView matches `sp ps <id>` fields.
- [ ] ResultView mirrors `sp result` for done/waiting/running/error/cancelled jobs.
- [ ] V1 history modes cover default, terminal history, and all audit rows.
- [ ] `bd show` / full bead browser is explicitly post-v1, not required for traceability v1.
- [ ] StatsLine is one bottom line and contains only real runtime metrics.
- [ ] No substrate-only concepts appear in labels or mock data.
- [ ] All rows are width-safe (`truncateToWidth` / `wrapTextWithAnsi`).
- [ ] Palette, glyphs, and column widths live in one theme module.
