// Rule types
export type RuleSource = 'AuditLog' | 'SignIn' | 'SecurityAlert';
export type RuleOperator = 'Exists' | 'Equals' | 'Contains' | 'NotEquals';
export type Severity = 'Critical' | 'High' | 'Medium' | 'Low';

export interface Rule {
  name: string;
  source: RuleSource;
  operation?: string;
  propertyPath?: string;
  operator: RuleOperator;
  value?: string;
  severity: Severity;
  description: string;
}

// Alert schema for Log Analytics
export interface Alert {
  TimeGenerated: string;
  TenantId: string;
  TenantName: string;
  RuleName: string;
  Severity: string;
  Description: string;
  SourceType: string;
  SourceEventId: string;
  RawEventSummary?: string;
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

// Client configuration from clients.json
export interface Client {
  name: string;
  tenantId: string;
  lastPoll?: string; // ISO timestamp of last successful poll
}
