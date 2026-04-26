export interface ExtensionPathMapping {
  readonly extensionId: string;
  readonly legacyPath: string;
  readonly newPath: string;
}

export const LEGACY_PATH_MAPPINGS: readonly ExtensionPathMapping[] = [
  { extensionId: "auto-session-name", legacyPath: ".xtrm/ext-src/auto-session-name", newPath: "packages/pi-extensions/extensions/auto-session-name" },
  { extensionId: "auto-update", legacyPath: ".xtrm/ext-src/auto-update", newPath: "packages/pi-extensions/extensions/auto-update" },
  { extensionId: "beads", legacyPath: ".xtrm/ext-src/beads", newPath: "packages/pi-extensions/extensions/beads" },
  { extensionId: "compact-header", legacyPath: ".xtrm/ext-src/compact-header", newPath: "packages/pi-extensions/extensions/compact-header" },
  { extensionId: "custom-footer", legacyPath: ".xtrm/ext-src/custom-footer", newPath: "packages/pi-extensions/extensions/custom-footer" },
  { extensionId: "custom-provider-qwen-cli", legacyPath: ".xtrm/ext-src/custom-provider-qwen-cli", newPath: "packages/pi-extensions/extensions/custom-provider-qwen-cli" },
  { extensionId: "git-checkpoint", legacyPath: ".xtrm/ext-src/git-checkpoint", newPath: "packages/pi-extensions/extensions/git-checkpoint" },
  { extensionId: "lsp-bootstrap", legacyPath: ".xtrm/ext-src/lsp-bootstrap", newPath: "packages/pi-extensions/extensions/lsp-bootstrap" },
  { extensionId: "pi-serena-compact", legacyPath: ".xtrm/ext-src/pi-serena-compact", newPath: "packages/pi-extensions/extensions/pi-serena-compact" },
  { extensionId: "quality-gates", legacyPath: ".xtrm/ext-src/quality-gates", newPath: "packages/pi-extensions/extensions/quality-gates" },
  { extensionId: "service-skills", legacyPath: ".xtrm/ext-src/service-skills", newPath: "packages/pi-extensions/extensions/service-skills" },
  { extensionId: "session-flow", legacyPath: ".xtrm/ext-src/session-flow", newPath: "packages/pi-extensions/extensions/session-flow" },
  { extensionId: "xtrm-loader", legacyPath: ".xtrm/ext-src/xtrm-loader", newPath: "packages/pi-extensions/extensions/xtrm-loader" },
  { extensionId: "xtrm-ui", legacyPath: ".xtrm/ext-src/xtrm-ui", newPath: "packages/pi-extensions/extensions/xtrm-ui" },
  { extensionId: "pi-core-internal", legacyPath: ".xtrm/ext-src/core", newPath: "packages/pi-extensions/src/core" },
] as const;
