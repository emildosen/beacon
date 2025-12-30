import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { validateRequest, authErrorResponse } from '../lib/jwtValidation.js';
import { getClients, addClient, updateClient, deleteClient, PLACEHOLDER_TENANT_ID } from '../lib/config.js';

// GUID validation regex
const GUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidGuid(value: string): boolean {
  return GUID_REGEX.test(value);
}

function jsonResponse(status: number, body: unknown): HttpResponseInit {
  return {
    status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

/**
 * GET /api/clients - List all clients (excluding placeholder)
 */
async function handleGetClients(): Promise<HttpResponseInit> {
  const clients = await getClients();
  const filtered = clients.filter((c) => c.tenantId !== PLACEHOLDER_TENANT_ID);
  return jsonResponse(200, filtered);
}

/**
 * POST /api/clients - Add a new client
 * Body: { tenantId: string, name: string }
 */
async function handlePostClient(request: HttpRequest): Promise<HttpResponseInit> {
  let body: { name?: string; tenantId?: string };
  try {
    body = (await request.json()) as { name?: string; tenantId?: string };
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON body' });
  }

  // Validate input
  if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
    return jsonResponse(400, { error: 'Missing or invalid name' });
  }

  if (!body.tenantId || !isValidGuid(body.tenantId)) {
    return jsonResponse(400, { error: 'Missing or invalid tenantId (must be a valid GUID)' });
  }

  if (body.tenantId === PLACEHOLDER_TENANT_ID) {
    return jsonResponse(400, { error: 'Cannot use placeholder tenant ID' });
  }

  await addClient(body.tenantId, body.name.trim());

  return jsonResponse(201, { tenantId: body.tenantId, name: body.name.trim() });
}

/**
 * PUT /api/clients/{tenantId} - Update a client's name
 * Body: { name: string }
 */
async function handlePutClient(request: HttpRequest): Promise<HttpResponseInit> {
  const tenantId = request.params.tenantId;

  if (!tenantId || !isValidGuid(tenantId)) {
    return jsonResponse(400, { error: 'Invalid tenantId' });
  }

  if (tenantId === PLACEHOLDER_TENANT_ID) {
    return jsonResponse(400, { error: 'Cannot modify placeholder client' });
  }

  let body: { name?: string };
  try {
    body = (await request.json()) as { name?: string };
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON body' });
  }

  if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
    return jsonResponse(400, { error: 'Missing or invalid name' });
  }

  const updated = await updateClient(tenantId, body.name.trim());

  if (!updated) {
    return jsonResponse(404, { error: 'Client not found' });
  }

  return jsonResponse(200, { tenantId, name: body.name.trim() });
}

/**
 * DELETE /api/clients/{tenantId} - Delete a client
 */
async function handleDeleteClient(request: HttpRequest): Promise<HttpResponseInit> {
  const tenantId = request.params.tenantId;

  if (!tenantId || !isValidGuid(tenantId)) {
    return jsonResponse(400, { error: 'Invalid tenantId' });
  }

  if (tenantId === PLACEHOLDER_TENANT_ID) {
    return jsonResponse(400, { error: 'Cannot delete placeholder client' });
  }

  const deleted = await deleteClient(tenantId);

  if (!deleted) {
    return jsonResponse(404, { error: 'Client not found' });
  }

  return { status: 204 };
}

// Register HTTP trigger
app.http('clients', {
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  authLevel: 'anonymous',
  route: 'api/clients/{tenantId?}',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    // Validate JWT
    const auth = await validateRequest(request);
    if (!auth.success) {
      return authErrorResponse(auth);
    }

    context.log(`Admin API: ${request.method} /api/clients by ${auth.email}`);

    try {
      switch (request.method) {
        case 'GET':
          return handleGetClients();

        case 'POST':
          return handlePostClient(request);

        case 'PUT':
          return handlePutClient(request);

        case 'DELETE':
          return handleDeleteClient(request);

        default:
          return jsonResponse(405, { error: 'Method not allowed' });
      }
    } catch (error) {
      context.error('Clients API error:', error);
      return jsonResponse(500, { error: 'Internal server error' });
    }
  },
});
