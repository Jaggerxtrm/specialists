#!/usr/bin/env node
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

export const SUPPORTED_VERDICTS = new Set([
  'PASS',
  'PASS_WITH_NOTES',
  'COOLDOWN',
  'NEEDS_CHANGES',
  'BLOCKED',
  'SECURITY_FORCED',
]);

const MATERIALIZATION_MAP = {
  PASS_WITH_NOTES: {
    classLabel: 'class:advisor',
    issueType: 'decision',
    priority: 3,
    relationLabels: ['discovered-from'],
    requestedAction: 'Capture the migration note, watch items, or validation notes without blocking the dependency update.',
  },
  COOLDOWN: {
    classLabel: 'class:followup',
    issueType: 'task',
    priority: 3,
    relationLabels: ['discovered-from'],
    requestedAction: 'Defer the dependency update until the cooldown window clears, then reassess with the same evidence bundle.',
  },
  NEEDS_CHANGES: {
    classLabel: 'class:followup',
    issueType: 'task',
    priority: 2,
    relationLabels: ['discovered-from'],
    requestedAction: 'Apply the required code/config/test/workflow changes before the dependency update can land safely.',
  },
  BLOCKED: {
    classLabel: 'class:gate',
    issueType: 'task',
    priority: 1,
    relationLabels: ['discovered-from', 'blocks'],
    requestedAction: 'Resolve the blocking risk before merge/deploy continues.',
  },
  SECURITY_FORCED: {
    classLabel: 'class:gate',
    issueType: 'task',
    priority: 0,
    relationLabels: ['discovered-from', 'blocks'],
    requestedAction: 'Treat this as a blocking security remediation and resolve it before merge/deploy continues.',
  },
};

function parseArgs(argv) {
  const args = {
    input: '',
    apply: false,
    cwd: process.cwd(),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--input') {
      args.input = argv[i + 1] ?? '';
      i += 1;
    } else if (arg === '--apply') {
      args.apply = true;
    } else if (arg === '--cwd') {
      args.cwd = argv[i + 1] ?? args.cwd;
      i += 1;
    }
  }

  if (!args.input) {
    throw new Error('usage: node scripts/materialize-dependency-verdict.mjs --input <verdict.json> [--apply] [--cwd <repo>]');
  }

  return args;
}

export function normalizeVerdictStatus(raw) {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return null;
  }
  const normalized = raw.trim().toUpperCase();
  return SUPPORTED_VERDICTS.has(normalized) ? normalized : null;
}

function compactText(value, fallback = '') {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

function pickFirstString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return '';
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim());
}

function normalizeEvidenceRefs(doc) {
  const evidence = doc.evidence && typeof doc.evidence === 'object' ? doc.evidence : {};
  const caseJsonPath = pickFirstString(
    doc.case_json_path,
    doc.caseJsonPath,
    evidence.case_json_path,
    evidence.caseJsonPath,
    doc.case_path,
    evidence.case_path,
  );
  if (!caseJsonPath) {
    throw new Error('verdict JSON is missing case_json_path evidence');
  }

  return {
    caseJsonPath,
    upgradeDossierRef: pickFirstString(doc.upgrade_dossier_ref, doc.upgradeDossierRef, evidence.upgrade_dossier_ref, evidence.upgradeDossierRef, doc.upgrade_dossier_path),
    prCommentRef: pickFirstString(doc.pr_comment_ref, doc.prCommentRef, evidence.pr_comment_ref, evidence.prCommentRef, doc.comment_ref, evidence.comment_ref),
    externalRef: pickFirstString(doc.external_ref, doc.externalRef, evidence.external_ref, evidence.externalRef),
  };
}

