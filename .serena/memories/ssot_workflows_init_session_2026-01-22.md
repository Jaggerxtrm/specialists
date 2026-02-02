---
title: Init Session Workflow SSOT
version: 0.2.0
updated: 2026-02-02
scope: workflow
category: ssot
subcategory: workflows
domain: [workflows, dev-experience]
applicability: all
changelog:
  - 0.2.0 (2026-02-02): Updated model version references from gemini-2.5-flash to gemini-3-flash-preview per v0.4.0 backend consolidation.
  - 0.1.0 (2026-01-22): Initial creation. Documenting refactored logic designated as SSOT.
---

## Purpose
The `init-session` workflow initializes the development session by analyzing the repository state, verifying tool availability, and retrieving relevant context. Its primary goal is to provide the agent (and user) with immediate situational awareness upon starting a task.

## Overview
This workflow runs automatically or manually at the start of a session. It:
1.  Checks the Git status (branch, staged/modified files).
2.  Analyzes the last N commits using AI to summarize recent work.
3.  Searches for relevant documentation in both `.serena/memories` and `docs/` based on commit keywords.
4.  Verifies the availability of installed CLI tools (Gemini, Cursor, Droid).

## Key Components

### 1. Git Analysis
-   Uses `gitHelper` to fetch status, diffs, and logs.
-   Summarizes the last 10 commits (configurable) to understand recent context.

### 2. AI Commit Analysis
-   **Model**: Defaults to `gemini-3-flash-preview` (via `AI_MODELS.GEMINI.FLASH`) for speed and cost-efficiency.
-   **Backend**: Uses the `ask-gemini` backend via `executeAIClient`.
-   **Prompt**: Generates a summary of features, bug fixes, and architectural changes based on diffs.

### 3. Context Retrieval (Refactored)
-   **Scope**: Searches both `.serena/memories` (past decisions/SSOTs) and `docs/` (formal documentation).
-   **Mechanism**: Extracts keywords from commit messages and matches them against markdown files in the target directories.
-   **Output**: Lists relevant files with matches to guide the agent's reading.

## Configuration

-   **Constants**: Defined in `src/constants.ts` and `src/workflows/init-session.workflow.ts`.
-   **Default Model**: `gemini-3-flash-preview` (via `AI_MODELS.GEMINI.FLASH` constant).

## Current State

### What Works
-   Git context extraction is robust.
-   AI analysis provides quick summaries of recent work.
-   Documentation search correctly spans both memories and project docs.
-   Integration tests cover the documentation search logic and model selection.

### Known Limitations
-   AI analysis depends on the configured backend's availability.
-   Keyword matching is simple string matching; semantic search is not yet implemented for this specific workflow step (though `obsidian-search` exists elsewhere).

## Related SSOTs
-   (None yet explicitly linked, future: `ssot_workflows_architecture.md`)

## Next Steps
-   [x] Updated to `gemini-3-flash-preview` (completed in v0.4.0)
-   [ ] Monitor performance of `gemini-3-flash-preview` for this task.
-   [ ] Consider adding semantic search integration if keyword matching proves insufficient.

## References
-   `src/workflows/init-session.workflow.ts`
-   `src/utils/aiExecutor.ts`
-   `tests/integration/init-session-docs.test.ts`
