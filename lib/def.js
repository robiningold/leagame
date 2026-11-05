// Spieldefinition: alles, was im Admin-Tool bearbeitet wird (Spalten, Zeilen, Inhalte, Einstellungen).
// Wird in der Datenbank gespeichert. Beim allerersten Start aus config.json + content/content.json erzeugt.
import crypto from 'node:crypto';
import { MODES, VALUES, readRawContent } from './content.js';

export const MAX_COLUMNS = 8;
export const MAX_ROWS = 8;

const DEFAULT_TITLES = {
  pantomime: 'Pantomime',
  tabu: 'Tabu',
  malen: 'Malen',
  emoji: 'Emoji',
  guess: 'Guess the ___',
  quiz: 'Wer kennt {name}?',
};

export const newId = (n = 8) => crypto.randomBytes(12).toString('base64url').replace(/[-_]/g, '').slice(0, n);

/** Ersetzt {name} in Texten durch den Namen des Geburtstagskinds. */
export function fillName(value, name) {
  if (typeof value === 'string') return value.replaceAll('{name}', name);
  if (Array.isArray(value)) return value.map((v) => fillName(v, name));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = fillName(v, name);
    return out;
  }
  return value;
}

/** Erste Spieldefinition aus den Dateien im Repo. */
export function seedDef() {
  let content = {};
  try {
    content = readRawContent();
  } catch {
    content = {};
  }
  const columns = MODES.map((mode) => ({ id: mode, mode, title: DEFAULT_TITLES[mode] }));
  const entries = {};
  for (const col of columns) {
    entries[col.id] = {};
    for (const v of VALUES) entries[col.id][String(v)] = (content[col.mode]?.[String(v)] || []).map((e) => sanitizeEntry(col.mode, e));
  }
  return { rev: 1, settings: {}, columns, values: [...VALUES], entries };
}

const str = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const num01 = (v) => {
  if (v === '' || v === null || v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? Math.round(n * 1000) / 1000 : undefined;
};

export function sanitizeEntry(mode, e = {}) {
  switch (mode) {
    case 'tabu':
      return { begriff: str(e.begriff), verboten: (Array.isArray(e.verboten) ? e.verboten : String(e.verboten || '').split(/[,|]/)).map((x) => str(x, 60)).filter(Boolean).slice(0, 10) };
    case 'guess': {
      const out = { kategorie: str(e.kategorie, 40) || 'Bild', datei: str(e.datei, 120), loesung: str(e.loesung) };
      const fx = num01(e.fokusX);
      const fy = num01(e.fokusY);
      if (fx !== undefined) out.fokusX = fx;
      if (fy !== undefined) out.fokusY = fy;
      return out;
    }
    case 'quiz': {
      const opts = Array.isArray(e.optionen) ? e.optionen : [];
      const r = Number(e.richtig);
      return { frage: str(e.frage, 300), optionen: [0, 1, 2, 3].map((i) => str(opts[i], 120)), richtig: Number.isInteger(r) && r >= 0 && r <= 3 ? r : 0 };
    }
    default:
      return { begriff: str(e.begriff) };
  }
}

/** Ist der Eintrag spielbar (alle nötigen Felder ausgefüllt)? */
export function entryValid(mode, e) {
  if (!e) return false;
  switch (mode) {
    case 'tabu':
      return !!e.begriff && Array.isArray(e.verboten) && e.verboten.length > 0;
    case 'guess':
      return !!e.datei && !!e.loesung;
    case 'quiz':
      return !!e.frage && Array.isArray(e.optionen) && e.optionen.length === 4 && e.optionen.every(Boolean);
    default:
      return !!e.begriff;
  }
}

const SETTING_KEYS = {
  spieltitel: (v) => str(v, 60) || undefined,
  geburtstagskind: (v) => str(v, 30) || undefined,
  rundendauerSekunden: (v) => (Number(v) >= 10 && Number(v) <= 600 ? Math.round(Number(v)) : undefined),
  klauenDauerSekunden: (v) => (Number(v) >= 3 && Number(v) <= 120 ? Math.round(Number(v)) : undefined),
  klauen: (v) => (typeof v === 'boolean' ? v : undefined),
  anzahlDoppeltFelder: (v) => (Number(v) >= 0 && Number(v) <= 64 ? Math.round(Number(v)) : undefined),
  aufloesungSekunden: (v) => (Number(v) >= 2 && Number(v) <= 60 ? Math.round(Number(v)) : undefined),
  finaltext: (v) => (v === undefined ? undefined : str(v, 1000)),
  finaleBild: (v) => (typeof v === 'string' && /^upload:[A-Za-z0-9]+$/.test(v) ? v : undefined),
};

/** Prüft und bereinigt eine Definition aus dem Admin-Tool. */
export function sanitizeDef(input, prevRev = 0) {
  if (!input || typeof input !== 'object') throw new Error('Ungültige Daten.');
  const columns = (Array.isArray(input.columns) ? input.columns : [])
    .slice(0, MAX_COLUMNS)
    .map((c) => ({ id: str(c.id, 20).replace(/[^A-Za-z0-9]/g, '') || newId(), mode: MODES.includes(c.mode) ? c.mode : 'pantomime', title: str(c.title, 40) || 'Neue Spalte' }));
  const seenIds = new Set();
  for (const c of columns) {
    if (seenIds.has(c.id)) c.id = newId();
    seenIds.add(c.id);
  }
  if (!columns.length) throw new Error('Es braucht mindestens eine Spalte.');
  const values = [...new Set((Array.isArray(input.values) ? input.values : []).map((v) => Math.round(Number(v))).filter((v) => v > 0 && v <= 100000))].slice(0, MAX_ROWS);
  if (!values.length) throw new Error('Es braucht mindestens eine Zeile.');
  const entries = {};
  for (const col of columns) {
    entries[col.id] = {};
    for (const v of values) {
      const list = input.entries?.[col.id]?.[String(v)];
      entries[col.id][String(v)] = (Array.isArray(list) ? list : []).slice(0, 50).map((e) => sanitizeEntry(col.mode, e));
    }
  }
  const settings = {};
  for (const [k, fn] of Object.entries(SETTING_KEYS)) {
    const val = fn(input.settings?.[k]);
    if (val !== undefined) settings[k] = val;
  }
  return { rev: prevRev + 1, settings, columns, values, entries };
}

/** config.json + Einstellungen aus dem Admin-Tool */
export function mergeConfig(base, def) {
  return { ...base, ...(def?.settings || {}) };
}

/** Felder ohne spielbaren Inhalt */
export function emptyCells(def) {
  const out = [];
  for (const col of def.columns) for (const v of def.values) {
    const list = def.entries[col.id]?.[String(v)] || [];
    if (!list.some((e) => entryValid(col.mode, e))) out.push(`${col.id}-${v}`);
  }
  return out;
}
