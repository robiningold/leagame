// Reine Spiellogik: Zustand, Aktionen, Zeitabläufe und Sichten pro Rolle.
// Alle Funktionen arbeiten auf einem einfachen JSON-Objekt (wird in Redis bzw. Datei gespeichert).
import crypto from 'node:crypto';
import { MODES, VALUES } from './content.js';

export const GUESS_FACTORS = [1, 0.75, 0.5, 0.25];

const rid = (n = 10) => crypto.randomBytes(16).toString('base64url').replace(/[-_]/g, '').slice(0, n);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export class GameError extends Error {}
const fail = (msg) => {
  throw new GameError(msg);
};

// ---------------------------------------------------------------- Zustand

export function newGame(config) {
  const cells = [];
  for (const mode of MODES) for (const value of VALUES) cells.push({ id: `${mode}-${value}`, mode, value, double: false, played: false, wonBy: null, points: 0 });
  const doubles = [...cells].sort(() => Math.random() - 0.5).slice(0, config.anzahlDoppeltFelder);
  for (const c of doubles) c.double = true;
  return {
    _v: 0,
    gameId: rid(8),
    phase: 'lobby',
    gamePin: String(Math.floor(1000 + Math.random() * 9000)),
    createdAt: Date.now(),
    players: [],
    scores: Object.fromEntries(config.teams.map((t) => [t.id, 0])),
    cells,
    turn: { teamIdx: 0, ptr: Object.fromEntries(config.teams.map((t) => [t.id, 0])) },
    used: {},
    round: null,
    lastResult: null,
  };
}

const teamIds = (config) => config.teams.map((t) => t.id);
const teamPlayers = (state, teamId) => state.players.filter((p) => p.teamId === teamId).sort((a, b) => a.joinedAt - b.joinedAt);
const activeTeams = (state, config) => teamIds(config).filter((id) => teamPlayers(state, id).length > 0);

/** Wer ist gerade am Zug (wählt das nächste Feld)? */
export function currentTurn(state, config) {
  const ids = teamIds(config);
  for (let i = 0; i < ids.length; i++) {
    const teamId = ids[(state.turn.teamIdx + i) % ids.length];
    const list = teamPlayers(state, teamId);
    if (list.length) {
      const p = list[(state.turn.ptr[teamId] || 0) % list.length];
      return { playerId: p.id, teamId };
    }
  }
  return { playerId: null, teamId: null };
}

function advanceTurn(state, config) {
  const cur = currentTurn(state, config);
  if (!cur.teamId) return;
  const ids = teamIds(config);
  state.turn.ptr[cur.teamId] = ((state.turn.ptr[cur.teamId] || 0) + 1) % Math.max(1, teamPlayers(state, cur.teamId).length);
  state.turn.teamIdx = (ids.indexOf(cur.teamId) + 1) % ids.length;
}

/** Nächstes Team (mit Spieler:innen) nach teamId in Zugreihenfolge. */
function nextTeam(state, config, teamId) {
  const ids = teamIds(config);
  const start = ids.indexOf(teamId);
  for (let i = 1; i < ids.length; i++) {
    const id = ids[(start + i) % ids.length];
    if (teamPlayers(state, id).length) return id;
  }
  return null;
}

/** Team, das klauen dürfte (sieht darum während der Runde keine Lösung). */
function stealTeamFor(state, config) {
  if (!config.klauen || !state.round) return null;
  return nextTeam(state, config, state.round.activeTeamId);
}

// ---------------------------------------------------------------- Timer

export const timerRemaining = (t, now) => (!t ? 0 : t.endsAt ? Math.max(0, t.endsAt - now) : t.remainingMs);
const timerStart = (ms, now) => ({ durMs: ms, endsAt: now + ms, remainingMs: ms });
const timerPause = (t, now) => {
  if (t && t.endsAt) {
    t.remainingMs = Math.max(0, t.endsAt - now);
    t.endsAt = null;
  }
};
const timerResume = (t, now) => {
  if (t && !t.endsAt) t.endsAt = now + t.remainingMs;
};

