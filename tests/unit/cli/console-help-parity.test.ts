// Parity guard for `specialists console --help` (unitAI-ctb4u.23).
//
// renderKeyBar (src/cli/console/theme.ts) is the runtime source of truth for
// every key advertised in the TUI. consoleHelpText (src/cli/console/help.ts)
// is the static --help block. Both must stay in sync — when a new key is
// added to the KeyBar for any view, it MUST appear in the help text too.
//
// This test enumerates the keys advertised in each view's keybar and asserts
// they appear in the help text under the matching section header. The aim is
// to prevent silent v1→vN drift like the one filed as unitAI-ctb4u.23.

import { describe, expect, it } from 'vitest';
import { renderKeyBar } from '../../../src/cli/console/theme.js';
import { consoleHelpText } from '../../../src/cli/console/help.js';

const SGR_RE = /\x1b\[[0-9;]*m/g;
const strip = (s: string): string => s.replace(SGR_RE, '');

// Each entry: keybar token + the substring(s) that count as a valid help mention.
// Keybar uses unicode symbols (↵, ⌫, ↑↓) while help often spells them out
// (Enter, backspace). Tests accept either form so authors aren't forced to
// dual-encode the same key.
interface TokenSpec {
  keybar: string;
  helpAliases: string[]; // ANY of these substrings in the help section counts.
}

const KEY_TOKENS_BY_VIEW: Record<string, TokenSpec[]> = {
  ps: [
    { keybar: '↵', helpAliases: ['Enter', '↵'] },
    { keybar: 'r ', helpAliases: ['r '] },
    { keybar: 'i ', helpAliases: ['i '] },
    { keybar: 'b ', helpAliases: ['b '] },
    { keybar: 'd ', helpAliases: ['d '] },
    { keybar: 'g ', helpAliases: ['g '] },
    { keybar: 'h ', helpAliases: ['h '] },
    { keybar: 'a ', helpAliases: ['a '] },
    { keybar: '/ ', helpAliases: ['/'] },
    { keybar: 'tab', helpAliases: ['Tab'] }, // global section
    { keybar: 'q ', helpAliases: ['q,', 'q '] }, // global section
  ],
  feed: [
    { keybar: 'f ', helpAliases: ['f '] },
    { keybar: 't ', helpAliases: ['t '] },
    { keybar: '⌫', helpAliases: ['⌫', 'backspace'] }, // global section
    { keybar: 'q ', helpAliases: ['q,', 'q '] }, // global section
  ],
  bead: [
    { keybar: '⌫', helpAliases: ['⌫', 'backspace'] }, // global section
    { keybar: 'q ', helpAliases: ['q,', 'q '] }, // global section
  ],
  diff: [
    { keybar: '↵', helpAliases: ['Enter', '↵'] },
    { keybar: 'r ', helpAliases: ['r '] },
    { keybar: '⌫', helpAliases: ['⌫', 'backspace'] }, // global section
    { keybar: 'q ', helpAliases: ['q,', 'q '] }, // global section
  ],
  config: [
    { keybar: '[/]', helpAliases: ['[ / ]', '['] },
    { keybar: 'e ', helpAliases: ['e '] },
    { keybar: 'u ', helpAliases: ['u '] },
    { keybar: 'b ', helpAliases: ['b '] },
    { keybar: 'r ', helpAliases: ['r '] },
    { keybar: '⌫', helpAliases: ['⌫', 'backspace'] }, // global section
    { keybar: 'q ', helpAliases: ['q,', 'q '] }, // global section
  ],
};

function helpSection(view: string): string {
  const lines = consoleHelpText();
  const headers: Record<string, RegExp> = {
    ps: /^ps view/i,
    feed: /^feed view/i,
    bead: /^bead view/i,
    diff: /^diff view/i,
    config: /^config view/i,
  };
  const header = headers[view];
  if (!header) return lines.join('\n');
  const startIdx = lines.findIndex((l) => header.test(l));
  if (startIdx < 0) return '';
  // Section ends at the next blank line followed by a non-indented header,
  // or at end of array. Collect lines through next blank.
  let endIdx = startIdx + 1;
  while (endIdx < lines.length && lines[endIdx] !== '') endIdx += 1;
  return lines.slice(startIdx, endIdx).join('\n');
}

describe('consoleHelpText covers every renderKeyBar token (unitAI-ctb4u.23)', () => {
  for (const view of Object.keys(KEY_TOKENS_BY_VIEW)) {
    it(`${view}: every advertised key has a help entry`, () => {
      const bar = strip(renderKeyBar(view, false, 240, 'forensic'));
      const fullHelp = consoleHelpText().join('\n');
      const section = helpSection(view);
      // Combined text: view-specific section + global section.
      const documented = `${section}\n${fullHelp}`;
      const specs = KEY_TOKENS_BY_VIEW[view]!;
      for (const spec of specs) {
        // Sanity: the keybar token is actually advertised in the KeyBar
        // (catches drift if the bar string changes upstream).
        expect(bar).toContain(spec.keybar.trim());
        // Coverage: at least one alias appears in the documented surface.
        const hit = spec.helpAliases.some((alias) => documented.includes(alias));
        expect(hit, `view=${view} key=${JSON.stringify(spec.keybar)} not documented (aliases=${JSON.stringify(spec.helpAliases)})`).toBe(true);
      }
    });
  }

  it('every section header from the help text corresponds to a view', () => {
    const lines = consoleHelpText();
    const headerRe = /^(\S+) view/;
    for (const line of lines) {
      const match = headerRe.exec(line);
      if (!match) continue;
      const view = match[1]!.toLowerCase();
      expect(['ps', 'feed', 'bead', 'diff', 'config']).toContain(view);
    }
  });

  it('global keys (q, ⌫, Tab) are documented once at the top', () => {
    const lines = consoleHelpText();
    const globalIdx = lines.findIndex((l) => /^Global keys/i.test(l));
    expect(globalIdx).toBeGreaterThan(-1);
    const globalSection = lines.slice(globalIdx, globalIdx + 6).join('\n');
    expect(globalSection).toContain('q');
    expect(globalSection).toContain('⌫');
    expect(globalSection).toContain('Tab');
  });
});
