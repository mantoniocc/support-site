# support-site

Laboratorio de **entrega continua con GitHub Actions y Azure**, construido como versión
moderna del módulo de Microsoft Learn
[*Build and deploy applications to Azure by using GitHub Actions*](https://learn.microsoft.com/en-us/training/modules/github-actions-cd/).

El módulo original es de 2020 y usa piezas ya retiradas: credenciales de service principal
en `AZURE_CREDENTIALS`, el registry `docker.pkg.github.com`, `azure/webapps-deploy@v1`.
Este repositorio cubre los mismos conceptos con el stack actual —  OIDC sin secretos,
GHCR, Bicep, Azure Container Apps y promoción de artefactos por digest.

[![CI](https://github.com/mantoniocc/support-site/actions/workflows/ci.yml/badge.svg?event=pull_request)](https://github.com/mantoniocc/support-site/actions/workflows/ci.yml)
[![Promote to production](https://github.com/mantoniocc/support-site/actions/workflows/promote.yml/badge.svg)](https://github.com/mantoniocc/support-site/actions/workflows/promote.yml)

---

## La aplicación

Una app Express mínima que muestra **en qué entorno corre** y **qué commit está desplegado**.
Parece trivial y es el instrumento de medición de todo el laboratorio: sin poder ver qué
versión está viva en cada sitio, el pipeline es una caja negra.

| Dato | Cuándo se fija | Consecuencia |
|---|---|---|
| `COMMIT_SHA`, `BUILD_TIME` | en el **build**, vía `ARG` → `ENV` | inmutables: esa imagen siempre reporta ese commit |
| `APP_ENV` | en **runtime**, inyectado por Bicep | la misma imagen dice `staging` o `production` según dónde corra |

Esa separación es *build once, deploy many*: se construye el artefacto una vez y se
promociona entre entornos. Nunca se reconstruye para producción, porque un artefacto
reconstruido ya no es el que se probó.

Endpoints: `/` (página de estado), `/health` (probes de Container Apps),
`/api/version` (JSON que consumen los smoke tests).

---

## Arquitectura

```
                    ┌──────────────── GitHub ────────────────┐
  PR + label        │                                        │
  "stage"     ────► │  ci.yml       tests → ghcr.io:<head>    │
                    │                        │               │
                    │  cd.yml       ─────────┘               │
                    │    environment: staging                │
                    │                                        │
  merge a main ───► │  promote.yml  resolver PR → digest      │
                    │               crane tag (sin rebuild)  │
                    │               environment: production  │
                    │                    ⏸ aprobación manual │
                    └────────┬───────────────────┬───────────┘
                             │  OIDC             │  OIDC
                             ▼                   ▼
              rg-support-site-staging   rg-support-site-production
              ├── log-*   Log Analytics ├── log-*
              ├── cae-*   Container Apps Env
              └── ca-*    Container App └── ca-*
```

Dos resource groups aislados y **dos app registrations independientes**, cada una con rol
`Contributor` acotado exclusivamente a su propio grupo. Un token emitido para staging no
puede tocar producción.

---

## Estructura

```
.
├── app/
│   ├── src/app.js            factory Express + página de estado
│   ├── src/server.js         arranque y apagado ordenado (SIGTERM)
│   ├── test/app.test.js      7 tests con el runner nativo de Node
│   └── Dockerfile            multi-stage, no-root, ARG → ENV
├── infra/
│   ├── main.bicep            orquesta los tres módulos
│   ├── modules/
│   │   ├── log-analytics.bicep            con tope de ingesta diario
│   │   ├── container-app-environment.bicep  Consumption puro
│   │   └── container-app.bicep            escala a cero, probes
│   ├── staging.bicepparam
│   └── production.bicepparam
├── docs/cheatsheet.md        referencia de comandos az y gh
└── .github/workflows/
    ├── ci.yml                tests → imagen en GHCR (solo en PRs)
    ├── cd.yml                despliegue a staging por label
    ├── promote.yml           promoción a producción con aprobación
    └── azure-login-test.yml  verificación de OIDC
```

---

## Flujo de trabajo

**Desplegar a staging**

```bash
git checkout -b feat/mi-cambio
# ... cambios ...
git push -u origin feat/mi-cambio
gh pr create --title "Mi cambio" --body ""
gh pr edit --add-label "stage"
```

`ci.yml` construye la imagen etiquetada con el head SHA de la rama. `cd.yml` la despliega
y comenta la URL en el PR. Mientras la label siga puesta, cada push redespliega.

**Promocionar a producción**

```bash
gh pr merge --squash --delete-branch
```

`promote.yml` resuelve el PR de origen, obtiene el digest del artefacto ya probado, lo
reetiqueta sin reconstruir, y se detiene en **Waiting** hasta que apruebes desde
Actions → *Review deployments*.

---

## Decisiones de diseño

### Seguridad

**OIDC en vez de secretos.** GitHub pide un JWT de vida corta y Entra ID lo valida contra
una credencial federada. Los únicos valores almacenados son tres identificadores públicos
—  client, tenant y subscription ID —  que sin la federación no autorizan nada.

**Subject inmutable.** Los repositorios creados desde el 15 de julio de 2026 usan el
formato `repo:OWNER@OWNER-ID/REPO@REPO-ID:environment:ENV`. Casi todos los tutoriales de
OIDC que circulan muestran el formato anterior y fallan con
`AADSTS70021: No matching federated identity record found`. El laboratorio registra ambos.

**Repo público, deliberadamente.** Con plan GitHub Free, los *required reviewers* y el
*wait timer* solo funcionan en repositorios públicos. Las protecciones que compensan:
subject de OIDC acotado por entorno, RBAC limitado al resource group, aprobación requerida
para colaboradores externos, y `pull_request` en vez de `pull_request_target`.

### Artefactos

**Un tag es un puntero mutable; un digest es la identidad real.** Producción se despliega
siempre por `IMAGE@sha256:…`, nunca por tag.

**`crane tag`, no `docker buildx imagetools create`.** El segundo construye *manifest lists*:
envuelve el manifiesto original en un índice nuevo con digest distinto, lo que rompe en
silencio la attestation de procedencia. Ver `docs/cheatsheet.md` §16.

**`main` nunca construye.** Las imágenes solo nacen en pull requests. Al mergear se
promociona el binario existente, con verificación de que el digest no cambió.

### Costo

| Decisión | Dónde | Efecto |
|---|---|---|
| Sin `workloadProfiles` | `container-app-environment.bicep` | Consumption puro, sin costo base por hora |
| `minReplicas: 0` | `container-app.bicep` | escala a cero, sin cargo de cómputo sin tráfico |
| `dailyQuotaGb` | `log-analytics.bicep` | tope de ingesta: corta en vez de facturar sin techo |
| GHCR en vez de ACR | `ci.yml` | el registry vive fuera del resource group y sobrevive a cada teardown |

Con los dos entornos levantados y sin tráfico, el gasto es de céntimos al mes, casi todo
de Log Analytics.

---

## Puesta en marcha

Requisitos: cuenta de Azure con crédito, `az` CLI ≥ 2.60, `gh` CLI, `jq`, Node 22+,
y un repositorio **público**.

1. **Frenos de mano.** Verifica el *spending limit* de la suscripción y crea un budget con
   alerta en Cost Management.
2. **Identidades.** Para cada entorno: resource group, app registration, service principal,
   credenciales federadas (formato inmutable y legado), rol `Contributor` acotado al grupo.
3. **GitHub.** Environments `staging` y `production` con sus secrets
   (`AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`) y variables
   (`AZURE_RESOURCE_GROUP`, `CONTAINER_APP_NAME`). En `production`, required reviewer y
   política de rama limitada a `main`.
4. **Labels.** `stage`, `spin up environment`, `destroy environment`.
5. **Infra inicial.** `az deployment group create` con el `.bicepparam` de cada entorno.

Los comandos exactos están en [`docs/cheatsheet.md`](docs/cheatsheet.md).

### Desarrollo local

```bash
cd app
npm ci
npm test                                          # 7 tests
APP_ENV=staging COMMIT_SHA=$(git rev-parse HEAD) npm start
```

### Infraestructura

```bash
az bicep build --file infra/main.bicep

az deployment group what-if \
  --resource-group rg-support-site-staging \
  --parameters infra/staging.bicepparam
```

---

## Verificar la cadena de procedencia

```bash
IMAGE=ghcr.io/mantoniocc/support-site

crane digest "${IMAGE}:${PR_SHA}"     # artefacto probado en staging
crane digest "${IMAGE}:latest"        # artefacto en producción
# idénticos

gh attestation verify oci://"${IMAGE}:latest" --repo mantoniocc/support-site
```

Que la attestation verifique sobre el tag de producción es la prueba criptográfica de que
no hubo reconstrucción entre staging y producción.

> En zsh usa siempre llaves: `"${IMAGE}:latest"`. Sin ellas, `:l` se interpreta como
> modificador de historia y corrompe la referencia.

---

## Limpieza

```bash
# Vaciar un resource group conservando el grupo y su RBAC
az deployment group create -g rg-support-site-staging \
  --template-file infra/teardown.bicep --mode Complete

# Botón rojo: borrar todo
az group delete --name rg-support-site-staging --yes --no-wait
az group delete --name rg-support-site-production --yes --no-wait
az ad app delete --id <appId-staging>
az ad app delete --id <appId-production>
```

---

## Estado

- [x] **Fase 1** — app, tests, contenedor
- [x] **Fase 2** — CI: tests, artifact con retención, imagen en GHCR, attestation
- [x] **Fase 3** — infraestructura en Bicep, desplegada a mano
- [x] **Fase 4** — identidad OIDC entre GitHub y Azure
- [x] **Fase 5** — CD a staging disparado por label de PR
- [x] **Fase 6** — producción con required reviewer y promoción por digest
- [ ] **Fase 7** — infra up/down por label, limpieza nocturna, badges
- [ ] **Fase 8** — rollback con revisions de Container Apps
- [ ] **Fase 9** — opcional: migrar de GHCR a ACR con identidad administrada

---

## Mapa al módulo de MS Learn

| Concepto del módulo | Implementación aquí |
|---|---|
| Disparar CD con labels de PR | `cd.yml`, `on: pull_request: types: [labeled, synchronize]` |
| ChatOps | `workflow_dispatch` con inputs |
| Condicional `if:` en jobs | `contains(github.event.pull_request.labels.*.name, 'stage')` |
| Secrets con credenciales de Azure | OIDC con credenciales federadas por entorno |
| `azure/login@v1` + `AZURE_CREDENTIALS` | `azure/login@v2` con `client-id` / `tenant-id` / `subscription-id` |
| `azure/docker-login@v1` a `docker.pkg.github.com` | `docker/login-action@v3` a `ghcr.io` con `GITHUB_TOKEN` |
| `azure/webapps-deploy@v1` | `az deployment group create` con Bicep |
| Crear/destruir recursos con `az` CLI | `infra/main.bicep`, `infra/teardown.bicep` |
| Retención de artifacts | `retention-days: 5` en `ci.yml` |
| Status badges | arriba |
| Protecciones de entorno | environment `production` con required reviewer |