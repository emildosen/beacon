// Beacon Resources Module
// Creates Function App with managed identity + federated credential to app registration

extension microsoftGraphV1

// Parameters
@description('Azure region for all resources')
param location string

@description('Application name (used for app registration and resources)')
param appName string = 'Beacon'

@description('App Service Plan SKU')
@allowed([
  'Y1'
  'EP1'
  'B1'
])
param appPlanSku string = 'B1'

@description('Enable federated authentication for the Function App managed identity')
param enableFederatedAuth bool = true

// Optional name parameters (leave empty to use auto-generated names)
@description('Function App name (leave empty for auto-generated)')
param functionAppName string = ''

@description('Storage Account name (leave empty for auto-generated)')
param storageAccountName string = ''

@description('App Service Plan name (leave empty for auto-generated)')
param appServicePlanName string = ''

@description('Log Analytics Workspace name (leave empty for auto-generated)')
param logAnalyticsWorkspaceName string = ''

@description('Data Collection Endpoint name (leave empty for auto-generated)')
param dataCollectionEndpointName string = ''

@description('Data Collection Rule name (leave empty for auto-generated)')
param dataCollectionRuleName string = ''

@description('Application Insights name (leave empty for auto-generated)')
param appInsightsName string = ''

// Variables
var skuMap = {
  Y1: { name: 'Y1', tier: 'Dynamic' }
  EP1: { name: 'EP1', tier: 'ElasticPremium' }
  B1: { name: 'B1', tier: 'Basic' }
}
var selectedSku = skuMap[appPlanSku]
var uniqueSuffix = uniqueString(resourceGroup().id)
var appNameLower = toLower(appName)
var cleanName = replace(appNameLower, '-', '')

// Use provided names if specified, otherwise use auto-generated names
var _storageAccountName = !empty(storageAccountName) ? storageAccountName : '${take(cleanName, 10)}${take(uniqueSuffix, 10)}'
var _functionAppName = !empty(functionAppName) ? functionAppName : '${appNameLower}-func-${take(uniqueSuffix, 6)}'
var _appServicePlanName = !empty(appServicePlanName) ? appServicePlanName : '${appNameLower}-plan'
var _appRegistrationName = appName
var _logAnalyticsWorkspaceName = !empty(logAnalyticsWorkspaceName) ? logAnalyticsWorkspaceName : 'law-${appNameLower}'
var _dataCollectionEndpointName = !empty(dataCollectionEndpointName) ? dataCollectionEndpointName : 'dce-${appNameLower}'
var _dataCollectionRuleName = !empty(dataCollectionRuleName) ? dataCollectionRuleName : 'dcr-${appNameLower}'
var _customTableName = 'Beacon_Alerts'
var _appInsightsName = !empty(appInsightsName) ? appInsightsName : 'ai-${appNameLower}'

// Multi-tenant App Registration
resource appRegistration 'Microsoft.Graph/applications@v1.0' = {
  displayName: _appRegistrationName
  uniqueName: _appRegistrationName
  signInAudience: 'AzureADMultipleOrgs'

  // API permissions (admin consent still required manually)
  requiredResourceAccess: [
    // Microsoft Graph
    {
      resourceAppId: '00000003-0000-0000-c000-000000000000'
      resourceAccess: [
        { id: 'b0afded3-3588-46d8-8b3d-9842eff778da', type: 'Role' } // AuditLog.Read.All
        { id: '472e4a4d-bb4a-4026-98d1-0b0d74cb74a5', type: 'Role' } // SecurityAlert.Read.All
        { id: '6e472fd1-ad78-48da-a0f0-97ab2c6b769e', type: 'Role' } // IdentityRiskEvent.Read.All
        { id: '7ab1d382-f21e-4acd-a863-ba3e13f7da61', type: 'Role' } // Directory.Read.All
      ]
    }
    // Office 365 Management APIs
    {
      resourceAppId: 'c5393580-f805-4401-95e8-94b7a6ef2fc2'
      resourceAccess: [
        { id: '594c1fb6-4f81-4475-ae41-0c394909246c', type: 'Role' } // ActivityFeed.Read
        { id: '4807a72c-ad38-4250-94c9-4eabfe26cd55', type: 'Role' } // ActivityFeed.ReadDlp
        { id: 'e2cea78f-e743-4d8f-a16a-75b629a038ae', type: 'Role' } // ServiceHealth.Read
      ]
    }
  ]
}

// Service Principal for the App Registration
resource servicePrincipal 'Microsoft.Graph/servicePrincipals@v1.0' = {
  appId: appRegistration.appId
}

