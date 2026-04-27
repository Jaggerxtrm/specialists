---
name: serena-cheatsheet
kind: mandatory-rule
rules:
  - id: prefer-serena
    level: required
    text: "Prefer Serena tools over read/grep/find/ls for source code (.ts .py .go .rs .js etc.). Native tools fine for .md .json .yaml configs."
  - id: get_symbols_overview
    level: required
    text: "get_symbols_overview <path> — symbol skeleton of a file or dir (~300 tokens vs reading the whole file). Use first to pick what you actually need."
  - id: find_symbol
    level: required
    text: "find_symbol <name_path> — fetch one symbol's body (or just signature). Drop-in replacement for read-then-scan-for-function workflows."
  - id: find_referencing_symbols
    level: required
    text: "find_referencing_symbols <name_path> — who calls or uses this symbol across the codebase."
  - id: search_for_pattern
    level: required
    text: "search_for_pattern <regex> — replaces grep. Returns matches with file:line context."
  - id: find_file
    level: required
    text: "find_file <glob> and list_dir <path> — replace native find and ls."
  - id: read_file
    level: required
    text: "read_file <path> — full or sliced read. Use only when navigation tools are not enough; check get_symbols_overview first."
  - id: replace_symbol_body
    level: required
    text: "replace_symbol_body <name_path> — swap a function or class body in place. Use instead of Edit string-match for symbol-scoped changes (MEDIUM+ permission)."
  - id: insert_around_symbol
    level: required
    text: "insert_before_symbol / insert_after_symbol <name_path> — add adjacent code such as imports or helpers (MEDIUM+ permission)."
  - id: rename_symbol
    level: required
    text: "rename_symbol <name_path> <new_name> — refactor-safe across all references. Use instead of find-and-replace (MEDIUM+ permission)."
  - id: replace_content
    level: required
    text: "replace_content <path> <pattern> <replacement> — line-range or regex edits when no symbol target fits (MEDIUM+ permission)."
  - id: cost-rule
    level: info
    text: "Rule of thumb: read of a 500-line source file ~5000 tokens; find_symbol on one function ~200 tokens (~25x cheaper). Use get_symbols_overview before deciding."
---
