// Specialists-owned extension tool policy (unitAI-34pyf).
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

export default function extensionToolPolicy(pi) {
  pi.on("session_start", () => {
    try {
      const allTools = pi.getAllTools();
      const active = selectActiveTools(allTools, process.env.PI_SPECIALIST_ALLOWED_NATIVE_TOOLS);
      pi.setActiveTools(active);
    } catch (error) {
      // The tool-policy extension must never take the session down. On
      // failure the session keeps the --no-builtin-tools empty active set,
      // which is fail-closed (no native tools, no extension tools).
      console.error(`[xtrm-tool-policy] failed to apply tool policy: ${error?.message ?? String(error)}`);
    }
  });
}