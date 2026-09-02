// ISSUE: xtrm-wiy5n.4.11 — quarantined from the default test baseline.
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { chmodSync, existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { countArg, getExtensionArgs, readLoggedPiArgv, writeFakePiBinary } from './helpers/fake-pi';

const ORIGINAL_CWD = process.cwd();
const REPO_ROOT = resolve(import.meta.dirname, '../..');
let tempRoot = '';
let externalRoot = '';
let firstRun: ChildProcess | undefined;

function waitForExit(child: ChildProcess): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', chunk => { stdout += String(chunk); });
    child.stderr?.on('data', chunk => { stderr += String(chunk); });
    child.on('close', code => resolve({ code, stdout, stderr }));
  });
}

beforeEach(() => {
  tempRoot = mkdtempSync(join(tmpdir(), 'sp-script-'));
  mkdirSync(join(tempRoot, '.specialists', 'user'), { recursive: true });
  mkdirSync(join(tempRoot, 'bin'), { recursive: true });
  writeFileSync(
    join(tempRoot, '.specialists', 'user', 'echo.specialist.json'),
    JSON.stringify({
      specialist: {
        metadata: { name: 'echo', version: '1.0.0', description: 'echo', category: 'test' },
        execution: {
          mode: 'auto',
          model: 'mock/model',
          timeout_ms: 1000,
          interactive: false,
          response_format: 'json',
          output_type: 'custom',
          permission_required: 'READ_ONLY',
          requires_worktree: false,
          max_retries: 0,
        },
        prompt: {
          task_template: 'say hi to $name',
          output_schema: { type: 'object', required: ['message'] },
          examples: [],
        },
        skills: {},
      },
    }),
  );
  writeFakePiBinary(tempRoot);
  writeFileSync(
    join(tempRoot, 'query-db.mjs'),
    [
      "import { Database } from 'bun:sqlite';",
      'const db = new Database(process.argv[2]);',
      'const rows = db.query(\'SELECT COUNT(*) AS count FROM specialist_jobs WHERE JSON_EXTRACT(status_json, "$.surface") = ?\').all(\'script_specialist\');',
      'console.log(JSON.stringify(rows));',
      'db.close();',
    ].join('\n'),
  );
  process.chdir(tempRoot);
  process.env.PATH = `${join(tempRoot, 'bin')}:${process.env.PATH ?? ''}`;
});

afterEach(() => {
  if (firstRun && !firstRun.killed) firstRun.kill('SIGTERM');
  delete process.env.PI_ARGV_LOG;
  delete process.env.PI_FAKE_EXIT_CODE;
  delete process.env.PI_FAKE_STDERR;
  process.chdir(ORIGINAL_CWD);
  if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
  if (externalRoot) rmSync(externalRoot, { recursive: true, force: true });
});

