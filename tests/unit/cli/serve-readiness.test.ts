import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createReadinessState,
  recordAuditFailure,
  evaluateReadiness,
} from '../../../src/cli/serve.js';

const VALID_SPEC = JSON.stringify({
  specialist: {
    metadata: { name: 'echo', version: '1.0.0', description: 'echo', category: 'test' },
    execution: {
      mode: 'auto',
      model: 'mock/model',
      timeout_ms: 1000,
      interactive: false,
      response_format: 'json',
      output_type: 'custom',
      permission_required: 'READ_ONLY',
      requires_worktree: false,
      max_retries: 0,
    },
    prompt: { task_template: 'say hi to $name', output_schema: { type: 'object', required: ['message'] }, examples: [] },
    skills: {},
  },
});

describe('serve readiness', () => {
  let tempRoot: string;
  let dbPath: string;
  let piConfigPath: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'serve-readiness-'));
    mkdirSync(join(tempRoot, '.specialists', 'user'), { recursive: true });
    dbPath = join(tempRoot, 'observability.db');
    writeFileSync(dbPath, '');
    piConfigPath = join(tempRoot, 'auth.json');
    writeFileSync(piConfigPath, '{}');
    writeFileSync(join(tempRoot, '.specialists', 'user', 'echo.specialist.json'), VALID_SPEC);
  });

  afterEach(() => {
    try { chmodSync(dbPath, 0o644); } catch { /* ignore */ }
    rmSync(tempRoot, { recursive: true, force: true });
  });

  const baseOpts = (state = createReadinessState()) => ({
    state,
    projectDir: tempRoot,
    dbPath,
    piConfigPath,
    auditFailureThreshold: 5,
  });

  it('returns ready when all checks pass', async () => {
    const result = await evaluateReadiness(baseOpts());
    expect(result).toEqual({ ready: true });
  });

  it('returns draining when shutdown flag set', async () => {
    const state = createReadinessState();
    state.shuttingDown = true;
    const result = await evaluateReadiness(baseOpts(state));
    expect(result).toEqual({ ready: false, reason: 'draining' });
  });

  it('returns degraded:audit when failure rate exceeds threshold', async () => {
    const state = createReadinessState();
    for (let i = 0; i < 6; i++) recordAuditFailure(state, Date.now());
    const result = await evaluateReadiness({ ...baseOpts(state), auditFailureThreshold: 5 });
    expect(result).toEqual({ ready: false, reason: 'degraded:audit' });
  });

  it('audit failures outside the 60s window do not count', async () => {
    const state = createReadinessState();
    const oldTimestamp = Date.now() - 120_000;
    for (let i = 0; i < 10; i++) recordAuditFailure(state, oldTimestamp);
    const result = await evaluateReadiness(baseOpts(state));
    expect(result).toEqual({ ready: true });
  });

  it('returns pi_config_unreadable when pi auth file missing', async () => {
    rmSync(piConfigPath);
    const result = await evaluateReadiness(baseOpts());
    expect(result).toEqual({ ready: false, reason: 'pi_config_unreadable' });
  });

  it('returns db_not_writable when DB file is not writable', async () => {
    chmodSync(dbPath, 0o444);
    const result = await evaluateReadiness(baseOpts());
    expect(result).toEqual({ ready: false, reason: 'db_not_writable' });
  });

  it('returns empty_user_dir when user dir has no spec files', async () => {
    rmSync(join(tempRoot, '.specialists', 'user'), { recursive: true });
    mkdirSync(join(tempRoot, '.specialists', 'user'), { recursive: true });
    const result = await evaluateReadiness(baseOpts());
    expect(result).toEqual({ ready: false, reason: 'empty_user_dir' });
  });

  it('returns empty_user_dir when user dir does not exist', async () => {
    rmSync(join(tempRoot, '.specialists', 'user'), { recursive: true });
    const result = await evaluateReadiness(baseOpts());
    expect(result).toEqual({ ready: false, reason: 'empty_user_dir' });
  });

  it('returns invalid_spec_in_user_dir when all specs fail to parse', async () => {
    rmSync(join(tempRoot, '.specialists', 'user', 'echo.specialist.json'));
    writeFileSync(join(tempRoot, '.specialists', 'user', 'broken.specialist.json'), '{not json');
    const result = await evaluateReadiness(baseOpts());
    expect(result).toEqual({ ready: false, reason: 'invalid_spec_in_user_dir' });
  });

  it('returns ready when at least one spec is valid', async () => {
    writeFileSync(join(tempRoot, '.specialists', 'user', 'broken.specialist.json'), '{not json');
    const result = await evaluateReadiness(baseOpts());
    expect(result).toEqual({ ready: true });
  });

  it('draining takes precedence over other failures', async () => {
    rmSync(piConfigPath);
    const state = createReadinessState();
    state.shuttingDown = true;
    const result = await evaluateReadiness(baseOpts(state));
    expect(result).toEqual({ ready: false, reason: 'draining' });
  });

  it('degraded:audit takes precedence over pi/db/user-dir checks', async () => {
    rmSync(piConfigPath);
    const state = createReadinessState();
    for (let i = 0; i < 6; i++) recordAuditFailure(state);
    const result = await evaluateReadiness({ ...baseOpts(state), auditFailureThreshold: 5 });
    expect(result).toEqual({ ready: false, reason: 'degraded:audit' });
  });

  it('recordAuditFailure increments dbWriteFailuresTotal', () => {
    const state = createReadinessState();
    expect(state.dbWriteFailuresTotal).toBe(0);
    recordAuditFailure(state);
    recordAuditFailure(state);
    expect(state.dbWriteFailuresTotal).toBe(2);
  });
});
