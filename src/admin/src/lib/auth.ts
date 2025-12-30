import { Configuration, PublicClientApplication } from '@azure/msal-browser';

interface AuthConfig {
  clientId: string;
  tenantId: string;
}

let msalInstance: PublicClientApplication | null = null;
let authConfig: AuthConfig | null = null;

/**
 * Fetch auth configuration from the Function App and initialize MSAL.
 * Must be called before rendering the app.
 */
export async function initializeAuth(): Promise<void> {
  // Fetch config from the Function App
  const response = await fetch('/api/auth-config');

  if (!response.ok) {
    throw new Error('Failed to fetch auth configuration');
  }

  authConfig = await response.json();

  const msalConfig: Configuration = {
    auth: {
      clientId: authConfig!.clientId,
      authority: `https://login.microsoftonline.com/${authConfig!.tenantId}`,
      redirectUri: window.location.origin + '/portal/',
    },
    cache: {
      cacheLocation: 'sessionStorage',
      storeAuthStateInCookie: false,
    },
  };

  msalInstance = new PublicClientApplication(msalConfig);
  await msalInstance.initialize();
}

/**
 * Get the MSAL instance. Throws if not initialized.
 */
export function getMsalInstance(): PublicClientApplication {
  if (!msalInstance) {
    throw new Error('MSAL not initialized. Call initializeAuth() first.');
  }
  return msalInstance;
}

/**
 * Get the login request configuration.
 */
export function getLoginRequest() {
  if (!authConfig) {
    throw new Error('Auth not initialized. Call initializeAuth() first.');
  }
  return {
    scopes: [`${authConfig.clientId}/.default`],
  };
}

// API URL is empty since we're on the same origin
export const apiUrl = '';
