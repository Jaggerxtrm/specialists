import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import * as fs from "node:fs";
import * as path from "node:path";
import { homedir } from "node:os";
import { Logger } from "@xtrm/pi-core";

const logger = new Logger({ namespace: "xtrm-loader" });

/**
 * Recursively find markdown files in a directory.
 */
function findMarkdownFiles(dir: string, basePath: string = ""): string[] {
	const results: string[] = [];
	if (!fs.existsSync(dir)) return results;

	const entries = fs.readdirSync(dir, { withFileTypes: true });
	for (const entry of entries) {
		const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name;
		if (entry.isDirectory()) {
			results.push(...findMarkdownFiles(path.join(dir, entry.name), relativePath));
		} else if (entry.isFile() && entry.name.endsWith(".md")) {
			results.push(relativePath);
		}
	}
	return results;
}

function resolveUsingXtrmSkillPath(cwd: string): string | null {
	const candidates = [
		path.join(homedir(), ".agents", "skills", "using-xtrm", "SKILL.md"),
		path.join(homedir(), ".pi", "agent", "skills", "using-xtrm", "SKILL.md"),
		path.join(cwd, ".pi", "skills", "using-xtrm", "SKILL.md"),
	];

	for (const candidate of candidates) {
		if (fs.existsSync(candidate)) return candidate;
	}
	return null;
}

/**
 * Load a skill file, stripping YAML frontmatter.
 */
function loadSkillContent(skillPath: string): string | null {
	try {
		const content = fs.readFileSync(skillPath, "utf8");
		return content.replace(/^---[\s\S]*?---\n/, "").trim();
	} catch {
		return null;
	}
}

export default function (pi: ExtensionAPI) {
	let projectContext: string = "";
	let usingXtrmContent: string | null = null;

	pi.on("session_start", async (_event, ctx) => {
		const cwd = ctx.cwd;
		const contextParts: string[] = [];

		// 0. Load using-xtrm skill (global/project fallback paths)
		const usingXtrmPath = resolveUsingXtrmSkillPath(cwd);
		usingXtrmContent = usingXtrmPath ? loadSkillContent(usingXtrmPath) : null;
		if (usingXtrmPath && usingXtrmContent) {
			logger.info(`Loaded using-xtrm skill from ${usingXtrmPath}`);
		}

		// 1. Architecture & Roadmap
		const roadmapPaths = [
			path.join(cwd, "architecture", "project_roadmap.md"),
			path.join(cwd, "ROADMAP.md"),
			path.join(cwd, "architecture", "index.md"),
		];

		for (const p of roadmapPaths) {
			if (fs.existsSync(p)) {
				const content = await fs.promises.readFile(p, "utf8");
				contextParts.push(`## Project Roadmap & Architecture (${path.relative(cwd, p)})\n\n${content}`);
				break; // Only load the first one found
			}
		}

		// 2. Project Rules (.claude/rules)
		const rulesDir = path.join(cwd, ".claude", "rules");
		if (fs.existsSync(rulesDir)) {
			const ruleFiles = findMarkdownFiles(rulesDir);
			if (ruleFiles.length > 0) {
				const rulesContent = (
					await Promise.all(
						ruleFiles.map(async (f) => {
							const content = await fs.promises.readFile(path.join(rulesDir, f), "utf8");
							return `### Rule: ${f}\n${content}`;
						}),
					)
				).join("\n\n");
				contextParts.push(`## Project Rules\n\n${rulesContent}`);
			}
		}

		// 3. Project Skills (.claude/skills)
		const skillsDir = path.join(cwd, ".claude", "skills");
		if (fs.existsSync(skillsDir)) {
			const skillFiles = findMarkdownFiles(skillsDir);
			if (skillFiles.length > 0) {
				const skillsContent = skillFiles
					.map((f) => `- ${f} (Path: .claude/skills/${f})`)
					.join("\n");
				contextParts.push(
					`## Available Project Skills\n\nExisting service skills and workflows found in .claude/skills/:\n\n${skillsContent}\n\nUse the read tool to load any of these skills if relevant to the current task.`,
				);
			}
		}

		projectContext = contextParts.join("\n\n---\n\n");

		if (projectContext && ctx.hasUI) {
			ctx.ui.notify("XTRM-Loader: Project context and skills indexed", "info");
		}
	});

	pi.on("before_agent_start", async (event, ctx) => {
		const parts: string[] = [];

		// Prepend using-xtrm skill (session operating manual)
		if (usingXtrmContent) {
			parts.push("# XTRM Session Operating Manual\n\n" + usingXtrmContent);
		}

		// Inject .xtrm/memory.md if present (synthesized project context)
		const memoryPath = path.join(ctx.cwd, ".xtrm", "memory.md");
		if (fs.existsSync(memoryPath)) {
			try {
				const memoryContent = fs.readFileSync(memoryPath, "utf8").trim();
				if (memoryContent) {
					parts.push(memoryContent);
					logger.info(`Injected .xtrm/memory.md (${memoryContent.length} chars)`);
				}
			} catch { /* fail open */ }
		}

		// Append project context
		if (projectContext) {
			parts.push("# Project Intelligence Context\n\n" + projectContext);
		}

		if (parts.length === 0) return undefined;

		return {
			systemPrompt: event.systemPrompt + "\n\n" + parts.join("\n\n---\n\n"),
		};
	});
}
