import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { isToolCallEventType, isBashToolResult } from "@mariozechner/pi-coding-agent";
import { SubprocessRunner, EventAdapter } from "@xtrm/pi-core";

export default function (pi: ExtensionAPI) {
	const getCwd = (ctx: any) => ctx.cwd || process.cwd();

	let cachedSessionId: string | null = null;
	let memoryGateFired = false;

	// Resolve a stable session ID across event types.
	const getSessionId = (ctx: any): string => {
		const fromManager = ctx?.sessionManager?.getSessionId?.();
		const fromContext = ctx?.sessionId ?? ctx?.session_id;
		const resolved = fromManager || fromContext || cachedSessionId || process.pid.toString();
		if (resolved && !cachedSessionId) cachedSessionId = resolved;
		return resolved;
	};

	const getSessionClaim = async (sessionId: string, cwd: string): Promise<string | null> => {
		const result = await SubprocessRunner.run("bd", ["kv", "get", `claimed:${sessionId}`], { cwd });
		if (result.code !== 0) return null;
		const claim = result.stdout.trim();
		return claim.length > 0 ? claim : null;
	};

	const clearClaimMarker = async (sessionId: string, cwd: string) => {
		await SubprocessRunner.run("bd", ["kv", "clear", `claimed:${sessionId}`], { cwd });
	};

	const isIssueInProgress = async (issueId: string, cwd: string): Promise<boolean | null> => {
		const result = await SubprocessRunner.run("bd", ["show", issueId, "--json"], { cwd });
		if (result.code !== 0 || !result.stdout.trim()) return null;
		try {
			const parsed = JSON.parse(result.stdout);
			const issue = Array.isArray(parsed) ? parsed[0] : parsed;
			if (!issue?.status) return null;
			return issue.status === "in_progress";
		} catch {
			return null;
		}
	};

	const getActiveClaim = async (sessionId: string, cwd: string): Promise<string | null> => {
		const claim = await getSessionClaim(sessionId, cwd);
		if (!claim) return null;

		const inProgress = await isIssueInProgress(claim, cwd);
		if (inProgress === false) {
			await clearClaimMarker(sessionId, cwd);
			return null;
		}

		return claim;
	};

	const getClosedThisSession = async (sessionId: string, cwd: string): Promise<string | null> => {
		const result = await SubprocessRunner.run("bd", ["kv", "get", `closed-this-session:${sessionId}`], { cwd });
		if (result.code !== 0) return null;
		const issue = result.stdout.trim();
		return issue.length > 0 ? issue : null;
	};

	const clearSessionMarkers = async (sessionId: string, cwd: string) => {
		await SubprocessRunner.run("bd", ["kv", "clear", `claimed:${sessionId}`], { cwd });
		await SubprocessRunner.run("bd", ["kv", "clear", `closed-this-session:${sessionId}`], { cwd });
	};

	const hasTrackableWork = async (cwd: string): Promise<boolean> => {
		const result = await SubprocessRunner.run("bd", ["list"], { cwd });
		if (result.code === 0) {
			const counts = EventAdapter.parseBdCounts(result.stdout);
			if (counts) return (counts.open + counts.inProgress) > 0;
		}
		return false;
	};

	pi.on("session_start", async (_event, ctx) => {
		cachedSessionId = ctx?.sessionManager?.getSessionId?.() ?? ctx?.sessionId ?? ctx?.session_id ?? cachedSessionId;
		return undefined;
	});

	pi.on("tool_call", async (event, ctx) => {
		const cwd = getCwd(ctx);
		if (!EventAdapter.isBeadsProject(cwd)) return undefined;
		const sessionId = getSessionId(ctx);

		if (EventAdapter.isMutatingFileTool(event)) {
			const claim = await getActiveClaim(sessionId, cwd);
			if (!claim) {
				const hasWork = await hasTrackableWork(cwd);
				if (hasWork) {
					if (ctx.hasUI) {
						ctx.ui.notify("Beads: Edit blocked. Claim an issue first.", "warning");
					}
					return {
						block: true,
						reason: `No active claim for session ${sessionId}.\n  bd update <id> --claim\n`,
					};
				}
			}
		}

		if (isToolCallEventType("bash", event)) {
			const command = event.input.command;
			if (command && /\bgit\s+commit\b/.test(command)) {
				const claim = await getActiveClaim(sessionId, cwd);
				if (claim) {
					return {
						block: true,
						reason: `Active claim [${claim}] — close it first.\n  bd close ${claim}\n  (Pi workflow) publish/merge are external steps; do not rely on xtrm finish.\n`,
					};
				}
			}
		}

		return undefined;
	});

	pi.on("tool_result", async (event, ctx) => {
		if (!isBashToolResult(event)) return undefined;

		const command = event.input.command || "";
		const sessionId = getSessionId(ctx);
		const cwd = getCwd(ctx);

		// Auto-claim on bd update --claim regardless of exit code.
		if (/\bbd\s+update\b/.test(command) && /--claim\b/.test(command)) {
			const issueMatch = command.match(/\bbd\s+update\s+(\S+)/);
			if (issueMatch) {
				const issueId = issueMatch[1];
				await SubprocessRunner.run("bd", ["kv", "set", `claimed:${sessionId}`, issueId], { cwd });
				memoryGateFired = false;
				const claimNotice = `\n\n✅ **Beads**: Session \`${sessionId}\` claimed issue \`${issueId}\`. File edits are now unblocked.`;
				return { content: [...event.content, { type: "text", text: claimNotice }] };
			}
		}

		if (/\bbd\s+close\b/.test(command) && !event.isError) {
			const closeMatch = command.match(/\bbd\s+close\s+(\S+)/);
			const closedIssueId = closeMatch?.[1] ?? null;

			if (closedIssueId) {
				await SubprocessRunner.run("bd", ["kv", "set", `closed-this-session:${sessionId}`, closedIssueId], { cwd });
				memoryGateFired = false;
			}

			// Inject memory gate as agent-visible context only — parity with Claude Stop hook {additionalContext}.
			// No UI notification; the agent sees this silently in its tool result context.
			const memoryGateText = closedIssueId
				? `\n\n**Beads Memory Gate**: Issue \`${closedIssueId}\` closed this session.\n` +
				  `For each candidate insight, check ALL 4:\n` +
				  `  1. Hard to rediscover from code/docs?\n` +
				  `  2. Not obvious from the current implementation?\n` +
				  `  3. Will affect a future decision?\n` +
				  `  4. Still relevant in ~14 days?\n` +
				  `KEEP (all 4 yes) → \`bd remember "<insight>"\`\n` +
				  `SKIP examples: file maps, flag inventories, per-issue summaries, wording tweaks, facts obvious from reading the source.\n` +
				  `When done: \`bd kv set "memory-gate-done:${sessionId}" "saved: <key>"\` (or \`"nothing novel — <reason>"\`)`
				: `\n\n**Beads**: Work completed. Consider if this session produced insights worth persisting via \`bd remember\`.`;
			return { content: [...event.content, { type: "text", text: memoryGateText }] };
		}

		return undefined;
	});

	// Memory gate: clean up session markers and check ack at agent_end/session_shutdown.
	// Memory gate prompt was already injected into bd close tool_result context (silent, agent-visible only).
	// No UI notification — parity with Claude Stop hook {additionalContext} pattern.
	const triggerMemoryGateIfNeeded = async (ctx: any) => {
		const cwd = getCwd(ctx);
		if (!EventAdapter.isBeadsProject(cwd)) return;
		const sessionId = getSessionId(ctx);

		const markerCheck = await SubprocessRunner.run("bd", ["kv", "get", `memory-gate-done:${sessionId}`], { cwd });
		if (markerCheck.code === 0) {
			await SubprocessRunner.run("bd", ["kv", "clear", `memory-gate-done:${sessionId}`], { cwd });
			await clearSessionMarkers(sessionId, cwd);
			memoryGateFired = false;
			return;
		}

		if (memoryGateFired) return;

		const closedIssueId = await getClosedThisSession(sessionId, cwd);
		if (!closedIssueId) return;

		memoryGateFired = true;
		// No notify — memory gate was injected into bd close tool_result content (silent, agent-visible only).
	};

	pi.on("agent_end", async (_event, ctx) => {
		await triggerMemoryGateIfNeeded(ctx);
		return undefined;
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		await triggerMemoryGateIfNeeded(ctx);
		return undefined;
	});
}
