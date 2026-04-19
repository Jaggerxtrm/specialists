#!/usr/bin/env node
import { mkdirSync, existsSync, readFileSync, appendFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options });
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  const combined = `${stdout}\n${stderr}`;
  return { code: result.status ?? 1, stdout, stderr, combined };
}

function runJson(command, args, label) {
  const result = runCommand(command, args);
  if (result.code !== 0) {
    throw new Error(`${label} failed: ${result.combined}`);
  }
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`${label} returned non-JSON output: ${result.combined}`);
  }
}

function parseArgs(argv) {
  const now = new Date();
  const defaultRunId = `${now.toISOString().slice(0, 19).replace(/[:T]/g, '-')}`;
  const options = {
    configPath: resolve('config/benchmarks/executor-benchmark-matrix.json'),
    outputRoot: resolve('.specialists/benchmarks/runs'),
    runId: defaultRunId,
    rerunFailed: false,
    baseRef: 'origin/master',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--config' && argv[index + 1]) {
      options.configPath = resolve(argv[index + 1]);
      index += 1;
      continue;
    }
    if (token === '--output-root' && argv[index + 1]) {
      options.outputRoot = resolve(argv[index + 1]);
      index += 1;
      continue;
    }
    if (token === '--run-id' && argv[index + 1]) {
      options.runId = argv[index + 1];
      index += 1;
      continue;
    }
    if (token === '--base-ref' && argv[index + 1]) {
      options.baseRef = argv[index + 1];
      index += 1;
      continue;
    }
    if (token === '--rerun-failed') {
      options.rerunFailed = true;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }

  return options;
}

function readConfig(configPath) {
  const raw = readFileSync(configPath, 'utf8');
  const config = JSON.parse(raw);
  if (!Array.isArray(config.models) || !Array.isArray(config.tasks)) {
    throw new Error('Config must include models[] and tasks[]');
  }
  return config;
}

function createSamplePlan(config) {
  const plan = [];
  for (const task of config.tasks) {
    for (const modelId of config.models) {
      plan.push({
        sampleId: `${task.id}__${modelId}__r1`,
        taskId: task.id,
        seedBead: task.seedBead,
        modelId,
        replicate: 1,
      });
    }
  }
  return plan;
}

function parseJobId(text) {
  // background run prints raw job ID to stdout (e.g. "79a186\n")
  const trimmed = text.trim();
  if (/^[a-z0-9]{6,}$/.test(trimmed)) return trimmed;
  throw new Error(`Could not parse job id from output: ${text}`);
}

function parseVerdict(output) {
  const match = output?.match(/Verdict:\s*(PASS|PARTIAL|FAIL)/i);
  return match?.[1]?.toUpperCase() ?? 'MISSING';
}

function parseGate(output, key) {
  if (!output) return null;
  const pattern = key === 'lint'
    ? /(?:lint_pass|lint)\s*[:=]\s*(true|false|pass|fail)/i
    : /(?:tsc_pass|tsc(?:\s*--noEmit)?)\s*[:=]\s*(true|false|pass|fail)/i;
  const match = output.match(pattern);
  if (!match?.[1]) return null;
  const normalized = match[1].toLowerCase();
  return normalized === 'true' || normalized === 'pass';
}

