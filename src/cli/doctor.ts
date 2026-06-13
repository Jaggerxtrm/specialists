// Health check for specialists installation — like bd doctor.

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { createObservabilitySqliteClient } from '../specialist/observability-sqlite.js';
import { resolveCanonicalAssetDir } from '../specialist/canonical-asset-resolver.js';
import { detectDriftUnderRoot } from '../specialist/drift-detector.js';
import { SpecialistLoader } from '../specialist/loader.js';
import { formatVersionCheckNudge, getVersionCheckResult, localVersion, readCachedVersionCheck } from './version-check.js';

const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;

function ok(msg: string) { console.log(`  ${green('✓')} ${msg}`); }
function warn(msg: string) { console.log(`  ${yellow('○')} ${msg}`); }
function fail(msg: string) { console.log(`  ${red('✗')} ${msg}`); }
function fix(msg: string) { console.log(`    ${dim('→ fix:')} ${yellow(msg)}`); }
function hint(msg: string) { console.log(`    ${dim(msg)}`); }

function section(label: string) {
  const line = '─'.repeat(Math.max(0, 38 - label.length));
  console.log(`\n${bold(`── ${label} ${line}`)}`);
}

function sp(bin: string, args: string[]): { ok: boolean; stdout: string } {
  const r = spawnSync(bin, args, { encoding: 'utf8', stdio: 'pipe', timeout: 5000 });
  return { ok: r.status === 0 && !r.error, stdout: (r.stdout ?? '').trim() };
}

function isInstalled(bin: string): boolean {
  return spawnSync('which', [bin], { encoding: 'utf8', timeout: 2000 }).status === 0;
}

const CWD = process.cwd();
const CLAUDE_DIR = join(CWD, '.claude');
const PI_DIR = join(CWD, '.pi');
const XTRM_SKILLS_DIR = join(CWD, '.xtrm', 'skills');
const XTRM_DEFAULT_SKILLS_DIR = join(XTRM_SKILLS_DIR, 'default');
const XTRM_ACTIVE_SKILLS_DIR = join(XTRM_SKILLS_DIR, 'active');
const SPECIALISTS_DIR = join(CWD, '.specialists');
const DEFAULT_SPECIALISTS_DIR = join(SPECIALISTS_DIR, 'default');
const USER_SPECIALISTS_DIR = join(SPECIALISTS_DIR, 'user');
const HOOKS_DIR = join(CWD, '.xtrm', 'hooks', 'specialists');
const CLAUDE_HOOKS_DIR = join(CLAUDE_DIR, 'hooks');
const SETTINGS_FILE = join(CLAUDE_DIR, 'settings.json');
const MCP_FILE = join(CWD, '.mcp.json');
const HOOK_NAMES = [
  'specialists-complete.mjs',
  'specialists-session-start.mjs',
] as const;

type JsonRecord = Record<string, unknown>;

function loadJson(path: string): JsonRecord | null {
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, 'utf8')) as JsonRecord; } catch { return null; }
}

function checkPi(): boolean {
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
    : new Set<string>();
  const vStr = version.ok ? `v${version.stdout}` : 'unknown version';
  if (providers.size === 0) {
    warn(`pi ${vStr} installed but no active providers`);
    fix('pi config   (add at least one API key)');
    return false;
  }
  ok(`pi ${vStr}  —  ${providers.size} provider${providers.size > 1 ? 's' : ''} active  ${dim(`(${[...providers].join(', ')})`)}`);
  return true;
}

function checkSpAlias(): boolean {
  section('sp alias  (specialists shortcut)');
  if (isInstalled('sp')) {
    ok('sp alias installed');
    return true;
  }
  fail('sp alias not found in PATH');
  fix('npm install -g @jaggerxtrm/specialists@latest   (reinstall to create symlink)');
  return false;
}

function checkBd(): boolean {
  section('beads  (issue tracker)');
  if (!isInstalled('bd')) {
    fail('bd not installed');
    fix('install beads (bd) first');
    return false;
  }
  ok(`bd installed  ${dim(sp('bd', ['--version']).stdout || '')}`);
  if (existsSync(join(CWD, '.beads'))) ok('.beads/ present in project');
  else warn('.beads/ not found in project');
  return true;
}

