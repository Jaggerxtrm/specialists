import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface MandatoryRule {
  id: string;
  level: string;
  text: string;
}

export interface MandatoryRuleSet {
  id: string;
  rules: MandatoryRule[];
}

interface MandatoryRulesIndex {
  required_template_sets?: string[];
  default_template_sets?: string[];
}

function readJsonFile<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, 'utf8')) as T;
}

export function loadMandatoryRulesIndex(cwd: string): MandatoryRulesIndex | null {
  const indexPath = resolve(cwd, 'config/mandatory-rules/index.json');
  if (!existsSync(indexPath)) {
    console.warn('[specialist runner] Missing config/mandatory-rules/index.json; skipping MANDATORY_RULES injection');
    return null;
  }

  return readJsonFile<MandatoryRulesIndex>(indexPath);
}

function readMandatoryRuleSet(cwd: string, id: string): MandatoryRuleSet | null {
  const candidates = [
    resolve(cwd, `.specialists/mandatory-rules/${id}.md`),
    resolve(cwd, `config/mandatory-rules/${id}.md`),
  ];

  const filePath = candidates.find(path => existsSync(path));
  if (!filePath) return null;

  const content = readFileSync(filePath, 'utf8');
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n?/);
  const body = frontmatterMatch ? content.slice(frontmatterMatch[0].length) : content;
  const rules = body
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map((text, index) => ({ id: `${id}-${index + 1}`, level: 'required', text }));

  return { id, rules };
}

function formatMandatoryRulesBlock(sets: MandatoryRuleSet[]): string {
  if (sets.length === 0) return '';

  const sections = sets.map(set => {
    const rules = set.rules.map(rule => `- [${rule.level}] ${rule.text}`).join('\n');
    return `### ${set.id}\n${rules}`;
  });

  return `## MANDATORY_RULES\n${sections.join('\n\n')}`;
}

export function buildMandatoryRulesBlock(specialistConfig: { cwd?: string }): string {
  const cwd = specialistConfig.cwd ?? process.cwd();
  const index = loadMandatoryRulesIndex(cwd);
  if (!index) return '';

  const setIds = [
    ...(index.required_template_sets ?? []),
    ...(index.default_template_sets ?? []),
  ];
  const sets = setIds
    .map(id => readMandatoryRuleSet(cwd, id))
    .filter((set): set is MandatoryRuleSet => set !== null);

  return formatMandatoryRulesBlock(sets);
}
