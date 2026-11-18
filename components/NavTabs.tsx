import Link from 'next/link';
export default function NavTabs({ current }: { current: 'tickets' | 'debrief' | 'setup' | 'roster' }) {
  const items = [['tickets', '/dashboard', 'Tickets'], ['debrief', '/debrief', 'Debrief'], ['setup', '/setup', 'Lab Setup'], ['roster', '/roster', 'Company Roster']] as const;
  return <nav className="nav-tabs" aria-label="Main">{items.map(([k, href, label]) => <Link key={k} href={href} aria-current={current === k ? 'page' : undefined}>{label}</Link>)}</nav>;
}
