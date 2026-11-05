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

Alles ist offline lauffähig: Schrift (Nunito) und QR-Code sind eingebaut, Sounds werden per Web Audio erzeugt.

---

## Spiel bearbeiten (Admin-Tool)

Öffne `/admin` → Tab **„✏️ Spiel bearbeiten“**. Alles wird automatisch gespeichert (in der Datenbank) und gilt sofort, ohne neuen Deploy.

- **Spalten:** Titel frei wählbar, pro Spalte ein Spielmodus (Pantomime, Tabu, Malen, Emoji, Guess the ___, Quiz). Mit „+ Spalte“ hinzufügen (max. 8), mit ◀ ▶ verschieben, mit ✕ löschen. Ein Modus darf mehrfach vorkommen, z.B. zwei Pantomime-Spalten mit unterschiedlichen Titeln.
- **Zeilen:** Punktwerte links frei änderbar, „+ Zeile“ hinzufügen (max. 8).
- **Felder füllen:** Feld anklicken → Einträge hinzufügen. Pro Feld wird zufällig ein noch nicht gespielter Eintrag gezogen, du kannst also mehr vorbereiten als nötig. Rote Felder sind noch leer und können nicht gespielt werden.
  - Tabu: verbotene Wörter mit Komma trennen.
  - Guess: Bild hochladen (wird automatisch verkleinert), dann ins Bild klicken, wo der erste kleine Ausschnitt liegen soll.
  - Quiz: Frage, 4 Antworten, richtige anklicken.
  - `{name}` wird überall durch den Namen des Geburtstagskinds ersetzt.
- **Einstellungen:** Titel, Name Geburtstagskind, Rundendauer, Klauen, Doppelt-Felder, Finaltext, Finale-Foto. Leere Felder = Standardwert aus `config.json`.
- **Sicherung:** „Spiel als Datei sichern“ lädt alles als JSON herunter. „Startinhalte aus content.json laden“ ersetzt alles durch die Inhalte aus dem Repo.

Der Tab **„🎮 Live-Steuerung“** ist für den Abend: Spiel starten, Geburtstagskind markieren, Regelverstösse und Klauen entscheiden, Punkte korrigieren, Personen verschieben. Wartet im Spiel eine Entscheidung, erscheint im Bearbeiten-Tab ein roter Hinweis.

## Vorschläge von Gästen

Unter **`/vorschlag`** können Gäste schon vor dem Spiel Begriffe, Songs, Bilder und Quizfragen einreichen, so viele sie wollen. Den Link findest du im Admin-Tool, auf der Startseite und in der Lobby auf dem Handy.

- Gäste geben ihren Namen ein, wählen eine Kategorie (Spalte) und füllen die passenden Felder aus. Punkte wählen sie nicht.
- **Freigabe:** Neue Vorschläge sind zuerst „offen“ und noch **nicht** im Spiel. Im Admin-Tool (ganz oben unter „💡 Vorschläge von Gästen“) gibst du 👍 oder 👎. Du siehst bei jedem Vorschlag, von wem er kommt, und kannst die Person bei Bedarf direkt fragen.
- Angenommene Vorschläge können in **jedem Feld ihrer Spalte** gezogen werden, aber nur einmal pro Spiel. Wer will, legt pro Vorschlag einen festen Punktwert fest („nur 300“).
- **Fairness:** Ein Vorschlag kommt nie beim Team der Person dran, die ihn eingereicht hat. Wenn möglich auch nicht beim Team, das gerade klauen dürfte (bei nur 2 Teams wäre er sonst nie spielbar). Erkannt wird das am Namen, darum sollen Gäste denselben Namen wie beim Mitspielen eingeben (Gross/Klein und Leerzeichen sind egal).
- Mit „Neue Vorschläge annehmen“ schliesst du die Seite. Die Liste aktualisiert sich alle 15 Sekunden.
- Für Songs gibt es den Spielmodus **„Song summen“**: Lege im Admin-Tool eine Spalte mit diesem Modus an.

## Startinhalte im Repo (optional)

