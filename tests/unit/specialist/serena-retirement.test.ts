// tests/unit/specialist/serena-retirement.test.ts
//
// Negative contract for unitAI-e67up.8 (K4-Specialists Serena retirement):
// Specialists must never probe, spawn, inject, or require pi-serena-tools /
// serena-pool, and no active catalog or specialist rule may advertise Serena
// tools. Legacy configuration carrying execution.extensions.serena must keep
// parsing (accepted-but-ignored / deprecated), never crash.
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadToolCatalogIndex, SPECIALIST_TOOL_PRECEDENCE } from '../../../src/specialist/tool-catalog.js';
import { LEGACY_PERMISSION_TOOL_STRINGS, resolveManifestTools, type ToolCatalog } from '../../../src/specialist/manifest-resolver.js';
import { parseSpecialist } from '../../../src/specialist/schema.js';
import { GlobalUserConfigSchema, buildSpecialistOverrideTemplate } from '../../../src/specialist/global-config.js';

const ROOT = process.cwd();

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function shippedSpecialistPaths(): string[] {
  const dir = join(ROOT, 'config', 'specialists');
  return readdirSync(dir)
    .filter((entry) => entry.endsWith('.specialist.json'))
    .map((entry) => join(dir, entry));
}

/** Tool names owned by the retired pi-serena-tools extension. */
const SERENA_TOOL_NAMES = [
  'serena_list_tools',
  'serena_mcp_reset',
  'find_symbol',
  'find_referencing_symbols',
  'read_file',
  'get_symbols_overview',
  'jet_brains_get_symbols_overview',
  'jet_brains_find_symbol',
  'jet_brains_find_referencing_symbols',
  'jet_brains_type_hierarchy',
  'search_for_pattern',
  'list_dir',
  'find_file',
  'get_current_config',
  'activate_project',
  'check_onboarding_performed',
  'initial_instructions',
  'think_about_collected_information',
  'think_about_task_adherence',
  'think_about_whether_you_are_done',
  'list_memories',
  'read_memory',
  'execute_shell_command',
  'insert_after_symbol',
  'replace_symbol_body',
  'insert_before_symbol',
  'rename_symbol',
  'restart_language_server',
  'create_text_file',
  'replace_content',
  'delete_lines',
  'replace_lines',
  'insert_at_line',
  'remove_project',
  'switch_modes',
  'open_dashboard',
  'onboarding',
  'prepare_for_new_conversation',
  'summarize_changes',
  'write_memory',
  'delete_memory',
  'rename_memory',
  'edit_memory',
];

describe('Serena retirement — catalog negative contract', () => {
  it('shipped catalog index declares native, gitnexus, and python-kernel layers (no serena)', () => {
    const index = loadToolCatalogIndex(readFileSync(join(ROOT, 'config', 'catalog', 'index.json'), 'utf8'));
    expect(index.precedence_order).toEqual(['native', 'gitnexus', 'python-kernel', 'service-knowledge']);
    expect(index.catalogs.map((catalog) => catalog.catalog)).toEqual(['native', 'gitnexus', 'python-kernel', 'service-knowledge']);
    expect(SPECIALIST_TOOL_PRECEDENCE).toEqual(['native', 'gitnexus', 'python-kernel', 'service-knowledge']);
  });

  it('no serena catalog file ships in config/catalog', () => {
    const entries = readdirSync(join(ROOT, 'config', 'catalog'));
    expect(entries.some((entry) => /serena/i.test(entry))).toBe(false);
  });

  it('no catalog advertises Serena package or tools', () => {
    for (const entry of readdirSync(join(ROOT, 'config', 'catalog'))) {
      const content = readFileSync(join(ROOT, 'config', 'catalog', entry), 'utf8');
      expect(content, entry).not.toMatch(/serena/i);
      for (const tool of SERENA_TOOL_NAMES) {
        expect(content, `${entry} advertises ${tool}`).not.toContain(`"${tool}"`);
      }
    }
  });

  it('legacy permission fallback strings carry no Serena tools', () => {
    for (const [tier, tools] of Object.entries(LEGACY_PERMISSION_TOOL_STRINGS)) {
      const names = tools.split(',');
      for (const serenaTool of SERENA_TOOL_NAMES) {
        expect(names, `${tier} contains ${serenaTool}`).not.toContain(serenaTool);
      }
      expect(tools, tier).not.toMatch(/serena/i);
    }
  });

  it('resolver output never includes Serena tools for any tier', () => {
    const index = loadToolCatalogIndex(readFileSync(join(ROOT, 'config', 'catalog', 'index.json'), 'utf8'));
    const catalogs = index.catalogs as unknown as ToolCatalog[];
    for (const tier of ['READ_ONLY', 'LOW', 'MEDIUM', 'HIGH'] as const) {
      const result = resolveManifestTools({
        tier,
        catalogs,
        catalogDefaultOverrides: index.default_overrides,
        extensionState: { gitnexus: { enabled: true, health: 'loaded_healthy' } },
      });
      for (const serenaTool of SERENA_TOOL_NAMES) {
        expect(result.toolsList, `${tier} resolved ${serenaTool}`).not.toContain(serenaTool);
      }
      expect(result.tools, tier).not.toMatch(/serena/i);
    }
  });
});

