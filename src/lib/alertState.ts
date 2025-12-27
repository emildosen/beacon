import { TableClient, TableServiceClient } from '@azure/data-tables';
import { createHash } from 'crypto';

const DEDUP_TABLE = 'AlertDedup';
const NOTIFICATION_TABLE = 'NotificationState';
const DEDUP_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const NOTIFICATION_WINDOW_MS = 60 * 60 * 1000; // 1 hour

let dedupClient: TableClient | null = null;
let notificationClient: TableClient | null = null;

/**
 * Get connection string from environment
 */
function getConnectionString(): string {
  const connStr = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!connStr) {
    throw new Error('AZURE_STORAGE_CONNECTION_STRING environment variable not set');
  }
  return connStr;
}

/**
 * Initialize table clients and create tables if they don't exist
 */
async function ensureTablesExist(): Promise<void> {
  if (dedupClient && notificationClient) return;

  const connStr = getConnectionString();
  const allowInsecureConnection = connStr.includes('127.0.0.1') || connStr.includes('UseDevelopmentStorage');
  const serviceClient = TableServiceClient.fromConnectionString(connStr, { allowInsecureConnection });

  // Create tables if they don't exist
  try {
    await serviceClient.createTable(DEDUP_TABLE);
  } catch (e: unknown) {
    // Table already exists is OK
    if ((e as { statusCode?: number }).statusCode !== 409) throw e;
  }

  try {
    await serviceClient.createTable(NOTIFICATION_TABLE);
  } catch (e: unknown) {
    if ((e as { statusCode?: number }).statusCode !== 409) throw e;
  }

  dedupClient = TableClient.fromConnectionString(connStr, DEDUP_TABLE, { allowInsecureConnection });
  notificationClient = TableClient.fromConnectionString(connStr, NOTIFICATION_TABLE, { allowInsecureConnection });
}

/**
 * Generate a deterministic row key from rule name and user
 */
function generateRowKey(ruleName: string, user: string): string {
  const hash = createHash('sha256');
  hash.update(`${ruleName}|${user.toLowerCase()}`);
  return hash.digest('hex').substring(0, 32);
}

/**
 * Check if an alert with the same (tenantId, ruleName, user) exists within 5-minute window
 */
export async function isDuplicate(
  tenantId: string,
  ruleName: string,
  user: string,
  eventTime: string
): Promise<boolean> {
  try {
    await ensureTablesExist();
    const rowKey = generateRowKey(ruleName, user);

    const entity = await dedupClient!.getEntity<{ timestamp: string }>(tenantId, rowKey);
    const storedTime = new Date(entity.timestamp).getTime();
    const eventTimeMs = new Date(eventTime).getTime();

    // Check if within 5-minute window
    return Math.abs(eventTimeMs - storedTime) < DEDUP_WINDOW_MS;
  } catch (e: unknown) {
    // Entity not found means not a duplicate, other errors are non-fatal
    if ((e as { statusCode?: number }).statusCode === 404) return false;
    return false;
  }
}

/**
 * Record an alert occurrence for dedup tracking
 */
export async function recordAlert(
  tenantId: string,
  ruleName: string,
  user: string,
  eventTime: string
): Promise<void> {
  try {
    await ensureTablesExist();
    const rowKey = generateRowKey(ruleName, user);

    await dedupClient!.upsertEntity(
      {
        partitionKey: tenantId,
        rowKey,
        timestamp: eventTime,
        ruleName,
        user,
      },
      'Replace'
    );
  } catch {
    // Non-fatal: alert still proceeds even if tracking fails
  }
}

/**
 * Check if a notification was sent for this (tenantId, ruleName, user) in the last hour
 */
export async function wasNotifiedRecently(
  tenantId: string,
  ruleName: string,
  user: string
): Promise<boolean> {
  try {
    await ensureTablesExist();
    const rowKey = generateRowKey(ruleName, user);

    const entity = await notificationClient!.getEntity<{ lastNotified: string }>(tenantId, rowKey);
    const lastNotifiedTime = new Date(entity.lastNotified).getTime();
    const now = Date.now();

    return now - lastNotifiedTime < NOTIFICATION_WINDOW_MS;
  } catch (e: unknown) {
    // Entity not found means not notified, other errors are non-fatal
    if ((e as { statusCode?: number }).statusCode === 404) return false;
    return false;
  }
}

/**
 * Record that a notification was sent
 */
export async function recordNotification(
  tenantId: string,
  ruleName: string,
  user: string
): Promise<void> {
  try {
    await ensureTablesExist();
    const rowKey = generateRowKey(ruleName, user);

    // Try to get existing entity to increment count
    let alertCount = 1;
    try {
      const existing = await notificationClient!.getEntity<{ alertCount: number }>(tenantId, rowKey);
      alertCount = (existing.alertCount || 0) + 1;
    } catch {
      // New entry
    }

    await notificationClient!.upsertEntity(
      {
        partitionKey: tenantId,
        rowKey,
        lastNotified: new Date().toISOString(),
        alertCount,
        ruleName,
        user,
      },
      'Replace'
    );
  } catch {
    // Non-fatal: notification proceeds even if tracking fails
  }
}

/**
 * Clean up expired entries from both tables
 * Call this at the end of each poll cycle
 */
export async function cleanupExpiredEntries(): Promise<void> {
  try {
    await ensureTablesExist();
    const cutoffDedup = new Date(Date.now() - DEDUP_WINDOW_MS).toISOString();
    const cutoffNotification = new Date(Date.now() - NOTIFICATION_WINDOW_MS).toISOString();

    // Clean dedup table (entries older than 5 minutes)
    const dedupEntities = dedupClient!.listEntities<{ timestamp: string }>();
    for await (const entity of dedupEntities) {
      if (entity.timestamp < cutoffDedup) {
        await dedupClient!.deleteEntity(entity.partitionKey!, entity.rowKey!);
      }
    }

    // Clean notification table (entries older than 1 hour)
    const notificationEntities = notificationClient!.listEntities<{ lastNotified: string }>();
    for await (const entity of notificationEntities) {
      if (entity.lastNotified < cutoffNotification) {
        await notificationClient!.deleteEntity(entity.partitionKey!, entity.rowKey!);
      }
    }
  } catch {
    // Non-fatal: cleanup will retry next cycle
  }
}
