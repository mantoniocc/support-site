# 0007. Etiquetar las imágenes con el head SHA del PR, no con el merge commit

- Estado: aceptada
- Fecha: 2026-07-29

## Contexto

En un evento `pull_request`, `github.sha` **no** es el commit de la rama: es el SHA de un
merge commit efímero que GitHub crea entre la rama y la base, y que vive en
`refs/pull/N/merge`.

Esto tiene consecuencias prácticas: el CI etiquetaría la imagen con un SHA y el CD, al
buscarla, usaría otro.

Vale la pena notar que `docker/metadata-action` —  la herramienta canónica para esto—
**usa el merge commit por defecto**, y expone la variable `DOCKER_METADATA_PR_HEAD_SHA` para
optar por el head SHA. Esa bandera existe precisamente por este problema.

## Decisión

Etiquetamos y horneamos `github.event.pull_request.head.sha`, con
`github.event.pull_request.head.sha || github.sha` como expresión para cubrir ambos eventos.

## Alternativas consideradas

**Usar `github.sha` (el default de la herramienta).** Tiene un argumento a favor legítimo:
lo que el CI **prueba** es el resultado de la fusión, que predice mejor cómo se comportará el
código una vez en `main`. Se descarta porque produce un artefacto etiquetado con un commit
que:

- no existe en la historia de nadie y no se puede recuperar con `git checkout`;
- **cambia sin que tú toques nada** si alguien mergea a la base mientras el PR está abierto;
- desaparece cuando GitHub regenera la ref.

## Consecuencias

**A favor**

- Los tags mapean a commits reales y recuperables.
- El tag es estable ante movimientos de la rama base.
- El CD puede encontrar la imagen que el CI construyó, porque ambos derivan el mismo valor.

**En contra**

- Se prueba el merge pero se etiqueta el head. Si la base se movió, el árbol probado no es
  exactamente el árbol del commit etiquetado. Es el intercambio consciente que la
  alternativa resuelve al revés.
- **Hay que ser consistente en todas las referencias.** En la primera implementación
  quedaron tres sitios apuntando al valor viejo: el resumen del job, el label
  `org.opencontainers.image.revision` y el `build-arg`. Un label mal puesto hace que la
  imagen y su attestation declaren un commit que no existe, lo que rompe la trazabilidad de
  forma silenciosa.
