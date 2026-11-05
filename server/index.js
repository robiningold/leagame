// Lokaler Server (ohne Vercel): npm start bzw. npm run dev
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import fs from 'node:fs';
import express from 'express';
import { checkAll } from '../lib/content.js';

const DEV = process.argv.includes('--dev');
const PORT = Number(process.env.PORT) || 3000;

function lanIp() {
  const candidates = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      let score = 0;
      if (a.address.startsWith('192.168.')) score = 3;
      else if (a.address.startsWith('10.')) score = 2;
      else if (/^172\.(1[6-9]|2\d|3[01])\./.test(a.address)) score = 1;
      if (/^(docker|br-|veth|vmnet|vboxnet|utun|tailscale|zt)/i.test(name)) score -= 5;
      candidates.push({ address: a.address, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.address || 'localhost';
}

if (!checkAll()) process.exit(1);

const ip = lanIp();
process.env.LEAGAME_LAN_URL = process.env.PUBLIC_URL || `http://${ip}:${PORT}`;

// Erst nach dem Setzen der Umgebung laden
const { gameHandler, imageHandler } = await import('../lib/handler.js');
const { getStore } = await import('../lib/store.js');

const app = express();
app.use(express.json({ limit: '1mb' }));
app.all('/api/game', gameHandler);
app.get('/api/image', imageHandler);

const server = http.createServer(app);

if (DEV) {
  const { createServer } = await import('vite');
  const vite = await createServer({ server: { middlewareMode: true, hmr: { server } }, appType: 'spa' });
  app.use(vite.middlewares);
} else {
  const dist = path.join(process.cwd(), 'dist');
  if (!fs.existsSync(path.join(dist, 'index.html'))) {
    console.error('❌ Frontend nicht gebaut. Bitte "npm start" verwenden (baut automatisch).');
    process.exit(1);
  }
  app.use(express.static(dist));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

server.listen(PORT, '0.0.0.0', () => {
  const store = getStore();
  console.log('\n🎉 Partyspiel läuft!');
  console.log(`   TV:     http://localhost:${PORT}/tv   (Testmodus: /tv?test=1)`);
  console.log(`   Admin:  http://localhost:${PORT}/admin`);
  console.log(`   Handys: ${process.env.LEAGAME_LAN_URL}/join`);
  console.log(`   Speicher: ${store.kind === 'redis' ? 'Upstash Redis' : 'lokal (data/savegame.json)'}`);
  if (store.kind === 'local' && store.hadSave) console.log('💾 Gespeichertes Spiel gefunden. Der TV fragt beim Öffnen: "Gespeichertes Spiel fortsetzen?"');
  console.log('');
});
