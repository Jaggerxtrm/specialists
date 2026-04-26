import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { isBashToolResult } from "@mariozechner/pi-coding-agent";
import { SubprocessRunner, EventAdapter } from "../../src/core";

function isClaimCommand(command: string): { isClaim: boolean; issueId: string | null } {
	if (!/\bbd\s+update\b/.test(command) || !/--claim\b/.test(command)) {
		return { isClaim: false, issueId: null };
	}
	const match = command.match(/\bbd\s+update\s+(\S+)/);
	return { isClaim: true, issueId: match?.[1] ?? null };
}

function isWorktree(cwd: string): boolean {
	return cwd.includes("/.xtrm/worktrees/") || cwd.includes("/.claude/worktrees/");
}

function getSessionId(ctx: any): string {
	return ctx?.sessionManager?.getSessionId?.() ?? ctx?.sessionId ?? ctx?.session_id ?? process.pid.toString();
}

async function getSessionClaim(cwd: string, sessionId: string): Promise<string | null> {
	const claimResult = await SubprocessRunner.run("bd", ["kv", "get", `claimed:${sessionId}`], { cwd });
	if (claimResult.code !== 0) return null;
	const claimId = claimResult.stdout.trim();
	return claimId.length > 0 ? claimId : null;
}

async function isClaimStillInProgress(cwd: string, issueId: string): Promise<boolean> {
	const showResult = await SubprocessRunner.run("bd", ["show", issueId, "--json"], { cwd });
	if (showResult.code === 0 && showResult.stdout.trim()) {
		try {
			const parsed = JSON.parse(showResult.stdout);
			const record = Array.isArray(parsed) ? parsed[0] : parsed;
			if (record?.status) return record.status === "in_progress";
		} catch {
			// fall back to text parsing below
		}
	}

	const listResult = await SubprocessRunner.run("bd", ["list", "--status=in_progress"], { cwd });
	if (listResult.code !== 0) return false;
	const issuePattern = new RegExp(`^\\s*[◐●]?\\s*${issueId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "m");
	return issuePattern.test(listResult.stdout);
}

export default function (pi: ExtensionAPI) {
	const getCwd = (ctx: any) => ctx.cwd || process.cwd();
	let lastStopNoticeIssue: string | null = null;
	let lastWorktreeReminderCwd: string | null = null;

	// Claim sync: notify when a bd update --claim command is run.
	pi.on("tool_result", async (event, ctx) => {
		if (!isBashToolResult(event)) return undefined;
		const cwd = getCwd(ctx);
		if (!EventAdapter.isBeadsProject(cwd)) return undefined;

		const command = event.input.command || "";
		const { isClaim, issueId } = isClaimCommand(command);
		if (!isClaim || !issueId) return undefined;

		const text = `\n\nSession Flow: claimed ${issueId}. Work in this session is tracked.`;
		return { content: [...event.content, { type: "text", text }] };
	});

	// Stop gate: warn (non-blocking) if this session's claimed issue is still in progress.
	// IMPORTANT: never call sendUserMessage() from agent_end, it always triggers a new turn.
	pi.on("agent_end", async (_event, ctx) => {
		const cwd = getCwd(ctx);
		if (!EventAdapter.isBeadsProject(cwd)) return undefined;

		const sessionId = getSessionId(ctx);
		const claimId = await getSessionClaim(cwd, sessionId);

		if (claimId) {
			const inProgress = await isClaimStillInProgress(cwd, claimId);
			if (inProgress) {
				if (lastStopNoticeIssue !== claimId && ctx.hasUI) {
					ctx.ui.notify(`Stop blocked: close your issue first: bd close ${claimId}`, "warning");
					lastStopNoticeIssue = claimId;
				}
				return undefined;
			}

			if (lastStopNoticeIssue === claimId) {
				lastStopNoticeIssue = null;
			}
		}

		if (isWorktree(cwd) && ctx.hasUI && lastWorktreeReminderCwd !== cwd) {
			ctx.ui.notify("Run `xt end` to create a PR and clean up this worktree.", "info");
			lastWorktreeReminderCwd = cwd;
		}

		return undefined;
	});
}
