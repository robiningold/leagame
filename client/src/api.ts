import { useCallback, useEffect, useRef, useState } from 'react';
import type { Role, View } from './types';

// Differenz zwischen Server- und Geräteuhr, damit alle Timer synchron laufen
let clockOffset = 0;
export const serverNow = () => Date.now() + clockOffset;

function updateClock(serverTime: number, t0: number, t1: number) {
  const sample = serverTime - (t0 + t1) / 2;
  // Ausreisser dämpfen
  clockOffset = Math.abs(sample - clockOffset) > 2000 ? sample : clockOffset * 0.7 + sample * 0.3;
}

export interface Ident {
  role: Role;
  playerId?: string | null;
  pin?: string | null;
}

export async function postAction(ident: Ident, type: string, payload: any = {}) {
  const t0 = Date.now();
  const res = await fetch('/api/game', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: ident.role, playerId: ident.playerId, pin: ident.pin, type, payload }),
  });
  const data = await res.json().catch(() => ({ error: 'Keine Antwort vom Server.' }));
  if (data.view) updateClock(data.view.now, t0, Date.now());
  if (!res.ok) throw new Error(data.error || 'Fehler');
  return data;
}

/**
 * Fragt den Spielstand regelmässig ab (Polling). Pausiert, wenn der Tab im Hintergrund ist,
 * und holt sofort neu, sobald er wieder sichtbar wird (z.B. nach Bildschirmsperre).
 */
export function useGame(ident: Ident, intervalMs: number, enabled = true) {
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const identRef = useRef(ident);
  identRef.current = ident;
  const lastJson = useRef('');
  const timer = useRef<number | undefined>(undefined);
  const pollCount = useRef(0);
  const inflight = useRef(false);

  const apply = useCallback((v: View) => {
    const { now, ...rest } = v;
    const json = JSON.stringify(rest);
    if (json !== lastJson.current) {
      lastJson.current = json;
      setView(v);
    }
  }, []);

  const poll = useCallback(async () => {
    if (inflight.current) return;
    inflight.current = true;
    const id = identRef.current;
    const params = new URLSearchParams({ role: id.role });
    if (id.playerId) params.set('playerId', id.playerId);
    if (id.pin) params.set('pin', id.pin);
    // Anwesenheit nur alle ~5 Abfragen melden (spart Datenbankzugriffe)
    if (id.role === 'player' && pollCount.current++ % 5 === 0) params.set('ping', '1');
    const t0 = Date.now();
    try {
      const res = await fetch('/api/game?' + params.toString(), { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Fehler');
      } else {
        updateClock(data.now, t0, Date.now());
        setError(null);
        apply(data);
      }
      setOffline(false);
    } catch {
      setOffline(true);
    } finally {
      inflight.current = false;
    }
  }, [apply]);

  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    const loop = async () => {
      if (stopped) return;
      if (!document.hidden) await poll();
      timer.current = window.setTimeout(loop, intervalMs);
    };
    loop();
    const onVis = () => {
      if (!document.hidden) poll();
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onVis);
    window.addEventListener('online', onVis);
    return () => {
      stopped = true;
      clearTimeout(timer.current);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onVis);
      window.removeEventListener('online', onVis);
    };
  }, [poll, intervalMs, enabled, ident.role, ident.playerId, ident.pin]);

  const act = useCallback(
    async (type: string, payload: any = {}) => {
      const data = await postAction(identRef.current, type, payload);
      if (data.view) apply(data.view);
      return data;
    },
    [apply],
  );

  return { view, error, offline, act, refresh: poll };
}

/** Sekundengenauer Ticker für Timer-Anzeigen. */
export function useNow(fps = 10) {
  const [now, setNow] = useState(serverNow());
  useEffect(() => {
    const id = window.setInterval(() => setNow(serverNow()), 1000 / fps);
    return () => clearInterval(id);
  }, [fps]);
  return now;
}

export function remaining(t: { endsAt: number | null; remainingMs: number } | null | undefined, now: number) {
  if (!t) return 0;
  return t.endsAt ? Math.max(0, t.endsAt - now) : t.remainingMs;
}

export function guessStage(t: { durMs: number; endsAt: number | null; remainingMs: number } | null | undefined, now: number) {
  if (!t) return 1;
  const elapsed = t.durMs - remaining(t, now);
  return Math.min(4, Math.floor(elapsed / (t.durMs / 4)) + 1);
}

// Bild-Runde: Bonus je früher erraten (Faktor auf die Grundpunkte)
export const GUESS_FACTORS = [2, 1.5, 1.25, 1];
