param name string
param location string
param managedEnvironmentId string

@description('Imagen completa, por ejemplo ghcr.io/owner/support-site:sha.')
param containerImage string

@allowed(['staging', 'production'])
param appEnvironment string

param targetPort int = 3000

@description('0 = escala a cero: no se factura computo sin trafico')
@minValue(0)
@maxValue(5)
param minReplicas int = 0

@minValue(1)
@maxValue(10)
param maxReplicas int = 2

param cpu string = '0.25'
param memory string = '0.5Gi'

@description('Sufijo de revision, normalmente el SHA corto.')
param revisionSuffix string = ''

param tags object = {}

resource containerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: name
  location: location
  tags: tags
  properties:{
    managedEnvironmentId: managedEnvironmentId
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: targetPort
        transport: 'auto'
        allowInsecure: false
        traffic:[
          {
            latestRevision: true
            weight: 100
          }
        ]
      }
    }
    template: {
      revisionSuffix: empty(revisionSuffix) ? null : revisionSuffix
      containers: [
        {
          name: 'app'
          image: containerImage
          resources: {
            cpu: json(cpu)
            memory: memory
          }
          env: [
            {
              name: 'APP_ENV'
              value: appEnvironment
            }
            {
              name: 'PORT'
              value: string(targetPort)
            }
          ]
          probes: [
            {
              type: 'Liveness'
              httpGet: {path: '/health', port: targetPort}
              initialDelaySeconds: 5
              periodSeconds: 30
              failureThreshold: 3
            }
            {
              type: 'Readiness'
              httpGet: { path: '/health', port: targetPort }
              initialDelaySeconds: 2
              periodSeconds: 10
              failureThreshold: 3
            }
          ]
        }
      ]
      scale: {
        minReplicas: minReplicas
        maxReplicas: maxReplicas
        rules: [
          {
            name: 'http-scaling'
            http: {
              metadata: {
                concurrentRequests: '20'
              }
            }
          }
        ]
      }
    }
  }
}

output name string = containerApp.name
output fqdn string = containerApp.properties.configuration.ingress.fqdn
output url string = 'https://${containerApp.properties.configuration.ingress.fqdn}'
output lastestRevisionName string = containerApp.properties.latestRevisionName
