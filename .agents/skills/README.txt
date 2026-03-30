# Local Agent Skills

This directory contains specialized agent skills designed for the Gemini CLI. These skills extend the agent's capabilities for specific workflows like debugging, security auditing, and cross-model orchestration.

## Skill Discovery

All skills in this directory are automatically discovered by the `hooks/skill-discovery.py` hook at the start of each session. The hook injects a summarized list of these skills into the agent's initial context, ensuring the agent is aware of specialized tools from the first prompt.

### How to Add a New Skill

To add a new skill that is automatically discovered:

1.  **Create a Directory**: Add a new folder in `skills/` (e.g., `skills/my-new-skill/`).
2.  **Add `SKILL.md`**: Create a `SKILL.md` file in the new folder.
3.  **Define Metadata**: The `SKILL.md` **MUST** start with YAML frontmatter containing `name` and `description`.
4.  **Keep it Concise**: The `description` should ideally start with a single, clear sentence explaining *what* the skill does and *when* to use it. The discovery hook will only show the first sentence to keep the initial context efficient.

#### Metadata Schema (Example)

```yaml
---
name: my-new-skill
description: Performs deep architectural analysis of the project's dependency graph. Use when planning major refactors or evaluating library updates.
version: 1.0.0
---
```

## Maintenance

- **Update Descriptions**: If you significantly change a skill's purpose, ensure the first sentence of its description in `SKILL.md` is updated.
- **Workflow Integrity**: Avoid creating empty skill directories or `SKILL.md` files without proper frontmatter.
