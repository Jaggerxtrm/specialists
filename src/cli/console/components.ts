import { Key, matchesKey, truncateToWidth, wrapTextWithAnsi, type Component } from '@earendil-works/pi-tui';
import { bold, cyan, dim, green, magenta, red, yellow } from '../format-helpers.js';
import type { RuntimeClient, ConsoleJob } from './types.js';
import { formatDateTime } from './runtime.js';
import { currentRepo, initialConsoleState, reduceConsoleState, selectedJobRow, visibleSlice, type ConsoleState } from './view-model.js';

const POLL_MS = 1000;

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

  constructor(private readonly options: ConsoleAppOptions) {}

  async start(): Promise<void> {
    await this.loadRepos();
    await this.refresh();
    this.timer = setInterval(() => {
      void this.refresh();
    }, POLL_MS);
  }

  stop(): void {
    this.disposed = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
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

    if (matchesKey(data, Key.down) || data === 'j') this.dispatch({ type: 'move', delta: 1, viewportRows, totalRows });
    else if (matchesKey(data, Key.up) || data === 'k') this.dispatch({ type: 'move', delta: -1, viewportRows, totalRows });
    else if (matchesKey(data, Key.pageDown) || data === 'd') this.dispatch({ type: 'move', delta: Math.max(1, viewportRows - 1), viewportRows, totalRows });
    else if (matchesKey(data, Key.pageUp) || data === 'u') this.dispatch({ type: 'move', delta: -Math.max(1, viewportRows - 1), viewportRows, totalRows });
    else if (data === 'g') this.dispatch({ type: 'top', viewportRows, totalRows });
    else if (data === 'G') this.dispatch({ type: 'bottom', viewportRows, totalRows });
    else if (matchesKey(data, Key.enter) && this.state.view === 'ps' && selected) this.open('feed', selected.id);
    else if (data === 'r' && this.state.view === 'ps' && selected) this.open('result', selected.id);
    else if (data === 'i' && this.state.view === 'ps' && selected) this.open('job', selected.id);
    else if ((matchesKey(data, Key.escape) || matchesKey(data, Key.backspace) || matchesKey(data, Key.left)) && this.state.view !== 'ps') this.back();
    else if (data === 'h' && this.state.view === 'ps') this.refreshAfter({ type: 'cycleHistory' });
    else if (data === 'a' && this.state.view === 'ps') this.refreshAfter({ type: 'toggleAll' });
    else if (data === 'c' && this.state.view === 'ps') this.refreshAfter({ type: 'toggleCleaned' });
    else if (data === '/' && this.state.view === 'ps') this.dispatch({ type: 'startFilter' });
    else if (data === 'f' && this.state.view === 'feed') this.refreshAfter({ type: 'toggleFollow' });
    else if (matchesKey(data, Key.tab)) this.refreshAfter({ type: 'nextRepo' });
    else if (/^[1-9]$/.test(data)) this.refreshAfter({ type: 'selectRepo', index: Number(data) - 1 });
  }

  render(width: number): string[] {
    this.lastWidth = width;
    const height = Math.max(1, this.options.rows());
    const repo = currentRepo(this.state);
    const lines = [this.headerLine(width, repo)];
    const viewportRows = this.mainViewportRows();
    const mainRows = this.renderMain(width, viewportRows).slice(0, viewportRows);
    while (mainRows.length < viewportRows) mainRows.push('');
    lines.push(...mainRows);
    lines.push(this.statsLine(width));
    lines.push(this.keysLine(width));
    if (this.state.filtering) lines.push(truncateToWidth(`/${this.state.filter}_`, width));
    if (this.state.message) lines.push(truncateToWidth(yellow(this.state.message), width));
    return fitFrame(lines, width, height);
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
      const snapshot = await this.options.runtime.listProcessSnapshot(repo, {
        historyMode: this.state.historyMode,
        includeCleaned: this.state.includeCleaned,
        textFilter: this.state.filter,
      });
      this.dispatch({ type: 'snapshotLoaded', snapshot });

      if (this.state.view === 'feed' && this.state.selectedJobId) {
        const rows = await this.options.runtime.readFeed({ repo, jobId: this.state.selectedJobId, limit: 250 });
        this.dispatch({ type: 'feedLoaded', rows, totalRows: this.feedLines(rows, this.lastWidth).length, viewportRows: this.mainViewportRows() });
      } else if (this.state.view === 'job' && this.state.selectedJobId) {
        this.dispatch({ type: 'jobLoaded', inspect: await this.options.runtime.inspectJob(repo, this.state.selectedJobId) });
      } else if (this.state.view === 'result' && this.state.selectedJobId) {
        this.dispatch({ type: 'resultLoaded', result: await this.options.runtime.readResult(repo, this.state.selectedJobId) });
      }
    } catch (error) {
      this.dispatch({ type: 'message', message: error instanceof Error ? error.message : String(error) });
    } finally {
      this.refreshInFlight = false;
      this.options.requestRender();
    }
  }

  private dispatch(action: Parameters<typeof reduceConsoleState>[1]): void {
    this.state = reduceConsoleState(this.state, action);
    this.options.requestRender();
  }

  private refreshAfter(action: Parameters<typeof reduceConsoleState>[1]): void {
    this.dispatch(action);
    void this.refresh();
  }

  private open(view: 'feed' | 'job' | 'result', jobId: string): void {
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
    return this.renderResultRows(width, viewportRows);
  }

  private renderProcessRows(width: number, viewportRows: number): string[] {
    const rows = this.state.snapshot?.rows ?? [];
    if (rows.length === 0) return [dim('no jobs match current filters')];
    return visibleSlice(rows, this.state.scroll, viewportRows).map((row, offset) => {
      const index = this.state.scroll + offset;
      if (row.kind === 'group') return truncateToWidth(`${'  '.repeat(row.depth)}${cyan(row.label)}`, width);
      const selected = index === this.state.selectedRow;
      const marker = selected ? '›' : ' ';
      const job = row.job;
      const status = colorStatus(job.status, job.is_dead);
      const ctx = job.context_pct === undefined ? '--' : `${Math.round(job.context_pct)}%${job.context_health === 'WARN' || job.context_health === 'CRITICAL' ? '▲' : ''}`;
      const elapsed = job.elapsed_s === undefined ? '--' : formatShortElapsed(job.elapsed_s);
      const datePrefix = this.state.historyMode === 'default' ? '' : `${formatDateTime(job.started_at_ms)} `;
      const metrics = [job.metrics?.turns ? `${job.metrics.turns}t` : null, job.metrics?.tool_calls ? `${job.metrics.tool_calls}tc` : null, job.metrics?.token_usage?.total_tokens ? `${job.metrics.token_usage.total_tokens}tok` : null].filter(Boolean).join('·');
      const bead = job.bead_id ?? '';
      const title = job.bead_title ? ` ${dim(job.bead_title)}` : '';
      const line = `${marker} ${'  '.repeat(row.depth)}${datePrefix}${statusIcon(job)} ${job.id.padEnd(8)} ${job.specialist.slice(0, 13).padEnd(13)} ${status.padEnd(18)} ${ctx.padStart(4)} ${elapsed}${metrics ? ` ${dim(metrics)}` : ''} ${dim((job.payload_kb ?? '--').padEnd(8))} ${dim((job.payload_tokens ?? '--').padEnd(8))} ${dim(bead.padEnd(14))} ${dim(job.next_action ?? '')}${title}`;
      return truncateToWidth(line, width);
    });
  }

  private renderFeedRows(width: number, viewportRows: number): string[] {
    const lines = this.feedLines(this.state.feedRows, width);
    const rows = lines.length > 0 ? lines : [dim('no feed events found')];
    this.renderedDetailRows = rows.length;
    const maxScroll = Math.max(0, rows.length - Math.max(1, viewportRows));
    const scroll = this.state.follow ? maxScroll : Math.max(0, Math.min(this.state.scroll, maxScroll));
    return [...visibleSlice(rows, scroll, viewportRows)];
  }

  private renderJobRows(width: number, viewportRows: number): string[] {
    const inspect = this.state.jobInspect;
    if (!inspect) {
      this.renderedDetailRows = 1;
      return [dim('loading job inspect…')];
    }
    const rows = [
      ...inspect.fields.map((field) => `${field.label.padEnd(16)} ${field.value}`),
      '',
      dim(`actions: ${inspect.actions.join(' | ') || 'none'}`),
    ];
    this.renderedDetailRows = rows.length;
    return visibleSlice(rows, this.state.scroll, viewportRows).map((row) => truncateToWidth(row, width));
  }

  private renderResultRows(width: number, viewportRows: number): string[] {
    const result = this.state.jobResult;
    if (!result) {
      this.renderedDetailRows = 1;
      return [dim('loading result…')];
    }
    const rows = [bold(result.title), '', ...wrapTextWithAnsi(result.output, width), '', dim(result.footer)];
    this.renderedDetailRows = rows.length;
    const maxScroll = Math.max(0, rows.length - Math.max(1, viewportRows));
    const scroll = Math.max(0, Math.min(this.state.scroll, maxScroll));
    return visibleSlice(rows, scroll, viewportRows).map((row) => truncateToWidth(row, width));
  }

  private feedLines(rows: readonly { line: string }[], width: number): string[] {
    return rows.flatMap((row) => wrapTextWithAnsi(row.line, width));
  }

  private headerLine(width: number, repo = currentRepo(this.state)): string {
    const viewLabel = this.detailJobLabel() ?? this.state.view;
    return truncateToWidth(`${viewLabel} · ${repo?.name ?? 'specialists'} · ${repo?.path ?? process.cwd()}`, width);
  }

  private detailJobLabel(): string | undefined {
    if (this.state.view === 'ps' || !this.state.selectedJobId) return undefined;
    const job = this.findSelectedJob();
    const specialist = job?.specialist ?? 'specialist';
    return `${this.state.view} · ${specialist}:${this.state.selectedJobId}`;
  }

  private findSelectedJob(): ConsoleJob | undefined {
    const id = this.state.selectedJobId;
    if (!id) return undefined;
    return this.state.snapshot?.jobs.find((job) => job.id.startsWith(id))
      ?? this.state.jobInspect?.job
      ?? this.state.jobResult?.job
      ?? undefined;
  }

  private statsLine(width: number): string {
    const snapshot = this.state.snapshot;
    if (!snapshot) return truncateToWidth(dim('health -- · jobs --'), width);
    const health = snapshot.health;
    const healthStatus = health?.status ?? '--';
    const rss = health ? `${(health.totalRssBytes / (1024 * 1024)).toFixed(0)}MB` : '--';
    const cpu = health ? `${health.totalCpuPct.toFixed(1)}%` : '--';
    const ctx = snapshot.maxContextPct === undefined ? '--' : `${Math.round(snapshot.maxContextPct)}%`;
    const tokens = snapshot.totalTokens > 0 ? `${snapshot.totalTokens}` : '--';
    const line = `health ${healthStatus} rss=${rss} cpu=${cpu} · jobs ${snapshot.visibleJobs} visible/${snapshot.totalJobs} total · running ${snapshot.runningJobs} waiting ${snapshot.waitingJobs} · history ${snapshot.filter.historyMode}${snapshot.filter.includeCleaned ? '+cleaned' : ''} · epics ${snapshot.epics} nodes ${snapshot.nodes} worktrees ${snapshot.worktrees} · ctx max ${ctx} · tokens ${tokens} · orphans ${health?.orphanCount ?? 0}`;
    return truncateToWidth(dim(line), width);
  }

  private keysLine(width: number): string {
    const line = this.state.view === 'ps'
      ? '↑↓ nav  ↵ feed  r result  i inspect  h history  a all  c cleaned  / filter  tab repo  q quit'
      : this.state.view === 'feed'
        ? `↑↓ scroll  PgUp/PgDn page  f follow:${this.state.follow ? 'on' : 'off'}  ⌫ back  g/G top/end  q quit`
        : '↑↓ scroll  ⌫ back  g/G top/end  q quit';
    return truncateToWidth(line, width);
  }

  private mainViewportRows(): number {
    const overhead = 3 + (this.state.filtering ? 1 : 0) + (this.state.message ? 1 : 0);
    return Math.max(1, this.options.rows() - overhead);
  }
}

export function fitFrame(lines: string[], width: number, height: number): string[] {
  const frame = lines.slice(0, height).map((line) => truncateToWidth(line, width));
  while (frame.length < height) frame.push('');
  return frame;
}

function colorStatus(status: string, dead?: boolean): string {
  if (dead) return red('dead');
  if (status === 'running') return green(status);
  if (status === 'waiting') return magenta(status);
  if (status === 'starting') return yellow(status);
  if (status === 'error') return red(status);
  if (status === 'done') return dim(status);
  return status;
}

function statusIcon(job: { status: string; is_dead?: boolean }): string {
  if (job.is_dead) return red('◉');
  if (job.status === 'running') return cyan('◉');
  if (job.status === 'waiting') return magenta('◐');
  if (job.status === 'starting') return yellow('◐');
  if (job.status === 'done') return green('○');
  if (job.status === 'error') return red('○');
  return dim('○');
}

function formatShortElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}m${String(remainder).padStart(2, '0')}s`;
}

