# Architecture Decision Records

Registro de las decisiones de arquitectura de `support-site` y por qué se tomaron.
Formato basado en el [modelo de Michael Nygard](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions.html).

Un ADR **justifica**, no documenta. Si una decisión no tuvo alternativa real, no merece un
ADR: el código ya la explica.

## Índice

| # | Decisión | Estado |
|---|---|---|
| [0001](0001-container-apps-sobre-app-service.md) | Azure Container Apps sobre App Service | aceptada |
| [0002](0002-ghcr-sobre-acr.md) | GitHub Container Registry sobre ACR | aceptada |
| [0003](0003-oidc-en-vez-de-secreto-de-service-principal.md) | OIDC en vez de secreto de service principal | aceptada |
| [0004](0004-repositorio-publico.md) | Repositorio público | aceptada |
| [0005](0005-identidad-y-resource-group-por-entorno.md) | Una identidad y un resource group por entorno | aceptada |
| [0006](0006-bicep-declarativo-en-vez-de-az-imperativo.md) | Bicep declarativo en vez de comandos `az` | aceptada |
| [0007](0007-etiquetar-con-el-head-sha-del-pr.md) | Etiquetar con el head SHA del PR, no el merge commit | aceptada |
| [0008](0008-main-no-construye-promocion-por-digest.md) | `main` no construye: promoción por digest | aceptada, enmendada por 0009 |
| [0009](0009-crane-tag-en-vez-de-imagetools-create.md) | `crane tag` en vez de `imagetools create` | aceptada |
| [0010](0010-vaciar-el-resource-group-en-modo-complete.md) | Vaciar el resource group en modo Complete | aceptada |
| [0011](0011-escalado-a-cero-y-consumption-puro.md) | Escalado a cero y Consumption puro | aceptada |

## Estados

- **propuesta** — en discusión, no implementada
- **aceptada** — vigente y reflejada en el código
- **enmendada por NNNN** — la decisión sigue vigente; otro ADR corrigió parte de su implementación
- **supersedida por NNNN** — reemplazada; se conserva por trazabilidad
- **rechazada** — se consideró y se descartó; se conserva para no volver a discutirla

## Plantilla

```markdown
# NNNN. Título en forma de decisión

- Estado: aceptada
- Fecha: YYYY-MM-DD

## Contexto
Qué fuerzas están en juego. Restricciones reales, no aspiracionales.

## Decisión
Qué hacemos. En voz activa: "Usamos X".

## Alternativas consideradas
Lo que descartamos y por qué. Sin esto, un ADR no vale nada.

## Consecuencias
Lo bueno, lo malo y lo que ahora es más difícil.
```
