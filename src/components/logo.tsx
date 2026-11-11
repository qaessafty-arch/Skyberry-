// Solid fills only: a shared gradient id breaks when one copy sits in a hidden (display:none) nav.
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path d="M24 9c-3-4-9-4-12 0 3 1 6 1 8 0-1 2-1 4 0 6h8c1-2 1-4 0-6 2 1 5 1 8 0-3-4-9-4-12 0z" fill="#5eead4" />
      <path d="M10 22c0-6 6-9 14-9s14 3 14 9c0 10-7 20-14 20S10 32 10 22z" fill="#d92b6b" />
      <circle cx="18" cy="23" r="1.8" fill="#fff" opacity=".85" /><circle cx="27" cy="29" r="1.8" fill="#fff" opacity=".85" />
      <circle cx="30" cy="21" r="1.4" fill="#fff" opacity=".7" /><circle cx="21" cy="33" r="1.4" fill="#fff" opacity=".7" />
    </svg>
  );
}
export function Wordmark() {
  return (
    <span className="inline-flex items-center gap-2 font-display text-xl font-extrabold tracking-tight">
      <LogoMark size={28} /> Skyberry
    </span>
  );
}
