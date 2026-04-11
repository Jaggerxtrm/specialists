import { createObservabilitySqliteClient, type NodeRunStatus, type ObservabilitySqliteClient } from './observability-sqlite.js';

const ACTIVE_NODE_STATUSES: readonly NodeRunStatus[] = [
  'created',
  'starting',
  'running',
  'waiting',
  'degraded',
  'awaiting_merge',
  'fixing_after_review',
];

function formatNodeRefMatches(matches: ReadonlyArray<{ id: string; node_name: string }>): string {
  return matches.map((match) => `${match.id} (${match.node_name})`).join(', ');
}

function requireSqliteClient(): NonNullable<ReturnType<typeof createObservabilitySqliteClient>> {
  const sqliteClient = createObservabilitySqliteClient();
  if (!sqliteClient) {
    throw new Error('Observability SQLite DB is unavailable. Run: specialists db setup');
  }
  return sqliteClient;
}

export function resolveNodeRefWithClient(partialRef: string, sqliteClient: ObservabilitySqliteClient): string {
  const matches = sqliteClient.listNodeRunsByRef(partialRef, ACTIVE_NODE_STATUSES);
  if (matches.length === 1) return matches[0]!.id;
  if (matches.length === 0) {
    throw new Error(`No node matching ref: ${partialRef}`);
  }

  throw new Error(`Ambiguous node ref ${partialRef} matches: ${formatNodeRefMatches(matches)}`);
}

export function resolveNodeRef(partialRef: string): string {
  const sqliteClient = requireSqliteClient();
  try {
    return resolveNodeRefWithClient(partialRef, sqliteClient);
  } finally {
    sqliteClient.close();
  }
}

export function resolveSingleActiveNodeRef(sqliteClient?: ObservabilitySqliteClient): string {
  const client = sqliteClient ?? requireSqliteClient();
  try {
    const matches = client.listNodeRunsByStatuses(ACTIVE_NODE_STATUSES);
    if (matches.length === 1) return matches[0]!.id;
    if (matches.length === 0) {
      throw new Error('No active nodes found');
    }

    throw new Error(`Ambiguous node ref active matches: ${formatNodeRefMatches(matches)}`);
  } finally {
    if (!sqliteClient) {
      client.close();
    }
  }
}
