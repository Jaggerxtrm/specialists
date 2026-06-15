import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_ASSISTANT_TEXT_LIMIT_BYTES,
  DEFAULT_PENDING_LINE_LIMIT_BYTES,
  DEFAULT_PROMPT_LIMIT_BYTES,
  DEFAULT_STDERR_LIMIT_BYTES,
  collectModelCandidates,
  collectRequiredOutputKeys,
  classifyAttempt,
  compatGuard,
  detectTemplateFieldMisuse,
  isRetryableModelFailure,
  renderTaskTemplate,
  resolveAssistantTextLimitBytes,
  resolvePromptLimitBytes,
  applyOutputContract,
  runScriptSpecialist,
} from '../../../src/specialist/script-runner.js';

const { spawnMock, spawnSyncMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
  spawnSyncMock: vi.fn(() => ({ status: 1, stdout: '', stderr: '' })),
}));

vi.mock('node:child_process', () => ({
  spawn: spawnMock,
  spawnSync: spawnSyncMock,
}));

const baseSpec = {
  specialist: {
    execution: {
      interactive: false,
      requires_worktree: false,
      permission_required: 'READ_ONLY',
      model: 'anthropic/claude-sonnet-4-6',
      fallback_model: 'google-gemini-cli/gemini-3.1-pro-preview',
      timeout_ms: 1000,
      response_format: 'markdown',
      output_type: 'synthesis',
    },
    prompt: {
      task_template: 'draft $name',
      output_schema: { type: 'object', required: ['unreleased_summary', 'sections'] },
    },
    skills: { scripts: [] },
  },
} as const;

afterEach(() => {
  spawnMock.mockReset();
  spawnSyncMock.mockClear();
  delete process.env.SPECIALISTS_SCRIPT_PROMPT_LIMIT_BYTES;
  delete process.env.SPECIALISTS_SCRIPT_STDOUT_LIMIT_BYTES;
});

class FakeChild extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  stdin = new EventEmitter() as EventEmitter & { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
  kill = vi.fn();

  constructor() {
    super();
    this.stdin.write = vi.fn();
    this.stdin.end = vi.fn();
  }
}

function makeLoader(spec = baseSpec) {
  return {
    get: vi.fn().mockResolvedValue(spec),
  };
}

function createSpawnMock(): FakeChild {
  const child = new FakeChild();
  spawnMock.mockReturnValue(child as never);
  return child;
}

describe('script-runner compat guard', () => {
  it('rejects interactive specialist', () => {
    expect(() => compatGuard({ ...baseSpec, specialist: { ...baseSpec.specialist, execution: { ...baseSpec.specialist.execution, interactive: true } } } as never)).toThrow('interactive');
  });

  it('labels compat guard failure with offending field', () => {
    try {
      compatGuard({ ...baseSpec, specialist: { ...baseSpec.specialist, execution: { ...baseSpec.specialist.execution, interactive: true } } } as never);
      throw new Error('expected compatGuard to throw');
    } catch (error) {
      expect(error).toMatchObject({ field: 'execution.interactive' });
      expect(error).toBeInstanceOf(Error);
    }
  });

  it('rejects worktree specialist', () => {
    expect(() => compatGuard({ ...baseSpec, specialist: { ...baseSpec.specialist, execution: { ...baseSpec.specialist.execution, requires_worktree: true } } } as never)).toThrow('worktree');
  });

  it('rejects non read only specialist', () => {
    expect(() => compatGuard({ ...baseSpec, specialist: { ...baseSpec.specialist, execution: { ...baseSpec.specialist.execution, permission_required: 'LOW' } } } as never)).toThrow('permission_required');
  });

  it('rejects scripted specialist', () => {
    expect(() => compatGuard({ ...baseSpec, specialist: { ...baseSpec.specialist, skills: { scripts: [{ run: 'echo hi', phase: 'pre', inject_output: false }] } } } as never)).toThrow('local scripts are not supported');
  });
});

