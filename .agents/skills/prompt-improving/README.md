# prompt-improving

Automatically improves user prompts using Claude's XML best practices before execution.

## Purpose

Transforms raw, unstructured prompts into well-formatted requests that leverage Claude's capabilities more effectively. Applies semantic XML tags, multishot examples, chain-of-thought reasoning, and contextual structure based on task type.

## Invocation

```
/prompt-improving "raw prompt text"
```

The skill analyzes the input prompt and enhances it with:
- Semantic XML structure
- Relevant examples from reference library
- Chain-of-thought scaffolding
- Context-appropriate formatting

## Associated Hooks

**skill-suggestion.sh**

Proactively suggests using `/prompt-improving` when detecting:
- Very short prompts (less than 35 characters)
- Generic requests without specificity
- Analysis or explanation tasks
- Prompts in Italian or English

Configuration in `~/.claude/settings.json`:
```json
{
  "skillSuggestions": {
    "enabled": true
  }
}
```

## Execution Flow

1. **Detect Context**: Analyze prompt for task type (analysis, development, refactoring)
2. **Apply Core XML**: Structure prompt with semantic tags from reference library
3. **Add Examples**: Include multishot examples when beneficial
4. **Handle Ambiguity**: If prompt is very vague, use AskUserQuestion dialog to clarify intent
5. **Execute Improved**: Run the enhanced prompt through Claude

## Reference Files

The skill uses these reference documents to inform improvements:

- `xml_core.md` - Semantic XML tags and prefill patterns
- `multishot.md` - Example-based learning patterns
- `chain_of_thought.md` - Reasoning scaffolds
- `mcp_definitions.md` - MCP-specific structures
- `analysis_commands.md` - Analysis task patterns

## Configuration

No additional configuration required beyond hook setup.

## Examples

### Example 1: Short Analysis Prompt

**Before:**
```
analyze logs
```

**After:**
```xml
<log_analysis>
  <thinking>
    To analyze the logs effectively, I should:
    1. Identify error patterns
    2. Check timestamps for incident correlation
    3. Look for system warnings
    4. Summarize critical issues
  </thinking>
  <description>Analyze application logs for errors and issues</description>
  <constraints>
    - Focus on ERROR and WARN level entries
    - Provide actionable recommendations
  </constraints>
</log_analysis>
```

### Example 2: Development Task

**Before:**
```
implement oauth
```

**After:**
```xml
<implementation>
  <description>Implement OAuth 2.0 authentication</description>
  <parameters>
    <param name="flow">Authorization Code flow with PKCE</param>
    <param name="provider">To be specified</param>
  </parameters>
  <examples>
    <example>Standard OAuth flow with JWT tokens</example>
  </examples>
  <instructions>
    1. Setup OAuth client configuration
    2. Implement authorization endpoint
    3. Handle token exchange
    4. Validate and refresh tokens
  </instructions>
  <constraints>
    - Follow OAuth 2.0 security best practices
    - Use HTTPS for all endpoints
    - Implement proper CSRF protection
  </constraints>
</implementation>
```

## Ambiguity Handling

When the prompt is too vague (less than 8 words, no specifics), the skill presents an interactive dialog:

```
Clarify: The prompt is ambiguous. What would you like me to focus on?

Options:
1. Add more detail - I'll provide more context
2. Execute as-is - Apply basic XML structure and proceed
3. Cancel - Skip prompt improvement
```

## Version History

- **v5.1.0** (2026-01-30): Renamed from `p` to `prompt-improving` following Claude naming conventions
- **v5.0.0** (2026-01-30): Simplified from 118 to 64 lines, removed complex quality metrics
- **v4.2.0** (Pre-2026): Original feature-rich version with detailed scoring

## Related Documentation

- [Main README](../../README.md)
- [CHANGELOG](../../CHANGELOG.md)
- [ROADMAP](../../ROADMAP.md) - See Programmatic Tool Calling integration plans
- [Hook Documentation](../../hooks/README.md)

## Troubleshooting

**Skill not triggering**
- Verify skill directory is in `~/.claude/skills/`
- Check SKILL.md frontmatter has correct name
- Restart Claude Code if recently installed

**No suggestions from hook**
- Check `settings.json` has `skillSuggestions.enabled: true`
- Verify `skill-suggestion.sh` is executable
- Check hook timeout is sufficient (default: 1s)

**Prompts not being improved**
- Try explicit invocation: `/prompt-improving "your prompt"`
- Check reference files exist in `references/` directory
- Verify no errors in Claude Code console
