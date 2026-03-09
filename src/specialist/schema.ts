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
  response_format: z.enum(['text', 'json', 'markdown']).default('text'),
  permission_required: z.enum(['READ_ONLY', 'LOW', 'MEDIUM', 'HIGH']).default('READ_ONLY'),
  // Agent Forge fields — accepted but ignored by specialists
  preferred_profile: z.string().optional(),
  approval_mode: z.string().optional(),
});

const PromptSchema = z.object({
  system: z.string().optional(),
  task_template: z.string(),
  normalize_template: z.string().optional(),  // Mercury — ignored by specialists
  output_schema: z.record(z.unknown()).optional(),
  examples: z.array(z.unknown()).optional(),
  skill_inherit: z.string().optional(),        // Agent Forge — appended to agents.md
});

const SkillsSchema = z.object({
  scripts: z.array(z.object({
    path: z.string(),
    phase: z.enum(['pre', 'post']),
    inject_output: z.boolean().default(false),
  })).optional(),
  references: z.array(z.unknown()).optional(),
  tools: z.array(z.string()).optional(),
}).optional();

const CapabilitiesSchema = z.object({
  file_scope: z.array(z.string()).optional(),
  blocked_tools: z.array(z.string()).optional(),
  can_spawn: z.boolean().optional(),
  tools: z.array(z.object({ name: z.string(), purpose: z.string() })).optional(),
  diagnostic_scripts: z.array(z.string()).optional(), // appended to agents.md
}).optional();

const CommunicationSchema = z.object({
  publishes: z.array(z.string()).optional(),
  subscribes: z.array(z.string()).optional(),
  output_to: z.string().optional(),
}).optional();

const ValidationSchema = z.object({
  files_to_watch: z.array(z.string()).optional(),
  references: z.array(z.unknown()).optional(),
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
    beads_integration: z.enum(['auto', 'always', 'never']).default('auto'),
    heartbeat: z.unknown().optional(), // future — accepted, ignored
  }),
});

export type Specialist = z.infer<typeof SpecialistSchema>;

export async function parseSpecialist(yamlContent: string): Promise<Specialist> {
  const raw = parseYaml(yamlContent);
  return SpecialistSchema.parseAsync(raw);
}
