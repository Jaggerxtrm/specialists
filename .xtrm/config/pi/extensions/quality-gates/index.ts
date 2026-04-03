import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { SubprocessRunner, EventAdapter } from "@xtrm/pi-core";
import * as path from "node:path";
import * as fs from "node:fs";

function resolveQualityHook(cwd: string, ext: string): { runner: string; scriptPath: string } | null {
	if ([".ts", ".tsx", ".js", ".jsx", ".cjs", ".mjs"].includes(ext)) {
		const scriptPath = path.join(cwd, ".claude", "hooks", "quality-check.cjs");
		return { runner: "node", scriptPath };
	}
	if (ext === ".py") {
		const scriptPath = path.join(cwd, ".claude", "hooks", "quality-check.py");
		return { runner: "python3", scriptPath };
	}
	return null;
}

export default function (pi: ExtensionAPI) {
	pi.on("tool_result", async (event, ctx) => {
		if (!EventAdapter.isMutatingFileTool(event)) return undefined;

		const cwd = ctx.cwd || process.cwd();
		const filePath = EventAdapter.extractPathFromToolInput(event, cwd);
		if (!filePath) return undefined;

		const fullPath = path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath);
		const ext = path.extname(fullPath);
		const resolved = resolveQualityHook(cwd, ext);
		if (!resolved) return undefined;
		if (!fs.existsSync(resolved.scriptPath)) return undefined;

		const hookInput = JSON.stringify({
			tool_name: event.toolName,
			tool_input: event.input,
			cwd,
		});

		const result = await SubprocessRunner.run(resolved.runner, [resolved.scriptPath], {
			cwd,
			input: hookInput,
			env: { ...process.env, CLAUDE_PROJECT_DIR: cwd },
			timeoutMs: 30000,
		});

		if (result.code === 0) {
			const details = (result.stdout || result.stderr || "").trim();
			if (!details) return undefined;
			return {
				content: [...event.content, { type: "text", text: `\n\n**Quality Gate**: ${details}` }],
			};
		}

		if (result.code === 2) {
			const details = (result.stderr || result.stdout || "Unknown error").trim();
			if (ctx.hasUI) {
				ctx.ui.notify(`Quality Gate failed for ${path.basename(fullPath)}`, "error");
			}
			return {
				isError: true,
				content: [...event.content, { type: "text", text: `\n\n**Quality Gate FAILED**:\n${details}` }],
			};
		}

		return undefined;
	});
}
