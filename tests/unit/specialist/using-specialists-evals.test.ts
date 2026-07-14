import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();
const evalsPath = join(repoRoot, 'config/skills/using-specialists/evals/evals.json');
const fixtureDir = join(repoRoot, 'config/skills/using-specialists/evals/fixtures/qa-routing');

type EvalSpec = {
  id: number;
  eval_name: string;
  prompt: string;
  expected_output: string;
  assertions: Array<{ name: string; description: string }>;
  files: string[];
};

type EvalsFile = {
  skill_name: string;
  evals: EvalSpec[];
};

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

describe('using-specialists qa-routing evals', () => {
  const evals = readJson<EvalsFile>(evalsPath);

  it('keeps 11 evals: originals first, then qa-routing, then progressive-disclosure', () => {
    expect(evals.skill_name).toBe('using-specialists');
    expect(evals.evals).toHaveLength(11);
    expect(evals.evals.map((entry) => entry.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(evals.evals.slice(0, 4).map((entry) => entry.eval_name)).toEqual([
      'role-selection-implementation',
      'role-selection-debugging',
      'role-selection-review',
      'merge-publication-flow',
    ]);
    expect(evals.evals.slice(4, 8).map((entry) => entry.eval_name)).toEqual([
      'qa-routing-test-engineer-primary-writer',
      'qa-routing-test-engineer-secondary-writer',
      'qa-routing-test-runner-owner-routing',
      'qa-routing-reviewer-consumes-evidence',
    ]);
    // Added with the progressive-disclosure split (unitAI-6639v.3): each asserts the
    // agent reaches the right reference and does NOT load irrelevant ones.
    expect(evals.evals.slice(8).map((entry) => entry.eval_name)).toEqual([
      'progressive-disclosure-merge-routing',
      'progressive-disclosure-bead-authoring',
      'progressive-disclosure-no-content-loss',
    ]);
  });

  it('every progressive-disclosure eval asserts that irrelevant references stay unloaded', () => {
    for (const entry of evals.evals.slice(8)) {
      const names = entry.assertions.map((a) => a.name);
      expect(names.some((n) => n.includes('does_not_load') || n.includes('answers_from_router'))).toBe(true);
    }
  });

  it('keeps test-engineer mandate mode-agnostic and output-contract complete', () => {
    const primary = evals.evals[4];
    const secondary = evals.evals[5];

    expect(primary.prompt).toContain('PRIMARY writer');
    expect(secondary.prompt).toContain('SECONDARY writer');
    expect(primary.expected_output).toContain('test-engineer');
    expect(primary.expected_output).toContain('test_runner_commands');
    expect(primary.expected_output).toContain('source_bug_suspicions');
    expect(secondary.expected_output).toContain('actual changed files/diff');
    expect(secondary.expected_output).toContain('prior test-runner failures');
  });

  it('covers exact command handoff, owner routing, and reviewer evidence', () => {
    const runner = evals.evals[6];
    const reviewer = evals.evals[7];

    expect(runner.prompt).toContain('bad assertion/harness failure');
    expect(runner.prompt).toContain('source-behavior regression');
    expect(runner.expected_output).toContain('test_engineer');
    expect(runner.expected_output).toContain('debugger_or_executor');
    expect(reviewer.expected_output).toContain('smoke/E2E commands');
    expect(reviewer.expected_output).toContain('telemetry/log assertions');
    expect(reviewer.expected_output).toContain('Iron gates');
  });

  it('ships deterministic qa-routing fixtures', () => {
    const expectedFiles = [
      'source-regression.diff',
      'bad-test-result.json',
      'source-regression-result.json',
      'reviewer-input.json',
    ];

    for (const fileName of expectedFiles) {
      expect(readFileSync(join(fixtureDir, fileName), 'utf8')).toBeTruthy();
    }
  });
});
