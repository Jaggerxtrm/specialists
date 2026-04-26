import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import autoSessionNameExtension from "./extensions/auto-session-name.ts";
import autoUpdateExtension from "./extensions/auto-update.ts";
import beadsExtension from "./extensions/beads.ts";
import compactHeaderExtension from "./extensions/compact-header.ts";
import customFooterExtension from "./extensions/custom-footer.ts";
import customProviderQwenCliExtension from "./extensions/custom-provider-qwen-cli.ts";
import gitCheckpointExtension from "./extensions/git-checkpoint.ts";
import lspBootstrapExtension from "./extensions/lsp-bootstrap.ts";
import piSerenaCompactExtension from "./extensions/pi-serena-compact.ts";
import qualityGatesExtension from "./extensions/quality-gates.ts";
import serviceSkillsExtension from "./extensions/service-skills.ts";
import sessionFlowExtension from "./extensions/session-flow.ts";
import xtrmLoaderExtension from "./extensions/xtrm-loader.ts";
import xtrmUiExtension from "./extensions/xtrm-ui.ts";

export type ManagedPiExtension = {
  readonly id: string;
  readonly register: (pi: ExtensionAPI) => void;
};

export const managedPiExtensions: readonly ManagedPiExtension[] = [
  { id: "auto-session-name", register: autoSessionNameExtension },
  { id: "auto-update", register: autoUpdateExtension },
  { id: "beads", register: beadsExtension },
  { id: "compact-header", register: compactHeaderExtension },
  { id: "custom-footer", register: customFooterExtension },
  { id: "custom-provider-qwen-cli", register: customProviderQwenCliExtension },
  { id: "git-checkpoint", register: gitCheckpointExtension },
  { id: "lsp-bootstrap", register: lspBootstrapExtension },
  { id: "pi-serena-compact", register: piSerenaCompactExtension },
  { id: "quality-gates", register: qualityGatesExtension },
  { id: "service-skills", register: serviceSkillsExtension },
  { id: "session-flow", register: sessionFlowExtension },
  { id: "xtrm-loader", register: xtrmLoaderExtension },
  { id: "xtrm-ui", register: xtrmUiExtension },
];

function registerManagedExtension(pi: ExtensionAPI, extension: ManagedPiExtension): void {
  try {
    extension.register(pi);
  } catch (error) {
    console.warn(`[pi-extensions] Failed to register '${extension.id}':`, error);
  }
}

export function registerManagedPiExtensions(pi: ExtensionAPI): void {
  for (const extension of managedPiExtensions) {
    registerManagedExtension(pi, extension);
  }
}