Beim allerersten Start wird das Spiel aus **`content/content.json`** (Inhalte) und **`content/images/`** (Bilder) erzeugt. Danach bearbeitest du alles im Admin-Tool. Die Dateien brauchst du nur noch, wenn du Inhalte lieber in Excel vorbereitest und dann im Admin-Tool „Startinhalte aus content.json laden“ klickst.

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

- `richtig` ist der Index der richtigen Antwort, gezählt ab 0.
- `fokusX`/`fokusY` (0 bis 1) legen den ersten Bildausschnitt fest; fehlen sie, wird zufällig gewählt.
- Inhalte prüfen: `npm run validate` (läuft auch bei jedem Build).

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

- **Auf Vercel:** Im Vercel-Projekt unter **Settings → Environment Variables** die Variable `ADMIN_PIN` (oder `ADMIN_KEY`) anlegen oder bearbeiten (für Production, Preview und Development). Danach unter **Deployments** beim neuesten Deploy **⋯ → Redeploy** klicken. Erst dann gilt die neue PIN, denn Vercel übernimmt geänderte Variablen nur bei einem neuen Deploy.
- **Lokal:** In `config.json` das Feld `adminPin` ändern und neu starten.
- Ist `ADMIN_PIN` gesetzt, gilt diese PIN, und `adminPin` in `config.json` wird ignoriert.

## Teamnamen

Die Teams heissen anfangs „Team 1“ und „Team 2“ (aus `config.json`). Beim Beitreten kann man den Namen des gewählten Teams direkt anpassen, in der Lobby zusätzlich mit „✏️ Teamnamen ändern“. Die Spielleitung kann die Namen in der Live-Steuerung jederzeit ändern. Bei „Neues Spiel“ gelten wieder die Startnamen.

## config.json

Standardwerte. Titel, Name, Timer usw. kannst du im Admin-Tool unter „Einstellungen“ überschreiben.

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
3. In `/admin` → Live-Steuerung das Geburtstagskind markieren (☑️) und **Spiel starten**.
4. Die Person am Zug wählt auf dem Handy ein Feld, liest den Begriff und drückt **Start**.
5. Gegner:innen kontrollieren und drücken bei Bedarf **„Regelverstoss!“** bzw. **„TABU!“**. Du entscheidest in `/admin`.
6. Wenn alle Felder gespielt sind, kommt das Finale. Du kannst es in `/admin` auch vorzeitig auslösen.

Die Spielleitung kann jederzeit Punkte korrigieren, Runden abbrechen, Felder zurücksetzen (Punkte werden abgezogen), den Timer pausieren, zur nächsten Person springen, Personen verschieben oder entfernen. Die Doppelt-Felder siehst nur du (×2 im Admin-Board).

## Testen (allein)

- **`/tv?test=1`** erzeugt 6 Fake-Spieler:innen in 2 Teams, eine davon als Geburtstagskind.
- In `/admin` → Live-Steuerung gibt es bei jeder Person den Link **„📱 als Person öffnen“**. Er öffnet die Handy-Ansicht dieser Person in einem neuen Tab, so kannst du jede Rolle selbst spielen.
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

- Frontend: Vite + React + TypeScript (`client/`), Schrift Nunito lokal via `@fontsource`
- API: `api/game.js` und `api/image.js` (Vercel Functions), gemeinsame Logik in `lib/`
- Lokal: Express-Server (`server/index.js`), im Dev-Modus mit Vite-Middleware (Hot Reload)
- Spielstand und Spieldefinition: Upstash Redis (Vercel) bzw. `data/savegame.json`, `data/spiel.json` und `data/bilder/` (lokal). Hochgeladene Bilder liegen ebenfalls in der Datenbank. Gleichzeitige Aktionen werden per Compare-and-set sicher zusammengeführt.
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
- **Admin-Tool = Spiel bearbeiten:** Punkte und Spieler:innen sind nicht weg, sondern im Tab „Live-Steuerung“, weil man sie während des Spiels braucht (Regelverstoss, Klauen, Geburtstagskind).
- **Strukturänderungen während des Spiels:** Neue Spalten/Zeilen sind sofort spielbar, gespielte Felder behalten ihren Stand. Doppelt-Felder werden nur vor dem Spielstart neu verteilt.
- **Leere Felder** können nicht gewählt werden; der Server meldet das, statt eine leere Runde zu starten.
