import { app, InvocationContext, Timer } from '@azure/functions';
import { getAuditEvents } from '../lib/managementApi.js';
import { getSignIns, getSecurityAlerts } from '../lib/graph.js';
import { evaluateRules, getEventId, getEventSummary } from '../lib/rules.js';
import { writeAlerts } from '../lib/logAnalytics.js';
import { getClients } from '../lib/config.js';
import { Alert, AuditEvent, SignInLog, SecurityAlert, RuleSource, Client } from '../lib/types.js';

app.timer('pollAuditLogs', {
  schedule: '0 */5 * * * *', // Every 5 minutes
  handler: async (timer: Timer, context: InvocationContext): Promise<void> => {
    context.log('Beacon polling started at:', new Date().toISOString());

    if (timer.isPastDue) {
      context.log('Timer is past due - execution delayed');
    }

    // Calculate time window
    const now = new Date();
    const since = new Date(now.getTime() - 36 * 60 * 60 * 1000);

    // Load clients from config
    const clients = getClients();
    context.log(`Processing ${clients.length} clients`);

    const allAlerts: Alert[] = [];
    let totalEvents = 0;

    // Process each client sequentially to avoid rate limiting
    for (const client of clients) {
      context.log(`\n--- Processing client: ${client.name} (${client.tenantId}) ---`);

      try {
        const { alerts, eventCount } = await processClient(client, since, context);
        allAlerts.push(...alerts);
        totalEvents += eventCount;
        context.log(`Client ${client.name}: ${eventCount} events, ${alerts.length} alerts`);
      } catch (error) {
        context.error(`Failed to process client ${client.name}:`, error);
        // Continue with next client
      }
    }

    // Write all alerts to Log Analytics
    console.log(`Generated ${allAlerts.length} total alerts from ${totalEvents} events across ${clients.length} clients`);
    if (allAlerts.length > 0) {
      console.log('Writing alerts to Log Analytics...');
      try {
        await writeAlerts(allAlerts, context);
        console.log('Alerts written successfully');
      } catch (error) {
        context.error('Failed to write alerts to Log Analytics:', error);
      }
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
  console.log(`Fetching M365 logs for ${client.name}...`);
  const [auditEvents, signIns, securityAlerts] = await Promise.all([
    getAuditEvents(client.tenantId, since, context),
    getSignIns(client.tenantId, since, context),
    getSecurityAlerts(client.tenantId, since, context),
  ]);
  console.log(`Got ${auditEvents.length} audit events`);
  console.log(`Got ${signIns.length} sign-ins`);
  console.log(`Got ${securityAlerts.length} security alerts`);

  // Process audit events
  eventCount += auditEvents.length;
  for (const event of auditEvents) {
    const matchedRule = evaluateRules(event, 'AuditLog');
    if (matchedRule) {
      alerts.push(createAlert(event, 'AuditLog', matchedRule, client));
    }
  }

  // Process sign-ins
  eventCount += signIns.length;
  for (const event of signIns) {
    const matchedRule = evaluateRules(event, 'SignIn');
    if (matchedRule) {
      alerts.push(createAlert(event, 'SignIn', matchedRule, client));
    }
  }

  // Process security alerts
  eventCount += securityAlerts.length;
  for (const event of securityAlerts) {
    const matchedRule = evaluateRules(event, 'SecurityAlert');
    if (matchedRule) {
      alerts.push(createAlert(event, 'SecurityAlert', matchedRule, client));
    }
  }

  return { alerts, eventCount };
}

function createAlert(
  event: AuditEvent | SignInLog | SecurityAlert,
  source: RuleSource,
  rule: { name: string; severity: string; description: string },
  client: Client
): Alert {
  return {
    TimeGenerated: new Date().toISOString(),
    TenantId: client.tenantId,
    TenantName: client.name,
    RuleName: rule.name,
    Severity: rule.severity,
    Description: rule.description,
    SourceType: source,
    SourceEventId: getEventId(event),
    RawEventSummary: getEventSummary(event, source),
  };
}
