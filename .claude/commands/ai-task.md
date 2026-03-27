---
description: Execute unitAI workflows (list, run, cursor, droid)
argument-hint: <list|run|cursor|droid> [workflow-name|prompt] [--params]
allowed-tools: mcp__unitAI__*, Bash(git:*)
---

Execute AI workflows using the unitAI system.

**Arguments received:** $ARGUMENTS

## Instructions

Based on the first argument, perform the appropriate action:

### If first argument is "list" or empty:
Use `mcp__unitAI__list_workflows` to display all available workflows with their descriptions.

### If first argument is "run":
1. The second argument (`$2`) is the workflow name
2. Parse remaining arguments as workflow parameters (format: `--key value`)
3. Use `mcp__unitAI__smart-workflows` with:
   - `workflow`: the workflow name from `$2`
   - `params`: parsed key-value pairs from remaining arguments

**Available workflows include:**
- `parallel-review` - Multi-backend code review
- `pre-commit-validate` - Validate staged changes
- `init-session` - Initialize development session
- `validate-last-commit` - Analyze recent commit
- `feature-design` - Design new features
- `debugger` - Find and analyze bugs
- `triangulated-review` - 3-way cross-check
- `auto-remediation` - Generate fix plans
- `refactor-sprint` - Plan complex refactors

### If first argument is "cursor":
1. Extract the quoted prompt from arguments
2. Parse optional `--model` and `--files` parameters
3. Use `mcp__unitAI__ask-cursor` with:
   - `prompt`: the extracted prompt
   - `model`: if provided (default: gpt-5.1)
   - `files`: if provided (comma-separated list)

### If first argument is "droid":
1. Extract the quoted prompt from arguments
2. Parse optional `--auto` (low|medium|high) and `--files` parameters
3. Use `mcp__unitAI__droid` with:
   - `prompt`: the extracted prompt
   - `auto`: autonomy level if provided
   - `files`: if provided

## Example Usage
- `/ai-task list`
- `/ai-task run pre-commit-validate --depth thorough`
- `/ai-task run parallel-review --files src/index.ts --focus security`
- `/ai-task cursor "Refactor this function for better performance"`
- `/ai-task droid "Implement the TODO items" --auto medium`
