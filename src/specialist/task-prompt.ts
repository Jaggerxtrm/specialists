import { basename, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { renderTemplate } from './templateEngine.js';
import { buildMandatoryRulesInjection } from './mandatory-rules.js';
import { buildBeadContext, type BeadRecord } from './beads.js';
import { measurePayloadComponent, type PayloadComponentMeasurement } from './payload-measure.js';
import type { Specialist } from './schema.js';

/** MANDATORY_RULES are dropped above this budget rather than truncated (sp run contract). */
const MANDATORY_RULES_TOKEN_LIMIT = 2000;

export type Surface = 'pi' | 'claude';

/**
 * Derive a skill's invocation name from its declared path.
 *   `.../<name>/SKILL.md` → `<name>` (folder-based skill)
 *   `.../<name>.md`       → `<name>` (bare-file skill)
 *   anything else         → basename verbatim
 */
export function deriveSkillName(path: string): string {
  const base = basename(path);
  if (base === 'SKILL.md') return basename(dirname(path));
  return base.endsWith('.md') ? base.slice(0, -3) : base;
}

/**
 * Turn-1 deterministic skill-load block (unitAI-qeguh).
 * Empty string when the specialist declares no skills — caller must NOT prepend anything.
 * Dedup by derived name, preserving skills.paths JSON declaration order.
 */
export function buildSkillPrefix(specialist: Specialist['specialist'], surface: Surface): string {
  const paths = specialist.skills?.paths ?? [];
  if (paths.length === 0) return '';
  const seen = new Set<string>();
  const names: string[] = [];
  for (const p of paths) {
    const n = deriveSkillName(p);
    if (seen.has(n)) continue;
    seen.add(n);
    names.push(n);
  }
  if (names.length === 0) return '';
  const sep = surface === 'claude' ? '-' : ':';
  return `${names.map((n) => `/skill${sep}${n}`).join(' ')}\n\n`;
}

export function buildBeadBoundaryInstruction(cwd: string, worktreeBoundary?: string): string {
  const boundary = worktreeBoundary?.trim() || cwd;
  return [
    '## Runtime Boundary Rules',
    `- Current cwd: ${cwd}`,
    `- Assigned worktree boundary: ${boundary}`,
    '- Stay inside current cwd / assigned worktree unless the task explicitly says otherwise.',
    '- Do NOT run `cd` outside the current cwd / assigned worktree.',
    '- Do NOT use absolute paths outside the current cwd / assigned worktree.',
    '- Do NOT broad-search /home, repo root, or unrelated paths when evidence is missing.',
    '- If required evidence is missing inside the current scope, STOP immediately, report exactly what is missing, and ask for the artifact or clarification instead of widening search.',
  ].join('\n');
}

export interface TaskPromptInput {
  /** Effective specialist config (post loader precedence + preset resolution). */
  specialist: Specialist['specialist'];
  cwd: string;
  /** Present for tracked runs; absent for `sp run --prompt`. */
  beadId?: string;
  bead?: BeadRecord | null;
  completedBlockers?: BeadRecord[];
  /**
   * Prompt used when no bead context is available — either no `beadId`, or a
   * `beadId` that could not be read. Lazy so callers only pay for it on that path.
   */
  fallbackPrompt?: () => string;
  /** Execution-only: stdout of pre-phase scripts. Empty for read-only rendering. */
  preScriptOutput?: string;
  variables?: Record<string, string>;
  reusedFromJobId?: string;
  worktreeOwnerJobId?: string;
  gitnexusSummary?: string;
  worktreeBoundary?: string;
  /**
   * Execution-only hook (reviewer git-diff context). `sp run` passes it; the
   * read-only renderer does not, which is the one classified task-side
   * difference between the two surfaces.
   */
  appendExecutionContext?: (task: string, cwd: string, variables: Record<string, string>) => string;
  /**
   * Turn-1 skill-load surface (unitAI-qeguh). Defaults to 'pi' — sp run is pi-only;
   * xt claude --role passes 'claude' via `sp render-task --surface claude`.
   */
  surface?: Surface;
}

export interface TaskPromptResult {
  initial_prompt: string;
  prompt_hash: string;
  /** task_template + bead_context measurements, in `sp run` push order. */
  taskTemplateComponent: PayloadComponentMeasurement;
  beadContextOwn: PayloadComponentMeasurement | null;
  beadContextParent: PayloadComponentMeasurement | null;
  beadContextBlockers: PayloadComponentMeasurement[];
  mandatoryRules: ReturnType<typeof buildMandatoryRulesInjection> | null;
  mandatoryRulesBlock: string;
  /**
   * Non-null when mandatory-rule resolution failed. `sp run` warns and continues
   * (historical behavior); the read-only renderer treats this as fatal so an
   * interactive coordinator can never launch silently missing its rules.
   */
  mandatoryRulesError: string | null;
  /** Fully-resolved variable map, after bead/lineage overlays. */
  variables: Record<string, string>;
  /** Variable map `sp run` uses to render `prompt.system`. Not used by the renderer. */
  beadTemplateVariables: Record<string, string>;
  /** Raw bead context, before the boundary instruction is appended. */
  beadContextText: string;
  resolvedPrompt: string;
  /** Turn-1 skill-load prefix; empty string when specialist declares no skills. */
  skillPrefix: string;
}

/**
 * The single task-side prompt assembly used by BOTH `sp run` and the read-only
 * interactive-role renderer (`sp render-task`). It never executes anything and
 * never touches `prompt.system` — system-prompt assembly stays with the caller.
 *
 * Order is the `sp run` contract and must not drift:
 *   task_template (with bead + dependency context) → MANDATORY_RULES → execution-only context → hash.
 */
export function renderTaskPrompt(input: TaskPromptInput): TaskPromptResult {
  const { specialist, cwd, beadId } = input;
  const prompt = specialist.prompt;
  const bare = specialist.execution?.bare ?? false;
  const completedBlockers = input.completedBlockers ?? [];

  const beadContextText = input.bead ? buildBeadContext(input.bead, completedBlockers) : '';
  const beadContextOwn = beadContextText ? measurePayloadComponent('bead_context', 'own', beadContextText) : null;
  const beadContextParent = input.bead?.parent?.trim()
    ? measurePayloadComponent('bead_context', 'parent', input.bead.parent.trim())
    : null;
  const beadContextBlockers = completedBlockers.map((blocker) =>
    measurePayloadComponent('bead_context', blocker.id, buildBeadContext(blocker, [])),
  );

  // A beadId whose bead could not be read still falls back to the caller's prompt.
  const resolvedPrompt = beadId && beadContextText
    ? `${beadContextText}\n\n${buildBeadBoundaryInstruction(cwd, input.worktreeBoundary)}`.trim()
    : (input.fallbackPrompt?.() ?? '');

  const lineageVariables: Record<string, string> = {
    ...(input.reusedFromJobId ? { reused_from_job_id: input.reusedFromJobId } : {}),
    ...(input.worktreeOwnerJobId ? { worktree_owner_job_id: input.worktreeOwnerJobId } : {}),
    ...(input.gitnexusSummary ? { gitnexus_summary: input.gitnexusSummary } : {}),
  };
  const beadVariables: Record<string, string> = beadId
    ? { bead_context: resolvedPrompt, bead_id: beadId }
    : {};
  const beadTemplateVariables: Record<string, string> = {
    prompt: resolvedPrompt,
    bead_id: beadId ?? '',
    ...lineageVariables,
  };
  const variables: Record<string, string> = {
    prompt: resolvedPrompt,
    cwd,
    pre_script_output: input.preScriptOutput ?? '',
    bead_id: beadId ?? '',
    ...lineageVariables,
    ...(input.variables ?? {}),
    ...beadVariables,
  };

  // ONE pass over the original template. The previous two-pass render substituted
  // $prompt with the bead body and then re-scanned the RESULT, so a bead whose text
  // contained a literal $cwd / $bead_id had it expanded — bead-authored content was
  // being treated as template source (unitAI-6639v.5). `variables` is the union of
  // every map the second pass used, so template tokens still all resolve; only the
  // injected content is no longer re-scanned.
  let renderedTask = renderTemplate(prompt.task_template, variables);
  const taskTemplateComponent = measurePayloadComponent('task_template', 'task_template', renderedTask);

  let mandatoryRulesBlock = '';
  let mandatoryRules: ReturnType<typeof buildMandatoryRulesInjection> | null = null;
  let mandatoryRulesError: string | null = null;
  try {
    mandatoryRules = buildMandatoryRulesInjection({ cwd, specialist });
    mandatoryRulesBlock = mandatoryRules.block;
    if (!bare && mandatoryRulesBlock.trim()) {
      const rulesTokens = Math.ceil(mandatoryRulesBlock.length / 4);
      if (rulesTokens <= MANDATORY_RULES_TOKEN_LIMIT) {
        renderedTask = `${renderedTask}\n\n${mandatoryRulesBlock}`;
      } else {
        console.warn(`[specialist runner] Skipping MANDATORY_RULES injection: rules block too large (${rulesTokens} tokens, limit ${MANDATORY_RULES_TOKEN_LIMIT})`);
      }
    }
  } catch (error) {
    mandatoryRulesError = String(error);
    console.warn(`[specialist runner] Skipping MANDATORY_RULES injection: ${mandatoryRulesError}`);
  }

  if (!bare && input.appendExecutionContext) {
    renderedTask = input.appendExecutionContext(renderedTask, cwd, variables);
  }

  // unitAI-qeguh: prepend the turn-1 /skill: block so declared skills load
  // deterministically. Empty when no declared skills — core relies on that
  // absence to trigger its position-0 body-safety fallback.
  const skillPrefix = buildSkillPrefix(specialist, input.surface ?? 'pi');
  if (skillPrefix) renderedTask = `${skillPrefix}${renderedTask}`;

  return {
    initial_prompt: renderedTask,
    prompt_hash: createHash('sha256').update(renderedTask).digest('hex').slice(0, 16),
    skillPrefix,
    taskTemplateComponent,
    beadContextOwn,
    beadContextParent,
    beadContextBlockers,
    mandatoryRules,
    mandatoryRulesBlock,
    mandatoryRulesError,
    variables,
    beadTemplateVariables,
    beadContextText,
    resolvedPrompt,
  };
}
