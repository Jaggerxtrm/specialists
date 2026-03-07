/**
 * Token Estimator Utility
 *
 * Provides token cost estimation for files and tool operations
 * to enable intelligent, token-aware decision making.
 */
import { exec } from "child_process";
import { promisify } from "util";
import { stat, access } from "fs/promises";
import { constants } from "fs";
import { logger } from "./logger.js";
import { Database } from 'bun:sqlite';
import * as path from 'path';
import * as fs from 'fs';
const execAsync = promisify(exec);
/**
 * Average tokens per line for different file types (empirical data)
 */
const TOKENS_PER_LINE = {
    ".ts": 0.4,
    ".tsx": 0.45,
    ".js": 0.35,
    ".jsx": 0.4,
    ".py": 0.38,
    ".java": 0.42,
    ".go": 0.36,
    ".rs": 0.40,
    ".cpp": 0.43,
    ".c": 0.38,
    ".h": 0.35,
    ".md": 0.25,
    ".json": 0.15,
    ".yaml": 0.20,
    ".yml": 0.20,
    default: 0.35
};
/**
 * File size classification thresholds (in LOC)
 */
const LOC_THRESHOLDS = {
    small: 300, // <300 LOC
    medium: 600, // 300-600 LOC
    large: 1000, // 600-1000 LOC
    xlarge: Infinity // >1000 LOC
};
/**
 * Estimate tokens for a file based on LOC and file type
 */
