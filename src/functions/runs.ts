import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { validateRequest, authErrorResponse } from '../lib/jwtValidation.js';
import { getRunHistory } from '../lib/config.js';

function jsonResponse(status: number, body: unknown): HttpResponseInit {
  return {
    status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

/**
 * GET /api/runs?limit=50 - Get run history (newest first)
 */
async function handleGetRuns(request: HttpRequest): Promise<HttpResponseInit> {
  // Parse limit from query string (default 50, max 200)
  let limit = 50;
  const limitParam = request.query.get('limit');
  if (limitParam) {
    const parsed = parseInt(limitParam, 10);
    if (!isNaN(parsed) && parsed > 0) {
      limit = Math.min(parsed, 200);
    }
  }

  const runs = await getRunHistory(limit);
  return jsonResponse(200, runs);
}

// Register HTTP trigger
app.http('runs', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'api/runs',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    // Validate JWT
    const auth = await validateRequest(request);
    if (!auth.success) {
      return authErrorResponse(auth);
    }

    context.log(`Admin API: ${request.method} /api/runs by ${auth.email}`);

    try {
      return handleGetRuns(request);
    } catch (error) {
      context.error('Runs API error:', error);
      return jsonResponse(500, { error: 'Internal server error' });
    }
  },
});
