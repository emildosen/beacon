/**
 * Office 365 Management Activity API client
 *
 * Endpoints:
 * - Start subscription: POST https://manage.office.com/api/v1.0/{tenantId}/activity/feed/subscriptions/start?contentType={type}
 * - List content: GET https://manage.office.com/api/v1.0/{tenantId}/activity/feed/subscriptions/content?contentType={type}&startTime={start}&endTime={end}
 * - Fetch content blob: GET {contentUri}
 *
 * Content types: Audit.AzureActiveDirectory, Audit.Exchange, Audit.SharePoint, Audit.General
 */

import { InvocationContext } from '@azure/functions';
import { getManagementApiToken } from './auth.js';
import { AuditEvent, ContentBlob } from './types.js';

const BASE_URL = 'https://manage.office.com/api/v1.0';

const CONTENT_TYPES = [
  'Audit.AzureActiveDirectory',
  'Audit.Exchange',
  'Audit.SharePoint',
  'Audit.General',
] as const;

type ContentType = (typeof CONTENT_TYPES)[number];

/**
 * Fetches audit events from the O365 Management Activity API
 *
 * 1. Ensures subscriptions are started (idempotent)
 * 2. Lists available content blobs for time window
 * 3. Fetches each content blob
 */
export async function getAuditEvents(
  tenantId: string,
  since: Date,
  context: InvocationContext
): Promise<AuditEvent[]> {
  const events: AuditEvent[] = [];
  const now = new Date();

  let token: string;
  try {
    const tokenResponse = await getManagementApiToken(tenantId);
    token = tokenResponse.token;
  } catch (error) {
    const errorStr = String(error);
    if (errorStr.includes('AADSTS7000229') || errorStr.includes('missing service principal')) {
      context.warn(`[${tenantId}] Management API: App not consented in tenant - admin must grant consent`);
    } else if (errorStr.includes('invalid_client')) {
      context.warn(`[${tenantId}] Management API: Authentication failed - check app credentials`);
    } else {
      context.error(`[${tenantId}] Management API: Failed to get token:`, error);
    }
    return [];
  }

  // Ensure subscriptions are active for all content types
  // Only need to check the first one - if tenant doesn't exist, skip all
  for (const contentType of CONTENT_TYPES) {
    const result = await startSubscription(tenantId, contentType, token);
    if (result.skipTenant) {
      return []; // Tenant not configured for audit logging
    }
    if (!result.success) {
      context.warn(`[${tenantId}] Subscription not active for ${contentType}`);
    }
  }

  // Fetch content from all content types in parallel
  const contentPromises = CONTENT_TYPES.map(async (contentType) => {
    try {
      const blobs = await listContent(tenantId, contentType, since, now, token);
      context.log(`Found ${blobs.length} content blobs for ${contentType}`);

      // Fetch each blob (sequentially to avoid rate limiting)
      const typeEvents: AuditEvent[] = [];
      for (const blob of blobs) {
        const blobEvents = await fetchContentBlob(blob.contentUri, token);
        typeEvents.push(...blobEvents);
      }
      return typeEvents;
    } catch (error) {
      context.error(`Error fetching ${contentType}:`, error);
      return [];
    }
  });

  const results = await Promise.all(contentPromises);
  for (const result of results) {
    events.push(...result);
  }

  context.log(`Fetched ${events.length} total audit events from Management API`);
  return events;
}

/**
 * Starts a subscription for a content type (idempotent)
 * Returns true if subscription is active, false if failed
 */
async function startSubscription(
  tenantId: string,
  contentType: ContentType,
  token: string
): Promise<{ success: boolean; skipTenant?: boolean }> {
  const url = `${BASE_URL}/${tenantId}/activity/feed/subscriptions/start?contentType=${contentType}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  // 200 = newly started, AF20024 error = already enabled (both are success)
  if (response.ok) {
    return { success: true };
  }

  const body = await response.text();

  // Already enabled - this is fine
  if (body.includes('AF20024')) {
    return { success: true };
  }

  // Tenant doesn't have audit logging enabled - skip entire tenant
  if (body.includes('does not exist') || body.includes('Tenant') && body.includes('not exist')) {
    console.warn(`[${tenantId}] Audit logging not enabled for tenant - enable in M365 compliance center`);
    return { success: false, skipTenant: true };
  }

  console.error(`[${tenantId}] Failed to start ${contentType} subscription: ${response.status}`);
  return { success: false };
}

/**
 * Lists available content blobs for a time window
 * Handles pagination via NextPageUri header
 */
async function listContent(
  tenantId: string,
  contentType: ContentType,
  startTime: Date,
  endTime: Date,
  token: string
): Promise<ContentBlob[]> {
  const blobs: ContentBlob[] = [];

  // Format times as ISO strings (API requires this format)
  const start = startTime.toISOString();
  const end = endTime.toISOString();

  let nextUrl: string | null =
    `${BASE_URL}/${tenantId}/activity/feed/subscriptions/content?contentType=${contentType}&startTime=${start}&endTime=${end}`;

  while (nextUrl) {
    const currentUrl = nextUrl;
    nextUrl = null;

    const response: Response = await fetch(currentUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      // 404 typically means no content available (not an error)
      if (response.status === 404) {
        break;
      }
      const body = await response.text();
      console.error(`Failed to list content for ${contentType}: ${response.status} ${body}`);
      break;
    }

    const data: ContentBlob[] = await response.json();
    blobs.push(...data);

    // Check for pagination via NextPageUri header
    nextUrl = response.headers.get('NextPageUri');
  }

  return blobs;
}

/**
 * Fetches a content blob and returns the audit records
 */
async function fetchContentBlob(contentUri: string, token: string): Promise<AuditEvent[]> {
  const response = await fetch(contentUri, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    console.error(`Failed to fetch content blob: ${response.status} ${body}`);
    return [];
  }

  return response.json();
}
