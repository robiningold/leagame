// Wandelt content/content.csv in content/content.json um.
// Spalten: modus, wert, begriff, verboten, kategorie, datei, loesung, fokusX, fokusY, frage, optionen, richtig
// Listen (verboten, optionen) mit | trennen. Trennzeichen ; , oder Tab wird automatisch erkannt (Excel CH nutzt ;).
// Aufruf: npm run import   (optional: npm run import -- pfad/zur/datei.csv)
import fs from 'node:fs';
import path from 'node:path';
import { validateContent, MODES, VALUES, CONTENT_DIR } from '../lib/content.js';

const ALIASES = {
  pantomime: 'pantomime', tabu: 'tabu', malen: 'malen', zeichnen: 'malen', emoji: 'emoji', emojis: 'emoji',
  guess: 'guess', 'guess the': 'guess', bild: 'guess', quiz: 'quiz', 'wer kennt': 'quiz',
};

function parseCsv(text, delim) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

const file = path.resolve(process.argv[2] || path.join(CONTENT_DIR, 'content.csv'));
if (!fs.existsSync(file)) {
  console.error(`❌ Datei nicht gefunden: ${file}`);
  process.exit(1);
}
let text = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
const firstLine = text.split(/\r?\n/)[0];
const delim = [';', '\t', ','].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];
const rows = parseCsv(text, delim);
const header = rows.shift().map((h) => h.trim().toLowerCase());
const col = (name) => header.indexOf(name.toLowerCase());
for (const need of ['modus', 'wert']) if (col(need) < 0) { console.error(`❌ Spalte "${need}" fehlt in der Kopfzeile.`); process.exit(1); }

const content = Object.fromEntries(MODES.map((m) => [m, Object.fromEntries(VALUES.map((v) => [String(v), []]))]));
const get = (r, name) => (col(name) >= 0 ? String(r[col(name)] ?? '').trim() : '');
const list = (s) => s.split('|').map((x) => x.trim()).filter(Boolean);
const num = (s) => (s === '' ? undefined : Number(s.replace(',', '.')));
let problems = 0;

rows.forEach((r, i) => {
  const line = i + 2;
  const modus = ALIASES[get(r, 'modus').toLowerCase()];
  const wert = String(parseInt(get(r, 'wert'), 10));
  if (!modus) { console.error(`❌ Zeile ${line}: unbekannter Modus "${get(r, 'modus')}"`); problems++; return; }
  if (!VALUES.map(String).includes(wert)) { console.error(`❌ Zeile ${line}: Wert muss 100, 200, 300, 400 oder 500 sein.`); problems++; return; }
  let e;
  if (modus === 'tabu') e = { begriff: get(r, 'begriff'), verboten: list(get(r, 'verboten')) };
  else if (modus === 'guess') {
    e = { kategorie: get(r, 'kategorie') || 'Bild', datei: get(r, 'datei'), loesung: get(r, 'loesung') };
    const fx = num(get(r, 'fokusx')), fy = num(get(r, 'fokusy'));
    if (fx !== undefined) e.fokusX = fx;
    if (fy !== undefined) e.fokusY = fy;
  } else if (modus === 'quiz') {
    const raw = get(r, 'richtig');
    const opts = list(get(r, 'optionen'));
    // "richtig" darf Index (0-3), Nummer (1-4 mit Präfix #) oder der Antworttext sein
    let richtig = /^\d+$/.test(raw) ? Number(raw) : raw.startsWith('#') ? Number(raw.slice(1)) - 1 : opts.indexOf(raw);
    e = { frage: get(r, 'frage'), optionen: opts, richtig };
  } else e = { begriff: get(r, 'begriff') };
  content[modus][wert].push(e);
});

const { errors, warnings } = validateContent(content);
for (const w of warnings) console.warn(`⚠️  ${w}`);
for (const e of errors) console.error(`❌ ${e}`);
if (errors.length || problems) {
  console.error('\n❌ content.json wurde NICHT überschrieben. Bitte CSV korrigieren.');
  process.exit(1);
}
const out = path.join(CONTENT_DIR, 'content.json');
if (fs.existsSync(out)) fs.copyFileSync(out, out + '.bak');
fs.writeFileSync(out, JSON.stringify(content, null, 2) + '\n');
console.log(`✅ ${rows.length} Zeilen importiert → content/content.json (Backup: content.json.bak)`);
