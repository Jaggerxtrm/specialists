import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SKILL_DIR = resolve(__dirname, '../../../config/skills/using-specialists');
const router = readFileSync(join(SKILL_DIR, 'SKILL.md'), 'utf8');
const read = (r: string) => readFileSync(join(SKILL_DIR, r), 'utf8');
const topHeading = (body: string) => body.split('\n').find((line) => line.startsWith('# '))?.slice(2).trim();

const ROUTED_PHASES = [
  { phase: 'running a specialist role/gate sequence', owner: 'references/chain-recipes.md', heading: 'Specialist role and gate recipes' },
  { phase: 'dependent dispatch', owner: 'references/dispatch-preconditions.md', heading: 'Dispatch preconditions' },
  { phase: 'waiting on a job', owner: 'references/monitoring.md', heading: 'Monitoring Specialist jobs' },
  { phase: 'integration/publication', owner: 'references/merge-and-integration.md', heading: 'Integration and publication' },
  { phase: 'registry/location discovery', owner: 'references/registry-and-locations.md', heading: 'Registry and locations' },
];

describe('selective loading: one routed owner per Specialists execution phase', () => {
  for (const { phase, owner, heading } of ROUTED_PHASES) {
    it(`"${phase}": ${owner} owns "${heading}"`, () => {
      expect(topHeading(read(owner))).toBe(heading);
    });

    it(`"${phase}": the router routes to ${owner}`, () => {
      expect(router).toContain(owner);
    });
  }

  it('keeps generic bead-contract doctrine outside Specialists while retaining its precondition reference', () => {
    const contract = read('references/bead-contracts.md');
    expect(topHeading(contract)).toBe('Specialist contract precondition');
    expect(contract).toContain('The generic work-contract doctrine belongs to XTRM `/using-xtrm` and `/planning`.');
    expect(router).toContain('The detailed contract-writing doctrine belongs to `/planning`; Specialists consumes it.');
  });
});

describe('selective loading: the router alone carries stable cross-phase invariants', () => {
  const ALWAYS_NEEDED = [
    'specialists list --full',
    'sp help',
    'bd show <id>',
    'A specialist result is a claim, not live truth.',
    'Do not busy-poll.',
    'generic native chain runtime is not yet a released contract',
  ];

  for (const marker of ALWAYS_NEEDED) {
    it(`router carries "${marker}" without loading a reference`, () => {
      expect(router).toContain(marker);
    });
  }
});

describe('selective loading: the router does not drift back into a monolith', () => {
  it('stays within the v4 line budget', () => {
    expect(router.split('\n').length).toBeLessThan(220);
  });

  it('routes advanced surfaces instead of recreating retired active skills', () => {
    expect(router).toContain('Advanced surfaces are references, not separate skills');
    expect(router).toContain('references/kpi.md');
    expect(router).toContain('references/nodes.md');
    expect(router).toContain('references/script-class.md');
    expect(router).toContain('references/specialist-definitions.md');
  });
});
