// Laden von config.json (Standardwerte). Inhalte kommen nur noch aus den Vorschlägen der Gäste.
import fs from 'node:fs';
import path from 'node:path';

export const ROOT = process.cwd();
export const IMAGE_DIR = path.join(ROOT, 'content', 'images');

const DEFAULT_COLORS = ['#FF5FA2', '#2EC4F1', '#FFCB2D', '#4CD97B'];

let cachedConfig = null;

/** Admin-PIN aus Vercel: ADMIN_PIN oder ADMIN_KEY (beide Namen erlaubt) */
const envPin = () => (process.env.ADMIN_PIN || process.env.ADMIN_KEY || '').trim();

export function loadConfig() {
  if (cachedConfig) return cachedConfig;
  const file = path.join(ROOT, 'config.json');
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const teams = (Array.isArray(raw.teams) ? raw.teams : []).slice(0, 4);
  if (teams.length < 2) throw new Error('config.json: Es braucht 2 bis 4 Teams.');
  cachedConfig = {
    spieltitel: String(raw.spieltitel || 'Party-Show'),
    geburtstagskind: String(raw.geburtstagskind || 'Geburtstagskind'),
    // Auf Vercel: Umgebungsvariable ADMIN_PIN bzw. ADMIN_KEY hat Vorrang vor config.json
    adminPin: String(envPin() || raw.adminPin || '1234').trim(),
    adminPinSource: envPin() ? 'env' : 'config',
    teams: teams.map((t, i) => ({
      id: `t${i + 1}`,
      name: String(t.name || `Team ${i + 1}`),
      farbe: String(t.farbe || DEFAULT_COLORS[i]),
    })),
    // LEAGAME_TEST_SECONDS: nur zum Testen, verkürzt alle Timer
    rundendauerSekunden: Number(process.env.LEAGAME_TEST_SECONDS) || Number(raw.rundendauerSekunden) || 60,
    klauenDauerSekunden: Number(process.env.LEAGAME_TEST_SECONDS) / 2 || Number(raw.klauenDauerSekunden) || 10,
    klauen: raw.klauen !== false,
    punkteProRunde: Number(raw.punkteProRunde) || 100,
    aufloesungSekunden: process.env.LEAGAME_TEST_SECONDS ? 2 : Number(raw.aufloesungSekunden) || 8,
    finaltext: String(raw.finaltext || ''),
  };
  return cachedConfig;
}

/** Prüft config.json und gibt das Ergebnis in der Konsole aus. Rückgabe: true wenn ok. */
export function checkAll({ quiet = false } = {}) {
  try {
    const cfg = loadConfig();
    if (!quiet) console.log(`✅ config.json: "${cfg.spieltitel}", ${cfg.teams.length} Teams, Geburtstagskind ${cfg.geburtstagskind}.`);
    return true;
  } catch (e) {
    console.error(`❌ config.json: ${e.message}`);
    return false;
  }
}

/** Optionales Finale-Foto im Repo (alternativ im Admin-Tool hochladen) */
export function hasFinalePhoto() {
  return fs.existsSync(path.join(IMAGE_DIR, 'finale.jpg'));
}
