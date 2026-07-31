# 0002. GitHub Container Registry sobre Azure Container Registry

- Estado: aceptada
- Fecha: 2026-07-29

## Contexto

Necesitamos un registry para las imágenes que construye el CI y que despliega Azure
Container Apps.

El módulo original publica en `docker.pkg.github.com`, un registry ya retirado. La opción
canónica en Azure sería Azure Container Registry.

## Decisión

Usamos **GitHub Container Registry** (`ghcr.io`) con el paquete en visibilidad pública.

## Alternativas consideradas

**Azure Container Registry (nivel Basic).** Es el patrón empresarial canónico en Azure:
Container Apps puede tirar imágenes con identidad administrada, sin credenciales en ningún
sitio. Cuesta USD 0,167 por día con 10 GB incluidos, lo que para todo el laboratorio son
unos USD 2. **El argumento económico contra ACR es débil** y no fue la razón del descarte.

**Docker Hub.** Límites de descarga en el nivel gratuito y ninguna integración con el
repositorio.

## Consecuencias

**A favor** — las razones reales, en orden de peso:

- **El registry sobrevive al teardown.** Vive fuera del resource group, así que destruir la
  infraestructura de Azure no borra las imágenes ni el historial de builds. Con ACR dentro
  del grupo, cada ciclo de destrucción obligaría a reconstruir.
- **Menos piezas de autenticación mientras se aprende.** El `GITHUB_TOKEN` ya existe en cada
  workflow: no hay que crear una credencial federada extra ni ejecutar `az acr login`. Se
  depura un solo mecanismo de auth (OIDC hacia Azure) en vez de dos.
- **Paquete público: Container Apps lo descarga sin credenciales.** El Bicep no necesita
  bloque `registries`, lo que elimina una categoría entera de errores 401 durante el
  aprendizaje.
- Attestations de procedencia nativas y gratuitas (`actions/attest-build-provenance`).
- Portabilidad: el mismo repositorio se puede redesplegar en otro proveedor sin tocar el
  registry.

**En contra**

- No se practica el patrón de identidad administrada contra el registry, que es lo que se
  usaría en una organización real en Azure. Queda diferido a una fase opcional.
- Las imágenes viven fuera del perímetro de red de Azure. Irrelevante en un laboratorio,
  relevante en producción real.
- La visibilidad pública del paquete depende de publicar con el label
  `org.opencontainers.image.source`. Sin ese label, el paquete nace privado y Container Apps
  falla al descargar con un error que no menciona permisos.
