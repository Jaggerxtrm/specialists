// Integration regression (unitAI-34pyf): tools registered by an explicitly
// enabled extension source must be invocable by the model under a specialist
// run. Pi's --tools allowlist would suppress extension-registered tools, so
// the resolved contract switches to a deny-list gate (--exclude-tools) for
// the native tool set while the extension loads via -e. This test drives the
// real pipeline end to end with a model: fixture extension → resolved
// contract → --exclude-tools + -e spawn → model invokes the extension tool →
// the deterministic marker appears in the stream.
//
// Guarded behind PI_INTEGRATION=1 (matches the existing convention for
// pi-dependent tests). Skipped by default so the fast unit suite is not
// gated on a Pi binary or model credentials.

import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

import { resolveRuntimeToolContract } from '../../../src/pi/session.js';

const ENABLED = process.env.PI_INTEGRATION === '1';
const describeIntegration = ENABLED ? describe : describe.skip;

/**
 * Deterministic pi binary. Test runners (vitest under bun) report a shim
 * `process.version` and prepend node_modules/.bin dirs to PATH, so naive
 * resolution can pick a stale global `pi` or a bun node wrapper that crashes
 * the child. Prefer the explicit PI_BIN override, then the newest nvm-managed
 * node install that carries pi, before letting PATH decide.
 */
function resolvePiBinary(): string {
  if (process.env.PI_BIN && existsSync(process.env.PI_BIN)) return process.env.PI_BIN;
  const nvmRoot = join(homedir(), '.nvm', 'versions', 'node');
  try {
    const versions = readdirSync(nvmRoot)
      .filter((name) => existsSync(join(nvmRoot, name, 'bin', 'pi')))
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    if (versions.length > 0) return join(nvmRoot, versions[0], 'bin', 'pi');
  } catch {
    // fall through to PATH
  }
  return 'pi';
}

const FIXTURE_EXTENSION = `// Model-backed regression fixture: registers a tool the SPECIALIST runtime
// must expose purely because its source is enabled via execution.extensions.
export default function (pi) {
  pi.registerTool({
    name: "probe_marker",
    label: "probe-marker",
    description: "Extension exposure regression probe: returns a fixed marker.",
    promptSnippet: "Call probe_marker; it returns a fixed marker.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    async execute() {
      return { content: [{ type: "text", text: "EXTENSION-EXPOSURE-OK" }] };
    },
  });
}
`;

describe('extension exposure sanity (no Pi needed)', () => {
  it('resolution switches to the deny-list gate for enabled extension sources', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ext-exposure-sanity-'));
    writeFileSync(join(dir, 'index.mjs'), FIXTURE_EXTENSION, 'utf8');
    try {
      const contract = resolveRuntimeToolContract({ level: 'READ_ONLY', extensionSources: [dir] });
      expect(contract?.excludeToolsFlag?.split(',')).toEqual(expect.arrayContaining(['write', 'edit', 'bash']));
      expect(contract?.excludeToolsFlag?.split(',')).not.toContain('read');
      expect(contract?.exposedExtensionSources).toEqual([dir]);
      // Without enabled sources the legacy allowlist gate stays in place.
      const legacy = resolveRuntimeToolContract({ level: 'READ_ONLY' });
      expect(legacy?.excludeToolsFlag).toBeUndefined();
      expect(legacy?.toolsFlag).toBeTruthy();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describeIntegration('extension exposure model-backed regression', () => {
  it('model can invoke a tool registered by an enabled extension source', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ext-exposure-model-'));
    writeFileSync(join(dir, 'index.mjs'), FIXTURE_EXTENSION, 'utf8');

    try {
      // Same resolution the specialist spawn uses (script-runner raw surface):
      // enabled source → resolved contract → deny-list gate + -e source.
      const contract = resolveRuntimeToolContract({ level: 'READ_ONLY', extensionSources: [dir] });
      expect(contract?.excludeToolsFlag).toBeTruthy();

      const model = process.env.PI_INTEGRATION_MODEL ?? 'anthropic/claude-sonnet-4-5-latest';
      const prompt = 'Call the probe_marker tool now and reply with exactly its output text. Do not use any other tool.';
      const args = [
        '--mode', 'json',
        '--no-session',
        '--no-extensions',
        '--no-skills',
        '--offline',
        '--no-context-files',
        '--no-prompt-templates',
        '--no-themes',
        '--exclude-tools', contract!.excludeToolsFlag!,
        '--model', model,
        '-e', dir,
      ];
      const piBin = resolvePiBinary();
      const result = spawnSync(piBin, args, {
        input: prompt,
        encoding: 'utf8',
        timeout: 180_000,
        // Test runners inject bun node wrappers and node_modules/.bin dirs
        // into PATH that crash or shadow the pi child. Spawn with a clean
        // PATH rooted at the resolved binary's node install.
        env: {
          PATH: `${join(piBin, '..')}:/usr/bin:/bin`,
          HOME: homedir(),
          TMPDIR: tmpdir(),
          NVM_BIN: join(piBin, '..'),
        },
      });

      // If Pi is not installed, treat as environmental skip.
      if (result.error && (result.error as NodeJS.ErrnoException).code === 'ENOENT') {
        console.warn('pi binary not present — skipping integration assertion');
        return;
      }

      const stdout = result.stdout ?? '';
      // JSONL framing must not have been corrupted by the fixture extension.
      for (const line of stdout.split('\n').filter((l) => l.length > 0)) {
        expect(() => JSON.parse(line)).not.toThrow();
      }
      // The model must have CALLED the extension-registered tool, and the
      // tool result marker must have reached the stream. This fails when the
      // --tools allowlist suppresses extension tools (the unitAI-34pyf
      // regression: extension loads, model can never invoke its tools).
      expect(stdout).toContain('EXTENSION-EXPOSURE-OK');
      expect(stdout).toContain('"toolName":"probe_marker"');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});