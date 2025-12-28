export interface Client {
  tenantId: string;
  name: string;
  lastPoll?: string;
  status?: 'success' | 'auditLogDisabled' | 'appNotConsented' | 'permissionDenied' | 'tenantNotFound' | 'error';
  statusMessage?: string;
}

export interface AlertsConfig {
  webhookUrl: string;
  minimumSeverity: 'Low' | 'Medium' | 'High' | 'Critical';
  enabled: boolean;
}

export interface RunHistoryEntry {
  startTime: string;
  endTime: string;
  durationMs: number;
  clientsChecked: number;
  eventsProcessed: number;
  alertsGenerated: number;
  status: 'success' | 'partial' | 'error';
  errorMessage?: string;
}
