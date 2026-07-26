import { describe, it, expect } from 'vitest';
import { loadToolCatalogIndex, SPECIALIST_TOOL_PRECEDENCE } from '../../../src/specialist/tool-catalog.js';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const EXPECTED_CONFLICT_SEMANTICS = '(1) most restrictive wins for tool inclusion\n * (2) exception: runtime health degradation or catalog incompatibility restores native fallbacks\n * (3) hard-deny in specialist override does not override runtime health downgrade';

const EXPECTED_NATIVE = {
  READ_ONLY: ['read', 'grep', 'find', 'ls'],
  LOW: ['read', 'grep', 'find', 'ls', 'bash'],
  MEDIUM: ['read', 'grep', 'find', 'ls', 'bash', 'edit'],
  HIGH: ['read', 'grep', 'find', 'ls', 'bash', 'edit', 'write'],
};

const EXPECTED_GITNEXUS = {
  READ_ONLY: ['gitnexus_list_repos', 'gitnexus_query', 'gitnexus_context', 'gitnexus_impact', 'gitnexus_detect_changes'],
  LOW: ['gitnexus_list_repos', 'gitnexus_query', 'gitnexus_context', 'gitnexus_impact', 'gitnexus_detect_changes'],
  MEDIUM: ['gitnexus_list_repos', 'gitnexus_query', 'gitnexus_context', 'gitnexus_impact', 'gitnexus_detect_changes', 'gitnexus_rename', 'gitnexus_cypher'],
  HIGH: ['gitnexus_list_repos', 'gitnexus_query', 'gitnexus_context', 'gitnexus_impact', 'gitnexus_detect_changes', 'gitnexus_rename', 'gitnexus_cypher'],
};

const EXPECTED_SERENA = {
  READ_ONLY: ['serena_list_tools', 'find_symbol', 'find_referencing_symbols', 'read_file', 'get_symbols_overview', 'jet_brains_get_symbols_overview', 'jet_brains_find_symbol', 'jet_brains_find_referencing_symbols', 'jet_brains_type_hierarchy', 'search_for_pattern', 'list_dir', 'find_file', 'get_current_config', 'activate_project', 'check_onboarding_performed', 'initial_instructions', 'think_about_collected_information', 'think_about_task_adherence', 'think_about_whether_you_are_done', 'list_memories', 'read_memory'],
  LOW: ['serena_list_tools', 'find_symbol', 'find_referencing_symbols', 'read_file', 'get_symbols_overview', 'jet_brains_get_symbols_overview', 'jet_brains_find_symbol', 'jet_brains_find_referencing_symbols', 'jet_brains_type_hierarchy', 'search_for_pattern', 'list_dir', 'find_file', 'get_current_config', 'activate_project', 'check_onboarding_performed', 'initial_instructions', 'think_about_collected_information', 'think_about_task_adherence', 'think_about_whether_you_are_done', 'list_memories', 'read_memory', 'execute_shell_command'],
  MEDIUM: ['serena_list_tools', 'find_symbol', 'find_referencing_symbols', 'read_file', 'get_symbols_overview', 'jet_brains_get_symbols_overview', 'jet_brains_find_symbol', 'jet_brains_find_referencing_symbols', 'jet_brains_type_hierarchy', 'search_for_pattern', 'list_dir', 'find_file', 'get_current_config', 'activate_project', 'check_onboarding_performed', 'initial_instructions', 'think_about_collected_information', 'think_about_task_adherence', 'think_about_whether_you_are_done', 'list_memories', 'read_memory', 'execute_shell_command', 'insert_after_symbol', 'replace_symbol_body', 'insert_before_symbol', 'rename_symbol', 'restart_language_server', 'create_text_file', 'replace_content', 'delete_lines', 'replace_lines', 'insert_at_line', 'remove_project', 'switch_modes', 'open_dashboard', 'onboarding', 'prepare_for_new_conversation', 'summarize_changes', 'write_memory', 'delete_memory', 'rename_memory', 'edit_memory', 'serena_mcp_reset'],
  HIGH: ['serena_list_tools', 'find_symbol', 'find_referencing_symbols', 'read_file', 'get_symbols_overview', 'jet_brains_get_symbols_overview', 'jet_brains_find_symbol', 'jet_brains_find_referencing_symbols', 'jet_brains_type_hierarchy', 'search_for_pattern', 'list_dir', 'find_file', 'get_current_config', 'activate_project', 'check_onboarding_performed', 'initial_instructions', 'think_about_collected_information', 'think_about_task_adherence', 'think_about_whether_you_are_done', 'list_memories', 'read_memory', 'execute_shell_command', 'insert_after_symbol', 'replace_symbol_body', 'insert_before_symbol', 'rename_symbol', 'restart_language_server', 'create_text_file', 'replace_content', 'delete_lines', 'replace_lines', 'insert_at_line', 'remove_project', 'switch_modes', 'open_dashboard', 'onboarding', 'prepare_for_new_conversation', 'summarize_changes', 'write_memory', 'delete_memory', 'rename_memory', 'edit_memory', 'serena_mcp_reset'],
};

function readCatalog(path: string) {
  return readFile(join(process.cwd(), path), 'utf8').then(loadToolCatalogIndex);
}

describe('tool catalog foundation', () => {
  it('encodes precedence order', async () => {
    const index = await readCatalog('config/catalog/index.json');
    expect(index.precedence_order).toEqual(SPECIALIST_TOOL_PRECEDENCE);
    expect(index.catalogs.map(c => c.catalog)).toEqual(['native', 'gitnexus', 'serena']);
  });

  it('documents conflict resolution semantics', async () => {
    const content = await readFile(join(process.cwd(), 'src/specialist/tool-catalog.ts'), 'utf8');
    expect(content).toContain(EXPECTED_CONFLICT_SEMANTICS);
  });

  it('validates native catalog content', async () => {
    const index = await readCatalog('config/catalog/index.json');
    const native = index.catalogs.find(c => c.catalog === 'native');
    expect(native?.package).toBe('specialists');
    expect(native?.version).toBe('3.11.0');
    expect(native?.source_tiers).toEqual(EXPECTED_NATIVE);
  });

  it('validates gitnexus catalog content', async () => {
    const index = await readCatalog('config/catalog/index.json');
    const gitnexus = index.catalogs.find(c => c.catalog === 'gitnexus');
    expect(gitnexus?.package).toBe('pi-gitnexus');
    expect(gitnexus?.version).toBe('0.6.1');
    expect(gitnexus?.source_tiers).toEqual(EXPECTED_GITNEXUS);
  });

  it('validates serena catalog content', async () => {
    const index = await readCatalog('config/catalog/index.json');
    const serena = index.catalogs.find(c => c.catalog === 'serena');
    expect(serena?.package).toBe('pi-serena-tools');
    expect(serena?.version).toBe('0.1.0');
    expect(serena?.source_tiers).toEqual(EXPECTED_SERENA);
  });
});
