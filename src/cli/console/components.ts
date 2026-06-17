import {
  Key,
  matchesKey,
  truncateToWidth,
  wrapTextWithAnsi,
  type Component,
} from '@earendil-works/pi-tui';
import type { RuntimeClient, ConsoleJob } from './types.js';
import { formatDateTime } from './runtime.js';
import {
  currentRepo,
  initialConsoleState,
  reduceConsoleState,
  selectedJobRow,
  visibleSlice,
  type ConsoleState,
} from './view-model.js';
import {
  fillerLine,
  paint,
  renderBeadBodyLine,
  renderBeadField,
  renderConfigField,
  renderConfigSpecialistRow,
  renderDiffHunkHeader,
  renderDiffHunkLine,
  renderDiffSummaryRow,
  renderFilterPrompt,
  renderGroupRow,
  renderHeader,
  renderInspectField,
  renderJobRow,
  renderKeyBar,
  renderMessage,
  renderMeters,
  renderPlaceholder,
  renderResultFooter,
  renderResultTitle,
  renderSectionTitle,
  renderStatsLine,
  renderTabs,
  renderViewtag,
} from './theme.js';
import { applyFieldEdit, coerceFieldValue, formatConfigValue } from './config-source.js';
import { errorClassOf, logError, type ConsoleView as LogView } from './log.js';

const POLL_MS = 1500;
const COALESCE_MS = 50; // ~20Hz dispatch cap (spec §10)
const TOP_CHROME_ROWS = 4; // tabs + meters + viewtag + header
const BOTTOM_CHROME_ROWS = 2; // stats + keys
const CHROME_ROWS = TOP_CHROME_ROWS + BOTTOM_CHROME_ROWS;
const VIEWS: readonly string[] = ['ps', 'feed', 'job', 'result', 'bead', 'diff', 'config'];

interface ConsoleAppOptions {
  runtime: RuntimeClient;
  requestRender: () => void;
  stop: () => void;
  rows: () => number;
}

export class ConsoleApp implements Component {
  private state: ConsoleState = initialConsoleState();
  private timer: ReturnType<typeof setInterval> | null = null;
  private refreshInFlight = false;
  private disposed = false;
  private renderedDetailRows = 0;
  private lastWidth = 80;
  private lastSnapshotSig: string | undefined;
  private coalesceTimer: ReturnType<typeof setTimeout> | null = null;
  private resizeHandler: (() => void) | null = null;

  constructor(private readonly options: ConsoleAppOptions) {}

  async start(): Promise<void> {
    await this.loadRepos();
    await this.refresh();
    this.timer = setInterval(() => {
      void this.refresh();
    }, POLL_MS);
    this.resizeHandler = (): void => this.scheduleRender();
    try {
      process.stdout.on('resize', this.resizeHandler);
    } catch {
      // non-TTY contexts may throw — safe to ignore
    }
  }

