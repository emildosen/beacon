import { LogsIngestionClient } from '@azure/monitor-ingestion';
import { InvocationContext } from '@azure/functions';
import { DefaultAzureCredential } from '@azure/identity';
import { Alert, LogEntry } from './types.js';

const ALERTS_STREAM = 'Custom-Beacon_Alerts_CL';
const LOG_STREAM = 'Custom-Beacon_Log_CL';

let clientInstance: LogsIngestionClient | null = null;

function getClient(): LogsIngestionClient {
  if (!clientInstance) {
    const endpoint = process.env.LOG_ANALYTICS_ENDPOINT;
    if (!endpoint) {
      throw new Error('Missing required environment variable: LOG_ANALYTICS_ENDPOINT');
    }

    const credential = new DefaultAzureCredential();
    clientInstance = new LogsIngestionClient(endpoint, credential);
  }
  return clientInstance;
}

/**
 * Writes alerts to Log Analytics custom table via Data Collection Rule
 */
export async function writeAlerts(
  alerts: Alert[],
  context: InvocationContext
): Promise<void> {
  if (alerts.length === 0) {
    context.log('No alerts to write to Log Analytics');
    return;
  }

  const ruleId = process.env.LOG_ANALYTICS_RULE_ID;
  if (!ruleId) {
    throw new Error('Missing required environment variable: LOG_ANALYTICS_RULE_ID');
  }

  const client = getClient();

  try {
    await client.upload(ruleId, ALERTS_STREAM, alerts as unknown as Record<string, unknown>[]);
  } catch (error) {
    context.error('Error writing alerts to Log Analytics:', error);
    throw error;
  }
}

/**
 * Writes log entries to Beacon_Log_CL custom table via Data Collection Rule
 */
export async function writeLogs(
  logs: LogEntry[],
  context: InvocationContext
): Promise<void> {
  if (logs.length === 0) return;

  const ruleId = process.env.LOG_ANALYTICS_RULE_ID;
  if (!ruleId) {
    throw new Error('Missing required environment variable: LOG_ANALYTICS_RULE_ID');
  }

  const client = getClient();

  try {
    await client.upload(ruleId, LOG_STREAM, logs as unknown as Record<string, unknown>[]);
  } catch (error) {
    context.error('Error writing logs to Log Analytics:', error);
    throw error;
  }
}
