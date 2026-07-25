// ISSUE: xtrm-wiy5n.4.11 — quarantined from the default test baseline.
import { describe, expect, it } from 'vitest';

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

type Mapping = Record<string, unknown>;

type RunnerResolution = {
  labels: string[];
  isIndeterminate: boolean;
};

const WORKFLOW_DIRECTORY = join(process.cwd(), '.github', 'workflows');
const CREDENTIAL_PATTERN = /(?:github\.token|secrets\.[A-Za-z0-9_]+|GITHUB_TOKEN)/;
const COMMENT_COMMAND_PATTERN = /gh\s+(?:pr|issue)\s+comment|(?:issues|pulls)(?:\/[^\s/]+)?\/comments/i;
const COMMENT_ACTION_PATTERN = /comment/i;
const COMMENT_WRITER_LABEL_PATTERN = /\b(?:upsert|create|update|write)\b.*\bcomments?/i;
const SELF_HOSTED_PATTERN = /self-hosted/i;

function isMapping(value: unknown): value is Mapping {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseWorkflow(source: string): Mapping {
  const workflow = parseYaml(source);
  if (!isMapping(workflow)) throw new Error('workflow root must be a mapping');
  return workflow;
}

function hasTrigger(workflow: Mapping, event: string): boolean {
  const triggers = workflow.on;
  if (Array.isArray(triggers)) return triggers.includes(event);
  return isMapping(triggers) && Object.hasOwn(triggers, event);
}

function getJobs(workflow: Mapping): Mapping | undefined {
  return isMapping(workflow.jobs) ? workflow.jobs : undefined;
}

function isPullRequestReachable(job: Mapping): boolean {
  const condition = job.if;
  if (typeof condition !== 'string') return true;

  const normalizedCondition = condition
    .replace(/^\s*\$\{\{\s*/, '')
    .replace(/\s*\}\}\s*$/, '')
    .trim();
  return !/^github\.event_name\s*!=\s*(['"])pull_request\1$/.test(normalizedCondition);
}

function resolvePullRequestRunner(value: unknown): RunnerResolution {
  if (typeof value === 'string' && !value.includes('${{')) {
    return { labels: [value], isIndeterminate: false };
  }
  if (Array.isArray(value) && value.every((label) => typeof label === 'string')) {
    return {
      labels: value,
      isIndeterminate: value.some((label) => label.includes('${{')),
    };
  }
  if (typeof value !== 'string') return { labels: [], isIndeterminate: true };

  const expression = value.replace(/^\$\{\{\s*|\s*\}\}$/g, '').trim();
  const pullRequestBranch = expression.match(
    /^github\.event_name\s*==\s*['"]pull_request['"]\s*&&\s*['"]([^'"]+)['"]\s*\|\|/,
  );
  if (pullRequestBranch?.[1]) return { labels: [pullRequestBranch[1]], isIndeterminate: false };
  return { labels: [], isIndeterminate: true };
}

function containsWritePermission(value: unknown): boolean {
  if (typeof value === 'string') return /(?:^|-)write(?:$|-)/i.test(value);
  if (Array.isArray(value)) return value.some(containsWritePermission);
  if (isMapping(value)) return Object.values(value).some(containsWritePermission);
  return false;
}

function containsCredentialForwarding(value: unknown, key = ''): boolean {
  if (/(?:token|secret)/i.test(key)) return true;
  if (typeof value === 'string') {
    return CREDENTIAL_PATTERN.test(value) || /secrets\s*:\s*inherit/.test(value);
  }
  if (Array.isArray(value)) return value.some((item) => containsCredentialForwarding(item));
  if (isMapping(value)) {
    return Object.entries(value).some(([childKey, childValue]) =>
      containsCredentialForwarding(childValue, childKey),
    );
  }
  return false;
}

function isCommentWriter(step: Mapping): boolean {
  const uses = typeof step.uses === 'string' ? step.uses : '';
  const stepText = JSON.stringify(step);
  return (uses.length > 0 && COMMENT_ACTION_PATTERN.test(uses)) ||
    COMMENT_COMMAND_PATTERN.test(stepText) || COMMENT_WRITER_LABEL_PATTERN.test(stepText);
}

function findTrustViolations(workflow: Mapping, fileName = 'fixture'): string[] {
  const violations: string[] = [];
  if (hasTrigger(workflow, 'pull_request_target')) {
    violations.push(`${fileName}: pull_request_target is not permitted`);
  }

  if (!hasTrigger(workflow, 'pull_request')) return violations;

  const permissions = workflow.permissions;
  if (!isMapping(permissions) || permissions.contents !== 'read') {
    violations.push(`${fileName}: workflow must grant contents: read explicitly`);
  }
  if (containsWritePermission(permissions)) {
    violations.push(`${fileName}: workflow grants write permission`);
  }
  if (containsCredentialForwarding(workflow.env)) {
    violations.push(`${fileName}: workflow forwards token or secret`);
  }

  const jobs = getJobs(workflow);
  if (!jobs) {
    violations.push(`${fileName}: workflow has no jobs mapping`);
    return violations;
  }

  for (const [jobId, rawJob] of Object.entries(jobs)) {
    if (!isMapping(rawJob) || !isPullRequestReachable(rawJob)) continue;
    const runner = resolvePullRequestRunner(rawJob['runs-on']);
    if (runner.isIndeterminate) {
      violations.push(`${fileName}/${jobId}: pull_request runner cannot be resolved safely`);
    } else if (runner.labels.some((label) => SELF_HOSTED_PATTERN.test(label))) {
      violations.push(`${fileName}/${jobId}: pull_request resolves to self-hosted runner`);
    }
    if (containsWritePermission(rawJob.permissions)) {
      violations.push(`${fileName}/${jobId}: job grants write permission`);
    }
    if (containsCredentialForwarding(rawJob)) {
      violations.push(`${fileName}/${jobId}: job forwards token or secret`);
    }

    const steps = Array.isArray(rawJob.steps) ? rawJob.steps : [];
    for (const [stepIndex, rawStep] of steps.entries()) {
      if (!isMapping(rawStep)) continue;
      const uses = typeof rawStep.uses === 'string' ? rawStep.uses : '';
      if (uses.startsWith('actions/checkout@')) {
        const options = rawStep.with;
        if (!isMapping(options) || options['persist-credentials'] !== false) {
          violations.push(`${fileName}/${jobId}/step-${stepIndex}: checkout persists credentials`);
        }
      }
      if (isCommentWriter(rawStep)) {
        violations.push(`${fileName}/${jobId}/step-${stepIndex}: PR comment writer found`);
      }
    }
  }

  return violations;
}

const SAFE_FIXTURE = `name: fixture
permissions:
  contents: read
on:
  pull_request:
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          persist-credentials: false
`;

function fixtureWith(change: (source: string) => string): Mapping {
  return parseWorkflow(change(SAFE_FIXTURE));
}

describe('pull_request workflow trust boundary', () => {
  it('enumerates every pull_request workflow and reachable job', () => {
    const workflowFiles = readdirSync(WORKFLOW_DIRECTORY)
      .filter((file) => file.endsWith('.yml') || file.endsWith('.yaml'));
    const pullRequestWorkflows = workflowFiles.filter((file) =>
      hasTrigger(parseWorkflow(readFileSync(join(WORKFLOW_DIRECTORY, file), 'utf8')), 'pull_request'),
    );

    expect(pullRequestWorkflows.length).toBeGreaterThan(0);
    for (const file of workflowFiles) {
      const workflow = parseWorkflow(readFileSync(join(WORKFLOW_DIRECTORY, file), 'utf8'));
      expect(findTrustViolations(workflow, file), file).toEqual([]);
    }
  });

  it('rejects runner indirection that can select CI_RUNNER', () => {
    const workflow = fixtureWith((source) => source.replace('ubuntu-latest', '${{ vars.CI_RUNNER }}'));
    expect(findTrustViolations(workflow)).toContain('fixture/check: pull_request runner cannot be resolved safely');
  });

  it('rejects compound non-pull-request guards', () => {
    const workflow = fixtureWith((source) => source.replace(
      '    runs-on: ubuntu-latest',
      "    if: github.event_name != 'pull_request' || github.event_name == 'pull_request'\n    runs-on: self-hosted",
    ));
    expect(findTrustViolations(workflow)).toContain('fixture/check: pull_request resolves to self-hosted runner');
  });

  it('allows read-only pull request permission', () => {
    const workflow = fixtureWith((source) => source.replace('  contents: read\n', '  contents: read\n  pull-requests: read\n'));
    expect(findTrustViolations(workflow)).toEqual([]);
  });

  it.each([
    ['workflow write permission', (source: string) => source.replace('contents: read', 'contents: write'), 'workflow grants write permission'],
    ['job write permission', (source: string) => source.replace('    runs-on: ubuntu-latest', '    permissions:\n      contents: write\n    runs-on: ubuntu-latest'), 'job grants write permission'],
    ['token forwarding', (source: string) => source.replace('    runs-on: ubuntu-latest', `    env:\n      GITHUB_TOKEN: \${{ github.token }}\n    runs-on: ubuntu-latest`), 'job forwards token or secret'],
    ['missing checkout credential hardening', (source: string) => source.replace('          persist-credentials: false\n', ''), 'checkout persists credentials'],
    ['comment writer action', (source: string) => source.replace('      - uses: actions/checkout@v4', '      - uses: actions/checkout@v4\n      - uses: peter-evans/create-or-update-comment@v4'), 'PR comment writer found'],
  ])('rejects %s', (_name, transform, expectedViolation) => {
    const workflow = fixtureWith(transform);
    expect(findTrustViolations(workflow).some((violation) => violation.includes(expectedViolation))).toBe(true);
  });

  it('rejects pull_request_target regardless of other trigger policy', () => {
    const workflow = fixtureWith((source) => source.replace('pull_request:', 'pull_request_target:'));
    expect(findTrustViolations(workflow)).toContain('fixture: pull_request_target is not permitted');
  });

  it('preserves OSV protected scan runner and check names', () => {
    const workflow = parseWorkflow(readFileSync(join(WORKFLOW_DIRECTORY, 'osv-scanner.yml'), 'utf8'));
    const jobs = getJobs(workflow);
    expect(jobs).toBeDefined();
    const protectedScan = jobs?.['protected-scan'];
    const prScan = jobs?.['pr-scan'];
    expect(isMapping(protectedScan) && protectedScan['runs-on']).toContain('CI_RUNNER');
    expect(isMapping(protectedScan) && protectedScan.name).toBe('OSV scan (push/schedule hard gate)');
    expect(isMapping(prScan) && prScan.name).toBe('OSV scan');
  });
});
