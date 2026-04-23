import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { basename, join, resolve } from 'node:path';
import { SpecialistLoader } from '../specialist/loader.js';
import { SpecialistRunner } from '../specialist/runner.js';
import { CircuitBreaker } from '../utils/circuitBreaker.js';
import { HookEmitter } from '../specialist/hooks.js';
import { createObservabilitySqliteClient, } from '../specialist/observability-sqlite.js';
import { BeadsClient, buildBeadContext } from '../specialist/beads.js';
import { Supervisor } from '../specialist/supervisor.js';
import { resolveJobsDir } from '../specialist/job-root.js';
import { resolveNodeRefWithClient } from '../specialist/node-resolve.js';
import { executeCompleteNodeAction, executeCreateBeadAction, spawnDynamicMember, } from '../specialist/node-supervisor.js';
function parseNodeArgs(argv) {
    const command = argv[0];
    const supportedCommands = new Set(['run', 'list', 'promote', 'members', 'memory', 'stop', 'spawn-member', 'create-bead', 'complete', 'wait-phase']);
    if (!command || !supportedCommands.has(command)) {
        throw new Error('Usage: specialists node <run|list|promote|members|memory|stop|spawn-member|create-bead|complete|wait-phase> [options]');
    }
    let nodeConfigInput;
    let inlineJson;
    let nodeId;
    let findingId;
    let toBead;
    let beadId;
    let contextDepth;
    let memberKey;
    let specialist;
    let phaseId;
    let scope;
    let title;
    let beadType = 'task';
    let priority = 2;
    let dependsOn;
    let strategy;
    let forceDraftPr = false;
    let memberKeys;
    let timeoutMs;
    let jsonMode = false;
    for (let i = 1; i < argv.length; i += 1) {
        const token = argv[i];
        if (token === '--json') {
            jsonMode = true;
            continue;
        }
        if (token === '--force-draft-pr') {
            forceDraftPr = true;
            continue;
        }
        const readValue = (flag) => {
            const value = argv[i + 1];
            if (!value || value.startsWith('--')) {
                throw new Error(`${flag} requires a value`);
            }
            i += 1;
            return value;
        };
        if (token === '--inline') {
            inlineJson = readValue('--inline');
            continue;
        }
        if (token === '--node') {
            nodeId = readValue('--node');
            continue;
        }
        if (token === '--to-bead') {
            toBead = readValue('--to-bead');
            continue;
        }
        if (token === '--bead') {
            beadId = readValue('--bead');
            continue;
        }
        if (token === '--context-depth') {
            contextDepth = Math.max(0, Number.parseInt(readValue('--context-depth'), 10) || 0);
            continue;
        }
        if (token === '--member' || token === '--member-key') {
            memberKey = readValue(token);
            continue;
        }
        if (token === '--specialist') {
            specialist = readValue('--specialist');
            continue;
        }
        if (token === '--phase') {
            phaseId = readValue('--phase');
            continue;
        }
        if (token === '--scope') {
            scope = readValue('--scope').split(',').map((entry) => entry.trim()).filter((entry) => entry.length > 0);
            continue;
        }
        if (token === '--title') {
            title = readValue('--title');
            continue;
        }
        if (token === '--type') {
            beadType = readValue('--type');
            continue;
        }
        if (token === '--priority') {
            priority = Math.max(0, Math.min(4, Number.parseInt(readValue('--priority'), 10) || 2));
            continue;
        }
        if (token === '--depends-on') {
            dependsOn = readValue('--depends-on').split(',').map((entry) => entry.trim()).filter((entry) => entry.length > 0);
            continue;
        }
        if (token === '--strategy') {
            const strategyValue = readValue('--strategy');
            if (strategyValue !== 'pr' && strategyValue !== 'manual') {
                throw new Error(`Invalid value for --strategy: ${strategyValue}. Expected one of: pr, manual`);
            }
            strategy = strategyValue;
            continue;
        }
        if (token === '--members') {
            memberKeys = readValue('--members').split(',').map((entry) => entry.trim()).filter((entry) => entry.length > 0);
            continue;
        }
        if (token === '--timeout') {
            timeoutMs = Math.max(1, Number.parseInt(readValue('--timeout'), 10) || 1);
            continue;
        }
        if (!token.startsWith('--') && command === 'run' && !nodeConfigInput) {
            nodeConfigInput = token;
            continue;
        }
        if (!token.startsWith('--') && (command === 'promote' || command === 'members' || command === 'memory' || command === 'stop') && !nodeId) {
            nodeId = token;
            continue;
        }
        if (!token.startsWith('--') && command === 'promote' && !findingId) {
            findingId = token;
            continue;
        }
        throw new Error(`Unknown argument: ${token}`);
    }
    if (command === 'run' && !nodeConfigInput && !inlineJson) {
        throw new Error('Usage: specialists node run <node-config-name-or-file> [--inline JSON] [--bead <bead-id>] [--context-depth <n>] [--json]');
    }
    if (command === 'promote' && (!nodeId || !findingId || !toBead)) {
        throw new Error('Usage: specialists node promote <node-ref> <finding-id> --to-bead <bead-id> [--json]');
    }
    if ((command === 'members' || command === 'memory' || command === 'stop') && !nodeId) {
        throw new Error(`Usage: specialists node ${command} <node-ref> [--json]`);
    }
    if (command === 'spawn-member' || command === 'create-bead' || command === 'complete' || command === 'wait-phase') {
        if (!nodeId) {
            throw new Error(`--node is required for specialists node ${command}`);
        }
    }
    if (command === 'spawn-member' && (!memberKey || !specialist)) {
        throw new Error('Usage: specialists node spawn-member --node <node-ref> --member-key <key> --specialist <name> [--bead <id>] [--phase <id>] [--scope <paths>] [--json]');
    }
    if (command === 'create-bead' && !title) {
        throw new Error('Usage: specialists node create-bead --node <node-ref> --title "..." [--type task] [--priority 2] [--depends-on <id>] [--json]');
    }
    if (command === 'complete' && !strategy) {
        throw new Error('Usage: specialists node complete --node <node-ref> --strategy <pr|manual> [--force-draft-pr] [--json]');
    }
    if (command === 'wait-phase' && (!phaseId || !memberKeys || memberKeys.length === 0)) {
        throw new Error('Usage: specialists node wait-phase --node <node-ref> --phase <id> --members <k1,k2,...> [--timeout <ms>] [--json]');
    }
    return {
        command,
        nodeConfigInput,
        inlineJson,
        nodeId,
        findingId,
        toBead,
        beadId,
        contextDepth,
        memberKey,
        specialist,
        phaseId,
        scope,
        title,
        beadType,
        priority,
        dependsOn,
        strategy,
        forceDraftPr,
        memberKeys,
        timeoutMs,
        jsonMode,
    };
}
const NODE_CONFIG_SUFFIX = '.node.json';
const NODE_DISCOVERY_DIRS = [
    { path: '.specialists/default/nodes', source: 'default' },
    { path: 'config/nodes', source: 'project' },
];
function toNodeName(filePath) {
    const fileName = basename(filePath);
    return fileName.endsWith(NODE_CONFIG_SUFFIX)
        ? fileName.slice(0, -NODE_CONFIG_SUFFIX.length)
        : fileName;
}
function discoverNodeConfigs(cwd) {
    const discoveredByName = new Map();
    for (const directory of NODE_DISCOVERY_DIRS) {
        const absoluteDir = resolve(cwd, directory.path);
        if (!existsSync(absoluteDir))
            continue;
        const files = readdirSync(absoluteDir).filter((fileName) => fileName.endsWith(NODE_CONFIG_SUFFIX));
        for (const fileName of files) {
            const path = join(absoluteDir, fileName);
            const name = toNodeName(fileName);
            if (discoveredByName.has(name))
                continue;
            discoveredByName.set(name, { name, path, source: directory.source });
        }
    }
    return [...discoveredByName.values()].sort((left, right) => left.name.localeCompare(right.name));
}
function resolveNodeConfigPath(cwd, input) {
    const explicitPath = resolve(cwd, input);
    if (existsSync(explicitPath)) {
        return explicitPath;
    }
    const normalizedName = input.endsWith(NODE_CONFIG_SUFFIX)
        ? input.slice(0, -NODE_CONFIG_SUFFIX.length)
        : input;
    const discovered = discoverNodeConfigs(cwd).find((entry) => entry.name === normalizedName);
    if (discovered) {
        return discovered.path;
    }
    throw new Error(`Node config not found: ${input}. Checked explicit path and discovery dirs: ${NODE_DISCOVERY_DIRS.map((entry) => entry.path).join(', ')}`);
}
function parseNodeConfig(raw) {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
        throw new Error('Node config must be a JSON object');
    }
    if (typeof parsed.name !== 'string' || parsed.name.trim() === '') {
        throw new Error('Node config requires non-empty "name"');
    }
    if (typeof parsed.coordinator !== 'string' || parsed.coordinator.trim() === '') {
        throw new Error('Node config requires non-empty "coordinator"');
    }
    if (!Array.isArray(parsed.members)) {
        throw new Error('Node config requires "members" array (can be empty for coordinator-only nodes)');
    }
    if (typeof parsed.initialPrompt !== 'string' || parsed.initialPrompt.trim() === '') {
        throw new Error('Node config requires non-empty "initialPrompt"');
    }
    for (const member of parsed.members) {
        if (!member || typeof member !== 'object') {
            throw new Error('Each member must be an object');
        }
        const entry = member;
        if (typeof entry.memberId !== 'string' || entry.memberId.trim() === '') {
            throw new Error('Each member requires non-empty "memberId"');
        }
        if (typeof entry.specialist !== 'string' || entry.specialist.trim() === '') {
            throw new Error('Each member requires non-empty "specialist"');
        }
    }
    const completionStrategyRaw = parsed.completion_strategy ?? parsed.completionStrategy;
    const completionStrategy = completionStrategyRaw === 'manual' ? 'manual' : 'pr';
    const defaultContextDepthRaw = parsed.default_context_depth ?? parsed.defaultContextDepth;
    const defaultContextDepth = Number.isFinite(defaultContextDepthRaw)
        ? Math.max(0, Number(defaultContextDepthRaw))
        : 1;
    const baseBranchRaw = parsed.base_branch ?? parsed.baseBranch;
    const baseBranch = typeof baseBranchRaw === 'string' && baseBranchRaw.trim().length > 0
        ? baseBranchRaw.trim()
        : 'master';
    const maxRetriesRaw = parsed.max_retries ?? parsed.maxRetries;
    const maxRetries = Number.isFinite(maxRetriesRaw)
        ? Math.max(0, Number(maxRetriesRaw))
        : undefined;
    return {
        name: parsed.name,
        coordinator: parsed.coordinator,
        members: parsed.members.map((member) => ({
            ...member,
            worktree: typeof member.worktree === 'string' ? member.worktree : undefined,
            bootstrapTemplate: typeof member.bootstrapTemplate === 'string' ? member.bootstrapTemplate : undefined,
        })),
        initialPrompt: parsed.initialPrompt,
        memoryNamespace: parsed.memoryNamespace,
        defaultContextDepth,
        completionStrategy,
        maxRetries,
        baseBranch,
    };
}
function readMemberLineage(member, sqliteClient) {
    if (!sqliteClient || !member.job_id) {
        return { reused_from_job_id: null, worktree_owner_job_id: null };
    }
    const status = sqliteClient.readStatus(member.job_id);
    if (!status) {
        return { reused_from_job_id: null, worktree_owner_job_id: null };
    }
    return {
        reused_from_job_id: status.reused_from_job_id ?? null,
        worktree_owner_job_id: status.worktree_owner_job_id ?? null,
    };
}
function summarizeMemory(memoryEntries) {
    const byType = {};
    for (const entry of memoryEntries) {
        const key = entry.entry_type ?? 'unknown';
        byType[key] = (byType[key] ?? 0) + 1;
    }
    const latestSummary = [...memoryEntries]
        .sort((left, right) => (right.updated_at_ms ?? 0) - (left.updated_at_ms ?? 0))
        .find((entry) => typeof entry.summary === 'string' && entry.summary.trim().length > 0)?.summary?.trim() ?? null;
    return {
        total: memoryEntries.length,
        by_type: byType,
        latest_summary: latestSummary,
    };
}
async function handleNodeRun(args) {
    const sqliteClient = createObservabilitySqliteClient();
    if (!sqliteClient) {
        throw new Error('Observability SQLite DB is unavailable. Run: specialists db setup');
    }
    try {
        const rawConfig = args.inlineJson
            ? args.inlineJson
            : readFileSync(resolveNodeConfigPath(process.cwd(), args.nodeConfigInput), 'utf-8');
        const config = parseNodeConfig(rawConfig);
        const loader = new SpecialistLoader();
        const runner = new SpecialistRunner({
            loader,
            hooks: new HookEmitter({ tracePath: join(process.cwd(), '.specialists', 'trace.jsonl') }),
            circuitBreaker: new CircuitBreaker(),
        });
        const nodeId = `${config.name}-${randomUUID().slice(0, 8)}`;
        const effectiveContextDepth = args.contextDepth ?? config.defaultContextDepth;
        const { NodeSupervisor } = await import('../specialist/node-supervisor.js');
        let beadContext;
        if (args.beadId) {
            const beadReader = new BeadsClient();
            const bead = beadReader.readBead(args.beadId);
            if (!bead) {
                throw new Error(`Unable to read bead '${args.beadId}' via bd show --json`);
            }
            const blockers = effectiveContextDepth > 0
                ? beadReader.getCompletedBlockers(args.beadId, effectiveContextDepth)
                : [];
            beadContext = buildBeadContext(bead, blockers);
        }
        const availableSpecialists = (await loader.list()).map((specialist) => specialist.name);
        const supervisor = new NodeSupervisor({
            nodeId,
            nodeName: config.name,
            coordinatorSpecialist: config.coordinator,
            members: config.members,
            memoryNamespace: config.memoryNamespace,
            sourceBeadId: args.beadId,
            sqliteClient,
            runner,
            availableSpecialists,
            qualityGates: ['npm run lint', 'npx tsc --noEmit'],
            nodeConfigSnapshot: config,
            completionStrategy: config.completionStrategy,
            maxRetries: config.maxRetries,
            baseBranch: config.baseBranch,
            runOptions: {
                inputBeadId: args.beadId,
                contextDepth: effectiveContextDepth,
                variables: beadContext
                    ? {
                        bead_context: beadContext,
                        bead_id: args.beadId ?? '',
                    }
                    : undefined,
            },
        });
        let cursor = 0;
        const streamEvents = () => {
            const events = sqliteClient.readNodeEvents(nodeId);
            for (const event of events) {
                if (event.id <= cursor)
                    continue;
                cursor = event.id;
                if (args.jsonMode) {
                    console.log(JSON.stringify({
                        type: 'node_event',
                        node_id: nodeId,
                        id: event.id,
                        t: event.t,
                        event_type: event.type,
                        event_json: JSON.parse(event.event_json),
                    }));
                }
                else {
                    console.log(`[${new Date(event.t).toISOString()}] ${event.type}`);
                }
            }
        };
        const interval = setInterval(streamEvents, 400);
        try {
            const result = await supervisor.run(config.initialPrompt);
            streamEvents();
            const row = sqliteClient.readNodeRun(nodeId);
            if (args.jsonMode) {
                console.log(JSON.stringify({
                    type: 'node_result',
                    node_id: nodeId,
                    status: row?.status ?? 'unknown',
                    coordinator_job_id: row?.coordinator_job_id ?? null,
                    result,
                }));
            }
            else {
                console.log(`node_id: ${nodeId}`);
                console.log(`status: ${row?.status ?? 'unknown'}`);
                console.log(`coordinator_job_id: ${row?.coordinator_job_id ?? '-'}`);
            }
        }
        catch (error) {
            streamEvents();
            const message = error instanceof Error ? error.message : String(error);
            if (args.jsonMode) {
                console.log(JSON.stringify({
                    type: 'node_result',
                    node_id: nodeId,
                    status: 'error',
                    error: message,
                }));
            }
            else {
                console.error(`node run failed (${nodeId}): ${message}`);
            }
            process.exitCode = 1;
        }
        finally {
            clearInterval(interval);
        }
    }
    finally {
        sqliteClient.close();
    }
}
async function handleNodeList(args) {
    const nodes = discoverNodeConfigs(process.cwd());
    if (args.jsonMode) {
        console.log(JSON.stringify(nodes, null, 2));
        return;
    }
    if (nodes.length === 0) {
        console.log('No node configs found. Checked: .specialists/default/nodes and config/nodes');
        return;
    }
    for (const node of nodes) {
        console.log(`${node.name}\t${node.source}\t${node.path}`);
    }
}
function requireNodeRun(sqliteClient, nodeId) {
    const row = sqliteClient.readNodeRun(nodeId);
    if (!row) {
        throw new Error(`Node run not found: ${nodeId}`);
    }
    return row;
}
async function handleNodeMembers(args) {
    const sqliteClient = createObservabilitySqliteClient();
    if (!sqliteClient) {
        throw new Error('Observability SQLite DB is unavailable. Run: specialists db setup');
    }
    try {
        const nodeId = args.nodeId;
        requireNodeRun(sqliteClient, nodeId);
        const members = sqliteClient.readNodeMembers(nodeId).map((member) => {
            const lineage = readMemberLineage(member, sqliteClient);
            return {
                member_id: member.member_id,
                generation: member.generation ?? 0,
                specialist: member.specialist,
                status: member.status,
                enabled: member.enabled ?? true,
                job_id: member.job_id ?? null,
                phase_id: member.phase_id ?? null,
                worktree_path: member.worktree_path ?? null,
                parent_member_id: member.parent_member_id ?? null,
                replaced_member_id: member.replaced_member_id ?? null,
                reused_from_job_id: lineage.reused_from_job_id,
                worktree_owner_job_id: lineage.worktree_owner_job_id,
            };
        });
        if (args.jsonMode) {
            console.log(JSON.stringify({ node_id: nodeId, members }, null, 2));
            return;
        }
        if (members.length === 0) {
            console.log(`No members found for ${nodeId}.`);
            return;
        }
        for (const member of members) {
            const details = [
                `${member.member_id}#${member.generation}`,
                `status=${member.status}`,
                `specialist=${member.specialist}`,
                member.job_id ? `job=${member.job_id}` : null,
                member.phase_id ? `phase=${member.phase_id}` : null,
                member.worktree_path ? `worktree=${member.worktree_path}` : null,
                member.parent_member_id ? `parent=${member.parent_member_id}` : null,
                member.replaced_member_id ? `replaced=${member.replaced_member_id}` : null,
                member.reused_from_job_id ? `reused_from=${member.reused_from_job_id}` : null,
                member.worktree_owner_job_id ? `worktree_owner=${member.worktree_owner_job_id}` : null,
            ].filter((value) => value !== null);
            console.log(details.join(' | '));
        }
    }
    finally {
        sqliteClient.close();
    }
}
async function handleNodeMemory(args) {
    const sqliteClient = createObservabilitySqliteClient();
    if (!sqliteClient) {
        throw new Error('Observability SQLite DB is unavailable. Run: specialists db setup');
    }
    try {
        const nodeId = args.nodeId;
        requireNodeRun(sqliteClient, nodeId);
        const memoryEntries = sqliteClient.readNodeMemory(nodeId);
        const summary = summarizeMemory(memoryEntries);
        if (args.jsonMode) {
            console.log(JSON.stringify({ node_id: nodeId, summary, entries: memoryEntries }, null, 2));
            return;
        }
        console.log(`node_id: ${nodeId}`);
        console.log(`memory_entries: ${summary.total}`);
        console.log(`memory_by_type: ${JSON.stringify(summary.by_type)}`);
        console.log(`memory_latest: ${summary.latest_summary ?? '-'}`);
        for (const entry of memoryEntries) {
            console.log(`- ${entry.entry_id ?? 'n/a'} | type=${entry.entry_type ?? 'unknown'} | member=${entry.source_member_id ?? '-'} | summary=${entry.summary?.trim() ?? '-'}`);
        }
    }
    finally {
        sqliteClient.close();
    }
}
async function handleNodeStop(args) {
    const nodeId = args.nodeId;
    const sqliteClient = createObservabilitySqliteClient();
    if (!sqliteClient) {
        throw new Error('Observability SQLite DB is unavailable. Run: specialists db setup');
    }
    const nodeRun = requireNodeRun(sqliteClient, nodeId);
    if (!nodeRun.coordinator_job_id) {
        throw new Error(`Node ${nodeId} has no coordinator job id`);
    }
    const supervisor = new Supervisor({ runner: null, runOptions: null, jobsDir: resolveJobsDir() });
    const stoppedMembers = [];
    const skippedMembers = [];
    try {
        // Stop all non-terminal members first
        const members = sqliteClient.readNodeMembers(nodeRun.id);
        const terminalStatuses = new Set(['done', 'error', 'cancelled', 'stopped']);
        for (const member of members) {
            if (!member.job_id) {
                skippedMembers.push({ member_id: member.member_id, job_id: '', reason: 'no job_id' });
                continue;
            }
            if (terminalStatuses.has(member.status)) {
                skippedMembers.push({ member_id: member.member_id, job_id: member.job_id, reason: `already ${member.status}` });
                continue;
            }
            const memberStatus = supervisor.readStatus(member.job_id);
            if (!memberStatus?.pid) {
                skippedMembers.push({ member_id: member.member_id, job_id: member.job_id, reason: 'no pid' });
                continue;
            }
            try {
                process.kill(memberStatus.pid, 'SIGTERM');
                stoppedMembers.push({ member_id: member.member_id, job_id: member.job_id, pid: memberStatus.pid });
            }
            catch {
                skippedMembers.push({ member_id: member.member_id, job_id: member.job_id, reason: 'SIGTERM failed (process already gone)' });
            }
        }
        // Stop coordinator
        const coordinatorStatus = supervisor.readStatus(nodeRun.coordinator_job_id);
        if (!coordinatorStatus?.pid) {
            throw new Error(`Coordinator job ${nodeRun.coordinator_job_id} has no pid`);
        }
        process.kill(coordinatorStatus.pid, 'SIGTERM');
        if (args.jsonMode) {
            console.log(JSON.stringify({
                node_id: nodeId,
                coordinator_job_id: nodeRun.coordinator_job_id,
                stopped: true,
                pid: coordinatorStatus.pid,
                members_stopped: stoppedMembers,
                members_skipped: skippedMembers,
            }, null, 2));
            return;
        }
        console.log(`Sent SIGTERM to node ${nodeId} coordinator (${nodeRun.coordinator_job_id}, pid=${coordinatorStatus.pid})`);
        if (stoppedMembers.length > 0) {
            console.log(`Stopped ${stoppedMembers.length} member(s): ${stoppedMembers.map((m) => `${m.member_id}(${m.job_id})`).join(', ')}`);
        }
    }
    finally {
        void supervisor.dispose();
        sqliteClient.close();
    }
}
function buildFindingNotes(nodeId, findingId, finding) {
    const lines = [
        'Node finding promoted',
        `node_id: ${nodeId}`,
        `finding_id: ${findingId}`,
        `memory_entry_id: ${finding.entry_id ?? findingId}`,
        `source_member_id: ${finding.source_member_id ?? 'unknown'}`,
        `confidence: ${finding.confidence ?? 'unknown'}`,
        '',
        '## Summary',
        finding.summary?.trim() || '(no summary)',
    ];
    if (finding.provenance_json?.trim()) {
        lines.push('', '## Provenance', '```json');
        try {
            const parsed = JSON.parse(finding.provenance_json);
            lines.push(JSON.stringify(parsed, null, 2));
        }
        catch {
            lines.push(finding.provenance_json);
        }
        lines.push('```');
    }
    lines.push('', '<!-- node_finding_provenance:start -->', JSON.stringify({
        node_id: nodeId,
        finding_id: findingId,
        memory_entry_id: finding.entry_id ?? findingId,
        source_member_id: finding.source_member_id ?? null,
        confidence: finding.confidence ?? null,
        provenance_json: finding.provenance_json ?? null,
        created_at_ms: finding.created_at_ms ?? null,
        updated_at_ms: finding.updated_at_ms ?? null,
    }), '<!-- node_finding_provenance:end -->');
    return lines.join('\n');
}
function promoteFindingToBead(beadId, notes) {
    const result = spawnSync('bd', ['update', beadId, '--notes', notes], {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (result.error) {
        throw result.error;
    }
    if (result.status !== 0) {
        const errorMessage = result.stderr?.trim() || result.stdout?.trim() || `bd update exited with status ${result.status}`;
        throw new Error(errorMessage);
    }
}
async function handleNodePromote(args) {
    const sqliteClient = createObservabilitySqliteClient();
    if (!sqliteClient) {
        throw new Error('Observability SQLite DB is unavailable. Run: specialists db setup');
    }
    try {
        const nodeId = args.nodeId;
        const findingId = args.findingId;
        const beadId = args.toBead;
        const finding = sqliteClient.readNodeMemory(nodeId).find((entry) => entry.entry_id === findingId);
        if (!finding) {
            throw new Error(`Finding not found: node=${nodeId}, finding=${findingId}`);
        }
        const findingSummary = finding.summary?.trim();
        if (!findingSummary) {
            throw new Error(`Finding ${findingId} has no summary to promote`);
        }
        const notes = buildFindingNotes(nodeId, findingId, finding);
        promoteFindingToBead(beadId, notes);
        if (args.jsonMode) {
            console.log(JSON.stringify({
                type: 'node_promote',
                node_id: nodeId,
                finding_id: findingId,
                bead_id: beadId,
                promoted: true,
            }));
            return;
        }
        console.log(`Promoted finding ${findingId} from ${nodeId} to bead ${beadId}`);
    }
    finally {
        sqliteClient.close();
    }
}
function buildActionError(error) {
    return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
    };
}
function hasJsonFlag(argv) {
    return argv.includes('--json');
}
function emitNodeCommandError(error, jsonMode) {
    const payload = buildActionError(error);
    if (jsonMode) {
        console.log(JSON.stringify(payload));
        process.exitCode = 1;
        return;
    }
    console.error(payload.error);
    process.exitCode = 1;
}
async function createNodeActionRunnerDependencies() {
    const loader = new SpecialistLoader();
    const runner = new SpecialistRunner({
        loader,
        hooks: new HookEmitter({ tracePath: join(process.cwd(), '.specialists', 'trace.jsonl') }),
        circuitBreaker: new CircuitBreaker(),
    });
    return { loader, runner };
}
async function handleNodeAction(args) {
    try {
        if (args.command === 'spawn-member') {
            const { loader, runner } = await createNodeActionRunnerDependencies();
            const available = new Set((await loader.list()).map((entry) => entry.name));
            if (!available.has(args.specialist)) {
                throw new Error(`Unknown specialist: ${args.specialist}`);
            }
            const result = await spawnDynamicMember({
                nodeId: args.nodeId,
                memberKey: args.memberKey,
                specialist: args.specialist,
                beadId: args.beadId,
                phaseId: args.phaseId,
                scopePaths: args.scope,
                runner,
                jobsDir: resolveJobsDir(),
                runOptions: {
                    inputBeadId: args.beadId,
                    contextDepth: 2,
                    workingDirectory: process.cwd(),
                    variables: {
                        bead_id: args.beadId ?? '',
                    },
                },
            });
            console.log(JSON.stringify({ ok: true, member_key: result.memberKey, job_id: result.jobId, specialist: result.specialist }, null, args.jsonMode ? 0 : 2));
            return;
        }
        if (args.command === 'create-bead') {
            const description = `Node action created bead from node ${args.nodeId}.`;
            const result = executeCreateBeadAction({
                nodeId: args.nodeId,
                title: args.title,
                description,
                beadType: args.beadType ?? 'task',
                priority: args.priority ?? 2,
                dependsOn: args.dependsOn,
            });
            console.log(JSON.stringify({ ok: true, bead_id: result.beadId, title: result.title }, null, args.jsonMode ? 0 : 2));
            return;
        }
        if (args.command === 'complete') {
            const result = await executeCompleteNodeAction({
                nodeId: args.nodeId,
                strategy: args.strategy,
                forceDraftPr: args.forceDraftPr,
            });
            console.log(JSON.stringify({ ok: true, strategy: result.strategy, pr_url: result.prUrl ?? null }, null, args.jsonMode ? 0 : 2));
            return;
        }
        if (args.command === 'wait-phase') {
            const sqliteClient = createObservabilitySqliteClient();
            if (!sqliteClient)
                throw new Error('Observability SQLite DB is unavailable. Run: specialists db setup');
            try {
                requireNodeRun(sqliteClient, args.nodeId);
                const deadline = args.timeoutMs ? Date.now() + args.timeoutMs : null;
                const memberKeys = args.memberKeys ?? [];
                while (true) {
                    const members = sqliteClient.readNodeMembers(args.nodeId).filter((member) => member.phase_id === args.phaseId && memberKeys.includes(member.member_id));
                    const outcomes = Object.fromEntries(members.map((member) => [member.member_id, { status: member.status, result: member.job_id ? sqliteClient.readResult(member.job_id) : null }]));
                    const allTerminal = memberKeys.every((key) => {
                        const current = members.find((member) => member.member_id === key);
                        return current ? ['done', 'error', 'stopped'].includes(current.status) : false;
                    });
                    if (allTerminal) {
                        console.log(JSON.stringify({ ok: true, phase: args.phaseId, outcomes }, null, args.jsonMode ? 0 : 2));
                        return;
                    }
                    if (deadline !== null && Date.now() >= deadline) {
                        throw new Error(`Timed out waiting for phase '${args.phaseId}' members: ${memberKeys.join(', ')}`);
                    }
                    await new Promise((resolve) => setTimeout(resolve, 500));
                }
            }
            finally {
                sqliteClient.close();
            }
        }
        throw new Error(`Unsupported node action: ${args.command}`);
    }
    catch (error) {
        console.log(JSON.stringify(buildActionError(error), null, args.jsonMode ? 0 : 2));
        process.exitCode = 1;
    }
}
export async function handleNodeCommand(argv) {
    let parsed;
    try {
        parsed = parseNodeArgs(argv);
    }
    catch (error) {
        emitNodeCommandError(error, hasJsonFlag(argv));
        return;
    }
    if (parsed.command !== 'run' && parsed.command !== 'list' && parsed.nodeId) {
        const sqliteClient = createObservabilitySqliteClient();
        if (!sqliteClient) {
            emitNodeCommandError('Observability SQLite DB is unavailable. Run: specialists db setup', parsed.jsonMode);
            return;
        }
        try {
            parsed = {
                ...parsed,
                nodeId: resolveNodeRefWithClient(parsed.nodeId, sqliteClient),
            };
        }
        catch (error) {
            emitNodeCommandError(error, parsed.jsonMode);
            return;
        }
        finally {
            sqliteClient.close();
        }
    }
    if (parsed.command === 'run') {
        await handleNodeRun(parsed);
        return;
    }
    if (parsed.command === 'list') {
        await handleNodeList(parsed);
        return;
    }
    if (parsed.command === 'promote') {
        await handleNodePromote(parsed);
        return;
    }
    if (parsed.command === 'members') {
        await handleNodeMembers(parsed);
        return;
    }
    if (parsed.command === 'memory') {
        await handleNodeMemory(parsed);
        return;
    }
    if (parsed.command === 'stop') {
        await handleNodeStop(parsed);
        return;
    }
    if (parsed.command === 'spawn-member' || parsed.command === 'create-bead' || parsed.command === 'complete' || parsed.command === 'wait-phase') {
        await handleNodeAction(parsed);
        return;
    }
    emitNodeCommandError(`Unsupported node command: ${parsed.command}`, parsed.jsonMode);
}
//# sourceMappingURL=node.js.map