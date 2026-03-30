export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LoggerOptions {
	namespace: string;
	level?: LogLevel;
}

export class Logger {
	private namespace: string;
	private level: LogLevel;

	constructor(options: LoggerOptions) {
		this.namespace = options.namespace;
		this.level = options.level || "info";
	}

	private shouldLog(level: LogLevel): boolean {
		const levels: LogLevel[] = ["debug", "info", "warn", "error"];
		return levels.indexOf(level) >= levels.indexOf(this.level);
	}

	debug(message: string, ...args: any[]) {
		if (this.shouldLog("debug")) {
			console.debug(`[${this.namespace}] DEBUG: ${message}`, ...args);
		}
	}

	info(message: string, ...args: any[]) {
		if (this.shouldLog("info")) {
			console.info(`[${this.namespace}] INFO: ${message}`, ...args);
		}
	}

	warn(message: string, ...args: any[]) {
		if (this.shouldLog("warn")) {
			console.warn(`[${this.namespace}] WARN: ${message}`, ...args);
		}
	}

	error(message: string, ...args: any[]) {
		if (this.shouldLog("error")) {
			console.error(`[${this.namespace}] ERROR: ${message}`, ...args);
		}
	}
}
