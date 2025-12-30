import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { validateRequest, authErrorResponse } from '../lib/jwtValidation.js';
import { getAlertsConfig, updateAlertsConfig } from '../lib/config.js';
import { Severity } from '../lib/types.js';

const VALID_SEVERITIES: Severity[] = ['Low', 'Medium', 'High', 'Critical'];

function jsonResponse(status: number, body: unknown): HttpResponseInit {
  return {
    status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

/**
 * GET /api/alerts-config - Get current config
 */
async function handleGetConfig(): Promise<HttpResponseInit> {
  const config = await getAlertsConfig();
  return jsonResponse(200, config);
}

/**
 * PUT /api/alerts-config - Update config (partial update supported)
 * Body: { webhookUrl?: string, minimumSeverity?: Severity, enabled?: boolean }
 */
async function handlePutConfig(request: HttpRequest): Promise<HttpResponseInit> {
  let body: Partial<{
    webhookUrl: string;
    minimumSeverity: string;
    enabled: boolean;
  }>;

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON body' });
  }

  // Validate input
  if (body.webhookUrl !== undefined && typeof body.webhookUrl !== 'string') {
    return jsonResponse(400, { error: 'Invalid webhookUrl: must be a string' });
  }

  if (body.minimumSeverity !== undefined) {
    if (!VALID_SEVERITIES.includes(body.minimumSeverity as Severity)) {
      return jsonResponse(400, {
        error: `Invalid minimumSeverity: must be one of ${VALID_SEVERITIES.join(', ')}`,
      });
    }
  }

  if (body.enabled !== undefined && typeof body.enabled !== 'boolean') {
    return jsonResponse(400, { error: 'Invalid enabled: must be a boolean' });
  }

  // Get current config and merge with updates
  const current = await getAlertsConfig();
  const updated = {
    webhookUrl: body.webhookUrl ?? current.webhookUrl,
    minimumSeverity: (body.minimumSeverity as Severity) ?? current.minimumSeverity,
    enabled: body.enabled ?? current.enabled,
  };

  await updateAlertsConfig(updated);

  return jsonResponse(200, updated);
}

// Register HTTP trigger
app.http('alertsConfig', {
  methods: ['GET', 'PUT'],
  authLevel: 'anonymous',
  route: 'api/alerts-config',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    // Validate JWT
    const auth = await validateRequest(request);
    if (!auth.success) {
      return authErrorResponse(auth);
    }

    context.log(`Admin API: ${request.method} /api/alerts-config by ${auth.email}`);

    try {
      switch (request.method) {
        case 'GET':
          return handleGetConfig();

        case 'PUT':
          return handlePutConfig(request);

        default:
          return jsonResponse(405, { error: 'Method not allowed' });
      }
    } catch (error) {
      context.error('AlertsConfig API error:', error);
      return jsonResponse(500, { error: 'Internal server error' });
    }
  },
});
