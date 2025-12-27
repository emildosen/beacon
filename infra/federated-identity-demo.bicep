// Federated Identity Demo for Beacon
// Creates Function App with managed identity + adds federated credential to existing app registration
// No client secrets required - uses workload identity federation

extension microsoftGraphV1

// Parameters
@description('Application name (used for app registration and resources)')
param appName string = 'Beacon'

@description('App Service Plan SKU')
@allowed([
  'Consumption (Y1) - Pay per execution'
  'Elastic Premium (EP1) - Always ready'
  'Basic (B1) - Dedicated'
])
param appPlanSku string = 'Consumption (Y1) - Pay per execution'

// Variables
var location = resourceGroup().location
var skuMap = {
  'Consumption (Y1) - Pay per execution': { name: 'Y1', tier: 'Dynamic' }
  'Elastic Premium (EP1) - Always ready': { name: 'EP1', tier: 'ElasticPremium' }
  'Basic (B1) - Dedicated': { name: 'B1', tier: 'Basic' }
}
var selectedSku = skuMap[appPlanSku]
var uniqueSuffix = uniqueString(resourceGroup().id)
var appNameLower = toLower(appName)
var cleanName = replace(appNameLower, '-', '')
var storageAccountName = '${take(cleanName, 10)}${take(uniqueSuffix, 10)}'
var functionAppName = '${appNameLower}-func-${take(uniqueSuffix, 6)}'
var appServicePlanName = '${appNameLower}-plan'
var appRegistrationName = appName

// Multi-tenant App Registration
resource appRegistration 'Microsoft.Graph/applications@v1.0' = {
  displayName: appRegistrationName
  uniqueName: appRegistrationName
  signInAudience: 'AzureADMultipleOrgs'

  // API permissions (admin consent still required manually)
  requiredResourceAccess: [
    // Microsoft Graph
    {
      resourceAppId: '00000003-0000-0000-c000-000000000000'
      resourceAccess: [
        { id: 'b0afded3-3588-46d8-8b3d-9842eff778da', type: 'Role' } // AuditLog.Read.All
        { id: 'bf394140-e372-4bf9-a898-299cfc7564e5', type: 'Role' } // SecurityAlert.Read.All
        { id: '6e472fd1-ad78-48da-a0f0-97ab2c6b769e', type: 'Role' } // IdentityRiskEvent.Read.All
        { id: '7ab1d382-f21e-4acd-a863-ba3e13f7da61', type: 'Role' } // Directory.Read.All
      ]
    }
    // Office 365 Management APIs
    {
      resourceAppId: 'c5393580-f805-4401-95e8-94b7a6ef2fc2'
      resourceAccess: [
        { id: '594c1fb6-4f81-4f83-8c50-76c0e986b4be', type: 'Role' } // ActivityFeed.Read
        { id: '4807a72c-ad46-4f91-a9f3-845fce184694', type: 'Role' } // ActivityFeed.ReadDlp
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
  name: storageAccountName
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

// App Service Plan
resource appServicePlan 'Microsoft.Web/serverfarms@2023-01-01' = {
  name: appServicePlanName
  location: location
  sku: {
    name: selectedSku.name
    tier: selectedSku.tier
  }
  properties: {
    reserved: false // Windows
  }
}

// Function App with System-Assigned Managed Identity
resource functionApp 'Microsoft.Web/sites@2023-01-01' = {
  name: functionAppName
  location: location
  kind: 'functionapp'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: appServicePlan.id
    siteConfig: {
      netFrameworkVersion: 'v8.0'
      nodeVersion: '~22'
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
          value: toLower(functionAppName)
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
        {
          name: 'AZURE_CLIENT_ID'
          value: appRegistration.appId
        }
        {
          name: 'AZURE_TENANT_ID'
          value: subscription().tenantId
        }
        {
          name: 'SCM_DO_BUILD_DURING_DEPLOYMENT'
          value: 'true'
        }
        {
          name: 'ENABLE_ORYX_BUILD'
          value: 'true'
        }
      ]
    }
    httpsOnly: true
  }
}

// Federated Identity Credential - nested inside app registration reference
resource federatedCredential 'Microsoft.Graph/applications/federatedIdentityCredentials@v1.0' = {
  name: '${appRegistration.uniqueName}/FuncAppMSI'
  audiences: [
    'api://AzureADTokenExchange'
  ]
  issuer: '${environment().authentication.loginEndpoint}${subscription().tenantId}/v2.0'
  subject: functionApp.identity.principalId
  description: 'Federated credential for ${functionAppName} managed identity'
}

// Deploy function code from GitHub
resource sourceControl 'Microsoft.Web/sites/sourcecontrols@2023-01-01' = {
  parent: functionApp
  name: 'web'
  properties: {
    repoUrl: 'https://github.com/emildosen/beacon'
    branch: 'main'
    isManualIntegration: true
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
