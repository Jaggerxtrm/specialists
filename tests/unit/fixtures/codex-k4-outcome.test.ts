// K4 (unitAI-e67up.4) — codex-k4 fixture provenance and separation proofs.
//
// Fixtures are captured against the Core K2 contract schema
// `packages/contracts/schemas/xtrm.command-outcome.v1.json` at merged Core
// commit 1ed512a49efaf75f3e84c128f9d82958ece09d3a (gate bead unitAI-e67up.6).
// They are evidence, not a vendored copy of the schema: Specialists consumes
// the contract boundary only and never re-owns field names or reason codes.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const FIXTURES = join(process.cwd(), 'tests', 'fixtures', 'codex-k4');

describe('codex-k4 fixtures', () => {
  const files = readdirSync(FIXTURES).filter((f) => f.endsWith('.json')).sort();

  it('ships the three contracted fixtures', () => {
    expect(files).toEqual([
      'launch-outcome-codex-ready.json',
      'launch-outcome-pi-unverified.json',
      'launch-outcome-wrong-schema.json',
    ]);
  });

  it('keeps the outcome surface distinct from openai-codex provider spellings', () => {
    // The launch outcome identifies a runtime surface (pi|claude|codex); it
    // never carries a Pi provider/model spelling. `openai-codex/...` must not
    // appear anywhere in the fixture set, so a provider ID can never alias
    // the codex surface through this seam.
    for (const file of files) {
      const raw = readFileSync(join(FIXTURES, file), 'utf-8');
      expect(raw).not.toContain('openai-codex');
    }
    const codex = JSON.parse(readFileSync(join(FIXTURES, 'launch-outcome-codex-ready.json'), 'utf-8'));
    expect(codex.runtime.name).toBe('codex');
  });

  it('carries no control characters in any string field (redaction boundary)', () => {
    const scan = (value: unknown): void => {
      if (typeof value === 'string') {
        expect(value).not.toMatch(/[\u0000-\u001F\u007F]/);
        return;
      }
      if (Array.isArray(value)) {
        value.forEach(scan);
        return;
      }
      if (value && typeof value === 'object') {
        Object.values(value as Record<string, unknown>).forEach(scan);
      }
    };
    for (const file of files) {
      scan(JSON.parse(readFileSync(join(FIXTURES, file), 'utf-8')));
    }
  });
});