function checkXt(): boolean {
  section('xtrm-tools');
  if (!isInstalled('xt')) {
    fail('xt not installed');
    fix('install xtrm-tools first');
    return false;
  }
  ok(`xt installed  ${dim(sp('xt', ['--version']).stdout || '')}`);
  return true;
}

function checkHooks(): boolean {
  section('Claude Code hooks  (2 expected)');
  let allPresent = true;

  for (const name of HOOK_NAMES) {
    const canonicalPath = join(HOOKS_DIR, name);
    if (!existsSync(canonicalPath)) {
      fail(`${relative(CWD, canonicalPath)}  ${red('missing')}`);
      fix('specialists init');
      allPresent = false;
    } else {
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
    } else if (symlinkState.reason === 'not-symlink') {
      fail(`${relHookPath} is not a symlink`);
    } else if (symlinkState.reason === 'wrong-target') {
      fail(`${relHookPath} points to ${symlinkState.target ?? 'unknown target'}`);
    } else {
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
  const hooksObj = (settings.hooks ?? {}) as Record<string, Array<{ hooks?: Array<{ command?: string }> }>>;
  const hookEntries = Object.values(hooksObj).flat();
  const legacyEntries = Object.entries(settings)
    .filter(([key, value]) => key !== 'hooks' && Array.isArray(value))
    .flatMap(([, value]) => value as Array<{ hooks?: Array<{ command?: string }> }>);
  const wiredCommands = new Set(
    [...hookEntries, ...legacyEntries]
      .flatMap(entry => (entry.hooks ?? []).map(hook => hook.command ?? '')),
  );

  for (const name of HOOK_NAMES) {
    const expectedRelative = `node .claude/hooks/${name}`;
    if (!wiredCommands.has(expectedRelative)) {
      warn(`${name} not wired in settings.json`);
      fix('specialists init');
      allPresent = false;
    }
  }

  if (allPresent) hint(`Hooks wired in ${SETTINGS_FILE}`);
  return allPresent;
}

function checkMCP(): boolean {
  section('MCP registration');
  const mcp = loadJson(MCP_FILE);
  const spec = (mcp?.mcpServers as { specialists?: { command?: string } } | undefined)?.specialists;
  if (!spec || spec.command !== 'specialists') {
    fail(`MCP server 'specialists' not registered in .mcp.json`);
    fix('specialists init');
    return false;
  }
  ok(`MCP server 'specialists' registered in ${MCP_FILE}`);
  return true;
}

function checkVersion(): boolean {
  section('Version check');
  const result = getVersionCheckResult();
  if (result) {
    const nudge = formatVersionCheckNudge(result);
    if (!nudge) {
      ok(`specialists v${result.localVersion} is current`);
      return true;
    }

    warn(nudge);
    return false;
  }

  const cached = readCachedVersionCheck();
  if (!cached) {
    warn('cache empty — skipped');
    return true;
  }

  ok(`specialists v${localVersion} is local; ${cached.latest_tag} cached on ${new Date(cached.checked_at_ms).toISOString()}`);
  return true;
}

function hashFile(path: string): string {
  const hash = createHash('sha256');
  hash.update(readFileSync(path));
  return hash.digest('hex');
}

function collectFileHashes(rootDir: string): Map<string, string> {
  const hashes = new Map<string, string>();
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      const relPath = relative(rootDir, fullPath);
      hashes.set(relPath, hashFile(fullPath));
    }
  };

  if (existsSync(rootDir)) visit(rootDir);
  return hashes;
}

function isSymlinkTo(linkPath: string, expectedTargetPath: string): { ok: boolean; reason?: string; target?: string } {
  if (!existsSync(linkPath)) return { ok: false, reason: 'missing' };

  let stats;
  try {
    stats = lstatSync(linkPath);
  } catch {
    return { ok: false, reason: 'broken' };
  }

  if (!stats.isSymbolicLink()) return { ok: false, reason: 'not-symlink' };

  try {
    const rawTarget = readlinkSync(linkPath);
    const resolvedTarget = resolve(dirname(linkPath), rawTarget);
    const resolvedExpected = resolve(expectedTargetPath);
    if (resolvedTarget !== resolvedExpected) {
      return { ok: false, reason: 'wrong-target', target: rawTarget };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: 'broken' };
  }
}

