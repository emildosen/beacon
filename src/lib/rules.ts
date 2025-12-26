import { Rule, RuleSource, AuditEvent, SignInLog, SecurityAlert } from './types.js';
import { getRules } from './config.js';

/**
 * Safely traverses a nested object using dot notation path
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

/**
 * Checks if a value matches the rule's operator and expected value
 */
function matchesOperator(
  actualValue: unknown,
  operator: Rule['operator'],
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
 * Evaluates an event against all rules for the given source type
 * Returns the first matching rule or null
 */
export function evaluateRules(
  event: AuditEvent | SignInLog | SecurityAlert,
  source: RuleSource
): Rule | null {
  const rules = getRules();
  const applicableRules = rules.filter((rule) => rule.source === source);

  for (const rule of applicableRules) {
    // For AuditLog events, check operation match first
    if (source === 'AuditLog' && rule.operation) {
      const auditEvent = event as AuditEvent;
      if (auditEvent.Operation !== rule.operation) {
        continue;
      }
    }

    // If there's a property path, check it
    if (rule.propertyPath) {
      const value = getNestedValue(event as Record<string, unknown>, rule.propertyPath);
      if (matchesOperator(value, rule.operator, rule.value)) {
        return rule;
      }
    } else {
      // No property path - just check if the rule's operator condition is met
      // For 'Exists' with no path, it means the event existing + operation match is enough
      if (rule.operator === 'Exists') {
        return rule;
      }
    }
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
