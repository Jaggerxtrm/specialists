import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { spawnSync, execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

type InstallMethod =
    | { type: "npm"; packages: string[] }
    | { type: "go"; module: string }
    | { type: "rustup"; component: string }
    | { type: "brew"; formula: string }
    | { type: "system"; hint: string };

interface LspTarget {
    label: string;
    markers: string[];
    bin: string;
    install: InstallMethod;
}

const TARGETS: LspTarget[] = [
    {
        label: "TypeScript/JavaScript",
        markers: ["tsconfig.json", "package.json"],
        bin: "typescript-language-server",
        install: { type: "npm", packages: ["typescript-language-server", "typescript"] },
    },
    {
        label: "Python",
        markers: ["pyproject.toml", "requirements.txt", "setup.py"],
        bin: "pyright-langserver",
        install: { type: "npm", packages: ["pyright"] },
    },
    {
        label: "Vue",
        markers: ["vue.config.js", "vite.config.ts", "vite.config.js"],
        bin: "vue-language-server",
        install: { type: "npm", packages: ["@vue/language-server"] },
    },
    {
        label: "Svelte",
        markers: ["svelte.config.js", "svelte.config.ts"],
        bin: "svelteserver",
        install: { type: "npm", packages: ["svelte-language-server"] },
    },
    {
        label: "Go",
        markers: ["go.mod"],
        bin: "gopls",
        install: { type: "go", module: "golang.org/x/tools/gopls@latest" },
    },
    {
        label: "Rust",
        markers: ["Cargo.toml"],
        bin: "rust-analyzer",
        install: { type: "rustup", component: "rust-analyzer" },
    },
    {
        label: "Kotlin",
        markers: ["build.gradle", "build.gradle.kts", "settings.gradle", "settings.gradle.kts", "pom.xml"],
        bin: "kotlin-language-server",
        install: { type: "brew", formula: "JetBrains/utils/kotlin-lsp" },
    },
    {
        label: "Swift",
        markers: ["Package.swift"],
        bin: "sourcekit-lsp",
        install: { type: "system", hint: "sourcekit-lsp is bundled with Xcode — install Xcode or Command Line Tools: xcode-select --install" },
    },
];

function isInPath(bin: string): boolean {
    try {
        execSync(`which ${bin}`, { stdio: "pipe" });
        return true;
    } catch {
        return false;
    }
}

function detectTargets(cwd: string): LspTarget[] {
    return TARGETS.filter(target =>
        target.markers.some(marker => fs.existsSync(path.join(cwd, marker)))
    );
}

function runInstall(target: LspTarget, ctx: any): void {
    const { install } = target;
    let cmd: string[];
    let fallback: string;

    if (install.type === "npm") {
        cmd = ["npm", "install", "-g", ...install.packages];
        fallback = `npm install -g ${install.packages.join(" ")}`;
    } else if (install.type === "go") {
        cmd = ["go", "install", install.module];
        fallback = `go install ${install.module}`;
    } else if (install.type === "rustup") {
        cmd = ["rustup", "component", "add", install.component];
        fallback = `rustup component add ${install.component}`;
    } else if (install.type === "brew") {
        cmd = ["brew", "install", install.formula];
        fallback = `brew install ${install.formula}`;
    } else {
        // system — cannot auto-install, just warn
        ctx.ui.notify(`lsp-bootstrap: ${target.label} LSP not found — ${install.hint}`, "warning");
        return;
    }

    ctx.ui.notify(`lsp-bootstrap: installing ${target.label} language server…`, "info");
    const r = spawnSync(cmd[0], cmd.slice(1), { encoding: "utf8", stdio: "pipe" });
    if (r.status !== 0) {
        ctx.ui.notify(`lsp-bootstrap: failed to install ${target.label} — run manually: ${fallback}`, "warning");
    }
}

export default function register(api: ExtensionAPI) {
    api.on("before_agent_start", async (_event: any, ctx: any) => {
        const cwd = process.cwd();
        const detected = detectTargets(cwd);
        if (detected.length === 0) return;

        const missing = detected.filter(t => !isInPath(t.bin));
        if (missing.length === 0) return;

        for (const target of missing) {
            runInstall(target, ctx);
        }

        const nowReady = missing.filter(t => isInPath(t.bin)).map(t => t.label);
        if (nowReady.length > 0) {
            ctx.ui.notify(`lsp-bootstrap: ready — ${nowReady.join(", ")}`, "info");
        }
    });
}
