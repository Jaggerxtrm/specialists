# Multi-Agent Orchestration Protocols

This reference defines how the `delegating` skill orchestrates between Gemini and Qwen agents for complex tasks.

## Protocol 1: Single Handshake (`handshake`)
**Use Case**: Quick validation, code review, or security check.

1. **Step 1 (Gemini)**: `gemini -p "Analyze this code for security vulnerabilities: [CODE]"`
2. **Step 2 (Qwen)**: `qwen "Review the vulnerabilities identified by Gemini and suggest specific fixes: [GEMINI_OUTPUT]"`
3. **Synthesis**: Present Qwen's final review to the user.

## Protocol 2: Collaborative Design (`collaborative`)
**Use Case**: Feature implementation, architecture planning, or major refactoring.

1. **Step 1 (Gemini - Design)**: `gemini -p "Design a new [FEATURE] based on these requirements: [REQ]"`
2. **Step 2 (Qwen - Implementation)**: `qwen "Implement the design provided by Gemini: [GEMINI_OUTPUT]"`
3. **Step 3 (Gemini - Verification)**: `gemini -r latest -p "Verify that the implementation from Qwen meets all original requirements: [QWEN_OUTPUT]"`
4. **Final Result**: Present the implementation and verification to the user.

## Protocol 3: Troubleshoot Session (`troubleshoot`)
**Use Case**: Complex debugging, root cause analysis, or emergency production errors.

1. **Step 1 (Gemini - Hypothesis)**: `gemini -p "Analyze these logs and provide 3 hypotheses for the crash: [LOGS]"`
2. **Step 2 (Qwen - Verification)**: `qwen "Verify Hypothesis #1 using the provided source code: [HYPOTHESIS_1] [CODE]"`
3. **Step 3 (Gemini - Root Cause)**: `gemini -r latest -p "Based on Qwen's verification, provide the final root cause and a remediation plan."`
4. **Remediation**: Present the final fix to the user.

## CLI Command Reference

### Gemini
- **Initial**: `gemini -p "PROMPT"`
- **Resume**: `gemini -r latest -p "FOLLOW_UP"`

### Qwen
- **Initial**: `qwen "PROMPT"`
- **Continue**: `qwen -c "FOLLOW_UP"`

## Best Practices
- **Minimal Context**: Only send the necessary snippets to avoid hitting token limits in the handoff.
- **Structured Prompts**: Use clear, instruction-heavy prompts for the second agent.
- **Final Review**: Always synthesize the final multi-agent output before presenting it to the user.
