// Beacon - M365 Security Alerting for MSPs
// Subscription-scoped deployment that creates resource group and all resources

targetScope = 'subscription'

// Parameters
@description('Name for the resource group')
param resourceGroupName string = 'rg-beacon'

@description('Azure region for all resources. Defaults to deployment location.')
param location string = deployment().location

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

// Resource Group
resource rg 'Microsoft.Resources/resourceGroups@2023-07-01' = {
  name: resourceGroupName
  location: location
}

// Deploy all Beacon resources into the new resource group
module beaconResources 'beacon-resources.bicep' = {
  name: 'beacon-resources'
  scope: rg
  params: {
    location: location
    appName: appName
    appPlanSku: appPlanSku
    enableFederatedAuth: enableFederatedAuth
    functionAppName: functionAppName
    storageAccountName: storageAccountName
    appServicePlanName: appServicePlanName
    logAnalyticsWorkspaceName: logAnalyticsWorkspaceName
    dataCollectionEndpointName: dataCollectionEndpointName
    dataCollectionRuleName: dataCollectionRuleName
    appInsightsName: appInsightsName
  }
}

// Outputs (forwarded from module)
output resourceGroupName string = rg.name
output functionAppName string = beaconResources.outputs.functionAppName
output functionAppUrl string = beaconResources.outputs.functionAppUrl
output functionAppPrincipalId string = beaconResources.outputs.functionAppPrincipalId
output appRegistrationAppId string = beaconResources.outputs.appRegistrationAppId
output appRegistrationName string = beaconResources.outputs.appRegistrationName
output storageAccountName string = beaconResources.outputs.storageAccountName
output adminConsentUrl string = beaconResources.outputs.adminConsentUrl
output logAnalyticsWorkspaceId string = beaconResources.outputs.logAnalyticsWorkspaceId
output logAnalyticsWorkspaceName string = beaconResources.outputs.logAnalyticsWorkspaceName
output dataCollectionEndpointUrl string = beaconResources.outputs.dataCollectionEndpointUrl
output dataCollectionRuleId string = beaconResources.outputs.dataCollectionRuleId
output dataCollectionRuleName string = beaconResources.outputs.dataCollectionRuleName
output customTableName string = beaconResources.outputs.customTableName
output appInsightsName string = beaconResources.outputs.appInsightsName