describe('template render', () => {
  it('throws on missing variable', () => {
    expect(() => renderTaskTemplate('hello $name', {})).toThrow('Missing template variable: name');
  });

  it('ignores literal $tokens in substituted values', () => {
    expect(renderTaskTemplate('release $name', { name: 'notes with $prev_tag and $next_tag' })).toBe('release notes with $prev_tag and $next_tag');
  });

  it('still throws when template references unknown variable', () => {
    expect(() => renderTaskTemplate('hello $name and $missing', { name: 'world' })).toThrow('Missing template variable: missing');
  });
});

describe('detectTemplateFieldMisuse', () => {
  const promptKeys = { task_template: 'draft $name', system: 'you are an analyst', normalize_template: 'normalize $x' };

  it('flags an exact spec.prompt key name passed as the template body', () => {
    expect(detectTemplateFieldMisuse('task_template', promptKeys)).toBe('task_template');
    expect(detectTemplateFieldMisuse('normalize_template', promptKeys)).toBe('normalize_template');
    expect(detectTemplateFieldMisuse('system', promptKeys)).toBe('system');
  });

  it('passes through a real template body that happens to be short', () => {
    expect(detectTemplateFieldMisuse('Hello $name', promptKeys)).toBeNull();
    expect(detectTemplateFieldMisuse('$prompt', promptKeys)).toBeNull();
  });

  it('passes through identifier-shaped strings that are not spec keys', () => {
    expect(detectTemplateFieldMisuse('foo_bar', promptKeys)).toBeNull();
    expect(detectTemplateFieldMisuse('output_schema', promptKeys)).toBeNull();
  });

  it('passes through long bodies that happen to start identifier-shaped', () => {
    expect(detectTemplateFieldMisuse('task_template_with_a_long_explanatory_suffix', promptKeys)).toBeNull();
  });

  it('returns null when prompt object is missing or empty', () => {
    expect(detectTemplateFieldMisuse('task_template', null)).toBeNull();
    expect(detectTemplateFieldMisuse('task_template', undefined)).toBeNull();
    expect(detectTemplateFieldMisuse('task_template', {})).toBeNull();
  });
});

