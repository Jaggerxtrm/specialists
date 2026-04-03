import { execFile, spawnSync } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface RunOptions {
	timeoutMs?: number;
	cwd?: string;
	env?: Record<string, string>;
	input?: string; // Standard input
}

export interface RunResult {
	code: number;
	stdout: string;
	stderr: string;
}

export class SubprocessRunner {
	/**
	 * Run a command deterministically with a timeout and optional stdin.
	 */
	static async run(
		command: string,
		args: string[],
		options: RunOptions = {}
	): Promise<RunResult> {
		const timeout = options.timeoutMs ?? 10000;
		const cwd = options.cwd ?? process.cwd();
		const env = { ...process.env, ...options.env };

		if (options.input !== undefined) {
			// Use spawnSync for stdin support if input is provided
			const result = spawnSync(command, args, {
				cwd,
				env,
				input: options.input,
				encoding: "utf8",
				timeout,
				maxBuffer: 1024 * 1024 * 10,
			});

			return {
				code: result.status ?? 1,
				stdout: (result.stdout ?? "").trim(),
				stderr: (result.stderr ?? "").trim(),
			};
		}

		try {
			const result = await execFileAsync(command, args, {
				timeout,
				cwd,
				env,
				maxBuffer: 1024 * 1024 * 10,
			});

			return {
				code: 0,
				stdout: result.stdout.trim(),
				stderr: result.stderr.trim(),
			};
		} catch (error: any) {
			return {
				code: error.code ?? 1,
				stdout: (error.stdout ?? "").trim(),
				stderr: (error.stderr ?? error.message ?? "").trim(),
			};
		}
	}
}
