import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { SpecialistLoader } from '../../../src/specialist/loader.js';
import {
  GLOBAL_USER_CONFIG_DOC,
  buildSpecialistOverrideTemplate,
} from '../../../src/specialist/global-config.js';

const repoRoot = resolve(import.meta.dirname, '../../..');

function runInitGlobal(home: string) {
  return spawnSync('bun', ['run', join(repoRoot, 'src/index.ts'), 'init', '--global'], {
    cwd: repoRoot,
    encoding: 'utf-8',
    env: {
      ...process.env,
      HOME: home,
      NO_COLOR: '1',
      SPECIALISTS_INIT_FORCE: '1',
      XDG_CONFIG_HOME: '',
    },
  });
}

describe('integration: specialists init --global', () => {
  let tempHome: string;

  afterEach(async () => {
    if (tempHome) await rm(tempHome, { recursive: true, force: true });
  });

  it('writes doc sentinel, full override templates, discovery hints, and stays idempotent', async () => {
    tempHome = await mkdtemp(join(tmpdir(), 'specialists-int-init-global-'));
    // Hermetic HOME (unitAI-o1fs4): list() must see only the package layer, never the live
    // user.json — a legacy unpinned npm key there now fails closed at the merge boundary.
    const originalHome = process.env.HOME;
    process.env.HOME = tempHome;
    const loader = new SpecialistLoader({ projectDir: repoRoot });
    const shipped = await loader.list();
    process.env.HOME = originalHome;
    const shippedNames = shipped.map(item => item.name).sort();

    expect(shippedNames).not.toContain('_doc');

    const first = runInitGlobal(tempHome);
    expect(first.status).toBe(0);
    expect(first.stderr).toBe('');
    expect(first.stdout).toContain('extensions');
    expect(first.stdout).toMatch(/fallback_models|fallback chains/);
    expect(first.stdout).toMatch(/@preset|preset refs|preset references/);

    const userConfigPath = join(tempHome, '.config', 'specialists', 'user.json');
    const firstParsed = JSON.parse(await readFile(userConfigPath, 'utf-8')) as Record<string, unknown>;
    const firstSpecialistNames = Object.keys(firstParsed).filter(name => !name.startsWith('_')).sort();

    expect(firstParsed._doc).toBe(GLOBAL_USER_CONFIG_DOC);
    expect(firstSpecialistNames).toEqual(shippedNames);
    expect(firstSpecialistNames).toHaveLength(shipped.length);

    for (const name of shippedNames) {
      expect(firstParsed[name]).toEqual(buildSpecialistOverrideTemplate());
    }

    firstParsed._doc = GLOBAL_USER_CONFIG_DOC;
    (firstParsed[shippedNames[0]] as Record<string, unknown>).beads_write_notes = false;
    const execution = (firstParsed[shippedNames[0]] as Record<string, unknown>).execution as Record<string, unknown>;
    execution.model = 'openai-codex/gpt-5.4-mini';
    execution.extensions = {
      gitnexus: false,
      'npm:@jaggerxtrm/pi-service-knowledge@1.0.0': true,
    };
    await writeFile(userConfigPath, `${JSON.stringify(firstParsed, null, 2)}\n`, 'utf-8');

    const second = runInitGlobal(tempHome);
    expect(second.status).toBe(0);
    expect(second.stderr).toBe('');

    const secondParsed = JSON.parse(await readFile(userConfigPath, 'utf-8')) as Record<string, unknown>;
    expect(secondParsed._doc).toBe(GLOBAL_USER_CONFIG_DOC);
    expect((secondParsed[shippedNames[0]] as Record<string, unknown>).beads_write_notes).toBe(false);
    const secondExecution = ((secondParsed[shippedNames[0]] as Record<string, unknown>).execution as Record<string, unknown>);
    expect(secondExecution.model).toBe('openai-codex/gpt-5.4-mini');
    expect(secondExecution.extensions).toEqual({
      gitnexus: false,
      'npm:@jaggerxtrm/pi-service-knowledge@1.0.0': true,
    });
    expect(Object.keys(secondParsed).filter(name => name === '_doc')).toHaveLength(1);
  });
});
