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
| Data Collection Endpoint | Ingestion endpoint for Log Analytics |
| Data Collection Rule | Routes alerts to the custom table |
| Custom Table (Beacon_Alerts_CL) | Schema for alert data |
| Role Assignment | Allows Function App to write to Log Analytics |

## Prerequisites

Before you begin, you'll need:

- **Azure subscription** with permission to create resources
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

| Parameter | Default | Description |
|-----------|---------|-------------|
| `resourceGroupName` | `rg-beacon` | Name for the resource group |
| `appName` | `Beacon` | Name used for the app registration and resources |
| `appPlanSku` | `B1` | Hosting plan tier (Y1, EP1, B1) |

**Example with custom values:**

```bash
az deployment sub create \
  --location australiaeast \
  --template-file beacon.bicep \
  --parameters \
    resourceGroupName=rg-beacon-prod \
    appName=BeaconProd
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
```

The `adminConsentUrl` is particularly important - you'll need it for onboarding client tenants.

## Step 5: Grant Admin Consent

The app registration is created with the required permissions, but admin consent must still be granted.

### For your own tenant

Not strictly necessary, only if you want to monitor your own tenant too.

1. Open the `adminConsentUrl` from the deployment outputs
2. Sign in with a Global Administrator account
3. Review the permissions and click **Accept**

### For client tenants

For each client tenant you want to monitor:

1. Replace the tenant ID in the consent URL:
   ```
   https://login.microsoftonline.com/{client-tenant-id}/adminconsent?client_id={app-client-id}
   ```
2. Send this URL to the client's Global Administrator
3. They sign in and accept the permissions

::: warning Expected Behaviour
After granting consent, you'll see an error. This is expected. The app has no redirect URL configured, so the browser has nowhere to go. The consent itself was granted successfully.
:::

## Verify Deployment

1. Open the [Azure Portal](https://portal.azure.com)
2. Navigate to **Resource groups** → **rg-beacon** (or your custom name)
3. Confirm all resources are present and healthy

To check the Function App:

1. Open the Function App resource
2. Go to **Functions** in the left menu
3. You should see the `pollAuditLogs` function listed

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
This deletes all resources in the resource group, including any data in the storage account. The app registration is **not** deleted automatically. Remove it manually from Entra ID if needed.
:::