// Storage Account (required for Azure Functions)
resource storageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: _storageAccountName
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    supportsHttpsTrafficOnly: true
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
  }
}

// Blob Service for storage account
resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-01-01' = {
  parent: storageAccount
  name: 'default'
}

// Config container for rules storage
resource configContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = {
  parent: blobService
  name: 'config'
  properties: {
    publicAccess: 'None'
  }
}

// Log Analytics Workspace
resource logAnalyticsWorkspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: _logAnalyticsWorkspaceName
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

// Application Insights (workspace-based)
resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: _appInsightsName
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalyticsWorkspace.id
    RetentionInDays: 30
  }
}

// Data Collection Endpoint
resource dataCollectionEndpoint 'Microsoft.Insights/dataCollectionEndpoints@2023-03-11' = {
  name: _dataCollectionEndpointName
  location: location
  properties: {
    networkAcls: {
      publicNetworkAccess: 'Enabled'
    }
  }
}

// Custom Table in Log Analytics
resource customTable 'Microsoft.OperationalInsights/workspaces/tables@2022-10-01' = {
  parent: logAnalyticsWorkspace
  name: '${_customTableName}_CL'
  properties: {
    schema: {
      name: '${_customTableName}_CL'
      columns: [
        { name: 'TimeGenerated', type: 'datetime', description: 'When the source event occurred' }
        { name: 'TimeProcessed', type: 'datetime', description: 'When Beacon processed the alert' }
        { name: 'ClientTenantId', type: 'string', description: 'Client tenant ID' }
        { name: 'ClientTenantName', type: 'string', description: 'Client tenant display name' }
        { name: 'User', type: 'string', description: 'UPN of the user who initiated the action' }
        { name: 'RuleName', type: 'string', description: 'Name of the rule that triggered' }
        { name: 'Severity', type: 'string', description: 'Alert severity (Critical, High, Medium, Low)' }
        { name: 'Description', type: 'string', description: 'Alert description' }
        { name: 'SourceType', type: 'string', description: 'Source type (AuditLog, SignIn, SecurityAlert)' }
        { name: 'SourceEventId', type: 'string', description: 'Original event ID from source' }
        { name: 'RawEventSummary', type: 'string', description: 'Summary of raw event data' }
        { name: 'ShouldNotify', type: 'boolean', description: 'Whether notification should be sent' }
      ]
    }
    retentionInDays: 30
  }
}

// Data Collection Rule
resource dataCollectionRule 'Microsoft.Insights/dataCollectionRules@2023-03-11' = {
  name: _dataCollectionRuleName
  location: location
  properties: {
    dataCollectionEndpointId: dataCollectionEndpoint.id
    streamDeclarations: {
      'Custom-${_customTableName}_CL': {
        columns: [
          { name: 'TimeGenerated', type: 'datetime' }
          { name: 'TimeProcessed', type: 'datetime' }
          { name: 'ClientTenantId', type: 'string' }
          { name: 'ClientTenantName', type: 'string' }
          { name: 'User', type: 'string' }
          { name: 'RuleName', type: 'string' }
          { name: 'Severity', type: 'string' }
          { name: 'Description', type: 'string' }
          { name: 'SourceType', type: 'string' }
          { name: 'SourceEventId', type: 'string' }
          { name: 'RawEventSummary', type: 'string' }
          { name: 'ShouldNotify', type: 'boolean' }
        ]
      }
    }
    destinations: {
      logAnalytics: [
        {
          workspaceResourceId: logAnalyticsWorkspace.id
          name: 'law-destination'
        }
      ]
    }
    dataFlows: [
      {
        streams: ['Custom-${_customTableName}_CL']
        destinations: ['law-destination']
        transformKql: 'source'
        outputStream: 'Custom-${_customTableName}_CL'
      }
    ]
  }
  dependsOn: [customTable]
}

// App Service Plan
resource appServicePlan 'Microsoft.Web/serverfarms@2023-01-01' = {
  name: _appServicePlanName
  location: location
  sku: {
    name: selectedSku.name
    tier: selectedSku.tier
  }
  properties: {
    reserved: false
  }
}

