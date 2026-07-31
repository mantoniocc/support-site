# 0004. Repositorio público

- Estado: aceptada
- Fecha: 2026-07-29

## Contexto

Uno de los objetivos de aprendizaje es observar las **protecciones de entorno** de GitHub:
un job detenido esperando aprobación humana antes de tocar producción.

En planes GitHub Free, Pro y Team, el *wait timer* y los *required reviewers* solo están
disponibles en repositorios públicos. En plan Free, los entornos en sí solo existen en repos
públicos. Únicamente Enterprise los ofrece en repositorios privados.

## Decisión

El repositorio es **público**.

## Alternativas consideradas

**Privado con GitHub Pro.** Habilita entornos, secrets de entorno y políticas de rama en
repos privados, pero **no** los required reviewers ni el wait timer. Se pagaría una
suscripción sin obtener la característica que motivaba el laboratorio.

**Privado, simulando el gate con un `workflow_dispatch` manual.** Reproduce la forma
—  alguien pulsa un botón—  pero no el mecanismo: no habría deployment registrado, ni
bloqueo antes de la emisión del token, ni separación entre quien escribe el YAML y quien
autoriza. Se aprendería la coreografía sin la lección.

**Enterprise.** Desproporcionado para un laboratorio personal.

## Consecuencias

**A favor**

- El gate de aprobación es observable de verdad: job en `waiting`, deployment registrado,
  y nada emitido hacia Azure hasta la aprobación.
- Minutos de Actions ilimitados, lo que importa cuando se itera decenas de veces al día.
- Los paquetes en GHCR heredan la visibilidad pública, así que Container Apps descarga sin
  credenciales (ver ADR-0002).

**En contra —  y sus mitigaciones**

El código, los workflows y los logs de ejecución son visibles para cualquiera. Las
mitigaciones adoptadas:

- Subject de OIDC acotado por entorno: un fork o una rama arbitraria no pueden obtener un
  token válido (ADR-0003).
- Rol `Contributor` limitado al resource group, nunca a la suscripción (ADR-0005).
- `Require approval for all external contributors` activado.
- Se usa `pull_request`, nunca `pull_request_target` con checkout del código del PR.
- Los PRs desde forks construyen pero no publican ni despliegan.
- La aplicación es un juguete: sin datos reales ni información sensible en el historial.
- Secret scanning con push protection, activo por defecto en repos públicos.

**Riesgo latente:** convertir el repositorio a privado **desactiva silenciosamente** las
reglas de protección y los secrets de entorno ya configurados. El pipeline seguiría
funcionando, pero desplegaría a producción sin pedir aprobación.
