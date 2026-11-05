# 🎉 Leas Geburtstags-Show – Partyspiel

Jeopardy trifft Activity: Der **TV** zeigt das Spielbrett, alle spielen mit dem **Handy**, die **Spielleitung** steuert alles über `/admin`. Geheime Begriffe erscheinen nie auf dem TV, nur auf den passenden Handys.

| Ansicht | Adresse | Für wen |
|---|---|---|
| TV | `/tv` | Laptop am Fernseher (1920×1080) |
| Mitspielen | `/join` | Handys (QR-Code auf dem TV) |
| Spielleitung | `/admin` | dich (PIN-geschützt) |

Es gibt zwei Betriebsarten mit dem gleichen Code:

- **A) Online auf Vercel** (empfohlen): Handys verbinden sich übers Internet (WLAN oder mobile Daten), kein Netzwerk-Gebastel.
- **B) Lokal auf dem Laptop**: komplett ohne Internet, Handys im gleichen WLAN.

---

## A) Online auf Vercel

Einmalig eingerichtet (hast du schon gemacht):

1. Vercel-Projekt aus dem GitHub-Repo `robiningold/leagame` importiert.
2. **Upstash Redis** über den Vercel Marketplace verbunden (Development, Preview, Production). Dadurch setzt Vercel automatisch `KV_REST_API_URL` / `KV_REST_API_TOKEN` (oder `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`).
3. Umgebungsvariable **`ADMIN_PIN`** gesetzt. Sie hat Vorrang vor dem `adminPin` in `config.json`. Das ist wichtig, weil `config.json` im Repo für alle sichtbar ist.

**Deployen:** Jeder Push auf GitHub löst automatisch einen Deploy aus. Jeder Branch bekommt eine eigene Preview-URL, `main` ist die Production-URL. Die Adresse findest du in Vercel unter **Deployments**.

**Am Abend:** Öffne `https://<deine-app>.vercel.app/tv` auf dem Laptop am TV. Der QR-Code zeigt automatisch auf `https://<deine-app>.vercel.app/join`.

Gut zu wissen:
- Preview und Production nutzen getrennte Spielstände, auch wenn sie die gleiche Datenbank teilen. Du kannst also gefahrlos auf einer Preview testen.
- Ist keine Datenbank verbunden, zeigt `/admin` eine rote Warnung.
- Kosten: Die Gratis-Pläne von Vercel und Upstash reichen für einen Abend. Die Handys fragen etwa jede Sekunde nach, der TV jede halbe Sekunde. Tabs im Hintergrund fragen gar nicht.
- **Nach Inhaltsänderungen** (Begriffe, Bilder, `config.json`) committen und pushen. Vercel baut neu und prüft dabei die Inhalte. Bei Fehlern schlägt der Build mit einer klaren Meldung fehl, und die alte Version bleibt online.

## B) Lokal auf dem Laptop

