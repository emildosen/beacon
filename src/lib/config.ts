import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Rule, Client } from './types.js';

// Get the project root directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..', '..');
const clientsPath = join(projectRoot, 'clients.json');

let cachedClients: Client[] | null = null;
let cachedRules: Rule[] | null = null;

/**
 * Loads and caches clients from clients.json
 */
export function getClients(): Client[] {
  if (cachedClients === null) {
    try {
      const content = readFileSync(clientsPath, 'utf-8');
      cachedClients = JSON.parse(content) as Client[];
      console.log(`Loaded ${cachedClients.length} clients from clients.json`);
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
 * Loads and caches rules from rules.json
 */
export function getRules(): Rule[] {
  if (cachedRules === null) {
    const rulesPath = join(projectRoot, 'rules.json');
    try {
      const content = readFileSync(rulesPath, 'utf-8');
      cachedRules = JSON.parse(content) as Rule[];
      console.log(`Loaded ${cachedRules.length} rules from rules.json`);
    } catch (error) {
      throw new Error(`Failed to load rules.json: ${error}`);
    }
  }
  return cachedRules;
}

/**
 * Clears cached config (useful for testing or hot-reload)
 */
export function clearConfigCache(): void {
  cachedClients = null;
  cachedRules = null;
}
