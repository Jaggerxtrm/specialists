import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { STATIC_WORKFLOW_RULES_BLOCK } from './memory-retrieval.js';

export interface MandatoryRule {
  id: string;
  level: string;
  text: string;
  when?: string;
}

export interface MandatoryRuleSet {
  id: string;
  rules: MandatoryRule[];
}

export interface SpecialistMandatoryRulesConfig {
  template_sets?: string[];
  disable_default_globals?: boolean;
  inline_rules?: MandatoryRule[];
}

interface MandatoryRulesIndex {
  required_template_sets?: string[];
  default_template_sets?: string[];
}

export interface MandatoryRulesInjection {
  block: string;
  setsLoaded: string[];
  ruleCount: number;
  inlineRulesCount: number;
  globalsDisabled: boolean;
}

function readJsonFile<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, 'utf8')) as T;
}

function mergeIndex(base: MandatoryRulesIndex, overlay: MandatoryRulesIndex): MandatoryRulesIndex {
  const dedupe = (values: string[] | undefined): string[] | undefined =>
    values ? Array.from(new Set(values)) : undefined;

  return {
    required_template_sets: dedupe([
      ...(base.required_template_sets ?? []),
      ...(overlay.required_template_sets ?? []),
    ]),
    default_template_sets: dedupe([
      ...(base.default_template_sets ?? []),
      ...(overlay.default_template_sets ?? []),
    ]),
  };
}

export function loadMandatoryRulesIndex(cwd: string): MandatoryRulesIndex | null {
  const sourcePath = resolve(cwd, 'config/mandatory-rules/index.json');
  const canonicalCopyPath = resolve(cwd, '.specialists/default/mandatory-rules/index.json');
  const overlayPath = resolve(cwd, '.specialists/mandatory-rules/index.json');

  const tiers: MandatoryRulesIndex[] = [];
  for (const path of [sourcePath, canonicalCopyPath, overlayPath]) {
    if (existsSync(path)) tiers.push(readJsonFile<MandatoryRulesIndex>(path));
  }

  if (tiers.length === 0) {
    console.warn('[specialist runner] Missing mandatory-rules index (checked config/, .specialists/default/, .specialists/); skipping MANDATORY_RULES injection');
    return null;
  }

  return tiers.reduce((acc, next) => mergeIndex(acc, next));
}

function parseQuotedScalar(value: string): string {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function parseRuleEntry(lines: string[], startIndex: number): { rule: MandatoryRule; nextIndex: number } | null {
  const entryLine = lines[startIndex]?.trim();
  if (!entryLine?.startsWith('- ')) return null;

  const firstLine = entryLine.slice(2).trim();
  const inlineFields: Record<string, string> = {};

  if (firstLine.length > 0 && !firstLine.includes(':')) {
    inlineFields.text = parseQuotedScalar(firstLine);
  } else if (firstLine.length > 0) {
    const [key, ...rest] = firstLine.split(':');
    inlineFields[key.trim()] = parseQuotedScalar(rest.join(':'));
  }

  let nextIndex = startIndex + 1;
  while (nextIndex < lines.length) {
    const line = lines[nextIndex];
    if (!line.trim()) {
      nextIndex += 1;
      continue;
    }

    if (/^\s*-\s+/.test(line)) break;
    if (!/^\s+/.test(line)) break;

    const trimmed = line.trim();
    const match = trimmed.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!match) {
      nextIndex += 1;
      continue;
    }

    inlineFields[match[1]] = parseQuotedScalar(match[2]);
    nextIndex += 1;
  }

  if (!inlineFields.text) return null;

  return {
    rule: {
      id: inlineFields.id ?? '',
      level: inlineFields.level ?? 'required',
      text: inlineFields.text,
      ...(inlineFields.when ? { when: inlineFields.when } : {}),
    },
    nextIndex,
  };
}

function parseMandatoryRulesFrontmatter(content: string, setId: string): MandatoryRule[] {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!frontmatterMatch) return [];

  const lines = frontmatterMatch[1].split('\n');
  const rulesHeaderIndex = lines.findIndex(line => /^rules:\s*$/.test(line.trim()));
  if (rulesHeaderIndex === -1) return [];

  const rules: MandatoryRule[] = [];
  let index = rulesHeaderIndex + 1;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (!/^\s*-\s+/.test(line)) break;

    const parsed = parseRuleEntry(lines, index);
    if (!parsed) break;

    const ruleIndex = rules.length + 1;
    rules.push({
      id: parsed.rule.id || `${setId}-${ruleIndex}`,
      level: parsed.rule.level,
      text: parsed.rule.text,
      ...(parsed.rule.when ? { when: parsed.rule.when } : {}),
    });
    index = parsed.nextIndex;
  }

  return rules;
}

