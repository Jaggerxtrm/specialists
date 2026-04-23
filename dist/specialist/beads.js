// src/specialist/beads.ts
// Beads tracking for SpecialistRunner.
// Uses spawnSync with args array (no shell) to prevent injection.
// All methods are fire-and-forget: never throw, never crash a run.
import { spawnSync } from 'node:child_process';
export function buildBeadContext(bead, completedBlockers = []) {
    const lines = [`# Task: ${bead.title}`];
    if (bead.description?.trim()) {
        lines.push(bead.description.trim());
    }
    if (bead.parent?.trim()) {
        lines.push('', '## Parent epic', bead.parent.trim());
    }
    if (bead.notes?.trim()) {
        lines.push('', '## Notes', bead.notes.trim());
    }
    if (completedBlockers.length > 0) {
        lines.push('', '## Context from completed dependencies:');
        for (const blocker of completedBlockers) {
            lines.push('', `### ${blocker.title} (${blocker.id})`);
            if (blocker.description?.trim()) {
                lines.push(blocker.description.trim());
            }
            if (blocker.notes?.trim()) {
                lines.push('', blocker.notes.trim());
            }
        }
    }
    return lines.join('\n').trim();
}
export class BeadsClient {
    available;
    constructor() {
        this.available = BeadsClient.checkAvailable();
        if (!this.available) {
            console.warn('[specialists] bd CLI not found — beads tracking disabled');
        }
    }
    static checkAvailable() {
        const result = spawnSync('bd', ['--version'], { stdio: 'ignore' });
        return result.status === 0;
    }
    isAvailable() {
        return this.available;
    }
    /** Create a bead for a specialist run. Returns the bead ID or null on failure. */
    createBead(specialistName) {
        if (!this.available)
            return null;
        const result = spawnSync('bd', ['q', `specialist:${specialistName}`, '--type', 'task', '--labels', 'specialist'], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
        if (result.status !== 0)
            return null;
        const id = result.stdout?.trim();
        return id || null;
    }
    /** Read a bead by ID. Returns null on any failure. */
    readBead(id) {
        if (!this.available || !id)
            return null;
        const result = spawnSync('bd', ['show', id, '--json'], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 });
        if (result.error || result.status !== 0 || !result.stdout?.trim())
            return null;
        try {
            const parsed = JSON.parse(result.stdout);
            const bead = Array.isArray(parsed) ? parsed[0] : parsed;
            if (!bead || typeof bead !== 'object'
                || typeof bead.id !== 'string'
                || typeof bead.title !== 'string')
                return null;
            return bead;
        }
        catch (err) {
            console.warn(`[specialists] readBead: JSON parse failed for id=${id}: ${err}`);
            return null;
        }
    }
    /**
     * Fetch completed blockers of a bead at the given depth.
     * depth=1 returns immediate completed blockers only.
     * depth=2 also includes their completed blockers, etc.
     */
    getCompletedBlockers(id, depth = 1) {
        if (!this.available || !id || depth < 1)
            return [];
        const result = spawnSync('bd', ['dep', 'list', id, '--json'], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 });
        if (result.error || result.status !== 0 || !result.stdout?.trim())
            return [];
        let deps;
        try {
            deps = JSON.parse(result.stdout);
            if (!Array.isArray(deps))
                return [];
        }
        catch {
            return [];
        }
        const blockers = deps.filter(d => d.dependency_type === 'blocks' && d.status === 'closed');
        const records = [];
        for (const dep of blockers) {
            const record = this.readBead(dep.id);
            if (record) {
                records.push(record);
                if (depth > 1) {
                    records.push(...this.getCompletedBlockers(dep.id, depth - 1));
                }
            }
        }
        return records;
    }
    /** Link a tracking bead back to the input bead that supplied the prompt. */
    addDependency(trackingBeadId, inputBeadId) {
        if (!this.available || !trackingBeadId || !inputBeadId)
            return;
        spawnSync('bd', ['dep', 'add', trackingBeadId, inputBeadId], { stdio: 'ignore' });
    }
    /** Close a bead with COMPLETE or ERROR status. */
    closeBead(id, status, durationMs, model) {
        if (!this.available || !id)
            return;
        const reason = `${status}, ${Math.round(durationMs)}ms, ${model}`;
        spawnSync('bd', ['close', id, '-r', reason], { stdio: 'ignore' });
    }
    /** Append bead notes with specialist output or metadata. */
    updateBeadNotes(id, notes) {
        if (!this.available || !id || !notes)
            return { ok: false, error: 'beads unavailable or empty payload' };
        const result = spawnSync('bd', ['update', id, '--append-notes', notes], {
            encoding: 'utf-8',
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        if (result.error) {
            return { ok: false, error: result.error.message };
        }
        if (result.status !== 0) {
            const stderr = result.stderr?.trim();
            return { ok: false, error: stderr || `bd update failed with exit code ${result.status}` };
        }
        return { ok: true };
    }
    /** Record a bd audit entry linking the bead to the specialist invocation. */
    auditBead(id, toolName, model, exitCode) {
        if (!this.available || !id)
            return;
        spawnSync('bd', [
            'audit', 'record',
            '--kind', 'tool_call',
            '--tool-name', toolName,
            '--model', model,
            '--issue-id', id,
            '--exit-code', String(exitCode),
        ], { stdio: 'ignore' });
    }
}
/**
 * Determine whether to create a bead for this specialist run.
 *
 * auto   — create bead only for non-READ_ONLY specialists (write-capable)
 * always — always create (discovery specialists: codebase-explorer, init-session)
 * never  — skip entirely (utility one-offs, fast runs)
 */
export function shouldCreateBead(beadsIntegration, permissionRequired) {
    if (beadsIntegration === 'never')
        return false;
    if (beadsIntegration === 'always')
        return true;
    return permissionRequired !== 'READ_ONLY';
}
//# sourceMappingURL=beads.js.map