export function normalizeVerdictDocument(doc) {
  const verdict = normalizeVerdictStatus(
    doc.verdict?.status ??
    doc.verdict_status ??
    doc.verdict ??
    doc.status ??
    doc.preliminary_verdict?.status,
  );

  if (!verdict) {
    throw new Error('verdict JSON is missing a supported verdict status');
  }
  if (verdict === 'PASS') {
    throw new Error('PASS does not materialize a substrate artifact');
  }

  const sourceBeadId = pickFirstString(
    doc.source_bead_id,
    doc.sourceBeadId,
    doc.dependency_update_bead_id,
    doc.dependencyUpdateBeadId,
    doc.parent_bead_id,
    doc.parentBeadId,
  );
  if (!sourceBeadId) {
    throw new Error('verdict JSON is missing source_bead_id / dependency_update_bead_id');
  }

  const pkg = doc.package && typeof doc.package === 'object' ? doc.package : {};
  const trigger = doc.trigger && typeof doc.trigger === 'object' ? doc.trigger : {};
  const evidenceRefs = normalizeEvidenceRefs(doc);

  const packageName = pickFirstString(pkg.name, doc.package_name, doc.packageName, 'unknown-package');
  const ecosystem = pickFirstString(pkg.ecosystem, doc.ecosystem, 'unknown');
  const fromVersion = pickFirstString(pkg.from_version, pkg.fromVersion, doc.from_version, doc.fromVersion);
  const toVersion = pickFirstString(pkg.to_version, pkg.toVersion, doc.to_version, doc.toVersion, pkg.version, doc.version, 'unknown');
  const repo = pickFirstString(trigger.repo, doc.repo);
  const branch = pickFirstString(trigger.branch, doc.branch);
  const prNumber = typeof trigger.pr === 'number'
    ? trigger.pr
    : typeof doc.pr === 'number'
      ? doc.pr
      : null;
  const summary = compactText(
    pickFirstString(
      doc.summary,
      doc.reason,
      doc.rationale,
      doc.verdict?.reason,
      doc.preliminary_verdict?.reason,
    ),
    'No additional summary provided.',
  );
  const recommendations = normalizeStringArray(doc.recommendations ?? doc.follow_ups ?? doc.followUps);
  const validationIssueIds = normalizeStringArray(doc.validation_issue_ids ?? doc.validationIssueIds);

  return {
    verdict,
    sourceBeadId,
    packageName,
    ecosystem,
    fromVersion,
    toVersion,
    repo,
    branch,
    prNumber,
    summary,
    recommendations,
    validationIssueIds,
    evidenceRefs,
  };
}

function packageDisplayName(normalized) {
  return normalized.fromVersion
    ? `${normalized.packageName} ${normalized.fromVersion} → ${normalized.toVersion}`
    : `${normalized.packageName} → ${normalized.toVersion}`;
}

function buildTitle(normalized) {
  const target = packageDisplayName(normalized);
  switch (normalized.verdict) {
    case 'PASS_WITH_NOTES':
      return `Advisor: capture dependency update notes for ${target}`;
    case 'COOLDOWN':
      return `Follow-up: cooldown dependency update for ${target}`;
    case 'NEEDS_CHANGES':
      return `Executor follow-up: apply dependency update changes for ${target}`;
    case 'BLOCKED':
      return `Gate: blocked dependency update for ${target}`;
    case 'SECURITY_FORCED':
      return `Gate: security-forced dependency update for ${target}`;
    default:
      throw new Error(`unsupported verdict: ${normalized.verdict}`);
  }
}

function buildLabels(normalized, mapping) {
  const labels = [
    mapping.classLabel,
    'role:dependency-update',
    `verdict:${normalized.verdict.toLowerCase()}`,
    `ecosystem:${normalized.ecosystem.toLowerCase()}`,
  ];
  if (normalized.verdict === 'COOLDOWN') labels.push('lane:quarantine');
  if (normalized.verdict === 'NEEDS_CHANGES') labels.push('lane:executor');
  if (normalized.verdict === 'PASS_WITH_NOTES') labels.push('lane:advisor');
  if (mapping.classLabel === 'class:gate') labels.push('lane:gate');
  return labels;
}

function buildDescription(normalized, mapping) {
  const evidenceLines = [
    `- case_json_path: ${normalized.evidenceRefs.caseJsonPath}`,
  ];
  if (normalized.evidenceRefs.upgradeDossierRef) {
    evidenceLines.push(`- upgrade_dossier_ref: ${normalized.evidenceRefs.upgradeDossierRef}`);
  }
  if (normalized.evidenceRefs.prCommentRef) {
    evidenceLines.push(`- pr_comment_ref: ${normalized.evidenceRefs.prCommentRef}`);
  }
  if (normalized.evidenceRefs.externalRef) {
    evidenceLines.push(`- external_ref: ${normalized.evidenceRefs.externalRef}`);
  }

  const recommendationLines = normalized.recommendations.length > 0
    ? normalized.recommendations.map((item) => `- ${item}`)
    : ['- none supplied'];

  const triggerLines = [
    normalized.repo ? `- repo: ${normalized.repo}` : null,
    normalized.prNumber !== null ? `- pr: #${normalized.prNumber}` : null,
    normalized.branch ? `- branch: ${normalized.branch}` : null,
    `- source_bead_id: ${normalized.sourceBeadId}`,
    `- substrate_class: ${mapping.classLabel.replace('class:', '')}`,
    `- verdict: ${normalized.verdict}`,
  ].filter(Boolean);

  return [
    '## MATERIALIZATION',
    ...triggerLines,
    '',
    '## SUMMARY',
    normalized.summary,
    '',
    '## REQUESTED_ACTION',
    mapping.requestedAction,
    '',
    '## RECOMMENDATIONS',
    ...recommendationLines,
    '',
    '## EVIDENCE_REFS',
    ...evidenceLines,
    '',
    '## LINKING',
    `- primary_relation: ${mapping.relationLabels.join(', ')}`,
    normalized.validationIssueIds.length > 0
      ? `- validation_relations: ${normalized.validationIssueIds.join(', ')}`
      : '- validation_relations: none',
  ].join('\n');
}

