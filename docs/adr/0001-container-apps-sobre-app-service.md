# 0001. Azure Container Apps sobre App Service

- Estado: aceptada
- Fecha: 2026-07-29

## Contexto

El laboratorio replica un módulo de Microsoft Learn que despliega una imagen de contenedor
a **Azure Web Apps** (App Service). Necesitamos un destino de despliegue para contenedores.

Restricciones reales:

- Crédito de USD 200 en una cuenta de prueba, sin intención de gastarlo.
- El ciclo de estudio implica crear y destruir la infraestructura muchas veces.
- Queremos poder observar rollback entre versiones desplegadas.

## Decisión

Usamos **Azure Container Apps** con entorno de tipo Consumption.

## Alternativas consideradas

**App Service (Web App for Containers).** Es literalmente lo que hace el módulo, así que
tiene la máxima fidelidad al material de estudio. Se descarta porque el plan se factura por
hora aunque no reciba tráfico: con dos entornos levantados durante semanas, el gasto es
constante y no despreciable. El nivel gratuito no es adecuado para contenedores en este
escenario.

**Azure Kubernetes Service.** Demasiada superficie para el objetivo. El tiempo se iría en
Kubernetes, no en el pipeline.

**Azure Container Instances.** Escala a cero, pero no tiene revisiones, ni ingress
gestionado, ni el modelo de despliegue progresivo que queremos practicar.

## Consecuencias

**A favor**

- Escala a cero: sin tráfico, no hay cargo de cómputo. Es lo que hace viable dejar dos
  entornos levantados durante todo el laboratorio.
- Revisiones nativas y nombrables. Habilita el ejercicio de rollback sin infraestructura
  adicional.
- Es el modelo serverless-container actual; el aprendizaje transfiere mejor a Kubernetes.

**En contra**

- Nos apartamos de los comandos literales del módulo. Hay que traducir conceptos en vez de
  copiar pasos.
- Arranque en frío de 2 a 5 segundos con `minReplicas: 0`. Esto obligó a que todos los smoke
  tests del pipeline tengan bucle de reintentos (ver ADR-0011).
- Requiere un workspace de Log Analytics, que es el único componente de la arquitectura que
  factura por uso sin escalar a cero.
