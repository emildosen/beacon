import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { addClient } from '../lib/config.js';

app.http('m365Callback', {
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const tenantId = request.query.get('tenant');
    const adminConsent = request.query.get('admin_consent');
    const state = request.query.get('state');
    const error = request.query.get('error');

    if (error) {
      const errorDescription = request.query.get('error_description') || 'Unknown error';
      context.error(`Admin consent failed: ${error} - ${errorDescription}`);
      return {
        status: 400,
        body: `Admin consent failed: ${errorDescription}`,
      };
    }

    // Validate state secret
    const expectedSecret = process.env.CONSENT_SECRET;
    if (!expectedSecret || state !== expectedSecret) {
      context.warn(`Invalid state parameter from tenant ${tenantId}`);
      return {
        status: 403,
        body: 'Invalid request.',
      };
    }

    if (adminConsent !== 'True' || !tenantId) {
      return {
        status: 400,
        body: 'Invalid callback: missing tenant ID or consent not granted.',
      };
    }

    try {
      await addClient(tenantId);
      context.log(`Added pending client: ${tenantId}`);
    } catch (err) {
      context.error(`Failed to add tenant ${tenantId} to Clients table:`, err);
      return {
        status: 500,
        body: 'Failed to register the tenant. Please try again.',
      };
    }

    return {
      status: 200,
      body: `Tenant ${tenantId} has been registered and will be verified shortly.`,
    };
  },
});