export function guessStage(timer, now) {
  if (!timer) return 1;
  const elapsed = timer.durMs - timerRemaining(timer, now);
  return Math.min(4, Math.floor(elapsed / (timer.durMs / 4)) + 1);
}

// ---------------------------------------------------------------- Runde

function chooseEntry(state, content, mode, value) {
  const key = `${mode}-${value}`;
  const list = content[mode][String(value)];
  let used = state.used[key] || [];
  let free = list.map((_, i) => i).filter((i) => !used.includes(i));
  if (!free.length) {
    used = [];
    free = list.map((_, i) => i);
  }
  const idx = pick(free);
  state.used[key] = [...used, idx];
  return { idx, entry: list[idx] };
}

function startRound(state, config, content, cellId, now) {
  if (state.phase !== 'board') fail('Das Spiel läuft gerade nicht.');
  if (state.round) fail('Es läuft bereits eine Runde.');
  const cell = state.cells.find((c) => c.id === cellId);
  if (!cell) fail('Unbekanntes Feld.');
  if (cell.played) fail('Dieses Feld wurde schon gespielt.');
  const cur = currentTurn(state, config);
  if (!cur.playerId) fail('Es sind keine Spieler:innen da.');
  const { idx, entry } = chooseEntry(state, content, cell.mode, cell.value);

  let activeId = cur.playerId;
  let substitutedFor = null;
  const activePlayer = state.players.find((p) => p.id === activeId);
  if (cell.mode === 'quiz' && activePlayer?.bday) {
    // Sonderregel: Geburtstagskind darf nicht mitraten, nächste Person im Team übernimmt
    const list = teamPlayers(state, cur.teamId);
    const others = list.filter((p) => !p.bday);
    if (others.length) {
      const pos = list.findIndex((p) => p.id === activeId);
      for (let i = 1; i <= list.length; i++) {
        const cand = list[(pos + i) % list.length];
        if (!cand.bday) {
          substitutedFor = activeId;
          activeId = cand.id;
          break;
        }
      }
    }
  }

  let focus = null;
  if (cell.mode === 'guess') {
    const fx = Number(entry.fokusX);
    const fy = Number(entry.fokusY);
    const ok = (v) => entry && v !== undefined && Number.isFinite(v) && v >= 0 && v <= 1;
    focus = {
      x: ok(fx) && entry.fokusX !== '' && entry.fokusX !== null ? fx : 0.2 + Math.random() * 0.6,
      y: ok(fy) && entry.fokusY !== '' && entry.fokusY !== null ? fy : 0.2 + Math.random() * 0.6,
    };
  }

  state.round = {
    id: rid(10),
    cellId,
    mode: cell.mode,
    value: cell.value,
    double: cell.double,
    entryIdx: idx,
    entry,
    turnPlayerId: cur.playerId,
    activeId,
    activeTeamId: cur.teamId,
    substitutedFor,
    stage: 'ready',
    createdAt: now,
    timer: null,
    emojis: [],
    violation: null,
    steal: null,
    quizChoice: null,
    result: null,
    revealUntil: null,
    focus,
  };
}

const basePoints = (r) => r.value * (r.double ? 2 : 1);

function toReveal(state, config, now, result) {
  const r = state.round;
  timerPause(r.timer, now);
  if (r.steal) timerPause(r.steal.timer, now);
  r.stage = 'reveal';
  r.result = result;
  r.revealUntil = now + config.aufloesungSekunden * 1000;
  if (result.teamId && result.points) state.scores[result.teamId] = (state.scores[result.teamId] || 0) + result.points;
}

function success(state, config, now) {
  const r = state.round;
  let points = basePoints(r);
  let stage = null;
  if (r.mode === 'guess') {
    stage = guessStage(r.timer, now);
    points = Math.round(points * GUESS_FACTORS[stage - 1]);
  }
  toReveal(state, config, now, { teamId: r.activeTeamId, points, how: 'erraten', guessStage: stage });
}

