import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';
import { TableClient, TableServiceClient } from '@azure/data-tables';
import { BlobServiceClient, ContainerClient } from '@azure/storage-blob';
import { Rule, Client, AlertsConfig, Severity, ClientStatus, RunHistoryEntry, RunStatus } from './types.js';

// Get the project root directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..', '..');
const rulesDir = join(projectRoot, 'rules');

// Table and container names
const CLIENTS_TABLE = 'Clients';
const ALERTS_TABLE = 'AlertsConfig';
const RUN_HISTORY_TABLE = 'RunHistory';
const CONFIG_CONTAINER = 'config';

// Lazy-initialized clients
let clientsTableClient: TableClient | null = null;
let alertsTableClient: TableClient | null = null;
let runHistoryTableClient: TableClient | null = null;
let configContainerClient: ContainerClient | null = null;
let rulesSynced = false;

type Logger = {
  log: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
};

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
 * Check if using filesystem for rules (default is blob)
 */
function useFilesystemForRules(): boolean {
  return process.env.ruleSource === 'filesystem';
}

// Placeholder tenant ID - this client is skipped during processing
export const PLACEHOLDER_TENANT_ID = '00000000-0000-0000-0000-000000000000';

/**
 * Initialize table clients and create tables if they don't exist
 */
async function ensureTablesExist(): Promise<void> {
  if (clientsTableClient && alertsTableClient && runHistoryTableClient) return;

  const connStr = getConnectionString();
  const allowInsecureConnection = connStr.includes('127.0.0.1') || connStr.includes('UseDevelopmentStorage');
  const serviceClient = TableServiceClient.fromConnectionString(connStr, { allowInsecureConnection });

  // Create Clients table if it doesn't exist
  try {
    await serviceClient.createTable(CLIENTS_TABLE);
  } catch (e: unknown) {
    if ((e as { statusCode?: number }).statusCode !== 409) throw e;
  }

  // Create AlertsConfig table if it doesn't exist
  try {
    await serviceClient.createTable(ALERTS_TABLE);
  } catch (e: unknown) {
    if ((e as { statusCode?: number }).statusCode !== 409) throw e;
  }

  // Create RunHistory table if it doesn't exist
  try {
    await serviceClient.createTable(RUN_HISTORY_TABLE);
  } catch (e: unknown) {
    if ((e as { statusCode?: number }).statusCode !== 409) throw e;
  }

  clientsTableClient = TableClient.fromConnectionString(connStr, CLIENTS_TABLE, { allowInsecureConnection });
  alertsTableClient = TableClient.fromConnectionString(connStr, ALERTS_TABLE, { allowInsecureConnection });
  runHistoryTableClient = TableClient.fromConnectionString(connStr, RUN_HISTORY_TABLE, { allowInsecureConnection });

  // Seed placeholder data if tables are empty (for Azure Storage Explorer column visibility)
  await seedPlaceholderDataIfEmpty();
}

/**
 * Add placeholder rows if tables are empty
 */
async function seedPlaceholderDataIfEmpty(): Promise<void> {
  // Check if Clients table is empty
  let hasClients = false;
  for await (const _ of clientsTableClient!.listEntities()) {
    hasClients = true;
    break;
  }

  if (!hasClients) {
    await clientsTableClient!.upsertEntity(
      {
        partitionKey: 'client',
        rowKey: PLACEHOLDER_TENANT_ID,
        name: '_placeholder (do not delete)',
        lastPoll: new Date(),
        status: 'success',
        statusMessage: 'Placeholder row for schema visibility',
      },
      'Replace'
    );
  }

  // Check if AlertsConfig has the alerts row
  let hasAlertsConfig = false;
  try {
    await alertsTableClient!.getEntity('config', 'alerts');
    hasAlertsConfig = true;
  } catch (e: unknown) {
    if ((e as { statusCode?: number }).statusCode !== 404) throw e;
  }

  if (!hasAlertsConfig) {
    await alertsTableClient!.upsertEntity(
      {
        partitionKey: 'config',
        rowKey: 'alerts',
        webhookUrl: '',
        minimumSeverity: 'Medium',
        enabled: false,
      },
      'Replace'
    );
  }
}