function readMandatoryRuleSet(cwd: string, id: string): MandatoryRuleSet | null {
  const candidates = [
    resolve(cwd, `.specialists/mandatory-rules/${id}.md`),
    resolve(cwd, `.specialists/default/mandatory-rules/${id}.md`),
    resolve(cwd, `config/mandatory-rules/${id}.md`),
  ];

  const filePath = candidates.find(path => existsSync(path));
  if (!filePath) return null;

  const content = readFileSync(filePath, 'utf8');
  const rules = parseMandatoryRulesFrontmatter(content, id);
  if (rules.length > 0) return { id, rules };

  const body = content
    .replace(/^---\n[\s\S]*?\n---\n?/, '')
    .trim();
  if (!body) return null;

  return {
    id,
    rules: [{ id: `${id}-1`, level: 'required', text: body.replace(/\s+/g, ' ') }],
  };
}

function formatMandatoryRulesBlock(sets: MandatoryRuleSet[], inlineRules: MandatoryRule[] = []): string {
  if (sets.length === 0 && inlineRules.length === 0) return '';

  const sections = [
    ...sets.map(set => {
      const rules = set.rules.map(rule => `- [${rule.level}] ${rule.text}`).join('\n');
      return `### ${set.id}\n${rules}`;
    }),
    ...(inlineRules.length > 0
      ? [
          `### specialist-inline-rules\n${inlineRules.map((rule, index) => `- [${rule.level}] ${rule.text}${rule.id ? ` (id: ${rule.id})` : ` (id: inline-${index + 1})`}`).join('\n')}`,
        ]
      : []),
  ];

  return `## MANDATORY_RULES\n${sections.join('\n\n')}`;
}

function collectMandatoryRuleSets(cwd: string, setIds: string[]): MandatoryRuleSet[] {
  const seen = new Set<string>();
  const sets: MandatoryRuleSet[] = [];

  for (const id of setIds) {
    if (seen.has(id)) continue;
    seen.add(id);

    const set = readMandatoryRuleSet(cwd, id);
    if (!set) {
      console.warn(`[specialist runner] Missing mandatory-rules set: ${id}`);
      continue;
    }

    sets.push(set);
  }

  return sets;
}

export function buildMandatoryRulesInjection(
  specialistConfig: { cwd?: string; specialist?: { mandatory_rules?: SpecialistMandatoryRulesConfig } },
): MandatoryRulesInjection {
  const cwd = specialistConfig.cwd ?? process.cwd();
  const index = loadMandatoryRulesIndex(cwd);
  const mandatoryRules = specialistConfig.specialist?.mandatory_rules;

  const setIds = [
    ...(index?.required_template_sets ?? []),
    ...(index?.default_template_sets ?? []),
    ...(mandatoryRules?.template_sets ?? []),
  ];
  const sets = collectMandatoryRuleSets(cwd, setIds);
  const inlineRules = mandatoryRules?.inline_rules ?? [];
  const globalsDisabled = mandatoryRules?.disable_default_globals ?? false;
  const globals = globalsDisabled
    ? []
    : [{
        id: 'workflow-quick-rules',
        rules: [{ id: 'workflow-quick-rules-1', level: 'required', text: STATIC_WORKFLOW_RULES_BLOCK.trim().replace(/^##\s+Beads Workflow Quick Rules\n/, '') }],
      }];

  const block = formatMandatoryRulesBlock([...globals, ...sets], inlineRules);
  return {
    block,
    setsLoaded: [...globals.map((set) => set.id), ...sets.map((set) => set.id)],
    ruleCount: [...globals, ...sets].reduce((count, set) => count + set.rules.length, 0) + inlineRules.length,
    inlineRulesCount: inlineRules.length,
    globalsDisabled,
  };
}

export function buildMandatoryRulesBlock(specialistConfig: { cwd?: string; specialist?: { mandatory_rules?: SpecialistMandatoryRulesConfig } }): string {
  return buildMandatoryRulesInjection(specialistConfig).block;
}
