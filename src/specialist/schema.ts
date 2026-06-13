// src/specialist/schema.ts
import * as z from 'zod';

const KebabCase = z.string().regex(/^[a-z][a-z0-9-]*$/, 'Must be kebab-case');
const Semver = z.string().regex(/^\d+\.\d+\.\d+$/, 'Must be semver (e.g. 1.0.0)');

const MetadataSchema = z.object({
  name: KebabCase,
  version: Semver,
  description: z.string(),
  category: z.string(),
  updated: z.string().optional(),
  tags: z.array(z.string()).optional(),
}).passthrough();

const ExecutionSchema = z.object({
  mode: z.enum(['tool', 'skill', 'auto']).default('auto'),
  model: z.string().nullable(),
  fallback_model: z.string().nullable().optional(),
  timeout_ms: z.number().default(120_000),
  stall_timeout_ms: z.number().optional(),
  max_retries: z.number().int().min(0).default(0),
  interactive: z.boolean().default(false),
  stdout_limit_bytes: z.number().int().positive().optional(),
  prompt_limit_bytes: z.number().int().positive().optional(),
  response_format: z.enum(['text', 'json', 'markdown']).default('text'),
  /** Semantic output archetype used for structured output contracts and schema extensions. */
  output_type: z.enum(['codegen', 'analysis', 'review', 'synthesis', 'orchestration', 'workflow', 'research', 'custom']).default('custom'),
  /** Controls which pi tools are available to the agent.
   *  READ_ONLY : read, grep, find, ls        (no bash, no writes)
   *  LOW       : + bash                       (inspect/run, no file edits)
   *  MEDIUM    : + edit                       (can edit existing files)
   *  HIGH      : + write                      (full access — create new files)
   */
  permission_required: z.enum(['READ_ONLY', 'LOW', 'MEDIUM', 'HIGH']).default('READ_ONLY'),
  /** Whether specialist requires worktree isolation. Set false for workflow specialists that write shared state (.xtrm/memory.md) and should commit directly to master. */
  requires_worktree: z.boolean().default(true),
  bare: z.boolean().default(false),
  /** Pass --thinking <level> to pi. Models that don't support thinking ignore this. */
  thinking_level: z.enum(['off', 'minimal', 'low', 'medium', 'high', 'xhigh']).optional(),
  auto_commit: z.enum(['never', 'checkpoint_on_waiting', 'checkpoint_on_terminal']).default('never'),
  /** Optional per-session extension toggles. `false` disables injection of extension. */
  extensions: z.object({
    serena: z.boolean().optional(),
    gitnexus: z.boolean().optional(),
  }).passthrough().optional(),
  /** Required JSON keys the assistant output must contain. Triggers a required-keys
   *  check independent of `response_format`. Use for specs that ship their JSON
   *  contract inline in `task_template` and run with `response_format: text` so the
   *  consumer parses — without this, hallucinated key sets pass through as success.
   *  On miss the runtime returns `error_type: 'invalid_json'`. */
  expected_output_keys: z.array(z.string()).optional(),
}).passthrough();

const PromptSchema = z.object({
  system: z.string().optional(),
  system_prompt_mode: z.enum(['append', 'replace']).optional(),
  task_template: z.string(),
  output_schema: z.record(z.unknown()).optional(),
  skill_inherit: z.string().optional(),         // injected via pi --skill
}).passthrough();

/** Script/command entry for pre/post execution hooks.
 *  `run` accepts either a file path (./scripts/check.sh) or a shell command (bd ready).
 */
const ScriptEntrySchema = z.object({
  run: z.string(),
  phase: z.enum(['pre', 'post']),
  inject_output: z.boolean().default(false),
}).passthrough();

const SkillsSchema = z.object({
  /** Skill folders/files passed as pi --skill; folder loads SKILL.md inside it */
  paths: z.array(z.string()).optional(),
  /** Pre/post scripts or commands run locally (not inside the agent session) */
  scripts: z.array(ScriptEntrySchema).optional(),
}).passthrough().optional();

