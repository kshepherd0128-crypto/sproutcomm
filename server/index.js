// SproutComm server: static client + JSON API + AI proxy.
// Family content never reaches the browser's network tab except as rendered
// text, and the Meta key never leaves this process.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { config, hasMetaKey } from './config.js';
import { readJson, sendJson, sendError, logRequest, httpError } from './http.js';
import { publicLanguages } from './languages.js';
import { seedIfEmpty } from './seed.js';
import {
  createEngagement,
  getFamily,
  getFamilyByToken,
  getFamilyDetail,
  getFeed,
  listActivities,
  listFamilies
} from './store.js';
import { ensureFamilyTokens } from './db.js';

const PUBLIC_DIR = fileURLToPath(new URL('../public/', import.meta.url));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg'
};

const sessions = new Map();

function newSession(role, familyId = null) {
  const token = randomBytes(24).toString('hex');
  sessions.set(token, { role, familyId, createdAt: Date.now() });
  return token;
}

function requireSession(req, role) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const session = sessions.get(token);
  if (!session) throw httpError(401, 'Please sign in again');
  if (role && session.role !== role) throw httpError(403, 'This section is not available for your role');
  return session;
}

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/') rel = '/index.html';

  const filePath = path.resolve(PUBLIC_DIR, '.' + rel);
  if (!filePath.startsWith(path.resolve(PUBLIC_DIR))) {
    sendError(res, 403, 'Forbidden');
    return;
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    sendError(res, 404, 'Not found');
    return;
  }

  const type = MIME[path.extname(filePath)] || 'application/octet-stream';
  const body = fs.readFileSync(filePath);
  res.writeHead(200, {
    'content-type': type,
    'cache-control': 'no-store',
    'content-length': body.length
  });
  res.end(body);
}

const routes = [];
function route(method, pattern, handler) {
  routes.push({ method, pattern, handler });
}

function healthPayload() {
  return {
    ok: true,
    ai_configured: hasMetaKey(),
    models_allowed: ['muse-spark-1.3', 'muse-wonder-1.0', 'muse-voice-transcribe-1.0'],
    time: new Date().toISOString()
  };
}

route('GET', '/api/health', async () => healthPayload());

route('GET', '/api/languages', async () => ({ languages: publicLanguages() }));

route('POST', '/api/session', async (req) => {
  const body = await readJson(req);
  const role = body.role;
  if (role === 'advocate') {
    if (String(body.passcode || '') !== config.demo.advocatePasscode) {
      throw httpError(401, 'That passcode did not match');
    }
    return { token: newSession('advocate'), role: 'advocate' };
  }
  if (role === 'parent') {
    // The parent front door is the family token link (/f/<token>). The
    // session it creates is pinned to that one family and nothing in the
    // parent API accepts a family id.
    const family = getFamilyByToken(String(body.token || ''));
    if (!family) throw httpError(401, 'This family link is not valid');
    return {
      token: newSession('parent', family.id),
      role: 'parent',
      family: { id: family.id, family_name: family.family_name, child_name: family.child_name }
    };
  }
  throw httpError(400, 'Choose advocate or parent');
});

route('DELETE', '/api/session', async (req) => {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) sessions.delete(header.slice(7));
  return { ok: true };
});

route('GET', '/api/families', async (req) => {
  requireSession(req, 'advocate');
  return { families: listFamilies() };
});

route('GET', '/api/activities', async (req) => {
  requireSession(req, 'advocate');
  return { activities: listActivities() };
});

route('GET', '/api/families/:id', async (req, params) => {
  requireSession(req, 'advocate');
  const detail = getFamilyDetail(params.id);
  if (!detail) throw httpError(404, 'Family not found');
  return detail;
});

route('GET', '/api/parent/feed', async (req) => {
  const session = requireSession(req, 'parent');
  const feed = getFeed(session.familyId);
  if (!feed) throw httpError(404, 'Family not found');
  return feed;
});

route('POST', '/api/messages', async (req) => {
  requireSession(req, 'advocate');
  const body = await readJson(req, 64 * 1024);
  const result = await createEngagement({
    familyId: body.family_id,
    activityId: body.activity_id,
    bodyEn: body.body_en
  });
  return {
    message_id: result.messageId,
    access_path: result.accessPath,
    feed: getFeed(body.family_id)
  };
});

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  // Never log a family access token: /f/<token> is a credential.
  const logPath = pathname.startsWith('/f/') ? '/f/[redacted]' : pathname;
  res.on('finish', () => logRequest(req.method, logPath, res.statusCode, Date.now() - started));

  if (pathname === '/health') {
    sendJson(res, 200, healthPayload());
    return;
  }

  if (!pathname.startsWith('/api/')) {
    // Parent front door: /f/<token> serves the app, which exchanges the token
    // for a family-pinned session.
    if (/^\/f\/[A-Za-z0-9_-]+\/?$/.test(pathname)) {
      serveStatic(req, res, '/index.html');
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendError(res, 405, 'Method not allowed');
      return;
    }
    serveStatic(req, res, pathname);
    return;
  }

  const matched = routes
    .filter((r) => r.method === req.method)
    .map((r) => {
      const parts = r.pattern.split('/').filter(Boolean);
      const given = pathname.split('/').filter(Boolean);
      if (parts.length !== given.length) return null;
      const params = {};
      for (let i = 0; i < parts.length; i++) {
        if (parts[i].startsWith(':')) params[parts[i].slice(1)] = given[i];
        else if (parts[i] !== given[i]) return null;
      }
      return { r, params };
    })
    .find(Boolean);

  if (!matched) {
    const pathExists = routes.some((r) => {
      const parts = r.pattern.split('/').filter(Boolean);
      const given = pathname.split('/').filter(Boolean);
      if (parts.length !== given.length) return false;
      return parts.every((p, i) => p.startsWith(':') || p === given[i]);
    });
    sendError(res, pathExists ? 405 : 404, pathExists ? 'Method not allowed' : 'Not found');
    return;
  }

  try {
    const payload = await matched.r.handler(req, matched.params);
    sendJson(res, 200, payload);
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) {
      console.error(`[error] ${req.method} ${pathname}: ${err.message}`);
      if (err.upstreamDetail) console.error(`[upstream] ${err.upstreamDetail}`);
    }
    sendError(res, status, err.message || 'Server error', {
      code: err.code || undefined,
      upstream_status: err.upstreamStatus || undefined,
      upstream_detail: err.upstreamDetail || undefined
    });
  }
});

function lanAddress() {
  for (const iface of Object.values(os.networkInterfaces())) {
    for (const info of iface || []) {
      if (info.family === 'IPv4' && !info.internal) return info.address;
    }
  }
  return 'localhost';
}

ensureFamilyTokens();
seedIfEmpty();
ensureFamilyTokens();

server.listen(config.port, config.host, () => {
  console.log(`SproutComm server on http://localhost:${config.port}`);
  console.log(`Phone on the same Wi-Fi: http://${lanAddress()}:${config.port}`);
  console.log(`AI proxy: ${hasMetaKey() ? 'META_API_KEY loaded' : 'NO KEY — translation/documentation calls will fail'}`);
});