function readMachineJson(markdown) {
  const match = markdown.match(/```json\s*([\s\S]*?)```/i);
  if (!match?.[1]) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function verifyWorktreeDiff(worktreePath, baseRef) {
  const head = runCommand('git', ['-C', worktreePath, 'rev-parse', 'HEAD']);
  if (head.code !== 0) {
    return { ok: false, reason: 'missing_head_commit' };
  }

  const count = runCommand('git', ['-C', worktreePath, 'rev-list', '--count', `${baseRef}..HEAD`]);
  if (count.code !== 0) {
    return { ok: false, reason: `diff_check_failed:${count.stderr.trim() || 'unknown'}` };
  }

  const commitsAhead = Number(count.stdout.trim());
  if (!Number.isFinite(commitsAhead) || commitsAhead <= 0) {
    return { ok: false, reason: 'no_diff_from_base' };
  }

  return { ok: true, reason: 'ok' };
}

function readIssue(seedBead) {
  const payload = runJson('bd', ['show', seedBead, '--json'], `bd show ${seedBead}`);
  const issue = Array.isArray(payload) ? payload[0] : payload;
  if (!issue?.title) {
    throw new Error(`Seed bead not found: ${seedBead}`);
  }
  return issue;
}

function createBenchmarkBead(seedIssue, sample, runId) {
  const title = `[bench:${runId}] ${sample.taskId} :: ${sample.modelId}`;
  const description = `${seedIssue.description ?? ''}\n\n[benchmark-seed] ${sample.seedBead}\n[benchmark-task] ${sample.taskId}\n[benchmark-model] ${sample.modelId}`;
  const createResult = runJson(
    'bd',
    [
      'create',
      '--title',
      title,
      '--description',
      description,
      '--type',
      seedIssue.issue_type ?? 'task',
      '--priority',
      String(seedIssue.priority ?? 2),
      '--deps',
      `discovered-from:${sample.seedBead}`,
      '--json',
    ],
    `bd create for ${sample.sampleId}`,
  );

  if (!createResult?.id) {
    throw new Error(`Failed to create benchmark bead for ${sample.sampleId}`);
  }

  runJson('bd', ['update', createResult.id, '--claim', '--json'], `bd claim ${createResult.id}`);
  return createResult.id;
}

function waitForNonRunning(jobId, maxWaitMs = 20 * 60 * 1000) {
  const RUNNING = new Set(['starting', 'running']);
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const r = runCommand('specialists', ['status', '--job', jobId, '--json']);
    if (r.code === 0) {
      try {
        const data = JSON.parse(r.stdout);
        const status = data.job?.status ?? data.status;
        if (status && !RUNNING.has(status)) return status;
      } catch { /* ignore parse error, keep polling */ }
    }
    spawnSync('sleep', ['3']);
  }
  throw new Error(`Job ${jobId} still running after ${maxWaitMs / 60000}min`);
}

function runSpecialist(name, args) {
  const runResult = runCommand('specialists', ['run', name, '--background', ...args]);
  const jobId = parseJobId(runResult.stdout);

  // Poll until non-running; if waiting (keep-alive), stop it so result.txt is accessible
  const finalStatus = waitForNonRunning(jobId);
  if (finalStatus === 'waiting') {
    runCommand('specialists', ['stop', jobId]);
    spawnSync('sleep', ['2']);
  }

  const result = runJson('specialists', ['result', jobId, '--json'], `specialists result ${jobId}`);
  return { jobId, runResult, result };
}

