import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export type MandatoryRuleLevel = 'error' | 'warn' | 'info';

export interface MandatoryRule {
  id: string;
  level?: MandatoryRuleLevel;
  text: string;
  when?: string;
}

export interface MandatoryRuleSet {
  id: string;
  rules: MandatoryRule[];
}

export interface MandatoryRulesIndex {
  required_template_sets?: string[];
  default_template_sets?: string[];
}

export interface MandatoryRulesConfig {
  mandatory_rules?: {
    template_sets?: string[];
    disable_default_globals?: boolean;
    inline_rules?: MandatoryRule[];
  };
}

interface LoadMandatoryRulesOptions {
  projectDir?: string;
}

function getProjectDir(options: LoadMandatoryRulesOptions = {}): string {
  return options.projectDir ?? process.cwd();
}

function parseJson<T>(content: string, filePath: string): T {
  try {
    return JSON.parse(content) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse JSON from ${filePath}: ${message}`);
  }
}

function parseFrontmatterRules(content: string, filePath: string): MandatoryRule[] {
  const trimmed = content.trim();
  if (!trimmed.startsWith('---')) {
    throw new Error(`Missing YAML frontmatter in ${filePath}`);
  }

  const end = trimmed.indexOf('\n---', 3);
  if (end === -1) {
    throw new Error(`Unterminated YAML frontmatter in ${filePath}`);
  }

  const frontmatter = trimmed.slice(3, end).trim();
  const rulesMatch = frontmatter.match(/rules:\s*([\s\S]*)$/m);
  if (!rulesMatch) return [];

  const lines = rulesMatch[1].split(/\r?\n/);
  const rules: MandatoryRule[] = [];
  let current: Partial<MandatoryRule> | null = null;

  const pushCurrent = () => {
    if (!current?.id || !current.text) return;
    rules.push({
      id: current.id,
      level: current.level,
      text: current.text,
      when: current.when,
    });
  };

  for (const line of lines) {
    if (/^\s*-$/.test(line)) continue;
    const itemMatch = line.match(/^\s*-\s*id:\s*(.+)$/);
    if (itemMatch) {
      pushCurrent();
      current = { id: itemMatch[1].trim() };
      continue;
    }

    const keyMatch = line.match(/^\s{2}(level|text|when):\s*(.*)$/);
    if (!keyMatch || !current) continue;
    const [, key, value] = keyMatch;
    const trimmedValue = value.trim();
    if (key === 'level') current.level = trimmedValue === '' ? undefined : (trimmedValue as MandatoryRuleLevel);
    if (key === 'text') current.text = trimmedValue;
    if (key === 'when') current.when = trimmedValue;
  }

  pushCurrent();
  return rules;
}

export async function loadMandatoryRulesIndex(projectDir?: string): Promise<MandatoryRulesIndex> {
  const root = getProjectDir({ projectDir });
  const filePath = join(root, 'config', 'mandatory-rules', 'index.json');
  const content = await readFile(filePath, 'utf-8');
  return parseJson<MandatoryRulesIndex>(content, filePath);
}

export async function resolveMandatoryRuleSet(id: string, projectDir?: string): Promise<MandatoryRuleSet> {
  const root = getProjectDir({ projectDir });
  const preferredPath = join(root, '.specialists', 'mandatory-rules', `${id}.md`);
  const fallbackPath = join(root, 'config', 'mandatory-rules', `${id}.md`);
  const filePath = existsSync(preferredPath) ? preferredPath : fallbackPath;

  if (!existsSync(filePath)) {
    throw new Error(`Mandatory rule set not found: ${id}`);
  }

  return {
    id,
    rules: parseFrontmatterRules(await readFile(filePath, 'utf-8'), filePath),
  };
}

export function mergeMandatoryRuleSets(...sets: MandatoryRuleSet[]): MandatoryRuleSet[] {
  const merged = new Map<string, MandatoryRuleSet>();

  for (const set of sets) {
    const existing = merged.get(set.id);
    if (existing) {
      process.stderr.write(`[specialists] mandatory rules set override: ${set.id}\n`);
    }
    merged.set(set.id, {
      id: set.id,
      rules: mergeRules(existing?.rules ?? [], set.rules),
    });
  }

  return [...merged.values()];
}

function mergeRules(existingRules: MandatoryRule[], incomingRules: MandatoryRule[]): MandatoryRule[] {
  const byId = new Map<string, MandatoryRule>();
  for (const rule of existingRules) byId.set(rule.id, rule);
  for (const rule of incomingRules) {
    if (byId.has(rule.id)) {
      process.stderr.write(`[specialists] mandatory rule override: ${rule.id}\n`);
    }
    byId.set(rule.id, rule);
  }
  return [...byId.values()];
}

function renderRule(rule: MandatoryRule): string {
  const level = rule.level ?? 'error';
  const parts = [`- [${level}] ${rule.text}`];
  if (rule.when) parts[0] += ` (when: ${rule.when})`;
  return parts[0];
}

export function formatMandatoryRulesBlock(sets: MandatoryRuleSet[]): string {
  const lines: string[] = ['## MANDATORY_RULES'];
  for (const set of sets) {
    lines.push('', `### ${set.id}`);
    for (const rule of set.rules) lines.push(renderRule(rule));
  }
  return lines.join('\n');
}

export async function buildMandatoryRulesBlock(specialistConfig: MandatoryRulesConfig, projectDir?: string): Promise<string> {
  const index = await loadMandatoryRulesIndex(projectDir);
  const templateSets = specialistConfig.mandatory_rules?.template_sets ?? [];
  const defaultSets = specialistConfig.mandatory_rules?.disable_default_globals ? [] : index.default_template_sets ?? [];
  const setIds = [...new Set([...(index.required_template_sets ?? []), ...defaultSets, ...templateSets])];

  const resolvedSets = await Promise.all(setIds.map(id => resolveMandatoryRuleSet(id, projectDir)));
  const merged = mergeMandatoryRuleSets(...resolvedSets);
  const inlineRules = specialistConfig.mandatory_rules?.inline_rules ?? [];

  if (inlineRules.length) {
    merged.push({ id: 'inline', rules: inlineRules });
  }

  return formatMandatoryRulesBlock(merged);
}