const CapabilitiesSchema = z.object({
  /** Pi tool names required by this specialist (validated pre-run against permission level). */
  required_tools: z.array(z.string()).optional(),
  /** CLI binaries the agent depends on (validated at run-time before session starts). */
  external_commands: z.array(z.string()).optional(),
}).passthrough().optional();

const ValidationSchema = z.object({
  /** File paths to watch — if any mtime > metadata.updated, specialist is marked STALE */
  files_to_watch: z.array(z.string()).optional(),
  /** Days before STALE escalates to AGED */
  stale_threshold_days: z.number().optional(),
}).passthrough().optional();

const MandatoryRuleSchema = z.object({
  id: z.string(),
  level: z.enum(['error', 'warn', 'info']).default('error'),
  text: z.string(),
  when: z.string().optional(),
}).passthrough();

const MandatoryRulesSchema = z.object({
  template_sets: z.array(KebabCase).default([]),
  disable_default_globals: z.boolean().default(false),
  inline_rules: z.array(MandatoryRuleSchema).default([]),
}).passthrough().optional();

const StallDetectionSchema = z.object({
  /** ms of silence while running before warn (default 60_000) */
  running_silence_warn_ms: z.number().optional(),
  /** ms of silence while running before marking stale (default 300_000) */
  running_silence_error_ms: z.number().optional(),
  /** ms in waiting state before emitting warning (default 3_600_000) */
  waiting_stale_ms: z.number().optional(),
  /** ms a single tool execution may run before warning (default 120_000) */
  tool_duration_warn_ms: z.number().optional(),
}).passthrough().optional();

export const SpecialistSchema = z.object({
  specialist: z.object({
    metadata: MetadataSchema,
    execution: ExecutionSchema,
    prompt: PromptSchema,
    skills: SkillsSchema,
    capabilities: CapabilitiesSchema,
    validation: ValidationSchema,
    stall_detection: StallDetectionSchema,
    mandatory_rules: MandatoryRulesSchema,
    /** Write handoff output to this file path via unified job-file writer */
    output_file: z.string().optional(),
    notes_mode: z.enum(['full-trail', 'final-only']).default('full-trail'),
    beads_integration: z.enum(['auto', 'always', 'never']).default('auto'),
    beads_write_notes: z.boolean().default(true),
  }).passthrough(),
}).passthrough();

export type Specialist = z.infer<typeof SpecialistSchema>;
export type ScriptEntry = { run: string; phase: 'pre' | 'post'; inject_output: boolean };

// ── Layered field-merge contract ──────────────────────────────────────────────
// Drives the SpecialistLoader 4-layer merge (package base + global + default + user).
// Allowed fields may be overridden by any non-package layer; blocked fields are
// taken from the package base only (global layer strips them, repo layers warn).

/** Execution sub-fields an override layer may set. */
export const OVERRIDE_ALLOWED_EXECUTION_FIELDS = [
  'model',
  'fallback_model',
  'timeout_ms',
  'stall_timeout_ms',
  'thinking_level',
  'max_retries',
] as const;

/** Top-level specialist fields an override layer may set. */
export const OVERRIDE_ALLOWED_TOP_FIELDS = ['beads_write_notes'] as const;

/**
 * Fields an override layer may NOT change. Dotted paths are schema-accurate.
 * `skills.paths` is exempt (append+dedup); `skills.scripts` is blocked.
 */
export const BLOCKED_OVERRIDE_FIELDS = [
  'execution.permission_required',
  'execution.auto_commit',
  'prompt.system',
  'prompt.output_schema',
  'skills.scripts',
  'mandatory_rules',
  'capabilities',
] as const;

export type BlockedFieldSeverity = 'strip' | 'warn';

/**
 * Recorded when an override layer attempts to set a blocked field.
 * - `strip` (global layer): value removed, NOT applied.
 * - `warn` (repo layer, v1): value applied but flagged for the doctor command.
 */
export interface BlockedFieldWarning {
  specialist: string;
  field: string;
  source: 'global' | 'default' | 'user';
  severity: BlockedFieldSeverity;
  value: unknown;
}

