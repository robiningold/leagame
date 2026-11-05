import type { Mode } from './types';

export interface ModeInfo {
  key: Mode;
  label: string;
  icon: string;
  color: string;
  rule: string;
}

export function modeInfo(bdayName: string): Record<Mode, ModeInfo> {
  return {
    pantomime: { key: 'pantomime', label: 'Pantomime', icon: '🎭', color: '#FF7A59', rule: 'Ohne Worte und ohne Geräusche darstellen.' },
    tabu: { key: 'tabu', label: 'Tabu', icon: '🤐', color: '#FF5FA2', rule: 'Erklären, ohne die verbotenen Wörter zu sagen.' },
    malen: { key: 'malen', label: 'Malen', icon: '🎨', color: '#4CD97B', rule: 'Zeichnen – keine Buchstaben, keine Zahlen!' },
    emoji: { key: 'emoji', label: 'Emoji', icon: '😎', color: '#FFCB2D', rule: 'Nur mit Emojis beschreiben.' },
    guess: { key: 'guess', label: 'Guess the ___', icon: '🔍', color: '#2EC4F1', rule: 'Das Bild wird Stück für Stück aufgedeckt. Je früher, desto mehr Punkte!' },
    quiz: { key: 'quiz', label: `Wer kennt ${bdayName}?`, icon: '🎂', color: '#B57BFF', rule: `Wählt die richtige Antwort. ${bdayName} darf nicht mithelfen!` },
    summen: { key: 'summen', label: 'Song summen', icon: '🎵', color: '#FF9F1C', rule: 'Den Song nur summen – kein Text, keine Wörter!' },
  };
}

export const MODE_ORDER: Mode[] = ['pantomime', 'tabu', 'malen', 'emoji', 'guess', 'quiz', 'summen'];
export const VALUES = [100, 200, 300, 400, 500];

export const HOW_TEXT: Record<string, string> = {
  erraten: 'Erraten!',
  geklaut: 'Geklaut!',
  zeit: 'Zeit abgelaufen',
  aufgegeben: 'Aufgegeben',
  regelverstoss: 'Regelverstoss!',
  falsch: 'Leider falsch',
};
