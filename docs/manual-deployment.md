# Manual Deployment

### Prerequisites

- Azure subscription
- Multi-tenant Entra ID app registration with admin consent

## Step 1: App Registration

1. Entra ID → App registrations → New registration
2. Configure:
   - Name, e.g. `Beacon`
   - Supported account types: Accounts in any organizational directory (Multitenant)
   - Redirect URI: Leave blank
3. Create

### Note these values

| Value | Location |
|-------|----------|
| Application (client) ID | Overview |
| Directory (tenant) ID | Overview |

### Add client secret

1. Certificates & secrets → Client secrets → New client secret
2. Description: `Beacon Azure Function`
3. Expiry: 6 months
4. Add
5. Copy the Value immediately, you won't see it again

### Add API permissions

**Microsoft Graph (Application permissions):**

| Permission | Purpose |
|------------|---------|
| AuditLog.Read.All | Sign-in logs |
| SecurityAlert.Read.All | Defender alerts |
| IdentityRiskEvent.Read.All | Identity Protection |
| Directory.Read.All | Resolve user/group details |

**Office 365 Management APIs (Application permissions):**

1. Add a permission → APIs my organization uses
2. Search: `Office 365 Management APIs`
3. Application permissions:

| Permission | Purpose |
|------------|---------|
| ActivityFeed.Read | Audit logs |
| ActivityFeed.ReadDlp | DLP events |

### Grant admin consent

1. API permissions → Grant admin consent for [tenant name]
2. Confirm

## Step 2: Log Analytics Workspace

1. Azure Portal → Log Analytics workspaces → Create
2. Configure:
   - Subscription: (your sub)
   - Resource group, e.g. `rg-beacon`
   - Name, e.g. `law-beacon`
   - Region: (pick a region close by)
3. Review + Create

### Note these values

| Value | Location |
|-------|----------|
| Workspace ID | Overview |
| Resource ID | Properties → Resource ID |

## Step 3: Data Collection Endpoint (DCE)

1. Azure Portal → Monitor → Data Collection Endpoints → Create
2. Configure:
   - Name, e.g. `dce-beacon`
   - Subscription: (your sub)
   - Resource group: Same as Log Analytics workspace
   - Region: Same as Log Analytics workspace
3. Create

### Note this value

| Value | Location |
|-------|----------|
| Logs Ingestion URI | Overview |

## Step 4: Custom Table and Data Collection Rule (DCR)

1. Azure Portal → Log Analytics workspace → Tables → Create → New custom log (DCR-based)
2. Configure:
   - Table name: `Beacon_Alerts` (becomes `Beacon_Alerts_CL`)
   - Data collection endpoint: Select DCE created in Step 3
   - Data collection rule name, e.g. `dcr-beacon-alerts`
3. Next: Upload sample.json to define schema
4. Review transformation (default is fine)
5. Create

## Step 5: Grant App Permission to DCR

1. Open the DCR just created (`dcr-beacon-alerts`)
2. Go to Access control (IAM) → Add role assignment
3. Role: `Monitoring Metrics Publisher`
4. Next → User, group, or service principal → Select members → Search for the app registration (`Beacon`)
5. Select → Review + assign

### Note these values

| Value | Location |
|-------|----------|
| Immutable ID | Overview → Immutable Id |
| Stream name | Configuration → Data sources → `Data source` column |

Stream name should be: `Custom-Beacon_Alerts_CL`

## Step 6: Storage Account

Used for Azure Functions runtime and alert deduplication.

1. Azure Portal → Storage accounts → Create
2. Configure:
   - Subscription: (your sub)
   - Resource group: Same as Log Analytics workspace
   - Storage account name, e.g. `stbeacon` (must be globally unique)
   - Region: Same as Log Analytics workspace
   - Performance: Standard
   - Redundancy: LRS
3. Review + Create

### Get connection string

1. Open storage account → Access keys
2. Copy **Connection string** for key1

The following tables are auto-created on first run:
- `AlertDedup` - 5-minute window for duplicate log suppression
- `NotificationState` - 1-hour window for notification throttling

## Step 7: Function App

1. Azure Portal → Function App → Create
2. Configure:
   - Subscription: (your sub)
   - Resource group: Same as Log Analytics workspace
   - Function App name, e.g. `func-beacon` (must be globally unique)
   - Runtime stack: Node.js
   - Version: 20 LTS
   - Region: Same as Log Analytics workspace
   - Operating System: Linux
   - Plan type: Consumption (Serverless)
3. Review + Create

### Configure app settings

1. Open Function App → Configuration → Application settings
2. Add these:

| Name | Value |
|------|-------|
| TENANT_ID | (your MSP tenant ID) |
| CLIENT_ID | (app registration client ID) |
| CLIENT_SECRET | (app registration secret) |
| LOG_ANALYTICS_ENDPOINT | (DCE Logs Ingestion URI) |
| LOG_ANALYTICS_RULE_ID | (DCR Immutable ID) |
| LOG_ANALYTICS_STREAM | Custom-Beacon_Alerts_CL |
| AZURE_STORAGE_CONNECTION_STRING | (storage account connection string) |

3. Save

> **Note:** `AzureWebJobsStorage` is created automatically when you create the Function App and link a storage account. It's required for the Functions runtime. `AZURE_STORAGE_CONNECTION_STRING` is a separate setting used by Beacon for alert deduplication tables.

## Step 8: Admin Consent for Client Tenants

Generate consent URL for each client:

```
https://login.microsoftonline.com/{client-tenant-id}/adminconsent?client_id={your-app-client-id}
```

Open the consent URL, sign in with Global Admin, and approve to the permissions.
You'll get a redirect URL error, but the app consent will still work.

## Verify Setup

Run the Function locally or trigger manually. Wait 2-3 minutes, then query:

```kusto
Beacon_Alerts_CL
| order by TimeGenerated desc
| take 10
```
