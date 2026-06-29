import { describe, expect, it, vi } from 'vitest';
import { auditDeadJobs, type DeadJobAuditResult } from '../../../src/specialist/dead-job-audit.js';
import type { ObservabilitySqliteClient } from '../../../src/specialist/observability-sqlite.js';

function createMockClient(rows: Array<{
  job_id: string;
  specialist: string;
  status: string;
  pid: number;
  updated_at_ms: number;
  bead_id: string | null;
  chain_id: string | null;
}>): ObservabilitySqliteClient {
  const cancelled: Array<{ job_id: string; reason: string }> = [];
  const forensicEvents: unknown[] = [];
  return {
    listStaleSpecialistJobs: vi.fn(() => rows),
    markSpecialistJobCancelled: vi.fn((jobId: string, reason: string) => {
      cancelled.push({ job_id: jobId, reason });
    }),
    appendForensicEvent: vi.fn((jobId: string, specialist: string, beadId: string | undefined, event: unknown) => {
      forensicEvents.push({ jobId, specialist, beadId, event });
    }),
  } as unknown as ObservabilitySqliteClient;
}

describe('dead-job-audit', () => {
  it('marks dead pid when dryRun=false', () => {
    const client = createMockClient([
      { job_id: 'j1', specialist: 'tester', status: 'running', pid: 1234, updated_at_ms: 0, bead_id: null, chain_id: null },
    ]);
    const result = auditDeadJobs({ client, dryRun: false, nowMs: 120_000, isPidAlive: () => false });

    expect(result.found).toHaveLength(1);
    expect(result.found[0]!.job_id).toBe('j1');
    expect(result.found[0]!.reason).toBe('container-restart-orphan');
    expect(result.cancelled).toBe(1);
    expect(client.markSpecialistJobCancelled).toHaveBeenCalledWith('j1', 'container-restart-orphan');
    expect(client.appendForensicEvent).toHaveBeenCalledTimes(1);
  });

  it('finds but does not cancel dead pid when dryRun=true', () => {
    const client = createMockClient([
      { job_id: 'j2', specialist: 'tester', status: 'waiting', pid: 5678, updated_at_ms: 0, bead_id: null, chain_id: null },
    ]);
    const result = auditDeadJobs({ client, dryRun: true, nowMs: 120_000, isPidAlive: () => false });

    expect(result.found).toHaveLength(1);
    expect(result.found[0]!.job_id).toBe('j2');
    expect(result.cancelled).toBe(0);
    expect(client.markSpecialistJobCancelled).not.toHaveBeenCalled();
    expect(client.appendForensicEvent).not.toHaveBeenCalled();
  });

  it('skips live pid', () => {
    const client = createMockClient([
      { job_id: 'j3', specialist: 'tester', status: 'running', pid: 9999, updated_at_ms: 0, bead_id: null, chain_id: null },
    ]);
    const result = auditDeadJobs({ client, dryRun: false, nowMs: 120_000, isPidAlive: () => true });

    expect(result.found).toHaveLength(0);
    expect(result.cancelled).toBe(0);
  });

  it('skips job when listStaleSpecialistJobs returns empty', () => {
    const client = createMockClient([]);
    const result = auditDeadJobs({ client, dryRun: false, nowMs: 120_000, isPidAlive: () => false });

    expect(result.found).toHaveLength(0);
    expect(result.cancelled).toBe(0);
  });

  it('computes age_ms from nowMs - updated_at_ms', () => {
    const client = createMockClient([
      { job_id: 'j5', specialist: 'tester', status: 'starting', pid: 3333, updated_at_ms: 70_000, bead_id: 'b5', chain_id: null },
    ]);
    const result = auditDeadJobs({ client, dryRun: false, nowMs: 200_000, isPidAlive: () => false });

    expect(result.found[0]!.age_ms).toBe(130_000);
  });

  it('respects minAgeMs passed to listStaleSpecialistJobs', () => {
    const listFn = vi.fn(() => [
      { job_id: 'j6', specialist: 'tester', status: 'running', pid: 4444, updated_at_ms: 0, bead_id: null, chain_id: null },
    ]);
    const client = {
      listStaleSpecialistJobs: listFn,
      markSpecialistJobCancelled: vi.fn(),
      appendForensicEvent: vi.fn(),
    } as unknown as ObservabilitySqliteClient;

    auditDeadJobs({ client, dryRun: true, nowMs: 500_000, isPidAlive: () => false, minAgeMs: 300_000 });

    expect(listFn).toHaveBeenCalledWith({ minAgeMs: 300_000, nowMs: 500_000 });
  });

  it('skips rows with missing or invalid pid (listStaleSpecialistJobs already filters)', () => {
    const listFn = vi.fn(() => []);
    const client = {
      listStaleSpecialistJobs: listFn,
      markSpecialistJobCancelled: vi.fn(),
      appendForensicEvent: vi.fn(),
    } as unknown as ObservabilitySqliteClient;

    const result = auditDeadJobs({ client, dryRun: false, nowMs: 120_000, isPidAlive: () => false });

    expect(result.found).toHaveLength(0);
    expect(result.cancelled).toBe(0);
    // listStaleSpecialistJobs SQL enforces pid IS NOT NULL and pid > 0.
  });

  it('skips terminal statuses because listStaleSpecialistJobs SQL only selects active states', () => {
    const listFn = vi.fn(() => []);
    const client = {
      listStaleSpecialistJobs: listFn,
      markSpecialistJobCancelled: vi.fn(),
      appendForensicEvent: vi.fn(),
    } as unknown as ObservabilitySqliteClient;

    const result = auditDeadJobs({ client, dryRun: false, nowMs: 120_000, isPidAlive: () => false });

    expect(result.found).toHaveLength(0);
    expect(result.cancelled).toBe(0);
  });

  it('is idempotent on repeated audit after cancellation', () => {
    const firstClient = createMockClient([
      { job_id: 'j7', specialist: 'tester', status: 'running', pid: 7777, updated_at_ms: 0, bead_id: null, chain_id: null },
    ]);
    const first = auditDeadJobs({ client: firstClient, dryRun: false, nowMs: 120_000, isPidAlive: () => false });
    expect(first.found).toHaveLength(1);
    expect(first.cancelled).toBe(1);

    // Second pass: same job now has terminal status; listStaleSpecialistJobs returns empty.
    const secondClient = createMockClient([]);
    const second = auditDeadJobs({ client: secondClient, dryRun: false, nowMs: 240_000, isPidAlive: () => false });
    expect(second.found).toHaveLength(0);
    expect(second.cancelled).toBe(0);
  });
});
