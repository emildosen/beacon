#!/usr/bin/env node
/**
 * Test runner for debugging rules against exported audit logs
 * Usage: npm run test-rules -- ./test-data/signins.json
 */

import * as fs from 'fs';
import * as path from 'path';
import { evaluateRules } from '../lib/rules.js';
import { getRules } from '../lib/config.js';
import { RuleSource, AuditEvent, SignInLog, SecurityAlert, Rule } from '../lib/types.js';

// ANSI colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

const severityColors: Record<string, string> = {
  Critical: '\x1b[31m', // red
  High: '\x1b[33m',     // yellow
  Medium: '\x1b[36m',   // cyan
  Low: '\x1b[37m',      // white
};

/**
 * Auto-detect the source type from event structure
 */
function detectSourceType(event: Record<string, unknown>): RuleSource {
  // SignIn: has userPrincipalName, appDisplayName, createdDateTime
  if (event.userPrincipalName && event.appDisplayName && event.createdDateTime) {
    return 'SignIn';
  }
  // SecurityAlert: has alertWebUrl, incidentId, title
  if (event.alertWebUrl && event.incidentId !== undefined && event.title) {
    return 'SecurityAlert';
  }
  // Default to AuditLog (Management API events)
  return 'AuditLog';
}

/**
 * Extract a user identifier from the event
 */
function getEventUser(event: Record<string, unknown>, source: RuleSource): string {
  switch (source) {
    case 'SignIn':
      return (event.userPrincipalName as string) || 'unknown';
    case 'AuditLog':
      return (event.UserId as string) || 'unknown';
    case 'SecurityAlert':
      return 'n/a';
    default:
      return 'unknown';
  }
}

/**
 * Extract timestamp from the event
 */
function getEventTime(event: Record<string, unknown>, source: RuleSource): string {
  switch (source) {
    case 'SignIn':
      return (event.createdDateTime as string) || '';
    case 'AuditLog':
      return (event.CreationTime as string) || '';
    case 'SecurityAlert':
      return (event.createdDateTime as string) || '';
    default:
      return '';
  }
}

/**
 * Parse command line arguments
 */
function parseArgs(args: string[]): { filePath: string; tenantId?: string } {
  let filePath = '';
  let tenantId: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--tenant' && args[i + 1]) {
      tenantId = args[i + 1];
      i++; // skip next arg
    } else if (!args[i].startsWith('--')) {
      filePath = args[i];
    }
  }

  return { filePath, tenantId };
}

/**
 * Main test runner
 */
async function main() {
  const args = process.argv.slice(2);
  const { filePath: rawPath, tenantId } = parseArgs(args);

  if (!rawPath) {
    console.log(`${colors.yellow}Usage: npm run test-rules -- <path-to-events.json> [--tenant <tenant-id>]${colors.reset}`);
    console.log(`\nExample: npm run test-rules -- ./test-data/signins.json`);
    console.log(`Example: npm run test-rules -- ./test-data/signins.json --tenant d5d11700-4c7c-463f-83e3-c6f26e4502c8`);
    console.log(`\nThe JSON file should be in Graph Explorer format: { "value": [...] }`);
    console.log(`Or a plain array of events: [...]`);
    process.exit(1);
  }

  const filePath = path.resolve(rawPath);

  // Check file exists
  if (!fs.existsSync(filePath)) {
    console.error(`${colors.red}Error: File not found: ${filePath}${colors.reset}`);
    process.exit(1);
  }

  // Load rules
  console.log(`${colors.cyan}Loading rules...${colors.reset}`);
  const rules = await getRules();
  const enabledRules = rules.filter((r) => r.enabled);
  console.log(`  ${enabledRules.length} rules loaded (${rules.length - enabledRules.length} disabled)`);
  if (tenantId) {
    console.log(`  ${colors.magenta}Tenant filter: ${tenantId}${colors.reset}`);
  } else {
    console.log(`  ${colors.dim}No tenant specified (tenant-scoped rules will be skipped)${colors.reset}`);
  }
  console.log();

  // Load events
  console.log(`${colors.cyan}Loading events from ${path.basename(filePath)}...${colors.reset}`);
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const parsed = JSON.parse(fileContent);

  // Handle both Graph Explorer format { "value": [...] } and plain arrays [...]
  const events: Record<string, unknown>[] = Array.isArray(parsed) ? parsed : (parsed.value || []);

  if (events.length === 0) {
    console.error(`${colors.yellow}No events found in file${colors.reset}`);
    process.exit(0);
  }

  // Detect source type from first event
  const sourceType = detectSourceType(events[0]);
  console.log(`  ${events.length} events loaded`);
  console.log(`  ${colors.magenta}Detected source type: ${sourceType}${colors.reset}\n`);

  // Track matches
  const matchCounts: Record<string, number> = {};
  let totalMatches = 0;

  // Process each event
  console.log(`${colors.bright}${'─'.repeat(60)}${colors.reset}`);

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const user = getEventUser(event, sourceType);
    const time = getEventTime(event, sourceType);

    const matchedRule = evaluateRules(
      event as AuditEvent | SignInLog | SecurityAlert,
      sourceType,
      rules,
      tenantId
    );

    const eventLabel = `[${i + 1}/${events.length}] ${user} - ${time}`;

    if (matchedRule) {
      totalMatches++;
      matchCounts[matchedRule.name] = (matchCounts[matchedRule.name] || 0) + 1;

      const severityColor = severityColors[matchedRule.severity] || colors.reset;
      console.log(`${colors.green}${eventLabel}${colors.reset}`);
      console.log(`  ${colors.green}✓ MATCH:${colors.reset} "${matchedRule.name}" ${severityColor}(${matchedRule.severity})${colors.reset}`);

      // Show matched conditions
      const conditionStr = matchedRule.conditions.rules
        .map(c => `${c.field} ${c.operator} ${c.value || ''}`.trim())
        .join(matchedRule.conditions.match === 'all' ? ' AND ' : ' OR ');
      console.log(`    ${colors.dim}Conditions: ${conditionStr}${colors.reset}`);
    } else {
      console.log(`${colors.dim}${eventLabel}${colors.reset}`);
      console.log(`  ${colors.dim}✗ No match${colors.reset}`);
    }
  }

  // Summary
  console.log(`\n${colors.bright}${'─'.repeat(60)}${colors.reset}`);
  console.log(`${colors.bright}Summary:${colors.reset} ${events.length} events, ${totalMatches} matches\n`);

  if (Object.keys(matchCounts).length > 0) {
    console.log(`${colors.cyan}Rules triggered:${colors.reset}`);
    for (const [ruleName, count] of Object.entries(matchCounts).sort((a, b) => b[1] - a[1])) {
      console.log(`  - ${ruleName}: ${count} match${count > 1 ? 'es' : ''}`);
    }
  } else {
    console.log(`${colors.yellow}No rules matched any events.${colors.reset}`);
    console.log(`\n${colors.dim}Tips:${colors.reset}`);
    console.log(`  - Check that rules are enabled for source type: ${sourceType}`);
    console.log(`  - Verify event field names match rule conditions`);
    console.log(`  - Try adding --verbose flag (coming soon) for detailed debugging`);
  }
}

main().catch((err) => {
  console.error(`${colors.red}Error: ${err.message}${colors.reset}`);
  process.exit(1);
});
