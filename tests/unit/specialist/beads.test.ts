import { describe, it, expect } from 'vitest';
import { buildBeadContext, shouldCreateBead } from '../../../src/specialist/beads.js';

describe('shouldCreateBead', () => {
  it('returns false when never', () => {
    expect(shouldCreateBead('never', 'READ_ONLY')).toBe(false);
    expect(shouldCreateBead('never', 'HIGH')).toBe(false);
  });

  it('returns true when always, regardless of permission', () => {
    expect(shouldCreateBead('always', 'READ_ONLY')).toBe(true);
    expect(shouldCreateBead('always', 'HIGH')).toBe(true);
  });

  it('returns false when auto and READ_ONLY', () => {
    expect(shouldCreateBead('auto', 'READ_ONLY')).toBe(false);
  });

  it('returns true when auto and LOW', () => {
    expect(shouldCreateBead('auto', 'LOW')).toBe(true);
  });

  it('returns true when auto and MEDIUM', () => {
    expect(shouldCreateBead('auto', 'MEDIUM')).toBe(true);
  });

  it('returns true when auto and HIGH', () => {
    expect(shouldCreateBead('auto', 'HIGH')).toBe(true);
  });
});

describe('buildBeadContext', () => {
  it('formats title, description, notes, and blockers into specialist-ready context', () => {
    const context = buildBeadContext({
      id: 'unitAI-55d',
      title: 'Refactor auth module',
      description: 'Extract JWT validation into AuthService.',
      notes: 'Keep middleware API stable.',
      dependencies: [
        {
          id: 'unitAI-fgy',
          title: 'Write bead_id into status.json',
          description: 'Make bead tracking visible before completion.',
          notes: 'Needed for output pinning.',
          dependency_type: 'blocks',
        },
      ],
    });

    expect(context).toBe([
      '# Task: Refactor auth module',
      'Extract JWT validation into AuthService.',
      '',
      '## Notes',
      'Keep middleware API stable.',
      '',
      '## Context: Blocked by',
      '- Write bead_id into status.json (unitAI-fgy)',
      '  Make bead tracking visible before completion.',
      '  Notes: Needed for output pinning.',
    ].join('\n'));
  });

  it('omits optional sections when notes and blockers are absent', () => {
    const context = buildBeadContext({
      id: 'unitAI-7fm',
      title: 'Register project MCP',
      description: 'Write project-scoped .mcp.json registration.',
    });

    expect(context).toBe([
      '# Task: Register project MCP',
      'Write project-scoped .mcp.json registration.',
    ].join('\n'));
  });
});
