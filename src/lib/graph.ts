import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials/index.js';
import { InvocationContext } from '@azure/functions';
import { getClientCredential } from './auth.js';
import { SignInLog, SecurityAlert, DirectoryAudit, RiskDetection, AuditEvent, GraphPagedResponse } from './types.js';

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
    // Re-throw auth errors so client status gets updated correctly
    if (isAuthError(error)) {
      throw error;
    }
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
    // Re-throw auth errors so client status gets updated correctly
    if (isAuthError(error)) {
      throw error;
    }
  }

  return alerts;
}

/**
 * Fetches directory audit logs from Graph API.
 * These cover Azure AD operations (role assignments, CA policy changes, app registrations, etc.)
 * and arrive near real-time, unlike the Management API which can lag 5-15 minutes.
 *
 * Returns normalized AuditEvent objects so existing AuditLog rules work unchanged.
 */
export async function getDirectoryAudits(
  tenantId: string,
  since: Date,
  context: InvocationContext
): Promise<AuditEvent[]> {
  const client = getGraphClient(tenantId);
  const events: AuditEvent[] = [];

  try {
    const filterDate = since.toISOString();
    const filter = `activityDateTime ge ${filterDate}`;

    let response: GraphPagedResponse<DirectoryAudit> = await client
      .api('/auditLogs/directoryAudits')
      .filter(filter)
      .top(100)
      .get();

    events.push(...response.value.map(normalizeDirectoryAudit));

    while (response['@odata.nextLink']) {
      response = await client.api(response['@odata.nextLink']).get();
      events.push(...response.value.map(normalizeDirectoryAudit));
    }

  } catch (error) {
    context.error('Error fetching directory audits from Graph API:', error);
    if (isAuthError(error)) {
      throw error;
    }
  }

  return events;
}

/**
 * Normalizes a Graph directoryAudit into AuditEvent shape
 * so existing AuditLog rules work against both sources.
 */
function normalizeDirectoryAudit(audit: DirectoryAudit): AuditEvent {
  const userId = audit.initiatedBy?.user?.userPrincipalName
    ?? audit.initiatedBy?.app?.displayName
    ?? '';

  const extendedProps: Array<{ Name: string; Value: string }> = [];
  if (audit.additionalDetails) {
    for (const detail of audit.additionalDetails) {
      extendedProps.push({ Name: detail.key, Value: detail.value });
    }
  }

  const modifiedProps: Array<{ Name: string; NewValue: string; OldValue: string }> = [];
  if (audit.targetResources) {
    for (const target of audit.targetResources) {
      if (target.modifiedProperties) {
        for (const prop of target.modifiedProperties) {
          modifiedProps.push({
            Name: prop.displayName ?? '',
            NewValue: prop.newValue ?? '',
            OldValue: prop.oldValue ?? '',
          });
        }
      }
    }
  }

  return {
    Id: audit.id,
    RecordType: 8, // AzureActiveDirectory
    CreationTime: audit.activityDateTime,
    Operation: audit.activityDisplayName,
    OrganizationId: '',
    UserType: 0,
    UserKey: audit.initiatedBy?.user?.id ?? audit.initiatedBy?.app?.appId ?? '',
    Workload: 'AzureActiveDirectory',
    ResultStatus: audit.result ?? '',
    ObjectId: audit.targetResources?.[0]?.id ?? '',
    UserId: userId,
    ExtendedProperties: extendedProps.length > 0 ? extendedProps : undefined,
    ModifiedProperties: modifiedProps.length > 0 ? modifiedProps : undefined,
    // Preserve original target resources for rules that inspect them
    TargetResources: audit.targetResources,
  } as AuditEvent;
}

/**
 * Fetches risk detections from Graph API Identity Protection.
 * These are individual risk signals (impossible travel, leaked credentials, etc.)
 * detected by Entra ID Protection.
 */
export async function getRiskDetections(
  tenantId: string,
  since: Date,
  context: InvocationContext
): Promise<RiskDetection[]> {
  const client = getGraphClient(tenantId);
  const detections: RiskDetection[] = [];

  try {
    const filterDate = since.toISOString();
    const filter = `activityDateTime ge ${filterDate}`;

    let response: GraphPagedResponse<RiskDetection> = await client
      .api('/identityProtection/riskDetections')
      .filter(filter)
      .top(100)
      .get();

    detections.push(...response.value);

    while (response['@odata.nextLink']) {
      response = await client.api(response['@odata.nextLink']).get();
      detections.push(...response.value);
    }

  } catch (error) {
    context.error('Error fetching risk detections from Graph API:', error);
    if (isAuthError(error)) {
      throw error;
    }
  }

  return detections;
}

/**
 * Fetches the organization display name from Graph API
 * Used to verify tenant access after admin consent
 */
export async function getOrganizationName(tenantId: string): Promise<string> {
  const client = getGraphClient(tenantId);
  const response = await client.api('/organization').select('displayName').get();

  if (!response.value || response.value.length === 0) {
    throw new Error('No organization found for tenant');
  }

  return response.value[0].displayName;
}

/**
 * Check if an error is an authentication/authorization error that should
 * propagate to update client status (vs transient errors that can be ignored)
 */
function isAuthError(error: unknown): boolean {
  const errorStr = String(error);
  return (
    errorStr.includes('AADSTS') || // Any Azure AD error
    errorStr.includes('AuthenticationRequired') ||
    errorStr.includes('invalid_client') ||
    errorStr.includes('Forbidden') ||
    errorStr.includes('Authorization_RequestDenied')
  );
}
