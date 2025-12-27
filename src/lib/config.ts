import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname, relative, basename } from 'path';
import { fileURLToPath } from 'url';
import { Rule, Client, AlertsConfig } from './types.js';

// Get the project root directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..', '..');
const clientsPath = join(projectRoot, 'clients.json');
const rulesDir = join(projectRoot, 'rules');

let cachedClients: Client[] | null = null;
let cachedRules: Rule[] | null = null;
let cachedAlertsConfig: AlertsConfig | null = null;

/**
 * Loads and caches clients from clients.json
 */
export function getClients(): Client[] {
  if (cachedClients === null) {
    try {
      const content = readFileSync(clientsPath, 'utf-8');
      cachedClients = JSON.parse(content) as Client[];
    } catch (error) {
      throw new Error(`Failed to load clients.json: ${error}`);
    }
  }
  return cachedClients;
}

/**
 * Updates a client's lastPoll timestamp and writes back to clients.json
 */
export function updateClientLastPoll(tenantId: string, timestamp: Date): void {
  const clients = getClients();
  const client = clients.find((c) => c.tenantId === tenantId);
  if (client) {
    client.lastPoll = timestamp.toISOString();
    writeFileSync(clientsPath, JSON.stringify(clients, null, 2));
  }
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
 * Loads and caches rules from /rules directory
 * Each .json file is a single rule, ID derived from file path
 */
export function getRules(): Rule[] {
  if (cachedRules === null) {
    cachedRules = [];
    const jsonFiles = findJsonFiles(rulesDir);

    for (const filePath of jsonFiles) {
      try {
        const content = readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(content);

        if (!isValidRule(parsed)) {
          console.warn(`Invalid rule file (missing required fields): ${filePath}`);
          continue;
        }

        // Derive ID from relative path without .json extension
        const relativePath = relative(rulesDir, filePath);
        const id = relativePath.replace(/\.json$/, '').replace(/\\/g, '/');

        const rule: Rule = {
          ...parsed,
          id,
        };
        cachedRules.push(rule);
      } catch (error) {
        console.warn(`Failed to load rule file ${filePath}: ${error}`);
      }
    }

    console.log(`Loaded ${cachedRules.length} rules from ${rulesDir}`);
  }
  return cachedRules;
}

/**
 * Loads and caches alerts config from alerts.json
 */
export function getAlertsConfig(): AlertsConfig {
  if (cachedAlertsConfig === null) {
    const alertsPath = join(projectRoot, 'alerts.json');
    try {
      const content = readFileSync(alertsPath, 'utf-8');
      cachedAlertsConfig = JSON.parse(content) as AlertsConfig;
    } catch {
      cachedAlertsConfig = { webhookUrl: '', minimumSeverity: 'Medium', enabled: false };
    }
  }
  return cachedAlertsConfig;
}

/**
 * Clears cached config (useful for testing or hot-reload)
 */
export function clearConfigCache(): void {
  cachedClients = null;
  cachedRules = null;
  cachedAlertsConfig = null;
}
