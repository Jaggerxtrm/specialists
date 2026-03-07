/**
 * Activity Analytics Service
 * 
 * Aggregates and analyzes user activity data from multiple sources:
 * - Audit trail (autonomous operations)
 * - Token metrics (tool usage efficiency)
 * - Workflow executions
 * - Agent performance
 */

import { Database } from 'bun:sqlite';
import * as path from 'path';
import * as fs from 'fs';
import { AuditTrail, AuditEntry, AuditStats } from '../utils/auditTrail.js';
import { TokenSavingsMetrics, TokenSavingsStats } from '../utils/tokenEstimator.js';
import { logger } from '../utils/logger.js';
import { ActivityRepository } from '../repositories/activity.js';

/**
 * Time range for activity queries
 */
export interface TimeRange {
  startTime: Date;
  endTime: Date;
}

/**
 * Tool usage statistics
 */
export interface ToolUsageStats {
  toolName: string;
  invocations: number;
  successRate: number;
  avgResponseTime?: number;
  lastUsed: Date;
}

/**
 * Workflow execution statistics
 */
export interface WorkflowStats {
  workflowName: string;
  executions: number;
  successCount: number;
  failureCount: number;
  avgDuration?: number;
  lastExecuted: Date;
}

/**
 * User activity summary
 */
export interface UserActivitySummary {
  period: string;
  totalOperations: number;
  toolInvocations: number;
  workflowExecutions: number;
  tokensSaved: number;
  successRate: number;
  topTools: ToolUsageStats[];
  topWorkflows: WorkflowStats[];
  auditStats: AuditStats;
  tokenStats: TokenSavingsStats;
  activityByHour: { hour: number; count: number }[];
  activityByDay: { date: string; count: number }[];
}

/**
 * MCP Server activity record
 */
export interface MCPActivity {
  id: string;
  timestamp: Date;
  activityType: 'tool_invocation' | 'workflow_execution' | 'agent_action';
  toolName?: string;
  workflowName?: string;
  agentName?: string;
  duration?: number;
  success: boolean;
  errorMessage?: string;
  metadata: Record<string, any>;
}

/**
 * Activity Analytics Service
 * 
 * Provides comprehensive analytics across all MCP server activities
 */
export class ActivityAnalytics {
  private auditTrail: AuditTrail;
  private tokenMetrics: TokenSavingsMetrics;
  private repository: ActivityRepository;

  constructor(
    repository: ActivityRepository,
    auditDbPath?: string,
    tokenDbPath?: string
  ) {
    // Initialize data sources
    this.auditTrail = new AuditTrail(auditDbPath);
    this.tokenMetrics = new TokenSavingsMetrics(tokenDbPath);
    this.repository = repository;

    // Ensure schema is initialized
    this.repository.initializeSchema();
  }

