# 0005. Una identidad y un resource group por entorno

- Estado: aceptada
- Fecha: 2026-07-29

## Contexto

Hay dos entornos, staging y producción. Hay que decidir cómo se reparten las identidades de
despliegue y los permisos sobre Azure.

## Decisión

Cada entorno tiene su **propio resource group** y su **propia app registration**, con rol
`Contributor` acotado exclusivamente a su grupo:

| Entorno | Resource group | Identidad |
|---|---|---|
| staging | `rg-support-site-staging` | `gh-support-site-staging` |
| production | `rg-support-site-production` | `gh-support-site-production` |

Los resource groups los crea una persona, no el pipeline.

## Alternativas consideradas

**Una identidad con `Contributor` sobre ambos resource groups.** Bastante más simple: un
solo conjunto de credenciales federadas y de secrets. Se descarta porque un token emitido
para un despliegue a staging podría modificar o destruir producción. El aislamiento sería
nominal, no efectivo.

**Una identidad con `Contributor` a nivel de suscripción.** Lo que hace la mayoría de los
tutoriales. El radio de impacto es toda la suscripción.

**Un único resource group con ambos entornos dentro.** Impide el teardown selectivo en modo
Complete (ADR-0010): vaciar staging borraría producción.

## Consecuencias

**A favor**

- Aislamiento real del radio de impacto. Ningún token puede cruzar de un entorno al otro.
- Refleja la estructura de una organización real, donde los entornos suelen estar en
  suscripciones o grupos distintos con controles independientes.
- Permite destruir un entorno sin tocar el otro.
- Los secrets de entorno usan **los mismos nombres** con valores distintos, así que el YAML
  del workflow es idéntico para ambos: la única diferencia es la línea `environment:`.

**En contra**

- Todo el aprovisionamiento se duplica: dos app registrations, dos juegos de credenciales
  federadas, dos asignaciones de rol, dos conjuntos de secrets y variables.
- El script de setup necesita iterar sobre entornos en vez de ser lineal.
- Que los resource groups los cree una persona significa que el pipeline **no puede
  recrearlos**. Es deliberado —  ver ADR-0010—  pero implica un paso manual en el arranque.
