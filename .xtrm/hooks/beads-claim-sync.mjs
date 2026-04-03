#!/usr/bin/env node
// beads-claim-sync — PostToolUse hook
// bd update --claim → set kv claim
// bd close         → set closed-this-session kv for memory gate

import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { join, dirname, isAbsolute } from 'node:path';
import { resolveSessionId } from './beads-gate-utils.mjs';
import { logEvent } from './xtrm-logger.mjs';

function readInput() {
  try {
    return JSON.parse(readFileSync(0, 'utf-8'));
  } catch {
    return null;
  }
}

function isBeadsProject(cwd) {
  return existsSync(join(cwd, '.beads'));
}

// In a git worktree, --git-common-dir returns an absolute path to the main .git dir.
// In a regular repo it returns '.git' (relative). Use this to find the canonical main root
// so claim files are always written/deleted from the same location across sessions.
function resolveMainRoot(cwd) {
  const r = spawnSync('git', ['rev-parse', '--git-common-dir'], {
    cwd, encoding: 'utf8', stdio: 'pipe',
  });
  const commonDir = r.stdout?.trim();
  if (commonDir && isAbsolute(commonDir)) return dirname(commonDir);
  return cwd;
}

// Returns a per-session claim filename: 'statusline-claim' for the main session,
// 'statusline-claim-<worktreeName>' for worktree sessions.
// Prevents cross-session contamination when multiple worktrees run simultaneously.
function resolveClaimFileName(cwd) {
  const m = cwd.match(/\/\.xtrm\/worktrees\/([^/]+)/);
  return m ? `statusline-claim-${m[1]}` : 'statusline-claim';
}

function isShellTool(toolName) {
  return toolName === 'Bash' || toolName === 'bash' || toolName === 'execute_shell_command';
}

function commandSucceeded(payload) {
  const tr = payload?.tool_response ?? payload?.tool_result ?? payload?.result;
  if (!tr || typeof tr !== 'object') return true;

  if (tr.success === false) return false;
  if (tr.error) return false;

  const numeric = [tr.exit_code, tr.exitCode, tr.status, tr.returncode].find((v) => Number.isInteger(v));
  if (typeof numeric === 'number' && numeric !== 0) return false;

  return true;
}




function main() {
  const input = readInput();
  if (!input || input.hook_event_name !== 'PostToolUse') process.exit(0);
  if (!isShellTool(input.tool_name)) process.exit(0);

  const cwd = input.cwd || process.cwd();
  if (!isBeadsProject(cwd)) process.exit(0);

  const command = input.tool_input?.command || '';
  const sessionId = resolveSessionId(input);

  // Auto-claim: bd update <id> --claim (fire regardless of exit code — bd returns 1 for "already in_progress")
  if (/\bbd\s+update\b/.test(command) && /--claim\b/.test(command)) {
    const match = command.match(/\bbd\s+update\s+(\S+)/);
    if (match) {
      const issueId = match[1];
      const result = spawnSync('bd', ['kv', 'set', `claimed:${sessionId}`, issueId], {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 5000,
      });

      if (result.status !== 0) {
        const err = (result.stderr || result.stdout || '').toString().trim();
        if (err) process.stderr.write(`Beads claim sync warning: ${err}\n`);
        process.exit(0);
      }

      // Write claim state for statusline — per-worktree file under main root.
      try {
        const xtrmDir = join(resolveMainRoot(cwd), '.xtrm');
        mkdirSync(xtrmDir, { recursive: true });
        writeFileSync(join(xtrmDir, resolveClaimFileName(cwd)), issueId);
      } catch { /* non-fatal */ }

      logEvent({
        cwd,
        runtime: 'claude',
        sessionId,
        layer: 'bd',
        kind: 'bd.claimed',
        outcome: 'allow',
        issueId,
      });

      process.stdout.write(JSON.stringify({
        additionalContext: `\n✅ **Beads**: Session \`${sessionId}\` claimed issue \`${issueId}\`.`,
      }));
      process.stdout.write('\n');
      process.exit(0);
    }
  }

  // On bd close: mark closed-this-session for memory gate
  if (/\bbd\s+close\b/.test(command) && commandSucceeded(input)) {
    const match = command.match(/\bbd\s+close\s+(\S+)/);
    const closedIssueId = match?.[1];

    // Clear claim state for statusline — per-worktree file under main root.
    try { unlinkSync(join(resolveMainRoot(cwd), '.xtrm', resolveClaimFileName(cwd))); } catch { /* ok if missing */ }

    // Mark this issue as closed this session (memory gate reads this)
    if (closedIssueId) {
      spawnSync('bd', ['kv', 'set', `closed-this-session:${sessionId}`, closedIssueId], {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 5000,
      });

      logEvent({
        cwd,
        runtime: 'claude',
        sessionId,
        layer: 'bd',
        kind: 'bd.closed',
        outcome: 'allow',
        issueId: closedIssueId,
      });
    }

    process.stdout.write(JSON.stringify({
      additionalContext: `\n🔓 **Beads**: Issue closed. Evaluate insights, then acknowledge:\n  \`bd remember "<insight>"\` (or note "nothing to persist")`,
    }));
    process.stdout.write('\n');
    process.exit(0);
  }

  process.exit(0);
}

main();
