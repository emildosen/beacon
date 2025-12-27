import { Rule, RuleCondition, RuleSource, RuleOperator, AuditEvent, SignInLog, SecurityAlert } from './types.js';
import { getRules } from './config.js';

/**
 * Safely traverses a nested object using dot notation path
 * Supports numeric indices for arrays (e.g., "TargetResources.0.UserPrincipalName")
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (Array.isArray(current)) {
      const index = parseInt(part, 10);
      if (isNaN(index)) {
        return undefined;
      }
      current = current[index];
    } else if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }

  return current;
}

/**
 * Interpolates template variables in a value string.
 * Template syntax: {{path.to.field}} - will be replaced with the value from the event.
 * Example: "{{TargetResources.0.UserPrincipalName}}" becomes the actual UPN from the event.
 */
function interpolateTemplateValue(
  template: string,
  event: Record<string, unknown>
): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_match, path: string) => {
    const value = getNestedValue(event, path.trim());
    return value !== undefined && value !== null ? String(value) : '';
  });
}

/**
 * Checks if a value matches the operator and expected value
 */
function matchesOperator(
  actualValue: unknown,
  operator: RuleOperator,
  expectedValue?: string
): boolean {
  switch (operator) {
    case 'Exists':
      return actualValue !== undefined && actualValue !== null;

    case 'Equals':
      return String(actualValue).toLowerCase() === String(expectedValue).toLowerCase();

    case 'NotEquals':
      return String(actualValue).toLowerCase() !== String(expectedValue).toLowerCase();

    case 'Contains':
      return String(actualValue).toLowerCase().includes(String(expectedValue).toLowerCase());

    default:
      return false;
  }
}

/**
 * Evaluates a single condition against an event
 */
function evaluateCondition(
  event: Record<string, unknown>,
  condition: RuleCondition
): boolean {
  const value = getNestedValue(event, condition.field);

  // Interpolate template variables in the expected value (e.g., {{TargetResources.0.UserPrincipalName}})
  const expectedValue = condition.value !== undefined
    ? interpolateTemplateValue(condition.value, event)
    : undefined;

  return matchesOperator(value, condition.operator, expectedValue);
}

/**
 * Evaluates all conditions against an event based on match mode
 */
function evaluateConditions(
  event: Record<string, unknown>,
  conditions: Rule['conditions']
): boolean {
  const { match, rules } = conditions;

  if (rules.length === 0) {
    return false;
  }

  if (match === 'all') {
    return rules.every((condition) => evaluateCondition(event, condition));
  } else {
    return rules.some((condition) => evaluateCondition(event, condition));
  }
}

/**
 * Checks if any exception matches (returns true if event should be excluded)
 */
function matchesException(
  event: Record<string, unknown>,
  exceptions?: RuleCondition[]
): boolean {
  if (!exceptions || exceptions.length === 0) {
    return false;
  }
  return exceptions.some((exception) => evaluateCondition(event, exception));
}

/**
 * Evaluates an event against all rules for the given source type
 * Returns the first matching rule or null
 * @param tenantId - Optional tenant ID to filter tenant-specific rules
 */
export function evaluateRules(
  event: AuditEvent | SignInLog | SecurityAlert,
  source: RuleSource,
  tenantId?: string
): Rule | null {
  const rules = getRules();
  const eventRecord = event as Record<string, unknown>;

  const applicableRules = rules.filter((rule) => {
    // Skip disabled rules
    if (!rule.enabled) return false;
    // Filter by source type
    if (rule.source !== source) return false;
    // Filter by tenant ID if rule has tenantIds specified
    if (rule.tenantIds && rule.tenantIds.length > 0) {
      if (!tenantId || !rule.tenantIds.includes(tenantId)) return false;
    }
    return true;
  });

  for (const rule of applicableRules) {
    // Evaluate conditions
    if (!evaluateConditions(eventRecord, rule.conditions)) {
      continue;
    }

    // Check exceptions - if any exception matches, skip this rule
    if (matchesException(eventRecord, rule.exceptions)) {
      continue;
    }

    return rule;
  }

  return null;
}

/**
 * Gets the event ID from various event types
 */
export function getEventId(event: AuditEvent | SignInLog | SecurityAlert): string {
  if ('Id' in event) {
    return (event as AuditEvent).Id;
  }
  return (event as SignInLog | SecurityAlert).id;
}

/**
 * Creates a summary of the event for logging
 */
export function getEventSummary(
  event: AuditEvent | SignInLog | SecurityAlert,
  source: RuleSource
): string {
  const maxLength = 500;
  let summary: string;

  switch (source) {
    case 'AuditLog': {
      const audit = event as AuditEvent;
      summary = `Operation: ${audit.Operation}, User: ${audit.UserId}, Workload: ${audit.Workload}`;
      break;
    }
    case 'SignIn': {
      const signIn = event as SignInLog;
      summary = `User: ${signIn.userPrincipalName}, App: ${signIn.appDisplayName}, Risk: ${signIn.riskLevelDuringSignIn}, IP: ${signIn.ipAddress}`;
      break;
    }
    case 'SecurityAlert': {
      const alert = event as SecurityAlert;
      summary = `Title: ${alert.title}, Category: ${alert.category}, Severity: ${alert.severity}`;
      break;
    }
    default:
      summary = JSON.stringify(event);
  }

  return summary.length > maxLength ? summary.substring(0, maxLength) + '...' : summary;
}