function appendJsonl(path, row) {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(row)}\n`, 'utf8');
}

function summarizeRows(rows) {
  const byStatus = { success: 0, failed: 0 };
  for (const row of rows) {
    if (row.status === 'success') byStatus.success += 1;
    else byStatus.failed += 1;
  }
  return byStatus;
}

function buildSummaryMarkdown(rows, summary) {
  const lines = [];
  lines.push('# Executor benchmark summary');
  lines.push('');
  lines.push(`- success: ${summary.success}`);
  lines.push(`- failed: ${summary.failed}`);
  lines.push('');
  lines.push('| sample_id | model_id | task_id | run_number | executor_job | reviewer_job | status | lint | tsc | verdict |');
  lines.push('|---|---|---|---:|---|---|---|---|---|---|');
  for (const row of rows) {
    lines.push(`| ${row.sample_id} | ${row.model_id} | ${row.task_id} | ${row.run_number} | ${row.executor_job_id ?? ''} | ${row.reviewer_job_id ?? ''} | ${row.status} | ${row.lint_pass} | ${row.tsc_pass} | ${row.reviewer_verdict} |`);
  }
  lines.push('');
  lines.push('Lint/TSC source: reviewer output regex parse (`lint_pass|lint`, `tsc_pass|tsc --noEmit`).');
  lines.push('Full test suite intentionally excluded (executor guardrail; supervisor.test.ts known hang confounder).');
  return `${lines.join('\n')}\n`;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const config = readConfig(options.configPath);
  const runDir = resolve(options.outputRoot, options.runId);
  const manifestPath = resolve(runDir, 'manifest.json');
  const attemptsPath = resolve(runDir, 'attempts.jsonl');
  const summaryJsonPath = resolve(runDir, 'summary.json');
  const summaryMdPath = resolve(runDir, 'summary.md');

  mkdirSync(runDir, { recursive: true });

  let samples;
  if (existsSync(manifestPath)) {
    samples = JSON.parse(readFileSync(manifestPath, 'utf8')).samples;
  } else {
    samples = createSamplePlan(config);
    writeFileSync(manifestPath, JSON.stringify({ runId: options.runId, configPath: options.configPath, samples }, null, 2));
  }

  const previousRows = existsSync(attemptsPath)
    ? readFileSync(attemptsPath, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line))
    : [];

  const latestBySample = new Map();
  for (const row of previousRows) {
    latestBySample.set(row.sample_id, row);
  }

  const queue = options.rerunFailed
    ? samples.filter((sample) => (latestBySample.get(sample.sampleId)?.status ?? 'failed') !== 'success')
    : samples;

  const runRows = [];

  for (const sample of queue) {
    const attemptsForSample = previousRows.filter((row) => row.sample_id === sample.sampleId);
    const runNumber = attemptsForSample.length + 1;
    const startedAt = new Date().toISOString();
    const seedIssue = readIssue(sample.seedBead);
    const benchmarkBead = createBenchmarkBead(seedIssue, sample, options.runId);

    const row = {
      run_id: options.runId,
      sample_id: sample.sampleId,
      task_id: sample.taskId,
      seed_bead: sample.seedBead,
      benchmark_bead: benchmarkBead,
      model_id: sample.modelId,
      replicate: sample.replicate,
      run_number: runNumber,
      started_at: startedAt,
      completed_at: null,
      executor_job_id: null,
      reviewer_job_id: null,
      status: 'failed',
      failure_type: 'other',
      lint_pass: null,
      tsc_pass: null,
      reviewer_verdict: 'MISSING',
      reviewer_score: null,
      total_tokens: null,
      cost_usd: null,
      elapsed_ms: null,
      notes: [],
    };

    try {
      const executor = runSpecialist('executor', ['--bead', benchmarkBead, '--worktree', '--model', sample.modelId, '--no-bead-notes']);
      row.executor_job_id = executor.jobId;
      row.elapsed_ms = Math.round((executor.result.job?.elapsed_s ?? 0) * 1000);
      row.total_tokens = executor.result.job?.metrics?.token_usage?.total_tokens ?? null;
      row.cost_usd = executor.result.job?.metrics?.token_usage?.cost_usd ?? null;

      const worktreePath = executor.result.startup_context?.worktree_path;
      if (!worktreePath) {
        row.failure_type = 'missing_worktree';
        row.notes.push('executor_missing_startup_context_worktree_path');
        appendJsonl(attemptsPath, row);
        runRows.push(row);
        continue;
      }

      const diffCheck = verifyWorktreeDiff(worktreePath, options.baseRef);
      if (!diffCheck.ok) {
        row.failure_type = 'stale_or_empty_diff';
        row.notes.push(`reviewer_blocked:${diffCheck.reason}`);
        appendJsonl(attemptsPath, row);
        runRows.push(row);
        continue;
      }

      const reviewer = runSpecialist('reviewer', ['--bead', benchmarkBead, '--job', executor.jobId, '--model', config.reviewerModel, '--no-bead-notes']);
      row.reviewer_job_id = reviewer.jobId;
      row.lint_pass = parseGate(reviewer.result.output, 'lint');
      row.tsc_pass = parseGate(reviewer.result.output, 'tsc');
      row.reviewer_verdict = parseVerdict(reviewer.result.output);
      const reviewerJson = readMachineJson(reviewer.result.output);
      row.reviewer_score = reviewerJson?.reviewer_score ?? reviewerJson?.reviewer_score_if_present ?? null;

      if (row.reviewer_verdict === 'PASS' && row.lint_pass === true && row.tsc_pass === true) {
        row.status = 'success';
        row.failure_type = 'none';
      } else {
        row.status = 'failed';
        row.failure_type = 'review_non_pass';
      }
    } catch (error) {
      row.notes.push(String(error));
      if (String(error).includes('Could not parse job id')) {
        row.failure_type = 'tool_error';
      }
    }

    row.completed_at = new Date().toISOString();
    appendJsonl(attemptsPath, row);
    runRows.push(row);
  }

  const allRows = [...previousRows, ...runRows];
  const summary = summarizeRows(allRows.map((row) => {
    const latest = latestBySample.get(row.sample_id);
    return latest && latest.run_number > row.run_number ? latest : row;
  }));

  writeFileSync(summaryJsonPath, `${JSON.stringify({ runId: options.runId, queue_size: queue.length, summary, generated_at: new Date().toISOString() }, null, 2)}\n`);
  writeFileSync(summaryMdPath, buildSummaryMarkdown(runRows, summarizeRows(runRows)));

  console.log(JSON.stringify({
    run_id: options.runId,
    run_dir: runDir,
    queued_samples: queue.length,
    wrote_attempts: runRows.length,
    attempts_path: attemptsPath,
    summary_json: summaryJsonPath,
    summary_md: summaryMdPath,
  }, null, 2));
}

main();
