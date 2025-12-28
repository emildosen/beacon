// Rule types
export type RuleSource = 'AuditLog' | 'SignIn' | 'SecurityAlert';
export type RuleOperator = 'Exists' | 'Equals' | 'Contains' | 'NotEquals';
export type Severity = 'Critical' | 'High' | 'Medium' | 'Low';

export interface RuleCondition {
  field: string;
  operator: RuleOperator;
  value?: string;
}

export interface Rule {
  id: string; // Derived from file path (e.g., "identity/admin-role-assigned")
  name: string;
  description: string;
  severity: Severity;
  enabled: boolean;

  mitre?: {
    tactic?: string;
    technique?: string;
    subtechnique?: string;
  };

  source: RuleSource;
  conditions: {
    match: 'all' | 'any';
    rules: RuleCondition[];
  };

  exceptions?: RuleCondition[];

  meta?: {
    author?: string;
    created?: string;
    references?: string[];
  };

  tenantIds?: string[]; // Optional: limit rule to specific client tenant IDs. If omitted, applies to all tenants.
}

// Alert schema for Log Analytics
export interface Alert {
  TimeGenerated: string; // When the source event actually occurred
  TimeProcessed: string; // When Beacon processed the alert
  ClientTenantId: string;
  ClientTenantName: string;
  User: string; // UPN of the user who initiated the action
  RuleName: string;
  Severity: string;
  Description: string;
  SourceType: string;
  SourceEventId: string;
  RawEventSummary?: string;
  ShouldNotify?: boolean; // Whether this alert should trigger Teams notification (used for throttling)
}

// Office 365 Management Activity API audit event
export interface AuditEvent {
  Id: string;
  RecordType: number;
  CreationTime: string;
  Operation: string;
  OrganizationId: string;
  UserType: number;
  UserKey: string;
  Workload: string;
  ResultStatus?: string;
  ObjectId?: string;
  UserId: string;
  ClientIP?: string;
  Parameters?: Record<string, unknown>;
  ExtendedProperties?: Array<{ Name: string; Value: string }>;
  ModifiedProperties?: Array<{ Name: string; NewValue: string; OldValue: string }>;
  [key: string]: unknown;
}

// Graph API sign-in log
export interface SignInLog {
  id: string;
  createdDateTime: string;
  userDisplayName: string;
  userPrincipalName: string;
  userId: string;
  appId: string;
  appDisplayName: string;
  ipAddress: string;
  clientAppUsed: string;
  conditionalAccessStatus: string;
  isInteractive: boolean;
  riskDetail: string;
  riskLevelAggregated: string;
  riskLevelDuringSignIn: string;
  riskState: string;
  riskEventTypes?: string[];
  resourceDisplayName: string;
  resourceId: string;
  status: {
    errorCode: number;
    failureReason?: string;
    additionalDetails?: string;
  };
  location?: {
    city?: string;
    state?: string;
    countryOrRegion?: string;
    geoCoordinates?: {
      latitude?: number;
      longitude?: number;
    };
  };
  deviceDetail?: {
    deviceId?: string;
    displayName?: string;
    operatingSystem?: string;
    browser?: string;
    isCompliant?: boolean;
    isManaged?: boolean;
    trustType?: string;
  };
  [key: string]: unknown;
}

// Graph API security alert (v2)
export interface SecurityAlert {
  id: string;
  alertWebUrl: string;
  assignedTo?: string;
  category: string;
  classification?: string;
  createdDateTime: string;
  description: string;
  detectionSource: string;
  detectorId: string;
  determination?: string;
  evidence?: Array<{
    '@odata.type': string;
    createdDateTime: string;
    verdict: string;
    remediationStatus: string;
    [key: string]: unknown;
  }>;
  firstActivityDateTime: string;
  incidentId: string;
  incidentWebUrl: string;
  lastActivityDateTime: string;
  lastUpdateDateTime: string;
  mitreTechniques?: string[];
  providerAlertId: string;
  recommendedActions?: string;
  resolvedDateTime?: string;
  serviceSource: string;
  severity: string;
  status: string;
  tenantId: string;
  threatDisplayName?: string;
  threatFamilyName?: string;
  title: string;
  [key: string]: unknown;
}

// Management API content blob reference
export interface ContentBlob {
  contentUri: string;
  contentId: string;
  contentType: string;
  contentCreated: string;
  contentExpiration: string;
}

// Generic paginated response from Graph
export interface GraphPagedResponse<T> {
  '@odata.context'?: string;
  '@odata.nextLink'?: string;
  value: T[];
}

// Client status after poll
export type ClientStatus =
  | 'success'
  | 'auditLogDisabled'
  | 'appNotConsented'
  | 'permissionDenied'
  | 'tenantNotFound'
  | 'error';

// Client configuration
export interface Client {
  name: string;
  tenantId: string;
  lastPoll?: string; // ISO timestamp of last successful poll
  status?: ClientStatus;
  statusMessage?: string; // Additional error details
}

// Alerts configuration
export interface AlertsConfig {
  webhookUrl: string;
  minimumSeverity: Severity;
  enabled: boolean;
}

// Run history status
export type RunStatus = 'success' | 'partial' | 'error';

// Run history entry
export interface RunHistoryEntry {
  startTime: string; // ISO timestamp
  endTime: string; // ISO timestamp
  durationMs: number;
  clientsChecked: number;
  eventsProcessed: number;
  alertsGenerated: number;
  status: RunStatus;
  errorMessage?: string;
}

// Severity level ordering for comparison
export const SEVERITY_ORDER: Record<Severity, number> = {
  Low: 1,
  Medium: 2,
  High: 3,
  Critical: 4,
};
