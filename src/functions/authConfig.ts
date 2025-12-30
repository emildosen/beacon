import { app, HttpResponseInit } from '@azure/functions';

/**
 * Public endpoint that returns auth configuration for the admin UI.
 * This allows the same build to work for any Azure tenant - the
 * clientId and tenantId are provided at runtime from Function App settings.
 */
app.http('authConfig', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'api/auth-config',
  handler: async (): Promise<HttpResponseInit> => {
    const clientId = process.env.SPA_CLIENT_ID || process.env.AZURE_CLIENT_ID;
    const tenantId = process.env.TENANT_ID || process.env.AZURE_TENANT_ID;

    if (!clientId || !tenantId) {
      return {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Auth configuration not available. Ensure SPA_CLIENT_ID and TENANT_ID are set.',
        }),
      };
    }

    return {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      },
      body: JSON.stringify({
        clientId,
        tenantId,
      }),
    };
  },
});
