// Telemetry redaction matrix for sp console v2 (unitAI-ctb4u.11).
//
// Every NDJSON envelope emitted by `logError` is asserted to:
//   1. Contain ONLY the documented schema keys (no rogue additions).
//   2. NEVER contain forbidden patterns: model IDs, bead bodies, file paths,
//      payload/stdout/stderr text, prompts, credentials.
//   3. Rate-limit duplicates so a repeating error never floods.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  logError,
  resetLogErrorMemo,
  type ConsoleErrorOp,
  type ConsoleView,
} from '../../../src/cli/console/log.js';

const ALLOWED_KEYS = new Set([
  'ts',
  'component',
  'view',
  'op',
  'exitCode',
  'durationMs',
  'errorClass',
  // Optional fields, only present when provided by the caller.
  'step',
  'beadId',
]);

const FORBIDDEN_SUBSTRINGS = [
  'payload',
  'stdout',
  'stderr',
  'prompt',
  'model_output',
  'tool_call_id',
  'raw_command',
  '/home/',
  '/Users/',
  'anthropic/',
  'openai-codex/',
];

describe('NDJSON envelope shape', () => {
  let writes: string[];

  beforeEach(() => {
    writes = [];
    resetLogErrorMemo();
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk: any) => {
      writes.push(typeof chunk === 'string' ? chunk : chunk.toString());
      return true;
    });
  });

  afterEach(() => vi.restoreAllMocks());

  const OPS: ConsoleErrorOp[] = [
    'bd_show',
    'git_diff',
    'git_numstat',
    'git_status',
    'merge_base',
    'subscribe_feed',
    'list_processes',
    'read_global_config',
    'write_global_config',
    'editor_spawn',
    'render',
  ];

  const VIEWS: ConsoleView[] = ['ps', 'feed', 'job', 'bead', 'diff', 'config', 'result'];

  it('every (view, op) combination emits a well-formed envelope', () => {
    for (const view of VIEWS) {
      for (const op of OPS) {
        writes.length = 0;
        resetLogErrorMemo();
        logError(view, op, { errorClass: 'X', exitCode: 1, durationMs: 10 });
        expect(writes.length).toBe(1);
        const parsed = JSON.parse(writes[0]!.trim());
        for (const key of Object.keys(parsed)) expect(ALLOWED_KEYS.has(key)).toBe(true);
        expect(parsed.component).toBe('sp-console');
        expect(parsed.view).toBe(view);
        expect(parsed.op).toBe(op);
        expect(parsed.errorClass).toBe('X');
      }
    }
  });

  it('no envelope contains forbidden substrings (negative sweep)', () => {
    resetLogErrorMemo();
    writes.length = 0;
    logError('bead', 'bd_show', { errorClass: 'parse_error', exitCode: 1, durationMs: 12 });
    logError('config', 'write_global_config', { errorClass: 'EACCES' });
    logError('diff', 'git_diff', { errorClass: 'ENOENT' });
    for (const w of writes) {
      for (const forbidden of FORBIDDEN_SUBSTRINGS) {
        expect(w).not.toContain(forbidden);
      }
    }
  });

  it('rate-limit dedupes a repeated (view, op, errorClass) tuple across 1000 calls', () => {
    for (let i = 0; i < 1000; i += 1) {
      logError('ps', 'list_processes', { errorClass: 'ENOENT' });
    }
    expect(writes.length).toBe(1);
  });

  it('omitted exitCode/durationMs serialize as null (not the raw value)', () => {
    logError('feed', 'subscribe_feed', { errorClass: 'EPIPE' });
    const parsed = JSON.parse(writes[0]!.trim());
    expect(parsed.exitCode).toBeNull();
    expect(parsed.durationMs).toBeNull();
  });

  it('different errorClass values for the same op log separately', () => {
    logError('diff', 'git_diff', { errorClass: 'EACCES' });
    logError('diff', 'git_diff', { errorClass: 'ENOENT' });
    expect(writes.length).toBe(2);
  });

  // ---------- unitAI-21sn4 regressions ----------

  it('step field appears in envelope and isolates dedupe per step (unitAI-21sn4)', () => {
    logError('config', 'read_global_config', { step: 'read', errorClass: 'ENOENT' });
    logError('config', 'read_global_config', { step: 'parse', errorClass: 'ENOENT' });
    logError('config', 'read_global_config', { step: 'parse', errorClass: 'ENOENT' });
    expect(writes.length).toBe(2);
    const first = JSON.parse(writes[0]!.trim());
    const second = JSON.parse(writes[1]!.trim());
    expect(first.step).toBe('read');
    expect(second.step).toBe('parse');
    expect(first.view).toBe('config');
  });

  it('beadId field is capped at 24 chars (unitAI-21sn4)', () => {
    const longBead = 'a'.repeat(64);
    logError('bead', 'bd_show', { beadId: longBead, errorClass: 'parse_error' });
    const parsed = JSON.parse(writes[0]!.trim());
    expect(parsed.beadId.length).toBe(24);
    expect(parsed.beadId).toBe('a'.repeat(24));
  });

  it('beadId field omitted when not provided (unitAI-21sn4)', () => {
    logError('diff', 'git_diff', { errorClass: 'ENOENT' });
    const parsed = JSON.parse(writes[0]!.trim());
    expect(Object.prototype.hasOwnProperty.call(parsed, 'beadId')).toBe(false);
  });

  it('every envelope carries the view field (unitAI-21sn4)', () => {
    logError('diff', 'git_numstat', { errorClass: 'ENOENT' });
    logError('bead', 'bd_show', { beadId: 'unitAI-test', errorClass: 'exit:1' });
    logError('config', 'read_global_config', { step: 'read', errorClass: 'EACCES' });
    logError('config', 'write_global_config', { errorClass: 'EACCES' });
    for (const w of writes) {
      const parsed = JSON.parse(w.trim());
      expect(typeof parsed.view).toBe('string');
      expect(parsed.view.length).toBeGreaterThan(0);
    }
  });

  it('burst of 50 identical git failures emits 1 envelope (unitAI-21sn4)', () => {
    for (let i = 0; i < 50; i += 1) {
      logError('diff', 'git_numstat', { exitCode: 127, durationMs: 1, errorClass: 'exit:127' });
    }
    expect(writes.length).toBe(1);
  });
});
