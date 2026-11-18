export default function Logo({ size = 28 }: { size?: number }) {
  return (
    <span className="logo" aria-label="LabOps">
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill="var(--accent)" />
        <path d="M9 11l6 5-6 5" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M18 21h6" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
      </svg>
      <span className="logo-text">Lab<b>Ops</b></span>
    </span>
  );
}