function failed(state, config, now, how) {
  const r = state.round;
  timerPause(r.timer, now);
  const stealTeam = how !== 'regelverstoss' ? stealTeamFor(state, config) : null;
  if (stealTeam) {
    r.stage = 'steal';
    r.failHow = how;
    r.steal = { teamId: stealTeam, timer: timerStart(config.klauenDauerSekunden * 1000, now) };
  } else {
    toReveal(state, config, now, { teamId: null, points: 0, how });
  }
}

function finishRound(state, config) {
  const r = state.round;
  if (!r) return;
  const cell = state.cells.find((c) => c.id === r.cellId);
  cell.played = true;
  cell.wonBy = r.result?.teamId || null;
  cell.points = r.result?.points || 0;
  state.lastResult = { cellId: r.cellId, ...r.result };
  state.round = null;
  advanceTurn(state, config);
  if (state.cells.every((c) => c.played)) state.phase = 'final';
}

const hasBirthday = (state) => state.players.some((p) => p.bday);

function evaluateQuiz(state, config, now) {
  const r = state.round;
  if (r.quizChoice === Number(r.entry.richtig)) success(state, config, now);
  else failed(state, config, now, r.quizChoice === null ? 'zeit' : 'falsch');
}

// ---------------------------------------------------------------- Zeitabläufe

/** Prüft zeitgesteuerte Übergänge. Gibt true zurück, wenn sich etwas geändert hat. */
export function tick(state, config, now) {
  const r = state.round;
  if (!r) return false;
  if (r.stage === 'running' && r.timer?.endsAt && now >= r.timer.endsAt) {
    timerPause(r.timer, now);
    if (r.mode === 'quiz') evaluateQuiz(state, config, now);
    else failed(state, config, now, 'zeit');
    return true;
  }
  if (r.stage === 'reveal' && r.revealUntil && now >= r.revealUntil) {
    finishRound(state, config);
    return true;
  }
  return false;
}

export function needsTick(state, now) {
  const r = state?.round;
  if (!r) return false;
  return (r.stage === 'running' && r.timer?.endsAt && now >= r.timer.endsAt) || (r.stage === 'reveal' && r.revealUntil && now >= r.revealUntil);
}

// ---------------------------------------------------------------- Aktionen

/**
 * Führt eine Aktion aus. actor = { role: 'tv'|'admin'|'player', playerId?, isAdmin }
 * Gibt optional ein Ergebnis-Objekt zurück (z.B. neue playerId).
 */
