# Cheatsheet — Azure CLI + GitHub CLI

Referencia de los comandos usados en el laboratorio **support-site** (Fases 0 a 4).
Organizada por tarea, no por orden cronológico, para que sirva de consulta rápida.

---

## Índice

1. [Variables de trabajo](#1-variables-de-trabajo)
2. [Sesión y contexto](#2-sesión-y-contexto)
3. [Resource groups](#3-resource-groups)
4. [Bicep y deployments](#4-bicep-y-deployments)
5. [Container Apps](#5-container-apps)
6. [Entra ID: identidades](#6-entra-id-identidades)
7. [Credenciales federadas (OIDC)](#7-credenciales-federadas-oidc)
8. [RBAC: asignación de roles](#8-rbac-asignación-de-roles)
9. [GitHub: environments, secrets y variables](#9-github-environments-secrets-y-variables)
10. [GitHub Actions: ejecutar y depurar](#10-github-actions-ejecutar-y-depurar)
11. [GHCR: imágenes y attestations](#11-ghcr-imágenes-y-attestations)
12. [Costos](#12-costos)
13. [Limpieza](#13-limpieza)
14. [Recetas de diagnóstico](#14-recetas-de-diagnóstico)
15. [Glosario de identificadores](#15-glosario-de-identificadores)

---

## 1. Variables de trabajo

Bloque para pegar al abrir una terminal nueva. Todo lo demás asume que estas variables existen.

```bash
# --- Azure ---
export LOCATION=brazilsouth
export RG=rg-support-site-staging
export APP_NAME=gh-support-site-staging
export CA_NAME=ca-support-site-staging

export SUBSCRIPTION_ID=$(az account show --query id -o tsv)
export TENANT_ID=$(az account show --query tenantId -o tsv)

# --- GitHub ---
export REPO_NWO=$(gh repo view --json nameWithOwner --jq .nameWithOwner)
export OWNER=${REPO_NWO%%/*}
export REPO=${REPO_NWO##*/}
export OWNER_ID=$(gh api repos/$REPO_NWO --jq .owner.id)
export REPO_ID=$(gh api repos/$REPO_NWO --jq .id)

# --- Git ---
export SHA=$(git rev-parse HEAD)
export SHORT_SHA=$(git rev-parse --short HEAD)

# --- Derivadas ---
export OWNER_LC=$(echo "$OWNER" | tr '[:upper:]' '[:lower:]')   # GHCR exige minúsculas
export IMAGE=ghcr.io/$OWNER_LC/support-site
```

Verificar que quedó todo:

```bash
env | grep -E '^(LOCATION|RG|APP_NAME|CA_NAME|SUBSCRIPTION_ID|TENANT_ID|REPO_NWO|OWNER_ID|REPO_ID|IMAGE)=' | sort
```

---

## 2. Sesión y contexto

### Azure

```bash
az login                                    # abre el navegador
az login --use-device-code                  # útil en SSH o WSL sin navegador

az account show --output table              # suscripción activa
az account list --output table              # todas las suscripciones
az account set --subscription "<nombre|id>" # cambiar de suscripción

az version                                  # versión del CLI (necesitas >= 2.60)
az upgrade                                  # actualizar
```

### GitHub

```bash
gh auth login
gh auth status                              # sesión y scopes del token
gh auth refresh -s read:packages,write:packages   # añadir scopes que falten

gh repo view                                # repo del directorio actual
gh repo view --json nameWithOwner,visibility,isPrivate --jq .
```

### Regiones disponibles

```bash
# ¿Dónde hay Container Apps?
az provider show --namespace Microsoft.App \
  --query "resourceTypes[?resourceType=='managedEnvironments'].locations[]" \
  --output tsv | sort

# Todas las regiones con su nombre corto
az account list-locations --query "[].{nombre:name, display:displayName}" -o table
```

---

## 3. Resource groups

```bash
az group create --name $RG --location $LOCATION \
  --tags project=support-site environment=staging lab=github-actions-cd

az group list --output table
az group show --name $RG --output table
az group exists --name $RG                  # devuelve true/false

export RG_ID=$(az group show --name $RG --query id -o tsv)

# Qué hay dentro
az resource list --resource-group $RG \
  --query "[].{nombre:name, tipo:type, region:location}" -o table
```

---

## 4. Bicep y deployments

### Compilar y validar

```bash
az bicep install                            # instalar
az bicep upgrade                            # actualizar
az bicep version

az bicep build --file infra/main.bicep      # genera main.json (ARM)
az bicep lint  --file infra/main.bicep      # solo avisos, sin generar archivo
az bicep format --file infra/main.bicep     # formatea in-place
```

### Previsualizar (siempre antes de aplicar)

```bash
az deployment group what-if \
  --resource-group $RG \
  --parameters infra/staging.bicepparam
```

Lectura de la salida: `+ Create`, `~ Modify`, `- Delete`, `= NoChange`, `! Deploy` (sin datos suficientes para predecir).

### Desplegar

```bash
# Con .bicepparam NO se pasa --template-file: el `using` ya lo declara.
az deployment group create \
  --resource-group $RG \
  --name staging-$SHORT_SHA \
  --parameters infra/staging.bicepparam \
  --parameters containerImage=$IMAGE:$SHA revisionSuffix=$SHORT_SHA \
  --query properties.outputs.appUrl.value -o tsv
```

Variantes útiles:

```bash
--mode Incremental      # por defecto: añade y modifica, nunca borra
--mode Complete         # borra del RG todo lo que no esté en la plantilla
--no-wait               # no bloquear la terminal
--confirm-with-what-if  # muestra el what-if y pide confirmación
```

### Historial de deployments

```bash
az deployment group list --resource-group $RG \
  --query "[].{nombre:name, estado:properties.provisioningState, cuando:properties.timestamp}" \
  -o table

az deployment group show --resource-group $RG --name staging-$SHORT_SHA \
  --query properties.outputs

# Ver el error de un deployment fallido
az deployment group show --resource-group $RG --name <nombre> \
  --query properties.error
```

### Recuperar un output sin volver a desplegar

```bash
az deployment group show --resource-group $RG --name staging-$SHORT_SHA \
  --query properties.outputs.appUrl.value -o tsv
```

---

## 5. Container Apps

### Estado

```bash
az containerapp show -n $CA_NAME -g $RG \
  --query "{nombre:name, revision:properties.latestRevisionName, url:properties.configuration.ingress.fqdn}" \
  -o table

# Solo la URL
export APP_URL=https://$(az containerapp show -n $CA_NAME -g $RG \
  --query properties.configuration.ingress.fqdn -o tsv)
echo $APP_URL

curl -s $APP_URL/api/version | jq
curl -s -o /dev/null -w '%{http_code}\n' $APP_URL/health
```

### Revisiones

```bash
az containerapp revision list -n $CA_NAME -g $RG \
  --query "[].{revision:name, activa:properties.active, replicas:properties.replicas, imagen:properties.template.containers[0].image, creada:properties.createdTime}" \
  -o table

az containerapp revision show -n $CA_NAME -g $RG --revision <nombre-revision>
az containerapp revision restart -n $CA_NAME -g $RG --revision <nombre-revision>
az containerapp revision deactivate -n $CA_NAME -g $RG --revision <nombre-revision>
az containerapp revision activate   -n $CA_NAME -g $RG --revision <nombre-revision>
```

### Réplicas (¿escaló a cero?)

```bash
az containerapp replica list -n $CA_NAME -g $RG -o table
```

Lista vacía = cero réplicas = cero costo de cómputo. Es lo esperado sin tráfico.

### Logs

```bash
az containerapp logs show -n $CA_NAME -g $RG --tail 50
az containerapp logs show -n $CA_NAME -g $RG --follow          # streaming
az containerapp logs show -n $CA_NAME -g $RG --type system     # eventos de la plataforma
```

> `--type system` es lo que revela fallos de arranque: puerto equivocado, probe que
> no responde, imagen que no se pudo descargar. Los logs de la app no muestran nada
> de eso porque el contenedor puede estar sano y ser la plataforma la que no lo alcanza.

### Actualizar solo la imagen (sin Bicep)

```bash
az containerapp update -n $CA_NAME -g $RG \
  --image $IMAGE:$SHA \
  --revision-suffix $SHORT_SHA
```

Útil para pruebas rápidas. **No lo uses como método oficial de despliegue**: introduce
deriva respecto al Bicep, y el siguiente `deployment group create` la revierte.

---

## 6. Entra ID: identidades

### Crear

```bash
export APP_ID=$(az ad app create --display-name $APP_NAME --query appId -o tsv)

az ad sp create --id $APP_ID --output none
sleep 10                                    # Entra replica con retraso

export SP_OBJECT_ID=$(az ad sp show --id $APP_ID --query id -o tsv)
```

### Consultar

```bash
az ad app list --display-name $APP_NAME \
  --query "[].{nombre:displayName, appId:appId, objectId:id}" -o table

az ad app show --id $APP_ID --query "{nombre:displayName, appId:appId}" -o table
az ad sp show  --id $APP_ID --query "{nombre:displayName, objectId:id}"  -o table

# Recuperar el appId si perdiste la variable
export APP_ID=$(az ad app list --display-name $APP_NAME --query "[0].appId" -o tsv)
```

### Borrar

```bash
az ad app delete --id $APP_ID    # arrastra el SP y sus credenciales federadas
```

> **Lo que NO usamos:** `az ad sp create-for-rbac --sdk-auth`. Ese comando genera un
> `clientSecret` y es el enfoque del módulo de MS Learn. Con OIDC no hay secreto que crear.

---

## 7. Credenciales federadas (OIDC)

### Construir el subject

```bash
# Formato INMUTABLE (repos creados desde el 15-jul-2026, o renombrados/transferidos después)
export SUBJECT="repo:${OWNER}@${OWNER_ID}/${REPO}@${REPO_ID}:environment:staging"

# Formato LEGADO (repos anteriores que no hayan optado por el nuevo)
export SUBJECT_LEGACY="repo:${OWNER}/${REPO}:environment:staging"
```

Formas del `sub` según cómo esté configurado el job:

| Situación del job | `sub` emitido |
|---|---|
| Declara `environment: staging` | `...:environment:staging` |
| Sin environment, disparado por PR | `...:pull_request` |
| Sin environment, push a rama | `...:ref:refs/heads/main` |
| Sin environment, tag | `...:ref:refs/tags/v1.0.0` |

El environment **gana sobre todo lo demás**: si el job lo declara, da igual qué evento lo disparó.

### Crear

```bash
crear_credencial() {
  az ad app federated-credential create --id $APP_ID --parameters "$(jq -nc \
    --arg name "$1" --arg subject "$2" \
    '{ name: $name,
       issuer: "https://token.actions.githubusercontent.com",
       subject: $subject,
       audiences: ["api://AzureADTokenExchange"] }')" --output none
  echo "creada: $1 -> $2"
}

crear_credencial "gh-staging-immutable" "$SUBJECT"
crear_credencial "gh-staging-legacy"    "$SUBJECT_LEGACY"
```

### Consultar y borrar

```bash
az ad app federated-credential list --id $APP_ID \
  --query "[].{nombre:name, subject:subject, issuer:issuer}" -o table

az ad app federated-credential delete --id $APP_ID --federated-credential-id <nombre>
```

Límite: 20 credenciales federadas por app registration.

### Inspeccionar el token que emite GitHub

Paso para pegar en un workflow **antes** del `azure/login`, cuando el subject no calza:

```yaml
- name: Inspeccionar claims del token OIDC
  shell: bash
  env:
    AUDIENCE: api://AzureADTokenExchange
  run: |
    set -euo pipefail
    RESPONSE=$(curl --fail-with-body --silent --show-error \
      --header "Authorization: Bearer ${ACTIONS_ID_TOKEN_REQUEST_TOKEN}" \
      "${ACTIONS_ID_TOKEN_REQUEST_URL}&audience=${AUDIENCE}")
    TOKEN=$(jq -r '.value' <<< "$RESPONSE")
    PAYLOAD=$(cut -d '.' -f 2 <<< "$TOKEN")
    PAYLOAD="${PAYLOAD//-/+}"; PAYLOAD="${PAYLOAD//_//}"
    case $((${#PAYLOAD} % 4)) in
      2) PAYLOAD="${PAYLOAD}==" ;;
      3) PAYLOAD="${PAYLOAD}=" ;;
    esac
    printf '%s' "$PAYLOAD" | base64 --decode | jq
```

Requiere `permissions: id-token: write` en el job. Quítalo cuando termines de depurar.

---

## 8. RBAC: asignación de roles

```bash
export RG_ID=$(az group show --name $RG --query id -o tsv)

az role assignment create \
  --assignee-object-id $SP_OBJECT_ID \
  --assignee-principal-type ServicePrincipal \
  --role Contributor \
  --scope $RG_ID
```

> Usa `--assignee-object-id` + `--assignee-principal-type`, no `--assignee`. Con un
> service principal recién creado, `--assignee` falla por replicación de Entra.

### Verificar el alcance

```bash
az role assignment list --assignee $SP_OBJECT_ID --all \
  --query "[].{rol:roleDefinitionName, alcance:scope}" -o table
```

El alcance debe terminar en `/resourceGroups/rg-support-site-staging`.
Si ves solo `/subscriptions/<id>`, quedó a nivel de suscripción: bórralo y rehazlo.

### Borrar

```bash
az role assignment delete --assignee $SP_OBJECT_ID --scope $RG_ID --role Contributor
```

### Roles útiles y su alcance típico

| Rol | Para qué |
|---|---|
| `Contributor` | crear/modificar/borrar recursos; **no** asigna roles |
| `Reader` | solo lectura |
| `AcrPull` | descargar imágenes de ACR (Fase 9) |
| `User Access Administrator` | asignar roles — evítalo salvo necesidad real |

---

## 9. GitHub: environments, secrets y variables

### Environments

```bash
gh api -X PUT repos/$REPO_NWO/environments/staging --silent
gh api repos/$REPO_NWO/environments --jq '.environments[].name'

# Con required reviewer (solo repos públicos en plan Free)
gh api -X PUT repos/$REPO_NWO/environments/production --input - <<EOF
{
  "wait_timer": 0,
  "prevent_self_review": false,
  "reviewers": [{ "type": "User", "id": $(gh api user --jq .id) }],
  "deployment_branch_policy": { "protected_branches": true, "custom_branch_policies": false }
}
EOF

gh api -X DELETE repos/$REPO_NWO/environments/staging
```

### Secrets (enmascarados en los logs)

```bash
gh secret set AZURE_CLIENT_ID --env staging --body "$APP_ID"
gh secret set AZURE_CLIENT_ID --env staging < archivo.txt      # desde archivo
gh secret set AZURE_CLIENT_ID --env staging                     # pregunta interactivamente

gh secret list --env staging
gh secret delete AZURE_CLIENT_ID --env staging
```

### Variables (visibles en claro)

```bash
gh variable set AZURE_RESOURCE_GROUP --env staging --body "$RG"
gh variable list --env staging
gh variable delete AZURE_RESOURCE_GROUP --env staging
```

Sin `--env` aplican a todo el repositorio. Con `--env` son del entorno, que es lo que
permite tener el mismo YAML apuntando a suscripciones o grupos distintos.

| | Secrets | Variables |
|---|---|---|
| En los logs | `***` | valor visible |
| Se pueden leer después | no | sí |
| Uso en YAML | `${{ secrets.X }}` | `${{ vars.X }}` |
| Para qué | IDs de Azure, tokens | nombres de RG, regiones, nombres de app |

### Labels

```bash
gh label create "stage" --color f2a33c --description "Despliega este PR a staging"
gh label list
gh label delete "stage" --yes
```

---

## 10. GitHub Actions: ejecutar y depurar

```bash
gh workflow list
gh workflow view ci.yml
gh workflow run "Probar login OIDC"
gh workflow run cd.yml -f environment=staging -f image_tag=abc123   # con inputs

gh run list --limit 10
gh run list --workflow=ci.yml --limit 5
gh run watch                                # sigue el run más reciente en vivo
gh run view <run-id>
gh run view <run-id> --log                  # log completo
gh run view <run-id> --log-failed           # solo los pasos fallidos
gh run rerun <run-id>
gh run rerun <run-id> --failed              # solo re-ejecuta los jobs fallidos
gh run cancel <run-id>
```

### Artifacts

```bash
gh run download <run-id>
gh run download <run-id> -n test-results-<run-id>

gh api repos/$REPO_NWO/actions/artifacts \
  --jq '.artifacts[] | {name, size_in_bytes, expires_at}'

gh api -X DELETE repos/$REPO_NWO/actions/artifacts/<artifact-id>
```

### Logs de depuración

Activar el modo verboso sin tocar el YAML:

```bash
gh variable set ACTIONS_STEP_DEBUG --body true
gh variable set ACTIONS_RUNNER_DEBUG --body true
```

Desactivar al terminar: `gh variable delete ACTIONS_STEP_DEBUG`.

### Deployments (los crea el uso de `environment:`)

```bash
gh api repos/$REPO_NWO/deployments \
  --jq '.[] | {id, environment, ref, created_at}'

gh api repos/$REPO_NWO/deployments/<id>/statuses \
  --jq '.[] | {state, environment_url, created_at}'
```

---

## 11. GHCR: imágenes y attestations

```bash
# Pull anónimo: confirma que el paquete es público
docker logout ghcr.io
docker pull $IMAGE:latest

docker run --rm -p 3000:3000 -e APP_ENV=staging $IMAGE:$SHA

# Inspeccionar sin descargar entera
docker buildx imagetools inspect $IMAGE:$SHA
```

### Verificar la firma de procedencia

```bash
gh attestation verify oci://$IMAGE:$SHA --repo $REPO_NWO
```

### Gestionar versiones del paquete

```bash
gh api "users/$OWNER/packages/container/support-site/versions" \
  --jq '.[] | {id, tags: .metadata.container.tags, created_at}'

gh api -X DELETE "users/$OWNER/packages/container/support-site/versions/<version-id>"
```

Visibilidad: se cambia por web en
`https://github.com/users/$OWNER/packages/container/support-site/settings`.

> La imagen hereda la visibilidad del repo **solo si** se publicó con el label
> `org.opencontainers.image.source` apuntando al repo. Sin ese label nace privada.

---

## 12. Costos

```bash
az consumption usage list \
  --start-date $(date -u -d '7 days ago' +%Y-%m-%d) \
  --end-date   $(date -u +%Y-%m-%d) \
  --query "[].{recurso:instanceName, costo:pretaxCost, moneda:currency}" -o table

# Agrupado por recurso
az consumption usage list \
  --start-date $(date -u -d '30 days ago' +%Y-%m-%d) \
  --end-date $(date -u +%Y-%m-%d) \
  --query "[].{r:instanceName, c:pretaxCost}" -o json \
  | jq -r 'group_by(.r)[] | {recurso: .[0].r, total: (map(.c|tonumber)|add)}'
```

Los datos tardan hasta 24 h en aparecer. Presupuestos y límite de gasto se configuran
por portal: *Cost Management → Budgets* y *Subscriptions → Spending limit*.

**Las tres decisiones de costo del laboratorio:**

| Decisión | Dónde | Efecto |
|---|---|---|
| Sin `workloadProfiles` | `container-app-environment.bicep` | entorno Consumption puro, sin costo base por hora |
| `minReplicas: 0` | `container-app.bicep` | escala a cero, sin cargo de cómputo sin tráfico |
| `dailyQuotaGb` | `log-analytics.bicep` | tope de ingesta; corta en vez de facturar sin techo |

---

## 13. Limpieza

### Vaciar el RG conservando grupo y RBAC (ciclo diario)

```bash
az deployment group create \
  --resource-group $RG \
  --template-file infra/teardown.bicep \
  --mode Complete
```

Complete borra del grupo todo lo que no esté en la plantilla; como está vacía, borra todo
el contenido. El grupo y sus asignaciones de rol sobreviven, así que el siguiente
despliegue funciona sin permisos de suscripción.

> Log Analytics entra en soft-delete 14 días. Recrear con el mismo nombre lo recupera.

### Botón rojo (fin del laboratorio)

```bash
az group delete --name $RG --yes --no-wait
az ad app delete --id $APP_ID

gh api -X DELETE repos/$REPO_NWO/environments/staging
gh api -X DELETE repos/$REPO_NWO/environments/production
```

### Verificar que no quedó nada facturando

```bash
az group list --output table
az resource list --query "[].{nombre:name, tipo:type, grupo:resourceGroup}" -o table
az ad app list --display-name gh-support-site --query "[].displayName" -o tsv
```

---

## 14. Recetas de diagnóstico

### La app no responde o devuelve 502

```bash
az containerapp revision list -n $CA_NAME -g $RG \
  --query "[].{rev:name, activa:properties.active, replicas:properties.replicas, estado:properties.runningState}" -o table

az containerapp logs show -n $CA_NAME -g $RG --type system --tail 50
az containerapp logs show -n $CA_NAME -g $RG --tail 50
```

Causas frecuentes:

| Síntoma | Causa probable |
|---|---|
| Réplica que nunca pasa a *Running* | `targetPort` ≠ puerto donde escucha el contenedor |
| Readiness fallando en bucle | la ruta de la probe no existe (404) |
| `ImagePullBackOff` o similar | paquete privado en GHCR, o tag inexistente |
| Arranca y muere de inmediato | falta una variable de entorno obligatoria |

### El deployment de Bicep falla

```bash
az deployment group show --resource-group $RG --name <nombre> --query properties.error
az deployment operation group list --resource-group $RG --name <nombre> \
  --query "[?properties.provisioningState=='Failed'].{recurso:properties.targetResource.resourceName, error:properties.statusMessage}"
```

### `AADSTS70021: No matching federated identity record found`

El subject del token no coincide con ninguna credencial federada. Compara ambos lados:

```bash
# Lo que espera Azure
az ad app federated-credential list --id $APP_ID --query "[].subject" -o tsv

# Lo que emite GitHub: añade el paso de inspección de claims (sección 7)
```

Causas, en orden de frecuencia:

1. El job no declara `environment:`, o lo escribe con distinta capitalización
2. Formato legado vs inmutable (`@OWNER_ID` / `@REPO_ID`)
3. Falta `permissions: id-token: write` en el job
4. El repo se renombró o transfirió después de crear la credencial

### `AuthorizationFailed` al ejecutar `az` desde el workflow

El login funcionó pero falta el rol o el alcance es incorrecto:

```bash
az role assignment list --assignee $SP_OBJECT_ID --all \
  --query "[].{rol:roleDefinitionName, alcance:scope}" -o table
```

### El push a GHCR falla con `denied` o `unauthorized`

1. ¿El job tiene `permissions: packages: write`?
2. ¿El nombre de la imagen está en minúsculas? (`${VAR,,}` en bash)
3. ¿Es un PR desde un fork? No reciben permiso de escritura por diseño.

---

## 15. Glosario de identificadores

| Nombre | De dónde sale | Dónde se usa | Es secreto |
|---|---|---|---|
| **appId** (client ID) | `az ad app create --query appId` | `AZURE_CLIENT_ID` | no |
| **object ID** (del SP) | `az ad sp show --id $APP_ID --query id` | asignaciones de rol | no |
| **tenant ID** | `az account show --query tenantId` | `AZURE_TENANT_ID` | no |
| **subscription ID** | `az account show --query id` | `AZURE_SUBSCRIPTION_ID` | no |
| **subject (OIDC)** | construido a mano | credencial federada | no |
| **shared key** de Log Analytics | `listKeys()` dentro de Bicep | nunca sale de ARM | **sí** |

**appId vs object ID** es la confusión más común. La *app registration* es la definición
de la identidad y su `appId` es lo que va en el workflow. El *service principal* es su
materialización en tu tenant y su `id` (object ID) es lo que recibe los roles. Son objetos
distintos con IDs distintos, y hacen falta los dos.

Ninguno de los cuatro primeros es un secreto por sí solo: sin la credencial federada
—que exige una firma de GitHub sobre un subject exacto— no autorizan nada. Se guardan
como secrets por higiene, no por necesidad criptográfica.
