// HTTP-Handler, gemeinsam genutzt von Vercel (api/*.js) und dem lokalen Server (server/index.js)
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, loadContent, hasFinalePhoto, IMAGE_DIR } from './content.js';
import { getStore } from './store.js';
import { newGame, applyAction, tick, needsTick, buildView, GameError } from './game.js';

let cache = { state: null, at: 0 };
const CACHE_MS = 250;
let seenCache = { map: {}, at: 0 };

async function readState(fresh = false) {
  const store = getStore();
  const now = Date.now();
  if (!fresh && cache.state && now - cache.at < CACHE_MS) return cache.state;
  let state = await store.get();
  if (!state) {
    const created = newGame(loadConfig());
    created._v = 1;
    if (await store.cas(0, created)) state = created;
    else state = await store.get();
  }
  cache = { state, at: Date.now() };
  return state;
}

/** Liest, verändert und schreibt den Zustand mit Compare-and-set (Wiederholung bei Konflikt). */
async function mutate(fn) {
  const store = getStore();
  for (let attempt = 0; attempt < 12; attempt++) {
    const state = await readState(true);
    const draft = structuredClone(state);
    const out = fn(draft);
    if (out && out.unchanged) return { state, result: out };
    draft._v = state._v + 1;
    if (await store.cas(state._v, draft)) {
      cache = { state: draft, at: Date.now() };
      return { state: draft, result: out };
    }
    await new Promise((r) => setTimeout(r, 15 + Math.random() * 40));
  }
  throw new GameError('Server ist gerade beschäftigt, bitte nochmals versuchen.');
}

async function getSeen() {
  const now = Date.now();
  if (now - seenCache.at < 2000) return seenCache.map;
  seenCache = { map: await getStore().getSeen(), at: now };
  return seenCache.map;
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function getQuery(req) {
  if (req.query && Object.keys(req.query).length) return req.query;
  const u = new URL(req.url, 'http://x');
  return Object.fromEntries(u.searchParams.entries());
}

async function getBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

async function viewFor(state, { role, playerId, pin }) {
  const config = loadConfig();
  const isAdmin = role === 'admin' && String(pin || '') === config.adminPin;
  const seen = await getSeen();
  return buildView(state, config, {
    role,
    playerId,
    isAdmin,
    now: Date.now(),
    seen,
    extra: {
      lanUrl: process.env.LEAGAME_LAN_URL || null,
      hasFinalePhoto: hasFinalePhoto(),
      storage: getStore().kind,
    },
  });
}

export async function gameHandler(req, res) {
  try {
    const config = loadConfig();
    const content = loadContent();
    const store = getStore();

    if (req.method === 'GET') {
      const q = getQuery(req);
      // Malen: Striche seit Index "from"
      if (q.ops) {
        const ops = await store.getOps(String(q.ops), Math.max(0, Number(q.from) || 0));
        return send(res, 200, { ops, now: Date.now() });
      }
      const role = ['tv', 'admin', 'player'].includes(q.role) ? q.role : 'tv';
      if (role === 'admin' && String(q.pin || '') !== config.adminPin) return send(res, 401, { error: 'Falsche Admin-PIN.' });
      let state = await readState();
      const now = Date.now();
      if (needsTick(state, now)) {
        ({ state } = await mutate((s) => (tick(s, config, Date.now()) ? {} : { unchanged: true })));
      }
      if (role === 'player' && q.playerId && q.ping) await store.seen(String(q.playerId), now);
      return send(res, 200, await viewFor(state, { role, playerId: q.playerId, pin: q.pin }));
    }

    if (req.method === 'POST') {
      const body = await getBody(req);
      const role = ['tv', 'admin', 'player'].includes(body.role) ? body.role : 'tv';
      const isAdmin = String(body.pin || '') === config.adminPin;
      const actor = { role, playerId: body.playerId || null, isAdmin };
      const payload = body.payload || {};

      if (body.type === 'draw') {
        const state = await readState();
        const r = state.round;
        if (!r || r.mode !== 'malen' || r.id !== payload.roundId) return send(res, 400, { error: 'Keine Mal-Runde aktiv.' });
        if (!isAdmin && r.activeId !== actor.playerId) return send(res, 403, { error: 'Nur die aktive Person darf malen.' });
        const ops = Array.isArray(payload.ops) ? payload.ops.slice(0, 200) : [];
        await store.pushOps(r.id, ops);
        return send(res, 200, { ok: true });
      }
      if (body.type === 'adminLogin') {
        return send(res, isAdmin ? 200 : 401, isAdmin ? { ok: true } : { error: 'Falsche Admin-PIN.' });
      }

      const { state, result } = await mutate((s) => applyAction(s, config, content, actor, body.type, payload, Date.now()) || {});
      if (role === 'player' && result?.playerId) await store.seen(result.playerId, Date.now());
      if (role === 'player' && actor.playerId) await store.seen(actor.playerId, Date.now());
      const view = await viewFor(state, { role, playerId: result?.playerId || actor.playerId, pin: body.pin });
      return send(res, 200, { ok: true, result, view });
    }

    send(res, 405, { error: 'Methode nicht erlaubt.' });
  } catch (e) {
    if (e instanceof GameError) return send(res, 400, { error: e.message });
    console.error(e);
    send(res, 500, { error: 'Serverfehler: ' + e.message });
  }
}

const TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' };

/** Liefert das Bild der aktuellen Guess-Runde (ohne den Dateinamen zu verraten) oder das Finale-Foto. */
export async function imageHandler(req, res) {
  try {
    const q = getQuery(req);
    let file = null;
    if (q.finale) {
      file = path.join(IMAGE_DIR, 'finale.jpg');
    } else if (q.round) {
      const state = await readState();
      const r = state.round;
      if (r && r.id === q.round && r.mode === 'guess') file = path.join(IMAGE_DIR, r.entry.datei);
    }
    if (!file || !fs.existsSync(file)) {
      res.statusCode = 404;
      return res.end('Nicht gefunden');
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.end(fs.readFileSync(file));
  } catch (e) {
    console.error(e);
    res.statusCode = 500;
    res.end('Fehler');
  }
}
