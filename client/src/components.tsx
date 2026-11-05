import { useEffect, useMemo, useRef, useState } from 'react';
import type { Cell, Mode, Timer, View } from './types';
import { remaining, serverNow, useNow } from './api';
import { modeInfo } from './modes';
import { sfx } from './sound';

// ---------------------------------------------------------------- Hintergrund
export function Background({ count = 12 }: { count?: number }) {
  const shapes = useMemo(() => {
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    const list: any[] = [];
    for (let i = 0; i < count; i++) {
      const kind = i % 6 === 0 ? 'outline' : i % 3 === 0 ? 'tri' : 'square';
      const s = rnd(80, 260);
      list.push({
        kind,
        style: {
          left: `${rnd(-5, 95)}%`,
          top: `${rnd(-5, 95)}%`,
          width: s,
          height: s,
          '--s': `${s}px`,
          '--c': i % 12 === 0 ? '#FFCB2D' : '#2EC4F1',
          '--dur': `${rnd(16, 30)}s`,
          '--dx': `${rnd(-80, 80)}px`,
          '--dy': `${rnd(-80, 80)}px`,
          '--r0': `${rnd(-30, 30)}deg`,
          '--r1': `${rnd(-60, 60)}deg`,
          animationDelay: `${-rnd(0, 20)}s`,
        },
      });
    }
    return list;
  }, [count]);
  return (
    <div className="bg" aria-hidden>
      {shapes.map((s, i) => (
        <div key={i} className={`shape ${s.kind}`} style={s.style} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- Zahlen hochzählen
export function AnimatedNumber({ value, duration = 1000 }: { value: number; duration?: number }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    const b = value;
    if (a === b) return;
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = Math.round(a + (b - a) * eased);
      setShown(v);
      from.current = v;
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <>{shown}</>;
}

// ---------------------------------------------------------------- Konfetti
export function Confetti({ fire, big = false }: { fire: any; big?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!fire) return;
    const cv = ref.current!;
    const c = cv.getContext('2d')!;
    const W = (cv.width = cv.offsetWidth);
    const H = (cv.height = cv.offsetHeight);
    const colors = ['#FFCB2D', '#2EC4F1', '#FF5FA2', '#3DDC84', '#ffffff', '#B57BFF'];
    const N = big ? 320 : 180;
    const parts = Array.from({ length: N }, () => ({
      x: W / 2 + (Math.random() - 0.5) * W * (big ? 1 : 0.4),
      y: big ? -Math.random() * H * 0.5 : H * 0.55,
      vx: (Math.random() - 0.5) * (big ? 6 : 26),
      vy: big ? Math.random() * 4 + 2 : -Math.random() * 30 - 12,
      r: Math.random() * 12 + 7,
      a: Math.random() * 6,
      va: (Math.random() - 0.5) * 0.4,
      col: colors[Math.floor(Math.random() * colors.length)],
    }));
    const start = performance.now();
    const life = big ? 5000 : 2200;
    let raf = 0;
    const step = (t: number) => {
      const el = t - start;
      c.clearRect(0, 0, W, H);
      for (const p of parts) {
        p.vy += big ? 0.12 : 0.9;
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.a += p.va;
        if (big && p.y > H + 20 && el < life - 1500) {
          p.y = -20;
          p.vy = Math.random() * 3 + 2;
        }
        c.save();
        c.globalAlpha = Math.max(0, 1 - Math.max(0, el - (life - 600)) / 600);
        c.translate(p.x, p.y);
        c.rotate(p.a);
        c.fillStyle = p.col;
        c.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2);
        c.restore();
      }
      if (el < life) raf = requestAnimationFrame(step);
      else c.clearRect(0, 0, W, H);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [fire, big]);
  return <canvas ref={ref} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 30 }} />;
}

// ---------------------------------------------------------------- Timer
export function TimerRing({ timer, size = 300, sounds = false, paused = false }: { timer: Timer | null; size?: number; sounds?: boolean; paused?: boolean }) {
  const now = useNow(20);
  const rem = remaining(timer, now);
  const secs = Math.ceil(rem / 1000);
  const frac = timer ? rem / timer.durMs : 1;
  const urgent = secs <= 10 && rem > 0;
  const lastSec = useRef<number | null>(null);
  useEffect(() => {
    if (!sounds || !timer || !timer.endsAt) {
      lastSec.current = secs;
      return;
    }
    if (lastSec.current !== null && secs !== lastSec.current) {
      if (secs === 0) sfx.gong();
      else if (secs <= 10) secs <= 3 ? sfx.tickHigh() : sfx.tick();
    }
    lastSec.current = secs;
  }, [secs, sounds, timer]);
  const R = 45;
  const C = 2 * Math.PI * R;
  const color = urgent || rem === 0 ? '#FF4D5E' : frac < 0.5 ? '#FFCB2D' : '#3DDC84';
  return (
    <div className={`timer-ring ${urgent ? 'urgent' : ''} ${paused || (timer && !timer.endsAt) ? 'paused' : ''}`} style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={R} fill="rgba(42,30,92,.5)" stroke="rgba(255,255,255,.18)" strokeWidth="8" />
        <circle cx="50" cy="50" r={R} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - frac)} style={{ transition: 'stroke-dashoffset .1s linear, stroke .3s' }} />
      </svg>
      <div className="num" style={{ fontSize: size * 0.37 }}>
        {secs}
      </div>
    </div>
  );
}

