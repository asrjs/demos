import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { once } from 'node:events';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { normalizeBasePath } from './build-suite.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
  '.webm': 'audio/webm',
  '.mp4': 'video/mp4',
  '.pdf': 'application/pdf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
});

function securityHeaders(res) {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
}

function sendText(res, status, message) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(message);
}

function requestedRelativePath(rawUrl, base) {
  const rawPath = (rawUrl || '/').split('?', 1)[0].split('#', 1)[0];
  if (/%2f|%5c/i.test(rawPath)) return { error: 400 };
  let decoded;
  try { decoded = decodeURIComponent(rawPath); } catch { return { error: 400 }; }
  if (decoded.includes('\\') || decoded.includes('\0')) return { error: 400 };
  const parts = decoded.split('/');
  if (parts.some((part) => part === '.' || part === '..')) return { error: 400 };
  const basePrefix = base === '/' ? '/' : base.slice(0, -1);
  if (base !== '/' && decoded === basePrefix) return { redirect: base };
  if (!decoded.startsWith(base)) return { error: 404 };
  const relative = decoded.slice(base.length);
  if (relative.split('/').some((part) => part.startsWith('.'))) return { error: 404 };
  return { relative };
}

export function createSuiteServer({ root = path.join(repoRoot, 'dist'), base = '/' } = {}) {
  const basePath = normalizeBasePath(base);
  const rootPath = path.resolve(root);
  const server = http.createServer(async (req, res) => {
    securityHeaders(res);
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD');
      sendText(res, 405, 'Method not allowed');
      return;
    }
    const target = requestedRelativePath(req.url, basePath);
    if (target.redirect) {
      res.writeHead(308, { Location: target.redirect, 'Cache-Control': 'no-store' });
      res.end();
      return;
    }
    if (target.error) {
      sendText(res, target.error, target.error === 400 ? 'Bad request' : 'Not found');
      return;
    }
    const relative = target.relative || 'index.html';
    const candidate = path.resolve(rootPath, ...relative.split('/'));
    if (candidate !== rootPath && !candidate.startsWith(`${rootPath}${path.sep}`)) {
      sendText(res, 400, 'Bad request');
      return;
    }
    let filePath = candidate;
    try {
      const stat = await fs.stat(filePath);
      if (stat.isDirectory()) {
        const requestPath = (req.url || '/').split('?', 1)[0];
        if (!requestPath.endsWith('/')) {
          const query = (req.url || '').includes('?') ? `?${(req.url || '').split('?').slice(1).join('?')}` : '';
          res.writeHead(308, { Location: `${decodeURIComponent(requestPath)}/${query}`, 'Cache-Control': 'no-store' });
          res.end();
          return;
        }
        filePath = path.join(filePath, 'index.html');
      }
      const realPath = await fs.realpath(filePath);
      if (realPath !== rootPath && !realPath.startsWith(`${rootPath}${path.sep}`)) {
        sendText(res, 404, 'Not found');
        return;
      }
      const fileStat = await fs.stat(realPath);
      if (!fileStat.isFile()) {
        sendText(res, 404, 'Not found');
        return;
      }
      const ext = path.extname(realPath).toLowerCase();
      const headers = {
        'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
        'Content-Length': fileStat.size,
        'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
      };
      if (req.method === 'HEAD') {
        res.writeHead(200, headers);
        res.end();
      } else {
        const stream = createReadStream(realPath);
        await once(stream, 'open');
        res.writeHead(200, headers);
        stream.on('error', (error) => {
          console.error(`Unable to stream ${target.relative}:`, error);
          res.destroy(error);
        });
        stream.pipe(res);
      }
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') sendText(res, 404, 'Not found');
      else {
        console.error(`Unable to serve ${target.relative}:`, error);
        sendText(res, 500, 'Internal server error');
      }
    }
  });
  return server;
}

function parseArgs(argv) {
  const values = { port: 4173, base: '/', root: path.join(repoRoot, 'dist') };
  const seen = new Set();
  for (const arg of argv) {
    const [key, ...rest] = arg.split('=');
    const value = rest.join('=');
    if (seen.has(key)) throw new Error(`${key} may be provided only once.`);
    seen.add(key);
    if (key === '--port' && /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 65535) values.port = Number(value);
    else if (key === '--base') values.base = normalizeBasePath(value);
    else if (key === '--root' && value) values.root = path.resolve(value);
    else throw new Error(`Invalid argument: ${arg}`);
  }
  return values;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const { port, base, root } = parseArgs(process.argv.slice(2));
    await fs.access(path.join(root, 'index.html'));
    const server = createSuiteServer({ root, base });
    server.listen(port, '127.0.0.1', () => {
      const mount = base === '/' ? '' : base.slice(0, -1);
      console.log(`ASRJS suite preview: http://127.0.0.1:${port}${mount}/`);
    });
  } catch (error) {
    console.error(error?.stack ?? error);
    process.exitCode = 1;
  }
}
