@description('Nombre del workspace de Log Analytics.')
param name string

@description('Region de Azure.')
param location string

@description('Dias de retencion. 30 es el minimo y no genera cargo extra.')
@minValue(30)
@maxValue(730)
param retentionInDays int = 30

@description('Tope de ingesta diaria en GB. Cortafuegos de costo.')
param dailyQuotaGB string = '0.2'

@description('Etiquetas comunes.')
param tags object = {}

resource workspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: name
  location: location
  tags: tags
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: retentionInDays
    features: {
      immediatePurgeDataOn30Days: true
    }
    workspaceCapping: {
      dailyQuotaGb: json(dailyQuotaGB)
    }
  }
}

output id string = workspace.id
output name string = workspace.name
