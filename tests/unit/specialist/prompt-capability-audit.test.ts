import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function readConfig(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('specialist prompt capability audit', () => {
  const expectedRuntimeContractRefs = [
    'config/specialists/explorer.specialist.json',
    'config/specialists/overthinker.specialist.json',
    'config/specialists/obligations-scanner.specialist.json',
    'config/specialists/debugger.specialist.json',
    'config/specialists/quant-methodologist.specialist.json',
    'config/specialists/quant-researcher.specialist.json',
    'config/specialists/service-knowledge-sync.specialist.json',
  ];

  it.each(expectedRuntimeContractRefs)('%s references resolved tool contract instead of hard-coded runtime inventory', (path) => {
    const json = readConfig(path);
    expect(json).toContain('Resolved Tool Contract');
  });

  it('explorer no longer advertises bash/grep fallback as always available', () => {
    const json = readConfig('config/specialists/explorer.specialist.json');
    expect(json).not.toContain('## Fallback Approach — Bash/Grep');
    expect(json).not.toContain('Read-only: bash (read-only commands), grep, find, ls, GitNexus tools only.');
    expect(json).not.toContain('if MCP tools not loaded, use `npx gitnexus query|context` CLI');
  });

  it('overthinker no longer advertises static read/bash/grep/find/ls allowlist', () => {
    const json = readConfig('config/specialists/overthinker.specialist.json');
    expect(json).not.toContain('Only allowed: read, bash (read-only), grep, find, ls.');
  });

  it('obligations-scanner consumes injected obligations_diff instead of requiring git diff reconstruction', () => {
    const json = readConfig('config/specialists/obligations-scanner.specialist.json');
    expect(json).toContain('$obligations_diff');
    expect(json).not.toContain('Run `git diff $(git merge-base HEAD master)..HEAD`');
    expect(json).not.toContain('Grep is fine.');
  });
});
