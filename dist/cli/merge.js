import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { resolveJobsDir } from '../specialist/job-root.js';
import { createObservabilitySqliteClient } from '../specialist/observability-sqlite.js';
import { isEpicUnresolvedState } from '../specialist/epic-lifecycle.js';
const TERMINAL_STATUSES = new Set(['done', 'error', 'cancelled']);
function parseOptions(argv) {
    let target = '';
    let rebuild = false;
    for (const argument of argv) {
        if (argument === '--rebuild') {
            rebuild = true;
            continue;
        }
        if (argument.startsWith('-')) {
            throw new Error(`Unknown option: ${argument}`);
        }
        if (target) {
            throw new Error('Only one merge target is supported');
        }
        target = argument;
    }
    if (!target) {
        throw new Error('Missing merge target');
    }
    return { target, rebuild };
}
function runCommand(command, args, cwd = process.cwd()) {
    return spawnSync(command, args, {
        cwd,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
    });
}
function resolveDefaultBranchName(cwd = process.cwd()) {
    const symbolicRef = runCommand('git', ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'], cwd);
    if (symbolicRef.status === 0) {
        const remoteHeadRef = symbolicRef.stdout.trim();
        if (remoteHeadRef.startsWith('origin/')) {
            const branchName = remoteHeadRef.slice('origin/'.length).trim();
            if (branchName)
                return branchName;
        }
    }
    const localHead = runCommand('git', ['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
    if (localHead.status === 0) {
        const branchName = localHead.stdout.trim();
        if (branchName && branchName !== 'HEAD') {
            return branchName;
        }
    }
    throw new Error('Unable to resolve repository default branch (origin/HEAD).');
}
function resolveMainWorktreeRoot(cwd = process.cwd()) {
    const worktreeList = runCommand('git', ['worktree', 'list', '--porcelain'], cwd);
    if (worktreeList.status === 0) {
        const firstWorktreeLine = worktreeList.stdout
            .split('\n')
            .map(line => line.trim())
            .find(line => line.startsWith('worktree '));
        if (firstWorktreeLine) {
            const worktreePath = firstWorktreeLine.slice('worktree '.length).trim();
            if (worktreePath)
                return worktreePath;
        }
    }
    const topLevel = runCommand('git', ['rev-parse', '--show-toplevel'], cwd);
    if (topLevel.status !== 0) {
        throw new Error('Unable to resolve main worktree root.');
    }
    const rootPath = topLevel.stdout.trim();
    if (!rootPath) {
        throw new Error('Unable to resolve main worktree root.');
    }
    return rootPath;
}
function readJson(text) {
    try {
        return JSON.parse(text);
    }
    catch {
        return null;
    }
}
function readBead(id) {
    const result = runCommand('bd', ['show', id, '--json']);
    if (result.status !== 0 || !result.stdout.trim()) {
        throw new Error(`Unable to read bead '${id}'`);
    }
    const parsed = readJson(result.stdout);
    const bead = Array.isArray(parsed) ? parsed[0] : parsed;
    if (!bead || typeof bead !== 'object') {
        throw new Error(`Unexpected bd show payload for '${id}'`);
    }
    const maybe = bead;
    if (!maybe.id || !maybe.title) {
        throw new Error(`Invalid bead record for '${id}'`);
    }
    return maybe;
}
export function parseChildBeadIds(childrenOutput) {
    const ids = childrenOutput
        .split('\n')
        .map(line => line.match(/(unitAI-[a-z0-9]+)/i)?.[1] ?? '')
        .filter(Boolean);
    return [...new Set(ids)];
}
function readEpicChildIds(epicId) {
    // Try --json mode first (newer bd versions)
    let result = runCommand('bd', ['children', epicId, '--json']);
    if (result.status === 0) {
        const parsed = readJson(result.stdout);
        if (Array.isArray(parsed)) {
            const ids = parsed.map(row => row.id).filter((id) => Boolean(id));
            return [...new Set(ids)];
        }
        // Command succeeded but JSON parse failed — fall through to text parse
        const idsFromText = parseChildBeadIds(result.stdout);
        if (idsFromText.length === 0) {
            throw new Error(`No children found for epic '${epicId}'`);
        }
        return idsFromText;
    }
    // Fallback: retry without --json (older bd versions or --json unsupported)
    result = runCommand('bd', ['children', epicId]);
    if (result.status !== 0) {
        throw new Error(`Unable to load children for epic '${epicId}'`);
    }
    const idsFromText = parseChildBeadIds(result.stdout);
    if (idsFromText.length === 0) {
        throw new Error(`No children found for epic '${epicId}'`);
    }
    return idsFromText;
}
export function resolveChainEpicMembership(chainRootBeadId) {
    const sqliteClient = createObservabilitySqliteClient();
    if (sqliteClient) {
        try {
            const membership = sqliteClient.resolveEpicByChainRootBeadId(chainRootBeadId);
            if (membership?.epic_id) {
                return { epicId: membership.epic_id, source: 'sqlite' };
            }
        }
        finally {
            sqliteClient.close();
        }
    }
    const bead = readBead(chainRootBeadId);
    if (bead.parent) {
        return { epicId: bead.parent, source: 'bead-parent' };
    }
    return { source: 'none' };
}
export function checkEpicUnresolvedGuard(chainRootBeadId) {
    const membership = resolveChainEpicMembership(chainRootBeadId);
    if (!membership.epicId) {
        return { blocked: false };
    }
    const sqliteClient = createObservabilitySqliteClient();
    if (!sqliteClient) {
        // SQLite unavailable during migration/fallback: allow merge but warn
        return {
            blocked: false,
            epicId: membership.epicId,
            message: `Warning: unable to verify epic ${membership.epicId} status (observability DB unavailable). Proceeding with chain merge.`,
        };
    }
    try {
        const epicRun = sqliteClient.readEpicRun(membership.epicId);
        if (!epicRun) {
            // Epic metadata missing during migration: allow merge but warn
            return {
                blocked: false,
                epicId: membership.epicId,
                message: `Warning: epic ${membership.epicId} has no run record. Proceeding with chain merge.`,
            };
        }
        const status = epicRun.status;
        if (!isEpicUnresolvedState(status)) {
            // Epic is terminal (merged, failed, abandoned): allow chain merge
            return { blocked: false, epicId: membership.epicId, epicStatus: status };
        }
        // Epic is unresolved: block chain merge
        return {
            blocked: true,
            epicId: membership.epicId,
            epicStatus: status,
            message: `Chain ${chainRootBeadId} belongs to unresolved epic ${membership.epicId} (status: ${status}).\nUse 'sp epic merge ${membership.epicId}' to publish all chains together, or 'sp epic status ${membership.epicId}' to inspect the epic state.`,
        };
    }
    finally {
        sqliteClient.close();
    }
}
export function readAllJobStatuses() {
    const jobsDir = resolveJobsDir();
    if (!existsSync(jobsDir))
        return [];
    const entries = readdirSync(jobsDir, { withFileTypes: true });
    const statuses = [];
    for (const entry of entries) {
        if (!entry.isDirectory())
            continue;
        const statusPath = join(jobsDir, entry.name, 'status.json');
        if (!existsSync(statusPath))
            continue;
        const parsed = readJson(readFileSync(statusPath, 'utf-8'));
        if (!parsed || typeof parsed !== 'object')
            continue;
        statuses.push(parsed);
    }
    return statuses;
}
export function selectNewestChainRootJob(beadId, statuses) {
    const candidates = statuses
        .filter(status => status.bead_id === beadId && status.branch && status.worktree_path)
        .sort((left, right) => (right.started_at_ms ?? 0) - (left.started_at_ms ?? 0));
    const selected = candidates[0];
    if (!selected || !selected.branch || !selected.status || !selected.id || !selected.worktree_path)
        return null;
    return {
        beadId,
        branch: selected.branch,
        worktreePath: selected.worktree_path,
        jobId: selected.id,
        jobStatus: selected.status,
        startedAtMs: selected.started_at_ms ?? 0,
    };
}
export function ensureTerminalJobs(chains) {
    const running = chains.filter(chain => !TERMINAL_STATUSES.has(chain.jobStatus));
    if (running.length === 0)
        return;
    const lines = running.map(chain => `- ${chain.beadId} (${chain.jobId}): ${chain.jobStatus}`);
    throw new Error(`Refusing merge: non-terminal chain jobs\n${lines.join('\n')}`);
}
export function topologicallySortChains(chains, dependenciesByBeadId) {
    const byId = new Map(chains.map(chain => [chain.beadId, chain]));
    const indegree = new Map();
    const adjacency = new Map();
    for (const chain of chains) {
        indegree.set(chain.beadId, 0);
        adjacency.set(chain.beadId, []);
    }
    for (const chain of chains) {
        const dependencies = dependenciesByBeadId.get(chain.beadId) ?? [];
        for (const dependencyId of dependencies) {
            if (!byId.has(dependencyId))
                continue;
            adjacency.get(dependencyId)?.push(chain.beadId);
            indegree.set(chain.beadId, (indegree.get(chain.beadId) ?? 0) + 1);
        }
    }
    const queue = [...chains]
        .filter(chain => (indegree.get(chain.beadId) ?? 0) === 0)
        .sort((left, right) => left.startedAtMs - right.startedAtMs)
        .map(chain => chain.beadId);
    const ordered = [];
    while (queue.length > 0) {
        const beadId = queue.shift();
        if (!beadId)
            continue;
        const chain = byId.get(beadId);
        if (chain) {
            ordered.push(chain);
        }
        const dependents = adjacency.get(beadId) ?? [];
        for (const dependentId of dependents) {
            const nextIndegree = (indegree.get(dependentId) ?? 0) - 1;
            indegree.set(dependentId, nextIndegree);
            if (nextIndegree === 0) {
                queue.push(dependentId);
            }
        }
    }
    if (ordered.length !== chains.length) {
        throw new Error('Unable to compute merge order: dependency cycle detected');
    }
    return ordered;
}
function loadDependenciesFor(beadIds) {
    const selected = new Set(beadIds);
    const dependenciesByBeadId = new Map();
    for (const beadId of beadIds) {
        const bead = readBead(beadId);
        const dependencyIds = (bead.dependencies ?? [])
            .map(dep => dep.id)
            .filter((id) => {
            if (!id)
                return false;
            return selected.has(id);
        });
        dependenciesByBeadId.set(beadId, dependencyIds);
    }
    return dependenciesByBeadId;
}
export function resolveMergeTargetsForBeadIds(beadIds) {
    const statuses = readAllJobStatuses();
    const chains = beadIds
        .map((beadId) => selectNewestChainRootJob(beadId, statuses))
        .filter((chain) => Boolean(chain));
    if (chains.length === 0) {
        throw new Error('No mergeable chain branches found for provided bead IDs');
    }
    ensureTerminalJobs(chains);
    const dependenciesByBeadId = loadDependenciesFor(chains.map((chain) => chain.beadId));
    return topologicallySortChains(chains, dependenciesByBeadId);
}
export function resolveMergeTargets(target) {
    const bead = readBead(target);
    if (bead.issue_type !== 'epic') {
        const statuses = readAllJobStatuses();
        const chain = selectNewestChainRootJob(target, statuses);
        if (!chain) {
            throw new Error(`No chain-root job with worktree metadata found for bead '${target}'`);
        }
        const guardResult = checkEpicUnresolvedGuard(chain.beadId);
        if (guardResult.message && !guardResult.blocked) {
            console.warn(guardResult.message);
        }
        if (guardResult.blocked) {
            throw new Error(guardResult.message);
        }
        ensureTerminalJobs([chain]);
        return [chain];
    }
    const childIds = readEpicChildIds(target);
    const chains = resolveMergeTargetsForBeadIds(childIds);
    if (chains.length === 0) {
        throw new Error(`No mergeable chain branches found under epic '${target}'`);
    }
    return chains;
}
function readChangedFilesForLastMerge(cwd = process.cwd()) {
    const diff = runCommand('git', ['diff', '--name-only', 'HEAD^1', 'HEAD'], cwd);
    if (diff.status !== 0)
        return [];
    return diff.stdout
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean);
}
const NOISE_PATH_PREFIXES = ['.xtrm/reports/', '.wolf/', '.specialists/jobs/'];
const MERGE_DIRTY_IGNORE_PREFIXES = [
    ...NOISE_PATH_PREFIXES,
    'dist/',
];
function isMergeDirtyIgnored(path) {
    return MERGE_DIRTY_IGNORE_PREFIXES.some(prefix => path.startsWith(prefix));
}
export function assertMainRepoCleanForMerge(cwd) {
    const status = runCommand('git', ['status', '--porcelain', '--untracked-files=no'], cwd);
    if (status.status !== 0) {
        throw new Error(`Unable to read git status in '${cwd}'.`);
    }
    const dirty = status.stdout
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
        .map(line => {
        const match = /^..\s(.+?)(?:\s->\s(.+))?$/.exec(line);
        const path = match ? (match[2] ?? match[1] ?? '') : line.slice(3).trim();
        return path.trim();
    })
        .filter(path => path && !isMergeDirtyIgnored(path));
    if (dirty.length === 0)
        return;
    const list = dirty.map(path => `- ${path}`).join('\n');
    throw new Error(`Refusing merge: main repo '${cwd}' has uncommitted changes that could cause spurious conflicts.\n` +
        `Dirty files (tracked, non-dist):\n${list}\n` +
        `Resolve by committing, stashing, or reverting these changes, then retry merge.`);
}
function parseNameStatusLine(line) {
    const trimmed = line.trim();
    if (!trimmed)
        return null;
    const parts = trimmed.split(/\t+/);
    if (parts.length < 2)
        return null;
    const status = parts[0] ?? '';
    if (!status)
        return null;
    const path = parts.length >= 3 ? parts[parts.length - 1] ?? '' : parts[1] ?? '';
    if (!path)
        return null;
    return { status, path };
}
function isNoisePath(path) {
    return NOISE_PATH_PREFIXES.some(prefix => path.startsWith(prefix));
}
export function previewBranchMergeDelta(branch, cwd = process.cwd()) {
    const baseBranch = resolveDefaultBranchName(cwd);
    const mergeBase = runCommand('git', ['merge-base', baseBranch, branch], cwd);
    if (mergeBase.status !== 0) {
        throw new Error(`Unable to compute merge base for '${baseBranch}' and '${branch}'.`);
    }
    const mergeBaseSha = mergeBase.stdout.trim();
    if (!mergeBaseSha) {
        throw new Error(`Unable to compute merge base for '${baseBranch}' and '${branch}'.`);
    }
    const stagedDelta = runCommand('git', ['diff', `${mergeBaseSha}..${branch}`, '--name-status'], cwd);
    if (stagedDelta.status !== 0) {
        throw new Error(`Unable to read merge delta for '${branch}'.`);
    }
    const files = stagedDelta.stdout
        .split('\n')
        .map(parseNameStatusLine)
        .filter((entry) => Boolean(entry));
    const noiseFiles = files.filter(file => isNoisePath(file.path));
    const substantiveFiles = files.filter(file => !isNoisePath(file.path));
    return {
        branch,
        files,
        noiseFiles,
        substantiveFiles,
    };
}
export function evaluateMergeWorthiness(preview) {
    if (preview.files.length === 0) {
        return { shouldMerge: false, reason: 'empty-delta' };
    }
    if (preview.substantiveFiles.length === 0) {
        return { shouldMerge: false, reason: 'noise-only-delta' };
    }
    return { shouldMerge: true, reason: 'ok' };
}
function throwWorthinessBlockError(target, preview, decision) {
    const summary = [
        `beadId=${target.beadId}`,
        `jobId=${target.jobId}`,
        `branch=${target.branch}`,
        `total=${preview.files.length}`,
        `substantive=${preview.substantiveFiles.length}`,
        `noise=${preview.noiseFiles.length}`,
    ].join(' ');
    const reason = decision.reason === 'empty-delta'
        ? 'empty merge delta'
        : 'noise-only merge delta';
    throw new Error(`Refusing merge for '${target.branch}': ${reason}.\n` +
        `Diagnostics: ${summary}`);
}
function assertBranchMergeWorthiness(target, cwd = process.cwd()) {
    const preview = previewBranchMergeDelta(target.branch, cwd);
    const decision = evaluateMergeWorthiness(preview);
    if (decision.shouldMerge)
        return;
    throwWorthinessBlockError(target, preview, decision);
}
function getConflictFiles(cwd = process.cwd()) {
    const result = runCommand('git', ['diff', '--name-only', '--diff-filter=U'], cwd);
    if (result.status !== 0)
        return [];
    return result.stdout
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean);
}
function getCurrentHeadBranch(cwd = process.cwd()) {
    const result = runCommand('git', ['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
    if (result.status !== 0) {
        throw new Error('Unable to resolve current git branch before rebase.');
    }
    const branch = result.stdout.trim();
    if (!branch || branch === 'HEAD') {
        throw new Error('Detached HEAD is not supported during merge-time rebase.');
    }
    return branch;
}
function tryAbortRebase(cwd = process.cwd()) {
    runCommand('git', ['rebase', '--abort'], cwd);
}
export function rebaseBranchOntoMaster(branch, worktreePath) {
    const baseBranch = resolveDefaultBranchName(worktreePath);
    const checkedOutBranch = getCurrentHeadBranch(worktreePath);
    if (checkedOutBranch !== branch) {
        throw new Error(`Expected branch '${branch}' in worktree '${worktreePath}', found '${checkedOutBranch}'.`);
    }
    const rebase = runCommand('git', ['rebase', baseBranch], worktreePath);
    if (rebase.status === 0) {
        return;
    }
    const conflicts = getConflictFiles(worktreePath);
    tryAbortRebase(worktreePath);
    const stderr = rebase.stderr.trim();
    const stdout = rebase.stdout.trim();
    const detail = stderr || stdout || 'Unknown git rebase error';
    const conflictLines = conflicts.length > 0
        ? `\nConflicting files:\n${conflicts.map(file => `- ${file}`).join('\n')}`
        : '';
    throw new Error(`Rebase failed for '${branch}' onto '${baseBranch}' in worktree '${worktreePath}'.${conflictLines}\n` +
        `Resolve conflicts manually in that worktree, then re-run merge.\n` +
        `Details: ${detail}`);
}
export function mergeBranch(branch, cwd = process.cwd()) {
    const result = runCommand('git', ['merge', branch, '--no-ff', '--no-edit'], cwd);
    if (result.status === 0)
        return;
    const conflicts = getConflictFiles(cwd);
    const context = conflicts.length > 0
        ? `\nConflicting files:\n${conflicts.map(file => `- ${file}`).join('\n')}`
        : '';
    throw new Error(`Merge conflict while merging '${branch}'.${context}`);
}
export function runTypecheckGate(cwd = process.cwd()) {
    const tsc = runCommand('bunx', ['tsc', '--noEmit'], cwd);
    if (tsc.status === 0)
        return;
    const stderr = tsc.stderr.trim();
    const stdout = tsc.stdout.trim();
    throw new Error(`TypeScript gate failed after merge.\n${stderr || stdout || 'Unknown tsc error'}`);
}
export function runRebuild(cwd = process.cwd()) {
    const build = runCommand('bun', ['run', 'build'], cwd);
    if (build.status === 0)
        return;
    const stderr = build.stderr.trim();
    const stdout = build.stdout.trim();
    throw new Error(`Rebuild failed.\n${stderr || stdout || 'Unknown build error'}`);
}
export function printSummary(steps, rebuild) {
    console.log('Merge complete.');
    console.log('Merged branches (in order):');
    for (const step of steps) {
        console.log(`- ${step.branch} (${step.beadId})`);
        if (step.changedFiles.length === 0) {
            console.log('  files: (none)');
            continue;
        }
        console.log(`  files: ${step.changedFiles.join(', ')}`);
    }
    console.log('TypeScript gate: passed after each merge');
    if (rebuild) {
        console.log('Rebuild: bun run build (passed)');
    }
}
function printUsageAndExit(message) {
    console.error(message);
    console.error('Usage: specialists|sp merge <target-bead-id> [--rebuild]');
    process.exit(1);
}
export function runMergePlan(targets, options) {
    const mainRepoRoot = resolveMainWorktreeRoot();
    assertMainRepoCleanForMerge(mainRepoRoot);
    const mergedSteps = [];
    for (const target of targets) {
        rebaseBranchOntoMaster(target.branch, target.worktreePath);
        assertBranchMergeWorthiness(target, mainRepoRoot);
        mergeBranch(target.branch, mainRepoRoot);
        runTypecheckGate(mainRepoRoot);
        mergedSteps.push({
            beadId: target.beadId,
            branch: target.branch,
            changedFiles: readChangedFilesForLastMerge(mainRepoRoot),
        });
    }
    if (options.rebuild) {
        runRebuild(mainRepoRoot);
    }
    return mergedSteps;
}
function getCurrentBranchName() {
    const result = runCommand('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
    if (result.status !== 0) {
        throw new Error('Unable to resolve current git branch.');
    }
    const branchName = result.stdout.trim();
    if (!branchName || branchName === 'HEAD') {
        throw new Error('Detached HEAD is not supported for PR publication.');
    }
    return branchName;
}
function checkoutNewBranch(branchName) {
    const checkout = runCommand('git', ['checkout', '-b', branchName]);
    if (checkout.status === 0)
        return;
    throw new Error(`Failed to create publish branch '${branchName}': ${checkout.stderr.trim() || checkout.stdout.trim() || 'unknown git error'}`);
}
function checkoutBranch(branchName) {
    const checkout = runCommand('git', ['checkout', branchName]);
    if (checkout.status === 0)
        return;
    throw new Error(`Failed to checkout branch '${branchName}': ${checkout.stderr.trim() || checkout.stdout.trim() || 'unknown git error'}`);
}
function createPullRequest(baseBranch, publishBranch, publicationLabel) {
    const title = `[sp] Publish ${publicationLabel}`;
    const body = [
        `Automated publication for ${publicationLabel}.`,
        '',
        'Generated by `sp merge --pr` / `sp epic merge --pr` / `sp end --pr`.',
    ].join('\n');
    const command = runCommand('gh', ['pr', 'create', '--base', baseBranch, '--head', publishBranch, '--title', title, '--body', body]);
    if (command.status !== 0) {
        throw new Error(`Failed to create PR via gh CLI: ${command.stderr.trim() || command.stdout.trim() || 'unknown gh error'}`);
    }
    const pullRequestUrl = command.stdout
        .split('\n')
        .map((line) => line.trim())
        .find((line) => line.startsWith('http'));
    if (!pullRequestUrl) {
        throw new Error('gh pr create succeeded but did not return a PR URL.');
    }
    return pullRequestUrl;
}
export function executePublicationPlan(targets, options) {
    if (options.mode === 'direct') {
        return {
            steps: runMergePlan(targets, options),
        };
    }
    const baseBranch = getCurrentBranchName();
    const publishBranch = `sp/publish-${options.publicationLabel.replace(/[^a-zA-Z0-9._-]+/g, '-')}-${Date.now()}`;
    checkoutNewBranch(publishBranch);
    try {
        const steps = runMergePlan(targets, options);
        const pullRequestUrl = createPullRequest(baseBranch, publishBranch, options.publicationLabel);
        checkoutBranch(baseBranch);
        return { steps, pullRequestUrl };
    }
    catch (error) {
        try {
            checkoutBranch(baseBranch);
        }
        catch {
            // Preserve original publication error.
        }
        throw error;
    }
}
export async function run() {
    let options;
    try {
        options = parseOptions(process.argv.slice(3));
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        printUsageAndExit(message);
    }
    const targets = resolveMergeTargets(options.target);
    const mergedSteps = runMergePlan(targets, { rebuild: options.rebuild });
    printSummary(mergedSteps, options.rebuild);
}
//# sourceMappingURL=merge.js.map