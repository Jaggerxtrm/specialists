// Integration test: verifies the bundled read-line-numbers Pi extension
// is actually loaded by Pi at spawn time and prefixes model-facing `read`
// output with true source line numbers.
//
// Guarded behind PI_INTEGRATION=1 (matches the existing convention for
// pi-dependent tests). Skipped by default so the fast unit suite is not
// gated on a Pi binary being installed.

import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { getReadLineNumbersExtensionPath } from '../../../src/pi/read-line-numbers-extension.js';

const ENABLED = process.env.PI_INTEGRATION === '1';
const describeIntegration = ENABLED ? describe : describe.skip;

describeIntegration('read-line-numbers Pi integration', () => {
  it('numbers each read line with its true source line number', () => {
    const extensionPath = getReadLineNumbersExtensionPath();
    expect(extensionPath).toBeTruthy();

    const dir = mkdtempSync(join(tmpdir(), 'rl-integration-'));
    const lines = Array.from({ length: 12 }, (_, i) => `fixture-line-${i + 1}`);
    const fixturePath = join(dir, 'fixture.txt');
    writeFileSync(fixturePath, lines.join('\n') + '\n', 'utf8');

    // Spawn pi in one-shot mode with the extension loaded and ask it to
    // read the fixture starting at offset 3. Any Pi capable of running a
    // single-turn "read this file" prompt satisfies the test — no specific
    // model is required beyond the caller's PI_INTEGRATION_MODEL override.
    const model = process.env.PI_INTEGRATION_MODEL ?? 'anthropic/claude-sonnet-4-5-latest';
    const prompt = `Use the read tool on ${fixturePath} with offset=3 and limit=5, then reply with only the tool output.`;

    const args = [
      '--mode', 'json',
      '--no-session',
      '--no-extensions',
      '--no-skills',
      '--offline',
      '--no-context-files',
      '--no-prompt-templates',
      '--no-themes',
      '--model', model,
      '-e', extensionPath!,
    ];
    const result = spawnSync('pi', args, {
      input: prompt,
      encoding: 'utf8',
      timeout: 120_000,
    });

    // If Pi is not installed, treat as environmental skip.
    if (result.error && (result.error as NodeJS.ErrnoException).code === 'ENOENT') {
      console.warn('pi binary not present — skipping integration assertion');
      return;
    }

    // JSONL framing must not have been corrupted by the extension.
    const stdoutLines = (result.stdout ?? '').split('\n').filter((l) => l.length > 0);
    for (const line of stdoutLines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }

    // Numbered prefix must appear on at least one read-content line.
    // The fixture is deterministic — line N contains 'fixture-line-N'.
    // With offset=3 the transform must emit '3 | fixture-line-3'.
    const joined = result.stdout ?? '';
    expect(joined).toMatch(/3 \| fixture-line-3/);
  });

  it('numbers the trailing-newline EOF empty as a citable line (Pi split parity)', () => {
    const extensionPath = getReadLineNumbersExtensionPath();
    expect(extensionPath).toBeTruthy();

    const dir = mkdtempSync(join(tmpdir(), 'rl-integration-eof-'));
    // Fixture "one\ntwo\n" — Pi's split("\n") counts 3 lines with line 3
    // being the EOF empty. Numbered output must contain "3 | " at trailing.
    const fixturePath = join(dir, 'fixture.txt');
    writeFileSync(fixturePath, 'one\ntwo\n', 'utf8');

    const model = process.env.PI_INTEGRATION_MODEL ?? 'anthropic/claude-sonnet-4-5-latest';
    const prompt = `Use the read tool on ${fixturePath} with offset=3, then reply with only the tool output.`;

    const args = [
      '--mode', 'json',
      '--no-session',
      '--no-extensions',
      '--no-skills',
      '--offline',
      '--no-context-files',
      '--no-prompt-templates',
      '--no-themes',
      '--model', model,
      '-e', extensionPath!,
    ];
    const result = spawnSync('pi', args, {
      input: prompt,
      encoding: 'utf8',
      timeout: 120_000,
    });
    if (result.error && (result.error as NodeJS.ErrnoException).code === 'ENOENT') {
      console.warn('pi binary not present — skipping integration assertion');
      return;
    }

    const joined = result.stdout ?? '';
    // Trailing "3 | " (line 3 is the EOF empty) must appear in the numbered
    // model-facing text. This is the concrete regression Lane B corrects.
    expect(joined).toMatch(/3 \| /);
  });

  it('does not prefix non-read tool output (isReadToolResult guard)', () => {
    const extensionPath = getReadLineNumbersExtensionPath();
    expect(extensionPath).toBeTruthy();

    const model = process.env.PI_INTEGRATION_MODEL ?? 'anthropic/claude-sonnet-4-5-latest';
    const prompt = 'Run the bash tool with command="echo one; echo two", then reply with only the tool output.';

    const args = [
      '--mode', 'json',
      '--no-session',
      '--no-extensions',
      '--no-skills',
      '--offline',
      '--no-context-files',
      '--no-prompt-templates',
      '--no-themes',
      '--model', model,
      '-e', extensionPath!,
    ];
    const result = spawnSync('pi', args, {
      input: prompt,
      encoding: 'utf8',
      timeout: 120_000,
    });
    if (result.error && (result.error as NodeJS.ErrnoException).code === 'ENOENT') {
      console.warn('pi binary not present — skipping integration assertion');
      return;
    }

    // bash output must not carry a "N | " prefix on the echoed lines.
    // Detect by searching for the literal "one" or "two" preceded by "N | ".
    const joined = result.stdout ?? '';
    expect(joined).not.toMatch(/\d+ \| one/);
    expect(joined).not.toMatch(/\d+ \| two/);
  });
});

// Sanity check that runs unconditionally: the resolver must find the shipped
// extension. This catches packaging regressions even when Pi is not present.
describe('bundled extension packaging', () => {
  it('extension directory is resolvable from the built package layout', () => {
    const p = getReadLineNumbersExtensionPath();
    expect(p).toBeTruthy();
    expect(resolve(p!)).toContain(join('config', 'pi-extensions', 'read-line-numbers'));
  });
});
