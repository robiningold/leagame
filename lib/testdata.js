// Testdaten für den Testmodus (/tv?test=1): füllt leere Kategorien mit angenommenen Beispiel-Vorschlägen.
// Sie sind als "test" markiert und lassen sich im Admin-Tool mit einem Klick löschen.
import { newId } from './def.js';

const SAMPLES = {
  pantomime: ['Zähneputzen', 'Velofahren', 'Fondue essen'],
  tabu: [
    { begriff: 'Kaffee', verboten: ['trinken', 'Bohne', 'Tasse'] },
    { begriff: 'Matterhorn', verboten: ['Berg', 'Zermatt', 'Toblerone'] },
    { begriff: 'Geburtstag', verboten: ['Kuchen', 'feiern', 'Geschenk'] },
  ],
  malen: ['Sonne', 'Leuchtturm', 'Giraffe'],
  emoji: ['Titanic', 'Findet Nemo', 'Harry Potter'],
  summen: ['Atemlos – Helene Fischer', 'Happy Birthday', 'Alle meine Entchen'],
  quiz: [
    { frage: 'Was isst {name} am liebsten? (Test)', optionen: ['Pizza', 'Sushi', 'Lasagne', 'Curry'], richtig: 1 },
    { frage: 'Welche Farbe mag {name}? (Test)', optionen: ['Blau', 'Grün', 'Violett', 'Gelb'], richtig: 2 },
    { frage: 'Welches Tier wäre {name}? (Test)', optionen: ['Katze', 'Delfin', 'Adler', 'Faultier'], richtig: 3 },
  ],
  guess: [
    { loesung: 'Sonne über Bergen', kategorie: 'Ort', svg: '<rect width="1600" height="900" fill="#8fd3ff"/><circle cx="1180" cy="230" r="120" fill="#ffd23f"/><path d="M-50 900 L480 260 L1000 900Z" fill="#4f5d7a"/><path d="M520 900 L1080 330 L1700 900Z" fill="#3b4763"/><path d="M480 260 L400 360 L560 360Z" fill="#fff"/><rect y="800" width="1600" height="100" fill="#3fa34d"/>' },
    { loesung: 'Pizza', kategorie: 'Essen', svg: '<rect width="1600" height="900" fill="#8b5a2b"/><circle cx="800" cy="450" r="400" fill="#e9b562"/><circle cx="800" cy="450" r="350" fill="#d6402b"/><circle cx="700" cy="350" r="55" fill="#fff6d5"/><circle cx="920" cy="400" r="55" fill="#fff6d5"/><circle cx="760" cy="560" r="55" fill="#fff6d5"/><circle cx="980" cy="580" r="45" fill="#2f8f3a"/>' },
    { loesung: 'Rotes Auto', kategorie: 'Gegenstand', svg: '<rect width="1600" height="900" fill="#bfe3ff"/><rect y="650" width="1600" height="250" fill="#666"/><rect x="300" y="430" width="1000" height="200" rx="40" fill="#e02a2a"/><rect x="500" y="300" width="560" height="180" rx="60" fill="#e02a2a"/><circle cx="500" cy="640" r="95" fill="#222"/><circle cx="1100" cy="640" r="95" fill="#222"/>' },
  ],
};

/** Neue Test-Vorschläge für alle Kategorien ohne angenommene Vorschläge */
export function testSuggestions(def, existing) {
  const out = [];
  const now = Date.now();
  for (const col of def.columns) {
    if (existing.some((s) => s.col === col.id && s.status === 'angenommen')) continue;
    const list = SAMPLES[col.mode] || [];
    list.forEach((x, i) => {
      const item = { id: newId(12), col: col.id, mode: col.mode, von: 'Testdaten', status: 'angenommen', test: true, at: now + i };
      if (col.mode === 'guess') {
        const imgId = newId(16);
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" width="1600" height="900">${x.svg}</svg>`;
        item.image = { id: imgId, data: { type: 'image/svg+xml', data: Buffer.from(svg).toString('base64') } };
        item.entry = { kategorie: x.kategorie, loesung: x.loesung, datei: 'upload:' + imgId };
      } else if (typeof x === 'string') item.entry = { begriff: x };
      else item.entry = { ...x };
      out.push(item);
    });
  }
  return out;
}
