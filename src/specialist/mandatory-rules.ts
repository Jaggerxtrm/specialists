import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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
