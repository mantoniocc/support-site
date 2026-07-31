# 0011. Escalado a cero, Consumption puro y tope de ingesta de logs

- Estado: aceptada
- Fecha: 2026-07-29

## Contexto

El laboratorio corre sobre un crédito de prueba de USD 200 y va a estar levantado durante
semanas, con dos entornos y ciclos repetidos de creación y destrucción.

La mayoría de los ejemplos de Bicep para Container Apps que circulan están pensados para
producción empresarial e incluyen configuraciones que facturan por hora.

## Decisión

Tres ajustes deliberados:

| Ajuste | Dónde | Efecto |
|---|---|---|
| Sin bloque `workloadProfiles` | `container-app-environment.bicep` | entorno Consumption puro, sin costo base por hora |
| `minReplicas: 0` | `container-app.bicep` | escala a cero: sin tráfico, no hay cargo de cómputo |
| `workspaceCapping.dailyQuotaGb` | `log-analytics.bicep` | tope de ingesta diaria de logs |

## Alternativas consideradas

**Entorno con workload profiles dedicados.** Necesario para integración con VNet, tamaños
mayores o aislamiento de cómputo. Factura por hora aunque la aplicación no reciba una sola
petición. Innecesario aquí.

**`minReplicas: 1`.** Elimina el arranque en frío, a cambio de facturar cómputo de forma
continua. Es lo que se elegiría en una producción real con tráfico esperado.

**Sin tope de ingesta.** El costo de logs quedaría sin techo. Un contenedor en bucle de
reinicio puede generar un volumen sorprendente en pocas horas.

## Consecuencias

**A favor**

- El gasto real es de céntimos al mes con ambos entornos levantados, casi todo de Log
  Analytics. Eso permite dejarlo todo encendido y experimentar sin ansiedad de costo.
- Si algo se desmadra generando logs, la ingesta se corta al llegar al tope y se reanuda al
  día siguiente, en vez de facturar sin límite.

**En contra**

- **Arranque en frío de 2 a 5 segundos.** Esto moldeó el diseño del pipeline: todos los smoke
  tests necesitan bucle de reintentos contra `/api/version`, porque la primera petición tras
  un despliegue tiene que levantar una réplica desde cero. No es un detalle de
  implementación; es una consecuencia arquitectónica de esta decisión.
- Si se alcanza el tope de ingesta, se pierden logs sin aviso evidente. Aceptable en un
  laboratorio, inaceptable en producción.
- **Producción con `minReplicas: 0` no es una configuración de producción realista.** Está
  así por presupuesto, no por diseño. Es la divergencia más grande entre este laboratorio y un
  despliegue real, y conviene tenerla presente al extrapolar.
