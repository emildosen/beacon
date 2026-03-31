import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getOrganizationName } from '../lib/graph.js';
import { addClient } from '../lib/config.js';

app.http('m365Callback', {
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const tenantId = request.query.get('tenant');
    const adminConsent = request.query.get('admin_consent');
    const error = request.query.get('error');

    if (error) {
      const errorDescription = request.query.get('error_description') || 'Unknown error';
      context.error(`Admin consent failed: ${error} - ${errorDescription}`);
      return {
        status: 400,
        body: `Admin consent failed: ${errorDescription}`,
      };
    }

    if (adminConsent !== 'True' || !tenantId) {
      return {
        status: 400,
        body: 'Invalid callback: missing tenant ID or consent not granted.',
      };
    }

    // Verify tenant is accessible by fetching the organization name from Graph
    let organizationName: string;
    try {
      organizationName = await getOrganizationName(tenantId);
    } catch (err) {
      context.error(`Failed to verify tenant ${tenantId} via Graph API:`, err);
      return {
        status: 502,
        body: `Consent was granted but failed to verify tenant access via Microsoft Graph. The tenant was not added.`,
      };
    }

    // Add the tenant to the Clients table
    try {
      await addClient(tenantId, organizationName);
      context.log(`Added new client: ${organizationName} (${tenantId})`);
    } catch (err) {
      context.error(`Failed to add tenant ${tenantId} to Clients table:`, err);
      return {
        status: 500,
        body: 'Consent verified but failed to save the tenant. Please try again.',
      };
    }

    return {
      status: 200,
      body: `Successfully onboarded tenant "${organizationName}" (${tenantId}).`,
    };
  },
});
