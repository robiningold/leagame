import { useEffect, useRef, useState } from 'react';
import { postAction } from '../api';
import { modeInfo, MODE_ORDER } from '../modes';
import { shrinkImage } from '../image';
import type { Mode, View } from '../types';

// ---------------------------------------------------------------- Typen der Spieldefinition
interface Entry {
  begriff?: string;
  verboten?: string[];
  kategorie?: string;
  datei?: string;
  loesung?: string;
  fokusX?: number;
  fokusY?: number;
  frage?: string;
  optionen?: string[];
  richtig?: number;
}
interface Suggestion {
  id: string;
  col: string;
  mode: Mode;
  value: number;
  von: string;
  entry: Entry;
  at: number;
}
interface Def {
  rev: number;
  settings: Record<string, any>;
  columns: { id: string; mode: Mode; title: string }[];
  values: number[];
  entries: Record<string, Record<string, Entry[]>>;
}

const MAX_COLUMNS = 8;
const MAX_ROWS = 8;
const MODES: Mode[] = MODE_ORDER;
const randomId = () => Math.random().toString(36).slice(2, 10);

function entryValid(mode: Mode, e: Entry) {
  if (mode === 'tabu') return !!e.begriff && !!e.verboten?.length;
  if (mode === 'guess') return !!e.datei && !!e.loesung;
  if (mode === 'quiz') return !!e.frage && e.optionen?.length === 4 && e.optionen.every(Boolean);
  return !!e.begriff;
}
function emptyEntry(mode: Mode): Entry {
  if (mode === 'tabu') return { begriff: '', verboten: [] };
  if (mode === 'guess') return { kategorie: 'Character', datei: '', loesung: '' };
  if (mode === 'quiz') return { frage: '', optionen: ['', '', '', ''], richtig: 0 };
  return { begriff: '' };
}
function preview(mode: Mode, e: Entry) {
  if (mode === 'quiz') return e.frage || '';
  if (mode === 'guess') return e.loesung || '';
  return e.begriff || '';
}

