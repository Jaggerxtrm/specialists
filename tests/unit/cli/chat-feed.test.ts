// ISSUE: xtrm-wiy5n.4.11 — quarantined from the default test baseline.
import { describe, expect, it } from 'vitest';
import { wrapTextWithAnsi } from '@earendil-works/pi-tui';
import { ChatFeed } from '../../../src/cli/chat/feed.js';

describe('ChatFeed', () => {
  it('accepts mixed appends and renders recent rows fast', () => {
    const feed = new ChatFeed();
    const styled = '\x1b[32mgreen token stream\x1b[0m';

    for (let index = 0; index < 250; index++) {
      feed.appendToken(index % 2 === 0 ? styled : `token-${index}`);
      feed.appendEvent('event', `details-${index}`);
      feed.appendToolStart('bash', `/tmp/file-${index}.ts`);
      feed.appendToolEnd('bash', `done-${index}`);
    }

    const start = performance.now();
    const lines = feed.render(80);
    const elapsed = performance.now() - start;

    expect(lines.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(50);
  });

  it('uses pi-tui wrapTextWithAnsi', () => {
    const wrapped = wrapTextWithAnsi('\x1b[31mabcdef\x1b[0m', 3);

    expect(wrapped).toEqual(['\x1b[31mabc', '\x1b[31mdef\x1b[0m']);
  });
});
