import { describe, expect, it } from 'vitest';
import {
  initialConsoleState,
  reduceConsoleState,
  type ConsoleState,
} from '../../../src/cli/console/view-model.js';
import { parseBdShowJson } from '../../../src/cli/console/runtime.js';
import { BEAD_ID_RE, type BeadDoc, type LiveStateRows } from '../../../src/cli/console/types.js';

const SGR_RE = /\x1b\[[0-9;]*m/g;
const strip = (s: string): string => s.replace(SGR_RE, '');

function snapshotWithRows(): ConsoleState {
  const state = initialConsoleState();
  return reduceConsoleState(state, {
    type: 'snapshotLoaded',
    snapshot: {
      generatedAtMs: 0,
      repo: { id: 'r', name: 'r', path: '/' },
      filter: { historyMode: 'default', includeCleaned: false, textFilter: '' },
      rows: [
        { kind: 'job', id: 'a', depth: 0, job: { id: 'a', specialist: 'executor', status: 'running', started_at_ms: 0, bead_id: 'unitAI-ctb4u' } as any },
        { kind: 'job', id: 'b', depth: 0, job: { id: 'b', specialist: 'reviewer', status: 'waiting', started_at_ms: 0 } as any },
      ],
      jobs: [],
      totalJobs: 2,
      visibleJobs: 2,
      runningJobs: 1,
      waitingJobs: 1,
      epics: 0,
      nodes: 0,
      worktrees: 0,
      totalTokens: 0,
      health: null,
    },
  });
}

describe('BEAD_ID_RE — argument hygiene', () => {
  it('accepts normal bead ids', () => {
    expect(BEAD_ID_RE.test('unitAI-ctb4u')).toBe(true);
    expect(BEAD_ID_RE.test('unitAI-ctb4u.2')).toBe(true);
    expect(BEAD_ID_RE.test('unitAI-ctb4u.10.3')).toBe(true);
    expect(BEAD_ID_RE.test('beads-xyz9')).toBe(true);
  });

  it('rejects shell-interpolation attempts', () => {
    expect(BEAD_ID_RE.test('; rm -rf /')).toBe(false);
    expect(BEAD_ID_RE.test('unitAI-ctb4u; rm')).toBe(false);
    expect(BEAD_ID_RE.test('$(whoami)')).toBe(false);
    expect(BEAD_ID_RE.test('`evil`')).toBe(false);
    expect(BEAD_ID_RE.test('../../etc/passwd')).toBe(false);
    expect(BEAD_ID_RE.test('')).toBe(false);
  });
});

describe('parseBdShowJson', () => {
  const sample = JSON.stringify({
    id: 'unitAI-ctb4u.2',
    title: 'Phase 1: theme.ts',
    type: 'task',
    priority: 2,
    status: 'closed',
    description: 'PROBLEM\n\ntheme contract...',
    notes: 'D2 RESOLVED: node ▦',
  });

  it('extracts fields and sections from flat bd-show payload', () => {
    const doc = parseBdShowJson('unitAI-ctb4u.2', sample);
    expect(doc.beadId).toBe('unitAI-ctb4u.2');
    expect(doc.fields.find((f) => f.key === 'issue')?.value).toBe('unitAI-ctb4u.2');
    expect(doc.fields.find((f) => f.key === 'title')?.value).toBe('Phase 1: theme.ts');
    expect(doc.fields.find((f) => f.key === 'status')?.value).toBe('closed');
    expect(doc.sections.map((s) => s.title)).toEqual(['description', 'notes']);
    expect(doc.sections[0]?.body).toContain('PROBLEM');
    expect(doc.sections[1]?.body).toContain('D2 RESOLVED');
  });

  it('handles nested `issue` wrapper from bd show --json', () => {
    const wrapped = JSON.stringify({ issue: { id: 'beads-x', title: 'wrapped', description: 'body' } });
    const doc = parseBdShowJson('beads-x', wrapped);
    expect(doc.fields.find((f) => f.key === 'issue')?.value).toBe('beads-x');
    expect(doc.sections.find((s) => s.title === 'description')?.body).toBe('body');
  });

  it('handles array payload (bd show emits array for multi-issue mode)', () => {
    const arr = JSON.stringify([{ id: 'unitAI-a', title: 'arr' }]);
    const doc = parseBdShowJson('unitAI-a', arr);
    expect(doc.fields.find((f) => f.key === 'issue')?.value).toBe('unitAI-a');
  });

  it('returns empty fields for empty payload', () => {
    const doc = parseBdShowJson('beads-x', 'null');
    expect(doc.error).toBeDefined();
  });
});

describe('view-model: bead view transitions preserve ps state', () => {
  it('open(view=bead) sets beadLoading and clears prior bead state', () => {
    const start = snapshotWithRows();
    const opened = reduceConsoleState(start, { type: 'open', view: 'bead', jobId: 'a' });
    expect(opened.view).toBe('bead');
    expect(opened.beadLoading).toBe(true);
    expect(opened.selectedJobId).toBe('a');
  });

  it('beadLoaded action stores doc + live and clears loading', () => {
    const start = reduceConsoleState(snapshotWithRows(), { type: 'open', view: 'bead', jobId: 'a' });
    const doc: BeadDoc = { beadId: 'unitAI-ctb4u', fields: [{ key: 'issue', value: 'unitAI-ctb4u' }], sections: [] };
    const live: LiveStateRows = { rows: [{ key: 'state', value: 'running' }] };
    const next = reduceConsoleState(start, { type: 'beadLoaded', doc, live });
    expect(next.beadLoading).toBe(false);
    expect(next.beadDoc?.beadId).toBe('unitAI-ctb4u');
    expect(next.beadLive?.rows[0]?.value).toBe('running');
  });

  it('back preserves selectedRow from ps (no reset to 0)', () => {
    let state = snapshotWithRows();
    state = reduceConsoleState(state, { type: 'move', delta: 1, viewportRows: 10 });
    expect(state.selectedRow).toBe(1);
    state = reduceConsoleState(state, { type: 'open', view: 'bead', jobId: 'b' });
    expect(state.view).toBe('bead');
    state = reduceConsoleState(state, { type: 'back' });
    expect(state.view).toBe('ps');
    expect(state.selectedRow).toBe(1);
    expect(state.beadDoc).toBeUndefined();
    expect(state.beadLive).toBeUndefined();
  });
});

describe('BeadView rendering — golden lines via theme', () => {
  it('renders bead fields and sections via theme.paint (no raw ANSI)', async () => {
    const { renderBeadField, renderBeadBodyLine, renderSectionTitle } = await import(
      '../../../src/cli/console/theme.js'
    );
    const fieldRow = renderBeadField('status', 'closed', 80);
    expect(strip(fieldRow)).toContain('status');
    expect(strip(fieldRow)).toContain('closed');
    expect(strip(fieldRow).startsWith('status      ')).toBe(true); // 12-wide padded

    const sectionRow = renderSectionTitle('live state', 80);
    expect(strip(sectionRow).startsWith('── live state ')).toBe(true);

    const body = renderBeadBodyLine('hello world', 80);
    expect(strip(body)).toBe('hello world');
  });

  it('SGRs in output are all truecolor (no legacy 8/16-color escapes)', async () => {
    const { renderBeadField } = await import('../../../src/cli/console/theme.js');
    const out = renderBeadField('k', 'v', 80);
    const sgrs = out.match(SGR_RE) ?? [];
    for (const s of sgrs) {
      expect(s === '\x1b[0m' || /^\x1b\[38;2;\d+;\d+;\d+m$/.test(s)).toBe(true);
    }
  });
});
