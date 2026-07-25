// ISSUE: xtrm-wiy5n.4.11 — quarantined from the default test baseline.
import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { decideCommitGate } from '../../../.xtrm/hooks/beads-gate-core.mjs';
import { clearReviewerClaimOwnerIfInactive } from '../../../.xtrm/hooks/beads-gate-utils.mjs';

function setKv(key: string, value: string) {
  execSync(`bd kv set "${key}" "${value}"`, { cwd: process.cwd(), stdio: 'pipe' });
}

function clearKv(key: string) {
  try { execSync(`bd kv clear "${key}"`, { cwd: process.cwd(), stdio: 'pipe' }); } catch {}
}

describe('beads commit gate reviewer exemption', () => {
  it('allows reviewer-owned claim for any session', () => {
    const key = 'claim-owner:unitAI-r1-test';
    try {
      setKv(key, 'reviewer:sess-1');
      const result = decideCommitGate(
        { cwd: process.cwd(), sessionId: 'sess-2', isBeadsProject: true },
        { claimed: true, claimId: 'unitAI-r1-test', claimInProgress: true, totalWork: 1, inProgress: { count: 1, summary: '' } },
      );
      expect(result.allow).toBe(true);
    } finally {
      clearKv(key);
    }
  });

  it('blocks same-session claim without owner KV', () => {
    const result = decideCommitGate(
      { cwd: process.cwd(), sessionId: 'sess-2', isBeadsProject: true },
      { claimed: true, claimId: 'unitAI-r2-test', claimInProgress: true, totalWork: 1, inProgress: { count: 1, summary: '' } },
    );
    expect(result.allow).toBe(false);
    expect(result.reason).toBe('unclosed_claim');
  });

  it('cleans reviewer owner KV when claim inactive', () => {
    const key = 'claim-owner:unitAI-cleanup-test';
    try {
      setKv(key, 'reviewer:sess-clean');
      clearReviewerClaimOwnerIfInactive('unitAI-cleanup-test', process.cwd());
      let stillSet = true;
      try { execSync(`bd kv get "${key}"`, { cwd: process.cwd(), stdio: 'pipe' }); } catch { stillSet = false; }
      expect(stillSet).toBe(false);
    } finally {
      clearKv(key);
    }
  });

  it('allows reviewer-owned claim even when session differs', () => {
    const key = 'claim-owner:unitAI-r3-test';
    try {
      setKv(key, 'reviewer:other-session');
      const result = decideCommitGate(
        { cwd: process.cwd(), sessionId: 'sess-3', isBeadsProject: true },
        { claimed: true, claimId: 'unitAI-r3-test', claimInProgress: true, totalWork: 1, inProgress: { count: 1, summary: '' } },
      );
      expect(result.allow).toBe(true);
    } finally {
      clearKv(key);
    }
  });
});
