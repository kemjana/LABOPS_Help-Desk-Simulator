export const RANKS = [
  { name: 'Help Desk Intern', min: 0 }, { name: 'Tier 1 Technician', min: 100 },
  { name: 'Tier 2 Technician', min: 300 }, { name: 'Systems Administrator', min: 700 },
  { name: 'Senior SysAdmin', min: 1400 }, { name: 'Domain Admin', min: 2500 },
];
export function rankFor(points: number) {
  let idx = 0;
  RANKS.forEach((r, i) => { if (points >= r.min) idx = i; });
  const next = RANKS[idx + 1] || null;
  return { name: RANKS[idx].name, index: idx, next: next ? { name: next.name, at: next.min } : null, floor: RANKS[idx].min };
}
