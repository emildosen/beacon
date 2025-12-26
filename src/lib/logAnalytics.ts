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

  const endpoint = process.env.LOG_ANALYTICS_ENDPOINT;
  console.log(`Log Analytics config: endpoint=${endpoint}, ruleId=${ruleId}, stream=${STREAM_NAME}`);
  console.log(`Uploading ${alerts.length} alerts:`, JSON.stringify(alerts[0], null, 2));

  const client = getClient();

  try {
    // Cast to Record<string, unknown>[] as required by the SDK
    await client.upload(ruleId, STREAM_NAME, alerts as unknown as Record<string, unknown>[]);
    console.log(`Successfully wrote ${alerts.length} alerts to Log Analytics`);
    context.log(`Successfully wrote ${alerts.length} alerts to Log Analytics`);
  } catch (error) {
    console.error('Error writing alerts to Log Analytics:', error);
    context.error('Error writing alerts to Log Analytics:', error);
    throw error;
  }
}
