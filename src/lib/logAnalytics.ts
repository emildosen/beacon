import { LogsIngestionClient } from '@azure/monitor-ingestion';
import { InvocationContext } from '@azure/functions';
import { getMspCredential } from './auth.js';
import { Alert } from './types.js';

const STREAM_NAME = 'Custom-Beacon_Alerts_CL';

let clientInstance: LogsIngestionClient | null = null;

function getClient(): LogsIngestionClient {
  if (!clientInstance) {
    const endpoint = process.env.LOG_ANALYTICS_ENDPOINT;
    if (!endpoint) {
      throw new Error('Missing required environment variable: LOG_ANALYTICS_ENDPOINT');
    }

    const credential = getMspCredential();
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
    await client.upload(ruleId, STREAM_NAME, alerts as unknown as Record<string, unknown>[]);
  } catch (error) {
    context.error('Error writing alerts to Log Analytics:', error);
    throw error;
  }
}