export function applyAction(state, config, content, actor, type, payload = {}, now = Date.now()) {
  const admin = actor.isAdmin;
  const me = actor.playerId ? state.players.find((p) => p.id === actor.playerId) : null;
  const r = state.round;
  const needAdmin = () => {
    if (!admin) fail('Nur die Spielleitung darf das.');
  };
  const isActive = () => admin || (me && r && me.id === r.activeId);
  const needActive = () => {
    if (!isActive()) fail('Das darf nur die aktive Person.');
  };
  const needStage = (...stages) => {
    if (!r || !stages.includes(r.stage)) fail('Das geht gerade nicht.');
  };

  switch (type) {
    // ---------- Lobby
    case 'join': {
      if (state.phase === 'final') fail('Das Spiel ist schon vorbei.');
      if (String(payload.pin || '').trim() !== state.gamePin) fail('Falscher Game-PIN.');
      const name = String(payload.name || '').trim().slice(0, 20);
      if (!name) fail('Bitte gib deinen Namen ein.');
      if (!teamIds(config).includes(payload.teamId)) fail('Bitte wähle ein Team.');
      const player = { id: rid(12), name, teamId: payload.teamId, bday: false, fake: false, joinedAt: now };
      state.players.push(player);
      return { playerId: player.id };
    }
    case 'createTestPlayers': {
      if (!admin && state.phase !== 'lobby') fail('Testmodus nur in der Lobby.');
      if (state.players.some((p) => p.fake)) return;
      const names = ['Anna', 'Ben', 'Lea', 'Chris', 'Dana', 'Elias'];
      const ids = teamIds(config);
      names.forEach((name, i) => {
        state.players.push({ id: rid(12), name: name === 'Lea' ? config.geburtstagskind : name, teamId: ids[i % 2], bday: i === 2, fake: true, joinedAt: now + i });
      });
      return;
    }
    case 'movePlayer': {
      needAdmin();
      const p = state.players.find((x) => x.id === payload.playerId);
      if (!p) fail('Unbekannte Person.');
      if (!teamIds(config).includes(payload.teamId)) fail('Unbekanntes Team.');
      p.teamId = payload.teamId;
      p.joinedAt = now; // ans Ende der Reihenfolge im neuen Team
      return;
    }
    case 'removePlayer': {
      needAdmin();
      if (r && (r.activeId === payload.playerId)) fail('Die aktive Person kann während der Runde nicht entfernt werden.');
      state.players = state.players.filter((x) => x.id !== payload.playerId);
      return;
    }
    case 'renamePlayer': {
      needAdmin();
      const p = state.players.find((x) => x.id === payload.playerId);
      if (p && String(payload.name || '').trim()) p.name = String(payload.name).trim().slice(0, 20);
      return;
    }
    case 'setBirthday': {
      needAdmin();
      const p = state.players.find((x) => x.id === payload.playerId);
      if (!p) fail('Unbekannte Person.');
      p.bday = !!payload.value;
      return;
    }
    case 'startGame': {
      needAdmin();
      if (state.phase !== 'lobby') fail('Das Spiel läuft schon.');
      if (activeTeams(state, config).length < 1) fail('Es hat noch niemand gejoint.');
      state.phase = 'board';
      return;
    }
    case 'newGame': {
      needAdmin();
      const fresh = newGame(config);
      for (const k of Object.keys(state)) delete state[k];
      Object.assign(state, fresh);
      return;
    }
    case 'endGame': {
      needAdmin();
      state.round = null;
      state.phase = 'final';
      return;
    }
    case 'backToBoard': {
      needAdmin();
      if (state.phase === 'final' && state.cells.some((c) => !c.played)) state.phase = 'board';
      return;
    }

    // ---------- Board
    case 'pick': {
      const cur = currentTurn(state, config);
      if (!admin && (!me || me.id !== cur.playerId)) fail('Du bist gerade nicht am Zug.');
      startRound(state, config, content, payload.cellId, now);
      return;
    }
    case 'skipPlayer': {
      needAdmin();
      if (r) fail('Zuerst die Runde beenden oder abbrechen.');
      advanceTurn(state, config);
      return;
    }
    case 'resetCell': {
      needAdmin();
      const cell = state.cells.find((c) => c.id === payload.cellId);
      if (!cell) fail('Unbekanntes Feld.');
      if (r && r.cellId === cell.id) fail('Dieses Feld wird gerade gespielt.');
      if (cell.wonBy && cell.points) state.scores[cell.wonBy] -= cell.points;
      cell.played = false;
      cell.wonBy = null;
      cell.points = 0;
      if (state.phase === 'final') state.phase = 'board';
      return;
    }
    case 'adjustScore': {
      needAdmin();
      if (!(payload.teamId in state.scores)) fail('Unbekanntes Team.');
      state.scores[payload.teamId] += Math.round(Number(payload.delta) || 0);
      return;
    }

    // ---------- Runde
    case 'start': {
      needStage('ready');
      needActive();
      r.stage = 'running';
      r.timer = timerStart(config.rundendauerSekunden * 1000, now);
      return;
    }
    case 'guessed': {
      needStage('running');
      needActive();
      if (r.mode === 'quiz') fail('Im Quiz bitte eine Antwort wählen.');
      success(state, config, now);
      return;
    }
    case 'giveUp': {
      needStage('running', 'ready');
      needActive();
      failed(state, config, now, 'aufgegeben');
      return;
    }
    case 'quizAnswer': {
      needStage('running');
      needActive();
      if (r.mode !== 'quiz') fail('Kein Quiz.');
      const choice = Number(payload.choice);
      if (!(choice >= 0 && choice <= 3)) fail('Ungültige Antwort.');
      r.quizChoice = choice;
      timerPause(r.timer, now);
      if (hasBirthday(state)) r.stage = 'quizConfirm';
      else evaluateQuiz(state, config, now);
      return;
    }
    case 'quizConfirm': {
      needStage('quizConfirm');
      if (!admin && !me?.bday) fail('Das bestätigt das Geburtstagskind.');
      evaluateQuiz(state, config, now);
      return;
    }
    case 'violation': {
      needStage('running');
      if (!admin) {
        if (!me) fail('Unbekannte Person.');
        if (me.teamId === r.activeTeamId) fail('Nur Gegner:innen können einen Regelverstoss melden.');
      }
      timerPause(r.timer, now);
      r.stage = 'violation';
      r.violation = { by: me?.id || null, byName: me?.name || 'Spielleitung', at: now };
      return;
    }
    case 'violationConfirm': {
      needAdmin();
      needStage('violation');
      failed(state, config, now, 'regelverstoss');
      return;
    }
    case 'violationReject': {
      needAdmin();
      needStage('violation');
      r.stage = 'running';
      r.violation = null;
      timerResume(r.timer, now);
      return;
    }
    case 'stealDecision': {
      needAdmin();
      needStage('steal');
      if (payload.correct) {
        toReveal(state, config, now, { teamId: r.steal.teamId, points: Math.round(basePoints(r) / 2), how: 'geklaut' });
      } else {
        toReveal(state, config, now, { teamId: null, points: 0, how: r.failHow || 'zeit', stealFailed: true });
      }
      return;
    }
    case 'pauseTimer': {
      needAdmin();
      if (!r) fail('Keine Runde aktiv.');
      if (r.stage === 'steal') timerPause(r.steal.timer, now);
      else timerPause(r.timer, now);
      r.paused = true;
      return;
    }
    case 'resumeTimer': {
      needAdmin();
      if (!r) fail('Keine Runde aktiv.');
      if (r.stage === 'steal') timerResume(r.steal.timer, now);
      else if (r.stage === 'running') timerResume(r.timer, now);
      r.paused = false;
      return;
    }
    case 'abortRound': {
      needAdmin();
      if (!r) fail('Keine Runde aktiv.');
      // Punkte einer bereits laufenden Auflösung zurücknehmen
      if (r.stage === 'reveal' && r.result?.teamId && r.result.points) state.scores[r.result.teamId] -= r.result.points;
      state.round = null; // Feld bleibt frei, Eintrag gilt als verbraucht
      return;
    }
    case 'next': {
      needStage('reveal');
      if (!admin && actor.role !== 'tv') fail('Nur Spielleitung oder TV.');
      finishRound(state, config);
      return;
    }
    case 'emoji': {
      needStage('running', 'violation');
      if (!isActive()) fail('Nur die aktive Person.');
      if (r.mode !== 'emoji') fail('Kein Emoji-Modus.');
      if (payload.op === 'add' && typeof payload.emoji === 'string' && payload.emoji.length <= 16 && r.emojis.length < 60) r.emojis.push(payload.emoji);
      if (payload.op === 'undo') r.emojis.pop();
      if (payload.op === 'clear') r.emojis = [];
      return;
    }
    default:
      fail(`Unbekannte Aktion: ${type}`);
  }
}

