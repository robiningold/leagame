import { useEffect, useState } from 'react';
import { postAction, useGame } from '../api';
import { BackButton, Background, DrawView, CategoryPicker, TimerText, modeOf, playerOf, teamOf } from '../components';
import { HOW_TEXT } from '../modes';
import type { Round, View } from '../types';
import Editor from './AdminEditor';

const PIN_KEY = 'leagame.adminPin';

export default function Admin() {
  const [pin, setPin] = useState<string | null>(() => sessionStorage.getItem(PIN_KEY));
  if (!pin) return <Login onOk={(p) => { sessionStorage.setItem(PIN_KEY, p); setPin(p); }} />;
  return <AdminPanel pin={pin} onLogout={() => { sessionStorage.removeItem(PIN_KEY); setPin(null); }} />;
}

function Login({ onOk }: { onOk: (pin: string) => void }) {
  const [pin, setPin] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<{ source: 'env' | 'config'; vercel: boolean; storage: string } | null>(null);
  useEffect(() => {
    fetch('/api/game?pininfo=1', { cache: 'no-store' })
      .then((r) => r.json())
      .then(setInfo)
      .catch(() => setErr('Server nicht erreichbar.'));
  }, []);
  const go = async () => {
    try {
      await postAction({ role: 'admin', pin: pin.trim() }, 'adminLogin');
      onOk(pin.trim());
    } catch (e: any) {
      setErr(e.message);
    }
  };
  return (
    <div className="app">
      <Background count={6} />
      <div className="phone" style={{ justifyContent: 'center' }}>
        <BackButton />
        <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h1>🔐 Spielleitung</h1>
          <input className="input" type="password" inputMode="numeric" placeholder="Admin-PIN" value={pin} onChange={(e) => setPin(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} />
          {err && <div className="error">{err}</div>}
          <button className="btn big" onClick={go}>
            Anmelden
          </button>
          {info && (
            <div className="hint" style={{ fontSize: 15 }}>
              {info.source === 'env'
                ? '🔑 Es gilt die PIN aus der Vercel-Variable (ADMIN_PIN bzw. ADMIN_KEY).'
                : info.vercel
                  ? '⚠️ ADMIN_PIN / ADMIN_KEY ist auf Vercel (noch) nicht aktiv – es gilt die PIN aus config.json (Standard 1234). Variable in Vercel setzen und danach unter Deployments „Redeploy“ ausführen.'
                  : '🔑 Es gilt die PIN aus config.json (Feld adminPin).'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AdminPanel({ pin, onLogout }: { pin: string; onLogout: () => void }) {
  const { view, act, error, offline } = useGame({ role: 'admin', pin }, 700);
  const [msg, setMsg] = useState<string | null>(null);
  const [resumeOk, setResumeOk] = useState<string | null>(() => sessionStorage.getItem('leagame.adminResumeOk'));
  const [tab, setTabState] = useState<'edit' | 'live'>(() => (localStorage.getItem('leagame.adminTab') === 'live' ? 'live' : 'edit'));
  const setTab = (t: 'edit' | 'live') => {
    localStorage.setItem('leagame.adminTab', t);
    setTabState(t);
  };

  const run = async (type: string, payload: any = {}) => {
    try {
      await act(type, payload);
      setMsg(null);
    } catch (e: any) {
      setMsg(e.message);
    }
  };

  useEffect(() => {
    if (view && view.gameId !== resumeOk && !(view.started || view.players.some((p) => !p.fake))) {
      sessionStorage.setItem('leagame.adminResumeOk', view.gameId);
      setResumeOk(view.gameId);
    }
  }, [view?.gameId]);

  useEffect(() => {
    if (error === 'Falsche Admin-PIN.') onLogout();
  }, [error]);
  if (!view)
    return (
      <div className="admin">
        <BackButton />
        {error && error !== 'Falsche Admin-PIN.' ? (
          <>
            <div className="error">Fehler vom Server: {error}</div>
            <button className="btn small ghost" onClick={onLogout}>
              Zurück zur Anmeldung
            </button>
          </>
        ) : (
          'Lade …'
        )}
      </div>
    );

  const r = view.round;
  const needsDecision = !!r && ['violation', 'steal', 'quizConfirm'].includes(r.stage);
  const needResume = view.gameId !== resumeOk && (view.started || view.players.some((p) => !p.fake)) && view.phase !== 'final';

  return (
    <div className="app">
      <Background count={6} />
      {offline && <div className="offline-banner">Keine Verbindung zum Server …</div>}
      <div className="admin">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div className="row">
            <BackButton />
            <h1 className="title" style={{ margin: 0 }}>
              🎛️ {view.title}
            </h1>
          </div>
          <div className="row">
            <span className="pill">PIN {view.gamePin}</span>
            <span className="pill">{phaseText(view)}</span>
            <a href="/tv" target="_blank">
              TV öffnen
            </a>
            <button className="btn small ghost" onClick={onLogout}>
              Abmelden
            </button>
          </div>
        </div>
        {view.storage === 'local' && location.hostname.endsWith('vercel.app') && (
          <div className="error">⚠️ Keine Datenbank verbunden! Upstash Redis in Vercel verbinden (siehe README), sonst gehen Spielstände verloren.</div>
        )}
        {msg && <div className="error">{msg}</div>}

        <div className="tabs">
          <button className={tab === 'edit' ? 'sel' : ''} onClick={() => setTab('edit')}>
            ✏️ Spiel bearbeiten
          </button>
          <button className={tab === 'live' ? 'sel' : ''} onClick={() => setTab('live')}>
            🎮 Live-Steuerung {needsDecision && <span className="badge">!</span>}
          </button>
        </div>
        {tab === 'edit' && needsDecision && (
          <button className="btn red" onClick={() => setTab('live')}>
            ⚠️ Im Spiel wartet eine Entscheidung auf dich – zur Live-Steuerung
          </button>
        )}

        {tab === 'edit' && <Editor pin={pin} view={view} />}
        {tab === 'live' && (
        <>
        {needResume && (
          <div className="panel blue">
            <h2>Gespeichertes Spiel fortsetzen?</h2>
            <p>
              {view.players.length} Spieler:innen, {view.playedCount} Runden gespielt.
            </p>
            <div className="row">
              <button className="btn" onClick={() => { sessionStorage.setItem('leagame.adminResumeOk', view.gameId); setResumeOk(view.gameId); }}>
                ▶️ Fortsetzen
              </button>
              <button
                className="btn ghost"
                onClick={async () => {
                  if (!confirm('Wirklich ein neues Spiel starten? Alle Punkte und Spieler:innen werden gelöscht.')) return;
                  const res = await postAction({ role: 'admin', pin }, 'newGame');
                  sessionStorage.setItem('leagame.adminResumeOk', res.view.gameId);
                  setResumeOk(res.view.gameId);
                }}
              >
                🆕 Neues Spiel
              </button>
            </div>
          </div>
        )}

        {r && <RoundControl view={view} round={r} run={run} />}

        <div className="grid2">
          <div className="panel">
            <h2>Teams &amp; Punkte</h2>
            {view.teams.map((t) => (
              <div key={t.id} className="row" style={{ marginBottom: 8 }}>
                <span style={{ flex: 1, fontSize: 22 }}>
                  <span className="dot" style={{ background: t.farbe }} />
                  {t.name}: <b>{t.score}</b>
                </span>
                <button
                  className="btn small ghost"
                  title="Teamnamen ändern"
                  onClick={() => {
                    const name = window.prompt('Neuer Teamname:', t.name);
                    if (name && name.trim()) run('renameTeam', { teamId: t.id, name });
                  }}
                >
                  ✏️
                </button>
                {[-100, -50, 50, 100].map((d) => (
                  <button key={d} className="btn small ghost" onClick={() => run('adjustScore', { teamId: t.id, delta: d })}>
                    {d > 0 ? '+' : ''}
                    {d}
                  </button>
                ))}
              </div>
            ))}
          </div>

          <div className="panel">
            <h2>Spielablauf</h2>
            <div className="row" style={{ marginBottom: 10 }}>
              {view.phase === 'lobby' && (
                <button className="btn" onClick={() => run('startGame')}>
                  ▶️ Spiel starten
                </button>
              )}
              {view.phase === 'board' && !r && (
                <button className="btn small" onClick={() => run('skipPlayer')}>
                  ⏭️ Nächste Person
                </button>
              )}
              {view.phase !== 'final' && (
                <button className="btn small red" onClick={() => confirm('Spiel jetzt beenden und Finale zeigen?') && run('endGame')}>
                  🏁 Spiel beenden
                </button>
              )}
              {view.phase === 'final' && view.totalRemaining > 0 && (
                <button className="btn small" onClick={() => run('backToBoard')}>
                  ↩️ Zurück zum Board
                </button>
              )}
              <button className="btn small ghost" onClick={() => confirm('Neues Spiel? Alles wird gelöscht.') && run('newGame')}>
                🆕 Neues Spiel
              </button>
              {view.phase === 'lobby' && (
                <button className="btn small ghost" onClick={() => run('createTestPlayers')}>
                  🧪 Testspieler:innen
                </button>
              )}
            </div>
            {view.phase === 'board' && (
              <p>
                Am Zug: <b>{playerOf(view, view.current.playerId)?.name}</b> ({teamOf(view, view.current.teamId)?.name})
              </p>
            )}
            <p className="muted" style={{ fontSize: 15 }}>
              Kategorie antippen = für die Person am Zug wählen. Zahl = Vorschläge, die das Team am Zug ziehen darf / insgesamt übrig. Gespielt: {view.playedCount} Runden, übrig: {view.totalRemaining} Vorschläge.
            </p>
            <CategoryPicker
              view={view}
              admin
              disabled={view.phase !== 'board' || !!r}
              onPick={(colId) => {
                if (confirm(`Kategorie „${colTitle(view, colId)}“ für ${playerOf(view, view.current.playerId)?.name} wählen?`)) run('pick', { colId });
              }}
            />
          </div>
        </div>

        <Players view={view} run={run} />
        </>
        )}
      </div>
    </div>
  );
}

const colTitle = (view: View, colId: string) => view.board.columns.find((c) => c.id === colId)?.title || '';

function phaseText(view: View) {
  if (view.phase === 'lobby') return 'Lobby';
  if (view.phase === 'final') return 'Finale';
  return view.round ? `Runde: ${view.round.stage}` : 'Spiel läuft';
}

function RoundControl({ view, round, run }: { view: View; round: Round; run: (t: string, p?: any) => any }) {
  const mode = modeOf(view, round.mode);
  const s = round.secret;
  const active = playerOf(view, round.activeId);
  const team = teamOf(view, round.activeTeamId);
  const stealTeam = teamOf(view, round.steal?.teamId);
  const timerRunning = round.stage === 'steal' ? !!round.steal?.timer.endsAt : !!round.timer?.endsAt;
  return (
    <div className="panel" style={{ background: mode.color }}>
      <h2>
        {mode.icon} {round.title || mode.label} – {active?.name} ({team?.name})
      </h2>
      <div className="grid2">
        <div className="panel dark">
          <div className="card-title">Lösung (geheim)</div>
          {round.mode === 'quiz' ? (
            <>
              <div style={{ fontSize: 20 }}>{s?.frage}</div>
              <ol type="A">
                {s?.optionen?.map((o, i) => (
                  <li key={i} style={{ fontWeight: i === s.richtig ? 700 : 400, color: i === s.richtig ? '#3DDC84' : undefined }}>
                    {o} {round.quiz?.choice === i ? '← gewählt' : ''}
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <div style={{ fontSize: 32, fontWeight: 700 }}>{s?.begriff}</div>
          )}
          {s?.verboten && <div>Verboten: {s.verboten.join(', ')}</div>}
          {round.mode === 'guess' && <div>Kategorie: {s?.kategorie}</div>}
          {round.substitutedFor && <div className="hint">Geburtstagskind war am Zug – {active?.name} übernimmt.</div>}
          {round.stealTeamId && round.stage !== 'reveal' && <div className="muted" style={{ fontSize: 14 }}>Klau-Team: {teamOf(view, round.stealTeamId)?.name} (sieht die Lösung nicht)</div>}
        </div>
        <div className="panel dark" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="card-title">Status: {stageText(round)}</div>
          {['running', 'violation', 'quizConfirm'].includes(round.stage) && <TimerText timer={round.timer} />}
          {round.stage === 'steal' && round.steal && (
            <>
              <div>🦝 {stealTeam?.name} darf klauen:</div>
              <TimerText timer={round.steal.timer} />
              <div className="row">
                <button className="btn green" onClick={() => run('stealDecision', { correct: true })}>
                  ✅ Richtig (halbe Punkte)
                </button>
                <button className="btn red" onClick={() => run('stealDecision', { correct: false })}>
                  ❌ Falsch
                </button>
              </div>
            </>
          )}
          {round.stage === 'violation' && (
            <>
              <div>🚨 Regelverstoss gemeldet von {round.violation?.byName}</div>
              <div className="row">
                <button className="btn red" onClick={() => run('violationConfirm')}>
                  Bestätigen (0 Punkte)
                </button>
                <button className="btn green" onClick={() => run('violationReject')}>
                  Ablehnen (weiterspielen)
                </button>
              </div>
            </>
          )}
          {round.stage === 'quizConfirm' && (
            <button className="btn" onClick={() => run('quizConfirm')}>
              Auflösung bestätigen (statt {view.bdayName})
            </button>
          )}
          {round.stage === 'reveal' && round.result && (
            <>
              <div style={{ fontSize: 22 }}>
                {HOW_TEXT[round.result.how]}: {round.result.points ? `+${round.result.points} für ${teamOf(view, round.result.teamId)?.name}` : 'keine Punkte'}
              </div>
              <button className="btn" onClick={() => run('next')}>
                ⏭️ Weiter zum Board
              </button>
            </>
          )}
          <div className="row">
            {round.stage === 'ready' && (
              <button className="btn small" onClick={() => run('start')}>
                ▶️ Start (für {active?.name})
              </button>
            )}
            {round.stage === 'running' && round.mode !== 'quiz' && (
              <button className="btn small green" onClick={() => run('guessed')}>
                🎉 Erraten
              </button>
            )}
            {round.stage === 'running' && round.mode === 'quiz' && [0, 1, 2, 3].map((i) => (
              <button key={i} className="btn small" onClick={() => run('quizAnswer', { choice: i })}>
                {'ABCD'[i]}
              </button>
            ))}
            {round.stage === 'running' && (
              <button className="btn small red" onClick={() => run('violation')}>
                🚨 Regelverstoss
              </button>
            )}
            {['running', 'ready'].includes(round.stage) && (
              <button className="btn small ghost" onClick={() => run('giveUp')}>
                Aufgeben
              </button>
            )}
            {['running', 'steal'].includes(round.stage) &&
              (timerRunning ? (
                <button className="btn small ghost" onClick={() => run('pauseTimer')}>
                  ⏸️ Timer pausieren
                </button>
              ) : (
                <button className="btn small" onClick={() => run('resumeTimer')}>
                  ▶️ Timer fortsetzen
                </button>
              ))}
            <button className="btn small ghost" onClick={() => confirm('Runde abbrechen? Das Feld bleibt frei.') && run('abortRound')}>
              ✖️ Runde abbrechen
            </button>
          </div>
        </div>
      </div>
      {round.mode === 'malen' && round.stage !== 'ready' && (
        <div style={{ maxWidth: 420, marginTop: 10 }}>
          <DrawView roundId={round.id} live={round.stage !== 'reveal'} />
        </div>
      )}
      {round.mode === 'emoji' && <div style={{ fontSize: 40, marginTop: 10 }}>{round.emojis.join(' ')}</div>}
    </div>
  );
}

function stageText(r: Round) {
  return (
    {
      ready: 'Wartet auf Start',
      running: 'Läuft',
      violation: 'Regelverstoss – bitte entscheiden',
      steal: 'Klauen',
      quizConfirm: 'Geburtstagskind bestätigt',
      reveal: 'Auflösung',
    } as Record<string, string>
  )[r.stage];
}

function Players({ view, run }: { view: View; run: (t: string, p?: any) => any }) {
  return (
    <div className="panel">
      <h2>Spieler:innen ({view.players.length})</h2>
      <table>
        <tbody>
          {view.players.map((p) => (
            <tr key={p.id}>
              <td>
                <span className="dot" style={{ background: p.online ? '#3DDC84' : '#888' }} title={p.online ? 'online' : 'offline'} />
                <b>{p.name}</b> {p.bday && '🎂'} {p.fake && <span className="muted">(Test)</span>}
                {view.current.playerId === p.id && ' 🎯'}
              </td>
              <td>
                <select value={p.teamId} onChange={(e) => run('movePlayer', { playerId: p.id, teamId: e.target.value })}>
                  {view.teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input type="checkbox" checked={p.bday} onChange={(e) => run('setBirthday', { playerId: p.id, value: e.target.checked })} style={{ width: 22, height: 22 }} />
                  Geburtstagskind
                </label>
              </td>
              <td>
                <a href={`/join?multi=1&as=${p.id}`} target="_blank" rel="noreferrer" title="Handy-Ansicht dieser Person in neuem Tab öffnen (zum Testen)">
                  📱 als Person öffnen
                </a>
              </td>
              <td>
                <button className="btn small red" onClick={() => confirm(`${p.name} entfernen?`) && run('removePlayer', { playerId: p.id })}>
                  Entfernen
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
