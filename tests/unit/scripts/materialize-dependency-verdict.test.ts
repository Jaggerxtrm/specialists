import { describe, expect, it } from 'vitest';

import {
  buildDryRunPreview,
  buildMaterializationPlan,
} from '../../../scripts/materialize-dependency-verdict.mjs';

function buildVerdict(overrides: Record<string, unknown> = {}) {
  return {
    verdict: 'PASS_WITH_NOTES',
    source_bead_id: 'dep-123',
    package: {
      name: 'vite',
      ecosystem: 'npm',
      from_version: '8.0.13',
      to_version: '8.0.16',
    },
    trigger: {
      repo: 'Jaggerxtrm/specialists',
      pr: 152,
      branch: 'dependabot/npm_and_yarn/vite-8.0.16',
    },
    summary: 'Root dependency is remediated but the update still needs operator-visible notes.',
    recommendations: ['Run the package payload smoke after merge.'],
    evidence: {
      case_json_path: 'artifacts/dependency_update_case.json',
      upgrade_dossier_ref: 'artifacts/upgrade-dossier.md',
      pr_comment_ref: 'gh://Jaggerxtrm/specialists/pull/152#issuecomment-1',
      external_ref: 'gh-152',
    },
    ...overrides,
  };
}

describe('materialize dependency verdict', () => {
  it('maps PASS_WITH_NOTES to a dry-run advisor issue', () => {
    const plan = buildMaterializationPlan(buildVerdict());
    const preview = buildDryRunPreview(plan);

    expect(plan.artifactClass).toBe('advisor');
    expect(plan.issueType).toBe('decision');
    expect(plan.priority).toBe(3);
    expect(plan.labels).toContain('class:advisor');
    expect(plan.deps).toEqual(['discovered-from:dep-123']);
    expect(plan.shouldBlockSource).toBe(false);
    expect(preview.post_create).toEqual([]);
    expect(plan.description).toContain('upgrade_dossier_ref: artifacts/upgrade-dossier.md');
  });

  it('maps COOLDOWN to a discovered-from follow-up', () => {
    const plan = buildMaterializationPlan(buildVerdict({
      verdict: 'COOLDOWN',
      summary: 'Release is newer than the cooldown window.',
    }));

    expect(plan.artifactClass).toBe('followup');
    expect(plan.issueType).toBe('task');
    expect(plan.priority).toBe(3);
    expect(plan.labels).toContain('class:followup');
    expect(plan.labels).toContain('lane:quarantine');
    expect(plan.deps).toEqual(['discovered-from:dep-123']);
    expect(plan.shouldBlockSource).toBe(false);
    expect(plan.title).toContain('cooldown');
  });

  it('maps NEEDS_CHANGES to an executor follow-up', () => {
    const plan = buildMaterializationPlan(buildVerdict({
      verdict: 'NEEDS_CHANGES',
      recommendations: ['Update workflow permissions and add a regression test.'],
      validation_issue_ids: ['test-456'],
    }));

    expect(plan.artifactClass).toBe('followup');
    expect(plan.issueType).toBe('task');
    expect(plan.priority).toBe(2);
    expect(plan.labels).toContain('lane:executor');
    expect(plan.deps).toEqual(['discovered-from:dep-123', 'validates:test-456']);
    expect(plan.description).toContain('validation_relations: test-456');
  });

  it.each(['BLOCKED', 'SECURITY_FORCED'])('maps %s to a gate issue that blocks the source bead', (verdict) => {
    const plan = buildMaterializationPlan(buildVerdict({
      verdict,
      summary: 'This update cannot merge until the blocking risk is resolved.',
    }));
    const preview = buildDryRunPreview(plan);

    expect(plan.artifactClass).toBe('gate');
    expect(plan.issueType).toBe('task');
    expect(plan.labels).toContain('class:gate');
    expect(plan.labels).toContain('lane:gate');
    expect(plan.shouldBlockSource).toBe(true);
    expect(plan.deps).toEqual(['discovered-from:dep-123']);
    expect(preview.post_create).toEqual([
      {
        command: 'bd',
        args: ['dep', '<created-issue-id>', '--blocks', 'dep-123'],
      },
    ]);
  });
});
