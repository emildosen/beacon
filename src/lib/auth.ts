import { ClientSecretCredential, AccessToken } from '@azure/identity';

let mspCredentialInstance: ClientSecretCredential | null = null;
const clientCredentials = new Map<string, ClientSecretCredential>();

/**
 * Credential for MSP's Azure tenant (Log Analytics)
 */
export function getMspCredential(): ClientSecretCredential {
  if (!mspCredentialInstance) {
    const tenantId = process.env.TENANT_ID;
    const clientId = process.env.CLIENT_ID;
    const clientSecret = process.env.CLIENT_SECRET;

    if (!tenantId || !clientId || !clientSecret) {
      throw new Error('Missing required environment variables: TENANT_ID, CLIENT_ID, CLIENT_SECRET');
    }

    mspCredentialInstance = new ClientSecretCredential(tenantId, clientId, clientSecret);
  }
  return mspCredentialInstance;
}

/**
 * Credential for a specific client tenant (Graph API, Management API)
 * Uses cached credentials per tenant
 */
export function getClientCredential(tenantId: string): ClientSecretCredential {
  let credential = clientCredentials.get(tenantId);
  if (!credential) {
    const clientId = process.env.CLIENT_ID;
    const clientSecret = process.env.CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error('Missing required environment variables: CLIENT_ID, CLIENT_SECRET');
    }

    console.log(`Creating client credential for tenant: ${tenantId}`);
    credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
    clientCredentials.set(tenantId, credential);
  }
  return credential;
}

export async function getGraphToken(tenantId: string): Promise<AccessToken> {
  const credential = getClientCredential(tenantId);
  return credential.getToken('https://graph.microsoft.com/.default');
}

export async function getManagementApiToken(tenantId: string): Promise<AccessToken> {
  const credential = getClientCredential(tenantId);
  return credential.getToken('https://manage.office.com/.default');
}
