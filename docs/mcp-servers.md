---
title: MCP Servers Configuration
scope: mcp-servers
category: reference
version: 1.1.0
updated: 2026-03-23
description: Project-scoped MCP registration for Specialists.
source_of_truth_for:
  - ".mcp.json"
  - "src/cli/init.ts"
domain:
  - mcp
---

# MCP Servers Configuration

Specialists exposes an MCP server for Claude Code integration.

## MCP tools

| Tool | Description |
|---|---|
| `specialist_init` | bootstrap guidance and specialist discovery |
| `list_specialists` | discover specialists in the current project |
| `use_specialist` | run a specialist synchronously |
| `specialist_status` | health and background job summary |
| `start_specialist` | async job start |
| `poll_specialist` | poll async job output |
| `stop_specialist` | cancel a running job |
| `run_parallel` | concurrent or pipeline specialist execution |

## Registration

The MCP server is registered at **project scope** by `specialists init`.

Command used internally:

```bash
claude mcp add --scope project specialists -- specialists
```

Resulting project configuration is stored in `.mcp.json`.

Typical entry:

```json
{
  "mcpServers": {
    "specialists": {
      "type": "stdio",
      "command": "specialists",
      "args": [],
      "env": {}
    }
  }
}
```

## Verification

```bash
specialists init
claude mcp get specialists
specialists doctor
```

You should see Specialists registered at **Project config** scope.

## See also

- [bootstrap.md](bootstrap.md)
- [workflow.md](workflow.md)