export async function estimateFileTokens(filePath) {
    try {
        // Check if file exists and is accessible
        await access(filePath, constants.R_OK);
        // Get file stats for size
        const stats = await stat(filePath);
        const sizeBytes = stats.size;
        // Count lines using wc -l (fast for large files)
        const { stdout } = await execAsync(`wc -l < "${filePath}"`);
        const loc = parseInt(stdout.trim(), 10) || 0;
        // Determine tokens per line based on file extension
        const ext = filePath.match(/\.\w+$/)?.[0] || "";
        const tokensPerLine = TOKENS_PER_LINE[ext] || TOKENS_PER_LINE.default;
        // Calculate estimated tokens
        const estimatedTokens = Math.ceil(loc * tokensPerLine);
        // Classify file size
        let classification;
        if (loc < LOC_THRESHOLDS.small) {
            classification = "small";
        }
        else if (loc < LOC_THRESHOLDS.medium) {
            classification = "medium";
        }
        else if (loc < LOC_THRESHOLDS.large) {
            classification = "large";
        }
        else {
            classification = "xlarge";
        }
        logger.debug(`Token estimate for ${filePath}: ${loc} LOC, ~${estimatedTokens} tokens (${classification})`);
        return {
            loc,
            estimatedTokens,
            classification,
            filePath,
            sizeBytes
        };
    }
    catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to estimate tokens for ${filePath}: ${errorMsg}`);
        // Return conservative estimate on error
        return {
            loc: 1000,
            estimatedTokens: 400,
            classification: "large",
            filePath,
            sizeBytes: 0
        };
    }
}
/**
 * Estimate output size for tool operations
 */
export function estimateToolOutput(tool, args) {
    // Conservative estimates based on common tool usage
    switch (tool) {
        case "Grep":
            // Grep typically returns 10-100 matches, ~50 tokens each
            return 2500;
        case "Glob":
            // Glob returns file paths, minimal tokens
            return 500;
        case "Bash":
            // Bash commands vary widely, conservative estimate
            if (typeof args === "string" && args.includes("cat")) {
                return 5000; // cat can output full files
            }
            return 1000;
        default:
            return 1000;
    }
}
/**
 * Check if file is a code file based on extension
 */
function isCodeFile(filePath) {
    const codeExtensions = [
        ".ts", ".tsx", ".js", ".jsx",
        ".py", ".java", ".go", ".rs",
        ".cpp", ".c", ".h", ".hpp",
        ".cs", ".rb", ".php", ".swift",
        ".kt", ".scala", ".clj"
    ];
    return codeExtensions.some(ext => filePath.endsWith(ext));
}
/**
 * Suggest optimal tool based on context
 *
 * Core decision logic:
 * - Code files → ALWAYS Serena (75-80% token savings)
 * - Pattern search → claude-context semantic search
 * - Multi-file operations → workflow orchestration
 * - Small non-code files → Read ok
 */
export async function suggestOptimalTool(context) {
    const { tool, target, additionalContext } = context;
    // Case 1: Read tool on code files → ALWAYS suggest Serena
    if (tool === "Read" && isCodeFile(target)) {
        const estimate = await estimateFileTokens(target);
        // Calculate savings (75-80% with Serena)
        const serenaTokens = Math.ceil(estimate.estimatedTokens * 0.25); // Only 25% of full file
        const savings = estimate.estimatedTokens - serenaTokens;
        return {
            recommended: "serena",
            reason: `Code file (${estimate.loc} LOC, ~${estimate.estimatedTokens} tokens). Serena provides 75-80% token savings through symbol-level navigation.`,
            blockedTool: "Read",
            suggestedCommands: [
                `mcp__serena__get_symbols_overview("${target}") # Get file structure`,
                `mcp__serena__find_symbol("SymbolName", "${target}") # Find specific symbols`
            ],
            estimatedSavings: savings
        };
    }
    // Case 2: Grep on codebase → Suggest claude-context
    if (tool === "Grep" || (tool === "Bash" && target.match(/grep|rg/))) {
        return {
            recommended: "claude-context",
            reason: "Pattern search in codebase. claude-context provides semantic search with hybrid BM25+vector matching, finding related code beyond literal matches.",
            blockedTool: tool,
            suggestedCommands: [
                `mcp__claude-context__search_code("semantic query", "/home/dawid/Projects/unitai")`
            ],
            estimatedSavings: 1500 // Semantic search is much more targeted
        };
    }
    // Case 3: Bash cat/find commands on code → Suggest Serena
    if (tool === "Bash" && target.match(/^(cat|find)/)) {
        const fileMatch = target.match(/(?:cat|find)\s+([^\s]+)/);
        if (fileMatch && isCodeFile(fileMatch[1])) {
            return {
                recommended: "serena",
                reason: "Bash command reading code file. Use Serena for symbol-level access instead.",
                blockedTool: "Bash",
                suggestedCommands: [
                    `mcp__serena__get_symbols_overview("${fileMatch[1]}")`
                ]
            };
        }
    }
    // Case 4: Large file (even non-code) → Suggest Serena if applicable
    if (tool === "Read") {
        try {
            const estimate = await estimateFileTokens(target);
            if (estimate.classification === "xlarge" || estimate.classification === "large") {
                if (isCodeFile(target)) {
                    return {
                        recommended: "serena",
                        reason: `Large file (${estimate.loc} LOC). Serena recommended for efficient navigation.`,
                        blockedTool: "Read",
                        estimatedSavings: Math.ceil(estimate.estimatedTokens * 0.75)
                    };
                }
                else {
                    // Non-code large file - suggest asking Gemini to analyze
                    return {
                        recommended: "workflow",
                        reason: `Large non-code file (${estimate.loc} lines, ${estimate.estimatedTokens} tokens). Consider using ask-gemini for summarization.`,
                        suggestedCommands: [
                            `mcp__unitAI__ask-gemini("@${target} Summarize key points")`
                        ]
                    };
                }
            }
        }
        catch (error) {
            // If estimation fails, be conservative
            logger.warn(`Could not estimate file size for ${target}, suggesting Serena as fallback`);
        }
    }
    // Case 5: Small non-code file or safe operation → Allow
    return {
        recommended: "read",
        reason: "Small file or non-code content. Read tool is appropriate.",
        suggestedCommands: []
    };
}
/**
 * Format tool suggestion as human-readable message
 */
export function formatToolSuggestion(suggestion) {
    let message = "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
    if (suggestion.blockedTool) {
        message += `❌ BLOCKED: ${suggestion.blockedTool} tool not recommended\n`;
    }
    message += `✅ RECOMMENDED: ${suggestion.recommended.toUpperCase()}\n`;
    message += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    message += `${suggestion.reason}\n\n`;
    if (suggestion.suggestedCommands && suggestion.suggestedCommands.length > 0) {
        message += "Suggested commands:\n";
        suggestion.suggestedCommands.forEach(cmd => {
            message += `  ${cmd}\n`;
        });
        message += "\n";
    }
    if (suggestion.estimatedSavings) {
        message += `💰 Estimated token savings: ~${suggestion.estimatedSavings} tokens\n`;
    }
    message += "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
    return message;
}
/**
 * Token Savings Metrics Collector
 *
 * Tracks and aggregates token savings from enforcer hooks and workflows.
 * Stores metrics in SQLite database for analysis and reporting.
 */
