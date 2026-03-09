// src/specialist/beads.ts
// Beads tracking for SpecialistRunner.
// Uses spawnSync with args array (no shell) to prevent injection.
// All methods are fire-and-forget: never throw, never crash a run.

import { spawnSync } from 'node:child_process';

export class BeadsClient {
  private readonly available: boolean;

  constructor() {
    this.available = BeadsClient.checkAvailable();
    if (!this.available) {
      console.warn('[specialists] bd CLI not found — beads tracking disabled');
    }
  }

  private static checkAvailable(): boolean {
    const result = spawnSync('bd', ['--version'], { stdio: 'ignore' });
    return result.status === 0;
  }

  isAvailable(): boolean {
    return this.available;
  }

  /** Create a bead for a specialist run. Returns the bead ID or null on failure. */
  createBead(specialistName: string): string | null {
    if (!this.available) return null;
    const result = spawnSync(
      'bd',
      ['q', `specialist:${specialistName}`, '--type', 'task', '--labels', 'specialist'],
      { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
    if (result.status !== 0) return null;
    const id = result.stdout?.trim();
    return id || null;
  }

  /** Close a bead with COMPLETE or ERROR status. */
  closeBead(id: string, status: 'COMPLETE' | 'ERROR', durationMs: number, model: string): void {
    if (!this.available || !id) return;
    const reason = `${status}, ${Math.round(durationMs)}ms, ${model}`;
    spawnSync('bd', ['close', id, '-r', reason], { stdio: 'ignore' });
  }

  /** Record a bd audit entry linking the bead to the specialist invocation. */
  auditBead(id: string, toolName: string, model: string, exitCode: number): void {
    if (!this.available || !id) return;
    spawnSync(
      'bd',
      [
        'audit', 'record',
        '--kind', 'tool_call',
        '--tool-name', toolName,
        '--model', model,
        '--issue-id', id,
        '--exit-code', String(exitCode),
      ],
      { stdio: 'ignore' },
    );
  }
}

/**
 * Determine whether to create a bead for this specialist run.
 *
 * auto   — create bead only for non-READ_ONLY specialists (write-capable)
 * always — always create (discovery specialists: codebase-explorer, init-session)
 * never  — skip entirely (utility one-offs, fast runs)
 */
export function shouldCreateBead(
  beadsIntegration: 'auto' | 'always' | 'never',
  permissionRequired: string,
): boolean {
  if (beadsIntegration === 'never') return false;
  if (beadsIntegration === 'always') return true;
  return permissionRequired !== 'READ_ONLY';
}