// ---------------------------------------------------------------- Editor
export default function Editor({ pin, view }: { pin: string; view: View }) {
  const [def, setDef] = useState<Def | null>(null);
  const [defaults, setDefaults] = useState<Record<string, any>>({});
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [sel, setSel] = useState<{ col: string; value: number } | null>(null);
  const [status, setStatus] = useState<'saved' | 'dirty' | 'saving' | 'error'>('saved');
  const [err, setErr] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const latest = useRef<Def | null>(null);
  const modes = modeInfo(view.bdayName);
  const started = view.phase !== 'lobby';

  useEffect(() => {
    fetch(`/api/game?def=1&pin=${encodeURIComponent(pin)}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setDef(d.def);
        setSuggestions(d.suggestions || []);
        const { adminPin, adminPinSource, ...rest } = d.defaults || {};
        setDefaults(rest);
      })
      .catch((e) => setErr(e.message));
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

  const deleteSuggestion = async (id: string) => {
    if (!confirm('Vorschlag löschen?')) return;
    try {
      const res = await postAction({ role: 'admin', pin }, 'deleteSuggestion', { id });
      setSuggestions(res.suggestions);
    } catch (e: any) {
      setErr(e.message);
    }
  };
  const refreshSuggestions = () =>
    fetch(`/api/game?def=1&pin=${encodeURIComponent(pin)}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => d.suggestions && setSuggestions(d.suggestions))
      .catch(() => {});

  if (err && !def) return <div className="error">Spiel konnte nicht geladen werden: {err}</div>;
  if (!def) return <div className="panel">Lade Spiel …</div>;

  const cols = def.columns;
  const list = (col: string, value: number) => def.entries[col]?.[String(value)] || [];

  // ---------- Struktur
  const addColumn = () =>
    update((d) => {
      const id = randomId();
      d.columns.push({ id, mode: 'pantomime', title: 'Neue Spalte' });
      d.entries[id] = Object.fromEntries(d.values.map((v) => [String(v), []]));
    });
  const removeColumn = (id: string) => {
    const n = def.values.reduce((a, v) => a + list(id, v).length, 0);
    if (!confirm(`Spalte „${cols.find((c) => c.id === id)?.title}“ löschen?${n ? ` Dabei gehen ${n} Einträge verloren.` : ''}`)) return;
    update((d) => {
      d.columns = d.columns.filter((c) => c.id !== id);
      delete d.entries[id];
    });
    if (sel?.col === id) setSel(null);
  };
  const moveColumn = (id: string, dir: -1 | 1) =>
    update((d) => {
      const i = d.columns.findIndex((c) => c.id === id);
      const j = i + dir;
      if (j < 0 || j >= d.columns.length) return;
      [d.columns[i], d.columns[j]] = [d.columns[j], d.columns[i]];
    });
  const setMode = (id: string, mode: Mode) => {
    const n = def.values.reduce((a, v) => a + list(id, v).length, 0);
    if (n && !confirm('Spielmodus ändern? Bestehende Einträge bleiben, passen aber evtl. nicht zum neuen Modus (z.B. fehlen verbotene Wörter oder Bilder).')) return;
    update((d) => {
      const c = d.columns.find((x) => x.id === id)!;
      c.mode = mode;
    });
  };
  const addRow = () =>
    update((d) => {
      const v = (Math.max(0, ...d.values) || 0) + 100;
      d.values.push(v);
      for (const c of d.columns) (d.entries[c.id] ||= {})[String(v)] = [];
    });
  const removeRow = (v: number) => {
    const n = cols.reduce((a, c) => a + list(c.id, v).length, 0);
    if (!confirm(`Zeile ${v} löschen?${n ? ` Dabei gehen ${n} Einträge verloren.` : ''}`)) return;
    update((d) => {
      d.values = d.values.filter((x) => x !== v);
      for (const c of d.columns) delete d.entries[c.id]?.[String(v)];
    });
    if (sel?.value === v) setSel(null);
  };
  const changeValue = (oldV: number, raw: string) => {
    const v = Math.round(Number(raw));
    if (!(v > 0) || v === oldV) return;
    if (def.values.includes(v)) return alert(`Den Wert ${v} gibt es schon.`);
    update((d) => {
      d.values = d.values.map((x) => (x === oldV ? v : x));
      for (const c of d.columns) {
        const e = (d.entries[c.id] ||= {});
        e[String(v)] = e[String(oldV)] || [];
        delete e[String(oldV)];
      }
    });
    if (sel?.value === oldV) setSel({ ...sel, value: v });
  };

  const gridCols = `110px repeat(${cols.length}, minmax(150px, 1fr))${cols.length < MAX_COLUMNS ? ' 64px' : ''}`;
  const selCol = sel && cols.find((c) => c.id === sel.col);

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="save-state">
          {status === 'saved' && '✅ Alles gespeichert'}
          {status === 'dirty' && '✏️ Änderungen …'}
          {status === 'saving' && '💾 Speichert …'}
          {status === 'error' && `❌ Nicht gespeichert: ${err}`}
        </div>
        {started && <div className="hint">Das Spiel läuft: Neue Inhalte gelten ab dem nächsten Feld. Neue Felder sind sofort spielbar.</div>}
      </div>

      <Settings def={def} defaults={defaults} update={update} pin={pin} />

      <div className="panel">
        <h2>Spielbrett</h2>
        <p className="muted" style={{ margin: '0 0 10px', fontSize: 15 }}>
          Spaltentitel und Modus oben ändern, Punktwerte links. Feld anklicken, um Begriffe, Fragen oder Bilder einzutragen. Rot = noch leer. {'{name}'} wird überall durch den Namen des Geburtstagskinds ersetzt.
        </p>
        <div style={{ overflowX: 'auto' }}>
          <div className="ed-grid" style={{ gridTemplateColumns: gridCols, minWidth: 110 + cols.length * 158 }}>
            <div className="ed-row" style={{ fontWeight: 800, opacity: 0.8 }}>
              Punkte
            </div>
            {cols.map((c, i) => (
              <div key={c.id} className="ed-head" style={{ '--mc': modes[c.mode].color } as any}>
                <input value={c.title} maxLength={40} onChange={(e) => update((d) => (d.columns.find((x) => x.id === c.id)!.title = e.target.value))} placeholder="Spaltentitel" />
                <select value={c.mode} onChange={(e) => setMode(c.id, e.target.value as Mode)}>
                  {MODES.map((m) => (
                    <option key={m} value={m}>
                      {modeInfo('…')[m].label.replace('Wer kennt …?', 'Quiz (Wer kennt …?)')}
                    </option>
                  ))}
                </select>
                <div className="tools">
                  <button title="Nach links" disabled={i === 0} onClick={() => moveColumn(c.id, -1)}>
                    ◀
                  </button>
                  <button title="Spalte löschen" disabled={cols.length <= 1} onClick={() => removeColumn(c.id)}>
                    ✕
                  </button>
                  <button title="Nach rechts" disabled={i === cols.length - 1} onClick={() => moveColumn(c.id, 1)}>
                    ▶
                  </button>
                </div>
              </div>
            ))}
            {cols.length < MAX_COLUMNS && (
              <button className="ed-add" title="Spalte hinzufügen" onClick={addColumn}>
                + Spalte
              </button>
            )}

            {def.values.map((v) => (
              <RowCells
                key={v}
                v={v}
                def={def}
                sel={sel}
                setSel={setSel}
                changeValue={changeValue}
                removeRow={removeRow}
                canRemove={def.values.length > 1}
                extraCol={cols.length < MAX_COLUMNS}
                bday={view.bdayName}
                suggestions={suggestions}
              />
            ))}
          </div>
        </div>
        {def.values.length < MAX_ROWS && (
          <button className="ed-add" style={{ marginTop: 8, width: 110 }} onClick={addRow}>
            + Zeile
          </button>
        )}
      </div>

      {sel && selCol && (
        <CellEditor
          key={sel.col + sel.value}
          pin={pin}
          mode={selCol.mode}
          title={`${selCol.title.replace('{name}', view.bdayName)} · ${sel.value}`}
          entries={list(sel.col, sel.value)}
          suggestions={suggestions.filter((x) => x.col === sel.col && x.value === sel.value)}
          onDeleteSuggestion={deleteSuggestion}
          color={modes[selCol.mode].color}
          rule={modes[selCol.mode].rule}
          onChange={(fn) =>
            update((d) => {
              const e = ((d.entries[sel.col] ||= {})[String(sel.value)] ||= []);
              fn(e);
            })
          }
          onClose={() => setSel(null)}
        />
      )}

      <SuggestionsPanel pin={pin} def={def} suggestions={suggestions} bday={view.bdayName} onDelete={deleteSuggestion} onRefresh={refreshSuggestions} open={def.settings.vorschlaegeOffen !== false} setOpen={(v) => update((d) => (v ? delete d.settings.vorschlaegeOffen : (d.settings.vorschlaegeOffen = false)))} />

      <div className="panel dark">
        <h2>Sicherung</h2>
        <div className="row">
          <button
            className="btn small ghost"
            onClick={() => {
              const blob = new Blob([JSON.stringify(def, null, 2)], { type: 'application/json' });
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = 'spiel-backup.json';
              a.click();
            }}
          >
            ⬇️ Spiel als Datei sichern
          </button>
          <button
            className="btn small red"
            onClick={async () => {
              if (!confirm('Alle Spalten, Zeilen und Inhalte durch die Startinhalte aus content/content.json ersetzen? Deine Änderungen hier gehen verloren.')) return;
              try {
                const res = await postAction({ role: 'admin', pin }, 'resetDef');
                setDef(res.def);
                latest.current = res.def;
                setSel(null);
              } catch (e: any) {
                setErr(e.message);
              }
            }}
          >
            ↺ Startinhalte aus content.json laden
          </button>
        </div>
      </div>
    </>
  );
}

function RowCells({ v, def, sel, setSel, changeValue, removeRow, canRemove, extraCol, bday, suggestions }: any) {
  const [val, setVal] = useState(String(v));
  useEffect(() => setVal(String(v)), [v]);
  return (
    <>
      <div className="ed-row">
        <input inputMode="numeric" value={val} onChange={(e) => setVal(e.target.value.replace(/\D/g, ''))} onBlur={() => (changeValue(v, val), setVal(String(v)))} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
        <button className="x" disabled={!canRemove} title="Zeile löschen" onClick={() => removeRow(v)}>
          ✕
        </button>
      </div>
      {def.columns.map((c: Def['columns'][number]) => {
        const items: Entry[] = def.entries[c.id]?.[String(v)] || [];
        const valid = items.filter((e) => entryValid(c.mode, e));
        const sugg = (suggestions as Suggestion[]).filter((x) => x.col === c.id && x.value === v);
        const isSel = sel?.col === c.id && sel?.value === v;
        return (
          <button key={c.id} className={`ed-cell ${valid.length || sugg.length ? '' : 'empty'} ${isSel ? 'sel' : ''}`} onClick={() => setSel(isSel ? null : { col: c.id, value: v })}>
            <span className="prev">{valid.length ? preview(c.mode, valid[0]).replaceAll('{name}', bday) : sugg.length ? '💡 nur Vorschläge' : 'leer – antippen'}</span>
            <span className="cnt">
              {valid.length} {valid.length === 1 ? 'Eintrag' : 'Einträge'}
              {sugg.length ? ` · 💡 ${sugg.length}` : ''}
              {items.length > valid.length ? ` · ${items.length - valid.length} unvollständig` : ''}
            </span>
          </button>
        );
      })}
      {extraCol && <div />}
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
            Anzahl Doppelt-Felder
            <input className="input" inputMode="numeric" value={val('anzahlDoppeltFelder')} placeholder={String(defaults.anzahlDoppeltFelder ?? 2)} onChange={(e) => set('anzahlDoppeltFelder', e.target.value.replace(/\D/g, '') !== '' ? Number(e.target.value.replace(/\D/g, '')) : '')} />
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
            Leere Felder = Standardwert aus config.json (grau angezeigt). Doppelt-Felder werden beim Spielstart neu verteilt.
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Feld-Inhalte
function CellEditor({ pin, mode, title, entries, suggestions, onDeleteSuggestion, color, rule, onChange, onClose }: { pin: string; mode: Mode; title: string; entries: Entry[]; suggestions: Suggestion[]; onDeleteSuggestion: (id: string) => void; color: string; rule: string; onChange: (fn: (list: Entry[]) => void) => void; onClose: () => void }) {
  return (
    <div className="panel" style={{ borderTop: `8px solid ${color}` }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>{title}</h2>
        <button className="btn small ghost" onClick={onClose}>
          Schliessen
        </button>
      </div>
      <p className="muted" style={{ fontSize: 15 }}>
        {rule} Pro Feld wird zufällig ein noch nicht gespielter Eintrag gezogen. Du kannst also mehr Einträge anlegen, als nötig sind.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
        {entries.map((e, i) => (
          <EntryForm
            key={`${entries.length}-${i}`}
            pin={pin}
            mode={mode}
            entry={e}
            index={i}
            onChange={(patch) => onChange((l) => (l[i] = { ...l[i], ...patch }))}
            onDelete={() => confirm('Eintrag löschen?') && onChange((l) => l.splice(i, 1))}
          />
        ))}
        <button className="ed-add" style={{ minHeight: 120 }} onClick={() => onChange((l) => l.push(emptyEntry(mode)))}>
          + Eintrag hinzufügen
        </button>
      </div>
      {suggestions.length > 0 && (
        <>
          <h3 style={{ marginBottom: 6 }}>💡 Vorschläge von Gästen ({suggestions.length})</h3>
          <p className="muted" style={{ fontSize: 14, marginTop: 0 }}>Werden mitgezogen, aber nie beim Team der Person, die sie eingereicht hat.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
            {suggestions.map((x) => (
              <SuggestionCard key={x.id} s={x} pin={pin} onDelete={() => onDeleteSuggestion(x.id)} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function SuggestionCard({ s, pin, onDelete, where }: { s: Suggestion; pin: string; onDelete: () => void; where?: string }) {
  const e = s.entry;
  return (
    <div className="entry-card">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <b>💡 von {s.von}</b>
        <button className="btn small red" onClick={onDelete}>
          Löschen
        </button>
      </div>
      {where && <div className="muted" style={{ fontSize: 14 }}>{where}</div>}
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
    </div>
  );
}

function SuggestionsPanel({ pin, def, suggestions, bday, onDelete, onRefresh, open, setOpen }: { pin: string; def: Def; suggestions: Suggestion[]; bday: string; onDelete: (id: string) => void; onRefresh: () => void; open: boolean; setOpen: (v: boolean) => void }) {
  const [show, setShow] = useState(false);
  const url = `${location.origin}/vorschlag`;
  const where = (x: Suggestion) => {
    const c = def.columns.find((c) => c.id === x.col);
    if (!c || !def.values.includes(x.value)) return '⚠️ Spalte oder Zeile gibt es nicht mehr – wird nicht gespielt';
    return `${c.title.replace('{name}', bday)} · ${x.value}`;
  };
  return (
    <div className="panel">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>💡 Vorschläge von Gästen ({suggestions.length})</h2>
        <div className="row">
          <button className="btn small ghost" onClick={onRefresh}>
            ↻ Aktualisieren
          </button>
          <button className="btn small ghost" onClick={() => setShow(!show)}>
            {show ? '▲ Liste zuklappen' : '▼ Alle anzeigen'}
          </button>
        </div>
      </div>
      <p style={{ fontSize: 16 }}>
        Link für Gäste: <b style={{ userSelect: 'all' }}>{url}</b>{' '}
        <button className="btn small ghost" onClick={() => navigator.clipboard?.writeText(url)}>
          Kopieren
        </button>
      </p>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 800 }}>
        <input type="checkbox" checked={open} onChange={(e) => setOpen(e.target.checked)} style={{ width: 22, height: 22 }} />
        Vorschläge annehmen
      </label>
      <p className="muted" style={{ fontSize: 14 }}>
        Vorschläge kommen direkt ins Spiel, aber nie beim Team der Person, die sie eingereicht hat (erkannt am Namen). Im Brett zeigt 💡 die Anzahl pro Feld.
      </p>
      {show && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
          {suggestions.length === 0 && <p>Noch keine Vorschläge.</p>}
          {suggestions.map((x) => (
            <SuggestionCard key={x.id} s={x} pin={pin} onDelete={() => onDelete(x.id)} where={where(x)} />
          ))}
        </div>
      )}
    </div>
  );
}

function ListInput({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [text, setText] = useState(value.join(', '));
  return (
    <input
      className="input"
      value={text}
      placeholder={placeholder}
      onChange={(e) => {
        setText(e.target.value);
        onChange(e.target.value.split(',').map((x) => x.trim()).filter(Boolean));
      }}
    />
  );
}

function EntryForm({ pin, mode, entry, index, onChange, onDelete }: { pin: string; mode: Mode; entry: Entry; index: number; onChange: (p: Partial<Entry>) => void; onDelete: () => void }) {
  const ok = entryValid(mode, entry);
  return (
    <div className="entry-card" style={{ outline: ok ? undefined : '2px dashed rgba(255,77,94,.8)' }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <b>
          #{index + 1} {ok ? '' : <span style={{ color: '#FFB3BB' }}>unvollständig</span>}
        </b>
        <button className="btn small red" onClick={onDelete}>
          Löschen
        </button>
      </div>
      {['pantomime', 'tabu', 'malen', 'emoji', 'summen'].includes(mode) && (
        <>
          <label>{mode === 'emoji' ? 'Begriff (z.B. Filmtitel)' : mode === 'summen' ? 'Song (Titel – Interpret)' : 'Begriff'}</label>
          <input className="input" value={entry.begriff || ''} onChange={(e) => onChange({ begriff: e.target.value })} />
        </>
      )}
      {mode === 'tabu' && (
        <>
          <label>Verbotene Wörter (mit Komma trennen)</label>
          <ListInput value={entry.verboten || []} onChange={(v) => onChange({ verboten: v })} placeholder="z.B. trinken, Bohne, Tasse" />
        </>
      )}
      {mode === 'guess' && (
        <>
          <label>Kategorie („Guess the …“)</label>
          <input className="input" value={entry.kategorie || ''} placeholder="Character, Film, Ort …" onChange={(e) => onChange({ kategorie: e.target.value })} />
          <label>Lösung</label>
          <input className="input" value={entry.loesung || ''} onChange={(e) => onChange({ loesung: e.target.value })} />
          <ImageField
            label="Bild – danach ins Bild klicken, wo der erste kleine Ausschnitt liegen soll"
            pin={pin}
            datei={entry.datei || ''}
            focus={entry.fokusX !== undefined && entry.fokusY !== undefined ? { x: entry.fokusX, y: entry.fokusY } : null}
            onFocus={(x, y) => onChange({ fokusX: x, fokusY: y })}
            onChange={(datei) => onChange({ datei, fokusX: undefined, fokusY: undefined })}
          />
        </>
      )}
      {mode === 'quiz' && (
        <>
          <label>Frage ({'{name}'} = Name des Geburtstagskinds)</label>
          <input className="input" value={entry.frage || ''} onChange={(e) => onChange({ frage: e.target.value })} />
          <label>Antworten (richtige anklicken)</label>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="row" style={{ flexWrap: 'nowrap' }}>
              <input type="radio" name={`richtig-${index}`} checked={entry.richtig === i} onChange={() => onChange({ richtig: i })} style={{ width: 24, height: 24, flex: 'none' }} />
              <input
                className="input"
                value={entry.optionen?.[i] || ''}
                placeholder={`Antwort ${'ABCD'[i]}`}
                style={{ borderColor: entry.richtig === i ? '#3DDC84' : undefined }}
                onChange={(e) => {
                  const o = [...(entry.optionen || ['', '', '', ''])];
                  o[i] = e.target.value;
                  onChange({ optionen: o });
                }}
              />
            </div>
          ))}
        </>
      )}
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
