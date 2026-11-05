import { useEffect, useMemo, useRef, useState } from 'react';
import { postAction, useGame } from '../api';
import { BackButton, Background, DRAW_COLORS, DRAW_SIZES, ERASER, CategoryPicker, TimerText, makeRenderer, modeOf, playerOf, teamOf, useWakeLock, type DrawOp } from '../components';
import { EMOJI_CATEGORIES } from '../emojis';
import { HOW_TEXT } from '../modes';
import { sfx, unlockAudio } from '../sound';
import type { Round, View } from '../types';

const KEY = 'leagame.playerId';

function useIdentity() {
  const params = new URLSearchParams(location.search);
  const multi = params.get('multi') === '1' || !!params.get('as');
  const storage = multi ? sessionStorage : localStorage;
  const [playerId, setPlayerIdState] = useState<string | null>(() => {
    const as = params.get('as');
    if (as) storage.setItem(KEY, as);
    try {
      return storage.getItem(KEY);
    } catch {
      return null;
    }
  });
  const setPlayerId = (id: string | null) => {
    try {
      if (id) storage.setItem(KEY, id);
      else storage.removeItem(KEY);
    } catch {}
    setPlayerIdState(id);
  };
  return { playerId, setPlayerId, pinParam: params.get('pin') || '' };
}

export default function Join() {
  const { playerId, setPlayerId, pinParam } = useIdentity();
  const { view, act, offline, error } = useGame({ role: 'player', playerId }, 800);
  const [toast, setToast] = useState<string | null>(null);
  // Nur eine Antwort für die aktuelle playerId zählt (nach Beitritt kann noch eine alte unterwegs sein)
  const me = view?.askedFor === playerId ? view?.me : null;
  const wakeLockSupported = useWakeLock(!!me);

  // Unbekannte playerId (neues Spiel oder entfernt) → zurück zum Join-Formular
  useEffect(() => {
    if (view && playerId && view.askedFor === playerId && view.me === null) setPlayerId(null);
  }, [view, playerId]);

  const run = async (type: string, payload: any = {}) => {
    unlockAudio();
    try {
      const res = await act(type, payload);
      return res;
    } catch (e: any) {
      setToast(e.message);
      setTimeout(() => setToast(null), 3000);
    }
  };

  if (!view) {
    return (
      <div className="app">
        <Background count={6} />
        <div className="phone" style={{ justifyContent: 'center', textAlign: 'center' }}>
          <h1>Verbinde …</h1>
          {offline && <p>Keine Verbindung. Bist du im Internet?</p>}
          {error && <p className="error">{error}</p>}
        </div>
      </div>
    );
  }

  const mode = view.round?.mode;
  const wide = mode === 'malen' && view.round?.activeId === me?.id;

  return (
    <div className="app">
      <Background count={6} />
      {offline && <div className="offline-banner">Verbindung unterbrochen – versuche erneut …</div>}
      <div className={`phone ${wide ? 'wide' : ''}`}>
        {!me && playerId && view.askedFor !== playerId ? (
          <h1 style={{ textAlign: 'center', marginTop: 40 }}>Verbinde …</h1>
        ) : !me ? (
          <>
          <BackButton />
          <JoinForm view={view} pinParam={pinParam} onJoined={(id) => setPlayerId(id)} />
          </>
        ) : (
          <>
            <TopBar view={view} />
            {view.phase === 'lobby' && <BackButton />}
            {view.phase === 'lobby' && <LobbyWait view={view} wakeLockSupported={wakeLockSupported} run={run} />}
            {view.phase === 'board' && !view.round && <BoardTurn view={view} run={run} />}
            {view.phase === 'board' && view.round && <PlayerRound view={view} round={view.round} run={run} />}
            {view.phase === 'final' && <FinalPhone view={view} />}
          </>
        )}
        {toast && <div className="error">{toast}</div>}
      </div>
    </div>
  );
}

