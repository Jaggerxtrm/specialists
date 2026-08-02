import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const fixtureDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../fixtures/codex-k1');
const fixture = JSON.parse(readFileSync(resolve(fixtureDir, 'chain-coordinator.json'), 'utf8')) as any;
const golden = JSON.parse(readFileSync(resolve(fixtureDir, 'chain-coordinator-render-golden.json'), 'utf8')) as any;
const surfaces = ['pi', 'claude'] as const;
const canonicalRenderError = "specialist 'chain-coordinator': specialist 'chain-coordinator' has no model configured. Run: sp edit --global chain-coordinator.execution.model <model-id> (or 'sp init --global' to create the global user config file first).";

function shortHash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

describe('K1 characterization fixture provenance', () => {
  it('stores an independently checkable normalized render golden', () => {
    expect(golden.mode).toBe('serialized_render_inputs_and_initial_prompt');
    expect(golden.normalized_cwd).toBe('<worktree>');
    expect(golden.bead).toMatchObject({
      id: 'unitAI-e67up.1',
      parent: 'unitAI-e67up',
      notes: null,
    });
    expect(golden.completed_blockers).toEqual([]);

    for (const surface of surfaces) {
      const captured = golden.surfaces[surface];
      expect(captured.cwd).toBe(golden.normalized_cwd);
      expect(captured.initial_prompt).toContain('Current cwd: <worktree>');
      expect(captured.initial_prompt).not.toMatch(/\/home\//);
      expect(shortHash(captured.initial_prompt)).toBe(captured.prompt_hash);
      expect(Buffer.byteLength(captured.initial_prompt)).toBe(captured.initial_prompt_bytes);
    }
  });

  it('records executable render and view probes separately per surface', () => {
    for (const surface of surfaces) {
      const renderProbe = fixture.render_task_capture.cli_probes[surface];
      expect(renderProbe.command).toBe(`sp render-task chain-coordinator --bead unitAI-e67up.1 --surface ${surface}`);
      expect(renderProbe.command).not.toContain('|');
      expect(renderProbe.exit).toBe(1);
      expect(renderProbe.ok).toBe(false);
      expect(renderProbe.error.message).toBe(canonicalRenderError);

      const viewProbe = fixture.view_capture.probes[surface];
      expect(viewProbe.command).toBe(`sp view chain-coordinator --raw --surface ${surface}`);
      expect(viewProbe.command).not.toContain('|');
      expect(viewProbe.exit).toBe(0);
      expect(viewProbe.ok).toBe(true);
      expect(viewProbe.projection).toBe(`view_projection.${surface}`);
    }
  });
});
