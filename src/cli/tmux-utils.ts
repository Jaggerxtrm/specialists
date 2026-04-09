import { spawnSync } from 'node:child_process';

const TMUX_SESSION_PREFIX = 'sp';

function escapeForSingleQuotedBash(script: string): string {
  return script.replace(/'/g, "'\\''");
}

function quoteShellValue(value: string): string {
  return `'${escapeForSingleQuotedBash(value)}'`;
}

/** Returns true if tmux is available on PATH */
export function isTmuxAvailable(): boolean {
  return spawnSync('which', ['tmux'], { encoding: 'utf8', timeout: 2000 }).status === 0;
}

/** Build canonical session name: sp-<specialist>-<suffix> */
export function buildSessionName(specialist: string, suffix: string): string {
  return `${TMUX_SESSION_PREFIX}-${specialist}-${suffix}`;
}

/**
 * Create a detached tmux session running cmd.
 * - Sets SPECIALISTS_TMUX_SESSION=name as env var inside the session
 * - Unsets CLAUDECODE, CLAUDE_CODE_SSE_PORT, CLAUDE_CODE_ENTRYPOINT (Claude Code nesting guard)
 * - Wraps command in /bin/bash -c '...' for cross-shell compatibility
 * - extraEnv: additional key=value pairs to export in the session
 * @throws if tmux exits non-zero
 */
export function createTmuxSession(
  name: string,
  cwd: string,
  cmd: string,
  extraEnv: Record<string, string> = {},
): void {
  const exports: string[] = [
    'unset CLAUDECODE CLAUDE_CODE_SSE_PORT CLAUDE_CODE_ENTRYPOINT',
    `export SPECIALISTS_TMUX_SESSION=${quoteShellValue(name)}`,
  ];

  for (const [key, value] of Object.entries(extraEnv)) {
    exports.push(`export ${key}=${quoteShellValue(value)}`);
  }

  const startupScript = `${exports.join('; ')}; exec ${cmd}`;
  const wrappedCommand = `/bin/bash -c '${escapeForSingleQuotedBash(startupScript)}'`;

  const result = spawnSync(
    'tmux',
    ['new-session', '-d', '-s', name, '-c', cwd, wrappedCommand],
    { encoding: 'utf8', stdio: 'pipe' },
  );

  if (result.status !== 0) {
    const errorOutput = (result.stderr ?? '').trim() || (result.error?.message ?? 'unknown error');
    throw new Error(`Failed to create tmux session \"${name}\": ${errorOutput}`);
  }
}

/**
 * Check whether a tmux session currently exists.
 * Returns false when tmux exits non-zero or the check times out.
 */
export function isTmuxSessionAlive(sessionName: string): boolean {
  const result = spawnSync('tmux', ['has-session', '-t', sessionName], {
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: 2000,
  });
  if (result.error) return false;
  return result.status === 0;
}

/**
 * Kill a tmux session. Idempotent — does not throw if session is already dead.
 */
export function killTmuxSession(name: string): void {
  spawnSync('tmux', ['kill-session', '-t', name], { encoding: 'utf8', stdio: 'pipe' });
}
