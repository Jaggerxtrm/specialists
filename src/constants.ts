/**
 * Constants and configuration for Specialists MCP server
 */

export const LOG_PREFIX = "[specialists]";

export const AI_MODELS = {
  GEMINI: {
    PRIMARY: "gemini-3-pro-preview",
    FLASH: "gemini-3-flash-preview",
    PRO_2_5: "gemini-2.5-pro",
    FLASH_2_5: "gemini-2.5-flash",
    FLASH_LITE: "gemini-2.5-flash-lite"
  },
  CURSOR_AGENT: {
    GPT_5_1: "gpt-5.1",
    GPT_5: "gpt-5",
    COMPOSER_1: "composer-1",
    SONNET_4_5: "sonnet-4.5",
    HAIKU_5: "haiku-5",
    DEEPSEEK_V3: "deepseek-v3"
  },
  DROID: {
    PRIMARY: "glm-4.6"
  }
} as const;

export const CLI = {
  COMMANDS: {
    GEMINI: "gemini",
    CURSOR_AGENT: "cursor-agent",
    DROID: "droid",
    ECHO: "echo"
  },
  FLAGS: {
    // Gemini specific flags (based on gemini CLI help)
    GEMINI: {
      SANDBOX: "-s",
      HELP: "-help",
      MODEL: "--model"
    },
    CURSOR: {
      PROMPT: "-p",
      OUTPUT: "--output-format",
      PRINT: "--print",
      FORCE: "--force",
      FILE: "--file"
    },
    DROID: {
      EXEC: "exec",
      AUTO: "--auto",
      OUTPUT: "--output-format",
      SESSION: "--session-id",
      SKIP_PERMISSIONS: "--skip-permissions-unsafe",
      FILE: "--file",
      CWD: "--cwd"
    },
    ROVODEV: {
      RUN: "run",
      YOLO: "--yolo",
      RESTORE: "--restore",
      CONFIG: "--config-file"
    },
    QWEN: {
      SANDBOX: "-s",
      YOLO: "-y",
      OUTPUT: "-o",
      INTERACTIVE: "-i"
    }
  }
} as const;

export const ERROR_MESSAGES = {
  NO_PROMPT_PROVIDED: "No prompt provided. Please include a prompt in your request.",
  TOOL_NOT_FOUND: "Tool not found in registry",
  INVALID_ARGUMENTS: "Invalid tool arguments",
  EXECUTION_FAILED: "Tool execution failed",
  QUOTA_EXCEEDED: "Quota exceeded for primary model, attempting fallback...",
  VALIDATION_FAILED: "Tool response validation failed"
} as const;

export const STATUS_MESSAGES = {
  THINKING: "🤔 Thinking...",
  PROCESSING: "⚙️ Processing...",
  SEARCHING: "🔍 Searching...",
  EXECUTING: "🚀 Executing...",
  COMPLETED: "✅ Analysis complete",
  FAILED: "❌ Analysis failed",
  STARTING_ANALYSIS: "🚀 Starting analysis..."
} as const;

export const MCP_CONFIG = {
  SERVER_NAME: "specialists",
  VERSION: "1.0.0",
  CAPABILITIES: {
    tools: {},
    prompts: {},
    logging: {}
  },
  KEEP_ALIVE_INTERVAL: 25000 // 25 seconds
} as const;

export const APPROVAL_MODES = {
  PLAN: "plan",
  DEFAULT: "default",
  AUTO_EDIT: "auto-edit",
  YOLO: "yolo"
} as const;

export const BACKENDS = {
  GEMINI: "ask-gemini",
  CURSOR: "ask-cursor",
  DROID: "ask-droid",
  ROVODEV: "ask-rovodev",
  QWEN: "ask-qwen"
} as const;

// Export BACKENDS values for easier importing
export { BACKENDS as default };

export type GeminiModel = typeof AI_MODELS.GEMINI[keyof typeof AI_MODELS.GEMINI];
export type ApprovalMode = typeof APPROVAL_MODES[keyof typeof APPROVAL_MODES];
export type BackendType = typeof BACKENDS[keyof typeof BACKENDS];

/**
 * Agent role descriptions and configurations
 *
 * Defines the specialization and preferred backend for each agent type
 */
export const AGENT_ROLES = {
  ARCHITECT: {
    /**
     * AI backend used for execution (e.g., "gemini", "cursor-agent", "droid")
     */
    backend: BACKENDS.GEMINI,
    specialization: "High-level system design, architecture analysis, and strategic planning",
    description: "Uses Gemini for deep architectural reasoning, security analysis, and long-term design decisions"
  },
  IMPLEMENTER: {
    name: "ImplementerAgent",
    backend: BACKENDS.DROID,
    fallbackBackend: undefined,
    specialization: "Precise code implementation with production-quality standards",
    description: "Uses Droid (GLM-4.6) for autonomous agentic tasks and implementation"
  },
  TESTER: {
    name: "TesterAgent",
    backend: BACKENDS.CURSOR,
    specialization: "Fast test generation and validation",
    description: "Uses Cursor Agent (Sonnet 4.5) for rapid test case generation and validation"
  }
} as const;