# 0008. `main` no construye: producción recibe el artefacto promocionado

- Estado: aceptada, enmendada por [ADR-0009](0009-crane-tag-en-vez-de-imagetools-create.md)
  en el mecanismo de reetiquetado
- Fecha: 2026-07-29

## Contexto

Al cerrar un PR con squash merge, GitHub crea un commit nuevo en `main` con un SHA que no
existía antes; la rama original desaparece de la historia. Esto ocurre con cualquier
estrategia: squash reescribe, rebase reescribe, y un merge commit tiene su propio SHA.
**El HEAD de `main` nunca coincide con el head del PR.**

Si el CI construyera al hacer push a `main`, producción recibiría una imagen distinta de la
probada en staging. No solo distinta de nombre: distinta de contenido, porque `COMMIT_SHA` y
`BUILD_TIME` se hornean dentro. Otro digest, otro artefacto.

Sería un pipeline que declara *build once, deploy many* mientras hace *build twice, hope
they match*.

## Decisión

Las imágenes **solo se construyen en pull requests**. Al mergear a `main`, `promote.yml`:

1. resuelve el PR de origen con `GET /repos/{owner}/{repo}/commits/{sha}/pulls`;
2. obtiene el **digest** de la imagen construida para ese head SHA;
3. reetiqueta sin reconstruir;
4. despliega a producción **por digest**, no por tag.

## Alternativas consideradas

**Reconstruir en `main`.** Es lo que hace mucha gente y es defendible: el código fuente es
equivalente y el artefacto corresponde a un commit que existe en la historia. Se descarta
porque despliega a producción un binario que nadie probó nunca. Si el build no es
reproducible —  caché envenenada, dependencia transitiva que se movió, imagen base
reetiquetada entre ambos builds—  se descubre en producción.

**Etiquetar una release y construir desde el tag.** Mismo problema con un paso más.

## Consecuencias

**A favor**

- *Build once, deploy many* de forma literal y verificable.
- La attestation de procedencia generada en el build del PR sigue siendo válida en
  producción, porque el digest no cambia.
- Desplegar por digest elimina toda ambigüedad sobre qué está corriendo.

**En contra**

- Depende del endpoint que asocia commits con PRs. Si el índice tarda, `resolve` falla y hay
  que reintentar.
- En producción, `/api/version` reporta el commit del PR, no el de `main`. **Es correcto y
  deseable**: el artefacto declara honestamente de qué código se construyó. Pero sorprende.
- Un **push directo a `main` no tiene PR de origen** y hace fallar el workflow. El estado hay
  que volverlo inalcanzable con un ruleset que exija PR, no manejarlo con un condicional.
- Los filtros de ruta de `ci.yml` y `promote.yml` deben ser coherentes: si el CI se salta un
  PR y no construye imagen, `promote` no encontrará artefacto que promocionar.
- El badge de CI necesita `?event=pull_request`, porque ya no hay runs en la rama por
  defecto.
