/**
 * Audit Trail System for Autonomous Operations
 * 
 * Tracks all autonomous decisions and operations for accountability and debugging.
 */

import { Database } from 'bun:sqlite';
import * as path from 'path';
import * as fs from 'fs';
import type { AutonomyLevel, OperationType } from './permissionManager.js';

/**
 * Audit entry for tracking autonomous operations
 */
export interface AuditEntry {
  id: string;
  timestamp: Date;
  workflowName: string;
  workflowId?: string;
  autonomyLevel: AutonomyLevel;
  operation: OperationType;
  target: string; // file path, branch name, etc.
  approved: boolean;
  executedBy: 'system' | 'user';
  outcome: 'success' | 'failure' | 'pending';
  errorMessage?: string;
  metadata: Record<string, any>;
}

/**
 * Query filters for audit entries
 */
export interface AuditQueryFilters {
  workflowName?: string;
  workflowId?: string;
  autonomyLevel?: AutonomyLevel;
  operation?: OperationType;
  approved?: boolean;
  outcome?: 'success' | 'failure' | 'pending';
  startTime?: Date;
  endTime?: Date;
  limit?: number;
}

/**
 * Audit statistics
 */
export interface AuditStats {
  totalEntries: number;
  approvedOperations: number;
  deniedOperations: number;
  successfulOperations: number;
  failedOperations: number;
  byAutonomyLevel: Record<string, number>;
  byOperation: Record<string, number>;
}

/**
 * Audit Trail for tracking autonomous decisions
 */
export class AuditTrail {
  private db: Database;
  private dbPath: string;

