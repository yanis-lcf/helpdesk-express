import { createReadStream, existsSync, statSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
};

/** En-têtes de sécurité appliqués à toutes les réponses de l'application. */
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

export const applySecurityHeaders = (res: ServerResponse) => {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(name, value);
};

/**
 * Sert l'interface compilée (dossier `dist`) : fichiers statiques + repli sur index.html (routage côté client).
 * Les chemins sont résolus puis vérifiés : impossible de sortir du dossier (« ../ »).
 */
export const createStaticHandler = (root: string) => {
  const base = resolve(root);
  const index = join(base, 'index.html');

  /** Renvoie true si la requête a été servie. */
  return (req: IncomingMessage, res: ServerResponse): boolean => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return false;
    let pathname: string;
    try {
      pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
    } catch {
      res.writeHead(400).end();
      return true;
    }
    const candidate = resolve(base, `.${normalize(`/${pathname}`)}`);
    if (candidate !== base && !candidate.startsWith(base + sep)) {
      res.writeHead(403).end();
      return true;
    }
    const isFile = existsSync(candidate) && statSync(candidate).isFile();
    // Une ressource avec extension introuvable est une vraie 404 ; sinon c'est une route de l'application.
    if (!isFile && extname(pathname)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Introuvable');
      return true;
    }
    const file = isFile ? candidate : index;
    if (!existsSync(file)) return false;
    res.writeHead(200, {
      'Content-Type': CONTENT_TYPES[extname(file)] ?? 'application/octet-stream',
      // Les fichiers de /assets ont une empreinte dans leur nom : cache long. index.html : jamais en cache.
      'Cache-Control': file.includes(`${sep}assets${sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    if (req.method === 'HEAD') res.end();
    else createReadStream(file).pipe(res);
    return true;
  };
};