export function resolvePackageAssetDir(relativePath: string): string | null {
  return resolveCanonicalAssetDir(relativePath) ?? (existsSync(join(CWD, 'config', relativePath)) ? join(CWD, 'config', relativePath) : null);
}

function checkSkillDrift(): boolean {
  section('Category A  package-live skill sync');

  const canonicalSkillsDir = resolvePackageAssetDir('skills');
  if (!canonicalSkillsDir) {
    fail('package canonical skills source missing');
    fix('restore config/skills/ or install package assets');
    return false;
  }

  if (!existsSync(XTRM_DEFAULT_SKILLS_DIR)) {
    fail('.xtrm/skills/default/ missing');
    fix('specialists init --sync-skills');
    return false;
  }

  const canonicalHashes = collectFileHashes(canonicalSkillsDir);
  const defaultHashes = collectFileHashes(XTRM_DEFAULT_SKILLS_DIR);

  const drifted: string[] = [];
  const missingInDefault: string[] = [];
  const extraInDefault: string[] = [];

  for (const [relPath, canonicalHash] of canonicalHashes) {
    const defaultHash = defaultHashes.get(relPath);
    if (!defaultHash) {
      missingInDefault.push(relPath);
      continue;
    }
    if (canonicalHash !== defaultHash) drifted.push(relPath);
  }

  for (const relPath of defaultHashes.keys()) {
    if (!canonicalHashes.has(relPath)) extraInDefault.push(relPath);
  }

  if (drifted.length === 0 && missingInDefault.length === 0 && extraInDefault.length === 0) {
    ok(`${relative(CWD, canonicalSkillsDir)} and .xtrm/skills/default/ are in sync`);
  } else {
    if (drifted.length > 0) {
      fail(`${drifted.length} drifted file${drifted.length === 1 ? '' : 's'} between ${relative(CWD, canonicalSkillsDir)} and .xtrm/skills/default`);
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

  const defaultSkills = readdirSync(XTRM_DEFAULT_SKILLS_DIR, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name);

  let linksOk = true;
  for (const skillName of defaultSkills) {
    const activeLinkPath = join(XTRM_ACTIVE_SKILLS_DIR, skillName);
    const expectedTarget = join(XTRM_DEFAULT_SKILLS_DIR, skillName);
    const state = isSymlinkTo(activeLinkPath, expectedTarget);
    if (state.ok) continue;

    linksOk = false;
    const relLink = relative(CWD, activeLinkPath);
    if (state.reason === 'missing') {
      fail(`${relLink} missing`);
    } else if (state.reason === 'not-symlink') {
      fail(`${relLink} is not a symlink`);
    } else if (state.reason === 'wrong-target') {
      fail(`${relLink} points to ${state.target ?? 'unknown target'}`);
    } else {
      fail(`${relLink} is broken`);
    }
    fix('specialists init --sync-skills');
  }

  const legacyActiveRoots: Array<{ scope: 'claude' | 'pi'; root: string }> = [
    { scope: 'claude', root: join(XTRM_ACTIVE_SKILLS_DIR, 'claude') },
    { scope: 'pi', root: join(XTRM_ACTIVE_SKILLS_DIR, 'pi') },
  ];

  for (const { root } of legacyActiveRoots) {
    if (!existsSync(root)) continue;
    if (isSymlinkTo(root, XTRM_ACTIVE_SKILLS_DIR).ok) continue;

    const relRoot = relative(CWD, root);
    if (lstatSync(root).isDirectory()) {
      warn(`${relRoot}/ legacy scoped layout found`);
    } else {
      warn(`${relRoot} legacy scoped layout found`);
    }
    fix('specialists init --sync-skills');
  }

  const skillRootChecks: Array<{ root: string; expected: string }> = [
    { root: join(CLAUDE_DIR, 'skills'), expected: XTRM_ACTIVE_SKILLS_DIR },
    { root: join(PI_DIR, 'skills'), expected: XTRM_ACTIVE_SKILLS_DIR },
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
    } else if (state.reason === 'not-symlink') {
      fail(`${relRoot} is not a symlink`);
    } else if (state.reason === 'wrong-target') {
      fail(`${relRoot} points to ${state.target ?? 'unknown target'}`);
    } else {
      fail(`${relRoot} is broken`);
    }
    fix('specialists init --sync-skills');
  }

  return drifted.length === 0 && missingInDefault.length === 0 && linksOk && rootLinksOk;
}


function checkManagedMirror(label: string, canonicalRelativePath: string, mirrorDir: string, fixHint: string): boolean {
  const sourceDir = resolvePackageAssetDir(canonicalRelativePath);
  const sourceLabel = sourceDir ? relative(CWD, sourceDir) : `package canonical ${canonicalRelativePath}`;
  if (!sourceDir) {
    warn(`${label} source missing: package canonical ${canonicalRelativePath}`);
    fix(fixHint);
    return false;
  }
  if (!existsSync(mirrorDir)) {
    fail(`${label} mirror missing: ${relative(CWD, mirrorDir)}`);
    fix(fixHint);
    return false;
  }

  const sourceHashes = collectFileHashes(sourceDir);
  const mirrorHashes = collectFileHashes(mirrorDir);
  const drifted = [...sourceHashes.keys()].filter(relPath => mirrorHashes.get(relPath) !== sourceHashes.get(relPath));
  const missing = [...sourceHashes.keys()].filter(relPath => !mirrorHashes.has(relPath));
  const extra = [...mirrorHashes.keys()].filter(relPath => !sourceHashes.has(relPath));

  if (drifted.length === 0 && missing.length === 0 && extra.length === 0) {
    ok(`${label} mirror in sync against ${sourceLabel}`);
    return true;
  }

  if (drifted.length > 0) {
    fail(`${label}: ${drifted.length} safe prune candidate${drifted.length === 1 ? '' : 's'}`);
    hint(`example: ${drifted.slice(0, 3).join(', ')}${drifted.length > 3 ? ', ...' : ''}`);
  }
  if (missing.length > 0) {
    fail(`${label}: ${missing.length} missing mirror file${missing.length === 1 ? '' : 's'}`);
    hint(`example: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? ', ...' : ''}`);
  }
  if (extra.length > 0) {
    warn(`${label}: ${extra.length} extra mirror file${extra.length === 1 ? '' : 's'}`);
    hint(`example: ${extra.slice(0, 3).join(', ')}${extra.length > 3 ? ', ...' : ''}`);
  }
  fix(fixHint);
  return false;
}

function checkManagedAssetMirrors(): boolean {
  section('Category B  xtrm-managed asset mirrors');
  const specialistsOk = checkManagedMirror('specialists', 'specialists', DEFAULT_SPECIALISTS_DIR, 'sp prune-stale-defaults --apply');
  const rulesOk = checkManagedMirror('mandatory-rules', 'mandatory-rules', join(DEFAULT_SPECIALISTS_DIR, 'mandatory-rules'), 'sp prune-stale-defaults --apply');
  const nodesOk = checkManagedMirror('nodes', 'nodes', join(DEFAULT_SPECIALISTS_DIR, 'nodes'), 'sp prune-stale-defaults --apply');
  return specialistsOk && rulesOk && nodesOk;
}

function checkUserOverlayDrift(): boolean {
  section('User specialist overlays');
  if (!existsSync(USER_SPECIALISTS_DIR)) {
    ok('no user overlays present');
    return true;
  }
  const overlays = readdirSync(USER_SPECIALISTS_DIR).filter((name) => name.endsWith('.specialist.json'));
  if (overlays.length === 0) {
    ok('no user overlays present');
    return true;
  }
  let allOk = true;
  for (const name of overlays) {
    const userPath = join(USER_SPECIALISTS_DIR, name);
    const defaultPath = join(DEFAULT_SPECIALISTS_DIR, name);
    const userSpec = loadJson(userPath);
    if (!userSpec) {
      warn(`${name}: failed to parse — skipping drift check`);
      continue;
    }
    if (!existsSync(defaultPath)) {
      ok(`${name}: user-only overlay (no default to drift from)`);
      continue;
    }
    const defaultSpec = loadJson(defaultPath);
    if (!defaultSpec) {
      warn(`${name}: default failed to parse — skipping drift check`);
      continue;
    }
    const userInner = (userSpec.specialist ?? {}) as JsonRecord;
    const defaultInner = (defaultSpec.specialist ?? {}) as JsonRecord;
    const userRules = ((userInner.mandatory_rules ?? {}) as { template_sets?: unknown }).template_sets;
    const defaultRules = ((defaultInner.mandatory_rules ?? {}) as { template_sets?: unknown }).template_sets;
    const userSets = Array.isArray(userRules) ? userRules : [];
    const defaultSets = Array.isArray(defaultRules) ? defaultRules : [];
    const missingSets = defaultSets.filter((set) => !userSets.includes(set as string));
    if (missingSets.length > 0) {
      warn(`${name}: user overlay shadows default but is missing mandatory_rules.template_sets: [${missingSets.join(', ')}]`);
      hint('user overlay silently disables these rules at runtime; either add them to the overlay or delete the overlay to fall back to default.');
      allOk = false;
    } else {
      ok(`${name}: mandatory_rules in sync with default`);
    }
  }
  return allOk;
}

function checkRuntimeDirs(): boolean {
  section('.specialists/ runtime directories');
  const rootDir = join(CWD, '.specialists');
  const jobsDir = join(rootDir, 'jobs');
  const readyDir = join(rootDir, 'ready');
  let allOk = true;

  if (!existsSync(rootDir)) {
    warn('.specialists/ not found in current project');
    fix('specialists init');
    allOk = false;
  } else {
    ok('.specialists/ present');
    for (const [subDir, label] of [[jobsDir, 'jobs'], [readyDir, 'ready']] as [string, string][]) {
      if (!existsSync(subDir)) {
        warn(`.specialists/${label}/ missing — auto-creating`);
        mkdirSync(subDir, { recursive: true });
        ok(`.specialists/${label}/ created`);
      } else {
        ok(`.specialists/${label}/ present`);
      }
    }
  }
  return allOk;
}

function checkClaudeMdFragments(): boolean {

  section('CLAUDE.md fragments');
  const projectRoot = process.cwd();
  const claudeMd = join(projectRoot, 'CLAUDE.md');
  if (!existsSync(claudeMd)) {
    warn('No CLAUDE.md in project root — skipping fragment check');
    return true;
  }
  if (!isInstalled('xt')) {
    warn('xt not on PATH — skipping fragment drift check');
    hint('install xtrm-tools to enable: xt claude-sync --check');
    return true;
  }
  const result = spawnSync('xt', ['claude-sync', '--check', '--json', '--cwd', projectRoot], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error) {
    warn(`xt claude-sync failed to launch: ${result.error.message}`);
    return true;
  }
  let parsed: { managed_sections?: Array<{ name: string; version: string; canonical_version: string | null }>; drift?: Array<{ name: string; kind: string; current_version: string | null; canonical_version: string | null }>; known_fragments?: string[] } | null = null;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    warn(`xt claude-sync produced unparseable JSON (exit ${result.status})`);
    return true;
  }
  const sections = parsed?.managed_sections ?? [];
  const drift = parsed?.drift ?? [];
  if (sections.length === 0) {
    warn('CLAUDE.md has no XTRM-MANAGED sentinels — fragments not initialized');
    fix('xt claude-sync --add bd-workflow  (and other fragments)');
    return false;
  }
  const driftByName = new Map(drift.map(d => [d.name, d]));
  let allOk = true;
  for (const s of sections) {
    const d = driftByName.get(s.name);
    if (!d) {
      ok(`${s.name.padEnd(20)} current (v${s.version})`);
      continue;
    }
    allOk = false;
    if (d.kind === 'version-mismatch') {
      warn(`${s.name.padEnd(20)} project v${d.current_version}; canonical v${d.canonical_version}`);
      fix('xt claude-sync --apply --accept-overwrite');
    } else if (d.kind === 'body-mismatch') {
      warn(`${s.name.padEnd(20)} body diverges from canonical v${d.canonical_version}`);
      fix('xt claude-sync --apply --accept-overwrite');
    } else if (d.kind === 'unknown-fragment') {
      warn(`${s.name.padEnd(20)} not a known canonical fragment`);
      hint('this CLAUDE.md may have been written by a newer xt; consider updating xtrm-tools');
    }
  }
  return allOk;
}