export function buildMaterializationPlan(doc) {
  const normalized = normalizeVerdictDocument(doc);
  const mapping = MATERIALIZATION_MAP[normalized.verdict];
  if (!mapping) {
    throw new Error(`No materialization mapping for verdict ${normalized.verdict}`);
  }

  const deps = [`discovered-from:${normalized.sourceBeadId}`];
  for (const validationIssueId of normalized.validationIssueIds) {
    deps.push(`validates:${validationIssueId}`);
  }

  const title = buildTitle(normalized);
  const labels = buildLabels(normalized, mapping);
  const description = buildDescription(normalized, mapping);

  return {
    mode: 'dry-run',
    normalized,
    artifactClass: mapping.classLabel.replace('class:', ''),
    issueType: mapping.issueType,
    priority: mapping.priority,
    title,
    labels,
    deps,
    shouldBlockSource: mapping.classLabel === 'class:gate',
    description,
  };
}

function previewCreateArgs(plan, descriptionPath) {
  const args = [
    'create',
    '--title', plan.title,
    '--type', plan.issueType,
    '--priority', String(plan.priority),
    '--labels', plan.labels.join(','),
    '--body-file', descriptionPath,
    '--json',
  ];
  if (plan.deps.length > 0) {
    args.push('--deps', plan.deps.join(','));
  }
  if (plan.normalized.evidenceRefs.externalRef) {
    args.push('--external-ref', plan.normalized.evidenceRefs.externalRef);
  }
  return args;
}

export function buildDryRunPreview(plan) {
  const createPreview = {
    command: 'bd',
    args: previewCreateArgs(plan, '<temp-description-file>'),
  };
  const postCreate = [];
  if (plan.shouldBlockSource) {
    postCreate.push({
      command: 'bd',
      args: ['dep', '<created-issue-id>', '--blocks', plan.normalized.sourceBeadId],
    });
  }
  return {
    mode: 'dry-run',
    artifact_class: plan.artifactClass,
    verdict: plan.normalized.verdict,
    create: createPreview,
    post_create: postCreate,
  };
}

function runBdCommand(args, cwd) {
  const result = spawnSync('bd', args, {
    cwd,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || result.stdout?.trim() || `bd ${args[0]} failed`);
  }
  return result.stdout;
}

function parseCreatedIssue(stdout) {
  try {
    const parsed = JSON.parse(stdout);
    if (Array.isArray(parsed) && parsed[0] && typeof parsed[0].id === 'string') {
      return parsed[0].id;
    }
    if (parsed && typeof parsed.id === 'string') {
      return parsed.id;
    }
  } catch {
    // fall through
  }
  const match = stdout.match(/"id"\s*:\s*"([^"]+)"/);
  if (!match?.[1]) {
    throw new Error('Unable to parse created issue id from bd create output');
  }
  return match[1];
}

export function materializePlan(plan, options = {}) {
  const cwd = options.cwd ?? process.cwd();
  if (!options.apply) {
    return {
      plan,
      preview: buildDryRunPreview(plan),
    };
  }

  const tempDir = mkdtempSync(join(tmpdir(), 'dependency-materialization-'));
  const descriptionPath = join(tempDir, 'description.md');
  writeFileSync(descriptionPath, `${plan.description}\n`);

  try {
    const createArgs = previewCreateArgs(plan, descriptionPath);
    const createStdout = runBdCommand(createArgs, cwd);
    const createdIssueId = parseCreatedIssue(createStdout);
    const postCreate = [];

    if (plan.shouldBlockSource) {
      runBdCommand(['dep', createdIssueId, '--blocks', plan.normalized.sourceBeadId], cwd);
      postCreate.push({ relation: 'blocks', blocker: createdIssueId, blocked: plan.normalized.sourceBeadId });
    }

    return {
      plan,
      created_issue_id: createdIssueId,
      post_create: postCreate,
    };
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

export function readVerdictFile(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const verdictDoc = readVerdictFile(args.input);
  const plan = buildMaterializationPlan(verdictDoc);
  const result = materializePlan(plan, { apply: args.apply, cwd: args.cwd });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
