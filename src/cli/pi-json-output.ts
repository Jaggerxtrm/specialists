import type { TimelineEvent, TimelineTokenUsage } from '../specialist/timeline-events.js';

export interface PiJsonProjectionContext {
  jobId: string;
  sessionId?: string;
  cwd?: string;
  startedAtMs?: number;
  model?: string;
  backend?: string;
}

type PiJsonEvent = Record<string, unknown> & { type: string };

function modelName(model: string | undefined, backend: string | undefined): string | undefined {
  if (!model || !backend || !model.startsWith(`${backend}/`)) return model;
  return model.slice(backend.length + 1);
}

function usage(tokens: TimelineTokenUsage | undefined): Record<string, unknown> | undefined {
  if (!tokens) return undefined;
  const input = tokens.input_tokens ?? 0;
  const output = tokens.output_tokens ?? 0;
  const cacheRead = tokens.cache_read_tokens ?? 0;
  const cacheWrite = tokens.cache_creation_tokens ?? 0;
  return {
    input,
    output,
    cacheRead,
    cacheWrite,
    ...(tokens.reasoning_tokens !== undefined ? { reasoning: tokens.reasoning_tokens } : {}),
    totalTokens: tokens.total_tokens ?? input + output + cacheRead + cacheWrite,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };
}

