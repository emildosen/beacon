import { app, InvocationContext, Timer } from '@azure/functions';
import { getAuditEvents } from '../lib/managementApi.js';
import { getSignIns, getSecurityAlerts } from '../lib/graph.js';
import { evaluateRules, getEventId, getEventSummary } from '../lib/rules.js';
import { writeAlerts } from '../lib/logAnalytics.js';
import { sendTeamsAlerts } from '../lib/teams.js';
import { getClients, updateClientStatus, getRules, PLACEHOLDER_TENANT_ID } from '../lib/config.js';
import { Alert, AuditEvent, SignInLog, SecurityAlert, RuleSource, Client, Rule, ClientStatus } from '../lib/types.js';
import {
  isDuplicate,
  recordAlert,
  wasNotifiedRecently,
  recordNotification,
  cleanupExpiredEntries,
} from '../lib/alertState.js';

app.timer('pollAuditLogs', {
  schedule: '0 */5 * * * *', // Every 5 minutes
  handler: async (timer: Timer, context: InvocationContext): Promise<void> => {
    if (timer.isPastDue) {
      context.warn('Timer past due - execution delayed');
    }

    const now = new Date();
    const defaultLookback = 60 * 60 * 1000; // 1 hour for new tenants
    const maxLookback = 6 * 60 * 60 * 1000; // 6 hour max for stale tenants

    // Preload rules and clients before processing
    const rules = await getRules(context);
    const allClients = await getClients();
    // Filter out placeholder client
    const clients = allClients.filter((c) => c.tenantId !== PLACEHOLDER_TENANT_ID);
    context.log(`Processing ${clients.length} clients against ${rules.length} rules`);

    const allAlerts: Alert[] = [];
    let totalEvents = 0;

    // Process each client sequentially to avoid rate limiting
    for (const client of clients) {
      // Calculate time window:
      // - New tenants (no lastPoll): use default 1 hour lookback
      // - Existing tenants: use time since lastPoll, capped at 6 hours max
      let since: Date;
      if (client.lastPoll) {
        const lastPollTime = new Date(client.lastPoll);
        const maxLookbackTime = new Date(now.getTime() - maxLookback);
        since = lastPollTime > maxLookbackTime ? lastPollTime : maxLookbackTime;
      } else {
        since = new Date(now.getTime() - defaultLookback);
      }
      context.log(`Processing ${client.name}`);

      try {
        const { alerts, eventCount } = await processClient(client, rules, since, context);
        allAlerts.push(...alerts);
        totalEvents += eventCount;

        // Update status on success
        await updateClientStatus(client.tenantId, 'success');
      } catch (error) {
        const { status, message } = parseClientError(error);
        context.error(`Failed to process client ${client.name}: ${message}`);
        await updateClientStatus(client.tenantId, status, message);
      }
    }

    if (allAlerts.length > 0) {
      try {
        await writeAlerts(allAlerts, context);
      } catch (error) {
        context.error('Failed to write alerts to Log Analytics:', error);
      }

      // Send Teams webhook notifications
      try {
        await sendTeamsAlerts(allAlerts, context);
      } catch (error) {
        context.error('Failed to send Teams notification:', error);
      }
    }

    // Clean up expired dedup and notification state entries
    try {
      await cleanupExpiredEntries();
    } catch (error) {
      context.error('Failed to cleanup expired state entries:', error);
    }

    context.log(`Complete: ${totalEvents} events, ${allAlerts.length} alerts, ${clients.length} clients`);
  },
});

async function processClient(
  client: Client,
  rules: Rule[],
  since: Date,
  context: InvocationContext
): Promise<{ alerts: Alert[]; eventCount: number }> {
  const alerts: Alert[] = [];
  let eventCount = 0;

  const [auditEvents, signIns, securityAlerts] = await Promise.all([
    getAuditEvents(client.tenantId, since, context),
    getSignIns(client.tenantId, since, context),
    getSecurityAlerts(client.tenantId, since, context),
  ]);

  // Process audit events
  eventCount += auditEvents.length;
  for (const event of auditEvents) {
    const matchedRule = evaluateRules(event, 'AuditLog', rules, client.tenantId);
    if (matchedRule) {
      const alert = await processAlert(event, 'AuditLog', matchedRule, client, context);
      if (alert) alerts.push(alert);
    }
  }

  // Process sign-ins
  eventCount += signIns.length;
  for (const event of signIns) {
    const matchedRule = evaluateRules(event, 'SignIn', rules, client.tenantId);
    if (matchedRule) {
      const alert = await processAlert(event, 'SignIn', matchedRule, client, context);
      if (alert) alerts.push(alert);
    }
  }

  // Process security alerts
  eventCount += securityAlerts.length;
  for (const event of securityAlerts) {
    const matchedRule = evaluateRules(event, 'SecurityAlert', rules, client.tenantId);
    if (matchedRule) {
      const alert = await processAlert(event, 'SecurityAlert', matchedRule, client, context);
      if (alert) alerts.push(alert);
    }
  }

  return { alerts, eventCount };
}

