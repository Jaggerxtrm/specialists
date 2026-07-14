import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SKILL_DIR = resolve(__dirname, '../../../config/skills/using-specialists');
const router = readFileSync(join(SKILL_DIR, 'SKILL.md'), 'utf8');
const read = (r: string) => readFileSync(join(SKILL_DIR, r), 'utf8');
const headings = (body: string) => body.split('\n').filter((l) => l.startsWith('## ')).map((l) => l.slice(3).trim());

const FILES = [
  'SKILL.md',
  'references/bead-contracts.md',
  'references/chain-recipes.md',
  'references/dispatch-preconditions.md',
  'references/monitoring.md',
  'references/merge-and-integration.md',
  'references/registry-and-locations.md',
];

// Progressive disclosure works if, for each phase, the AUTHORITATIVE section lives in
// exactly one file and the router points there. Cross-references between files (rule 14
// naming the Git State Precondition, the merge doc pointing back at it) are deliberate —
// they are pointers, not copies. Ownership is what must be unique, not every mention.
const PHASES = [
  { phase: 'writing a bead', owner: 'references/bead-contracts.md', section: 'Writing Bead Contracts Well' },
  { phase: 'running a chain', owner: 'references/chain-recipes.md', section: 'Canonical Single-Chain Flow' },
  { phase: 'dependent dispatch', owner: 'references/dispatch-preconditions.md', section: 'Git State Precondition (before any chain dispatch)' },
  { phase: 'waiting on a job', owner: 'references/monitoring.md', section: 'Monitoring And Steering' },
  { phase: 'merging', owner: 'references/merge-and-integration.md', section: 'Merge And Publication (manual git is canonical)' },
  { phase: 'finding a specialist', owner: 'references/registry-and-locations.md', section: 'Specialist File Locations' },
];

describe('selective loading: one owner per phase, and the router points at it', () => {
  for (const { phase, owner, section } of PHASES) {
    it(`"${phase}": ${owner} owns "${section}"`, () => {
      expect(headings(read(owner))).toContain(section);
    });

    it(`"${phase}": no other file owns that section`, () => {
      const otherOwners = FILES.filter((f) => f !== owner).filter((f) => headings(read(f)).includes(section));
      expect(otherOwners).toEqual([]);
    });

    it(`"${phase}": the router routes to ${owner}`, () => {
      expect(router).toContain(owner);
    });
  }
});

describe('selective loading: the router alone answers always-needed questions', () => {
  // These gate every task. An agent that loaded only the router must still obey them
  // without opening a single reference.
  const ALWAYS_NEEDED = [
    'sp merge',                 // rule 9 — the forbidden merge path
    'contract:draft',           // rule 15 — the promotion gate
    'specialists list --full',  // the mandatory registry refresh
    'session-close-report',     // the session-end handoff
    'SCRUTINY',                 // applied on every substantive bead
  ];

  for (const marker of ALWAYS_NEEDED) {
    it(`router answers "${marker}" with no reference loaded`, () => {
      expect(router).toContain(marker);
    });
  }
});

describe('selective loading: the router does not drift back into a monolith', () => {
  it('stays within the line budget', () => {
    expect(router.split('\n').length).toBeLessThanOrEqual(350);
  });

  it('owns only always-needed policy — no phase-specific recipe sections', () => {
    const routerSections = headings(router);
    const phaseOwned = PHASES.map((p) => p.section);
    expect(routerSections.filter((s) => phaseOwned.includes(s))).toEqual([]);
  });
});
