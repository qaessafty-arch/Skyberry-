// Skyberry mark: a round sky berry with a cloud highlight and a cyan leaf.
// Solid fills only (no shared gradient ids), so several copies can render on one page.
export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path d="M25.5 10.2c2.6-4.1 7.6-5.4 11.3-3.6-1.1 4.3-5.2 6.9-9.6 6.6" fill="#42d5e8" />
      <path d="M24.4 13.4c.2-2.2.9-4.3 2.4-6" stroke="#218bcb" strokeWidth="2" strokeLinecap="round" fill="none" />
      <circle cx="24" cy="28" r="15.5" fill="#48b9f2" />
      <path d="M8.9 31.4A15.5 15.5 0 0 0 39.1 31.4 18 18 0 0 1 8.9 31.4z" fill="#218bcb" />
      <path d="M14.6 25.6c0-2.4 1.9-4.3 4.3-4.3.5-2.4 2.6-4.1 5-4.1 2.8 0 5.1 2.3 5.1 5.1v.2c1.6.3 2.8 1.7 2.8 3.4 0 1.9-1.6 3.5-3.5 3.5H18.9c-2.4 0-4.3-1.6-4.3-3.8z" fill="#fff" opacity=".95" />
    </svg>
  );
}
export function Wordmark({ size = 28 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2 text-[19px] font-extrabold tracking-[-0.03em] text-ink">
      <LogoMark size={size} /> Skyberry
    </span>
  );
}
