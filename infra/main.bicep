// MCP Probe Infrastructure
// Deploy with: az deployment sub create --location eastus --template-file infra/main.bicep

targetScope = 'subscription'

@description('Environment name (used for resource naming)')
param environment string = 'prod'

@description('Azure region for all resources')
param location string = 'eastus'

// Custom domain (mcp.eamon.io) configured post-deployment

// Resource naming
var prefix = 'mcpprobe'
var resourceGroupName = 'rg-${prefix}-${environment}'
var acrName = '${prefix}${environment}acr'
var containerAppEnvName = '${prefix}-${environment}-env'
var containerAppName = '${prefix}-${environment}-app'

// Resource Group
resource rg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: resourceGroupName
  location: location
}

// Deploy resources into the resource group
module resources 'resources.bicep' = {
  name: 'resources'
  scope: rg
  params: {
    location: location
    acrName: acrName
    containerAppEnvName: containerAppEnvName
    containerAppName: containerAppName
  }
}

// Outputs for GitHub Actions and DNS setup
output resourceGroupName string = rg.name
output acrName string = resources.outputs.acrName
output acrLoginServer string = resources.outputs.acrLoginServer
output containerAppName string = resources.outputs.containerAppName
output containerAppFqdn string = resources.outputs.containerAppFqdn
output containerAppCustomDomainVerificationId string = resources.outputs.customDomainVerificationId
