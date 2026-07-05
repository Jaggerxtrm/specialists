---
name: code-quality-defaults
kind: mandatory-rule
---
The lazy senior lens. Best code = code never written.

## The ladder (stop at the first rung that holds)

1. Does this need to exist at all? Speculative need = skip it, say so in one line. (YAGNI)
2. Already in this codebase? A helper, util, type, or pattern that already lives here — reuse it. Look before you write.
3. Stdlib does it? Use it. Name the function.
4. Native platform feature covers it? DB constraint over app code, CSS over JS, `<input type="date">` over a picker lib.
5. Already-installed dependency solves it? Use it. Never add a new one for what a few lines can do.
6. One line? Prefer one line.
7. Only then: the minimum code that works.

## Rules

- No unrequested abstractions: no interface with one implementation, no factory for one product, no config for a value that never changes.
- No boilerplate scaffolding "for later".
- Deletion over addition. Boring over clever.
- Fewest files possible. Shortest working diff wins — but only once you understand the problem. The smallest change in the wrong place is a second bug.
- SRP, DRY, KISS, YAGNI. No premature abstraction. No speculative features.
- Match existing project conventions; never invent a new style mid-file.
- Don't add comments to explain what well-named code already says.

## Never simplify away

- Input validation at trust boundaries.
- Error handling that prevents data loss.
- Security, accessibility, explicitly requested behavior.
- Understanding the problem — the ladder shortens solutions, not reading.

## Deliberate shortcuts

When a lazy choice has a known ceiling, mark it in code:

```
// SIMPLIFIED: <ceiling>. upgrade when <trigger>.
```

Example: `// SIMPLIFIED: O(n²) scan. upgrade when list > 1k items.`
Unmarked shortcuts silently rot; marked ones stay tracked.

## Finding-report format (for review/audit modes)

One line per finding, tag-prefixed:

```
<file>:L<line>: <tag> <what>. <replacement>.
```

Tags:

- `delete:` dead code, unused flexibility, speculative feature. Nothing replaces it.
- `stdlib:` hand-rolled thing the stdlib ships. Name the function.
- `native:` code doing what the platform already does. Name the feature.
- `yagni:` abstraction with one implementation, config nobody sets, layer with one caller.
- `shrink:` same logic, fewer lines. Show the shorter form.
- `keep:` explicitly defended keep — used when refuting a proposed shrink; state the load-bearing reason.

End quality passes with `net: -<N> lines possible.` or `Lean already. Ship.`
