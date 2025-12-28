import { getMsalInstance, getLoginRequest, apiUrl } from './auth';
import type { Client, AlertsConfig, RunHistoryEntry } from './types';

async function getAccessToken(): Promise<string> {
  const msalInstance = getMsalInstance();
  const accounts = msalInstance.getAllAccounts();
  if (accounts.length === 0) {
    throw new Error('No authenticated user');
  }

  const response = await msalInstance.acquireTokenSilent({
    ...getLoginRequest(),
    account: accounts[0],
  });

  return response.accessToken;
}

async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await getAccessToken();

  const response = await fetch(`${apiUrl}/api${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      getMsalInstance().loginRedirect(getLoginRequest());
      throw new Error('Session expired');
    }
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

export const api = {
  clients: {
    list: () => apiRequest<Client[]>('/clients'),
    create: (data: { tenantId: string; name: string }) =>
      apiRequest<Client>('/clients', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (tenantId: string, data: { name: string }) =>
      apiRequest<Client>(`/clients/${tenantId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (tenantId: string) =>
      apiRequest<void>(`/clients/${tenantId}`, { method: 'DELETE' }),
  },

  alertsConfig: {
    get: () => apiRequest<AlertsConfig>('/alerts-config'),
    update: (data: Partial<AlertsConfig>) =>
      apiRequest<AlertsConfig>('/alerts-config', {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
  },

  runs: {
    list: (limit = 50) => apiRequest<RunHistoryEntry[]>(`/runs?limit=${limit}`),
  },
};