describe('output contract injection', () => {
  it('appends required JSON keys and schema only for JSON specialists', () => {
    const jsonSpec = {
      ...baseSpec,
      specialist: {
        ...baseSpec.specialist,
        execution: { ...baseSpec.specialist.execution, response_format: 'json' },
      },
    };

    const prompt = applyOutputContract('summarize article', jsonSpec as never);

    expect(prompt).toContain('Return only valid JSON');
    expect(prompt).toContain('unreleased_summary, sections');
    expect(prompt).toContain('\"required\":[\"unreleased_summary\",\"sections\"]');
    expect(applyOutputContract('summarize article', baseSpec as never)).toBe('summarize article');
  });

  it('passes the injected JSON output contract to pi', async () => {
    const jsonSpec = {
      ...baseSpec,
      specialist: {
        ...baseSpec.specialist,
        execution: { ...baseSpec.specialist.execution, response_format: 'json' },
      },
    };
    const child = createSpawnMock();
    const resultPromise = runScriptSpecialist(
      { specialist: 'changelog-keeper', template: 'summarize article' },
      { loader: makeLoader(jsonSpec as never) as never, projectDir: '.' },
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    child.stdout.emit('data', Buffer.from(`${JSON.stringify({ type: 'message_end', message: { role: 'assistant', content: [{ type: 'text', text: JSON.stringify({ unreleased_summary: 'ok', sections: [] }) }] } })}\n`));
    child.emit('close', 0);

    await resultPromise;

    const prompt = child.stdin.write.mock.calls[0][0] as string;
    expect(prompt).toContain('Return only valid JSON');
    expect(prompt).toContain('unreleased_summary, sections');
  });

  it('keeps invalid JSON validation intact after injecting the contract', async () => {
    const jsonSpec = {
      ...baseSpec,
      specialist: {
        ...baseSpec.specialist,
        execution: { ...baseSpec.specialist.execution, response_format: 'json' },
      },
    };
    const child = createSpawnMock();
    const resultPromise = runScriptSpecialist(
      { specialist: 'changelog-keeper', template: 'summarize article' },
      { loader: makeLoader(jsonSpec as never) as never, projectDir: '.' },
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    child.stdout.emit('data', Buffer.from(`${JSON.stringify({ type: 'message_end', message: { role: 'assistant', content: [{ type: 'text', text: '{\"unreleased_summary\":\"ok\"}' }] } })}\n`));
    child.emit('close', 0);

    await expect(resultPromise).resolves.toMatchObject({ success: false, error_type: 'invalid_json' });
  });
});

describe('runScriptSpecialist aliasing', () => {
  it('routes changelog-keeper requests to changelog-drafter in script mode', async () => {
    const child = createSpawnMock();
    const loader = makeLoader();
    const resultPromise = runScriptSpecialist(
      { specialist: 'changelog-keeper', requested_specialist: 'changelog-keeper', template: 'draft' },
      { loader: loader as never, projectDir: '.' },
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    child.stdout.emit('data', Buffer.from(`${JSON.stringify({ type: 'message_end', message: { role: 'assistant', content: [{ type: 'text', text: 'ok' }] } })}
`));
    child.emit('close', 0);

    const result = await resultPromise;

    expect(loader.get).toHaveBeenCalledWith('changelog-drafter');
    expect(result).toMatchObject({ success: true });
    if (result.success) {
      expect(result.meta).toMatchObject({ specialist: 'changelog-drafter', requested_specialist: 'changelog-keeper', resolved_specialist: 'changelog-drafter' });
    }
  });
});

describe('collectRequiredOutputKeys', () => {
  it('returns expected_output_keys for text-format specs', () => {
    const spec = {
      specialist: {
        execution: { response_format: 'text', expected_output_keys: ['summary', 'tags'] },
        prompt: {},
      },
    };
    expect(collectRequiredOutputKeys(spec)).toEqual(['summary', 'tags']);
  });

  it('returns output_schema.required for json-format specs', () => {
    const spec = {
      specialist: {
        execution: { response_format: 'json' },
        prompt: { output_schema: { required: ['a', 'b'] } },
      },
    };
    expect(collectRequiredOutputKeys(spec)).toEqual(['a', 'b']);
  });

  it('unions expected_output_keys with output_schema.required for json specs', () => {
    const spec = {
      specialist: {
        execution: { response_format: 'json', expected_output_keys: ['summary'] },
        prompt: { output_schema: { required: ['summary', 'tags'] } },
      },
    };
    expect(collectRequiredOutputKeys(spec).sort()).toEqual(['summary', 'tags']);
  });

  it('ignores output_schema.required for text-format specs', () => {
    const spec = {
      specialist: {
        execution: { response_format: 'text' },
        prompt: { output_schema: { required: ['ignored'] } },
      },
    };
    expect(collectRequiredOutputKeys(spec)).toEqual([]);
  });

  it('drops non-string and empty entries', () => {
    const spec = {
      specialist: {
        execution: { response_format: 'text', expected_output_keys: ['ok', '', 42, null, 'fine'] },
        prompt: {},
      },
    };
    expect(collectRequiredOutputKeys(spec as never)).toEqual(['ok', 'fine']);
  });

  it('returns empty array when nothing is declared', () => {
    expect(collectRequiredOutputKeys({ specialist: { execution: {}, prompt: {} } })).toEqual([]);
  });
});

describe('runScriptSpecialist expected_output_keys validation', () => {
  function textSpecWithKeys(keys: string[]) {
    return {
      ...baseSpec,
      specialist: {
        ...baseSpec.specialist,
        execution: { ...baseSpec.specialist.execution, response_format: 'text', expected_output_keys: keys },
      },
    };
  }

  it('returns invalid_json when text-format output is missing a required key', async () => {
    const spec = textSpecWithKeys(['summary', 'tags']);
    const child = createSpawnMock();
    const resultPromise = runScriptSpecialist(
      { specialist: 'changelog-drafter', template: 'render $name', variables: { name: 'x' } },
      { loader: makeLoader(spec as never) as never, projectDir: '.' },
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    // Hallucinated output: valid JSON but missing 'tags'.
    const text = JSON.stringify({ summary: 'ok', command: 'oops' });
    child.stdout.emit('data', Buffer.from(`${JSON.stringify({ type: 'message_end', message: { role: 'assistant', content: [{ type: 'text', text }] } })}\n`));
    child.emit('close', 0);

    const result = await resultPromise;
    expect(result).toMatchObject({ success: false, error_type: 'invalid_json' });
    if (!result.success) expect(result.error).toContain('tags');
  });

  it('returns invalid_json when text-format output is not parseable as JSON', async () => {
    const spec = textSpecWithKeys(['summary']);
    const child = createSpawnMock();
    const resultPromise = runScriptSpecialist(
      { specialist: 'changelog-drafter', template: 'render $name', variables: { name: 'x' } },
      { loader: makeLoader(spec as never) as never, projectDir: '.' },
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    child.stdout.emit('data', Buffer.from(`${JSON.stringify({ type: 'message_end', message: { role: 'assistant', content: [{ type: 'text', text: 'not json at all' }] } })}\n`));
    child.emit('close', 0);

    const result = await resultPromise;
    expect(result).toMatchObject({ success: false, error_type: 'invalid_json' });
  });

  it('passes when text-format output contains every expected_output_keys entry', async () => {
    const spec = textSpecWithKeys(['summary', 'tags']);
    const child = createSpawnMock();
    const resultPromise = runScriptSpecialist(
      { specialist: 'changelog-drafter', template: 'render $name', variables: { name: 'x' } },
      { loader: makeLoader(spec as never) as never, projectDir: '.' },
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    const text = JSON.stringify({ summary: 'ok', tags: ['a', 'b'], extra: 'fine' });
    child.stdout.emit('data', Buffer.from(`${JSON.stringify({ type: 'message_end', message: { role: 'assistant', content: [{ type: 'text', text }] } })}\n`));
    child.emit('close', 0);

    const result = await resultPromise;
    expect(result).toMatchObject({ success: true });
    if (result.success) {
      expect(result.parsed_json).toMatchObject({ summary: 'ok', tags: ['a', 'b'] });
    }
  });
});

describe('runScriptSpecialist template field misuse', () => {
  it('returns template_field_misuse error when input.template names a spec.prompt key', async () => {
    const loader = makeLoader();
    const result = await runScriptSpecialist(
      { specialist: 'changelog-drafter', template: 'task_template', variables: { name: 'world' } },
      { loader: loader as never, projectDir: '.' },
    );

    expect(spawnMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: false,
      error_type: 'template_field_misuse',
    });
    if (!result.success) {
      expect(result.error).toContain('spec.prompt.task_template');
    }
  });
});

describe('runScriptSpecialist fallback chain', () => {
  it('advances to fallback_model after empty assistant output', () => {
    const spec = baseSpec as never;
    const candidates = collectModelCandidates(
      { specialist: 'changelog-keeper' },
      spec,
      { fallbackModel: 'nano-gpt/moonshotai/kimi-k2.5' } as never,
    );

    expect(candidates).toEqual([
      'anthropic/claude-sonnet-4-6',
      'google-gemini-cli/gemini-3.1-pro-preview',
      'nano-gpt/moonshotai/kimi-k2.5',
    ]);
    expect(classifyAttempt({ text: '', stderr: '', exitCode: 0, timedOut: false, outputTooLarge: false })).toMatchObject({ retryable: true });
    expect(classifyAttempt({ text: '', stderr: '', exitCode: 0, timedOut: false, outputTooLarge: true, outputTooLargeReason: 'assistant_text_too_large' })).toMatchObject({ error: 'assistant message too large' });
    expect(isRetryableModelFailure('', '')).toBe(true);
  });

  it('prefers fallback_models over fallback_model', () => {
    const spec = {
      ...baseSpec,
      specialist: {
        ...baseSpec.specialist,
        execution: {
          ...baseSpec.specialist.execution,
          fallback_models: ['openai-codex/gpt-5.4', 'nano-gpt/moonshotai/kimi-k2.5'],
        },
      },
    } as never;

    expect(collectModelCandidates({ specialist: 'changelog-keeper' }, spec, {} as never)).toEqual([
      'anthropic/claude-sonnet-4-6',
      'openai-codex/gpt-5.4',
      'nano-gpt/moonshotai/kimi-k2.5',
    ]);
  });

  it('advances to fallback_model after quota error', () => {
    expect(isRetryableModelFailure('429 insufficient_quota quota exceeded', '')).toBe(true);
    expect(isRetryableModelFailure('quota exceeded', '')).toBe(true);
    expect(isRetryableModelFailure('rate limit', '')).toBe(true);
    expect(classifyAttempt({ text: '', stderr: '429 insufficient_quota quota exceeded', exitCode: 1, timedOut: false, outputTooLarge: false })).toMatchObject({ retryable: true });
  });

  it('does not retry auth-shaped failures', () => {
    expect(isRetryableModelFailure('HTTP 401 Unauthorized', '')).toBe(false);
    expect(isRetryableModelFailure('HTTP 403 Forbidden', '')).toBe(false);
    expect(isRetryableModelFailure('invalid_api_key authentication failed', '')).toBe(false);
    expect(classifyAttempt({ text: '', stderr: 'HTTP 401 Unauthorized', exitCode: 1, timedOut: false, outputTooLarge: false })).toMatchObject({ retryable: false, errorType: 'auth' });
  });

  it('stops chain walk on auth failure from first model', async () => {
    const spec = {
      ...baseSpec,
      specialist: {
        ...baseSpec.specialist,
        execution: {
          ...baseSpec.specialist.execution,
          fallback_models: ['openai-codex/gpt-5.4'],
        },
      },
    } as never;
    const firstChild = new FakeChild();
    const secondChild = new FakeChild();
    spawnMock.mockReturnValueOnce(firstChild as never).mockReturnValueOnce(secondChild as never);

    const resultPromise = runScriptSpecialist(
      { specialist: 'changelog-keeper', variables: { name: 'release notes' } },
      { loader: makeLoader(spec) as never, projectDir: '.' },
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    firstChild.stderr.emit('data', Buffer.from('HTTP 401 Unauthorized'));
    firstChild.emit('close', 1);

    const result = await resultPromise;
    expect(result).toMatchObject({ success: false, error_type: 'auth' });
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });

  it('continues chain walk on transient failure from first model', async () => {
    const spec = {
      ...baseSpec,
      specialist: {
        ...baseSpec.specialist,
        execution: {
          ...baseSpec.specialist.execution,
          fallback_models: ['openai-codex/gpt-5.4'],
        },
      },
    } as never;
    const firstChild = new FakeChild();
    const secondChild = new FakeChild();
    spawnMock.mockReturnValueOnce(firstChild as never).mockReturnValueOnce(secondChild as never);

    const resultPromise = runScriptSpecialist(
      { specialist: 'changelog-keeper', variables: { name: 'release notes' } },
      { loader: makeLoader(spec) as never, projectDir: '.' },
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    firstChild.stderr.emit('data', Buffer.from('429 insufficient_quota quota exceeded'));
    firstChild.emit('close', 1);
    await new Promise((resolve) => setTimeout(resolve, 0));
    secondChild.stdout.emit('data', Buffer.from(`${JSON.stringify({ type: 'message_end', message: { role: 'assistant', content: [{ type: 'text', text: 'ok' }] } })}\n`));
    secondChild.emit('close', 0);

    const result = await resultPromise;
    expect(result).toMatchObject({ success: true });
    expect(spawnMock).toHaveBeenCalledTimes(2);
  });
});

describe('stdout limit resolution', () => {
  it('defaults retained-state caps', () => {
    expect(DEFAULT_PENDING_LINE_LIMIT_BYTES).toBe(16 * 1024 * 1024);
    expect(DEFAULT_ASSISTANT_TEXT_LIMIT_BYTES).toBe(4 * 1024 * 1024);
    expect(DEFAULT_STDERR_LIMIT_BYTES).toBe(1 * 1024 * 1024);
    delete process.env.SPECIALISTS_SCRIPT_STDOUT_LIMIT_BYTES;
    expect(resolveAssistantTextLimitBytes(baseSpec as never)).toBe(DEFAULT_ASSISTANT_TEXT_LIMIT_BYTES);
  });

  it('uses env override when spec has no override', () => {
    process.env.SPECIALISTS_SCRIPT_STDOUT_LIMIT_BYTES = String(2 * 1024);
    expect(resolveAssistantTextLimitBytes(baseSpec as never)).toBe(2 * 1024);
  });

  it('uses spec override over env override', () => {
    process.env.SPECIALISTS_SCRIPT_STDOUT_LIMIT_BYTES = String(1024);
    expect(resolveAssistantTextLimitBytes({ ...baseSpec, specialist: { ...baseSpec.specialist, execution: { ...baseSpec.specialist.execution, stdout_limit_bytes: 3 * 1024 } } } as never)).toBe(3 * 1024);
  });
});

describe('runScriptSpecialist retained-state caps', () => {
  it('keeps huge token-delta stream and returns final assistant text', async () => {
    const child = createSpawnMock();
    const resultPromise = runScriptSpecialist(
      { specialist: 'changelog-keeper', variables: { name: 'release notes' } },
      { loader: makeLoader() as never, projectDir: '.' },
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    const deltaLine = Buffer.from(`${JSON.stringify({ type: 'token_delta', data: { text: 'x'.repeat(1024) } })}\n`);
    for (let i = 0; i < 204_800; i++) child.stdout.emit('data', deltaLine);
    child.stdout.emit('data', Buffer.from(`${JSON.stringify({ type: 'message_end', message: { role: 'assistant', content: [{ type: 'text', text: 'final output' }] } })}\n`));
    child.emit('close', 0);

    const result = await resultPromise;

    expect(child.kill).not.toHaveBeenCalled();
    expect(result).toMatchObject({ success: true, output: 'final output' });
  });

  it('truncates oversized malformed line and returns malformed line error', async () => {
    const child = createSpawnMock();
    const resultPromise = runScriptSpecialist(
      { specialist: 'changelog-keeper', variables: { name: 'release notes' } },
      { loader: makeLoader() as never, projectDir: '.' },
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    child.stdout.emit('data', Buffer.from('{"type":"assistant","data":{"text":"'));
    child.stdout.emit('data', Buffer.alloc(DEFAULT_PENDING_LINE_LIMIT_BYTES + 1, 'a'));
    child.emit('close', 0);

    const result = await resultPromise;

    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    expect(result).toMatchObject({ success: false, error_type: 'output_too_large', error: 'malformed line too large' });
  });

  it('truncates stderr and returns stderr error', async () => {
    const child = createSpawnMock();
    const resultPromise = runScriptSpecialist(
      { specialist: 'changelog-keeper', variables: { name: 'release notes' } },
      { loader: makeLoader() as never, projectDir: '.' },
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    child.stderr.emit('data', Buffer.alloc(DEFAULT_STDERR_LIMIT_BYTES + 1, 'e'));
    child.emit('close', 0);

    const result = await resultPromise;

    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    expect(result).toMatchObject({ success: false, error_type: 'output_too_large', error: 'stderr too large' });
  });
});

describe('runScriptSpecialist skill forwarding', () => {
  it('disables skills by default and does not pass --skill args', async () => {
    const child = createSpawnMock();
    const resultPromise = runScriptSpecialist(
      { specialist: 'changelog-keeper', variables: { name: 'release notes' } },
      { loader: makeLoader() as never, projectDir: '.' },
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    child.stdout.emit('data', Buffer.from(`${JSON.stringify({ type: 'message_end', message: { role: 'assistant', content: [{ type: 'text', text: 'output' }] } })}\n`));
    child.emit('close', 0);

    await resultPromise;

    const spawnArgs: string[] = spawnMock.mock.calls[0][1];
    expect(spawnArgs).toContain('--no-skills');
    expect(spawnArgs).not.toContain('--skill');
  });

  it('passes trusted skills.paths and prompt.skill_inherit as explicit --skill args', async () => {
    const specWithSkills = {
      ...baseSpec,
      specialist: {
        ...baseSpec.specialist,
        prompt: {
          ...baseSpec.specialist.prompt,
          skill_inherit: '/skills/inherited/SKILL.md',
        },
        skills: { paths: ['/skills/one/SKILL.md', '/skills/two/SKILL.md'], scripts: [] },
      },
    };
    const child = createSpawnMock();
    const resultPromise = runScriptSpecialist(
      { specialist: 'changelog-keeper', variables: { name: 'release notes' } },
      { loader: makeLoader(specWithSkills as never) as never, projectDir: '.', trust: { allowSkills: true } },
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    child.stdout.emit('data', Buffer.from(`${JSON.stringify({ type: 'message_end', message: { role: 'assistant', content: [{ type: 'text', text: 'output' }] } })}\n`));
    child.emit('close', 0);

    await resultPromise;

    const spawnArgs: string[] = spawnMock.mock.calls[0][1];
    expect(spawnArgs).not.toContain('--no-skills');
    expect(spawnArgs).toEqual(expect.arrayContaining([
      '--skill', '/skills/one/SKILL.md',
      '/skills/two/SKILL.md',
      '/skills/inherited/SKILL.md',
    ]));
    expect(spawnArgs.filter((arg) => arg === '--skill')).toHaveLength(3);
  });
});

describe('runScriptSpecialist system prompt forwarding', () => {
  it('isolates script-class pi calls from project context, skills, prompt templates, and themes', async () => {
    const child = createSpawnMock();
    const resultPromise = runScriptSpecialist(
      { specialist: 'changelog-keeper', variables: { name: 'release notes' } },
      { loader: makeLoader() as never, projectDir: '.' },
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    child.stdout.emit('data', Buffer.from(`${JSON.stringify({ type: 'message_end', message: { role: 'assistant', content: [{ type: 'text', text: 'output' }] } })}\n`));
    child.emit('close', 0);

    await resultPromise;

    const spawnArgs: string[] = spawnMock.mock.calls[0][1];
    expect(spawnArgs).toEqual(expect.arrayContaining(['--no-context-files', '--no-skills', '--no-prompt-templates', '--no-themes']));
    expect(spawnArgs.indexOf('--no-context-files')).toBeGreaterThan(spawnArgs.indexOf('--offline'));
    expect(spawnArgs.indexOf('--model')).toBeGreaterThan(spawnArgs.indexOf('--no-themes'));
  });

  it('passes rendered prompt through stdin instead of argv', async () => {
    const child = createSpawnMock();
    const renderedPrompt = 'summarize --dangerous-looking @article payload';
    const resultPromise = runScriptSpecialist(
      { specialist: 'changelog-keeper', template: renderedPrompt },
      { loader: makeLoader() as never, projectDir: '.' },
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    child.stdout.emit('data', Buffer.from(`${JSON.stringify({ type: 'message_end', message: { role: 'assistant', content: [{ type: 'text', text: 'output' }] } })}\n`));
    child.emit('close', 0);

    await resultPromise;

    const spawnArgs: string[] = spawnMock.mock.calls[0][1];
    const spawnOptions = spawnMock.mock.calls[0][2];
    expect(spawnArgs).not.toContain(renderedPrompt);
    expect(spawnArgs.at(-1)).toBe('anthropic/claude-sonnet-4-6');
    expect(spawnOptions).toMatchObject({ stdio: ['pipe', 'pipe', 'pipe'] });
    expect(child.stdin.write).toHaveBeenCalledWith(renderedPrompt);
    expect(child.stdin.end).toHaveBeenCalledTimes(1);
  });

  it('swallows child stdin errors and lets close handling classify the attempt', async () => {
    const child = createSpawnMock();
    const resultPromise = runScriptSpecialist(
      { specialist: 'changelog-keeper', variables: { name: 'release notes' } },
      { loader: makeLoader() as never, projectDir: '.' },
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(() => child.stdin.emit('error', new Error('EPIPE'))).not.toThrow();
    child.stderr.emit('data', Buffer.from('broken pipe'));
    child.emit('close', 1);

    const result = await resultPromise;

    expect(result).toMatchObject({ success: false, error: 'broken pipe' });
  });

  it('passes --system-prompt to pi when spec.prompt.system is set', async () => {
    const specWithSystem = {
      ...baseSpec,
      specialist: {
        ...baseSpec.specialist,
        prompt: {
          ...baseSpec.specialist.prompt,
          system: 'You are a financial data extractor. Return only JSON.',
        },
      },
    };
    const child = createSpawnMock();
    const resultPromise = runScriptSpecialist(
      { specialist: 'changelog-keeper', variables: { name: 'release notes' } },
      { loader: makeLoader(specWithSystem as never) as never, projectDir: '.' },
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    child.stdout.emit('data', Buffer.from(`${JSON.stringify({ type: 'message_end', message: { role: 'assistant', content: [{ type: 'text', text: 'output' }] } })}\n`));
    child.emit('close', 0);

    await resultPromise;

    const spawnArgs: string[] = spawnMock.mock.calls[0][1];
    const idx = spawnArgs.indexOf('--system-prompt');
    expect(idx).toBeGreaterThan(-1);
    expect(spawnArgs[idx + 1]).toBe('You are a financial data extractor. Return only JSON.');
  });

  it('uses --append-system-prompt when spec.prompt.system_prompt_mode is append', async () => {
    const specWithAppend = {
      ...baseSpec,
      specialist: {
        ...baseSpec.specialist,
        prompt: {
          ...baseSpec.specialist.prompt,
          system: 'You are a financial data extractor. Return only JSON.',
          system_prompt_mode: 'append',
        },
      },
    };
    const child = createSpawnMock();
    const resultPromise = runScriptSpecialist(
      { specialist: 'changelog-keeper', variables: { name: 'release notes' } },
      { loader: makeLoader(specWithAppend as never) as never, projectDir: '.' },
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    child.stdout.emit('data', Buffer.from(`${JSON.stringify({ type: 'message_end', message: { role: 'assistant', content: [{ type: 'text', text: 'output' }] } })}\n`));
    child.emit('close', 0);

    await resultPromise;

    const spawnArgs: string[] = spawnMock.mock.calls[0][1];
    const idx = spawnArgs.indexOf('--append-system-prompt');
    expect(idx).toBeGreaterThan(-1);
    expect(spawnArgs[idx + 1]).toBe('You are a financial data extractor. Return only JSON.');
    expect(spawnArgs).not.toContain('--system-prompt');
  });

  it('omits --system-prompt when spec.prompt.system is absent', async () => {
    const child = createSpawnMock();
    const resultPromise = runScriptSpecialist(
      { specialist: 'changelog-keeper', variables: { name: 'release notes' } },
      { loader: makeLoader() as never, projectDir: '.' },
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    child.stdout.emit('data', Buffer.from(`${JSON.stringify({ type: 'message_end', message: { role: 'assistant', content: [{ type: 'text', text: 'output' }] } })}\n`));
    child.emit('close', 0);

    await resultPromise;

    const spawnArgs: string[] = spawnMock.mock.calls[0][1];
    expect(spawnArgs).not.toContain('--system-prompt');
  });
});
