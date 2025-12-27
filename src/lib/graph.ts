import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials/index.js';
import { InvocationContext } from '@azure/functions';
import { getClientCredential } from './auth.js';
import { SignInLog, SecurityAlert, GraphPagedResponse } from './types.js';

function getGraphClient(tenantId: string): Client {
  const credential = getClientCredential(tenantId);
  const authProvider = new TokenCredentialAuthenticationProvider(credential, {
    scopes: ['https://graph.microsoft.com/.default'],
  });

  return Client.initWithMiddleware({
    authProvider,
  });
}

/**
 * Fetches risky sign-in logs from Graph API
 * Filters to riskLevelDuringSignIn ne 'none' to reduce volume
 */
export async function getSignIns(
  tenantId: string,
  since: Date,
  context: InvocationContext
): Promise<SignInLog[]> {
  const client = getGraphClient(tenantId);
  const signIns: SignInLog[] = [];

  try {
    const filterDate = since.toISOString();
    const filter = `createdDateTime ge ${filterDate}`;

    let response: GraphPagedResponse<SignInLog> = await client
      .api('/auditLogs/signIns')
      .filter(filter)
      .top(100)
      .get();

    signIns.push(...response.value);

    // Handle pagination
    while (response['@odata.nextLink']) {
      response = await client.api(response['@odata.nextLink']).get();
      signIns.push(...response.value);
    }

  } catch (error) {
    context.error('Error fetching sign-ins from Graph API:', error);
  }

  return signIns;
}

/**
 * Fetches security alerts (v2) from Graph API
 */
export async function getSecurityAlerts(
  tenantId: string,
  since: Date,
  context: InvocationContext
): Promise<SecurityAlert[]> {
  const client = getGraphClient(tenantId);
  const alerts: SecurityAlert[] = [];

  try {
    const filterDate = since.toISOString();
    const filter = `createdDateTime ge ${filterDate}`;

    let response: GraphPagedResponse<SecurityAlert> = await client
      .api('/security/alerts_v2')
      .filter(filter)
      .top(100)
      .get();

    alerts.push(...response.value);

    // Handle pagination
    while (response['@odata.nextLink']) {
      response = await client.api(response['@odata.nextLink']).get();
      alerts.push(...response.value);
    }

  } catch (error) {
    context.error('Error fetching security alerts from Graph API:', error);
  }

  return alerts;
}
