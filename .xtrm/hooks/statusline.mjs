#!/usr/bin/env node
// statusline.mjs — Claude Code statusLine for xt claude sessions
// Line 1: ~/path (branch *+↑)
// Line 2: XX%/window (provider) model
// Line 3: ◐ claim-title OR ○ N open

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, basename, relative, dirname, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';

let ctx = {};
try { ctx = JSON.parse(readFileSync(0, 'utf8')); } catch {}

const cwd = ctx?.workspace?.current_dir ?? process.cwd();
const cacheKey = createHash('md5').update(cwd).digest('hex').slice(0, 8);
const CACHE_FILE = join(tmpdir(), `xtrm-sl-${cacheKey}.json`);
const CACHE_TTL = 5000;

function run(cmd) {
  try { return execSync(cmd, { encoding: 'utf8', cwd, stdio: ['pipe', 'pipe', 'pipe'], timeout: 2000 }).trim(); } catch { return null; }
}

function getCached() {
  try { const c = JSON.parse(readFileSync(CACHE_FILE, 'utf8')); if (Date.now() - c.ts < CACHE_TTL) return c.data; } catch {}
  return null;
}

function setCache(data) { try { writeFileSync(CACHE_FILE, JSON.stringify({ ts: Date.now(), data })); } catch {} }

const R = '\x1b[0m', B = '\x1b[1m', B_ = '\x1b[22m', D = '\x1b[2m', I = '\x1b[3m', I_ = '\x1b[23m';

function formatTokens(count) {
  if (count < 1000) return count.toString();
  if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
  if (count < 1000000) return `${Math.round(count / 1000)}k`;
  if (count < 10000000) return `${(count / 1000000).toFixed(1)}M`;
  return `${Math.round(count / 1000000)}M`;
}

function getProvider(modelId) {
  if (!modelId) return null;
  if (modelId.includes('/')) return modelId.split('/')[0];
  return null;
}

function getModelName(modelId) {
  if (!modelId) return null;
  if (modelId.includes('/')) return modelId.split('/')[1];
  return modelId;
}

const pct = ctx?.context_window?.used_percentage;
const windowSize = ctx?.context_window?.context_window_size ?? 200000;

let data = getCached();
if (!data) {
  const repoRoot = run('git rev-parse --show-toplevel');
  const gitCommonDir = run('git rev-parse --git-common-dir');
  const mainRoot = (gitCommonDir && isAbsolute(gitCommonDir)) ? dirname(gitCommonDir) : (repoRoot || cwd);
  let displayDir;
  if (repoRoot) {
    const rel = relative(repoRoot, cwd) || '.';
    displayDir = rel === '.' ? basename(repoRoot) : `${basename(repoRoot)}/${rel}`;
  } else {
    displayDir = cwd.replace(process.env.HOME ?? '', '~');
  }

  let branch = null, gitFlags = '';
  if (repoRoot) {
    branch = run('git -c core.useBuiltinFSMonitor=false branch --show-current') || run('git rev-parse --short HEAD');
    const porcelain = run('git -c core.useBuiltinFSMonitor=false --no-optional-locks status --porcelain') ?? '';
    let modified = false, staged = false, deleted = false;
    for (const l of porcelain.split('\n').filter(Boolean)) {
      if (/^ M|^AM|^MM/.test(l)) modified = true;
      if (/^A |^M /.test(l)) staged = true;
      if (/^ D|^D /.test(l)) deleted = true;
    }
    gitFlags = (modified ? '*' : '') + (staged ? '+' : '') + (deleted ? '-' : '');
    const ab = run('git -c core.useBuiltinFSMonitor=false --no-optional-locks rev-list --left-right --count @{upstream}...HEAD');
    if (ab) {
      const [behind, ahead] = ab.split(/\s+/).map(Number);
      if (ahead > 0 && behind > 0) gitFlags += '↕';
      else if (ahead > 0) gitFlags += '↑';
      else if (behind > 0) gitFlags += '↓';
    }
  }

  const modelId = ctx?.model?.id ?? null;
  const modelDisplayName = ctx?.model?.display_name ?? null;
  const provider = getProvider(modelId);
  const modelName = modelDisplayName ?? getModelName(modelId) ?? null;

  let claims = [], openCount = 0;
  if (existsSync(join(cwd, '.beads')) || existsSync(join(mainRoot, '.beads'))) {
    const inProgressRaw = run('bd list --status=in_progress') ?? '';
    const ids = [...new Set(
      [...inProgressRaw.matchAll(/^[◐]\s+([a-z][\w-]+)/gm)]
        .map(m => m[1]).filter(id => id.includes('-'))
    )];
    if (ids.length === 1) {
      try {
        const raw = run(`bd show ${ids[0]} --json`);
        const issue = raw ? JSON.parse(raw)?.[0] : null;
        if (issue) claims.push({ id: ids[0], title: issue.title ?? null, status: issue.status ?? 'in_progress' });
      } catch {}
    } else if (ids.length > 1) {
      claims = ids.map(id => ({ id, title: null, status: 'in_progress' }));
    }
    if (claims.length === 0) {
      const m = run('bd list')?.match(/\((\d+)\s+open/);
      if (m) openCount = parseInt(m[1], 10);
    }
  }

  data = { displayDir, branch, gitFlags, provider, modelName, claims, openCount };
  setCache(data);
}

const { displayDir, branch, gitFlags, provider, modelName, claims, openCount } = data;

// Line 1: ~/path (branch *+↑)
let line1 = B + displayDir + B_;
if (branch) { const b = gitFlags ? `${branch} ${gitFlags}` : branch; line1 += ` ${D}(${b})${R}`; }

// Line 2: XX%/window (provider) model
const pctStr = pct != null ? `${pct.toFixed(1)}%` : '?';
const ctxStr = `${pctStr}/${formatTokens(windowSize)}`;
let modelStr = modelName ?? 'no-model';
if (provider) modelStr = `(${provider}) ${modelStr}`;
const line2 = `${D}${ctxStr}${R} ${D}${modelStr}${R}`;

// Line 3: beads chip
let line3;
if (claims.length === 0) {
  line3 = `○ ${openCount > 0 ? `${B}${openCount}${B_} open` : 'no open issues'}`;
} else if (claims.length === 1) {
  const { id, title, status } = claims[0];
  const icon = status === 'blocked' ? '●' : status === 'in_progress' ? '◐' : '○';
  const shortId = id.split('-').pop();
  const cols = process.stdout.columns || 80;
  const prefix = `${icon} ${shortId} `;
  const max = Math.min(cols - prefix.length - 1, 40);
  const t = title ? (title.length > max ? title.slice(0, max - 1) + '…' : title) : '';
  line3 = `${prefix}${I}${t}${I_}`;
} else {
  const chips = claims.map(({ id, status }) => {
    const icon = status === 'blocked' ? '●' : '◐';
    return `${icon} ${id.split('-').pop()}`;
  });
  line3 = chips.join('  ');
}

process.stdout.write(`${line1}\n${line2}\n${line3}\n`);
process.exit(0);
