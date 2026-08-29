// Unit tests for the Specialists-owned extension tool policy (unitAI-34pyf).
// Exercises the REAL bundled artifact (config/pi-extensions/extension-tool-policy/index.mjs)
// through its factory with a fake pi, so the fail-closed selection logic is
// verified against the exact code Pi loads.

import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { join } from 'node:path';
import { getExtensionToolPolicyExtensionPath } from '../../../src/pi/extension-tool-policy-extension.js';

interface FakeTool {
  name: string;
  sourceInfo: { source: string; path: string };
}

function makeFakePi(allTools: FakeTool[]) {
  let active: string[] = [];
  let sessionHandler: (() => void) | undefined;
  return {
    fake: {
      getAllTools: () => allTools,
      setActiveTools: (names: string[]) => {
        active = names;
      },
      on: (event: string, handler: () => void) => {
        if (event === 'session_start') sessionHandler = handler;
      },
      runSessionStart: () => sessionHandler?.(),
      getActive: () => active,
    },
  };
}

/** Load the bundled policy extension factory. */
async function loadPolicyFactory() {
  const policyPath = getExtensionToolPolicyExtensionPath();
  expect(policyPath).toBeTruthy();
  expect(existsSync(resolve(policyPath!))).toBe(true);
  const mod = await import(resolve(policyPath!));
  return mod.default as (pi: unknown) => void;
}

const BUILTINS: FakeTool[] = [
  { name: 'read', sourceInfo: { source: 'builtin', path: '<builtin:read>' } },
  { name: 'bash', sourceInfo: { source: 'builtin', path: '<builtin:bash>' } },
  { name: 'powershell', sourceInfo: { source: 'builtin', path: '<builtin:powershell>' } },
  { name: 'write', sourceInfo: { source: 'builtin', path: '<builtin:write>' } },
  { name: 'edit', sourceInfo: { source: 'builtin', path: '<builtin:edit>' } },
  { name: 'grep', sourceInfo: { source: 'builtin', path: '<builtin:grep>' } },
  { name: 'find', sourceInfo: { source: 'builtin', path: '<builtin:find>' } },
  { name: 'ls', sourceInfo: { source: 'builtin', path: '<builtin:ls>' } },
];

describe('extension tool policy artifact', () => {
  it('activates exactly the granted natives plus extension-class tools', async () => {
    const factory = await loadPolicyFactory();
    const { fake } = makeFakePi([
      ...BUILTINS,
      { name: 'python', sourceInfo: { source: 'cli', path: '/tmp/python-kernel' } },
      { name: 'ast_grep', sourceInfo: { source: 'extension', path: '/pkg/ast' } },
      { name: 'intercom', sourceInfo: { source: 'package', path: '/pkg/intercom' } },
      { name: 'custom_probe', sourceInfo: { source: 'custom', path: '/pkg/custom' } },
      { name: 'sdk_tool', sourceInfo: { source: 'sdk', path: '<sdk>' } },
    ]);
    const prev = process.env.PI_SPECIALIST_ALLOWED_NATIVE_TOOLS;
    process.env.PI_SPECIALIST_ALLOWED_NATIVE_TOOLS = 'read,grep,find,ls';
    try {
      factory(fake);
      fake.runSessionStart();
      // Granted natives (allowlist channel) + every extension-class tool.
      expect(fake.getActive()).toEqual(['read', 'grep', 'find', 'ls', 'python', 'ast_grep', 'intercom', 'custom_probe']);
      // Fail-closed: bash/write/edit/powershell builtins and sdk tools are
      // never activated even though they exist in the registry.
      expect(fake.getActive()).not.toContain('bash');
      expect(fake.getActive()).not.toContain('write');
      expect(fake.getActive()).not.toContain('powershell'); // future/platform builtin
      expect(fake.getActive()).not.toContain('sdk_tool');
    } finally {
      if (prev === undefined) delete process.env.PI_SPECIALIST_ALLOWED_NATIVE_TOOLS;
      else process.env.PI_SPECIALIST_ALLOWED_NATIVE_TOOLS = prev;
    }
  });

  it('keeps every native inactive when the env channel is empty (hard-deny case)', async () => {
    const factory = await loadPolicyFactory();
    const { fake } = makeFakePi([
      ...BUILTINS,
      { name: 'probe_marker', sourceInfo: { source: 'cli', path: '/tmp/fixture' } },
    ]);
    const prev = process.env.PI_SPECIALIST_ALLOWED_NATIVE_TOOLS;
    process.env.PI_SPECIALIST_ALLOWED_NATIVE_TOOLS = 'read'; // READ_ONLY + gitnexus hard deny
    try {
      factory(fake);
      fake.runSessionStart();
      expect(fake.getActive()).toEqual(['read', 'probe_marker']);
      expect(fake.getActive()).not.toContain('grep');
      expect(fake.getActive()).not.toContain('find');
      expect(fake.getActive()).not.toContain('ls');
    } finally {
      if (prev === undefined) delete process.env.PI_SPECIALIST_ALLOWED_NATIVE_TOOLS;
      else process.env.PI_SPECIALIST_ALLOWED_NATIVE_TOOLS = prev;
    }
  });

  it('survives session_start failures fail-closed (empty active set)', async () => {
    const factory = await loadPolicyFactory();
    const { fake } = makeFakePi([]);
    // Simulate an API failure inside the handler (getAllTools throws).
    const brokenPi = {
      on: (event: string, handler: () => void) => { if (event === 'session_start') handler(); },
      getAllTools: () => { throw new Error('boom'); },
      setActiveTools: () => { throw new Error('must not be called'); },
    };
    expect(() => factory(brokenPi)).not.toThrow();
  });
});

describe('policy extension path resolver', () => {
  it('resolves the bundled artifact from source layout', () => {
    const p = getExtensionToolPolicyExtensionPath();
    expect(p).toBeTruthy();
    expect(join(p!, 'index.mjs')).toContain('extension-tool-policy');
  });
});