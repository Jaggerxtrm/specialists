import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

// The `.specialists/default/` mirror these tests used to cross-check was retired by
// 31a6421c and is no longer walked by the loader (src/specialist/loader.ts:136-142),
// so `config/specialists/` is the only authoritative copy left to assert on.
type SpecialistConfig = {
  specialist: {
    prompt: {
      system?: string;
      task_template: string;
    };
  };
};

function readSpecialistConfig(path: string): SpecialistConfig {
  return JSON.parse(readFileSync(path, 'utf-8')) as SpecialistConfig;
}

describe('specialist template hygiene', () => {
  // v3.1.0 (c9b37118) replaced the old "(empty = no bead linked)" note: for sync-docs an
  // empty bead is a hard BLOCKED, not a benign no-bead run. Assert that stronger contract.
  it('sync-docs template keeps bead_id guidance explicit', () => {
    const config = readSpecialistConfig('config/specialists/sync-docs.specialist.json');

    expect(config.specialist.prompt.task_template).toContain('Bead context ID: $bead_id');
    expect(config.specialist.prompt.task_template).toContain('The empty-bead/no-bead case is itself a BLOCKED.');
  });

  it('planner template does not include literal $bead_id tokens in system prompt', () => {
    const config = readSpecialistConfig('config/specialists/planner.specialist.json');

    expect(config.specialist.prompt.system).not.toContain('$bead_id');
  });

  it('overthinker template does not reference dead variables', () => {
    const config = readSpecialistConfig('config/specialists/overthinker.specialist.json');

    expect(config.specialist.prompt.task_template).not.toContain('$context_files');
    expect(config.specialist.prompt.task_template).not.toContain('$iterations');
  });
});
