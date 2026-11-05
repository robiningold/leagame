import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { guessStage, postAction, useGame, useNow, GUESS_FACTORS } from '../api';
import { AnimatedNumber, Background, Confetti, DrawView, GuessImage, TimerRing, modeOf, playerOf, teamOf } from '../components';
import { HOW_TEXT, modeInfo } from '../modes';
import { audioReady, sfx, unlockAudio } from '../sound';
import type { Round, View } from '../types';

function useStageScale() {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const f = () => setScale(Math.min(window.innerWidth / 1920, window.innerHeight / 1080));
    f();
    window.addEventListener('resize', f);
    return () => window.removeEventListener('resize', f);
  }, []);
  return scale;
}

export function joinUrl(view: View) {
  const local = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(location.hostname);
  const base = local && view.lanUrl ? view.lanUrl : location.origin;
  return `${base}/join?pin=${view.gamePin}`;
}

export default function Tv() {
  const params = new URLSearchParams(location.search);
  const test = params.get('test') === '1';
  const { view, act, offline } = useGame({ role: 'tv' }, 500);
  const scale = useStageScale();
  const [soundOn, setSoundOn] = useState(audioReady());
  const [resumeOk, setResumeOk] = useState<string | null>(() => sessionStorage.getItem('leagame.resumeOk'));
  const testDone = useRef(false);

  useEffect(() => {
    if (test && view && view.phase === 'lobby' && !view.players.some((p) => p.fake) && !testDone.current) {
      testDone.current = true;
      act('createTestPlayers').catch(() => {});
    }
  }, [test, view, act]);

  // "Fortsetzen?" nur fragen, wenn beim Öffnen schon ein Spiel mit Fortschritt existiert
  useEffect(() => {
    if (view && view.gameId !== resumeOk && !(view.started || view.players.some((p) => !p.fake))) {
      sessionStorage.setItem('leagame.resumeOk', view.gameId);
      setResumeOk(view.gameId);
    }
  }, [view?.gameId]);

  if (!view) return <div className="tv-viewport"><Background /></div>;

  const needResume = view.gameId !== resumeOk && (view.started || view.players.some((p) => !p.fake)) && view.phase !== 'final';

  const confirmResume = () => {
    sessionStorage.setItem('leagame.resumeOk', view.gameId);
    setResumeOk(view.gameId);
  };
  const newGame = async () => {
    const pin = window.prompt('Neues Spiel starten: Admin-PIN eingeben');
    if (!pin) return;
    try {
      const res = await postAction({ role: 'admin', pin }, 'newGame');
      sessionStorage.setItem('leagame.resumeOk', res.view.gameId);
      setResumeOk(res.view.gameId);
    } catch (e: any) {
      alert(e.message);
    }
  };

  return (
    <div className="tv-viewport" onClick={() => { unlockAudio(); setSoundOn(true); }}>
      <Background count={14} />
      <div className="tv-stage" style={{ transform: `translate(-50%, -50%) scale(${scale})` }}>
        {view.phase === 'lobby' && <Lobby view={view} />}
        {view.phase === 'board' && <BoardScreen view={view} />}
        {view.phase === 'final' && <Final view={view} />}
        <TvSounds view={view} />
        {needResume && (
          <div className="overlay-msg" onClick={(e) => e.stopPropagation()}>
            <div className="panel" style={{ padding: 60, textAlign: 'center', width: 1100 }}>
              <div className="big-text" style={{ fontSize: 72 }}>Gespeichertes Spiel fortsetzen?</div>
              <p className="mid-text muted" style={{ fontSize: 36 }}>
                {view.players.length} Spieler:innen · {view.cells.filter((c) => c.played).length} von {view.cells.length} Feldern gespielt
              </p>
              <div style={{ display: 'flex', gap: 30, justifyContent: 'center' }}>
                <button className="btn big" style={{ width: 420 }} onClick={() => { unlockAudio(); setSoundOn(true); confirmResume(); }}>
                  ▶️ Fortsetzen
                </button>
                <button className="btn big ghost" style={{ width: 420 }} onClick={newGame}>
                  🆕 Neues Spiel
                </button>
              </div>
            </div>
          </div>
        )}
        {!soundOn && !needResume && (
          <div style={{ position: 'absolute', right: 30, top: 20, zIndex: 40, fontSize: 24 }} className="pill">
            🔇 Klicke irgendwo, um den Ton einzuschalten
          </div>
        )}
        {offline && (
          <div style={{ position: 'absolute', left: 30, bottom: 24, zIndex: 40, background: '#FF4D5E' }} className="pill">
            ⚠️ Keine Verbindung zum Server …
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Lobby
function Lobby({ view }: { view: View }) {
  const url = joinUrl(view);
  const [svg, setSvg] = useState('');
  useEffect(() => {
    QRCode.toString(url, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#2A1E5C', light: '#FFFFFF' } }).then(setSvg);
  }, [url]);
  const shown = url.replace(/^https?:\/\//, '').replace(/\?pin=\d+$/, '');
  return (
    <div className="tv-lobby">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 26, alignItems: 'center', justifyContent: 'center' }}>
        <div className="qr-box" dangerouslySetInnerHTML={{ __html: svg }} />
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 36 }} className="muted">Scannen oder öffnen:</div>
          <div style={{ fontSize: 40, fontWeight: 700, wordBreak: 'break-all' }}>{shown}</div>
        </div>
        <div className="panel" style={{ textAlign: 'center', padding: '16px 48px' }}>
          <div style={{ fontSize: 34 }}>Game-PIN</div>
          <div className="pin-big">{view.gamePin}</div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 28, minHeight: 0 }}>
        <div>
          <h1 className="title">{view.title}</h1>
          <div style={{ fontSize: 40 }} className="muted">
            🎂 Jetzt mit dem Handy beitreten! ({view.players.length} dabei)
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: view.teams.length > 2 ? '1fr 1fr' : '1fr 1fr', gap: 24, flex: 1, minHeight: 0 }}>
          {view.teams.map((t) => (
            <div className="team-col" key={t.id} style={{ '--tc': t.farbe } as any}>
              <h2>
                <span>{t.name}</span>
                <span>{view.players.filter((p) => p.teamId === t.id).length}</span>
              </h2>
              <div className="chips">
                {view.players
                  .filter((p) => p.teamId === t.id)
                  .map((p) => (
                    <span key={p.id} className={`pill ${p.online ? '' : 'offline'}`} style={{ borderColor: t.farbe }}>
                      {p.bday ? '🎂 ' : ''}
                      {p.name}
                    </span>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Board
function ScoreBar({ view }: { view: View }) {
  return (
    <div className="scorebar">
      {view.teams.map((t) => (
        <div key={t.id} className={`score-card ${view.current.teamId === t.id && !view.round ? 'turn' : ''}`} style={{ '--tc': t.farbe } as any}>
          <span className="name">{t.name}</span>
          <span className="pts">
            <AnimatedNumber value={t.score} />
          </span>
        </div>
      ))}
    </div>
  );
}

function BoardScreen({ view }: { view: View }) {
  const modes = modeInfo(view.bdayName);
  const cur = playerOf(view, view.current.playerId);
  const curTeam = teamOf(view, view.current.teamId);
  const cols = view.board.columns;
  const rows = view.board.values;
  // Feldhöhe so wählen, dass alle Zeilen ohne Scrollen auf 1080px passen
  const cellH = Math.min(128, Math.floor((1080 - 130 - 70 - 32 - 112 - 14 * rows.length) / rows.length));
  const cellFont = Math.min(72, Math.round(cellH * 0.82)); // min. ~64px auch bei 8 Zeilen
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScoreBar view={view} />
      <div className="board" style={{ gridTemplateColumns: `repeat(${cols.length}, 1fr)` }}>
        {cols.map((col) => (
          <div key={col.id} className="head" style={{ '--mc': modes[col.mode].color, fontSize: cols.length > 6 ? 24 : 30 } as any}>
            <span className="ic">{modes[col.mode].icon}</span>
            <span>{col.title}</span>
          </div>
        ))}
        {rows.map((v) =>
          cols.map((col) => {
            const c = view.cells.find((x) => x.col === col.id && x.value === v);
            if (!c) return <div key={col.id + v} />;
            const won = teamOf(view, c.wonBy);
            return (
              <div
                key={c.id}
                data-cell={c.id}
                className={`cell ${c.played ? 'played' : ''} ${view.round?.cellId === c.id ? 'picked' : ''}`}
                style={{ height: cellH, fontSize: c.played ? cellFont * 0.6 : cellFont, ...(c.played ? ({ '--wc': won?.farbe || '#7d7a96' } as any) : {}) }}
              >
                {c.played ? (c.points ? `+${c.points}` : '') : v}
                {c.played && c.double && <span className="x2">×2</span>}
              </div>
            );
          }),
        )}
      </div>
      <div className="turnbar">
        {cur ? (
          <>
            Am Zug: <b>{cur.name}</b> <span style={{ color: curTeam?.farbe }}>({curTeam?.name})</span>
          </>
        ) : (
          'Warte auf Spieler:innen …'
        )}
      </div>
      {view.round && <RoundOverlay view={view} round={view.round} />}
    </div>
  );
}

// ---------------------------------------------------------------- Runde
function RoundOverlay({ view, round }: { view: View; round: Round }) {
  const mode = modeOf(view, round.mode);
  const active = playerOf(view, round.activeId);
  const team = teamOf(view, round.activeTeamId);
  const cardRef = useRef<HTMLDivElement>(null);
  const [flash, setFlash] = useState(false);

  // Feld fliegt vom Board in die Mitte
  useLayoutEffect(() => {
    const card = cardRef.current;
    const cell = document.querySelector(`[data-cell="${round.cellId}"]`) as HTMLElement | null;
    if (!card || !cell) return;
    const a = cell.getBoundingClientRect();
    const b = card.getBoundingClientRect();
    const k = b.width / card.offsetWidth; // Bildschirm-Skalierung
    const dx = (a.left + a.width / 2 - (b.left + b.width / 2)) / k;
    const dy = (a.top + a.height / 2 - (b.top + b.height / 2)) / k;
    card.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) scale(${a.width / b.width})`, borderRadius: '24px', opacity: 0.6 },
        { transform: 'translate(0,0) scale(1)', borderRadius: '40px', opacity: 1 },
      ],
      { duration: 650, easing: 'cubic-bezier(.3,1.25,.5,1)' },
    );
    if (round.double) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 1500);
      return () => clearTimeout(t);
    }
  }, [round.id]);

  const success = round.stage === 'reveal' && !!round.result?.points;

  return (
    <div className="round-overlay">
      <div className="round-card" ref={cardRef} style={{ '--mc': mode.color } as any}>
        <div className="round-head">
          <span className="icon-box" style={{ width: 80, height: 80, fontSize: 52 }}>
            {mode.icon}
          </span>
          <span>{round.title || mode.label}</span>
          <span className="val">
            {round.value}
            {round.double && <span style={{ color: '#FFCB2D' }}> ×2</span>}
          </span>
        </div>
        <div className="round-body">
          <RoundContent view={view} round={round} />
          {['running', 'violation', 'quizConfirm'].includes(round.stage) && (
            <div className="round-side">
              <TimerRing timer={round.timer} sounds={round.stage === 'running'} paused={round.paused} />
              {round.mode === 'guess' && <GuessPoints round={round} />}
              <div style={{ fontSize: 34, textAlign: 'center' }}>
                <b style={{ color: team?.farbe }}>{team?.name}</b>
                <br />
                {round.mode === 'quiz' ? `${active?.name} wählt` : `${active?.name} ist dran`}
              </div>
            </div>
          )}
        </div>
        {round.stage === 'violation' && (
          <Banner color="#FF4D5E">
            🚨 Regelverstoss gemeldet von {round.violation?.byName}! Die Spielleitung entscheidet …
          </Banner>
        )}
        {round.stage === 'quizConfirm' && <Banner color="#B57BFF">🎂 {view.bdayName} prüft die Antwort …</Banner>}
        {round.stage === 'steal' && round.steal && (
          <Banner color={teamOf(view, round.steal.teamId)?.farbe || '#FFCB2D'}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 40, justifyContent: 'center' }}>
              <TimerRing timer={round.steal.timer} size={150} sounds paused={round.paused} />
              <span>
                🦝 {teamOf(view, round.steal.teamId)?.name} darf klauen! Eine Antwort – laut sagen!
              </span>
            </div>
          </Banner>
        )}
        <Confetti fire={success ? round.id : null} />
      </div>
      {flash && (
        <div className="double-flash">
          <div>DOPPELT!</div>
        </div>
      )}
    </div>
  );
}

function Banner({ children, color }: { children: any; color: string }) {
  return (
    <div style={{ background: color, padding: '18px 30px', fontSize: 46, fontWeight: 700, textAlign: 'center', textShadow: '0 3px 0 rgba(0,0,0,.25)', animation: 'popin .4s' }}>
      {children}
    </div>
  );
}

function GuessPoints({ round }: { round: Round }) {
  const now = useNow(4);
  const stage = guessStage(round.timer, now);
  const pts = Math.round(round.value * (round.double ? 2 : 1) * GUESS_FACTORS[stage - 1]);
  return (
    <div className="panel blue" style={{ textAlign: 'center', padding: '12px 24px' }}>
      <div style={{ fontSize: 30 }}>Stufe {stage}/4</div>
      <div style={{ fontSize: 72, fontWeight: 700 }}>{pts}</div>
      <div style={{ fontSize: 26 }}>Punkte</div>
    </div>
  );
}

function RoundContent({ view, round }: { view: View; round: Round }) {
  const active = playerOf(view, round.activeId);
  const team = teamOf(view, round.activeTeamId);
  const now = useNow(4);
  const sub = playerOf(view, round.substitutedFor);

  if (round.stage === 'ready') {
    return (
      <div className="round-main">
        <div className="big-text">
          {active?.name}, bist du bereit?
        </div>
        <div className="mid-text" style={{ color: team?.farbe }}>
          {team?.name}
        </div>
        {sub && (
          <div className="mid-text" style={{ fontSize: 40 }}>
            🎂 {sub.name} darf hier nicht mithelfen – {active?.name} übernimmt!
          </div>
        )}
        <div style={{ fontSize: 36 }} className="muted">
          {modeOf(view, round.mode).rule}
        </div>
      </div>
    );
  }

  if (round.stage === 'reveal') return <Reveal view={view} round={round} />;

  switch (round.mode) {
    case 'malen':
      return (
        <div className="round-main">
          <DrawView roundId={round.id} live />
        </div>
      );
    case 'emoji':
      return (
        <div className="round-main">
          {round.emojis.length === 0 && <div className="mid-text muted">{active?.name} tippt Emojis …</div>}
          <div className="emoji-row">
            {round.emojis.map((e, i) => (
              <span key={i}>{e}</span>
            ))}
          </div>
        </div>
      );
    case 'guess':
      return (
        <div className="round-main" style={{ gap: 12 }}>
          <div className="mid-text" style={{ fontSize: 64, fontWeight: 700 }}>
            Guess the {round.guess?.kategorie}
          </div>
          <GuessImage roundId={round.id} focus={round.guess!.focus} stage={round.stage === 'steal' ? 4 : guessStage(round.timer, now)} maxH={640} maxW={1240} />
        </div>
      );
    case 'quiz':
      return (
        <div className="round-main" style={{ alignItems: 'stretch' }}>
          <div className="mid-text" style={{ fontWeight: 700, fontSize: 60 }}>
            {round.quiz?.frage}
          </div>
          <div className="quiz-grid">
            {round.quiz?.optionen.map((o, i) => (
              <div key={i} className={`quiz-opt ${round.quiz?.choice === i ? 'chosen' : ''}`}>
                <span className="letter">{'ABCD'[i]}</span>
                {o}
              </div>
            ))}
          </div>
        </div>
      );
    default:
      return (
        <div className="round-main">
          <div className="big-text">{round.mode === 'tabu' ? `${active?.name} erklärt` : round.mode === 'summen' ? `${active?.name} summt` : `${active?.name} spielt vor`}</div>
          <div className="mid-text" style={{ color: team?.farbe }}>
            {team?.name}: Rate laut!
          </div>
          <div style={{ fontSize: 120 }}>{round.mode === 'tabu' ? '🗣️' : round.mode === 'summen' ? '🎵' : '🙊'}</div>
        </div>
      );
  }
}

function Reveal({ view, round }: { view: View; round: Round }) {
  const r = round.result!;
  const info = round.reveal!;
  const winner = teamOf(view, r.teamId);
  const ok = !!r.points;
  return (
    <div className="round-main" style={{ gap: 16 }}>
      {round.mode === 'guess' && <GuessImage roundId={round.id} focus={round.guess!.focus} stage={4} maxH={480} maxW={900} />}
      {round.mode === 'emoji' && (
        <div className="emoji-row" style={{ fontSize: 80 }}>
          {round.emojis.map((e, i) => (
            <span key={i}>{e}</span>
          ))}
        </div>
      )}
      {round.mode === 'quiz' ? (
        <>
          <div className="mid-text" style={{ fontWeight: 700 }}>
            {info.frage}
          </div>
          <div className="quiz-grid">
            {info.optionen?.map((o, i) => (
              <div key={i} className={`quiz-opt ${i === info.richtig ? 'correct' : 'wrong'} ${round.quiz?.choice === i ? 'chosen' : ''}`}>
                <span className="letter">{'ABCD'[i]}</span>
                {o}
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="big-text" style={{ fontSize: round.mode === 'guess' ? 80 : 120 }}>
          {info.begriff}
        </div>
      )}
      {round.mode === 'tabu' && info.verboten && <div style={{ fontSize: 34 }} className="muted">Verboten: {info.verboten.join(' · ')}</div>}
      {info.von && <div style={{ fontSize: 34 }} className="muted">💡 Vorschlag von {info.von}</div>}
      <div className="result-badge" style={{ background: ok ? winner?.farbe : 'rgba(42,30,92,.6)' }}>
        {ok ? `${HOW_TEXT[r.how]} +${r.points} für ${winner?.name}` : `${HOW_TEXT[r.how]}${r.stealFailed ? ' – auch Klauen ging daneben' : ''} – keine Punkte`}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Finale
function Final({ view }: { view: View }) {
  const sorted = useMemo(() => [...view.teams].sort((a, b) => b.score - a.score), [view.teams]);
  const order = sorted.length >= 3 ? [sorted[1], sorted[0], sorted[2], ...sorted.slice(3)] : [sorted[1], sorted[0]];
  const heights = [480, 380, 300, 220]; // nach Rang
  const medal = ['🥇', '🥈', '🥉', '🎈'];
  const [burst, setBurst] = useState(1);
  useEffect(() => {
    const t = setInterval(() => setBurst((b) => b + 1), 5200);
    return () => clearInterval(t);
  }, []);
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 60px', gap: 24 }}>
      <h1 className="title" style={{ fontSize: 96, margin: 0 }}>
        🏆 {sorted[0]?.score === sorted[1]?.score ? 'Unentschieden!' : `${sorted[0]?.name} gewinnt!`}
      </h1>
      <div style={{ display: 'flex', gap: 60, alignItems: 'flex-end', width: '100%', justifyContent: 'center', flex: 1, minHeight: 0 }}>
        <div className="podium">
          {order.map((t, i) => {
            const rank = sorted.filter((x) => x.score > t.score).length; // Gleichstand = gleicher Platz
            return (
              <div key={t.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ fontSize: 44, fontWeight: 700, marginBottom: 10 }}>{t.name}</div>
                <div className="step" style={{ '--tc': t.farbe, height: heights[rank] ?? 200, animationDelay: `${i * 0.15}s` } as any}>
                  <div className="place">{medal[rank]}</div>
                  <div style={{ fontSize: 72, fontWeight: 700 }}>
                    <AnimatedNumber value={t.score} duration={1500} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {view.hasFinalePhoto && <img src="/api/image?finale=1" alt="" style={{ maxHeight: 520, maxWidth: 620, borderRadius: 32, boxShadow: '0 20px 50px rgba(0,0,0,.4)', border: '10px solid #fff', transform: 'rotate(2deg)' }} />}
      </div>
      <div className="panel" style={{ fontSize: 44, textAlign: 'center', maxWidth: 1600, lineHeight: 1.25 }}>
        {view.finaltext}
      </div>
      <Confetti fire={burst} big />
    </div>
  );
}

// ---------------------------------------------------------------- Sounds bei Zustandswechseln
function TvSounds({ view }: { view: View }) {
  const prev = useRef<View | null>(null);
  const now = useNow(4);
  const lastStage = useRef(0);
  useEffect(() => {
    const p = prev.current;
    prev.current = view;
    if (!p) return;
    const r = view.round;
    const pr = p.round;
    if (view.players.length > p.players.length && view.phase === 'lobby') sfx.join();
    if (r && r.id !== pr?.id) {
      sfx.whoosh();
      if (r.double) setTimeout(() => sfx.double(), 350);
    }
    if (r && pr && r.id === pr.id && r.stage !== pr.stage) {
      if (r.stage === 'running' && pr.stage === 'ready') sfx.start();
      if (r.stage === 'violation') sfx.buzzer();
      if (r.stage === 'steal') sfx.steal();
      if (r.stage === 'reveal') (r.result?.points ? sfx.success : sfx.fail)();
    }
    if (r && pr && r.id === pr.id && r.emojis.length > pr.emojis.length) sfx.plop();
    if (view.phase === 'final' && p.phase !== 'final') sfx.victory();
  }, [view]);
  // Guess: Ton bei jeder neuen Aufdeck-Stufe
  const r = view.round;
  const stage = r && r.mode === 'guess' && r.stage === 'running' ? guessStage(r.timer, now) : 0;
  useEffect(() => {
    if (stage > 1 && stage !== lastStage.current) sfx.stage();
    lastStage.current = stage;
  }, [stage]);
  return null;
}
