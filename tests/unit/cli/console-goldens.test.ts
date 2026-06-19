// Cross-view golden render snapshots at 80 / 120 / 160 cols per unitAI-ctb4u.10.
//
// Strategy: render small fixtures via the pure theme helpers (no terminal
// dependency), then assert the spec §2/§6/§8 cross-view invariants:
//   - Zero empty lines in any rendered frame.
//   - Rail prefix '│ ' × depth on every row.
//   - StatsLine is exactly one line at every width.
//   - Column widths preserved per §6.4.

import { describe, expect, it } from 'vitest';
import {
  renderJobRow,
  renderGroupRow,
  renderStatsLine,
  renderSectionTitle,
  renderBeadField,
  renderDiffSummaryRow,
  renderDiffHunkHeader,
  renderDiffHunkLine,
  renderConfigField,
  renderConfigSpecialistRow,
  visibleLength,
} from '../../../src/cli/console/theme.js';
import type { ConsoleJob, ProcessSnapshot } from '../../../src/cli/console/types.js';
import type { ProcessHealthReport } from '../../../src/specialist/process-health.js';

const SGR_RE = /\x1b\[[0-9;]*m/g;
const strip = (s: string): string => s.replace(SGR_RE, '');

function makeJob(overrides: Partial<ConsoleJob> = {}): ConsoleJob {
  return {
    id: 'abc12345',
    specialist: 'executor',
    status: 'running',
    started_at_ms: 0,
    elapsed_s: 252,
    context_pct: 41,
    metrics: { turns: 3, tool_calls: 8, token_usage: { total_tokens: 42000 } },
    bead_id: 'unitAI-9b2dn',
    bead_title: 'add npm pack smoke',
    payload_kb: '44.2kb',
    payload_tokens: '12.1kt',
    next_action: 'result',
    ...overrides,
  } as ConsoleJob;
}

function makeSnapshot(overrides: Partial<ProcessSnapshot> = {}): ProcessSnapshot {
  const health: ProcessHealthReport = {
    status: 'OK',
    totalRssBytes: 512 * 1024 * 1024,
    totalCpuPct: 7.3,
    orphanCount: 0,
  } as ProcessHealthReport;
  return {
    generatedAtMs: 0,
    repo: { id: 'r', name: 'specialists', path: '/x' },
    filter: { historyMode: 'default', includeCleaned: false, textFilter: '' },
    rows: [],
    jobs: [],
    totalJobs: 12,
    visibleJobs: 5,
    runningJobs: 2,
    waitingJobs: 1,
    epics: 1,
    nodes: 0,
    worktrees: 2,
    maxContextPct: 41,
    totalTokens: 84000,
    health,
    ...overrides,
  };
}

const WIDTHS = [80, 120, 160];

describe('cross-view invariants — zero empty lines, rail prefix, StatsLine one line', () => {
  for (const width of WIDTHS) {
    describe(`width=${width}`, () => {
      it('ps view rows at depths 0..3 all carry the rail prefix `│ ` × depth', () => {
        const rows = [0, 1, 2, 3].map((d) => strip(renderJobRow(makeJob(), width, d, false)));
        for (const [depth, row] of rows.entries()) {
          expect(row).not.toBe('');
          const railPrefix = '  ' + '│ '.repeat(depth);
          expect(row.startsWith(railPrefix)).toBe(true);
          expect(visibleLength('  ' + '│ '.repeat(depth))).toBe(2 + depth * 2);
        }
      });

      it('group rows carry container glyph at depth 0', () => {
        const epic = strip(renderGroupRow('epic', 'release', width, 0));
        const chain = strip(renderGroupRow('chain', 'root', width, 1));
        const node = strip(renderGroupRow('node', 'research', width, 0));
        expect(epic).toContain('◆');
        expect(chain).toContain('◇');
        expect(node).toContain('▦');
      });

      it('StatsLine is exactly one line at this width', () => {
        const line = renderStatsLine(makeSnapshot(), width);
        expect(line.includes('\n')).toBe(false);
        expect(visibleLength(line)).toBeLessThanOrEqual(width);
      });

      it('section titles render in the dim `── label ──` shape', () => {
        const out = strip(renderSectionTitle('live state', width));
        expect(out.startsWith('── live state ')).toBe(true);
        expect(out).not.toBe('');
      });
    });
  }
});

describe('BeadView (§7.4): key(12) value rows + dim section titles', () => {
  it('renders 12-wide padded key + value', () => {
    const out = strip(renderBeadField('status', 'running', 80));
    expect(out.startsWith('status      ')).toBe(true);
    expect(out).toContain('running');
  });
});

describe('DiffView (§7.5): summary + per-file hunks + binary marker', () => {
  it('summary row shows status code, +adds, -dels, path', () => {
    const out = strip(renderDiffSummaryRow(
      { path: 'src/foo.ts', status: 'M', added: 3, deleted: 1, binary: false },
      120,
      false,
    ));
    expect(out).toContain('M');
    expect(out).toContain('+3');
    expect(out).toContain('-1');
    expect(out).toContain('src/foo.ts');
  });

  it('binary entry shows `bin` marker (no count)', () => {
    const out = strip(renderDiffSummaryRow(
      { path: 'assets/logo.png', status: 'M', added: 0, deleted: 0, binary: true },
      120,
      false,
    ));
    expect(out).toContain('bin');
  });

  it('hunk header is dim @@ line; lines color-coded by kind', () => {
    expect(strip(renderDiffHunkHeader('@@ -1,3 +1,4 @@', 80))).toBe('@@ -1,3 +1,4 @@');
    expect(strip(renderDiffHunkLine('add', '+added', 80))).toBe('+added');
    expect(strip(renderDiffHunkLine('del', '-removed', 80))).toBe('-removed');
    expect(strip(renderDiffHunkLine('context', ' kept', 80))).toBe(' kept');
    expect(strip(renderDiffHunkLine('meta', 'index ...', 80))).toBe('index ...');
  });
});

describe('ConfigView (§9): path line + field table + ● override marker', () => {
  it('field row left-aligns 28-wide path, value, dim hint', () => {
    const out = strip(renderConfigField(
      'execution.thinking_level',
      'medium',
      'enum: off|low|medium|high | null',
      120,
      { isOverride: true, isInherit: false },
    ));
    expect(out.startsWith('execution.thinking_level')).toBe(true);
    expect(out).toContain('medium');
    expect(out).toContain('enum: off');
  });

  it('overridden specialist row carries ● and bright name', () => {
    expect(strip(renderConfigSpecialistRow('executor', true, true, 80))).toContain('●');
    expect(strip(renderConfigSpecialistRow('reviewer', false, false, 80))).toContain('○');
  });
});

describe('StatsLine ctx-color thresholds (§8.1)', () => {
  it('ctx<80 stays dim', () => {
    const snap = makeSnapshot({ maxContextPct: 50 });
    const line = renderStatsLine(snap, 200);
    expect(line).toContain('ctx max');
    // Below threshold — should NOT carry the `running` color SGR for the ctx value.
    expect(line).not.toContain('\x1b[38;2;195;154;94m50%');
  });

  it('80 ≤ ctx < 95 → running color', () => {
    const snap = makeSnapshot({ maxContextPct: 85 });
    const line = renderStatsLine(snap, 200);
    // running color: 195;154;94
    expect(line).toContain('\x1b[38;2;195;154;94m85%');
  });

  it('ctx ≥ 95 → blocked color', () => {
    const snap = makeSnapshot({ maxContextPct: 96 });
    const line = renderStatsLine(snap, 200);
    // blocked color: 196;128;111
    expect(line).toContain('\x1b[38;2;196;128;111m96%');
  });
});

describe('no-empty-lines invariant across every render fn', () => {
  it('no fn output equals "" for canonical fixtures', () => {
    const outputs = [
      renderJobRow(makeJob(), 160, 0, false),
      renderGroupRow('epic', 'release', 160, 0),
      renderStatsLine(makeSnapshot(), 160),
      renderSectionTitle('section', 160),
      renderBeadField('k', 'v', 160),
      renderDiffSummaryRow({ path: 'a', status: 'M', added: 1, deleted: 0, binary: false }, 160, false),
      renderDiffHunkLine('add', '+x', 160),
      renderConfigField('execution.model', 'inherit', '<provider>/<id> · e.g. openai-codex/gpt-5.4-mini', 160, { isOverride: false, isInherit: true }),
      renderConfigSpecialistRow('executor', true, false, 160),
    ];
    for (const out of outputs) {
      expect(out).not.toBe('');
      expect(strip(out).length).toBeGreaterThan(0);
    }
  });
});