  stop(): void {
    this.disposed = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.coalesceTimer) clearTimeout(this.coalesceTimer);
    this.coalesceTimer = null;
    if (this.resizeHandler) {
      try {
        process.stdout.off('resize', this.resizeHandler);
      } catch {
        // ignore
      }
      this.resizeHandler = null;
    }
  }

  invalidate(): void {}

  handleInput(data: string): void {
    if (matchesKey(data, Key.ctrl('c')) || data === 'q') {
      this.options.stop();
      return;
    }

    if (this.state.filtering) {
      if (matchesKey(data, Key.escape)) this.dispatch({ type: 'finishFilter', clear: true });
      else if (matchesKey(data, Key.enter)) this.dispatch({ type: 'finishFilter' });
      else if (matchesKey(data, Key.backspace)) this.dispatch({ type: 'filterBackspace' });
      else if (data.length === 1 && data >= ' ') this.dispatch({ type: 'filterChar', char: data });
      void this.refresh();
      return;
    }

    const viewportRows = this.mainViewportRows();
    const selected = selectedJobRow(this.state);
    const totalRows = this.state.view === 'ps' ? undefined : this.renderedDetailRows;
    // Views where vim-style paging chars (d/u/g/G) scroll; elsewhere they are
    // view-specific shortcuts: ps `d`=diff / `g`=config, config `u`=undo.
    // Key.pageDown/Key.pageUp keyboard events still fire everywhere.
    const isScrollView =
      this.state.view === 'feed' ||
      this.state.view === 'job' ||
      this.state.view === 'result' ||
      this.state.view === 'bead';

    if (matchesKey(data, Key.down) || data === 'j')
      this.dispatch({ type: 'move', delta: 1, viewportRows, totalRows });
    else if (matchesKey(data, Key.up) || data === 'k')
      this.dispatch({ type: 'move', delta: -1, viewportRows, totalRows });
    else if (matchesKey(data, Key.pageDown) || (data === 'd' && isScrollView))
      this.dispatch({ type: 'move', delta: Math.max(1, viewportRows - 1), viewportRows, totalRows });
    else if (matchesKey(data, Key.pageUp) || (data === 'u' && isScrollView))
      this.dispatch({ type: 'move', delta: -Math.max(1, viewportRows - 1), viewportRows, totalRows });
    else if (data === 'g' && isScrollView) this.dispatch({ type: 'top', viewportRows, totalRows });
    else if (data === 'G' && isScrollView) this.dispatch({ type: 'bottom', viewportRows, totalRows });
    else if (matchesKey(data, Key.enter) && this.state.view === 'ps' && selected)
      this.open('feed', selected.id);
    else if (data === 'r' && this.state.view === 'ps' && selected) this.open('result', selected.id);
    else if (data === 'i' && this.state.view === 'ps' && selected) this.open('job', selected.id);
    // 'b' opens BeadView. Decision (bd notes): shift+enter cannot be reliably distinguished
    // from enter in pi-tui input stream, so 'b' is the documented keybind.
    else if (data === 'b' && this.state.view === 'ps' && selected) this.open('bead', selected.id);
    else if (data === 'd' && this.state.view === 'ps' && selected) this.open('diff', selected.id);
    else if (data === 'g' && this.state.view === 'ps') this.open('config', selected?.id ?? '');
    else if (this.state.view === 'config' && this.state.configEdit.active) {
      this.handleConfigEditInput(data);
    } else if (data === 'r' && this.state.view === 'config') this.refreshAfter({ type: 'configRefresh' });
    else if (data === 'r' && this.state.view === 'diff') this.refreshAfter({ type: 'diffRefresh' });
    else if (data === 'e' && this.state.view === 'config') this.startConfigEdit();
    else if (data === 'u' && this.state.view === 'config') void this.undoConfigEdit();
    else if (data === 'b' && this.state.view === 'config') void this.openConfigInEditor();
    else if (data === '[' && this.state.view === 'config') this.cycleConfigSpecialist(-1);
    else if (data === ']' && this.state.view === 'config') this.cycleConfigSpecialist(1);
    else if (this.state.view === 'config' && (matchesKey(data, Key.backspace) || matchesKey(data, Key.escape) || matchesKey(data, Key.left))) {
      this.back();
    } else if (this.state.view === 'config' && (data === 'j' || matchesKey(data, Key.down))) {
      this.dispatch({ type: 'configCycleField', delta: 1 });
    } else if (this.state.view === 'config' && (data === 'k' || matchesKey(data, Key.up))) {
      this.dispatch({ type: 'configCycleField', delta: -1 });
    }
    else if (this.state.view === 'diff' && (matchesKey(data, Key.enter) || data === 'l' || matchesKey(data, Key.right))) {
      const idx = this.state.diff.selectedFileIndex;
      const entry = this.state.diff.summary?.entries[idx];
      if (this.state.diff.stage === 'summary' && entry && !entry.binary) {
        this.dispatch({ type: 'diffOpenFile', index: idx, path: entry.path });
        void this.refresh();
      }
    } else if (this.state.view === 'diff' && (data === 'j' || matchesKey(data, Key.down))) {
      this.dispatch({ type: 'diffMove', delta: 1, viewportRows: this.mainViewportRows(), totalRows: this.renderedDetailRows });
    } else if (this.state.view === 'diff' && (data === 'k' || matchesKey(data, Key.up))) {
      this.dispatch({ type: 'diffMove', delta: -1, viewportRows: this.mainViewportRows(), totalRows: this.renderedDetailRows });
    } else if (this.state.view === 'diff' && (matchesKey(data, Key.backspace) || matchesKey(data, Key.escape) || matchesKey(data, Key.left))) {
      this.dispatch({ type: 'diffBack' });
      void this.refresh();
    }
    else if (
      (matchesKey(data, Key.escape) || matchesKey(data, Key.backspace) || matchesKey(data, Key.left)) &&
      this.state.view !== 'ps'
    )
      this.back();
    else if (data === 'h' && this.state.view === 'ps') this.refreshAfter({ type: 'cycleHistory' });
    else if (data === 'a' && this.state.view === 'ps') this.refreshAfter({ type: 'toggleAll' });
    else if (data === 'c' && this.state.view === 'ps') this.refreshAfter({ type: 'toggleCleaned' });
    else if (data === '/' && this.state.view === 'ps') this.dispatch({ type: 'startFilter' });
    else if (data === 'f' && this.state.view === 'feed') this.refreshAfter({ type: 'toggleFollow' });
    else if (data === 't' && this.state.view === 'feed') this.refreshAfter({ type: 'toggleFeedSource' });
    else if (matchesKey(data, Key.tab)) this.refreshAfter({ type: 'nextRepo' });
    else if (/^[1-9]$/.test(data)) this.refreshAfter({ type: 'selectRepo', index: Number(data) - 1 });
  }

  render(width: number): string[] {
    this.lastWidth = width;
    const height = Math.max(1, this.options.rows());
    const repo = currentRepo(this.state);
    const lines: string[] = [];
    lines.push(renderTabs(this.state.repos, this.state.repoIndex, width));
    lines.push(renderMeters(this.metersInput(), width));
    lines.push(renderViewtag(VIEWS, this.state.view, width));
    lines.push(
      renderHeader(
        this.detailJobLabel() ?? this.state.view,
        repo?.name ?? 'specialists',
        repo?.path ?? process.cwd(),
        width,
      ),
    );

    const viewportRows = this.mainViewportRows();
    const mainRows = this.renderMain(width, viewportRows).slice(0, viewportRows);
    while (mainRows.length < viewportRows) mainRows.push(fillerLine(width));
    lines.push(...mainRows);

    lines.push(renderStatsLine(this.state.snapshot, width));
    lines.push(renderKeyBar(this.state.view, this.state.follow, width, this.state.feedSource));
    if (this.state.filtering) lines.push(renderFilterPrompt(`/${this.state.filter}_`, width));
    if (this.state.message) lines.push(renderMessage(this.state.message, width));
    return fitFrame(lines, width, height);
  }

  private metersInput() {
    const snap = this.state.snapshot;
    const active = snap ? snap.runningJobs : 0;
    const activeTotal = snap ? snap.totalJobs : 0;
    // leases + budget read from ~/.config/specialists/user.json in Phase 6;
    // Phase 1 normative stub per bead NOTES.
    return { active, activeTotal, leases: 1, leaseCapacity: 4, budgetPct: 61 };
  }

  private async loadRepos(): Promise<void> {
    try {
      const repos = await this.options.runtime.listRepos();
      this.dispatch({ type: 'reposLoaded', repos });
    } catch (error) {
      this.dispatch({ type: 'message', message: error instanceof Error ? error.message : String(error) });
    }
  }

  private async refresh(): Promise<void> {
    if (this.refreshInFlight || this.disposed) return;
    this.refreshInFlight = true;
    try {
      const repo = currentRepo(this.state);
      if (!repo) return;
      let snapshot;
      try {
        snapshot = await this.options.runtime.listProcessSnapshot(repo, {
          historyMode: this.state.historyMode,
          includeCleaned: this.state.includeCleaned,
          textFilter: this.state.filter,
        });
      } catch (error) {
        logError(this.logViewKey(), 'list_processes', { errorClass: errorClassOf(error) });
        this.dispatch({ type: 'message', message: 'snapshot read failed — runtime unreachable' });
        return;
      }
      // Snapshot dispatch coalesce: skip when nothing changed.
      const sig = this.snapshotSignature(snapshot);
      if (sig !== this.lastSnapshotSig) {
        this.lastSnapshotSig = sig;
        this.dispatch({ type: 'snapshotLoaded', snapshot });
      }

      if (this.state.view === 'feed' && this.state.selectedJobId) {
        const rows = await this.options.runtime.readFeed({
          repo,
          jobId: this.state.selectedJobId,
          limit: 250,
          source: this.state.feedSource,
        });
        this.dispatch({
          type: 'feedLoaded',
          rows,
          totalRows: this.feedLines(rows, this.lastWidth).length,
          viewportRows: this.mainViewportRows(),
        });
      } else if (this.state.view === 'job' && this.state.selectedJobId) {
        this.dispatch({
          type: 'jobLoaded',
          inspect: await this.options.runtime.inspectJob(repo, this.state.selectedJobId),
        });
      } else if (this.state.view === 'result' && this.state.selectedJobId) {
        this.dispatch({
          type: 'resultLoaded',
          result: await this.options.runtime.readResult(repo, this.state.selectedJobId),
        });
      } else if (this.state.view === 'bead' && this.state.selectedJobId) {
        const [doc, live] = await Promise.all([
          this.options.runtime.linkedDetail(repo, this.state.selectedJobId),
          this.options.runtime.liveStateFor(repo, this.state.selectedJobId),
        ]);
        this.dispatch({ type: 'beadLoaded', doc, live });
      } else if (this.state.view === 'config') {
        const snapshot = await this.options.runtime.readGlobalConfig();
        this.dispatch({ type: 'configLoaded', snapshot });
      } else if (this.state.view === 'diff' && this.state.selectedJobId) {
        if (this.state.diff.stage === 'summary') {
          const summary = await this.options.runtime.diffSummary(repo, this.state.selectedJobId);
          this.dispatch({ type: 'diffSummaryLoaded', summary });
        } else if (this.state.diff.filePath) {
          const file = await this.options.runtime.diffFile(repo, this.state.selectedJobId, this.state.diff.filePath);
          this.dispatch({ type: 'diffFileLoaded', file });
        }
      }
    } catch (error) {
      logError(this.logViewKey(), 'render', { errorClass: errorClassOf(error) });
      this.dispatch({ type: 'message', message: error instanceof Error ? error.message : String(error) });
    } finally {
      this.refreshInFlight = false;
      this.scheduleRender();
    }
  }

  private logViewKey(): LogView {
    return this.state.view as LogView;
  }

  // Cheap snapshot signature: sort job ids + statuses + ctxPct. Used by the
  // poll loop to drop no-op dispatches that would force a re-render.
  private snapshotSignature(snapshot: { jobs: Array<{ id: string; status?: string; context_pct?: number }>; totalJobs: number; visibleJobs: number }): string {
    const ids = snapshot.jobs
      .map((j) => `${j.id}:${j.status ?? '-'}:${j.context_pct === undefined ? '-' : Math.round(j.context_pct)}`)
      .sort()
      .join('|');
    return `${snapshot.totalJobs}/${snapshot.visibleJobs}#${ids}`;
  }

  private dispatch(action: Parameters<typeof reduceConsoleState>[1]): void {
    this.state = reduceConsoleState(this.state, action);
    this.scheduleRender();
  }

  // Coalesce frequent re-render requests into one paint per ~50ms tick
  // (spec §10: feed dispatch coalesces bursts ≤ 20Hz).
  private scheduleRender(): void {
    if (this.coalesceTimer || this.disposed) return;
    this.coalesceTimer = setTimeout(() => {
      this.coalesceTimer = null;
      if (this.disposed) return;
      this.options.requestRender();
    }, COALESCE_MS);
  }

  private refreshAfter(action: Parameters<typeof reduceConsoleState>[1]): void {
    this.dispatch(action);
    void this.refresh();
  }

  private open(view: 'feed' | 'job' | 'result' | 'bead' | 'diff' | 'config', jobId: string): void {
    this.dispatch({ type: 'open', view, jobId });
    void this.refresh();
  }

  private back(): void {
    this.dispatch({ type: 'back' });
    void this.refresh();
  }

  private renderMain(width: number, viewportRows: number): string[] {
    if (this.state.view === 'ps') return this.renderProcessRows(width, viewportRows);
    if (this.state.view === 'feed') return this.renderFeedRows(width, viewportRows);
    if (this.state.view === 'job') return this.renderJobRows(width, viewportRows);
    if (this.state.view === 'bead') return this.renderBeadRows(width, viewportRows);
    if (this.state.view === 'diff') return this.renderDiffRows(width, viewportRows);
    if (this.state.view === 'config') return this.renderConfigRows(width, viewportRows);
    return this.renderResultRows(width, viewportRows);
  }

  private cycleConfigSpecialist(delta: number): void {
    const snapshot = this.state.config;
    if (!snapshot || snapshot.specialists.length === 0) return;
    const names = snapshot.specialists.map((s) => s.name);
    const current = this.state.configSelectedSpecialist ?? names[0];
    const idx = Math.max(0, names.indexOf(current ?? ''));
    const next = Math.max(0, Math.min(names.length - 1, idx + delta));
    const name = names[next];
    if (name) this.dispatch({ type: 'configSelectSpecialist', name });
  }

  private selectedConfigField(): { specialist: string; fieldPath: string } | undefined {
    const snapshot = this.state.config;
    if (!snapshot) return undefined;
    const specialist = snapshot.specialists.find((s) => s.name === this.state.configSelectedSpecialist);
    if (!specialist) return undefined;
    const field = specialist.fields[this.state.configSelectedFieldIndex];
    if (!field) return undefined;
    return { specialist: specialist.name, fieldPath: field.path };
  }

  private startConfigEdit(): void {
    const target = this.selectedConfigField();
    if (!target) return;
    this.dispatch({
      type: 'configEditStart',
      specialist: target.specialist,
      fieldPath: target.fieldPath,
      expectedMtimeMs: this.state.configRawMtimeMs,
    });
  }

  private handleConfigEditInput(data: string): void {
    if (matchesKey(data, Key.escape)) {
      this.dispatch({ type: 'configEditCancel' });
      return;
    }
    if (matchesKey(data, Key.enter)) {
      void this.submitConfigEdit();
      return;
    }
    if (matchesKey(data, Key.backspace)) {
      this.dispatch({ type: 'configEditBackspace' });
      return;
    }
    if (data.length === 1 && data >= ' ' && data !== '\x7f') {
      this.dispatch({ type: 'configEditChar', char: data });
    }
  }

  private async submitConfigEdit(): Promise<void> {
    const edit = this.state.configEdit;
    if (!edit.active || !edit.specialist || !edit.fieldPath) return;
    const coerce = coerceFieldValue(edit.fieldPath, edit.buffer);
    if (!coerce.ok) {
      this.dispatch({ type: 'configEditError', error: coerce.error ?? 'invalid input' });
      return;
    }
    try {
      const { raw, mtimeMs } = await this.options.runtime.readRawGlobalConfig();
      const prevRaw = structuredCloneCompat(raw);
      const candidate = applyFieldEdit(raw, edit.specialist, edit.fieldPath, coerce.value);
      const outcome = await this.options.runtime.writeGlobalConfig(candidate, edit.expectedMtimeMs ?? mtimeMs);
      if (!outcome.ok) {
        const msg = outcome.errorClass === 'mtime_mismatch'
          ? 'user.json changed on disk — press `r` to refresh'
          : outcome.errors && outcome.errors[0]
            ? `${outcome.errors[0].path}: ${outcome.errors[0].message}`
            : `write failed (${outcome.errorClass ?? 'unknown'})`;
        this.dispatch({ type: 'configEditError', error: msg });
        return;
      }
      const nextSnapshot = await this.options.runtime.readGlobalConfig();
      const next = await this.options.runtime.readRawGlobalConfig();
      this.dispatch({
        type: 'configEditCommit',
        nextSnapshot,
        rawMtimeMs: next.mtimeMs,
        prevRaw,
      });
    } catch (error) {
      this.dispatch({
        type: 'configEditError',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async undoConfigEdit(): Promise<void> {
    const stack = this.state.configUndoStack;
    if (stack.length === 0) return;
    const target = stack[0]!;
    try {
      const outcome = await this.options.runtime.writeGlobalConfig(target);
      if (!outcome.ok) return;
      const restoredSnapshot = await this.options.runtime.readGlobalConfig();
      const next = await this.options.runtime.readRawGlobalConfig();
      this.dispatch({ type: 'configUndo', restoredSnapshot, rawMtimeMs: next.mtimeMs });
    } catch {
      // swallow — undo is best-effort
    }
  }

  private async openConfigInEditor(): Promise<void> {
    await this.options.runtime.openConfigInEditor();
    this.refreshAfter({ type: 'configRefresh' });
  }

  private renderConfigRows(width: number, viewportRows: number): string[] {
    const snapshot = this.state.config;
    if (this.state.configLoading || !snapshot) {
      this.renderedDetailRows = 1;
      return [renderPlaceholder('loading config…', width)];
    }
    const rows: string[] = [];
    rows.push(renderPlaceholder(`path: ${snapshot.displayPath} (${snapshot.source})`, width));
    if (!snapshot.exists) {
      rows.push(renderPlaceholder('no user.json — run `sp init --global` to create', width));
      this.renderedDetailRows = rows.length;
      return visibleSlice(rows, 0, viewportRows).map((row) => truncateToWidth(row, width));
    }
    if (snapshot.parseError) {
      rows.push(renderPlaceholder(snapshot.parseError, width));
      this.renderedDetailRows = rows.length;
      return visibleSlice(rows, 0, viewportRows).map((row) => truncateToWidth(row, width));
    }
    rows.push(renderSectionTitle('specialists', width));
    const selectedName = this.state.configSelectedSpecialist ?? snapshot.specialists[0]?.name;
    snapshot.specialists.forEach((s) => {
      rows.push(renderConfigSpecialistRow(s.name, s.hasOverride, s.name === selectedName, width));
    });
    const selected = snapshot.specialists.find((s) => s.name === selectedName);
    if (selected) {
      rows.push(renderSectionTitle(`${selected.name} · fields`, width));
      selected.fields.forEach((field, idx) => {
        const isInherit = field.value === undefined || field.value === null;
        const fieldSelected = idx === this.state.configSelectedFieldIndex;
        const cursor = fieldSelected ? '›' : ' ';
        const row = renderConfigField(
          field.path,
          formatConfigValue(field.value),
          field.allowedHint,
          width - 2,
          { isOverride: field.isOverride, isInherit },
        );
        rows.push(`${cursor} ${row}`);
        if (this.state.configEdit.active
          && this.state.configEdit.fieldPath === field.path
          && this.state.configEdit.specialist === selected.name) {
          rows.push(renderPlaceholder(`  edit > ${this.state.configEdit.buffer}_`, width));
          if (this.state.configEdit.error) {
            rows.push(renderPlaceholder(`  ! ${this.state.configEdit.error}`, width));
          }
        }
      });
      if (selected.blockedWarnings.length > 0) {
        rows.push(renderSectionTitle('blocked-field warnings', width));
        for (const warn of selected.blockedWarnings) rows.push(renderPlaceholder(warn, width));
      }
    }
    if (snapshot.validationErrors.length > 0) {
      rows.push(renderSectionTitle('validation errors', width));
      for (const err of snapshot.validationErrors.slice(0, 5)) {
        rows.push(renderPlaceholder(`${err.path}: ${err.message}`, width));
      }
    }
    this.renderedDetailRows = rows.length;
    const maxScroll = Math.max(0, rows.length - Math.max(1, viewportRows));
    const scroll = Math.max(0, Math.min(this.state.configScroll, maxScroll));
    return visibleSlice(rows, scroll, viewportRows).map((row) => truncateToWidth(row, width));
  }

  private renderDiffRows(width: number, viewportRows: number): string[] {
    const diff = this.state.diff;
    if (diff.loading) {
      this.renderedDetailRows = 1;
      return [renderPlaceholder('loading diff…', width)];
    }
    if (diff.stage === 'summary') {
      if (diff.error || !diff.summary || diff.summary.entries.length === 0) {
        const msg = diff.error ?? diff.summary?.error ?? 'no changes in worktree';
        this.renderedDetailRows = 2;
        return [
          renderSectionTitle('diff summary', width),
          renderPlaceholder(msg, width),
        ];
      }
      const rows = [renderSectionTitle('diff summary', width)];
      diff.summary.entries.forEach((entry, idx) => {
        rows.push(renderDiffSummaryRow(entry, width, idx === diff.selectedFileIndex));
      });
      this.renderedDetailRows = rows.length;
      return visibleSlice(rows, 0, viewportRows).map((row) => truncateToWidth(row, width));
    }
    // file stage
    const file = diff.fileDoc;
    if (!file) {
      this.renderedDetailRows = 1;
      return [renderPlaceholder('loading file…', width)];
    }
    if (file.error) {
      this.renderedDetailRows = 1;
      return [renderPlaceholder(file.error, width)];
    }
    const rows: string[] = [renderSectionTitle(file.path, width)];
    if (file.binary) {
      rows.push(renderPlaceholder('binary file (no diff rendered)', width));
    } else {
      for (const h of file.hunks) {
        rows.push(renderDiffHunkHeader(h.header, width));
        for (const ln of h.lines) rows.push(renderDiffHunkLine(ln.kind, ln.text, width));
      }
      if (file.truncated) {
        rows.push(renderPlaceholder(`… truncated (${Math.round((file.totalLines ?? 0) / 1000)}k lines) — press r to re-load`, width));
      }
    }
    this.renderedDetailRows = rows.length;
    return visibleSlice(rows, diff.fileScroll, viewportRows).map((row) => truncateToWidth(row, width));
  }

  private renderBeadRows(width: number, viewportRows: number): string[] {
    if (this.state.beadLoading) {
      this.renderedDetailRows = 1;
      return [renderPlaceholder('loading bead…', width)];
    }
    const doc = this.state.beadDoc;
    const live = this.state.beadLive;
    const rows: string[] = [];
    if (doc?.error) {
      rows.push(renderPlaceholder(doc.error, width));
    } else if (doc) {
      for (const f of doc.fields) rows.push(renderBeadField(f.key, f.value, width));
    }
    rows.push(renderSectionTitle('live state', width));
    if (live?.error) {
      rows.push(renderPlaceholder(live.error, width));
    } else if (live && live.rows.length > 0) {
      for (const r of live.rows) rows.push(renderBeadField(r.key, r.value, width));
    } else {
      rows.push(renderPlaceholder('no live state — job terminated', width));
    }
    if (doc && !doc.error) {
      for (const section of doc.sections) {
        rows.push(renderSectionTitle(section.title, width));
        for (const line of section.body.split('\n')) {
          rows.push(renderBeadBodyLine(line || ' ', width));
        }
      }
    }
    this.renderedDetailRows = rows.length;
    const maxScroll = Math.max(0, rows.length - Math.max(1, viewportRows));
    const scroll = Math.max(0, Math.min(this.state.scroll, maxScroll));
    return visibleSlice(rows, scroll, viewportRows).map((row) => truncateToWidth(row, width));
  }

  private renderProcessRows(width: number, viewportRows: number): string[] {
    const rows = this.state.snapshot?.rows ?? [];
    if (rows.length === 0) return [renderPlaceholder('no jobs match current filters', width)];
    return visibleSlice(rows, this.state.scroll, viewportRows).map((row, offset) => {
      const index = this.state.scroll + offset;
      if (row.kind === 'group') {
        // legacy group rows from runtime.ts still pass {kind:'group', label, depth}
        return renderGroupRow('label', row.label, width, row.depth);
      }
      const selected = index === this.state.selectedRow;
      const job = row.job;
      const datePrefix =
        this.state.historyMode === 'default' ? '' : `${formatDateTime(job.started_at_ms)} `;
      // datePrefix is rendered through theme via paint() to keep the no-raw-ANSI invariant.
      // Per-row try/catch is a backstop for any future render-time drift; the
      // upstream isWellFormedJob filter + theme.ts:asString coercion should
      // make this branch dead code in practice. (unitAI-ctb4u.27)
      try {
        if (datePrefix) {
          const base = renderJobRow(job, Math.max(1, width - datePrefix.length), row.depth, selected);
          return truncateToWidth(paint(datePrefix, 'dim') + base, width);
        }
        return renderJobRow(job, width, row.depth, selected);
      } catch (error) {
        logError(this.logViewKey(), 'render', { errorClass: errorClassOf(error) });
        return renderPlaceholder('  ?? <malformed row dropped>', width);
      }
    });
  }

  private renderFeedRows(width: number, viewportRows: number): string[] {
    const lines = this.feedLines(this.state.feedRows, width);
    const rows = lines.length > 0 ? lines : [renderPlaceholder('no feed events found', width)];
    this.renderedDetailRows = rows.length;
    const maxScroll = Math.max(0, rows.length - Math.max(1, viewportRows));
    const scroll = this.state.follow
      ? maxScroll
      : Math.max(0, Math.min(this.state.scroll, maxScroll));
    return [...visibleSlice(rows, scroll, viewportRows)];
  }

  private renderJobRows(width: number, viewportRows: number): string[] {
    const inspect = this.state.jobInspect;
    if (!inspect) {
      this.renderedDetailRows = 1;
      return [renderPlaceholder('loading job inspect…', width)];
    }
    const rows = [
      renderSectionTitle('inspect', width),
      ...inspect.fields.map((field) => renderInspectField(field.label, field.value, width)),
      renderSectionTitle('actions', width),
      renderPlaceholder(inspect.actions.join(' | ') || 'none', width),
    ];
    this.renderedDetailRows = rows.length;
    return visibleSlice(rows, this.state.scroll, viewportRows).map((row) => truncateToWidth(row, width));
  }

  private renderResultRows(width: number, viewportRows: number): string[] {
    const result = this.state.jobResult;
    if (!result) {
      this.renderedDetailRows = 1;
      return [renderPlaceholder('loading result…', width)];
    }
    const rows = [
      renderResultTitle(result.title, width),
      renderSectionTitle('output', width),
      ...wrapTextWithAnsi(result.output, width),
      renderSectionTitle('footer', width),
      renderResultFooter(result.footer, width),
    ];
    this.renderedDetailRows = rows.length;
    const maxScroll = Math.max(0, rows.length - Math.max(1, viewportRows));
    const scroll = Math.max(0, Math.min(this.state.scroll, maxScroll));
    return visibleSlice(rows, scroll, viewportRows).map((row) => truncateToWidth(row, width));
  }

  private feedLines(rows: readonly { line: string }[], width: number): string[] {
    return rows.flatMap((row) => wrapTextWithAnsi(row.line, width));
  }

  private detailJobLabel(): string | undefined {
    if (this.state.view === 'ps' || !this.state.selectedJobId) return undefined;
    const job = this.findSelectedJob();
    const specialist = job?.specialist ?? 'specialist';
    if (this.state.view === 'bead') {
      const beadId = job?.bead_id ?? this.state.beadDoc?.beadId ?? '(unlinked)';
      return `bead · ${beadId}`;
    }
    if (this.state.view === 'feed') {
      return `feed · ${specialist}:${this.state.selectedJobId} · ${this.state.feedSource}`;
    }
    return `${this.state.view} · ${specialist}:${this.state.selectedJobId}`;
  }

  private findSelectedJob(): ConsoleJob | undefined {
    const id = this.state.selectedJobId;
    if (!id) return undefined;
    return (
      this.state.snapshot?.jobs.find((job) => job.id.startsWith(id)) ??
      this.state.jobInspect?.job ??
      this.state.jobResult?.job ??
      undefined
    );
  }

  private mainViewportRows(): number {
    const overhead = CHROME_ROWS + (this.state.filtering ? 1 : 0) + (this.state.message ? 1 : 0);
    return Math.max(1, this.options.rows() - overhead);
  }
}

function structuredCloneCompat<T>(value: T): T {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

export function fitFrame(lines: string[], width: number, height: number): string[] {
  const frame = lines.slice(0, height).map((line) => truncateToWidth(line, width));
  while (frame.length < height) frame.push(fillerLine(width));
  return frame;
}
