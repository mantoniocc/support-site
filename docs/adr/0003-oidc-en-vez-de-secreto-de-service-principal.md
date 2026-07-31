# 0003. OIDC con credenciales federadas en vez de secreto de service principal

- Estado: aceptada
- Fecha: 2026-07-29

## Contexto

Los workflows necesitan autenticarse contra Azure para ejecutar despliegues.

El módulo de MS Learn genera un service principal con
`az ad sp create-for-rbac --sdk-auth`, guarda el JSON resultante —  que incluye un
`clientSecret`—  en el secret `AZURE_CREDENTIALS`, y se lo pasa a `azure/login@v1`.

## Decisión

Usamos **OpenID Connect con credenciales federadas**, una por entorno, con el subject
acotado a `environment:staging` y `environment:production`.

Registramos **dos credenciales por identidad**: el formato de subject inmutable y el legado.

## Alternativas consideradas

**Secreto de cliente (el enfoque del módulo).** Es una contraseña de larga duración: expira
sin avisar, hay que rotarla, y si se filtra funciona desde cualquier lugar del mundo hasta
que alguien la revoque. En un repositorio público el riesgo es mayor.

**Certificado en vez de secreto.** Elimina la contraseña en texto plano pero sigue siendo un
material criptográfico que hay que almacenar, distribuir y rotar.

## Consecuencias

**A favor**

- No se almacena ninguna credencial. Los tres valores en GitHub —  client, tenant y
  subscription ID —  no autorizan nada por sí solos.
- Los tokens caducan en aproximadamente una hora.
- El subject incluye el nombre del entorno, así que el permiso está atado al job concreto,
  no solo al repositorio. Es lo que permite que staging y producción tengan alcances
  distintos con el mismo YAML.

**En contra**

- El subject debe coincidir carácter por carácter. El modo de fallo es
  `AADSTS70021: No matching federated identity record found`, que no dice qué no coincidió.
- Los repositorios creados desde el 15 de julio de 2026 usan el formato inmutable
  `repo:OWNER@OWNER-ID/REPO@REPO-ID:environment:ENV`. Prácticamente todos los tutoriales de
  OIDC en circulación muestran el formato anterior y fallan. De ahí la decisión de registrar
  ambos.
- Cada job que se autentica necesita `permissions: id-token: write`. Olvidarlo produce el
  mismo error críptico.
- Renombrar o transferir el repositorio invalida las credenciales federadas.