  /**
   * Record an MCP activity
   */
  recordActivity(activity: Omit<MCPActivity, 'id' | 'timestamp'>): string {
    const id = this.generateId();
    const timestamp = Date.now();

    try {
      this.repository.create({
        id,
        timestamp,
        ...activity
      });

      logger.debug(`Recorded MCP activity: ${id} (${activity.activityType})`);
      return id;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to record MCP activity: ${errorMsg}`);
      throw error;
    }
  }

  /**
   * Query MCP activities
   */
  queryActivities(filters: {
    activityType?: string;
    toolName?: string;
    workflowName?: string;
    startTime?: Date;
    endTime?: Date;
    success?: boolean;
    limit?: number;
  } = {}): MCPActivity[] {
    try {
      return this.repository.query({
        ...filters,
        startTime: filters.startTime?.getTime(),
        endTime: filters.endTime?.getTime()
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to query activities: ${errorMsg}`);
      return [];
    }
  }

  /**
   * Get comprehensive user activity summary
   */
  getActivitySummary(days: number = 7): UserActivitySummary {
    const startTime = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const endTime = new Date();

    // Get audit statistics
    const auditStats = this.auditTrail.getStats({ startTime, endTime });

    // Get token savings statistics
    const tokenStats = this.tokenMetrics.getStats({ startTime, endTime });

    // Get MCP activities
    const activities = this.queryActivities({ startTime, endTime });

    // Calculate tool usage stats
    const toolUsageMap = new Map<string, ToolUsageStats>();
    activities
      .filter(a => a.activityType === 'tool_invocation' && a.toolName)
      .forEach(activity => {
        const toolName = activity.toolName!;
        const existing = toolUsageMap.get(toolName) || {
          toolName,
          invocations: 0,
          successRate: 0,
          lastUsed: activity.timestamp
        };

        existing.invocations++;
        if (activity.timestamp > existing.lastUsed) {
          existing.lastUsed = activity.timestamp;
        }

        toolUsageMap.set(toolName, existing);
      });

    // Calculate success rates for tools
    toolUsageMap.forEach((stats, toolName) => {
      const toolActivities = activities.filter(
        a => a.activityType === 'tool_invocation' && a.toolName === toolName
      );
      const successCount = toolActivities.filter(a => a.success).length;
      stats.successRate = toolActivities.length > 0
        ? successCount / toolActivities.length
        : 0;
    });

    // Calculate workflow stats
    const workflowMap = new Map<string, WorkflowStats>();
    activities
      .filter(a => a.activityType === 'workflow_execution' && a.workflowName)
      .forEach(activity => {
        const workflowName = activity.workflowName!;
        const existing = workflowMap.get(workflowName) || {
          workflowName,
          executions: 0,
          successCount: 0,
          failureCount: 0,
          lastExecuted: activity.timestamp
        };

        existing.executions++;
        if (activity.success) {
          existing.successCount++;
        } else {
          existing.failureCount++;
        }

        if (activity.timestamp > existing.lastExecuted) {
          existing.lastExecuted = activity.timestamp;
        }

        workflowMap.set(workflowName, existing);
      });

    // Calculate activity distribution by hour
    const activityByHour = this.calculateActivityByHour(activities);

    // Calculate activity distribution by day
    const activityByDay = this.calculateActivityByDay(activities, days);

    // Get top tools (sorted by invocations)
    const topTools = Array.from(toolUsageMap.values())
      .sort((a, b) => b.invocations - a.invocations)
      .slice(0, 10);

    // Get top workflows (sorted by executions)
    const topWorkflows = Array.from(workflowMap.values())
      .sort((a, b) => b.executions - a.executions)
      .slice(0, 10);

    // Calculate overall success rate
    const successfulActivities = activities.filter(a => a.success).length;
    const successRate = activities.length > 0
      ? successfulActivities / activities.length
      : 0;

    return {
      period: `Last ${days} days`,
      totalOperations: auditStats.totalEntries + activities.length,
      toolInvocations: activities.filter(a => a.activityType === 'tool_invocation').length,
      workflowExecutions: activities.filter(a => a.activityType === 'workflow_execution').length,
      tokensSaved: tokenStats.totalEstimatedSavings,
      successRate,
      topTools,
      topWorkflows,
      auditStats,
      tokenStats,
      activityByHour,
      activityByDay
    };
  }

  /**
   * Calculate activity distribution by hour of day
   */
  private calculateActivityByHour(activities: MCPActivity[]): { hour: number; count: number }[] {
    const hourMap = new Map<number, number>();

    // Initialize all hours
    for (let i = 0; i < 24; i++) {
      hourMap.set(i, 0);
    }

    // Count activities per hour
    activities.forEach(activity => {
      const hour = activity.timestamp.getHours();
      hourMap.set(hour, (hourMap.get(hour) || 0) + 1);
    });

    return Array.from(hourMap.entries())
      .map(([hour, count]) => ({ hour, count }))
      .sort((a, b) => a.hour - b.hour);
  }

  /**
   * Calculate activity distribution by day
   */
  private calculateActivityByDay(activities: MCPActivity[], days: number): { date: string; count: number }[] {
    const dayMap = new Map<string, number>();

    // Initialize all days in range
    for (let i = 0; i < days; i++) {
      const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const dateStr = date.toISOString().split('T')[0];
      dayMap.set(dateStr, 0);
    }

    // Count activities per day
    activities.forEach(activity => {
      const dateStr = activity.timestamp.toISOString().split('T')[0];
      dayMap.set(dateStr, (dayMap.get(dateStr) || 0) + 1);
    });

    return Array.from(dayMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * Get tool usage statistics for a specific tool
   */
  getToolStats(toolName: string, days: number = 7): ToolUsageStats | null {
    const startTime = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const activities = this.queryActivities({
      activityType: 'tool_invocation',
      toolName,
      startTime
    });

    if (activities.length === 0) {
      return null;
    }

    const successCount = activities.filter(a => a.success).length;
    const durations = activities
      .filter(a => a.duration)
      .map(a => a.duration!);

    const avgResponseTime = durations.length > 0
      ? durations.reduce((sum, d) => sum + d, 0) / durations.length
      : undefined;

    const lastUsed = activities.reduce(
      (latest, a) => a.timestamp > latest ? a.timestamp : latest,
      activities[0].timestamp
    );

    return {
      toolName,
      invocations: activities.length,
      successRate: successCount / activities.length,
      avgResponseTime,
      lastUsed
    };
  }

  /**
   * Get workflow execution statistics
   */
  getWorkflowStats(workflowName: string, days: number = 7): WorkflowStats | null {
    const startTime = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const activities = this.queryActivities({
      activityType: 'workflow_execution',
      workflowName,
      startTime
    });

    if (activities.length === 0) {
      return null;
    }

    const successCount = activities.filter(a => a.success).length;
    const failureCount = activities.length - successCount;

    const durations = activities
      .filter(a => a.duration)
      .map(a => a.duration!);

    const avgDuration = durations.length > 0
      ? durations.reduce((sum, d) => sum + d, 0) / durations.length
      : undefined;

    const lastExecuted = activities.reduce(
      (latest, a) => a.timestamp > latest ? a.timestamp : latest,
      activities[0].timestamp
    );

    return {
      workflowName,
      executions: activities.length,
      successCount,
      failureCount,
      avgDuration,
      lastExecuted
    };
  }

  /**
   * Get real-time activity feed
   */
  getRecentActivities(limit: number = 50): MCPActivity[] {
    return this.queryActivities({ limit });
  }

  /**
   * Cleanup old activity records
   */
  cleanup(daysToKeep: number = 30): number {
    const cutoffTimestamp = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);

    try {
      const deleted = this.repository.cleanup(cutoffTimestamp);
      logger.info(`Cleaned up ${deleted} old activity records`);
      return deleted;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to cleanup activities: ${errorMsg}`);
      return 0;
    }
  }

  /**
   * Close all database connections
   */
  close(): void {
    // Repository handling is managed by DI container typically, 
    // but if we own resources we can close them. 
    // Here we delegate up or ignore since DI container closes db.
    this.auditTrail.close();
    this.tokenMetrics.close();
  }

  /**
   * Generate unique ID for activity
   */
  private generateId(): string {
    return `activity_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}


// Singleton instance
let analyticsInstance: ActivityAnalytics | null = null;
import { getDependencies } from "../dependencies.js";


/**
 * Get or create the global analytics instance
 * Note: This relies on dependencies being initialized earlier in the lifecycle
 */
export function getActivityAnalytics(): ActivityAnalytics {
  if (!analyticsInstance) {
    try {
      const deps = getDependencies();
      const repo = new ActivityRepository(deps.activityDb);
      analyticsInstance = new ActivityAnalytics(repo);
    } catch (e) {
      // Fallback for scripts/tests that might not have init dependencies
      // Ideally we should fix those call sites, but for now this is safter transition
      throw new Error("Cannot get ActivityAnalytics: Dependencies not initialized.");
    }
  }
  return analyticsInstance;
}
