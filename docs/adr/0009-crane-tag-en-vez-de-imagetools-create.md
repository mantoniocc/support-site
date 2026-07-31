# 0009. `crane tag` en vez de `docker buildx imagetools create`

- Estado: aceptada
- Enmienda a: [ADR-0008](0008-main-no-construye-promocion-por-digest.md)
- Fecha: 2026-07-29

## Contexto

El ADR-0008 establece que la promoción a producción reetiqueta un artefacto existente sin
reconstruirlo. La primera implementación usó `docker buildx imagetools create`, con una
aserción que verificaba que el digest no hubiera cambiado.

**La aserción falló.** Del log del run:

```
copying sha256:f9f184… from ghcr.io/…/support-site@sha256:f9f184…
pushing sha256:304698a2… to ghcr.io/…/support-site:main-3f80288
pushing sha256:304698a2… to ghcr.io/…/support-site:latest
```

Causa: **`imagetools create` no es un comando para etiquetar.** Construye *manifest lists*
—  índices OCI que agrupan variantes por plataforma. Aunque reciba un solo origen, hace lo
único que sabe hacer: crea un índice nuevo que envuelve el manifiesto y lo publica. Ese
índice es contenido distinto, así que tiene digest distinto.

La imagen del proyecto es de una sola plataforma y se construye con `provenance: false`, así
que el original es un manifiesto plano sin índice. `imagetools create` lo envolvió.

El contenido subyacente era idéntico —  mismas capas, misma config, el índice apunta al
manifiesto original—  pero la identidad de nivel superior cambió.

## Decisión

Usamos **`crane tag`**, que publica los mismos bytes de manifiesto bajo un nombre nuevo:
mismos bytes, mismo hash, mismo digest. El binario se descarga con versión fijada desde las
releases de `google/go-containerregistry`.

## Alternativas consideradas

**Mantener `imagetools create` y relajar la aserción** para comprobar que el índice nuevo
*referencia* el manifiesto original. Rechazada: los tags de producción apuntarían a un digest
distinto del que se despliega, lo que confunde al depurar y rompe la verificación de firmas.

**La API del registry con `curl`:** obtener el manifiesto y hacer `PUT` bajo el tag nuevo.
Sin dependencias externas y enseña el mecanismo del spec, pero requiere intercambiar el token
de GHCR a mano y manejar los media types. Más código para el mismo resultado.

**La action `imjasonh/setup-crane`.** Funciona, pero es de terceros y sin certificar. En un
repositorio público preferimos descargar el binario directamente del repositorio de Google
con versión fijada: cuatro líneas y una dependencia menos en la que confiar.

## Consecuencias

**A favor**

- El digest se preserva, así que la attestation emitida en el build del PR **sigue
  verificando** sobre el tag de producción. Sin eso, la cadena de procedencia se corta.
- El pipeline puede afirmar igualdad exacta de digest, que es la prueba de que no hubo
  reconstrucción.

**En contra**

- Un paso más de instalación en el runner (unos dos segundos).
- Una versión fijada más que mantener al día.

## Lección

El fallo era **silencioso por todos los caminos menos la aserción**: `docker pull` seguía
trayendo la imagen correcta, la app funcionaba, y nadie habría notado nada hasta que algo
dependiera del digest —  una auditoría, una verificación de firma, una política de admisión.

Regla resultante: **`imagetools create` construye índices, `crane tag` etiqueta.** Y de forma
más general: al promocionar artefactos, verificar la igualdad de digest en el propio
pipeline; es la única forma de detectar este tipo de error.
