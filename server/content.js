// Laden und Prüfen von config.json und content/content.json
import fs from 'node:fs';
import path from 'node:path';

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
export const CONTENT_DIR = path.join(ROOT, 'content');
export const IMAGE_DIR = path.join(CONTENT_DIR, 'images');

export const MODES = ['pantomime', 'tabu', 'malen', 'emoji', 'guess', 'quiz'];
export const VALUES = [100, 200, 300, 400, 500];
export const MODE_LABELS = {
  pantomime: 'Pantomime',
  tabu: 'Tabu',
  malen: 'Malen',
  emoji: 'Emoji',
  guess: 'Guess the ___',
  quiz: 'Wer kennt …?',
};

const DEFAULT_COLORS = ['#FF5FA2', '#2EC4F1', '#FFCB2D', '#4CD97B'];

export function loadConfig() {
  const file = path.join(ROOT, 'config.json');
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.error(`❌ config.json konnte nicht gelesen werden: ${e.message}`);
    process.exit(1);
  }
  let teams = Array.isArray(raw.teams) ? raw.teams : [];
  if (teams.length < 2 || teams.length > 4) {
    console.error(`❌ config.json: Es braucht 2 bis 4 Teams (gefunden: ${teams.length}).`);
    if (teams.length < 2) process.exit(1);
    teams = teams.slice(0, 4);
  }
  const config = {
    spieltitel: String(raw.spieltitel || 'Party-Show'),
    geburtstagskind: String(raw.geburtstagskind || 'Geburtstagskind'),
    adminPin: String(raw.adminPin ?? '1234'),
    teams: teams.map((t, i) => ({
      id: `t${i + 1}`,
      name: String(t.name || `Team ${i + 1}`),
      farbe: String(t.farbe || DEFAULT_COLORS[i]),
    })),
    rundendauerSekunden: Number(raw.rundendauerSekunden) || 60,
    klauenDauerSekunden: Number(raw.klauenDauerSekunden) || 10,
    klauen: raw.klauen !== false,
    anzahlDoppeltFelder: Math.max(0, Math.min(30, Number(raw.anzahlDoppeltFelder ?? 2))),
    aufloesungSekunden: Number(raw.aufloesungSekunden) || 8,
    finaltext: String(raw.finaltext || ''),
  };
  return config;
}

/** Ersetzt {name} in Texten durch den Namen des Geburtstagskinds. */
function fillName(value, name) {
  if (typeof value === 'string') return value.replaceAll('{name}', name);
  if (Array.isArray(value)) return value.map((v) => fillName(v, name));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = fillName(v, name);
    return out;
  }
  return value;
}

/** Prüft content-Objekt. Gibt Liste von Fehlern und Warnungen zurück. */
export function validateContent(content) {
  const errors = [];
  const warnings = [];
  if (!content || typeof content !== 'object') {
    errors.push('content.json ist kein gültiges Objekt.');
    return { errors, warnings };
  }
  for (const mode of MODES) {
    const label = MODE_LABELS[mode];
    if (!content[mode]) {
      errors.push(`Modus "${mode}" (${label}) fehlt komplett.`);
      continue;
    }
    for (const value of VALUES) {
      const list = content[mode][String(value)];
      if (!Array.isArray(list) || list.length === 0) {
        errors.push(`${label} ${value} hat keine Einträge.`);
        continue;
      }
      if (list.length === 1) warnings.push(`${label} ${value} hat nur 1 Eintrag (bei Feld-Reset wird er wiederholt).`);
      list.forEach((e, i) => {
        const where = `${label} ${value}, Eintrag ${i + 1}`;
        if (!e || typeof e !== 'object') return errors.push(`${where}: ungültiger Eintrag.`);
        if (['pantomime', 'tabu', 'malen', 'emoji'].includes(mode)) {
          if (!e.begriff || !String(e.begriff).trim()) errors.push(`${where}: "begriff" fehlt.`);
        }
        if (mode === 'tabu') {
          if (!Array.isArray(e.verboten) || e.verboten.length === 0) errors.push(`${where} (${e.begriff}): "verboten" fehlt oder ist leer.`);
        }
        if (mode === 'guess') {
          if (!e.datei) errors.push(`${where}: "datei" fehlt.`);
          else if (!fs.existsSync(path.join(IMAGE_DIR, e.datei))) errors.push(`Bild ${e.datei} nicht gefunden (erwartet in content/images/, ${where}).`);
          if (!e.loesung) errors.push(`${where}: "loesung" fehlt.`);
          if (!e.kategorie) warnings.push(`${where}: "kategorie" fehlt, verwende "Bild".`);
          for (const k of ['fokusX', 'fokusY']) {
            if (e[k] !== undefined && e[k] !== null && e[k] !== '' && !(Number(e[k]) >= 0 && Number(e[k]) <= 1)) {
              errors.push(`${where}: ${k} muss zwischen 0 und 1 liegen.`);
            }
          }
        }
        if (mode === 'quiz') {
          if (!e.frage) errors.push(`${where}: "frage" fehlt.`);
          if (!Array.isArray(e.optionen) || e.optionen.length !== 4) errors.push(`${where}: "optionen" braucht genau 4 Antworten.`);
          const r = Number(e.richtig);
          if (!Number.isInteger(r) || r < 0 || r > 3) errors.push(`${where}: "richtig" muss 0, 1, 2 oder 3 sein (Index der richtigen Antwort).`);
        }
      });
    }
  }
  return { errors, warnings };
}

export function loadContent(config) {
  const file = path.join(CONTENT_DIR, 'content.json');
  let content;
  try {
    content = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.error(`❌ content/content.json konnte nicht gelesen werden: ${e.message}`);
    process.exit(1);
  }
  const { errors, warnings } = validateContent(content);
  for (const w of warnings) console.warn(`⚠️  ${w}`);
  for (const e of errors) console.error(`❌ ${e}`);
  if (errors.length) {
    console.error(`\n❌ ${errors.length} Fehler in content/content.json. Bitte korrigieren und neu starten.\n`);
    process.exit(1);
  }
  let total = 0;
  for (const m of MODES) for (const v of VALUES) total += content[m][String(v)].length;
  console.log(`✅ Inhalte geladen: ${total} Einträge in ${MODES.length} Modi.`);
  if (fs.existsSync(path.join(IMAGE_DIR, 'finale.jpg'))) console.log('✅ Finale-Foto gefunden (content/images/finale.jpg).');
  return fillName(content, config.geburtstagskind);
}

export function hasFinalePhoto() {
  return fs.existsSync(path.join(IMAGE_DIR, 'finale.jpg'));
}
