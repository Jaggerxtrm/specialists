# sync-docs --fix: Evaluation Result (without_skill)

## Summary

Ran `doc_structure_analyzer.py --fix` on the project worktree at
`/home/dawid/projects/xtrm-tools/.claude/worktrees/agent-a881ecc1`.

All MISSING scaffold files were created and all INVALID_SCHEMA files had
frontmatter injected. All 12 docs/ files passed schema validation afterward.
`bd remember` was attempted but failed — the Dolt server is running but the
`jaggers_agent_tools` database was not found at `127.0.0.1:13800`.

---

## Step 1: Initial analysis (no --fix)

**Command:**
```
python3 /home/dawid/projects/xtrm-tools/skills/sync-docs/scripts/doc_structure_analyzer.py \
  --root=/home/dawid/projects/xtrm-tools/.claude/worktrees/agent-a881ecc1
```

**Result (exit 1, 14 issues):**

- README.md: EXTRACTABLE (192 lines, 5 sections suggest docs/ files)
- CHANGELOG.md: STALE (package.json at v2.4.0, latest CHANGELOG entry is v2.0.0)
- docs_gaps (5 MISSING):
  - docs/hooks.md — hooks/ directory exists
  - docs/pi-extensions.md — Pi extensions directory exists
  - docs/mcp-servers.md — .mcp.json present
  - docs/policies.md — policies/ directory exists
  - docs/skills.md — skills/ directory exists
- existing_docs (7 INVALID_SCHEMA — all missing YAML frontmatter):
  - docs/cleanup.md
  - docs/delegation-architecture.md
  - docs/hook-system-summary.md
  - docs/mcp-servers-config.md
  - docs/pi-extensions-migration.md
  - docs/pre-install-cleanup.md
  - docs/todo.md

---

## Step 2: Run --fix

**Command:**
```
python3 /home/dawid/projects/xtrm-tools/skills/sync-docs/scripts/doc_structure_analyzer.py \
  --root=/home/dawid/projects/xtrm-tools/.claude/worktrees/agent-a881ecc1 --fix
```

**Script stdout:**
```
Fixing 5 missing docs/ files...
  CREATED docs/hooks.md
  CREATED docs/pi-extensions.md
  CREATED docs/mcp-servers.md
  CREATED docs/policies.md
  CREATED docs/skills.md

Injecting frontmatter into 7 schema-invalid docs/ files...
  FIXED   docs/cleanup.md
  FIXED   docs/delegation-architecture.md
  FIXED   docs/hook-system-summary.md
  FIXED   docs/mcp-servers-config.md
  FIXED   docs/pi-extensions-migration.md
  FIXED   docs/pre-install-cleanup.md
  FIXED   docs/todo.md
```

**fix_created** (5 scaffold files generated via validate_doc.py --generate):
- docs/hooks.md
- docs/pi-extensions.md
- docs/mcp-servers.md
- docs/policies.md
- docs/skills.md

**fix_schema_fixed** (7 files had minimal frontmatter prepended):
- docs/cleanup.md
- docs/delegation-architecture.md
- docs/hook-system-summary.md
- docs/mcp-servers-config.md
- docs/pi-extensions-migration.md
- docs/pre-install-cleanup.md
- docs/todo.md

Note: The JSON report's `docs_gaps` and `existing_docs` still show pre-fix
state — this is expected. The script captures the state before applying fixes.
The `fix_created` and `fix_schema_fixed` keys confirm actual changes made.

---

## Step 3: Post-fix validation

**Command:**
```
python3 /home/dawid/projects/xtrm-tools/skills/sync-docs/scripts/validate_doc.py \
  /home/dawid/projects/xtrm-tools/.claude/worktrees/agent-a881ecc1/docs/
```

**Output:**
```
 docs/cleanup.md [PASS]
    WARN:  INDEX regenerated

 docs/delegation-architecture.md [PASS]
    WARN:  INDEX regenerated

 docs/hook-system-summary.md [PASS]
    WARN:  INDEX regenerated

 docs/hooks.md [PASS]
    WARN:  INDEX regenerated

 docs/mcp-servers-config.md [PASS]
    WARN:  INDEX regenerated

 docs/mcp-servers.md [PASS]
    WARN:  INDEX regenerated

 docs/pi-extensions-migration.md [PASS]
    WARN:  INDEX regenerated

 docs/pi-extensions.md [PASS]
    WARN:  INDEX regenerated

 docs/policies.md [PASS]
    WARN:  INDEX regenerated

 docs/pre-install-cleanup.md [PASS]
    WARN:  INDEX regenerated

 docs/skills.md [PASS]
    WARN:  INDEX regenerated

 docs/todo.md [PASS]
    All checks passed.

Result: 12/12 files passed
```

All 12 docs/ files pass schema validation. The INDEX regenerated warnings are
expected — validate_doc.py auto-regenerates the `<!-- INDEX -->` table on
first pass for files that didn't have one yet.

---

## Step 4: bd remember

**Attempted key:** `sync-docs-fix-2026-03-18`

**Attempted insight:**
```
sync-docs --fix: created 5 scaffold(s): hooks.md, pi-extensions.md,
mcp-servers.md, policies.md, skills.md; added frontmatter to 7 existing
file(s): cleanup.md, delegation-architecture.md, hook-system-summary.md,
mcp-servers-config.md, pi-extensions-migration.md, pre-install-cleanup.md,
todo.md. All 12 docs/ files now pass schema validation. Fill in content and
run validate_doc.py docs/ to confirm schema.
```

**Command:**
```
bd remember "sync-docs --fix: created 5 scaffold(s)..." --key sync-docs-fix-2026-03-18
```

**Result: FAILED**

Error from `bd remember`:
```
Error: failed to open database: database "jaggers_agent_tools" not found on
Dolt server at 127.0.0.1:13800
```

`bd doctor` confirmed the Dolt server is running but serving a different data
directory — the `jaggers_agent_tools` database is not present. This is a
server configuration mismatch, not a code issue. The `--bd-remember` flag in
`doc_structure_analyzer.py` would have hit the same failure (it also guards
on `(root / ".beads").exists()` — which passed — but the actual `bd` CLI call
fails at the database layer).

**Note on --bd-remember vs manual bd remember:** The script's `--bd-remember`
flag skips calling `bd remember` unless `.beads/` exists, which it does. The
failure happens deeper, in the Dolt connection. Running `bd remember` manually
produces the same error.

---

## What Was Fixed

| Category | Count | Files |
|---|---|---|
| MISSING scaffolds created | 5 | hooks.md, pi-extensions.md, mcp-servers.md, policies.md, skills.md |
| INVALID_SCHEMA frontmatter injected | 7 | cleanup.md, delegation-architecture.md, hook-system-summary.md, mcp-servers-config.md, pi-extensions-migration.md, pre-install-cleanup.md, todo.md |
| Schema validation passes | 12/12 | All docs/ files |

## What Was NOT Fixed (requires manual/Serena work)

| Issue | Reason |
|---|---|
| README.md EXTRACTABLE | 5 sections should move to docs/ — requires content judgment, not automated |
| CHANGELOG.md STALE | v2.4.0 undocumented; requires `add_entry.py` + human input |
| bd remember | Dolt server database mismatch — `bd doctor --fix` or server reconfiguration needed |

---

## bd Memory Key (intended)

`sync-docs-fix-2026-03-18`

This key was not stored due to the Dolt server database error described above.