function TopBar({ view }: { view: View }) {
  const me = view.me!;
  const team = teamOf(view, me.teamId);
  return (
    <div className="topbar">
      <span className="pill" style={{ borderColor: team?.farbe, background: team?.farbe }}>
        {me.bday ? '🎂 ' : ''}
        {me.name}
      </span>
      <span style={{ display: 'flex', gap: 6 }}>
        {view.teams.map((t) => (
          <span key={t.id} className="pill" style={{ borderColor: t.farbe, padding: '2px 10px', fontSize: 16 }}>
            {t.score}
          </span>
        ))}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------- Beitreten
function JoinForm({ view, pinParam, onJoined }: { view: View; pinParam: string; onJoined: (id: string) => void }) {
  const [name, setName] = useState(() => localStorage.getItem('leagame.name') || '');
  const [pin, setPin] = useState(pinParam);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [teamName, setTeamName] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const chosen = view.teams.find((t) => t.id === teamId);
  const canRename = view.phase === 'lobby';
  const choose = (id: string) => {
    setTeamId(id);
    setTeamName(view.teams.find((t) => t.id === id)?.name || '');
  };
  const submit = async () => {
    setErr(null);
    unlockAudio();
    setBusy(true);
    try {
      const res = await postAction({ role: 'player' }, 'join', { name, pin, teamId });
      localStorage.setItem('leagame.name', name);
      // Teamname angepasst? Direkt nach dem Beitreten speichern
      if (canRename && teamName.trim() && teamName.trim() !== chosen?.name) {
        await postAction({ role: 'player', playerId: res.result.playerId }, 'renameTeam', { teamId, name: teamName.trim() }).catch(() => {});
      }
      sfx.join();
      onJoined(res.result.playerId);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <h1 className="title" style={{ textAlign: 'center', fontSize: 40, marginTop: 20 }}>
        {view.title}
      </h1>
      <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {!pinParam && (
          <>
            <label className="card-title">Game-PIN (steht auf dem TV)</label>
            <input className="input" inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} placeholder="1234" />
          </>
        )}
        <label className="card-title">Dein Name</label>
        <input className="input" value={name} maxLength={20} onChange={(e) => setName(e.target.value)} placeholder="z.B. Anna" autoComplete="nickname" />
        <label className="card-title">Dein Team</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {view.teams.map((t) => (
            <button key={t.id} className={`team-btn ${teamId === t.id ? 'sel' : ''}`} style={{ '--tc': t.farbe } as any} onClick={() => choose(t.id)}>
              {teamId === t.id ? '✓ ' : ''}
              {t.name}
            </button>
          ))}
        </div>
        {chosen && canRename && (
          <>
            <label className="card-title">Teamname (optional anpassen)</label>
            <input className="input" value={teamName} maxLength={24} onChange={(e) => setTeamName(e.target.value)} placeholder={chosen.name} />
          </>
        )}
        {err && <div className="error">{err}</div>}
        <button className="btn big" disabled={busy || !name.trim() || !teamId || pin.length !== 4} onClick={submit}>
          Los geht's! 🎉
        </button>
      </div>
    </>
  );
}

function TeamNameEdit({ current, onSave }: { current: string; onSave: (name: string) => any }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(current);
  if (!editing)
    return (
      <button className="btn ghost" onClick={() => { setVal(current); setEditing(true); }}>
        ✏️ Teamnamen ändern
      </button>
    );
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <input className="input" autoFocus value={val} maxLength={24} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && val.trim() && (onSave(val.trim()), setEditing(false))} />
      <button className="btn" disabled={!val.trim()} onClick={() => { onSave(val.trim()); setEditing(false); }}>
        OK
      </button>
    </div>
  );
}

function LobbyWait({ view, wakeLockSupported, run }: { view: View; wakeLockSupported: boolean; run: (t: string, p?: any) => any }) {
  const me = view.me!;
  const team = teamOf(view, me.teamId);
  return (
    <div className="panel" style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 60 }}>🎉</div>
      <h1>Du bist dabei!</h1>
      <div style={{ fontSize: 24 }}>
        Du spielst für <b style={{ color: team?.farbe, textShadow: '0 1px 0 #0003' }}>{team?.name}</b>
      </div>
      <div className="chips" style={{ justifyContent: 'center' }}>
        {view.players
          .filter((p) => p.teamId === me.teamId)
          .map((p) => (
            <span key={p.id} className="pill" style={{ fontSize: 18 }}>
              {p.name}
            </span>
          ))}
      </div>
      <TeamNameEdit current={team?.name || ''} onSave={(name) => run('renameTeam', { teamId: me.teamId, name })} />
      <p className="muted">Warte, bis die Spielleitung das Spiel startet.</p>
      <a className="btn ghost" href="/vorschlag" target="_blank" rel="noreferrer">
        💡 Begriffe, Songs oder Bilder vorschlagen
      </a>
      {!wakeLockSupported && <div className="hint">Tipp: Stell die automatische Bildschirmsperre für heute Abend aus, dann bleibst du immer verbunden.</div>}
    </div>
  );
}

