# Serena Tool Reference

Detailed documentation for Serena MCP semantic tools.

## Contents
- [1. Exploration & Navigation](#1-exploration--navigation-tools)
- [2. Editing Tools](#2-editing-tools)
- [3. Memory Management](#3-memory-management-tools)
- [4. Meta & Thinking](#4-meta--thinking-tools)

---

## 1. Exploration & Navigation Tools

### `list_dir`
List files and directories with optional recursion.
```python
mcp__serena__list_dir(
    relative_path=".",  # or "src/analysis"
    recursive=true,
    skip_ignored_files=true
)
```

### `find_file`
Find files by name pattern (wildcards supported).
```python
mcp__serena__find_file(
    file_mask="*volatility*.py",
    relative_path="scripts"
)
```

### `get_symbols_overview`
Get high-level code structure (symbol tree) without reading the file body.
```python
mcp__serena__get_symbols_overview(
    relative_path="scripts/core/analytics.py",
    depth=1  # 0=top-level, 1=include children (methods)
)
```

### `find_symbol`
Locate specific symbols (functions, classes, methods) semantically.
```python
mcp__serena__find_symbol(
    name_path_pattern="VolatilityCalculator/analyze_rv_trend",
    relative_path="scripts/core/volatility_suite.py",
    depth=1,
    include_body=true,  # Set true only when needing source code
    substring_matching=true,
    include_kinds=[5, 6, 12]  # 5=Class, 6=Method, 12=Function
)
```

**LSP Symbol Kinds Reference**:
```
1=file, 2=module, 3=namespace, 4=package, 5=class, 6=method,
7=property, 8=field, 9=constructor, 10=enum, 11=interface,
12=function, 13=variable, 14=constant, 15=string, 16=number,
17=boolean, 18=array, 19=object, 20=key, 21=null,
22=enum member, 23=struct, 24=event, 25=operator, 26=type parameter
```

### `find_referencing_symbols`
Find all places that reference a symbol. Essential before editing.
```python
mcp__serena__find_referencing_symbols(
    name_path="calculate_volatility",
    relative_path="scripts/core/analytics.py"
)
```

### `search_for_pattern`
Flexible regex/substring search in code.
```python
mcp__serena__search_for_pattern(
    substring_pattern="def.*volatility",  # Regex (DOTALL enabled)
    relative_path="scripts/core",
    restrict_search_to_code_files=true,
    context_lines_before=2,
    context_lines_after=2
)
```

---

## 2. Editing Tools

### `replace_symbol_body`
Replace entire symbol definition atomically.
```python
mcp__serena__replace_symbol_body(
    name_path="get_db_engine",
    relative_path="scripts/core/volatility_suite.py",
    body="def get_db_engine(): ..."
)
```

### `insert_after_symbol`
Insert code after a symbol's definition ends.
```python
mcp__serena__insert_after_symbol(
    name_path="VolatilityCalculator",
    relative_path="scripts/core/analytics.py",
    body="

class RiskCalculator: ..."
)
```

### `insert_before_symbol`
Insert code before a symbol's definition starts (e.g., imports).
```python
mcp__serena__insert_before_symbol(
    name_path="VolatilityCalculator",
    relative_path="scripts/core/analytics.py",
    body="from typing import Protocol

"
)
```

### `rename_symbol`
Rename symbol across entire codebase using LSP.
```python
mcp__serena__rename_symbol(
    name_path="calculate_volatility",
    relative_path="scripts/core/analytics.py",
    new_name="compute_volatility"
)
```

---

## 3. Memory Management Tools

### `write_memory`
Store project decisions, patterns, architecture notes.
```python
mcp__serena__write_memory(
    memory_file_name="architecture_decision_auth",
    content="# Auth Pattern
..."
)
```

### `read_memory`
Retrieve stored project knowledge.
```python
mcp__serena__read_memory(memory_file_name="architecture_decision_auth")
```

### `list_memories`
Discover available project knowledge.
```python
mcp__serena__list_memories()
```

### `edit_memory`
Update existing memory files.
```python
mcp__serena__edit_memory(
    memory_file_name="architecture_decision_auth",
    mode="regex",
    needle="Old",
    repl="New"
)
```

### `delete_memory`
Remove obsolete memory files.
```python
mcp__serena__delete_memory(memory_file_name="deprecated_pattern")
```

---

## 4. Meta & Thinking Tools

### `check_onboarding_performed`
Check if project onboarding was completed.

### `onboarding`
Get instructions for project onboarding.

### `think_about_collected_information`
Reflect after exploration/search operations.

### `think_about_task_adherence`
Verify you're still on track for the task.

### `think_about_whether_you_are_done`
Assess task completion.
