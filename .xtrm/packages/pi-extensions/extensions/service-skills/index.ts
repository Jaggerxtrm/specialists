import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { SubprocessRunner } from "../../src/core";
import * as path from "node:path";
import * as fs from "node:fs";

const SERVICE_REGISTRY_FILES = [
	"service-registry.json",
	path.join(".claude", "skills", "service-registry.json"),
];

const GLOBAL_SKILL_ROOTS = [
	path.join(process.env.HOME || "", ".agents", "skills"),
	path.join(process.env.HOME || "", ".claude", "skills"),
];

export default function (pi: ExtensionAPI) {
	const getCwd = (ctx: any) => ctx.cwd || process.cwd();

	const resolveRegistryPath = (cwd: string): string | null => {
		for (const rel of SERVICE_REGISTRY_FILES) {
			const candidate = path.join(cwd, rel);
			if (fs.existsSync(candidate)) return candidate;
		}
		return null;
	};

	const resolveSkillScript = (cwd: string, skillName: string, scriptName: string): string | null => {
		const localPath = path.join(cwd, ".claude", "skills", skillName, "scripts", scriptName);
		if (fs.existsSync(localPath)) return localPath;

		for (const root of GLOBAL_SKILL_ROOTS) {
			if (!root) continue;
			const candidate = path.join(root, skillName, "scripts", scriptName);
			if (fs.existsSync(candidate)) return candidate;
		}

		return null;
	};

	// 1. Catalog Injection
	pi.on("before_agent_start", async (event, ctx) => {
		const cwd = getCwd(ctx);
		const registryPath = resolveRegistryPath(cwd);
		if (!registryPath) return undefined;

		const catalogerPath = resolveSkillScript(cwd, "using-service-skills", "cataloger.py");
		if (!catalogerPath) return undefined;

		const result = await SubprocessRunner.run("python3", [catalogerPath], {
			cwd,
			env: {
				...process.env,
				CLAUDE_PROJECT_DIR: cwd,
				SERVICE_REGISTRY_PATH: registryPath,
			},
		});

		if (result.code === 0 && result.stdout.trim()) {
			return { systemPrompt: event.systemPrompt + "\n\n" + result.stdout.trim() };
		}
		return undefined;
	});

	const toClaudeToolName = (toolName: string): string => {
		if (toolName === "bash") return "Bash";
		if (toolName === "read_file") return "Read";
		if (toolName === "write" || toolName === "create_text_file") return "Write";
		if (toolName === "edit" || toolName === "replace_content" || toolName === "replace_lines" || toolName === "insert_at_line" || toolName === "delete_lines") return "Edit";
		if (toolName === "search_for_pattern") return "Grep";
		if (toolName === "find_file" || toolName === "list_dir") return "Glob";
		return toolName;
	};

	// 2. Drift Detection (skill activation is before_agent_start only — not per-tool)
	pi.on("tool_result", async (event, ctx) => {
		const cwd = getCwd(ctx);
		const registryPath = resolveRegistryPath(cwd);
		if (!registryPath) return undefined;

		const driftDetectorPath = resolveSkillScript(cwd, "updating-service-skills", "drift_detector.py");
		if (!driftDetectorPath) return undefined;

		const hookInput = JSON.stringify({
			tool_name: toClaudeToolName(event.toolName),
			tool_input: event.input,
			cwd,
		});

		const result = await SubprocessRunner.run("python3", [driftDetectorPath], {
			cwd,
			input: hookInput,
			env: {
				...process.env,
				CLAUDE_PROJECT_DIR: cwd,
				SERVICE_REGISTRY_PATH: registryPath,
			},
			timeoutMs: 10000,
		});

		if (result.code === 0 && result.stdout.trim()) {
			const newContent = [...event.content];
			newContent.push({ type: "text", text: "\n\n" + result.stdout.trim() });
			return { content: newContent };
		}

		return undefined;
	});
}
