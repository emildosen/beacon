import { app, InvocationContext, Timer } from '@azure/functions';
import { getAuditEvents } from '../lib/managementApi.js';
import { getSignIns, getSecurityAlerts } from '../lib/graph.js';
import { evaluateRules, getEventId, getEventSummary } from '../lib/rules.js';
import { writeAlerts } from '../lib/logAnalytics.js';
import { sendTeamsAlerts } from '../lib/teams.js';
import { getClients, updateClientLastPoll } from '../lib/config.js';
import { Alert, AuditEvent, SignInLog, SecurityAlert, RuleSource, Client, Rule } from '../lib/types.js';
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
    context.log('Beacon polling started at:', new Date().toISOString());

    if (timer.isPastDue) {
      context.log('Timer is past due - execution delayed');
    }

    const now = new Date();
    const defaultLookback = 60 * 60 * 1000; // 1 hour for new tenants
    const maxLookback = 6 * 60 * 60 * 1000; // 6 hour max for stale tenants

    // Load clients from config
    const clients = getClients();
    context.log(`Processing ${clients.length} clients`);

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
      context.log(`\n--- Processing client: ${client.name} (${client.tenantId}) since ${since.toISOString()} ---`);

      try {
        const { alerts, eventCount } = await processClient(client, since, context);
        allAlerts.push(...alerts);
        totalEvents += eventCount;
        context.log(`Client ${client.name}: ${eventCount} events, ${alerts.length} alerts`);

        // Update lastPoll on success
        updateClientLastPoll(client.tenantId, now);
      } catch (error) {
        context.error(`Failed to process client ${client.name}:`, error);
        // Don't update lastPoll on failure - will retry same window next run
      }
    }

    // Write all alerts to Log Analytics
    context.log(`Generated ${allAlerts.length} total alerts from ${totalEvents} events across ${clients.length} clients`);
    if (allAlerts.length > 0) {
      context.log('Writing alerts to Log Analytics...');
      try {
        await writeAlerts(allAlerts, context);
        context.log('Alerts written successfully');
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

    context.log(
      `Beacon polling complete: ${totalEvents} events checked, ${allAlerts.length} alerts generated across ${clients.length} clients`
    );
  },
});

async function processClient(
  client: Client,
  since: Date,
  context: InvocationContext
): Promise<{ alerts: Alert[]; eventCount: number }> {
  const alerts: Alert[] = [];
  let eventCount = 0;

  // Fetch from all sources in parallel
  context.log(`Fetching M365 logs for ${client.name}...`);
  const [auditEvents, signIns, securityAlerts] = await Promise.all([
    getAuditEvents(client.tenantId, since, context),
    getSignIns(client.tenantId, since, context),
    getSecurityAlerts(client.tenantId, since, context),
  ]);
  context.log(`Got ${auditEvents.length} audit events`);
  context.log(`Got ${signIns.length} sign-ins`);
  context.log(`Got ${securityAlerts.length} security alerts`);

  // Process audit events
  eventCount += auditEvents.length;
  for (const event of auditEvents) {
    const matchedRule = evaluateRules(event, 'AuditLog', client.tenantId);
    if (matchedRule) {
      const alert = await processAlert(event, 'AuditLog', matchedRule, client, context);
      if (alert) alerts.push(alert);
    }
  }

  // Process sign-ins
  eventCount += signIns.length;
  for (const event of signIns) {
    const matchedRule = evaluateRules(event, 'SignIn', client.tenantId);
    if (matchedRule) {
      const alert = await processAlert(event, 'SignIn', matchedRule, client, context);
      if (alert) alerts.push(alert);
    }
  }

  // Process security alerts
  eventCount += securityAlerts.length;
  for (const event of securityAlerts) {
    const matchedRule = evaluateRules(event, 'SecurityAlert', client.tenantId);
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
  const eventTime = getEventTimestamp(event, source);

  // Layer 1: Check 5-min dedup window for true duplicate suppression
  if (await isDuplicate(client.tenantId, rule.name, user, eventTime)) {
    context.log(`Suppressing duplicate: ${rule.name} for ${user || '(no user)'}`);
    return null;
  }
  await recordAlert(client.tenantId, rule.name, user, eventTime);

  // Create the alert (will be written to Log Analytics)
  const alert = createAlert(event, source, rule, client);

  // Layer 2: Check notification throttle (Critical severity bypasses)
  const isCritical = rule.severity === 'Critical';
  const recentlyNotified = await wasNotifiedRecently(client.tenantId, rule.name, user);

  alert.ShouldNotify = isCritical || !recentlyNotified;

  if (alert.ShouldNotify) {
    await recordNotification(client.tenantId, rule.name, user);
  } else {
    context.log(`Throttling notification: ${rule.name} for ${user || '(no user)'} (already notified within 1 hour)`);
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
