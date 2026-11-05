import { useEffect, useState } from 'react';
import { postAction } from '../api';
import { BackButton, Background } from '../components';
import { shrinkImage } from '../image';
import { modeInfo } from '../modes';
import type { Mode } from '../types';

interface Info {
  title: string;
  bdayName: string;
  open: boolean;
  columns: { id: string; mode: Mode; title: string }[];
  values: number[];
}

const NAME_KEY = 'leagame.name'; // derselbe Speicher wie beim Beitreten

/** Seite, auf der Gäste schon vor dem Spiel Begriffe, Songs, Bilder und Fragen vorschlagen. */
export default function Suggest() {
  const [info, setInfo] = useState<Info | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem(NAME_KEY) || '';
    } catch {
      return '';
    }
  });
  const [col, setCol] = useState<string | null>(null);
  const [begriff, setBegriff] = useState('');
  const [verboten, setVerboten] = useState('');
  const [kategorie, setKategorie] = useState('');
  const [loesung, setLoesung] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [frage, setFrage] = useState('');
  const [optionen, setOptionen] = useState(['', '', '', '']);
  const [richtig, setRichtig] = useState(0);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(0);
  const [thanks, setThanks] = useState(false);

  useEffect(() => {
    fetch('/api/game?vorschlag=1', { cache: 'no-store' })
      .then((r) => r.json())
      .then(setInfo)
      .catch(() => setErr('Server nicht erreichbar.'));
  }, []);
  useEffect(() => {
    if (!file) return setPreview(null);
    const u = URL.createObjectURL(file);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  if (!info) return <Shell>{err ? <div className="error">{err}</div> : <h1>Lade …</h1>}</Shell>;
  const modes = modeInfo(info.bdayName);
  const column = info.columns.find((c) => c.id === col);
  const mode = column?.mode;

  if (!info.open)
    return (
      <Shell>
        <div className="panel" style={{ textAlign: 'center' }}>
          <h1>💡 Vorschläge sind geschlossen</h1>
          <p>Die Spielleitung nimmt gerade keine Vorschläge mehr an. Danke trotzdem!</p>
        </div>
      </Shell>
    );

  const reset = () => {
    setBegriff('');
    setVerboten('');
    setLoesung('');
    setFile(null);
    setFrage('');
    setOptionen(['', '', '', '']);
    setRichtig(0);
  };

  const complete = (() => {
    if (!name.trim() || !column) return false;
    if (mode === 'tabu') return !!begriff.trim() && verboten.split(',').some((x) => x.trim());
    if (mode === 'guess') return !!file && !!loesung.trim();
    if (mode === 'quiz') return !!frage.trim() && optionen.every((o) => o.trim());
    return !!begriff.trim();
  })();

  const submit = async () => {
    setErr(null);
    setBusy(true);
    try {
      try {
        localStorage.setItem(NAME_KEY, name.trim());
      } catch {}
      const entry =
        mode === 'tabu'
          ? { begriff, verboten: verboten.split(',').map((x) => x.trim()).filter(Boolean) }
          : mode === 'guess'
            ? { kategorie: kategorie || 'Bild', loesung }
            : mode === 'quiz'
              ? { frage, optionen, richtig }
              : { begriff };
      const dataUrl = mode === 'guess' && file ? await shrinkImage(file) : undefined;
      await postAction({ role: 'player' }, 'suggest', { von: name.trim(), col, entry, dataUrl });
      setSent((n) => n + 1);
      setThanks(true);
      reset();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell>
      <h1 className="title" style={{ textAlign: 'center', fontSize: 34 }}>
        💡 Vorschläge für
        <br />
        {info.title}
      </h1>

      <div className="panel blue" style={{ fontSize: 18, lineHeight: 1.35 }}>
        <b style={{ fontSize: 20 }}>So funktioniert's</b>
        <p style={{ margin: '8px 0' }}>
          Schlag so viele Begriffe, Songs, Bilder oder Quizfragen vor, wie du willst. Die Spielleitung schaut sich jeden Vorschlag an und nimmt die passenden ins Spiel. Ausser ihr sieht niemand, was du einträgst, und es wird nichts verraten.
        </p>
        <p style={{ margin: '8px 0' }}>
          <b>Dein Vorschlag kommt nie bei dir oder deinem Team dran.</b> Sonst hättet ihr einen Vorteil, weil ihr die Lösung schon kennt. Wenn möglich bekommt ihn auch nicht das Team, das gerade klauen dürfte.
        </p>
        <p style={{ margin: '8px 0 0' }}>
          👉 Gib darum <b>genau den Namen ein, mit dem du nachher mitspielst</b>. Nur so erkennt das Spiel, zu welchem Team du gehörst. Und falls bei einem Vorschlag etwas unklar ist, weiss die Spielleitung, wen sie fragen kann.
        </p>
      </div>

      {thanks && (
        <div className="panel" style={{ background: '#3DDC84', color: '#2A1E5C', textAlign: 'center' }}>
          <h2 style={{ margin: 0 }}>Danke! 🎉</h2>
          <p style={{ margin: '6px 0 0' }}>
            {sent === 1 ? 'Dein Vorschlag ist bei der Spielleitung.' : `${sent} Vorschläge eingereicht.`} Noch einer?
          </p>
        </div>
      )}

      <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label className="card-title">Dein Name (wie beim Mitspielen)</label>
        <input className="input" value={name} maxLength={20} onChange={(e) => setName(e.target.value)} placeholder="z.B. Anna" autoComplete="nickname" />

        <label className="card-title">Kategorie</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {info.columns.map((c) => (
            <button
              key={c.id}
              className={`team-btn ${col === c.id ? 'sel' : ''}`}
              style={{ '--tc': modes[c.mode].color, fontSize: 18, minHeight: 64, padding: '6px 8px' } as any}
              onClick={() => {
                setCol(c.id);
                setThanks(false);
              }}
            >
              {modes[c.mode].icon} {c.title}
            </button>
          ))}
        </div>
        {column && <div className="hint">{modes[column.mode].rule}</div>}

        {mode && ['pantomime', 'malen', 'emoji', 'summen', 'tabu'].includes(mode) && (
          <>
            <label className="card-title">{mode === 'summen' ? 'Song (Titel – Interpret)' : mode === 'emoji' ? 'Begriff (z.B. Film, Serie, Song)' : 'Begriff'}</label>
            <input className="input" value={begriff} maxLength={120} onChange={(e) => setBegriff(e.target.value)} placeholder={mode === 'summen' ? 'z.B. Atemlos – Helene Fischer' : ''} />
          </>
        )}
        {mode === 'tabu' && (
          <>
            <label className="card-title">Verbotene Wörter (mit Komma trennen)</label>
            <input className="input" value={verboten} onChange={(e) => setVerboten(e.target.value)} placeholder="z.B. trinken, Bohne, Tasse" />
          </>
        )}
        {mode === 'guess' && (
          <>
            <label className="card-title">Bild (z.B. Screenshot aus Film, Serie, Ort)</label>
            {preview && <img src={preview} alt="" style={{ width: '100%', borderRadius: 14 }} />}
            <label className="btn" style={{ cursor: 'pointer' }}>
              🖼️ {file ? 'Anderes Bild wählen' : 'Bild wählen'}
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </label>
            <label className="card-title">Kategorie („Guess the …“)</label>
            <input className="input" value={kategorie} maxLength={40} onChange={(e) => setKategorie(e.target.value)} placeholder="Character, Film, Ort …" />
            <label className="card-title">Lösung</label>
            <input className="input" value={loesung} maxLength={120} onChange={(e) => setLoesung(e.target.value)} />
          </>
        )}
        {mode === 'quiz' && (
          <>
            <label className="card-title">Frage über {info.bdayName}</label>
            <input className="input" value={frage} maxLength={300} onChange={(e) => setFrage(e.target.value)} placeholder={`z.B. Was ist ${info.bdayName}s Lieblingsessen?`} />
            <label className="card-title">4 Antworten – richtige antippen</label>
            {optionen.map((o, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button className={`btn small ${richtig === i ? 'green' : 'ghost'}`} style={{ minWidth: 56, minHeight: 56 }} onClick={() => setRichtig(i)} aria-label="richtige Antwort">
                  {richtig === i ? '✓' : 'ABCD'[i]}
                </button>
                <input
                  className="input"
                  value={o}
                  maxLength={120}
                  placeholder={`Antwort ${'ABCD'[i]}`}
                  onChange={(e) => {
                    const n = [...optionen];
                    n[i] = e.target.value;
                    setOptionen(n);
                  }}
                />
              </div>
            ))}
          </>
        )}

        {err && <div className="error">{err}</div>}
        <button className="btn big" disabled={!complete || busy} onClick={submit}>
          {busy ? 'Sende …' : 'Vorschlag einreichen 💡'}
        </button>
        {!col && <p className="muted" style={{ margin: 0, textAlign: 'center' }}>Wähle zuerst eine Kategorie.</p>}
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: any }) {
  return (
    <div className="app">
      <Background count={6} />
      <div className="phone">
        <BackButton />
        {children}
      </div>
    </div>
  );
}
