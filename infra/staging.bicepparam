using 'main.bicep'

param appEnvironment = 'staging'
param projectName = 'support-site'
param minReplicas = 0
param maxReplicas = 2
param logDailyQuotaGb = '0.1'
