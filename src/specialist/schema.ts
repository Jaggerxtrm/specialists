// src/specialist/schema.ts
import * as z from 'zod';

const KebabCase = z.string().regex(/^[a-z][a-z0-9-]*$/, 'Must be kebab-case');
const Semver = z.string().regex(/^\d+\.\d+\.\d+$/, 'Must be semver (e.g. 1.0.0)');

const MetadataSchema = z.object({
  name: KebabCase,
  version: Semver,
  description: z.string(),
  category: z.string(),
  author: z.string().optional(),
  created: z.string().optional(),
  updated: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

const ExecutionSchema = z.object({
  mode: z.enum(['tool', 'skill', 'auto']).default('auto'),
  model: z.string(),
  fallback_model: z.string().optional(),
  timeout_ms: z.number().default(120_000),
  stall_timeout_ms: z.number().optional(),
  max_retries: z.number().int().min(0).default(0),
  interactive: z.boolean().default(false),
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
  /** Pass --thinking <level> to pi. Models that don't support thinking ignore this. */
  thinking_level: z.enum(['off', 'minimal', 'low', 'medium', 'high', 'xhigh']).optional(),
  auto_commit: z.enum(['never', 'checkpoint_on_waiting', 'checkpoint_on_terminal']).default('never'),
  /** Optional per-session extension toggles. `false` disables injection of extension. */
  extensions: z.object({
    serena: z.boolean().optional(),
    gitnexus: z.boolean().optional(),
  }).optional(),
  // Agent Forge compat — accepted but ignored by specialists
  preferred_profile: z.string().optional(),
  approval_mode: z.string().optional(),
});

const PromptSchema = z.object({
  system: z.string().optional(),
  task_template: z.string(),
  normalize_template: z.string().optional(),   // Mercury compat — ignored
  output_schema: z.record(z.unknown()).optional(),
  examples: z.array(z.unknown()).optional(),
  skill_inherit: z.string().optional(),         // Agent Forge compat — injected via --skill
});

/** Script/command entry for pre/post execution hooks.
 *  `run` accepts either a file path (./scripts/check.sh) or a shell command (bd ready).
 *  `path` is a deprecated alias for `run` — prefer `run`.
 */
const ScriptEntrySchema = z.object({
  run: z.string().optional(),
  path: z.string().optional(),   // deprecated: use run
  phase: z.enum(['pre', 'post']),
  inject_output: z.boolean().default(false),
}).transform(s => ({
  run: s.run ?? s.path ?? '',
  phase: s.phase,
  inject_output: s.inject_output,
}));

const SkillsSchema = z.object({
  /** Skill folders/files passed as pi --skill; folder loads SKILL.md inside it */
  paths: z.array(z.string()).optional(),
  /** Pre/post scripts or commands run locally (not inside the agent session) */
  scripts: z.array(ScriptEntrySchema).optional(),
}).optional();

const CapabilitiesSchema = z.object({
  /** Pi tool names required by this specialist (validated pre-run against permission level). */
  required_tools: z.array(z.string()).optional(),
  /** CLI binaries the agent depends on (validated at run-time before session starts). */
  external_commands: z.array(z.string()).optional(),
}).optional();

const CommunicationSchema = z.object({
  /**
   * Declarative pipeline metadata only.
   * Runner does not auto-chain specialists; orchestrators may consume this field.
   */
  next_specialists: z.union([z.string(), z.array(z.string())]).optional(),
}).optional();

const ValidationSchema = z.object({
  /** File paths to watch — if any mtime > metadata.updated, specialist is marked STALE */
  files_to_watch: z.array(z.string()).optional(),
  /** Days before STALE escalates to AGED */
  stale_threshold_days: z.number().optional(),
}).optional();

const StallDetectionSchema = z.object({
  /** ms of silence while running before warn (default 60_000) */
  running_silence_warn_ms: z.number().optional(),
  /** ms of silence while running before marking stale (default 300_000) */
  running_silence_error_ms: z.number().optional(),
  /** ms in waiting state before emitting warning (default 3_600_000) */
  waiting_stale_ms: z.number().optional(),
  /** ms a single tool execution may run before warning (default 120_000) */
  tool_duration_warn_ms: z.number().optional(),
}).optional();

export const SpecialistSchema = z.object({
  specialist: z.object({
    metadata: MetadataSchema,
    execution: ExecutionSchema,
    prompt: PromptSchema,
    skills: SkillsSchema,
    capabilities: CapabilitiesSchema,
    communication: CommunicationSchema,
    validation: ValidationSchema,
    stall_detection: StallDetectionSchema,
    /** Write the final output to this file path after the session completes */
    output_file: z.string().optional(),
    beads_integration: z.enum(['auto', 'always', 'never']).default('auto'),
    beads_write_notes: z.boolean().default(true),
    heartbeat: z.unknown().optional(), // intentional placeholder for future liveness metadata (accepted, ignored)
  }),
});

export type Specialist = z.infer<typeof SpecialistSchema>;
export type ScriptEntry = { run: string; phase: 'pre' | 'post'; inject_output: boolean };

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
    
    // Check for deprecated fields
    if (spec.specialist.prompt.normalize_template) {
      warnings.push('prompt.normalize_template is deprecated (Mercury compat) and will be ignored');
    }
    if (spec.specialist.execution.preferred_profile) {
      warnings.push('execution.preferred_profile is deprecated (Agent Forge compat) and will be ignored');
    }
    if (spec.specialist.execution.approval_mode) {
      warnings.push('execution.approval_mode is deprecated (Agent Forge compat) and will be ignored');
    }
    
    // Check for common mistakes
    if (!spec.specialist.execution.model.includes('/')) {
      warnings.push(`Model "${spec.specialist.execution.model}" doesn't include a provider prefix. Expected format: "provider/model-id" (e.g., "anthropic/claude-sonnet-4-5")`);
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
