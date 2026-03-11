// tests/unit/cli/quickstart.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';

describe('quickstart CLI — run()', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  async function captureOutput(): Promise<string> {
    const output: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((msg: string) => {
      output.push(msg ?? '');
    });
    const { run } = await import('../../../src/cli/quickstart.js');
    await run();
    return output.join('\n');
  }

  it('prints title header', async () => {
    const out = await captureOutput();
    expect(out).toContain('Quick Start Guide');
  });

  it('covers all 10 sections', async () => {
    const out = await captureOutput();
    const sections = [
      '1. Installation',
      '2. Initialize a Project',
      '3. Discover Specialists',
      '4. Running a Specialist',
      '5. Background Job Lifecycle',
      '6. Editing Specialists',
      '7. .specialist.yaml Schema',
      '8. Hook System',
      '9. MCP Integration',
      '10. Common Workflows',
    ];
    for (const section of sections) {
      expect(out, `missing section: ${section}`).toContain(section);
    }
  });

  it('documents --background flag', async () => {
    const out = await captureOutput();
    expect(out).toContain('--background');
  });

  it('documents stall_timeout_ms in YAML schema', async () => {
    const out = await captureOutput();
    expect(out).toContain('stall_timeout_ms');
  });

  it('documents skills.paths in YAML schema', async () => {
    const out = await captureOutput();
    expect(out).toContain('skills:');
    expect(out).toContain('paths:');
  });

  it('documents beads_integration in YAML schema', async () => {
    const out = await captureOutput();
    expect(out).toContain('beads_integration');
  });

  it('documents hook points', async () => {
    const out = await captureOutput();
    expect(out).toContain('specialist:start');
    expect(out).toContain('specialist:done');
    expect(out).toContain('specialist:error');
  });

  it('lists all MCP tools', async () => {
    const out = await captureOutput();
    const tools = ['specialist_init', 'list_specialists', 'use_specialist', 'start_specialist', 'poll_specialist'];
    for (const tool of tools) {
      expect(out, `missing MCP tool: ${tool}`).toContain(tool);
    }
  });

  it('references trace.jsonl', async () => {
    const out = await captureOutput();
    expect(out).toContain('trace.jsonl');
  });
});
