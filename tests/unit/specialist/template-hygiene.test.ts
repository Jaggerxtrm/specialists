import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

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
  it('sync-docs templates keep bead_id guidance explicit in config and defaults', () => {
    const config = readSpecialistConfig('config/specialists/sync-docs.specialist.json');
    const defaults = readSpecialistConfig('.specialists/default/sync-docs.specialist.json');

    expect(config.specialist.prompt.task_template).toContain('Bead context ID: $bead_id (empty = no bead linked)');
    expect(defaults.specialist.prompt.task_template).toContain('Bead context ID: $bead_id (empty = no bead linked)');
  });

  it('planner templates do not include literal $bead_id tokens in system prompt', () => {
    const config = readSpecialistConfig('config/specialists/planner.specialist.json');
    const defaults = readSpecialistConfig('.specialists/default/planner.specialist.json');

    expect(config.specialist.prompt.system).not.toContain('$bead_id');
    expect(defaults.specialist.prompt.system).not.toContain('$bead_id');
  });

  it('overthinker templates do not reference dead variables', () => {
    const config = readSpecialistConfig('config/specialists/overthinker.specialist.json');
    const defaults = readSpecialistConfig('.specialists/default/overthinker.specialist.json');

    for (const content of [config.specialist.prompt.task_template, defaults.specialist.prompt.task_template]) {
      expect(content).not.toContain('$context_files');
      expect(content).not.toContain('$iterations');
    }
  });
});
