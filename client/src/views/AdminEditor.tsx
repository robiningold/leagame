import { useEffect, useRef, useState } from 'react';
import { postAction } from '../api';
import { modeInfo, MODE_ORDER } from '../modes';
import { shrinkImage } from '../image';
import type { Mode, View } from '../types';

// ---------------------------------------------------------------- Typen
interface Entry {
  begriff?: string;
  verboten?: string[];
  kategorie?: string;
  datei?: string;
  loesung?: string;
  frage?: string;
  optionen?: string[];
  richtig?: number;
}
interface Suggestion {
  id: string;
  col: string;
  mode: Mode;
  von: string;
  entry: Entry;
  at: number;
  status?: 'offen' | 'angenommen' | 'abgelehnt';
  test?: boolean;
}
interface Def {
  rev: number;
  settings: Record<string, any>;
  columns: { id: string; mode: Mode; title: string }[];
}

const MAX_COLUMNS = 12;
const randomId = () => Math.random().toString(36).slice(2, 10);

// ---------------------------------------------------------------- Editor
export default function Editor({ pin, view }: { pin: string; view: View }) {
  const [def, setDef] = useState<Def | null>(null);
  const [defaults, setDefaults] = useState<Record<string, any>>({});
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [status, setStatus] = useState<'saved' | 'dirty' | 'saving' | 'error'>('saved');
  const [err, setErr] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const latest = useRef<Def | null>(null);
  const modes = modeInfo(view.bdayName);
  const started = view.phase !== 'lobby';

  const load = (withDef: boolean) =>
    fetch(`/api/game?def=1&pin=${encodeURIComponent(pin)}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        if (withDef) {
          setDef(d.def);
          const { adminPin, adminPinSource, ...rest } = d.defaults || {};
          setDefaults(rest);
        }
        setSuggestions(d.suggestions || []);
      });

  useEffect(() => {
    load(true).catch((e) => setErr(e.message));
    // Vorschläge alle 15 Sekunden aktualisieren
    const t = window.setInterval(() => load(false).catch(() => {}), 15000);
    return () => clearInterval(t);
  }, [pin]);

  const save = async () => {
    const d = latest.current;
    if (!d) return;
    setStatus('saving');
    try {
      await postAction({ role: 'admin', pin }, 'saveDef', { def: d });
      setStatus(latest.current === d ? 'saved' : 'dirty');
      setErr(null);
    } catch (e: any) {
      setStatus('error');
      setErr(e.message);
    }
  };
  // Jede Änderung wird nach kurzer Pause automatisch gespeichert
  const update = (fn: (d: Def) => void) => {
    setDef((prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      fn(next);
      latest.current = next;
      return next;
    });
    setStatus('dirty');
    clearTimeout(timer.current);
    timer.current = window.setTimeout(save, 700);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (status === 'dirty' || status === 'saving') e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [status]);

  const call = async (type: string, payload: any) => {
    try {
      const res = await postAction({ role: 'admin', pin }, type, payload);
      if (res.suggestions) setSuggestions(res.suggestions);
      return res;
    } catch (e: any) {
      setErr(e.message);
    }
  };
  const deleteSuggestion = (id: string) => confirm('Vorschlag ganz löschen?') && call('deleteSuggestion', { id });
  const reviewSuggestion: Review = (id, patch) => {
    setSuggestions((l) => l.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    call('reviewSuggestion', { id, ...patch });
  };
  const deleteTest = () => confirm('Alle Testdaten löschen?') && call('deleteTestData', {});

  if (err && !def) return <div className="error">Spiel konnte nicht geladen werden: {err}</div>;
  if (!def) return <div className="panel">Lade Spiel …</div>;

  const cols = def.columns;
  const countOf = (colId: string, st: string) => suggestions.filter((x) => x.col === colId && (x.status || 'offen') === st).length;

  const addColumn = () =>
    update((d) => {
      d.columns.push({ id: randomId(), mode: 'pantomime', title: 'Neue Kategorie' });
    });
  const removeColumn = (id: string) => {
    const n = suggestions.filter((x) => x.col === id).length;
    if (!confirm(`Kategorie „${cols.find((c) => c.id === id)?.title}“ löschen?${n ? ` Ihre ${n} Vorschläge werden dann nicht mehr gespielt.` : ''}`)) return;
    update((d) => {
      d.columns = d.columns.filter((c) => c.id !== id);
    });
  };
  const moveColumn = (id: string, dir: -1 | 1) =>
    update((d) => {
      const i = d.columns.findIndex((c) => c.id === id);
      const j = i + dir;
      if (j < 0 || j >= d.columns.length) return;
      [d.columns[i], d.columns[j]] = [d.columns[j], d.columns[i]];
    });
  const setMode = (id: string, mode: Mode) => {
    const n = suggestions.filter((x) => x.col === id).length;
    if (n && !confirm('Spielmodus ändern? Vorhandene Vorschläge passen dann evtl. nicht mehr (z.B. fehlen Bilder oder verbotene Wörter).')) return;
    update((d) => {
      d.columns.find((x) => x.id === id)!.mode = mode;
    });
  };

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="save-state">
          {status === 'saved' && '✅ Alles gespeichert'}
          {status === 'dirty' && '✏️ Änderungen …'}
          {status === 'saving' && '💾 Speichert …'}
          {status === 'error' && `❌ Nicht gespeichert: ${err}`}
        </div>
        {started && <div className="hint">Das Spiel läuft: Neu angenommene Vorschläge sind sofort im Spiel.</div>}
      </div>
      {err && def && status !== 'error' && <div className="error">{err}</div>}

      <SuggestionsPanel
        pin={pin}
        def={def}
        suggestions={suggestions}
        bday={view.bdayName}
        onDelete={deleteSuggestion}
        onReview={reviewSuggestion}
        onRefresh={() => load(false)}
        onDeleteTest={deleteTest}
        open={def.settings.vorschlaegeOffen !== false}
        setOpen={(v) => update((d) => (v ? delete d.settings.vorschlaegeOffen : (d.settings.vorschlaegeOffen = false)))}
      />

      <div className="panel">
        <h2>Kategorien</h2>
        <p className="muted" style={{ margin: '0 0 12px', fontSize: 15 }}>
          Titel und Spielmodus frei wählbar. Die Person am Zug wählt eine Kategorie, daraus wird zufällig ein angenommener Vorschlag gezogen. {'{name}'} wird durch den Namen des Geburtstagskinds ersetzt.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 12 }}>
          {cols.map((c, i) => (
            <div key={c.id} className="ed-head" style={{ '--mc': modes[c.mode].color, padding: 12 } as any}>
              <input value={c.title} maxLength={40} onChange={(e) => update((d) => (d.columns.find((x) => x.id === c.id)!.title = e.target.value))} placeholder="Titel" />
              <select value={c.mode} onChange={(e) => setMode(c.id, e.target.value as Mode)}>
                {MODE_ORDER.map((m) => (
                  <option key={m} value={m}>
                    {modeInfo('…')[m].icon} {modeInfo('…')[m].label.replace('Wer kennt …?', 'Quiz über das Geburtstagskind')}
                  </option>
                ))}
              </select>
              <div style={{ fontSize: 14, fontWeight: 800 }}>
                👍 {countOf(c.id, 'angenommen')} angenommen · 🕓 {countOf(c.id, 'offen')} offen
              </div>
              <div className="tools">
                <button title="Nach vorne" disabled={i === 0} onClick={() => moveColumn(c.id, -1)}>
                  ◀
                </button>
                <button title="Kategorie löschen" disabled={cols.length <= 1} onClick={() => removeColumn(c.id)}>
                  ✕
                </button>
                <button title="Nach hinten" disabled={i === cols.length - 1} onClick={() => moveColumn(c.id, 1)}>
                  ▶
                </button>
              </div>
            </div>
          ))}
          {cols.length < MAX_COLUMNS && (
            <button className="ed-add" style={{ minHeight: 150 }} onClick={addColumn}>
              + Kategorie
            </button>
          )}
        </div>
      </div>

      <Settings def={def} defaults={defaults} update={update} pin={pin} />

      <div className="panel dark">
        <h2>Sicherung</h2>
        <div className="row">
          <button
            className="btn small ghost"
            onClick={() => {
              const blob = new Blob([JSON.stringify({ def, suggestions }, null, 2)], { type: 'application/json' });
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = 'spiel-backup.json';
              a.click();
            }}
          >
            ⬇️ Kategorien und Vorschläge als Datei sichern
          </button>
          <button
            className="btn small ghost"
            onClick={async () => {
              if (!confirm('Kategorien auf die 7 Standard-Kategorien zurücksetzen? Vorschläge und Einstellungen bleiben.')) return;
              const res = await call('resetDef', {});
              if (res?.def) {
                setDef(res.def);
                latest.current = res.def;
              }
            }}
          >
            ↺ Standard-Kategorien wiederherstellen
          </button>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- Einstellungen
function Settings({ def, defaults, update, pin }: { def: Def; defaults: Record<string, any>; update: (fn: (d: Def) => void) => void; pin: string }) {
  const [open, setOpen] = useState(false);
  const s = def.settings;
  const set = (k: string, v: any) =>
    update((d) => {
      if (v === '' || v === undefined) delete d.settings[k];
      else d.settings[k] = v;
    });
  const val = (k: string) => (s[k] ?? '') as any;
  return (
    <div className="panel">
      <div className="row" style={{ justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => setOpen(!open)}>
        <h2 style={{ margin: 0 }}>⚙️ Einstellungen</h2>
        <span>{open ? '▲ zuklappen' : '▼ aufklappen'}</span>
      </div>
      {open && (
        <div className="settings" style={{ marginTop: 12 }}>
          <label>
            Spieltitel
            <input className="input" value={val('spieltitel')} placeholder={defaults.spieltitel} onChange={(e) => set('spieltitel', e.target.value)} />
          </label>
          <label>
            Name Geburtstagskind
            <input className="input" value={val('geburtstagskind')} placeholder={defaults.geburtstagskind} onChange={(e) => set('geburtstagskind', e.target.value)} />
          </label>
          <label>
            Rundendauer (Sekunden)
            <input className="input" inputMode="numeric" value={val('rundendauerSekunden')} placeholder={String(defaults.rundendauerSekunden ?? 60)} onChange={(e) => set('rundendauerSekunden', e.target.value.replace(/\D/g, '') ? Number(e.target.value.replace(/\D/g, '')) : '')} />
          </label>
          <label>
            Punkte pro richtige Antwort
            <input className="input" inputMode="numeric" value={val('punkteProRunde')} placeholder={String(defaults.punkteProRunde ?? 100)} onChange={(e) => set('punkteProRunde', e.target.value.replace(/\D/g, '') ? Number(e.target.value.replace(/\D/g, '')) : '')} />
          </label>
          <label>
            Klauen
            <select className="input" value={s.klauen === undefined ? '' : s.klauen ? 'ja' : 'nein'} onChange={(e) => set('klauen', e.target.value === '' ? '' : e.target.value === 'ja')}>
              <option value="">Standard ({defaults.klauen ? 'an' : 'aus'})</option>
              <option value="ja">an</option>
              <option value="nein">aus</option>
            </select>
          </label>
          <label>
            Zeit fürs Klauen (Sekunden)
            <input className="input" inputMode="numeric" value={val('klauenDauerSekunden')} placeholder={String(defaults.klauenDauerSekunden ?? 10)} onChange={(e) => set('klauenDauerSekunden', e.target.value.replace(/\D/g, '') ? Number(e.target.value.replace(/\D/g, '')) : '')} />
          </label>
          <label>
            Auflösung anzeigen (Sekunden)
            <input className="input" inputMode="numeric" value={val('aufloesungSekunden')} placeholder={String(defaults.aufloesungSekunden ?? 8)} onChange={(e) => set('aufloesungSekunden', e.target.value.replace(/\D/g, '') ? Number(e.target.value.replace(/\D/g, '')) : '')} />
          </label>
          <label style={{ gridColumn: '1 / -1' }}>
            Geburtstagstext im Finale
            <textarea className="input" rows={3} value={val('finaltext')} placeholder={defaults.finaltext} onChange={(e) => set('finaltext', e.target.value)} style={{ resize: 'vertical' }} />
          </label>
          <div style={{ gridColumn: '1 / -1' }}>
            <ImageField
              label="Foto im Finale (optional)"
              pin={pin}
              datei={s.finaleBild || ''}
              onChange={(datei) => set('finaleBild', datei)}
            />
          </div>
          <p className="muted" style={{ gridColumn: '1 / -1', fontSize: 14, margin: 0 }}>
            Leere Felder = Standardwert aus config.json (grau angezeigt). Bei Bildern gibt es einen Bonus je früher erraten: doppelte, 1,5-fache, 1,25-fache oder einfache Punktzahl. Klauen gibt die Hälfte.
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Vorschläge
type Review = (id: string, patch: { status?: Suggestion['status'] }) => void;

function SuggestionCard({ s, pin, def, bday, onDelete, onReview }: { s: Suggestion; pin: string; def: Def; bday: string; onDelete: () => void; onReview: Review }) {
  const e = s.entry;
  const col = def.columns.find((c) => c.id === s.col);
  const status = s.status || 'offen';
  return (
    <div className="entry-card" style={{ outline: status === 'angenommen' ? '3px solid #3DDC84' : status === 'abgelehnt' ? '3px solid rgba(255,77,94,.7)' : undefined, opacity: status === 'abgelehnt' ? 0.7 : 1 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <b style={{ fontSize: 18 }}>💡 von {s.von}</b>
        <span className="muted" style={{ fontSize: 13 }}>
          {new Date(s.at).toLocaleString('de-CH', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
      <div className="muted" style={{ fontSize: 14 }}>
        {col ? col.title.replace('{name}', bday) : '⚠️ Spalte gibt es nicht mehr – wird nicht gespielt'}
      </div>
      {s.mode === 'quiz' ? (
        <>
          <div style={{ fontWeight: 800 }}>{e.frage}</div>
          <ol type="A" style={{ margin: 0 }}>
            {e.optionen?.map((o, i) => (
              <li key={i} style={{ color: i === e.richtig ? '#3DDC84' : undefined, fontWeight: i === e.richtig ? 800 : 500 }}>
                {o}
              </li>
            ))}
          </ol>
        </>
      ) : s.mode === 'guess' ? (
        <>
          {e.datei && <img src={`/api/image?file=${encodeURIComponent(e.datei)}&pin=${encodeURIComponent(pin)}`} alt="" style={{ width: '100%', borderRadius: 12 }} />}
          <div>
            <b>{e.loesung}</b> <span className="muted">({e.kategorie})</span>
          </div>
        </>
      ) : (
        <>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{e.begriff}</div>
          {e.verboten?.length ? <div className="muted">Verboten: {e.verboten.join(', ')}</div> : null}
        </>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <button className={`btn small ${status === 'angenommen' ? 'green' : 'ghost'}`} style={{ minHeight: 48, fontSize: 18 }} onClick={() => onReview(s.id, { status: status === 'angenommen' ? 'offen' : 'angenommen' })}>
          👍 {status === 'angenommen' ? 'Angenommen' : 'Annehmen'}
        </button>
        <button className={`btn small ${status === 'abgelehnt' ? 'red' : 'ghost'}`} style={{ minHeight: 48, fontSize: 18 }} onClick={() => onReview(s.id, { status: status === 'abgelehnt' ? 'offen' : 'abgelehnt' })}>
          👎 {status === 'abgelehnt' ? 'Abgelehnt' : 'Ablehnen'}
        </button>
      </div>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="muted" style={{ fontSize: 13 }}>{s.test ? '🧪 Testdaten' : ''}</span>
        <button className="btn small ghost" onClick={onDelete} title="Ganz löschen">
          🗑️
        </button>
      </div>
    </div>
  );
}

function SuggestionsPanel({ pin, def, suggestions, bday, onDelete, onReview, onRefresh, onDeleteTest, open, setOpen }: { pin: string; def: Def; suggestions: Suggestion[]; bday: string; onDelete: (id: string) => void; onReview: Review; onRefresh: () => void; onDeleteTest: () => void; open: boolean; setOpen: (v: boolean) => void }) {
  const [filter, setFilter] = useState<'offen' | 'angenommen' | 'abgelehnt'>('offen');
  const url = `${location.origin}/vorschlag`;
  const count = (st: string) => suggestions.filter((x) => (x.status || 'offen') === st).length;
  const shown = suggestions.filter((x) => (x.status || 'offen') === filter);
  return (
    <div className="panel" style={count('offen') ? { boxShadow: '0 0 0 4px #FFCB2D, 0 12px 30px rgba(20,10,70,.35)' } : undefined}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>
          💡 Vorschläge von Gästen {count('offen') > 0 && <span className="badge" style={{ background: '#FFCB2D', color: '#2A1E5C' }}>{count('offen')} neu</span>}
        </h2>
        <div className="row">
          {suggestions.some((x) => x.test) && (
            <button className="btn small ghost" onClick={onDeleteTest}>
              🧪 Testdaten löschen
            </button>
          )}
          <button className="btn small ghost" onClick={onRefresh}>
            ↻ Aktualisieren
          </button>
        </div>
      </div>
      <p style={{ fontSize: 16, margin: '10px 0' }}>
        Link für Gäste: <b style={{ userSelect: 'all' }}>{url}</b>{' '}
        <button className="btn small ghost" onClick={() => navigator.clipboard?.writeText(url)}>
          Kopieren
        </button>
      </p>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 800 }}>
        <input type="checkbox" checked={open} onChange={(e) => setOpen(e.target.checked)} style={{ width: 22, height: 22 }} />
        Neue Vorschläge annehmen (Seite offen)
      </label>
      <p className="muted" style={{ fontSize: 14 }}>
        Nur 👍 angenommene Vorschläge kommen ins Spiel. Wählt die Person am Zug eine Kategorie, wird daraus zufällig ein Vorschlag gezogen, jeder nur einmal pro Spiel. Er kommt nie beim Team der Person dran, die ihn eingereicht hat.
      </p>
      <div className="tabs" style={{ marginBottom: 12 }}>
        {(['offen', 'angenommen', 'abgelehnt'] as const).map((f) => (
          <button key={f} className={filter === f ? 'sel' : ''} onClick={() => setFilter(f)}>
            {f === 'offen' ? '🕓 Offen' : f === 'angenommen' ? '👍 Angenommen' : '👎 Abgelehnt'} ({count(f)})
          </button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
        {shown.length === 0 && <p className="muted">Keine Vorschläge in dieser Liste.</p>}
        {shown.map((x) => (
          <SuggestionCard key={x.id} s={x} pin={pin} def={def} bday={bday} onDelete={() => onDelete(x.id)} onReview={onReview} />
        ))}
      </div>
    </div>
  );
}

function ImageField({ label, pin, datei, onChange, focus, onFocus }: { label: string; pin: string; datei: string; onChange: (d: string) => void; focus?: { x: number; y: number } | null; onFocus?: (x: number, y: number) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const upload = async (f: File) => {
    setBusy(true);
    setErr(null);
    try {
      const dataUrl = await shrinkImage(f);
      const res = await postAction({ role: 'admin', pin }, 'uploadImage', { dataUrl });
      onChange(res.datei);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  const src = datei ? `/api/image?file=${encodeURIComponent(datei)}&pin=${encodeURIComponent(pin)}` : '';
  const side = Math.sqrt(0.1) * 100; // Stufe 1 = 10 % der Fläche
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 13, fontWeight: 800, textTransform: 'uppercase', opacity: 0.85 }}>{label}</label>
      {src && (
        <div
          className="focus-pick"
          style={{ cursor: onFocus ? 'crosshair' : 'default' }}
          onClick={(e) => {
            if (!onFocus) return;
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            onFocus(Math.round(((e.clientX - r.left) / r.width) * 100) / 100, Math.round(((e.clientY - r.top) / r.height) * 100) / 100);
          }}
        >
          <img src={src} alt="" />
          {onFocus && focus && (
            <div
              className="mark"
              style={{
                width: `${side}%`,
                height: `${side}%`,
                left: `${Math.min(Math.max(focus.x * 100 - side / 2, 0), 100 - side)}%`,
                top: `${Math.min(Math.max(focus.y * 100 - side / 2, 0), 100 - side)}%`,
              }}
            />
          )}
        </div>
      )}
      {onFocus && src && !focus && <div className="muted" style={{ fontSize: 14 }}>Kein Startpunkt gewählt: wird zufällig bestimmt.</div>}
      <div className="row">
        <button className="btn small" disabled={busy} onClick={() => fileRef.current?.click()}>
          {busy ? 'Lädt hoch …' : datei ? '🖼️ Anderes Bild' : '🖼️ Bild hochladen'}
        </button>
        {datei && (
          <button className="btn small ghost" onClick={() => onChange('')}>
            Entfernen
          </button>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload(f);
          e.target.value = '';
        }}
      />
      {err && <div className="error">{err}</div>}
    </div>
  );
}
