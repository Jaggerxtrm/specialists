---
name: using-serena-lsp
description: Explores and edits code using semantic tools and LSP plugins. Use when reading code, understanding structure, finding symbols, or performing surgical edits to functions and classes.
allowed-tools: mcp__serena__*, Read, Edit, Bash
priority: high
---

# Using Serena LSP Workflow

**Core Principle**: Use semantic, symbol-level access to understand and edit code without reading entire files. Combine with LSP plugins for real-time analysis.

## Tools Reference

**Full Tool Documentation**: See [REFERENCE.md](REFERENCE.md)

| Tool | Purpose |
|------|---------|
| `get_symbols_overview` | **Start here.** See high-level structure of a file. |
| `find_symbol` | Read specific functions/classes (set `include_body=true`). |
| `find_referencing_symbols` | Find usages before editing. |
| `replace_symbol_body` | Surgically replace a function/class. |
| `insert_after_symbol` | Add new code after an existing symbol. |
| `search_for_pattern` | Regex search when symbol names are unknown. |

## Standard Workflows

**🚨 MANDATORY FIRST STEP FOR ALL WORKFLOWS:**

Before using ANY Serena semantic tools (`get_symbols_overview`, `find_symbol`, `replace_symbol_body`, etc.), you MUST activate the project:

```javascript
mcp__plugin_serena_serena__activate_project({ project: "/path/to/current/working/directory" })
```

**Why this is critical**: Without project activation, Serena cannot locate code symbols and will fail or loop indefinitely. This step establishes the working context for all symbolic operations.

---

### 1. Explore Code (The "Overview First" Pattern)

Avoid reading full files >300 LOC.

1.  **Activate Project**: `mcp__plugin_serena_serena__activate_project()`
2.  **Understand Structure**: `get_symbols_overview(depth=1)`
3.  **Drill Down**: `find_symbol(name_path="...", include_body=true)`
4.  **Reflect**: `think_about_collected_information()`

### 2. Surgical Editing

1.  **Activate Project**: `mcp__plugin_serena_serena__activate_project()` (if not already done)
2.  **Locate**: `find_symbol(include_body=true)` to get current code.
3.  **Check Impact**: `find_referencing_symbols()` to find usages.
4.  **Edit**: `replace_symbol_body(...)` to update.
5.  **Verify**: Run tests or syntax checks (e.g., `python -m py_compile`).

### 3. Adding Features

1.  **Activate Project**: `mcp__plugin_serena_serena__activate_project()` (if not already done)
2.  **Context**: `read_memory()` or `get_symbols_overview()` to understand patterns.
3.  **Locate Anchor**: `find_symbol()` to find where to insert.
4.  **Insert**: `insert_after_symbol(...)` to add new class/function.

## File Size Guidelines

| Lines of Code | Recommended Approach |
|---------------|----------------------|
| < 100 LOC | `Read` is acceptable. |
| 100-300 LOC | `get_symbols_overview` → `find_symbol`. |
| > 300 LOC | **Semantic only.** Do not read full file. |

## Quick Tips

*   **LSP Integration**: `Read()` on a Python file automatically triggers Pyright analysis. Use the feedback to fix type errors surgically.
*   **Symbol Names**: Use `substring_matching=true` if you aren't sure of the exact name.
*   **Safety**: Always find references before renaming or changing signatures.

## ⚠️ Critical Constraints

1. **NEVER skip project activation** - It must be the first Serena operation in any workflow
2. **Use the current working directory** - Pass the actual project path, not a placeholder
3. **Activate once per session** - After activation, all subsequent Serena tools will work correctly
4. **Check activation status** - If Serena tools fail with "symbol not found" errors, you likely forgot to activate