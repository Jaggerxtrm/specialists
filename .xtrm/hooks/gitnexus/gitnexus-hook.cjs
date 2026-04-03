#!/usr/bin/env node
/**
 * GitNexus Claude Code Hook — PostToolUse enrichment
 *
 * Fires AFTER Bash/Grep/Read/Glob/Serena tools complete.
 * Extracts patterns from both tool input AND output, runs
 * `gitnexus augment <pattern>`, and injects a [GitNexus: ...]
 * block into Claude's context — mirroring pi-gitnexus behavior.
 *
 * Features:
 *  - PostToolUse (vs old PreToolUse) — enriches actual result
 *  - Session-keyed dedup cache (/tmp) — no redundant lookups
 *  - Pattern extraction from output content (grep-style scanning)
 *  - Serena tool support — extracts symbol names from name_path
 *  - Graceful failure — always exits 0
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const CODE_EXTS = new Set([
  '.ts', '.tsx', '.js', '.mjs', '.cjs', '.py', '.go', '.rs',
  '.java', '.kt', '.cpp', '.c', '.h', '.rb', '.php', '.cs',
]);

const SERENA_SYMBOL_TOOLS = new Set([
  'mcp__serena__find_symbol',
  'mcp__serena__find_referencing_symbols',
  'mcp__serena__replace_symbol_body',
  'mcp__serena__insert_after_symbol',
  'mcp__serena__insert_before_symbol',
]);

const SERENA_FILE_TOOLS = new Set([
  'mcp__serena__get_symbols_overview',
  'mcp__serena__search_for_pattern',
]);

const SERENA_RENAME = 'mcp__serena__rename_symbol';

function readInput() {
  try {
    return JSON.parse(fs.readFileSync(0, 'utf-8'));
  } catch {
    return {};
  }
}

function findGitNexusIndex(startDir) {
  let dir = startDir || process.cwd();
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(dir, '.gitnexus'))) return true;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return false;
}

function getCacheFile(sessionId) {
  const id = sessionId ? sessionId.replace(/[^a-zA-Z0-9_-]/g, '_') : 'default';
  return path.join(os.tmpdir(), `gitnexus-aug-${id}`);
}

function loadCache(cacheFile) {
  try {
    return new Set(fs.readFileSync(cacheFile, 'utf-8').split('\n').filter(Boolean));
  } catch {
    return new Set();
  }
}

function saveToCache(cacheFile, pattern) {
  try {
    fs.appendFileSync(cacheFile, pattern + '\n');
  } catch { /* graceful */ }
}

function symbolFromNamePath(namePath) {
  if (!namePath) return null;
  const parts = namePath.split('/').filter(Boolean);
  const last = parts[parts.length - 1];
  return last ? last.replace(/\[\d+\]$/, '') : null;
}

function symbolFromFilePath(filePath) {
  if (!filePath) return null;
  const ext = path.extname(filePath);
  if (!CODE_EXTS.has(ext)) return null;
  return path.basename(filePath, ext);
}

function extractFilePatternsFromOutput(content) {
  if (!content || typeof content !== 'string') return [];
  const patterns = new Set();
  const lines = content.split('\n').slice(0, 50);
  for (const line of lines) {
    const m = line.match(/^([^\s:]+\.[a-z]{1,5}):\d+:/);
    if (m) {
      const ext = path.extname(m[1]);
      if (CODE_EXTS.has(ext)) patterns.add(path.basename(m[1], ext));
    }
  }
  return [...patterns];
}

function extractPatterns(toolName, toolInput, toolResponse) {
  const patterns = [];
  const content = typeof toolResponse === 'string'
    ? toolResponse
    : (toolResponse?.content ?? toolResponse?.output ?? '');

  if (toolName === 'Read') {
    const sym = symbolFromFilePath(toolInput.file_path);
    if (sym) patterns.push(sym);
  }

  if (toolName === 'Grep') {
    const raw = toolInput.pattern || '';
    const cleaned = raw.replace(/[.*+?^${}()|[\]\\]/g, '').trim();
    if (cleaned.length >= 3) patterns.push(cleaned);
    patterns.push(...extractFilePatternsFromOutput(content));
  }

  if (toolName === 'Glob') {
    const raw = toolInput.pattern || '';
    const m = raw.match(/([a-zA-Z][a-zA-Z0-9_-]{2,})/);
    if (m) patterns.push(m[1]);
    patterns.push(...extractFilePatternsFromOutput(
      Array.isArray(toolResponse) ? toolResponse.join('\n') : String(toolResponse || '')
    ));
  }

  if (toolName === 'Bash') {
    const cmd = toolInput.command || '';
    if (!/\brg\b|\bgrep\b/.test(cmd)) return [];
    const tokens = cmd.split(/\s+/);
    let foundCmd = false, skipNext = false;
    const flagsWithValues = new Set(['-e','-f','-m','-A','-B','-C','-g','--glob','-t','--type','--include','--exclude']);
    for (const token of tokens) {
      if (skipNext) { skipNext = false; continue; }
      if (!foundCmd) { if (/\brg$|\bgrep$/.test(token)) foundCmd = true; continue; }
      if (token.startsWith('-')) { if (flagsWithValues.has(token)) skipNext = true; continue; }
      const cleaned = token.replace(/['"]/g, '').replace(/[.*+?^${}()|[\]\\]/g, '').trim();
      if (cleaned.length >= 3) { patterns.push(cleaned); break; }
    }
    patterns.push(...extractFilePatternsFromOutput(content));
  }

  if (SERENA_SYMBOL_TOOLS.has(toolName)) {
    const sym = symbolFromNamePath(toolInput.name_path_pattern || toolInput.name_path);
    if (sym) patterns.push(sym);
  }

  if (toolName === SERENA_RENAME) {
    if (toolInput.symbol_name) patterns.push(toolInput.symbol_name);
  }

  if (SERENA_FILE_TOOLS.has(toolName)) {
    const sym = symbolFromFilePath(toolInput.relative_path || toolInput.file_path);
    if (sym) patterns.push(sym);
    const sub = toolInput.substring || toolInput.pattern || '';
    const cleaned = sub.replace(/[.*+?^${}()|[\]\\]/g, '').trim();
    if (cleaned.length >= 3) patterns.push(cleaned);
  }

  return [...new Set(patterns.filter(p => p && p.length >= 3))];
}

function runAugment(pattern, cwd) {
  try {
    const child = spawnSync('gitnexus', ['augment', pattern], {
      encoding: 'utf-8',
      timeout: 8000,
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return (child.stderr || '').trim();
  } catch {
    return '';
  }
}

function main() {
  try {
    const input = readInput();
    if (input.hook_event_name !== 'PostToolUse') return;

    const cwd = input.cwd || process.cwd();
    if (!findGitNexusIndex(cwd)) return;

    const toolName = input.tool_name || '';
    const toolInput = input.tool_input || {};
    const toolResponse = input.tool_response ?? input.tool_result ?? '';

    const patterns = extractPatterns(toolName, toolInput, toolResponse);
    if (patterns.length === 0) return;

    const cacheFile = getCacheFile(input.session_id);
    const cache = loadCache(cacheFile);

    const results = [];
    for (const pattern of patterns) {
      if (cache.has(pattern)) continue;
      const out = runAugment(pattern, cwd);
      saveToCache(cacheFile, pattern);
      if (out) results.push(out);
    }

    if (results.length > 0) {
      process.stdout.write('[GitNexus]\n' + results.join('\n\n') + '\n');
    }
  } catch (err) {
    process.stderr.write('GitNexus hook error: ' + err.message + '\n');
  }
}

main();
