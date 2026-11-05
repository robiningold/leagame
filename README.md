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
- Inhalte und Kategorien bearbeitest du im Admin-Tool; dafür ist kein Deploy nötig. Nur Änderungen an `config.json` brauchen einen Push.

## B) Lokal auf dem Laptop

Voraussetzung: [Node.js](https://nodejs.org) 20 oder neuer.

```bash
npm install
```

```bash
npm start
```

`npm start` prüft `config.json`, baut das Frontend und startet den Server auf **Port 3000**. Die Konsole zeigt die Adressen, zum Beispiel:

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

Lokal ist alles offline lauffähig: Schrift (Nunito) und QR-Code sind eingebaut, Sounds werden per Web Audio erzeugt. Kategorien, Vorschläge und Bilder liegen lokal in `data/`.

---

## So funktioniert das Spiel

Kein Jeopardy-Brett, keine vorgefertigten Inhalte: **Alle Begriffe, Songs, Bilder und Quizfragen kommen von den Gästen.**

1. Gäste reichen vorab unter **`/vorschlag`** Vorschläge ein (Name + Kategorie + Inhalt).
2. Du gibst im Admin-Tool jedem Vorschlag 👍 oder 👎.
3. Im Spiel wählt die Person am Zug auf dem Handy eine **Kategorie**. Daraus wird zufällig ein angenommener Vorschlag gezogen, jeder nur einmal pro Spiel.
4. **Punkte:** Richtig = Grundpunkte (Standard 100). Bei Bildern gibt es einen Bonus, je früher erraten: 200 / 150 / 125 / 100. Klauen = halbe Grundpunkte.
5. Das Spiel endet automatisch, wenn keine angenommenen Vorschläge mehr übrig sind, oder wenn du es in der Live-Steuerung beendest.

## Spiel bearbeiten (Admin-Tool)

`/admin` → Tab **„✏️ Spiel bearbeiten“**. Alles wird automatisch gespeichert (in der Datenbank) und gilt sofort, ohne neuen Deploy.

- **💡 Vorschläge von Gästen** (ganz oben): pro Kategorie eine Tabelle mit Vorschlag, Name, Zeit und Status; Filter Alle / Offen / Angenommen / Abgelehnt; 👍 / 👎 / 🗑️ in jeder Zeile. Mit „Neue Vorschläge annehmen“ schliesst du die Vorschlagsseite. Die Liste aktualisiert sich alle 15 Sekunden.
- **Kategorien:** Titel und Spielmodus frei wählbar (Pantomime, Tabu, Malen, Emoji, Guess the ___, Quiz über das Geburtstagskind, Song summen), hinzufügen, verschieben, löschen. Ein Modus darf mehrfach vorkommen. `{name}` wird durch den Namen des Geburtstagskinds ersetzt.
- **Einstellungen:** Titel, Name Geburtstagskind, Punkte pro richtige Antwort, Rundendauer, Klauen, Finaltext, Finale-Foto. Leere Felder = Standardwert aus `config.json`.
- **Sicherung:** Kategorien und Vorschläge als Datei herunterladen.

Der Tab **„🎮 Live-Steuerung“** ist für den Abend: Spiel starten, Geburtstagskind markieren, Kategorie für die Person am Zug wählen, Regelverstösse und Klauen entscheiden, Punkte korrigieren, Personen verschieben. Wartet im Spiel eine Entscheidung, erscheint im Bearbeiten-Tab ein roter Hinweis.

## Vorschläge von Gästen

- Gäste geben ihren Namen ein, wählen eine Kategorie und füllen die passenden Felder aus, so viele Vorschläge wie sie wollen.
- **Fairness:** Ein Vorschlag kommt nie beim Team der Person dran, die ihn eingereicht hat. Wenn möglich auch nicht beim Team, das gerade klauen dürfte (bei nur 2 Teams wäre er sonst nie spielbar). Erkannt wird das am Namen, darum sollen Gäste denselben Namen wie beim Mitspielen eingeben (Gross/Klein und Leerzeichen sind egal). Auf dem Handy steht bei jeder Kategorie, wie viele Vorschläge das eigene Team noch ziehen darf.
- Bilder werden beim Hochladen automatisch verkleinert.

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
| `punkteProRunde` | Punkte pro richtige Antwort (Standard 100) |
| `rundendauerSekunden` | Timer pro Runde (Standard 60) |
| `klauen` | Klauen an (`true`) oder aus (`false`) |
| `klauenDauerSekunden` | Zeit fürs Klauen (Standard 10) |
| `aufloesungSekunden` | So lange bleibt die Auflösung stehen (Standard 8) |
| `finaltext` | Geburtstagstext auf dem Finale-Screen |

## Spielablauf (Kurzfassung)

1. TV öffnen und einmal klicken (Browser erlauben Ton erst nach einem Klick).
2. Alle scannen den QR-Code, geben ihren Namen ein und wählen ein Team.
3. In `/admin` → Live-Steuerung das Geburtstagskind markieren (☑️) und **Spiel starten**.
4. Die Person am Zug wählt auf dem Handy eine Kategorie, liest den gezogenen Begriff und drückt **Start**.
5. Gegner:innen kontrollieren und drücken bei Bedarf **„Regelverstoss!“** bzw. **„TABU!“**. Du entscheidest in `/admin`.
6. Wenn keine angenommenen Vorschläge mehr übrig sind, kommt das Finale. Du kannst es in `/admin` auch vorzeitig auslösen.

Die Spielleitung kann jederzeit Punkte korrigieren, Runden abbrechen, den Timer pausieren, zur nächsten Person springen, Personen verschieben oder entfernen.

## Testen (allein)

- **`/tv?test=1`** erzeugt 6 Fake-Spieler:innen in 2 Teams (eine davon Geburtstagskind) und füllt leere Kategorien mit **Testdaten** (inkl. Testbildern). Im Admin-Tool löschst du sie mit „🧪 Testdaten löschen“.
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
- Spielstand, Kategorien und Vorschläge: Upstash Redis (Vercel) bzw. `data/savegame.json`, `data/spiel.json`, `data/vorschlaege.json` und `data/bilder/` (lokal). Hochgeladene Bilder liegen ebenfalls in der Datenbank. Gleichzeitige Aktionen werden per Compare-and-set sicher zusammengeführt.
- Echtzeit: Polling (TV 0,5 s, Handys 0,8 s). Timer laufen mit Server-Zeitstempeln synchron auf allen Geräten.

## Getroffene Entscheidungen

- **Vercel statt Socket.io:** Auf Vercel laufen keine dauerhaften Server, darum Polling plus Redis statt WebSockets. Lokal läuft derselbe Code.
- **Game-PIN:** Zum Beitreten nötig. Der QR-Code enthält ihn schon, also muss man ihn nur bei manueller Eingabe tippen.
- **Klauen und Sichtbarkeit:** Das Team, das als Nächstes klauen dürfte, sieht den Begriff während der Runde **nicht**, sonst wäre Klauen geschenkt. Andere Gegner-Teams (bei 3–4 Teams) sehen ihn. Bei nur 2 Teams kontrolliert damit vor allem die Spielleitung (sie hat ebenfalls einen „Regelverstoss“-Button). Wer bei 2 Teams lieber Kontrolle durch die Gegner will: `"klauen": false`.
- **Klauen** gibt es nach „Zeit abgelaufen“, „Aufgeben“ und falscher Quiz-Antwort, aber **nicht** nach einem bestätigten Regelverstoss. Ein richtiger Klau bringt die Hälfte der Grundpunkte.
- **Guess:** Bonus je nach Aufdeck-Stufe im Moment von „Erraten!“: doppelte, 1,5-fache, 1,25-fache oder einfache Grundpunkte.
- **Wer kennt [Name]?:** Ist ein Geburtstagskind markiert, bestätigt es jede Quiz-Auflösung mit „Stimmt!“, egal welches Team dran ist. Die Spielleitung kann das übersteuern. Ohne markiertes Geburtstagskind wird sofort aufgelöst. Ist das Geburtstagskind selbst am Zug, übernimmt die nächste Person im Team. Die Rotation läuft danach normal weiter, als hätte das Geburtstagskind gespielt.
- **Runde abbrechen:** Es gibt keine Punkte, der gezogene Vorschlag gilt als verbraucht (z.B. wenn er fehlerhaft war).
- **Späte Gäste** können auch während des Spiels beitreten und kommen ans Ende der Reihenfolge ihres Teams. Wer in ein anderes Team verschoben wird, kommt dort ebenfalls ans Ende.
- **Auflösung** bleibt `aufloesungSekunden` stehen (Standard 8 s), die Spielleitung kann mit „Weiter“ abkürzen.
- **„Gespeichertes Spiel fortsetzen?“** fragen TV und Admin beim Öffnen, wenn schon ein Spiel mit Spieler:innen existiert. „Neues Spiel“ verlangt die Admin-PIN.
- **Wake Lock:** Wo nicht unterstützt (ältere iPhones), erscheint ein Hinweis, die Auto-Sperre auszuschalten.
- **Admin-Tool = Spiel bearbeiten:** Punkte und Spieler:innen sind nicht weg, sondern im Tab „Live-Steuerung“, weil man sie während des Spiels braucht (Regelverstoss, Klauen, Geburtstagskind).
- **Kein Jeopardy-Brett, keine Doppelt-Felder:** Es gibt nur Kategorien mit einem Topf aus angenommenen Vorschlägen. Kategorien ohne (für das Team erlaubte) Vorschläge sind auf dem Handy ausgegraut.
- **Spielende:** automatisch, sobald nach mindestens einer Runde keine angenommenen Vorschläge mehr übrig sind.
- **Testdaten** füllen nur Kategorien, die noch nie einen angenommenen Vorschlag hatten, und sind markiert, damit sie sich mit einem Klick löschen lassen.