export interface ValidationError {
  path: string;
  message: string;
  code: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: string[];
}

/** Format a Zod error path array into a dot-notation string */
function formatPath(path: (string | number)[]): string {
  return path.map(p => (typeof p === 'number' ? `[${p}]` : p)).join('.');
}

/** Convert Zod error codes to user-friendly messages */
function getFriendlyMessage(issue: z.ZodIssue): string {
  const path = formatPath(issue.path);
  
  // Custom messages for specific validation rules
  if (issue.code === 'invalid_string' && issue.validation === 'regex') {
    if (path.includes('name')) {
      return `Invalid specialist name: must be kebab-case (lowercase letters, numbers, hyphens). Got: "${issue.path.at(-1) === 'name' ? 'invalid value' : 'see schema'}"`;
    }
    if (path.includes('version')) {
      return `Invalid version: must be semver format (e.g., "1.0.0"). Got value that doesn't match pattern.`;
    }
  }
  
  if (issue.code === 'invalid_enum_value') {
    const allowed = issue.options.map(o => `"${o}"`).join(', ');
    if (path.includes('permission_required')) {
      return `Invalid permission_required: must be one of ${allowed}. This controls which pi tools are available.`;
    }
    if (path.includes('mode')) {
      return `Invalid execution.mode: must be one of ${allowed}.`;
    }
    if (path.includes('beads_integration')) {
      return `Invalid beads_integration: must be one of ${allowed}.`;
    }
    return `Invalid value at "${path}": expected one of ${allowed}, got "${issue.received}"`;
  }
  
  if (issue.code === 'invalid_type') {
    return `Invalid type at "${path}": expected ${issue.expected}, got ${issue.received}`;
  }
  
  if (issue.code === 'invalid_literal') {
    return `Invalid value at "${path}": expected "${issue.expected}"`;
  }
  
  // Fallback to Zod's message
  return issue.message;
}

/**
 * Validate specialist JSON content and return structured results.
 * Use this for CLI validation and friendly error messages.
 */
export async function validateSpecialist(jsonContent: string): Promise<ValidationResult> {
  const errors: ValidationError[] = [];
  const warnings: string[] = [];

  let raw: unknown;
  try {
    raw = JSON.parse(jsonContent);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push({
      path: 'json',
      message: `JSON parse error: ${msg}`,
      code: 'json_parse_error',
    });
    return { valid: false, errors, warnings };
  }
  
  // Validate against schema
  const result = SpecialistSchema.safeParse(raw);
  
  if (!result.success) {
    for (const issue of result.error.issues) {
      errors.push({
        path: formatPath(issue.path),
        message: getFriendlyMessage(issue),
        code: issue.code,
      });
    }
  } else {
    // Additional semantic validations (warnings, not errors)
    const spec = result.data;

    // Check for common mistakes. model is nullable post-C1; only warn when set.
    const declaredModel = spec.specialist.execution.model;
    if (declaredModel && !declaredModel.includes('/')) {
      warnings.push(`Model "${declaredModel}" doesn't include a provider prefix. Expected format: "provider/model-id" (e.g., "anthropic/claude-sonnet-4-5")`);
    }
  }
  
  return { valid: errors.length === 0, errors, warnings };
}
export async function parseSpecialist(jsonContent: string): Promise<Specialist> {
  const result = await validateSpecialist(jsonContent);
  
  if (!result.valid) {
    const errorList = result.errors.map(e => `  • ${e.message}`).join('\n');
    throw new Error(`Schema validation failed:\n${errorList}`);
  }
  
  // Warnings are printed but don't block parsing
  if (result.warnings.length > 0) {
    process.stderr.write(`[specialists] warnings:\n${result.warnings.map(w => `  ⚠ ${w}`).join('\n')}\n`);
  }
  
  // Safe to parse now (we know it's valid)
  const raw = JSON.parse(jsonContent);
  return SpecialistSchema.parseAsync(raw);
}
