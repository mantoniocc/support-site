targetScope = 'resourceGroup'

@minLength(3)
@maxLength(20)
param projectName string = 'supportSite'

@allowed(['staging', 'production'])
param appEnvironment string

param location string = resourceGroup().location

@description('Placeholder de Microsoft para el primer aprovisionamiento, cuando aun no apuntamos a nuestra imagen.')
param containerImage string = 'mcr.microsoft.com/k8se/quickstart:latest'

param revisionSuffix string = ''
param minReplicas int = 0
param maxReplicas int = 2
param logDailyQuotaGb string = '0.2'

var suffix = '${projectName}-${appEnvironment}'

var tags = {
  project: projectName
  environment: appEnvironment
  managedBy: 'bicep'
  lab: 'github-actions-cd'
}

module logAnalytics 'modules/log-analytics.bicep' = {
  name: 'log-analytics'
  params: {
    name: 'log-${suffix}'
    location: location
    dailyQuotaGB: logDailyQuotaGb
    tags: tags
  }
}

module containerAppEnvironment 'modules/container-app-environment.bicep' = {
  name: 'container-app-environment'
  params: {
    name: 'cae-${suffix}'
    location: location
    logAnalyticsWorkspaceName: logAnalytics.outputs.name
    tags: tags
  }
}

module containerApp 'modules/container-app.bicep' = {
  name: 'container-app'
  params: {
    name: 'ca-${suffix}'
    location: location
    appEnvironment: appEnvironment
    containerImage: containerImage
    managedEnvironmentId: containerAppEnvironment.outputs.id
    revisionSuffix: revisionSuffix
    minReplicas: minReplicas
    maxReplicas: maxReplicas
    tags: tags
  }
}

output appUrl string = containerApp.outputs.url
output appFqdn string = containerApp.outputs.fqdn
output containerAppName string = containerApp.outputs.name
output RevisionName string = containerApp.outputs.lastestRevisionName
