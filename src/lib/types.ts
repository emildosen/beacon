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
  Actor: string; // Who initiated the action (UPN or app name)
  Target: string; // What was affected (UPN for users, displayName for groups)
  TargetType: string; // Type of target resource (User, Group, Role, etc.)
  RuleName: string;
  Severity: string;
  Description: string;
  SourceType: string;
  SourceEventId: string;
  RawEventSummary?: string;
  RawData: string; // Full JSON of the source event
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

// Graph API directory audit log
export interface DirectoryAudit {
  id: string;
  activityDateTime: string;
  activityDisplayName: string;
  additionalDetails?: Array<{ key: string; value: string }>;
  category: string;
  correlationId?: string;
  initiatedBy: {
    user?: {
      id?: string;
      displayName?: string;
      userPrincipalName?: string;
    };
    app?: {
      appId?: string;
      displayName?: string;
      servicePrincipalId?: string;
    };
  };
  loggedByService?: string;
  operationType?: string;
  result?: string;
  resultReason?: string;
  targetResources?: Array<{
    id?: string;
    displayName?: string;
    type?: string;
    userPrincipalName?: string;
    modifiedProperties?: Array<{ displayName?: string; oldValue?: string; newValue?: string }>;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

// Graph API risk detection
export interface RiskDetection {
  id: string;
  activity?: string;
  activityDateTime?: string;
  additionalInfo?: string;
  correlationId?: string;
  detectedDateTime?: string;
  detectionTimingType?: string;
  ipAddress?: string;
  location?: {
    city?: string;
    state?: string;
    countryOrRegion?: string;
    geoCoordinates?: {
      latitude?: number;
      longitude?: number;
    };
  };
  requestId?: string;
  riskDetail?: string;
  riskEventType?: string;
  riskLevel?: string;
  riskState?: string;
  source?: string;
  tokenIssuerType?: string;
  userDisplayName?: string;
  userId?: string;
  userPrincipalName?: string;
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
  | 'pending'
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
  createdAt?: string; // ISO timestamp of when the client was added
  retryCount?: number; // Number of verification attempts for pending clients
}

// Alerts configuration
export interface AlertsConfig {
  webhookUrl: string;
  minimumSeverity: Severity;
  enabled: boolean;
}

// Log entry for Beacon_Log_CL table (sync results and system events)
export type LogType = 'sync' | 'system';

export interface LogEntry {
  TimeGenerated: string;
  LogType: LogType;
  ClientTenantId: string;
  ClientTenantName: string;
  Status: string;
  Message: string;
  AuditEvents?: number;
  SignIns?: number;
  SecurityAlerts?: number;
  RiskDetections?: number;
  AlertsGenerated?: number;
  DurationMs?: number;
}

// Severity level ordering for comparison
export const SEVERITY_ORDER: Record<Severity, number> = {
  Low: 1,
  Medium: 2,
  High: 3,
  Critical: 4,
};
