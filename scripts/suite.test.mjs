import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createSuiteServer } from './serve-suite.mjs';
import { createBuildInvocation, normalizeBasePath } from './build-suite.mjs';

test('base paths normalize and reject traversal or URL syntax', () => {
  assert.equal(normalizeBasePath('/'), '/');
  assert.equal(normalizeBasePath('/nested'), '/nested/');
  assert.equal(normalizeBasePath('/nested/path/'), '/nested/path/');
  for (const value of ['nested/', '//host/', '/a/../b/', '/a/%2e%2e/', '/a//b/', '/a/?x=1', '/a\\b/']) {
    assert.throws(() => normalizeBasePath(value), undefined, `expected ${value} to be rejected`);
  }
});

test('nested app bases remain distinct from the shared suite base', () => {
  const invocation = createBuildInvocation('playground', 'N:/suite-stage/playground', '/nested/playground/', '/nested/');
  assert.ok(invocation.args.includes('--base=/nested/playground/'));
  assert.equal(invocation.env.ASRJS_SUITE_BASE, '/nested/');
  assert.throws(() => createBuildInvocation('playground', 'out', '/nested/playground/', '/nested/playground/'));
});

async function withServer(run, base = '/') {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'asrjs-suite-test-'));
  await fs.mkdir(path.join(root, 'showcase'), { recursive: true });
  await fs.writeFile(path.join(root, 'index.html'), '<main>portal</main>');
  await fs.writeFile(path.join(root, 'showcase', 'index.html'), '<main>showcase</main>');
  await fs.writeFile(path.join(root, 'showcase', 'engine.mjs'), 'export default 1;');
  await fs.writeFile(path.join(root, 'showcase', 'runtime.wasm'), Buffer.from([0, 97, 115, 109]));
  const server = createSuiteServer({ root, base });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  try { await run(`http://127.0.0.1:${address.port}`, root); }
  finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await fs.rm(root, { recursive: true, force: true });
  }
}

function rawGet(origin, requestPath, method = 'GET') {
  return new Promise((resolve, reject) => {
    const url = new URL(origin);
    const req = http.request({ hostname: url.hostname, port: url.port, path: requestPath, method }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('static server serves portal and nested routes with isolation headers and MIME types', async () => {
  await withServer(async (origin) => {
    const page = await rawGet(origin, '/');
    assert.equal(page.status, 200);
    assert.match(page.body, /portal/);
    assert.equal(page.headers['cross-origin-opener-policy'], 'same-origin');
    assert.equal(page.headers['cross-origin-embedder-policy'], 'require-corp');
    assert.equal(page.headers['cross-origin-resource-policy'], 'same-origin');

    const app = await rawGet(origin, '/showcase/');
    assert.equal(app.status, 200);
    assert.match(app.body, /showcase/);
    assert.equal((await rawGet(origin, '/showcase/engine.mjs')).headers['content-type'], 'text/javascript; charset=utf-8');
    assert.equal((await rawGet(origin, '/showcase/runtime.wasm')).headers['content-type'], 'application/wasm');
    const slashRedirect = await rawGet(origin, '/showcase');
    assert.equal(slashRedirect.status, 308);
    assert.equal(slashRedirect.headers.location, '/showcase/');
  });
});

test('nested base routing redirects its bare path and serves app subpaths', async () => {
  await withServer(async (origin) => {
    const redirect = await rawGet(origin, '/nested');
    assert.equal(redirect.status, 308);
    assert.equal(redirect.headers.location, '/nested/');
    const portal = await rawGet(origin, '/nested/');
    assert.equal(portal.status, 200);
    assert.match(portal.body, /portal/);
    assert.equal((await rawGet(origin, '/nested/showcase/')).status, 200);
    assert.equal((await rawGet(origin, '/showcase/')).status, 404);
  }, '/nested/');
});

test('static server rejects traversal, dotfiles, absent assets, and unsupported methods', async () => {
  await withServer(async (origin) => {
    assert.equal((await rawGet(origin, '/%2e%2e/secret')).status, 400);
    assert.equal((await rawGet(origin, '/showcase/%2e%2e/index.html')).status, 400);
    assert.equal((await rawGet(origin, '/.asrjs-backups/secret')).status, 404);
    assert.equal((await rawGet(origin, '/showcase/missing.mjs')).status, 404);
    const post = await rawGet(origin, '/', 'POST');
    assert.equal(post.status, 405);
    assert.equal(post.headers.allow, 'GET, HEAD');
  });
});

test('HEAD returns metadata without a body', async () => {
  await withServer(async (origin) => {
    const response = await rawGet(origin, '/showcase/runtime.wasm', 'HEAD');
    assert.equal(response.status, 200);
    assert.equal(response.headers['content-type'], 'application/wasm');
    assert.equal(response.body, '');
  });
});