/**
 * Process an alert through dedup and notification throttle layers
 * Returns null if the alert is a duplicate and should be suppressed
 */
async function processAlert(
  event: AuditEvent | SignInLog | SecurityAlert,
  source: RuleSource,
  rule: Rule,
  client: Client,
  context: InvocationContext
): Promise<Alert | null> {
  const user = getEventUser(event, source);

  // Check 5-min dedup window (based on TimeProcessed, not TimeGenerated)
  if (await isDuplicate(client.tenantId, rule.name, user)) {
    return null;
  }
  await recordAlert(client.tenantId, rule.name, user);

  // Create the alert (will be written to Log Analytics)
  const alert = createAlert(event, source, rule, client);

  // Layer 2: Check notification throttle (Critical severity bypasses)
  const isCritical = rule.severity === 'Critical';
  const recentlyNotified = await wasNotifiedRecently(client.tenantId, rule.name, user);

  alert.ShouldNotify = isCritical || !recentlyNotified;

  if (alert.ShouldNotify) {
    await recordNotification(client.tenantId, rule.name, user);
  }

  return alert;
}

function getEventTimestamp(event: AuditEvent | SignInLog | SecurityAlert, source: RuleSource): string {
  switch (source) {
    case 'AuditLog':
      return (event as AuditEvent).CreationTime;
    case 'SignIn':
      return (event as SignInLog).createdDateTime;
    case 'SecurityAlert':
      return (event as SecurityAlert).createdDateTime;
  }
}

function getEventUser(event: AuditEvent | SignInLog | SecurityAlert, source: RuleSource): string {
  switch (source) {
    case 'AuditLog':
      return (event as AuditEvent).UserId;
    case 'SignIn':
      return (event as SignInLog).userPrincipalName;
    case 'SecurityAlert':
      // Security alerts don't have a user who initiated them - they're system-generated
      return '';
  }
}

function createAlert(
  event: AuditEvent | SignInLog | SecurityAlert,
  source: RuleSource,
  rule: { name: string; severity: string; description: string },
  client: Client
): Alert {
  return {
    TimeGenerated: getEventTimestamp(event, source),
    TimeProcessed: new Date().toISOString(),
    ClientTenantId: client.tenantId,
    ClientTenantName: client.name,
    User: getEventUser(event, source),
    RuleName: rule.name,
    Severity: rule.severity,
    Description: rule.description,
    SourceType: source,
    SourceEventId: getEventId(event),
    RawEventSummary: getEventSummary(event, source),
  };
}

/**
 * Parse an error from API calls and determine the client status
 */
function parseClientError(error: unknown): { status: ClientStatus; message: string } {
  const errorStr = String(error);
  const errorMessage = error instanceof Error ? error.message : errorStr;

  // Check for common error patterns
  if (errorStr.includes('AADSTS700016') || errorStr.includes('not found in the directory')) {
    return { status: 'appNotConsented', message: 'App registration not consented in tenant' };
  }

  if (errorStr.includes('AADSTS65001') || errorStr.includes('consent')) {
    return { status: 'appNotConsented', message: 'Admin consent required' };
  }

  if (errorStr.includes('AADSTS90002') || errorStr.includes('Tenant') && errorStr.includes('not found')) {
    return { status: 'tenantNotFound', message: 'Tenant not found' };
  }

  if (errorStr.includes('403') || errorStr.includes('Forbidden') || errorStr.includes('Authorization_RequestDenied')) {
    return { status: 'permissionDenied', message: 'Insufficient permissions' };
  }

  if (errorStr.includes('UnifiedAuditLogIsNotEnabled') || errorStr.includes('audit log')) {
    return { status: 'auditLogDisabled', message: 'Unified audit log not enabled' };
  }

  // Generic error
  return { status: 'error', message: errorMessage.slice(0, 500) };
}
