export type Mode = 'pantomime' | 'tabu' | 'malen' | 'emoji' | 'guess' | 'quiz';
export type Role = 'tv' | 'admin' | 'player';

export interface Team {
  id: string;
  name: string;
  farbe: string;
  score: number;
}
export interface Player {
  id: string;
  name: string;
  teamId: string;
  bday: boolean;
  fake: boolean;
  online: boolean;
}
export interface Column {
  id: string;
  mode: Mode;
  title: string;
}
export interface Cell {
  id: string;
  col: string;
  mode: Mode;
  value: number;
  played: boolean;
  wonBy: string | null;
  points: number;
  double: boolean;
}
export interface Timer {
  durMs: number;
  endsAt: number | null;
  remainingMs: number;
}
export interface Result {
  teamId: string | null;
  points: number;
  how: 'erraten' | 'geklaut' | 'zeit' | 'aufgegeben' | 'regelverstoss' | 'falsch';
  guessStage?: number | null;
  stealFailed?: boolean;
}
export interface RevealInfo {
  begriff: string | null;
  verboten: string[] | null;
  kategorie: string | null;
  loesung: string | null;
  frage: string | null;
  optionen: string[] | null;
  richtig: number | null;
}
export interface Round {
  id: string;
  cellId: string;
  col: string;
  title: string;
  mode: Mode;
  value: number;
  double: boolean;
  stage: 'ready' | 'running' | 'violation' | 'steal' | 'quizConfirm' | 'reveal';
  activeId: string;
  activeTeamId: string;
  substitutedFor: string | null;
  timer: Timer | null;
  paused: boolean;
  emojis: string[];
  violation: { by: string | null; byName: string } | null;
  steal: { teamId: string; timer: Timer } | null;
  result: Result | null;
  revealUntil: number | null;
  guess?: { kategorie: string; focus: { x: number; y: number } };
  quiz?: { frage: string; optionen: string[]; choice: number | null };
  reveal?: RevealInfo;
  secret?: RevealInfo;
  stealTeamId?: string | null;
}
export interface View {
  v: number;
  gameId: string;
  now: number;
  role: Role;
  phase: 'lobby' | 'board' | 'final';
  gamePin: string;
  title: string;
  bdayName: string;
  klauen: boolean;
  roundSeconds: number;
  teams: Team[];
  players: Player[];
  cells: Cell[];
  board: { columns: Column[]; values: number[] };
  emptyCells?: string[];
  current: { playerId: string | null; teamId: string | null };
  round: Round | null;
  started: boolean;
  finaltext?: string;
  lanUrl: string | null;
  hasFinalePhoto: boolean;
  storage: 'redis' | 'local';
  isAdmin?: boolean;
  doubles?: string[];
  askedFor?: string | null;
  me?: { id: string; name: string; teamId: string; bday: boolean } | null;
  mySide?: 'active' | 'team' | 'steal' | 'opponent';
  secret?: { begriff?: string; verboten?: string[]; loesung?: string; kategorie?: string; richtig?: number; bench?: boolean };
}