  constructor(dbPath?: string) {
    this.dbPath = dbPath || path.join(process.cwd(), 'data', 'audit.sqlite');

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
   * Initialize database schema
   */
  private initializeSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS audit_entries (
        id TEXT PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        workflow_name TEXT NOT NULL,
        workflow_id TEXT,
        autonomy_level TEXT NOT NULL,
        operation TEXT NOT NULL,
        target TEXT NOT NULL,
        approved INTEGER NOT NULL,
        executed_by TEXT NOT NULL,
        outcome TEXT NOT NULL,
        error_message TEXT,
        metadata TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_entries(timestamp);
      CREATE INDEX IF NOT EXISTS idx_audit_workflow ON audit_entries(workflow_name);
      CREATE INDEX IF NOT EXISTS idx_audit_workflow_id ON audit_entries(workflow_id);
      CREATE INDEX IF NOT EXISTS idx_audit_autonomy ON audit_entries(autonomy_level);
      CREATE INDEX IF NOT EXISTS idx_audit_operation ON audit_entries(operation);
      CREATE INDEX IF NOT EXISTS idx_audit_outcome ON audit_entries(outcome);
    `);
  }

  /**
   * Record an audit entry
   */
  record(entry: Omit<AuditEntry, 'id' | 'timestamp'>): void {
    const id = this.generateId();
    const timestamp = Date.now();

    const stmt = this.db.query(`
      INSERT INTO audit_entries (
        id, timestamp, workflow_name, workflow_id, autonomy_level, operation,
        target, approved, executed_by, outcome, error_message, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      timestamp,
      entry.workflowName,
      entry.workflowId || null,
      entry.autonomyLevel,
      entry.operation,
      entry.target,
      entry.approved ? 1 : 0,
      entry.executedBy,
      entry.outcome,
      entry.errorMessage || null,
      JSON.stringify(entry.metadata || {})
    );
  }

  /**
   * Query audit entries
   */
  query(filters: AuditQueryFilters = {}): AuditEntry[] {
    let sql = 'SELECT * FROM audit_entries WHERE 1=1';
    const params: any[] = [];

    if (filters.workflowName) {
      sql += ' AND workflow_name = ?';
      params.push(filters.workflowName);
    }

    if (filters.workflowId) {
      sql += ' AND workflow_id = ?';
      params.push(filters.workflowId);
    }

    if (filters.autonomyLevel) {
      sql += ' AND autonomy_level = ?';
      params.push(filters.autonomyLevel);
    }

    if (filters.operation) {
      sql += ' AND operation = ?';
      params.push(filters.operation);
    }

    if (filters.approved !== undefined) {
      sql += ' AND approved = ?';
      params.push(filters.approved ? 1 : 0);
    }

    if (filters.outcome) {
      sql += ' AND outcome = ?';
      params.push(filters.outcome);
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

    const rows = this.db.query(sql).all(...params);

    return rows.map((row: any) => this.rowToEntry(row));
  }

  /**
   * Get audit statistics
   */
  getStats(filters?: Pick<AuditQueryFilters, 'workflowName' | 'startTime' | 'endTime'>): AuditStats {
    let whereClause = 'WHERE 1=1';
    const params: any[] = [];

    if (filters?.workflowName) {
      whereClause += ' AND workflow_name = ?';
      params.push(filters.workflowName);
    }

    if (filters?.startTime) {
      whereClause += ' AND timestamp >= ?';
      params.push(filters.startTime.getTime());
    }

    if (filters?.endTime) {
      whereClause += ' AND timestamp <= ?';
      params.push(filters.endTime.getTime());
    }

    // Get counts
    const totalEntries = this.db.query(`SELECT COUNT(*) as count FROM audit_entries ${whereClause}`).get(...params) as any;
    const approvedOperations = this.db.query(`SELECT COUNT(*) as count FROM audit_entries ${whereClause} AND approved = 1`).get(...params) as any;
    const deniedOperations = this.db.query(`SELECT COUNT(*) as count FROM audit_entries ${whereClause} AND approved = 0`).get(...params) as any;
    const successfulOperations = this.db.query(`SELECT COUNT(*) as count FROM audit_entries ${whereClause} AND outcome = 'success'`).get(...params) as any;
    const failedOperations = this.db.query(`SELECT COUNT(*) as count FROM audit_entries ${whereClause} AND outcome = 'failure'`).get(...params) as any;

    // Get distribution by autonomy level
    const byAutonomyLevel: Record<string, number> = {};
    const autonomyLevelRows = this.db.query(`SELECT autonomy_level, COUNT(*) as count FROM audit_entries ${whereClause} GROUP BY autonomy_level`).all(...params) as any[];
    for (const row of autonomyLevelRows) {
      byAutonomyLevel[row.autonomy_level] = row.count;
    }

    // Get distribution by operation
    const byOperation: Record<string, number> = {};
    const operationRows = this.db.query(`SELECT operation, COUNT(*) as count FROM audit_entries ${whereClause} GROUP BY operation`).all(...params) as any[];
    for (const row of operationRows) {
      byOperation[row.operation] = row.count;
    }

    return {
      totalEntries: totalEntries.count,
      approvedOperations: approvedOperations.count,
      deniedOperations: deniedOperations.count,
      successfulOperations: successfulOperations.count,
      failedOperations: failedOperations.count,
      byAutonomyLevel,
      byOperation
    };
  }

  /**
   * Export report in various formats
   */
  exportReport(format: 'json' | 'csv' | 'html', filters?: AuditQueryFilters): string {
    const entries = this.query(filters);

    if (format === 'json') {
      return JSON.stringify(entries, null, 2);
    }

    if (format === 'csv') {
      const headers = [
        'ID',
        'Timestamp',
        'Workflow',
        'Autonomy Level',
        'Operation',
        'Target',
        'Approved',
        'Executed By',
        'Outcome',
        'Error Message'
      ];

      const rows = entries.map(entry => [
        entry.id,
        entry.timestamp.toISOString(),
        entry.workflowName,
        entry.autonomyLevel,
        entry.operation,
        entry.target,
        entry.approved ? 'Yes' : 'No',
        entry.executedBy,
        entry.outcome,
        entry.errorMessage || ''
      ]);

      return [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
      ].join('\n');
    }

    // HTML format
    const stats = this.getStats(filters);
    const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Audit Trail Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    h1 { color: #333; }
    .stats { background: #f5f5f5; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
    .stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
    .stat-box { background: white; padding: 10px; border-radius: 3px; }
    .stat-value { font-size: 24px; font-weight: bold; color: #007bff; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #007bff; color: white; }
    tr:nth-child(even) { background-color: #f2f2f2; }
    .approved { color: green; }
    .denied { color: red; }
    .success { color: green; }
    .failure { color: red; }
  </style>
</head>
<body>
  <h1>Audit Trail Report</h1>
  
  <div class="stats">
    <h2>Statistics</h2>
    <div class="stats-grid">
      <div class="stat-box">
        <div>Total Entries</div>
        <div class="stat-value">${stats.totalEntries}</div>
      </div>
      <div class="stat-box">
        <div>Approved</div>
        <div class="stat-value">${stats.approvedOperations}</div>
      </div>
      <div class="stat-box">
        <div>Denied</div>
        <div class="stat-value">${stats.deniedOperations}</div>
      </div>
      <div class="stat-box">
        <div>Successful</div>
        <div class="stat-value">${stats.successfulOperations}</div>
      </div>
      <div class="stat-box">
        <div>Failed</div>
        <div class="stat-value">${stats.failedOperations}</div>
      </div>
    </div>
  </div>
  
  <h2>Audit Entries</h2>
  <table>
    <thead>
      <tr>
        <th>Timestamp</th>
        <th>Workflow</th>
        <th>Autonomy</th>
        <th>Operation</th>
        <th>Target</th>
        <th>Approved</th>
        <th>Outcome</th>
      </tr>
    </thead>
    <tbody>
      ${entries.map(entry => `
        <tr>
          <td>${entry.timestamp.toISOString()}</td>
          <td>${entry.workflowName}</td>
          <td>${entry.autonomyLevel}</td>
          <td>${entry.operation}</td>
          <td>${entry.target}</td>
          <td class="${entry.approved ? 'approved' : 'denied'}">
            ${entry.approved ? 'Yes' : 'No'}
          </td>
          <td class="${entry.outcome}">${entry.outcome}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>
</body>
</html>
    `.trim();

    return html;
  }

  /**
   * Delete old entries
   */
  cleanup(daysToKeep: number): number {
    const cutoffTimestamp = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);

    const stmt = this.db.query('DELETE FROM audit_entries WHERE timestamp < ?');
    const result = stmt.run(cutoffTimestamp);

    return result.changes;
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `audit-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }

  /**
   * Convert database row to AuditEntry
   */
  private rowToEntry(row: any): AuditEntry {
    return {
      id: row.id,
      timestamp: new Date(row.timestamp),
      workflowName: row.workflow_name,
      workflowId: row.workflow_id || undefined,
      autonomyLevel: row.autonomy_level,
      operation: row.operation,
      target: row.target,
      approved: row.approved === 1,
      executedBy: row.executed_by,
      outcome: row.outcome,
      errorMessage: row.error_message || undefined,
      metadata: JSON.parse(row.metadata || '{}')
    };
  }
}

/**
 * Singleton instance
 */
export const auditTrail = new AuditTrail();

/**
 * Helper function to log audit entries
 */
export async function logAudit(params: {
  operation: string;
  autonomyLevel: string;
  details: string;
  target?: string;
  workflowName?: string;
  workflowId?: string;
}): Promise<void> {
  auditTrail.record({
    workflowName: params.workflowName || 'workflow',
    workflowId: params.workflowId,
    autonomyLevel: params.autonomyLevel as AutonomyLevel,
    operation: params.operation as OperationType,
    target: params.target || params.details.substring(0, 100),
    approved: true,
    executedBy: 'system',
    outcome: 'success',
    metadata: { details: params.details }
  });
}
