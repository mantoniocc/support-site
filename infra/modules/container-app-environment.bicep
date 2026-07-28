@description('Nombre del Container Apps Environment')
param name string

@description('Region de Azure.')
param location string

@description('Nombre del workspace de Log Analytics ua existente.')
param logAnalyticsWorkspaceName string

@description('Etiquetas comunes.')
param tags object = {}

// Referencia a un recurso ya existente: sirve para leer sus propiedades
// y sus claves sin volver a declararlo ni pasarlas como parametro.
resource workspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' existing = {
  name: logAnalyticsWorkspaceName
}

resource managedEnvironment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: name
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: workspace.properties.customerId
        sharedKey: workspace.listKeys().primarySharedKey
      }
    }
    zoneRedundant:false
  }
}

output id string = managedEnvironment.id
output name string = managedEnvironment.name
output defaultDomain string = managedEnvironment.properties.defaultDomain