/** Project the compact persisted specialist timeline into pi's documented JSON event stream. */
export function createPiJsonProjector(context: PiJsonProjectionContext): (event: TimelineEvent) => PiJsonEvent[] {
  let started = false;
  let cycleComplete = false;
  let messageOpen = false;
  let messageStarted = false;
  let text = '';
  let model = context.model;
  let backend = context.backend;
  let tokenUsage: TimelineTokenUsage | undefined;
  let messageTimestamp = context.startedAtMs ?? 0;
  const toolArgs = new Map<string, Record<string, unknown>>();
  const toolResults: Record<string, unknown>[] = [];

  const assistantMessage = (timestamp: number): Record<string, unknown> => ({
    role: 'assistant',
    content: text ? [{ type: 'text', text }] : [],
    ...(backend ? { provider: backend } : {}),
    ...(modelName(model, backend) ? { model: modelName(model, backend) } : {}),
    ...(usage(tokenUsage) ? { usage: usage(tokenUsage) } : {}),
    stopReason: cycleComplete ? 'stop' : undefined,
    timestamp,
  });

  const ensureStarted = (timestamp: number): PiJsonEvent[] => {
    if (started) return [];
    started = true;
    const startedAt = context.startedAtMs ?? timestamp;
    return [
      {
        type: 'session',
        version: 3,
        id: context.sessionId ?? context.jobId,
        timestamp: new Date(startedAt).toISOString(),
        cwd: context.cwd ?? process.cwd(),
      },
      { type: 'agent_start' },
    ];
  };

  const ensureMessageStarted = (timestamp: number): PiJsonEvent[] => {
    if (messageStarted) return [];
    messageStarted = true;
    messageOpen = true;
    messageTimestamp = timestamp;
    return [{ type: 'message_start', message: assistantMessage(timestamp) }];
  };

  const resetTurn = () => {
    messageOpen = false;
    messageStarted = false;
    text = '';
    tokenUsage = undefined;
    toolArgs.clear();
    toolResults.length = 0;
  };

  return (event: TimelineEvent): PiJsonEvent[] => {
    if (event.type === 'turn' && event.phase === 'start') {
      const restarting = cycleComplete;
      cycleComplete = false;
      resetTurn();
      return [
        ...(restarting ? [{ type: 'agent_start' } as PiJsonEvent] : ensureStarted(event.t)),
        { type: 'turn_start' },
      ];
    }
    if (cycleComplete) return [];

    if (event.type === 'meta') {
      if (event.backend !== 'injected') backend = event.backend;
      if (event.model !== 'meta' && event.model !== 'memory_injection') model = event.model;
      return messageOpen && !messageStarted
        ? [...ensureStarted(event.t), ...ensureMessageStarted(event.t)]
        : [];
    }

    if (event.type === 'token_usage') {
      tokenUsage = event.token_usage;
      return [];
    }

    if (event.type === 'run_start') return ensureStarted(event.t);

    if (event.type === 'turn') {
      return [...ensureStarted(event.t), { type: 'turn_end', message: assistantMessage(event.t), toolResults: [...toolResults] }];
    }

    if (event.type === 'message') {
      if (event.role !== 'assistant') return [];
      if (event.phase === 'start') {
        messageOpen = true;
        messageTimestamp = event.t;
        return [];
      }
      const prefix = [...ensureStarted(event.t), ...ensureMessageStarted(messageTimestamp || event.t)];
      messageOpen = false;
      return [...prefix, { type: 'message_end', message: assistantMessage(event.t) }];
    }

    if (event.type === 'text') {
      if (!event.content) return [];
      text = event.content;
      const prefix = [...ensureStarted(event.t), ...ensureMessageStarted(messageTimestamp || event.t)];
      const message = assistantMessage(event.t);
      return [
        ...prefix,
        { type: 'message_update', message, assistantMessageEvent: { type: 'text_start', contentIndex: 0, partial: message } },
        { type: 'message_update', message, assistantMessageEvent: { type: 'text_delta', contentIndex: 0, delta: event.content, partial: message } },
        { type: 'message_update', message, assistantMessageEvent: { type: 'text_end', contentIndex: 0, content: event.content, partial: message } },
      ];
    }

    if (event.type === 'tool') {
      const prefix = ensureStarted(event.t);
      const toolCallId = event.tool_call_id ?? `uncorrelated-${event.seq ?? event.t}`;
      if (event.phase === 'start') {
        const args = event.args ?? {};
        toolArgs.set(toolCallId, args);
        return [...prefix, { type: 'tool_execution_start', toolCallId, toolName: event.tool, args }];
      }
      if (event.phase === 'update') {
        return [...prefix, {
          type: 'tool_execution_update',
          toolCallId,
          toolName: event.tool,
          args: toolArgs.get(toolCallId) ?? {},
          partialResult: undefined,
        }];
      }
      const result = event.result_raw ?? event.result_summary;
      toolResults.push({
        role: 'toolResult',
        toolCallId,
        toolName: event.tool,
        content: result === undefined ? [] : [{ type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result) }],
        isError: event.is_error ?? false,
        timestamp: event.t,
      });
      return [...prefix, {
        type: 'tool_execution_end',
        toolCallId,
        toolName: event.tool,
        result,
        isError: event.is_error ?? false,
      }];
    }

    if (event.type === 'compaction') {
      const prefix = ensureStarted(event.t);
      return event.phase === 'start'
        ? [...prefix, { type: 'compaction_start', reason: 'threshold' }]
        : [...prefix, { type: 'compaction_end', reason: 'threshold', result: event.summary ? { summary: event.summary } : undefined, aborted: false, willRetry: false }];
    }

    if (event.type === 'retry') {
      const prefix = ensureStarted(event.t);
      return event.phase === 'start'
        ? [...prefix, { type: 'auto_retry_start', attempt: event.attempt ?? 1, maxAttempts: event.max_attempts ?? 1, delayMs: event.delay_ms ?? 0, errorMessage: event.error_message ?? '' }]
        : [...prefix, { type: 'auto_retry_end', success: !event.error_message, attempt: event.attempt ?? 1, ...(event.error_message ? { finalError: event.error_message } : {}) }];
    }

    if (event.type === 'run_complete') {
      const output: PiJsonEvent[] = ensureStarted(event.t);
      model = event.model ?? model;
      backend = event.backend ?? backend;
      tokenUsage = event.token_usage ?? event.metrics?.token_usage ?? tokenUsage;
      text = event.output ?? text;
      cycleComplete = true;
      const message = assistantMessage(event.t);
      if (messageOpen && !messageStarted) output.push(...ensureMessageStarted(messageTimestamp || event.t));
      if (messageOpen) output.push({ type: 'message_end', message });
      output.push({ type: 'agent_end', messages: text ? [message] : [], willRetry: false });
      output.push({ type: 'agent_settled' });
      return output;
    }

    return [];
  };
}
