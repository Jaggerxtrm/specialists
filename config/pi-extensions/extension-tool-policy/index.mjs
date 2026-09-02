// Specialists-owned extension tool policy (unitAI-34pyf) + advisory (unitAI-kaae7).
//
// Loaded LAST (-e) by the specialist spawn when execution.extensions sources
// are enabled, together with `--no-builtin-tools`. At session_start every
// extension is registered, so the policy reads the full tool registry via
// pi.getAllTools() and activates exactly:
//   1. the tier's native tools (strict allowlist delivered through the
//      bounded env channel PI_SPECIALIST_ALLOWED_NATIVE_TOOLS), and
//   2. every tool whose source is NOT builtin/sdk — i.e. tools registered
//      by the explicitly enabled extension sources (operator trust signal:
//      enabling a source authorizes its code).
// Everything else (including future/unknown builtins such as powershell)
// stays inactive and is rejected by Pi at call time — fail-closed.
//
// At before_agent_start the same extension appends a concise, non-mandatory
// advisory listing the ACTIVE high-leverage tools (intersected with a
// reviewed static guidance map) so agents use tools they actually have.
// Rationale: the advisory must be derived from runtime-confirmed active tool
// names — never from configured sources (a source may be enabled yet its
// tools denied/unhealthy). The policy extension is the single owner of that
// active set, so the advisory reuses it here instead of duplicating the
// selection in Specialists role output or Core ambient discovery.
//
// The active-set selection must mirror selectExtensionPolicyTools in
// tests/unit/pi/extension-tool-policy.test.ts; keep both in sync.

const EXTENSION_CLASS_SOURCES = new Set(["cli", "extension", "package", "custom"]);

function selectActiveTools(allTools, allowedNativeToolsEnv) {
  const allowedNatives = (allowedNativeToolsEnv ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
  const allowedNativeSet = new Set(allowedNatives);

  const active = [];
  for (const tool of allTools) {
    const source = tool.sourceInfo?.source ?? "";
    if (tool.sourceInfo && (source === "builtin" || source === "sdk")) {
      if (allowedNativeSet.has(tool.name)) active.push(tool.name);
      continue;
    }
    if (EXTENSION_CLASS_SOURCES.has(source) && !allowedNativeSet.has(tool.name)) {
      active.push(tool.name);
    }
  }
  // Any granted native missing from the registry (e.g. hard-denied search
  // tools) is simply absent — nothing to add.
  return active;
}

// Reviewed static guidance keyed by known high-leverage tool name. Never
// generated from untrusted source strings; only looked up by tool name.
// Conditional and non-mandatory: "use when relevant", not a ceremonial
// requirement. Add an entry only for a reviewed, genuinely high-leverage tool.
const TOOL_GUIDANCE = {
  ast_grep: "prefer ast_grep for structural code-shape queries (AST patterns/rules) over text grep",
  python: "prefer python for repeated parse/aggregate/decision loops and persistent probes",
  intercom: "prefer intercom to coordinate with other local pi sessions",
  "claude-link": "prefer claude-link to message Claude Code sessions on this machine",
};

/**
 * Build the advisory from the runtime-confirmed ACTIVE tool set, intersected
 * with the reviewed static guidance map. Returns null when none of the
 * active tools has reviewed guidance (no advisory — don't add noise). Only
 * tools the session actually exposes are ever listed.
 */
export function buildActiveToolAdvisory(activeTools) {
  const lines = [];
  for (const name of activeTools) {
    const guidance = TOOL_GUIDANCE[name];
    if (guidance) lines.push(`- ${name}: ${guidance}.`);
  }
  if (lines.length === 0) return null;
  const header = "## Active extension tools (use when relevant; optional):";
  return `${header}\n${lines.join("\n")}`;
}

export default function extensionToolPolicy(pi) {
  pi.on("session_start", () => {
    try {
      const allTools = pi.getAllTools();
      const active = selectActiveTools(allTools, process.env.PI_SPECIALIST_ALLOWED_NATIVE_TOOLS);
      pi.setActiveTools(active);
    } catch (error) {
      console.error(`[xtrm-tool-policy] failed to apply tool policy: ${error?.message ?? String(error)}`);
      // Selection may fail after another extension or runtime layer activated
      // tools. Explicitly reset to empty rather than assuming
      // --no-builtin-tools still owns the active set. Pi catches extension
      // handler exceptions and continues, so a failed reset must terminate the
      // child process to prevent a model turn with an unverified tool set.
      try {
        pi.setActiveTools([]);
      } catch (resetError) {
        console.error(`[xtrm-tool-policy] failed to clear active tools: ${resetError?.message ?? String(resetError)}`);
        process.exit(1);
      }
    }
  });

  pi.on("before_agent_start", (event) => {
    try {
      // Runtime-confirmed active set — reflects the session_start policy
      // resolution (granted natives + active extension tools). Never list a
      // configured-but-denied/unhealthy tool: absent from active == absent
      // from the advisory.
      const active = pi.getActiveTools();
      const advisory = buildActiveToolAdvisory(active);
      if (!advisory) return undefined;
      // Append to the SYSTEM PROMPT, not a new user message: preserves the
      // session separation where the rendered bead task stays the first
      // role=user message and specialist identity/rules live in the system
      // prompt layer.
      return { systemPrompt: `${event.systemPrompt ?? ""}\n\n${advisory}` };
    } catch (error) {
      // Advisory is best-effort; never take the session down.
      console.error(`[xtrm-tool-policy] failed to append advisory: ${error?.message ?? String(error)}`);
      return undefined;
    }
  });
}
