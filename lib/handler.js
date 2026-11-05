// HTTP-Handler, gemeinsam genutzt von Vercel (api/*.js) und dem lokalen Server (server/index.js)
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, hasFinalePhoto, IMAGE_DIR } from './content.js';
import { getStore } from './store.js';
import { newGame, applyAction, tick, needsTick, buildView, syncCells, GameError } from './game.js';
import { seedDef, sanitizeDef, mergeConfig, emptyCells, newId, sanitizeSuggestion, entryValid, fillName } from './def.js';

let cache = { state: null, at: 0 };
const CACHE_MS = 250;
let defCache = { def: null, at: 0 };
const DEF_CACHE_MS = 2000;
let seenCache = { map: {}, at: 0 };
let suggCache = { list: null, at: 0 };

/** Vorschläge der Spieler:innen (separat gespeichert, damit nichts überschrieben wird) */
async function readSuggestions(fresh = false) {
  const now = Date.now();
  if (!fresh && suggCache.list && now - suggCache.at < DEF_CACHE_MS) return suggCache.list;
  const list = (await getStore().getSuggestions()).sort((a, b) => a.at - b.at);
  suggCache = { list, at: Date.now() };
  return list;
}

/** Bild aus der Vorschlagsseite oder dem Admin-Tool speichern */
async function storeImage(dataUrl) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) throw new GameError('Ungültiges Bild (erlaubt: JPG, PNG, WebP).');
  if (m[2].length > 950_000) throw new GameError('Bild ist zu gross. Bitte ein kleineres Bild wählen.');
  const id = newId(16);
  await getStore().setImage(id, { type: m[1], data: m[2] });
  return 'upload:' + id;
}

/** Spieldefinition (Spalten, Zeilen, Inhalte, Einstellungen). Beim ersten Mal aus den Dateien erzeugt. */
async function readDef(fresh = false) {
  const now = Date.now();
  if (!fresh && defCache.def && now - defCache.at < DEF_CACHE_MS) return defCache.def;
  const store = getStore();
  let def = await store.getDef();
  if (!def) {
    def = seedDef();
    await store.setDef(def);
  }
  defCache = { def, at: Date.now() };
  return def;
}

async function getConfig(def) {
  return mergeConfig(loadConfig(), def || (await readDef()));
}

