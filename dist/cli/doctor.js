// Health check for specialists installation — like bd doctor.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { createObservabilitySqliteClient } from '../specialist/observability-sqlite.js';
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
function ok(msg) { console.log(`  ${green('✓')} ${msg}`); }
function warn(msg) { console.log(`  ${yellow('○')} ${msg}`); }
function fail(msg) { console.log(`  ${red('✗')} ${msg}`); }
function fix(msg) { console.log(`    ${dim('→ fix:')} ${yellow(msg)}`); }
function hint(msg) { console.log(`    ${dim(msg)}`); }
function section(label) {
    const line = '─'.repeat(Math.max(0, 38 - label.length));
    console.log(`\n${bold(`── ${label} ${line}`)}`);
}
function sp(bin, args) {
    const r = spawnSync(bin, args, { encoding: 'utf8', stdio: 'pipe', timeout: 5000 });
    return { ok: r.status === 0 && !r.error, stdout: (r.stdout ?? '').trim() };
}
function isInstalled(bin) {
    return spawnSync('which', [bin], { encoding: 'utf8', timeout: 2000 }).status === 0;
}
const CWD = process.cwd();
const CLAUDE_DIR = join(CWD, '.claude');
const PI_DIR = join(CWD, '.pi');
const XTRM_SKILLS_DIR = join(CWD, '.xtrm', 'skills');
const XTRM_DEFAULT_SKILLS_DIR = join(XTRM_SKILLS_DIR, 'default');
const XTRM_ACTIVE_SKILLS_DIR = join(XTRM_SKILLS_DIR, 'active');
const ACTIVE_CLAUDE_SKILLS_DIR = join(XTRM_ACTIVE_SKILLS_DIR, 'claude');
const ACTIVE_PI_SKILLS_DIR = join(XTRM_ACTIVE_SKILLS_DIR, 'pi');
const CONFIG_SKILLS_DIR = join(CWD, 'config', 'skills');
const SPECIALISTS_DIR = join(CWD, '.specialists');
const HOOKS_DIR = join(CWD, '.xtrm', 'hooks', 'specialists');
const CLAUDE_HOOKS_DIR = join(CLAUDE_DIR, 'hooks');
const SETTINGS_FILE = join(CLAUDE_DIR, 'settings.json');
const MCP_FILE = join(CWD, '.mcp.json');
const HOOK_NAMES = [
    'specialists-complete.mjs',
    'specialists-session-start.mjs',
];
function loadJson(path) {
    if (!existsSync(path))
        return null;
    try {
        return JSON.parse(readFileSync(path, 'utf8'));
    }
    catch {
        return null;
    }
}
function checkPi() {
    section('pi  (coding agent runtime)');
    if (!isInstalled('pi')) {
        fail('pi not installed');
        fix('install pi first');
        return false;
    }
    const version = sp('pi', ['--version']);
    const models = sp('pi', ['--list-models']);
    const providers = models.ok
        ? new Set(models.stdout.split('\n').slice(1).map(line => line.split(/\s+/)[0]).filter(Boolean))
        : new Set();
    const vStr = version.ok ? `v${version.stdout}` : 'unknown version';
    if (providers.size === 0) {
        warn(`pi ${vStr} installed but no active providers`);
        fix('pi config   (add at least one API key)');
        return false;
    }
    ok(`pi ${vStr}  —  ${providers.size} provider${providers.size > 1 ? 's' : ''} active  ${dim(`(${[...providers].join(', ')})`)}`);
    return true;
}
function checkSpAlias() {
    section('sp alias  (specialists shortcut)');
    if (isInstalled('sp')) {
        ok('sp alias installed');
        return true;
    }
    fail('sp alias not found in PATH');
    fix('npm install -g @jaggerxtrm/specialists@latest   (reinstall to create symlink)');
    return false;
}
function checkBd() {
    section('beads  (issue tracker)');
    if (!isInstalled('bd')) {
        fail('bd not installed');
        fix('install beads (bd) first');
        return false;
    }
    ok(`bd installed  ${dim(sp('bd', ['--version']).stdout || '')}`);
    if (existsSync(join(CWD, '.beads')))
        ok('.beads/ present in project');
    else
        warn('.beads/ not found in project');
    return true;
}
function checkXt() {
    section('xtrm-tools');
    if (!isInstalled('xt')) {
        fail('xt not installed');
        fix('install xtrm-tools first');
        return false;
    }
    ok(`xt installed  ${dim(sp('xt', ['--version']).stdout || '')}`);
    return true;
}
function checkHooks() {
    section('Claude Code hooks  (2 expected)');
    let allPresent = true;
    for (const name of HOOK_NAMES) {
        const canonicalPath = join(HOOKS_DIR, name);
        if (!existsSync(canonicalPath)) {
            fail(`${relative(CWD, canonicalPath)}  ${red('missing')}`);
            fix('specialists init');
            allPresent = false;
        }
        else {
            ok(relative(CWD, canonicalPath));
        }
        const claudeHookPath = join(CLAUDE_HOOKS_DIR, name);
        const symlinkState = isSymlinkTo(claudeHookPath, canonicalPath);
        if (symlinkState.ok) {
            ok(`${relative(CWD, claudeHookPath)} -> ${relative(dirname(claudeHookPath), canonicalPath)}`);
            continue;
        }
        allPresent = false;
        const relHookPath = relative(CWD, claudeHookPath);
        if (symlinkState.reason === 'missing') {
            fail(`${relHookPath} missing`);
        }
        else if (symlinkState.reason === 'not-symlink') {
            fail(`${relHookPath} is not a symlink`);
        }
        else if (symlinkState.reason === 'wrong-target') {
            fail(`${relHookPath} points to ${symlinkState.target ?? 'unknown target'}`);
        }
        else {
            fail(`${relHookPath} is broken`);
        }
        fix('specialists init');
    }
    const settings = loadJson(SETTINGS_FILE);
    if (!settings) {
        warn(`Could not read ${SETTINGS_FILE}`);
        fix('specialists init');
        return false;
    }
    // Read from settings.hooks (correct location) and fall back to top-level (legacy buggy location)
    const hooksObj = (settings.hooks ?? {});
    const hookEntries = Object.values(hooksObj).flat();
    const legacyEntries = Object.entries(settings)
        .filter(([key, value]) => key !== 'hooks' && Array.isArray(value))
        .flatMap(([, value]) => value);
    const wiredCommands = new Set([...hookEntries, ...legacyEntries]
        .flatMap(entry => (entry.hooks ?? []).map(hook => hook.command ?? '')));
    for (const name of HOOK_NAMES) {
        const expectedRelative = `node .claude/hooks/${name}`;
        if (!wiredCommands.has(expectedRelative)) {
            warn(`${name} not wired in settings.json`);
            fix('specialists init');
            allPresent = false;
        }
    }
    if (allPresent)
        hint(`Hooks wired in ${SETTINGS_FILE}`);
    return allPresent;
}
function checkMCP() {
    section('MCP registration');
    const mcp = loadJson(MCP_FILE);
    const spec = mcp?.mcpServers?.specialists;
    if (!spec || spec.command !== 'specialists') {
        fail(`MCP server 'specialists' not registered in .mcp.json`);
        fix('specialists init');
        return false;
    }
    ok(`MCP server 'specialists' registered in ${MCP_FILE}`);
    return true;
}
function hashFile(path) {
    const hash = createHash('sha256');
    hash.update(readFileSync(path));
    return hash.digest('hex');
}
function collectFileHashes(rootDir) {
    const hashes = new Map();
    const visit = (dir) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const fullPath = join(dir, entry.name);
            if (entry.isDirectory()) {
                visit(fullPath);
                continue;
            }
            if (!entry.isFile())
                continue;
            const relPath = relative(rootDir, fullPath);
            hashes.set(relPath, hashFile(fullPath));
        }
    };
    if (existsSync(rootDir))
        visit(rootDir);
    return hashes;
}
function isSymlinkTo(linkPath, expectedTargetPath) {
    if (!existsSync(linkPath))
        return { ok: false, reason: 'missing' };
    let stats;
    try {
        stats = lstatSync(linkPath);
    }
    catch {
        return { ok: false, reason: 'broken' };
    }
    if (!stats.isSymbolicLink())
        return { ok: false, reason: 'not-symlink' };
    try {
        const rawTarget = readlinkSync(linkPath);
        const resolvedTarget = resolve(dirname(linkPath), rawTarget);
        const resolvedExpected = resolve(expectedTargetPath);
        if (resolvedTarget !== resolvedExpected) {
            return { ok: false, reason: 'wrong-target', target: rawTarget };
        }
        return { ok: true };
    }
    catch {
        return { ok: false, reason: 'broken' };
    }
}
function checkSkillDrift() {
    section('Skill drift  (.xtrm skill sync)');
    if (!existsSync(CONFIG_SKILLS_DIR)) {
        fail('config/skills/ missing');
        fix('restore config/skills/ from git');
        return false;
    }
    if (!existsSync(XTRM_DEFAULT_SKILLS_DIR)) {
        fail('.xtrm/skills/default/ missing');
        fix('specialists init --sync-skills');
        return false;
    }
    const canonicalHashes = collectFileHashes(CONFIG_SKILLS_DIR);
    const defaultHashes = collectFileHashes(XTRM_DEFAULT_SKILLS_DIR);
    const drifted = [];
    const missingInDefault = [];
    const extraInDefault = [];
    for (const [relPath, canonicalHash] of canonicalHashes) {
        const defaultHash = defaultHashes.get(relPath);
        if (!defaultHash) {
            missingInDefault.push(relPath);
            continue;
        }
        if (canonicalHash !== defaultHash)
            drifted.push(relPath);
    }
    for (const relPath of defaultHashes.keys()) {
        if (!canonicalHashes.has(relPath))
            extraInDefault.push(relPath);
    }
    if (drifted.length === 0 && missingInDefault.length === 0 && extraInDefault.length === 0) {
        ok('config/skills/ and .xtrm/skills/default/ are in sync');
    }
    else {
        if (drifted.length > 0) {
            fail(`${drifted.length} drifted file${drifted.length === 1 ? '' : 's'} between config/skills and .xtrm/skills/default`);
            hint(`example: ${drifted.slice(0, 3).join(', ')}${drifted.length > 3 ? ', ...' : ''}`);
        }
        if (missingInDefault.length > 0) {
            fail(`${missingInDefault.length} file${missingInDefault.length === 1 ? '' : 's'} missing from .xtrm/skills/default`);
            hint(`example: ${missingInDefault.slice(0, 3).join(', ')}${missingInDefault.length > 3 ? ', ...' : ''}`);
        }
        if (extraInDefault.length > 0) {
            warn(`${extraInDefault.length} extra file${extraInDefault.length === 1 ? '' : 's'} found only in .xtrm/skills/default`);
            hint(`example: ${extraInDefault.slice(0, 3).join(', ')}${extraInDefault.length > 3 ? ', ...' : ''}`);
        }
        fix('specialists init --sync-skills');
    }
    let linksOk = true;
    for (const scope of ['claude', 'pi']) {
        const activeRoot = join(XTRM_ACTIVE_SKILLS_DIR, scope);
        if (!existsSync(activeRoot)) {
            fail(`${relative(CWD, activeRoot)}/ missing`);
            fix('specialists init --sync-skills');
            linksOk = false;
            continue;
        }
        const defaultSkills = readdirSync(XTRM_DEFAULT_SKILLS_DIR, { withFileTypes: true })
            .filter(entry => entry.isDirectory())
            .map(entry => entry.name);
        for (const skillName of defaultSkills) {
            const activeLinkPath = join(activeRoot, skillName);
            const expectedTarget = join(XTRM_DEFAULT_SKILLS_DIR, skillName);
            const state = isSymlinkTo(activeLinkPath, expectedTarget);
            if (state.ok)
                continue;
            linksOk = false;
            const relLink = relative(CWD, activeLinkPath);
            if (state.reason === 'missing') {
                fail(`${relLink} missing`);
            }
            else if (state.reason === 'not-symlink') {
                fail(`${relLink} is not a symlink`);
            }
            else if (state.reason === 'wrong-target') {
                fail(`${relLink} points to ${state.target ?? 'unknown target'}`);
            }
            else {
                fail(`${relLink} is broken`);
            }
            fix('specialists init --sync-skills');
        }
    }
    const skillRootChecks = [
        { root: join(CLAUDE_DIR, 'skills'), expected: ACTIVE_CLAUDE_SKILLS_DIR },
        { root: join(PI_DIR, 'skills'), expected: ACTIVE_PI_SKILLS_DIR },
    ];
    let rootLinksOk = true;
    for (const check of skillRootChecks) {
        const state = isSymlinkTo(check.root, check.expected);
        if (state.ok) {
            ok(`${relative(CWD, check.root)} -> ${relative(dirname(check.root), check.expected)}`);
            continue;
        }
        rootLinksOk = false;
        const relRoot = relative(CWD, check.root);
        if (state.reason === 'missing') {
            fail(`${relRoot} missing`);
        }
        else if (state.reason === 'not-symlink') {
            fail(`${relRoot} is not a symlink`);
        }
        else if (state.reason === 'wrong-target') {
            fail(`${relRoot} points to ${state.target ?? 'unknown target'}`);
        }
        else {
            fail(`${relRoot} is broken`);
        }
        fix('specialists init --sync-skills');
    }
    return drifted.length === 0 && missingInDefault.length === 0 && linksOk && rootLinksOk;
}
function checkRuntimeDirs() {
    section('.specialists/ runtime directories');
    const rootDir = join(CWD, '.specialists');
    const jobsDir = join(rootDir, 'jobs');
    const readyDir = join(rootDir, 'ready');
    let allOk = true;
    if (!existsSync(rootDir)) {
        warn('.specialists/ not found in current project');
        fix('specialists init');
        allOk = false;
    }
    else {
        ok('.specialists/ present');
        for (const [subDir, label] of [[jobsDir, 'jobs'], [readyDir, 'ready']]) {
            if (!existsSync(subDir)) {
                warn(`.specialists/${label}/ missing — auto-creating`);
                mkdirSync(subDir, { recursive: true });
                ok(`.specialists/${label}/ created`);
            }
            else {
                ok(`.specialists/${label}/ present`);
            }
        }
    }
    return allOk;
}
export function parseVersionTuple(value) {
    const normalized = value.trim().replace(/^v/i, '');
    const match = normalized.match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
    if (!match)
        return null;
    return [Number(match[1]), Number(match[2]), Number(match[3])];
}
export function compareVersions(left, right) {
    const leftTuple = parseVersionTuple(left);
    const rightTuple = parseVersionTuple(right);
    if (!leftTuple || !rightTuple)
        return 0;
    for (let index = 0; index < 3; index += 1) {
        if (leftTuple[index] > rightTuple[index])
            return 1;
        if (leftTuple[index] < rightTuple[index])
            return -1;
    }
    return 0;
}
export function setStatusError(statusPath) {
    try {
        const raw = readFileSync(statusPath, 'utf8');
        const status = JSON.parse(raw);
        status.status = 'error';
        writeFileSync(statusPath, `${JSON.stringify(status, null, 2)}\n`, 'utf8');
    }
    catch {
        // best-effort repair for corrupt status files
    }
}
export function cleanupProcesses(jobsDir, dryRun) {
    let entries;
    try {
        entries = readdirSync(jobsDir);
    }
    catch {
        entries = [];
    }
    const result = {
        total: 0,
        running: 0,
        zombies: 0,
        updated: 0,
        zombieJobIds: [],
    };
    for (const jobId of entries) {
        const statusPath = join(jobsDir, jobId, 'status.json');
        if (!existsSync(statusPath))
            continue;
        try {
            const status = JSON.parse(readFileSync(statusPath, 'utf8'));
            result.total += 1;
            if (status.status !== 'running' && status.status !== 'starting')
                continue;
            if (!status.pid)
                continue;
            try {
                process.kill(status.pid, 0);
                result.running += 1;
            }
            catch {
                result.zombies += 1;
                result.zombieJobIds.push(jobId);
                if (!dryRun) {
                    setStatusError(statusPath);
                    result.updated += 1;
                }
            }
        }
        catch {
            continue;
        }
    }
    return result;
}
export function renderProcessSummary(result, dryRun) {
    if (result.zombies === 0) {
        const detail = result.running > 0 ? `, ${result.running} currently running` : ', none currently running';
        return `${result.total} job${result.total !== 1 ? 's' : ''} checked${detail}`;
    }
    const action = dryRun ? 'would be marked error' : 'marked error';
    return `${result.zombies} zombie job${result.zombies === 1 ? '' : 's'} found (${result.updated} ${action})`;
}
function runDoctorOrphans() {
    const sqliteClient = createObservabilitySqliteClient();
    if (!sqliteClient) {
        console.log(`\n${bold('specialists doctor orphans')}\n`);
        fail('observability SQLite not available');
        fix('specialists db setup');
        console.log('');
        process.exit(1);
    }
    try {
        const findings = sqliteClient.scanOrphans();
        const byKind = {
            orphan: findings.filter(item => item.kind === 'orphan'),
            stalePointer: findings.filter(item => item.kind === 'stale-pointer'),
            integrity: findings.filter(item => item.kind === 'integrity-violation'),
        };
        console.log(`\n${bold('specialists doctor orphans')}\n`);
        if (findings.length === 0) {
            ok('No orphan/stale/integrity findings');
            console.log('');
            return;
        }
        const renderGroup = (label, rows) => {
            if (rows.length === 0)
                return;
            console.log(`  ${yellow('○')} ${label}: ${rows.length}`);
            for (const row of rows) {
                console.log(`    - [${row.code}] ${row.message}`);
            }
        };
        renderGroup('orphan', byKind.orphan);
        renderGroup('stale-pointer', byKind.stalePointer);
        renderGroup('integrity-violation', byKind.integrity);
        console.log('');
        process.exit(1);
    }
    finally {
        sqliteClient.close();
    }
}
function checkZombieJobs() {
    section('Background jobs');
    const jobsDir = join(CWD, '.specialists', 'jobs');
    if (!existsSync(jobsDir)) {
        hint('No .specialists/jobs/ — skipping');
        return true;
    }
    const result = cleanupProcesses(jobsDir, false);
    if (result.total === 0) {
        ok('No jobs found');
        return true;
    }
    for (const jobId of result.zombieJobIds) {
        warn(`${jobId}  ${yellow('ZOMBIE')}  ${dim('pid not found for running job')}`);
        fix(`Edit .specialists/jobs/${jobId}/status.json  →  set "status": "error"`);
    }
    if (result.zombies === 0) {
        ok(renderProcessSummary(result, false));
    }
    return result.zombies === 0;
}
export async function run(argv = process.argv.slice(3)) {
    const subcommand = argv[0];
    if (subcommand === 'orphans') {
        runDoctorOrphans();
        return;
    }
    if (subcommand && subcommand !== '--help' && subcommand !== '-h') {
        console.error(`Unknown doctor subcommand: '${subcommand}'`);
        process.exit(1);
    }
    console.log(`\n${bold('specialists doctor')}\n`);
    const piOk = checkPi();
    const spOk = checkSpAlias();
    const bdOk = checkBd();
    const xtOk = checkXt();
    const hooksOk = checkHooks();
    const mcpOk = checkMCP();
    const skillDriftOk = checkSkillDrift();
    const dirsOk = checkRuntimeDirs();
    const jobsOk = checkZombieJobs();
    const allOk = piOk && spOk && bdOk && xtOk && hooksOk && mcpOk && skillDriftOk && dirsOk && jobsOk;
    console.log('');
    if (allOk) {
        console.log(`  ${green('✓')} ${bold('All checks passed')}  — specialists is healthy`);
    }
    else {
        console.log(`  ${yellow('○')} ${bold('Some checks failed')}  — follow the fix hints above`);
        console.log(`  ${dim('specialists init fixes hook + MCP registration; specialists init --sync-skills fixes skill drift/symlink issues.')}`);
    }
    console.log('');
}
//# sourceMappingURL=doctor.js.map