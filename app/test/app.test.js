import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createApp, readDeploymentInfo } from '../src/app.js';

let server;
let baseUrl;

before(async () => {
  await new Promise((resolve) => {
    server = createApp().listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => server?.close());

describe('readDeploymentInfo', () => {
  it('usa "local" cuando no hay APP_ENV inyectado', () => {
    const info = readDeploymentInfo({});
    assert.equal(info.appEnv, 'local');
    assert.equal(info.commitSha, 'unknown');
  });

  it('acorta el SHA a 7 caracteres', () => {
    const info = readDeploymentInfo({ COMMIT_SHA: 'abcdef1234567890' });
    assert.equal(info.shortSha, 'abcdef1');
  });

  it('lee el entorno inyectado por el Container App', () => {
    const info = readDeploymentInfo({ APP_ENV: 'production' });
    assert.equal(info.appEnv, 'production');
  });
});

describe('endpoints', () => {
  it('GET /health responde 200 y estado ok', async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { status: 'ok' });
  });

  it('GET /api/version expone los metadatos del despliegue', async () => {
    const res = await fetch(`${baseUrl}/api/version`);
    assert.equal(res.status, 200);
    const body = await res.json();
    for (const key of ['appEnv', 'commitSha', 'shortSha', 'buildTime']) {
      assert.ok(key in body, `falta la clave ${key}`);
    }
  });

  it('GET / devuelve HTML con el nombre del entorno', async () => {
    const res = await fetch(`${baseUrl}/`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/html/);
    assert.match(await res.text(), /LOCAL/);
  });

  it('una ruta desconocida devuelve 404', async () => {
    const res = await fetch(`${baseUrl}/no-existe`);
    assert.equal(res.status, 404);
  });
});