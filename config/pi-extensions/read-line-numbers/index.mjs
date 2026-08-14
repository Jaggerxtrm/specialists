// Forked from xtrm-dev/core@7f6cd7f7
//   packages/pi-extensions/extensions/read-line-numbers/index.ts
//
// SUNSET CONDITION:
// This vendored compatibility fork exists ONLY until an operator-authorized
// release of Core's managed pi-extensions bundle contains the corrected
// numberReadText. Once available, Specialists switches from --no-extensions +
// -e <this-fork-path> to the full Core-managed pi-extensions integration
// (governed load of the complete bundle after --no-extensions), and this file
// and its resolver src/pi/read-line-numbers-extension.ts are deleted. Do not
// double-load the numbered-read transform.
//
// read-line-numbers — owns the model-facing transform of Pi's built-in `read`
// tool: every source line is prefixed with its true line number, honoring the
// caller's `offset` so numbering matches the file, not the window position.
//
// EOF MODEL — matches Pi exactly (pi-coding-agent read.js line 85):
// `text.split("\n")`. For file "one\ntwo\n" the split yields
// ["one","two",""], so line 3 is a citable empty line at EOF. Every element
// of the split is numbered, including a trailing empty produced by a
// terminating newline — this is the ONLY way citations resolve against the
// same total-line count Pi and Specialists' citation-evidence verifier use.
// See tests/unit/specialist/eof-parity.test.ts for the cross-contract proof.
//
// Boundaries:
//  - The transform applies ONLY to built-in `read` tool results
//    (discriminated via isReadToolResult). All other tools pass through.
//  - Pi synthetic notices are preserved verbatim — prefixing one would
//    fabricate a false citation. They are recognized by the same discriminants
//    Pi uses: isError for error banners, details.truncation for truncation
//    notices, and the exact notice text Pi appends for user-limit reads.
//  - Image reads emit a text note ("Read image file [mime]") that must NOT
//    be numbered — it is a Pi status message, not file content.
//  - xtrm-ui remains presentation-only: it renders the already-numbered
//    content unchanged and never re-prefixes.

import { isReadToolResult } from '@earendil-works/pi-coding-agent';

/** Pi appends this notice after a blank separator when the line limit was hit. */
const SHOWING_NOTICE = /^\[Showing lines \d+-\d+ of \d+.*Use offset=\d+ to continue\.\]$/;
/** Pi appends this notice when a user-specified `limit` stopped before EOF. */
const USER_LIMIT_NOTICE = /^\[\d+ more lines in file\. Use offset=\d+ to continue\.\]$/;
/** Pi emits this banner alone when the first line exceeds the byte limit. */
const FIRST_LINE_BANNER = /^\[Line \d+ is .* exceeds .* limit\. Use bash: sed -n '\d+p' .*\]$/;

function isSyntheticNotice(line) {
  return SHOWING_NOTICE.test(line) || USER_LIMIT_NOTICE.test(line) || FIRST_LINE_BANNER.test(line);
}

function numberLines(lines, startLine) {
  return lines.map((line, index) => `${startLine + index} | ${line}`).join('\n');
}

/**
 * Number the model-facing text of a `read` tool result.
 *
 * - `startLine` is the 1-based number of the first line (Pi's `offset`, default 1).
 * - `truncated` mirrors `details.truncation.truncated`: when true, Pi appended a
 *   trailing `\n\n[Showing lines ...]` notice that stays verbatim.
 * - The line model is `text.split("\n")` — every element is a real Pi line,
 *   including the trailing empty produced by a terminating newline. That
 *   trailing empty is numbered so a citation to line N resolves correctly
 *   when line N is the EOF blank.
 */
export function numberReadText(text, startLine, truncated) {
  const lines = text.split('\n');
  const last = lines.length - 1;
  if (isSyntheticNotice(lines[last])) {
    // Whole payload is a banner (firstLineExceedsLimit) — keep verbatim.
    if (last === 0) return lines[last];
    // Trailing "\n\n[notice]": number the body, re-append the notice verbatim
    // with the blank separator restored (source = split minus separator+notice).
    const source = lines.slice(0, last - 1);
    return numberLines(source, startLine) + '\n\n' + lines[last];
  }
  return numberLines(lines, startLine);
}

export default function readLineNumbersExtension(pi) {
  pi.on('tool_result', (event) => {
    // Built-in `read` tool only — never intercept other tools.
    if (!isReadToolResult(event)) return undefined;
    // Error banners ("Offset N is beyond end of file", ...) stay verbatim.
    if (event.isError) return undefined;
    const truncation = event.details?.truncation;
    // The whole payload is the bash-fallback banner, not file content.
    if (truncation?.firstLineExceedsLimit) return undefined;
    // Image / non-text (binary) content: no-op.
    if (event.content.some((item) => item.type !== 'text')) return undefined;
    // Image text-note passthrough: Pi sometimes emits just the "Read image
    // file [mime]" text note (no binary follows). It's a status line, not
    // file content — numbering it would fabricate a citation.
    if (
      event.content.length === 1 &&
      event.content[0].type === 'text' &&
      /^Read image file \[/.test(event.content[0].text)
    ) {
      return undefined;
    }

    // Pi's `offset` is 1-based; the first displayed line keeps that number.
    const startLine = event.input.offset != null && event.input.offset > 0 ? event.input.offset : 1;
    const transformed = event.content.map((item) => {
      if (item.type !== 'text') return item;
      const text = item.text;
      if (typeof text !== 'string') return item;
      return { type: 'text', text: numberReadText(text, startLine, truncation?.truncated === true) };
    });
    return { content: transformed };
  });
}