interface DoctorOptions {
  json: boolean;
  root?: string;
  drift: boolean;
  specialists: boolean;
}

function parseDoctorArgs(argv: readonly string[]): DoctorOptions {
  const opts: DoctorOptions = { json: false, drift: false, specialists: false };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--json') { opts.json = true; continue; }
    if (token === '--check-drift' || token === '--drift') { opts.drift = true; continue; }
    if (token === '--specialists' || token === '--check-specialists') { opts.specialists = true; continue; }
    if (token === '--root') { const value = argv[i + 1]; if (!value || value.startsWith('--')) throw new Error('--root requires a value'); opts.root = resolve(value); i += 1; continue; }
    if (token === '--help' || token === '-h') continue;
    throw new Error(`Unknown argument: ${token}`);
  }
  return opts;
}

/**
 * Specialist override-layer health (KAN-90 / unitAI-1gtou.14).
 *
 * Reports:
 *  - resolution of the global user-config path (~/.config/specialists/user.json or XDG)
 *  - per-specialist model coverage after the full 4-layer merge
 *  - blocked-field warnings emitted by the loader during merge
 *
 * Exit semantics:
 *  - returns true (no problems) when no specialist has a missing model AND no
 *    blocked-field strip warning fired.
 *  - a fresh install without any global file is treated as a NOTICE (not a fail):
 *    we tell the user to run `sp init --global`.
 */
