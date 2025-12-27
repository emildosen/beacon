import {
  ClientSecretCredential,
  ClientAssertionCredential,
  ManagedIdentityCredential,
  AccessToken,
  TokenCredential,
} from '@azure/identity';

let mspCredentialInstance: TokenCredential | null = null;
let msiCredentialInstance: ManagedIdentityCredential | null = null;
const clientCredentials = new Map<string, TokenCredential>();

function useFederatedAuth(): boolean {
  return !process.env.CLIENT_SECRET;
}

function getMsiCredential(): ManagedIdentityCredential {
  if (!msiCredentialInstance) {
    msiCredentialInstance = new ManagedIdentityCredential();
  }
  return msiCredentialInstance;
}

/**
 * Credential for MSP's Azure tenant (Log Analytics)
 * Uses client secret if available, otherwise federated auth via managed identity
 */
export function getMspCredential(): TokenCredential {
  if (!mspCredentialInstance) {
    const tenantId = process.env.TENANT_ID;
    const clientId = process.env.CLIENT_ID;

    if (!tenantId || !clientId) {
      throw new Error('Missing required environment variables: TENANT_ID, CLIENT_ID');
    }

    if (useFederatedAuth()) {
      const msi = getMsiCredential();
      mspCredentialInstance = new ClientAssertionCredential(
        tenantId,
        clientId,
        async () => (await msi.getToken('api://AzureADTokenExchange')).token
      );
    } else {
      mspCredentialInstance = new ClientSecretCredential(tenantId, clientId, process.env.CLIENT_SECRET!);
    }
  }
  return mspCredentialInstance;
}

/**
 * Credential for a specific client tenant (Graph API, Management API)
 * Uses cached credentials per tenant
 * Uses client secret if available, otherwise federated auth via managed identity
 */
export function getClientCredential(tenantId: string): TokenCredential {
  let credential = clientCredentials.get(tenantId);
  if (!credential) {
    const clientId = process.env.CLIENT_ID;

    if (!clientId) {
      throw new Error('Missing required environment variable: CLIENT_ID');
    }

    if (useFederatedAuth()) {
      const msi = getMsiCredential();
      credential = new ClientAssertionCredential(
        tenantId,
        clientId,
        async () => (await msi.getToken('api://AzureADTokenExchange')).token
      );
    } else {
      credential = new ClientSecretCredential(tenantId, clientId, process.env.CLIENT_SECRET!);
    }
    clientCredentials.set(tenantId, credential);
  }
  return credential;
}

export async function getGraphToken(tenantId: string): Promise<AccessToken> {
  const credential = getClientCredential(tenantId);
  const token = await credential.getToken('https://graph.microsoft.com/.default');
  if (!token) {
    throw new Error(`Failed to acquire Graph token for tenant ${tenantId}`);
  }
  return token;
}

export async function getManagementApiToken(tenantId: string): Promise<AccessToken> {
  const credential = getClientCredential(tenantId);
  const token = await credential.getToken('https://manage.office.com/.default');
  if (!token) {
    throw new Error(`Failed to acquire Management API token for tenant ${tenantId}`);
  }
  return token;
}
