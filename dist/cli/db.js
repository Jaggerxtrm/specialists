import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { ensureGitignoreHasObservabilityDbEntries, ensureObservabilityDbFile, isPathInsideJobsDirectory, resolveObservabilityDbLocation, } from '../specialist/observability-db.js';
import { resolveJobsDir } from '../specialist/job-root.js';
import { createObservabilitySqliteClient } from '../specialist/observability-sqlite.js';
import { derivePersistedChainIdentity } from '../specialist/chain-identity.js';
import { parseTimelineEvent } from '../specialist/timeline-events.js';
const DAY_MS = 24 * 60 * 60 * 1000;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
function formatBytes(bytes) {
    if (bytes < 1024)
        return `${bytes} B`;
    const units = ['KB', 'MB', 'GB', 'TB'];
    let value = bytes;
    let unitIndex = -1;
    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex += 1;
    }
    return `${value.toFixed(2)} ${units[unitIndex]}`;
}
function parseIsoDate(input) {
    const parsed = Date.parse(input);
    return Number.isFinite(parsed) ? parsed : null;
}
function parseDuration(input) {
    const match = input.trim().toLowerCase().match(/^(\d+)([smhdw])$/);
    if (!match)
        return null;
    const amount = Number(match[1]);
    const unit = match[2];
    if (!Number.isFinite(amount) || amount <= 0)
        return null;
    const multipliers = {
        s: 1000,
        m: 60 * 1000,
        h: 60 * 60 * 1000,
        d: DAY_MS,
        w: 7 * DAY_MS,
    };
    return amount * multipliers[unit];
}
function parseBeforeArgument(raw) {
    const durationMs = parseDuration(raw);
    if (durationMs !== null)
        return Date.now() - durationMs;
    const isoMs = parseIsoDate(raw);
    if (isoMs !== null)
        return isoMs;
    throw new Error(`Invalid --before value '${raw}'. Use ISO date or duration like 7d.`);
}
function printDbHelp() {
    console.log([
        '',
        'Usage: specialists db <setup|backfill|vacuum|prune>',
        '',
        'Human-only commands for shared observability SQLite database.',
        '',
        'Commands:',
        '  setup                              Provision database file + schema + .gitignore entries',
        '  init                               Alias for setup',
        '  backfill [--events]                Import historical .specialists/jobs/*/status.json rows',
        '  vacuum                             Run SQLite VACUUM (refuses when running/starting jobs exist)',
        '  prune --before <iso|duration>      Prune old rows (default dry-run)',
        '        [--dry-run] [--apply] [--include-epics]',
        '',
        'Behavior:',
        '  - prune keeps specialist_events last 30 days always',
        '  - prune removes specialist_results and terminal specialist_jobs older than --before',
        '  - prune never touches active-chain jobs',
        '  - prune never touches epic_runs unless --include-epics',
        '',
        'Examples:',
        '  specialists db setup',
        '  specialists db backfill --events',
        '  specialists db vacuum',
        '  specialists db prune --before 30d --dry-run',
        '  specialists db prune --before 2026-01-01T00:00:00Z --apply --include-epics',
        '',
    ].join('\n'));
}
function assertHumanInteractiveTerminal(commandName) {
    const forceSetup = process.env.SPECIALISTS_DB_SETUP_FORCE === '1';
    const inAgentSession = !forceSetup && (!process.stdin.isTTY ||
        !!process.env.SPECIALISTS_TMUX_SESSION ||
        !!process.env.SPECIALISTS_JOB_ID ||
        !!process.env.PI_SESSION_ID ||
        !!process.env.PI_RPC_SOCKET);
    if (!inAgentSession)
        return;
    console.error(`specialists db ${commandName} requires interactive terminal. user-only setup command.`);
    process.exit(1);
}
function printSetupResult(created, gitignoreUpdated, location) {
    console.log(`\n${bold('specialists db setup')}\n`);
    console.log(`  ${green('✓')} database path: ${location.dbPath}`);
    console.log(`  ${green('✓')} mode: chmod 644`);
    if (location.source === 'xdg-data-home') {
        console.log(`  ${yellow('○')} using XDG_DATA_HOME (${location.dbDirectory})`);
    }
    else {
        console.log(`  ${green('✓')} using shared git-root location (${location.dbDirectory})`);
    }
    console.log(`  ${created ? green('✓ created database file') : yellow('○ database file already exists')}`);
    console.log(`  ${gitignoreUpdated ? green('✓ updated .gitignore for DB artifacts') : yellow('○ .gitignore already excludes DB artifacts')}`);
    console.log('');
}
function parseBackfillOptions(argv) {
    let importEvents = false;
    for (const argument of argv) {
        if (argument === '--events') {
            importEvents = true;
            continue;
        }
        throw new Error(`Unknown option for db backfill: '${argument}'`);
    }
    return { importEvents };
}
function parsePruneOptions(argv) {
    let beforeValue = null;
    let apply = false;
    let dryRun = true;
    let includeEpics = false;
    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];
        if (argument === '--before') {
            const value = argv[index + 1];
            if (!value)
                throw new Error('Missing value for --before');
            beforeValue = value;
            index += 1;
            continue;
        }
        if (argument === '--apply') {
            apply = true;
            dryRun = false;
            continue;
        }
        if (argument === '--dry-run') {
            dryRun = true;
            apply = false;
            continue;
        }
        if (argument === '--include-epics') {
            includeEpics = true;
            continue;
        }
        throw new Error(`Unknown option for db prune: '${argument}'`);
    }
    if (!beforeValue)
        throw new Error('Missing required --before for db prune');
    return {
        beforeMs: parseBeforeArgument(beforeValue),
        apply: apply && !dryRun,
        includeEpics,
    };
}
function parseStatusFile(jobDirectoryPath, fallbackJobId) {
    const statusPath = join(jobDirectoryPath, 'status.json');
    const statusRaw = readFileSync(statusPath, 'utf-8');
    const parsed = JSON.parse(statusRaw);
    const jobId = typeof parsed.id === 'string' && parsed.id.length > 0 ? parsed.id : fallbackJobId;
    const specialist = typeof parsed.specialist === 'string' && parsed.specialist.length > 0
        ? parsed.specialist
        : 'unknown';
    const status = typeof parsed.status === 'string' && parsed.status.length > 0
        ? parsed.status
        : 'starting';
    const startedAtMs = typeof parsed.started_at_ms === 'number' ? parsed.started_at_ms : Date.now();
    return {
        ...parsed,
        id: jobId,
        specialist,
        status,
        started_at_ms: startedAtMs,
    };
}
function replayEvents(eventsPath, sqliteClient, status) {
    if (!existsSync(eventsPath))
        return 0;
    const rawContent = readFileSync(eventsPath, 'utf-8');
    const lines = rawContent.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    let importedEvents = 0;
    for (const line of lines) {
        const event = parseTimelineEvent(line);
        if (!event)
            continue;
        sqliteClient.appendEvent(status.id, status.specialist, status.bead_id, event);
        importedEvents += 1;
    }
    return importedEvents;
}
function runBackfill(options) {
    const sqliteClient = createObservabilitySqliteClient();
    if (!sqliteClient) {
        throw new Error('Failed to initialize observability SQLite schema. Run `specialists db setup` first and ensure sqlite3 is installed.');
    }
    const summary = {
        jobsBackfilled: 0,
        jobsSkipped: 0,
        jobsFailed: 0,
        eventsImported: 0,
    };
    try {
        const jobsDirectoryPath = resolveJobsDir(process.cwd());
        if (!existsSync(jobsDirectoryPath)) {
            console.log('No jobs directory found. Nothing to backfill.');
            return;
        }
        const jobEntries = readdirSync(jobsDirectoryPath, { withFileTypes: true });
        for (const jobEntry of jobEntries) {
            if (!jobEntry.isDirectory())
                continue;
            const jobDirectoryPath = join(jobsDirectoryPath, jobEntry.name);
            const statusPath = join(jobDirectoryPath, 'status.json');
            if (!existsSync(statusPath))
                continue;
            try {
                const status = parseStatusFile(jobDirectoryPath, jobEntry.name);
                const existingStatus = sqliteClient.readStatus(status.id);
                if (existingStatus) {
                    summary.jobsSkipped += 1;
                    continue;
                }
                const chainIdentity = derivePersistedChainIdentity(status);
                const normalizedStatus = {
                    ...status,
                    chain_kind: chainIdentity.chain_kind,
                    chain_id: chainIdentity.chain_id,
                    chain_root_job_id: chainIdentity.chain_root_job_id,
                    chain_root_bead_id: chainIdentity.chain_root_bead_id,
                };
                sqliteClient.upsertStatus(normalizedStatus);
                if (normalizedStatus.epic_id && normalizedStatus.chain_id) {
                    sqliteClient.upsertEpicRun({
                        epic_id: normalizedStatus.epic_id,
                        status: 'open',
                        updated_at_ms: Date.now(),
                        status_json: JSON.stringify({
                            epic_id: normalizedStatus.epic_id,
                            status: 'open',
                            source: 'db-backfill',
                            chain_id: normalizedStatus.chain_id,
                        }),
                    });
                    sqliteClient.upsertEpicChainMembership({
                        epic_id: normalizedStatus.epic_id,
                        chain_id: normalizedStatus.chain_id,
                        chain_root_bead_id: normalizedStatus.chain_root_bead_id,
                        chain_root_job_id: normalizedStatus.chain_root_job_id,
                        updated_at_ms: Date.now(),
                    });
                }
                summary.jobsBackfilled += 1;
                if (options.importEvents) {
                    const eventsPath = join(jobDirectoryPath, 'events.jsonl');
                    summary.eventsImported += replayEvents(eventsPath, sqliteClient, status);
                }
            }
            catch {
                summary.jobsFailed += 1;
            }
        }
    }
    finally {
        sqliteClient.close();
    }
    console.log(`\n${bold('specialists db backfill')}\n`);
    console.log(`  ${green('✓')} jobs backfilled: ${summary.jobsBackfilled}`);
    console.log(`  ${yellow('○')} jobs skipped (already in DB): ${summary.jobsSkipped}`);
    console.log(`  ${summary.jobsFailed > 0 ? yellow('○') : green('✓')} jobs failed: ${summary.jobsFailed}`);
    if (options.importEvents) {
        console.log(`  ${green('✓')} events imported: ${summary.eventsImported}`);
    }
    console.log('');
}
function runVacuum() {
    const sqliteClient = createObservabilitySqliteClient();
    if (!sqliteClient) {
        throw new Error('Failed to initialize observability SQLite schema. Run `specialists db setup` first and ensure sqlite3 is installed.');
    }
    try {
        const activeJobs = sqliteClient.listActiveJobs(['running', 'starting']);
        if (activeJobs.length > 0) {
            const listing = activeJobs.slice(0, 5).map(job => `${job.job_id}:${job.status}`).join(', ');
            throw new Error(`Refusing vacuum while active jobs exist (${activeJobs.length}): ${listing}`);
        }
        const { beforeBytes, afterBytes } = sqliteClient.vacuumDatabase();
        const savedBytes = Math.max(0, beforeBytes - afterBytes);
        console.log(`\n${bold('specialists db vacuum')}\n`);
        console.log(`  ${green('✓')} before: ${formatBytes(beforeBytes)} (${beforeBytes} bytes)`);
        console.log(`  ${green('✓')} after:  ${formatBytes(afterBytes)} (${afterBytes} bytes)`);
        console.log(`  ${green('✓')} saved:  ${formatBytes(savedBytes)} (${savedBytes} bytes)`);
        console.log('');
    }
    finally {
        sqliteClient.close();
    }
}
function runPrune(options) {
    const sqliteClient = createObservabilitySqliteClient();
    if (!sqliteClient) {
        throw new Error('Failed to initialize observability SQLite schema. Run `specialists db setup` first and ensure sqlite3 is installed.');
    }
    try {
        const report = sqliteClient.pruneObservabilityData({
            beforeMs: options.beforeMs,
            includeEpics: options.includeEpics,
            apply: options.apply,
        });
        console.log(`\n${bold('specialists db prune')}\n`);
        console.log(`  ${report.dryRun ? yellow('○ dry-run') : green('✓ applied')}`);
        console.log(`  ${green('✓')} before: ${new Date(report.beforeMs).toISOString()}`);
        console.log(`  ${green('✓')} events cutoff (fixed 30d): ${new Date(report.eventsCutoffMs).toISOString()}`);
        console.log(`  ${green('✓')} specialist_events: ${report.deletedEvents}`);
        console.log(`  ${green('✓')} specialist_results: ${report.deletedResults}`);
        console.log(`  ${green('✓')} specialist_jobs: ${report.deletedJobs}`);
        console.log(`  ${report.includeEpics ? green('✓') : yellow('○')} epic_runs: ${report.deletedEpicRuns} ${report.includeEpics ? '' : '(skipped, use --include-epics)'}`);
        console.log(`  ${yellow('○')} skipped active-chain jobs: ${report.skippedActiveChainJobs}`);
        console.log('');
    }
    finally {
        sqliteClient.close();
    }
}
function parseBenchmarkExportOptions(argv) {
    const defaultOutput = resolve(process.cwd(), '.specialists/benchmarks/executor-benchmark-rows.jsonl');
    let outputPath = defaultOutput;
    let epicId;
    let includePrepJobs = false;
    for (let i = 0; i < argv.length; i += 1) {
        const argument = argv[i];
        if (argument === '--output' && argv[i + 1]) {
            outputPath = resolve(process.cwd(), argv[i + 1]);
            i += 1;
            continue;
        }
        if (argument === '--epic' && argv[i + 1]) {
            epicId = argv[i + 1];
            i += 1;
            continue;
        }
        if (argument === '--include-prep') {
            includePrepJobs = true;
            continue;
        }
        throw new Error(`Unknown option for db benchmark-export: '${argument}'`);
    }
    return { outputPath, epicId, includePrepJobs };
}
function parseReviewerVerdict(output) {
    if (!output)
        return 'MISSING';
    const match = output.match(/Verdict:\s*(PASS|PARTIAL|FAIL)/i);
    if (!match?.[1])
        return 'MISSING';
    return match[1].toUpperCase();
}
function parseReviewerScore(output) {
    if (!output)
        return null;
    const match = output.match(/(?:Reviewer\s+)?Score(?:\s*\(0-100\))?\s*[:=]\s*(\d+(?:\.\d+)?)/i);
    return match?.[1] ? Number(match[1]) : null;
}
function parseGateResult(output, key) {
    if (!output)
        return null;
    const regex = key === 'lint'
        ? /(?:lint_pass|lint)\s*[:=]\s*(true|false|pass|fail)/i
        : /(?:tsc_pass|tsc(?:\s*--noEmit)?)\s*[:=]\s*(true|false|pass|fail)/i;
    const match = output.match(regex);
    if (!match?.[1])
        return null;
    const normalized = match[1].toLowerCase();
    return normalized === 'true' || normalized === 'pass';
}
function readLatestRunCompleteEvent(events) {
    for (let index = events.length - 1; index >= 0; index -= 1) {
        const event = events[index];
        if (event?.type === 'run_complete') {
            return event;
        }
    }
    return null;
}
function inferFailureNotes(input) {
    const notes = [];
    if (input.runComplete?.status === 'ERROR') {
        notes.push(`run_complete_status=ERROR${input.runComplete.error ? `: ${input.runComplete.error}` : ''}`);
    }
    if (input.runComplete?.status === 'CANCELLED') {
        notes.push('run_complete_status=CANCELLED');
    }
    if (input.runComplete?.exit_reason) {
        notes.push(`exit_reason=${input.runComplete.exit_reason}`);
    }
    if (input.runComplete?.finish_reason) {
        notes.push(`finish_reason=${input.runComplete.finish_reason}`);
    }
    if (input.status.error) {
        notes.push(`status_error=${input.status.error}`);
    }
    if (input.reviewerVerdict !== 'PASS' && input.hasLaterExecutorInChain) {
        notes.push('fix_loop_rerun_detected_after_non_pass_review');
    }
    if (!input.runComplete) {
        notes.push('missing_run_complete_event_fallback_to_status_metrics');
    }
    return notes;
}
function runBenchmarkExport(options) {
    const sqliteClient = createObservabilitySqliteClient();
    if (!sqliteClient) {
        throw new Error('Failed to initialize observability SQLite schema. Run `specialists db setup` first and ensure sqlite3 is installed.');
    }
    try {
        const statuses = sqliteClient
            .listStatuses()
            .filter((status) => options.includePrepJobs || status.chain_kind === 'chain')
            .filter((status) => !options.epicId || status.epic_id === options.epicId);
        const byChain = new Map();
        for (const status of statuses) {
            const chainId = status.chain_id ?? `job:${status.id}`;
            const group = byChain.get(chainId) ?? [];
            group.push(status);
            byChain.set(chainId, group);
        }
        const rows = [];
        for (const chainStatuses of byChain.values()) {
            const ordered = [...chainStatuses].sort((a, b) => a.started_at_ms - b.started_at_ms);
            const executorStatuses = ordered.filter((status) => status.specialist === 'executor');
            const reviewerStatuses = ordered.filter((status) => status.specialist === 'reviewer');
            executorStatuses.forEach((executorStatus, executorIndex) => {
                const nextExecutor = executorStatuses[executorIndex + 1];
                const reviewer = reviewerStatuses.find((candidate) => {
                    if (candidate.started_at_ms < executorStatus.started_at_ms)
                        return false;
                    if (!nextExecutor)
                        return true;
                    return candidate.started_at_ms < nextExecutor.started_at_ms;
                }) ?? null;
                const runComplete = readLatestRunCompleteEvent(sqliteClient.readEvents(executorStatus.id));
                const reviewerOutput = reviewer ? sqliteClient.readResult(reviewer.id) : null;
                const reviewerVerdict = parseReviewerVerdict(reviewerOutput);
                const totalTokens = runComplete?.token_usage?.total_tokens
                    ?? runComplete?.metrics?.token_usage?.total_tokens
                    ?? executorStatus.metrics?.token_usage?.total_tokens
                    ?? null;
                const costUsd = runComplete?.token_usage?.cost_usd
                    ?? runComplete?.metrics?.token_usage?.cost_usd
                    ?? executorStatus.metrics?.token_usage?.cost_usd
                    ?? null;
                const elapsedMs = runComplete
                    ? Math.round(runComplete.elapsed_s * 1000)
                    : (typeof executorStatus.elapsed_s === 'number' ? Math.round(executorStatus.elapsed_s * 1000) : null);
                const hasLaterExecutorInChain = Boolean(nextExecutor);
                const failureNotes = inferFailureNotes({
                    status: executorStatus,
                    runComplete,
                    reviewerVerdict,
                    hasLaterExecutorInChain,
                });
                rows.push({
                    task_id: executorStatus.chain_root_bead_id ?? executorStatus.bead_id ?? 'unknown_task',
                    model_id: executorStatus.model ?? null,
                    executor_job_id: executorStatus.id,
                    reviewer_job_id: reviewer?.id ?? null,
                    lint_pass: parseGateResult(reviewerOutput, 'lint'),
                    tsc_pass: parseGateResult(reviewerOutput, 'tsc'),
                    reviewer_verdict: reviewerVerdict,
                    reviewer_score_if_present: parseReviewerScore(reviewerOutput),
                    total_tokens: totalTokens,
                    cost_usd: costUsd,
                    elapsed_ms: elapsedMs,
                    failure_notes: failureNotes,
                    source_of_truth: {
                        task_id: 'specialist_jobs.chain_root_bead_id fallback bead_id',
                        model_id: 'specialist_jobs.status_json.model',
                        executor_job_id: 'specialist_jobs.job_id',
                        reviewer_job_id: 'specialist_jobs.job_id where specialist=reviewer in same chain window',
                        lint_pass: 'reviewer specialist_results.output regex parse; null when absent',
                        tsc_pass: 'reviewer specialist_results.output regex parse; null when absent',
                        reviewer_verdict: 'reviewer specialist_results.output Verdict: PASS|PARTIAL|FAIL',
                        reviewer_score_if_present: 'reviewer specialist_results.output score regex; null when absent',
                        total_tokens: runComplete ? 'specialist_events.type=run_complete.token_usage.total_tokens' : 'status_json.metrics.token_usage.total_tokens fallback',
                        cost_usd: runComplete ? 'specialist_events.type=run_complete.token_usage.cost_usd' : 'status_json.metrics.token_usage.cost_usd fallback',
                        elapsed_ms: runComplete ? 'specialist_events.type=run_complete.elapsed_s * 1000' : 'status_json.elapsed_s * 1000 fallback',
                        failure_notes: 'run_complete.error/status + status_json.error + chain sequencing heuristics',
                    },
                });
            });
        }
        rows.sort((a, b) => a.task_id.localeCompare(b.task_id) || a.executor_job_id.localeCompare(b.executor_job_id));
        const outputDirectory = dirname(options.outputPath);
        mkdirSync(outputDirectory, { recursive: true });
        const jsonl = rows.map((row) => JSON.stringify(row)).join('\n');
        writeFileSync(options.outputPath, rows.length > 0 ? `${jsonl}\n` : '', 'utf-8');
        console.log(`\n${bold('specialists db benchmark-export')}\n`);
        console.log(`  ${green('✓')} rows exported: ${rows.length}`);
        console.log(`  ${green('✓')} output: ${options.outputPath}`);
        if (options.epicId) {
            console.log(`  ${green('✓')} epic filter: ${options.epicId}`);
        }
        console.log('');
    }
    finally {
        sqliteClient.close();
    }
}
function runSetup() {
    const location = resolveObservabilityDbLocation(process.cwd());
    if (isPathInsideJobsDirectory(location.dbPath, location.gitRoot)) {
        throw new Error(`Refusing to place observability DB inside jobs directory: ${location.dbPath}`);
    }
    const setupResult = ensureObservabilityDbFile(location);
    const sqliteClient = createObservabilitySqliteClient();
    if (!sqliteClient) {
        throw new Error('Failed to initialize observability SQLite schema. Ensure sqlite3 is installed and retry.');
    }
    sqliteClient.close();
    const gitignoreResult = ensureGitignoreHasObservabilityDbEntries(location.gitRoot);
    printSetupResult(setupResult.created, gitignoreResult.changed, location);
}
export async function run(argv = process.argv.slice(3)) {
    const subcommand = argv[0];
    if (!subcommand || subcommand === '--help' || subcommand === '-h') {
        printDbHelp();
        return;
    }
    if (subcommand === 'setup' || subcommand === 'init') {
        assertHumanInteractiveTerminal('setup');
        runSetup();
        return;
    }
    if (subcommand === 'backfill') {
        assertHumanInteractiveTerminal('backfill');
        const options = parseBackfillOptions(argv.slice(1));
        runBackfill(options);
        return;
    }
    if (subcommand === 'vacuum') {
        runVacuum();
        return;
    }
    if (subcommand === 'prune') {
        const options = parsePruneOptions(argv.slice(1));
        runPrune(options);
        return;
    }
    if (subcommand === 'benchmark-export') {
        const options = parseBenchmarkExportOptions(argv.slice(1));
        runBenchmarkExport(options);
        return;
    }
    console.error(`Unknown db subcommand: '${subcommand}'`);
    printDbHelp();
    process.exit(1);
}
//# sourceMappingURL=db.js.map