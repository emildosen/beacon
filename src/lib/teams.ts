import { InvocationContext } from '@azure/functions';
import { Alert, Severity, SEVERITY_ORDER } from './types.js';
import { getAlertsConfig } from './config.js';

/**
 * Checks if an alert severity meets the minimum threshold
 */
function meetsMinimumSeverity(alertSeverity: string, minimumSeverity: Severity): boolean {
  const alertLevel = SEVERITY_ORDER[alertSeverity as Severity] ?? 0;
  const minLevel = SEVERITY_ORDER[minimumSeverity];
  return alertLevel >= minLevel;
}

/**
 * Maps severity to Teams color
 */
function getSeverityColor(severity: string): string {
  switch (severity) {
    case 'Critical':
      return 'attention'; // red
    case 'High':
      return 'warning'; // yellow/orange
    case 'Medium':
      return 'accent'; // blue
    default:
      return 'default'; // grey
  }
}

/**
 * Builds a Teams Adaptive Card for a batch of alerts
 */
function buildAdaptiveCard(alerts: Alert[]): object {
  const alertsByClient = new Map<string, Alert[]>();
  for (const alert of alerts) {
    const key = alert.ClientTenantName;
    if (!alertsByClient.has(key)) {
      alertsByClient.set(key, []);
    }
    alertsByClient.get(key)!.push(alert);
  }

  const body: object[] = [
    {
      type: 'TextBlock',
      size: 'Large',
      weight: 'Bolder',
      text: `Beacon: ${alerts.length} Alert${alerts.length > 1 ? 's' : ''} Detected`,
    },
  ];

  for (const [clientName, clientAlerts] of alertsByClient) {
    body.push({
      type: 'TextBlock',
      text: clientName,
      weight: 'Bolder',
      spacing: 'Medium',
    });

    for (const alert of clientAlerts) {
      body.push({
        type: 'Container',
        style: getSeverityColor(alert.Severity),
        items: [
          {
            type: 'ColumnSet',
            columns: [
              {
                type: 'Column',
                width: 'auto',
                items: [
                  {
                    type: 'TextBlock',
                    text: `**[${alert.Severity}]** ${alert.RuleName}`,
                    wrap: true,
                  },
                ],
              },
            ],
          },
          {
            type: 'TextBlock',
            text: alert.Description,
            wrap: true,
            spacing: 'Small',
          },
          {
            type: 'FactSet',
            facts: [
              ...(alert.User ? [{ title: 'User', value: alert.User }] : []),
              { title: 'Source', value: alert.SourceType },
              { title: 'Time', value: new Date(alert.TimeGenerated).toLocaleString() },
            ],
            spacing: 'Small',
          },
        ],
        spacing: 'Small',
      });
    }
  }

  return {
    type: 'message',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        content: {
          $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
          type: 'AdaptiveCard',
          version: '1.4',
          body,
        },
      },
    ],
  };
}

/**
 * Sends alerts to Teams via webhook
 * Only sends alerts that meet the minimum severity threshold
 */
export async function sendTeamsAlerts(alerts: Alert[], context: InvocationContext): Promise<void> {
  const config = getAlertsConfig();

  if (!config.enabled) {
    context.log('Teams notifications disabled');
    return;
  }

  if (!config.webhookUrl) {
    context.warn('Teams webhook URL not configured');
    return;
  }

  // Filter alerts by minimum severity
  const severityFiltered = alerts.filter((alert) => meetsMinimumSeverity(alert.Severity, config.minimumSeverity));

  // Filter by ShouldNotify (notification throttle - skip alerts that were throttled)
  const filteredAlerts = severityFiltered.filter((alert) => alert.ShouldNotify !== false);

  if (filteredAlerts.length === 0) {
    const throttledCount = severityFiltered.length - filteredAlerts.length;
    if (throttledCount > 0) {
      context.log(`No alerts to notify (${throttledCount} throttled, ${alerts.length - severityFiltered.length} below ${config.minimumSeverity} severity)`);
    } else {
      context.log(`No alerts meet minimum severity threshold (${config.minimumSeverity})`);
    }
    return;
  }

  context.log(`Sending ${filteredAlerts.length} alerts to Teams (filtered from ${alerts.length} total)`);

  const card = buildAdaptiveCard(filteredAlerts);

  const response = await fetch(config.webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(card),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Teams webhook failed: ${response.status} ${text}`);
  }

  context.log('Teams notification sent successfully');
}
