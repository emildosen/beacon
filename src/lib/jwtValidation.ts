import { createRemoteJWKSet, jwtVerify, JWTPayload } from 'jose';
import { HttpRequest, HttpResponseInit } from '@azure/functions';

// Cache JWKS for performance
let jwksCache: ReturnType<typeof createRemoteJWKSet> | null = null;

interface TokenClaims extends JWTPayload {
  oid?: string;
  preferred_username?: string;
  groups?: string[];
  name?: string;
}

interface AuthSuccess {
  success: true;
  userId: string;
  userName: string;
  email: string;
}

interface AuthFailure {
  success: false;
  error: string;
  status: number;
}

export type AuthResult = AuthSuccess | AuthFailure;

/**
 * Validate JWT token from Authorization header
 * Checks signature, issuer, audience, and group membership
 */
export async function validateRequest(request: HttpRequest): Promise<AuthResult> {
  const tenantId = process.env.TENANT_ID;
  const clientId = process.env.SPA_CLIENT_ID;
  const adminGroupId = process.env.ADMIN_GROUP_ID;

  if (!tenantId || !clientId || !adminGroupId) {
    return {
      success: false,
      error: 'Server misconfigured: missing authentication settings',
      status: 500,
    };
  }

  // Extract Bearer token
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return {
      success: false,
      error: 'Missing or invalid Authorization header',
      status: 401,
    };
  }

  const token = authHeader.slice(7);

  try {
    // Get or create JWKS
    if (!jwksCache) {
      const jwksUrl = `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`;
      jwksCache = createRemoteJWKSet(new URL(jwksUrl));
    }

    // Verify token signature, issuer, and audience
    const { payload } = await jwtVerify(token, jwksCache, {
      issuer: `https://login.microsoftonline.com/${tenantId}/v2.0`,
      audience: clientId,
    });

    const claims = payload as TokenClaims;

    // Check group membership
    if (!claims.groups?.includes(adminGroupId)) {
      return {
        success: false,
        error: 'Access denied: user is not a member of the admin group',
        status: 403,
      };
    }

    return {
      success: true,
      userId: claims.oid || claims.sub || 'unknown',
      userName: claims.name || 'Unknown User',
      email: claims.preferred_username || '',
    };
  } catch (error) {
    // Handle specific JWT errors
    if (error instanceof Error) {
      if (error.message.includes('expired')) {
        return { success: false, error: 'Token expired', status: 401 };
      }
      if (error.message.includes('signature')) {
        return { success: false, error: 'Invalid token signature', status: 401 };
      }
    }
    return { success: false, error: 'Invalid token', status: 401 };
  }
}

/**
 * Create a 401 Unauthorized response
 */
export function unauthorizedResponse(error: string): HttpResponseInit {
  return {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ error }),
  };
}

/**
 * Create a 403 Forbidden response
 */
export function forbiddenResponse(error: string): HttpResponseInit {
  return {
    status: 403,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ error }),
  };
}

/**
 * Create an error response based on auth result
 */
export function authErrorResponse(result: AuthFailure): HttpResponseInit {
  if (result.status === 403) {
    return forbiddenResponse(result.error);
  }
  if (result.status === 500) {
    return {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: result.error }),
    };
  }
  return unauthorizedResponse(result.error);
}