/**
 * Initialize blob container client
 */
async function ensureContainerExists(): Promise<ContainerClient> {
  if (configContainerClient) return configContainerClient;

  const connStr = getConnectionString();
  const blobService = BlobServiceClient.fromConnectionString(connStr);
  configContainerClient = blobService.getContainerClient(CONFIG_CONTAINER);

  // Create container if it doesn't exist
  await configContainerClient.createIfNotExists();

  return configContainerClient;
}

/**
 * Recursively finds all .json files in a directory
 */
function findJsonFiles(dir: string): string[] {
  const files: string[] = [];
  if (!existsSync(dir)) {
    return files;
  }

  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findJsonFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      files.push(fullPath);
    }
  }
  return files;
}

/**
 * Validates that a parsed rule has required fields
 */
function isValidRule(rule: unknown): rule is Omit<Rule, 'id'> {
  if (typeof rule !== 'object' || rule === null) return false;
  const r = rule as Record<string, unknown>;
  return (
    typeof r.name === 'string' &&
    typeof r.description === 'string' &&
    typeof r.severity === 'string' &&
    typeof r.enabled === 'boolean' &&
    typeof r.source === 'string' &&
    typeof r.conditions === 'object' &&
    r.conditions !== null
  );
}

/**
 * Sync bundled rules from filesystem to blob storage
 * Only uploads rules that don't already exist in blob (preserves user customizations)
 */
async function syncBundledRulesToBlob(logger?: Logger): Promise<void> {
  if (rulesSynced || useFilesystemForRules()) return;
  rulesSynced = true;

  const container = await ensureContainerExists();
  const jsonFiles = findJsonFiles(rulesDir);

  for (const filePath of jsonFiles) {
    try {
      const relativePath = relative(rulesDir, filePath);
      const blobName = `rules/${relativePath.replace(/\\/g, '/')}`;
      const blobClient = container.getBlockBlobClient(blobName);

      // Check if blob already exists
      const exists = await blobClient.exists();
      if (exists) {
        continue; // Don't overwrite user customizations
      }

      // Upload bundled rule
      const content = readFileSync(filePath, 'utf-8');
      await blobClient.upload(content, content.length, {
        blobHTTPHeaders: { blobContentType: 'application/json' },
      });
      logger?.log(`Synced rule to blob: ${blobName}`);
    } catch (error) {
      logger?.warn(`Failed to sync rule ${filePath}: ${error}`);
    }
  }
}

/**
 * Load rules from filesystem
 */
function loadRulesFromFilesystem(logger?: Logger): Rule[] {
  const rules: Rule[] = [];
  const jsonFiles = findJsonFiles(rulesDir);

  for (const filePath of jsonFiles) {
    try {
      const content = readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(content);

      if (!isValidRule(parsed)) {
        logger?.warn(`Invalid rule file (missing required fields): ${filePath}`);
        continue;
      }

      const relativePath = relative(rulesDir, filePath);
      const id = relativePath.replace(/\.json$/, '').replace(/\\/g, '/');

      rules.push({ ...parsed, id });
    } catch (error) {
      logger?.warn(`Failed to load rule file ${filePath}: ${error}`);
    }
  }

  logger?.log(`Loaded ${rules.length} rules from filesystem`);
  return rules;
}

/**
 * Load rules from blob storage
 */