async function checkSpecialistOverrides(): Promise<boolean> {
  section('specialist overrides  (KAN-90 global user.json)');
  let loader: SpecialistLoader;
  try {
    loader = new SpecialistLoader();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    fail(`could not construct SpecialistLoader: ${msg}`);
    return false;
  }

  const globalLayer = loader.getGlobalLayerPath();
  if (!globalLayer) {
    warn('global user-config path could not be resolved (HOME and XDG_CONFIG_HOME both unset)');
    fix('set HOME or XDG_CONFIG_HOME, then run: sp init --global');
    return false;
  }

  if (globalLayer.exists) {
    ok(`global user config: ${globalLayer.path}  ${dim(`(source: ${globalLayer.source})`)}`);
  } else {
    warn(`global user config NOT present at ${globalLayer.path}  ${dim(`(source: ${globalLayer.source})`)}`);
    fix('sp init --global');
  }

  let summaries: Awaited<ReturnType<SpecialistLoader['list']>>;
  try {
    summaries = await loader.list();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    fail(`SpecialistLoader.list() threw: ${msg}`);
    return false;
  }

  const missing: string[] = [];
  for (const summary of summaries) {
    if (!summary.model || summary.model === '') missing.push(summary.name);
  }

  const total = summaries.length;
  const present = total - missing.length;

  if (missing.length === 0) {
    ok(`${present}/${total} specialists have a model configured`);
  } else if (!globalLayer.exists) {
    // Fresh-install notice path: no global file yet, so missing models are expected.
    warn(`${present}/${total} specialists have a model configured  ${dim('(global override file not created yet)')}`);
    fix('sp init --global  →  sp edit --global  (set the model for each specialist you use)');
  } else {
    fail(`${present}/${total} specialists have a model configured`);
    hint(`missing: ${missing.join(', ')}`);
    fix(`sp edit --global <name>.execution.model <model-id>   (run once per missing specialist)`);
  }

  // Blocked-field warnings are populated as a side effect of list().
  const warnings = loader.getBlockedFieldWarnings();
  if (warnings.length === 0) {
    ok('no blocked-field overrides detected');
  } else {
    const stripCount = warnings.filter(w => w.severity === 'strip').length;
    const warnCount = warnings.filter(w => w.severity === 'warn').length;
    if (stripCount > 0) {
      fail(`${stripCount} blocked-field overrides STRIPPED from the global layer`);
      for (const w of warnings.filter(w => w.severity === 'strip')) {
        hint(`${w.specialist}: ${w.field} = ${JSON.stringify(w.value)}  ${dim('(source: global, stripped)')}`);
      }
      fix(`remove blocked fields from ${globalLayer.path}`);
    }
    if (warnCount > 0) {
      warn(`${warnCount} blocked-field overrides present in repo layers (v1: applied with warning)`);
      for (const w of warnings.filter(w => w.severity === 'warn')) {
        hint(`${w.specialist}: ${w.field} = ${JSON.stringify(w.value)}  ${dim(`(source: ${w.source})`)}`);
      }
    }
  }

  // Health = no missing-with-config + no strip warnings. Fresh install (no file) is a notice, not a fail.
  const stripFailures = warnings.filter(w => w.severity === 'strip').length;
  const missingFailures = globalLayer.exists ? missing.length : 0;
  return stripFailures === 0 && missingFailures === 0;
}

