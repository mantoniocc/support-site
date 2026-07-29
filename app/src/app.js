import express from 'express';

/**
 * Metadatos del despliegue.
 *
 * Distincion importante para el laboratorio:
 *
 *   COMMIT_SHA / BUILD_TIME  -> se hornean en la IMAGEN durante el build (docker ARG -> ENV).
 *                               Son inmutables: la misma imagen siempre reporta lo mismo.
 *
 *   APP_ENV                  -> lo inyecta el CONTAINER APP en runtime (Bicep).
 *                               La misma imagen muestra "staging" o "production" segun donde corra.
 *
 * Ese es el principio de "build once, deploy many": promocionas el mismo artefacto
 * entre entornos, nunca reconstruyes para produccion.
 */
export function readDeploymentInfo(env = process.env) {
  return {
    appEnv: env.APP_ENV ?? 'local',
    commitSha: env.COMMIT_SHA ?? 'unknown',
    shortSha: (env.COMMIT_SHA ?? 'unknown').slice(0, 7),
    buildTime: env.BUILD_TIME ?? 'unknown',
    revision: env.CONTAINER_APP_REVISION ?? 'n/a',
    startedAt: new Date().toISOString(),
  };
}

const PALETTE = {
  production: { accent: '#3ddc97', label: 'PRODUCTION' },
  staging: { accent: '#f2a33c', label: 'STAGING' },
  local: { accent: '#6ea8ff', label: 'LOCAL' },
};

function renderPage(info) {
  const theme = PALETTE[info.appEnv] ?? PALETTE.local;

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${theme.label} - support-site</title>
<style>
  :root {
    --accent: ${theme.accent};
    --ink: #0f1216;
    --panel: #171c23;
    --line: #262d37;
    --text: #e8ecf2;
    --muted: #7b8698;
    --mono: ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 24px;
    background: var(--ink);
    color: var(--text);
    font-family: var(--mono);
    font-size: 14px;
    line-height: 1.5;
  }
  .panel {
    width: min(560px, 100%);
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 4px;
    overflow: hidden;
  }
  .banner {
    padding: 28px 24px 24px;
    border-bottom: 1px solid var(--line);
    border-left: 4px solid var(--accent);
  }
  .eyebrow {
    color: var(--muted);
    font-size: 11px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    margin: 0 0 10px;
  }
  .env {
    margin: 0;
    font-size: clamp(34px, 9vw, 54px);
    font-weight: 700;
    letter-spacing: -0.02em;
    color: var(--accent);
    line-height: 1;
  }
  dl { margin: 0; }
  .row {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    padding: 12px 24px;
    border-bottom: 1px solid var(--line);
  }
  .row:last-child { border-bottom: 0; }
  dt { color: var(--muted); font-size: 12px; letter-spacing: 0.04em; }
  dd { margin: 0; text-align: right; word-break: break-all; }
  .sha {
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    padding: 1px 7px;
    border-radius: 3px;
  }
  footer {
    width: min(560px, 100%);
    margin-top: 14px;
    color: var(--muted);
    font-size: 12px;
    display: flex;
    justify-content: space-between;
    gap: 12px;
  }
  a { color: var(--muted); }
  @media (prefers-reduced-motion: no-preference) {
    .panel { animation: rise 320ms cubic-bezier(.2,.7,.3,1) both; }
    @keyframes rise { from { opacity: 0; transform: translateY(8px); } }
  }
</style>
</head>
<body>
  <main>
    <div class="panel">
      <div class="banner">
        <p class="eyebrow">Sitio de soporte &middot; entorno desplegado &middot; v2</p>
        <h1 class="env">${theme.label}</h1>
      </div>
      <dl>
        <div class="row"><dt>Commit</dt><dd><span class="sha">${info.shortSha}</span></dd></div>
        <div class="row"><dt>Construido</dt><dd>${info.buildTime}</dd></div>
        <div class="row"><dt>Revision</dt><dd>${info.revision}</dd></div>
        <div class="row"><dt>Contenedor iniciado</dt><dd>${info.startedAt}</dd></div>
      </dl>
    </div>
    <footer>
      <span>support-site</span>
      <a href="/api/version">/api/version</a>
    </footer>
  </main>
</body>
</html>`;
}

export function createApp() {
  const app = express();

  // Sonda de liveness/readiness para Container Apps. Sin dependencias externas:
  // si el proceso responde, la replica esta sana.
  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  // Mismos datos que la pagina, en JSON. Lo usa el smoke test del workflow de CD
  // para verificar que el SHA desplegado es el que se acaba de construir.
  app.get('/api/version', (_req, res) => {
    res.status(200).json(readDeploymentInfo());
  });

  app.get('/', (_req, res) => {
    res.type('html').send(renderPage(readDeploymentInfo()));
  });

  app.use((_req, res) => {
    res.status(404).json({ error: 'not_found' });
  });

  return app;
}