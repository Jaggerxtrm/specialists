# Cerebrum

> OpenWolf's learning memory. Updated automatically as the AI learns from interactions.
> Do not edit manually unless correcting an error.
> Last updated: 2026-03-31

## User Preferences

<!-- How the user likes things done. Code style, tools, patterns, communication. -->

## Key Learnings

- **Project:** @jaggerxtrm/specialists
- **Description:** OmniSpecialist — 7-tool MCP orchestration layer powered by the Specialist System. Discover and execute .specialist.yaml files across project/user/system scopes via pi.

## Do-Not-Repeat

- [2026-04-22] When changing CLI behavior, rebuild and publish updated dist/index.js before claiming fix shipped. Source-only fix is insufficient because npm package executes bundled dist.
- [2026-04-24] In this project, executor specialists do not use Bun/Vitest for verification. Do not ask executors to run vitest or bun test commands; keep executor verification to lint/tsc and handle tests via reviewer/test-runner or manual follow-up outside the executor path.

<!-- Mistakes made and corrected. Each entry prevents the same mistake recurring. -->
<!-- Format: [YYYY-MM-DD] Description of what went wrong and what to do instead. -->

## Decision Log

<!-- Significant technical decisions with rationale. Why X was chosen over Y. -->
