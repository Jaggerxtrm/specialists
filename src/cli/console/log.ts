// Single sink for sp console error reporting.
//
// Every subprocess / IO failure inside src/cli/console/** must route through
// `logError` so the NDJSON envelope stays uniform across views. Each (view, op)
// pair is rate-limited to one stderr line per session — the on-screen dim row
// is the operator-facing surface; the log line is the agent/CI trail.
//
// Greppable invariant: `rg "process.stderr.write\\(JSON" src/cli/console` returns
// only this file.

export type ConsoleErrorOp =
  | 'bd_show'
  | 'git_diff'
  | 'git_numstat'
  | 'git_status'
  | 'merge_base'
  | 'subscribe_feed'
  | 'list_processes'
  | 'read_global_config'
  | 'write_global_config'
  | 'editor_spawn'
  | 'render';

export type ConsoleView = 'ps' | 'feed' | 'job' | 'bead' | 'diff' | 'config' | 'result';

export interface LogErrorExtras {
  exitCode?: number | null;
  durationMs?: number;
  errorClass?: string;
}

const SEEN = new Set<string>();

export function logError(view: ConsoleView, op: ConsoleErrorOp, extras: LogErrorExtras = {}): void {
  const key = `${view}:${op}:${extras.errorClass ?? 'unknown'}`;
  if (SEEN.has(key)) return;
  SEEN.add(key);
  try {
    const envelope = JSON.stringify({
      ts: new Date().toISOString(),
      component: 'sp-console',
      view,
      op,
      exitCode: extras.exitCode ?? null,
      durationMs: extras.durationMs ?? null,
      errorClass: extras.errorClass ?? 'unknown',
    });
    process.stderr.write(envelope + '\n');
  } catch {
    // never crash on logging
  }
}

export function resetLogErrorMemo(): void {
  SEEN.clear();
}

export function errorClassOf(error: unknown): string {
  if (!error) return 'unknown';
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  if (code) return String(code);
  if (error instanceof Error) return error.name;
  return String(error);
}
