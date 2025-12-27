# Beacon - Azure Setup Guide

## Step 1: App Registration

1. Entra ID → App registrations → New registration
2. Configure:
   - Name: `Beacon`
   - Supported account types: Accounts in any organizational directory (Multitenant)
   - Redirect URI: Leave blank
3. Create

### Note these values

| Value | Location | Example |
|-------|----------|---------|
| Application (client) ID | Overview | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` |
| Directory (tenant) ID | Overview | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` |

### Add client secret

1. Certificates & secrets → Client secrets → New client secret
2. Description: `Beacon POC`
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
| ActivityFeed.ReadDlp | DLP events (optional) |

### Grant admin consent

1. API permissions → Grant admin consent for {tenant}
2. Confirm

---

## Step 2: Resource Group

1. Azure Portal → Resource groups → Create
2. Configure:
   - Subscription: (your sub)
   - Resource group: `rg-beacon`
   - Region: (your preferred)
3. Create

---

## Step 3: Log Analytics Workspace

1. Azure Portal → Log Analytics workspaces → Create
2. Configure:
   - Subscription: (your sub)
   - Resource group: `rg-beacon`
   - Name: `law-beacon`
   - Region: (same as resource group)
3. Review + Create

### Note these values

| Value | Location |
|-------|----------|
| Workspace ID | Overview |
| Resource ID | Properties → Resource ID |

---

## Step 4: Data Collection Endpoint (DCE)

1. Azure Portal → Monitor → Data Collection Endpoints → Create
2. Configure:
   - Name: `dce-beacon`
   - Subscription: (your sub)
   - Resource group: `rg-beacon`
   - Region: **Same as Log Analytics workspace**
3. Create

### Note this value

| Value | Location | Example |
|-------|----------|---------|
| Logs Ingestion URI | Overview | `https://dce-beacon-xxxx.eastus-1.ingest.monitor.azure.com` |

---

## Step 5: Custom Table and Data Collection Rule (DCR)

1. Azure Portal → Log Analytics workspace → Tables → Create → New custom log (DCR-based)
2. Configure:
   - Table name: `Beacon_Alerts` (becomes `Beacon_Alerts_CL`)
   - Data collection endpoint: Select `dce-beacon`
   - Data collection rule name: `dcr-beacon-alerts`
3. Next: Upload sample.json to define schema
4. Review transformation (default is fine)
5. Create

### Get DCR values

1. Azure Portal → Monitor → Data Collection Rules
2. Open `dcr-beacon-alerts`

| Value | Location |
|-------|----------|
| Immutable ID | Overview → Immutable Id |
| Stream name | Configuration → Data sources → `Data source` column |

Stream name should be: `Custom-Beacon_Alerts_CL`

---

## Step 6: Grant App Permission to DCR

1. Open DCR (`dcr-beacon-alerts`) → Access control (IAM) → Add role assignment
2. Role: `Monitoring Metrics Publisher`
3. Next → User, group, or service principal → Select members → Search for `Beacon` (your app registration)
4. Select → Review + assign

---

## Step 7: Storage Account (for Function App and Alert Deduplication)

1. Azure Portal → Storage accounts → Create
2. Configure:
   - Subscription: (your sub)
   - Resource group: `rg-beacon`
   - Storage account name: `stbeacon` (must be globally unique)
   - Region: (same as other resources)
   - Performance: Standard
   - Redundancy: LRS (cheapest)
3. Review + Create

This storage account is used for:
- Azure Functions runtime (required)
- Alert deduplication state (Table Storage)

### Get connection string

1. Open storage account → Access keys
2. Copy **Connection string** for key1

The following tables are auto-created on first run:
- `AlertDedup` - 5-minute window for duplicate log suppression
- `NotificationState` - 1-hour window for notification throttling

---

## Step 8: Function App

1. Azure Portal → Function App → Create
2. Configure:
   - Subscription: (your sub)
   - Resource group: `rg-beacon`
   - Function App name: `func-beacon` (must be globally unique)
   - Runtime stack: Node.js
   - Version: 20 LTS
   - Region: (same as other resources)
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
| AZURE_STORAGE_CONNECTION_STRING | (storage account connection string from Step 7) |

3. Save

> **Note:** The `AzureWebJobsStorage` setting (created automatically) uses the same storage account but is for the Functions runtime. `AZURE_STORAGE_CONNECTION_STRING` is used by Beacon for alert deduplication tables.

---

## Step 9: Teams Webhook (Optional)

1. Teams → Select channel for alerts
2. Channel settings → Connectors → Incoming Webhook
3. Configure:
   - Name: `Beacon Alerts`
   - Upload icon (optional)
4. Create → Copy webhook URL
5. Add to Function App settings:

| Name | Value |
|------|-------|
| TEAMS_WEBHOOK_URL | (webhook URL) |

---

## Step 10: Admin Consent for Client Tenants

Generate consent URL for each client:

```
https://login.microsoftonline.com/{client-tenant-id}/adminconsent?client_id={your-app-client-id}&redirect_uri=https://localhost
```

Have client Global Admin open link and approve.

---

## Verify Setup

### Test Log Analytics ingestion

Run the Function locally or trigger manually. Wait 2-3 minutes, then query:

```kusto
Beacon_Alerts_CL
| order by TimeGenerated desc
| take 10
```

