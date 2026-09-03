import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { countArg, getExtensionArgs, readLoggedPiArgv, writeFakePiBinary } from './helpers/fake-pi';

const repoRoot = resolve(import.meta.dirname, '../..');
const ENABLED = process.env.PACKED_SMOKE === '1';
const describePacked = ENABLED ? describe : describe.skip;
const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

function makeTemp(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

describePacked('packed extension forwarding smoke', () => {
  it('uses installed dist assets and forwards configured extension sources once in order', () => {
    const prefix = makeTemp('packed-prefix-');
    const sandbox = makeTemp('packed-sandbox-');
    const workdir = join(sandbox, 'workspace');
    const userDir = join(sandbox, 'user');
    const argvLog = join(sandbox, 'pi-argv.jsonl');

    mkdirSync(workdir, { recursive: true });
    mkdirSync(join(workdir, 'local-extension'), { recursive: true });
    mkdirSync(join(userDir, '.specialists', 'user'), { recursive: true });
    writeFakePiBinary(sandbox);
    writeFileSync(
      join(userDir, '.specialists', 'user', 'packed.specialist.json'),
      JSON.stringify({
        specialist: {
          metadata: { name: 'packed', version: '1.0.0', description: 'packed smoke', category: 'test' },
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
              'npm:@jaggerxtrm/pi-service-knowledge@1.0.0': true,
              './local-extension': true,
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

    const build = spawnSync('bun', ['run', 'build'], { cwd: repoRoot, encoding: 'utf-8', env: { ...process.env, NODE_ENV: 'test' } });
    expect(build.status).toBe(0);

    const pack = spawnSync('npm', ['pack', '--json'], { cwd: repoRoot, encoding: 'utf-8' });
    expect(pack.status).toBe(0);
    const tarball = join(repoRoot, JSON.parse(pack.stdout)[0].filename as string);

    const install = spawnSync('npm', ['install', '-g', `--prefix=${prefix}`, tarball], { cwd: repoRoot, encoding: 'utf-8' });
    rmSync(tarball, { force: true });
    expect(install.status).toBe(0);

    const installedEntry = join(prefix, 'lib', 'node_modules', '@jaggerxtrm', 'specialists', 'dist', 'index.js');
    const run = spawnSync('bun', [installedEntry, 'script', 'packed', '--vars', 'name=world', '--user-dir', userDir, '--json'], {
      cwd: workdir,
      encoding: 'utf-8',
      env: {
        ...process.env,
        PATH: `${join(sandbox, 'bin')}:${join(prefix, 'bin')}:${process.env.PATH ?? ''}`,
        HOME: sandbox,
        PI_ARGV_LOG: argvLog,
      },
    });

    expect(run.status).toBe(0);
    const [argv] = readLoggedPiArgv(argvLog);
    const extensionArgs = getExtensionArgs(argv);
    expect(JSON.parse(run.stdout).success).toBe(true);
    expect(argv).not.toContain('--offline');
    expect(extensionArgs.filter((value) => ['npm:@jaggerxtrm/pi-service-knowledge@1.0.0', './local-extension'].includes(value))).toEqual([
      'npm:@jaggerxtrm/pi-service-knowledge@1.0.0',
      './local-extension',
    ]);
    expect(countArg(extensionArgs, 'npm:@jaggerxtrm/pi-service-knowledge@1.0.0')).toBe(1);
    expect(countArg(extensionArgs, './local-extension')).toBe(1);
    expect(extensionArgs).not.toContain('https://example.test/disabled');
    expect(extensionArgs).not.toContain('serena');
    expect(extensionArgs.some((value) => value.includes(join('config', 'pi-extensions', 'read-line-numbers')))).toBe(true);

    const installedRoot = join(prefix, 'lib', 'node_modules', '@jaggerxtrm', 'specialists');
    rmSync(join(installedRoot, 'config', 'catalog'), { recursive: true, force: true });
    const blocked = spawnSync('bun', [installedEntry, 'script', 'packed', '--vars', 'name=world', '--user-dir', userDir, '--json'], {
      cwd: workdir,
      encoding: 'utf-8',
      env: {
        ...process.env,
        PATH: `${join(sandbox, 'bin')}:${join(prefix, 'bin')}:${process.env.PATH ?? ''}`,
        HOME: sandbox,
        PI_ARGV_LOG: argvLog,
      },
    });

    expect(blocked.status).toBe(1);
    expect(JSON.parse(blocked.stdout)).toMatchObject({
      success: false,
      error_type: 'runtime_tool_catalog_unavailable',
      error: expect.stringContaining('refusing to launch with Pi default tools'),
    });
    expect(blocked.stdout).not.toContain(installedRoot);
    expect(readLoggedPiArgv(argvLog)).toHaveLength(1);
  });
});