describe('Serena retirement — mandatory rules and specialist definitions', () => {
  it('no serena-cheatsheet rule ships in config/mandatory-rules', () => {
    const entries = readdirSync(join(ROOT, 'config', 'mandatory-rules'));
    expect(entries.some((entry) => /serena/i.test(entry))).toBe(false);
    const indexContent = readFileSync(join(ROOT, 'config', 'mandatory-rules', 'index.json'), 'utf8');
    expect(indexContent).not.toMatch(/serena/i);
  });

  it('shipped specialist definitions carry no Serena references', () => {
    for (const specPath of shippedSpecialistPaths()) {
      const content = readFileSync(specPath, 'utf8');
      expect(content, specPath).not.toMatch(/serena/i);
      for (const tool of SERENA_TOOL_NAMES) {
        expect(content, `${specPath} advertises ${tool}`).not.toContain(tool);
      }
    }
  });

  it('shipped mandatory rules do not route roles to Serena-only tooling', () => {
    const dir = join(ROOT, 'config', 'mandatory-rules');
    for (const entry of readdirSync(dir)) {
      if (!entry.endsWith('.md')) continue;
      const content = readFileSync(join(dir, entry), 'utf8');
      for (const tool of SERENA_TOOL_NAMES) {
        expect(content, `${entry} advertises ${tool}`).not.toContain(tool);
      }
      expect(content, entry).not.toMatch(/serena-cheatsheet/i);
    }
  });
});

describe('Serena retirement — legacy config backward compatibility', () => {
  it('new global override templates do not emit the retired Serena key', () => {
    const template = buildSpecialistOverrideTemplate();
    expect(template.execution.extensions).toEqual({ gitnexus: null });
    expect(template.execution.extensions).not.toHaveProperty('serena');
  });

  it('specialist config with execution.extensions.serena still parses (accepted-but-ignored)', async () => {
    const legacy = {
      specialist: {
        metadata: {
          name: 'legacy-demo',
          version: '1.0.0',
          description: 'legacy specialist with serena extension flag',
          category: 'testing',
        },
        execution: {
          model: 'claude',
          permission_required: 'READ_ONLY',
          extensions: { serena: false, gitnexus: true },
        },
        prompt: { task_template: 'noop' },
        output_schema: { type: 'object' },
      },
    };
    const parsed = await parseSpecialist(JSON.stringify(legacy));
    // Field survives parsing so legacy configs remain readable; runtime ignores it.
    expect(parsed.specialist.execution.extensions?.serena).toBe(false);
    expect(parsed.specialist.execution.extensions?.gitnexus).toBe(true);
  });

  it('global user override with execution.extensions.serena still validates', () => {
    const template = buildSpecialistOverrideTemplate();
    template.execution.extensions = { serena: false, gitnexus: null };
    const parsed = GlobalUserConfigSchema.parse({ demo: template });
    const override = parsed.demo as { execution?: { extensions?: Record<string, unknown> } };
    expect(override.execution?.extensions?.serena).toBe(false);
  });
});
