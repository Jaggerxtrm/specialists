// `specialists render-bead` — roleless sibling of `sp render-task` (core xtrm-3xgs5.6).
//
// `sp render-task` takes the specialist name as a required positional, so core's
// BARE launch path (`xt claude worker --bead <id>` with no `--role`) had no way to
// compose a turn-1 body from the tracked bead; xtrm-3xgs5 shipped bare `--bead` as
// pane/env metadata only. This verb closes that gap: same bead context, same
// boundary rules, same MANDATORY_RULES, same envelope — no specialist.
//
// A separate verb rather than making render-task's positional optional: core reads
// this over a machine boundary, and a dropped argument must stay a hard `usage`
// error instead of silently degrading a role render into a roleless one.
//
// `skill_prefix` is empty BY CONSTRUCTION here (a roleless render declares no
// skills), which is exactly the absence core keys its position-0 body-safety
// fallback on for the newly-untrusted bead-derived body.
import { SpecialistSchema, type Specialist } from '../specialist/schema.js';
import { fail, parseRenderArgs, renderAndEmit } from './render-task.js';

const USAGE = 'Usage: specialists render-bead <id> [--cwd <path>] [--context-depth <n>] [--surface pi|claude|codex]';

/**
 * The minimal specialist a roleless render stands in for: the bead context and
 * its boundary rules, and nothing else. `$prompt` is the resolved bead body that
 * `renderTaskPrompt` builds, so the rendered task is bead content verbatim plus
 * the MANDATORY_RULES block every surface gets.
 *
 * Parsed through SpecialistSchema so schema defaults (bare: false, no skills, no
 * mandatory_rules overrides) apply exactly as they would for a real config.
 */
export function rolelessSpecialist(): Specialist['specialist'] {
  return SpecialistSchema.parse({
    specialist: {
      metadata: {
        name: 'roleless',
        version: '1.0.0',
        description: 'Synthetic roleless render target for `sp render-bead`.',
        category: 'internal',
      },
      execution: { model: null },
      prompt: { task_template: '$prompt' },
    },
  }).specialist;
}

export function run(): void {
  const args = parseRenderArgs(process.argv.slice(3));
  // The bead id is the verb's subject: accept it positionally, and as --bead for
  // callers sharing an argv builder with `render-task`.
  const beadId = args.beadId || args.positional[0] || '';
  if (!beadId) fail('usage', USAGE);

  renderAndEmit(rolelessSpecialist(), null, { ...args, beadId });
}