Voraussetzung: [Node.js](https://nodejs.org) 20 oder neuer.

```bash
npm install
```

```bash
npm start
```

`npm start` prüft die Inhalte, baut das Frontend und startet den Server auf **Port 3000**. Die Konsole zeigt die Adressen, zum Beispiel:

```
TV:     http://localhost:3000/tv   (Testmodus: /tv?test=1)
Admin:  http://localhost:3000/admin
Handys: http://192.168.1.23:3000/join
```

Die LAN-IP wird automatisch ermittelt und erscheint auf dem TV als Text und im QR-Code. Lokal wird der Spielstand nach jeder Änderung in `data/savegame.json` gespeichert. Nach einem Absturz oder Neustart fragen TV und Admin: **„Gespeichertes Spiel fortsetzen?“**

Entwickeln mit Hot Reload:

```bash
npm run dev
```

Alles ist offline lauffähig: Schrift (Fredoka) und QR-Code sind eingebaut, Sounds werden per Web Audio erzeugt.

---

## Inhalte und Bilder einfügen

Alle Inhalte stehen in **`content/content.json`**, Bilder in **`content/images/`**. Pro Modus und Wert gibt es eine Liste. Beim Aufdecken wird zufällig ein noch nicht genutzter Eintrag gewählt. Du kannst also mehr vorbereiten, als es Felder gibt.

```json
{
  "pantomime": { "100": [{ "begriff": "Zähneputzen" }], "200": [] },
  "tabu":      { "100": [{ "begriff": "Kaffee", "verboten": ["trinken", "Bohne", "Tasse"] }] },
  "malen":     { "100": [{ "begriff": "Sonne" }] },
  "emoji":     { "100": [{ "begriff": "Titanic" }] },
  "guess":     { "100": [{ "kategorie": "Character", "datei": "shrek.jpg", "loesung": "Shrek", "fokusX": 0.5, "fokusY": 0.4 }] },
  "quiz":      { "100": [{ "frage": "Was ist {name}s Lieblingsessen?", "optionen": ["Pizza", "Sushi", "Lasagne", "Curry"], "richtig": 1 }] }
}
```

- `{name}` wird überall durch den Namen des Geburtstagskinds aus `config.json` ersetzt.
- `richtig` ist der Index der richtigen Antwort, gezählt ab 0 (0 = erste, 3 = vierte).
- `guess`: Das Bild kommt nach `content/images/`. `fokusX` und `fokusY` (0 bis 1) legen fest, wo der erste kleine Ausschnitt liegt (0/0 = oben links). Fehlen sie, wird zufällig gewählt, aber nicht am Rand.
- **Finale-Foto** (optional): `content/images/finale.jpg`.
- Mitgeliefert sind Platzhalter-Inhalte (mindestens 2 pro Feld) und 5 generierte Platzhalterbilder. Ersetze sie durch deine echten Inhalte.

Inhalte prüfen, ohne zu starten:

```bash
npm run validate
```

Die Prüfung meldet zum Beispiel „Tabu 300 hat keine Einträge.“ oder „Bild xy.jpg nicht gefunden“.

### Inhalte in Excel pflegen (CSV-Import)

1. `content/content.csv` in Excel öffnen. Eine Beispieldatei mit allen Platzhaltern liegt bei.
2. Spalten: `modus, wert, begriff, verboten, kategorie, datei, loesung, fokusX, fokusY, frage, optionen, richtig`
   - `modus`: pantomime, tabu, malen, emoji, guess, quiz
   - Listen (`verboten`, `optionen`) mit `|` trennen, z.B. `Pizza|Sushi|Lasagne|Curry`
   - `richtig`: Index ab 0, oder `#1` bis `#4`, oder der Antworttext selbst
3. Als **CSV (Trennzeichen-getrennt)** speichern. Semikolon, Komma und Tab werden automatisch erkannt.
4. Importieren:

```bash
npm run import
```

Die alte `content.json` wird als `content.json.bak` gesichert. Bei Fehlern wird nichts überschrieben.

## Admin-PIN festlegen

- **Auf Vercel:** Im Vercel-Projekt unter **Settings → Environment Variables** die Variable `ADMIN_PIN` anlegen oder bearbeiten (für Production, Preview und Development). Danach unter **Deployments** beim neuesten Deploy **⋯ → Redeploy** klicken. Erst dann gilt die neue PIN, denn Vercel übernimmt geänderte Variablen nur bei einem neuen Deploy.
- **Lokal:** In `config.json` das Feld `adminPin` ändern und neu starten.
- Ist `ADMIN_PIN` gesetzt, gilt diese PIN, und `adminPin` in `config.json` wird ignoriert.

## Teamnamen

Die Teams starten mit den Namen aus `config.json`. Danach können sie selbst einen Namen wählen:
- **Auf dem Handy:** In der Lobby (vor dem Spielstart) kann jede Person mit „✏️ Teamnamen ändern“ den Namen des eigenen Teams ändern.
- **Spielleitung:** In `/admin` unter „Teams & Punkte“ mit ✏️ jederzeit, auch während des Spiels.

Die Farben kommen weiterhin aus `config.json`. Bei „Neues Spiel“ gelten wieder die Namen aus `config.json`.

## config.json

| Feld | Bedeutung |
|---|---|
| `spieltitel` | Titel auf TV und Handys |
| `geburtstagskind` | Name, z.B. für „Wer kennt Lea?“ und `{name}` |
| `adminPin` | PIN für `/admin`. Auf Vercel stattdessen `ADMIN_PIN` setzen. |
| `teams` | 2 bis 4 Teams mit `name` (Startname, im Spiel änderbar) und `farbe` |
| `rundendauerSekunden` | Timer pro Runde (Standard 60) |
| `klauen` | Klauen an (`true`) oder aus (`false`) |
| `klauenDauerSekunden` | Zeit fürs Klauen (Standard 10) |
| `anzahlDoppeltFelder` | Anzahl versteckter Doppelt-Felder (Standard 2) |
| `aufloesungSekunden` | So lange bleibt die Auflösung stehen (Standard 8) |
| `finaltext` | Geburtstagstext auf dem Finale-Screen |

## Spielablauf (Kurzfassung)

1. TV öffnen und einmal klicken (Browser erlauben Ton erst nach einem Klick).
2. Alle scannen den QR-Code, geben ihren Namen ein und wählen ein Team.
3. In `/admin` das Geburtstagskind markieren (☑️) und **Spiel starten**.
4. Die Person am Zug wählt auf dem Handy ein Feld, liest den Begriff und drückt **Start**.
5. Gegner:innen kontrollieren und drücken bei Bedarf **„Regelverstoss!“** bzw. **„TABU!“**. Du entscheidest in `/admin`.
6. Wenn alle Felder gespielt sind, kommt das Finale. Du kannst es in `/admin` auch vorzeitig auslösen.

Die Spielleitung kann jederzeit Punkte korrigieren, Runden abbrechen, Felder zurücksetzen (Punkte werden abgezogen), den Timer pausieren, zur nächsten Person springen, Personen verschieben oder entfernen. Die Doppelt-Felder siehst nur du (×2 im Admin-Board).

## Testen (allein)

- **`/tv?test=1`** erzeugt 6 Fake-Spieler:innen in 2 Teams, eine davon als Geburtstagskind.
- In `/admin` gibt es bei jeder Person den Link **„📱 als Person öffnen“**. Er öffnet die Handy-Ansicht dieser Person in einem neuen Tab, so kannst du jede Rolle selbst spielen.
- Mehrere `/join`-Tabs im selben Browser als verschiedene Personen: **`/join?multi=1`**. Die playerId liegt dann in sessionStorage statt localStorage.
- Kurze Timer für Tests (nur lokal): `LEAGAME_TEST_SECONDS=10 npm start`

## Laptop an den TV anschliessen

1. Laptop per **HDMI** (bei USB-C/Thunderbolt mit Adapter) mit dem TV verbinden und am TV den richtigen HDMI-Eingang wählen.
2. Bildschirm **duplizieren** oder nur den TV verwenden: Windows `Win + P`, Mac Systemeinstellungen → Displays.
3. Auflösung 1920×1080 (Full HD) wählen. Andere Auflösungen gehen auch, das Bild skaliert automatisch.
4. `/tv` im Browser öffnen und **Vollbild** aktivieren: `F11` (Windows) bzw. `Ctrl + Cmd + F` (Mac).
5. Ton über den TV: In den Toneinstellungen des Laptops den TV als Ausgabe wählen.
6. Energiesparen und Bildschirmschoner für den Abend ausschalten.

## Troubleshooting: Handys verbinden sich nicht

**Auf Vercel (Variante A):**
- Das Handy braucht Internet, WLAN oder mobile Daten.
- Seite neu laden. Die Person landet automatisch wieder im gleichen Team.
- Zeigt `/admin` „Keine Datenbank verbunden“: Upstash Redis in Vercel verbinden (siehe oben) und neu deployen.

**Lokal (Variante B):**
- **Gleiches WLAN:** Handys und Laptop müssen im gleichen Netz sein, nicht in einem Gäste-WLAN und nicht über mobile Daten.
- **Gäste-WLAN / Client-Isolation:** Viele Gäste- oder Hotel-WLANs blockieren Verbindungen zwischen Geräten. Dann ins Haupt-WLAN wechseln.
- **Laptop-Hotspot als sichere Lösung:** Am Laptop einen Hotspot einschalten und alle Handys damit verbinden (Windows: Einstellungen → Netzwerk → Mobiler Hotspot; Mac: Internetfreigabe). Dann `npm start` neu starten, damit die richtige IP im QR-Code steht.
- **Firewall:** Port 3000 freigeben.
  - Windows: Beim ersten Start „Zugriff zulassen“ für Node.js anklicken (privates Netzwerk). Sonst Windows Defender Firewall → Erweiterte Einstellungen → Eingehende Regel → Port → TCP 3000 → Zulassen.
  - Mac: Systemeinstellungen → Netzwerk → Firewall → Optionen → eingehende Verbindungen für „node“ erlauben.
- **Falsche IP im QR-Code** (z.B. bei VPN oder mehreren Netzwerkkarten): VPN trennen oder die Adresse fix setzen:

```bash
PUBLIC_URL=http://192.168.1.23:3000 npm start
```

**Allgemein:**
- **Kein Ton auf dem TV:** einmal irgendwo auf den TV-Bildschirm klicken.
- **Handy-Bildschirm geht aus:** Die App hält den Bildschirm wach (Wake Lock), wo der Browser das kann. Sonst die Auto-Sperre am Handy für den Abend verlängern. Auch nach einer Sperre verbindet sich das Handy automatisch wieder.

---

## Technik

- Frontend: Vite + React + TypeScript (`client/`), Schrift Fredoka lokal via `@fontsource`
- API: `api/game.js` und `api/image.js` (Vercel Functions), gemeinsame Logik in `lib/`
- Lokal: Express-Server (`server/index.js`), im Dev-Modus mit Vite-Middleware (Hot Reload)
- Spielstand: Upstash Redis (Vercel) bzw. Arbeitsspeicher + `data/savegame.json` (lokal). Gleichzeitige Aktionen werden per Compare-and-set sicher zusammengeführt.
- Echtzeit: Polling (TV 0,5 s, Handys 0,8 s). Timer laufen mit Server-Zeitstempeln synchron auf allen Geräten.

## Getroffene Entscheidungen

- **Vercel statt Socket.io:** Auf Vercel laufen keine dauerhaften Server, darum Polling plus Redis statt WebSockets. Lokal läuft derselbe Code.
- **Game-PIN:** Zum Beitreten nötig. Der QR-Code enthält ihn schon, also muss man ihn nur bei manueller Eingabe tippen.
- **Klauen und Sichtbarkeit:** Das Team, das als Nächstes klauen dürfte, sieht den Begriff während der Runde **nicht**, sonst wäre Klauen geschenkt. Andere Gegner-Teams (bei 3–4 Teams) sehen ihn. Bei nur 2 Teams kontrolliert damit vor allem die Spielleitung (sie hat ebenfalls einen „Regelverstoss“-Button). Wer bei 2 Teams lieber Kontrolle durch die Gegner will: `"klauen": false`.
- **Klauen** gibt es nach „Zeit abgelaufen“, „Aufgeben“ und falscher Quiz-Antwort, aber **nicht** nach einem bestätigten Regelverstoss. Ein richtiger Klau bringt die Hälfte des Feldwerts (×2 bei Doppelt-Feldern).
- **Guess:** Die Punkte richten sich nach der Aufdeck-Stufe im Moment von „Erraten!“ (100 / 75 / 50 / 25 %).
- **Wer kennt [Name]?:** Ist ein Geburtstagskind markiert, bestätigt es jede Quiz-Auflösung mit „Stimmt!“, egal welches Team dran ist. Die Spielleitung kann das übersteuern. Ohne markiertes Geburtstagskind wird sofort aufgelöst. Ist das Geburtstagskind selbst am Zug, übernimmt die nächste Person im Team. Die Rotation läuft danach normal weiter, als hätte das Geburtstagskind gespielt.
- **Runde abbrechen:** Das Feld bleibt frei, der gezogene Eintrag gilt als verbraucht. **Feld zurücksetzen** zieht die vergebenen Punkte wieder ab.
- **Späte Gäste** können auch während des Spiels beitreten und kommen ans Ende der Reihenfolge ihres Teams. Wer in ein anderes Team verschoben wird, kommt dort ebenfalls ans Ende.
- **Auflösung** bleibt `aufloesungSekunden` stehen (Standard 8 s), die Spielleitung kann mit „Weiter“ abkürzen.
- **„Gespeichertes Spiel fortsetzen?“** fragen TV und Admin beim Öffnen, wenn schon ein Spiel mit Spieler:innen existiert. „Neues Spiel“ verlangt die Admin-PIN.
- **Wake Lock:** Wo nicht unterstützt (ältere iPhones), erscheint ein Hinweis, die Auto-Sperre auszuschalten.
