import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applySecurityHeaders, createStaticHandler } from '../../src/infrastructure/http/staticFiles';

let dir: string;
let server: Server;
let base: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'hdx-static-'));
  await mkdir(join(dir, 'dist', 'assets'), { recursive: true });
  await writeFile(join(dir, 'dist', 'index.html'), '<!doctype html><div id="root"></div>');
  await writeFile(join(dir, 'dist', 'assets', 'app-abc123.js'), 'console.log(1)');
  await writeFile(join(dir, 'secret.txt'), 'NE PAS SERVIR');
  const serve = createStaticHandler(join(dir, 'dist'));
  server = createServer((req, res) => {
    applySecurityHeaders(res);
    if (!serve(req, res)) res.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(dir, { recursive: true, force: true });
});

describe('Serveur de production — fichiers statiques', () => {
  it('WEB-01 routes de l’application ⇒ index.html (non mis en cache) avec en-têtes de sécurité', async () => {
    const r = await fetch(`${base}/portal/help/abc`);
    expect(r.status).toBe(200);
    expect(await r.text()).toContain('id="root"');
    expect(r.headers.get('cache-control')).toBe('no-cache');
    expect(r.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(r.headers.get('content-security-policy')).toContain("script-src 'self'");
    expect(r.headers.get('x-frame-options')).toBe('DENY');
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('WEB-02 fichiers à empreinte : type MIME correct et cache long immuable', async () => {
    const r = await fetch(`${base}/assets/app-abc123.js`);
    expect(r.headers.get('content-type')).toContain('text/javascript');
    expect(r.headers.get('cache-control')).toContain('immutable');
  });

  it('WEB-03 ressource absente avec extension ⇒ vraie 404 (pas de repli HTML)', async () => {
    expect((await fetch(`${base}/assets/absent.js`)).status).toBe(404);
  });

  it('WEB-04 impossible de sortir du dossier publié (« ../ », encodé ou non)', async () => {
    for (const path of ['/..%2fsecret.txt', '/%2e%2e/secret.txt', '/assets/..%2f..%2fsecret.txt']) {
      const r = await fetch(`${base}${path}`);
      expect([403, 404]).toContain(r.status);
      expect(await r.text()).not.toContain('NE PAS SERVIR');
    }
  });

  it('WEB-05 seules les lectures sont servies (POST ⇒ non traité)', async () => {
    expect((await fetch(`${base}/`, { method: 'POST' })).status).toBe(404);
  });
});