export function TimerText({ timer }: { timer: Timer | null }) {
  const now = useNow(4);
  const rem = remaining(timer, now);
  const secs = Math.ceil(rem / 1000);
  return <div className={`timer-mini ${secs <= 10 ? 'urgent' : ''}`}>⏱ {secs}s{timer && !timer.endsAt ? ' ⏸' : ''}</div>;
}

// ---------------------------------------------------------------- Mini-Board (Handy, Admin)
export function MiniBoard({ view, onPick, disabled, showDoubles }: { view: View; onPick?: (c: Cell) => void; disabled?: boolean; showDoubles?: boolean }) {
  const modes = modeInfo(view.bdayName);
  const team = (id: string | null) => view.teams.find((t) => t.id === id);
  const cols = view.board.columns;
  return (
    <div className="mini-board" style={{ gridTemplateColumns: `repeat(${cols.length}, 1fr)` }}>
      {cols.map((col) => (
        <div key={col.id} className="h" style={{ '--mc': modes[col.mode].color } as any} title={col.title}>
          {col.title}
        </div>
      ))}
      {view.board.values.map((v) =>
        cols.map((col) => {
          const c = view.cells.find((x) => x.col === col.id && x.value === v);
          if (!c) return <div key={col.id + v} />;
          const isDouble = showDoubles && view.doubles?.includes(c.id);
          return (
            <button key={c.id} disabled={(disabled || c.played) && !(showDoubles && c.played)} style={c.played ? ({ '--wc': team(c.wonBy)?.farbe || '#6f6a8f', background: team(c.wonBy)?.farbe || '#6f6a8f', opacity: 0.5 } as any) : undefined} onClick={() => onPick?.(c)}>
              {c.played ? (c.points ? c.points : '–') : v}
              {isDouble ? '×2' : ''}
            </button>
          );
        }),
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Zeichnen
export const DRAW_COLORS = ['#222222', '#E53935', '#1E88E5', '#43A047', '#FDD835', '#8E24AA'];
export const DRAW_SIZES = [0.008, 0.022];
export const ERASER = '#FFFFFF';

export type DrawOp = { t: 's'; id: string; c: string; w: number; p: number[] } | { t: 'p'; id: string; p: number[] } | { t: 'clear' };

/** Zeichnet Operationen auf ein Canvas. Gibt Funktion zurück, um neue Ops anzuwenden. */
export function makeRenderer(canvas: HTMLCanvasElement) {
  const c = canvas.getContext('2d')!;
  const strokes = new Map<string, { c: string; w: number; last: [number, number] | null }>();
  const W = () => canvas.width;
  const H = () => canvas.height;
  const clear = () => {
    c.fillStyle = '#fff';
    c.fillRect(0, 0, W(), H());
  };
  clear();
  const seg = (s: { c: string; w: number; last: [number, number] | null }, pts: number[]) => {
    c.strokeStyle = s.c;
    c.fillStyle = s.c;
    c.lineWidth = s.w * W();
    c.lineCap = 'round';
    c.lineJoin = 'round';
    for (let i = 0; i < pts.length; i += 2) {
      const x = pts[i] * W();
      const y = pts[i + 1] * H();
      if (s.last) {
        c.beginPath();
        c.moveTo(s.last[0], s.last[1]);
        c.lineTo(x, y);
        c.stroke();
      } else {
        c.beginPath();
        c.arc(x, y, (s.w * W()) / 2, 0, Math.PI * 2);
        c.fill();
      }
      s.last = [x, y];
    }
  };
  return {
    apply(ops: DrawOp[]) {
      for (const op of ops) {
        if (op.t === 'clear') {
          strokes.clear();
          clear();
        } else if (op.t === 's') {
          const s = { c: op.c, w: op.w, last: null };
          strokes.set(op.id, s);
          seg(s, op.p);
        } else if (op.t === 'p') {
          const s = strokes.get(op.id);
          if (s) seg(s, op.p);
        }
      }
    },
    reset() {
      strokes.clear();
      clear();
    },
  };
}

/** TV/Admin: holt die Striche regelmässig vom Server und zeigt sie an. */
export function DrawView({ roundId, live }: { roundId: string; live: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!;
    cv.width = 1200;
    cv.height = 900;
    const r = makeRenderer(cv);
    let from = 0;
    let stop = false;
    let t: number;
    const poll = async () => {
      try {
        const res = await fetch(`/api/game?ops=${roundId}&from=${from}`, { cache: 'no-store' });
        const data = await res.json();
        if (data.ops?.length) {
          r.apply(data.ops);
          from += data.ops.length;
        }
      } catch {}
      if (!stop && live) t = window.setTimeout(poll, 300);
    };
    poll();
    return () => {
      stop = true;
      clearTimeout(t);
    };
  }, [roundId, live]);
  return (
    <div className="draw-view">
      <canvas ref={ref} />
    </div>
  );
}

// ---------------------------------------------------------------- Guess-Bild
const STAGE_AREA = [0.1, 0.25, 0.5, 1];

export function GuessImage({ roundId, focus, stage, maxW = 1200, maxH = 680 }: { roundId: string; focus: { x: number; y: number }; stage: number; maxW?: number; maxH?: number }) {
  const [ratio, setRatio] = useState<number | null>(null);
  const src = `/api/image?round=${roundId}`;
  useEffect(() => {
    const img = new Image();
    img.onload = () => setRatio(img.naturalWidth / img.naturalHeight);
    img.src = src;
  }, [src]);
  if (!ratio) return <div className="mid-text">Bild lädt …</div>;
  let w = maxW;
  let h = w / ratio;
  if (h > maxH) {
    h = maxH;
    w = h * ratio;
  }
  // Ausschnitt mit Flächenanteil "area", zentriert auf den Fokus
  const s = Math.sqrt(STAGE_AREA[Math.max(0, Math.min(3, stage - 1))]);
  const left = Math.min(Math.max(focus.x - s / 2, 0), 1 - s);
  const top = Math.min(Math.max(focus.y - s / 2, 0), 1 - s);
  const posX = s >= 1 ? 0 : (left / (1 - s)) * 100;
  const posY = s >= 1 ? 0 : (top / (1 - s)) * 100;
  return (
    <div
      className="guess-frame"
      style={{
        width: w,
        height: h,
        backgroundImage: `url(${src})`,
        backgroundSize: `${100 / s}% ${100 / s}%`,
        backgroundPosition: `${posX}% ${posY}%`,
      }}
    />
  );
}

// ---------------------------------------------------------------- Wake Lock
export function useWakeLock(active: boolean) {
  const [supported] = useState(() => 'wakeLock' in navigator);
  useEffect(() => {
    if (!active || !supported) return;
    let lock: any = null;
    let cancelled = false;
    const request = async () => {
      try {
        if (document.visibilityState === 'visible') {
          lock = await (navigator as any).wakeLock.request('screen');
          if (cancelled) lock.release();
        }
      } catch {
        /* z.B. Energiesparmodus: ignorieren */
      }
    };
    request();
    const onVis = () => {
      if (document.visibilityState === 'visible') request();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
      lock?.release?.();
    };
  }, [active, supported]);
  return supported;
}

export function teamOf(view: View, id: string | null | undefined) {
  return view.teams.find((t) => t.id === id);
}
export function playerOf(view: View, id: string | null | undefined) {
  return view.players.find((p) => p.id === id);
}
export function modeOf(view: View, m: Mode) {
  return modeInfo(view.bdayName)[m];
}
export { serverNow };
