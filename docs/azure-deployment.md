# Azure Deployment

This guide walks you through deploying Beacon to Azure using an automated template. The template creates all required resources in one go.

## What Gets Created

The deployment template creates:

| Resource | Purpose |
|----------|---------|
| Resource Group | Container for all Beacon resources |
| App Registration | Multi-tenant app for accessing client M365 data |
| Function App | Runs the Beacon polling service |
| App Service Plan | Hosting plan for the Function App |
| Storage Account | Required by Azure Functions and alert deduplication |
| Federated Credential | Secure authentication (no secrets needed) |
| Log Analytics Workspace | Stores alerts for querying and dashboards |
| Application Insights | Function App logging and monitoring |
| Data Collection Endpoint | Ingestion endpoint for Log Analytics |
| Data Collection Rule | Routes alerts to the custom table |
| Custom Table (Beacon_Alerts_CL) | Schema for alert data |
| Role Assignment | Allows Function App to write to Log Analytics |
| Static Web App | Admin portal for managing clients and configuration |
| Admin App Registration | Authentication for the admin portal (single-tenant) |
| Security Group | Controls access to the admin portal ("Beacon Admins") |

## Prerequisites

Before you begin, you'll need:

- **Azure subscription** with permission to create resources
- **Admin role in Entra ID** with permission to create app registrations and groups
- **Azure CLI** installed ([Download here](https://learn.microsoft.com/en-us/cli/azure/install-azure-cli))
- **Bicep CLI** installed (run `az bicep install` if not already installed)

## Step 1: Download the Template

Download both template files from the repository:

- [`beacon.bicep`](https://github.com/emildosen/beacon/blob/main/infra/beacon.bicep) - Main deployment file
- [`beacon-resources.bicep`](https://github.com/emildosen/beacon/blob/main/infra/beacon-resources.bicep) - Resource definitions

Save both files to the same folder on your computer.

::: tip
You can also clone the entire repository:
```bash
git clone https://github.com/emildosen/beacon.git
cd beacon/infra
```
:::

## Step 2: Sign In to Azure

Open a terminal and sign in:

```bash
az login
```

A browser window will open. Sign in with your Azure account. If you have multiple subscriptions, you'll be asked to select one after authenticating.

## Step 3: Deploy

Run the deployment command, replacing the location with your preferred Azure region:

```bash
az deployment sub create \
  --location australiaeast \
  --template-file beacon.bicep
```

::: info Available Regions
Common regions include: `australiaeast`, `northeurope`, `westeurope`, `eastus`, `westus2`, `uksouth`, `southeastasia`.

For a full list, run: `az account list-locations -o table`
:::

### Deployment Parameters

You can customise the deployment with these parameters:

#### Basic Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `resourceGroupName` | `rg-beacon` | Name for the resource group |
| `appName` | `Beacon` | Name used for the app registration and resources |
| `appPlanSku` | `B1` | Hosting plan tier (Y1, EP1, B1) |
| `enableFederatedAuth` | `true` | Enable federated authentication for the Function App managed identity |
| `adminGroupName` | `Beacon Admins` | Name of the security group for admin portal access |

#### Resource Names

Use these parameters to specify custom names for resources, useful when resources already exist or you need specific naming conventions. Leave empty to use auto-generated names. Default patterns use the `appName` parameter (shown below as `{appName}`).

| Parameter | Default | Description |
|-----------|---------|-------------|
| `functionAppName` | `{appName}-func-[6 random]` | Function App name |
| `storageAccountName` | `{appName}[10 random]` | Storage Account name |
| `appServicePlanName` | `{appName}-plan` | App Service Plan name |
| `logAnalyticsWorkspaceName` | `law-{appName}` | Log Analytics Workspace name |
| `dataCollectionEndpointName` | `dce-{appName}` | Data Collection Endpoint name |
| `dataCollectionRuleName` | `dcr-{appName}` | Data Collection Rule name |
| `appInsightsName` | `ai-{appName}` | Application Insights name |
| `staticWebAppName` | `swa-{appName}-[6 random]` | Static Web App name |
| `adminAppName` | `{appName} Admin` | Admin portal app registration name |

**Example with custom values:**

```bash
az deployment sub create \
  --location australiaeast \
  --template-file beacon.bicep \
  --parameters \
    resourceGroupName=rg-beacon-prod \
    appName=BeaconProd
```

**Example with custom resource names:**

```bash
az deployment sub create \
  --location australiaeast \
  --template-file beacon.bicep \
  --parameters \
    resourceGroupName=rg-beacon-prod \
    functionAppName=my-existing-func \
    storageAccountName=myexistingstorage
```

**Example disabling federated auth (for client secret authentication):**

```bash
az deployment sub create \
  --location australiaeast \
  --template-file beacon.bicep \
  --parameters \
    enableFederatedAuth=false
```

### Hosting Plan Options

::: warning Cost Warning
The default `B1` plan costs approximately **$55 USD/month**. This is the recommended option for reliable deployments.
:::

| SKU | Type | Best For |
|-----|------|----------|
| `B1` | Basic | **Recommended.** Reliable builds and consistent performance. |
| `Y1` | Consumption | Lower cost (pay-per-use), but deployment builds may timeout. |
| `EP1` | Elastic Premium | High volume or low-latency requirements. Always warm. |

## Step 4: Note the Outputs

When deployment completes, you'll see output values. Save these for later:

```
Outputs:
  adminConsentUrl: https://login.microsoftonline.com/.../adminconsent?client_id=...
  appRegistrationAppId: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  appRegistrationName: Beacon
  customTableName: Beacon_Alerts_CL
  dataCollectionEndpointUrl: https://dce-beacon-xxxx.australiaeast-1.ingest.monitor.azure.com
  dataCollectionRuleId: dcr-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  dataCollectionRuleName: dcr-beacon-alerts
  functionAppName: beacon-func-xxxxxx
  functionAppUrl: https://beacon-func-xxxxxx.azurewebsites.net
  logAnalyticsWorkspaceId: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  logAnalyticsWorkspaceName: law-beacon
  resourceGroupName: rg-beacon
  storageAccountName: beaconxxxxxxxxxx
  appInsightsName: ai-beacon
  staticWebAppName: swa-beacon-xxxxxx
  staticWebAppUrl: https://xxx-xxx-xxxxxxxxx.azurestaticapps.net
  spaAppRegistrationAppId: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  spaAdminConsentUrl: https://login.microsoftonline.com/.../adminconsent?client_id=...
  adminGroupId: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  adminGroupName: Beacon Admins
```

Key outputs:
- `adminConsentUrl` - Use this to onboard client tenants
- `staticWebAppUrl` - The admin portal URL
- `adminGroupName` - Add users to this group to grant admin portal access

## Step 5: Grant Admin Consent

The app registrations are created with the required permissions, but admin consent must still be granted.

### For the multi-tenant app (client monitoring)

This grants permissions to access client M365 data.

**For your own tenant** (optional, only if you want to monitor your own tenant):

1. Open the `adminConsentUrl` from the deployment outputs
2. Sign in with a Global Administrator account
3. Review the permissions and click **Accept**

**For client tenants:**

For each client tenant you want to monitor:

1. Replace the tenant ID in the consent URL:
   ```
   https://login.microsoftonline.com/{client-tenant-id}/adminconsent?client_id={app-client-id}
   ```
2. Send this URL to the client's Global Administrator
3. They sign in and accept the permissions

::: warning Expected Behaviour
After granting consent, you'll see an error page. This is expected, the app has no redirect URL configured, so the browser has nowhere to go. The consent itself was granted successfully.
:::

### For the admin portal app

This grants permissions for the admin portal authentication:

1. Open the `spaAdminConsentUrl` from the deployment outputs
2. Sign in with a Global Administrator account
3. Review the permissions and click **Accept**

## Step 6: Add Users to Admin Group

Only users in the "Beacon Admins" security group can access the admin portal.

1. Open the [Azure Portal](https://portal.azure.com)
2. Navigate to **Microsoft Entra ID** → **Groups**
3. Search for the group name from `adminGroupName` output (default: "Beacon Admins")
4. Click on the group, then go to **Members** → **Add members**
5. Add the users who should have admin access

## Verify Deployment

1. Open the [Azure Portal](https://portal.azure.com)
2. Navigate to **Resource groups** → **rg-beacon** (or your custom name)
3. Confirm all resources are present and healthy

### Check the Function App

1. Open the Function App resource
2. Go to **Functions** in the left menu
3. You should see the `pollAuditLogs` function listed, plus the admin API functions (`clients`, `alertsConfig`, `runs`)

### Check the Admin Portal

1. Open the `staticWebAppUrl` from the deployment outputs
2. Sign in with a user who is a member of the admin group
3. You should see the admin portal (initially a placeholder page)

::: tip
The admin portal auto-deploys from the GitHub repository. After the initial deployment, it may take a few minutes for the portal to be available.
:::

### Verify Alerts

To verify alerts are being ingested (after the function has run):

1. Open the Log Analytics workspace → **Logs**
2. Run this query:
   ```kusto
   Beacon_Alerts_CL
   | take 10
   ```

## Troubleshooting

### Deployment fails with permission error

You need sufficient permissions to:
- Create resource groups in the subscription
- Create app registrations in Entra ID
- Create resources (storage accounts, function apps, etc.)

Try running with an account that has **Owner** or **Contributor** role on the subscription, plus **Application Administrator** in Entra ID.

### Bicep extension error

If you see an error about the Microsoft Graph extension:

```bash
az bicep upgrade
```

The Graph extension requires Bicep version 0.29.0 or later.

### Function App shows no functions

The code is deployed from GitHub. If functions aren't appearing:

1. Open the Function App in Azure Portal
2. Go to **Deployment Center**
3. Check the deployment status and logs

### No data in Log Analytics

If alerts aren't appearing in the `Beacon_Alerts_CL` table:

1. Check the Function App logs for errors
2. Verify the function has run at least once (check **Monitor** in the function)
3. Ensure admin consent was granted for client tenants

### Admin portal shows "Access denied"

If you can't access the admin portal:

1. Verify you've granted admin consent for the SPA app (`spaAdminConsentUrl`)
2. Confirm your user is a member of the admin group ("Beacon Admins")
3. Sign out and sign back in to refresh your token

### Admin portal not loading

If the Static Web App shows an error:

1. Check the Static Web App deployment status in Azure Portal → Static Web Apps → Deployment history
2. The GitHub integration may need to sync - wait a few minutes after initial deployment
3. Verify the repository is accessible at https://github.com/emildosen/beacon

## Updating Beacon

To update to the latest version:

1. Open the Function App in Azure Portal
2. Go to **Deployment Center**
3. Click **Sync** to pull the latest code from GitHub

## Clean Up

To remove all Beacon resources:

```bash
az group delete --name rg-beacon --yes
```

::: danger Warning
This deletes all resources in the resource group, including any data in the storage account. The following are **not** deleted automatically and must be removed manually from Entra ID if needed:

- App registration (multi-tenant, for client monitoring)
- Admin app registration (single-tenant, for admin portal)
- Security group ("Beacon Admins")
:::
