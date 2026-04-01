#!/usr/bin/env node
/**
 * Downloads the same audit logs the poller checks, for the last hour.
 * Saves raw events as JSON to test-data/ for offline rule testing.
 *
 * Usage: npm run download-logs -- <tenant-id>
 *
 * Requires CLIENT_ID and CLIENT_SECRET in .env or local.settings.json
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { getAuditEvents } from '../lib/managementApi.js';
import { getSignIns, getSecurityAlerts, getDirectoryAudits, getRiskDetections } from '../lib/graph.js';
import { InvocationContext } from '@azure/functions';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..', '..');
const outputDir = path.join(projectRoot, 'test-data');

// Load env from local.settings.json if .env vars aren't set
function loadLocalSettings() {
  if (process.env.CLIENT_ID && process.env.CLIENT_SECRET) return;

  const settingsPath = path.join(projectRoot, 'local.settings.json');
  if (fs.existsSync(settingsPath)) {
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    const values = settings.Values || {};
    for (const [key, value] of Object.entries(values)) {
      if (!process.env[key]) {
        process.env[key] = value as string;
      }
    }
  }
}

/** Minimal logger that satisfies InvocationContext interface for API calls */
const logger = {
  log: (...args: unknown[]) => console.log('  ', ...args),
  warn: (...args: unknown[]) => console.warn('  ⚠', ...args),
  error: (...args: unknown[]) => console.error('  ✗', ...args),
} as unknown as InvocationContext;

async function main() {
  const tenantId = process.argv[2];

  if (!tenantId) {
    console.log('Usage: npm run download-logs -- <tenant-id>');
    process.exit(1);
  }

  loadLocalSettings();

  if (!process.env.CLIENT_ID || !process.env.CLIENT_SECRET) {
    console.error('Missing CLIENT_ID or CLIENT_SECRET. Set in .env or local.settings.json.');
    process.exit(1);
  }

  // Ensure TENANT_ID is set (needed by auth.ts for credential creation)
  if (!process.env.TENANT_ID) {
    process.env.TENANT_ID = tenantId;
  }

  const since = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
  console.log(`Downloading logs for tenant ${tenantId}`);
  console.log(`Time window: ${since.toISOString()} → ${new Date().toISOString()}\n`);

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const results: Record<string, { data: unknown[]; error?: string }> = {};

  // Fetch all sources in parallel
  const fetches = [
    { name: 'audit-events', fn: () => getAuditEvents(tenantId, since, logger) },
    { name: 'directory-audits', fn: () => getDirectoryAudits(tenantId, since, logger) },
    { name: 'sign-ins', fn: () => getSignIns(tenantId, since, logger) },
    { name: 'security-alerts', fn: () => getSecurityAlerts(tenantId, since, logger) },
    { name: 'risk-detections', fn: () => getRiskDetections(tenantId, since, logger) },
  ];

  await Promise.all(
    fetches.map(async ({ name, fn }) => {
      try {
        console.log(`Fetching ${name}...`);
        const data = await fn();
        results[name] = { data };
        console.log(`  ✓ ${name}: ${data.length} events`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        results[name] = { data: [], error: message };
        console.error(`  ✗ ${name}: ${message}`);
      }
    })
  );

  // Write each source to its own file
  let totalEvents = 0;
  for (const [name, { data }] of Object.entries(results)) {
    if (data.length > 0) {
      const filePath = path.join(outputDir, `${name}.json`);
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      totalEvents += data.length;
    }
  }

  console.log(`\nDone: ${totalEvents} total events saved to test-data/`);
  if (totalEvents > 0) {
    console.log('\nTest rules against downloaded logs:');
    console.log('  npm run test-rules -- ./test-data/audit-events.json');
    console.log('  npm run test-rules -- ./test-data/directory-audits.json');
    console.log('  npm run test-rules -- ./test-data/sign-ins.json');
  }
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
