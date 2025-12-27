# Overview

Beacon is an Azure Functions app that polls Microsoft 365 APIs for security events, evaluates them against configurable rules, and writes alerts to Azure Log Analytics. Designed for MSPs managing multiple Microsoft 365 tenants.

This is a self-hosted solution that lives in your own tenant. Every tenant you wish to monitor must consent to the app registration you create.

## Tech Stack

- Azure Functions
- Azure Log Analytics with Data Collection Rules
- Azure Table Storage for state management
- Microsoft Graph API
- Office 365 Management Activity API

## Data Flow

1. **Timer Trigger** - Azure Function runs every 5 minutes
2. **Multi-Tenant Polling** - For each client in `clients.json`, fetches events from Microsoft APIs since last successful poll
3. **Rule Evaluation** - Each event is evaluated against rules in `/rules/*.yaml`
4. **Alert Deduplication** - 5-minute window prevents duplicate alerts for same user/rule/tenant
5. **Notification Throttling** - 1-hour window throttles notifications (Critical severity always bypasses)
6. **Alert Ingestion** - Matched events written to Azure Log Analytics custom table

## Data Sources

| Source | API | Description |
|--------|-----|-------------|
| Sign-in Logs | Microsoft Graph | Authentication events, risk detections, conditional access results |
| Security Alerts | Microsoft Graph | Defender for Endpoint/Identity/O365, Entra ID Protection |
| Audit Logs | O365 Management API | Admin activity, mailbox access, SharePoint/OneDrive events |

## Rule Engine

Rules are YAML files stored in `/rules/`. Each rule specifies:

- **Source** - Which API to evaluate (`SignIn`, `SecurityAlert`, `AuditLog`)
- **Conditions** - Field/operator/value matching with `all` or `any` logic
- **Exceptions** - Conditions that suppress the rule
- **Severity** - `Critical`, `High`, `Medium`, `Low`
- **MITRE ATT&CK** - Optional tactic/technique mapping

See [Rules](./rules/) for rule syntax and examples.

## Alert Deduplication

Beacon uses Azure Table Storage to track alert state across invocations:

| Layer | Window | Purpose |
|-------|--------|---------|
| Alert Dedup | 5 minutes | Suppress duplicate Log Analytics entries for same tenant + rule + user |
| Notification Throttle | 1 hour | Reduce Teams noise for recurring alerts (Critical bypasses) |

## Multi-Tenant Support

Beacon uses a single multi-tenant Entra ID app registration in your home tenant. Client tenants grant admin consent to this app, allowing Beacon to poll their Microsoft APIs.

- **clients.json** - Array of tenant configs with name, tenantId, and lastPoll timestamp
- **Sequential Processing** - Tenants processed one at a time to respect API rate limits
- **Fault Isolation** - Failures in one tenant don't affect others; lastPoll not updated on failure
