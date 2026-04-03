import path from 'node:path';
import fs from 'node:fs';

export type SessionPhase =
  | 'claimed'
  | 'phase1-done'
  | 'waiting-merge'
  | 'conflicting'
  | 'pending-cleanup'
  | 'merged'
  | 'cleanup-done';

export interface SessionState {
  issueId: string;
  branch: string;
  worktreePath: string;
  prNumber: number | null;
  prUrl: string | null;
  phase: SessionPhase;
  conflictFiles: string[];
  startedAt: string;
  lastChecked: string;
}

const SESSION_STATE_FILE = '.xtrm-session-state.json';

export function findSessionStateFile(startCwd: string): string | null {
  let current = path.resolve(startCwd || process.cwd());
  for (;;) {
    const candidate = path.join(current, SESSION_STATE_FILE);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

export function readSessionState(startCwd: string): SessionState | null {
  const filePath = findSessionStateFile(startCwd);
  if (!filePath) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!parsed || typeof parsed !== 'object') return null;
    if (!parsed.issueId || !parsed.branch || !parsed.worktreePath || !parsed.phase) return null;
    return {
      issueId: String(parsed.issueId),
      branch: String(parsed.branch),
      worktreePath: String(parsed.worktreePath),
      prNumber: parsed.prNumber ?? null,
      prUrl: parsed.prUrl ?? null,
      phase: parsed.phase,
      conflictFiles: Array.isArray(parsed.conflictFiles) ? parsed.conflictFiles.map(String) : [],
      startedAt: String(parsed.startedAt || ''),
      lastChecked: String(parsed.lastChecked || ''),
    } as SessionState;
  } catch {
    return null;
  }
}
