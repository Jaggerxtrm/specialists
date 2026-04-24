---
name: bun-native-tooling
kind: mandatory-rule
---
- id: use-bunx-not-npx
  level: required
  text: "Run tests and scripts via 'bunx <tool>' or 'bun run <script>'. Do NOT use 'npx', 'pnpm', or 'pnpm exec'. Reason: this repo uses bun as package manager. pnpm invocations fail with ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL. npx spawns subprocess trees that have destabilized supervised specialist sessions (observed: reviewer crashes during 'npx vitest' runs). Examples: 'bunx vitest run <file>', 'bun run build', 'bunx tsc --noEmit'."