// ---------------------------------------------------------------- Sichten

function publicCells(state) {
  return state.cells.map((c) => ({ id: c.id, mode: c.mode, value: c.value, played: c.played, wonBy: c.wonBy, points: c.points, double: c.played ? c.double : false }));
}

function revealInfo(r) {
  const e = r.entry || {};
  return {
    begriff: e.begriff || e.loesung || null,
    verboten: e.verboten || null,
    kategorie: e.kategorie || null,
    loesung: e.loesung || null,
    frage: e.frage || null,
    optionen: e.optionen || null,
    richtig: r.mode === 'quiz' ? Number(e.richtig) : null,
  };
}

function publicRound(r) {
  if (!r) return null;
  const e = r.entry || {};
  const out = {
    id: r.id,
    cellId: r.cellId,
    mode: r.mode,
    value: r.value,
    double: r.double,
    stage: r.stage,
    activeId: r.activeId,
    activeTeamId: r.activeTeamId,
    substitutedFor: r.substitutedFor,
    timer: r.timer,
    paused: !!r.paused,
    emojis: r.emojis,
    violation: r.violation,
    steal: r.steal,
    result: r.result,
    revealUntil: r.revealUntil,
  };
  if (r.mode === 'guess') out.guess = { kategorie: e.kategorie || 'Bild', focus: r.focus };
  if (r.mode === 'quiz' && r.stage !== 'ready') out.quiz = { frage: e.frage, optionen: e.optionen, choice: r.quizChoice };
  if (r.stage === 'reveal') out.reveal = revealInfo(r);
  return out;
}

