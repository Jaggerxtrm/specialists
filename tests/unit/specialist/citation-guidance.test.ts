import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseSpecialist } from '../../../src/specialist/schema.js';

const AFFECTED_SPECIALISTS = ['executor', 'reviewer', 'obligations-scanner'] as const;

describe('exact citation guidance', () => {
  it.each(AFFECTED_SPECIALISTS)('%s loads the exact citation contract', async (name) => {
    const spec = await parseSpecialist(
      readFileSync(`config/specialists/${name}.specialist.json`, 'utf8'),
    );
    const templateSets = spec.specialist.mandatory_rules?.template_sets ?? [];

    expect(templateSets).toContain('exact-citation-contract');
  });

  it('distinguishes raw Pi read from verified file:line evidence', () => {
    const guidance = readFileSync('config/mandatory-rules/exact-citation-contract.md', 'utf8');

    expect(guidance).toContain('## Exact citation contract');
    expect(guidance).toContain('Raw Pi `read` content is not line-numbered evidence.');
    expect(guidance).toContain('Do not emit an exact `file:line` claim from raw `read` content');
    expect(guidance).toContain('file, symbol, section, or a short excerpt');
    expect(guidance).toContain('line-number-emitting tool or deterministic verification');
  });

});
