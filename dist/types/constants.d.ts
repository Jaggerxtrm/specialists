/**
 * Constants and configuration for Specialists MCP server
 */
export declare const LOG_PREFIX = "[specialists]";
export declare const AI_MODELS: {
    readonly GEMINI: {
        readonly PRIMARY: "gemini-3-pro-preview";
        readonly FLASH: "gemini-3-flash-preview";
        readonly PRO_2_5: "gemini-2.5-pro";
        readonly FLASH_2_5: "gemini-2.5-flash";
        readonly FLASH_LITE: "gemini-2.5-flash-lite";
    };
    readonly CURSOR_AGENT: {
        readonly GPT_5_1: "gpt-5.1";
        readonly GPT_5: "gpt-5";
        readonly COMPOSER_1: "composer-1";
        readonly SONNET_4_5: "sonnet-4.5";
        readonly HAIKU_5: "haiku-5";
        readonly DEEPSEEK_V3: "deepseek-v3";
    };
    readonly DROID: {
        readonly PRIMARY: "glm-4.6";
    };
};
export declare const CLI: {
    readonly COMMANDS: {
        readonly GEMINI: "gemini";
        readonly CURSOR_AGENT: "cursor-agent";
        readonly DROID: "droid";
        readonly ECHO: "echo";
    };
    readonly FLAGS: {
        readonly GEMINI: {
            readonly SANDBOX: "-s";
            readonly HELP: "-help";
            readonly MODEL: "--model";
        };
        readonly CURSOR: {
            readonly PROMPT: "-p";
            readonly OUTPUT: "--output-format";
            readonly PRINT: "--print";
            readonly FORCE: "--force";
            readonly FILE: "--file";
        };
        readonly DROID: {
            readonly EXEC: "exec";
            readonly AUTO: "--auto";
            readonly OUTPUT: "--output-format";
            readonly SESSION: "--session-id";
            readonly SKIP_PERMISSIONS: "--skip-permissions-unsafe";
            readonly FILE: "--file";
            readonly CWD: "--cwd";
        };
        readonly ROVODEV: {
            readonly RUN: "run";
            readonly YOLO: "--yolo";
            readonly RESTORE: "--restore";
            readonly CONFIG: "--config-file";
        };
        readonly QWEN: {
            readonly SANDBOX: "-s";
            readonly YOLO: "-y";
            readonly OUTPUT: "-o";
            readonly INTERACTIVE: "-i";
        };
    };
};
export declare const ERROR_MESSAGES: {
    readonly NO_PROMPT_PROVIDED: "No prompt provided. Please include a prompt in your request.";
    readonly TOOL_NOT_FOUND: "Tool not found in registry";
    readonly INVALID_ARGUMENTS: "Invalid tool arguments";
    readonly EXECUTION_FAILED: "Tool execution failed";
    readonly QUOTA_EXCEEDED: "Quota exceeded for primary model, attempting fallback...";
    readonly VALIDATION_FAILED: "Tool response validation failed";
};
export declare const STATUS_MESSAGES: {
    readonly THINKING: "🤔 Thinking...";
    readonly PROCESSING: "⚙️ Processing...";
    readonly SEARCHING: "🔍 Searching...";
    readonly EXECUTING: "🚀 Executing...";
    readonly COMPLETED: "✅ Analysis complete";
    readonly FAILED: "❌ Analysis failed";
    readonly STARTING_ANALYSIS: "🚀 Starting analysis...";
};
export declare const MCP_CONFIG: {
    readonly SERVER_NAME: "specialists";
    readonly VERSION: "1.0.0";
    readonly CAPABILITIES: {
        readonly tools: {};
        readonly prompts: {};
        readonly logging: {};
    };
    readonly KEEP_ALIVE_INTERVAL: 25000;
};
export declare const APPROVAL_MODES: {
    readonly PLAN: "plan";
    readonly DEFAULT: "default";
    readonly AUTO_EDIT: "auto-edit";
    readonly YOLO: "yolo";
};
export declare const BACKENDS: {
    readonly GEMINI: "ask-gemini";
    readonly CURSOR: "ask-cursor";
    readonly DROID: "ask-droid";
    readonly ROVODEV: "ask-rovodev";
    readonly QWEN: "ask-qwen";
};
export { BACKENDS as default };
export type GeminiModel = typeof AI_MODELS.GEMINI[keyof typeof AI_MODELS.GEMINI];
export type ApprovalMode = typeof APPROVAL_MODES[keyof typeof APPROVAL_MODES];
export type BackendType = typeof BACKENDS[keyof typeof BACKENDS];
/**
 * Agent role descriptions and configurations
 *
 * Defines the specialization and preferred backend for each agent type
 */
export declare const AGENT_ROLES: {
    readonly ARCHITECT: {
        /**
         * AI backend used for execution (e.g., "gemini", "cursor-agent", "droid")
         */
        readonly backend: "ask-gemini";
        readonly specialization: "High-level system design, architecture analysis, and strategic planning";
        readonly description: "Uses Gemini for deep architectural reasoning, security analysis, and long-term design decisions";
    };
    readonly IMPLEMENTER: {
        readonly name: "ImplementerAgent";
        readonly backend: "ask-droid";
        readonly fallbackBackend: undefined;
        readonly specialization: "Precise code implementation with production-quality standards";
        readonly description: "Uses Droid (GLM-4.6) for autonomous agentic tasks and implementation";
    };
    readonly TESTER: {
        readonly name: "TesterAgent";
        readonly backend: "ask-cursor";
        readonly specialization: "Fast test generation and validation";
        readonly description: "Uses Cursor Agent (Sonnet 4.5) for rapid test case generation and validation";
    };
};
//# sourceMappingURL=constants.d.ts.map