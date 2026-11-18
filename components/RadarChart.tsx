import { CATEGORIES, CATEGORY_LABEL, type Category } from '@/lib/types';

/** Skill radar. Score per category = skill points / 150, capped at 100%. */
export const RADAR_FULL = 150;
export default function RadarChart({ skills, size = 260 }: { skills: Record<string, { resolved: number; points: number }>; size?: number }) {
  const c = size / 2, r = size / 2 - 48, n = CATEGORIES.length;
  const pt = (i: number, v: number) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / n; return [c + Math.cos(a) * r * v, c + Math.sin(a) * r * v] as const; };
  const scores = CATEGORIES.map((k) => Math.min(1, (skills[k]?.points ?? 0) / RADAR_FULL));
  const poly = scores.map((v, i) => pt(i, Math.max(v, 0.02)).join(',')).join(' ');
  const summary = CATEGORIES.map((k, i) => `${CATEGORY_LABEL[k as Category]} ${Math.round(scores[i] * 100)}%`).join(', ');
  return (
    <figure style={{ margin: 0 }}>
      <svg viewBox={`0 0 ${size} ${size}`} width="100%" style={{ maxWidth: size }} role="img" aria-label={`Skill radar: ${summary}`}>
        {[0.25, 0.5, 0.75, 1].map((g) => <polygon key={g} points={CATEGORIES.map((_, i) => pt(i, g).join(',')).join(' ')} fill="none" stroke="var(--border)" strokeWidth="1" />)}
        {CATEGORIES.map((_, i) => <line key={i} x1={c} y1={c} x2={pt(i, 1)[0]} y2={pt(i, 1)[1]} stroke="var(--border)" />)}
        <polygon points={poly} fill="var(--accent)" fillOpacity="0.25" stroke="var(--accent)" strokeWidth="2" />
        {scores.map((v, i) => <circle key={i} cx={pt(i, Math.max(v, 0.02))[0]} cy={pt(i, Math.max(v, 0.02))[1]} r="3.5" fill="var(--accent)" />)}
        {CATEGORIES.map((k, i) => { const [x, y] = pt(i, 1.2); return <text key={k} x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize="11" fill="var(--text)">{CATEGORY_LABEL[k as Category]}</text>; })}
      </svg>
      <figcaption className="muted small">Each axis fills up at {RADAR_FULL} skill points in that category.</figcaption>
    </figure>
  );
}
