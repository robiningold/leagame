// Speicher für den Spielstand.
// - Auf Vercel: Upstash Redis (Umgebungsvariablen KV_REST_API_* oder UPSTASH_REDIS_REST_*)
// - Lokal ohne Redis: Arbeitsspeicher + data/savegame.json
import fs from 'node:fs';
import path from 'node:path';
import { Redis } from '@upstash/redis';

const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

// Preview und Production teilen sich die gleiche Datenbank: getrennte Schlüssel
const PREFIX = `leagame:${process.env.VERCEL_ENV || 'local'}:`;
const K_STATE = PREFIX + 'state';
const K_VER = PREFIX + 'ver';
const K_SEEN = PREFIX + 'seen';
const kStrokes = (roundId) => PREFIX + 'strokes:' + roundId;

// Compare-and-set: Schreibt nur, wenn niemand dazwischen geschrieben hat
const CAS_SCRIPT = `
local cur = redis.call('GET', KEYS[2])
if (cur or '0') == ARGV[1] then
  redis.call('SET', KEYS[1], ARGV[2])
  redis.call('SET', KEYS[2], ARGV[3])
  return 1
end
return 0`;

function createRedisStore() {
  const redis = new Redis({ url, token, automaticDeserialization: false });
  return {
    kind: 'redis',
    async get() {
      const raw = await redis.get(K_STATE);
      return raw ? JSON.parse(raw) : null;
    },
    async cas(expectedVersion, state) {
      const res = await redis.eval(CAS_SCRIPT, [K_STATE, K_VER], [String(expectedVersion), JSON.stringify(state), String(state._v)]);
      return Number(res) === 1;
    },
    async pushOps(roundId, ops) {
      if (!ops.length) return;
      const key = kStrokes(roundId);
      const p = redis.pipeline();
      p.rpush(key, ...ops.map((o) => JSON.stringify(o)));
      p.expire(key, 60 * 60 * 24);
      await p.exec();
    },
    async getOps(roundId, from) {
      const list = await redis.lrange(kStrokes(roundId), from, -1);
      return list.map((s) => (typeof s === 'string' ? JSON.parse(s) : s));
    },
    async seen(playerId, now) {
      await redis.hset(K_SEEN, { [playerId]: String(now) });
    },
    async getSeen() {
      const h = (await redis.hgetall(K_SEEN)) || {};
      const out = {};
      for (const [k, v] of Object.entries(h)) out[k] = Number(v);
      return out;
    },
  };
}

function createLocalStore() {
  const file = path.join(process.cwd(), 'data', 'savegame.json');
  let state = null;
  try {
    if (fs.existsSync(file)) state = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.error(`⚠️  data/savegame.json ist beschädigt und wird ignoriert: ${e.message}`);
  }
  const ops = new Map();
  const seenMap = {};
  let saveTimer = null;
  const save = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file + '.tmp', JSON.stringify(state, null, 1));
        fs.renameSync(file + '.tmp', file);
      } catch (e) {
        console.error('⚠️  Spielstand konnte nicht gespeichert werden:', e.message);
      }
    }, 300);
  };
  return {
    kind: 'local',
    hadSave: !!state,
    async get() {
      return state ? structuredClone(state) : null;
    },
    async cas(expectedVersion, next) {
      if ((state?._v ?? 0) !== expectedVersion) return false;
      state = structuredClone(next);
      save();
      return true;
    },
    async pushOps(roundId, list) {
      if (!ops.has(roundId)) ops.set(roundId, []);
      ops.get(roundId).push(...list);
    },
    async getOps(roundId, from) {
      return (ops.get(roundId) || []).slice(from);
    },
    async seen(playerId, now) {
      seenMap[playerId] = now;
    },
    async getSeen() {
      return { ...seenMap };
    },
  };
}

let store = null;
export function getStore() {
  if (!store) store = url && token ? createRedisStore() : createLocalStore();
  return store;
}
