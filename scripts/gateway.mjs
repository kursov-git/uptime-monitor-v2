#!/usr/bin/env node

import { createServer } from 'http';
import { createReadStream, existsSync, statSync } from 'fs';
import { Readable } from 'stream';
import { extname, join, normalize, resolve, sep } from 'path';

const PORT = Number(process.env.GATEWAY_PORT || 80);
const API_ORIGIN = process.env.API_ORIGIN || 'http://127.0.0.1:3000';
const STATIC_DIR = process.env.STATIC_DIR || join(process.cwd(), 'client', 'dist');
const STATIC_ROOT = resolve(STATIC_DIR);

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length',
]);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

function safePath(urlPath) {
  const raw = decodeURIComponent(urlPath.split('?')[0]);
  const p = normalize(raw).replace(/^(\.\.[/\\])+/, '');
  const relative = p === '/' ? 'index.html' : p.replace(/^[/\\]+/, '');
  const candidate = resolve(STATIC_ROOT, relative);
  if (candidate === STATIC_ROOT || candidate.startsWith(`${STATIC_ROOT}${sep}`)) {
    return candidate;
  }
  return resolve(STATIC_ROOT, 'index.html');
}

function buildUpstreamHeaders(req) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    const lower = key.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(lower) || value == null) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v);
    } else {
      headers.set(key, value);
    }
  }

  const remoteAddress = req.socket?.remoteAddress;
  if (remoteAddress) {
    const existing = headers.get('x-forwarded-for');
    headers.set('x-forwarded-for', existing ? `${existing}, ${remoteAddress}` : remoteAddress);
  }
  if (!headers.has('x-forwarded-proto')) {
    headers.set('x-forwarded-proto', req.socket?.encrypted ? 'https' : 'http');
  }
  if (!headers.has('x-forwarded-host') && typeof req.headers.host === 'string') {
    headers.set('x-forwarded-host', req.headers.host);
  }
  return headers;
}

function writeResponseHeaders(res, upstream) {
  const headers = {};
  for (const [key, value] of upstream.headers.entries()) {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      headers[key] = value;
    }
  }
  res.writeHead(upstream.status, headers);
}

async function proxy(req, res) {
  const target = new URL(req.url, API_ORIGIN);
  const upstream = await fetch(target, {
    method: req.method,
    headers: buildUpstreamHeaders(req),
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : req,
    duplex: 'half',
  });

  writeResponseHeaders(res, upstream);
  if (upstream.body) {
    Readable.fromWeb(upstream.body).on('error', () => res.end()).pipe(res);
  } else {
    res.end();
  }
}

const server = createServer(async (req, res) => {
  try {
    const url = req.url || '/';

    if (url.startsWith('/api/') || url === '/health') {
      await proxy(req, res);
      return;
    }

    let filePath = safePath(url);
    if (!existsSync(filePath) || (existsSync(filePath) && statSync(filePath).isDirectory())) {
      filePath = join(STATIC_DIR, 'index.html');
    }

    if (!existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    const ext = extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    createReadStream(filePath).pipe(res);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Gateway error');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`gateway listening on :${PORT}, api=${API_ORIGIN}, static=${STATIC_DIR}`);
});