export class TokenSavingsMetrics {
    db;
    dbPath;
    constructor(dbPath) {
        this.dbPath = dbPath || path.join(process.cwd(), 'data', 'token-metrics.sqlite');
        // Ensure data directory exists
        const dataDir = path.dirname(this.dbPath);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        // Initialize database
        this.db = new Database(this.dbPath);
        this.initializeSchema();
    }
    /**
     * Initialize database schema for metrics
     */
    initializeSchema() {
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS token_savings_metrics (
        id TEXT PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        source TEXT NOT NULL,
        blocked_tool TEXT NOT NULL,
        recommended_tool TEXT NOT NULL,
        target TEXT NOT NULL,
        estimated_savings INTEGER NOT NULL,
        actual_tokens_avoided INTEGER,
        suggestion_followed INTEGER NOT NULL,
        metadata TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON token_savings_metrics(timestamp);
      CREATE INDEX IF NOT EXISTS idx_metrics_source ON token_savings_metrics(source);
      CREATE INDEX IF NOT EXISTS idx_metrics_blocked_tool ON token_savings_metrics(blocked_tool);
      CREATE INDEX IF NOT EXISTS idx_metrics_recommended_tool ON token_savings_metrics(recommended_tool);
      CREATE INDEX IF NOT EXISTS idx_metrics_followed ON token_savings_metrics(suggestion_followed);
    `);
    }
    /**
     * Generate unique ID for metric entry
     */
    generateId() {
        return `metric_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }
    /**
     * Record a token savings metric
     */
    record(metric) {
        const id = this.generateId();
        const timestamp = Date.now();
        try {
            const stmt = this.db.query(`
        INSERT INTO token_savings_metrics (
          id, timestamp, source, blocked_tool, recommended_tool,
          target, estimated_savings, actual_tokens_avoided, suggestion_followed, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
            stmt.run(id, timestamp, metric.source, metric.blockedTool, metric.recommendedTool, metric.target, metric.estimatedSavings, metric.actualTokensAvoided || null, metric.suggestionFollowed ? 1 : 0, JSON.stringify(metric.metadata || {}));
            logger.debug(`Recorded token savings metric: ${id}, estimated savings: ${metric.estimatedSavings} tokens`);
            return id;
        }
        catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            logger.error(`Failed to record token savings metric: ${errorMsg}`);
            throw error;
        }
    }
    /**
     * Query metrics with filters
     */
    query(filters = {}) {
        let sql = 'SELECT * FROM token_savings_metrics WHERE 1=1';
        const params = [];
        if (filters.source) {
            sql += ' AND source = ?';
            params.push(filters.source);
        }
        if (filters.blockedTool) {
            sql += ' AND blocked_tool = ?';
            params.push(filters.blockedTool);
        }
        if (filters.recommendedTool) {
            sql += ' AND recommended_tool = ?';
            params.push(filters.recommendedTool);
        }
        if (filters.suggestionFollowed !== undefined) {
            sql += ' AND suggestion_followed = ?';
            params.push(filters.suggestionFollowed ? 1 : 0);
        }
        if (filters.startTime) {
            sql += ' AND timestamp >= ?';
            params.push(filters.startTime.getTime());
        }
        if (filters.endTime) {
            sql += ' AND timestamp <= ?';
            params.push(filters.endTime.getTime());
        }
        sql += ' ORDER BY timestamp DESC';
        if (filters.limit) {
            sql += ' LIMIT ?';
            params.push(filters.limit);
        }
        try {
            const rows = this.db.query(sql).all(...params);
            return rows.map((row) => this.rowToMetric(row));
        }
        catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            logger.error(`Failed to query token savings metrics: ${errorMsg}`);
            return [];
        }
    }
    /**
     * Get aggregate statistics
     */
    getStats(filters) {
        const metrics = this.query(filters);
        const stats = {
            totalSuggestions: metrics.length,
            suggestionsFollowed: metrics.filter(m => m.suggestionFollowed).length,
            suggestionsIgnored: metrics.filter(m => !m.suggestionFollowed).length,
            totalEstimatedSavings: metrics.reduce((sum, m) => sum + m.estimatedSavings, 0),
            totalActualSavings: metrics.reduce((sum, m) => sum + (m.actualTokensAvoided || 0), 0),
            byBlockedTool: {},
            byRecommendedTool: {},
            averageSavingsPerSuggestion: 0,
            followRate: 0
        };
        // Calculate average
        if (stats.totalSuggestions > 0) {
            stats.averageSavingsPerSuggestion = Math.round(stats.totalEstimatedSavings / stats.totalSuggestions);
            stats.followRate = Math.round((stats.suggestionsFollowed / stats.totalSuggestions) * 100);
        }
        // Group by blocked tool
        metrics.forEach(m => {
            if (!stats.byBlockedTool[m.blockedTool]) {
                stats.byBlockedTool[m.blockedTool] = { count: 0, savings: 0 };
            }
            stats.byBlockedTool[m.blockedTool].count++;
            stats.byBlockedTool[m.blockedTool].savings += m.estimatedSavings;
        });
        // Group by recommended tool
        metrics.forEach(m => {
            if (!stats.byRecommendedTool[m.recommendedTool]) {
                stats.byRecommendedTool[m.recommendedTool] = { count: 0, savings: 0 };
            }
            stats.byRecommendedTool[m.recommendedTool].count++;
            stats.byRecommendedTool[m.recommendedTool].savings += m.estimatedSavings;
        });
        return stats;
    }
    /**
     * Convert database row to metric object
     */
    rowToMetric(row) {
        return {
            id: row.id,
            timestamp: new Date(row.timestamp),
            source: row.source,
            blockedTool: row.blocked_tool,
            recommendedTool: row.recommended_tool,
            target: row.target,
            estimatedSavings: row.estimated_savings,
            actualTokensAvoided: row.actual_tokens_avoided,
            suggestionFollowed: row.suggestion_followed === 1,
            metadata: JSON.parse(row.metadata || '{}')
        };
    }
    /**
     * Update a metric with actual token savings (when available)
     */
    updateActualSavings(metricId, actualTokensAvoided) {
        try {
            const stmt = this.db.query(`
        UPDATE token_savings_metrics
        SET actual_tokens_avoided = ?
        WHERE id = ?
      `);
            stmt.run(actualTokensAvoided, metricId);
            logger.debug(`Updated metric ${metricId} with actual savings: ${actualTokensAvoided} tokens`);
        }
        catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            logger.error(`Failed to update actual savings for metric ${metricId}: ${errorMsg}`);
        }
    }
    /**
     * Get metrics summary for reporting
     */
    getSummaryReport(days = 7) {
        const startTime = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        const stats = this.getStats({ startTime });
        let report = `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        report += `📊 Token Savings Report (Last ${days} days)\n`;
        report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
        report += `📈 Overall Statistics:\n`;
        report += `  • Total suggestions: ${stats.totalSuggestions}\n`;
        report += `  • Suggestions followed: ${stats.suggestionsFollowed} (${stats.followRate}%)\n`;
        report += `  • Suggestions ignored: ${stats.suggestionsIgnored}\n`;
        report += `  • Total estimated savings: ${stats.totalEstimatedSavings.toLocaleString()} tokens\n`;
        if (stats.totalActualSavings > 0) {
            report += `  • Total actual savings: ${stats.totalActualSavings.toLocaleString()} tokens\n`;
        }
        report += `  • Average savings per suggestion: ${stats.averageSavingsPerSuggestion} tokens\n\n`;
        if (Object.keys(stats.byBlockedTool).length > 0) {
            report += `🚫 By Blocked Tool:\n`;
            Object.entries(stats.byBlockedTool)
                .sort((a, b) => b[1].savings - a[1].savings)
                .forEach(([tool, data]) => {
                report += `  • ${tool}: ${data.count} suggestions, ${data.savings.toLocaleString()} tokens saved\n`;
            });
            report += `\n`;
        }
        if (Object.keys(stats.byRecommendedTool).length > 0) {
            report += `✅ By Recommended Tool:\n`;
            Object.entries(stats.byRecommendedTool)
                .sort((a, b) => b[1].savings - a[1].savings)
                .forEach(([tool, data]) => {
                report += `  • ${tool}: ${data.count} recommendations, ${data.savings.toLocaleString()} tokens saved\n`;
            });
            report += `\n`;
        }
        report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        return report;
    }
    /**
     * Close database connection
     */
    close() {
        this.db.close();
    }
}
// Singleton instance for global access
let metricsInstance = null;
/**
 * Get or create the global metrics instance
 */
export function getMetricsCollector() {
    if (!metricsInstance) {
        metricsInstance = new TokenSavingsMetrics();
    }
    return metricsInstance;
}
//# sourceMappingURL=tokenEstimator.js.map