// ---------------------------------------------------------------- Board
function BoardTurn({ view, run }: { view: View; run: (t: string, p?: any) => any }) {
  const me = view.me!;
  const myTurn = view.current.playerId === me.id;
  const cur = playerOf(view, view.current.playerId);
  const team = teamOf(view, view.current.teamId);
  useEffect(() => {
    if (myTurn) navigator.vibrate?.(200);
  }, [myTurn]);
  return (
    <>
      <div className={`panel ${myTurn ? '' : 'dark'}`} style={{ textAlign: 'center' }}>
        {myTurn ? (
          <>
            <h1>Du bist dran! 🎯</h1>
            <div>Wähle eine Kategorie. Daraus wird zufällig ein Vorschlag gezogen.</div>
          </>
        ) : (
          <>
            <div className="card-title">Am Zug</div>
            <h1>
              {cur?.name} <span style={{ color: team?.farbe }}>({team?.name})</span>
            </h1>
          </>
        )}
      </div>
      <CategoryPicker view={view} disabled={!myTurn} onPick={(colId) => myTurn && run('pick', { colId })} />
    </>
  );
}

// ---------------------------------------------------------------- Runde
function PlayerRound({ view, round, run }: { view: View; round: Round; run: (t: string, p?: any) => any }) {
  const me = view.me!;
  const side = view.mySide;
  const secret = view.secret || {};
  const mode = modeOf(view, round.mode);
  const active = playerOf(view, round.activeId);
  const activeTeam = teamOf(view, round.activeTeamId);
  const live = ['running', 'violation', 'quizConfirm', 'steal'].includes(round.stage);

  const header = (
    <div className="panel" style={{ background: mode.color, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
      <span className="icon-box" style={{ width: 52, height: 52, fontSize: 32 }}>
        {mode.icon}
      </span>
      <b style={{ fontSize: 24, flex: 1 }}>{round.title || mode.label}</b>
      <b style={{ fontSize: 24 }}>
        {round.mode === 'guess' ? `bis ${round.value * 2}` : round.value} P.
      </b>
    </div>
  );

  if (round.stage === 'reveal') {
    const r = round.result!;
    const w = teamOf(view, r.teamId);
    const info = round.reveal!;
    return (
      <>
        {header}
        <div className="panel" style={{ textAlign: 'center' }}>
          <div className="card-title">Lösung</div>
          <div className="term">{round.mode === 'quiz' ? info.optionen?.[info.richtig ?? 0] : info.begriff}</div>
          <h1 style={{ marginTop: 14 }}>{r.points ? `${HOW_TEXT[r.how]} +${r.points} für ${w?.name}` : `${HOW_TEXT[r.how]} – keine Punkte`}</h1>
        </div>
      </>
    );
  }

  // Geburtstagskind bestätigt die Quiz-Antwort
  if (round.mode === 'quiz' && round.stage === 'quizConfirm' && me.bday) {
    const q = round.quiz!;
    return (
      <>
        {header}
        <div className="panel">
          <div className="card-title">Gewählt</div>
          <div className="term">{q.optionen[q.choice ?? 0]}</div>
          <div className="card-title" style={{ marginTop: 12 }}>
            Richtig wäre
          </div>
          <div className="term" style={{ color: '#3DDC84' }}>
            {q.optionen[secret.richtig ?? 0]}
          </div>
        </div>
        <button className="btn huge green" onClick={() => run('quizConfirm')}>
          Stimmt! ✅
        </button>
        <p className="muted" style={{ textAlign: 'center' }}>
          Bestätige die Auflösung – dann wird sie auf dem TV gezeigt.
        </p>
      </>
    );
  }

  if (round.stage === 'violation') {
    return (
      <>
        {header}
        <div className="panel" style={{ background: '#FF4D5E', textAlign: 'center' }}>
          <div style={{ fontSize: 60 }}>🚨</div>
          <h1>Regelverstoss gemeldet</h1>
          <p>von {round.violation?.byName}. Die Spielleitung entscheidet …</p>
        </div>
        {side === 'active' && <SecretCard secret={secret} mode={round.mode} />}
      </>
    );
  }

  if (round.stage === 'steal' && round.steal) {
    const st = teamOf(view, round.steal.teamId);
    const mine = round.steal.teamId === me.teamId;
    return (
      <>
        {header}
        <div className="panel" style={{ background: st?.farbe, textAlign: 'center' }}>
          <div style={{ fontSize: 60 }}>🦝</div>
          <h1>{mine ? 'Ihr dürft klauen!' : `${st?.name} darf klauen!`}</h1>
          <p style={{ fontSize: 20 }}>{mine ? 'Sagt laut EINE Antwort. Die Spielleitung entscheidet.' : 'Psst – nichts verraten!'}</p>
          <TimerText timer={round.steal.timer} />
        </div>
      </>
    );
  }

  // ---------- Aktive Person
  if (side === 'active') {
    if (round.stage === 'ready') {
      return (
        <>
          {header}
          {round.substitutedFor && (
            <div className="hint">🎂 {playerOf(view, round.substitutedFor)?.name} darf in diesem Modus nicht mithelfen – du übernimmst!</div>
          )}
          <SecretCard secret={secret} mode={round.mode} />
          <div className="panel dark" style={{ fontSize: 20 }}>
            {mode.rule}
            {round.mode === 'guess' && ' Dein Team rät laut, du drückst „Erraten!“.'}
            {round.mode === 'quiz' && ' Die Frage erscheint nach dem Start auf dem TV.'}
          </div>
          <button className="btn huge" onClick={() => run('start')}>
            Start ▶️
          </button>
        </>
      );
    }
    if (round.mode === 'quiz') {
      const q = round.quiz!;
      return (
        <>
          {header}
          <TimerText timer={round.timer} />
          <div className="panel">
            <div className="term" style={{ fontSize: 28 }}>
              {q.frage}
            </div>
          </div>
          {q.choice === null ? (
            q.optionen.map((o, i) => (
              <button key={i} className="btn big" onClick={() => run('quizAnswer', { choice: i })} style={{ justifyContent: 'flex-start' }}>
                {'ABCD'[i]}: {o}
              </button>
            ))
          ) : (
            <div className="panel blue" style={{ textAlign: 'center' }}>
              <h1>Antwort eingeloggt: {'ABCD'[q.choice]}</h1>
              <p>{view.bdayName} bestätigt gleich die Auflösung …</p>
            </div>
          )}
        </>
      );
    }
    return (
      <>
        {header}
        <TimerText timer={round.timer} />
        {round.mode === 'guess' ? (
          <div className="panel dark" style={{ textAlign: 'center' }}>
            <h1>Dein Team rät laut! 📣</h1>
            <p>Schau auf den TV. Drück „Erraten!“, sobald jemand die richtige Lösung sagt.</p>
          </div>
        ) : (
          <SecretCard secret={secret} mode={round.mode} compact={round.mode === 'malen' || round.mode === 'emoji'} />
        )}
        {round.mode === 'malen' && <DrawPad round={round} playerId={me.id} />}
        {round.mode === 'emoji' && <EmojiKeyboard round={round} run={run} />}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
          <button className="btn big green" onClick={() => run('guessed')}>
            Erraten! 🎉
          </button>
          <button
            className="btn big ghost"
            onClick={() => {
              if (confirm('Wirklich aufgeben?')) run('giveUp');
            }}
          >
            Aufgeben
          </button>
        </div>
      </>
    );
  }

  // ---------- Quiz: alle anderen
  if (round.mode === 'quiz') {
    return (
      <>
        {header}
        {live && <TimerText timer={round.timer} />}
        {secret.bench ? (
          <div className="panel" style={{ textAlign: 'center' }}>
            <h1>Du darfst nicht mithelfen 😉</h1>
            {secret.richtig !== undefined && round.quiz && (
              <p style={{ fontSize: 22 }}>
                Richtig ist: <b>{round.quiz.optionen[secret.richtig]}</b>
              </p>
            )}
            {!round.quiz && <p>Die Frage kommt gleich auf dem TV.</p>}
          </div>
        ) : (
          <div className="panel dark" style={{ textAlign: 'center' }}>
            <h1>{me.teamId === round.activeTeamId ? 'Berät euch! 🤔' : `${activeTeam?.name} ist dran`}</h1>
            <p>
              {active?.name} wählt die Antwort{round.stage === 'ready' ? ', sobald es losgeht' : ''}.
            </p>
            {me.bday && secret.richtig !== undefined && round.quiz && <p>(Richtig: {round.quiz.optionen[secret.richtig]})</p>}
          </div>
        )}
      </>
    );
  }

  // ---------- Eigenes Team
  if (side === 'team') {
    return (
      <>
        {header}
        {live && <TimerText timer={round.timer} />}
        <div className="panel blue" style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 80 }}>📣</div>
          <h1 style={{ fontSize: 48 }}>{round.stage === 'ready' ? `${active?.name} macht sich bereit …` : 'Rate laut!'}</h1>
          {round.mode !== 'guess' && <p>{active?.name} {round.mode === 'tabu' ? 'erklärt' : round.mode === 'malen' ? 'malt' : round.mode === 'emoji' ? 'tippt Emojis' : round.mode === 'summen' ? 'summt einen Song' : 'spielt vor'}.</p>}
        </div>
      </>
    );
  }

  // ---------- Team, das klauen dürfte (sieht keine Lösung)
  if (side === 'steal') {
    return (
      <>
        {header}
        {live && <TimerText timer={round.timer} />}
        <div className="panel dark" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 60 }}>👀</div>
          <h1>Gut aufpassen!</h1>
          <p>Wenn {activeTeam?.name} es nicht errät, dürft ihr klauen. Darum seht ihr die Lösung nicht.</p>
        </div>
        {round.stage === 'running' && round.mode !== 'guess' && (
          <button className="btn big red" onClick={() => run('violation')}>
            {round.mode === 'tabu' ? 'TABU!' : 'Regelverstoss!'} 🚨
          </button>
        )}
      </>
    );
  }

  // ---------- Gegner:innen
  return (
    <>
      {header}
      {live && <TimerText timer={round.timer} />}
      <div className="card-title" style={{ textAlign: 'center' }}>
        {activeTeam?.name} ist dran – du kontrollierst!
      </div>
      <SecretCard secret={secret} mode={round.mode} />
      {round.stage === 'running' && (
        <button className={`btn ${round.mode === 'tabu' ? 'huge' : 'big'} red`} onClick={() => { sfx.buzzer(); run('violation'); }}>
          {round.mode === 'tabu' ? 'TABU! 🚨' : 'Regelverstoss! 🚨'}
        </button>
      )}
      {round.stage === 'ready' && <p className="muted" style={{ textAlign: 'center' }}>{active?.name} macht sich bereit …</p>}
    </>
  );
}

