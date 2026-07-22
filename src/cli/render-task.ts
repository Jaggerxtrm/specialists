// `specialists render-task` — read-only task-prompt renderer for interactive roles.
//
// Consumed by xtrm-tools (`xt pi --role` / `xt claude --role`) so it can send the
// SAME initial user prompt that `sp run` builds, without reimplementing private
// renderer logic. Creates no job, worktree, RPC session, bead, note, or status row.
//
// prompt.system is deliberately NOT part of the output: the launcher owns the
// system prompt via `sp view <name> --raw`, and bead content must never be
// promoted into it.
//
// The parsing/rendering/emission below is shared verbatim with the roleless
// sibling `sp render-bead` (src/cli/render-bead.ts) — there is exactly one
// task-side assembly path, and both verbs emit the same envelope shape.
import { SpecialistLoader } from '../specialist/loader.js';
import { BeadsClient } from '../specialist/beads.js';
import { renderTaskPrompt } from '../specialist/task-prompt.js';
import type { Specialist } from '../specialist/schema.js';

export type Surface = 'pi' | 'claude';

/** Flags shared by every render verb. `render-task` adds a positional specialist name. */
export interface RenderArgs {
  beadId: string;
  cwd: string;
  contextDepth: number;
  surface: Surface;
  positional: string[];
}

// Stable, machine-readable failure codes. The core consumer branches on these.
export type ErrorCode =
  | 'usage'
  | 'specialist_not_found'
  | 'bead_not_found'
  | 'template_render_failed'
  | 'mandatory_rules_failed';

export function fail(code: ErrorCode, message: string): never {
  process.stdout.write(`${JSON.stringify({ ok: false, error: { code, message } }, null, 2)}\n`);
  process.exit(1);
}

/** Shared flag parsing. Each verb enforces its own required-argument shape. */
export function parseRenderArgs(argv: string[]): RenderArgs {
  const positional: string[] = [];
  let beadId = '';
  let cwd = process.cwd();
  let contextDepth = 3;
  let surface: Surface = 'pi';

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--bead') beadId = argv[++i] ?? '';
    else if (arg === '--cwd') cwd = argv[++i] ?? cwd;
    else if (arg === '--context-depth') contextDepth = Number(argv[++i]);
    else if (arg === '--surface') surface = (argv[++i] ?? 'pi') as Surface;
    else if (!arg.startsWith('-')) positional.push(arg);
  }

  if (surface !== 'pi' && surface !== 'claude') {
    fail('usage', `--surface must be 'pi' or 'claude' (got '${surface}')`);
  }
  if (!Number.isFinite(contextDepth) || contextDepth < 0) {
    fail('usage', `--context-depth must be a non-negative number (got '${contextDepth}')`);
  }

  return { beadId, cwd, contextDepth: Math.trunc(contextDepth), surface, positional };
}

/**
 * Read the bead, run the one shared task-side assembly, and emit the envelope.
 *
 * `specialistName` is null for the roleless render — the key stays present so a
 * single consumer parser covers both verbs.
 */
export function renderAndEmit(
  specialist: Specialist['specialist'],
  specialistName: string | null,
  args: RenderArgs,
): void {
  const beads = new BeadsClient();
  const bead = beads.readBead(args.beadId);
  if (!bead) fail('bead_not_found', `bead '${args.beadId}' not found`);

  const completedBlockers = args.contextDepth > 0
    ? beads.getCompletedBlockers(args.beadId, args.contextDepth)
    : [];

  let rendered;
  try {
    rendered = renderTaskPrompt({
      specialist,
      cwd: args.cwd,
      beadId: args.beadId,
      bead,
      completedBlockers,
      surface: args.surface,
      // Execution-only inputs are absent by construction: no pre-scripts are run
      // and no reviewer git diff is taken. Both are classified execution-only in
      // the unitAI-6639v.1 parity decision.
    });
  } catch (error) {
    fail('template_render_failed', `task_template render failed: ${(error as Error)?.message ?? String(error)}`);
  }

  // Fatal here, warn-and-skip in `sp run`. An interactive coordinator that lost
  // its mandatory rules would fail silently and unrecoverably otherwise.
  if (rendered.mandatoryRulesError) {
    fail('mandatory_rules_failed', rendered.mandatoryRulesError);
  }

  const components = [
    rendered.taskTemplateComponent,
    ...(rendered.beadContextOwn ? [rendered.beadContextOwn] : []),
    ...(rendered.beadContextParent ? [rendered.beadContextParent] : []),
    ...rendered.beadContextBlockers,
    ...(rendered.mandatoryRules?.sections ?? []).map((section) => ({
      kind: 'mandatory_rule' as const,
      name: section.setId,
      tokens: Math.ceil(section.block.length / 4),
      bytes: Buffer.byteLength(section.block, 'utf8'),
    })),
  ];

  process.stdout.write(`${JSON.stringify({
    ok: true,
    specialist: specialistName,
    bead_id: args.beadId,
    surface: args.surface,
    cwd: args.cwd,
    context_depth: args.contextDepth,
    initial_prompt: rendered.initial_prompt,
    prompt_hash: rendered.prompt_hash,
    skill_prefix: rendered.skillPrefix,
    // Bounded metadata only — never full prompt bodies (unitAI-6639v.4 constraint).
    components,
    mandatory_rules: rendered.mandatoryRules
      ? {
          sets_loaded: rendered.mandatoryRules.setsLoaded,
          rules_count: rendered.mandatoryRules.ruleCount,
          inline_rules_count: rendered.mandatoryRules.inlineRulesCount,
          globals_disabled: rendered.mandatoryRules.globalsDisabled,
        }
      : null,
    skills: specialist.skills?.paths ?? [],
  }, null, 2)}\n`);
}

const USAGE = 'Usage: specialists render-task <name> --bead <id> [--cwd <path>] [--context-depth <n>] [--surface pi|claude]';

export async function run(): Promise<void> {
  const args = parseRenderArgs(process.argv.slice(3));
  const name = args.positional[0] ?? '';
  if (!name || !args.beadId) fail('usage', USAGE);

  const spec = await new SpecialistLoader().get(name).catch((error: unknown) => {
    fail('specialist_not_found', `specialist '${name}': ${(error as Error)?.message ?? String(error)}`);
  });

  renderAndEmit(spec.specialist, spec.specialist.metadata.name, args);
}
