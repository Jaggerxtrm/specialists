// Integration regression (unitAI-34pyf): tools registered by an explicitly
// enabled extension source must be invocable by the model under a specialist
// run. Pi's --tools allowlist filters extension-registered tools out of the
// tool registry entirely, so the resolved contract switches the session to
// the Specialists-owned tool-policy gate:
//   --no-builtin-tools + -e <sources…> + -e <policy> LAST +
//   env PI_SPECIALIST_ALLOWED_NATIVE_TOOLS=<granted natives>
// The policy extension re-activates the granted natives plus every tool
// registered by the enabled sources at session_start (fail-closed: all other
// tools stay inactive and Pi rejects them at call time).
//
// Guarded behind PI_INTEGRATION=1 for the model-backed leg (matches the
// existing convention); the malformed-source failure leg needs no model but
// needs the pi binary, so it stays under the same guard.

import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

import { resolveRuntimeToolContract } from '../../../src/pi/session.js';
import { getExtensionToolPolicyExtensionPath, NATIVE_TOOLS_ENV_KEY } from '../../../src/pi/extension-tool-policy-extension.js';

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

function cleanSpawnEnv(piBin: string) {
  return {
    PATH: `${join(piBin, '..')}:/usr/bin:/bin`,
    HOME: homedir(),
    TMPDIR: tmpdir(),
    NVM_BIN: join(piBin, '..'),
  };
}

describe('extension exposure sanity (no Pi needed)', () => {
  it('resolution lists exposed sources and the policy path resolves', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ext-exposure-sanity-'));
    writeFileSync(join(dir, 'index.mjs'), FIXTURE_EXTENSION, 'utf8');
    try {
      const contract = resolveRuntimeToolContract({ level: 'READ_ONLY', extensionSources: [dir] });
      expect(contract?.exposedExtensionSources).toEqual([dir]);
      // Granted natives are unchanged (allowlist channel input).
      expect(contract?.nativeTools).toEqual(['read', 'grep', 'find', 'ls']);
      const policyPath = getExtensionToolPolicyExtensionPath();
      expect(policyPath).toBeTruthy();
      expect(existsSync(join(policyPath!, 'index.mjs'))).toBe(true);
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
      const contract = resolveRuntimeToolContract({ level: 'READ_ONLY', extensionSources: [dir] });
      expect(contract?.exposedExtensionSources).toEqual([dir]);

      const model = process.env.PI_INTEGRATION_MODEL ?? 'anthropic/claude-sonnet-4-5-latest';
      const prompt = 'Call the probe_marker tool now and reply with exactly its output text. Do not use any other tool.';
      const policyPath = getExtensionToolPolicyExtensionPath();
      expect(policyPath).toBeTruthy();
      const args = [
        '--mode', 'json',
        '--no-session',
        '--no-extensions',
        '--no-skills',
        '--offline',
        '--no-context-files',
        '--no-prompt-templates',
        '--no-themes',
        '--no-builtin-tools',
        '--model', model,
        '-e', dir,
        '-e', policyPath!,
      ];
      const piBin = resolvePiBinary();
      const result = spawnSync(piBin, args, {
        input: prompt,
        encoding: 'utf8',
        timeout: 180_000,
        env: {
          ...cleanSpawnEnv(piBin),
          [NATIVE_TOOLS_ENV_KEY]: contract!.nativeTools.join(','),
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

  it('malformed extension source fails loudly instead of silently losing tools', () => {
    const piBin = resolvePiBinary();
    const policyPath = getExtensionToolPolicyExtensionPath();
    const args = [
      '--mode', 'json',
      '--no-session',
      '--no-extensions',
      '--no-skills',
      '--offline',
      '--no-context-files',
      '--no-prompt-templates',
      '--no-themes',
      '--no-builtin-tools',
      '--model', process.env.PI_INTEGRATION_MODEL ?? 'opencode-go/deepseek-v4-flash',
      '-e', '/nonexistent/missing-extension',
      '-e', policyPath!,
    ];
    const result = spawnSync(piBin, args, {
      input: 'Say OK.',
      encoding: 'utf8',
      timeout: 120_000,
      env: cleanSpawnEnv(piBin),
    });
    if (result.error && (result.error as NodeJS.ErrnoException).code === 'ENOENT') {
      console.warn('pi binary not present — skipping integration assertion');
      return;
    }
    // Failed extension load must terminate the run with a visible error —
    // never a silent session that simply lacks the extension's tools.
    expect(result.status).not.toBe(0);
    expect(`${result.stderr ?? ''}${result.stdout ?? ''}`).toMatch(/Failed to load extension/i);
  });
});