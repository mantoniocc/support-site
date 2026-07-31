# 0006. Bicep declarativo en vez de comandos `az` imperativos

- Estado: aceptada
- Fecha: 2026-07-29

## Contexto

Hay que definir la infraestructura: workspace de Log Analytics, entorno de Container Apps y
la Container App.

El módulo de MS Learn lo hace con comandos encadenados dentro de un job —
`az group create`, `az appservice plan create`, `az webapp create`,
`az webapp config container set`—  cada uno con `if: success()` para depender del anterior.

## Decisión

Usamos **Bicep** con módulos, desplegado mediante `az deployment group create` y archivos
`.bicepparam` por entorno.

## Alternativas consideradas

**Comandos `az` imperativos (el enfoque del módulo).** No requiere aprender otro lenguaje y
es transparente paso a paso. Se descarta porque no hay estado declarado: el orden de
dependencias es manual, no hay previsualización de cambios, y no existe forma de preguntar
"¿en qué se diferencia lo que hay de lo que quiero?".

**Terraform.** Más portable entre nubes, pero exige un backend de estado remoto —  es decir,
infraestructura adicional (storage account, bloqueo) solo para sostener el laboratorio.
Bicep delega el estado a ARM y no necesita nada.

**ARM JSON.** Es lo que Bicep compila. Verboso hasta el punto de obstaculizar el
aprendizaje.

## Consecuencias

**A favor**

- El orden de creación se deduce de las dependencias entre módulos: el entorno consume el
  output del workspace, la app consume el del entorno. No hay `if: success()` encadenado.
- `az deployment group what-if` previsualiza qué se crea, modifica o **borra** antes de
  aplicar. Es la red de seguridad del teardown (ADR-0010).
- **Desplegar es aprovisionar.** Una plantilla declarativa reconcilia el estado real con el
  declarado, así que si el resource group está vacío, el mismo despliegue lo construye todo.
  Descubrimos esto en la práctica: tras un teardown, volver a poner la label `stage` recrea
  la infraestructura completa antes de desplegar. El módulo necesita un job de
  aprovisionamiento separado precisamente porque su enfoque imperativo no tiene esta
  propiedad.
- El modo `Complete` habilita el teardown mediante una plantilla vacía.
- La misma plantilla sirve para ambos entornos; la diferencia está en el `.bicepparam`.

**En contra**

- Un lenguaje más que aprender, con sus rarezas: `json()` para decimales porque Bicep no
  tiene tipo decimal nativo, y `existing` + `listKeys()` para leer secretos sin exponerlos.
- No hay detección de deriva automática: si alguien modifica un recurso desde el portal, no
  se sabe hasta ejecutar `what-if`.
- Cualquier cambio hecho con `az containerapp update` fuera del Bicep se revierte en el
  siguiente despliegue. Es correcto, pero sorprende la primera vez.
