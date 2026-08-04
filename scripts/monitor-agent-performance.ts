#!/usr/bin/env tsx

/**
 * Agent Performance Monitoring Script
 *
 * Tracks and analyzes MCP agent performance against optimization targets:
 * - Token efficiency: 50-65% reduction target
 * - Time efficiency: 40-70% reduction target
 * - Cost efficiency: 20-30% reduction target
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

interface AgentMetrics {
  agentName: string;
  invocations: number;
  avgExecutionTime: number;
  totalExecutionTime: number;
  tokenSavings: number;
  costSavings: number;
  successRate: number;
  lastExecuted: Date;
}

interface PerformanceReport {
  timestamp: Date;
  period: string;
  overallMetrics: {
    totalInvocations: number;
    avgExecutionTime: number;
    tokenSavings: number;
    costSavings: number;
    successRate: number;
  };
  agentMetrics: AgentMetrics[];
  targetComparison: {
    tokenEfficiency: { achieved: number; target: number; status: 'met' | 'partial' | 'missed' };
    timeEfficiency: { achieved: number; target: number; status: 'met' | 'partial' | 'missed' };
    costEfficiency: { achieved: number; target: number; status: 'met' | 'partial' | 'missed' };
  };
  recommendations: string[];
}

class AgentPerformanceMonitor {
  private logDir = path.join(process.cwd(), 'logs');
  private metricsFile = path.join(process.cwd(), 'data', 'agent-performance-metrics.json');

  constructor() {
    this.ensureDirectories();
  }

  private ensureDirectories() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
    const dataDir = path.dirname(this.metricsFile);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
  }

  /**
   * Analyze workflow logs to extract agent performance metrics
   */
  analyzeWorkflowLogs(days: number = 7): AgentMetrics[] {
    const cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000);
    const workflowLog = path.join(this.logDir, 'workflow.log');

    if (!fs.existsSync(workflowLog)) {
      console.warn('Workflow log not found');
      return [];
    }

    const logContent = fs.readFileSync(workflowLog, 'utf8');
    const logEntries = logContent
      .split('\n')
      .filter(line => line.trim())
      .map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(entry => entry && entry.timestamp && new Date(entry.timestamp).getTime() > cutoffTime);

    // Group by workflow component (maps to agent names)
    const agentMap: { [key: string]: any[] } = {};

    logEntries.forEach(entry => {
      const agentName = this.mapComponentToAgent(entry.component);
      if (agentName) {
        if (!agentMap[agentName]) {
          agentMap[agentName] = [];
        }
        agentMap[agentName].push(entry);
      }
    });

    // Calculate metrics for each agent
    const agentMetrics: AgentMetrics[] = [];

    Object.entries(agentMap).forEach(([agentName, entries]) => {
      // Group by workflow ID to count unique workflow executions
      const workflowGroups: { [workflowId: string]: any[] } = {};
      entries.forEach(entry => {
        const workflowId = entry.metadata?.workflowId;
        if (workflowId) {
          if (!workflowGroups[workflowId]) {
            workflowGroups[workflowId] = [];
          }
          workflowGroups[workflowId].push(entry);
        }
      });

      // Count successful workflows (those with a completion operation)
      const successfulWorkflows = Object.values(workflowGroups).filter((workflowEntries: any[]) =>
        workflowEntries.some((e: any) => e.operation === 'complete' || e.operation?.includes('completed'))
      );

      // Calculate total time from successful workflows
      const totalTime = successfulWorkflows.reduce((sum, workflowEntries) => {
        const completionEntry = workflowEntries.find(e => e.metadata?.duration);
        return sum + (completionEntry?.metadata?.duration || 0);
      }, 0);

      const avgTime = successfulWorkflows.length > 0 ? totalTime / successfulWorkflows.length : 0;
      const totalWorkflows = Object.keys(workflowGroups).length;

      // Estimate token savings based on patterns from optimization doc
      const tokenSavings = this.estimateTokenSavings(agentName, successfulWorkflows.length);

      agentMetrics.push({
        agentName,
        invocations: successfulWorkflows.length,
        avgExecutionTime: Math.round(avgTime),
        totalExecutionTime: totalTime,
        tokenSavings,
        costSavings: this.estimateCostSavings(tokenSavings),
        successRate: totalWorkflows > 0 ? successfulWorkflows.length / totalWorkflows : 0,
        lastExecuted: new Date(Math.max(...entries.map(e => new Date(e.timestamp).getTime())))
      });
    });

    return agentMetrics;
  }

  /**
   * Map workflow components to agent names
   */
  private mapComponentToAgent(component: string): string | null {
    const mapping: { [key: string]: string } = {
      'parallel-review': 'triple-validator',
      'pre-commit-validate': 'implementation-validator',
      'infrastructure-analyzer': 'infrastructure-analyzer',
      'gemini-codebase-analyzer': 'gemini-codebase-analyzer',
      'rovodev-task-handler': 'rovodev-task-handler'
    };

    return mapping[component] || null;
  }

  /**
   * Estimate token savings based on agent type and usage patterns
   */
  private estimateTokenSavings(agentName: string, invocations: number): number {
    // Conservative estimates based on optimization targets
    const savingsPerInvocation: { [key: string]: number } = {
      'triple-validator': 800, // Parallel validation
      'implementation-validator': 600, // Implementation validation
      'infrastructure-analyzer': 700, // Multi-phase analysis
      'gemini-codebase-analyzer': 650, // Parallel Gemini + Qwen
      'rovodev-task-handler': 300 // Model optimization (Haiku vs Sonnet)
    };

    return (savingsPerInvocation[agentName] || 500) * invocations;
  }

  /**
   * Estimate cost savings from token savings
   */
  private estimateCostSavings(tokenSavings: number): number {
    // Rough estimate: $0.00015 per token for Sonnet
    const costPerToken = 0.00015;
    return Math.round(tokenSavings * costPerToken * 100) / 100;
  }

  /**
   * Generate comprehensive performance report
   */
  generateReport(days: number = 7): PerformanceReport {
    const agentMetrics = this.analyzeWorkflowLogs(days);
    const totalInvocations = agentMetrics.reduce((sum, m) => sum + m.invocations, 0);
    const totalTime = agentMetrics.reduce((sum, m) => sum + m.totalExecutionTime, 0);
    const avgExecutionTime = totalInvocations > 0 ? totalTime / totalInvocations : 0;
    const totalTokenSavings = agentMetrics.reduce((sum, m) => sum + m.tokenSavings, 0);
    const totalCostSavings = agentMetrics.reduce((sum, m) => sum + m.costSavings, 0);
    const avgSuccessRate = agentMetrics.length > 0
      ? agentMetrics.reduce((sum, m) => sum + m.successRate, 0) / agentMetrics.length
      : 0;

    // Calculate target achievements
    const targetComparison = this.calculateTargetComparison(
      totalTokenSavings,
      avgExecutionTime,
      totalCostSavings,
      days
    );

    const recommendations = this.generateRecommendations(agentMetrics, targetComparison);

    return {
      timestamp: new Date(),
      period: `Last ${days} days`,
      overallMetrics: {
        totalInvocations,
        avgExecutionTime: Math.round(avgExecutionTime),
        tokenSavings: totalTokenSavings,
        costSavings: totalCostSavings,
        successRate: Math.round(avgSuccessRate * 100) / 100
      },
      agentMetrics,
      targetComparison,
      recommendations
    };
  }

  /**
   * Calculate how well targets are being met
   */
  private calculateTargetComparison(
    tokenSavings: number,
    avgTime: number,
    costSavings: number,
    days: number
  ) {
    // Baseline assumptions (conservative estimates)
    const baselineTokensPerDay = 10000; // Estimated tokens without optimization
    const baselineTimePerInvocation = 60000; // 60 seconds baseline
    const baselineCostPerDay = baselineTokensPerDay * 0.00015; // $1.50/day baseline

    const totalBaselineTokens = baselineTokensPerDay * days;
    const totalBaselineCost = baselineCostPerDay * days;

    const tokenEfficiency = totalBaselineTokens > 0 ? (tokenSavings / totalBaselineTokens) * 100 : 0;
    const timeEfficiency = baselineTimePerInvocation > 0 ? ((baselineTimePerInvocation - avgTime) / baselineTimePerInvocation) * 100 : 0;
    const costEfficiency = totalBaselineCost > 0 ? (costSavings / totalBaselineCost) * 100 : 0;

    return {
      tokenEfficiency: {
        achieved: Math.round(tokenEfficiency * 100) / 100,
        target: 50,
        status: this.getStatus(tokenEfficiency, 50)
      },
      timeEfficiency: {
        achieved: Math.round(timeEfficiency * 100) / 100,
        target: 40,
        status: this.getStatus(timeEfficiency, 40)
      },
      costEfficiency: {
        achieved: Math.round(costEfficiency * 100) / 100,
        target: 20,
        status: this.getStatus(costEfficiency, 20)
      }
    };
  }

  private getStatus(achieved: number, target: number): 'met' | 'partial' | 'missed' {
    if (achieved >= target) return 'met';
    if (achieved >= target * 0.5) return 'partial';
    return 'missed';
  }

  /**
   * Generate recommendations based on performance
   */
  private generateRecommendations(
    agentMetrics: AgentMetrics[],
    targets: PerformanceReport['targetComparison']
  ): string[] {
    const recommendations: string[] = [];

    // Check if agents are being used
    if (agentMetrics.length === 0) {
      recommendations.push('Nessun agente MCP rilevato nei log. Verificare che gli agenti siano attivi.');
    }

    // Check target achievements
    if (targets.tokenEfficiency.status === 'missed') {
      recommendations.push('Token efficiency sotto target. Verificare uso degli extension tools e esecuzione parallela.');
    }

    if (targets.timeEfficiency.status === 'missed') {
      recommendations.push('Time efficiency sotto target. Ottimizzare esecuzione parallela e ridurre latenza.');
    }

    // Check agent-specific issues
    agentMetrics.forEach(agent => {
      if (agent.successRate < 0.8) {
        recommendations.push(`${agent.agentName}: Tasso di successo basso (${Math.round(agent.successRate * 100)}%). Investigare errori.`);
      }
      if (agent.invocations === 0) {
        recommendations.push(`${agent.agentName}: Non utilizzato. Considerare promozione nelle skills.`);
      }
    });

    if (recommendations.length === 0) {
      recommendations.push('Performance entro obiettivi. Continuare monitoraggio regolare.');
    }

    return recommendations;
  }

  /**
   * Save report to file
   */
  saveReport(report: PerformanceReport) {
    const reportPath = path.join(process.cwd(), 'reports', `agent-performance-${report.timestamp.toISOString().split('T')[0]}.json`);
    const reportDir = path.dirname(reportPath);

    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }

    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`Report salvato: ${reportPath}`);
  }

  /**
   * Display report in console
   */
  displayReport(report: PerformanceReport) {
    console.log('\n' + '='.repeat(80));
    console.log(`📊 REPORT PERFORMANCE AGENTI MCP - ${report.period}`);
    console.log('='.repeat(80));
    console.log(`📅 Generato: ${report.timestamp.toLocaleString('it-IT')}`);

    console.log('\n📈 Metriche Generali:');
    console.log(`  • Invocazioni totali: ${report.overallMetrics.totalInvocations}`);
    console.log(`  • Tempo medio esecuzione: ${report.overallMetrics.avgExecutionTime}ms`);
    console.log(`  • Risparmi token: ${report.overallMetrics.tokenSavings.toLocaleString()} tokens`);
    console.log(`  • Risparmi costo: $${report.overallMetrics.costSavings.toLocaleString()}`);
    console.log(`  • Tasso successo: ${(report.overallMetrics.successRate * 100).toFixed(1)}%`);

    console.log('\n🎯 Confronto Target:');
    console.log(`  • Token Efficiency: ${report.targetComparison.tokenEfficiency.achieved}% (target: ${report.targetComparison.tokenEfficiency.target}%) - ${this.getStatusText(report.targetComparison.tokenEfficiency.status)}`);
    console.log(`  • Time Efficiency: ${report.targetComparison.timeEfficiency.achieved}% (target: ${report.targetComparison.timeEfficiency.target}%) - ${this.getStatusText(report.targetComparison.timeEfficiency.status)}`);
    console.log(`  • Cost Efficiency: ${report.targetComparison.costEfficiency.achieved}% (target: ${report.targetComparison.costEfficiency.target}%) - ${this.getStatusText(report.targetComparison.costEfficiency.status)}`);

    console.log('\n🤖 Metriche per Agente:');
    report.agentMetrics.forEach(agent => {
      console.log(`  • ${agent.agentName}:`);
      console.log(`    - Invocazioni: ${agent.invocations}`);
      console.log(`    - Tempo medio: ${agent.avgExecutionTime}ms`);
      console.log(`    - Token risparmiati: ${agent.tokenSavings.toLocaleString()}`);
      console.log(`    - Tasso successo: ${(agent.successRate * 100).toFixed(1)}%`);
      console.log(`    - Ultima esecuzione: ${agent.lastExecuted.toLocaleDateString('it-IT')}`);
    });

    console.log('\n💡 Raccomandazioni:');
    report.recommendations.forEach(rec => {
      console.log(`  • ${rec}`);
    });

    console.log('\n' + '='.repeat(80));
  }

  private getStatusText(status: 'met' | 'partial' | 'missed'): string {
    switch (status) {
      case 'met': return '✅ Raggiunto';
      case 'partial': return '⚠️ Parziale';
      case 'missed': return '❌ Mancato';
    }
  }

  /**
   * Main execution method
   */
  async run(days: number = 7, save: boolean = true) {
    console.log(`🔍 Analizzando performance agenti MCP (${days} giorni)...`);

    const report = this.generateReport(days);

    this.displayReport(report);

    if (save) {
      this.saveReport(report);
    }

    return report;
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const days = args.includes('--days') ? parseInt(args[args.indexOf('--days') + 1]) || 7 : 7;
  const save = !args.includes('--no-save');

  const monitor = new AgentPerformanceMonitor();
  await monitor.run(days, save);
}

// Export for programmatic use
export { AgentPerformanceMonitor, type PerformanceReport, type AgentMetrics };

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
