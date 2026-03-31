import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const LIVE_STATUSES = new Set(['running', 'waiting']);

function toDurationLabel(totalSeconds) {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return null;

  const roundedSeconds = Math.floor(totalSeconds);
  const minutes = Math.floor(roundedSeconds / 60);
  const seconds = roundedSeconds % 60;

  if (minutes <= 0) {
    return `${seconds}s`;
  }

  return `${minutes}m ${seconds}s`;
}

function parseStatus(statusPath) {
  try {
    return JSON.parse(readFileSync(statusPath, 'utf8'));
  } catch {
    return null;
  }
}

function getActiveTmuxSessions(jobsDir) {
  const entries = readdirSync(jobsDir, { withFileTypes: true });
  const sessions = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const statusPath = join(jobsDir, entry.name, 'status.json');
    const statusData = parseStatus(statusPath);

    if (!statusData || !LIVE_STATUSES.has(statusData.status)) continue;

    const tmuxSession =
      typeof statusData.tmux_session === 'string' ? statusData.tmux_session.trim() : '';
    if (!tmuxSession) continue;

    const elapsedSeconds =
      typeof statusData.elapsed_s === 'number'
        ? statusData.elapsed_s
        : typeof statusData.started_at_ms === 'number'
          ? Math.max(0, Math.floor((Date.now() - statusData.started_at_ms) / 1000))
          : null;

    sessions.push({
      tmuxSession,
      specialist:
        typeof statusData.specialist === 'string' && statusData.specialist.trim()
          ? statusData.specialist
          : 'unknown',
      status: statusData.status,
      duration: toDurationLabel(elapsedSeconds),
    });
  }

  return sessions;
}

function printWarning(sessions) {
  const width = sessions.reduce((max, session) => Math.max(max, session.tmuxSession.length), 0);

  console.error('⚠  Specialist sessions still active:');
  for (const session of sessions) {
    const details = [session.specialist, session.status];
    if (session.duration) {
      details.push(session.duration);
    }

    console.error(`   ${session.tmuxSession.padEnd(width)}  (${details.join(' · ')})`);
  }

  console.error('Run: specialists list --live   to inspect');
  console.error('     specialists stop <id>     to cancel');
}

function main() {
  const jobsDir = join(process.cwd(), '.specialists', 'jobs');
  if (!existsSync(jobsDir)) return;

  const sessions = getActiveTmuxSessions(jobsDir);
  if (sessions.length === 0) return;

  printWarning(sessions);
}

try {
  main();
} catch {
  // Never block stop hooks.
}

process.exit(0);
