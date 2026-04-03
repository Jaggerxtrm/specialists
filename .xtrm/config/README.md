# .xtrm/config

## MCP config split

This directory contains two MCP canonical files:

- `claude.mcp.json` → Claude-family MCP format (sync target: `.mcp.json`)
- `pi.mcp.json` → Pi-native MCP format (sync target: `.pi/mcp.json`)

Do not mix formats between these files. They intentionally use different schemas.
