/**
 * Bead readiness gate for native Specialist activation — PRD Phase 3.
 *
 * `--bead` is the prompt. A Specialist dispatched against a Bead that is only a title and
 * a sentence has nothing to work from, so it invents the missing scope; that is how
 * durable work silently loses its boundaries. The seven sections are not paperwork, they
 * are the task contract, and a Bead without them is not dispatchable.
 *
 * Before this module the discipline existed only in CLAUDE.md and hooks — nothing in
 * `src/` mentioned PROBLEM, NON_GOALS or SCRUTINY. The gate moves it into the admission
 * path, where a refusal is cheap and reversible, rather than leaving it to be discovered
 * by a child that already spent a model turn guessing.
 *
 * Deliberately NOT here: the contract's *quality*. The gate proves a section exists and is
 * non-empty. Whether SCOPE is a good scope is a judgement no parser makes, and pretending
 * otherwise would trade a useful gate for a bureaucratic one.
 */

import { spawnSync } from 'node:child_process';
import type { BeadRecord } from '../specialist/beads.js';

/** The 7-section task contract, in the order an operator writes them. */
export const REQUIRED_SECTIONS = [
  'PROBLEM',
  'SUCCESS',
  'SCOPE',
  'NON_GOALS',
  'CONSTRAINTS',
  'VALIDATION',
  'OUTPUT',
] as const;

export const SCRUTINY_LEVELS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

export type BeadGateResult =
  | { ok: true }
  | { ok: false; reason: string; missing: string[] };

/** Closed and deferred Beads are not work; dispatching against them resurrects dead scope. */
const NON_DISPATCHABLE_STATUSES = new Set(['closed', 'deferred']);

export interface BeadGateOptions {
  /**
   * Reads the `contract` state marker for a Bead, returning e.g. 'ready' or 'draft'.
   *
   * Injected so tests need no `bd` binary. The default shells out to `bd state`, which is
   * the only surface that carries the marker — `bd show --json` does not include it.
   */
  readContractState?: (beadId: string) => string | undefined;
}

/** Read `bd state <id> contract`. Returns undefined when bd is absent or the state is unset. */
export function readContractState(beadId: string): string | undefined {
  const result = spawnSync('bd', ['state', beadId, 'contract'], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: 5000,
  });
  if (result.error || result.status !== 0) return undefined;
  const value = result.stdout?.trim().toLowerCase();
  return value ? value : undefined;
}

/**
 * Find section headings in a Bead description.
 *
 * Matched as a bare word on its own line, optionally decorated with markdown heading
 * marks, bold, or a trailing colon — `bd`'s own renderer pads them with trailing spaces,
 * and operators write them several ways. A section that appears only inside prose does not
 * count: a heading has to head something.
 */
function presentSections(description: string): Set<string> {
  const found = new Set<string>();
  for (const line of description.split('\n')) {
    const bare = line.trim().replace(/^#+\s*/, '').replace(/\*/g, '').replace(/:$/, '').trim();
    const normalized = bare.toUpperCase().replace(/[\s-]+/g, '_');
    if ((REQUIRED_SECTIONS as readonly string[]).includes(normalized)) found.add(normalized);
  }
  return found;
}

/** Whether a section has a non-empty body, so an empty heading is not mistaken for content. */
function sectionHasBody(description: string, section: string): boolean {
  const lines = description.split('\n');
  const headings = new Set<string>([...REQUIRED_SECTIONS, 'SCRUTINY']);

  let index = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const bare = lines[i].trim().replace(/^#+\s*/, '').replace(/\*/g, '').replace(/:$/, '').trim();
    if (bare.toUpperCase().replace(/[\s-]+/g, '_') === section) { index = i; break; }
  }
  if (index === -1) return false;

  for (let i = index + 1; i < lines.length; i += 1) {
    const bare = lines[i].trim().replace(/^#+\s*/, '').replace(/\*/g, '').replace(/:$/, '').trim();
    const normalized = bare.toUpperCase().replace(/[\s-]+/g, '_');
    if (headings.has(normalized)) return false;
    if (lines[i].trim().length > 0) return true;
  }
  return false;
}

/** Extract the declared SCRUTINY level, if any. */
function scrutinyLevel(description: string): string | undefined {
  const match = description.match(/SCRUTINY\b[^\n]*\n?\s*\**\s*(LOW|MEDIUM|HIGH|CRITICAL)\b/i)
    ?? description.match(/SCRUTINY\b\s*[:\-—]?\s*(LOW|MEDIUM|HIGH|CRITICAL)\b/i);
  return match?.[1]?.toUpperCase();
}

/**
 * Decide whether a Bead is a dispatchable task contract.
 *
 * Returns a result rather than throwing so the caller owns the refusal shape — the host
 * renders one `DispatchRejectedError` for every rejection reason, and a gate that threw its
 * own error type would give operators two.
 */
export function evaluateBeadReadiness(bead: BeadRecord, options: BeadGateOptions = {}): BeadGateResult {
  const status = bead.status?.trim().toLowerCase();
  if (status && NON_DISPATCHABLE_STATUSES.has(status)) {
    return { ok: false, reason: `bead is ${status} and is not dispatchable`, missing: [] };
  }

  // An explicit draft marker is decisive. An ABSENT marker is not treated as draft: most
  // Beads predate the marker, and refusing them all would make the gate unusable.
  const contractState = (options.readContractState ?? readContractState)(bead.id);
  if (contractState === 'draft') {
    return {
      ok: false,
      reason: 'bead contract is marked draft — promote it with `bd set-state <id> contract=ready` first',
      missing: [],
    };
  }

  const description = bead.description ?? '';
  const present = presentSections(description);
  const missing = REQUIRED_SECTIONS.filter(
    section => !present.has(section) || !sectionHasBody(description, section),
  );

  if (missing.length > 0) {
    return {
      ok: false,
      reason: 'bead is not a usable task contract: required sections are missing or empty',
      missing: [...missing],
    };
  }

  if (!scrutinyLevel(description)) {
    return {
      ok: false,
      reason: `bead declares no SCRUTINY level (expected one of ${SCRUTINY_LEVELS.join(', ')})`,
      missing: ['SCRUTINY'],
    };
  }

  return { ok: true };
}