async function readState(fresh = false) {
  const store = getStore();
  const now = Date.now();
  if (!fresh && cache.state && now - cache.at < CACHE_MS) return cache.state;
  let state = await store.get();
  if (!state) {
    const def = await readDef();
    const created = newGame(await getConfig(def), def);
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

/** PIN-Vergleich: Leerzeichen am Rand ignorieren */
const pinOk = (pin, config) => String(pin ?? '').trim() === config.adminPin;

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

async function viewFor(state, def, config, { role, playerId, pin }) {
  const isAdmin = role === 'admin' && pinOk(pin, config);
  const seen = await getSeen();
  const view = buildView(state, config, {
    role,
    playerId,
    isAdmin,
    now: Date.now(),
    seen,
    def,
    extra: {
      lanUrl: process.env.LEAGAME_LAN_URL || null,
      hasFinalePhoto: !!config.finaleBild || hasFinalePhoto(),
      storage: getStore().kind,
    },
  });
  if (isAdmin) view.emptyCells = emptyCells(def, await readSuggestions());
  return view;
}

/** Felder an eine geänderte Spieldefinition anpassen (z.B. neue Spalte). */
async function ensureSynced(state, def, config) {
  if (state.defRev === def.rev) return state;
  const out = await mutate((s) => {
    if (s.defRev === def.rev) return { unchanged: true };
    syncCells(s, def, config);
    return {};
  });
  return out.state;
}

export async function gameHandler(req, res) {
  try {
    const def = await readDef();
    const config = await getConfig(def);
    const store = getStore();

    if (req.method === 'GET') {
      const q = getQuery(req);
      // Für die Login-Seite: woher kommt die Admin-PIN? (verrät die PIN nicht)
      if (q.pininfo) {
        return send(res, 200, { source: config.adminPinSource, vercel: !!process.env.VERCEL, storage: store.kind });
      }
      // Malen: Striche seit Index "from"
      if (q.ops) {
        const ops = await store.getOps(String(q.ops), Math.max(0, Number(q.from) || 0));
        return send(res, 200, { ops, now: Date.now() });
      }
      // Admin-Tool: komplette Spieldefinition zum Bearbeiten
      if (q.def) {
        if (!pinOk(q.pin, config)) return send(res, 401, { error: 'Falsche Admin-PIN.' });
        return send(res, 200, { def: await readDef(true), defaults: loadConfig(), suggestions: await readSuggestions(true) });
      }
      // Vorschlagsseite: Kategorien und Schwierigkeiten (ohne Inhalte!)
      if (q.vorschlag) {
        return send(res, 200, {
          title: config.spieltitel,
          bdayName: config.geburtstagskind,
          open: config.vorschlaegeOffen !== false,
          columns: def.columns.map((c) => ({ id: c.id, mode: c.mode, title: fillName(c.title, config.geburtstagskind) })),
          values: def.values,
        });
      }
      const role = ['tv', 'admin', 'player'].includes(q.role) ? q.role : 'tv';
      if (role === 'admin' && !pinOk(q.pin, config)) return send(res, 401, { error: 'Falsche Admin-PIN.' });
      let state = await readState();
      state = await ensureSynced(state, def, config);
      const now = Date.now();
      if (needsTick(state, now)) {
        ({ state } = await mutate((s) => (tick(s, config, Date.now()) ? {} : { unchanged: true })));
      }
      if (role === 'player' && q.playerId && q.ping) await store.seen(String(q.playerId), now);
      return send(res, 200, await viewFor(state, def, config, { role, playerId: q.playerId, pin: q.pin }));
    }

    if (req.method === 'POST') {
      const body = await getBody(req);
      const role = ['tv', 'admin', 'player'].includes(body.role) ? body.role : 'tv';
      const isAdmin = pinOk(body.pin, config);
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

      // ---------- Admin-Tool: Spiel bearbeiten
      if (body.type === 'saveDef') {
        if (!isAdmin) return send(res, 401, { error: 'Falsche Admin-PIN.' });
        const current = await readDef(true);
        let next;
        try {
          next = sanitizeDef(payload.def, current.rev || 0);
        } catch (e) {
          return send(res, 400, { error: e.message });
        }
        await store.setDef(next);
        defCache = { def: next, at: Date.now() };
        const cfg = await getConfig(next);
        await mutate((s) => {
          syncCells(s, next, cfg);
          return {};
        });
        return send(res, 200, { ok: true, def: next, emptyCells: emptyCells(next, await readSuggestions()) });
      }
      if (body.type === 'resetDef') {
        if (!isAdmin) return send(res, 401, { error: 'Falsche Admin-PIN.' });
        const current = await readDef(true);
        const next = { ...seedDef(), rev: (current.rev || 0) + 1 };
        await store.setDef(next);
        defCache = { def: next, at: Date.now() };
        const cfg = await getConfig(next);
        await mutate((s) => {
          syncCells(s, next, cfg);
          return {};
        });
        return send(res, 200, { ok: true, def: next, emptyCells: emptyCells(next) });
      }
      if (body.type === 'uploadImage') {
        if (!isAdmin) return send(res, 401, { error: 'Falsche Admin-PIN.' });
        return send(res, 200, { ok: true, datei: await storeImage(payload.dataUrl) });
      }
      // ---------- Vorschlagsseite (ohne PIN)
      if (body.type === 'suggest') {
        if (config.vorschlaegeOffen === false) return send(res, 400, { error: 'Vorschläge sind gerade geschlossen.' });
        let s;
        try {
          s = sanitizeSuggestion(def, payload);
        } catch (e) {
          return send(res, 400, { error: e.message });
        }
        if (s.mode === 'guess') {
          if (!payload.dataUrl) return send(res, 400, { error: 'Bitte ein Bild hochladen.' });
          s.entry.datei = 'pending';
        }
        if (!entryValid(s.mode, s.entry)) return send(res, 400, { error: 'Bitte alle Felder ausfüllen.' });
        if (s.mode === 'guess') s.entry.datei = await storeImage(payload.dataUrl);
        const all = await readSuggestions(true);
        if (all.length >= 5000) return send(res, 400, { error: 'Es gibt schon sehr viele Vorschläge – danke!' }); // nur Schutz vor Missbrauch
        const item = { id: newId(12), ...s, at: Date.now() };
        await store.addSuggestion(item);
        suggCache = { list: null, at: 0 };
        return send(res, 200, { ok: true, id: item.id });
      }
      // Spielleitung: 👍 / 👎 und optional fester Punktwert
      if (body.type === 'reviewSuggestion') {
        if (!isAdmin) return send(res, 401, { error: 'Falsche Admin-PIN.' });
        const all = await readSuggestions(true);
        const item = all.find((x) => x.id === payload.id);
        if (!item) return send(res, 404, { error: 'Vorschlag nicht gefunden.' });
        const next = { ...item };
        if (['offen', 'angenommen', 'abgelehnt'].includes(payload.status)) next.status = payload.status;
        if ('value' in payload) next.value = def.values.includes(Number(payload.value)) ? Number(payload.value) : null;
        await store.addSuggestion(next);
        suggCache = { list: null, at: 0 };
        return send(res, 200, { ok: true, suggestions: await readSuggestions(true) });
      }
      if (body.type === 'deleteSuggestion') {
        if (!isAdmin) return send(res, 401, { error: 'Falsche Admin-PIN.' });
        await store.deleteSuggestion(String(payload.id || ''));
        suggCache = { list: null, at: 0 };
        return send(res, 200, { ok: true, suggestions: await readSuggestions(true) });
      }

      const suggestions = body.type === 'pick' ? await readSuggestions(true) : [];
      const { state, result } = await mutate((s) => {
        if (s.defRev !== def.rev) syncCells(s, def, config);
        return applyAction(s, config, def, actor, body.type, payload, Date.now(), suggestions) || {};
      });
      if (role === 'player' && result?.playerId) await store.seen(result.playerId, Date.now());
      if (role === 'player' && actor.playerId) await store.seen(actor.playerId, Date.now());
      const view = await viewFor(state, def, config, { role, playerId: result?.playerId || actor.playerId, pin: body.pin });
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

/** Bild senden: hochgeladen (upload:<id>) oder Datei aus content/images */
async function sendImage(res, datei) {
  if (!datei) return false;
  if (datei.startsWith('upload:')) {
    const img = await getStore().getImage(datei.slice(7));
    if (!img) return false;
    res.statusCode = 200;
    res.setHeader('Content-Type', img.type);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.end(Buffer.from(img.data, 'base64'));
    return true;
  }
  const file = path.join(IMAGE_DIR, path.basename(datei));
  if (!fs.existsSync(file)) return false;
  res.statusCode = 200;
  res.setHeader('Content-Type', TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.end(fs.readFileSync(file));
  return true;
}

/**
 * Bilder:
 * - ?round=<id>   Bild der aktuellen Guess-Runde (ohne den Dateinamen zu verraten)
 * - ?finale=1     Finale-Foto
 * - ?file=...&pin Vorschau im Admin-Tool
 */
export async function imageHandler(req, res) {
  try {
    const q = getQuery(req);
    const def = await readDef();
    const config = await getConfig(def);
    let ok = false;
    if (q.finale) {
      ok = await sendImage(res, config.finaleBild || 'finale.jpg');
    } else if (q.round) {
      const state = await readState();
      const r = state.round;
      if (r && r.id === q.round && r.mode === 'guess') ok = await sendImage(res, r.entry.datei);
    } else if (q.file && pinOk(q.pin, config)) {
      ok = await sendImage(res, String(q.file));
    }
    if (!ok) {
      res.statusCode = 404;
      res.end('Nicht gefunden');
    }
  } catch (e) {
    console.error(e);
    res.statusCode = 500;
    res.end('Fehler');
  }
}
