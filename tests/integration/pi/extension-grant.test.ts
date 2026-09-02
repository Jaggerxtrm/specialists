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
import { PiAgentSession } from '../../../src/pi/session.js';
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

// Advisory fixture (unitAI-kaae7): registers two active extension tools.
// ast_grep has reviewed guidance and extension_probe does not, so only ast_grep
// belongs in the advisory even though both must be present in the active set.
const ADVISORY_FIXTURE_EXTENSION = `export default function (pi) {
  pi.registerTool({
    name: "ast_grep",
    label: "ast-grep",
    description: "Structural code-shape queries.",
    promptSnippet: "Call ast_grep for structural code queries.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    async execute() { return { content: [{ type: "text", text: "AST-OK" }] }; },
  });
  pi.registerTool({
    name: "extension_probe",
    label: "extension-probe",
    description: "Active extension tool without advisory guidance.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    async execute() { return { content: [{ type: "text", text: "EXTENSION-PROBE-OK" }] }; },
  });
}
`;

// Loaded LAST, after the policy extension appended its advisory to the chained
// system prompt. The fixture dumps the advisory block actually sent to the
// model (event.systemPrompt at its own before_agent_start already reflects the
// policy's earlier handler), so the presence/absence assertions check the
// model's real input deterministically — not the model's free-form reply.
const ADVISORY_CAPTURE_EXTENSION = `export default function (pi) {
  pi.on("before_agent_start", (event) => {
    const sp = event.systemPrompt ?? "";
    const i = sp.indexOf("Active extension tools");
    const block = i >= 0 ? sp.slice(i, i + 300) : "<no-advisory-block>";
    console.error("ACTIVE_TOOLS_CAPTURED_START:" + JSON.stringify(pi.getActiveTools()) + ":ACTIVE_TOOLS_CAPTURED_END");
    console.error("ADVISORY_CAPTURED_START:" + block + ":ADVISORY_CAPTURED_END");
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

  it('advisory is derived from the actual active set and reviewed guidance', () => {
    // Both extension tools MUST be active. Only ast_grep has reviewed guidance
    // and belongs in the advisory. The denied bash builtin MUST stay inactive.
    const dir = mkdtempSync(join(tmpdir(), 'advisory-model-'));
    writeFileSync(join(dir, 'index.mjs'), ADVISORY_FIXTURE_EXTENSION, 'utf8');
    const captureDir = mkdtempSync(join(tmpdir(), 'advisory-capture-'));
    writeFileSync(join(captureDir, 'index.mjs'), ADVISORY_CAPTURE_EXTENSION, 'utf8');

    try {
      const policyPath = getExtensionToolPolicyExtensionPath();
      expect(policyPath).toBeTruthy();
      const model = process.env.PI_INTEGRATION_MODEL ?? 'opencode-go/deepseek-v4-flash';
      // Native allowlist keeps grep/find/ls denied when a source is enabled
      // (default_overrides hard deny), so only `read` is a granted native here.
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
        '-e', captureDir,
      ];
      const piBin = resolvePiBinary();
      const prompt =
        'Your system prompt may contain a section titled "Active extension tools". ' +
        'If present, list exactly the tool names it names, comma-separated. ' +
        'If no such section exists, reply exactly: NONE';
      const result = spawnSync(piBin, args, {
        input: prompt,
        encoding: 'utf8',
        timeout: 180_000,
        env: {
          ...cleanSpawnEnv(piBin),
          [NATIVE_TOOLS_ENV_KEY]: 'read',
        },
      });

      if (result.error && (result.error as NodeJS.ErrnoException).code === 'ENOENT') {
        console.warn('pi binary not present — skipping integration assertion');
        return;
      }

      const stdout = result.stdout ?? '';
      const stderr = result.stderr ?? '';
      for (const line of stdout.split('\n').filter((l) => l.length > 0)) {
        expect(() => JSON.parse(line)).not.toThrow();
      }
      // Deterministic: the fixture dumps the advisory block that was actually
      // appended to the system prompt sent to the model.
      const captured = stderr.match(/ADVISORY_CAPTURED_START:([\s\S]*?):ADVISORY_CAPTURED_END/)?.[1] ?? '';
      expect(captured).not.toBe('');
      const activeJson = stderr.match(/ACTIVE_TOOLS_CAPTURED_START:([^\n]*):ACTIVE_TOOLS_CAPTURED_END/)?.[1] ?? '[]';
      const active = JSON.parse(activeJson) as string[];
      expect(active).toContain('read');
      expect(active).toContain('ast_grep');
      expect(active).toContain('extension_probe');
      expect(active).not.toContain('bash');
      // Only the active tool with reviewed guidance reaches the advisory.
      expect(captured).toContain('ast_grep');
      expect(captured).not.toContain('extension_probe');
      // Non-mandatory wording: advisory invites use, never forces it.
      expect(captured).toMatch(/use when relevant/i);
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(captureDir, { recursive: true, force: true });
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

  it('cold-delayed failing source fails fast through PiAgentSession (unitAI-u5xjk)', async () => {
    const piBin = resolvePiBinary();
    if (!existsSync(piBin)) {
      console.warn('pi binary not present — skipping integration assertion');
      return;
    }
    // Cold-resolution failure shape: the source resolves slowly (registry
    // latency), then fails; pi exits 1 before the prompt ack. PiAgentSession
    // must reject the pending RPC immediately on child exit — not after the
    // fixed 30s command timeout — and surface the actionable stderr.
    const dir = mkdtempSync(join(tmpdir(), 'ext-cold-fail-'));
    writeFileSync(join(dir, 'index.mjs'), [
      'await new Promise((r) => setTimeout(r, 1500));',
      "throw new Error('fixture source resolution failed');",
    ].join('\n'), 'utf8');
    try {
      const session = await PiAgentSession.create({
        model: 'gemini',
        extensionSources: [dir],
        env: cleanSpawnEnv(piBin),
      });
      const startedAt = Date.now();
      let rejection: unknown;
      try {
        await session.start();
        await session.prompt('say ok');
      } catch (err) {
        rejection = err;
      } finally {
        session.kill();
      }
      const elapsedMs = Date.now() - startedAt;

      expect(rejection).toBeInstanceOf(Error);
      // Fail-fast: rejection on child close (~2s), far below the 30s RPC
      // command timeout the pre-fix code burned before reporting.
      expect(elapsedMs).toBeLessThan(15_000);
      expect(`${(rejection as Error).message}\n${session.getStderr()}`)
        .toMatch(/fixture source resolution failed|Failed to load extension/i);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});