describe('sp script', () => {
  it('prints text by default and json with --json', async () => {
    const baseEnv = { ...process.env, PATH: `${join(tempRoot, 'bin')}:${process.env.PATH ?? ''}` };

    const plain = spawn('bun', ['src/index.ts', 'script', 'echo', '--vars', 'name=world', '--user-dir', tempRoot], {
      cwd: ORIGINAL_CWD,
      env: baseEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const plainResult = await waitForExit(plain);
    expect(plainResult.code).toBe(0);
    expect(plainResult.stdout).toContain('hello');

    const json = spawn('bun', ['src/index.ts', 'script', 'echo', '--vars', 'name=world', '--user-dir', tempRoot, '--json'], {
      cwd: ORIGINAL_CWD,
      env: baseEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const jsonResult = await waitForExit(json);
    expect(jsonResult.code).toBe(0);
    expect(JSON.parse(jsonResult.stdout).success).toBe(true);
  });

  it('uses --db-path as the exact observability database file', async () => {
    const baseEnv = { ...process.env, PATH: `${join(tempRoot, 'bin')}:${process.env.PATH ?? ''}` };
    const customDbPath = join(tempRoot, 'state', 'observability.db');

    const run = spawn('bun', ['src/index.ts', 'script', 'echo', '--vars', 'name=world', '--user-dir', tempRoot, '--db-path', customDbPath], {
      cwd: ORIGINAL_CWD,
      env: baseEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const result = await waitForExit(run);

    expect(result.code).toBe(0);
    expect(existsSync(customDbPath)).toBe(true);
    expect(existsSync(join(tempRoot, '.specialists', 'db', 'observability.db'))).toBe(false);
    const query = spawnSync('bun', [join(tempRoot, 'query-db.mjs'), customDbPath], { encoding: 'utf-8' });
    expect(query.status).toBe(0);
    const rows = JSON.parse(query.stdout.trim()) as Array<{ count: number }>;
    expect(rows[0].count).toBe(1);
  });

  it('records post-pre-script skill bytes in skill_sources', async () => {
    const skillDir = join(tempRoot, 'skills', 'mutable');
    const skillFile = join(skillDir, 'SKILL.md');
    const preScript = join(tempRoot, 'mutate-skill.sh');
    const dbPath = join(tempRoot, 'state', 'observability.db');
    const postScriptContent = '# post-script bytes\n';
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(skillFile, '# stale pre-script bytes\n');
    writeFileSync(preScript, `#!/bin/sh\nprintf '${postScriptContent.replace(/\n/g, '\\n')}' > "$PWD/skills/mutable/SKILL.md"\n`);
    chmodSync(preScript, 0o700);
    writeFileSync(
      join(tempRoot, '.specialists', 'user', 'mutable-skill.specialist.json'),
      JSON.stringify({
        specialist: {
          metadata: { name: 'mutable-skill', version: '1.0.0', description: 'test', category: 'test' },
          execution: {
            mode: 'auto',
            model: 'mock/model',
            timeout_ms: 1000,
            interactive: false,
            response_format: 'json',
            output_type: 'custom',
            permission_required: 'READ_ONLY',
            requires_worktree: false,
            max_retries: 0,
          },
          prompt: {
            task_template: 'say hi',
            output_schema: { type: 'object', required: ['message'] },
            examples: [],
          },
          skills: {
            paths: ['skills/mutable'],
            scripts: [{ run: './mutate-skill.sh', phase: 'pre', inject_output: false }],
          },
        },
      }),
    );
    const queryScript = join(tempRoot, 'query-skill-source.mjs');
    writeFileSync(queryScript, [
      "import { Database } from 'bun:sqlite';",
      'const db = new Database(process.argv[2]);',
      "const row = db.query('SELECT status_json FROM specialist_jobs LIMIT 1').get();",
      'console.log(row.status_json);',
      'db.close();',
    ].join('\n'));

    const run = spawn('bun', [
      join(REPO_ROOT, 'src/index.ts'),
      'script',
      'mutable-skill',
      '--user-dir', tempRoot,
      '--db-path', dbPath,
      '--allow-local-scripts',
      '--json',
    ], {
      cwd: tempRoot,
      env: { ...process.env, PATH: `${join(tempRoot, 'bin')}:${process.env.PATH ?? ''}` },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const result = await waitForExit(run);
    const query = spawnSync('bun', [queryScript, dbPath], { encoding: 'utf-8' });
    const status = JSON.parse(query.stdout.trim()) as { skill_sources: Array<{ sha256: string }> };

    expect(result.code).toBe(0);
    expect(query.status).toBe(0);
    expect(status.skill_sources).toEqual([{
      path: skillDir,
      sha256: createHash('sha256').update(postScriptContent).digest('hex'),
      source: 'skills.paths',
      attestation: 'observation_time_only',
    }]);
  });

  it('rejects a post-pre-script symlink swap before Pi starts without disclosing host paths', async () => {
    const skillDir = join(tempRoot, 'skills', 'swapped');
    const skillFile = join(skillDir, 'SKILL.md');
    const replacement = join(tempRoot, 'replacement.md');
    const preScript = join(tempRoot, 'swap-skill.sh');
    const argvLog = join(tempRoot, 'pi-argv.jsonl');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(skillFile, '# validated bytes\n');
    writeFileSync(replacement, '# replacement bytes\n');
    writeFileSync(preScript, '#!/bin/sh\nrm "$PWD/skills/swapped/SKILL.md"\nln -s "$PWD/replacement.md" "$PWD/skills/swapped/SKILL.md"\n');
    chmodSync(preScript, 0o700);
    writeFileSync(
      join(tempRoot, '.specialists', 'user', 'swapped-skill.specialist.json'),
      JSON.stringify({
        specialist: {
          metadata: { name: 'swapped-skill', version: '1.0.0', description: 'test', category: 'test' },
          execution: {
            mode: 'auto',
            model: 'mock/model',
            timeout_ms: 1000,
            interactive: false,
            response_format: 'json',
            output_type: 'custom',
            permission_required: 'READ_ONLY',
            requires_worktree: false,
            max_retries: 0,
          },
          prompt: {
            task_template: 'say hi',
            output_schema: { type: 'object', required: ['message'] },
            examples: [],
          },
          skills: {
            paths: ['skills/swapped'],
            scripts: [{ run: './swap-skill.sh', phase: 'pre', inject_output: false }],
          },
        },
      }),
    );

    const run = spawn('bun', [
      join(REPO_ROOT, 'src/index.ts'),
      'script',
      'swapped-skill',
      '--user-dir', tempRoot,
      '--allow-local-scripts',
      '--json',
    ], {
      cwd: tempRoot,
      env: {
        ...process.env,
        PATH: `${join(tempRoot, 'bin')}:${process.env.PATH ?? ''}`,
        PI_ARGV_LOG: argvLog,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const result = await waitForExit(run);
    const output = `${result.stdout}${result.stderr}`;

    expect(result.code).toBe(1);
    expect(existsSync(argvLog)).toBe(false);
    expect(output).toContain('skill source is unreadable after trusted pre-scripts; rejected');
    expect(output).not.toContain(tempRoot);
    expect(output).not.toContain(homedir());
  });

  it('rejects a post-pre-script intermediate-directory escape before Pi starts', async () => {
    const skillDir = join(tempRoot, 'skills', 'ancestor-swap');
    const preScript = join(tempRoot, 'swap-ancestor.sh');
    const argvLog = join(tempRoot, 'pi-ancestor-swap.jsonl');
    externalRoot = mkdtempSync(join(tmpdir(), 'sp-script-external-'));
    const externalSkills = join(externalRoot, 'skills');
    mkdirSync(skillDir, { recursive: true });
    mkdirSync(join(externalSkills, 'ancestor-swap'), { recursive: true });
    writeFileSync(join(skillDir, 'SKILL.md'), '# validated bytes\n');
    writeFileSync(join(externalSkills, 'ancestor-swap', 'SKILL.md'), '# escaped bytes\n');
    writeFileSync(
      preScript,
      `#!/bin/sh\nmv "$PWD/skills" "$PWD/skills-original"\nln -s "${externalSkills}" "$PWD/skills"\n`,
    );
    chmodSync(preScript, 0o700);
    writeFileSync(
      join(tempRoot, '.specialists', 'user', 'ancestor-swap.specialist.json'),
      JSON.stringify({
        specialist: {
          metadata: { name: 'ancestor-swap', version: '1.0.0', description: 'test', category: 'test' },
          execution: {
            mode: 'auto',
            model: 'mock/model',
            timeout_ms: 1000,
            interactive: false,
            response_format: 'json',
            output_type: 'custom',
            permission_required: 'READ_ONLY',
            requires_worktree: false,
            max_retries: 0,
          },
          prompt: {
            task_template: 'say hi',
            output_schema: { type: 'object', required: ['message'] },
            examples: [],
          },
          skills: {
            paths: ['skills/ancestor-swap'],
            scripts: [{ run: './swap-ancestor.sh', phase: 'pre', inject_output: false }],
          },
        },
      }),
    );

    const run = spawn('bun', [
      join(REPO_ROOT, 'src/index.ts'),
      'script',
      'ancestor-swap',
      '--user-dir', tempRoot,
      '--allow-local-scripts',
      '--json',
    ], {
      cwd: tempRoot,
      env: {
        ...process.env,
        PATH: `${join(tempRoot, 'bin')}:${process.env.PATH ?? ''}`,
        PI_ARGV_LOG: argvLog,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const result = await waitForExit(run);
    const output = `${result.stdout}${result.stderr}`;

    expect(result.code).toBe(1);
    expect(existsSync(argvLog)).toBe(false);
    expect(output).toContain('skill source is unreadable after trusted pre-scripts; rejected');
    expect(output).not.toContain(tempRoot);
    expect(output).not.toContain(externalRoot);
    expect(output).not.toContain(homedir());
  });

  it('forwards ordered enabled extension sources through direct script path and drops offline for remote sources', async () => {
    const argvLog = join(tempRoot, 'pi-argv.jsonl');
    mkdirSync(join(tempRoot, 'workspace', 'local-extension'), { recursive: true });
    writeFileSync(
      join(tempRoot, '.specialists', 'user', 'echo-medium.specialist.json'),
      JSON.stringify({
        specialist: {
          metadata: { name: 'echo-medium', version: '1.0.0', description: 'echo', category: 'test' },
          execution: {
            mode: 'auto',
            model: 'mock/model',
            timeout_ms: 1000,
            interactive: false,
            response_format: 'json',
            output_type: 'custom',
            permission_required: 'READ_ONLY',
            requires_worktree: false,
            max_retries: 0,
            extensions: {
              serena: false,
              gitnexus: false,
              'npm:@jaggerxtrm/pi-service-knowledge@1.0.0': true,
              './local-extension': true,
              'git:https://example.test/ext.git': true,
              'https://example.test/disabled': false,
            },
          },
          prompt: {
            task_template: 'say hi to $name',
            output_schema: { type: 'object', required: ['message'] },
            examples: [],
          },
          skills: {},
        },
      }),
    );

    const run = spawn('bun', [join(REPO_ROOT, 'src/index.ts'), 'script', 'echo-medium', '--vars', 'name=world', '--user-dir', tempRoot, '--json'], {
      cwd: join(tempRoot, 'workspace'),
      env: { ...process.env, PATH: `${join(tempRoot, 'bin')}:${process.env.PATH ?? ''}`, PI_ARGV_LOG: argvLog },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const result = await waitForExit(run);
    const [argv] = readLoggedPiArgv(argvLog);
    const extensionArgs = getExtensionArgs(argv);

    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout).success).toBe(true);
    expect(argv).not.toContain('--offline');
    expect(extensionArgs).toEqual(expect.arrayContaining(['npm:@jaggerxtrm/pi-service-knowledge@1.0.0', './local-extension', 'git:https://example.test/ext.git']));
    expect(extensionArgs.filter((value) => ['npm:@jaggerxtrm/pi-service-knowledge@1.0.0', './local-extension', 'git:https://example.test/ext.git'].includes(value))).toEqual([
      'npm:@jaggerxtrm/pi-service-knowledge@1.0.0',
      './local-extension',
      'git:https://example.test/ext.git',
    ]);
    expect(countArg(extensionArgs, 'npm:@jaggerxtrm/pi-service-knowledge@1.0.0')).toBe(1);
    expect(countArg(extensionArgs, './local-extension')).toBe(1);
    expect(countArg(extensionArgs, 'git:https://example.test/ext.git')).toBe(1);
    expect(extensionArgs).not.toContain('serena');
    expect(extensionArgs).not.toContain('gitnexus');
    expect(extensionArgs).not.toContain('https://example.test/disabled');
    expect(extensionArgs.join(' ')).not.toContain('service-skills');
  });

  it('keeps offline for local-only direct script path and surfaces Pi stderr on failure', async () => {
    const argvLog = join(tempRoot, 'pi-direct-argv.jsonl');
    mkdirSync(join(tempRoot, 'workspace', 'local-extension'), { recursive: true });
    writeFileSync(
      join(tempRoot, '.specialists', 'user', 'echo-local.specialist.json'),
      JSON.stringify({
        specialist: {
          metadata: { name: 'echo-local', version: '1.0.0', description: 'echo', category: 'test' },
          execution: {
            mode: 'auto',
            model: 'mock/model',
            timeout_ms: 1000,
            interactive: false,
            response_format: 'json',
            output_type: 'custom',
            permission_required: 'READ_ONLY',
            requires_worktree: false,
            max_retries: 0,
            extensions: {
              serena: false,
              './local-extension': true,
              'npm:@disabled/example': false,
            },
          },
          prompt: {
            task_template: 'say hi to $name',
            output_schema: { type: 'object', required: ['message'] },
            examples: [],
          },
          skills: {},
        },
      }),
    );

    const run = spawn('bun', [join(REPO_ROOT, 'src/index.ts'), 'script', 'echo-local', '--vars', 'name=world', '--user-dir', tempRoot, '--json'], {
      cwd: join(tempRoot, 'workspace'),
      env: {
        ...process.env,
        PATH: `${join(tempRoot, 'bin')}:${process.env.PATH ?? ''}`,
        PI_ARGV_LOG: argvLog,
        PI_FAKE_EXIT_CODE: '17',
        PI_FAKE_STDERR: 'pi-fake-broken',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const result = await waitForExit(run);
    const [argv] = readLoggedPiArgv(argvLog);
    const extensionArgs = getExtensionArgs(argv);

    expect(result.code).toBe(1);
    expect(argv).toContain('--offline');
    expect(extensionArgs).toContain('./local-extension');
    expect(countArg(extensionArgs, './local-extension')).toBe(1);
    expect(extensionArgs).not.toContain('npm:@disabled/example');
    expect(extensionArgs).not.toContain('serena');
    expect(extensionArgs.join(' ')).not.toContain('service-skills');
    expect(`${result.stdout}${result.stderr}`).toContain('pi-fake-broken');
  });

  it('returns 75 when single-instance lock busy', async () => {
    const baseEnv = { ...process.env, PATH: `${join(tempRoot, 'bin')}:${process.env.PATH ?? ''}` };
    const lockPath = join(tempRoot, 'script.lock');

    firstRun = spawn('bun', ['src/index.ts', 'script', 'echo', '--vars', 'name=world', '--user-dir', tempRoot, '--single-instance', lockPath], {
      cwd: ORIGINAL_CWD,
      env: { ...baseEnv, PI_FAKE_DELAY_MS: '250' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    await new Promise(resolve => setTimeout(resolve, 100));

    const second = spawn('bun', ['src/index.ts', 'script', 'echo', '--vars', 'name=world', '--user-dir', tempRoot, '--single-instance', lockPath], {
      cwd: ORIGINAL_CWD,
      env: baseEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const secondResult = await waitForExit(second);
    const firstResult = await waitForExit(firstRun);
    const codes = [firstResult.code, secondResult.code].sort();
    const successResult = firstResult.code === 0 ? firstResult : secondResult;

    expect(codes).toEqual([0, 75]);
    expect(successResult.stdout).toContain('hello');
  });
});
