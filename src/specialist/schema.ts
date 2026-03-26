// src/specialist/schema.ts
import * as z from 'zod';
import { parse as parseYaml } from 'yaml';

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
  response_format: z.enum(['text', 'json', 'markdown']).default('text'),
  /** Controls which pi tools are available to the agent.
   *  READ_ONLY : read, grep, find, ls        (no bash, no writes)
   *  LOW       : + bash                       (inspect/run, no file edits)
   *  MEDIUM    : + edit                       (can edit existing files)
   *  HIGH      : + write                      (full access — create new files)
   */
  permission_required: z.enum(['READ_ONLY', 'LOW', 'MEDIUM', 'HIGH']).default('READ_ONLY'),
  /** Pass --thinking <level> to pi. Models that don't support thinking ignore this. */
  thinking_level: z.enum(['off', 'minimal', 'low', 'medium', 'high', 'xhigh']).optional(),
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
  /** Skill/context files injected into the system prompt via pi --skill */
  paths: z.array(z.string()).optional(),
  /** Pre/post scripts or commands run locally (not inside the agent session) */
  scripts: z.array(ScriptEntrySchema).optional(),
  references: z.array(z.unknown()).optional(),
  tools: z.array(z.string()).optional(),
}).optional();

const CapabilitiesSchema = z.object({
  /** Tool names the agent is expected to use (informational / future doctor check) */
  required_tools: z.array(z.string()).optional(),
  /** CLI binaries the agent depends on (validated at run-time before session starts) */
  external_commands: z.array(z.string()).optional(),
}).optional();

const CommunicationSchema = z.object({
  /** Specialist(s) to run next, receiving this output as $previous_result */
  next_specialists: z.union([z.string(), z.array(z.string())]).optional(),
}).optional();

const ValidationSchema = z.object({
  /** File paths to watch — if any mtime > metadata.updated, specialist is marked STALE */
  files_to_watch: z.array(z.string()).optional(),
  references: z.array(z.unknown()).optional(),
  /** Days before STALE escalates to AGED */
  stale_threshold_days: z.number().optional(),
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
    /** Write the final output to this file path after the session completes */
    output_file: z.string().optional(),
    beads_integration: z.enum(['auto', 'always', 'never']).default('auto'),
    heartbeat: z.unknown().optional(), // future — accepted, ignored
  }),
});

export type Specialist = z.infer<typeof SpecialistSchema>;
export type ScriptEntry = { run: string; phase: 'pre' | 'post'; inject_output: boolean };

export async function parseSpecialist(yamlContent: string): Promise<Specialist> {
  const raw = parseYaml(yamlContent);
  return SpecialistSchema.parseAsync(raw);
}