function renderDriftTable(root: string, json = false): void {
  const report = detectDriftUnderRoot(root);
  if (json) {
    process.stdout.write(`${JSON.stringify({ drift_findings: report.repos.flatMap((repo) => repo.findings) }, null, 2)}\n`);
    return;
  }
  console.log(`\n${bold('specialists doctor drift')}\n`);
  if (report.summary.findings === 0) {
    ok('No drift found');
    return;
  }
  for (const repo of report.repos) {
    console.log(`Repo: ${repo.root}`);
    for (const finding of repo.findings) {
      const status = finding.status.replaceAll('-', ' ');
      console.log(`  ${finding.kind} ${finding.scope} | ${status} | ${finding.path}`);
      console.log(`    action: ${finding.suggested_action}`);
      console.log(`    cmd: ${finding.suggestion_command}`);
    }
  }
  console.log(`Summary: ${report.summary.findings} findings across ${report.summary.repos} repo${report.summary.repos === 1 ? '' : 's'}`);
}

export function parseVersionTuple(value: string): [number, number, number] | null {
  const normalized = value.trim().replace(/^v/i, '');
  const match = normalized.match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function compareVersions(left: string, right: string): number {
  const leftTuple = parseVersionTuple(left);
  const rightTuple = parseVersionTuple(right);
  if (!leftTuple || !rightTuple) return 0;

  for (let index = 0; index < 3; index += 1) {
    if (leftTuple[index] > rightTuple[index]) return 1;
    if (leftTuple[index] < rightTuple[index]) return -1;
  }

  return 0;
}

export function setStatusError(statusPath: string): void {
  try {
    const raw = readFileSync(statusPath, 'utf8');
    const status = JSON.parse(raw) as Record<string, unknown>;
    status.status = 'error';
    writeFileSync(statusPath, `${JSON.stringify(status, null, 2)}\n`, 'utf8');
  } catch {
    // best-effort repair for corrupt status files
  }
}

interface CleanupProcessesResult {
  total: number;
  running: number;
  zombies: number;
  updated: number;
  zombieJobIds: string[];
}

function detectJobOutputMode(): 'db-first' | 'file-only' {
  return process.env.SPECIALISTS_JOB_FILE_OUTPUT === 'on' ? 'file-only' : 'db-first';
}

export function cleanupProcesses(jobsDir: string, dryRun: boolean): CleanupProcessesResult {
  const outputMode = detectJobOutputMode();
  const sqliteClient = outputMode === 'db-first' ? createObservabilitySqliteClient() : null;
  if (sqliteClient) {
    const result: CleanupProcessesResult = {
      total: 0,
      running: 0,
      zombies: 0,
      updated: 0,
      zombieJobIds: [] as string[],
    };

    const statuses = sqliteClient.listStatuses();
    for (const status of statuses) {
      if (status.status !== 'running' && status.status !== 'starting') continue;
      result.total += 1;
      if (status.pid && process.kill(status.pid, 0)) {
        result.running += 1;
        continue;
      }

      result.zombies += 1;
      result.zombieJobIds.push(status.id);
      if (!dryRun) {
        const updatedStatus = { ...status, status: 'error' as const };
        sqliteClient.upsertStatus(updatedStatus);
        result.updated += 1;
      }
    }

    return result;
  }

  let entries: string[];
  try { entries = readdirSync(jobsDir); } catch { entries = []; }

  const result: CleanupProcessesResult = {
    total: 0,
    running: 0,
    zombies: 0,
    updated: 0,
    zombieJobIds: [],
  };

  for (const jobId of entries) {
    const statusPath = join(jobsDir, jobId, 'status.json');
    if (!existsSync(statusPath)) continue;

    try {
      const status = JSON.parse(readFileSync(statusPath, 'utf8')) as { status?: string; pid?: number };
      result.total += 1;
      if (status.status !== 'running' && status.status !== 'starting') continue;
      if (!status.pid) continue;

      try {
        process.kill(status.pid, 0);
        result.running += 1;
      } catch {
        result.zombies += 1;
        result.zombieJobIds.push(jobId);
        if (!dryRun) {
          setStatusError(statusPath);
          result.updated += 1;
        }
      }
    } catch {
      continue;
    }
  }

  return result;
}

export function renderProcessSummary(result: CleanupProcessesResult, dryRun: boolean): string {
  if (result.zombies === 0) {
    const detail = result.running > 0 ? `, ${result.running} currently running` : ', none currently running';
    return `${result.total} job${result.total !== 1 ? 's' : ''} checked${detail}`;
  }

  const action = dryRun ? 'would be marked error' : 'marked error';
  return `${result.zombies} zombie job${result.zombies === 1 ? '' : 's'} found (${result.updated} ${action})`;
}

function runDoctorOrphans(): void {
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

    const renderGroup = (label: string, rows: typeof findings): void => {
      if (rows.length === 0) return;
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
  } finally {
    sqliteClient.close();
  }
}

function resolveWatchdogMode(): string {
  const fileOutput = String(process.env.SPECIALISTS_JOB_FILE_OUTPUT ?? '').trim().toLowerCase();
  if (fileOutput === 'off') return 'db';
  if (process.execPath.endsWith('/bun')) return 'db';
  return 'file (degraded; Bun unavailable)';
}

function checkZombieJobs(): boolean {
  section('Background jobs');
  hint(`watchdog mode: ${resolveWatchdogMode()}`);
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

export async function run(argv: readonly string[] = process.argv.slice(3)): Promise<void> {
  const subcommand = argv[0];
  if (subcommand === 'orphans') {
    runDoctorOrphans();
    return;
  }

  const opts = parseDoctorArgs(argv);
  if (opts.drift) {
    renderDriftTable(opts.root ?? process.cwd(), opts.json);
    return;
  }

  if (opts.specialists) {
    // KAN-90 / unitAI-1gtou.14: focused override-layer health view.
    console.log(`\n${bold('specialists doctor --specialists')}\n`);
    const overridesOk = await checkSpecialistOverrides();
    console.log('');
    process.exitCode = overridesOk ? 0 : 1;
    return;
  }

  if (subcommand && subcommand !== '--help' && subcommand !== '-h' && !subcommand.startsWith('--')) {
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
  const versionOk = checkVersion();
  const skillDriftOk = checkSkillDrift();
  const mirrorOk = checkManagedAssetMirrors();
  const userOverlayOk = checkUserOverlayDrift();
  const dirsOk = checkRuntimeDirs();
  const jobsOk = checkZombieJobs();
  const fragmentsOk = checkClaudeMdFragments();
  const overridesOk = await checkSpecialistOverrides();

  const allOk = piOk && spOk && bdOk && xtOk && hooksOk && mcpOk && versionOk && skillDriftOk && mirrorOk && userOverlayOk && dirsOk && jobsOk && fragmentsOk && overridesOk;
  console.log('');
  if (allOk) {
    console.log(`  ${green('✓')} ${bold('All checks passed')}  — specialists is healthy`);
  } else {
    console.log(`  ${yellow('○')} ${bold('Some checks failed')}  — follow the fix hints above`);
    console.log(`  ${dim('specialists init fixes hook + MCP registration; specialists init --sync-skills fixes skill drift/symlink issues; sp prune-stale-defaults --apply removes stale default mirrors; --sync-defaults is deprecated.')}`);
  }
  console.log('');
}
