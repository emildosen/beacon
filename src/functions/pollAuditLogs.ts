import { app, InvocationContext, Timer } from '@azure/functions';
import { getAuditEvents } from '../lib/managementApi.js';
import { getSignIns, getSecurityAlerts, getDirectoryAudits, getRiskDetections, getOrganizationName } from '../lib/graph.js';
import { evaluateRules, getEventId, getEventSummary } from '../lib/rules.js';
import { writeAlerts, writeLogs } from '../lib/logAnalytics.js';
import { sendTeamsAlerts } from '../lib/teams.js';
import { getClients, updateClientStatus, getRules, activateClient, incrementClientRetry, deleteClient, PLACEHOLDER_TENANT_ID } from '../lib/config.js';
import { Alert, LogEntry, AuditEvent, SignInLog, SecurityAlert, RiskDetection, RuleSource, Client, Rule, ClientStatus, Severity } from '../lib/types.js';
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
    // Filter out placeholder client and pending clients
    const pendingClients = allClients.filter((c) => c.tenantId !== PLACEHOLDER_TENANT_ID && c.status === 'pending');
    const clients = allClients.filter((c) => c.tenantId !== PLACEHOLDER_TENANT_ID && c.status !== 'pending');
    context.log(`Processing ${clients.length} clients against ${rules.length} rules (${pendingClients.length} pending)`);

    // Verify pending clients
    const pendingLogs = await verifyPendingClients(pendingClients, now, context);

    const allAlerts: Alert[] = [];
    const allLogs: LogEntry[] = [...pendingLogs];
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

      const startTime = Date.now();
      try {
        const { alerts, eventCount, auditEventCount, signInCount, securityAlertCount, riskDetectionCount } = await processClient(client, rules, since, context);
        allAlerts.push(...alerts);
        totalEvents += eventCount;

        allLogs.push({
          TimeGenerated: now.toISOString(),
          LogType: 'sync',
          ClientTenantId: client.tenantId,
          ClientTenantName: client.name,
          Status: 'success',
          Message: '',
          AuditEvents: auditEventCount,
          SignIns: signInCount,
          SecurityAlerts: securityAlertCount,
          RiskDetections: riskDetectionCount,
          AlertsGenerated: alerts.length,
          DurationMs: Date.now() - startTime,
        });

        // Update status on success
        await updateClientStatus(client.tenantId, 'success');
      } catch (error) {
        const { status, message } = parseClientError(error);
        context.error(`Failed to process client ${client.name}: ${message}`);
        await updateClientStatus(client.tenantId, status, message);

        allLogs.push({
          TimeGenerated: now.toISOString(),
          LogType: 'sync',
          ClientTenantId: client.tenantId,
          ClientTenantName: client.name,
          Status: status,
          Message: message,
          DurationMs: Date.now() - startTime,
        });
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

    // Write sync and system logs to Log Analytics
    if (allLogs.length > 0) {
      try {
        await writeLogs(allLogs, context);
      } catch (error) {
        context.error('Failed to write logs to Log Analytics:', error);
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
): Promise<{ alerts: Alert[]; eventCount: number; auditEventCount: number; signInCount: number; securityAlertCount: number; riskDetectionCount: number }> {
  const alerts: Alert[] = [];

  const [auditEvents, directoryAudits, signIns, securityAlerts, riskDetections] = await Promise.all([
    getAuditEvents(client.tenantId, since, context),
    getDirectoryAudits(client.tenantId, since, context),
    getSignIns(client.tenantId, since, context),
    getSecurityAlerts(client.tenantId, since, context),
    getRiskDetections(client.tenantId, since, context),
  ]);

  // Merge Management API audit events with Graph directory audits (already normalized to AuditEvent shape).
  // Graph directoryAudits cover Azure AD operations with near real-time delivery;
  // Management API covers Exchange, SharePoint, and General (AAD removed from Management API to avoid duplication).
  const allAuditEvents = [...directoryAudits, ...auditEvents];

  // Process audit events
  for (const event of allAuditEvents) {
    const matchedRule = evaluateRules(event, 'AuditLog', rules, client.tenantId);
    if (matchedRule) {
      const alert = await processAlert(event, 'AuditLog', matchedRule, client, context);
      if (alert) alerts.push(alert);
    }
  }

  // Process sign-ins
  for (const event of signIns) {
    const matchedRule = evaluateRules(event, 'SignIn', rules, client.tenantId);
    if (matchedRule) {
      const alert = await processAlert(event, 'SignIn', matchedRule, client, context);
      if (alert) alerts.push(alert);
    }
  }

  // Process security alerts — bypass rules engine, forward directly based on severity
  for (const event of securityAlerts) {
    const severity = mapSecurityAlertSeverity(event.severity);
    if (!severity) continue; // Drop informational/unknown

    const alert = await processSecurityAlert(event, severity, client, context);
    if (alert) alerts.push(alert);
  }

  // Process risk detections — bypass rules engine, forward directly based on risk level
  for (const event of riskDetections) {
    const severity = mapRiskLevel(event.riskLevel);
    if (!severity) continue; // Drop none/hidden/unknown

    const alert = await processRiskDetection(event, severity, client, context);
    if (alert) alerts.push(alert);
  }

  return {
    alerts,
    eventCount: allAuditEvents.length + signIns.length + securityAlerts.length + riskDetections.length,
    auditEventCount: allAuditEvents.length,
    signInCount: signIns.length,
    securityAlertCount: securityAlerts.length,
    riskDetectionCount: riskDetections.length,
  };
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
 * Maps Graph API security alert severity to Beacon severity.
 * Returns null for informational/unknown alerts (dropped).
 */
function mapSecurityAlertSeverity(graphSeverity: string): Severity | null {
  switch (graphSeverity) {
    case 'low': return 'Low';
    case 'medium': return 'Medium';
    case 'high': return 'High';
    default: return null; // Drop informational, unknown, unknownFutureValue
  }
}

/**
 * Process a security alert directly (no rules engine).
 * Still runs through dedup and notification throttle.
 */
async function processSecurityAlert(
  event: SecurityAlert,
  severity: Severity,
  client: Client,
  context: InvocationContext
): Promise<Alert | null> {
  const dedupKey = event.title;
  const user = ''; // Security alerts are system-generated

  if (await isDuplicate(client.tenantId, dedupKey, user)) {
    return null;
  }
  await recordAlert(client.tenantId, dedupKey, user);

  const alert: Alert = {
    TimeGenerated: event.createdDateTime,
    TimeProcessed: new Date().toISOString(),
    ClientTenantId: client.tenantId,
    ClientTenantName: client.name,
    User: user,
    RuleName: event.title,
    Severity: severity,
    Description: event.description,
    SourceType: 'SecurityAlert',
    SourceEventId: event.id,
    RawEventSummary: getEventSummary(event, 'SecurityAlert'),
  };

  const recentlyNotified = await wasNotifiedRecently(client.tenantId, dedupKey, user);
  alert.ShouldNotify = !recentlyNotified;

  if (alert.ShouldNotify) {
    await recordNotification(client.tenantId, dedupKey, user);
  }

  return alert;
}

/**
 * Maps Graph API risk detection riskLevel to Beacon severity.
 * Returns null for none/hidden/unknown (dropped).
 */
function mapRiskLevel(riskLevel: string | undefined): Severity | null {
  switch (riskLevel) {
    case 'low': return 'Low';
    case 'medium': return 'Medium';
    case 'high': return 'High';
    default: return null; // Drop none, hidden, unknown, unknownFutureValue
  }
}

/**
 * Process a risk detection directly (no rules engine).
 * Still runs through dedup and notification throttle.
 */
async function processRiskDetection(
  event: RiskDetection,
  severity: Severity,
  client: Client,
  context: InvocationContext
): Promise<Alert | null> {
  const dedupKey = `risk:${event.riskEventType ?? event.id}`;
  const user = event.userPrincipalName ?? '';

  if (await isDuplicate(client.tenantId, dedupKey, user)) {
    return null;
  }
  await recordAlert(client.tenantId, dedupKey, user);

  const summary = `Risk: ${event.riskEventType}, User: ${user}, IP: ${event.ipAddress ?? 'N/A'}, Timing: ${event.detectionTimingType ?? 'N/A'}`;

  const alert: Alert = {
    TimeGenerated: event.activityDateTime ?? event.detectedDateTime ?? new Date().toISOString(),
    TimeProcessed: new Date().toISOString(),
    ClientTenantId: client.tenantId,
    ClientTenantName: client.name,
    User: user,
    RuleName: event.riskEventType ?? 'Unknown risk detection',
    Severity: severity,
    Description: `${event.riskEventType} detected for ${user || 'unknown user'}${event.ipAddress ? ` from ${event.ipAddress}` : ''}`,
    SourceType: 'RiskDetection',
    SourceEventId: event.id,
    RawEventSummary: summary,
  };

  const recentlyNotified = await wasNotifiedRecently(client.tenantId, dedupKey, user);
  alert.ShouldNotify = !recentlyNotified;

  if (alert.ShouldNotify) {
    await recordNotification(client.tenantId, dedupKey, user);
  }

  return alert;
}

// Retry schedule for pending client verification (ms after createdAt)
const PENDING_RETRY_DELAYS = [
  10 * 60 * 1000,  // Retry 0: 10 minutes
  30 * 60 * 1000,  // Retry 1: 30 minutes
  60 * 60 * 1000,  // Retry 2: 1 hour
];
const MAX_PENDING_RETRIES = PENDING_RETRY_DELAYS.length;

/**
 * Verify pending clients by attempting a Graph API call
 * Follows a retry schedule, deletes and logs if all retries are exhausted
 * Returns log entries for system events
 */
async function verifyPendingClients(
  pendingClients: Client[],
  now: Date,
  context: InvocationContext
): Promise<LogEntry[]> {
  const logs: LogEntry[] = [];

  for (const client of pendingClients) {
    const retryCount = client.retryCount ?? 0;
    const createdAt = client.createdAt ? new Date(client.createdAt) : now;
    const elapsed = now.getTime() - createdAt.getTime();

    // Check if enough time has passed for this retry attempt
    const requiredDelay = retryCount < MAX_PENDING_RETRIES ? PENDING_RETRY_DELAYS[retryCount] : 0;
    if (elapsed < requiredDelay) {
      continue;
    }

    // All retries exhausted — delete and log
    if (retryCount >= MAX_PENDING_RETRIES) {
      context.warn(`Pending client ${client.tenantId} failed verification after ${MAX_PENDING_RETRIES} attempts, removing`);
      await deleteClient(client.tenantId);

      logs.push({
        TimeGenerated: now.toISOString(),
        LogType: 'system',
        ClientTenantId: client.tenantId,
        ClientTenantName: client.tenantId,
        Status: 'error',
        Message: `Tenant failed Graph API verification after ${MAX_PENDING_RETRIES} attempts and was removed. This may indicate an invalid consent or a probing attempt.`,
      });
      continue;
    }

    // Attempt verification via Graph
    try {
      const organizationName = await getOrganizationName(client.tenantId);
      await activateClient(client.tenantId, organizationName);
      context.log(`Verified and activated client: ${organizationName} (${client.tenantId})`);

      logs.push({
        TimeGenerated: now.toISOString(),
        LogType: 'system',
        ClientTenantId: client.tenantId,
        ClientTenantName: organizationName,
        Status: 'success',
        Message: `Tenant "${organizationName}" has been verified and added for monitoring.`,
      });
    } catch (err) {
      const nextRetry = retryCount + 1;
      const message = `Verification attempt ${nextRetry}/${MAX_PENDING_RETRIES} failed: ${err instanceof Error ? err.message : String(err)}`;
      context.warn(`Pending client ${client.tenantId}: ${message}`);
      await incrementClientRetry(client.tenantId, nextRetry, message);
    }
  }

  return logs;
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

  if (errorStr.includes('AADSTS7000229') || errorStr.includes('missing service principal')) {
    return { status: 'appNotConsented', message: 'Service principal missing - admin must grant consent' };
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
