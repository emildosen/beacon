# Beacon

Beacon is an Azure Functions app that polls Microsoft 365 APIs for security events, evaluates them against configurable rules, and writes alerts to Azure Log Analytics. Designed for MSPs managing multiple Microsoft 365 tenants.

### Technical Highlights

#### Federated authentication with zero secrets
Uses managed identity with a federated credential to authenticate as the multi-tenant app registration. No client secrets to manage or rotate. Managed identity is also used for all Azure resource access (storage, Log Analytics, DCR).

#### No infrastructure in client tenants
Client tenants only need to grant admin consent. No agents, no app registrations, no configuration on their side.

#### Single Bicep deployment
One `az deployment sub create` provisions everything: resource group, Function App, App Registration (via the Microsoft Graph Bicep extension), Log Analytics workspace, custom tables, data collection rule, storage, RBAC role assignments, Application Insights, and an Azure Monitor workbook.

#### Self-service client onboarding
Admins click a consent URL and Beacon handles the rest. Tenants are added in a pending state and verified against the Graph API on a retry schedule before activation. Tenants that fail verification are automatically removed.

#### Declarative JSON rules engine
Rules are JSON files with conditions, exceptions, MITRE ATT&CK mappings, template interpolation, and optional per-tenant scoping. Bundled rules sync to blob storage on first run but never overwrite user customizations.

#### Dual API strategy
Graph API for near real-time Azure AD audit events and Identity Protection risk detections. Management Activity API for Exchange, SharePoint, and Compliance events. Directory audits are normalized so one set of rules covers both sources.

#### Flex Consumption hosting
Azure Functions Flex Consumption plan on Node 22. Scales to zero, pay per execution, polls every 5 minutes.

#### Built-in observability
Alerts and sync logs are written to two custom Log Analytics tables via data collection rules. An Azure Monitor workbook is deployed automatically with Bicep.

### Documentation
See the full documentation here: [beacon365.dev](https://beacon365.dev)