// Function App with System-Assigned Managed Identity
resource functionApp 'Microsoft.Web/sites@2023-01-01' = {
  name: _functionAppName
  location: location
  kind: 'functionapp'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: appServicePlan.id
    siteConfig: {
      alwaysOn: appPlanSku != 'Y1'
      cors: {
        allowedOrigins: [
          'https://portal.azure.com'
        ]
      }
      appSettings: [
        {
          name: 'AzureWebJobsStorage'
          value: 'DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};EndpointSuffix=${environment().suffixes.storage};AccountKey=${storageAccount.listKeys().keys[0].value}'
        }
        {
          name: 'WEBSITE_CONTENTAZUREFILECONNECTIONSTRING'
          value: 'DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};EndpointSuffix=${environment().suffixes.storage};AccountKey=${storageAccount.listKeys().keys[0].value}'
        }
        {
          name: 'WEBSITE_CONTENTSHARE'
          value: toLower(_functionAppName)
        }
        {
          name: 'FUNCTIONS_EXTENSION_VERSION'
          value: '~4'
        }
        {
          name: 'FUNCTIONS_WORKER_RUNTIME'
          value: 'node'
        }
        {
          name: 'WEBSITE_NODE_DEFAULT_VERSION'
          value: '~22'
        }
        // Azure SDK environment variables for managed identity with federated credential
        {
          name: 'AZURE_CLIENT_ID'
          value: appRegistration.appId
        }
        {
          name: 'AZURE_TENANT_ID'
          value: subscription().tenantId
        }
        // Beacon application environment variables
        {
          name: 'TENANT_ID'
          value: subscription().tenantId
        }
        {
          name: 'CLIENT_ID'
          value: appRegistration.appId
        }
        // Log Analytics configuration
        {
          name: 'LOG_ANALYTICS_ENDPOINT'
          value: dataCollectionEndpoint.properties.logsIngestion.endpoint
        }
        {
          name: 'LOG_ANALYTICS_RULE_ID'
          value: dataCollectionRule.properties.immutableId
        }
        {
          name: 'LOG_ANALYTICS_STREAM'
          value: 'Custom-${_customTableName}_CL'
        }
        // Storage for alert deduplication
        {
          name: 'AZURE_STORAGE_CONNECTION_STRING'
          value: 'DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};EndpointSuffix=${environment().suffixes.storage};AccountKey=${storageAccount.listKeys().keys[0].value}'
        }
        {
          name: 'WEBSITE_RUN_FROM_PACKAGE'
          value: 'https://github.com/emildosen/beacon/releases/latest/download/beacon.zip'
        }
        {
          name: 'AzureWebJobsFeatureFlags'
          value: 'EnableWorkerIndexing'
        }
        {
          name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
          value: appInsights.properties.ConnectionString
        }
      ]
    }
    httpsOnly: true
  }
}

// Federated Identity Credential - nested inside app registration reference
resource federatedCredential 'Microsoft.Graph/applications/federatedIdentityCredentials@v1.0' = if (enableFederatedAuth) {
  name: '${appRegistration.uniqueName}/FuncAppMSI'
  audiences: [
    'api://AzureADTokenExchange'
  ]
  issuer: '${environment().authentication.loginEndpoint}${subscription().tenantId}/v2.0'
  subject: functionApp.identity.principalId
  description: 'Federated credential for ${_functionAppName} managed identity'
}


// Role assignment: Monitoring Metrics Publisher for Function App to write to DCR
resource dcrRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(dataCollectionRule.id, functionApp.id, '3913510d-42f4-4e42-8a64-420c390055eb')
  scope: dataCollectionRule
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '3913510d-42f4-4e42-8a64-420c390055eb') // Monitoring Metrics Publisher
    principalId: functionApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}


// Outputs
output functionAppName string = functionApp.name
output functionAppUrl string = 'https://${functionApp.properties.defaultHostName}'
output functionAppPrincipalId string = functionApp.identity.principalId
output appRegistrationAppId string = appRegistration.appId
output appRegistrationName string = appRegistration.displayName
output storageAccountName string = storageAccount.name
output adminConsentUrl string = '${environment().authentication.loginEndpoint}${subscription().tenantId}/adminconsent?client_id=${appRegistration.appId}'
output logAnalyticsWorkspaceId string = logAnalyticsWorkspace.properties.customerId
output logAnalyticsWorkspaceName string = logAnalyticsWorkspace.name
output dataCollectionEndpointUrl string = dataCollectionEndpoint.properties.logsIngestion.endpoint
output dataCollectionRuleId string = dataCollectionRule.properties.immutableId
output dataCollectionRuleName string = dataCollectionRule.name
output customTableName string = '${_customTableName}_CL'
output appInsightsName string = appInsights.name
output appInsightsConnectionString string = appInsights.properties.ConnectionString