export function buildView(state, config, ctx) {
  const { role, playerId, isAdmin, now, seen = {}, extra = {} } = ctx;
  const ONLINE_MS = 15000;
  const view = {
    v: state._v,
    gameId: state.gameId,
    now,
    role,
    phase: state.phase,
    gamePin: state.gamePin,
    title: config.spieltitel,
    bdayName: config.geburtstagskind,
    klauen: config.klauen,
    roundSeconds: config.rundendauerSekunden,
    teams: config.teams.map((t) => ({ ...t, score: state.scores[t.id] || 0 })),
    players: state.players.map((p) => ({ id: p.id, name: p.name, teamId: p.teamId, bday: p.bday, fake: p.fake, online: p.fake || now - (seen[p.id] || 0) < ONLINE_MS })),
    cells: publicCells(state),
    current: currentTurn(state, config),
    round: publicRound(state.round),
    started: state.phase !== 'lobby',
    ...extra,
  };
  if (state.phase === 'final') view.finaltext = config.finaltext;

  if (isAdmin) {
    view.isAdmin = true;
    if (state.round) {
      view.round.secret = revealInfo(state.round);
      view.round.stealTeamId = stealTeamFor(state, config);
    }
    view.doubles = state.cells.filter((c) => c.double).map((c) => c.id);
  }

  if (role === 'player') {
    const me = state.players.find((p) => p.id === playerId) || null;
    view.askedFor = playerId || null;
    view.me = me ? { id: me.id, name: me.name, teamId: me.teamId, bday: me.bday } : null;
    const r = state.round;
    if (me && r) {
      const e = r.entry || {};
      const stealTeam = stealTeamFor(state, config);
      let sees = 'team';
      if (me.id === r.activeId) sees = 'active';
      else if (me.teamId === r.activeTeamId) sees = 'team';
      else if (me.teamId === stealTeam && r.stage !== 'reveal') sees = 'steal';
      else sees = 'opponent';
      const secret = {};
      if (r.mode === 'quiz') {
        if (me.bday) {
          secret.richtig = Number(e.richtig);
          if (me.teamId === r.activeTeamId) secret.bench = true;
        }
      } else if (r.mode === 'guess') {
        if (sees === 'opponent') Object.assign(secret, { loesung: e.loesung, kategorie: e.kategorie });
      } else if (sees === 'active' || sees === 'opponent') {
        secret.begriff = e.begriff;
        if (r.mode === 'tabu') secret.verboten = e.verboten || [];
      }
      view.mySide = sees;
      view.secret = secret;
    }
  }
  return view;
}
