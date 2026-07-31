# 0010. Vaciar el resource group en modo Complete, no borrarlo

- Estado: aceptada
- Fecha: 2026-07-29

## Contexto

El módulo de MS Learn insiste en destruir los recursos que ya no se usan, y define un job
`destroy-azure-resources` disparado por una label. Necesitamos un teardown que se pueda
ejecutar desde GitHub y que deje el ciclo listo para volver a levantar.

La restricción decisiva viene del ADR-0005: el service principal tiene rol `Contributor`
acotado al resource group. Puede borrar lo que hay dentro, pero **no puede crear resource
groups**, porque eso requiere permisos a nivel de suscripción.

## Decisión

El teardown despliega una plantilla Bicep **vacía** en modo `Complete`:

```bash
az deployment group create -g $RG --template-file infra/teardown.bicep --mode Complete
```

En modo Complete, ARM elimina del resource group todo recurso que no aparezca en la
plantilla. Como no hay ninguno, borra todo el contenido y conserva el grupo con sus
asignaciones de rol.

## Alternativas consideradas

**`az group delete`.** Lo obvio, y lo que uno escribiría primero. Se descarta porque borra
también las asignaciones de rol: tras el primer teardown, el service principal no podría
recrear el grupo y **el ciclo se rompería para siempre**. Habría que reejecutar el setup
manual cada vez.

**Comandos `az … delete` explícitos por recurso.** Legible y controlado, pero hay que
mantenerlo sincronizado a mano con el Bicep: cada recurso nuevo en la plantilla exige
recordar añadir su borrado. Con el modo Complete, cualquier cosa que no esté en la plantilla
desaparece automáticamente.

**Dar al service principal `Contributor` a nivel de suscripción** para que pueda recrear el
grupo. Anula el aislamiento del ADR-0005 por comodidad operativa.

## Consecuencias

**A favor**

- El ciclo levantar/destruir es repetible indefinidamente sin permisos de suscripción.
- El teardown se mantiene sincronizado con la plantilla por construcción, no por disciplina.
- `what-if` previsualiza exactamente qué se va a borrar antes de ejecutar.
- Combinado con el ADR-0006 —  desplegar es aprovisionar—  la recuperación es simplemente
  volver a desplegar.

**En contra**

- El modo `Complete` es genuinamente destructivo. **Siempre `what-if` primero**, y por eso
  hay un input de confirmación literal (`DESTRUIR`) en el disparo manual.
- El workspace de Log Analytics entra en soft-delete durante 14 días. Recrearlo con el mismo
  nombre en ese plazo lo recupera en vez de crear uno nuevo, lo que hace la primera
  recreación más rápida de lo esperado.
- El resource group y su RBAC persisten, así que "borrar todo de verdad" al terminar el
  laboratorio sigue siendo un paso manual aparte.
- Requiere que cada entorno tenga su propio resource group (ADR-0005): con ambos entornos en
  un mismo grupo, vaciar uno destruiría el otro.