function SecretCard({ secret, mode, compact }: { secret: View['secret']; mode: string; compact?: boolean }) {
  if (!secret) return null;
  const text = secret.begriff || secret.loesung;
  if (!text) return null;
  return (
    <div className="panel" style={{ textAlign: 'center', padding: compact ? 12 : 20 }}>
      <div className="card-title">{mode === 'guess' ? `Lösung (${secret.kategorie})` : 'Begriff'}</div>
      <div className="term" style={compact ? { fontSize: 30 } : undefined}>
        {text}
      </div>
      {secret.verboten && secret.verboten.length > 0 && (
        <div className="forbidden">
          <div className="card-title" style={{ marginTop: 6 }}>
            Verboten
          </div>
          {secret.verboten.map((w) => (
            <span key={w}>{w}</span>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Emoji-Tastatur
function EmojiKeyboard({ round, run }: { round: Round; run: (t: string, p?: any) => any }) {
  const [cat, setCat] = useState(0);
  return (
    <div className="emoji-kb">
      <div className="emoji-preview">{round.emojis.join('') || <span className="muted" style={{ fontSize: 18 }}>Tippe Emojis – sie erscheinen sofort auf dem TV</span>}</div>
      <div className="emoji-tabs">
        {EMOJI_CATEGORIES.map((c, i) => (
          <button key={c.name} className={i === cat ? 'sel' : ''} onClick={() => setCat(i)} title={c.name}>
            {c.icon}
          </button>
        ))}
      </div>
      <div className="emoji-grid">
        {EMOJI_CATEGORIES[cat].emojis.map((e) => (
          <button key={e} onClick={() => run('emoji', { op: 'add', emoji: e })}>
            {e}
          </button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <button className="btn ghost" onClick={() => run('emoji', { op: 'undo' })}>
          ↩️ Rückgängig
        </button>
        <button className="btn ghost" onClick={() => run('emoji', { op: 'clear' })}>
          🗑️ Alles löschen
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Zeichenfläche
function DrawPad({ round, playerId }: { round: Round; playerId: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [color, setColor] = useState(DRAW_COLORS[0]);
  const [size, setSize] = useState(0);
  const [eraser, setEraser] = useState(false);
  const renderer = useRef<ReturnType<typeof makeRenderer> | null>(null);
  const queue = useRef<DrawOp[]>([]);
  const current = useRef<string | null>(null);
  const tool = useRef({ c: color, w: DRAW_SIZES[0] });
  tool.current = eraser ? { c: ERASER, w: 0.06 } : { c: color, w: DRAW_SIZES[size] };
  const ident = useMemo(() => ({ role: 'player' as const, playerId }), [playerId]);

  useEffect(() => {
    const cv = ref.current!;
    cv.width = 1200;
    cv.height = 900;
    renderer.current = makeRenderer(cv);
    // Bei Reload: bisherige Zeichnung wiederherstellen
    fetch(`/api/game?ops=${round.id}&from=0`)
      .then((r) => r.json())
      .then((d) => d.ops && renderer.current!.apply(d.ops))
      .catch(() => {});
    const flush = async () => {
      if (!queue.current.length) return;
      const ops = queue.current;
      queue.current = [];
      try {
        await postAction(ident, 'draw', { roundId: round.id, ops });
      } catch {
        queue.current = ops.concat(queue.current);
      }
    };
    const t = setInterval(flush, 200);
    return () => {
      clearInterval(t);
      flush();
    };
  }, [round.id, ident]);

  const pos = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return [Math.round(((e.clientX - r.left) / r.width) * 1000) / 1000, Math.round(((e.clientY - r.top) / r.height) * 1000) / 1000];
  };
  const push = (op: DrawOp) => {
    renderer.current!.apply([op]);
    const q = queue.current;
    const last = q[q.length - 1];
    // Punkte in der Warteschlange zusammenfassen, damit weniger Daten fliessen (lokal ist schon gezeichnet)
    if (op.t === 'p' && last && (last.t === 'p' || last.t === 's') && last.id === op.id) {
      last.p.push(...op.p);
    } else q.push(op);
  };
  const down = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const id = Math.random().toString(36).slice(2, 9);
    current.current = id;
    push({ t: 's', id, c: tool.current.c, w: tool.current.w, p: pos(e) });
  };
  const move = (e: React.PointerEvent) => {
    if (!current.current) return;
    e.preventDefault();
    push({ t: 'p', id: current.current, p: pos(e) });
  };
  const up = () => {
    current.current = null;
  };

  return (
    <>
      <div className="hint">✏️ Keine Buchstaben und keine Zahlen zeichnen!</div>
      <div className="draw-pad">
        <canvas ref={ref} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={up} />
      </div>
      <div className="draw-tools">
        {DRAW_COLORS.map((c) => (
          <button key={c} className={`sw ${!eraser && color === c ? 'sel' : ''}`} style={{ background: c }} onClick={() => { setColor(c); setEraser(false); }} aria-label="Farbe" />
        ))}
        <button className={`btn small ${!eraser && size === 0 ? '' : 'ghost'}`} onClick={() => { setSize(0); setEraser(false); }}>
          ● dünn
        </button>
        <button className={`btn small ${!eraser && size === 1 ? '' : 'ghost'}`} onClick={() => { setSize(1); setEraser(false); }}>
          ⬤ dick
        </button>
        <button className={`btn small ${eraser ? '' : 'ghost'}`} onClick={() => setEraser(true)}>
          🧽 Radierer
        </button>
        <button className="btn small red" onClick={() => push({ t: 'clear' })}>
          🗑️ Alles löschen
        </button>
      </div>
    </>
  );
}

function FinalPhone({ view }: { view: View }) {
  const sorted = [...view.teams].sort((a, b) => b.score - a.score);
  return (
    <div className="panel" style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 70 }}>🏆</div>
      <h1>Spiel vorbei!</h1>
      {sorted.map((t, i) => (
        <div key={t.id} style={{ fontSize: 26, margin: 6 }}>
          {['🥇', '🥈', '🥉', '🎈'][i]} <b style={{ color: t.farbe }}>{t.name}</b>: {t.score}
        </div>
      ))}
      <p style={{ marginTop: 16 }}>Schau auf den TV! 🎂</p>
    </div>
  );
}