async function loadRulesFromBlob(logger?: Logger): Promise<Rule[]> {
  const container = await ensureContainerExists();
  const rules: Rule[] = [];

  // List all blobs with prefix 'rules/'
  for await (const blob of container.listBlobsFlat({ prefix: 'rules/' })) {
    if (!blob.name.endsWith('.json')) continue;

    try {
      const blobClient = container.getBlockBlobClient(blob.name);
      const downloadResponse = await blobClient.download();
      const content = await streamToString(downloadResponse.readableStreamBody!);
      const parsed = JSON.parse(content);

      if (!isValidRule(parsed)) {
        logger?.warn(`Invalid rule blob (missing required fields): ${blob.name}`);
        continue;
      }

      // Derive ID from blob name (strip 'rules/' prefix and '.json' suffix)
      const id = blob.name.replace(/^rules\//, '').replace(/\.json$/, '');

      rules.push({ ...parsed, id });
    } catch (error) {
      logger?.warn(`Failed to load rule blob ${blob.name}: ${error}`);
    }
  }

  logger?.log(`Loaded ${rules.length} rules from blob storage`);
  return rules;
}

/**
 * Convert a readable stream to string
 */
async function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf-8');
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Get all clients from Table Storage
 */
export async function getClients(): Promise<Client[]> {
  await ensureTablesExist();

  const clients: Client[] = [];
  const entities = clientsTableClient!.listEntities<{
    name: string;
    lastPoll?: Date;
    status?: string;
    statusMessage?: string;
  }>();

  for await (const entity of entities) {
    clients.push({
      tenantId: entity.rowKey!,
      name: entity.name,
      lastPoll: entity.lastPoll?.toISOString(),
      status: entity.status as ClientStatus | undefined,
      statusMessage: entity.statusMessage,
    });
  }

  return clients;
}

/**
 * Update a client's status after a poll run
 */
export async function updateClientStatus(
  tenantId: string,
  status: ClientStatus,
  statusMessage?: string
): Promise<void> {
  await ensureTablesExist();

  try {
    const existing = await clientsTableClient!.getEntity<{ name: string }>('client', tenantId);
    await clientsTableClient!.upsertEntity(
      {
        partitionKey: 'client',
        rowKey: tenantId,
        name: existing.name,
        lastPoll: new Date(),
        status,
        statusMessage: statusMessage || '',
      },
      'Replace'
    );
  } catch (e: unknown) {
    if ((e as { statusCode?: number }).statusCode === 404) {
      // Client doesn't exist, can't update
      return;
    }
    throw e;
  }
}

/**
 * Get rules from blob storage or filesystem based on ruleSource env var
 * Syncs bundled rules to blob on first call (when using blob mode)
 */
export async function getRules(logger?: Logger): Promise<Rule[]> {
  if (useFilesystemForRules()) {
    return loadRulesFromFilesystem(logger);
  }

  // Sync bundled rules to blob (only uploads missing ones)
  await syncBundledRulesToBlob(logger);

  return loadRulesFromBlob(logger);
}

/**
 * Get alerts config from Table Storage
 */
export async function getAlertsConfig(): Promise<AlertsConfig> {
  await ensureTablesExist();

  try {
    const entity = await alertsTableClient!.getEntity<{
      webhookUrl: string;
      minimumSeverity: string;
      enabled: boolean;
    }>('config', 'alerts');

    return {
      webhookUrl: entity.webhookUrl || '',
      minimumSeverity: (entity.minimumSeverity as Severity) || 'Medium',
      enabled: entity.enabled ?? false,
    };
  } catch (e: unknown) {
    if ((e as { statusCode?: number }).statusCode === 404) {
      // Return defaults if no config exists
      return { webhookUrl: '', minimumSeverity: 'Medium', enabled: false };
    }
    throw e;
  }
}

/**
 * Add a new client to Table Storage
 */
export async function addClient(tenantId: string, name: string): Promise<void> {
  await ensureTablesExist();

  await clientsTableClient!.upsertEntity(
    {
      partitionKey: 'client',
      rowKey: tenantId,
      name,
      lastPoll: null,
      status: '',
      statusMessage: '',
    },
    'Replace'
  );
}

/**
 * Update an existing client's name
 * Returns true if updated, false if not found
 */
export async function updateClient(tenantId: string, name: string): Promise<boolean> {
  await ensureTablesExist();

  try {
    const existing = await clientsTableClient!.getEntity<{
      lastPoll?: Date;
      status?: string;
      statusMessage?: string;
    }>('client', tenantId);

    await clientsTableClient!.upsertEntity(
      {
        partitionKey: 'client',
        rowKey: tenantId,
        name,
        lastPoll: existing.lastPoll || null,
        status: existing.status || '',
        statusMessage: existing.statusMessage || '',
      },
      'Replace'
    );
    return true;
  } catch (e: unknown) {
    if ((e as { statusCode?: number }).statusCode === 404) {
      return false;
    }
    throw e;
  }
}

/**
 * Delete a client from Table Storage
 * Returns true if deleted, false if not found
 */
export async function deleteClient(tenantId: string): Promise<boolean> {
  await ensureTablesExist();

  try {
    await clientsTableClient!.deleteEntity('client', tenantId);
    return true;
  } catch (e: unknown) {
    if ((e as { statusCode?: number }).statusCode === 404) {
      return false;
    }
    throw e;
  }
}

/**
 * Update alerts config in Table Storage
 */
export async function updateAlertsConfig(config: AlertsConfig): Promise<void> {
  await ensureTablesExist();

  await alertsTableClient!.upsertEntity(
    {
      partitionKey: 'config',
      rowKey: 'alerts',
      webhookUrl: config.webhookUrl,
      minimumSeverity: config.minimumSeverity,
      enabled: config.enabled,
    },
    'Replace'
  );
}

/**
 * Generate inverted timestamp for newest-first ordering in Table Storage
 */
function invertedTimestamp(date: Date): string {
  const maxTicks = 9999999999999;
  const ticks = date.getTime();
  return (maxTicks - ticks).toString().padStart(13, '0');
}

/**
 * Log a run to the RunHistory table
 */
export async function logRun(run: RunHistoryEntry): Promise<void> {
  await ensureTablesExist();

  const rowKey = invertedTimestamp(new Date(run.startTime));

  await runHistoryTableClient!.upsertEntity(
    {
      partitionKey: 'run',
      rowKey,
      startTime: new Date(run.startTime),
      endTime: new Date(run.endTime),
      durationMs: run.durationMs,
      clientsChecked: run.clientsChecked,
      eventsProcessed: run.eventsProcessed,
      alertsGenerated: run.alertsGenerated,
      status: run.status,
      errorMessage: run.errorMessage || '',
    },
    'Replace'
  );
}

/**
 * Get run history from Table Storage (newest first)
 */
export async function getRunHistory(limit: number = 50): Promise<RunHistoryEntry[]> {
  await ensureTablesExist();

  const runs: RunHistoryEntry[] = [];
  let count = 0;

  // Entities are returned in ascending rowKey order, but inverted timestamp means newest first
  for await (const entity of runHistoryTableClient!.listEntities<{
    startTime: Date;
    endTime: Date;
    durationMs: number;
    clientsChecked: number;
    eventsProcessed: number;
    alertsGenerated: number;
    status: string;
    errorMessage?: string;
  }>()) {
    if (count >= limit) break;

    runs.push({
      startTime: entity.startTime.toISOString(),
      endTime: entity.endTime.toISOString(),
      durationMs: entity.durationMs,
      clientsChecked: entity.clientsChecked,
      eventsProcessed: entity.eventsProcessed,
      alertsGenerated: entity.alertsGenerated,
      status: entity.status as RunStatus,
      errorMessage: entity.errorMessage || undefined,
    });
    count++;
  }

  return runs;
}

/**
 * Clean up run history entries older than specified days
 * Returns the number of entries deleted
 */
export async function cleanupOldRuns(olderThanDays: number): Promise<number> {
  await ensureTablesExist();

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

  let deleted = 0;

  for await (const entity of runHistoryTableClient!.listEntities<{
    startTime: Date;
  }>()) {
    if (entity.startTime < cutoffDate) {
      try {
        await runHistoryTableClient!.deleteEntity(entity.partitionKey!, entity.rowKey!);
        deleted++;
      } catch {
        // Ignore deletion errors, continue with next
      }
    }
  }

  return deleted;
}
