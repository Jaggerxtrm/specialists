// Gated prototype for sp console as materializer sync_hint subscriber
// (unitAI-ctb4u.22, Phase 4 of materializer adoption — EXPLORATORY ONLY).
//
// IMPORTANT: this module is NOT production code. No production import
// path may reach it. The gate is `SPECIALISTS_CONSOLE_SUBSCRIBE_PROTOTYPE=1`
// at module-import time; when unset, every exported function is a no-op.
//
// Demonstrates: UNIX socket subscriber + fake materializer over
// line-delimited JSON frames matching the gitboard upstream shape
// ({ event: 'specialists:sync_hint', data: { repoSlug } }).
//
// To run live:
//   SPECIALISTS_CONSOLE_SUBSCRIBE_PROTOTYPE=1 bun run \
//     src/cli/console/subscribe-prototype.ts
//
// See docs/design/sp-console-subscribe-via-materializer.md for the
// full design proposal.

import { createServer, createConnection, type Server, type Socket } from 'node:net';
import { unlinkSync, existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PROTOTYPE_GATE = process.env.SPECIALISTS_CONSOLE_SUBSCRIBE_PROTOTYPE === '1';

export interface SyncHintFrame {
  event: 'specialists:sync_hint';
  data: { repoSlug: string };
}

export type OnHint = (repoSlug: string) => void;

export function prototypeEnabled(): boolean {
  return PROTOTYPE_GATE;
}

// ── Subscriber side ────────────────────────────────────────────────────────

export function connectSubscriber(socketPath: string, onHint: OnHint): { close: () => void } {
  if (!PROTOTYPE_GATE) return { close: () => undefined };
  let client: Socket | null = null;
  let buffer = '';
  let closed = false;
  let backoffMs = 1000;

  const reconnect = (): void => {
    if (closed) return;
    process.stderr.write(`[sp-console-subscribe-prototype] reconnecting in ${backoffMs}ms\n`);
    setTimeout(() => {
      if (closed) return;
      open();
    }, backoffMs);
    backoffMs = Math.min(backoffMs * 2, 30_000);
  };

  const open = (): void => {
    try {
      client = createConnection(socketPath);
    } catch (error) {
      process.stderr.write(`[sp-console-subscribe-prototype] connect error: ${String((error as Error).message ?? error)}\n`);
      reconnect();
      return;
    }
    client.on('connect', () => {
      backoffMs = 1000; // reset backoff on successful handshake
      process.stderr.write(`[sp-console-subscribe-prototype] connected to ${socketPath}\n`);
    });
    client.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf-8');
      let nl = buffer.indexOf('\n');
      while (nl >= 0) {
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        nl = buffer.indexOf('\n');
        if (!line) continue;
        try {
          const frame = JSON.parse(line) as Partial<SyncHintFrame>;
          if (frame.event === 'specialists:sync_hint' && typeof frame.data?.repoSlug === 'string') {
            onHint(frame.data.repoSlug);
          }
        } catch (error) {
          process.stderr.write(`[sp-console-subscribe-prototype] frame parse failed: ${String((error as Error).message ?? error)}\n`);
        }
      }
    });
    client.on('error', (error: Error) => {
      process.stderr.write(`[sp-console-subscribe-prototype] socket error: ${error.message}\n`);
    });
    client.on('close', () => {
      reconnect();
    });
  };

  open();
  return {
    close: () => {
      closed = true;
      client?.destroy();
    },
  };
}

// ── Fake materializer side (for prototype only) ────────────────────────────

export function spawnFakeMaterializer(repoSlugs: string[]): { server: Server; socketPath: string; close: () => void } | null {
  if (!PROTOTYPE_GATE) return null;
  const dir = mkdtempSync(join(tmpdir(), 'sp-console-subscribe-prototype-'));
  const socketPath = join(dir, 'materialize.sock');
  if (existsSync(socketPath)) unlinkSync(socketPath);

  const subscribers = new Set<Socket>();
  const server = createServer((socket) => {
    subscribers.add(socket);
    socket.on('close', () => subscribers.delete(socket));
  });
  server.listen(socketPath);

  const interval = setInterval(() => {
    if (subscribers.size === 0) return;
    const slug = repoSlugs[Math.floor(((Date.now() / 200) | 0) % repoSlugs.length)] ?? 'repoA';
    const frame: SyncHintFrame = {
      event: 'specialists:sync_hint',
      data: { repoSlug: slug },
    };
    const wire = `${JSON.stringify(frame)}\n`;
    for (const sub of subscribers) {
      try {
        sub.write(wire);
      } catch {
        // ignore — subscriber will reconnect
      }
    }
  }, 200); // 5Hz, matching the design doc

  return {
    server,
    socketPath,
    close: () => {
      clearInterval(interval);
      for (const sub of subscribers) sub.destroy();
      server.close();
      try { unlinkSync(socketPath); } catch { /* noop */ }
    },
  };
}

// ── Live entry point (only when the file is run directly via bun) ──────────

// Prototype demo. Spawns a fake materializer, connects a subscriber, prints
// every received hint, terminates after 5 seconds.
if (PROTOTYPE_GATE && import.meta.main) {
  const repoSlugs = ['demoA', 'demoB', 'demoC'];
  const fake = spawnFakeMaterializer(repoSlugs);
  if (!fake) {
    process.stderr.write('prototype gate not active\n');
    process.exit(0);
  }
  const sub = connectSubscriber(fake.socketPath, (repoSlug) => {
    process.stdout.write(`hint -> ${repoSlug}\n`);
  });
  setTimeout(() => {
    sub.close();
    fake.close();
    process.stdout.write('prototype demo done\n');
    process.exit(0);
  }, 5000);
}
